from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy.orm import Session

from graphmind.storage.models import FieldProfile, GraphEdge, Project, RelationshipSuggestion


@dataclass(frozen=True)
class DuplicateSuggestionGroup:
    canonical_suggestion_id: int
    duplicate_suggestion_ids: list[int]
    source_label: str
    target_label: str | None
    relationship_type: str


@dataclass(frozen=True)
class RelationshipGovernanceSummary:
    total_suggestion_count: int
    visible_suggestion_count: int
    duplicate_suggestion_count: int
    duplicate_group_count: int
    pending_suggestion_count: int
    accepted_suggestion_count: int
    rejected_suggestion_count: int
    edited_suggestion_count: int
    duplicate_groups: list[DuplicateSuggestionGroup]


@dataclass(frozen=True)
class RelationshipDuplicateCleanupResult:
    removed_duplicate_count: int
    relinked_edge_count: int
    remaining_duplicate_count: int
    duplicate_groups: list[DuplicateSuggestionGroup]


RelationshipSuggestionKey = tuple[str, str | None, str]


class RelationshipGovernanceService:
    def __init__(self, session_factory: Callable[[], Session]) -> None:
        self.session_factory = session_factory

    def get_summary(self, project_id: int) -> RelationshipGovernanceSummary:
        with self.session_factory() as session:
            self._ensure_project(session, project_id)
            suggestions = self._project_suggestions(session, project_id)
            field_labels = self._field_labels(session, suggestions)
            duplicate_groups = self._duplicate_groups(suggestions, field_labels)
            duplicate_count = sum(len(group.duplicate_suggestion_ids) for group in duplicate_groups)
            status_counts = self._status_counts(suggestions)
            return RelationshipGovernanceSummary(
                total_suggestion_count=len(suggestions),
                visible_suggestion_count=len(suggestions) - duplicate_count,
                duplicate_suggestion_count=duplicate_count,
                duplicate_group_count=len(duplicate_groups),
                pending_suggestion_count=status_counts.get("pending", 0),
                accepted_suggestion_count=status_counts.get("accepted", 0),
                rejected_suggestion_count=status_counts.get("rejected", 0),
                edited_suggestion_count=status_counts.get("edited", 0),
                duplicate_groups=duplicate_groups,
            )

    def cleanup_duplicates(self, project_id: int) -> RelationshipDuplicateCleanupResult:
        with self.session_factory() as session:
            self._ensure_project(session, project_id)
            suggestions = self._project_suggestions(session, project_id)
            field_labels = self._field_labels(session, suggestions)
            duplicate_groups = self._duplicate_groups(suggestions, field_labels)
            canonical_by_duplicate_id = {
                duplicate_id: group.canonical_suggestion_id
                for group in duplicate_groups
                for duplicate_id in group.duplicate_suggestion_ids
            }
            relinked_edge_count = 0
            if canonical_by_duplicate_id:
                linked_edges = (
                    session.query(GraphEdge)
                    .filter(
                        GraphEdge.project_id == project_id,
                        GraphEdge.created_from_suggestion_id.in_(
                            canonical_by_duplicate_id.keys()
                        ),
                    )
                    .all()
                )
                for edge in linked_edges:
                    canonical_id = canonical_by_duplicate_id.get(edge.created_from_suggestion_id)
                    if canonical_id is not None:
                        edge.created_from_suggestion_id = canonical_id
                        relinked_edge_count += 1

                (
                    session.query(RelationshipSuggestion)
                    .filter(RelationshipSuggestion.id.in_(canonical_by_duplicate_id.keys()))
                    .delete(synchronize_session=False)
                )
            session.commit()

            remaining_summary = self.get_summary(project_id)
            return RelationshipDuplicateCleanupResult(
                removed_duplicate_count=len(canonical_by_duplicate_id),
                relinked_edge_count=relinked_edge_count,
                remaining_duplicate_count=remaining_summary.duplicate_suggestion_count,
                duplicate_groups=duplicate_groups,
            )

    def _ensure_project(self, session: Session, project_id: int) -> None:
        if session.get(Project, project_id) is None:
            raise ValueError(f"Project not found: {project_id}")

    def _project_suggestions(
        self, session: Session, project_id: int
    ) -> list[RelationshipSuggestion]:
        return (
            session.query(RelationshipSuggestion)
            .filter(RelationshipSuggestion.project_id == project_id)
            .order_by(RelationshipSuggestion.id)
            .all()
        )

    def _field_labels(
        self,
        session: Session,
        suggestions: list[RelationshipSuggestion],
    ) -> dict[int, str]:
        field_ids = {
            field_id
            for suggestion in suggestions
            for field_id in (suggestion.source_field_id, suggestion.target_field_id)
            if field_id is not None
        }
        fields = (
            session.query(FieldProfile).filter(FieldProfile.id.in_(field_ids)).all()
            if field_ids
            else []
        )
        return {
            field.id: f"{field.sheet.name}.{field.normalized_name}"
            for field in fields
            if field.sheet is not None
        }

    def _duplicate_groups(
        self,
        suggestions: list[RelationshipSuggestion],
        field_labels: dict[int, str],
    ) -> list[DuplicateSuggestionGroup]:
        grouped: dict[RelationshipSuggestionKey, list[RelationshipSuggestion]] = {}
        for suggestion in suggestions:
            key = (
                field_labels.get(suggestion.source_field_id, "Unknown field").casefold(),
                (
                    field_labels.get(suggestion.target_field_id, "Unknown field").casefold()
                    if suggestion.target_field_id is not None
                    else None
                ),
                suggestion.relationship_type.casefold(),
            )
            grouped.setdefault(key, []).append(suggestion)

        duplicate_groups = []
        for group in grouped.values():
            if len(group) < 2:
                continue
            canonical = group[0]
            target_label = (
                field_labels.get(canonical.target_field_id)
                if canonical.target_field_id is not None
                else None
            )
            duplicate_groups.append(
                DuplicateSuggestionGroup(
                    canonical_suggestion_id=canonical.id,
                    duplicate_suggestion_ids=[suggestion.id for suggestion in group[1:]],
                    source_label=field_labels.get(canonical.source_field_id, "Unknown field"),
                    target_label=target_label,
                    relationship_type=canonical.relationship_type,
                )
            )
        return duplicate_groups

    def _status_counts(self, suggestions: list[RelationshipSuggestion]) -> dict[str, int]:
        counts: dict[str, int] = {}
        for suggestion in suggestions:
            counts[suggestion.decision_status] = counts.get(suggestion.decision_status, 0) + 1
        return counts
