import pytest

from graphmind.services.embedding_provider import EmbeddingProviderResult
from graphmind.services.evidence_retrieval import EvidenceRetrievalService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import (
    Dataset,
    EvidenceIndexEntry,
    FieldProfile,
    GraphEdge,
    GraphNode,
    Project,
    RelationshipSuggestion,
    Sheet,
)
from graphmind.storage.workspace import WorkspacePaths


def test_evidence_retrieval_builds_documents_and_ranks_relationship_hits(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Retrieval Demo", settings={})
        session.add(project)
        session.flush()

        dataset = Dataset(
            project_id=project.id,
            filename="orders.csv",
            file_type="csv",
            raw_data_ref="imports/orders.csv",
        )
        session.add(dataset)
        session.flush()

        sheet = Sheet(
            dataset_id=dataset.id,
            name="Orders",
            normalized_name="orders",
            row_count=5,
            column_count=2,
            duckdb_table_name="orders",
        )
        session.add(sheet)
        session.flush()

        customer_id = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="identifier",
            null_count=0,
            unique_count=5,
            sample_values=["C-1", "C-2"],
            key_candidate_score=0.9,
        )
        amount = FieldProfile(
            sheet_id=sheet.id,
            original_name="Amount",
            normalized_name="amount",
            inferred_type="number",
            null_count=0,
            unique_count=5,
            sample_values=[120, 80],
            key_candidate_score=0.2,
        )
        session.add_all([customer_id, amount])
        session.flush()

        orders_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={"inferred_type": "identifier"},
            position_x=0,
            position_y=0,
        )
        customers_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Customers.id",
            source_ref="customers.id",
            node_metadata={"inferred_type": "identifier"},
            position_x=0,
            position_y=0,
        )
        amount_node = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.amount",
            source_ref="orders.amount",
            node_metadata={"inferred_type": "number"},
            position_x=0,
            position_y=0,
        )
        session.add_all([orders_node, customers_node, amount_node])
        session.flush()

        session.add(
            GraphEdge(
                project_id=project.id,
                source_node_id=orders_node.id,
                target_node_id=customers_node.id,
                edge_type="foreign_key",
                confidence=0.98,
                status="suggested",
                evidence_ref="suggestion:1",
                edge_metadata={"evidence_summary": "Customer IDs overlap."},
            )
        )
        session.add(
            RelationshipSuggestion(
                project_id=project.id,
                source_field_id=customer_id.id,
                target_field_id=amount.id,
                relationship_type="derived_dimension",
                confidence=0.71,
                evidence_summary="Amount has repeated values.",
                evidence_payload={"unique_count": 5},
                decision_status="pending",
            )
        )
        session.commit()
        project_id = project.id

    service = EvidenceRetrievalService(session_factory=session_factory)
    documents = service.build_documents(project_id)
    results = service.search(project_id, "customer id foreign key relationship", limit=2)
    metadata = service.build_index_metadata(project_id)

    assert len(documents) >= 5
    assert results[0].kind == "graph_edge"
    assert results[0].label == "Orders.customer_id -> Customers.id"
    assert "Customer IDs overlap" in results[0].content
    assert results[0].score > results[1].score
    assert metadata["index_status"] == "ready"
    assert metadata["document_count"] == len(documents)
    assert metadata["last_built_at"]


