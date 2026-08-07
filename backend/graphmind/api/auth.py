import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import UTC, datetime
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

from graphmind.api.deployment import DeploymentSettings
from graphmind.api.schemas import SessionLoginRequest, SessionLoginResponse
from graphmind.storage.repositories import ProjectShareTokenRepository

AUTH_EXEMPT_PATHS = {"/api/health", "/api/ready"}
SESSION_COOKIE_NAME = "graphmind_session"
UNSAFE_METHODS = {"DELETE", "PATCH", "POST", "PUT"}
PROJECT_METHOD_ROLES = {
    "GET": "viewer",
    "HEAD": "viewer",
    "DELETE": "editor",
    "PATCH": "editor",
    "POST": "editor",
    "PUT": "editor",
}


def authentication_response(code: str, status_code: int = 401) -> JSONResponse:
    messages = {
        "AUTH_REQUIRED": (
            "Authentication is required",
            "Send an Authorization header with a valid Bearer token.",
        ),
        "AUTH_INVALID": (
            "Authentication token is invalid",
            "Check GRAPHMIND_SHARED_API_TOKEN and retry with the configured Bearer token.",
        ),
        "CSRF_REQUIRED": (
            "CSRF token is required",
            "Retry with the X-CSRF-Token header returned by the session login endpoint.",
        ),
        "CSRF_INVALID": (
            "CSRF token is invalid",
            "Refresh the session and retry with the latest CSRF token.",
        ),
        "PROJECT_ACCESS_DENIED": (
            "Project access is denied",
            "Use a share token that belongs to this project.",
        ),
        "PROJECT_ROLE_FORBIDDEN": (
            "Project role does not allow this operation",
            "Use an editor share token or an administrator session for this operation.",
        ),
        "ADMIN_REQUIRED": (
            "Administrator access is required",
            "Use an administrator session for project sharing administration.",
        ),
    }
    message, user_action = messages[code]
    return JSONResponse(
        status_code=status_code,
        content={
            "detail": {
                "code": code,
                "message": message,
                "user_action": user_action,
                "retryable": True,
                "field_errors": {},
            }
        },
        headers={"WWW-Authenticate": "Bearer"},
    )


def login_session(
    payload: SessionLoginRequest,
    settings: DeploymentSettings,
    response: Response,
) -> SessionLoginResponse:
    if settings.auth_mode != "session":
        raise ValueError("Session authentication is not enabled")
    expected_username = settings.admin_username or ""
    expected_password = settings.admin_password or ""
    if not (
        secrets.compare_digest(payload.username, expected_username)
        and secrets.compare_digest(payload.password, expected_password)
    ):
        raise ValueError("Invalid credentials")

    now = int(time.time())
    expires_at = now + settings.session_ttl_seconds
    csrf_token = secrets.token_urlsafe(32)
    session_cookie = _encode_session(
        {
            "username": expected_username,
            "csrf_token": csrf_token,
            "expires_at": expires_at,
        },
        settings,
    )
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session_cookie,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/",
    )
    return _session_response(expected_username, csrf_token, expires_at)


def current_session(request: Request, settings: DeploymentSettings) -> SessionLoginResponse:
    if settings.auth_mode != "session":
        raise ValueError("Session authentication is not enabled")
    session_data = _decode_session(request.cookies.get(SESSION_COOKIE_NAME, ""), settings)
    if session_data is None:
        raise ValueError("Session is invalid or expired")
    return _session_response(
        str(session_data.get("username") or ""),
        str(session_data.get("csrf_token") or ""),
        int(session_data["expires_at"]),
    )


def _session_response(username: str, csrf_token: str, expires_at: int) -> SessionLoginResponse:
    return SessionLoginResponse(
        username=username,
        auth_mode="session",
        csrf_token=csrf_token,
        expires_at=datetime.fromtimestamp(expires_at, UTC).isoformat(),
    )


def authenticate_request(
    request: Request,
    settings: DeploymentSettings,
    share_token_repository: ProjectShareTokenRepository | None = None,
) -> JSONResponse | None:
    if not settings.auth_enabled or request.method == "OPTIONS":
        return None
    if request.url.path == "/api/auth/session" and request.method == "POST":
        return None
    if request.url.path in AUTH_EXEMPT_PATHS:
        return None
    if settings.auth_mode == "shared-token":
        return _authenticate_shared_token(request, settings)
    if settings.auth_mode == "session":
        return _authenticate_session(request, settings, share_token_repository)
    return authentication_response("AUTH_REQUIRED")


