import json
import logging
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from graphmind.api.auth import authenticate_request
from graphmind.api.deployment import load_deployment_settings, security_headers
from graphmind.api.routes import create_router
from graphmind.api.runtime_guardrails import (
    RATE_LIMIT_EXEMPT_PATHS,
    InMemoryRateLimiter,
    apply_rate_limit_headers,
    client_key_from_request,
    rate_limit_response,
    request_id_from_headers,
)
from graphmind.services.import_job_queue import ImportJobQueue
from graphmind.storage.database import create_session_factory, initialize_workspace_databases
from graphmind.storage.repositories import ProjectShareTokenRepository
from graphmind.storage.workspace import WorkspacePaths

ACCESS_LOGGER = logging.getLogger("graphmind.access")


def create_app(workspace_root: Path | None = None) -> FastAPI:
    deployment_settings = load_deployment_settings(workspace_root)
    root = deployment_settings.workspace_root
    paths = WorkspacePaths(root)
    paths.ensure()
    initialize_workspace_databases(paths)
    session_factory = create_session_factory(paths.database_path)
    database_engine = session_factory.kw["bind"]
    import_job_queue = ImportJobQueue(paths=paths, session_factory=session_factory)
    headers = security_headers(deployment_settings)
    rate_limiter = InMemoryRateLimiter(deployment_settings.rate_limit_per_minute)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if deployment_settings.import_worker_in_process:
            import_job_queue.recover_and_submit_pending()
        try:
            yield
        finally:
            try:
                import_job_queue.close()
            finally:
                database_engine.dispose()

    app = FastAPI(title="GraphMind API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=deployment_settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    if deployment_settings.trusted_hosts:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=deployment_settings.trusted_hosts)

    def finalize_access_response(
        request,
        response,
        *,
        request_id: str,
        limit: int | None,
        started_at: float,
        outcome: str,
        remaining: int = -1,
    ):
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        response.headers.setdefault("X-Request-ID", request_id)
        response.headers.setdefault("X-Process-Time-Ms", f"{duration_ms:.2f}")
        apply_rate_limit_headers(response, limit, remaining)
        for name, value in headers.items():
            response.headers.setdefault(name, value)
        ACCESS_LOGGER.info(
            json.dumps(
                {
                    "duration_ms": duration_ms,
                    "method": request.method,
                    "outcome": outcome,
                    "path": request.url.path,
                    "request_id": request_id,
                    "status_code": response.status_code,
                },
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return response

    @app.middleware("http")
    async def apply_runtime_guardrails(request, call_next):
        request_id = request_id_from_headers(request)
        started_at = time.perf_counter()
        limit = deployment_settings.rate_limit_per_minute
        remaining = -1
        if request.url.path not in RATE_LIMIT_EXEMPT_PATHS:
            allowed, remaining = rate_limiter.check(
                client_key_from_request(request, deployment_settings.trusted_proxy_cidrs)
            )
            if not allowed and limit is not None:
                response = rate_limit_response(request_id, limit)
                return finalize_access_response(
                    request,
                    response,
                    request_id=request_id,
                    limit=limit,
                    started_at=started_at,
                    outcome="rate_limited",
                    remaining=remaining,
                )
        with session_factory() as auth_session:
            auth_response = authenticate_request(
                request,
                deployment_settings,
                ProjectShareTokenRepository(auth_session),
            )
            if auth_response is None:
                auth_session.commit()
        if auth_response is not None:
            return finalize_access_response(
                request,
                auth_response,
                request_id=request_id,
                limit=limit,
                started_at=started_at,
                outcome="auth_denied",
                remaining=remaining,
            )
        response = await call_next(request)
        return finalize_access_response(
            request,
            response,
            request_id=request_id,
            limit=limit,
            started_at=started_at,
            outcome="ok",
            remaining=remaining,
        )

    app.state.deployment_settings = deployment_settings
    app.state.database_engine = database_engine
    app.state.workspace_paths = paths
    app.include_router(
        create_router(
            session_factory=session_factory,
            workspace_root=root,
            import_job_queue=import_job_queue,
            deployment_settings=deployment_settings,
            workspace_paths=paths,
        )
    )
    mount_static_ui(app)
    return app


def resolve_static_ui_dir() -> Path | None:
    configured = os.environ.get("GRAPHMIND_STATIC_DIR", "").strip()
    if not configured:
        return None
    static_dir = Path(configured).expanduser()
    if not static_dir.is_dir() or not (static_dir / "index.html").is_file():
        raise RuntimeError(
            "GRAPHMIND_STATIC_DIR must point to a built UI directory containing index.html: "
            f"{static_dir}"
        )
    return static_dir


def mount_static_ui(app: FastAPI) -> None:
    static_dir = resolve_static_ui_dir()
    if static_dir is None:
        return
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="ui")


app = create_app()
