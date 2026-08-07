import hashlib
from secrets import token_urlsafe

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from graphmind.core.evidence_refs import normalize_evidence_refs, payload_with_evidence_refs
from graphmind.core.graph_builder import GraphData
from graphmind.core.profiling import SheetProfileData
from graphmind.core.relationships import RelationshipSuggestionData
from graphmind.storage.import_job_repository import ImportJobRepository
from graphmind.storage.models import (
    Dataset,
    DocumentChunk,
    DocumentSource,
    ExtractedEntity,
    ExtractedRelationship,
    FieldProfile,
    GraphEdge,
    GraphNode,
    ImportBatch,
    ImportItem,
    Project,
    ProjectShareToken,
    RelationshipSuggestion,
    Sheet,
    utc_now,
)

RelationshipSuggestionSemanticKey = tuple[str, str, str | None, str | None, str]


class ProjectRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_project(self, name: str) -> Project:
        project = Project(name=name, settings={})
        self.session.add(project)
        self.session.flush()
        return project

    def get_or_create_default_project(self) -> Project:
        project = (
            self.session.query(Project)
            .filter(Project.default_key == "default")
            .order_by(Project.id)
            .first()
        )
        if project is not None:
            return project

        project = Project(name="Local Project", settings={"default": True}, default_key="default")
        self.session.add(project)
        try:
            self.session.flush()
        except IntegrityError:
            self.session.rollback()
            project = (
                self.session.query(Project)
                .filter(Project.default_key == "default")
                .order_by(Project.id)
                .one()
            )
        return project


SHARE_TOKEN_PREFIX = "gm_share_"
SHARE_TOKEN_ROLES = {"viewer", "editor"}


class ProjectShareTokenRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_share_token(
        self,
        *,
        project_id: int,
        role: str,
        label: str,
    ) -> tuple[ProjectShareToken, str]:
        if role not in SHARE_TOKEN_ROLES:
            raise ValueError("Unsupported project share role")
        plain_token = f"{SHARE_TOKEN_PREFIX}{token_urlsafe(32)}"
        share_token = ProjectShareToken(
            project_id=project_id,
            role=role,
            label=label,
            token_hash=self.hash_token(plain_token),
        )
        self.session.add(share_token)
        self.session.flush()
        return share_token, plain_token

    def list_share_tokens(self, project_id: int) -> list[ProjectShareToken]:
        return (
            self.session.query(ProjectShareToken)
            .filter(ProjectShareToken.project_id == project_id)
            .order_by(ProjectShareToken.created_at.desc(), ProjectShareToken.id.desc())
            .all()
        )

    def get_active_share_token(self, plain_token: str) -> ProjectShareToken | None:
        if not plain_token.startswith(SHARE_TOKEN_PREFIX):
            return None
        share_token = (
            self.session.query(ProjectShareToken)
            .filter(
                ProjectShareToken.token_hash == self.hash_token(plain_token),
                ProjectShareToken.revoked_at.is_(None),
            )
            .first()
        )
        if share_token is not None:
            share_token.last_used_at = utc_now()
            self.session.flush()
        return share_token

    def revoke_share_token(
        self,
        *,
        project_id: int,
        share_token_id: int,
    ) -> ProjectShareToken | None:
        share_token = (
            self.session.query(ProjectShareToken)
            .filter(
                ProjectShareToken.project_id == project_id,
                ProjectShareToken.id == share_token_id,
            )
            .first()
        )
        if share_token is None:
            return None
        if share_token.revoked_at is None:
            share_token.revoked_at = utc_now()
            self.session.flush()
        return share_token

    @staticmethod
    def hash_token(plain_token: str) -> str:
        return hashlib.sha256(plain_token.encode()).hexdigest()


