from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator


class ProjectCreateRequest(BaseModel):
    name: str


class ProjectResponse(BaseModel):
    id: int
    name: str


class ApiErrorDetail(BaseModel):
    code: str
    message: str
    user_action: str
    retryable: bool = False
    field_errors: dict[str, str] = Field(default_factory=dict)


class SessionLoginRequest(BaseModel):
    username: str
    password: str


class SessionLoginResponse(BaseModel):
    username: str
    auth_mode: str
    csrf_token: str
    expires_at: str


class ProjectShareTokenCreateRequest(BaseModel):
    role: str
    label: str


class ProjectShareTokenCreatedResponse(BaseModel):
    id: int
    project_id: int
    role: str
    label: str
    token: str
    created_at: str


class ProjectShareTokenResponse(BaseModel):
    id: int
    project_id: int
    role: str
    label: str
    created_at: str
    last_used_at: str | None
    revoked_at: str | None


class ProjectShareTokenRevocationResponse(BaseModel):
    id: int
    project_id: int
    revoked: bool


class AIChatSettings(BaseModel):
    provider: str = "rules"
    model: str = "graphmind-rules"
    base_url: str = ""
    api_key: str = ""
    temperature: float = 0.1

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        return _validate_ai_base_url(value)


class AIVectorSettings(BaseModel):
    provider: str = "none"
    model: str = ""
    base_url: str = ""
    api_key: str = ""
    dimensions: int = 0
    index_status: str = "not_built"
    document_count: int = 0
    last_built_at: str | None = None
    embedding_model: str = ""

    @field_validator("base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        return _validate_ai_base_url(value)


class AISettings(BaseModel):
    chat: AIChatSettings = Field(default_factory=AIChatSettings)
    vector: AIVectorSettings = Field(default_factory=AIVectorSettings)


class ReviewAnalyticsSettings(BaseModel):
    retention_days: int = 30
    auto_cleanup_enabled: bool = False


class ProjectSettingsResponse(BaseModel):
    ai: AISettings = Field(default_factory=AISettings)
    review_analytics: ReviewAnalyticsSettings = Field(default_factory=ReviewAnalyticsSettings)


def _validate_ai_base_url(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        return ""
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("AI base URL must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password:
        raise ValueError("AI base URL must not include user information")
    if parsed.params or parsed.query or parsed.fragment:
        raise ValueError("AI base URL must not include parameters, a query string, or a fragment")
    try:
        _ = parsed.port
    except ValueError as exc:
        raise ValueError("AI base URL contains an invalid port") from exc
    return normalized.rstrip("/")


class GraphNodeResponse(BaseModel):
    id: int
    node_type: str
    label: str
    source_ref: str
    metadata: dict[str, Any]
    position_x: float
    position_y: float


class GraphEdgeResponse(BaseModel):
    id: int
    source_node_id: int
    target_node_id: int
    edge_type: str
    confidence: float
    status: str
    evidence_ref: str
    evidence_refs: list[str] = Field(default_factory=list)
    created_from_suggestion_id: int | None
    metadata: dict[str, Any]
    evidence_summary: str | None
    evidence_payload: dict[str, Any] | None


class GraphResponse(BaseModel):
    nodes: list[GraphNodeResponse]
    edges: list[GraphEdgeResponse]


class RelationshipSuggestionResponse(BaseModel):
    id: int
    source_field_id: int
    target_field_id: int | None
    source_label: str
    target_label: str | None
    relationship_type: str
    confidence: float
    evidence_summary: str
    evidence_payload: dict[str, Any]
    decision_status: str
    reviewed_by: str | None = None
    created_at: str
    updated_at: str
    quality_label: str
    review_priority: str
    quality_reasons: list[str]


class RelationshipReviewRequest(BaseModel):
    decision_status: str
    decision_note: str | None = None
    reviewed_by: str | None = None
    relationship_type: str | None = None
    evidence_quality: str | None = None


class DuplicateSuggestionGroupResponse(BaseModel):
    canonical_suggestion_id: int
    duplicate_suggestion_ids: list[int]
    source_label: str
    target_label: str | None
    relationship_type: str


class RelationshipGovernanceSummaryResponse(BaseModel):
    total_suggestion_count: int
    visible_suggestion_count: int
    duplicate_suggestion_count: int
    duplicate_group_count: int
    pending_suggestion_count: int
    accepted_suggestion_count: int
    rejected_suggestion_count: int
    edited_suggestion_count: int
    duplicate_groups: list[DuplicateSuggestionGroupResponse]


class ReviewAnalyticsSLAResponse(BaseModel):
    pending_sla_days: int
    pending_total: int
    overdue_pending_count: int
    oldest_pending_age_days: int | None


class ReviewAnalyticsEvidenceCoverageResponse(BaseModel):
    with_evidence_count: int
    without_evidence_count: int
    coverage_ratio: float


class ReviewAnalyticsResponse(BaseModel):
    window_days: int
    generated_at: str
    sla: ReviewAnalyticsSLAResponse
    aging_buckets: dict[str, int]
    decision_trend: dict[str, int]
    quality_distribution: dict[str, int]
    evidence_coverage: ReviewAnalyticsEvidenceCoverageResponse


class ReviewAnalyticsSnapshotResponse(BaseModel):
    snapshot_date: str
    analytics: ReviewAnalyticsResponse


class ReviewAnalyticsTrendResponse(BaseModel):
    window_days: int
    days: int
    generated_at: str
    snapshots: list[ReviewAnalyticsSnapshotResponse]


class ReviewAnalyticsSnapshotSummaryResponse(BaseModel):
    retention_days: int
    snapshot_count: int
    expired_snapshot_count: int
    oldest_snapshot_date: str | None
    latest_snapshot_date: str | None


class ReviewAnalyticsSnapshotCleanupRequest(BaseModel):
    retention_days: int = 30


class ReviewAnalyticsSnapshotCleanupResponse(BaseModel):
    retention_days: int
    cutoff_date: str
    removed_count: int
    remaining_count: int


class ReviewAnalyticsSnapshotCleanupEventResponse(BaseModel):
    id: int
    project_id: int
    retention_days: int
    cutoff_date: str
    removed_count: int
    remaining_count: int
    created_at: str


class RelationshipDuplicateCleanupResponse(BaseModel):
    removed_duplicate_count: int
    relinked_edge_count: int
    remaining_duplicate_count: int
    duplicate_groups: list[DuplicateSuggestionGroupResponse]


class ImportResponse(BaseModel):
    import_job_id: int
    dataset_id: int
    sheet_count: int
    field_count: int
    suggestion_count: int
    graph_node_count: int
    graph_edge_count: int
    graph: GraphResponse
    suggestions: list[RelationshipSuggestionResponse]


class ImportJobResponse(BaseModel):
    id: int
    project_id: int
    label: str
    kind: str
    status: str
    progress: int
    summary: dict[str, Any] | None
    error: str | None
    retryable: bool
    dataset_id: int | None
    created_at: str
    updated_at: str


class ImportJobRecoveryResponse(BaseModel):
    recovered_count: int
    submitted_count: int


class ImportEventResponse(BaseModel):
    type: str
    jobs: list[ImportJobResponse]


class ImportItemResponse(BaseModel):
    id: int
    batch_id: int
    project_id: int
    filename: str
    file_type: str
    source_kind: str
    status: str
    raw_data_ref: str
    artifact_ref: str | None
    error: str | None
    summary: dict[str, Any] | None
    created_at: str
    updated_at: str


class ImportBatchResponse(BaseModel):
    id: int
    project_id: int
    label: str
    status: str
    progress: int
    summary: dict[str, Any] | None
    error: str | None
    items: list[ImportItemResponse] = Field(default_factory=list)
    created_at: str
    updated_at: str


class URLImportRequest(BaseModel):
    url: str
    label: str | None = None


class SourceSummaryResponse(BaseModel):
    source_kind: str
    count: int


class SourceDetailResponse(BaseModel):
    id: int
    import_item_id: int
    title: str
    document_type: str
    source_ref: str
    metadata: dict[str, Any]
    chunk_count: int
    entity_count: int
    relationship_count: int
    created_at: str


class DocumentChunkResponse(BaseModel):
    id: int
    document_id: int
    chunk_index: int
    heading: str | None
    content: str
    token_count: int
    source_ref: str
    content_hash: str
    metadata: dict[str, Any]
    created_at: str


class DocumentChunkPageResponse(BaseModel):
    items: list[DocumentChunkResponse]
    total: int
    limit: int
    offset: int
    has_more: bool


class ExtractedEntityResponse(BaseModel):
    id: int
    canonical_name: str
    entity_type: str
    aliases: list[str]
    confidence: float
    source_refs: list[str]
    metadata: dict[str, Any]
    created_at: str


class ExtractedEntityPageResponse(BaseModel):
    items: list[ExtractedEntityResponse]
    total: int
    limit: int
    offset: int
    has_more: bool


class ExtractedRelationshipResponse(BaseModel):
    id: int
    source_entity_id: int
    target_entity_id: int
    source_name: str
    source_type: str
    target_name: str
    target_type: str
    relationship_type: str
    confidence: float
    status: str
    evidence_summary: str
    evidence_payload: dict[str, Any]
    source_refs: list[str]
    created_at: str


class ExtractedRelationshipPageResponse(BaseModel):
    items: list[ExtractedRelationshipResponse]
    total: int
    limit: int
    offset: int
    has_more: bool


class EntityMatchReviewResponse(BaseModel):
    id: int
    project_id: int
    source_node_id: int
    target_node_id: int
    source_label: str
    source_type: str
    target_label: str
    target_type: str
    relationship_type: str
    confidence: float
    status: str
    evidence_ref: str
    evidence_summary: str
    matched_keys: list[str]
    source_refs: list[str]
    metadata: dict[str, Any]


class EntityMatchReviewRequest(BaseModel):
    decision_status: str


class ChatRequest(BaseModel):
    question: str
    selection: dict[str, Any] | None = None


class CitationResponse(BaseModel):
    label: str
    source_ref: str
    citation_type: str


class RetrievedEvidenceResponse(BaseModel):
    label: str
    kind: str
    source_ref: str
    score: float
    excerpt: str


class GraphActionResponse(BaseModel):
    id: str
    type: str
    label: str
    description: str | None = None
    node_ids: list[int] = Field(default_factory=list)
    edge_ids: list[int] = Field(default_factory=list)
    suggestion_ids: list[int] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChatAnswerResponse(BaseModel):
    answer: str
    content: str
    query_plan: dict[str, Any]
    confidence: str
    answer_confidence: str
    citations: list[CitationResponse]
    highlighted_graph_path: list[int]
    retrieved_evidence: list[RetrievedEvidenceResponse] = Field(default_factory=list)
    graph_actions: list[GraphActionResponse] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)


class WorkspaceSnapshotResponse(BaseModel):
    workspace_version: str
    project: ProjectResponse
    graph: GraphResponse
    suggestions: list[RelationshipSuggestionResponse]
    relationship_governance: RelationshipGovernanceSummaryResponse | None
    review_analytics: ReviewAnalyticsResponse
    review_analytics_trend: ReviewAnalyticsTrendResponse
    review_analytics_snapshot_summary: ReviewAnalyticsSnapshotSummaryResponse
    review_analytics_snapshot_cleanup_events: list[
        ReviewAnalyticsSnapshotCleanupEventResponse
    ]
    settings: ProjectSettingsResponse
    import_jobs: list[ImportJobResponse]
    source_summaries: list[SourceSummaryResponse]
    source_details: list[SourceDetailResponse]
    source_chunks_by_source_id: dict[int, list[DocumentChunkResponse]]
    extracted_entities: list[ExtractedEntityResponse]
    extracted_relationships: list[ExtractedRelationshipResponse]
    entity_match_reviews: list[EntityMatchReviewResponse]
    mapping_reviews: list[EntityMatchReviewResponse]


class WorkspaceDeltaResponse(BaseModel):
    status: str
    workspace_version: str
    graph: GraphResponse | None = None
    suggestions: list[RelationshipSuggestionResponse] | None = None
    relationship_governance: RelationshipGovernanceSummaryResponse | None = None
    review_analytics: ReviewAnalyticsResponse | None = None
    review_analytics_trend: ReviewAnalyticsTrendResponse | None = None
    review_analytics_snapshot_summary: ReviewAnalyticsSnapshotSummaryResponse | None = None
    review_analytics_snapshot_cleanup_events: list[
        ReviewAnalyticsSnapshotCleanupEventResponse
    ] | None = None
    import_jobs: list[ImportJobResponse] | None = None
    source_summaries: list[SourceSummaryResponse] | None = None
    source_details: list[SourceDetailResponse] | None = None
    extracted_entities: list[ExtractedEntityResponse] | None = None
    extracted_relationships: list[ExtractedRelationshipResponse] | None = None
    entity_match_reviews: list[EntityMatchReviewResponse] | None = None
    mapping_reviews: list[EntityMatchReviewResponse] | None = None
