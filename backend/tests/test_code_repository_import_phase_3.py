from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.services.code_repository_import import parse_code_repository_archive
from graphmind.services.evidence_retrieval import EvidenceRetrievalService
from graphmind.services.import_service import ImportService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import (
    DocumentChunk,
    DocumentSource,
    ExtractedEntity,
    GraphEdge,
    GraphNode,
    ImportItem,
)
from graphmind.storage.repositories import ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def _project_context(tmp_workspace: Path):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project("Repository Project")
        session.commit()
        return paths, session_factory, project.id


def _write_repository_archive(path: Path) -> None:
    with ZipFile(path, "w") as archive:
        archive.writestr(
            "repo/src/app.py",
            "from graphmind.storage.repositories import DocumentRepository\n"
            "import json\n\n"
            "class ImportRunner:\n"
            "    pass\n\n"
            "def run_import():\n"
            "    return DocumentRepository\n",
        )
        archive.writestr(
            "repo/README.md",
            "# Repository\nUses rareword-zeta import flow.\n",
        )
        archive.writestr("repo/node_modules/pkg/index.js", "export const ignored = true;\n")
        archive.writestr("repo/dist/generated.js", "export const ignoredDist = true;\n")
        archive.writestr("../escape.py", "def unsafe():\n    pass\n")


def test_parse_code_repository_archive_filters_and_preserves_repo_paths(tmp_path: Path):
    archive_path = tmp_path / "repo.zip"
    _write_repository_archive(archive_path)

    parsed = parse_code_repository_archive(archive_path, display_name="repo.zip")

    assert [document.title for document in parsed] == ["README.md", "src/app.py"]
    code_document = parsed[1]
    assert code_document.document_type == "code"
    assert code_document.source_ref == "src/app.py"
    assert any(
        entity.entity_type == "module"
        and entity.canonical_name == "graphmind.storage.repositories"
        for entity in code_document.entities
    )
    assert any(
        entity.entity_type == "function"
        and entity.canonical_name == "src/app.py::run_import"
        for entity in code_document.entities
    )
    assert any(
        entity.entity_type == "class"
        and entity.canonical_name == "src/app.py::ImportRunner"
        for entity in code_document.entities
    )
    assert any(
        relationship.relationship_type == "defines"
        and relationship.target_name == "src/app.py::run_import"
        for relationship in code_document.relationships
    )


def test_repository_archive_rejects_too_many_entries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    archive_path = tmp_path / "too-many.zip"
    with ZipFile(archive_path, "w") as archive:
        archive.writestr("repo/a.py", "a = 1\n")
        archive.writestr("repo/b.py", "b = 2\n")
        archive.writestr("repo/c.py", "c = 3\n")
    monkeypatch.setattr(
        "graphmind.services.code_repository_import.MAX_REPOSITORY_ARCHIVE_ENTRIES",
        2,
    )

    with pytest.raises(ValueError, match="too many entries"):
        parse_code_repository_archive(archive_path)


def test_repository_archive_rejects_excess_total_uncompressed_bytes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    archive_path = tmp_path / "too-large.zip"
    with ZipFile(archive_path, "w") as archive:
        archive.writestr("repo/a.py", "a" * 8)
        archive.writestr("repo/b.py", "b" * 8)
    monkeypatch.setattr(
        "graphmind.services.code_repository_import.MAX_REPOSITORY_TOTAL_UNCOMPRESSED_BYTES",
        12,
    )

    with pytest.raises(ValueError, match="uncompressed size"):
        parse_code_repository_archive(archive_path)


def test_repository_archive_rejects_excess_compression_ratio(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    archive_path = tmp_path / "high-ratio.zip"
    with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("repo/repeated.py", "a" * 4096)
    monkeypatch.setattr(
        "graphmind.services.code_repository_import.MAX_REPOSITORY_COMPRESSION_RATIO",
        2.0,
    )

    with pytest.raises(ValueError, match="compression ratio"):
        parse_code_repository_archive(archive_path)


def test_import_service_imports_repository_zip_as_code_documents(
    tmp_workspace: Path,
    tmp_path: Path,
):
    archive_path = tmp_path / "repo.zip"
    _write_repository_archive(archive_path)
    paths, session_factory, project_id = _project_context(tmp_workspace)

    result = ImportService(paths, session_factory).import_structured_batch(
        project_id,
        [archive_path],
        label="Repo batch",
    )

    assert result.dataset_count == 0
    assert result.document_count == 2
    with session_factory() as session:
        items = session.query(ImportItem).filter_by(project_id=project_id).all()
        sources = (
            session.query(DocumentSource)
            .filter_by(project_id=project_id)
            .order_by(DocumentSource.title)
            .all()
        )
        chunks = session.query(DocumentChunk).filter_by(project_id=project_id).all()
        entities = session.query(ExtractedEntity).filter_by(project_id=project_id).all()
        nodes = session.query(GraphNode).filter_by(project_id=project_id).all()
        edges = session.query(GraphEdge).filter_by(project_id=project_id).all()

        assert [(item.filename, item.source_kind, item.status) for item in items] == [
            ("repo.zip", "code", "succeeded")
        ]
        assert items[0].summary["repository_file_count"] == 2
        assert items[0].summary["ignored_file_count"] >= 2
        assert [source.title for source in sources] == ["README.md", "src/app.py"]
        assert all(source.import_item_id == items[0].id for source in sources)
        assert len(chunks) == 2
        assert any(entity.canonical_name == "src/app.py::run_import" for entity in entities)
        assert not any(entity.canonical_name == "node_modules/pkg/index.js" for entity in entities)
        assert any(node.node_type == "document" and node.label == "src/app.py" for node in nodes)
        assert any(
            node.node_type == "code_symbol" and node.label == "src/app.py::run_import"
            for node in nodes
        )
        assert any(edge.edge_type == "depends_on" for edge in edges)
        assert any(edge.edge_type == "defines" for edge in edges)


def test_import_batch_endpoint_accepts_repository_zip(tmp_workspace: Path, tmp_path: Path):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Repository API"}).json()["id"]
    archive_path = tmp_path / "repo.zip"
    _write_repository_archive(archive_path)

    with archive_path.open("rb") as upload:
        response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "Repository batch"},
            files=[("files", ("repo.zip", upload, "application/zip"))],
        )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["document_count"] == 2
    assert body["items"][0]["source_kind"] == "code"
    assert body["items"][0]["summary"]["repository_file_count"] == 2

    sources = client.get(f"/api/projects/{project_id}/sources").json()
    graph = client.get(f"/api/projects/{project_id}/graph").json()
    assert sources == [{"source_kind": "code", "count": 1}]
    assert any(
        node["node_type"] == "code_symbol" and node["label"] == "src/app.py::run_import"
        for node in graph["nodes"]
    )


def test_evidence_retrieval_finds_code_repository_chunks(tmp_workspace: Path, tmp_path: Path):
    archive_path = tmp_path / "repo.zip"
    _write_repository_archive(archive_path)
    paths, session_factory, project_id = _project_context(tmp_workspace)
    ImportService(paths, session_factory).import_structured_batch(
        project_id,
        [archive_path],
        label="Repo evidence",
    )

    results = EvidenceRetrievalService(session_factory).search(
        project_id,
        "DocumentRepository run_import rareword zeta",
        limit=5,
    )

    assert results
    assert any(
        result.kind == "document_chunk" and result.label == "src/app.py"
        for result in results
    )
