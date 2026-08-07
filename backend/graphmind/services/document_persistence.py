from __future__ import annotations

from dataclasses import dataclass

from graphmind.core.graph_builder import GraphData, GraphEdgeData, GraphNodeData
from graphmind.services.document_import import ParsedDocument
from graphmind.storage.repositories import DocumentRepository, ImportRepository


@dataclass(frozen=True)
class PersistedDocumentImport:
    document_id: int
    chunk_count: int
    entity_count: int
    relationship_count: int
    graph_node_count: int
    graph_edge_count: int


def persist_parsed_document(
    project_id: int,
    item,
    parsed: ParsedDocument,
    document_repository: DocumentRepository,
    import_repository: ImportRepository,
) -> PersistedDocumentImport:
    source = document_repository.create_source(
        project_id=project_id,
        import_item_id=item.id,
        title=parsed.title,
        document_type=parsed.document_type,
        source_ref=parsed.source_ref,
        metadata=parsed.metadata,
    )
    chunks = [
        document_repository.create_chunk(
            project_id=project_id,
            document_id=source.id,
            chunk_index=index,
            heading=chunk.heading,
            content=chunk.content,
            source_ref=chunk.source_ref,
            metadata=chunk.metadata,
        )
        for index, chunk in enumerate(parsed.chunks)
    ]
    entities = {
        (entity.canonical_name, entity.entity_type): document_repository.get_or_create_entity(
            project_id=project_id,
            canonical_name=entity.canonical_name,
            entity_type=entity.entity_type,
            aliases=entity.aliases,
            confidence=entity.confidence,
            source_refs=entity.source_refs,
            metadata=entity.metadata,
        )
        for entity in parsed.entities
    }
    relationships = []
    for relationship in parsed.relationships:
        source_entity = entities.get((relationship.source_name, relationship.source_type))
        if source_entity is None:
            source_entity = document_repository.get_or_create_entity(
                project_id=project_id,
                canonical_name=relationship.source_name,
                entity_type=relationship.source_type,
                aliases=[],
                confidence=relationship.confidence,
                source_refs=relationship.source_refs,
                metadata={"rule": "relationship_source"},
            )
            entities[(relationship.source_name, relationship.source_type)] = source_entity
        target_entity = entities.get((relationship.target_name, relationship.target_type))
        if target_entity is None:
            target_entity = document_repository.get_or_create_entity(
                project_id=project_id,
                canonical_name=relationship.target_name,
                entity_type=relationship.target_type,
                aliases=[],
                confidence=relationship.confidence,
                source_refs=relationship.source_refs,
                metadata={"rule": "relationship_target"},
            )
            entities[(relationship.target_name, relationship.target_type)] = target_entity
        relationships.append(
            document_repository.create_relationship(
                project_id=project_id,
                source_entity_id=source_entity.id,
                target_entity_id=target_entity.id,
                relationship_type=relationship.relationship_type,
                confidence=relationship.confidence,
                status=relationship.status,
                evidence_summary=relationship.evidence_summary,
                evidence_payload=relationship.evidence_payload,
                source_refs=relationship.source_refs,
            )
        )

    import_repository.add_extracted_relationship_suggestions(project_id, relationships)
    graph = document_graph(project_id, source, list(entities.values()), relationships)
    saved_nodes, saved_edges = import_repository.add_graph(graph)
    return PersistedDocumentImport(
        document_id=source.id,
        chunk_count=len(chunks),
        entity_count=len(entities),
        relationship_count=len(relationships),
        graph_node_count=len(saved_nodes),
        graph_edge_count=len(saved_edges),
    )


def document_graph(project_id: int, source, entities, relationships) -> GraphData:
    document_node_id = f"document:{source.id}"
    nodes = [
        GraphNodeData(
            id=document_node_id,
            node_type="document",
            label=source.title,
            source_ref=source.source_ref,
            metadata={
                "document_type": source.document_type,
                "import_item_id": source.import_item_id,
            },
            position_x=120.0,
            position_y=320.0,
        )
    ]
    entity_node_ids: dict[int, str] = {}
    for index, entity in enumerate(entities):
        node_type = (
            "code_symbol"
            if entity.entity_type in {"class", "function", "module"}
            else "entity"
        )
        node_id = f"entity:{entity.id}"
        entity_node_ids[entity.id] = node_id
        nodes.append(
            GraphNodeData(
                id=node_id,
                node_type=node_type,
                label=entity.canonical_name,
                source_ref=f"entity:{entity.id}",
                metadata={
                    "entity_type": entity.entity_type,
                    "confidence": entity.confidence,
                    "source_refs": entity.source_refs,
                },
                position_x=420.0,
                position_y=260.0 + index * 80.0,
            )
        )

    edges = []
    for entity in entities:
        target_id = entity_node_ids.get(entity.id)
        if target_id is None:
            continue
        edges.append(
            GraphEdgeData(
                id=f"document-contains:{source.id}:{entity.id}",
                source_node_id=document_node_id,
                target_node_id=target_id,
                edge_type="contains",
                confidence=1.0,
                status="auto_trusted",
                evidence_ref=source.source_ref,
                metadata={"evidence_summary": f"{source.title} contains {entity.canonical_name}."},
            )
        )

    for relationship in relationships:
        source_node_id = entity_node_ids.get(relationship.source_entity_id)
        target_node_id = entity_node_ids.get(relationship.target_entity_id)
        if source_node_id is None or target_node_id is None:
            continue
        evidence_ref = (
            relationship.source_refs[0]
            if isinstance(relationship.source_refs, list) and relationship.source_refs
            else f"extracted_relationship:{relationship.id}"
        )
        edges.append(
            GraphEdgeData(
                id=f"extracted:{relationship.id}",
                source_node_id=source_node_id,
                target_node_id=target_node_id,
                edge_type=relationship.relationship_type,
                confidence=relationship.confidence,
                status=relationship.status,
                evidence_ref=evidence_ref,
                metadata={
                    "evidence_summary": relationship.evidence_summary,
                    "evidence_payload": relationship.evidence_payload,
                    "source_refs": relationship.source_refs,
                },
            )
        )

    return GraphData(project_id=project_id, nodes=nodes, edges=edges)
