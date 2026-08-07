import json
import os
import shutil
import sqlite3
import time
from collections.abc import Mapping
from dataclasses import dataclass
from ipaddress import ip_network
from pathlib import Path
from urllib.parse import urlparse

from graphmind.services.provider_policy import validate_provider_endpoint
from graphmind.storage.workspace import WorkspacePaths

LOCAL_DEV_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173"]
VALID_DEPLOYMENT_MODES = {"development", "production"}
VALID_AUTH_MODES = {"disabled", "session", "shared-token"}
VALID_IMPORT_WORKER_MODES = {"external", "in-process"}
DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60
DEFAULT_MIN_FREE_BYTES = 100 * 1024 * 1024
DEFAULT_WORKER_HEARTBEAT_MAX_AGE_SECONDS = 30
PRODUCTION_SECRET_PLACEHOLDER_PREFIXES = (
    "change-me",
    "changeme",
    "replace-me",
    "replace-with",
)


class DeploymentConfigError(RuntimeError):
    """Raised when deployment configuration is unsafe or invalid."""


@dataclass(frozen=True)
class DeploymentSettings:
    deployment_mode: str
    allowed_origins: list[str]
    trusted_hosts: list[str]
    trusted_proxy_cidrs: list[str]
    workspace_root: Path
    url_import_allowlist: list[str]
    url_import_denylist: list[str]
    ai_provider_allowlist: list[str]
    rate_limit_per_minute: int | None
    auth_mode: str
    shared_api_token: str | None
    session_secret: str | None
    admin_username: str | None
    admin_password: str | None
    session_ttl_seconds: int
    session_cookie_secure: bool
    import_worker_mode: str
    min_free_bytes: int
    worker_heartbeat_max_age_seconds: int

    @property
    def is_production(self) -> bool:
        return self.deployment_mode == "production"

    @property
    def auth_enabled(self) -> bool:
        return self.auth_mode != "disabled"

    @property
    def import_worker_in_process(self) -> bool:
        return self.import_worker_mode == "in-process"


def load_deployment_settings(
    workspace_root: Path | None = None,
    environ: Mapping[str, str] | None = None,
) -> DeploymentSettings:
    env = environ or os.environ
    deployment_mode = _deployment_mode(env)
    configured_workspace_root = env.get("GRAPHMIND_WORKSPACE_ROOT", "").strip()
    root = workspace_root or Path(configured_workspace_root or ".graphmind")
    allowed_origins = _allowed_origins(env, deployment_mode)
    trusted_hosts = _csv_values(env.get("GRAPHMIND_TRUSTED_HOSTS", ""))
    trusted_proxy_cidrs = _trusted_proxy_cidrs(env)
    url_import_allowlist = _csv_values(env.get("GRAPHMIND_URL_IMPORT_ALLOWLIST", ""))
    url_import_denylist = _csv_values(env.get("GRAPHMIND_URL_IMPORT_DENYLIST", ""))
    ai_provider_allowlist = _csv_values(env.get("GRAPHMIND_AI_PROVIDER_ALLOWLIST", ""))
    rate_limit_per_minute = _positive_int_or_none(env.get("GRAPHMIND_RATE_LIMIT_PER_MINUTE", ""))
    auth_mode = _auth_mode(env)
    shared_api_token = _shared_api_token(env, auth_mode, deployment_mode)
    session_secret = _required_when_session(
        env,
        auth_mode,
        "GRAPHMIND_SESSION_SECRET",
        deployment_mode=deployment_mode,
        production_min_length=32,
    )
    admin_username = _required_when_session(env, auth_mode, "GRAPHMIND_ADMIN_USERNAME")
    admin_password = _required_when_session(
        env,
        auth_mode,
        "GRAPHMIND_ADMIN_PASSWORD",
        deployment_mode=deployment_mode,
        production_min_length=16,
    )
    session_ttl_seconds = _positive_int_or_default(
        env.get("GRAPHMIND_SESSION_TTL_SECONDS", ""),
        DEFAULT_SESSION_TTL_SECONDS,
        "GRAPHMIND_SESSION_TTL_SECONDS",
    )
    import_worker_mode = _import_worker_mode(env)
    min_free_bytes = _positive_int_or_default(
        env.get("GRAPHMIND_MIN_FREE_BYTES", ""),
        DEFAULT_MIN_FREE_BYTES,
        "GRAPHMIND_MIN_FREE_BYTES",
    )
    worker_heartbeat_max_age_seconds = _positive_int_or_default(
        env.get("GRAPHMIND_WORKER_HEARTBEAT_MAX_AGE_SECONDS", ""),
        DEFAULT_WORKER_HEARTBEAT_MAX_AGE_SECONDS,
        "GRAPHMIND_WORKER_HEARTBEAT_MAX_AGE_SECONDS",
    )
    return DeploymentSettings(
        deployment_mode=deployment_mode,
        allowed_origins=allowed_origins,
        trusted_hosts=trusted_hosts,
        trusted_proxy_cidrs=trusted_proxy_cidrs,
        workspace_root=root,
        url_import_allowlist=url_import_allowlist,
        url_import_denylist=url_import_denylist,
        ai_provider_allowlist=ai_provider_allowlist,
        rate_limit_per_minute=rate_limit_per_minute,
        auth_mode=auth_mode,
        shared_api_token=shared_api_token,
        session_secret=session_secret,
        admin_username=admin_username,
        admin_password=admin_password,
        session_ttl_seconds=session_ttl_seconds,
        session_cookie_secure=deployment_mode == "production",
        import_worker_mode=import_worker_mode,
        min_free_bytes=min_free_bytes,
        worker_heartbeat_max_age_seconds=worker_heartbeat_max_age_seconds,
    )


