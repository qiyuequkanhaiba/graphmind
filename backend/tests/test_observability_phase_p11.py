import json
import logging
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from graphmind.api.app import create_app


def _graphmind_access_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [record for record in caplog.records if record.name == "graphmind.access"]


def test_access_logs_include_request_metadata_and_process_time(tmp_workspace, caplog):
    caplog.set_level(logging.INFO, logger="graphmind.access")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.headers["x-request-id"]
    assert response.headers["x-process-time-ms"]
    assert float(response.headers["x-process-time-ms"]) >= 0

    records = _graphmind_access_records(caplog)
    assert records
    payload = json.loads(records[-1].message)
    assert payload["method"] == "GET"
    assert payload["path"] == "/api/health"
    assert payload["request_id"] == response.headers["x-request-id"]
    assert payload["status_code"] == 200
    assert payload["outcome"] == "ok"


def test_rate_limited_requests_are_logged_with_outcome(tmp_workspace, caplog, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_RATE_LIMIT_PER_MINUTE", "1")
    caplog.set_level(logging.INFO, logger="graphmind.access")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    first = client.post("/api/projects", json={"name": "One"})
    second = client.post("/api/projects", json={"name": "Two"})

    assert first.status_code == 200
    assert second.status_code == 429

    records = _graphmind_access_records(caplog)
    assert records
    payload = json.loads(records[-1].message)
    assert payload["method"] == "POST"
    assert payload["path"] == "/api/projects"
    assert payload["status_code"] == 429
    assert payload["outcome"] == "rate_limited"
    assert payload["request_id"] == second.headers["x-request-id"]


def test_app_lifespan_disposes_database_engine(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    engine = app.state.database_engine

    with patch.object(engine, "dispose", wraps=engine.dispose) as dispose:
        with TestClient(app) as client:
            assert client.get("/api/health").status_code == 200

    dispose.assert_called_once_with()