def test_evidence_retrieval_marks_empty_project_as_not_built(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Empty", settings={})
        session.add(project)
        session.commit()
        project_id = project.id

    metadata = EvidenceRetrievalService(session_factory=session_factory).build_index_metadata(
        project_id
    )

    assert metadata["index_status"] == "not_built"
    assert metadata["document_count"] == 0
    assert metadata["last_built_at"] is None


def test_build_index_persists_evidence_entries(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Persisted Index", settings={})
        session.add(project)
        session.flush()
        session.add(
            GraphNode(
                project_id=project.id,
                node_type="field",
                label="Orders.customer_id",
                source_ref="orders.customer_id",
                node_metadata={"inferred_type": "identifier"},
                position_x=0,
                position_y=0,
            )
        )
        session.commit()
        project_id = project.id

    service = EvidenceRetrievalService(session_factory=session_factory)
    metadata = service.build_index_metadata(project_id)
    service.build_index_metadata(project_id)

    with session_factory() as session:
        entries = (
            session.query(EvidenceIndexEntry)
            .filter(EvidenceIndexEntry.project_id == project_id)
            .all()
        )

    assert metadata["index_status"] == "ready"
    assert metadata["document_count"] == 1
    assert metadata["embedding_model"] == ""
    assert len(entries) == 1
    assert entries[0].document_id.startswith("node:")
    assert entries[0].kind == "graph_node"
    assert entries[0].label == "Orders.customer_id"
    assert "identifier" in entries[0].content
    assert entries[0].embedding is None
    assert entries[0].embedding_model is None


def test_build_index_stores_embeddings_when_provider_succeeds(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Embedded Index", settings={})
        session.add(project)
        session.flush()
        session.add_all(
            [
                GraphNode(
                    project_id=project.id,
                    node_type="field",
                    label="Orders.customer_id",
                    source_ref="orders.customer_id",
                    node_metadata={},
                    position_x=0,
                    position_y=0,
                ),
                GraphNode(
                    project_id=project.id,
                    node_type="field",
                    label="Revenue.amount",
                    source_ref="revenue.amount",
                    node_metadata={},
                    position_x=0,
                    position_y=0,
                ),
            ]
        )
        session.commit()
        project_id = project.id

    calls = []

    class FakeEmbeddingProvider:
        def embed(self, settings, inputs):
            calls.append((settings, inputs))
            return EmbeddingProviderResult(vectors=[[1.0, 0.0], [0.0, 1.0]])

    service = EvidenceRetrievalService(
        session_factory=session_factory,
        embedding_provider=FakeEmbeddingProvider(),
    )
    metadata = service.build_index_metadata(
        project_id,
        vector_settings={
            "provider": "openai-compatible",
            "model": "text-embedding-3-small",
            "base_url": "https://api.example.com/v1",
        },
    )

    with session_factory() as session:
        entries = (
            session.query(EvidenceIndexEntry)
            .filter(EvidenceIndexEntry.project_id == project_id)
            .order_by(EvidenceIndexEntry.id)
            .all()
        )

    assert metadata["index_status"] == "ready"
    assert metadata["document_count"] == 2
    assert metadata["embedding_model"] == "text-embedding-3-small"
    assert calls[0][0]["model"] == "text-embedding-3-small"
    assert len(calls[0][1]) == 2
    assert [entry.embedding for entry in entries] == [[1.0, 0.0], [0.0, 1.0]]
    assert {entry.embedding_model for entry in entries} == {"text-embedding-3-small"}


def test_search_uses_persisted_vector_similarity_when_query_embedding_available(
    tmp_workspace,
):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(
            name="Vector Search",
            settings={
                "ai": {
                    "vector": {
                        "provider": "openai-compatible",
                        "model": "text-embedding-3-small",
                        "base_url": "https://api.example.com/v1",
                    }
                }
            },
        )
        session.add(project)
        session.flush()
        session.add_all(
            [
                GraphNode(
                    project_id=project.id,
                    node_type="field",
                    label="Orders.customer_id",
                    source_ref="orders.customer_id",
                    node_metadata={},
                    position_x=0,
                    position_y=0,
                ),
                GraphNode(
                    project_id=project.id,
                    node_type="field",
                    label="Revenue.amount",
                    source_ref="revenue.amount",
                    node_metadata={},
                    position_x=0,
                    position_y=0,
                ),
            ]
        )
        session.commit()
        project_id = project.id

    class FakeEmbeddingProvider:
        def embed(self, _settings, inputs):
            if len(inputs) == 1:
                return EmbeddingProviderResult(vectors=[[0.0, 1.0]])
            return EmbeddingProviderResult(vectors=[[1.0, 0.0], [0.0, 1.0]])

    service = EvidenceRetrievalService(
        session_factory=session_factory,
        embedding_provider=FakeEmbeddingProvider(),
    )
    service.build_index_metadata(
        project_id,
        vector_settings={
            "provider": "openai-compatible",
            "model": "text-embedding-3-small",
            "base_url": "https://api.example.com/v1",
        },
    )

    results = service.search(project_id, "customer identifier", limit=2)

    assert results[0].label == "Revenue.amount"
    assert results[0].score == pytest.approx(1.0)


def test_search_falls_back_to_lexical_when_query_embedding_fails(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(
            name="Vector Fallback",
            settings={
                "ai": {
                    "vector": {
                        "provider": "openai-compatible",
                        "model": "text-embedding-3-small",
                        "base_url": "https://api.example.com/v1",
                    }
                }
            },
        )
        session.add(project)
        session.flush()
        session.add_all(
            [
                GraphNode(
                    project_id=project.id,
                    node_type="field",
                    label="Orders.customer_id",
                    source_ref="orders.customer_id",
                    node_metadata={},
                    position_x=0,
                    position_y=0,
                ),
                GraphNode(
                    project_id=project.id,
                    node_type="field",
                    label="Revenue.amount",
                    source_ref="revenue.amount",
                    node_metadata={},
                    position_x=0,
                    position_y=0,
                ),
            ]
        )
        session.commit()
        project_id = project.id

    class FakeEmbeddingProvider:
        def embed(self, _settings, inputs):
            if len(inputs) == 1:
                return EmbeddingProviderResult(
                    vectors=[],
                    fallback_reason="provider_request_failed",
                )
            return EmbeddingProviderResult(vectors=[[1.0, 0.0], [0.0, 1.0]])

    service = EvidenceRetrievalService(
        session_factory=session_factory,
        embedding_provider=FakeEmbeddingProvider(),
    )
    service.build_index_metadata(
        project_id,
        vector_settings={
            "provider": "openai-compatible",
            "model": "text-embedding-3-small",
            "base_url": "https://api.example.com/v1",
        },
    )

    results = service.search(project_id, "customer identifier", limit=2)

    assert results[0].label == "Orders.customer_id"
    assert results[0].score > 0


def test_search_deduplicates_repeated_import_evidence_by_semantic_identity(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Duplicate Evidence", settings={})
        session.add(project)
        session.flush()

        for _index in range(2):
            source_node = GraphNode(
                project_id=project.id,
                node_type="table",
                label="Orders",
                source_ref="orders",
                node_metadata={},
                position_x=0,
                position_y=0,
            )
            target_node = GraphNode(
                project_id=project.id,
                node_type="field",
                label="Orders.customer_id",
                source_ref="orders.customer_id",
                node_metadata={},
                position_x=0,
                position_y=0,
            )
            session.add_all([source_node, target_node])
            session.flush()
            session.add(
                GraphEdge(
                    project_id=project.id,
                    source_node_id=source_node.id,
                    target_node_id=target_node.id,
                    edge_type="contains_field",
                    confidence=1.0,
                    status="auto_trusted",
                    evidence_ref="field:Orders.customer_id",
                    edge_metadata={},
                )
            )

        session.commit()
        project_id = project.id

    service = EvidenceRetrievalService(session_factory=session_factory)
    results = service.search(project_id, "Orders customer_id field", limit=5)

    matching_results = [
        result
        for result in results
        if result.kind == "graph_edge" and result.label == "Orders -> Orders.customer_id"
    ]
    assert len(matching_results) == 1