def readiness_payload(
    settings: DeploymentSettings,
    paths: WorkspacePaths,
    *,
    runtime: bool = False,
) -> dict[str, object]:
    checks = {
        "cors": _cors_check(settings),
        "trusted_hosts": _trusted_hosts_check(settings),
        "workspace": _workspace_check(paths),
        "url_import_allowlist": _url_import_allowlist_check(settings),
        "ai_provider_policy": _ai_provider_policy_check(settings, paths),
        "rate_limit": _rate_limit_check(settings),
        "auth": _auth_check(settings),
        "import_worker": _import_worker_check(settings),
    }
    if runtime:
        checks["database"] = _database_check(paths)
        checks["disk"] = _disk_check(settings, paths)
        checks["import_worker"] = _runtime_import_worker_check(settings, paths)
    failed = any(check["status"] == "failed" for check in checks.values())
    return {
        "status": "not_ready" if failed else "ready",
        "deployment_mode": settings.deployment_mode,
        "checks": checks,
    }


def security_headers(settings: DeploymentSettings) -> dict[str, str]:
    headers = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cache-Control": "no-store",
    }
    if settings.is_production:
        headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return headers


def _deployment_mode(env: Mapping[str, str]) -> str:
    deployment_mode = env.get("GRAPHMIND_DEPLOYMENT_MODE", "development").strip().lower()
    if deployment_mode not in VALID_DEPLOYMENT_MODES:
        modes = ", ".join(sorted(VALID_DEPLOYMENT_MODES))
        raise DeploymentConfigError(
            f"GRAPHMIND_DEPLOYMENT_MODE must be one of: {modes}."
        )
    return deployment_mode


def _allowed_origins(
    env: Mapping[str, str],
    deployment_mode: str,
) -> list[str]:
    raw_origins = env.get("GRAPHMIND_ALLOWED_ORIGINS", "")
    origins = _csv_values(raw_origins)
    if not origins and deployment_mode == "development":
        return LOCAL_DEV_ORIGINS.copy()
    if not origins:
        raise DeploymentConfigError(
            "GRAPHMIND_ALLOWED_ORIGINS must be set when GRAPHMIND_DEPLOYMENT_MODE=production."
        )
    if deployment_mode == "production" and any(origin == "*" for origin in origins):
        raise DeploymentConfigError(
            "GRAPHMIND_ALLOWED_ORIGINS cannot use a wildcard in production."
        )
    return [_normalize_origin(origin) for origin in origins]


