from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.storage.database import create_session_factory
from graphmind.storage.models import GraphEdge, GraphNode
from graphmind.storage.repositories import ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def test_workspace_snapshot_includes_workspace_version(tmp_workspace):
    client = _client_with_versioned_project(tmp_workspace)

    response = client.get("/api/projects/1/workspace-snapshot")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["workspace_version"], str)
    assert body["workspace_version"]


def test_workspace_delta_returns_not_modified_for_matching_version(tmp_workspace):
    client = _client_with_versioned_project(tmp_workspace)
    version = client.get("/api/projects/1/workspace-snapshot").json()["workspace_version"]

    response = client.get(f"/api/projects/1/workspace-delta?since_version={version}")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "not_modified"
    assert body["workspace_version"] == version
    assert body["graph"] is None
    assert body["suggestions"] is None
    assert body["import_jobs"] is None


def test_workspace_delta_returns_changed_data_when_version_differs(tmp_workspace):
    client = _client_with_versioned_project(tmp_workspace)

    response = client.get("/api/projects/1/workspace-delta?since_version=stale-version")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "changed"
    assert body["workspace_version"] != "stale-version"
    assert [node["label"] for node in body["graph"]["nodes"]] == ["Orders", "Orders.id"]
    assert body["suggestions"] == []
    assert body["source_summaries"] == []


def _client_with_versioned_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        ProjectRepository(session).create_project("Versioned workspace")
        table = GraphNode(
            project_id=1,
            node_type="table",
            label="Orders",
            source_ref="orders",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        field = GraphNode(
            project_id=1,
            node_type="field",
            label="Orders.id",
            source_ref="orders.id",
            node_metadata={},
            position_x=0,
            position_y=120,
        )
        session.add_all([table, field])
        session.flush()
        session.add(
            GraphEdge(
                project_id=1,
                source_node_id=table.id,
                target_node_id=field.id,
                edge_type="contains_field",
                confidence=1,
                status="auto_trusted",
                evidence_ref="schema:orders.id",
                edge_metadata={},
                created_from_suggestion_id=None,
            )
        )
        session.commit()
    return client
