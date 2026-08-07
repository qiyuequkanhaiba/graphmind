import asyncio
import hashlib
import json
import os
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile, TemporaryDirectory
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from graphmind.api.auth import current_session, login_session
from graphmind.api.deployment import (
    DeploymentSettings,
    load_deployment_settings,
    readiness_payload,
)
from graphmind.api.router_domains import create_domain_routers
from graphmind.api.schemas import (
    AISettings,
    ApiErrorDetail,
    ChatAnswerResponse,
    ChatRequest,
    CitationResponse,
    DocumentChunkPageResponse,
    DocumentChunkResponse,
    DuplicateSuggestionGroupResponse,
    EntityMatchReviewRequest,
    EntityMatchReviewResponse,
    ExtractedEntityPageResponse,
    ExtractedEntityResponse,
    ExtractedRelationshipPageResponse,
    ExtractedRelationshipResponse,
    GraphActionResponse,
    GraphEdgeResponse,
    GraphNodeResponse,
    GraphResponse,
    ImportBatchResponse,
    ImportEventResponse,
    ImportItemResponse,
    ImportJobRecoveryResponse,
    ImportJobResponse,
    ImportResponse,
    ProjectCreateRequest,
    ProjectResponse,
    ProjectSettingsResponse,
    ProjectShareTokenCreatedResponse,
    ProjectShareTokenCreateRequest,
    ProjectShareTokenResponse,
    ProjectShareTokenRevocationResponse,
    RelationshipDuplicateCleanupResponse,
    RelationshipGovernanceSummaryResponse,
    RelationshipReviewRequest,
    RelationshipSuggestionResponse,
    RetrievedEvidenceResponse,
    ReviewAnalyticsEvidenceCoverageResponse,
    ReviewAnalyticsResponse,
    ReviewAnalyticsSLAResponse,
    ReviewAnalyticsSnapshotCleanupEventResponse,
    ReviewAnalyticsSnapshotCleanupRequest,
    ReviewAnalyticsSnapshotCleanupResponse,
    ReviewAnalyticsSnapshotResponse,
    ReviewAnalyticsSnapshotSummaryResponse,
    ReviewAnalyticsTrendResponse,
    SessionLoginRequest,
    SessionLoginResponse,
    SourceDetailResponse,
    SourceSummaryResponse,
    URLImportRequest,
    WorkspaceDeltaResponse,
    WorkspaceSnapshotResponse,
)
from graphmind.core.evidence_refs import normalize_evidence_refs
from graphmind.core.relationship_quality import assess_relationship_quality
from graphmind.services.chat_service import ChatService
from graphmind.services.evidence_retrieval import EvidenceRetrievalService
from graphmind.services.graph_service import GraphService
from graphmind.services.import_job_queue import ImportJobQueue
from graphmind.services.import_service import ImportService
from graphmind.services.project_data_service import ProjectDataService
from graphmind.services.provider_policy import (
    is_runtime_production,
    validate_runtime_provider_endpoint,
)
from graphmind.services.relationship_governance import (
    DuplicateSuggestionGroup,
    RelationshipDuplicateCleanupResult,
    RelationshipGovernanceService,
    RelationshipGovernanceSummary,
)
from graphmind.services.review_analytics_maintenance import (
    cleanup_review_analytics_snapshots as cleanup_review_analytics_snapshots_for_project,
)
from graphmind.services.review_analytics_maintenance import (
    normalize_review_analytics_retention_days,
    project_review_analytics_settings,
    review_analytics_effective_retention_days,
    summarize_review_analytics_snapshots,
)
from graphmind.storage.models import (
    DocumentChunk,
    DocumentSource,
    ExtractedEntity,
    ExtractedRelationship,
    FieldProfile,
    GraphEdge,
    GraphNode,
    ImportBatch,
    ImportItem,
    ImportJob,
    Project,
    RelationshipSuggestion,
    ReviewAnalyticsSnapshot,
    ReviewAnalyticsSnapshotCleanupAudit,
    Sheet,
)
from graphmind.storage.repositories import (
    ImportBatchRepository,
    ImportRepository,
    ProjectRepository,
    ProjectShareTokenRepository,
)
from graphmind.storage.workspace import WorkspacePaths

SuggestionDisplayLabels = dict[int, tuple[str, str | None]]

API_KEY_MASK = "********"
DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 1024 * 1024
DEFAULT_REVIEW_ANALYTICS_WINDOW_DAYS = 30
DEFAULT_REVIEW_SLA_DAYS = 3
STRUCTURED_IMPORT_SUFFIXES = {".csv", ".xlsx", ".xls", ".json"}
BATCH_IMPORT_SUFFIXES = {
    *STRUCTURED_IMPORT_SUFFIXES,
    ".md",
    ".markdown",
    ".txt",
    ".log",
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".java",
    ".go",
    ".rs",
    ".sql",
    ".sh",
    ".yaml",
    ".yml",
    ".toml",
    ".docx",
    ".pdf",
    ".zip",
}


def api_error_detail(
    *,
    code: str,
    message: str,
    user_action: str,
    retryable: bool = False,
    field_errors: dict[str, str] | None = None,
) -> dict[str, object]:
    return ApiErrorDetail(
        code=code,
        message=message,
        user_action=user_action,
        retryable=retryable,
        field_errors=field_errors or {},
    ).model_dump()


def unsupported_import_file_type_error() -> HTTPException:
    message = "Unsupported import file type"
    return HTTPException(
        status_code=400,
        detail=api_error_detail(
            code="UNSUPPORTED_IMPORT_FILE_TYPE",
            message=message,
            user_action=(
                "Upload a supported file type: CSV, XLSX, XLS, JSON, document, "
                "code, log, or archive."
            ),
            retryable=True,
            field_errors={"file": message},
        ),
    )


def _merge_ai_settings(
    current_settings: dict[str, object],
    incoming_ai: dict[str, object],
    *,
    production: bool,
) -> dict[str, object]:
    current_ai = current_settings.get("ai") if isinstance(current_settings, dict) else {}
    current_ai = current_ai if isinstance(current_ai, dict) else {}
    merged_ai = dict(incoming_ai)

    for section_name in ("chat", "vector"):
        incoming_section = merged_ai.get(section_name)
        current_section = current_ai.get(section_name)
        incoming_section = dict(incoming_section) if isinstance(incoming_section, dict) else {}
        current_section = dict(current_section) if isinstance(current_section, dict) else {}
        submitted_key = incoming_section.get("api_key")
        if production:
            if submitted_key not in {"", API_KEY_MASK}:
                raise HTTPException(
                    status_code=400,
                    detail=api_error_detail(
                        code="AI_API_KEY_ENV_REQUIRED",
                        message="AI API keys cannot be saved in production project settings",
                        user_action=(
                            "Set GRAPHMIND_AI_CHAT_API_KEY and GRAPHMIND_AI_VECTOR_API_KEY "
                            "in the production environment."
                        ),
                        retryable=False,
                        field_errors={
                            f"ai.{section_name}.api_key": (
                                "Use the corresponding GRAPHMIND_AI_*_API_KEY environment "
                                "variable."
                            )
                        },
                    ),
                )
            incoming_section["api_key"] = ""
            merged_ai[section_name] = incoming_section
            continue
        current_base_url = str(current_section.get("base_url") or "").rstrip("/")
        incoming_base_url = str(incoming_section.get("base_url") or "").rstrip("/")
        if (
            current_section.get("api_key")
            and current_base_url != incoming_base_url
            and submitted_key in {"", API_KEY_MASK}
        ):
            raise HTTPException(
                status_code=400,
                detail=api_error_detail(
                    code="AI_API_KEY_REQUIRED",
                    message="A new API key is required when the AI base URL changes",
                    user_action="Enter the API key for the new AI provider endpoint and retry.",
                    retryable=True,
                    field_errors={f"ai.{section_name}.api_key": "Enter a new API key."},
                ),
            )
        if submitted_key in {"", API_KEY_MASK}:
            incoming_section["api_key"] = current_section.get("api_key") or ""
        merged_ai[section_name] = incoming_section

    return merged_ai


def _public_ai_settings(settings: dict[str, object]) -> dict[str, object]:
    saved_ai = settings.get("ai") if isinstance(settings, dict) else {}
    redacted = _redact_ai_settings(saved_ai if isinstance(saved_ai, dict) else {})
    return AISettings.model_validate(redacted).model_dump()


def _validate_runtime_ai_provider_policy(
    incoming_ai: dict[str, object],
) -> None:
    if not is_runtime_production():
        return

    for section_name in ("chat", "vector"):
        section = incoming_ai.get(section_name)
        section = section if isinstance(section, dict) else {}
        if section.get("provider") != "openai-compatible":
            continue
        base_url = str(section.get("base_url") or "")
        try:
            validate_runtime_provider_endpoint(base_url)
        except ValueError as exc:
            if "HTTPS" in str(exc):
                raise HTTPException(
                    status_code=400,
                    detail=api_error_detail(
                        code="AI_PROVIDER_HTTPS_REQUIRED",
                        message="Production AI provider endpoints must use HTTPS",
                        user_action="Configure an HTTPS AI provider endpoint and retry.",
                        retryable=False,
                        field_errors={f"ai.{section_name}.base_url": "HTTPS is required."},
                    ),
                ) from exc
            raise HTTPException(
                status_code=400,
                detail=api_error_detail(
                    code="AI_PROVIDER_NOT_ALLOWED",
                    message="AI provider endpoint is not allowed",
                    user_action=(
                        "Add the provider host to GRAPHMIND_AI_PROVIDER_ALLOWLIST and retry."
                    ),
                    retryable=False,
                    field_errors={
                        f"ai.{section_name}.base_url": "Provider host is not allowed."
                    },
                ),
            ) from exc


def _redact_ai_settings(saved_ai: dict[str, object]) -> dict[str, object]:
    public_ai = dict(saved_ai)
    for section_name in ("chat", "vector"):
        section = public_ai.get(section_name)
        section = dict(section) if isinstance(section, dict) else {}
        section["api_key"] = API_KEY_MASK if section.get("api_key") else ""
        public_ai[section_name] = section
    return public_ai


def _merge_review_analytics_settings(incoming: dict[str, object]) -> dict[str, object]:
    return {
        "retention_days": normalize_review_analytics_retention_days(
            incoming.get("retention_days")
        ),
        "auto_cleanup_enabled": bool(incoming.get("auto_cleanup_enabled")),
    }


async def _write_limited_upload(
    file: UploadFile,
    destination: Path,
    *,
    existing_total_bytes: int = 0,
) -> int:
    uploaded_bytes = 0
    max_upload_bytes = _max_upload_bytes()
    upload_limit_label = _upload_limit_label(max_upload_bytes)
    with destination.open("wb") as temp_file:
        while chunk := await file.read(UPLOAD_CHUNK_BYTES):
            uploaded_bytes += len(chunk)
            if uploaded_bytes > max_upload_bytes:
                raise HTTPException(
                    status_code=400,
                    detail=api_error_detail(
                        code="UPLOAD_LIMIT_EXCEEDED",
                        message=f"File exceeds the {upload_limit_label} upload limit",
                        user_action=(
                            "Choose a smaller file or increase GRAPHMIND_MAX_UPLOAD_BYTES."
                        ),
                        retryable=True,
                    ),
                )
            if existing_total_bytes + uploaded_bytes > max_upload_bytes:
                raise HTTPException(
                    status_code=400,
                    detail=api_error_detail(
                        code="UPLOAD_LIMIT_EXCEEDED",
                        message=f"Batch exceeds the {upload_limit_label} upload limit",
                        user_action=(
                            "Choose smaller files or increase GRAPHMIND_MAX_UPLOAD_BYTES."
                        ),
                        retryable=True,
                    ),
                )
            temp_file.write(chunk)
    return uploaded_bytes


