import sqlite3

import pytest
from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.api.deployment import DeploymentConfigError
from graphmind.storage.database import create_session_factory
from graphmind.storage.models import Project
from graphmind.storage.workspace import WorkspacePaths

DEPLOYMENT_ENV_VARS = [
    "GRAPHMIND_DEPLOYMENT_MODE",
    "GRAPHMIND_ALLOWED_ORIGINS",
    "GRAPHMIND_TRUSTED_HOSTS",
    "GRAPHMIND_TRUSTED_PROXY_CIDRS",
    "GRAPHMIND_URL_IMPORT_ALLOWLIST",
    "GRAPHMIND_URL_IMPORT_DENYLIST",
    "GRAPHMIND_AI_PROVIDER_ALLOWLIST",
    "GRAPHMIND_AI_CHAT_API_KEY",
    "GRAPHMIND_AI_VECTOR_API_KEY",
    "GRAPHMIND_WORKSPACE_ROOT",
    "GRAPHMIND_AUTH_MODE",
    "GRAPHMIND_SHARED_API_TOKEN",
    "GRAPHMIND_SESSION_SECRET",
    "GRAPHMIND_ADMIN_USERNAME",
    "GRAPHMIND_ADMIN_PASSWORD",
]


@pytest.fixture(autouse=True)
def clear_deployment_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for env_name in DEPLOYMENT_ENV_VARS:
        monkeypatch.delenv(env_name, raising=False)


def test_development_defaults_keep_local_cors_and_security_headers(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.get("/api/health")
    preflight = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["permissions-policy"] == "camera=(), microphone=(), geolocation=()"
    assert response.headers["cache-control"] == "no-store"
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_production_requires_explicit_allowed_origins(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")

    with pytest.raises(DeploymentConfigError, match="GRAPHMIND_ALLOWED_ORIGINS"):
        create_app(workspace_root=tmp_workspace)


def test_production_rejects_wildcard_allowed_origins(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "*")

    with pytest.raises(DeploymentConfigError, match="wildcard"):
        create_app(workspace_root=tmp_workspace)


@pytest.mark.parametrize(
    ("env_name", "value", "expected"),
    [
        (
            "GRAPHMIND_SESSION_SECRET",
            "replace-with-at-least-32-random-characters",
            "placeholder",
        ),
        ("GRAPHMIND_SESSION_SECRET", "too-short", "at least 32"),
        ("GRAPHMIND_ADMIN_PASSWORD", "change-me-now-please", "placeholder"),
        ("GRAPHMIND_ADMIN_PASSWORD", "short-password", "at least 16"),
    ],
)
def test_production_session_auth_rejects_placeholder_or_weak_credentials(
    tmp_workspace,
    monkeypatch,
    env_name,
    value,
    expected,
):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "https://graphmind.example.com")
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "session")
    monkeypatch.setenv("GRAPHMIND_SESSION_SECRET", "s" * 32)
    monkeypatch.setenv("GRAPHMIND_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("GRAPHMIND_ADMIN_PASSWORD", "p" * 16)
    monkeypatch.setenv(env_name, value)

    with pytest.raises(DeploymentConfigError, match=expected):
        create_app(workspace_root=tmp_workspace)


def test_production_shared_token_requires_strong_non_placeholder_token(
    tmp_workspace,
    monkeypatch,
):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "https://graphmind.example.com")
    monkeypatch.setenv("GRAPHMIND_AUTH_MODE", "shared-token")
    monkeypatch.setenv("GRAPHMIND_SHARED_API_TOKEN", "replace-with-a-shared-token-value")

    with pytest.raises(DeploymentConfigError, match="placeholder"):
        create_app(workspace_root=tmp_workspace)


