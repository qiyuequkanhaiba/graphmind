from __future__ import annotations

import re
from collections.abc import Callable

from sqlalchemy.orm import Session

from graphmind.core.graph_builder import GraphData, GraphEdgeData
from graphmind.storage.models import ExtractedEntity, ExtractedRelationship, GraphEdge, GraphNode
from graphmind.storage.repositories import ImportRepository


class CrossSourceEntityResolutionService:
    def __init__(self, session_factory: Callable[[], Session]) -> None:
        self.session_factory = session_factory

    def resolve(self, project_id: int, session: Session | None = None) -> list[GraphEdge]:
        if session is None:
            with self.session_factory() as owned_session:
                edges = self.resolve(project_id, session=owned_session)
                owned_session.commit()
                return edges

        return resolve_cross_source_entities(project_id, session)


def resolve_cross_source_entities(project_id: int, session: Session) -> list[GraphEdge]:
    graph_nodes = (
        session.query(GraphNode)
        .filter(GraphNode.project_id == project_id)
        .order_by(GraphNode.id)
        .all()
    )
    field_nodes = [node for node in graph_nodes if node.node_type == "field"]
    entity_nodes = [
        node
        for node in graph_nodes
        if node.node_type in {"code_symbol", "entity"}
        and _entity_type(node) not in {"file", "module"}
    ]
    edges = []
    for field_node in field_nodes:
        field_keys = _field_match_keys(field_node)
        if not field_keys:
            continue
        for entity_node in entity_nodes:
            entity_keys = _entity_match_keys(entity_node)
            shared_keys = sorted(field_keys.intersection(entity_keys))
            if not shared_keys:
                continue
            edges.append(
                GraphEdgeData(
                    id=f"entity-resolution:{field_node.id}:{entity_node.id}",
                    source_node_id=f"node:{field_node.id}",
                    target_node_id=f"node:{entity_node.id}",
                    edge_type="matches_entity",
                    confidence=0.78,
                    status="suggested",
                    evidence_ref=f"entity_resolution:{field_node.id}:{entity_node.id}",
                    metadata={
                        "rule": "normalized_name_match",
                        "field_label": field_node.label,
                        "entity_label": entity_node.label,
                        "matched_keys": shared_keys,
                        "evidence_summary": (
                            f"{field_node.label} matches extracted entity {entity_node.label} "
                            "by normalized name."
                        ),
                    },
                )
            )

    edges.extend(_documented_mapping_edges(project_id, session, field_nodes))

    if not edges:
        return []

    graph = GraphData(project_id=project_id, nodes=[], edges=edges)
    _existing_node_passthrough(graph_nodes, graph)
    _saved_nodes, saved_edges = ImportRepository(session).add_graph(graph)
    return saved_edges


def _documented_mapping_edges(
    project_id: int,
    session: Session,
    field_nodes: list[GraphNode],
) -> list[GraphEdgeData]:
    relationships = (
        session.query(ExtractedRelationship)
        .filter(
            ExtractedRelationship.project_id == project_id,
            ExtractedRelationship.relationship_type == "maps_to",
        )
        .order_by(ExtractedRelationship.id)
        .all()
    )
    if not relationships:
        return []

    fields_by_key = _field_nodes_by_match_key(field_nodes)
    entities_by_id = {
        entity.id: entity
        for entity in session.query(ExtractedEntity)
        .filter(ExtractedEntity.project_id == project_id)
        .all()
    }
    edges: list[GraphEdgeData] = []
    for relationship in relationships:
        source_entity = entities_by_id.get(relationship.source_entity_id)
        target_entity = entities_by_id.get(relationship.target_entity_id)
        if source_entity is None or target_entity is None:
            continue
        source_fields = _fields_for_extracted_entity(source_entity, fields_by_key)
        target_fields = _fields_for_extracted_entity(target_entity, fields_by_key)
        for source_field, target_field in _documented_mapping_field_pairs(
            source_fields,
            target_fields,
        ):
                source_refs = relationship.source_refs or []
                evidence_ref = (
                    source_refs[0]
                    if source_refs
                    else f"extracted_relationship:{relationship.id}"
                )
                edges.append(
                    GraphEdgeData(
                        id=(
                            "documented-mapping:"
                            f"{relationship.id}:{source_field.id}:{target_field.id}"
                        ),
                        source_node_id=f"node:{source_field.id}",
                        target_node_id=f"node:{target_field.id}",
                        edge_type="documented_mapping",
                        confidence=min(0.95, max(0.5, relationship.confidence)),
                        status="suggested",
                        evidence_ref=evidence_ref,
                        metadata={
                            "rule": "documented_field_mapping",
                            "document_relationship_id": relationship.id,
                            "source_entity": source_entity.canonical_name,
                            "target_entity": target_entity.canonical_name,
                            "source_refs": source_refs,
                            "evidence_summary": relationship.evidence_summary,
                            "evidence_payload": relationship.evidence_payload or {},
                        },
                    )
                )
    return edges