class ImportRepository(ImportJobRepository):
    def create_dataset(
        self, project_id: int, file_path: str, raw_data_ref: str | None = None
    ) -> Dataset:
        file_type = file_path.rsplit(".", maxsplit=1)[-1].lower() if "." in file_path else ""
        dataset = Dataset(
            project_id=project_id,
            filename=file_path,
            file_type=file_type,
            import_status="imported",
            raw_data_ref=raw_data_ref or "",
        )
        self.session.add(dataset)
        self.session.flush()
        return dataset

    def set_dataset_raw_data_ref(self, dataset: Dataset, raw_data_ref: str) -> None:
        dataset.raw_data_ref = raw_data_ref
        self.session.flush()

    def add_sheet_profile(self, dataset_id: int, profile: SheetProfileData) -> Sheet:
        sheet = Sheet(
            dataset_id=dataset_id,
            name=profile.name,
            normalized_name=profile.normalized_name,
            row_count=profile.row_count,
            column_count=profile.column_count,
            duckdb_table_name=profile.duckdb_table_name,
        )
        self.session.add(sheet)
        self.session.flush()

        for field in profile.fields:
            self.session.add(
                FieldProfile(
                    sheet_id=sheet.id,
                    original_name=field.original_name,
                    normalized_name=field.normalized_name,
                    inferred_type=field.inferred_type,
                    null_count=field.null_count,
                    unique_count=field.unique_count,
                    sample_values=field.sample_values,
                    min_value=field.min_value,
                    max_value=field.max_value,
                    semantic_label=field.semantic_label,
                    key_candidate_score=field.key_candidate_score,
                )
            )

        self.session.flush()
        return sheet

    def add_relationship_suggestions(
        self, project_id: int, dataset_id: int, suggestions: list[RelationshipSuggestionData]
    ) -> list[RelationshipSuggestion]:
        fields = (
            self.session.query(FieldProfile)
            .join(Sheet)
            .filter(Sheet.dataset_id == dataset_id)
            .all()
        )
        field_id_map = {
            (field.sheet.name, field.normalized_name): field.id
            for field in fields
            if field.sheet is not None
        }

        return self._add_relationship_suggestions_from_field_map(
            project_id,
            suggestions,
            field_id_map,
        )

    def add_relationship_suggestions_for_profiles(
        self,
        project_id: int,
        suggestions: list[RelationshipSuggestionData],
    ) -> list[RelationshipSuggestion]:
        fields = (
            self.session.query(FieldProfile)
            .join(Sheet)
            .join(Dataset)
            .filter(Dataset.project_id == project_id)
            .all()
        )
        field_id_map = {
            (field.sheet.name, field.normalized_name): field.id
            for field in fields
            if field.sheet is not None
        }
        return self._add_relationship_suggestions_from_field_map(
            project_id,
            suggestions,
            field_id_map,
            dedupe_by_semantic_key=True,
        )

    def add_extracted_relationship_suggestions(
        self,
        project_id: int,
        relationships: list[ExtractedRelationship],
    ) -> list[RelationshipSuggestion]:
        if not relationships:
            return []

        saved_suggestions = []
        field_id_by_entity_id: dict[int, int] = {}
        for relationship in relationships:
            source_field_id = self._get_or_create_extracted_entity_field(
                project_id=project_id,
                entity_id=relationship.source_entity_id,
                field_id_by_entity_id=field_id_by_entity_id,
            )
            target_field_id = self._get_or_create_extracted_entity_field(
                project_id=project_id,
                entity_id=relationship.target_entity_id,
                field_id_by_entity_id=field_id_by_entity_id,
            )
            if source_field_id is None or target_field_id is None:
                continue

            existing = (
                self.session.query(RelationshipSuggestion)
                .filter(
                    RelationshipSuggestion.project_id == project_id,
                    RelationshipSuggestion.source_field_id == source_field_id,
                    RelationshipSuggestion.target_field_id == target_field_id,
                    RelationshipSuggestion.relationship_type == relationship.relationship_type,
                )
                .first()
            )
            if existing is not None:
                saved_suggestions.append(existing)
                continue

            saved = RelationshipSuggestion(
                project_id=project_id,
                source_field_id=source_field_id,
                target_field_id=target_field_id,
                relationship_type=relationship.relationship_type,
                confidence=relationship.confidence,
                evidence_summary=relationship.evidence_summary,
                evidence_payload=payload_with_evidence_refs(
                    {
                        **(relationship.evidence_payload or {}),
                        "source_kind": "extracted_relationship",
                        "extracted_relationship_id": relationship.id,
                    },
                    relationship.source_refs or [],
                ),
                decision_status="pending",
            )
            self.session.add(saved)
            saved_suggestions.append(saved)

        self.session.flush()
        return saved_suggestions

    def _get_or_create_extracted_entity_field(
        self,
        project_id: int,
        entity_id: int,
        field_id_by_entity_id: dict[int, int],
    ) -> int | None:
        cached_field_id = field_id_by_entity_id.get(entity_id)
        if cached_field_id is not None:
            return cached_field_id

        entity = self.session.get(ExtractedEntity, entity_id)
        if entity is None:
            return None

        sheet = self._get_or_create_extracted_relationship_sheet(project_id)
        normalized_name = f"entity_{entity.id}"
        existing = (
            self.session.query(FieldProfile)
            .filter(
                FieldProfile.sheet_id == sheet.id,
                FieldProfile.normalized_name == normalized_name,
            )
            .first()
        )
        if existing is not None:
            field_id_by_entity_id[entity_id] = existing.id
            return existing.id

        field = FieldProfile(
            sheet_id=sheet.id,
            original_name=entity.canonical_name,
            normalized_name=normalized_name,
            inferred_type=entity.entity_type,
            null_count=0,
            unique_count=1,
            sample_values=[entity.canonical_name, *(entity.aliases or [])][:5],
            min_value=None,
            max_value=None,
            semantic_label="extracted_entity",
            key_candidate_score=entity.confidence,
        )
        self.session.add(field)
        self.session.flush()
        field_id_by_entity_id[entity_id] = field.id
        return field.id

    def _get_or_create_extracted_relationship_sheet(self, project_id: int) -> Sheet:
        dataset_name = "__graphmind_extracted_relationships__"
        dataset = (
            self.session.query(Dataset)
            .filter(Dataset.project_id == project_id, Dataset.filename == dataset_name)
            .first()
        )
        if dataset is None:
            dataset = Dataset(
                project_id=project_id,
                filename=dataset_name,
                file_type="extracted_relationships",
                import_status="internal",
                raw_data_ref="",
            )
            self.session.add(dataset)
            self.session.flush()

        sheet = (
            self.session.query(Sheet)
            .filter(
                Sheet.dataset_id == dataset.id,
                Sheet.normalized_name == "extracted_entities",
            )
            .first()
        )
        if sheet is not None:
            return sheet

        sheet = Sheet(
            dataset_id=dataset.id,
            name="Extracted entities",
            normalized_name="extracted_entities",
            row_count=0,
            column_count=0,
            duckdb_table_name=f"extracted_entities_{project_id}",
        )
        self.session.add(sheet)
        self.session.flush()
        return sheet

    def _add_relationship_suggestions_from_field_map(
        self,
        project_id: int,
        suggestions: list[RelationshipSuggestionData],
        field_id_map: dict[tuple[str, str], int],
        dedupe_by_semantic_key: bool = False,
    ) -> list[RelationshipSuggestion]:
        saved_suggestions = []
        semantic_suggestion_map = (
            self._relationship_suggestions_by_semantic_key(project_id)
            if dedupe_by_semantic_key
            else {}
        )
        for suggestion in suggestions:
            source_field_id = field_id_map.get(
                (suggestion.source_sheet, suggestion.source_field)
            )
            if source_field_id is None:
                continue

            target_field_id = None
            if suggestion.target_sheet is not None and suggestion.target_field is not None:
                target_field_id = field_id_map.get(
                    (suggestion.target_sheet, suggestion.target_field)
                )
                if target_field_id is None:
                    continue

            semantic_key = _relationship_suggestion_semantic_key(
                source_sheet=suggestion.source_sheet,
                source_field=suggestion.source_field,
                target_sheet=suggestion.target_sheet,
                target_field=suggestion.target_field,
                relationship_type=suggestion.relationship_type,
            )
            existing_semantic_suggestion = semantic_suggestion_map.get(semantic_key)
            if existing_semantic_suggestion is not None:
                saved_suggestions.append(existing_semantic_suggestion)
                continue

            existing = (
                self.session.query(RelationshipSuggestion)
                .filter(
                    RelationshipSuggestion.project_id == project_id,
                    RelationshipSuggestion.source_field_id == source_field_id,
                    RelationshipSuggestion.target_field_id == target_field_id,
                    RelationshipSuggestion.relationship_type == suggestion.relationship_type,
                )
                .first()
            )
            if existing is not None:
                saved_suggestions.append(existing)
                semantic_suggestion_map.setdefault(semantic_key, existing)
                continue

            saved = RelationshipSuggestion(
                project_id=project_id,
                source_field_id=source_field_id,
                target_field_id=target_field_id,
                relationship_type=suggestion.relationship_type,
                confidence=suggestion.confidence,
                evidence_summary=suggestion.evidence_summary,
                evidence_payload=suggestion.evidence_payload,
                decision_status="pending",
            )
            self.session.add(saved)
            saved_suggestions.append(saved)
            semantic_suggestion_map[semantic_key] = saved

        self.session.flush()
        return saved_suggestions

    def _relationship_suggestions_by_semantic_key(
        self, project_id: int
    ) -> dict[RelationshipSuggestionSemanticKey, RelationshipSuggestion]:
        suggestions = (
            self.session.query(RelationshipSuggestion)
            .filter(RelationshipSuggestion.project_id == project_id)
            .order_by(RelationshipSuggestion.id)
            .all()
        )
        suggestion_map = {}
        for suggestion in suggestions:
            source_field = self.session.get(FieldProfile, suggestion.source_field_id)
            if source_field is None or source_field.sheet is None:
                continue

            target_sheet = None
            target_field_name = None
            if suggestion.target_field_id is not None:
                target_field = self.session.get(FieldProfile, suggestion.target_field_id)
                if target_field is None or target_field.sheet is None:
                    continue
                target_sheet = target_field.sheet.name
                target_field_name = target_field.normalized_name

            key = _relationship_suggestion_semantic_key(
                source_sheet=source_field.sheet.name,
                source_field=source_field.normalized_name,
                target_sheet=target_sheet,
                target_field=target_field_name,
                relationship_type=suggestion.relationship_type,
            )
            suggestion_map.setdefault(key, suggestion)
        return suggestion_map

    def add_graph(self, graph: GraphData) -> tuple[list[GraphNode], list[GraphEdge]]:
        node_id_map: dict[str, int] = {}
        saved_nodes = []
        for node in graph.nodes:
            existing = (
                self.session.query(GraphNode)
                .filter(
                    GraphNode.project_id == graph.project_id,
                    GraphNode.node_type == node.node_type,
                    GraphNode.label == node.label,
                    GraphNode.source_ref == node.source_ref,
                )
                .first()
            )
            if existing is not None:
                node_id_map[node.id] = existing.id
                saved_nodes.append(existing)
                continue

            saved = GraphNode(
                project_id=graph.project_id,
                node_type=node.node_type,
                label=node.label,
                source_ref=node.source_ref,
                node_metadata=node.metadata,
                position_x=node.position_x,
                position_y=node.position_y,
            )
            self.session.add(saved)
            self.session.flush()
            node_id_map[node.id] = saved.id
            saved_nodes.append(saved)

        saved_edges = []
        for edge in graph.edges:
            source_node_id = node_id_map.get(edge.source_node_id)
            target_node_id = node_id_map.get(edge.target_node_id)
            if source_node_id is None or target_node_id is None:
                continue

            existing_edge = (
                self.session.query(GraphEdge)
                .filter(
                    GraphEdge.project_id == graph.project_id,
                    GraphEdge.source_node_id == source_node_id,
                    GraphEdge.target_node_id == target_node_id,
                    GraphEdge.edge_type == edge.edge_type,
                    GraphEdge.status == edge.status,
                    GraphEdge.evidence_ref == edge.evidence_ref,
                )
                .first()
            )
            if existing_edge is not None:
                saved_edges.append(existing_edge)
                continue

            saved = GraphEdge(
                project_id=graph.project_id,
                source_node_id=source_node_id,
                target_node_id=target_node_id,
                edge_type=edge.edge_type,
                confidence=edge.confidence,
                status=edge.status,
                evidence_ref=edge.evidence_ref,
                edge_metadata=edge.metadata,
                created_from_suggestion_id=None,
            )
            self.session.add(saved)
            saved_edges.append(saved)

        self.session.flush()
        return saved_nodes, saved_edges

    def link_graph_edges_to_suggestions(
        self,
        edges: list[GraphEdge],
        suggestions: list[RelationshipSuggestion],
    ) -> None:
        suggestions_by_ref = {
            f"suggestion:{index}": suggestion.id
            for index, suggestion in enumerate(suggestions)
        }
        for edge in edges:
            suggestion_id = suggestions_by_ref.get(edge.evidence_ref)
            if suggestion_id is not None:
                edge.created_from_suggestion_id = suggestion_id
        self.session.flush()


class ImportBatchRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_batch(self, project_id: int, label: str) -> ImportBatch:
        batch = ImportBatch(
            project_id=project_id,
            label=label,
            status="queued",
            progress=0,
            summary=None,
            error_message=None,
        )
        self.session.add(batch)
        self.session.flush()
        return batch

    def create_item(
        self,
        batch_id: int,
        project_id: int,
        filename: str,
        file_type: str,
        source_kind: str,
        raw_data_ref: str,
    ) -> ImportItem:
        item = ImportItem(
            batch_id=batch_id,
            project_id=project_id,
            filename=filename,
            file_type=file_type,
            source_kind=source_kind,
            status="staged",
            raw_data_ref=raw_data_ref,
            artifact_ref=None,
            error_message=None,
            summary=_stage_summary(
                stage="staged",
                stage_summary="File staged for import.",
            ),
        )
        self.session.add(item)
        self.session.flush()
        return item

    def update_batch_progress(
        self,
        batch: ImportBatch,
        status: str,
        progress: int,
        summary: dict[str, object] | None = None,
        error_message: str | None = None,
    ) -> None:
        batch.status = status
        batch.progress = max(0, min(100, progress))
        if summary is not None:
            batch.summary = summary
        batch.error_message = error_message
        self.session.flush()

    def update_item_status(
        self,
        item: ImportItem,
        status: str,
        summary: dict[str, object] | None = None,
        artifact_ref: str | None = None,
        error_message: str | None = None,
    ) -> None:
        item.status = status
        if summary is not None:
            item.summary = summary
        if artifact_ref is not None:
            item.artifact_ref = artifact_ref
        item.error_message = error_message
        self.session.flush()

    def get_item(self, project_id: int, item_id: int) -> ImportItem | None:
        return (
            self.session.query(ImportItem)
            .filter(ImportItem.project_id == project_id, ImportItem.id == item_id)
            .first()
        )

    def reset_item_for_retry(self, item: ImportItem) -> None:
        item.status = "staged"
        item.artifact_ref = None
        item.error_message = None
        item.summary = _stage_summary(
            stage="staged",
            stage_summary="File staged for retry.",
            summary=_without_failed_stage(item.summary),
        )
        self.session.flush()

    def update_item_stage(
        self,
        item: ImportItem,
        stage: str,
        status: str = "complete",
        progress: int | None = None,
        stage_summary: str | None = None,
        summary: dict[str, object] | None = None,
        diagnostics: dict[str, object] | None = None,
        artifact_ref: str | None = None,
        error_message: str | None = None,
    ) -> None:
        if status == "failed":
            item.status = "failed"
        elif stage == "indexed":
            item.status = "succeeded"
        else:
            item.status = stage
        item.summary = _stage_summary(
            stage=stage,
            status=status,
            progress=progress,
            stage_summary=stage_summary,
            summary={**(item.summary or {}), **(summary or {})},
            diagnostics=diagnostics,
        )
        if artifact_ref is not None:
            item.artifact_ref = artifact_ref
        item.error_message = error_message
        self.session.flush()

    def get_batch(self, project_id: int, batch_id: int) -> ImportBatch | None:
        return (
            self.session.query(ImportBatch)
            .filter(ImportBatch.project_id == project_id, ImportBatch.id == batch_id)
            .first()
        )

    def list_batches(self, project_id: int, limit: int = 20) -> list[ImportBatch]:
        return (
            self.session.query(ImportBatch)
            .filter(ImportBatch.project_id == project_id)
            .order_by(ImportBatch.updated_at.desc(), ImportBatch.id.desc())
            .limit(limit)
            .all()
        )

    def list_items(self, project_id: int, batch_id: int | None = None) -> list[ImportItem]:
        query = self.session.query(ImportItem).filter(ImportItem.project_id == project_id)
        if batch_id is not None:
            query = query.filter(ImportItem.batch_id == batch_id)
        return query.order_by(ImportItem.id).all()


class DocumentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_source(
        self,
        project_id: int,
        import_item_id: int,
        title: str,
        document_type: str,
        source_ref: str,
        metadata: dict[str, object] | None = None,
    ) -> DocumentSource:
        source = DocumentSource(
            project_id=project_id,
            import_item_id=import_item_id,
            title=title,
            document_type=document_type,
            source_ref=source_ref,
            source_metadata=metadata or {},
        )
        self.session.add(source)
        self.session.flush()
        return source

    def create_chunk(
        self,
        project_id: int,
        document_id: int,
        chunk_index: int,
        heading: str | None,
        content: str,
        source_ref: str,
        metadata: dict[str, object] | None = None,
    ) -> DocumentChunk:
        chunk = DocumentChunk(
            project_id=project_id,
            document_id=document_id,
            chunk_index=chunk_index,
            heading=heading,
            content=content,
            token_count=len(content.split()),
            source_ref=source_ref,
            content_hash=hashlib.sha256(content.encode("utf-8")).hexdigest(),
            chunk_metadata=metadata or {},
        )
        self.session.add(chunk)
        self.session.flush()
        return chunk

    def get_or_create_entity(
        self,
        project_id: int,
        canonical_name: str,
        entity_type: str,
        aliases: list[str],
        confidence: float,
        source_refs: list[str],
        metadata: dict[str, object] | None = None,
    ) -> ExtractedEntity:
        entity = (
            self.session.query(ExtractedEntity)
            .filter(
                ExtractedEntity.project_id == project_id,
                ExtractedEntity.canonical_name == canonical_name,
                ExtractedEntity.entity_type == entity_type,
            )
            .first()
        )
        if entity is None:
            entity = ExtractedEntity(
                project_id=project_id,
                canonical_name=canonical_name,
                entity_type=entity_type,
                aliases=_unique_strings(aliases),
                confidence=confidence,
                source_refs=_unique_strings(source_refs),
                entity_metadata=metadata or {},
            )
            self.session.add(entity)
            self.session.flush()
            return entity

        entity.aliases = _unique_strings([*(entity.aliases or []), *aliases])
        entity.source_refs = _unique_strings([*(entity.source_refs or []), *source_refs])
        entity.confidence = max(entity.confidence, confidence)
        entity.entity_metadata = {**(entity.entity_metadata or {}), **(metadata or {})}
        self.session.flush()
        return entity

    def create_relationship(
        self,
        project_id: int,
        source_entity_id: int,
        target_entity_id: int,
        relationship_type: str,
        confidence: float,
        status: str,
        evidence_summary: str,
        evidence_payload: dict[str, object],
        source_refs: list[str],
    ) -> ExtractedRelationship:
        existing = (
            self.session.query(ExtractedRelationship)
            .filter(
                ExtractedRelationship.project_id == project_id,
                ExtractedRelationship.source_entity_id == source_entity_id,
                ExtractedRelationship.target_entity_id == target_entity_id,
                ExtractedRelationship.relationship_type == relationship_type,
                ExtractedRelationship.evidence_summary == evidence_summary,
            )
            .first()
        )
        if existing is not None:
            evidence_payload = payload_with_evidence_refs(
                existing.evidence_payload or {},
                existing.source_refs or [],
                source_refs,
            )
            existing.source_refs = _unique_strings(
                normalize_evidence_refs(evidence_payload.get("source_refs"))
            )
            existing.evidence_payload = evidence_payload
            existing.confidence = max(existing.confidence, confidence)
            self.session.flush()
            return existing

        evidence_payload = payload_with_evidence_refs(evidence_payload, source_refs)
        relationship = ExtractedRelationship(
            project_id=project_id,
            source_entity_id=source_entity_id,
            target_entity_id=target_entity_id,
            relationship_type=relationship_type,
            confidence=confidence,
            status=status,
            evidence_summary=evidence_summary,
            evidence_payload=evidence_payload,
            source_refs=_unique_strings(
                normalize_evidence_refs(evidence_payload.get("source_refs"))
            ),
        )
        self.session.add(relationship)
        self.session.flush()
        return relationship


