import pytest
from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.api.deployment import DeploymentConfigError
from graphmind.storage.database import create_session_factory
from graphmind.storage.models import (
    Dataset,
    FieldProfile,
    GraphEdge,
    GraphNode,
    Project,
    RelationshipSuggestion,
    Sheet,
)
from graphmind.storage.workspace import WorkspacePaths

AUTH_ENV_VARS = [
    "GRAPHMIND_DEPLOYMENT_MODE",
    "GRAPHMIND_ALLOWED_ORIGINS",
    "GRAPHMIND_TRUSTED_HOSTS",
    "GRAPHMIND_URL_IMPORT_ALLOWLIST",
    "GRAPHMIND_WORKSPACE_ROOT",
    "GRAPHMIND_AUTH_MODE",
    "GRAPHMIND_SHARED_API_TOKEN",
    "GRAPHMIND_SESSION_SECRET",
    "GRAPHMIND_ADMIN_USERNAME",
    "GRAPHMIND_ADMIN_PASSWORD",
    "GRAPHMIND_SESSION_TTL_SECONDS",
]


@pytest.fixture(autouse=True)
def clear_auth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for env_name in AUTH_ENV_VARS:
        monkeypatch.delenv(env_name, raising=False)


def test_development_keeps_auth_disabled_by_default(tmp_workspace):
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.post("/api/projects", json={"name": "Local Project"})

    assert response.status_code == 200
    assert response.json()["name"] == "Local Project"


def test_shared_token_mode_requires_configured_token(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "shared-token")

    with pytest.raises(DeploymentConfigError, match="GRAPHMIND_SHARED_API_TOKEN"):
        create_app(workspace_root=tmp_workspace)


def test_shared_token_rejects_missing_authorization(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "shared-token")
    monkeypatch.setenv("GRAPHMIND_SHARED_API_TOKEN", "secret-token")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.post("/api/projects", json={"name": "Hosted Project"})

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["detail"]["code"] == "AUTH_REQUIRED"


