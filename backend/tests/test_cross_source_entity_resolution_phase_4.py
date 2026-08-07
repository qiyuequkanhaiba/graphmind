from pathlib import Path

from graphmind.core.graph_builder import GraphData, GraphEdgeData, GraphNodeData
from graphmind.services.entity_resolution import CrossSourceEntityResolutionService
from graphmind.services.import_service import ImportService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import GraphEdge, GraphNode
from graphmind.storage.repositories import DocumentRepository, ImportRepository, ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def _project_context(tmp_workspace: Path):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project("Resolution Project")
        session.commit()
        return paths, session_factory, project.id


def test_resolve_cross_source_entities_links_field_nodes_to_extracted_entities(
    tmp_workspace: Path,
):
    _paths, session_factory, project_id = _project_context(tmp_workspace)
    graph = GraphData(
        project_id=project_id,
        nodes=[
            GraphNodeData(
                id="field:customers.customer_id",
                node_type="field",
                label="Customers.customer_id",
                source_ref="p1_customers.customer_id",
                metadata={"inferred_type": "identifier"},
                position_x=0,
                position_y=0,
            ),
            GraphNodeData(
                id="entity:customer-id",
                node_type="entity",
                label="Customer ID",
                source_ref="entity:customer-id",
                metadata={
                    "entity_type": "concept",
                    "aliases": ["customerId"],
                    "source_refs": ["architecture.md#identity"],
                },
                position_x=0,
                position_y=80,
            ),
        ],
        edges=[
            GraphEdgeData(
                id="contains:customers.customer_id",
                source_node_id="field:customers.customer_id",
                target_node_id="entity:customer-id",
                edge_type="mentions",
                confidence=0.1,
                status="suggested",
                evidence_ref="seed",
                metadata={},
            )
        ],
    )
    with session_factory() as session:
        ImportRepository(session).add_graph(graph)
        session.commit()

    created_edges = CrossSourceEntityResolutionService(session_factory).resolve(project_id)

    assert len(created_edges) == 1
    with session_factory() as session:
        edge = (
            session.query(GraphEdge)
            .filter_by(project_id=project_id, edge_type="matches_entity")
            .one()
        )
        source = session.get(GraphNode, edge.source_node_id)
        target = session.get(GraphNode, edge.target_node_id)

        assert source is not None
        assert target is not None
        assert source.label == "Customers.customer_id"
        assert target.label == "Customer ID"
        assert edge.status == "suggested"
        assert edge.edge_metadata["rule"] == "normalized_name_match"


def test_batch_import_resolves_markdown_entity_to_csv_field(
    tmp_workspace: Path,
    tmp_path: Path,
):
    customers = tmp_path / "customers.csv"
    customers.write_text("id,customer_id,name\nc1,c1,Alice\n", encoding="utf-8")
    architecture = tmp_path / "architecture.md"
    architecture.write_text(
        "# Identity\nThe account model maps customerId to the Customer ID field.\n",
        encoding="utf-8",
    )
    paths, session_factory, project_id = _project_context(tmp_workspace)

    result = ImportService(paths, session_factory).import_structured_batch(
        project_id,
        [customers, architecture],
        label="Resolution batch",
    )

    assert result.graph_edge_count >= 1
    with session_factory() as session:
        edges = (
            session.query(GraphEdge)
            .filter_by(project_id=project_id, edge_type="matches_entity")
            .all()
        )
        nodes_by_id = {
            node.id: node
            for node in session.query(GraphNode).filter(GraphNode.project_id == project_id).all()
        }
        edge_labels = [
            (
                nodes_by_id[edge.source_node_id].label,
                nodes_by_id[edge.target_node_id].label,
                edge.edge_metadata,
            )
            for edge in edges
        ]

        assert any(
            source == "customers.customer_id"
            and target in {"customerId", "Customer ID"}
            and metadata["rule"] == "normalized_name_match"
            for source, target, metadata in edge_labels
        )


