from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.services.document_import import parse_document_file
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import (
    Dataset,
    DocumentChunk,
    DocumentSource,
    ExtractedEntity,
    ExtractedRelationship,
    GraphEdge,
    GraphNode,
    ImportItem,
    RelationshipSuggestion,
)
from graphmind.storage.repositories import (
    DocumentRepository,
    ImportBatchRepository,
    ProjectRepository,
)
from graphmind.storage.workspace import WorkspacePaths


def _project_context(tmp_workspace: Path):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project("Document Project")
        session.commit()
        return paths, session_factory, project.id


def _document_item(session_factory, project_id: int):
    with session_factory() as session:
        batch_repository = ImportBatchRepository(session)
        batch = batch_repository.create_batch(project_id, "Document batch")
        item = batch_repository.create_item(
            batch_id=batch.id,
            project_id=project_id,
            filename="architecture.md",
            file_type="md",
            source_kind="document",
            raw_data_ref="import_batches/project_1/batch_1/architecture.md",
        )
        session.commit()
        return item.id


def test_document_repository_persists_sources_chunks_entities_and_relationships(
    tmp_workspace: Path,
):
    _paths, session_factory, project_id = _project_context(tmp_workspace)
    item_id = _document_item(session_factory, project_id)

    with session_factory() as session:
        repository = DocumentRepository(session)
        source = repository.create_source(
            project_id=project_id,
            import_item_id=item_id,
            title="architecture.md",
            document_type="markdown",
            source_ref="architecture.md",
            metadata={"parser": "markdown"},
        )
        first_chunk = repository.create_chunk(
            project_id=project_id,
            document_id=source.id,
            chunk_index=0,
            heading="Overview",
            content="GraphMind imports Markdown and links to /api/projects.",
            source_ref="architecture.md#overview",
            metadata={"line_start": 1},
        )
        repository.create_chunk(
            project_id=project_id,
            document_id=source.id,
            chunk_index=1,
            heading="API",
            content="The /api/projects endpoint belongs to the backend service.",
            source_ref="architecture.md#api",
            metadata={"line_start": 4},
        )
        api_entity = repository.get_or_create_entity(
            project_id=project_id,
            canonical_name="/api/projects",
            entity_type="endpoint",
            aliases=[],
            confidence=0.95,
            source_refs=[first_chunk.source_ref],
            metadata={"rule": "api_path"},
        )
        duplicate = repository.get_or_create_entity(
            project_id=project_id,
            canonical_name="/api/projects",
            entity_type="endpoint",
            aliases=["projects api"],
            confidence=0.75,
            source_refs=["architecture.md#api"],
            metadata={"rule": "api_path"},
        )
        document_entity = repository.get_or_create_entity(
            project_id=project_id,
            canonical_name="architecture.md",
            entity_type="file",
            aliases=[],
            confidence=1.0,
            source_refs=["architecture.md"],
            metadata={"rule": "document_source"},
        )
        relationship = repository.create_relationship(
            project_id=project_id,
            source_entity_id=document_entity.id,
            target_entity_id=api_entity.id,
            relationship_type="mentions",
            confidence=0.85,
            status="suggested",
            evidence_summary="architecture.md mentions /api/projects.",
            evidence_payload={"chunk_id": first_chunk.id},
            source_refs=[first_chunk.source_ref],
        )
        session.commit()

    with session_factory() as session:
        assert duplicate.id == api_entity.id
        sources = session.query(DocumentSource).filter_by(project_id=project_id).all()
        chunks = (
            session.query(DocumentChunk)
            .filter_by(project_id=project_id)
            .order_by(DocumentChunk.chunk_index)
            .all()
        )
        entities = (
            session.query(ExtractedEntity)
            .filter_by(project_id=project_id)
            .order_by(ExtractedEntity.canonical_name)
            .all()
        )
        relationships = session.query(ExtractedRelationship).filter_by(project_id=project_id).all()

        assert [source.title for source in sources] == ["architecture.md"]
        assert [chunk.heading for chunk in chunks] == ["Overview", "API"]
        assert chunks[0].token_count == 7
        assert [entity.canonical_name for entity in entities] == [
            "/api/projects",
            "architecture.md",
        ]
        assert entities[0].aliases == ["projects api"]
        assert sorted(entities[0].source_refs) == [
            "architecture.md#api",
            "architecture.md#overview",
        ]
        assert relationships[0].id == relationship.id
        assert relationships[0].relationship_type == "mentions"
        assert relationships[0].evidence_payload == {
            "chunk_id": first_chunk.id,
            "evidence_refs": [first_chunk.source_ref],
            "source_refs": [first_chunk.source_ref],
        }


