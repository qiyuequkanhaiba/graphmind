from pathlib import Path

from fastapi.testclient import TestClient

from graphmind.api.app import create_app


def test_source_detail_and_chunks_endpoints_return_imported_document_artifacts(
    tmp_workspace: Path,
    tmp_path: Path,
):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Source API"}).json()["id"]
    architecture = tmp_path / "architecture.md"
    architecture.write_text(
        "# Overview\nGraphMind links to [Project API](/api/projects).\n",
        encoding="utf-8",
    )

    with architecture.open("rb") as upload:
        import_response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "Source batch"},
            files=[("files", ("architecture.md", upload, "text/markdown"))],
        )

    assert import_response.status_code == 200
    sources_response = client.get(f"/api/projects/{project_id}/sources/detail")
    assert sources_response.status_code == 200
    sources = sources_response.json()
    assert len(sources) == 1
    assert sources[0]["title"] == "architecture.md"
    assert sources[0]["document_type"] == "markdown"
    assert sources[0]["chunk_count"] == 1
    assert sources[0]["entity_count"] >= 2
    assert sources[0]["relationship_count"] >= 1
    assert sources[0]["metadata"]["parser"] == "markdown"

    chunks_response = client.get(
        f"/api/projects/{project_id}/sources/{sources[0]['id']}/chunks"
    )
    assert chunks_response.status_code == 200
    chunks = chunks_response.json()
    assert len(chunks) == 1
    assert chunks[0]["heading"] == "Overview"
    assert "GraphMind links" in chunks[0]["content"]
    assert chunks[0]["source_ref"] == "architecture.md#overview"

    missing_source_response = client.get(f"/api/projects/{project_id}/sources/999/chunks")
    assert missing_source_response.status_code == 404


def test_entities_and_extracted_relationships_endpoints_return_source_backed_facts(
    tmp_workspace: Path,
    tmp_path: Path,
):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Entity API"}).json()["id"]
    architecture = tmp_path / "architecture.md"
    architecture.write_text(
        "# Overview\nGraphMind links to [Project API](/api/projects) and customerId.\n",
        encoding="utf-8",
    )

    with architecture.open("rb") as upload:
        import_response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "Entity batch"},
            files=[("files", ("architecture.md", upload, "text/markdown"))],
        )

    assert import_response.status_code == 200
    entities_response = client.get(f"/api/projects/{project_id}/entities")
    relationships_response = client.get(
        f"/api/projects/{project_id}/extracted-relationships"
    )

    assert entities_response.status_code == 200
    assert relationships_response.status_code == 200
    entities = entities_response.json()
    relationships = relationships_response.json()

    assert any(
        entity["canonical_name"] == "/api/projects"
        and entity["entity_type"] == "endpoint"
        and entity["source_refs"]
        for entity in entities
    )
    assert any(entity["canonical_name"] == "customerId" for entity in entities)
    assert any(
        relationship["source_name"] == "architecture.md"
        and relationship["target_name"] == "/api/projects"
        and relationship["relationship_type"] == "references"
        and relationship["evidence_payload"]["rule"] == "markdown_link"
        for relationship in relationships
    )


def test_source_inspection_endpoints_are_project_scoped(tmp_workspace: Path, tmp_path: Path):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    first_project_id = client.post("/api/projects", json={"name": "First"}).json()["id"]
    second_project_id = client.post("/api/projects", json={"name": "Second"}).json()["id"]
    architecture = tmp_path / "architecture.md"
    architecture.write_text("# Overview\nGraphMind mentions /api/projects.\n", encoding="utf-8")

    with architecture.open("rb") as upload:
        import_response = client.post(
            f"/api/projects/{first_project_id}/import-batches",
            data={"label": "Scoped batch"},
            files=[("files", ("architecture.md", upload, "text/markdown"))],
        )
    assert import_response.status_code == 200
    source_id = client.get(f"/api/projects/{first_project_id}/sources/detail").json()[0]["id"]

    assert client.get(f"/api/projects/{second_project_id}/sources/detail").json() == []
    scoped_chunks_response = client.get(
        f"/api/projects/{second_project_id}/sources/{source_id}/chunks"
    )
    assert scoped_chunks_response.status_code == 404
    assert client.get(f"/api/projects/{second_project_id}/entities").json() == []
    assert client.get(f"/api/projects/{second_project_id}/extracted-relationships").json() == []
