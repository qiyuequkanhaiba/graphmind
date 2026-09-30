import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import duckdb
import pytest
from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.services.import_service import ImportService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import (
    Dataset,
    FieldProfile,
    GraphEdge,
    GraphNode,
    ImportJob,
    Project,
    RelationshipSuggestion,
    ReviewAnalyticsSnapshot,
    ReviewAnalyticsSnapshotCleanupAudit,
    Sheet,
)
from graphmind.storage.repositories import ImportRepository, ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def test_app_startup_initializes_sqlite_and_duckdb(tmp_workspace):
    create_app(workspace_root=tmp_workspace)
    paths = WorkspacePaths(tmp_workspace)

    assert paths.database_path.is_file()
    assert paths.duckdb_path.is_file()
    with duckdb.connect(str(paths.duckdb_path), read_only=True) as connection:
        assert connection.execute("SELECT 1").fetchone() == (1,)


def _wait_for_import_job(
    client: TestClient,
    project_id: int,
    job_id: int,
    *,
    timeout_seconds: float = 5.0,
) -> dict[str, object]:
    deadline = time.monotonic() + timeout_seconds
    while True:
        response = client.get(f"/api/projects/{project_id}/import-jobs/{job_id}")
        assert response.status_code == 200
        body = response.json()
        if body["status"] in {"succeeded", "failed", "canceled"}:
            return body
        if time.monotonic() >= deadline:
            return body
        time.sleep(0.05)


def _seed_review_analytics_field(session, project_id: int) -> FieldProfile:
    dataset = Dataset(
        project_id=project_id,
        filename=f"review-{project_id}.csv",
        file_type="csv",
        raw_data_ref=f"imports/review-{project_id}.csv",
    )
    session.add(dataset)
    session.flush()
    sheet = Sheet(
        dataset_id=dataset.id,
        name="Orders",
        normalized_name="orders",
        row_count=2,
        column_count=1,
        duckdb_table_name=f"orders_{project_id}",
    )
    session.add(sheet)
    session.flush()
    field = FieldProfile(
        sheet_id=sheet.id,
        original_name="Customer ID",
        normalized_name="customer_id",
        inferred_type="string",
        null_count=0,
        unique_count=2,
        sample_values=["c1"],
        key_candidate_score=0.9,
    )
    session.add(field)
    session.flush()
    return field