def test_parse_markdown_extracts_heading_chunks_links_and_api_paths(tmp_path: Path):
    source = tmp_path / "architecture.md"
    source.write_text(
        "# Overview\n"
        "GraphMind calls [Project API](/api/projects) and stores notes in docs/plan.md.\n\n"
        "## Runtime\n"
        "See https://example.com/runbook for operations.\n",
        encoding="utf-8",
    )

    parsed = parse_document_file(source)

    assert parsed.document_type == "markdown"
    assert [chunk.heading for chunk in parsed.chunks] == ["Overview", "Runtime"]
    assert any(entity.canonical_name == "/api/projects" for entity in parsed.entities)
    assert any(entity.canonical_name == "https://example.com/runbook" for entity in parsed.entities)
    assert any(
        relationship.relationship_type == "references"
        and relationship.target_name == "/api/projects"
        for relationship in parsed.relationships
    )


def test_parse_nested_json_as_document_chunks(tmp_path: Path):
    source = tmp_path / "config.json"
    source.write_text(
        '{"service":{"name":"api","endpoint":"/api/projects","owner":"team@example.com"}}',
        encoding="utf-8",
    )

    parsed = parse_document_file(source)

    assert parsed.document_type == "json_document"
    assert [chunk.heading for chunk in parsed.chunks] == ["service"]
    assert "service.endpoint: /api/projects" in parsed.chunks[0].content
    assert any(entity.canonical_name == "team@example.com" for entity in parsed.entities)
    assert any(entity.entity_type == "endpoint" for entity in parsed.entities)


def test_parse_logs_extracts_events_and_trace_relationships(tmp_path: Path):
    source = tmp_path / "app.log"
    source.write_text(
        "2026-06-02T10:00:00Z ERROR api trace_id=abc123 GET /api/projects failed ERR-42\n"
        "2026-06-02T10:00:01Z WARN worker trace_id=abc123 retrying /api/projects\n",
        encoding="utf-8",
    )

    parsed = parse_document_file(source)

    assert parsed.document_type == "log"
    assert len(parsed.chunks) == 2
    assert parsed.chunks[0].metadata["level"] == "ERROR"
    assert any(entity.canonical_name == "ERR-42" for entity in parsed.entities)
    assert any(entity.canonical_name == "/api/projects" for entity in parsed.entities)
    assert any(
        relationship.relationship_type == "co_occurs_with"
        for relationship in parsed.relationships
    )


def test_parse_code_extracts_import_dependencies(tmp_path: Path):
    source = tmp_path / "service.py"
    source.write_text(
        "from graphmind.storage.repositories import DocumentRepository\n"
        "import json\n\n"
        "def run_import():\n"
        "    return DocumentRepository\n",
        encoding="utf-8",
    )

    parsed = parse_document_file(source)

    assert parsed.document_type == "code"
    assert any(entity.canonical_name == "service.py" for entity in parsed.entities)
    assert any(
        entity.canonical_name == "graphmind.storage.repositories"
        for entity in parsed.entities
    )
    assert any(
        relationship.relationship_type == "depends_on"
        and relationship.target_name == "graphmind.storage.repositories"
        for relationship in parsed.relationships
    )


def test_parse_docx_extracts_document_text(tmp_path: Path):
    source = tmp_path / "notes.docx"
    with ZipFile(source, "w") as archive:
        archive.writestr(
            "word/document.xml",
            """
            <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
              <w:body>
                <w:p><w:r><w:t>GraphMind Word notes mention /api/projects.</w:t></w:r></w:p>
              </w:body>
            </w:document>
            """,
        )

    parsed = parse_document_file(source)

    assert parsed.document_type == "word"
    assert parsed.chunks[0].content == "GraphMind Word notes mention /api/projects."
    assert any(entity.canonical_name == "/api/projects" for entity in parsed.entities)


