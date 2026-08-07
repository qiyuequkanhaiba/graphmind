from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from graphmind.core.profiling import SheetProfileData
from graphmind.core.relationships import RelationshipSuggestionData


@dataclass(frozen=True)
class GraphNodeData:
    id: str
    node_type: str
    label: str
    source_ref: str
    metadata: dict[str, Any]
    position_x: float
    position_y: float


@dataclass(frozen=True)
class GraphEdgeData:
    id: str
    source_node_id: str
    target_node_id: str
    edge_type: str
    confidence: float
    status: str
    evidence_ref: str
    metadata: dict[str, Any]


@dataclass(frozen=True)
class GraphData:
    project_id: int
    nodes: list[GraphNodeData]
    edges: list[GraphEdgeData]


def _table_node_id(sheet_name: str) -> str:
    return f"table:{sheet_name}"


def _field_node_id(sheet_name: str, field_name: str) -> str:
    return f"field:{sheet_name}.{field_name}"


def _dimension_node_id(sheet_name: str, field_name: str) -> str:
    return f"dimension:{sheet_name}.{field_name}"


def _unique_id(base_id: str, used_ids: set[str]) -> str:
    if base_id not in used_ids:
        used_ids.add(base_id)
        return base_id

    suffix = 2
    while f"{base_id}#{suffix}" in used_ids:
        suffix += 1

    unique_id = f"{base_id}#{suffix}"
    used_ids.add(unique_id)
    return unique_id


def build_graph(
    project_id: int,
    profiles: list[SheetProfileData],
    suggestions: list[RelationshipSuggestionData],
) -> GraphData:
    nodes: list[GraphNodeData] = []
    edges: list[GraphEdgeData] = []
    node_ids: set[str] = set()
    edge_ids: set[str] = set()
    field_lookup: dict[tuple[str, str], str] = {}

    for table_index, profile in enumerate(profiles):
        table_id = _unique_id(_table_node_id(profile.name), node_ids)
        profile_metadata = _profile_graph_metadata(profile)
        nodes.append(
            GraphNodeData(
                id=table_id,
                node_type="table",
                label=profile.name,
                source_ref=profile.duckdb_table_name,
                metadata={
                    "row_count": profile.row_count,
                    "column_count": profile.column_count,
                    **profile_metadata,
                },
                position_x=80.0 + table_index * 280.0,
                position_y=80.0,
            )
        )
        for field_index, field in enumerate(profile.fields):
            field_id = _unique_id(_field_node_id(profile.name, field.normalized_name), node_ids)
            field_lookup.setdefault((profile.name, field.normalized_name), field_id)
            nodes.append(
                GraphNodeData(
                    id=field_id,
                    node_type="field",
                    label=f"{profile.name}.{field.normalized_name}",
                    source_ref=f"{profile.duckdb_table_name}.{field.normalized_name}",
                    metadata={
                        "inferred_type": field.inferred_type,
                        "key_candidate_score": field.key_candidate_score,
                        **profile_metadata,
                    },
                    position_x=80.0 + table_index * 280.0,
                    position_y=180.0 + field_index * 72.0,
                )
            )
            edges.append(
                GraphEdgeData(
                    id=_unique_id(f"contains:{table_id}->{field_id}", edge_ids),
                    source_node_id=table_id,
                    target_node_id=field_id,
                    edge_type="contains_field",
                    confidence=1.0,
                    status="auto_trusted",
                    evidence_ref=field_id,
                    metadata={},
                )
            )

    for index, suggestion in enumerate(suggestions):
        source_id = field_lookup.get((suggestion.source_sheet, suggestion.source_field))
        if source_id is None:
            continue

        if suggestion.relationship_type == "derived_dimension":
            target_id = _unique_id(
                _dimension_node_id(suggestion.source_sheet, suggestion.source_field),
                node_ids,
            )
            nodes.append(
                GraphNodeData(
                    id=target_id,
                    node_type="derived_entity",
                    label=f"{suggestion.source_field} values",
                    source_ref=source_id,
                    metadata=suggestion.evidence_payload,
                    position_x=640.0,
                    position_y=120.0 + index * 80.0,
                )
            )
        else:
            if suggestion.target_sheet is None or suggestion.target_field is None:
                continue
            target_id = field_lookup.get((suggestion.target_sheet, suggestion.target_field))
            if target_id is None:
                continue

        edges.append(
            GraphEdgeData(
                id=_unique_id(f"suggestion:{index}", edge_ids),
                source_node_id=source_id,
                target_node_id=target_id,
                edge_type=suggestion.relationship_type,
                confidence=suggestion.confidence,
                status="suggested",
                evidence_ref=f"suggestion:{index}",
                metadata={
                    "evidence_summary": suggestion.evidence_summary,
                    "evidence_payload": suggestion.evidence_payload,
                },
            )
        )

    return GraphData(project_id=project_id, nodes=nodes, edges=edges)


def _profile_graph_metadata(profile: SheetProfileData) -> dict[str, Any]:
    metadata = dict(profile.metadata or {})
    if metadata.get("import_status") == "internal":
        metadata.setdefault("source_kind", "extracted_relationship_anchor")
    return metadata