def test_shared_token_rejects_invalid_authorization(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "shared-token")
    monkeypatch.setenv("GRAPHMIND_SHARED_API_TOKEN", "secret-token")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.post(
        "/api/projects",
        json={"name": "Hosted Project"},
        headers={"Authorization": "Bearer wrong-token"},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["detail"]["code"] == "AUTH_INVALID"


def test_shared_token_allows_valid_bearer_token(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "shared-token")
    monkeypatch.setenv("GRAPHMIND_SHARED_API_TOKEN", "secret-token")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.post(
        "/api/projects",
        json={"name": "Hosted Project"},
        headers={"Authorization": "Bearer secret-token"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Hosted Project"


def test_shared_token_keeps_health_and_ready_public(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "shared-token")
    monkeypatch.setenv("GRAPHMIND_SHARED_API_TOKEN", "secret-token")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    health = client.get("/api/health")
    ready = client.get("/api/ready")

    assert health.status_code == 200
    assert ready.status_code == 200


def test_shared_token_does_not_block_cors_preflight(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "shared-token")
    monkeypatch.setenv("GRAPHMIND_SHARED_API_TOKEN", "secret-token")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.options(
        "/api/projects",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_session_mode_requires_session_secret_and_admin_credentials(
    tmp_workspace,
    monkeypatch,
):
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "session")
    monkeypatch.setenv("GRAPHMIND_SESSION_SECRET", "session-secret-with-enough-length")
    monkeypatch.setenv("GRAPHMIND_ADMIN_USERNAME", "admin")

    with pytest.raises(DeploymentConfigError, match="GRAPHMIND_ADMIN_PASSWORD"):
        create_app(workspace_root=tmp_workspace)


def test_session_login_rejects_invalid_credentials(tmp_workspace, monkeypatch):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.post(
        "/api/auth/session",
        json={"username": "admin", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["detail"]["code"] == "AUTH_INVALID"


def test_session_login_sets_http_only_cookie_and_returns_csrf_token(
    tmp_workspace,
    monkeypatch,
):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.post(
        "/api/auth/session",
        json={"username": "admin", "password": "correct-password"},
    )

    assert response.status_code == 200
    assert response.json()["username"] == "admin"
    assert response.json()["auth_mode"] == "session"
    assert response.json()["csrf_token"]
    cookie_header = response.headers["set-cookie"]
    assert "graphmind_session=" in cookie_header
    assert "HttpOnly" in cookie_header
    assert "SameSite=strict" in cookie_header


def test_session_can_hydrate_csrf_token_after_client_memory_is_lost(tmp_workspace, monkeypatch):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    login = client.post(
        "/api/auth/session",
        json={"username": "admin", "password": "correct-password"},
    )

    hydrated = client.get("/api/auth/session")

    assert hydrated.status_code == 200
    assert hydrated.json()["username"] == "admin"
    assert hydrated.json()["csrf_token"] == login.json()["csrf_token"]


def test_session_mode_rejects_missing_session_cookie(tmp_workspace, monkeypatch):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.get("/api/projects/1/graph")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "AUTH_REQUIRED"


def test_session_mode_requires_csrf_for_unsafe_methods(tmp_workspace, monkeypatch):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    login = client.post(
        "/api/auth/session",
        json={"username": "admin", "password": "correct-password"},
    )

    response = client.post("/api/projects", json={"name": "Hosted Project"})

    assert login.status_code == 200
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "CSRF_REQUIRED"


def test_session_mode_accepts_matching_csrf_token(tmp_workspace, monkeypatch):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    login = client.post(
        "/api/auth/session",
        json={"username": "admin", "password": "correct-password"},
    )
    csrf_token = login.json()["csrf_token"]

    response = client.post(
        "/api/projects",
        json={"name": "Hosted Project"},
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Hosted Project"


def test_session_mode_allows_safe_methods_without_csrf(tmp_workspace, monkeypatch):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    login = client.post(
        "/api/auth/session",
        json={"username": "admin", "password": "correct-password"},
    )
    csrf_token = login.json()["csrf_token"]
    created = client.post(
        "/api/projects",
        json={"name": "Hosted Project"},
        headers={"X-CSRF-Token": csrf_token},
    )

    response = client.get(f"/api/projects/{created.json()['id']}/graph")

    assert response.status_code == 200


def test_shared_token_mode_does_not_require_csrf(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "shared-token")
    monkeypatch.setenv("GRAPHMIND_SHARED_API_TOKEN", "secret-token")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.post(
        "/api/projects",
        json={"name": "Token Project"},
        headers={"Authorization": "Bearer secret-token"},
    )

    assert response.status_code == 200


def test_admin_can_create_project_viewer_share_token_and_token_is_only_returned_once(
    tmp_workspace,
    monkeypatch,
):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    csrf_token = _login_admin(client)
    project = _create_project(client, csrf_token, "Shared Project")

    created = client.post(
        f"/api/projects/{project['id']}/share-tokens",
        json={"role": "viewer", "label": "Read-only partner"},
        headers={"X-CSRF-Token": csrf_token},
    )
    listed = client.get(f"/api/projects/{project['id']}/share-tokens")

    assert created.status_code == 200
    assert created.json()["role"] == "viewer"
    assert created.json()["label"] == "Read-only partner"
    assert created.json()["token"].startswith("gm_share_")
    assert listed.status_code == 200
    assert listed.json()[0]["role"] == "viewer"
    assert "token" not in listed.json()[0]


def test_project_viewer_share_token_can_read_only_its_project(tmp_workspace, monkeypatch):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    csrf_token = _login_admin(client)
    project = _create_project(client, csrf_token, "Shared Project")
    other_project = _create_project(client, csrf_token, "Other Project")
    share_token = _create_share_token(client, csrf_token, project["id"], role="viewer")

    own_graph = client.get(
        f"/api/projects/{project['id']}/graph",
        headers={"Authorization": f"Bearer {share_token}"},
    )
    other_graph = client.get(
        f"/api/projects/{other_project['id']}/graph",
        headers={"Authorization": f"Bearer {share_token}"},
    )
    write_attempt = client.put(
        f"/api/projects/{project['id']}/settings",
        json={"ai": {}},
        headers={"Authorization": f"Bearer {share_token}"},
    )

    assert own_graph.status_code == 200
    assert other_graph.status_code == 403
    assert other_graph.json()["detail"]["code"] == "PROJECT_ACCESS_DENIED"
    assert write_attempt.status_code == 403
    assert write_attempt.json()["detail"]["code"] == "PROJECT_ROLE_FORBIDDEN"


def test_project_editor_share_token_can_write_its_project(tmp_workspace, monkeypatch):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    csrf_token = _login_admin(client)
    project = _create_project(client, csrf_token, "Editor Project")
    share_token = _create_share_token(client, csrf_token, project["id"], role="editor")

    response = client.put(
        f"/api/projects/{project['id']}/settings",
        json={"ai": {}},
        headers={"Authorization": f"Bearer {share_token}"},
    )

    assert response.status_code == 200
    assert response.json()["ai"]["chat"]["provider"] == "rules"


def test_project_editor_share_token_cannot_change_ai_endpoint_or_reuse_admin_key(
    tmp_workspace,
    monkeypatch,
):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    csrf_token = _login_admin(client)
    project = _create_project(client, csrf_token, "Protected AI Project")
    configured = client.put(
        f"/api/projects/{project['id']}/settings",
        json={
            "ai": {
                "chat": {
                    "provider": "openai-compatible",
                    "model": "gpt-test",
                    "base_url": "https://api.example.com/v1",
                    "api_key": "admin-secret-key",
                }
            }
        },
        headers={"X-CSRF-Token": csrf_token},
    )
    assert configured.status_code == 200
    share_token = _create_share_token(client, csrf_token, project["id"], role="editor")
    malicious_payload = configured.json()
    malicious_payload["ai"]["chat"]["base_url"] = "https://attacker.example/v1"

    response = client.put(
        f"/api/projects/{project['id']}/settings",
        json=malicious_payload,
        headers={"Authorization": f"Bearer {share_token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "ADMIN_REQUIRED"
    with create_session_factory(WorkspacePaths(tmp_workspace).database_path)() as session:
        saved = session.get(Project, project["id"])
        assert saved is not None
        assert saved.settings["ai"]["chat"]["base_url"] == "https://api.example.com/v1"
        assert saved.settings["ai"]["chat"]["api_key"] == "admin-secret-key"


def test_project_editor_share_token_can_review_its_project_relationship_suggestions(
    tmp_workspace,
    monkeypatch,
):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    csrf_token = _login_admin(client)
    project = _create_project(client, csrf_token, "Reviewable Project")
    suggestion_id = _create_relationship_suggestion(tmp_workspace, project["id"])
    share_token = _create_share_token(client, csrf_token, project["id"], role="editor")

    response = client.post(
        f"/api/projects/{project['id']}/relationship-suggestions/{suggestion_id}/review",
        json={"decision_status": "accepted"},
        headers={"Authorization": f"Bearer {share_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    with create_session_factory(WorkspacePaths(tmp_workspace).database_path)() as session:
        suggestion = session.get(RelationshipSuggestion, suggestion_id)
        assert suggestion is not None
        assert suggestion.decision_status == "accepted"


def test_project_viewer_share_token_cannot_review_relationship_suggestions(
    tmp_workspace,
    monkeypatch,
):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    csrf_token = _login_admin(client)
    project = _create_project(client, csrf_token, "Read Only Review Project")
    suggestion_id = _create_relationship_suggestion(tmp_workspace, project["id"])
    share_token = _create_share_token(client, csrf_token, project["id"], role="viewer")

    response = client.post(
        f"/api/projects/{project['id']}/relationship-suggestions/{suggestion_id}/review",
        json={"decision_status": "accepted"},
        headers={"Authorization": f"Bearer {share_token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "PROJECT_ROLE_FORBIDDEN"


def test_project_share_token_cannot_review_other_project_relationship_suggestions(
    tmp_workspace,
    monkeypatch,
):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    csrf_token = _login_admin(client)
    project = _create_project(client, csrf_token, "Scoped Review Project")
    other_project = _create_project(client, csrf_token, "Other Review Project")
    other_suggestion_id = _create_relationship_suggestion(tmp_workspace, other_project["id"])
    share_token = _create_share_token(client, csrf_token, project["id"], role="editor")

    response = client.post(
        f"/api/projects/{project['id']}/relationship-suggestions/{other_suggestion_id}/review",
        json={"decision_status": "accepted"},
        headers={"Authorization": f"Bearer {share_token}"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Relationship suggestion not found"


def test_project_editor_share_token_can_review_its_project_entity_and_mapping_edges(
    tmp_workspace,
    monkeypatch,
):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    csrf_token = _login_admin(client)
    project = _create_project(client, csrf_token, "Source Review Project")
    entity_edge_id = _create_graph_edge(tmp_workspace, project["id"], edge_type="matches_entity")
    mapping_edge_id = _create_graph_edge(
        tmp_workspace, project["id"], edge_type="documented_mapping"
    )
    share_token = _create_share_token(client, csrf_token, project["id"], role="editor")

    entity_response = client.post(
        f"/api/projects/{project['id']}/entity-matches/{entity_edge_id}/review",
        json={"decision_status": "accepted"},
        headers={"Authorization": f"Bearer {share_token}"},
    )
    mapping_response = client.post(
        f"/api/projects/{project['id']}/mapping-reviews/{mapping_edge_id}/review",
        json={"decision_status": "rejected"},
        headers={"Authorization": f"Bearer {share_token}"},
    )

    assert entity_response.status_code == 200
    assert entity_response.json()["status"] == "accepted"
    assert mapping_response.status_code == 200
    assert mapping_response.json()["status"] == "rejected"


def test_project_share_token_cannot_review_other_project_entity_edges(
    tmp_workspace,
    monkeypatch,
):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    csrf_token = _login_admin(client)
    project = _create_project(client, csrf_token, "Scoped Source Review Project")
    other_project = _create_project(client, csrf_token, "Other Source Review Project")
    other_edge_id = _create_graph_edge(
        tmp_workspace, other_project["id"], edge_type="matches_entity"
    )
    share_token = _create_share_token(client, csrf_token, project["id"], role="editor")

    response = client.post(
        f"/api/projects/{project['id']}/entity-matches/{other_edge_id}/review",
        json={"decision_status": "accepted"},
        headers={"Authorization": f"Bearer {share_token}"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Entity match not found"


def test_revoked_project_share_token_is_rejected(tmp_workspace, monkeypatch):
    _configure_session_auth(monkeypatch)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    csrf_token = _login_admin(client)
    project = _create_project(client, csrf_token, "Revoked Project")
    created = client.post(
        f"/api/projects/{project['id']}/share-tokens",
        json={"role": "viewer", "label": "Temporary partner"},
        headers={"X-CSRF-Token": csrf_token},
    )
    share_token = created.json()["token"]

    revoke = client.delete(
        f"/api/projects/{project['id']}/share-tokens/{created.json()['id']}",
        headers={"X-CSRF-Token": csrf_token},
    )
    response = client.get(
        f"/api/projects/{project['id']}/graph",
        headers={"Authorization": f"Bearer {share_token}"},
    )

    assert revoke.status_code == 200
    assert revoke.json()["revoked"] is True
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "AUTH_INVALID"


def _configure_session_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "session")
    monkeypatch.setenv("GRAPHMIND_SESSION_SECRET", "session-secret-with-enough-length")
    monkeypatch.setenv("GRAPHMIND_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("GRAPHMIND_ADMIN_PASSWORD", "correct-password")


def _login_admin(client: TestClient) -> str:
    response = client.post(
        "/api/auth/session",
        json={"username": "admin", "password": "correct-password"},
    )
    assert response.status_code == 200
    return response.json()["csrf_token"]


def _create_project(client: TestClient, csrf_token: str, name: str) -> dict[str, object]:
    response = client.post(
        "/api/projects",
        json={"name": name},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 200
    return response.json()


def _create_share_token(
    client: TestClient,
    csrf_token: str,
    project_id: int,
    *,
    role: str,
) -> str:
    response = client.post(
        f"/api/projects/{project_id}/share-tokens",
        json={"role": role, "label": f"{role} token"},
        headers={"X-CSRF-Token": csrf_token},
    )
    assert response.status_code == 200
    return response.json()["token"]


def _create_relationship_suggestion(tmp_workspace, project_id: int) -> int:
    session_factory = create_session_factory(WorkspacePaths(tmp_workspace).database_path)
    with session_factory() as session:
        dataset = Dataset(
            project_id=project_id,
            filename="review.csv",
            file_type="csv",
            raw_data_ref="raw/review.csv",
        )
        session.add(dataset)
        session.flush()
        sheet = Sheet(
            dataset_id=dataset.id,
            name="Orders",
            normalized_name="orders",
            row_count=2,
            column_count=2,
            duckdb_table_name="orders",
        )
        session.add(sheet)
        session.flush()
        source = FieldProfile(
            sheet_id=sheet.id,
            original_name="customer_id",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1", "c2"],
        )
        target = FieldProfile(
            sheet_id=sheet.id,
            original_name="account_id",
            normalized_name="account_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1", "c2"],
        )
        session.add_all([source, target])
        session.flush()
        suggestion = RelationshipSuggestion(
            project_id=project_id,
            source_field_id=source.id,
            target_field_id=target.id,
            relationship_type="foreign_key",
            confidence=0.9,
            evidence_summary="IDs overlap.",
            evidence_payload={"overlap_count": 2},
            decision_status="pending",
        )
        session.add(suggestion)
        session.commit()
        return suggestion.id


def _create_graph_edge(tmp_workspace, project_id: int, *, edge_type: str) -> int:
    session_factory = create_session_factory(WorkspacePaths(tmp_workspace).database_path)
    with session_factory() as session:
        source = GraphNode(
            project_id=project_id,
            node_type="field",
            label="customers.customer_id",
            source_ref="customers.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target = GraphNode(
            project_id=project_id,
            node_type="entity",
            label="Customer ID",
            source_ref="entity:customer-id",
            node_metadata={"source_refs": ["identity.md#chunk-1"]},
            position_x=0,
            position_y=80,
        )
        session.add_all([source, target])
        session.flush()
        edge = GraphEdge(
            project_id=project_id,
            source_node_id=source.id,
            target_node_id=target.id,
            edge_type=edge_type,
            confidence=0.85,
            status="suggested",
            evidence_ref="identity.md#chunk-1",
            edge_metadata={
                "source_refs": ["identity.md#chunk-1"],
                "evidence_summary": "Customer ID matches source data.",
            },
        )
        session.add(edge)
        session.commit()
        return edge.id