def test_parse_docx_rejects_too_many_archive_entries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    source = tmp_path / "too-many.docx"
    with ZipFile(source, "w") as archive:
        archive.writestr("word/document.xml", "<document />")
        archive.writestr("word/a.xml", "<a />")
        archive.writestr("word/b.xml", "<b />")
    monkeypatch.setattr("graphmind.services.document_import.MAX_DOCX_ARCHIVE_ENTRIES", 2)

    with pytest.raises(ValueError, match="too many entries"):
        parse_document_file(source)


def test_parse_docx_rejects_excess_total_uncompressed_bytes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    source = tmp_path / "too-large.docx"
    with ZipFile(source, "w") as archive:
        archive.writestr("word/document.xml", "<document>large payload</document>")
        archive.writestr("word/extra.xml", "x" * 32)
    monkeypatch.setattr(
        "graphmind.services.document_import.MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES",
        40,
    )

    with pytest.raises(ValueError, match="uncompressed size"):
        parse_document_file(source)


def test_parse_docx_rejects_excess_compression_ratio(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    source = tmp_path / "high-ratio.docx"
    with ZipFile(source, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", "<document>" + ("a" * 4096) + "</document>")
    monkeypatch.setattr(
        "graphmind.services.document_import.MAX_DOCX_COMPRESSION_RATIO",
        2.0,
    )

    with pytest.raises(ValueError, match="compression ratio"):
        parse_document_file(source)


def test_parse_plain_text_splits_long_documents_into_stable_chunks(tmp_path: Path):
    source = tmp_path / "runbook.txt"
    first_paragraph = " ".join(
        [
            "The /api/projects endpoint reads customerId for graph imports."
            for _index in range(70)
        ]
    )
    second_paragraph = " ".join(
        [
            "The /api/orders endpoint writes orderId for downstream reconciliation."
            for _index in range(70)
        ]
    )
    source.write_text(f"{first_paragraph}\n\n{second_paragraph}", encoding="utf-8")

    parsed = parse_document_file(source)

    assert parsed.document_type == "document"
    assert len(parsed.chunks) > 1
    assert parsed.chunks[0].source_ref == "runbook.txt#chunk-1"
    assert parsed.chunks[1].source_ref == "runbook.txt#chunk-2"
    assert parsed.chunks[0].metadata["chunk_index"] == 0
    assert parsed.chunks[0].metadata["chunk_count"] == len(parsed.chunks)
    assert parsed.chunks[0].metadata["token_start"] == 0
    assert parsed.chunks[0].metadata["token_end"] > parsed.chunks[0].metadata["token_start"]
    assert parsed.chunks[1].metadata["token_start"] == parsed.chunks[0].metadata["token_end"]
    assert any(entity.canonical_name == "/api/projects" for entity in parsed.entities)
    assert any(entity.canonical_name == "orderId" for entity in parsed.entities)


def test_parse_document_extracts_mapping_and_sentence_cooccurrence_relationships(
    tmp_path: Path,
):
    source = tmp_path / "identity.txt"
    source.write_text(
        "Customer ID maps to customerId. "
        "The /api/projects endpoint uses customerId for identity lookup.",
        encoding="utf-8",
    )

    parsed = parse_document_file(source)

    mapping = [
        relationship
        for relationship in parsed.relationships
        if relationship.relationship_type == "maps_to"
    ]
    cooccurrences = [
        relationship
        for relationship in parsed.relationships
        if relationship.relationship_type == "co_occurs_with"
    ]

    assert any(
        relationship.source_name == "Customer ID"
        and relationship.target_name == "customerId"
        and relationship.evidence_payload["rule"] == "field_mapping_phrase"
        and relationship.source_refs == ["identity.txt"]
        for relationship in mapping
    )
    assert any(
        relationship.source_name == "/api/projects"
        and relationship.target_name == "customerId"
        and relationship.evidence_payload["rule"] == "sentence_entity_cooccurrence"
        and relationship.source_refs == ["identity.txt"]
        for relationship in cooccurrences
    )


def test_parse_pdf_extracts_text_from_tj_arrays_escaped_literals_and_hex_strings(
    tmp_path: Path,
):
    source = tmp_path / "runbook.pdf"
    source.write_bytes(_simple_pdf_bytes())

    parsed = parse_document_file(source)

    assert parsed.document_type == "pdf"
    assert "/api/projects" in parsed.chunks[0].content
    assert "Customer(ID) maps to customerId." in parsed.chunks[0].content
    assert any(entity.canonical_name == "/api/projects" for entity in parsed.entities)
    assert any(entity.canonical_name == "customerId" for entity in parsed.entities)


def test_import_service_imports_mixed_structured_and_document_batch(
    tmp_workspace: Path, tmp_path: Path
):
    from graphmind.services.import_service import ImportService

    customers = tmp_path / "customers.csv"
    customers.write_text("id,name\nc1,Alice\n", encoding="utf-8")
    architecture = tmp_path / "architecture.md"
    architecture.write_text(
        "# Overview\nGraphMind links to [Project API](/api/projects).\n",
        encoding="utf-8",
    )
    paths, session_factory, project_id = _project_context(tmp_workspace)

    result = ImportService(paths, session_factory).import_structured_batch(
        project_id,
        [customers, architecture],
        label="Mixed batch",
    )

    assert result.dataset_count == 1
    assert result.document_count == 1
    with session_factory() as session:
        items = (
            session.query(ImportItem)
            .filter(ImportItem.project_id == project_id)
            .order_by(ImportItem.filename)
            .all()
        )
        sources = session.query(DocumentSource).filter_by(project_id=project_id).all()
        chunks = session.query(DocumentChunk).filter_by(project_id=project_id).all()
        entities = session.query(ExtractedEntity).filter_by(project_id=project_id).all()
        suggestions = (
            session.query(RelationshipSuggestion)
            .filter_by(project_id=project_id)
            .order_by(RelationshipSuggestion.id)
            .all()
        )
        nodes = session.query(GraphNode).filter_by(project_id=project_id).all()
        edges = session.query(GraphEdge).filter_by(project_id=project_id).all()
        datasets = (
            session.query(Dataset)
            .filter_by(project_id=project_id, import_status="imported")
            .all()
        )
        internal_datasets = (
            session.query(Dataset)
            .filter_by(project_id=project_id, import_status="internal")
            .all()
        )

        assert [(item.filename, item.source_kind, item.status) for item in items] == [
            ("architecture.md", "document", "succeeded"),
            ("customers.csv", "table", "succeeded"),
        ]
        document_item = items[0]
        assert document_item.summary is not None
        assert [stage["name"] for stage in document_item.summary["stages"]] == [
            "staged",
            "parsed",
            "extracted",
            "graphed",
            "indexed",
        ]
        assert {stage["status"] for stage in document_item.summary["stages"]} == {"complete"}
        assert len(datasets) == 1
        assert [dataset.filename for dataset in internal_datasets] == [
            "__graphmind_extracted_relationships__"
        ]
        assert [source.document_type for source in sources] == ["markdown"]
        assert chunks[0].heading == "Overview"
        assert any(entity.canonical_name == "/api/projects" for entity in entities)
        assert suggestions
        assert any(
            suggestion.decision_status == "pending"
            and suggestion.evidence_payload["source_kind"] == "extracted_relationship"
            and suggestion.evidence_payload["source_refs"]
            for suggestion in suggestions
        )
        assert any(
            node.node_type == "document" and node.label == "architecture.md"
            for node in nodes
        )
        internal_nodes = [
            node
            for node in nodes
            if node.label == "Extracted entities"
            or node.label.startswith("Extracted entities.")
        ]
        assert internal_nodes
        assert all(node.node_metadata["import_status"] == "internal" for node in internal_nodes)
        assert all(
            node.node_metadata["source_kind"] == "extracted_relationship_anchor"
            for node in internal_nodes
        )
        assert any(node.node_type == "entity" and node.label == "/api/projects" for node in nodes)
        assert any(edge.edge_type == "mentions" for edge in edges)


def test_import_batch_endpoint_accepts_document_files(tmp_workspace: Path, tmp_path: Path):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Document API"}).json()["id"]
    architecture = tmp_path / "architecture.md"
    architecture.write_text(
        "# Overview\nGraphMind links to [Project API](/api/projects).\n",
        encoding="utf-8",
    )

    with architecture.open("rb") as upload:
        response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "Document batch"},
            files=[("files", ("architecture.md", upload, "text/markdown"))],
        )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["document_count"] == 1
    assert body["items"][0]["source_kind"] == "document"
    assert body["items"][0]["status"] == "succeeded"

    sources = client.get(f"/api/projects/{project_id}/sources").json()
    graph = client.get(f"/api/projects/{project_id}/graph").json()
    suggestions = client.get(f"/api/projects/{project_id}/relationship-suggestions").json()
    extracted_relationships = client.get(
        f"/api/projects/{project_id}/extracted-relationships"
    ).json()
    assert sources == [{"source_kind": "document", "count": 1}]
    assert any(
        node["node_type"] == "document" and node["label"] == "architecture.md"
        for node in graph["nodes"]
    )
    assert suggestions
    assert suggestions[0]["decision_status"] == "pending"
    assert suggestions[0]["source_label"] == extracted_relationships[0]["source_name"]
    assert suggestions[0]["target_label"] == extracted_relationships[0]["target_name"]
    assert not suggestions[0]["source_label"].startswith("Extracted entities.")
    assert suggestions[0]["evidence_payload"]["source_kind"] == "extracted_relationship"
    assert "source:extracted_relationship" in suggestions[0]["quality_reasons"]
    assert suggestions[0]["evidence_payload"]["evidence_refs"]
    assert extracted_relationships[0]["evidence_payload"]["evidence_refs"] == suggestions[0][
        "evidence_payload"
    ]["evidence_refs"]
    relationship_edges = [
        edge
        for edge in graph["edges"]
        if edge["edge_type"] == extracted_relationships[0]["relationship_type"]
    ]
    assert relationship_edges
    assert relationship_edges[0]["evidence_refs"] == suggestions[0]["evidence_payload"][
        "evidence_refs"
    ]


