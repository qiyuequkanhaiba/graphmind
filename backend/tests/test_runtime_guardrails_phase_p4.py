import re

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.api.runtime_guardrails import client_key_from_request

RUNTIME_ENV_VARS = [
    "GRAPHMIND_DEPLOYMENT_MODE",
    "GRAPHMIND_ALLOWED_ORIGINS",
    "GRAPHMIND_TRUSTED_HOSTS",
    "GRAPHMIND_TRUSTED_PROXY_CIDRS",
    "GRAPHMIND_URL_IMPORT_ALLOWLIST",
    "GRAPHMIND_URL_IMPORT_DENYLIST",
    "GRAPHMIND_WORKSPACE_ROOT",
    "GRAPHMIND_RATE_LIMIT_PER_MINUTE",
    "GRAPHMIND_AUTH_MODE",
    "GRAPHMIND_SHARED_API_TOKEN",
]


@pytest.fixture(autouse=True)
def clear_runtime_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for env_name in RUNTIME_ENV_VARS:
        monkeypatch.delenv(env_name, raising=False)


def test_api_responses_include_generated_request_id(tmp_workspace):
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.get("/api/health")

    assert response.status_code == 200
    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["x-request-id"])


def test_api_reuses_valid_inbound_request_id(tmp_workspace):
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.get("/api/health", headers={"X-Request-ID": "release-smoke-123"})

    assert response.status_code == 200
    assert response.headers["x-request-id"] == "release-smoke-123"


def test_api_sanitizes_invalid_inbound_request_id(tmp_workspace):
    client = TestClient(create_app(workspace_root=tmp_workspace))

    response = client.get("/api/health", headers={"X-Request-ID": "../../etc/passwd"})

    assert response.status_code == 200
    assert response.headers["x-request-id"] != "../../etc/passwd"
    assert re.fullmatch(r"[0-9a-f]{32}", response.headers["x-request-id"])


def test_rate_limit_blocks_excess_non_health_requests(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_RATE_LIMIT_PER_MINUTE", "2")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    first = client.post("/api/projects", json={"name": "One"})
    second = client.post("/api/projects", json={"name": "Two"})
    third = client.post("/api/projects", json={"name": "Three"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 429
    assert third.headers["retry-after"] == "60"
    assert third.headers["x-ratelimit-limit"] == "2"
    assert third.headers["x-ratelimit-remaining"] == "0"
    assert third.json()["detail"]["code"] == "RATE_LIMIT_EXCEEDED"
    assert "x-request-id" in third.headers


def test_rate_limit_does_not_count_health_or_ready(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_RATE_LIMIT_PER_MINUTE", "1")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    for _ in range(3):
        assert client.get("/api/health").status_code == 200
        assert client.get("/api/ready").status_code == 200

    first = client.post("/api/projects", json={"name": "One"})
    second = client.post("/api/projects", json={"name": "Two"})

    assert first.status_code == 200
    assert second.status_code == 429


def test_rate_limit_ignores_forwarded_for_from_untrusted_peer(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_RATE_LIMIT_PER_MINUTE", "1")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    first = client.post(
        "/api/projects",
        json={"name": "One"},
        headers={"X-Forwarded-For": "203.0.113.1"},
    )
    second = client.post(
        "/api/projects",
        json={"name": "Two"},
        headers={"X-Forwarded-For": "203.0.113.2"},
    )

    assert first.status_code == 200
    assert second.status_code == 429


def test_rate_limit_applies_before_rejected_authentication(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_RATE_LIMIT_PER_MINUTE", "1")
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "shared-token")
    monkeypatch.setenv("GRAPHMIND_SHARED_API_TOKEN", "configured-token")
    client = TestClient(create_app(workspace_root=tmp_workspace))

    first = client.post("/api/projects", json={"name": "Denied one"})
    second = client.post("/api/projects", json={"name": "Denied two"})

    assert first.status_code == 401
    assert second.status_code == 429


def test_client_key_uses_forwarded_client_only_for_configured_proxy():
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/projects",
            "headers": [(b"x-forwarded-for", b"198.51.100.20, 172.18.0.3")],
            "client": ("172.18.0.2", 1234),
            "scheme": "http",
            "server": ("testserver", 80),
            "query_string": b"",
        }
    )

    assert client_key_from_request(request, ["172.16.0.0/12"]) == "198.51.100.20"