def _normalize_origin(origin: str) -> str:
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise DeploymentConfigError(
            "GRAPHMIND_ALLOWED_ORIGINS entries must be absolute HTTP(S) origins."
        )
    if parsed.path not in {"", "/"} or parsed.params or parsed.query or parsed.fragment:
        raise DeploymentConfigError(
            "GRAPHMIND_ALLOWED_ORIGINS entries must not include paths, query strings, or fragments."
        )
    return f"{parsed.scheme}://{parsed.netloc}"


def _csv_values(raw_value: str) -> list[str]:
    return [value.strip() for value in raw_value.split(",") if value.strip()]


def _trusted_proxy_cidrs(env: Mapping[str, str]) -> list[str]:
    cidrs = _csv_values(env.get("GRAPHMIND_TRUSTED_PROXY_CIDRS", ""))
    for cidr in cidrs:
        try:
            ip_network(cidr, strict=False)
        except ValueError as exc:
            raise DeploymentConfigError(
                "GRAPHMIND_TRUSTED_PROXY_CIDRS entries must be valid IP networks."
            ) from exc
    return cidrs


def _positive_int_or_none(raw_value: str) -> int | None:
    stripped = raw_value.strip()
    if not stripped:
        return None
    try:
        parsed = int(stripped)
    except ValueError as exc:
        raise DeploymentConfigError(
            "GRAPHMIND_RATE_LIMIT_PER_MINUTE must be a positive integer."
        ) from exc
    if parsed <= 0:
        raise DeploymentConfigError("GRAPHMIND_RATE_LIMIT_PER_MINUTE must be a positive integer.")
    return parsed


def _positive_int_or_default(raw_value: str, default: int, env_name: str) -> int:
    stripped = raw_value.strip()
    if not stripped:
        return default
    try:
        parsed = int(stripped)
    except ValueError as exc:
        raise DeploymentConfigError(f"{env_name} must be a positive integer.") from exc
    if parsed <= 0:
        raise DeploymentConfigError(f"{env_name} must be a positive integer.")
    return parsed


def _auth_mode(env: Mapping[str, str]) -> str:
    auth_mode = env.get("GRAPHMIND_AUTH_MODE", "disabled").strip().lower()
    if auth_mode not in VALID_AUTH_MODES:
        modes = ", ".join(sorted(VALID_AUTH_MODES))
        raise DeploymentConfigError(f"GRAPHMIND_AUTH_MODE must be one of: {modes}.")
    return auth_mode


def _import_worker_mode(env: Mapping[str, str]) -> str:
    import_worker_mode = env.get("GRAPHMIND_IMPORT_WORKER_MODE", "in-process").strip().lower()
    if import_worker_mode not in VALID_IMPORT_WORKER_MODES:
        modes = ", ".join(sorted(VALID_IMPORT_WORKER_MODES))
        raise DeploymentConfigError(
            f"GRAPHMIND_IMPORT_WORKER_MODE must be one of: {modes}."
        )
    return import_worker_mode


def _shared_api_token(
    env: Mapping[str, str], auth_mode: str, deployment_mode: str
) -> str | None:
    token = env.get("GRAPHMIND_SHARED_API_TOKEN", "").strip()
    if auth_mode == "shared-token" and not token:
        raise DeploymentConfigError(
            "GRAPHMIND_SHARED_API_TOKEN must be set when GRAPHMIND_AUTH_MODE=shared-token."
        )
    if auth_mode == "shared-token":
        _validate_production_secret(
            token,
            env_name="GRAPHMIND_SHARED_API_TOKEN",
            deployment_mode=deployment_mode,
            min_length=32,
        )
    return token or None


def _required_when_session(
    env: Mapping[str, str],
    auth_mode: str,
    env_name: str,
    *,
    deployment_mode: str = "development",
    production_min_length: int | None = None,
) -> str | None:
    value = env.get(env_name, "").strip()
    if auth_mode == "session" and not value:
        raise DeploymentConfigError(f"{env_name} must be set when GRAPHMIND_AUTH_MODE=session.")
    if auth_mode == "session" and production_min_length is not None:
        _validate_production_secret(
            value,
            env_name=env_name,
            deployment_mode=deployment_mode,
            min_length=production_min_length,
        )
    return value or None