def _authenticate_shared_token(
    request: Request,
    settings: DeploymentSettings,
) -> JSONResponse | None:
    authorization = request.headers.get("authorization", "").strip()
    scheme, _, token = authorization.partition(" ")
    if not authorization:
        return authentication_response("AUTH_REQUIRED")
    if scheme.lower() != "bearer" or not token:
        return authentication_response("AUTH_INVALID")
    expected_token = settings.shared_api_token or ""
    if not secrets.compare_digest(token, expected_token):
        return authentication_response("AUTH_INVALID")
    return None


def _authenticate_session(
    request: Request,
    settings: DeploymentSettings,
    share_token_repository: ProjectShareTokenRepository | None,
) -> JSONResponse | None:
    bearer_token = _bearer_token_from_request(request)
    if bearer_token and bearer_token.startswith("gm_share_"):
        return _authenticate_project_share_token(request, bearer_token, share_token_repository)
    session_data = _decode_session(request.cookies.get(SESSION_COOKIE_NAME, ""), settings)
    if session_data is None:
        return authentication_response("AUTH_REQUIRED")
    request.state.graphmind_principal = {"type": "admin", "role": "admin"}
    if request.method.upper() in UNSAFE_METHODS:
        expected_csrf_token = str(session_data.get("csrf_token") or "")
        supplied_csrf_token = request.headers.get("x-csrf-token", "").strip()
        if not supplied_csrf_token:
            return authentication_response("CSRF_REQUIRED", status_code=403)
        if not secrets.compare_digest(supplied_csrf_token, expected_csrf_token):
            return authentication_response("CSRF_INVALID", status_code=403)
    return None


def _authenticate_project_share_token(
    request: Request,
    bearer_token: str,
    share_token_repository: ProjectShareTokenRepository | None,
) -> JSONResponse | None:
    if share_token_repository is None:
        return authentication_response("AUTH_INVALID")
    share_token = share_token_repository.get_active_share_token(bearer_token)
    if share_token is None:
        return authentication_response("AUTH_INVALID")
    project_id = _project_id_from_path(request.url.path)
    if project_id is None or project_id != share_token.project_id:
        return authentication_response("PROJECT_ACCESS_DENIED", status_code=403)
    if "/share-tokens" in request.url.path:
        return authentication_response("ADMIN_REQUIRED", status_code=403)
    required_role = PROJECT_METHOD_ROLES.get(request.method.upper())
    if required_role == "editor" and share_token.role != "editor":
        return authentication_response("PROJECT_ROLE_FORBIDDEN", status_code=403)
    request.state.graphmind_principal = {
        "type": "project_share",
        "project_id": share_token.project_id,
        "role": share_token.role,
        "share_token_id": share_token.id,
    }
    return None


def _bearer_token_from_request(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "").strip()
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token:
        return token
    return None


def _project_id_from_path(path: str) -> int | None:
    parts = [part for part in path.split("/") if part]
    if len(parts) < 3 or parts[0] != "api" or parts[1] != "projects":
        return None
    try:
        return int(parts[2])
    except ValueError:
        return None


def _encode_session(payload: dict[str, Any], settings: DeploymentSettings) -> str:
    raw_payload = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    encoded_payload = base64.urlsafe_b64encode(raw_payload).decode().rstrip("=")
    signature = _session_signature(encoded_payload, settings)
    return f"{encoded_payload}.{signature}"


def _decode_session(raw_cookie: str, settings: DeploymentSettings) -> dict[str, Any] | None:
    encoded_payload, separator, signature = raw_cookie.partition(".")
    if not separator or not encoded_payload or not signature:
        return None
    expected_signature = _session_signature(encoded_payload, settings)
    if not secrets.compare_digest(signature, expected_signature):
        return None
    try:
        padded_payload = encoded_payload + "=" * (-len(encoded_payload) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded_payload.encode()).decode())
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    expires_at = payload.get("expires_at")
    if not isinstance(expires_at, int) or expires_at <= int(time.time()):
        return None
    return payload


def _session_signature(encoded_payload: str, settings: DeploymentSettings) -> str:
    secret = (settings.session_secret or "").encode()
    digest = hmac.new(secret, encoded_payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")