def test_import_batch_endpoint_persists_pdf_chunks_and_entities(
    tmp_workspace: Path,
    tmp_path: Path,
):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "PDF API"}).json()["id"]
    runbook = tmp_path / "runbook.pdf"
    runbook.write_bytes(_simple_pdf_bytes())

    with runbook.open("rb") as upload:
        response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "PDF batch"},
            files=[("files", ("runbook.pdf", upload, "application/pdf"))],
        )

    assert response.status_code == 200
    sources = client.get(f"/api/projects/{project_id}/sources/detail").json()
    chunks = client.get(f"/api/projects/{project_id}/sources/{sources[0]['id']}/chunks").json()
    entities = client.get(f"/api/projects/{project_id}/entities").json()

    assert sources[0]["title"] == "runbook.pdf"
    assert sources[0]["document_type"] == "pdf"
    assert sources[0]["metadata"]["parser"] == "pdf_text"
    assert "/api/projects" in chunks[0]["content"]
    assert "Customer(ID) maps to customerId." in chunks[0]["content"]
    assert any(entity["canonical_name"] == "/api/projects" for entity in entities)
    assert any(entity["canonical_name"] == "customerId" for entity in entities)


def test_import_batch_endpoint_persists_long_text_chunks_and_relationships(
    tmp_workspace: Path,
    tmp_path: Path,
):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Long Text API"}).json()["id"]
    runbook = tmp_path / "identity-runbook.txt"
    first_paragraph = " ".join(
        [
            "Customer ID maps to customerId. The /api/projects endpoint uses customerId."
            for _index in range(55)
        ]
    )
    second_paragraph = " ".join(
        [
            "Order ID maps to orderId. The /api/orders endpoint uses orderId."
            for _index in range(55)
        ]
    )
    runbook.write_text(f"{first_paragraph}\n\n{second_paragraph}", encoding="utf-8")

    with runbook.open("rb") as upload:
        response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "Long text batch"},
            files=[("files", ("identity-runbook.txt", upload, "text/plain"))],
        )

    assert response.status_code == 200
    sources = client.get(f"/api/projects/{project_id}/sources/detail").json()
    chunks = client.get(f"/api/projects/{project_id}/sources/{sources[0]['id']}/chunks").json()
    relationships = client.get(f"/api/projects/{project_id}/extracted-relationships").json()

    assert sources[0]["title"] == "identity-runbook.txt"
    assert sources[0]["chunk_count"] == len(chunks)
    assert len(chunks) > 1
    assert chunks[0]["source_ref"] == "identity-runbook.txt#chunk-1"
    assert chunks[0]["metadata"]["chunk_count"] == len(chunks)
    assert any(
        relationship["relationship_type"] == "maps_to"
        and relationship["source_name"] == "Customer ID"
        and relationship["target_name"] == "customerId"
        and relationship["evidence_payload"]["rule"] == "field_mapping_phrase"
        and relationship["source_refs"][0].startswith("identity-runbook.txt#chunk-")
        for relationship in relationships
    )