def test_production_cors_allows_configured_origin_only(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "https://graphmind.example.com")
    monkeypatch.setenv("GRAPHMIND_URL_IMPORT_ALLOWLIST", "docs.example.com")
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    allowed_preflight = client.options(
        "/api/health",
        headers={
            "Origin": "https://graphmind.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    blocked_preflight = client.options(
        "/api/health",
        headers={
            "Origin": "https://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert allowed_preflight.status_code == 200
    assert (
        allowed_preflight.headers["access-control-allow-origin"]
        == "https://graphmind.example.com"
    )
    assert "access-control-allow-origin" not in blocked_preflight.headers


def test_readiness_blocks_production_url_import_without_allowlist(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "https://graphmind.example.com")
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)

    response = client.get("/api/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "not_ready"
    assert body["deployment_mode"] == "production"
    assert body["checks"]["url_import_allowlist"]["status"] == "failed"
    assert "GRAPHMIND_URL_IMPORT_ALLOWLIST" in body["checks"]["url_import_allowlist"]["detail"]


def test_readiness_accepts_hardened_production_config(tmp_workspace, monkeypatch):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "https://graphmind.example.com")
    monkeypatch.setenv("GRAPHMIND_TRUSTED_HOSTS", "graphmind.example.com")
    monkeypatch.setenv("GRAPHMIND_URL_IMPORT_ALLOWLIST", "docs.example.com,*.trusted.example.com")
    monkeypatch.setenv("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "api.openai.com")
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app, headers={"host": "graphmind.example.com"})

    response = client.get("/api/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["cors"]["status"] == "ok"
    assert body["checks"]["trusted_hosts"]["status"] == "ok"
    assert body["checks"]["workspace"]["status"] == "ok"
    assert body["checks"]["url_import_allowlist"]["status"] == "ok"
    assert body["checks"]["ai_provider_policy"]["status"] == "ok"


def test_readiness_fails_for_plaintext_ai_key_without_mutating_project_settings(
    tmp_workspace,
    monkeypatch,
):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "https://graphmind.example.com")
    monkeypatch.setenv("GRAPHMIND_URL_IMPORT_ALLOWLIST", "docs.example.com")
    monkeypatch.setenv("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "api.example.com")
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    session_factory = create_session_factory(WorkspacePaths(tmp_workspace).database_path)

    with session_factory() as session:
        project = Project(
            name="Legacy AI Key",
            settings={
                "ai": {
                    "chat": {
                        "provider": "openai-compatible",
                        "model": "gpt-test",
                        "base_url": "https://api.example.com/v1",
                        "api_key": "persisted-plaintext-key",
                    }
                }
            },
        )
        session.add(project)
        session.commit()
        project_id = project.id

    response = client.get("/api/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["ai_provider_policy"]["status"] == "failed"
    assert "persisted API key" in response.json()["checks"]["ai_provider_policy"]["detail"]
    with session_factory() as session:
        project = session.get(Project, project_id)
        assert project is not None
        assert project.settings["ai"]["chat"]["api_key"] == "persisted-plaintext-key"


@pytest.mark.parametrize(
    "base_url",
    ["http://api.example.com/v1", "https://revoked.example.com/v1"],
)
def test_readiness_fails_for_persisted_ai_endpoint_outside_production_policy(
    tmp_workspace,
    monkeypatch,
    base_url,
):
    monkeypatch.setenv("GRAPHMIND_DEPLOYMENT_MODE", "production")
    monkeypatch.setenv("GRAPHMIND_ALLOWED_ORIGINS", "https://graphmind.example.com")
    monkeypatch.setenv("GRAPHMIND_URL_IMPORT_ALLOWLIST", "docs.example.com")
    monkeypatch.setenv("GRAPHMIND_AI_PROVIDER_ALLOWLIST", "api.example.com")
    client = TestClient(create_app(workspace_root=tmp_workspace))
    session_factory = create_session_factory(WorkspacePaths(tmp_workspace).database_path)

    with session_factory() as session:
        session.add(
            Project(
                name="Legacy AI Endpoint",
                settings={
                    "ai": {
                        "chat": {
                            "provider": "openai-compatible",
                            "model": "gpt-test",
                            "base_url": base_url,
                            "api_key": "",
                        }
                    }
                },
            )
        )
        session.commit()

    response = client.get("/api/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["ai_provider_policy"]["status"] == "failed"
    assert "disallowed endpoint" in response.json()["checks"]["ai_provider_policy"]["detail"]


def test_runtime_readiness_fails_when_database_query_fails(tmp_workspace, monkeypatch):
    client = TestClient(create_app(workspace_root=tmp_workspace))

    def fail_connect(*_args, **_kwargs):
        raise sqlite3.OperationalError("database unavailable")

    monkeypatch.setattr("graphmind.api.deployment.sqlite3.connect", fail_connect)

    response = client.get("/api/ready")

    assert response.status_code == 503
    assert response.json()["checks"]["database"] == {
        "status": "failed",
        "detail": "Database query failed: database unavailable.",
    }


def test_workspace_root_can_be_configured_from_environment(tmp_path, monkeypatch):
    configured_root = tmp_path / "configured-workspace"
    monkeypatch.setenv("GRAPHMIND_WORKSPACE_ROOT", str(configured_root))

    app = create_app()
    client = TestClient(app)

    response = client.get("/api/ready")

    assert response.status_code == 200
    assert configured_root.exists()
    assert response.json()["checks"]["workspace"]["status"] == "ok"