def _unique_strings(values: list[str]) -> list[str]:
    seen = set()
    unique = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


_IMPORT_STAGE_PROGRESS = {
    "staged": 5,
    "parsed": 20,
    "profiled": 40,
    "extracted": 60,
    "resolved": 75,
    "graphed": 90,
    "indexed": 100,
    "failed": 100,
}


def _stage_summary(
    stage: str,
    status: str = "complete",
    progress: int | None = None,
    stage_summary: str | None = None,
    summary: dict[str, object] | None = None,
    diagnostics: dict[str, object] | None = None,
) -> dict[str, object]:
    next_summary = {
        key: value
        for key, value in (summary or {}).items()
        if key not in {"stage", "stages"}
    }
    stages = _merged_stage_entries(
        existing=(summary or {}).get("stages"),
        stage={
            "name": stage,
            "status": status,
            "progress": progress
            if progress is not None
            else _IMPORT_STAGE_PROGRESS.get(stage, 0),
            "summary": stage_summary or _default_stage_summary(stage),
            **({"diagnostics": diagnostics} if diagnostics is not None else {}),
        },
    )
    return {
        **next_summary,
        "stage": stage,
        "stages": stages,
    }


def _without_failed_stage(summary: dict[str, object] | None) -> dict[str, object]:
    next_summary = {
        key: value
        for key, value in (summary or {}).items()
        if key not in {"failed_stage", "stage"}
    }
    stages = next_summary.get("stages")
    if isinstance(stages, list):
        next_summary["stages"] = [
            stage
            for stage in stages
            if isinstance(stage, dict) and stage.get("name") != "failed"
        ]
    return next_summary


