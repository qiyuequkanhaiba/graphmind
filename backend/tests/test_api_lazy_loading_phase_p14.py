from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.storage.database import create_session_factory
from graphmind.storage.models import (
    DocumentChunk,
    DocumentSource,
    ExtractedEntity,
    ExtractedRelationship,
    GraphEdge,
    GraphNode,
    ImportBatch,
    ImportItem,
)
from graphmind.storage.repositories import ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def test_source_chunks_support_paginated_response(tmp_workspace):
    client = _client_with_seeded_lazy_loading_project(tmp_workspace)

    response = client.get("/api/projects/1/sources/1/chunks?limit=2&offset=1")

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 2
    assert body["offset"] == 1
    assert body["total"] == 4
    assert body["has_more"] is True
    assert [chunk["chunk_index"] for chunk in body["items"]] == [1, 2]


def test_entities_and_extracted_relationships_support_pagination(tmp_workspace):
    client = _client_with_seeded_lazy_loading_project(tmp_workspace)

    entities_response = client.get("/api/projects/1/entities?limit=2&offset=1")
    relationships_response = client.get(
        "/api/projects/1/extracted-relationships?limit=1&offset=1"
    )

    assert entities_response.status_code == 200
    assert entities_response.json()["total"] == 3
    assert [entity["canonical_name"] for entity in entities_response.json()["items"]] == [
        "Entity B",
        "Entity C",
    ]
    assert relationships_response.status_code == 200
    assert relationships_response.json()["total"] == 2
    assert relationships_response.json()["items"][0]["relationship_type"] == "references"


def test_graph_endpoint_supports_status_and_type_filters(tmp_workspace):
    client = _client_with_seeded_lazy_loading_project(tmp_workspace)

    response = client.get("/api/projects/1/graph?edge_status=suggested&edge_type=foreign_key")

    assert response.status_code == 200
    body = response.json()
    assert [edge["edge_type"] for edge in body["edges"]] == ["foreign_key"]
    assert [edge["status"] for edge in body["edges"]] == ["suggested"]


def _client_with_seeded_lazy_loading_project(tmp_workspace):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    paths = WorkspacePaths(tmp_workspace)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        ProjectRepository(session).create_project("Lazy loading API")
        batch = ImportBatch(
            project_id=1,
            label="Docs",
            status="succeeded",
            progress=100,
            summary={},
            error_message=None,
        )
        session.add(batch)
        session.flush()
        item = ImportItem(
            batch_id=batch.id,
            project_id=1,
            filename="architecture.md",
            file_type=".md",
            source_kind="document",
            status="succeeded",
            raw_data_ref="uploads/architecture.md",
            artifact_ref="document_sources:1",
            error_message=None,
            summary={},
        )
        session.add(item)
        session.flush()
        source = DocumentSource(
            project_id=1,
            import_item_id=item.id,
            title="architecture.md",
            document_type="markdown",
            source_ref="architecture.md",
            source_metadata={},
        )
        session.add(source)
        session.flush()
        for index in range(4):
            session.add(
                DocumentChunk(
                    project_id=1,
                    document_id=source.id,
                    chunk_index=index,
                    heading=f"Part {index}",
                    content=f"Chunk {index}",
                    token_count=12,
                    source_ref=f"architecture.md#chunk-{index}",
                    content_hash=f"hash-{index}",
                    chunk_metadata={},
                )
            )
        for name in ("Entity A", "Entity B", "Entity C"):
            session.add(
                ExtractedEntity(
                    project_id=1,
                    canonical_name=name,
                    entity_type="concept",
                    aliases=[],
                    confidence=0.9,
                    source_refs=["architecture.md#chunk-0"],
                    entity_metadata={},
                )
            )
        session.flush()
        session.add_all(
            [
                ExtractedRelationship(
                    project_id=1,
                    source_entity_id=1,
                    target_entity_id=2,
                    relationship_type="mentions",
                    confidence=0.8,
                    status="suggested",
                    evidence_summary="A mentions B.",
                    evidence_payload={},
                    source_refs=["architecture.md#chunk-0"],
                ),
                ExtractedRelationship(
                    project_id=1,
                    source_entity_id=2,
                    target_entity_id=3,
                    relationship_type="references",
                    confidence=0.7,
                    status="suggested",
                    evidence_summary="B references C.",
                    evidence_payload={},
                    source_refs=["architecture.md#chunk-1"],
                ),
            ]
        )
        first_node = GraphNode(
            project_id=1,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        second_node = GraphNode(
            project_id=1,
            node_type="field",
            label="Customers.customer_id",
            source_ref="customers.customer_id",
            node_metadata={},
            position_x=100,
            position_y=0,
        )
        third_node = GraphNode(
            project_id=1,
            node_type="field",
            label="Orders.region",
            source_ref="orders.region",
            node_metadata={},
            position_x=200,
            position_y=0,
        )
        session.add_all([first_node, second_node, third_node])
        session.flush()
        session.add_all(
            [
                GraphEdge(
                    project_id=1,
                    source_node_id=first_node.id,
                    target_node_id=second_node.id,
                    edge_type="foreign_key",
                    confidence=0.94,
                    status="suggested",
                    evidence_ref="suggestion:1",
                    edge_metadata={},
                    created_from_suggestion_id=None,
                ),
                GraphEdge(
                    project_id=1,
                    source_node_id=first_node.id,
                    target_node_id=third_node.id,
                    edge_type="derived_dimension",
                    confidence=0.82,
                    status="accepted",
                    evidence_ref="suggestion:2",
                    edge_metadata={},
                    created_from_suggestion_id=None,
                ),
            ]
        )
        session.commit()
    return client
