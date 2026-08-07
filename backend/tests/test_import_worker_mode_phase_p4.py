import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.api.deployment import DeploymentConfigError
from graphmind.storage.database import create_session_factory
from graphmind.storage.models import ImportJob
from graphmind.storage.workspace import WorkspacePaths
from graphmind.workers.import_worker import run_import_worker

WORKER_ENV_VARS = [
    "GRAPHMIND_DEPLOYMENT_MODE",
    "GRAPHMIND_ALLOWED_ORIGINS",
    "GRAPHMIND_URL_IMPORT_ALLOWLIST",
    "GRAPHMIND_IMPORT_WORKER_MODE",
    "GRAPHMIND_MIN_FREE_BYTES",
    "GRAPHMIND_WORKER_HEARTBEAT_MAX_AGE_SECONDS",
]


@pytest.fixture(autouse=True)
def clear_worker_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for env_name in WORKER_ENV_VARS:
        monkeypatch.delenv(env_name, raising=False)


def test_invalid_import_worker_mode_is_rejected(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_IMPORT_WORKER_MODE", "invalid")

    with pytest.raises(DeploymentConfigError, match="GRAPHMIND_IMPORT_WORKER_MODE"):
        create_app(workspace_root=tmp_workspace)


def test_external_import_worker_mode_queues_without_web_process_execution(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch,
):
    monkeypatch.setenv("GRAPHMIND_IMPORT_WORKER_MODE", "external")
    client = TestClient(create_app(workspace_root=tmp_workspace))
    project = client.post("/api/projects", json={"name": "Queued Import"}).json()

    with sample_csv.open("rb") as upload:
        response = client.post(
            f"/api/projects/{project['id']}/import-jobs",
            files={"file": ("customers_orders.csv", upload, "text/csv")},
        )

    assert response.status_code == 202
    job_id = response.json()["id"]
    session_factory = create_session_factory(WorkspacePaths(tmp_workspace).database_path)
    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "queued"
        assert job.progress == 0


def test_readiness_reports_external_import_worker_mode(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_IMPORT_WORKER_MODE", "external")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.get("/api/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["checks"]["import_worker"]["status"] == "warning"
    assert "external" in body["checks"]["import_worker"]["detail"]


def test_production_readiness_requires_fresh_external_worker_heartbeat(
    tmp_workspace,
    monkeypatch,
):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "https://graphmind.example.com")
    monkeypatch.setenv("GRAPHMIND_URL_IMPORT_ALLOWLIST", "docs.example.com")
    monkeypatch.setenv("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "api.openai.com")
    monkeypatch.setenv("GRAPHMIND_IMPORT_WORKER_MODE", "external")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    missing = client.get("/api/ready")
    run_import_worker(workspace_root=tmp_workspace, once=True)
    healthy = client.get("/api/ready")

    assert missing.status_code == 503
    assert missing.json()["checks"]["import_worker"]["status"] == "failed"
    assert healthy.status_code == 200
    assert healthy.json()["checks"]["import_worker"]["status"] == "ok"


def test_readiness_fails_when_workspace_free_space_is_below_budget(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_MIN_FREE_BYTES", str(10**18))
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.get("/api/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["disk"]["status"] == "failed"


def test_readiness_fails_when_workspace_disk_check_errors(tmp_workspace, monkeypatch):
    client = TestClient(create_app(workspace_root=tmp_workspace))
    monkeypatch.setattr(
        "graphmind.api.deployment.shutil.disk_usage",
        lambda _path: (_ for _ in ()).throw(OSError("disk unavailable")),
    )

    response = client.get("/api/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["disk"] == {
        "status": "failed",
        "detail": "Disk usage check failed: disk unavailable.",
    }


def test_production_readiness_rejects_stale_external_worker_heartbeat(
    tmp_workspace,
    monkeypatch,
):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "https://graphmind.example.com")
    monkeypatch.setenv("GRAPHMIND_URL_IMPORT_ALLOWLIST", "docs.example.com")
    monkeypatch.setenv("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "api.openai.com")
    monkeypatch.setenv("GRAPHMIND_IMPORT_WORKER_MODE", "external")
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    paths.import_worker_heartbeat_path.write_text(
        str(time.time() - 120),
        encoding="utf-8",
    )
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.get("/api/ready")

    assert response.status_code == 503
    worker_check = response.json()["checks"]["import_worker"]
    assert worker_check["status"] == "failed"
    assert "old" in worker_check["detail"]


def test_external_import_worker_consumes_persisted_queue_once(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch,
):
    monkeypatch.setenv("GRAPHMIND_IMPORT_WORKER_MODE", "external")
    client = TestClient(create_app(workspace_root=tmp_workspace))
    project = client.post("/api/projects", json={"name": "Worker Import"}).json()
    with sample_csv.open("rb") as upload:
        created = client.post(
            f"/api/projects/{project['id']}/import-jobs",
            files={"file": ("customers_orders.csv", upload, "text/csv")},
        )

    attempted = run_import_worker(workspace_root=tmp_workspace, once=True)

    assert attempted == 1
    session_factory = create_session_factory(WorkspacePaths(tmp_workspace).database_path)
    with session_factory() as session:
        job = session.get(ImportJob, created.json()["id"])
        assert job is not None
        assert job.status == "succeeded"
        assert job.progress == 100