def _max_upload_bytes() -> int:
    raw_value = os.getenv("GRAPHMIND_MAX_UPLOAD_BYTES")
    if raw_value is None:
        return DEFAULT_MAX_UPLOAD_BYTES
    try:
        parsed = int(raw_value)
    except ValueError:
        return DEFAULT_MAX_UPLOAD_BYTES
    return parsed if parsed > 0 else DEFAULT_MAX_UPLOAD_BYTES


def _upload_limit_label(max_upload_bytes: int) -> str:
    if max_upload_bytes % (1024 * 1024) == 0:
        return f"{max_upload_bytes // (1024 * 1024)} MB"
    return f"{max_upload_bytes} byte"


def create_router(
    session_factory: Callable[[], Session],
    workspace_root: Path,
    import_job_queue: ImportJobQueue,
    deployment_settings: DeploymentSettings | None = None,
    workspace_paths: WorkspacePaths | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api")
    settings = deployment_settings or load_deployment_settings(workspace_root)
    paths = workspace_paths or WorkspacePaths(workspace_root)
    domain_routers = create_domain_routers()
    projects_router = domain_routers.projects
    imports_router = domain_routers.imports
    graph_router = domain_routers.graph
    reviews_router = domain_routers.reviews
    evidence_router = domain_routers.evidence
    ai_router = domain_routers.ai

    def get_session():
        with session_factory() as session:
            yield session

    SessionDependency = Annotated[Session, Depends(get_session)]

    @projects_router.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @projects_router.get("/ready")
    def ready(response: Response) -> dict[str, object]:
        payload = readiness_payload(settings, paths, runtime=True)
        if payload["status"] != "ready":
            response.status_code = 503
        return payload

    @projects_router.post("/auth/session", response_model=SessionLoginResponse)
    def create_session(
        payload: SessionLoginRequest,
        response: Response,
    ) -> SessionLoginResponse:
        try:
            return login_session(payload, settings, response)
        except ValueError as exc:
            detail = str(exc)
            if "not enabled" in detail:
                raise HTTPException(
                    status_code=404,
                    detail=api_error_detail(
                        code="AUTH_SESSION_DISABLED",
                        message="Session authentication is disabled",
                        user_action=(
                            "Enable GRAPHMIND_AUTH_MODE=session before using this endpoint."
                        ),
                        retryable=False,
                    ),
                ) from exc
            raise HTTPException(
                status_code=401,
                detail=api_error_detail(
                    code="AUTH_INVALID",
                    message="Authentication token is invalid",
                    user_action=(
                        "Check GRAPHMIND_ADMIN_USERNAME and GRAPHMIND_ADMIN_PASSWORD."
                    ),
                    retryable=True,
                ),
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

    @projects_router.get("/auth/session", response_model=SessionLoginResponse)
    def get_current_session(request: Request) -> SessionLoginResponse:
        try:
            return current_session(request, settings)
        except ValueError as exc:
            detail = str(exc)
            if "not enabled" in detail:
                raise HTTPException(
                    status_code=404,
                    detail=api_error_detail(
                        code="AUTH_SESSION_DISABLED",
                        message="Session authentication is disabled",
                        user_action=(
                            "Enable GRAPHMIND_AUTH_MODE=session before using this endpoint."
                        ),
                        retryable=False,
                    ),
                ) from exc
            raise HTTPException(
                status_code=401,
                detail=api_error_detail(
                    code="AUTH_REQUIRED",
                    message="Authentication is required",
                    user_action="Sign in again to create a new session.",
                    retryable=True,
                ),
            ) from exc

    @projects_router.post("/projects", response_model=ProjectResponse)
    def create_project(
        payload: ProjectCreateRequest, session: SessionDependency
    ) -> ProjectResponse:
        project = ProjectRepository(session).create_project(payload.name)
        session.commit()
        return ProjectResponse(id=project.id, name=project.name)

    @projects_router.post("/projects/default", response_model=ProjectResponse)
    def get_or_create_default_project(session: SessionDependency) -> ProjectResponse:
        project = ProjectRepository(session).get_or_create_default_project()
        session.commit()
        return ProjectResponse(id=project.id, name=project.name)

    @projects_router.post(
        "/projects/{project_id}/share-tokens",
        response_model=ProjectShareTokenCreatedResponse,
    )
    def create_project_share_token(
        project_id: int,
        payload: ProjectShareTokenCreateRequest,
        session: SessionDependency,
    ) -> ProjectShareTokenCreatedResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        try:
            share_token, plain_token = ProjectShareTokenRepository(session).create_share_token(
                project_id=project_id,
                role=payload.role,
                label=payload.label,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=api_error_detail(
                    code="PROJECT_SHARE_ROLE_INVALID",
                    message=str(exc),
                    user_action="Choose a supported project share role: viewer or editor.",
                    retryable=True,
                    field_errors={"role": str(exc)},
                ),
            ) from exc
        session.commit()
        return ProjectShareTokenCreatedResponse(
            id=share_token.id,
            project_id=share_token.project_id,
            role=share_token.role,
            label=share_token.label,
            token=plain_token,
            created_at=share_token.created_at.isoformat(),
        )

    @projects_router.get(
        "/projects/{project_id}/share-tokens",
        response_model=list[ProjectShareTokenResponse],
    )
    def list_project_share_tokens(
        project_id: int,
        session: SessionDependency,
    ) -> list[ProjectShareTokenResponse]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return [
            _project_share_token_response(share_token)
            for share_token in ProjectShareTokenRepository(session).list_share_tokens(project_id)
        ]

    @projects_router.delete(
        "/projects/{project_id}/share-tokens/{share_token_id}",
        response_model=ProjectShareTokenRevocationResponse,
    )
    def revoke_project_share_token(
        project_id: int,
        share_token_id: int,
        session: SessionDependency,
    ) -> ProjectShareTokenRevocationResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        share_token = ProjectShareTokenRepository(session).revoke_share_token(
            project_id=project_id,
            share_token_id=share_token_id,
        )
        if share_token is None:
            raise HTTPException(status_code=404, detail="Project share token not found")
        session.commit()
        return ProjectShareTokenRevocationResponse(
            id=share_token.id,
            project_id=share_token.project_id,
            revoked=share_token.revoked_at is not None,
        )

    def _project_share_token_response(share_token) -> ProjectShareTokenResponse:
        return ProjectShareTokenResponse(
            id=share_token.id,
            project_id=share_token.project_id,
            role=share_token.role,
            label=share_token.label,
            created_at=share_token.created_at.isoformat(),
            last_used_at=(
                share_token.last_used_at.isoformat()
                if share_token.last_used_at is not None
                else None
            ),
            revoked_at=(
                share_token.revoked_at.isoformat()
                if share_token.revoked_at is not None
                else None
            ),
        )

    @graph_router.get("/projects/{project_id}/graph", response_model=GraphResponse)
    def get_graph(
        project_id: int,
        session: SessionDependency,
        edge_status: str | None = None,
        edge_type: str | None = None,
    ) -> GraphResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        return _graph_response(
            project_id,
            session,
            edge_status=edge_status,
            edge_type=edge_type,
        )

    @projects_router.get(
        "/projects/{project_id}/workspace-snapshot",
        response_model=WorkspaceSnapshotResponse,
    )
    def get_workspace_snapshot(
        project_id: int,
        session: SessionDependency,
    ) -> WorkspaceSnapshotResponse:
        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        return _workspace_snapshot_response(project, project_id, session)

    @projects_router.get(
        "/projects/{project_id}/workspace-delta",
        response_model=WorkspaceDeltaResponse,
    )
    def get_workspace_delta(
        project_id: int,
        session: SessionDependency,
        since_version: str | None = None,
    ) -> WorkspaceDeltaResponse:
        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        workspace_version = _workspace_version(project_id, session)
        if since_version == workspace_version:
            return WorkspaceDeltaResponse(
                status="not_modified",
                workspace_version=workspace_version,
            )

        snapshot = _workspace_snapshot_response(project, project_id, session)
        return WorkspaceDeltaResponse(
            status="changed",
            workspace_version=snapshot.workspace_version,
            graph=snapshot.graph,
            suggestions=snapshot.suggestions,
            relationship_governance=snapshot.relationship_governance,
            review_analytics=snapshot.review_analytics,
            review_analytics_trend=snapshot.review_analytics_trend,
            review_analytics_snapshot_summary=snapshot.review_analytics_snapshot_summary,
            review_analytics_snapshot_cleanup_events=(
                snapshot.review_analytics_snapshot_cleanup_events
            ),
            import_jobs=snapshot.import_jobs,
            source_summaries=snapshot.source_summaries,
            source_details=snapshot.source_details,
            extracted_entities=snapshot.extracted_entities,
            extracted_relationships=snapshot.extracted_relationships,
            entity_match_reviews=snapshot.entity_match_reviews,
            mapping_reviews=snapshot.mapping_reviews,
        )

    def _workspace_snapshot_response(
        project: Project,
        project_id: int,
        session: Session,
    ) -> WorkspaceSnapshotResponse:
        source_details = _source_details_response(project_id, session)
        source_chunks_by_source_id = {
            source.id: [
                _document_chunk_response(chunk)
                for chunk in (
                    session.query(DocumentChunk)
                    .filter(
                        DocumentChunk.project_id == project_id,
                        DocumentChunk.document_id == source.id,
                    )
                    .order_by(DocumentChunk.chunk_index, DocumentChunk.id)
                    .all()
                )
            ]
            for source in (
                session.query(DocumentSource)
                .filter(DocumentSource.project_id == project_id)
                .order_by(DocumentSource.title, DocumentSource.id)
                .all()
            )
        }
        try:
            relationship_governance = _relationship_governance_summary_response(
                RelationshipGovernanceService(session_factory).get_summary(project_id)
            )
        except ValueError:
            relationship_governance = None
        review_analytics = _review_analytics_response(
            project_id,
            session,
            window_days=DEFAULT_REVIEW_ANALYTICS_WINDOW_DAYS,
        )
        review_analytics_trend = _review_analytics_trend_response(
            project_id,
            session,
            window_days=DEFAULT_REVIEW_ANALYTICS_WINDOW_DAYS,
            days=14,
        )
        review_analytics_snapshot_summary = _review_analytics_snapshot_summary_response(
            project_id,
            session,
            retention_days=_review_analytics_effective_retention_days(project, None),
        )
        review_analytics_snapshot_cleanup_events = (
            _review_analytics_snapshot_cleanup_events_response(project_id, session)
        )

        return WorkspaceSnapshotResponse(
            workspace_version=_workspace_version(project_id, session),
            project=ProjectResponse(id=project.id, name=project.name),
            graph=_graph_response(project_id, session),
            suggestions=_relationship_suggestions_response(project_id, session),
            relationship_governance=relationship_governance,
            review_analytics=review_analytics,
            review_analytics_trend=review_analytics_trend,
            review_analytics_snapshot_summary=review_analytics_snapshot_summary,
            review_analytics_snapshot_cleanup_events=review_analytics_snapshot_cleanup_events,
            settings=_project_settings_response(project.settings),
            import_jobs=[
                _import_job_response(job)
                for job in ImportRepository(session).list_import_jobs(project_id)
            ],
            source_summaries=_source_summaries_response(project_id, session),
            source_details=source_details,
            source_chunks_by_source_id=source_chunks_by_source_id,
            extracted_entities=_extracted_entities_response(project_id, session),
            extracted_relationships=_extracted_relationships_response(project_id, session),
            entity_match_reviews=_entity_match_reviews_response(
                project_id,
                session,
                edge_type="matches_entity",
            ),
            mapping_reviews=_entity_match_reviews_response(
                project_id,
                session,
                edge_type="documented_mapping",
            ),
        )

    @projects_router.get("/projects/{project_id}/settings", response_model=ProjectSettingsResponse)
    def get_project_settings(
        project_id: int, session: SessionDependency
    ) -> ProjectSettingsResponse:
        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        return _project_settings_response(project.settings)

    @projects_router.put("/projects/{project_id}/settings", response_model=ProjectSettingsResponse)
    def update_project_settings(
        project_id: int,
        payload: ProjectSettingsResponse,
        session: SessionDependency,
        request: Request,
    ) -> ProjectSettingsResponse:
        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        current_settings = dict(project.settings or {})
        incoming_ai = payload.ai.model_dump()
        principal = getattr(request.state, "graphmind_principal", {})
        if (
            isinstance(principal, dict)
            and principal.get("type") == "project_share"
            and incoming_ai != _public_ai_settings(current_settings)
        ):
            raise HTTPException(
                status_code=403,
                detail=api_error_detail(
                    code="ADMIN_REQUIRED",
                    message="Administrator access is required",
                    user_action="Use an administrator session to change AI provider settings.",
                    retryable=False,
                ),
            )
        if not (isinstance(principal, dict) and principal.get("type") == "project_share"):
            merged_ai = _merge_ai_settings(
                current_settings,
                incoming_ai,
                production=is_runtime_production(),
            )
            _validate_runtime_ai_provider_policy(merged_ai)
            current_settings["ai"] = merged_ai
        current_settings["review_analytics"] = _merge_review_analytics_settings(
            payload.review_analytics.model_dump()
        )
        project.settings = current_settings
        session.commit()
        return _project_settings_response(project.settings)

    @ai_router.post(
        "/projects/{project_id}/vector-index/build",
        response_model=ProjectSettingsResponse,
    )
    def build_vector_index(
        project_id: int, session: SessionDependency
    ) -> ProjectSettingsResponse:
        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        current_settings = dict(project.settings or {})
        current_ai = dict(current_settings.get("ai") or {})
        current_vector = dict(current_ai.get("vector") or {})
        metadata = EvidenceRetrievalService(session_factory=session_factory).build_index_metadata(
            project_id,
            vector_settings=current_vector,
        )
        current_vector.update(metadata)
        current_ai["vector"] = current_vector
        current_settings["ai"] = current_ai
        project.settings = current_settings
        session.commit()
        return _project_settings_response(project.settings)

    def _project_settings_response(settings: dict[str, object] | None) -> ProjectSettingsResponse:
        saved_ai = (settings or {}).get("ai")
        public_ai = _redact_ai_settings(saved_ai if isinstance(saved_ai, dict) else {})
        saved_review_analytics = (settings or {}).get("review_analytics")
        public_review_analytics = _merge_review_analytics_settings(
            saved_review_analytics if isinstance(saved_review_analytics, dict) else {}
        )
        return ProjectSettingsResponse(
            ai=public_ai,
            review_analytics=public_review_analytics,
        )

    @projects_router.delete("/projects/{project_id}/data")
    def reset_project_data(project_id: int, session: SessionDependency) -> dict[str, object]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        ProjectDataService(
            paths=WorkspacePaths(workspace_root),
            session_factory=session_factory,
        ).reset_project_data(project_id)
        return {
            "graph": GraphResponse(nodes=[], edges=[]),
            "suggestions": [],
        }

    @imports_router.get(
        "/projects/{project_id}/import-jobs",
        response_model=list[ImportJobResponse],
    )
    def get_import_jobs(project_id: int, session: SessionDependency) -> list[ImportJobResponse]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        jobs = ImportRepository(session).list_import_jobs(project_id)
        return [_import_job_response(job) for job in jobs]

    @imports_router.get("/projects/{project_id}/import-events")
    def stream_import_events(
        project_id: int,
        request: Request,
        once: bool = False,
    ) -> StreamingResponse:
        with session_factory() as session:
            if session.get(Project, project_id) is None:
                raise HTTPException(status_code=404, detail="Project not found")

        async def event_stream():
            previous_payload = ""
            while not await request.is_disconnected():
                payload = _import_event_snapshot_payload(project_id)
                if payload != previous_payload:
                    previous_payload = payload
                    yield f"event: import_job_snapshot\ndata: {payload}\n\n"
                if once:
                    break
                await asyncio.sleep(2)

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    def _import_event_snapshot_payload(project_id: int) -> str:
        with session_factory() as session:
            jobs = ImportRepository(session).list_import_jobs(project_id)
            event = ImportEventResponse(
                type="import_job_snapshot",
                jobs=[_import_job_response(job) for job in jobs],
            )
            return json.dumps(event.model_dump(), separators=(",", ":"))

    @imports_router.post(
        "/projects/{project_id}/import-jobs/recover",
        response_model=ImportJobRecoveryResponse,
        status_code=202,
    )
    def recover_import_jobs(
        project_id: int,
        session: SessionDependency,
    ) -> ImportJobRecoveryResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        recovered_count = import_job_queue.recover_stale_jobs(project_id=project_id)
        submitted_count = (
            import_job_queue.submit_pending(project_id=project_id)
            if settings.import_worker_in_process
            else 0
        )
        return ImportJobRecoveryResponse(
            recovered_count=recovered_count,
            submitted_count=submitted_count,
        )

    @imports_router.get(
        "/projects/{project_id}/import-jobs/{job_id}",
        response_model=ImportJobResponse,
    )
    def get_import_job(
        project_id: int, job_id: int, session: SessionDependency
    ) -> ImportJobResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        job = ImportRepository(session).get_import_job(project_id=project_id, job_id=job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Import job not found")
        return _import_job_response(job)

    @imports_router.post(
        "/projects/{project_id}/import-jobs/{job_id}/cancel",
        response_model=ImportJobResponse,
    )
    def cancel_import_job(
        project_id: int, job_id: int, session: SessionDependency
    ) -> ImportJobResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        repository = ImportRepository(session)
        job = repository.get_import_job(project_id=project_id, job_id=job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Import job not found")
        if job.status not in {"queued", "running"}:
            raise HTTPException(
                status_code=400,
                detail="Only queued or running import jobs can be canceled",
            )

        repository.cancel_import_job(job)
        session.commit()
        return _import_job_response(job)

    @imports_router.post(
        "/projects/{project_id}/import-jobs/{job_id}/retry",
        response_model=ImportJobResponse,
        status_code=202,
    )
    def retry_import_job(
        project_id: int,
        job_id: int,
        session: SessionDependency,
        response: Response,
    ) -> ImportJobResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        service = ImportService(
            paths=WorkspacePaths(workspace_root),
            session_factory=session_factory,
        )
        try:
            service.retry_import_job(project_id=project_id, job_id=job_id)
        except ValueError as exc:
            detail = str(exc)
            if "not found" in detail:
                raise HTTPException(status_code=404, detail=detail) from exc
            raise HTTPException(status_code=400, detail=detail) from exc

        if settings.import_worker_in_process:
            import_job_queue.submit(project_id, job_id)
        job = ImportRepository(session).get_import_job(project_id=project_id, job_id=job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Import job not found")
        response.headers["Location"] = f"/api/projects/{project_id}/import-jobs/{job_id}"
        return _import_job_response(job)

    @imports_router.post(
        "/projects/{project_id}/import-jobs",
        response_model=ImportJobResponse,
        status_code=202,
    )
    async def create_import_job(
        project_id: int,
        file: UploadFile,
        session: SessionDependency,
        response: Response,
    ) -> ImportJobResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        suffix = Path(file.filename or "").suffix
        if suffix.lower() not in {".csv", ".xlsx", ".xls", ".json"}:
            raise unsupported_import_file_type_error()

        with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = Path(temp_file.name)
        try:
            await _write_limited_upload(file, temp_path)
        except HTTPException:
            temp_path.unlink(missing_ok=True)
            raise

        service = ImportService(
            paths=WorkspacePaths(workspace_root),
            session_factory=session_factory,
        )
        try:
            job_id = await asyncio.to_thread(
                service.create_import_job,
                project_id=project_id,
                file_path=temp_path,
                display_filename=file.filename or f"import{suffix}",
            )
        except ValueError as exc:
            temp_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if settings.import_worker_in_process:
            import_job_queue.submit(project_id, job_id)
        job = ImportRepository(session).get_import_job(project_id=project_id, job_id=job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Import job not found")
        response.headers["Location"] = f"/api/projects/{project_id}/import-jobs/{job_id}"
        return _import_job_response(job)

    def _import_job_response(job: ImportJob) -> ImportJobResponse:
        public_summary = job.summary if job.status == "succeeded" else None
        return ImportJobResponse(
            id=job.id,
            project_id=job.project_id,
            label=job.label,
            kind=job.kind,
            status=job.status,
            progress=job.progress,
            summary=public_summary,
            error=job.error_message,
            retryable=job.retryable,
            dataset_id=job.dataset_id,
            created_at=job.created_at.isoformat(),
            updated_at=job.updated_at.isoformat(),
        )

    def _import_item_response(item: ImportItem) -> ImportItemResponse:
        return ImportItemResponse(
            id=item.id,
            batch_id=item.batch_id,
            project_id=item.project_id,
            filename=item.filename,
            file_type=item.file_type,
            source_kind=item.source_kind,
            status=item.status,
            raw_data_ref=item.raw_data_ref,
            artifact_ref=item.artifact_ref,
            error=item.error_message,
            summary=item.summary,
            created_at=item.created_at.isoformat(),
            updated_at=item.updated_at.isoformat(),
        )

    def _import_batch_response(
        batch: ImportBatch,
        items: list[ImportItem],
    ) -> ImportBatchResponse:
        return ImportBatchResponse(
            id=batch.id,
            project_id=batch.project_id,
            label=batch.label,
            status=batch.status,
            progress=batch.progress,
            summary=batch.summary,
            error=batch.error_message,
            items=[_import_item_response(item) for item in items],
            created_at=batch.created_at.isoformat(),
            updated_at=batch.updated_at.isoformat(),
        )

    @imports_router.post(
        "/projects/{project_id}/import-batches",
        response_model=ImportBatchResponse,
    )
    async def import_structured_batch(
        project_id: int,
        files: list[UploadFile],
        session: SessionDependency,
        label: Annotated[str, Form()] = "Structured import batch",
    ) -> ImportBatchResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        if not files:
            raise HTTPException(status_code=400, detail="No files uploaded")

        with TemporaryDirectory() as temp_dir:
            temp_paths: list[Path] = []
            total_uploaded_bytes = 0
            for index, file in enumerate(files):
                suffix = Path(file.filename or "").suffix
                if suffix.lower() not in BATCH_IMPORT_SUFFIXES:
                    raise unsupported_import_file_type_error()
                safe_name = Path(file.filename or f"import_{index}{suffix}").name
                staged_dir = Path(temp_dir) / f"{index:04d}"
                staged_dir.mkdir()
                temp_path = staged_dir / safe_name
                total_uploaded_bytes += await _write_limited_upload(
                    file,
                    temp_path,
                    existing_total_bytes=total_uploaded_bytes,
                )
                temp_paths.append(temp_path)

            try:
                service = ImportService(
                    paths=WorkspacePaths(workspace_root),
                    session_factory=session_factory,
                )
                result = await asyncio.to_thread(
                    service.import_structured_batch,
                    project_id,
                    temp_paths,
                    label=label,
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

        repository = ImportBatchRepository(session)
        batch = repository.get_batch(project_id, result.batch_id)
        if batch is None:
            raise HTTPException(status_code=404, detail="Import batch not found")
        return _import_batch_response(batch, repository.list_items(project_id, batch.id))

    @imports_router.post(
        "/projects/{project_id}/url-imports",
        response_model=ImportBatchResponse,
    )
    def import_url_source(
        project_id: int,
        payload: URLImportRequest,
        session: SessionDependency,
    ) -> ImportBatchResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        try:
            result = ImportService(
                paths=WorkspacePaths(workspace_root),
                session_factory=session_factory,
            ).import_url(project_id, payload.url, label=payload.label or "URL source import")
        except ValueError as exc:
            detail = str(exc)
            code = (
                "URL_IMPORT_UNSAFE_NETWORK"
                if "blocked network address" in detail
                else "URL_IMPORT_FAILED"
            )
            message = (
                "URL resolves to a blocked network address"
                if code == "URL_IMPORT_UNSAFE_NETWORK"
                else detail
            )
            raise HTTPException(
                status_code=400,
                detail=api_error_detail(
                    code=code,
                    message=message,
                    user_action=(
                        "Use a public HTTP or HTTPS URL that is reachable from this machine."
                    ),
                    retryable=True,
                    field_errors={"url": message},
                ),
            ) from exc

        repository = ImportBatchRepository(session)
        batch = repository.get_batch(project_id, result.batch_id)
        if batch is None:
            raise HTTPException(status_code=404, detail="Import batch not found")
        return _import_batch_response(batch, repository.list_items(project_id, batch.id))

    @imports_router.get(
        "/projects/{project_id}/import-batches",
        response_model=list[ImportBatchResponse],
    )
    def get_import_batches(
        project_id: int,
        session: SessionDependency,
    ) -> list[ImportBatchResponse]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        repository = ImportBatchRepository(session)
        return [
            _import_batch_response(batch, repository.list_items(project_id, batch.id))
            for batch in repository.list_batches(project_id)
        ]

    @imports_router.get(
        "/projects/{project_id}/import-batches/{batch_id}",
        response_model=ImportBatchResponse,
    )
    def get_import_batch(
        project_id: int,
        batch_id: int,
        session: SessionDependency,
    ) -> ImportBatchResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        repository = ImportBatchRepository(session)
        batch = repository.get_batch(project_id, batch_id)
        if batch is None:
            raise HTTPException(status_code=404, detail="Import batch not found")
        return _import_batch_response(batch, repository.list_items(project_id, batch.id))

    @imports_router.post(
        "/projects/{project_id}/import-items/{item_id}/retry",
        response_model=ImportBatchResponse,
    )
    def retry_import_item(
        project_id: int,
        item_id: int,
        session: SessionDependency,
    ) -> ImportBatchResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        try:
            result = ImportService(
                paths=WorkspacePaths(workspace_root),
                session_factory=session_factory,
            ).retry_import_item(project_id=project_id, item_id=item_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        repository = ImportBatchRepository(session)
        batch = repository.get_batch(project_id, result.batch_id)
        if batch is None:
            raise HTTPException(status_code=404, detail="Import batch not found")
        return _import_batch_response(batch, repository.list_items(project_id, batch.id))

    @evidence_router.get(
        "/projects/{project_id}/sources",
        response_model=list[SourceSummaryResponse],
    )
    def get_source_summaries(
        project_id: int,
        session: SessionDependency,
    ) -> list[SourceSummaryResponse]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return _source_summaries_response(project_id, session)

    def _source_summaries_response(
        project_id: int,
        session: Session,
    ) -> list[SourceSummaryResponse]:
        rows = (
            session.query(ImportItem.source_kind, ImportItem.id)
            .filter(ImportItem.project_id == project_id, ImportItem.status == "succeeded")
            .all()
        )
        counts: dict[str, int] = {}
        for source_kind, _item_id in rows:
            counts[source_kind] = counts.get(source_kind, 0) + 1
        successful_dataset_jobs = (
            session.query(ImportJob.id)
            .filter(
                ImportJob.project_id == project_id,
                ImportJob.status == "succeeded",
                ImportJob.dataset_id.is_not(None),
                ImportJob.kind.in_(("file", "sample")),
            )
            .all()
        )
        if successful_dataset_jobs:
            counts["table"] = counts.get("table", 0) + len(successful_dataset_jobs)
        return [
            SourceSummaryResponse(source_kind=source_kind, count=count)
            for source_kind, count in sorted(counts.items())
        ]

    @evidence_router.get(
        "/projects/{project_id}/sources/detail",
        response_model=list[SourceDetailResponse],
    )
    def get_source_details(
        project_id: int,
        session: SessionDependency,
    ) -> list[SourceDetailResponse]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return _source_details_response(project_id, session)

    def _source_details_response(
        project_id: int,
        session: Session,
    ) -> list[SourceDetailResponse]:

        sources = (
            session.query(DocumentSource)
            .filter(DocumentSource.project_id == project_id)
            .order_by(DocumentSource.title, DocumentSource.id)
            .all()
        )
        chunks = (
            session.query(DocumentChunk)
            .filter(DocumentChunk.project_id == project_id)
            .all()
        )
        entities = (
            session.query(ExtractedEntity)
            .filter(ExtractedEntity.project_id == project_id)
            .all()
        )
        relationships = (
            session.query(ExtractedRelationship)
            .filter(ExtractedRelationship.project_id == project_id)
            .all()
        )
        return [
            _source_detail_response(source, chunks, entities, relationships)
            for source in sources
        ]

    def _workspace_version(project_id: int, session: Session) -> str:
        project = session.get(Project, project_id)
        parts: list[object] = [
            project_id,
            project.updated_at.isoformat() if project is not None else "",
        ]
        parts.extend(
            _workspace_table_signature(
                session.query(GraphNode.id, GraphNode.node_type, GraphNode.label)
                .filter(GraphNode.project_id == project_id)
                .order_by(GraphNode.id)
                .all()
            )
        )
        parts.extend(
            _workspace_table_signature(
                session.query(GraphEdge.id, GraphEdge.edge_type, GraphEdge.status)
                .filter(GraphEdge.project_id == project_id)
                .order_by(GraphEdge.id)
                .all()
            )
        )
        parts.extend(
            _workspace_table_signature(
                session.query(
                    RelationshipSuggestion.id,
                    RelationshipSuggestion.decision_status,
                    RelationshipSuggestion.relationship_type,
                    RelationshipSuggestion.updated_at,
                )
                .filter(RelationshipSuggestion.project_id == project_id)
                .order_by(RelationshipSuggestion.id)
                .all()
            )
        )
        parts.extend(
            _workspace_table_signature(
                session.query(
                    ReviewAnalyticsSnapshot.id,
                    ReviewAnalyticsSnapshot.snapshot_date,
                    ReviewAnalyticsSnapshot.generated_at,
                )
                .filter(ReviewAnalyticsSnapshot.project_id == project_id)
                .order_by(ReviewAnalyticsSnapshot.id)
                .all()
            )
        )
        parts.extend(
            _workspace_table_signature(
                session.query(
                    ReviewAnalyticsSnapshotCleanupAudit.id,
                    ReviewAnalyticsSnapshotCleanupAudit.retention_days,
                    ReviewAnalyticsSnapshotCleanupAudit.created_at,
                )
                .filter(ReviewAnalyticsSnapshotCleanupAudit.project_id == project_id)
                .order_by(ReviewAnalyticsSnapshotCleanupAudit.id)
                .all()
            )
        )
        parts.extend(
            _workspace_table_signature(
                session.query(ImportJob.id, ImportJob.status, ImportJob.updated_at)
                .filter(ImportJob.project_id == project_id)
                .order_by(ImportJob.id)
                .all()
            )
        )
        parts.extend(
            _workspace_table_signature(
                session.query(ImportBatch.id, ImportBatch.status, ImportBatch.updated_at)
                .filter(ImportBatch.project_id == project_id)
                .order_by(ImportBatch.id)
                .all()
            )
        )
        parts.extend(
            _workspace_table_signature(
                session.query(ImportItem.id, ImportItem.status, ImportItem.updated_at)
                .filter(ImportItem.project_id == project_id)
                .order_by(ImportItem.id)
                .all()
            )
        )
        parts.extend(
            _workspace_table_signature(
                session.query(DocumentSource.id, DocumentSource.title, DocumentSource.created_at)
                .filter(DocumentSource.project_id == project_id)
                .order_by(DocumentSource.id)
                .all()
            )
        )
        parts.extend(
            _workspace_table_signature(
                session.query(DocumentChunk.id, DocumentChunk.content_hash)
                .filter(DocumentChunk.project_id == project_id)
                .order_by(DocumentChunk.id)
                .all()
            )
        )
        parts.extend(
            _workspace_table_signature(
                session.query(ExtractedEntity.id, ExtractedEntity.canonical_name)
                .filter(ExtractedEntity.project_id == project_id)
                .order_by(ExtractedEntity.id)
                .all()
            )
        )
        parts.extend(
            _workspace_table_signature(
                session.query(
                    ExtractedRelationship.id,
                    ExtractedRelationship.relationship_type,
                    ExtractedRelationship.status,
                )
                .filter(ExtractedRelationship.project_id == project_id)
                .order_by(ExtractedRelationship.id)
                .all()
            )
        )
        digest = hashlib.sha256(
            json.dumps(parts, default=str, separators=(",", ":"), sort_keys=True).encode(
                "utf-8"
            )
        ).hexdigest()
        return digest[:16]

    def _workspace_table_signature(rows: list[object]) -> list[object]:
        return [len(rows), [tuple(row) for row in rows]]

    @evidence_router.get(
        "/projects/{project_id}/sources/{source_id}/chunks",
        response_model=list[DocumentChunkResponse] | DocumentChunkPageResponse,
    )
    def get_source_chunks(
        project_id: int,
        source_id: int,
        session: SessionDependency,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[DocumentChunkResponse] | DocumentChunkPageResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        source = (
            session.query(DocumentSource)
            .filter(DocumentSource.project_id == project_id, DocumentSource.id == source_id)
            .first()
        )
        if source is None:
            raise HTTPException(status_code=404, detail="Source not found")

        chunks = (
            session.query(DocumentChunk)
            .filter(DocumentChunk.project_id == project_id, DocumentChunk.document_id == source_id)
            .order_by(DocumentChunk.chunk_index, DocumentChunk.id)
            .all()
        )
        chunk_responses = [_document_chunk_response(chunk) for chunk in chunks]
        if limit is None and offset is None:
            return chunk_responses
        return _document_chunk_page_response(chunk_responses, limit=limit, offset=offset)

    @evidence_router.get(
        "/projects/{project_id}/entities",
        response_model=list[ExtractedEntityResponse] | ExtractedEntityPageResponse,
    )
    def get_extracted_entities(
        project_id: int,
        session: SessionDependency,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[ExtractedEntityResponse] | ExtractedEntityPageResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        entities = _extracted_entities_response(project_id, session)
        if limit is None and offset is None:
            return entities
        return _extracted_entity_page_response(entities, limit=limit, offset=offset)

    def _extracted_entities_response(
        project_id: int,
        session: Session,
    ) -> list[ExtractedEntityResponse]:
        entities = (
            session.query(ExtractedEntity)
            .filter(ExtractedEntity.project_id == project_id)
            .order_by(ExtractedEntity.entity_type, ExtractedEntity.canonical_name)
            .all()
        )
        return [_extracted_entity_response(entity) for entity in entities]

    @evidence_router.get(
        "/projects/{project_id}/extracted-relationships",
        response_model=list[ExtractedRelationshipResponse] | ExtractedRelationshipPageResponse,
    )
    def get_extracted_relationships(
        project_id: int,
        session: SessionDependency,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[ExtractedRelationshipResponse] | ExtractedRelationshipPageResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        relationships = _extracted_relationships_response(project_id, session)
        if limit is None and offset is None:
            return relationships
        return _extracted_relationship_page_response(
            relationships,
            limit=limit,
            offset=offset,
        )

    def _extracted_relationships_response(
        project_id: int,
        session: Session,
    ) -> list[ExtractedRelationshipResponse]:
        relationships = (
            session.query(ExtractedRelationship)
            .filter(ExtractedRelationship.project_id == project_id)
            .order_by(ExtractedRelationship.relationship_type, ExtractedRelationship.id)
            .all()
        )
        entity_ids = {
            entity_id
            for relationship in relationships
            for entity_id in (relationship.source_entity_id, relationship.target_entity_id)
        }
        entities = (
            {
                entity.id: entity
                for entity in session.query(ExtractedEntity)
                .filter(
                    ExtractedEntity.project_id == project_id,
                    ExtractedEntity.id.in_(entity_ids),
                )
                .all()
            }
            if entity_ids
            else {}
        )
        return [
            _extracted_relationship_response(relationship, entities)
            for relationship in relationships
            if relationship.source_entity_id in entities
            and relationship.target_entity_id in entities
        ]

    @reviews_router.get(
        "/projects/{project_id}/entity-matches",
        response_model=list[EntityMatchReviewResponse],
    )
    def get_entity_matches(
        project_id: int,
        session: SessionDependency,
    ) -> list[EntityMatchReviewResponse]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return _entity_match_reviews_response(project_id, session, edge_type="matches_entity")

    def _entity_match_reviews_response(
        project_id: int,
        session: Session,
        *,
        edge_type: str,
    ) -> list[EntityMatchReviewResponse]:
        edges = (
            session.query(GraphEdge)
            .filter(GraphEdge.project_id == project_id, GraphEdge.edge_type == edge_type)
            .order_by(GraphEdge.status.desc(), GraphEdge.confidence.desc(), GraphEdge.id)
            .all()
        )
        return [
            _entity_match_review_response(edge, session)
            for edge in edges
            if session.get(GraphNode, edge.source_node_id) is not None
            and session.get(GraphNode, edge.target_node_id) is not None
        ]

    @reviews_router.post(
        "/entity-matches/{edge_id}/review",
        response_model=EntityMatchReviewResponse,
    )
    def review_entity_match(
        edge_id: int,
        payload: EntityMatchReviewRequest,
        session: SessionDependency,
    ) -> EntityMatchReviewResponse:
        return _review_entity_match(edge_id, payload, session, project_id=None)

    @reviews_router.post(
        "/projects/{project_id}/entity-matches/{edge_id}/review",
        response_model=EntityMatchReviewResponse,
    )
    def review_project_entity_match(
        project_id: int,
        edge_id: int,
        payload: EntityMatchReviewRequest,
        session: SessionDependency,
    ) -> EntityMatchReviewResponse:
        return _review_entity_match(edge_id, payload, session, project_id=project_id)

    def _review_entity_match(
        edge_id: int,
        payload: EntityMatchReviewRequest,
        session: Session,
        *,
        project_id: int | None,
    ) -> EntityMatchReviewResponse:
        if payload.decision_status not in {"accepted", "rejected", "suggested"}:
            raise HTTPException(status_code=400, detail="Unsupported entity match decision")
        edge = session.get(GraphEdge, edge_id)
        if (
            edge is None
            or edge.edge_type != "matches_entity"
            or (project_id is not None and edge.project_id != project_id)
        ):
            raise HTTPException(status_code=404, detail="Entity match not found")

        edge.status = payload.decision_status
        session.commit()
        return _entity_match_review_response(edge, session)

    @reviews_router.get(
        "/projects/{project_id}/mapping-reviews",
        response_model=list[EntityMatchReviewResponse],
    )
    def get_mapping_reviews(
        project_id: int,
        session: SessionDependency,
    ) -> list[EntityMatchReviewResponse]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return _entity_match_reviews_response(project_id, session, edge_type="documented_mapping")

    @reviews_router.post(
        "/mapping-reviews/{edge_id}/review",
        response_model=EntityMatchReviewResponse,
    )
    def review_mapping(
        edge_id: int,
        payload: EntityMatchReviewRequest,
        session: SessionDependency,
    ) -> EntityMatchReviewResponse:
        return _review_mapping(edge_id, payload, session, project_id=None)

    @reviews_router.post(
        "/projects/{project_id}/mapping-reviews/{edge_id}/review",
        response_model=EntityMatchReviewResponse,
    )
    def review_project_mapping(
        project_id: int,
        edge_id: int,
        payload: EntityMatchReviewRequest,
        session: SessionDependency,
    ) -> EntityMatchReviewResponse:
        return _review_mapping(edge_id, payload, session, project_id=project_id)

    def _review_mapping(
        edge_id: int,
        payload: EntityMatchReviewRequest,
        session: Session,
        *,
        project_id: int | None,
    ) -> EntityMatchReviewResponse:
        if payload.decision_status not in {"accepted", "rejected", "suggested"}:
            raise HTTPException(status_code=400, detail="Unsupported mapping review decision")
        edge = session.get(GraphEdge, edge_id)
        if (
            edge is None
            or edge.edge_type != "documented_mapping"
            or (project_id is not None and edge.project_id != project_id)
        ):
            raise HTTPException(status_code=404, detail="Mapping review not found")

        edge.status = payload.decision_status
        session.commit()
        return _entity_match_review_response(edge, session)

    def _source_detail_response(
        source: DocumentSource,
        chunks: list[DocumentChunk],
        entities: list[ExtractedEntity],
        relationships: list[ExtractedRelationship],
    ) -> SourceDetailResponse:
        chunk_count = sum(1 for chunk in chunks if chunk.document_id == source.id)
        entity_count = sum(
            1
            for entity in entities
            if _source_refs_include_source(entity.source_refs, source.source_ref)
        )
        relationship_count = sum(
            1
            for relationship in relationships
            if _source_refs_include_source(relationship.source_refs, source.source_ref)
        )
        return SourceDetailResponse(
            id=source.id,
            import_item_id=source.import_item_id,
            title=source.title,
            document_type=source.document_type,
            source_ref=source.source_ref,
            metadata=source.source_metadata or {},
            chunk_count=chunk_count,
            entity_count=entity_count,
            relationship_count=relationship_count,
            created_at=source.created_at.isoformat(),
        )

    def _document_chunk_response(chunk: DocumentChunk) -> DocumentChunkResponse:
        return DocumentChunkResponse(
            id=chunk.id,
            document_id=chunk.document_id,
            chunk_index=chunk.chunk_index,
            heading=chunk.heading,
            content=chunk.content,
            token_count=chunk.token_count,
            source_ref=chunk.source_ref,
            content_hash=chunk.content_hash,
            metadata=chunk.chunk_metadata or {},
            created_at=chunk.created_at.isoformat(),
        )

    def _extracted_entity_response(entity: ExtractedEntity) -> ExtractedEntityResponse:
        return ExtractedEntityResponse(
            id=entity.id,
            canonical_name=entity.canonical_name,
            entity_type=entity.entity_type,
            aliases=entity.aliases or [],
            confidence=entity.confidence,
            source_refs=entity.source_refs or [],
            metadata=entity.entity_metadata or {},
            created_at=entity.created_at.isoformat(),
        )

    def _extracted_relationship_response(
        relationship: ExtractedRelationship,
        entities: dict[int, ExtractedEntity],
    ) -> ExtractedRelationshipResponse:
        source = entities[relationship.source_entity_id]
        target = entities[relationship.target_entity_id]
        return ExtractedRelationshipResponse(
            id=relationship.id,
            source_entity_id=relationship.source_entity_id,
            target_entity_id=relationship.target_entity_id,
            source_name=source.canonical_name,
            source_type=source.entity_type,
            target_name=target.canonical_name,
            target_type=target.entity_type,
            relationship_type=relationship.relationship_type,
            confidence=relationship.confidence,
            status=relationship.status,
            evidence_summary=relationship.evidence_summary,
            evidence_payload=relationship.evidence_payload or {},
            source_refs=relationship.source_refs or [],
            created_at=relationship.created_at.isoformat(),
        )

    def _document_chunk_page_response(
        items: list[DocumentChunkResponse],
        *,
        limit: int | None,
        offset: int | None,
    ) -> DocumentChunkPageResponse:
        page_items, total, normalized_limit, normalized_offset = _page_items(
            items,
            limit=limit,
            offset=offset,
        )
        return DocumentChunkPageResponse(
            items=page_items,
            total=total,
            limit=normalized_limit,
            offset=normalized_offset,
            has_more=normalized_offset + normalized_limit < total,
        )

    def _extracted_entity_page_response(
        items: list[ExtractedEntityResponse],
        *,
        limit: int | None,
        offset: int | None,
    ) -> ExtractedEntityPageResponse:
        page_items, total, normalized_limit, normalized_offset = _page_items(
            items,
            limit=limit,
            offset=offset,
        )
        return ExtractedEntityPageResponse(
            items=page_items,
            total=total,
            limit=normalized_limit,
            offset=normalized_offset,
            has_more=normalized_offset + normalized_limit < total,
        )

    def _extracted_relationship_page_response(
        items: list[ExtractedRelationshipResponse],
        *,
        limit: int | None,
        offset: int | None,
    ) -> ExtractedRelationshipPageResponse:
        page_items, total, normalized_limit, normalized_offset = _page_items(
            items,
            limit=limit,
            offset=offset,
        )
        return ExtractedRelationshipPageResponse(
            items=page_items,
            total=total,
            limit=normalized_limit,
            offset=normalized_offset,
            has_more=normalized_offset + normalized_limit < total,
        )

    def _page_items(
        items: list,
        *,
        limit: int | None,
        offset: int | None,
    ) -> tuple[list, int, int, int]:
        total = len(items)
        normalized_offset = max(0, offset or 0)
        normalized_limit = max(0, min(limit if limit is not None else total, 100))
        end = normalized_offset + normalized_limit
        return items[normalized_offset:end], total, normalized_limit, normalized_offset

    def _entity_match_review_response(
        edge: GraphEdge,
        session: Session,
    ) -> EntityMatchReviewResponse:
        source = session.get(GraphNode, edge.source_node_id)
        target = session.get(GraphNode, edge.target_node_id)
        if source is None or target is None:
            raise HTTPException(status_code=404, detail="Entity match node not found")

        metadata = edge.edge_metadata or {}
        target_metadata = target.node_metadata or {}
        source_refs = target_metadata.get("source_refs")
        if not isinstance(source_refs, list):
            source_refs = metadata.get("source_refs")
        matched_keys = metadata.get("matched_keys")
        return EntityMatchReviewResponse(
            id=edge.id,
            project_id=edge.project_id,
            source_node_id=edge.source_node_id,
            target_node_id=edge.target_node_id,
            source_label=source.label,
            source_type=source.node_type,
            target_label=target.label,
            target_type=target.node_type,
            relationship_type=edge.edge_type,
            confidence=edge.confidence,
            status=edge.status,
            evidence_ref=edge.evidence_ref,
            evidence_summary=str(metadata.get("evidence_summary") or ""),
            matched_keys=(
                [str(key) for key in matched_keys]
                if isinstance(matched_keys, list)
                else []
            ),
            source_refs=[str(ref) for ref in source_refs] if isinstance(source_refs, list) else [],
            metadata=metadata,
        )

    def _source_refs_include_source(source_refs: list[str] | None, source_ref: str) -> bool:
        return any(
            ref == source_ref
            or ref.startswith(f"{source_ref}#")
            or ref.startswith(f"{source_ref}:")
            for ref in source_refs or []
        )

    def _graph_response(
        project_id: int,
        session: Session,
        *,
        edge_status: str | None = None,
        edge_type: str | None = None,
    ) -> GraphResponse:
        raw_nodes = (
            session.query(GraphNode)
            .filter(GraphNode.project_id == project_id)
            .order_by(GraphNode.id)
            .all()
        )
        edge_query = session.query(GraphEdge).filter(GraphEdge.project_id == project_id)
        if edge_status:
            edge_query = edge_query.filter(GraphEdge.status == edge_status)
        if edge_type:
            edge_query = edge_query.filter(GraphEdge.edge_type == edge_type)
        raw_edges = edge_query.order_by(GraphEdge.id).all()
        nodes, node_id_map, node_aggregate_counts = _dedupe_graph_nodes(raw_nodes)
        edges, edge_aggregate_counts = _dedupe_graph_edges(raw_edges, node_id_map)
        suggestion_ids = {
            edge.created_from_suggestion_id
            for edge in edges
            if edge.created_from_suggestion_id is not None
        }
        suggestions_by_id = (
            {
                suggestion.id: suggestion
                for suggestion in session.query(RelationshipSuggestion)
                .filter(RelationshipSuggestion.id.in_(suggestion_ids))
                .all()
            }
            if suggestion_ids
            else {}
        )
        return GraphResponse(
            nodes=[
                GraphNodeResponse(
                    id=node_id_map[node.id],
                    node_type=node.node_type,
                    label=node.label,
                    source_ref=node.source_ref,
                    metadata=_metadata_with_aggregate_count(
                        node.node_metadata, node_aggregate_counts.get(node.id, 1)
                    ),
                    position_x=node.position_x,
                    position_y=node.position_y,
                )
                for node in nodes
            ],
            edges=[
                _graph_edge_response(
                    edge,
                    suggestions_by_id.get(edge.created_from_suggestion_id),
                    node_id_map,
                    edge_aggregate_counts.get(edge.id, 1),
                )
                for edge in edges
            ],
        )

    def _graph_edge_response(
        edge: GraphEdge,
        suggestion: RelationshipSuggestion | None,
        node_id_map: dict[int, int] | None = None,
        aggregate_count: int = 1,
    ) -> GraphEdgeResponse:
        edge_metadata = _metadata_with_aggregate_count(edge.edge_metadata or {}, aggregate_count)
        evidence_payload = (
            suggestion.evidence_payload
            if suggestion is not None
            else edge_metadata.get("evidence_payload")
        )
        if aggregate_count > 1:
            evidence_payload = {**(evidence_payload or {}), "aggregate_count": aggregate_count}
        evidence_refs = normalize_evidence_refs(
            (evidence_payload or {}).get("evidence_refs")
            if isinstance(evidence_payload, dict)
            else None,
            (evidence_payload or {}).get("source_refs")
            if isinstance(evidence_payload, dict)
            else None,
            edge_metadata.get("source_refs"),
            edge.evidence_ref,
        )
        node_id_map = node_id_map or {}
        return GraphEdgeResponse(
            id=edge.id,
            source_node_id=node_id_map.get(edge.source_node_id, edge.source_node_id),
            target_node_id=node_id_map.get(edge.target_node_id, edge.target_node_id),
            edge_type=edge.edge_type,
            confidence=edge.confidence,
            status=edge.status,
            evidence_ref=edge.evidence_ref,
            evidence_refs=evidence_refs,
            created_from_suggestion_id=edge.created_from_suggestion_id,
            metadata=edge_metadata,
            evidence_summary=(
                suggestion.evidence_summary
                if suggestion is not None
                else edge_metadata.get("evidence_summary")
            ),
            evidence_payload=evidence_payload,
        )

    def _metadata_with_aggregate_count(
        metadata: dict[str, object] | None, aggregate_count: int
    ) -> dict[str, object]:
        next_metadata = dict(metadata or {})
        if aggregate_count > 1:
            next_metadata["aggregate_count"] = aggregate_count
        return next_metadata

    def _dedupe_graph_nodes(
        nodes: list[GraphNode],
    ) -> tuple[list[GraphNode], dict[int, int], dict[int, int]]:
        unique_nodes: list[GraphNode] = []
        representative_by_key: dict[tuple[str, str], int] = {}
        node_id_map: dict[int, int] = {}
        aggregate_counts: dict[int, int] = {}
        for node in nodes:
            key = (node.node_type.casefold(), node.label.casefold())
            representative_id = representative_by_key.get(key)
            if representative_id is None:
                representative_by_key[key] = node.id
                node_id_map[node.id] = node.id
                aggregate_counts[node.id] = 1
                unique_nodes.append(node)
                continue
            node_id_map[node.id] = representative_id
            aggregate_counts[representative_id] = aggregate_counts.get(representative_id, 1) + 1
        return unique_nodes, node_id_map, aggregate_counts

    def _dedupe_graph_edges(
        edges: list[GraphEdge],
        node_id_map: dict[int, int],
    ) -> tuple[list[GraphEdge], dict[int, int]]:
        unique_edges: list[GraphEdge] = []
        representative_by_key: dict[tuple[object, ...], int] = {}
        aggregate_counts: dict[int, int] = {}
        for edge in edges:
            source_id = node_id_map.get(edge.source_node_id, edge.source_node_id)
            target_id = node_id_map.get(edge.target_node_id, edge.target_node_id)
            metadata = edge.edge_metadata if isinstance(edge.edge_metadata, dict) else {}
            evidence_summary = metadata.get("evidence_summary")
            key = (
                source_id,
                target_id,
                edge.edge_type.casefold(),
                edge.status.casefold(),
                round(edge.confidence, 6),
                " ".join(str(evidence_summary or edge.evidence_ref).casefold().split()),
            )
            representative_id = representative_by_key.get(key)
            if representative_id is not None:
                aggregate_counts[representative_id] = aggregate_counts.get(representative_id, 1) + 1
                continue
            representative_by_key[key] = edge.id
            aggregate_counts[edge.id] = 1
            unique_edges.append(edge)
        return unique_edges, aggregate_counts

    def _relationship_suggestion_response(
        suggestion: RelationshipSuggestion,
        field_labels: dict[int, str],
        display_labels: SuggestionDisplayLabels | None = None,
    ) -> RelationshipSuggestionResponse:
        quality = assess_relationship_quality(
            relationship_type=suggestion.relationship_type,
            confidence=suggestion.confidence,
            evidence_payload=suggestion.evidence_payload,
            decision_status=suggestion.decision_status,
        )
        source_label, target_label = _relationship_suggestion_display_labels(
            suggestion,
            field_labels,
            display_labels or {},
        )
        return RelationshipSuggestionResponse(
            id=suggestion.id,
            source_field_id=suggestion.source_field_id,
            target_field_id=suggestion.target_field_id,
            source_label=source_label,
            target_label=target_label,
            relationship_type=suggestion.relationship_type,
            confidence=suggestion.confidence,
            evidence_summary=suggestion.evidence_summary,
            evidence_payload=suggestion.evidence_payload,
            decision_status=suggestion.decision_status,
            reviewed_by=suggestion.reviewed_by,
            created_at=suggestion.created_at.isoformat(),
            updated_at=suggestion.updated_at.isoformat(),
            quality_label=quality.quality_label,
            review_priority=quality.review_priority,
            quality_reasons=quality.quality_reasons,
        )

    def _relationship_suggestion_display_labels(
        suggestion: RelationshipSuggestion,
        field_labels: dict[int, str],
        display_labels: SuggestionDisplayLabels,
    ) -> tuple[str, str | None]:
        labels = display_labels.get(suggestion.id)
        if labels is not None:
            return labels
        return (
            field_labels[suggestion.source_field_id],
            (
                field_labels.get(suggestion.target_field_id)
                if suggestion.target_field_id is not None
                else None
            ),
        )

    def _extracted_relationship_suggestion_labels(
        suggestions: list[RelationshipSuggestion],
        session: Session,
    ) -> SuggestionDisplayLabels:
        relationship_id_by_suggestion_id: dict[int, int] = {}
        for suggestion in suggestions:
            payload = suggestion.evidence_payload or {}
            if payload.get("source_kind") != "extracted_relationship":
                continue
            relationship_id = payload.get("extracted_relationship_id")
            if isinstance(relationship_id, int):
                relationship_id_by_suggestion_id[suggestion.id] = relationship_id

        if not relationship_id_by_suggestion_id:
            return {}

        relationships = (
            session.query(ExtractedRelationship)
            .filter(ExtractedRelationship.id.in_(relationship_id_by_suggestion_id.values()))
            .all()
        )
        entity_ids = {
            entity_id
            for relationship in relationships
            for entity_id in (relationship.source_entity_id, relationship.target_entity_id)
        }
        entities = (
            session.query(ExtractedEntity).filter(ExtractedEntity.id.in_(entity_ids)).all()
            if entity_ids
            else []
        )
        entities_by_id = {entity.id: entity for entity in entities}
        relationships_by_id = {relationship.id: relationship for relationship in relationships}

        labels: SuggestionDisplayLabels = {}
        for suggestion_id, relationship_id in relationship_id_by_suggestion_id.items():
            relationship = relationships_by_id.get(relationship_id)
            if relationship is None:
                continue
            source = entities_by_id.get(relationship.source_entity_id)
            target = entities_by_id.get(relationship.target_entity_id)
            if source is None or target is None:
                continue
            labels[suggestion_id] = (source.canonical_name, target.canonical_name)
        return labels

    @reviews_router.get(
        "/projects/{project_id}/relationship-suggestions",
        response_model=list[RelationshipSuggestionResponse],
    )
    def get_relationship_suggestions(
        project_id: int, session: SessionDependency
    ) -> list[RelationshipSuggestionResponse]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        return _relationship_suggestions_response(project_id, session)

    @reviews_router.get(
        "/projects/{project_id}/relationship-governance",
        response_model=RelationshipGovernanceSummaryResponse,
    )
    def get_relationship_governance_summary(
        project_id: int,
    ) -> RelationshipGovernanceSummaryResponse:
        try:
            summary = RelationshipGovernanceService(session_factory).get_summary(project_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return _relationship_governance_summary_response(summary)

    @reviews_router.get(
        "/projects/{project_id}/review-analytics",
        response_model=ReviewAnalyticsResponse,
    )
    def get_review_analytics(
        project_id: int,
        session: SessionDependency,
        window: str = "30d",
    ) -> ReviewAnalyticsResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        window_days = _review_analytics_window_days(window)
        return _review_analytics_response(project_id, session, window_days=window_days)

    @reviews_router.get(
        "/projects/{project_id}/review-analytics/trend",
        response_model=ReviewAnalyticsTrendResponse,
    )
    def get_review_analytics_trend(
        project_id: int,
        session: SessionDependency,
        window: str = "30d",
        days: int = 14,
    ) -> ReviewAnalyticsTrendResponse:
        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        window_days = _review_analytics_window_days(window)
        return _review_analytics_trend_response(
            project_id,
            session,
            window_days=window_days,
            days=days,
        )

    @reviews_router.post(
        "/projects/{project_id}/review-analytics/snapshots/refresh",
        response_model=ReviewAnalyticsSnapshotResponse,
    )
    def refresh_review_analytics_snapshot(
        project_id: int,
        session: SessionDependency,
        window: str = "30d",
    ) -> ReviewAnalyticsSnapshotResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        snapshot = _persist_review_analytics_snapshot(
            project_id,
            session,
            window_days=_review_analytics_window_days(window),
        )
        return ReviewAnalyticsSnapshotResponse(
            snapshot_date=snapshot.snapshot_date,
            analytics=ReviewAnalyticsResponse(**snapshot.analytics_payload),
        )

    @reviews_router.get(
        "/projects/{project_id}/review-analytics/snapshots",
        response_model=ReviewAnalyticsSnapshotSummaryResponse,
    )
    def get_review_analytics_snapshot_summary(
        project_id: int,
        session: SessionDependency,
        retention_days: int | None = None,
    ) -> ReviewAnalyticsSnapshotSummaryResponse:
        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        return _review_analytics_snapshot_summary_response(
            project_id,
            session,
            retention_days=_review_analytics_effective_retention_days(
                project,
                retention_days,
            ),
        )

    @reviews_router.get(
        "/projects/{project_id}/review-analytics/snapshots/cleanup-events",
        response_model=list[ReviewAnalyticsSnapshotCleanupEventResponse],
    )
    def get_review_analytics_snapshot_cleanup_events(
        project_id: int,
        session: SessionDependency,
    ) -> list[ReviewAnalyticsSnapshotCleanupEventResponse]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        return _review_analytics_snapshot_cleanup_events_response(project_id, session)

    @reviews_router.post(
        "/projects/{project_id}/review-analytics/snapshots/cleanup",
        response_model=ReviewAnalyticsSnapshotCleanupResponse,
    )
    def cleanup_review_analytics_snapshots(
        project_id: int,
        session: SessionDependency,
        payload: ReviewAnalyticsSnapshotCleanupRequest | None = None,
    ) -> ReviewAnalyticsSnapshotCleanupResponse:
        project = session.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        result = _cleanup_review_analytics_snapshots(
            project_id,
            session,
            retention_days=_review_analytics_effective_retention_days(
                project,
                payload.retention_days if payload is not None else None,
            ),
        )
        session.commit()
        return result

    @reviews_router.post(
        "/projects/{project_id}/relationship-governance/cleanup-duplicates",
        response_model=RelationshipDuplicateCleanupResponse,
    )
    def cleanup_duplicate_relationship_suggestions(
        project_id: int,
    ) -> RelationshipDuplicateCleanupResponse:
        try:
            result = RelationshipGovernanceService(session_factory).cleanup_duplicates(project_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return _relationship_duplicate_cleanup_response(result)

    def _relationship_suggestions_response(
        project_id: int, session: Session
    ) -> list[RelationshipSuggestionResponse]:
        suggestions = (
            session.query(RelationshipSuggestion)
            .filter(RelationshipSuggestion.project_id == project_id)
            .order_by(RelationshipSuggestion.id)
            .all()
        )
        field_ids = {
            field_id
            for suggestion in suggestions
            for field_id in (suggestion.source_field_id, suggestion.target_field_id)
            if field_id is not None
        }
        fields = (
            session.query(FieldProfile).join(Sheet).filter(FieldProfile.id.in_(field_ids)).all()
            if field_ids
            else []
        )
        field_labels = {field.id: f"{field.sheet.name}.{field.normalized_name}" for field in fields}
        display_labels = _extracted_relationship_suggestion_labels(suggestions, session)

        return [
            _relationship_suggestion_response(suggestion, field_labels, display_labels)
            for suggestion in _dedupe_relationship_suggestions(suggestions, field_labels)
        ]

    def _duplicate_suggestion_group_response(
        group: DuplicateSuggestionGroup,
    ) -> DuplicateSuggestionGroupResponse:
        return DuplicateSuggestionGroupResponse(
            canonical_suggestion_id=group.canonical_suggestion_id,
            duplicate_suggestion_ids=group.duplicate_suggestion_ids,
            source_label=group.source_label,
            target_label=group.target_label,
            relationship_type=group.relationship_type,
        )

    def _relationship_governance_summary_response(
        summary: RelationshipGovernanceSummary,
    ) -> RelationshipGovernanceSummaryResponse:
        return RelationshipGovernanceSummaryResponse(
            total_suggestion_count=summary.total_suggestion_count,
            visible_suggestion_count=summary.visible_suggestion_count,
            duplicate_suggestion_count=summary.duplicate_suggestion_count,
            duplicate_group_count=summary.duplicate_group_count,
            pending_suggestion_count=summary.pending_suggestion_count,
            accepted_suggestion_count=summary.accepted_suggestion_count,
            rejected_suggestion_count=summary.rejected_suggestion_count,
            edited_suggestion_count=summary.edited_suggestion_count,
            duplicate_groups=[
                _duplicate_suggestion_group_response(group)
                for group in summary.duplicate_groups
            ],
        )

    def _review_analytics_response(
        project_id: int,
        session: Session,
        *,
        window_days: int,
    ) -> ReviewAnalyticsResponse:
        generated_at = datetime.now(UTC)
        window_start = generated_at - timedelta(days=window_days)
        suggestions = (
            session.query(RelationshipSuggestion)
            .filter(RelationshipSuggestion.project_id == project_id)
            .order_by(RelationshipSuggestion.id)
            .all()
        )
        visible_suggestions = _dedupe_relationship_suggestions_for_analytics(suggestions)
        trend_suggestions = [
            suggestion
            for suggestion in visible_suggestions
            if suggestion.updated_at >= window_start
        ]
        pending_suggestions = [
            suggestion
            for suggestion in visible_suggestions
            if suggestion.decision_status == "pending"
        ]
        pending_ages = [
            max(0, (generated_at.date() - suggestion.created_at.date()).days)
            for suggestion in pending_suggestions
        ]
        overdue_pending_count = sum(
            1 for age_days in pending_ages if age_days > DEFAULT_REVIEW_SLA_DAYS
        )
        evidence_count = sum(
            1 for suggestion in trend_suggestions if _suggestion_has_analytics_evidence(suggestion)
        )
        trend_total = len(trend_suggestions)
        quality_distribution = {"high": 0, "medium": 0, "low": 0}
        for suggestion in trend_suggestions:
            quality = assess_relationship_quality(
                relationship_type=suggestion.relationship_type,
                confidence=suggestion.confidence,
                evidence_payload=suggestion.evidence_payload,
                decision_status=suggestion.decision_status,
            )
            quality_distribution[quality.quality_label] = (
                quality_distribution.get(quality.quality_label, 0) + 1
            )

        return ReviewAnalyticsResponse(
            window_days=window_days,
            generated_at=generated_at.isoformat(),
            sla=ReviewAnalyticsSLAResponse(
                pending_sla_days=DEFAULT_REVIEW_SLA_DAYS,
                pending_total=len(pending_suggestions),
                overdue_pending_count=overdue_pending_count,
                oldest_pending_age_days=max(pending_ages) if pending_ages else None,
            ),
            aging_buckets=_review_analytics_aging_buckets(pending_ages),
            decision_trend={
                status: sum(
                    1 for suggestion in trend_suggestions if suggestion.decision_status == status
                )
                for status in ("accepted", "edited", "pending", "rejected")
            },
            quality_distribution=quality_distribution,
            evidence_coverage=ReviewAnalyticsEvidenceCoverageResponse(
                with_evidence_count=evidence_count,
                without_evidence_count=trend_total - evidence_count,
                coverage_ratio=round(evidence_count / trend_total, 4) if trend_total else 0,
            ),
        )

    def _review_analytics_window_days(window: str) -> int:
        normalized = window.strip().lower()
        if normalized.endswith("d"):
            normalized = normalized[:-1]
        try:
            days = int(normalized)
        except ValueError:
            return DEFAULT_REVIEW_ANALYTICS_WINDOW_DAYS
        return days if days in {7, 30, 90} else DEFAULT_REVIEW_ANALYTICS_WINDOW_DAYS

    def _review_analytics_trend_days(days: int) -> int:
        return days if days in {7, 14, 30, 90} else 14

    def _review_analytics_retention_days(days: int) -> int:
        return normalize_review_analytics_retention_days(days)

    def _project_review_analytics_settings(project: Project) -> dict[str, object]:
        return project_review_analytics_settings(project)

    def _review_analytics_effective_retention_days(
        project: Project,
        requested_retention_days: int | None,
    ) -> int:
        return review_analytics_effective_retention_days(
            project,
            requested_retention_days,
        )

    def _cleanup_review_analytics_snapshots(
        project_id: int,
        session: Session,
        *,
        retention_days: int,
    ) -> ReviewAnalyticsSnapshotCleanupResponse:
        result = cleanup_review_analytics_snapshots_for_project(
            project_id,
            session,
            retention_days=retention_days,
        )
        return ReviewAnalyticsSnapshotCleanupResponse(
            retention_days=result.retention_days,
            cutoff_date=result.cutoff_date,
            removed_count=result.removed_count,
            remaining_count=result.remaining_count,
        )

    def _review_analytics_snapshot_summary_response(
        project_id: int,
        session: Session,
        *,
        retention_days: int,
    ) -> ReviewAnalyticsSnapshotSummaryResponse:
        summary = summarize_review_analytics_snapshots(
            project_id,
            session,
            retention_days=retention_days,
        )
        return ReviewAnalyticsSnapshotSummaryResponse(
            retention_days=summary.retention_days,
            snapshot_count=summary.snapshot_count,
            expired_snapshot_count=summary.expired_snapshot_count,
            oldest_snapshot_date=summary.oldest_snapshot_date,
            latest_snapshot_date=summary.latest_snapshot_date,
        )

    def _review_analytics_snapshot_cleanup_events_response(
        project_id: int,
        session: Session,
    ) -> list[ReviewAnalyticsSnapshotCleanupEventResponse]:
        events = (
            session.query(ReviewAnalyticsSnapshotCleanupAudit)
            .filter(ReviewAnalyticsSnapshotCleanupAudit.project_id == project_id)
            .order_by(
                ReviewAnalyticsSnapshotCleanupAudit.created_at.desc(),
                ReviewAnalyticsSnapshotCleanupAudit.id.desc(),
            )
            .limit(5)
            .all()
        )
        return [
            ReviewAnalyticsSnapshotCleanupEventResponse(
                id=event.id,
                project_id=event.project_id,
                retention_days=event.retention_days,
                cutoff_date=event.cutoff_date,
                removed_count=event.removed_count,
                remaining_count=event.remaining_count,
                created_at=event.created_at.isoformat(),
            )
            for event in events
        ]

    def _review_analytics_trend_response(
        project_id: int,
        session: Session,
        *,
        window_days: int,
        days: int,
    ) -> ReviewAnalyticsTrendResponse:
        trend_days = _review_analytics_trend_days(days)
        generated_at = datetime.now(UTC)
        today = generated_at.date().isoformat()
        start_date = generated_at.date() - timedelta(days=trend_days - 1)
        snapshots = (
            session.query(ReviewAnalyticsSnapshot)
            .filter(
                ReviewAnalyticsSnapshot.project_id == project_id,
                ReviewAnalyticsSnapshot.window_days == window_days,
                ReviewAnalyticsSnapshot.snapshot_date >= start_date.isoformat(),
            )
            .order_by(ReviewAnalyticsSnapshot.snapshot_date, ReviewAnalyticsSnapshot.id)
            .all()
        )
        snapshot_responses = [
            ReviewAnalyticsSnapshotResponse(
                snapshot_date=snapshot.snapshot_date,
                analytics=ReviewAnalyticsResponse(**snapshot.analytics_payload),
            )
            for snapshot in snapshots
            if snapshot.snapshot_date != today
        ]
        snapshot_responses.append(
            ReviewAnalyticsSnapshotResponse(
                snapshot_date=today,
                analytics=_review_analytics_response(
                    project_id,
                    session,
                    window_days=window_days,
                ),
            )
        )
        snapshot_responses.sort(key=lambda snapshot: snapshot.snapshot_date)

        return ReviewAnalyticsTrendResponse(
            window_days=window_days,
            days=trend_days,
            generated_at=generated_at.isoformat(),
            snapshots=snapshot_responses,
        )

    def _persist_review_analytics_snapshot(
        project_id: int,
        session: Session,
        *,
        window_days: int,
    ) -> ReviewAnalyticsSnapshot:
        analytics = _review_analytics_response(project_id, session, window_days=window_days)
        snapshot_date = datetime.now(UTC).date().isoformat()
        payload = analytics.model_dump(mode="json")
        generated_at = datetime.now(UTC)
        statement = sqlite_insert(ReviewAnalyticsSnapshot).values(
            project_id=project_id,
            snapshot_date=snapshot_date,
            window_days=window_days,
            generated_at=generated_at,
            analytics_payload=payload,
        )
        statement = statement.on_conflict_do_update(
            index_elements=["project_id", "snapshot_date", "window_days"],
            set_={
                "generated_at": generated_at,
                "analytics_payload": payload,
            },
        )
        session.execute(statement)
        session.commit()
        snapshot = (
            session.query(ReviewAnalyticsSnapshot)
            .filter(
                ReviewAnalyticsSnapshot.project_id == project_id,
                ReviewAnalyticsSnapshot.snapshot_date == snapshot_date,
                ReviewAnalyticsSnapshot.window_days == window_days,
            )
            .one()
        )
        return snapshot

    def _review_analytics_aging_buckets(ages: list[int]) -> dict[str, int]:
        return {
            "0_1_days": sum(1 for age in ages if age <= 1),
            "2_3_days": sum(1 for age in ages if 2 <= age <= 3),
            "4_7_days": sum(1 for age in ages if 4 <= age <= 7),
            "8_plus_days": sum(1 for age in ages if age >= 8),
        }

    def _dedupe_relationship_suggestions_for_analytics(
        suggestions: list[RelationshipSuggestion],
    ) -> list[RelationshipSuggestion]:
        unique_suggestions: list[RelationshipSuggestion] = []
        seen_keys: set[tuple[int, int | None, str, str]] = set()
        for suggestion in suggestions:
            key = (
                suggestion.source_field_id,
                suggestion.target_field_id,
                suggestion.relationship_type,
                suggestion.evidence_summary,
            )
            if key in seen_keys:
                continue
            seen_keys.add(key)
            unique_suggestions.append(suggestion)
        return unique_suggestions

    def _suggestion_has_analytics_evidence(suggestion: RelationshipSuggestion) -> bool:
        if suggestion.evidence_summary.strip():
            return True
        return bool(suggestion.evidence_payload)

    def _relationship_duplicate_cleanup_response(
        result: RelationshipDuplicateCleanupResult,
    ) -> RelationshipDuplicateCleanupResponse:
        return RelationshipDuplicateCleanupResponse(
            removed_duplicate_count=result.removed_duplicate_count,
            relinked_edge_count=result.relinked_edge_count,
            remaining_duplicate_count=result.remaining_duplicate_count,
            duplicate_groups=[
                _duplicate_suggestion_group_response(group)
                for group in result.duplicate_groups
            ],
        )

    @imports_router.post("/projects/{project_id}/imports", response_model=ImportResponse)
    async def import_file(
        project_id: int,
        file: UploadFile,
        session: SessionDependency,
    ) -> ImportResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        suffix = Path(file.filename or "").suffix
        if suffix.lower() not in {".csv", ".xlsx", ".xls", ".json"}:
            raise unsupported_import_file_type_error()

        with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = Path(temp_file.name)
        try:
            await _write_limited_upload(file, temp_path)
        except HTTPException:
            temp_path.unlink(missing_ok=True)
            raise

        try:
            service = ImportService(
                paths=WorkspacePaths(workspace_root),
                session_factory=session_factory,
            )
            result = await asyncio.to_thread(
                service.import_file,
                project_id,
                temp_path,
                display_filename=file.filename,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        finally:
            temp_path.unlink(missing_ok=True)

        return ImportResponse(
            import_job_id=result.import_job_id,
            dataset_id=result.dataset_id,
            sheet_count=result.sheet_count,
            field_count=result.field_count,
            suggestion_count=result.suggestion_count,
            graph_node_count=result.graph_node_count,
            graph_edge_count=result.graph_edge_count,
            graph=_graph_response(project_id, session),
            suggestions=_relationship_suggestions_response(project_id, session),
        )

    @imports_router.post("/projects/{project_id}/sample-import", response_model=ImportResponse)
    def import_sample_dataset(project_id: int, session: SessionDependency) -> ImportResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        result = ImportService(
            paths=WorkspacePaths(workspace_root),
            session_factory=session_factory,
        ).import_sample_dataset(project_id)

        return ImportResponse(
            import_job_id=result.import_job_id,
            dataset_id=result.dataset_id,
            sheet_count=result.sheet_count,
            field_count=result.field_count,
            suggestion_count=result.suggestion_count,
            graph_node_count=result.graph_node_count,
            graph_edge_count=result.graph_edge_count,
            graph=_graph_response(project_id, session),
            suggestions=_relationship_suggestions_response(project_id, session),
        )

    @reviews_router.post(
        "/relationship-suggestions/{suggestion_id}/review",
    )
    def review_relationship_suggestion(
        suggestion_id: int,
        payload: RelationshipReviewRequest,
    ) -> dict[str, str]:
        return _review_relationship_suggestion(None, suggestion_id, payload)

    @reviews_router.post(
        "/projects/{project_id}/relationship-suggestions/{suggestion_id}/review",
    )
    def review_project_relationship_suggestion(
        project_id: int,
        suggestion_id: int,
        payload: RelationshipReviewRequest,
    ) -> dict[str, str]:
        return _review_relationship_suggestion(project_id, suggestion_id, payload)

    def _review_relationship_suggestion(
        project_id: int | None,
        suggestion_id: int,
        payload: RelationshipReviewRequest,
    ) -> dict[str, str]:
        try:
            GraphService(session_factory).review_suggestion(
                suggestion_id=suggestion_id,
                decision_status=payload.decision_status,
                decision_note=payload.decision_note,
                reviewed_by=payload.reviewed_by,
                relationship_type=payload.relationship_type,
                evidence_quality=payload.evidence_quality,
                project_id=project_id,
            )
        except ValueError as exc:
            detail = str(exc)
            if "not found" in detail:
                raise HTTPException(status_code=404, detail=detail) from exc
            raise HTTPException(status_code=400, detail=detail) from exc

        return {"status": "ok"}

    @ai_router.post("/projects/{project_id}/chat", response_model=ChatAnswerResponse)
    def ask_chat(
        project_id: int, payload: ChatRequest, session: SessionDependency
    ) -> ChatAnswerResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")

        answer = ChatService(
            paths=WorkspacePaths(workspace_root),
            session_factory=session_factory,
        ).answer_question(
            project_id=project_id,
            question=payload.question,
            selection=payload.selection,
        )
        return ChatAnswerResponse(
            answer=answer.content,
            content=answer.content,
            query_plan=answer.query_plan,
            confidence=answer.answer_confidence,
            answer_confidence=answer.answer_confidence,
            citations=[
                CitationResponse(
                    label=citation.label,
                    source_ref=citation.source_ref,
                    citation_type=citation.citation_type,
                )
                for citation in answer.citations
            ],
            highlighted_graph_path=answer.highlighted_graph_path,
            retrieved_evidence=[
                RetrievedEvidenceResponse(
                    label=evidence.label,
                    kind=evidence.kind,
                    source_ref=evidence.source_ref,
                    score=evidence.score,
                    excerpt=evidence.excerpt,
                )
                for evidence in answer.retrieved_evidence or []
            ],
            graph_actions=[
                GraphActionResponse(
                    id=action.id,
                    type=action.type,
                    label=action.label,
                    description=action.description,
                    node_ids=action.node_ids or [],
                    edge_ids=action.edge_ids or [],
                    suggestion_ids=action.suggestion_ids or [],
                    evidence_refs=action.evidence_refs or [],
                    metadata=action.metadata or {},
                )
                for action in answer.graph_actions or []
            ],
            next_steps=answer.next_steps or [],
        )

    def _dedupe_relationship_suggestions(
        suggestions: list[RelationshipSuggestion],
        field_labels: dict[int, str],
    ) -> list[RelationshipSuggestion]:
        unique_suggestions: list[RelationshipSuggestion] = []
        seen_keys = set()
        for suggestion in suggestions:
            source_label = field_labels.get(suggestion.source_field_id, "Unknown field")
            target_label = (
                field_labels.get(suggestion.target_field_id)
                if suggestion.target_field_id is not None
                else None
            )
            key = (
                source_label.casefold(),
                target_label.casefold() if target_label is not None else "",
                suggestion.relationship_type.casefold(),
                suggestion.decision_status.casefold(),
                " ".join((suggestion.evidence_summary or "").casefold().split()),
            )
            if key in seen_keys:
                continue
            seen_keys.add(key)
            unique_suggestions.append(suggestion)
        return unique_suggestions

    for domain_router in domain_routers.as_dict().values():
        router.include_router(domain_router)

    return router
