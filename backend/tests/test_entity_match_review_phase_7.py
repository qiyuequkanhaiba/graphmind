from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.storage.database import create_session_factory
from graphmind.storage.models import GraphEdge, GraphNode
from graphmind.storage.workspace import WorkspacePaths


def test_entity_match_review_endpoint_lists_matches_with_node_labels(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Entity Match API"}).json()["id"]
    _create_entity_match(tmp_workspace, project_id)

    response = client.get(f"/api/projects/{project_id}/entity-matches")

    assert response.status_code == 200
    matches = response.json()
    assert len(matches) == 1
    assert matches[0]["source_label"] == "customers.customer_id"
    assert matches[0]["source_type"] == "field"
    assert matches[0]["target_label"] == "Customer ID"
    assert matches[0]["target_type"] == "entity"
    assert matches[0]["relationship_type"] == "matches_entity"
    assert matches[0]["confidence"] == 0.78
    assert matches[0]["status"] == "suggested"
    assert matches[0]["matched_keys"] == ["customerid"]
    assert matches[0]["source_refs"] == ["architecture.md#identity"]
    assert matches[0]["evidence_summary"] == (
        "customers.customer_id matches extracted entity Customer ID by normalized name."
    )


def test_entity_match_review_endpoint_accepts_and_rejects_match(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Entity Match Review"}).json()["id"]
    edge_id = _create_entity_match(tmp_workspace, project_id)

    accept_response = client.post(
        f"/api/entity-matches/{edge_id}/review",
        json={"decision_status": "accepted"},
    )
    reject_response = client.post(
        f"/api/entity-matches/{edge_id}/review",
        json={"decision_status": "rejected"},
    )

    assert accept_response.status_code == 200
    assert accept_response.json()["status"] == "accepted"
    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == "rejected"
    with create_session_factory(WorkspacePaths(tmp_workspace).database_path)() as session:
        edge = session.get(GraphEdge, edge_id)
        assert edge is not None
        assert edge.status == "rejected"


def test_entity_match_review_endpoint_is_project_scoped(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    first_project_id = client.post("/api/projects", json={"name": "First"}).json()["id"]
    second_project_id = client.post("/api/projects", json={"name": "Second"}).json()["id"]
    edge_id = _create_entity_match(tmp_workspace, first_project_id)

    second_matches = client.get(f"/api/projects/{second_project_id}/entity-matches")
    missing_project_matches = client.get("/api/projects/999/entity-matches")
    missing_edge_review = client.post(
        "/api/entity-matches/999/review",
        json={"decision_status": "accepted"},
    )
    non_match_review = client.post(
        f"/api/entity-matches/{_create_non_match_edge(tmp_workspace, first_project_id)}/review",
        json={"decision_status": "accepted"},
    )
    invalid_decision = client.post(
        f"/api/entity-matches/{edge_id}/review",
        json={"decision_status": "pending"},
    )

    assert second_matches.status_code == 200
    assert second_matches.json() == []
    assert missing_project_matches.status_code == 404
    assert missing_edge_review.status_code == 404
    assert non_match_review.status_code == 404
    assert invalid_decision.status_code == 400


def test_mapping_review_endpoint_lists_documented_mapping_edges(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Mapping Review API"}).json()["id"]
    _create_documented_mapping(tmp_workspace, project_id)

    response = client.get(f"/api/projects/{project_id}/mapping-reviews")

    assert response.status_code == 200
    mappings = response.json()
    assert len(mappings) == 1
    assert mappings[0]["source_label"] == "customers.customer_id"
    assert mappings[0]["source_type"] == "field"
    assert mappings[0]["target_label"] == "orders.customer_id"
    assert mappings[0]["target_type"] == "field"
    assert mappings[0]["relationship_type"] == "documented_mapping"
    assert mappings[0]["confidence"] == 0.92
    assert mappings[0]["status"] == "suggested"
    assert mappings[0]["source_refs"] == ["identity.md#chunk-1"]
    assert mappings[0]["evidence_summary"] == "Customer ID maps to customerId."
    assert mappings[0]["metadata"]["rule"] == "documented_field_mapping"


def test_mapping_review_endpoint_accepts_and_rejects_mapping(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Mapping Review"}).json()["id"]
    edge_id = _create_documented_mapping(tmp_workspace, project_id)

    accept_response = client.post(
        f"/api/mapping-reviews/{edge_id}/review",
        json={"decision_status": "accepted"},
    )
    reject_response = client.post(
        f"/api/mapping-reviews/{edge_id}/review",
        json={"decision_status": "rejected"},
    )
    non_mapping_review = client.post(
        f"/api/mapping-reviews/{_create_non_match_edge(tmp_workspace, project_id)}/review",
        json={"decision_status": "accepted"},
    )
    invalid_decision = client.post(
        f"/api/mapping-reviews/{edge_id}/review",
        json={"decision_status": "pending"},
    )

    assert accept_response.status_code == 200
    assert accept_response.json()["status"] == "accepted"
    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == "rejected"
    assert non_mapping_review.status_code == 404
    assert invalid_decision.status_code == 400
    with create_session_factory(WorkspacePaths(tmp_workspace).database_path)() as session:
        edge = session.get(GraphEdge, edge_id)
        assert edge is not None
        assert edge.status == "rejected"


def _create_entity_match(tmp_workspace, project_id: int) -> int:
    session_factory = create_session_factory(WorkspacePaths(tmp_workspace).database_path)
    with session_factory() as session:
        field = GraphNode(
            project_id=project_id,
            node_type="field",
            label="customers.customer_id",
            source_ref="customers.customer_id",
            node_metadata={"inferred_type": "identifier"},
            position_x=0,
            position_y=0,
        )
        entity = GraphNode(
            project_id=project_id,
            node_type="entity",
            label="Customer ID",
            source_ref="entity:customer-id",
            node_metadata={
                "entity_type": "concept",
                "aliases": ["customerId"],
                "source_refs": ["architecture.md#identity"],
            },
            position_x=0,
            position_y=80,
        )
        session.add_all([field, entity])
        session.flush()
        edge = GraphEdge(
            project_id=project_id,
            source_node_id=field.id,
            target_node_id=entity.id,
            edge_type="matches_entity",
            confidence=0.78,
            status="suggested",
            evidence_ref=f"entity_resolution:{field.id}:{entity.id}",
            edge_metadata={
                "rule": "normalized_name_match",
                "field_label": field.label,
                "entity_label": entity.label,
                "matched_keys": ["customerid"],
                "evidence_summary": (
                    "customers.customer_id matches extracted entity Customer ID "
                    "by normalized name."
                ),
            },
        )
        session.add(edge)
        session.commit()
        return edge.id


def _create_documented_mapping(tmp_workspace, project_id: int) -> int:
    session_factory = create_session_factory(WorkspacePaths(tmp_workspace).database_path)
    with session_factory() as session:
        source = GraphNode(
            project_id=project_id,
            node_type="field",
            label="customers.customer_id",
            source_ref="customers.customer_id",
            node_metadata={"inferred_type": "identifier"},
            position_x=0,
            position_y=0,
        )
        target = GraphNode(
            project_id=project_id,
            node_type="field",
            label="orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={"inferred_type": "identifier"},
            position_x=0,
            position_y=80,
        )
        session.add_all([source, target])
        session.flush()
        edge = GraphEdge(
            project_id=project_id,
            source_node_id=source.id,
            target_node_id=target.id,
            edge_type="documented_mapping",
            confidence=0.92,
            status="suggested",
            evidence_ref="identity.md#chunk-1",
            edge_metadata={
                "rule": "documented_field_mapping",
                "source_refs": ["identity.md#chunk-1"],
                "evidence_summary": "Customer ID maps to customerId.",
                "document_relationship_id": 12,
            },
        )
        session.add(edge)
        session.commit()
        return edge.id


def _create_non_match_edge(tmp_workspace, project_id: int) -> int:
    session_factory = create_session_factory(WorkspacePaths(tmp_workspace).database_path)
    with session_factory() as session:
        source = GraphNode(
            project_id=project_id,
            node_type="field",
            label="orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target = GraphNode(
            project_id=project_id,
            node_type="field",
            label="customers.id",
            source_ref="customers.id",
            node_metadata={},
            position_x=0,
            position_y=80,
        )
        session.add_all([source, target])
        session.flush()
        edge = GraphEdge(
            project_id=project_id,
            source_node_id=source.id,
            target_node_id=target.id,
            edge_type="foreign_key",
            confidence=0.9,
            status="suggested",
            evidence_ref="suggestion:1",
            edge_metadata={},
        )
        session.add(edge)
        session.commit()
        return edge.id