def test_health_endpoint(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_project_and_get_graph(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Demo"})
    assert project_response.status_code == 200
    project_id = project_response.json()["id"]

    graph_response = client.get(f"/api/projects/{project_id}/graph")

    assert graph_response.status_code == 200
    assert graph_response.json() == {"nodes": [], "edges": []}


def test_workspace_snapshot_endpoint_returns_first_load_payload(tmp_workspace, sample_csv):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Snapshot"})
    project_id = project_response.json()["id"]

    with sample_csv.open("rb") as upload:
        import_response = client.post(
            f"/api/projects/{project_id}/imports",
            files={"file": ("customers_orders.csv", upload, "text/csv")},
        )
    assert import_response.status_code == 200

    response = client.get(f"/api/projects/{project_id}/workspace-snapshot")

    assert response.status_code == 200
    body = response.json()
    assert body["project"]["id"] == project_id
    assert body["project"]["name"] == "Snapshot"
    assert body["graph"]["nodes"]
    assert body["graph"]["edges"]
    assert body["suggestions"]
    assert body["relationship_governance"]["total_suggestion_count"] >= 1
    assert body["review_analytics"]["window_days"] == 30
    assert body["review_analytics"]["sla"]["pending_sla_days"] == 3
    assert body["review_analytics"]["sla"]["pending_total"] >= 1
    assert body["review_analytics_trend"]["window_days"] == 30
    assert body["review_analytics_trend"]["days"] == 14
    assert body["review_analytics_trend"]["snapshots"]
    assert body["review_analytics_trend"]["snapshots"][-1]["analytics"]["sla"]["pending_total"] >= 1
    assert body["review_analytics_snapshot_summary"]["retention_days"] == 30
    assert body["review_analytics_snapshot_summary"]["snapshot_count"] == 0
    assert body["review_analytics_snapshot_summary"]["expired_snapshot_count"] == 0
    assert body["settings"]["ai"]["chat"]["provider"] == "rules"
    assert len(body["import_jobs"]) == 1
    assert body["import_jobs"][0]["label"] == "customers_orders.csv"
    assert body["source_summaries"] == [{"source_kind": "table", "count": 1}]
    assert body["source_details"] == []
    assert body["source_chunks_by_source_id"] == {}
    assert body["extracted_entities"] == []
    assert body["extracted_relationships"] == []
    assert body["entity_match_reviews"] == []
    assert body["mapping_reviews"] == []


def test_workspace_snapshot_endpoint_returns_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.get("/api/projects/999/workspace-snapshot")

    assert response.status_code == 404


def test_get_or_create_default_project_reuses_existing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    first_response = client.post("/api/projects/default")
    second_response = client.post("/api/projects/default")

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert second_response.json() == first_response.json()

    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        assert session.query(Project).count() == 1


def test_get_or_create_default_project_is_concurrency_safe(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    def create_default_project():
        response = client.post("/api/projects/default")
        assert response.status_code == 200
        return response.json()["id"]

    with ThreadPoolExecutor(max_workers=8) as executor:
        project_ids = list(executor.map(lambda _: create_default_project(), range(8)))

    assert len(set(project_ids)) == 1

    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        assert session.query(Project).filter(Project.default_key == "default").count() == 1


def test_get_graph_returns_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.get("/api/projects/999/graph")

    assert response.status_code == 404


def test_project_settings_return_ai_vector_and_review_analytics_defaults(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Settings Project"})
    project_id = project_response.json()["id"]

    response = client.get(f"/api/projects/{project_id}/settings")

    assert response.status_code == 200
    assert response.json() == {
        "ai": {
            "chat": {
                "provider": "rules",
                "model": "graphmind-rules",
                "base_url": "",
                "api_key": "",
                "temperature": 0.1,
                    "timeout": 90,
            },
            "vector": {
                "provider": "none",
                "model": "",
                "base_url": "",
                "api_key": "",
                "dimensions": 0,
                "index_status": "not_built",
                "document_count": 0,
                "last_built_at": None,
                "embedding_model": "",
            },
        },
        "review_analytics": {
            "retention_days": 30,
            "auto_cleanup_enabled": False,
        },
    }


def test_project_settings_can_be_saved_and_reloaded(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    project_response = client.post("/api/projects", json={"name": "Settings Project"})
    project_id = project_response.json()["id"]

    payload = {
        "ai": {
            "chat": {
                "provider": "openai-compatible",
                "model": "gpt-4.1-mini",
                "base_url": "https://api.example.com/v1",
                "api_key": "sk-local",
                "temperature": 0.2,
            },
            "vector": {
                "provider": "openai-compatible",
                "model": "text-embedding-3-small",
                "base_url": "https://api.example.com/v1",
                "api_key": "sk-embed",
                "dimensions": 1536,
                "index_status": "pending",
                "document_count": 0,
                "last_built_at": None,
                "embedding_model": "",
            },
        },
        "review_analytics": {
            "retention_days": 90,
            "auto_cleanup_enabled": True,
        },
    }

    save_response = client.put(f"/api/projects/{project_id}/settings", json=payload)
    reload_response = client.get(f"/api/projects/{project_id}/settings")

    assert save_response.status_code == 200
    assert save_response.json()["ai"]["chat"]["api_key"] == "********"
    assert save_response.json()["ai"]["vector"]["api_key"] == "********"
    assert reload_response.json()["ai"]["chat"]["api_key"] == "********"
    assert reload_response.json()["ai"]["vector"]["api_key"] == "********"
    assert reload_response.json()["review_analytics"] == {
        "retention_days": 90,
        "auto_cleanup_enabled": True,
    }

    with session_factory() as session:
        project = session.get(Project, project_id)
        assert project is not None
        assert project.settings["ai"]["chat"]["api_key"] == "sk-local"
        assert project.settings["ai"]["vector"]["api_key"] == "sk-embed"
        assert project.settings["review_analytics"]["retention_days"] == 90
        assert project.settings["review_analytics"]["auto_cleanup_enabled"] is True


def test_project_settings_normalizes_review_analytics_retention(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Retention Settings"})
    project_id = project_response.json()["id"]

    response = client.put(
        f"/api/projects/{project_id}/settings",
        json={
            "ai": {
                "chat": {
                    "provider": "rules",
                    "model": "graphmind-rules",
                    "base_url": "",
                    "api_key": "",
                    "temperature": 0.1,
                    "timeout": 90,
                },
                "vector": {
                    "provider": "none",
                    "model": "",
                    "base_url": "",
                    "api_key": "",
                    "dimensions": 0,
                    "index_status": "not_built",
                    "document_count": 0,
                    "last_built_at": None,
                    "embedding_model": "",
                },
            },
            "review_analytics": {
                "retention_days": 13,
                "auto_cleanup_enabled": True,
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["review_analytics"] == {
        "retention_days": 30,
        "auto_cleanup_enabled": True,
    }


def test_project_settings_preserve_existing_api_keys_when_masked_or_blank(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    project_response = client.post("/api/projects", json={"name": "Secret Preserve"})
    project_id = project_response.json()["id"]
    initial_payload = {
        "ai": {
            "chat": {
                "provider": "openai-compatible",
                "model": "gpt-4.1-mini",
                "base_url": "https://api.example.com/v1",
                "api_key": "sk-chat-original",
                "temperature": 0.2,
            },
            "vector": {
                "provider": "openai-compatible",
                "model": "text-embedding-3-small",
                "base_url": "https://api.example.com/v1",
                "api_key": "sk-vector-original",
                "dimensions": 1536,
                "index_status": "ready",
                "document_count": 9,
                "last_built_at": None,
                "embedding_model": "text-embedding-3-small",
            },
        }
    }
    initial_response = client.put(
        f"/api/projects/{project_id}/settings",
        json=initial_payload,
    )
    assert initial_response.status_code == 200

    preserve_payload = {
        "ai": {
            "chat": {
                "provider": "openai-compatible",
                "model": "gpt-4.1",
                "base_url": "https://api.example.com/v1",
                "api_key": "********",
                "temperature": 0.3,
            },
            "vector": {
                "provider": "openai-compatible",
                "model": "text-embedding-3-large",
                "base_url": "https://api.example.com/v1",
                "api_key": "",
                "dimensions": 3072,
                "index_status": "pending",
                "document_count": 9,
                "last_built_at": None,
                "embedding_model": "text-embedding-3-small",
            },
        }
    }

    response = client.put(f"/api/projects/{project_id}/settings", json=preserve_payload)

    assert response.status_code == 200
    assert response.json()["ai"]["chat"]["api_key"] == "********"
    assert response.json()["ai"]["vector"]["api_key"] == "********"
    with session_factory() as session:
        project = session.get(Project, project_id)
        assert project is not None
        assert project.settings["ai"]["chat"]["api_key"] == "sk-chat-original"
        assert project.settings["ai"]["chat"]["model"] == "gpt-4.1"
        assert project.settings["ai"]["vector"]["api_key"] == "sk-vector-original"
        assert project.settings["ai"]["vector"]["model"] == "text-embedding-3-large"


def test_project_settings_require_new_key_when_ai_base_url_changes(tmp_workspace):
    client = TestClient(create_app(workspace_root=tmp_workspace))
    project_id = client.post("/api/projects", json={"name": "Endpoint Rotation"}).json()["id"]
    initial = client.put(
        f"/api/projects/{project_id}/settings",
        json={
            "ai": {
                "chat": {
                    "provider": "openai-compatible",
                    "model": "gpt-test",
                    "base_url": "https://api.example.com/v1",
                    "api_key": "original-secret",
                }
            }
        },
    )
    payload = initial.json()
    payload["ai"]["chat"]["base_url"] = "https://new.example.com/v1"

    response = client.put(f"/api/projects/{project_id}/settings", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "AI_API_KEY_REQUIRED"


@pytest.mark.parametrize(
    "base_url",
    [
        "file:///tmp/provider",
        "https://user:secret@api.example.com/v1",
        "https://api.example.com/v1?target=other",
        "https://api.example.com/v1#fragment",
    ],
)
def test_project_settings_reject_unsafe_ai_base_urls(tmp_workspace, base_url):
    client = TestClient(create_app(workspace_root=tmp_workspace))
    project_id = client.post("/api/projects", json={"name": "Unsafe Endpoint"}).json()["id"]

    response = client.put(
        f"/api/projects/{project_id}/settings",
        json={
            "ai": {
                "chat": {
                    "provider": "openai-compatible",
                    "model": "gpt-test",
                    "base_url": base_url,
                    "api_key": "secret",
                }
            }
        },
    )

    assert response.status_code == 422


def test_production_ai_provider_requires_https_allowlisted_host(
    tmp_workspace,
    monkeypatch,
):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "https://graphmind.example.com")
    monkeypatch.setenv("GRAPHMIND_URL_IMPORT_ALLOWLIST", "docs.example.com")
    monkeypatch.setenv("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "allowed.example.com")
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "shared-token")
    monkeypatch.setenv("GRAPHMIND_SHARED_API_TOKEN", "t" * 32)
    client = TestClient(create_app(workspace_root=tmp_workspace))
    headers = {"Authorization": f"Bearer {'t' * 32}"}
    project_id = client.post(
        "/api/projects",
        json={"name": "Production AI"},
        headers=headers,
    ).json()["id"]

    blocked_host = client.put(
        f"/api/projects/{project_id}/settings",
        json={
            "ai": {
                "chat": {
                    "provider": "openai-compatible",
                    "model": "gpt-test",
                    "base_url": "https://blocked.example.com/v1",
                    "api_key": "",
                }
            }
        },
        headers=headers,
    )
    insecure_scheme = client.put(
        f"/api/projects/{project_id}/settings",
        json={
            "ai": {
                "chat": {
                    "provider": "openai-compatible",
                    "model": "gpt-test",
                    "base_url": "http://allowed.example.com/v1",
                    "api_key": "",
                }
            }
        },
        headers=headers,
    )

    assert blocked_host.status_code == 400
    assert blocked_host.json()["detail"]["code"] == "AI_PROVIDER_NOT_ALLOWED"
    assert insecure_scheme.status_code == 400
    assert insecure_scheme.json()["detail"]["code"] == "AI_PROVIDER_HTTPS_REQUIRED"


def test_production_settings_reject_database_keys_and_sanitize_masked_updates(
    tmp_workspace,
    monkeypatch,
):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "https://graphmind.example.com")
    monkeypatch.setenv("GRAPHMIND_URL_IMPORT_ALLOWLIST", "docs.example.com")
    monkeypatch.setenv("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "api.example.com")
    client = TestClient(create_app(workspace_root=tmp_workspace))
    session_factory = create_session_factory(WorkspacePaths(tmp_workspace).database_path)
    project_id = client.post("/api/projects", json={"name": "Production Secret"}).json()["id"]
    payload = {
        "ai": {
            "chat": {
                "provider": "openai-compatible",
                "model": "gpt-test",
                "base_url": "https://api.example.com/v1",
                "api_key": "database-secret",
            }
        }
    }

    rejected = client.put(f"/api/projects/{project_id}/settings", json=payload)

    assert rejected.status_code == 400
    assert rejected.json()["detail"]["code"] == "AI_API_KEY_ENV_REQUIRED"
    assert "GRAPHMIND_AI_CHAT_API_KEY" in rejected.json()["detail"]["user_action"]
    assert "GRAPHMIND_AI_VECTOR_API_KEY" in rejected.json()["detail"]["user_action"]

    with session_factory() as session:
        project = session.get(Project, project_id)
        assert project is not None
        project.settings = {
            "ai": {
                "chat": {
                    "provider": "openai-compatible",
                    "model": "gpt-test",
                    "base_url": "https://api.example.com/v1",
                    "api_key": "legacy-database-secret",
                }
            }
        }
        session.commit()

    payload["ai"]["chat"]["api_key"] = "********"
    sanitized = client.put(f"/api/projects/{project_id}/settings", json=payload)

    assert sanitized.status_code == 200
    assert sanitized.json()["ai"]["chat"]["api_key"] == ""
    with session_factory() as session:
        project = session.get(Project, project_id)
        assert project is not None
        assert project.settings["ai"]["chat"]["api_key"] == ""


def test_project_settings_return_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    get_response = client.get("/api/projects/999/settings")
    put_response = client.put(
        "/api/projects/999/settings",
        json={
            "ai": {
                "chat": {
                    "provider": "rules",
                    "model": "graphmind-rules",
                    "base_url": "",
                    "api_key": "",
                    "temperature": 0.1,
                    "timeout": 90,
                },
                "vector": {
                    "provider": "none",
                    "model": "",
                    "base_url": "",
                    "api_key": "",
                    "dimensions": 0,
                    "index_status": "not_built",
                },
            }
        },
    )

    assert get_response.status_code == 404
    assert put_response.status_code == 404


def test_build_vector_index_updates_project_vector_settings(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Vector Project", settings={})
        session.add(project)
        session.flush()
        node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={"inferred_type": "identifier"},
            position_x=0,
            position_y=0,
        )
        session.add(node)
        session.commit()
        project_id = project.id

    response = client.post(f"/api/projects/{project_id}/vector-index/build")

    assert response.status_code == 200
    vector_settings = response.json()["ai"]["vector"]
    assert vector_settings["index_status"] == "ready"
    assert vector_settings["document_count"] == 1
    assert vector_settings["last_built_at"]

    reload_response = client.get(f"/api/projects/{project_id}/settings")
    assert reload_response.json()["ai"]["vector"]["index_status"] == "ready"
    assert reload_response.json()["ai"]["vector"]["document_count"] == 1


def test_build_vector_index_returns_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.post("/api/projects/999/vector-index/build")

    assert response.status_code == 404


def test_import_endpoint_persists_file_and_returns_updated_graph(tmp_workspace, sample_csv):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Import Project"})
    project_id = project_response.json()["id"]

    with sample_csv.open("rb") as upload:
        response = client.post(
            f"/api/projects/{project_id}/imports",
            files={"file": ("customers_orders.csv", upload, "text/csv")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["import_job_id"] > 0
    assert body["dataset_id"] > 0
    assert body["sheet_count"] == 1
    assert body["field_count"] == 5
    assert body["suggestion_count"] >= 1
    assert body["graph"]["nodes"]
    assert body["graph"]["edges"]
    assert body["suggestions"]
    assert any(node["label"] == "customers_orders" for node in body["graph"]["nodes"])
    assert not any(node["label"].startswith("tmp") for node in body["graph"]["nodes"])

    graph_response = client.get(f"/api/projects/{project_id}/graph")
    suggestion_response = client.get(f"/api/projects/{project_id}/relationship-suggestions")
    assert graph_response.json() == body["graph"]
    assert suggestion_response.json() == body["suggestions"]


def test_import_jobs_endpoint_returns_recent_successful_imports(tmp_workspace, sample_csv):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Import History"})
    project_id = project_response.json()["id"]

    with sample_csv.open("rb") as upload:
        response = client.post(
            f"/api/projects/{project_id}/imports",
            files={"file": ("customers_orders.csv", upload, "text/csv")},
        )

    assert response.status_code == 200
    import_body = response.json()

    jobs_response = client.get(f"/api/projects/{project_id}/import-jobs")

    assert jobs_response.status_code == 200
    jobs = jobs_response.json()
    assert len(jobs) == 1
    assert jobs[0]["label"] == "customers_orders.csv"
    assert jobs[0]["kind"] == "file"
    assert jobs[0]["status"] == "succeeded"
    assert jobs[0]["progress"] == 100
    assert jobs[0]["retryable"] is False
    assert jobs[0]["dataset_id"] == import_body["dataset_id"]
    assert jobs[0]["summary"] == {
        "sheet_count": 1,
        "field_count": 5,
        "suggestion_count": import_body["suggestion_count"],
        "graph_node_count": import_body["graph_node_count"],
        "graph_edge_count": import_body["graph_edge_count"],
    }
    assert jobs[0]["error"] is None
    assert jobs[0]["created_at"]
    assert jobs[0]["updated_at"]


def test_import_events_endpoint_streams_import_job_snapshots(tmp_workspace, sample_csv):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Import Events"})
    project_id = project_response.json()["id"]

    with sample_csv.open("rb") as upload:
        import_response = client.post(
            f"/api/projects/{project_id}/imports",
            files={"file": ("customers_orders.csv", upload, "text/csv")},
        )
    assert import_response.status_code == 200

    with client.stream("GET", f"/api/projects/{project_id}/import-events?once=true") as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        first_chunk = next(response.iter_text())

    assert "event: import_job_snapshot" in first_chunk
    assert '"type":"import_job_snapshot"' in first_chunk
    assert '"label":"customers_orders.csv"' in first_chunk


def test_async_import_endpoint_creates_job_and_processes_file(tmp_workspace, sample_csv):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Async Import"})
    project_id = project_response.json()["id"]

    with sample_csv.open("rb") as upload:
        response = client.post(
            f"/api/projects/{project_id}/import-jobs",
            files={"file": ("customers_orders.csv", upload, "text/csv")},
        )

    assert response.status_code == 202
    created = response.json()
    assert created["id"] > 0
    assert created["label"] == "customers_orders.csv"
    assert created["kind"] == "file"
    assert created["status"] in {"queued", "running", "succeeded"}
    assert created["progress"] >= 0

    job = _wait_for_import_job(client, project_id, created["id"])
    assert job["status"] == "succeeded"
    assert job["progress"] == 100
    assert job["dataset_id"] is not None
    assert job["summary"]["sheet_count"] == 1
    assert job["summary"]["field_count"] == 5

    graph_response = client.get(f"/api/projects/{project_id}/graph")
    assert graph_response.json()["nodes"]


def test_app_startup_runs_persisted_queued_import_job(tmp_workspace, sample_csv):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project("Startup Recovery")
        session.commit()
        project_id = project.id
    job_id = ImportService(
        paths=paths,
        session_factory=session_factory,
    ).create_import_job(project_id, sample_csv, "customers_orders.csv")

    app = create_app(workspace_root=tmp_workspace)

    with TestClient(app) as client:
        job = _wait_for_import_job(client, project_id, job_id)

    assert job["status"] == "succeeded"
    assert job["dataset_id"] is not None
    assert job["summary"]["sheet_count"] == 1


def test_recover_import_jobs_endpoint_runs_project_stale_and_queued_jobs(
    tmp_workspace,
    sample_csv,
    tmp_path,
):
    sample_bytes = sample_csv.read_bytes()
    stale_csv = tmp_path / "stale_customers_orders.csv"
    queued_csv = tmp_path / "queued_customers_orders.csv"
    other_csv = tmp_path / "other_customers_orders.csv"
    stale_csv.write_bytes(sample_bytes)
    queued_csv.write_bytes(sample_bytes)
    other_csv.write_bytes(sample_bytes)
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project("Recover Imports")
        other_project = ProjectRepository(session).create_project("Other Recover Imports")
        session.commit()
        project_id = project.id
        other_project_id = other_project.id

    service = ImportService(paths=paths, session_factory=session_factory)
    stale_job_id = service.create_import_job(project_id, stale_csv, "customers_orders.csv")
    queued_job_id = service.create_import_job(project_id, queued_csv, "customers_orders.csv")
    other_job_id = service.create_import_job(
        other_project_id,
        other_csv,
        "customers_orders.csv",
    )
    with session_factory() as session:
        repository = ImportRepository(session)
        stale_job = repository.get_import_job(project_id=project_id, job_id=stale_job_id)
        assert stale_job is not None
        repository.update_import_job_progress(stale_job, "running", 25)
        stale_job.updated_at = datetime.now(UTC) - timedelta(hours=2)
        session.commit()

    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.post(f"/api/projects/{project_id}/import-jobs/recover")

    assert response.status_code == 202
    assert response.json() == {"recovered_count": 1, "submitted_count": 2}
    stale_job = _wait_for_import_job(client, project_id, stale_job_id)
    queued_job = _wait_for_import_job(client, project_id, queued_job_id)
    assert stale_job["status"] == "succeeded"
    assert queued_job["status"] == "succeeded"
    with session_factory() as session:
        other_job = session.get(ImportJob, other_job_id)
        assert other_job is not None
        assert other_job.status == "queued"


def test_import_endpoint_records_failed_import_job(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Broken Import"})
    project_id = project_response.json()["id"]

    response = client.post(
        f"/api/projects/{project_id}/imports",
        files={
            "file": (
                "broken.xlsx",
                b"not actually an excel workbook",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 400
    jobs_response = client.get(f"/api/projects/{project_id}/import-jobs")

    assert jobs_response.status_code == 200
    jobs = jobs_response.json()
    assert len(jobs) == 1
    assert jobs[0]["label"] == "broken.xlsx"
    assert jobs[0]["kind"] == "file"
    assert jobs[0]["status"] == "failed"
    assert jobs[0]["progress"] == 100
    assert jobs[0]["summary"] is None
    assert jobs[0]["dataset_id"] is None
    assert jobs[0]["retryable"] is True
    assert jobs[0]["error"]


def test_import_endpoint_rejects_file_over_upload_limit(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Huge Import"})
    project_id = project_response.json()["id"]
    too_large_csv = b"customer_id\n" + (b"c1\n" * (10 * 1024 * 1024 // 3 + 1))

    response = client.post(
        f"/api/projects/{project_id}/imports",
        files={"file": ("too_large.csv", too_large_csv, "text/csv")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == {
        "code": "UPLOAD_LIMIT_EXCEEDED",
        "message": "File exceeds the 10 MB upload limit",
        "user_action": "Choose a smaller file or increase GRAPHMIND_MAX_UPLOAD_BYTES.",
        "retryable": True,
        "field_errors": {},
    }
    assert client.get(f"/api/projects/{project_id}/import-jobs").json() == []


def test_import_endpoint_rejects_unsupported_file_type_with_error_contract(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Unsupported Import"})
    project_id = project_response.json()["id"]

    response = client.post(
        f"/api/projects/{project_id}/imports",
        files={"file": ("notes.exe", b"binary", "application/octet-stream")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == {
        "code": "UNSUPPORTED_IMPORT_FILE_TYPE",
        "message": "Unsupported import file type",
        "user_action": (
            "Upload a supported file type: CSV, XLSX, XLS, JSON, document, code, log, "
            "or archive."
        ),
        "retryable": True,
        "field_errors": {"file": "Unsupported import file type"},
    }
    assert client.get(f"/api/projects/{project_id}/import-jobs").json() == []


def test_async_import_endpoint_rejects_file_over_upload_limit(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Huge Async Import"})
    project_id = project_response.json()["id"]
    too_large_csv = b"customer_id\n" + (b"c1\n" * (10 * 1024 * 1024 // 3 + 1))

    response = client.post(
        f"/api/projects/{project_id}/import-jobs",
        files={"file": ("too_large.csv", too_large_csv, "text/csv")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == {
        "code": "UPLOAD_LIMIT_EXCEEDED",
        "message": "File exceeds the 10 MB upload limit",
        "user_action": "Choose a smaller file or increase GRAPHMIND_MAX_UPLOAD_BYTES.",
        "retryable": True,
        "field_errors": {},
    }
    assert client.get(f"/api/projects/{project_id}/import-jobs").json() == []


def test_import_upload_limit_can_be_configured(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_MAX_UPLOAD_BYTES", "64")
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Tiny Upload Limit"})
    project_id = project_response.json()["id"]

    response = client.post(
        f"/api/projects/{project_id}/imports",
        files={"file": ("too_large.csv", b"id\n" + (b"c1\n" * 22), "text/csv")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == {
        "code": "UPLOAD_LIMIT_EXCEEDED",
        "message": "File exceeds the 64 byte upload limit",
        "user_action": "Choose a smaller file or increase GRAPHMIND_MAX_UPLOAD_BYTES.",
        "retryable": True,
        "field_errors": {},
    }


def test_cancel_import_job_marks_queued_job_canceled(tmp_workspace, sample_csv):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    project_response = client.post("/api/projects", json={"name": "Cancel Import"})
    project_id = project_response.json()["id"]
    job_id = ImportService(
        paths=paths,
        session_factory=session_factory,
    ).create_import_job(project_id, sample_csv, "customers_orders.csv")

    response = client.post(f"/api/projects/{project_id}/import-jobs/{job_id}/cancel")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "canceled"
    assert body["progress"] == 100
    assert body["retryable"] is False
    assert body["error"] == "Import job canceled"
    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "canceled"


def test_retry_import_job_reruns_failed_job_from_staged_file(tmp_workspace, sample_csv):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    project_response = client.post("/api/projects", json={"name": "Retry Import Job"})
    project_id = project_response.json()["id"]
    service = ImportService(paths=paths, session_factory=session_factory)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")
    with session_factory() as session:
        repository = ImportRepository(session)
        failed_at = datetime.now(UTC)
        lease_token = "retry-api-test-lease"
        job = repository.claim_import_job(
            project_id=project_id,
            job_id=job_id,
            worker_id="retry-api-test-worker",
            lease_token=lease_token,
            now=failed_at,
            lease_duration=timedelta(minutes=5),
        )
        assert job is not None
        assert repository.fail_import_job(
            job,
            "Synthetic import failure",
            retryable=True,
            lease_token=lease_token,
            now=failed_at,
        )
        session.commit()

    response = client.post(f"/api/projects/{project_id}/import-jobs/{job_id}/retry")

    assert response.status_code == 202
    body = response.json()
    assert body["status"] in {"queued", "running", "succeeded"}
    job = _wait_for_import_job(client, project_id, job_id)
    assert job["status"] == "succeeded"
    assert job["summary"]["sheet_count"] == 1
    assert client.get(f"/api/projects/{project_id}/graph").json()["nodes"]


def test_import_endpoint_returns_404_for_missing_project(tmp_workspace, sample_csv):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    with sample_csv.open("rb") as upload:
        response = client.post(
            "/api/projects/999/imports",
            files={"file": ("customers_orders.csv", upload, "text/csv")},
        )

    assert response.status_code == 404


def test_sample_import_endpoint_builds_demo_graph_with_cross_named_relationships(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Sample Project"})
    project_id = project_response.json()["id"]

    response = client.post(f"/api/projects/{project_id}/sample-import")

    assert response.status_code == 200
    body = response.json()
    assert body["dataset_id"] > 0
    assert body["sheet_count"] == 3
    assert body["field_count"] >= 10
    assert body["suggestion_count"] >= 3
    assert {node["label"] for node in body["graph"]["nodes"]} >= {
        "Customers",
        "Orders",
        "Products",
    }

    foreign_keys = [
        suggestion
        for suggestion in body["suggestions"]
        if suggestion["relationship_type"] == "foreign_key"
    ]
    assert any(
        suggestion["source_label"] == "Orders.customer_id"
        and suggestion["target_label"] == "Customers.id"
        and suggestion["evidence_payload"]["relationship_strength"] in {"likely", "strong"}
        for suggestion in foreign_keys
    )
    assert any(
        suggestion["source_label"] == "Orders.product_code"
        and suggestion["target_label"] == "Products.product_code"
        for suggestion in foreign_keys
    )
    assert any(
        suggestion["evidence_payload"]["sample_matches"]
        and "字段名相似度" in suggestion["evidence_summary"]
        for suggestion in foreign_keys
    )


def test_sample_import_endpoint_is_idempotent_for_demo_dataset(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Sample Project"})
    project_id = project_response.json()["id"]

    first_response = client.post(f"/api/projects/{project_id}/sample-import")
    second_response = client.post(f"/api/projects/{project_id}/sample-import")

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    first_body = first_response.json()
    second_body = second_response.json()
    assert second_body["dataset_id"] == first_body["dataset_id"]
    assert len(second_body["graph"]["nodes"]) == len(first_body["graph"]["nodes"])
    assert len(second_body["graph"]["edges"]) == len(first_body["graph"]["edges"])
    assert len(second_body["suggestions"]) == len(first_body["suggestions"])
    assert [node["label"] for node in second_body["graph"]["nodes"]].count("Orders") == 1
    assert [node["label"] for node in second_body["graph"]["nodes"]].count("Customers") == 1
    assert [
        suggestion["source_label"]
        for suggestion in second_body["suggestions"]
        if suggestion["source_label"] == "Orders.customer_id"
    ].count("Orders.customer_id") == 1


def test_sample_import_endpoint_returns_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.post("/api/projects/999/sample-import")

    assert response.status_code == 404


def test_reset_project_data_clears_imported_graph_and_suggestions(tmp_workspace, sample_csv):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    project_response = client.post("/api/projects", json={"name": "Reset Project"})
    project_id = project_response.json()["id"]
    other_project_response = client.post("/api/projects", json={"name": "Other Project"})
    other_project_id = other_project_response.json()["id"]

    with sample_csv.open("rb") as upload:
        import_response = client.post(
            f"/api/projects/{project_id}/imports",
            files={"file": ("customers_orders.csv", upload, "text/csv")},
        )
    with sample_csv.open("rb") as upload:
        other_import_response = client.post(
            f"/api/projects/{other_project_id}/imports",
            files={"file": ("other_orders.csv", upload, "text/csv")},
        )

    assert import_response.status_code == 200
    assert other_import_response.status_code == 200
    imported_dataset_id = import_response.json()["dataset_id"]
    other_dataset_id = other_import_response.json()["dataset_id"]
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        imported_dataset = session.get(Dataset, imported_dataset_id)
        other_dataset = session.get(Dataset, other_dataset_id)
        assert imported_dataset is not None
        assert other_dataset is not None
        imported_raw_path = tmp_workspace / imported_dataset.raw_data_ref
        other_raw_path = tmp_workspace / other_dataset.raw_data_ref
        assert imported_raw_path.exists()
        assert other_raw_path.exists()

    response = client.delete(f"/api/projects/{project_id}/data")

    assert response.status_code == 200
    assert response.json() == {
        "graph": {"nodes": [], "edges": []},
        "suggestions": [],
    }
    assert client.get(f"/api/projects/{project_id}/graph").json() == {"nodes": [], "edges": []}
    assert client.get(f"/api/projects/{project_id}/relationship-suggestions").json() == []
    assert client.get(f"/api/projects/{other_project_id}/graph").json()["nodes"]
    assert not imported_raw_path.exists()
    assert other_raw_path.exists()

    with session_factory() as session:
        assert session.query(Dataset).filter(Dataset.project_id == project_id).count() == 0
        assert session.query(GraphNode).filter(GraphNode.project_id == project_id).count() == 0
        assert session.query(GraphEdge).filter(GraphEdge.project_id == project_id).count() == 0
        assert (
            session.query(RelationshipSuggestion)
            .filter(RelationshipSuggestion.project_id == project_id)
            .count()
            == 0
        )
        assert session.query(Dataset).filter(Dataset.project_id == other_project_id).count() == 1


def test_reset_project_data_returns_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.delete("/api/projects/999/data")

    assert response.status_code == 404


def test_get_graph_maps_fields_and_orders_by_id(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Graph Project", settings={})
        session.add(project)
        session.flush()

        target_node = GraphNode(
            project_id=project.id,
            node_type="sheet",
            label="Orders",
            source_ref="dataset:1/sheet:orders",
            node_metadata={"rows": 10},
            position_x=20.5,
            position_y=30.5,
        )
        source_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Customer ID",
            source_ref="dataset:1/sheet:orders/field:customer_id",
            node_metadata={"semantic_label": "customer_identifier"},
            position_x=1.25,
            position_y=2.5,
        )
        session.add_all([target_node, source_node])
        session.flush()

        later_edge = GraphEdge(
            project_id=project.id,
            source_node_id=target_node.id,
            target_node_id=source_node.id,
            edge_type="contains",
            confidence=0.75,
            status="accepted",
            evidence_ref="manual:2",
        )
        earlier_edge = GraphEdge(
            project_id=project.id,
            source_node_id=source_node.id,
            target_node_id=target_node.id,
            edge_type="belongs_to",
            confidence=0.9,
            status="suggested",
            evidence_ref="suggestion:1",
        )
        session.add_all([later_edge, earlier_edge])
        session.commit()

        project_id = project.id
        first_node_id = target_node.id
        second_node_id = source_node.id
        first_edge_id = later_edge.id
        second_edge_id = earlier_edge.id

    response = client.get(f"/api/projects/{project_id}/graph")

    assert response.status_code == 200
    assert response.json() == {
        "nodes": [
            {
                "id": first_node_id,
                "node_type": "sheet",
                "label": "Orders",
                "source_ref": "dataset:1/sheet:orders",
                "metadata": {"rows": 10},
                "position_x": 20.5,
                "position_y": 30.5,
            },
            {
                "id": second_node_id,
                "node_type": "field",
                "label": "Customer ID",
                "source_ref": "dataset:1/sheet:orders/field:customer_id",
                "metadata": {"semantic_label": "customer_identifier"},
                "position_x": 1.25,
                "position_y": 2.5,
            },
        ],
        "edges": [
            {
                "id": first_edge_id,
                "source_node_id": first_node_id,
                "target_node_id": second_node_id,
                "edge_type": "contains",
                "confidence": 0.75,
                "status": "accepted",
                "evidence_ref": "manual:2",
                "evidence_refs": ["manual:2"],
                "created_from_suggestion_id": None,
                "metadata": {},
                "evidence_summary": None,
                "evidence_payload": None,
            },
            {
                "id": second_edge_id,
                "source_node_id": second_node_id,
                "target_node_id": first_node_id,
                "edge_type": "belongs_to",
                "confidence": 0.9,
                "status": "suggested",
                "evidence_ref": "suggestion:1",
                "evidence_refs": ["suggestion:1"],
                "created_from_suggestion_id": None,
                "metadata": {},
                "evidence_summary": None,
                "evidence_payload": None,
            },
        ],
    }


def test_get_graph_returns_edge_evidence_and_suggestion_linkage(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Evidence Project", settings={})
        session.add(project)
        session.flush()

        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
        )
        session.add(dataset)
        session.flush()

        sheet = Sheet(
            dataset_id=dataset.id,
            name="Orders",
            normalized_name="orders",
            row_count=3,
            column_count=2,
            duckdb_table_name="orders",
        )
        session.add(sheet)
        session.flush()

        source = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1", "c2"],
            key_candidate_score=0.88,
        )
        target = FieldProfile(
            sheet_id=sheet.id,
            original_name="Account ID",
            normalized_name="account_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1", "c2"],
            key_candidate_score=0.8,
        )
        session.add_all([source, target])
        session.flush()

        suggestion = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=target.id,
            relationship_type="foreign_key",
            confidence=0.94,
            evidence_summary="2 of 2 distinct source values overlap.",
            evidence_payload={"overlap_count": 2, "source_match_ratio": 1.0},
            decision_status="pending",
        )
        session.add(suggestion)
        session.flush()

        source_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={"inferred_type": "string"},
            position_x=0,
            position_y=0,
        )
        target_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.account_id",
            source_ref="orders.account_id",
            node_metadata={"inferred_type": "string"},
            position_x=160,
            position_y=0,
        )
        session.add_all([source_node, target_node])
        session.flush()

        edge = GraphEdge(
            project_id=project.id,
            source_node_id=source_node.id,
            target_node_id=target_node.id,
            edge_type="foreign_key",
            confidence=0.94,
            status="suggested",
            evidence_ref="suggestion:0",
            edge_metadata={"evidence_payload": {"overlap_count": 2}},
            created_from_suggestion_id=suggestion.id,
        )
        session.add(edge)
        session.commit()

        project_id = project.id
        edge_id = edge.id
        source_node_id = source_node.id
        target_node_id = target_node.id
        suggestion_id = suggestion.id

    response = client.get(f"/api/projects/{project_id}/graph")

    assert response.status_code == 200
    body = response.json()
    assert body["edges"] == [
        {
            "id": edge_id,
            "source_node_id": source_node_id,
            "target_node_id": target_node_id,
            "edge_type": "foreign_key",
            "confidence": 0.94,
            "status": "suggested",
            "evidence_ref": "suggestion:0",
            "evidence_refs": ["suggestion:0"],
            "created_from_suggestion_id": suggestion_id,
            "metadata": {"evidence_payload": {"overlap_count": 2}},
            "evidence_summary": "2 of 2 distinct source values overlap.",
            "evidence_payload": {"overlap_count": 2, "source_match_ratio": 1.0},
        }
    ]


def test_get_graph_deduplicates_repeated_import_nodes_and_edges(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Graph Project", settings={})
        session.add(project)
        session.flush()

        first_table = GraphNode(
            project_id=project.id,
            node_type="table",
            label="Orders",
            source_ref="p1_d1_orders",
            node_metadata={"row_count": 5, "column_count": 1},
            position_x=0,
            position_y=0,
        )
        first_field = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="p1_d1_orders.customer_id",
            node_metadata={"inferred_type": "identifier"},
            position_x=0,
            position_y=100,
        )
        second_table = GraphNode(
            project_id=project.id,
            node_type="table",
            label="Orders",
            source_ref="p1_d2_orders",
            node_metadata={"row_count": 5, "column_count": 1},
            position_x=300,
            position_y=0,
        )
        second_field = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="p1_d2_orders.customer_id",
            node_metadata={"inferred_type": "identifier"},
            position_x=300,
            position_y=100,
        )
        session.add_all([first_table, first_field, second_table, second_field])
        session.flush()
        session.add_all(
            [
                GraphEdge(
                    project_id=project.id,
                    source_node_id=first_table.id,
                    target_node_id=first_field.id,
                    edge_type="contains_field",
                    confidence=1,
                    status="auto_trusted",
                    evidence_ref="field:Orders.customer_id",
                ),
                GraphEdge(
                    project_id=project.id,
                    source_node_id=second_table.id,
                    target_node_id=second_field.id,
                    edge_type="contains_field",
                    confidence=1,
                    status="auto_trusted",
                    evidence_ref="field:Orders.customer_id",
                ),
            ]
        )
        session.commit()
        project_id = project.id
        first_table_id = first_table.id
        first_field_id = first_field.id

    response = client.get(f"/api/projects/{project_id}/graph")

    assert response.status_code == 200
    body = response.json()
    assert [(node["node_type"], node["label"]) for node in body["nodes"]] == [
        ("table", "Orders"),
        ("field", "Orders.customer_id"),
    ]
    assert body["nodes"][0]["id"] == first_table_id
    assert body["nodes"][1]["id"] == first_field_id
    assert body["nodes"][0]["metadata"]["aggregate_count"] == 2
    assert body["nodes"][1]["metadata"]["aggregate_count"] == 2
    edge_summaries = [
        (edge["source_node_id"], edge["target_node_id"], edge["edge_type"])
        for edge in body["edges"]
    ]
    assert edge_summaries == [(first_table_id, first_field_id, "contains_field")]
    assert body["edges"][0]["metadata"]["aggregate_count"] == 2


def test_get_relationship_suggestions_maps_field_labels_for_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Graph Project", settings={})
        other_project = Project(name="Other Project", settings={})
        session.add_all([project, other_project])
        session.flush()

        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
        )
        other_dataset = Dataset(
            project_id=other_project.id,
            filename="other.csv",
            file_type="csv",
            raw_data_ref="imports/other.csv",
        )
        session.add_all([dataset, other_dataset])
        session.flush()

        sheet = Sheet(
            dataset_id=dataset.id,
            name="Orders",
            normalized_name="orders",
            row_count=2,
            column_count=2,
            duckdb_table_name="orders",
        )
        other_sheet = Sheet(
            dataset_id=other_dataset.id,
            name="Other Orders",
            normalized_name="orders",
            row_count=2,
            column_count=1,
            duckdb_table_name="other_orders",
        )
        session.add_all([sheet, other_sheet])
        session.flush()

        source = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1"],
            key_candidate_score=0.9,
        )
        target = FieldProfile(
            sheet_id=sheet.id,
            original_name="Account ID",
            normalized_name="account_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1"],
            key_candidate_score=0.8,
        )
        other_field = FieldProfile(
            sheet_id=other_sheet.id,
            original_name="Wrong Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["x1"],
            key_candidate_score=0.2,
        )
        session.add_all([source, target, other_field])
        session.flush()

        suggestion = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=target.id,
            relationship_type="same_entity",
            confidence=0.91,
            evidence_summary="Matched identifiers.",
            evidence_payload={"overlap": 0.95},
            ai_explanation="Likely the same entity.",
            decision_status="pending",
        )
        other_suggestion = RelationshipSuggestion(
            project_id=other_project.id,
            source_field_id=other_field.id,
            target_field_id=None,
            relationship_type="derived_dimension",
            confidence=0.7,
            evidence_summary="Other project only.",
            evidence_payload={},
            decision_status="pending",
        )
        session.add_all([suggestion, other_suggestion])
        session.commit()

        project_id = project.id
        suggestion_id = suggestion.id
        source_id = source.id
        target_id = target.id
        created_at = suggestion.created_at.isoformat()
        updated_at = suggestion.updated_at.isoformat()

    response = client.get(f"/api/projects/{project_id}/relationship-suggestions")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": suggestion_id,
            "source_field_id": source_id,
            "target_field_id": target_id,
            "source_label": "Orders.customer_id",
            "target_label": "Orders.account_id",
            "relationship_type": "same_entity",
            "confidence": 0.91,
            "evidence_summary": "Matched identifiers.",
            "evidence_payload": {"overlap": 0.95},
            "decision_status": "pending",
            "reviewed_by": None,
            "created_at": created_at,
            "updated_at": updated_at,
            "quality_label": "high",
            "review_priority": "high",
            "quality_reasons": ["confidence:high"],
        }
    ]


def test_get_relationship_suggestions_deduplicates_repeated_import_suggestions(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Graph Project", settings={})
        session.add(project)
        session.flush()

        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
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
        customer_sheet = Sheet(
            dataset_id=dataset.id,
            name="Customers",
            normalized_name="customers",
            row_count=2,
            column_count=1,
            duckdb_table_name="customers",
        )
        session.add_all([sheet, customer_sheet])
        session.flush()
        source = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1"],
            key_candidate_score=0.9,
        )
        target = FieldProfile(
            sheet_id=customer_sheet.id,
            original_name="ID",
            normalized_name="id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1"],
            key_candidate_score=1.0,
        )
        session.add_all([source, target])
        session.flush()
        first = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=target.id,
            relationship_type="foreign_key",
            confidence=0.99,
            evidence_summary="Customer IDs overlap.",
            evidence_payload={"overlap": 1.0},
            decision_status="pending",
        )
        duplicate = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=target.id,
            relationship_type="foreign_key",
            confidence=0.99,
            evidence_summary="Customer IDs overlap.",
            evidence_payload={"overlap": 1.0},
            decision_status="pending",
        )
        session.add_all([first, duplicate])
        session.commit()
        project_id = project.id

    response = client.get(f"/api/projects/{project_id}/relationship-suggestions")

    assert response.status_code == 200
    assert [
        (suggestion["source_label"], suggestion["target_label"], suggestion["relationship_type"])
        for suggestion in response.json()
    ] == [("Orders.customer_id", "Customers.id", "foreign_key")]


def test_relationship_governance_endpoint_reports_duplicate_suggestions(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Graph Project", settings={})
        session.add(project)
        session.flush()
        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
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
        customer_sheet = Sheet(
            dataset_id=dataset.id,
            name="Customers",
            normalized_name="customers",
            row_count=2,
            column_count=1,
            duckdb_table_name="customers",
        )
        session.add_all([sheet, customer_sheet])
        session.flush()
        source = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1"],
            key_candidate_score=0.9,
        )
        target = FieldProfile(
            sheet_id=customer_sheet.id,
            original_name="ID",
            normalized_name="id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1"],
            key_candidate_score=1.0,
        )
        session.add_all([source, target])
        session.flush()
        first = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=target.id,
            relationship_type="foreign_key",
            confidence=0.99,
            evidence_summary="Customer IDs overlap.",
            evidence_payload={"overlap": 1.0},
            decision_status="pending",
        )
        duplicate = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=target.id,
            relationship_type="foreign_key",
            confidence=0.99,
            evidence_summary="Customer IDs overlap.",
            evidence_payload={"overlap": 1.0},
            decision_status="pending",
        )
        session.add_all([first, duplicate])
        session.commit()
        project_id = project.id

    response = client.get(f"/api/projects/{project_id}/relationship-governance")

    assert response.status_code == 200
    assert response.json()["duplicate_suggestion_count"] == 1
    assert response.json()["duplicate_group_count"] == 1
    assert response.json()["visible_suggestion_count"] == 1
    assert response.json()["duplicate_groups"][0]["source_label"] == "Orders.customer_id"


def test_relationship_governance_cleanup_endpoint_removes_duplicate_suggestions(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Graph Project", settings={})
        session.add(project)
        session.flush()
        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
        )
        session.add(dataset)
        session.flush()
        sheet = Sheet(
            dataset_id=dataset.id,
            name="Orders",
            normalized_name="orders",
            row_count=2,
            column_count=1,
            duckdb_table_name="orders",
        )
        session.add(sheet)
        session.flush()
        source = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1"],
            key_candidate_score=0.9,
        )
        session.add(source)
        session.flush()
        first = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=None,
            relationship_type="derived_dimension",
            confidence=0.82,
            evidence_summary="Repeated values.",
            evidence_payload={},
            decision_status="pending",
        )
        duplicate = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=None,
            relationship_type="derived_dimension",
            confidence=0.82,
            evidence_summary="Repeated values.",
            evidence_payload={},
            decision_status="pending",
        )
        session.add_all([first, duplicate])
        session.flush()
        source_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="Orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target_node = GraphNode(
            project_id=project.id,
            node_type="derived_entity",
            label="customer_id values",
            source_ref="Orders.customer_id",
            node_metadata={},
            position_x=100,
            position_y=0,
        )
        session.add_all([source_node, target_node])
        session.flush()
        edge = GraphEdge(
            project_id=project.id,
            source_node_id=source_node.id,
            target_node_id=target_node.id,
            edge_type="derived_dimension",
            confidence=0.82,
            status="suggested",
            evidence_ref="suggestion:1",
            created_from_suggestion_id=duplicate.id,
        )
        session.add(edge)
        session.commit()
        project_id = project.id
        first_id = first.id
        duplicate_id = duplicate.id
        edge_id = edge.id

    response = client.post(
        f"/api/projects/{project_id}/relationship-governance/cleanup-duplicates"
    )

    assert response.status_code == 200
    assert response.json()["removed_duplicate_count"] == 1
    assert response.json()["relinked_edge_count"] == 1
    assert response.json()["remaining_duplicate_count"] == 0
    with session_factory() as session:
        assert session.get(RelationshipSuggestion, duplicate_id) is None
        edge = session.get(GraphEdge, edge_id)
        assert edge is not None
        assert edge.created_from_suggestion_id == first_id


def test_get_relationship_suggestions_uses_none_for_missing_target(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Graph Project", settings={})
        session.add(project)
        session.flush()
        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
        )
        session.add(dataset)
        session.flush()
        sheet = Sheet(
            dataset_id=dataset.id,
            name="Orders",
            normalized_name="orders",
            row_count=2,
            column_count=1,
            duckdb_table_name="orders",
        )
        session.add(sheet)
        session.flush()
        source = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1"],
            key_candidate_score=0.9,
        )
        session.add(source)
        session.flush()
        suggestion = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=None,
            relationship_type="derived_dimension",
            confidence=0.82,
            evidence_summary="Repeated values.",
            evidence_payload={},
            decision_status="pending",
        )
        session.add(suggestion)
        session.commit()
        project_id = project.id
        suggestion_id = suggestion.id
        source_id = source.id
        created_at = suggestion.created_at.isoformat()
        updated_at = suggestion.updated_at.isoformat()

    response = client.get(f"/api/projects/{project_id}/relationship-suggestions")

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": suggestion_id,
            "source_field_id": source_id,
            "target_field_id": None,
            "source_label": "Orders.customer_id",
            "target_label": None,
            "relationship_type": "derived_dimension",
            "confidence": 0.82,
            "evidence_summary": "Repeated values.",
            "evidence_payload": {},
            "decision_status": "pending",
            "reviewed_by": None,
            "created_at": created_at,
            "updated_at": updated_at,
            "quality_label": "medium",
            "review_priority": "low",
            "quality_reasons": ["confidence:medium"],
        }
    ]


def test_get_relationship_suggestions_returns_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.get("/api/projects/999/relationship-suggestions")

    assert response.status_code == 404


def test_review_analytics_endpoint_reports_sla_trends_and_project_scope(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    now = datetime.now(UTC)

    with session_factory() as session:
        project = Project(name="Analytics Project", settings={})
        other_project = Project(name="Other Analytics", settings={})
        session.add_all([project, other_project])
        session.flush()
        field = _seed_review_analytics_field(session, project.id)
        other_field = _seed_review_analytics_field(session, other_project.id)

        old_pending = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=field.id,
            target_field_id=None,
            relationship_type="derived_dimension",
            confidence=0.76,
            evidence_summary="",
            evidence_payload={},
            decision_status="pending",
            created_at=now - timedelta(days=9),
            updated_at=now - timedelta(days=9),
        )
        recent_pending = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=field.id,
            target_field_id=None,
            relationship_type="derived_dimension",
            confidence=0.91,
            evidence_summary="Recent pending with evidence.",
            evidence_payload={"source_refs": ["doc:1"]},
            decision_status="pending",
            created_at=now - timedelta(days=1),
            updated_at=now - timedelta(days=1),
        )
        accepted = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=field.id,
            target_field_id=None,
            relationship_type="foreign_key",
            confidence=0.94,
            evidence_summary="Accepted with evidence.",
            evidence_payload={"overlap": 0.9},
            decision_status="accepted",
            created_at=now - timedelta(days=12),
            updated_at=now - timedelta(days=2),
        )
        rejected = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=field.id,
            target_field_id=None,
            relationship_type="foreign_key",
            confidence=0.42,
            evidence_summary="",
            evidence_payload={},
            decision_status="rejected",
            created_at=now - timedelta(days=20),
            updated_at=now - timedelta(days=7),
        )
        edited = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=field.id,
            target_field_id=None,
            relationship_type="foreign_key",
            confidence=0.83,
            evidence_summary="Edited with evidence.",
            evidence_payload={"review_evidence_quality": "medium"},
            decision_status="edited",
            created_at=now - timedelta(days=18),
            updated_at=now - timedelta(days=3),
        )
        out_of_window = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=field.id,
            target_field_id=None,
            relationship_type="foreign_key",
            confidence=0.96,
            evidence_summary="Accepted outside trend window.",
            evidence_payload={"overlap": 0.9},
            decision_status="accepted",
            created_at=now - timedelta(days=70),
            updated_at=now - timedelta(days=40),
        )
        other_project_pending = RelationshipSuggestion(
            project_id=other_project.id,
            source_field_id=other_field.id,
            target_field_id=None,
            relationship_type="derived_dimension",
            confidence=0.99,
            evidence_summary="Other project should not count.",
            evidence_payload={"overlap": 1.0},
            decision_status="pending",
            created_at=now - timedelta(days=30),
            updated_at=now - timedelta(days=30),
        )
        session.add_all(
            [
                old_pending,
                recent_pending,
                accepted,
                rejected,
                edited,
                out_of_window,
                other_project_pending,
            ]
        )
        session.commit()
        project_id = project.id

    response = client.get(f"/api/projects/{project_id}/review-analytics?window=30d")

    assert response.status_code == 200
    body = response.json()
    assert body["window_days"] == 30
    assert body["sla"]["pending_sla_days"] == 3
    assert body["sla"]["pending_total"] == 2
    assert body["sla"]["overdue_pending_count"] == 1
    assert body["sla"]["oldest_pending_age_days"] == 9
    assert body["aging_buckets"] == {
        "0_1_days": 1,
        "2_3_days": 0,
        "4_7_days": 0,
        "8_plus_days": 1,
    }
    assert body["decision_trend"] == {
        "accepted": 1,
        "edited": 1,
        "pending": 2,
        "rejected": 1,
    }
    assert body["quality_distribution"] == {"high": 2, "medium": 2, "low": 1}
    assert body["evidence_coverage"] == {
        "with_evidence_count": 3,
        "without_evidence_count": 2,
        "coverage_ratio": 0.6,
    }


def test_review_analytics_endpoint_returns_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.get("/api/projects/999/review-analytics")

    assert response.status_code == 404


def test_review_analytics_trend_endpoint_returns_current_view_without_mutating_snapshots(
    tmp_workspace,
):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    now = datetime.now(UTC)
    historical_date = (now.date() - timedelta(days=2)).isoformat()
    today = now.date().isoformat()

    with session_factory() as session:
        project = Project(name="Analytics Trend Project", settings={})
        session.add(project)
        session.flush()
        field = _seed_review_analytics_field(session, project.id)
        session.add_all(
            [
                RelationshipSuggestion(
                    project_id=project.id,
                    source_field_id=field.id,
                    target_field_id=None,
                    relationship_type="derived_dimension",
                    confidence=0.76,
                    evidence_summary="",
                    evidence_payload={},
                    decision_status="pending",
                    created_at=now - timedelta(days=5),
                    updated_at=now - timedelta(days=5),
                ),
                RelationshipSuggestion(
                    project_id=project.id,
                    source_field_id=field.id,
                    target_field_id=None,
                    relationship_type="foreign_key",
                    confidence=0.94,
                    evidence_summary="Accepted with evidence.",
                    evidence_payload={"overlap": 0.9},
                    decision_status="accepted",
                    created_at=now - timedelta(days=4),
                    updated_at=now - timedelta(days=1),
                ),
            ]
        )
        session.add(
            ReviewAnalyticsSnapshot(
                project_id=project.id,
                snapshot_date=historical_date,
                window_days=30,
                generated_at=now - timedelta(days=2),
                analytics_payload={
                    "window_days": 30,
                    "generated_at": (now - timedelta(days=2)).isoformat(),
                    "sla": {
                        "pending_sla_days": 3,
                        "pending_total": 5,
                        "overdue_pending_count": 2,
                        "oldest_pending_age_days": 11,
                    },
                    "aging_buckets": {
                        "0_1_days": 1,
                        "2_3_days": 2,
                        "4_7_days": 1,
                        "8_plus_days": 1,
                    },
                    "decision_trend": {
                        "accepted": 3,
                        "edited": 1,
                        "pending": 5,
                        "rejected": 1,
                    },
                    "quality_distribution": {"high": 3, "medium": 4, "low": 3},
                    "evidence_coverage": {
                        "with_evidence_count": 7,
                        "without_evidence_count": 3,
                        "coverage_ratio": 0.7,
                    },
                },
            )
        )
        session.commit()
        project_id = project.id

    response = client.get(
        f"/api/projects/{project_id}/review-analytics/trend?window=30d&days=7"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["window_days"] == 30
    assert body["days"] == 7
    snapshots = body["snapshots"]
    assert [snapshot["snapshot_date"] for snapshot in snapshots] == [
        historical_date,
        today,
    ]
    assert snapshots[0]["analytics"]["sla"]["pending_total"] == 5
    assert snapshots[0]["analytics"]["evidence_coverage"]["coverage_ratio"] == 0.7
    assert snapshots[1]["analytics"]["sla"]["pending_total"] == 1
    assert snapshots[1]["analytics"]["sla"]["overdue_pending_count"] == 1
    assert snapshots[1]["analytics"]["decision_trend"]["accepted"] == 1

    with session_factory() as session:
        saved = (
            session.query(ReviewAnalyticsSnapshot)
            .filter(
                ReviewAnalyticsSnapshot.project_id == project_id,
                ReviewAnalyticsSnapshot.snapshot_date == today,
                ReviewAnalyticsSnapshot.window_days == 30,
            )
            .one_or_none()
        )
        assert saved is None


def test_review_analytics_trend_endpoint_returns_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.get("/api/projects/999/review-analytics/trend")

    assert response.status_code == 404


def test_review_analytics_snapshot_refresh_atomically_upserts_today(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Snapshot Refresh"}).json()["id"]

    first = client.post(
        f"/api/projects/{project_id}/review-analytics/snapshots/refresh?window=30d"
    )
    second = client.post(
        f"/api/projects/{project_id}/review-analytics/snapshots/refresh?window=30d"
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["snapshot_date"] == datetime.now(UTC).date().isoformat()
    paths = WorkspacePaths(tmp_workspace)
    with create_session_factory(paths.database_path)() as session:
        count = (
            session.query(ReviewAnalyticsSnapshot)
            .filter(
                ReviewAnalyticsSnapshot.project_id == project_id,
                ReviewAnalyticsSnapshot.window_days == 30,
            )
            .count()
        )
    assert count == 1


def test_review_analytics_snapshot_summary_and_cleanup(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    now = datetime.now(UTC)

    with session_factory() as session:
        project = Project(name="Analytics Snapshot Governance", settings={})
        session.add(project)
        session.flush()
        for age_days in (95, 45, 10, 1):
            snapshot_date = (now.date() - timedelta(days=age_days)).isoformat()
            session.add(
                ReviewAnalyticsSnapshot(
                    project_id=project.id,
                    snapshot_date=snapshot_date,
                    window_days=30,
                    generated_at=now - timedelta(days=age_days),
                    analytics_payload={
                        "window_days": 30,
                        "generated_at": (now - timedelta(days=age_days)).isoformat(),
                        "sla": {
                            "pending_sla_days": 3,
                            "pending_total": age_days,
                            "overdue_pending_count": 1,
                            "oldest_pending_age_days": age_days,
                        },
                        "aging_buckets": {
                            "0_1_days": 0,
                            "2_3_days": 0,
                            "4_7_days": 0,
                            "8_plus_days": 1,
                        },
                        "decision_trend": {
                            "accepted": 0,
                            "edited": 0,
                            "pending": 1,
                            "rejected": 0,
                        },
                        "quality_distribution": {"high": 0, "medium": 1, "low": 0},
                        "evidence_coverage": {
                            "with_evidence_count": 1,
                            "without_evidence_count": 0,
                            "coverage_ratio": 1,
                        },
                    },
                )
            )
        session.commit()
        project_id = project.id

    summary_response = client.get(f"/api/projects/{project_id}/review-analytics/snapshots")

    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["snapshot_count"] == 4
    assert summary["retention_days"] == 30
    assert summary["oldest_snapshot_date"] == (now.date() - timedelta(days=95)).isoformat()
    assert summary["latest_snapshot_date"] == (now.date() - timedelta(days=1)).isoformat()
    assert summary["expired_snapshot_count"] == 2

    cleanup_response = client.post(
        f"/api/projects/{project_id}/review-analytics/snapshots/cleanup",
        json={"retention_days": 30},
    )

    assert cleanup_response.status_code == 200
    cleanup = cleanup_response.json()
    assert cleanup["removed_count"] == 2
    assert cleanup["remaining_count"] == 2
    assert cleanup["retention_days"] == 30

    with session_factory() as session:
        remaining_dates = [
            row.snapshot_date
            for row in session.query(ReviewAnalyticsSnapshot)
            .filter(ReviewAnalyticsSnapshot.project_id == project_id)
            .order_by(ReviewAnalyticsSnapshot.snapshot_date)
            .all()
        ]
    assert remaining_dates == [
        (now.date() - timedelta(days=10)).isoformat(),
        (now.date() - timedelta(days=1)).isoformat(),
    ]

    events_response = client.get(
        f"/api/projects/{project_id}/review-analytics/snapshots/cleanup-events"
    )

    assert events_response.status_code == 200
    events = events_response.json()
    assert len(events) == 1
    assert events[0]["project_id"] == project_id
    assert events[0]["retention_days"] == 30
    assert events[0]["cutoff_date"] == cleanup["cutoff_date"]
    assert events[0]["removed_count"] == 2
    assert events[0]["remaining_count"] == 2
    assert isinstance(events[0]["created_at"], str)


def test_review_analytics_snapshot_summary_uses_project_retention_default(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    now = datetime.now(UTC)

    with session_factory() as session:
        project = Project(
            name="Analytics Retention Default",
            settings={
                "review_analytics": {
                    "retention_days": 90,
                    "auto_cleanup_enabled": False,
                }
            },
        )
        session.add(project)
        session.flush()
        for age_days in (95, 45, 10):
            session.add(
                ReviewAnalyticsSnapshot(
                    project_id=project.id,
                    snapshot_date=(now.date() - timedelta(days=age_days)).isoformat(),
                    window_days=30,
                    generated_at=now - timedelta(days=age_days),
                    analytics_payload={
                        "window_days": 30,
                        "generated_at": (now - timedelta(days=age_days)).isoformat(),
                        "sla": {
                            "pending_sla_days": 3,
                            "pending_total": 0,
                            "overdue_pending_count": 0,
                            "oldest_pending_age_days": None,
                        },
                        "aging_buckets": {
                            "0_1_days": 0,
                            "2_3_days": 0,
                            "4_7_days": 0,
                            "8_plus_days": 0,
                        },
                        "decision_trend": {
                            "accepted": 0,
                            "edited": 0,
                            "pending": 0,
                            "rejected": 0,
                        },
                        "quality_distribution": {"high": 0, "medium": 0, "low": 0},
                        "evidence_coverage": {
                            "with_evidence_count": 0,
                            "without_evidence_count": 0,
                            "coverage_ratio": 0,
                        },
                    },
                )
            )
        session.commit()
        project_id = project.id

    response = client.get(f"/api/projects/{project_id}/review-analytics/snapshots")

    assert response.status_code == 200
    body = response.json()
    assert body["retention_days"] == 90
    assert body["expired_snapshot_count"] == 1


def test_review_analytics_cleanup_uses_project_retention_default(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    now = datetime.now(UTC)

    with session_factory() as session:
        project = Project(
            name="Analytics Cleanup Retention Default",
            settings={
                "review_analytics": {
                    "retention_days": 90,
                    "auto_cleanup_enabled": False,
                }
            },
        )
        session.add(project)
        session.flush()
        for age_days in (95, 45, 10):
            session.add(
                ReviewAnalyticsSnapshot(
                    project_id=project.id,
                    snapshot_date=(now.date() - timedelta(days=age_days)).isoformat(),
                    window_days=30,
                    generated_at=now - timedelta(days=age_days),
                    analytics_payload={},
                )
            )
        session.commit()
        project_id = project.id

    response = client.post(f"/api/projects/{project_id}/review-analytics/snapshots/cleanup")

    assert response.status_code == 200
    body = response.json()
    assert body["retention_days"] == 90
    assert body["removed_count"] == 1
    assert body["remaining_count"] == 2


def test_review_analytics_trend_get_does_not_run_auto_cleanup(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    now = datetime.now(UTC)

    with session_factory() as session:
        project = Project(
            name="Analytics Auto Cleanup",
            settings={
                "review_analytics": {
                    "retention_days": 30,
                    "auto_cleanup_enabled": True,
                }
            },
        )
        session.add(project)
        session.flush()
        field = _seed_review_analytics_field(session, project.id)
        session.add(
            RelationshipSuggestion(
                project_id=project.id,
                source_field_id=field.id,
                target_field_id=None,
                relationship_type="derived_dimension",
                confidence=0.7,
                evidence_summary="Needs review.",
                evidence_payload={},
                decision_status="pending",
            )
        )
        for age_days in (45, 2):
            session.add(
                ReviewAnalyticsSnapshot(
                    project_id=project.id,
                    snapshot_date=(now.date() - timedelta(days=age_days)).isoformat(),
                    window_days=30,
                    generated_at=now - timedelta(days=age_days),
                    analytics_payload={
                        "window_days": 30,
                        "generated_at": (now - timedelta(days=age_days)).isoformat(),
                        "sla": {
                            "pending_sla_days": 3,
                            "pending_total": 0,
                            "overdue_pending_count": 0,
                            "oldest_pending_age_days": None,
                        },
                        "aging_buckets": {
                            "0_1_days": 0,
                            "2_3_days": 0,
                            "4_7_days": 0,
                            "8_plus_days": 0,
                        },
                        "decision_trend": {
                            "accepted": 0,
                            "edited": 0,
                            "pending": 0,
                            "rejected": 0,
                        },
                        "quality_distribution": {"high": 0, "medium": 0, "low": 0},
                        "evidence_coverage": {
                            "with_evidence_count": 0,
                            "without_evidence_count": 0,
                            "coverage_ratio": 0,
                        },
                    },
                )
            )
        session.commit()
        project_id = project.id

    response = client.get(f"/api/projects/{project_id}/review-analytics/trend")

    assert response.status_code == 200
    with session_factory() as session:
        remaining_dates = [
            snapshot.snapshot_date
            for snapshot in session.query(ReviewAnalyticsSnapshot)
            .filter(ReviewAnalyticsSnapshot.project_id == project_id)
            .order_by(ReviewAnalyticsSnapshot.snapshot_date)
            .all()
        ]
        event_count = (
            session.query(ReviewAnalyticsSnapshotCleanupAudit)
            .filter(ReviewAnalyticsSnapshotCleanupAudit.project_id == project_id)
            .count()
        )
    assert remaining_dates == [
        (now.date() - timedelta(days=45)).isoformat(),
        (now.date() - timedelta(days=2)).isoformat(),
    ]
    assert event_count == 0


def test_review_analytics_snapshot_summary_returns_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.get("/api/projects/999/review-analytics/snapshots")

    assert response.status_code == 404


def test_review_analytics_cleanup_events_returns_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.get("/api/projects/999/review-analytics/snapshots/cleanup-events")

    assert response.status_code == 404


def test_review_relationship_suggestion_returns_ok_and_persists_review(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Graph Project", settings={})
        session.add(project)
        session.flush()
        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
        )
        session.add(dataset)
        session.flush()
        sheet = Sheet(
            dataset_id=dataset.id,
            name="orders",
            normalized_name="orders",
            row_count=2,
            column_count=1,
            duckdb_table_name="orders",
        )
        session.add(sheet)
        session.flush()
        source = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1"],
            key_candidate_score=0.9,
        )
        session.add(source)
        session.flush()
        suggestion = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=None,
            relationship_type="derived_dimension",
            confidence=0.82,
            evidence_summary="Repeated values.",
            evidence_payload={},
            decision_status="pending",
        )
        session.add(suggestion)
        session.flush()
        source_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target_node = GraphNode(
            project_id=project.id,
            node_type="derived_entity",
            label="customer_id values",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=100,
            position_y=0,
        )
        session.add_all([source_node, target_node])
        session.flush()
        edge = GraphEdge(
            project_id=project.id,
            source_node_id=source_node.id,
            target_node_id=target_node.id,
            edge_type="derived_dimension",
            confidence=0.82,
            status="suggested",
            evidence_ref="suggestion:0",
            created_from_suggestion_id=suggestion.id,
        )
        session.add(edge)
        session.commit()
        suggestion_id = suggestion.id
        edge_id = edge.id

    response = client.post(
        f"/api/relationship-suggestions/{suggestion_id}/review",
        json={"decision_status": "accepted", "decision_note": "Looks right."},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    with session_factory() as session:
        updated = session.get(RelationshipSuggestion, suggestion_id)
        assert updated is not None
        assert updated.decision_status == "accepted"
        assert updated.decision_note == "Looks right."
        edge = session.get(GraphEdge, edge_id)
        assert edge is not None
        assert edge.status == "accepted"


def test_review_relationship_suggestion_accepts_modeling_edits(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Graph Project", settings={})
        session.add(project)
        session.flush()
        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
        )
        session.add(dataset)
        session.flush()
        sheet = Sheet(
            dataset_id=dataset.id,
            name="orders",
            normalized_name="orders",
            row_count=2,
            column_count=1,
            duckdb_table_name="orders",
        )
        session.add(sheet)
        session.flush()
        source = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1"],
            key_candidate_score=0.9,
        )
        target = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer Ref",
            normalized_name="customer_ref",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1"],
            key_candidate_score=0.8,
        )
        session.add_all([source, target])
        session.flush()
        suggestion = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=target.id,
            relationship_type="same_entity",
            confidence=0.82,
            evidence_summary="Repeated values.",
            evidence_payload={"sample_matches": ["c1"]},
            decision_status="pending",
        )
        session.add(suggestion)
        session.flush()
        source_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="orders.customer_ref",
            source_ref="orders.customer_ref",
            node_metadata={},
            position_x=100,
            position_y=0,
        )
        session.add_all([source_node, target_node])
        session.flush()
        edge = GraphEdge(
            project_id=project.id,
            source_node_id=source_node.id,
            target_node_id=target_node.id,
            edge_type="same_entity",
            confidence=0.82,
            status="suggested",
            evidence_ref="suggestion:0",
            edge_metadata={"evidence_payload": {"sample_matches": ["c1"]}},
            created_from_suggestion_id=suggestion.id,
        )
        session.add(edge)
        session.commit()
        suggestion_id = suggestion.id
        edge_id = edge.id

    response = client.post(
        f"/api/relationship-suggestions/{suggestion_id}/review",
        json={
            "decision_status": "edited",
            "decision_note": "Adjusted in modeling drawer.",
            "relationship_type": "foreign_key",
            "evidence_quality": "high",
        },
    )

    assert response.status_code == 200

    with session_factory() as session:
        updated = session.get(RelationshipSuggestion, suggestion_id)
        assert updated is not None
        assert updated.decision_status == "edited"
        assert updated.relationship_type == "foreign_key"
        assert updated.evidence_payload["sample_matches"] == ["c1"]
        assert updated.evidence_payload["review_evidence_quality"] == "high"
        edge = session.get(GraphEdge, edge_id)
        assert edge is not None
        assert edge.status == "edited"
        assert edge.edge_type == "foreign_key"
        assert edge.edge_metadata["evidence_payload"] == {"sample_matches": ["c1"]}
        assert edge.edge_metadata["review_evidence_quality"] == "high"


def test_project_review_relationship_suggestion_records_reviewer_attribution(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Graph Project", settings={})
        session.add(project)
        session.flush()
        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
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
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1", "c2"],
            key_candidate_score=0.9,
        )
        session.add(source)
        session.flush()
        suggestion = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=None,
            relationship_type="derived_dimension",
            confidence=0.82,
            evidence_summary="Repeated values.",
            evidence_payload={},
            decision_status="pending",
        )
        session.add(suggestion)
        session.commit()
        project_id = project.id
        suggestion_id = suggestion.id

    response = client.post(
        f"/api/projects/{project_id}/relationship-suggestions/{suggestion_id}/review",
        json={
            "decision_status": "accepted",
            "decision_note": "Reviewed during handoff.",
            "reviewed_by": "ops-reviewer",
        },
    )

    assert response.status_code == 200
    suggestions_response = client.get(f"/api/projects/{project_id}/relationship-suggestions")
    assert suggestions_response.status_code == 200
    assert suggestions_response.json()[0]["reviewed_by"] == "ops-reviewer"

    with session_factory() as session:
        updated = session.get(RelationshipSuggestion, suggestion_id)
        assert updated is not None
        assert updated.reviewed_by == "ops-reviewer"


def test_review_relationship_suggestion_maps_invalid_status_to_400(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.post(
        "/api/relationship-suggestions/1/review",
        json={"decision_status": "maybe", "decision_note": None},
    )

    assert response.status_code == 400


def test_review_relationship_suggestion_maps_missing_suggestion_to_404(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.post(
        "/api/relationship-suggestions/999/review",
        json={"decision_status": "accepted", "decision_note": None},
    )

    assert response.status_code == 404


def test_chat_returns_404_for_missing_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.post(
        "/api/projects/999/chat",
        json={"question": "What fields are in Orders?"},
    )

    assert response.status_code == 404


def test_chat_response_includes_retrieved_evidence(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Chat Evidence", settings={})
        session.add(project)
        session.flush()

        source_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Customers.id",
            source_ref="customers.id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        session.add_all([source_node, target_node])
        session.flush()
        session.add(
            GraphEdge(
                project_id=project.id,
                source_node_id=source_node.id,
                target_node_id=target_node.id,
                edge_type="foreign_key",
                confidence=0.97,
                status="suggested",
                evidence_ref="suggestion:12",
                edge_metadata={"evidence_summary": "Customer IDs overlap."},
            )
        )
        session.commit()
        project_id = project.id

    response = client.post(
        f"/api/projects/{project_id}/chat",
        json={"question": "解释 Orders.customer_id 和 Customers.id 的外键关系"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["query_plan"]["retrieval_document_count"] == len(body["retrieved_evidence"])
    assert body["retrieved_evidence"][0]["label"] == "Orders.customer_id -> Customers.id"
    assert body["retrieved_evidence"][0]["kind"] == "graph_edge"
    assert body["retrieved_evidence"][0]["source_ref"] == "suggestion:12"
    assert body["retrieved_evidence"][0]["score"] > 0
    assert "Customer IDs overlap" in body["retrieved_evidence"][0]["excerpt"]
    assert body["answer"] == body["content"]
    assert body["confidence"] == body["answer_confidence"]
    assert body["graph_actions"]
    assert body["graph_actions"][0]["type"] == "highlight_path"
    assert body["graph_actions"][0]["node_ids"] == [source_node.id, target_node.id]
    assert body["next_steps"] == [
        "查看 AI 高亮路径中的字段关系。",
        "打开证据检查器核对引用关系。",
    ]


def test_chat_accepts_selection_context_for_relationship_answers(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Chat Context", settings={})
        session.add(project)
        session.flush()

        source_node = GraphNode(
            project_id=project.id,
            node_type="table",
            label="Orders",
            source_ref="orders",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        selected_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        session.add_all([source_node, selected_node])
        session.flush()
        session.add(
            GraphEdge(
                project_id=project.id,
                source_node_id=source_node.id,
                target_node_id=selected_node.id,
                edge_type="contains_field",
                confidence=1,
                status="auto_trusted",
                evidence_ref="field:orders.customer_id",
            )
        )
        session.commit()
        project_id = project.id
        selected_node_id = selected_node.id

    response = client.post(
        f"/api/projects/{project_id}/chat",
        json={
            "question": "解释当前选中项的上下游关系",
            "selection": {"kind": "node", "id": selected_node_id},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert "Orders.customer_id 的上游有 1 个节点：Orders" in body["content"]
    assert body["query_plan"]["selection"] == {"kind": "node", "id": selected_node_id}
    assert body["highlighted_graph_path"] == [source_node.id, selected_node_id]