def test_evidence_retrieval_includes_document_chunks(tmp_workspace: Path, tmp_path: Path):
    from graphmind.services.evidence_retrieval import EvidenceRetrievalService
    from graphmind.services.import_service import ImportService

    architecture = tmp_path / "architecture.md"
    architecture.write_text(
        "# Runbook\nThe telemetry bridge uses the rareword-zeta handoff protocol.\n",
        encoding="utf-8",
    )
    paths, session_factory, project_id = _project_context(tmp_workspace)
    ImportService(paths, session_factory).import_structured_batch(
        project_id,
        [architecture],
        label="Evidence batch",
    )

    results = EvidenceRetrievalService(session_factory).search(
        project_id,
        "rareword zeta handoff",
        limit=3,
    )

    assert results
    assert results[0].kind == "document_chunk"
    assert results[0].label == "architecture.md · Runbook"
    assert results[0].source_ref == "architecture.md#runbook"


def test_reset_project_data_clears_document_import_artifacts(tmp_workspace: Path, tmp_path: Path):
    from graphmind.services.import_service import ImportService
    from graphmind.services.project_data_service import ProjectDataService

    architecture = tmp_path / "architecture.md"
    architecture.write_text("# Overview\nGraphMind mentions /api/projects.\n", encoding="utf-8")
    paths, session_factory, project_id = _project_context(tmp_workspace)
    ImportService(paths, session_factory).import_structured_batch(
        project_id,
        [architecture],
        label="Reset documents",
    )

    with session_factory() as session:
        assert session.query(DocumentSource).filter_by(project_id=project_id).count() == 1
        assert session.query(DocumentChunk).filter_by(project_id=project_id).count() == 1
        assert session.query(ExtractedEntity).filter_by(project_id=project_id).count() > 0
        assert session.query(ExtractedRelationship).filter_by(project_id=project_id).count() > 0
        assert session.query(RelationshipSuggestion).filter_by(project_id=project_id).count() > 0

    ProjectDataService(paths, session_factory).reset_project_data(project_id)

    with session_factory() as session:
        assert session.query(DocumentSource).filter_by(project_id=project_id).count() == 0
        assert session.query(DocumentChunk).filter_by(project_id=project_id).count() == 0
        assert session.query(ExtractedEntity).filter_by(project_id=project_id).count() == 0
        assert session.query(ExtractedRelationship).filter_by(project_id=project_id).count() == 0
        assert session.query(RelationshipSuggestion).filter_by(project_id=project_id).count() == 0
        assert session.query(ImportItem).filter_by(project_id=project_id).count() == 0


def _simple_pdf_bytes() -> bytes:
    stream = (
        b"BT /F1 12 Tf 72 720 Td "
        b"[(GraphMind ) (links ) <2F6170692F70726F6A65637473>] TJ "
        b"0 -14 Td (Customer\\(ID\\) maps to customerId.) Tj "
        b"ET"
    )
    return (
        b"%PDF-1.4\n"
        b"1 0 obj << /Length "
        + str(len(stream)).encode("ascii")
        + b" >> stream\n"
        + stream
        + b"\nendstream endobj\n%%EOF"
    )