def _merged_stage_entries(
    existing: object,
    stage: dict[str, object],
) -> list[dict[str, object]]:
    stages = [
        entry
        for entry in (existing if isinstance(existing, list) else [])
        if isinstance(entry, dict) and isinstance(entry.get("name"), str)
    ]
    without_current = [entry for entry in stages if entry.get("name") != stage["name"]]
    without_current.append(stage)
    return sorted(
        without_current,
        key=lambda entry: _IMPORT_STAGE_PROGRESS.get(str(entry.get("name")), 0),
    )


def _default_stage_summary(stage: str) -> str:
    summaries = {
        "staged": "File staged for import.",
        "parsed": "Source parsed.",
        "profiled": "Structured profiles created.",
        "extracted": "Entities and relationships extracted.",
        "resolved": "Cross-source relationships resolved.",
        "graphed": "Graph nodes and edges written.",
        "indexed": "Evidence indexed.",
        "failed": "Import item failed.",
    }
    return summaries.get(stage, f"{stage} complete.")


def _relationship_suggestion_semantic_key(
    source_sheet: str,
    source_field: str,
    target_sheet: str | None,
    target_field: str | None,
    relationship_type: str,
) -> RelationshipSuggestionSemanticKey:
    return (
        source_sheet.casefold(),
        source_field.casefold(),
        target_sheet.casefold() if target_sheet is not None else None,
        target_field.casefold() if target_field is not None else None,
        relationship_type.casefold(),
    )
