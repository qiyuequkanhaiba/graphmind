from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON, TypeDecorator


def utc_now() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, onupdate=utc_now
    )
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ai_provider_config_ref: Mapped[str | None] = mapped_column(String(300), nullable=True)
    default_key: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True)


class ProjectShareToken(Base):
    __tablename__ = "project_share_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    last_used_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    file_type: Mapped[str] = mapped_column(String(30), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    import_status: Mapped[str] = mapped_column(String(30), nullable=False, default="imported")
    raw_data_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    sheets: Mapped[list[Sheet]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class Sheet(Base):
    __tablename__ = "sheets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    column_count: Mapped[int] = mapped_column(Integer, nullable=False)
    duckdb_table_name: Mapped[str] = mapped_column(String(200), nullable=False)

    dataset: Mapped[Dataset] = relationship(back_populates="sheets")
    fields: Mapped[list[FieldProfile]] = relationship(
        back_populates="sheet", cascade="all, delete-orphan"
    )


class FieldProfile(Base):
    __tablename__ = "field_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sheet_id: Mapped[int] = mapped_column(ForeignKey("sheets.id"), nullable=False)
    original_name: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(200), nullable=False)
    inferred_type: Mapped[str] = mapped_column(String(50), nullable=False)
    null_count: Mapped[int] = mapped_column(Integer, nullable=False)
    unique_count: Mapped[int] = mapped_column(Integer, nullable=False)
    sample_values: Mapped[list[Any]] = mapped_column(JSON, default=list)
    min_value: Mapped[str | None] = mapped_column(String(200), nullable=True)
    max_value: Mapped[str | None] = mapped_column(String(200), nullable=True)
    semantic_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    key_candidate_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    sheet: Mapped[Sheet] = relationship(back_populates="fields")


class GraphNode(Base):
    __tablename__ = "graph_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    source_ref: Mapped[str] = mapped_column(String(300), nullable=False)
    node_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    position_x: Mapped[float] = mapped_column(Float, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, default=0.0)


class GraphEdge(Base):
    __tablename__ = "graph_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    source_node_id: Mapped[int] = mapped_column(ForeignKey("graph_nodes.id"), nullable=False)
    target_node_id: Mapped[int] = mapped_column(ForeignKey("graph_nodes.id"), nullable=False)
    edge_type: Mapped[str] = mapped_column(String(80), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    evidence_ref: Mapped[str] = mapped_column(String(300), nullable=False)
    edge_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_from_suggestion_id: Mapped[int | None] = mapped_column(
        ForeignKey("relationship_suggestions.id"), nullable=True
    )


class EvidenceIndexEntry(Base):
    __tablename__ = "evidence_index_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    document_id: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(JSON, nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class RelationshipSuggestion(Base):
    __tablename__ = "relationship_suggestions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    source_field_id: Mapped[int] = mapped_column(ForeignKey("field_profiles.id"), nullable=False)
    target_field_id: Mapped[int | None] = mapped_column(
        ForeignKey("field_profiles.id"), nullable=True
    )
    relationship_type: Mapped[str] = mapped_column(String(80), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    evidence_summary: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    ai_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision_status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, onupdate=utc_now
    )


class ReviewAnalyticsSnapshot(Base):
    __tablename__ = "review_analytics_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    snapshot_date: Mapped[str] = mapped_column(String(10), nullable=False)
    window_days: Mapped[int] = mapped_column(Integer, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    analytics_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ReviewAnalyticsSnapshotCleanupAudit(Base):
    __tablename__ = "review_analytics_snapshot_cleanup_audits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False)
    cutoff_date: Mapped[str] = mapped_column(String(10), nullable=False)
    removed_count: Mapped[int] = mapped_column(Integer, nullable=False)
    remaining_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(300), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retryable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    dataset_id: Mapped[int | None] = mapped_column(ForeignKey("datasets.id"), nullable=True)
    worker_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lease_token: Mapped[str | None] = mapped_column(String(80), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, onupdate=utc_now
    )


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, onupdate=utc_now
    )


class ImportItem(Base):
    __tablename__ = "import_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), nullable=False)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    file_type: Mapped[str] = mapped_column(String(40), nullable=False)
    source_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    raw_data_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    artifact_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, onupdate=utc_now
    )


class DocumentSource(Base):
    __tablename__ = "document_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    import_item_id: Mapped[int] = mapped_column(ForeignKey("import_items.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    document_type: Mapped[str] = mapped_column(String(80), nullable=False)
    source_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    source_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    document_id: Mapped[int] = mapped_column(ForeignKey("document_sources.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    heading: Mapped[str | None] = mapped_column(String(300), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False)
    source_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(80), nullable=False)
    chunk_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class ExtractedEntity(Base):
    __tablename__ = "extracted_entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    canonical_name: Mapped[str] = mapped_column(String(300), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    aliases: Mapped[list[str]] = mapped_column(JSON, default=list)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    source_refs: Mapped[list[str]] = mapped_column(JSON, default=list)
    entity_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class ExtractedRelationship(Base):
    __tablename__ = "extracted_relationships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    source_entity_id: Mapped[int] = mapped_column(
        ForeignKey("extracted_entities.id"), nullable=False
    )
    target_entity_id: Mapped[int] = mapped_column(
        ForeignKey("extracted_entities.id"), nullable=False
    )
    relationship_type: Mapped[str] = mapped_column(String(80), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    evidence_summary: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    source_refs: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    title: Mapped[str] = mapped_column(String(200), nullable=False)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chat_session_id: Mapped[int] = mapped_column(ForeignKey("chat_sessions.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    query_plan: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    answer_confidence: Mapped[str | None] = mapped_column(String(80), nullable=True)
    citations: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    highlighted_graph_path: Mapped[list[int]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
