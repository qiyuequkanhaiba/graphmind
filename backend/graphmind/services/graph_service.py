from collections.abc import Callable

from sqlalchemy.orm import Session

from graphmind.storage.models import GraphEdge, RelationshipSuggestion


class GraphService:
    VALID_DECISION_STATUSES = {"accepted", "edited", "rejected"}

    def __init__(self, session_factory: Callable[[], Session]) -> None:
        self.session_factory = session_factory

    def review_suggestion(
        self,
        suggestion_id: int,
        decision_status: str,
        decision_note: str | None,
        reviewed_by: str | None = None,
        relationship_type: str | None = None,
        evidence_quality: str | None = None,
        project_id: int | None = None,
    ) -> None:
        if decision_status not in self.VALID_DECISION_STATUSES:
            raise ValueError("decision_status must be accepted, edited, or rejected")
        if relationship_type is not None and relationship_type.strip() == "":
            raise ValueError("relationship_type must not be empty")
        if evidence_quality is not None and evidence_quality not in {"low", "medium", "high"}:
            raise ValueError("evidence_quality must be low, medium, or high")

        with self.session_factory() as session:
            suggestion = session.get(RelationshipSuggestion, suggestion_id)
            if suggestion is None:
                raise ValueError(f"Relationship suggestion not found: {suggestion_id}")
            if project_id is not None and suggestion.project_id != project_id:
                raise ValueError("Relationship suggestion not found")

            suggestion.decision_status = decision_status
            suggestion.decision_note = decision_note
            suggestion.reviewed_by = _normalize_reviewer(reviewed_by)
            if relationship_type is not None:
                suggestion.relationship_type = relationship_type
            if evidence_quality is not None:
                suggestion.evidence_payload = {
                    **(suggestion.evidence_payload or {}),
                    "review_evidence_quality": evidence_quality,
                }
            edge_updates: dict[str, object] = {"status": decision_status}
            if relationship_type is not None:
                edge_updates["edge_type"] = relationship_type
            (
                session.query(GraphEdge)
                .filter(GraphEdge.created_from_suggestion_id == suggestion_id)
                .update(edge_updates, synchronize_session=False)
            )
            if evidence_quality is not None:
                linked_edges = (
                    session.query(GraphEdge)
                    .filter(GraphEdge.created_from_suggestion_id == suggestion_id)
                    .all()
                )
                for edge in linked_edges:
                    edge.edge_metadata = {
                        **(edge.edge_metadata or {}),
                        "review_evidence_quality": evidence_quality,
                    }
            session.commit()


def _normalize_reviewer(reviewer: str | None) -> str | None:
    if reviewer is None:
        return None
    normalized = " ".join(reviewer.split())
    return normalized or None