def test_resolve_cross_source_entities_creates_documented_mapping_between_fields(
    tmp_workspace: Path,
):
    _paths, session_factory, project_id = _project_context(tmp_workspace)
    graph = GraphData(
        project_id=project_id,
        nodes=[
            GraphNodeData(
                id="field:customers.customer_id",
                node_type="field",
                label="customers.customer_id",
                source_ref="p1_customers.customer_id",
                metadata={"inferred_type": "identifier"},
                position_x=0,
                position_y=0,
            ),
            GraphNodeData(
                id="field:orders.customer_id",
                node_type="field",
                label="orders.customer_id",
                source_ref="p1_orders.customer_id",
                metadata={"inferred_type": "identifier"},
                position_x=0,
                position_y=80,
            ),
            GraphNodeData(
                id="entity:customer-id",
                node_type="entity",
                label="Customer ID",
                source_ref="entity:customer-id",
                metadata={
                    "entity_type": "concept",
                    "aliases": [],
                    "source_refs": ["identity.md#chunk-1"],
                },
                position_x=0,
                position_y=160,
            ),
            GraphNodeData(
                id="entity:customerid",
                node_type="entity",
                label="customerId",
                source_ref="entity:customerid",
                metadata={
                    "entity_type": "concept",
                    "aliases": [],
                    "source_refs": ["identity.md#chunk-1"],
                },
                position_x=0,
                position_y=240,
            ),
        ],
        edges=[],
    )
    with session_factory() as session:
        ImportRepository(session).add_graph(graph)
        document_repository = DocumentRepository(session)
        source_entity = document_repository.get_or_create_entity(
            project_id=project_id,
            canonical_name="Customer ID",
            entity_type="concept",
            aliases=[],
            confidence=0.9,
            source_refs=["identity.md#chunk-1"],
            metadata={"rule": "identifier_name"},
        )
        target_entity = document_repository.get_or_create_entity(
            project_id=project_id,
            canonical_name="customerId",
            entity_type="concept",
            aliases=[],
            confidence=0.9,
            source_refs=["identity.md#chunk-1"],
            metadata={"rule": "identifier_name"},
        )
        document_repository.create_relationship(
            project_id=project_id,
            source_entity_id=source_entity.id,
            target_entity_id=target_entity.id,
            relationship_type="maps_to",
            confidence=0.92,
            status="suggested",
            evidence_summary="Customer ID maps to customerId.",
            evidence_payload={"rule": "field_mapping_phrase"},
            source_refs=["identity.md#chunk-1"],
        )
        session.commit()

    CrossSourceEntityResolutionService(session_factory).resolve(project_id)

    with session_factory() as session:
        edge = (
            session.query(GraphEdge)
            .filter_by(project_id=project_id, edge_type="documented_mapping")
            .one()
        )
        source = session.get(GraphNode, edge.source_node_id)
        target = session.get(GraphNode, edge.target_node_id)

        assert source is not None
        assert target is not None
        assert {source.label, target.label} == {
            "customers.customer_id",
            "orders.customer_id",
        }
        assert edge.status == "suggested"
        assert edge.evidence_ref == "identity.md#chunk-1"
        assert edge.edge_metadata["rule"] == "documented_field_mapping"
        assert edge.edge_metadata["document_relationship_id"] > 0
        assert edge.edge_metadata["source_refs"] == ["identity.md#chunk-1"]
        assert "Customer ID maps to customerId" in edge.edge_metadata["evidence_summary"]


def test_batch_import_uses_documented_maps_to_relationships_between_fields(
    tmp_workspace: Path,
    tmp_path: Path,
):
    customers = tmp_path / "customers.csv"
    customers.write_text("customer_id,name\nc1,Alice\n", encoding="utf-8")
    orders = tmp_path / "orders.csv"
    orders.write_text("customer_id,total\nc1,42\n", encoding="utf-8")
    identity = tmp_path / "identity.md"
    identity.write_text(
        "# Identity\nCustomer ID maps to customerId.\n",
        encoding="utf-8",
    )
    paths, session_factory, project_id = _project_context(tmp_workspace)

    ImportService(paths, session_factory).import_structured_batch(
        project_id,
        [customers, orders, identity],
        label="Documented mapping batch",
    )

    with session_factory() as session:
        edges = (
            session.query(GraphEdge)
            .filter_by(project_id=project_id, edge_type="documented_mapping")
            .all()
        )
        nodes_by_id = {
            node.id: node
            for node in session.query(GraphNode).filter(GraphNode.project_id == project_id).all()
        }
        edge_labels = [
            (
                nodes_by_id[edge.source_node_id].label,
                nodes_by_id[edge.target_node_id].label,
                edge.edge_metadata,
            )
            for edge in edges
        ]

        assert any(
            {source, target} == {"customers.customer_id", "orders.customer_id"}
            and metadata["rule"] == "documented_field_mapping"
            and metadata["source_refs"] == ["identity.md#identity"]
            and "Customer ID maps to customerId" in metadata["evidence_summary"]
            for source, target, metadata in edge_labels
        )