def _existing_node_passthrough(nodes: list[GraphNode], graph: GraphData) -> None:
    from graphmind.core.graph_builder import GraphNodeData

    for node in nodes:
        graph.nodes.append(
            GraphNodeData(
                id=f"node:{node.id}",
                node_type=node.node_type,
                label=node.label,
                source_ref=node.source_ref,
                metadata=node.node_metadata or {},
                position_x=node.position_x,
                position_y=node.position_y,
            )
        )


def _field_match_keys(node: GraphNode) -> set[str]:
    candidates = {node.label}
    if "." in node.label:
        candidates.add(node.label.rsplit(".", maxsplit=1)[-1])
    if "." in node.source_ref:
        candidates.add(node.source_ref.rsplit(".", maxsplit=1)[-1])
    return _match_keys(candidates)


def _entity_match_keys(node: GraphNode) -> set[str]:
    metadata = node.node_metadata or {}
    candidates = {node.label}
    aliases = metadata.get("aliases")
    if isinstance(aliases, list):
        candidates.update(str(alias) for alias in aliases)
    source_refs = metadata.get("source_refs")
    if isinstance(source_refs, list):
        candidates.update(str(source_ref).rsplit("#", maxsplit=1)[-1] for source_ref in source_refs)
    return _match_keys(candidates)


def _field_nodes_by_match_key(field_nodes: list[GraphNode]) -> dict[str, list[GraphNode]]:
    fields_by_key: dict[str, list[GraphNode]] = {}
    for node in field_nodes:
        for key in _field_match_keys(node):
            fields_by_key.setdefault(key, []).append(node)
    return fields_by_key


def _fields_for_extracted_entity(
    entity: ExtractedEntity,
    fields_by_key: dict[str, list[GraphNode]],
) -> list[GraphNode]:
    candidates = {entity.canonical_name, *(entity.aliases or [])}
    fields: list[GraphNode] = []
    for key in _match_keys(candidates):
        fields.extend(fields_by_key.get(key, []))
    return _unique_nodes(fields)


def _documented_mapping_field_pairs(
    source_fields: list[GraphNode],
    target_fields: list[GraphNode],
) -> list[tuple[GraphNode, GraphNode]]:
    source_fields = _unique_nodes(source_fields)
    target_fields = _unique_nodes(target_fields)
    if {field.id for field in source_fields} == {field.id for field in target_fields}:
        ordered_fields = sorted(source_fields, key=lambda field: field.id)
        return [
            (source_field, target_field)
            for index, source_field in enumerate(ordered_fields)
            for target_field in ordered_fields[index + 1 :]
        ]

    pairs: list[tuple[GraphNode, GraphNode]] = []
    seen = set()
    for source_field in source_fields:
        for target_field in target_fields:
            if source_field.id == target_field.id:
                continue
            key = (source_field.id, target_field.id)
            if key in seen:
                continue
            seen.add(key)
            pairs.append((source_field, target_field))
    return pairs


def _entity_type(node: GraphNode) -> str:
    value = (node.node_metadata or {}).get("entity_type")
    return str(value) if value is not None else ""


def _match_keys(values: set[str]) -> set[str]:
    keys = set()
    for value in values:
        words = _identifier_words(value)
        if len(words) < 2:
            continue
        keys.add("".join(words))
    return keys


def _identifier_words(value: str) -> list[str]:
    leaf = value.rsplit("::", maxsplit=1)[-1]
    leaf = leaf.rsplit("/", maxsplit=1)[-1]
    leaf = leaf.rsplit(".", maxsplit=1)[-1]
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", leaf)
    return re.findall(r"[a-z0-9]+", spaced.lower())


def _unique_nodes(nodes: list[GraphNode]) -> list[GraphNode]:
    seen = set()
    unique = []
    for node in nodes:
        if node.id in seen:
            continue
        seen.add(node.id)
        unique.append(node)
    return unique