def _validate_production_secret(
    value: str,
    *,
    env_name: str,
    deployment_mode: str,
    min_length: int,
) -> None:
    if deployment_mode != "production":
        return
    normalized = value.strip().lower()
    if normalized.startswith(PRODUCTION_SECRET_PLACEHOLDER_PREFIXES):
        raise DeploymentConfigError(f"{env_name} must not use a documented placeholder value.")
    if len(value) < min_length:
        raise DeploymentConfigError(
            f"{env_name} must be at least {min_length} characters in production."
        )


def _cors_check(settings: DeploymentSettings) -> dict[str, str]:
    return {
        "status": "ok",
        "detail": f"{len(settings.allowed_origins)} origin(s) configured.",
    }


def _trusted_hosts_check(settings: DeploymentSettings) -> dict[str, str]:
    if settings.trusted_hosts:
        return {
            "status": "ok",
            "detail": f"{len(settings.trusted_hosts)} trusted host(s) configured.",
        }
    if settings.is_production:
        return {
            "status": "warning",
            "detail": "GRAPHMIND_TRUSTED_HOSTS is recommended for production deployments.",
        }
    return {"status": "ok", "detail": "Trusted host enforcement is optional in development."}


def _workspace_check(paths: WorkspacePaths) -> dict[str, str]:
    required_paths = [
        paths.root,
        paths.database_path.parent,
        paths.imports_dir,
        paths.import_jobs_dir,
    ]
    missing_paths = [str(path) for path in required_paths if not path.exists()]
    if missing_paths:
        return {
            "status": "failed",
            "detail": f"Workspace paths are missing: {', '.join(missing_paths)}.",
        }
    probe_path = paths.database_path.parent / ".write-probe"
    try:
        probe_path.write_text("ready", encoding="utf-8")
        probe_path.unlink()
    except OSError as exc:
        return {
            "status": "failed",
            "detail": f"Workspace is not writable at {paths.root}: {exc}.",
        }
    return {"status": "ok", "detail": f"Workspace is initialized at {paths.root}."}


def _url_import_allowlist_check(settings: DeploymentSettings) -> dict[str, str]:
    if settings.url_import_allowlist:
        return {
            "status": "ok",
            "detail": (
                f"{len(settings.url_import_allowlist)} URL import allowlist pattern(s) configured."
            ),
        }
    if settings.is_production:
        return {
            "status": "failed",
            "detail": (
                "GRAPHMIND_URL_IMPORT_ALLOWLIST must be set before exposing URL import in "
                "production."
            ),
        }
    return {
        "status": "ok",
        "detail": "URL import allowlist is optional in development.",
    }


def _ai_provider_policy_check(
    settings: DeploymentSettings,
    paths: WorkspacePaths,
) -> dict[str, str]:
    if not settings.is_production:
        return {
            "status": "ok",
            "detail": "AI provider endpoint restrictions are configurable in development.",
        }
    if not settings.ai_provider_allowlist:
        return {
            "status": "failed",
            "detail": "GRAPHMIND_AI_PROVIDER_ALLOWLIST must be set in production.",
        }
    if not paths.database_path.exists():
        return {"status": "ok", "detail": "No persisted project settings were found."}

    try:
        database_uri = f"{paths.database_path.resolve().as_uri()}?mode=ro"
        with sqlite3.connect(database_uri, uri=True, timeout=2) as connection:
            rows = connection.execute("SELECT id, settings FROM projects").fetchall()
    except (OSError, sqlite3.Error) as exc:
        return {
            "status": "failed",
            "detail": f"AI provider settings audit failed: {exc}.",
        }

    issues = []
    for project_id, raw_settings in rows:
        try:
            project_settings = json.loads(raw_settings) if isinstance(raw_settings, str) else {}
        except json.JSONDecodeError:
            issues.append(f"project {project_id} has unreadable AI settings")
            continue
        ai_settings = project_settings.get("ai") if isinstance(project_settings, dict) else {}
        if not isinstance(ai_settings, dict):
            continue
        for section_name in ("chat", "vector"):
            section = ai_settings.get(section_name)
            if not isinstance(section, dict):
                continue
            if str(section.get("api_key") or "").strip():
                issues.append(f"project {project_id} {section_name} has a persisted API key")
            base_url = str(section.get("base_url") or "").strip()
            if not base_url:
                continue
            try:
                validate_provider_endpoint(
                    base_url,
                    production=True,
                    allowlist=settings.ai_provider_allowlist,
                )
            except ValueError:
                issues.append(f"project {project_id} {section_name} has a disallowed endpoint")

    if issues:
        return {
            "status": "failed",
            "detail": "AI provider settings audit failed: " + "; ".join(issues) + ".",
        }
    return {"status": "ok", "detail": "Persisted AI provider settings satisfy policy."}


