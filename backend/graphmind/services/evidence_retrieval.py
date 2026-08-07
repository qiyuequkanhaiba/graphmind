from __future__ import annotations

import re
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from math import sqrt
from typing import Any

from sqlalchemy.orm import Session

from graphmind.services.embedding_provider import OpenAICompatibleEmbeddingProvider
from graphmind.storage.models import (
    Dataset,
    DocumentChunk,
    DocumentSource,
    EvidenceIndexEntry,
    ExtractedEntity,
    ExtractedRelationship,
    FieldProfile,
    GraphEdge,
    GraphNode,
    Project,
    RelationshipSuggestion,
    Sheet,
)


@dataclass(frozen=True)
class EvidenceDocument:
    id: str
    kind: str
    label: str
    content: str
    source_ref: str
    score: float = 0.0


class EvidenceRetrievalService:
    def __init__(
        self,
        session_factory: Callable[[], Session],
        embedding_provider: Any | None = None,
    ) -> None:
        self.session_factory = session_factory
        self.embedding_provider = embedding_provider or OpenAICompatibleEmbeddingProvider()

    def build_documents(self, project_id: int) -> list[EvidenceDocument]:
        with self.session_factory() as session:
            graph_nodes = (
                session.query(GraphNode)
                .filter(GraphNode.project_id == project_id)
                .order_by(GraphNode.id)
                .all()
            )
            graph_edges = (
                session.query(GraphEdge)
                .filter(GraphEdge.project_id == project_id)
                .order_by(GraphEdge.id)
                .all()
            )
            node_by_id = {node.id: node for node in graph_nodes}
            fields = (
                session.query(FieldProfile)
                .join(Sheet)
                .join(Dataset)
                .filter(Dataset.project_id == project_id)
                .order_by(Sheet.name, FieldProfile.normalized_name)
                .all()
            )
            suggestions = (
                session.query(RelationshipSuggestion)
                .filter(RelationshipSuggestion.project_id == project_id)
                .order_by(RelationshipSuggestion.id)
                .all()
            )
            chunks = (
                session.query(DocumentChunk)
                .join(DocumentSource, DocumentSource.id == DocumentChunk.document_id)
                .filter(DocumentChunk.project_id == project_id)
                .order_by(DocumentSource.title, DocumentChunk.chunk_index)
                .all()
            )
            chunk_sources = {
                source.id: source
                for source in session.query(DocumentSource)
                .filter(DocumentSource.project_id == project_id)
                .all()
            }
            extracted_relationships = (
                session.query(ExtractedRelationship)
                .filter(ExtractedRelationship.project_id == project_id)
                .order_by(ExtractedRelationship.id)
                .all()
            )
            extracted_entities = {
                entity.id: entity
                for entity in session.query(ExtractedEntity)
                .filter(ExtractedEntity.project_id == project_id)
                .all()
            }
            field_labels = {
                field.id: f"{field.sheet.name}.{field.normalized_name}"
                for field in fields
                if field.sheet is not None
            }

        documents: list[EvidenceDocument] = []
        documents.extend(_node_document(node) for node in graph_nodes)
        documents.extend(
            _edge_document(edge, node_by_id)
            for edge in graph_edges
            if edge.source_node_id in node_by_id and edge.target_node_id in node_by_id
        )
        documents.extend(_field_document(field) for field in fields if field.sheet is not None)
        documents.extend(
            _suggestion_document(suggestion, field_labels)
            for suggestion in suggestions
            if suggestion.source_field_id in field_labels
        )
        documents.extend(
            _chunk_document(chunk, chunk_sources[chunk.document_id])
            for chunk in chunks
            if chunk.document_id in chunk_sources
        )
        documents.extend(
            _extracted_relationship_document(relationship, extracted_entities)
            for relationship in extracted_relationships
            if relationship.source_entity_id in extracted_entities
            and relationship.target_entity_id in extracted_entities
        )
        return documents

    def search(self, project_id: int, query: str, limit: int = 5) -> list[EvidenceDocument]:
        query_tokens = _tokens(query)
        if not query_tokens:
            return []

        stored_documents = self._stored_documents(project_id)
        if stored_documents:
            vector_results = self._vector_search(project_id, query, stored_documents, limit)
            if vector_results:
                return vector_results
            return _lexical_search(stored_documents, query_tokens, limit)

        return _lexical_search(self.build_documents(project_id), query_tokens, limit)

    def build_index_metadata(
        self,
        project_id: int,
        vector_settings: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        documents = self.build_documents(project_id)
        with self.session_factory() as session:
            session.query(EvidenceIndexEntry).filter(
                EvidenceIndexEntry.project_id == project_id
            ).delete(synchronize_session=False)
            if not documents:
                session.commit()
                return {
                    "index_status": "not_built",
                    "document_count": 0,
                    "last_built_at": None,
                    "embedding_model": "",
                }

            vectors = self._document_embeddings(documents, vector_settings)
            embedding_model = _embedding_model(vector_settings) if vectors else ""
            entries = [
                EvidenceIndexEntry(
                    project_id=project_id,
                    document_id=document.id,
                    kind=document.kind,
                    label=document.label,
                    content=document.content,
                    source_ref=document.source_ref,
                    embedding=vectors[index] if vectors else None,
                    embedding_model=embedding_model or None,
                )
                for index, document in enumerate(documents)
            ]
            session.add_all(entries)
            session.commit()

        return {
            "index_status": "ready",
            "document_count": len(documents),
            "last_built_at": datetime.now(UTC).isoformat(),
            "embedding_model": embedding_model,
        }

    def _stored_documents(self, project_id: int) -> list[EvidenceDocument]:
        with self.session_factory() as session:
            entries = (
                session.query(EvidenceIndexEntry)
                .filter(EvidenceIndexEntry.project_id == project_id)
                .order_by(EvidenceIndexEntry.id)
                .all()
            )
            return [
                EvidenceDocument(
                    id=entry.document_id,
                    kind=entry.kind,
                    label=entry.label,
                    content=entry.content,
                    source_ref=entry.source_ref,
                )
                for entry in entries
            ]

    def _vector_search(
        self,
        project_id: int,
        query: str,
        documents: list[EvidenceDocument],
        limit: int,
    ) -> list[EvidenceDocument]:
        vector_settings = self._vector_settings(project_id)
        if _embedding_model(vector_settings) == "":
            return []

        query_result = self.embedding_provider.embed(vector_settings, [query])
        if len(query_result.vectors) != 1:
            return []
        query_vector = query_result.vectors[0]

        with self.session_factory() as session:
            entries = (
                session.query(EvidenceIndexEntry)
                .filter(EvidenceIndexEntry.project_id == project_id)
                .order_by(EvidenceIndexEntry.id)
                .all()
            )

        scored = []
        document_by_id = {document.id: document for document in documents}
        for entry in entries:
            if not isinstance(entry.embedding, list):
                continue
            score = _cosine_similarity(query_vector, entry.embedding)
            if score > 0:
                document = document_by_id.get(entry.document_id)
                if document is None:
                    continue
                scored.append(
                    EvidenceDocument(
                        id=document.id,
                        kind=document.kind,
                        label=document.label,
                        content=document.content,
                        source_ref=document.source_ref,
                        score=score,
                    )
                )

        return _dedupe_ranked_documents(scored)[:limit]

    def _document_embeddings(
        self,
        documents: list[EvidenceDocument],
        vector_settings: dict[str, Any] | None,
    ) -> list[list[float]]:
        if _embedding_model(vector_settings) == "":
            return []

        result = self.embedding_provider.embed(
            vector_settings or {},
            [_embedding_text(document) for document in documents],
        )
        if len(result.vectors) != len(documents):
            return []
        return result.vectors

    def _vector_settings(self, project_id: int) -> dict[str, Any]:
        with self.session_factory() as session:
            project = session.get(Project, project_id)
            if project is None or not isinstance(project.settings, dict):
                return {}
            ai_settings = project.settings.get("ai")
            if not isinstance(ai_settings, dict):
                return {}
            vector_settings = ai_settings.get("vector")
            return vector_settings if isinstance(vector_settings, dict) else {}


def _node_document(node: GraphNode) -> EvidenceDocument:
    metadata_text = _metadata_text(node.node_metadata)
    content = (
        f"{node.label} is a {node.node_type} node from {node.source_ref}. {metadata_text}"
    ).strip()
    return EvidenceDocument(
        id=f"node:{node.id}",
        kind="graph_node",
        label=node.label,
        content=content,
        source_ref=node.source_ref,
    )


def _edge_document(edge: GraphEdge, node_by_id: dict[int, GraphNode]) -> EvidenceDocument:
    source = node_by_id[edge.source_node_id]
    target = node_by_id[edge.target_node_id]
    label = f"{source.label} -> {target.label}"
    evidence_summary = (
        edge.edge_metadata.get("evidence_summary")
        if isinstance(edge.edge_metadata, dict)
        else None
    )
    content = (
        f"{label} is a {edge.edge_type} relationship with {round(edge.confidence * 100)}% "
        f"confidence and status {edge.status}. Evidence: {evidence_summary or edge.evidence_ref}."
    )
    return EvidenceDocument(
        id=f"edge:{edge.id}",
        kind="graph_edge",
        label=label,
        content=content,
        source_ref=edge.evidence_ref,
    )


def _field_document(field: FieldProfile) -> EvidenceDocument:
    label = f"{field.sheet.name}.{field.normalized_name}"
    sample_values = ", ".join(str(value) for value in field.sample_values[:3])
    content = (
        f"{label} is a {field.inferred_type} field with {field.unique_count} unique values, "
        f"{field.null_count} null values, key score {field.key_candidate_score:.2f}. "
        f"Samples: {sample_values}."
    )
    return EvidenceDocument(
        id=f"field:{field.id}",
        kind="field_profile",
        label=label,
        content=content,
        source_ref=label,
    )


def _suggestion_document(
    suggestion: RelationshipSuggestion, field_labels: dict[int, str]
) -> EvidenceDocument:
    source_label = field_labels[suggestion.source_field_id]
    target_label = (
        field_labels.get(suggestion.target_field_id)
        if suggestion.target_field_id is not None
        else None
    )
    label = f"{source_label} -> {target_label}" if target_label is not None else source_label
    content = (
        f"{label} is a {suggestion.relationship_type} suggestion with "
        f"{round(suggestion.confidence * 100)}% confidence and status "
        f"{suggestion.decision_status}. Evidence: {suggestion.evidence_summary}."
    )
    return EvidenceDocument(
        id=f"suggestion:{suggestion.id}",
        kind="relationship_suggestion",
        label=label,
        content=content,
        source_ref=f"suggestion:{suggestion.id}",
    )


def _chunk_document(chunk: DocumentChunk, source: DocumentSource) -> EvidenceDocument:
    label = (
        f"{source.title} · {chunk.heading}"
        if chunk.heading and chunk.heading != source.title
        else source.title
    )
    return EvidenceDocument(
        id=f"document_chunk:{chunk.id}",
        kind="document_chunk",
        label=label,
        content=chunk.content,
        source_ref=chunk.source_ref,
    )


def _extracted_relationship_document(
    relationship: ExtractedRelationship,
    entities: dict[int, ExtractedEntity],
) -> EvidenceDocument:
    source = entities[relationship.source_entity_id]
    target = entities[relationship.target_entity_id]
    label = f"{source.canonical_name} -> {target.canonical_name}"
    content = (
        f"{label} is a {relationship.relationship_type} relationship with "
        f"{round(relationship.confidence * 100)}% confidence and status {relationship.status}. "
        f"Evidence: {relationship.evidence_summary}."
    )
    source_ref = (
        relationship.source_refs[0]
        if isinstance(relationship.source_refs, list) and relationship.source_refs
        else f"extracted_relationship:{relationship.id}"
    )
    return EvidenceDocument(
        id=f"extracted_relationship:{relationship.id}",
        kind="extracted_relationship",
        label=label,
        content=content,
        source_ref=source_ref,
    )


def _score_document(query_tokens: list[str], document: EvidenceDocument) -> float:
    document_tokens = Counter(_tokens(f"{document.label} {document.content} {document.source_ref}"))
    score = sum(document_tokens[token] for token in query_tokens)
    if document.kind in {"graph_edge", "relationship_suggestion"}:
        score *= 1.4
    return float(score)


def _lexical_search(
    documents: list[EvidenceDocument], query_tokens: list[str], limit: int
) -> list[EvidenceDocument]:
    scored = []
    for document in documents:
        score = _score_document(query_tokens, document)
        if score > 0:
            scored.append(
                EvidenceDocument(
                    id=document.id,
                    kind=document.kind,
                    label=document.label,
                    content=document.content,
                    source_ref=document.source_ref,
                    score=score,
                )
            )
    return _dedupe_ranked_documents(scored)[:limit]


def _dedupe_ranked_documents(documents: list[EvidenceDocument]) -> list[EvidenceDocument]:
    ranked = sorted(documents, key=lambda document: (-document.score, document.kind, document.id))
    unique_documents = []
    seen_keys = set()
    for document in ranked:
        key = (
            document.kind,
            document.label.casefold(),
            document.source_ref.casefold(),
            " ".join(document.content.casefold().split()),
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        unique_documents.append(document)
    return unique_documents


def _embedding_model(vector_settings: dict[str, Any] | None) -> str:
    if not isinstance(vector_settings, dict):
        return ""
    provider = str(vector_settings.get("provider") or "").strip()
    model = str(vector_settings.get("model") or "").strip()
    base_url = str(vector_settings.get("base_url") or "").strip()
    if provider != "openai-compatible" or not model or not base_url:
        return ""
    return model


def _embedding_text(document: EvidenceDocument) -> str:
    return "\n".join(
        [
            f"Label: {document.label}",
            f"Kind: {document.kind}",
            f"Source: {document.source_ref}",
            document.content,
        ]
    )


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0
    dot_product = sum(
        left_value * right_value for left_value, right_value in zip(left, right, strict=True)
    )
    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot_product / (left_norm * right_norm)


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+|[\u4e00-\u9fff]+", text.lower().replace("_", " "))


def _metadata_text(metadata: dict[str, Any]) -> str:
    if not isinstance(metadata, dict) or not metadata:
        return ""
    return " ".join(f"{key}: {value}" for key, value in metadata.items())