def _rate_limit_check(settings: DeploymentSettings) -> dict[str, str]:
    if settings.rate_limit_per_minute is None:
        return {"status": "warning", "detail": "API rate limit is not configured."}
    return {
        "status": "ok",
        "detail": f"API rate limit: {settings.rate_limit_per_minute} request(s) per minute.",
    }


def _auth_check(settings: DeploymentSettings) -> dict[str, str]:
    if settings.auth_mode == "disabled":
        return {"status": "warning", "detail": "API authentication is disabled."}
    return {"status": "ok", "detail": f"Authentication mode: {settings.auth_mode}."}


def _import_worker_check(settings: DeploymentSettings) -> dict[str, str]:
    if settings.import_worker_mode == "external":
        return {
            "status": "warning",
            "detail": (
                "Import worker mode is external; run graphmind.workers.import_worker "
                "against the same workspace."
            ),
        }
    return {
        "status": "ok",
        "detail": "Import jobs run in the API process.",
    }


def _database_check(paths: WorkspacePaths) -> dict[str, str]:
    try:
        with sqlite3.connect(paths.database_path, timeout=2) as connection:
            connection.execute("SELECT 1").fetchone()
    except (OSError, sqlite3.Error) as exc:
        return {"status": "failed", "detail": f"Database query failed: {exc}."}
    return {"status": "ok", "detail": "Database query succeeded."}


def _disk_check(settings: DeploymentSettings, paths: WorkspacePaths) -> dict[str, str]:
    try:
        free_bytes = shutil.disk_usage(paths.root).free
    except OSError as exc:
        return {"status": "failed", "detail": f"Disk usage check failed: {exc}."}
    if free_bytes < settings.min_free_bytes:
        return {
            "status": "failed",
            "detail": (
                f"Workspace has {free_bytes} free byte(s); "
                f"{settings.min_free_bytes} byte(s) are required."
            ),
        }
    return {"status": "ok", "detail": f"Workspace has {free_bytes} free byte(s)."}


def _runtime_import_worker_check(
    settings: DeploymentSettings,
    paths: WorkspacePaths,
) -> dict[str, str]:
    if settings.import_worker_in_process:
        return {"status": "ok", "detail": "Import jobs run in the API process."}
    heartbeat_path = paths.import_worker_heartbeat_path
    try:
        heartbeat_at = float(heartbeat_path.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return {
            "status": "failed" if settings.is_production else "warning",
            "detail": "External import worker heartbeat is missing (mode=external).",
        }
    age_seconds = max(time.time() - heartbeat_at, 0)
    if age_seconds > settings.worker_heartbeat_max_age_seconds:
        return {
            "status": "failed" if settings.is_production else "warning",
            "detail": (
                f"External import worker heartbeat is {age_seconds:.1f} second(s) old "
                "(mode=external)."
            ),
        }
    return {
        "status": "ok",
        "detail": (
            f"External import worker heartbeat is {age_seconds:.1f} second(s) old "
            "(mode=external)."
        ),
    }
