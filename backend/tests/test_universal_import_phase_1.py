from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from fastapi.testclient import TestClient

from graphmind.api.app import create_app
from graphmind.core.graph_builder import GraphData, GraphEdgeData, GraphNodeData
from graphmind.core.profiling import FieldProfileData, SheetProfileData
from graphmind.core.relationships import RelationshipSuggestionData
from graphmind.services.import_service import ImportService
from graphmind.services.project_data_service import ProjectDataService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import (
    Dataset,
    FieldProfile,
    GraphEdge,
    GraphNode,
    ImportBatch,
    ImportItem,
    RelationshipSuggestion,
    Sheet,
)
from graphmind.storage.repositories import (
    ImportBatchRepository,
    ImportRepository,
    ProjectRepository,
)
from graphmind.storage.workspace import WorkspacePaths


def _project_id(tmp_workspace: Path):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project("Batch Project")
        session.commit()
        return paths, session_factory, project.id


def test_import_batch_repository_creates_batch_and_items(tmp_workspace: Path):
    _paths, session_factory, project_id = _project_id(tmp_workspace)

    with session_factory() as session:
        repository = ImportBatchRepository(session)
        batch = repository.create_batch(project_id, "Customer import")
        first = repository.create_item(
            batch_id=batch.id,
            project_id=project_id,
            filename="customers.csv",
            file_type="csv",
            source_kind="table",
            raw_data_ref="import_batches/project_1/batch_1/customers.csv",
        )
        repository.create_item(
            batch_id=batch.id,
            project_id=project_id,
            filename="orders.json",
            file_type="json",
            source_kind="json",
            raw_data_ref="import_batches/project_1/batch_1/orders.json",
        )
        repository.update_item_status(first, "parsed", {"stage": "parsed"})
        repository.update_batch_progress(batch, "running", 40, {"item_count": 2})
        session.commit()

    with session_factory() as session:
        saved_batch = session.get(ImportBatch, batch.id)
        saved_items = (
            session.query(ImportItem)
            .filter(ImportItem.batch_id == batch.id)
            .order_by(ImportItem.id)
            .all()
        )

        assert saved_batch is not None
        assert saved_batch.project_id == project_id
        assert saved_batch.label == "Customer import"
        assert saved_batch.status == "running"
        assert saved_batch.progress == 40
        assert saved_batch.summary == {"item_count": 2}
        assert [item.filename for item in saved_items] == ["customers.csv", "orders.json"]
        assert saved_items[0].status == "parsed"
        assert saved_items[0].summary == {"stage": "parsed"}
        assert saved_items[1].source_kind == "json"


def test_import_batch_repository_tracks_item_stage_summaries(tmp_workspace: Path):
    _paths, session_factory, project_id = _project_id(tmp_workspace)

    with session_factory() as session:
        repository = ImportBatchRepository(session)
        batch = repository.create_batch(project_id, "Stage batch")
        item = repository.create_item(
            batch_id=batch.id,
            project_id=project_id,
            filename="orders.json",
            file_type="json",
            source_kind="json",
            raw_data_ref="import_batches/project_1/batch_1/orders.json",
        )
        repository.update_item_stage(
            item,
            "parsed",
            stage_summary="Read table-shaped JSON.",
        )
        repository.update_item_stage(
            item,
            "profiled",
            stage_summary="Profiled 3 fields.",
            summary={"field_count": 3},
        )
        session.commit()

    with session_factory() as session:
        saved_item = session.get(ImportItem, item.id)

        assert saved_item is not None
        assert saved_item.status == "profiled"
        assert saved_item.summary is not None
        assert saved_item.summary["stage"] == "profiled"
        assert saved_item.summary["field_count"] == 3
        assert saved_item.summary["stages"] == [
            {
                "name": "staged",
                "status": "complete",
                "progress": 5,
                "summary": "File staged for import.",
            },
            {
                "name": "parsed",
                "status": "complete",
                "progress": 20,
                "summary": "Read table-shaped JSON.",
            },
            {
                "name": "profiled",
                "status": "complete",
                "progress": 40,
                "summary": "Profiled 3 fields.",
            },
        ]


def test_import_service_imports_top_level_json_array_as_table(tmp_workspace: Path, tmp_path: Path):
    json_path = tmp_path / "customers.json"
    json_path.write_text(
        """
        [
          {"id": "c1", "name": "Acme", "region": "East"},
          {"id": "c2", "name": "Beacon", "region": "West"}
        ]
        """,
        encoding="utf-8",
    )
    paths, session_factory, project_id = _project_id(tmp_workspace)

    result = ImportService(paths, session_factory).import_file(project_id, json_path)

    assert result.sheet_count == 1
    assert result.field_count == 3
    with session_factory() as session:
        dataset = session.get(Dataset, result.dataset_id)
        assert dataset is not None
        assert dataset.file_type == "json"
        sheet = session.query(Sheet).filter(Sheet.dataset_id == dataset.id).one()
        assert sheet.name == "customers"
        assert sheet.row_count == 2
        assert sheet.column_count == 3


def test_import_service_imports_structured_batch_and_finds_cross_file_foreign_key(
    tmp_workspace: Path, tmp_path: Path
):
    customers = tmp_path / "customers.csv"
    customers.write_text(
        "\n".join(
            [
                "id,name,region",
                "c1,Acme,East",
                "c2,Beacon,West",
                "c3,Cedar,North",
            ]
        ),
        encoding="utf-8",
    )
    orders = tmp_path / "orders.json"
    orders.write_text(
        """
        [
          {"order_id": "o1", "customer_id": "c1", "amount": 120},
          {"order_id": "o2", "customer_id": "c2", "amount": 240},
          {"order_id": "o3", "customer_id": "c1", "amount": 80}
        ]
        """,
        encoding="utf-8",
    )
    paths, session_factory, project_id = _project_id(tmp_workspace)

    result = ImportService(paths, session_factory).import_structured_batch(
        project_id=project_id,
        files=[customers, orders],
        label="Customers and orders",
    )

    assert result.batch_id > 0
    assert result.dataset_count == 2
    assert result.sheet_count == 2
    assert result.field_count == 6
    assert result.suggestion_count >= 1

    with session_factory() as session:
        suggestions = (
            session.query(RelationshipSuggestion)
            .filter(RelationshipSuggestion.project_id == project_id)
            .all()
        )
        items = (
            session.query(ImportItem)
            .filter(ImportItem.project_id == project_id)
            .order_by(ImportItem.filename)
            .all()
        )
        field_labels = {
            field.id: f"{field.sheet.name}.{field.normalized_name}"
            for field in session.query(FieldProfile).all()
        }
        assert any(
            suggestion.relationship_type == "foreign_key"
            and field_labels[suggestion.source_field_id] == "orders.customer_id"
            and suggestion.target_field_id is not None
            and field_labels[suggestion.target_field_id] == "customers.id"
            for suggestion in suggestions
        )
        orders_item = next(item for item in items if item.filename == "orders.json")
        assert orders_item.summary is not None
        assert [stage["name"] for stage in orders_item.summary["stages"]] == [
            "staged",
            "parsed",
            "profiled",
            "resolved",
            "graphed",
            "indexed",
        ]
        assert {stage["status"] for stage in orders_item.summary["stages"]} == {"complete"}


def test_import_service_adds_document_batch_diagnostics(tmp_workspace: Path, tmp_path: Path):
    runbook = tmp_path / "identity-runbook.md"
    runbook.write_text(
        """
        # Identity Runbook

        Customer ID maps to Account ID.
        API Gateway calls Billing Service.
        """,
        encoding="utf-8",
    )
    repository_archive = tmp_path / "repo.zip"
    with ZipFile(repository_archive, "w") as archive:
        archive.writestr(
            "repo/src/app.py",
            "class BillingService:\n"
            "    def charge_customer(self, customer_id):\n"
            "        return customer_id\n",
        )
        archive.writestr("repo/node_modules/leftpad/index.js", "module.exports = () => null")
        archive.writestr("repo/assets/logo.bin", b"\x00\x01\x02")

    paths, session_factory, project_id = _project_id(tmp_workspace)

    ImportService(paths, session_factory).import_structured_batch(
        project_id=project_id,
        files=[runbook, repository_archive],
        label="Document diagnostics batch",
    )

    with session_factory() as session:
        batch = session.query(ImportBatch).filter_by(project_id=project_id).one()
        items = {
            item.filename: item
            for item in session.query(ImportItem).filter(ImportItem.project_id == project_id).all()
        }

        assert batch.summary is not None
        diagnostics = batch.summary["diagnostics"]
        assert diagnostics["document_count"] == 2
        assert diagnostics["chunk_count"] >= 2
        assert diagnostics["entity_count"] >= 2
        assert diagnostics["relationship_count"] >= 1
        assert diagnostics["ignored_file_count"] == 2
        assert diagnostics["source_kind_counts"] == {"code": 1, "document": 1}

        runbook_summary = items["identity-runbook.md"].summary
        assert runbook_summary is not None
        runbook_diagnostics = runbook_summary["diagnostics"]
        assert runbook_diagnostics["document_count"] == 1
        assert runbook_diagnostics["chunk_count"] >= 1
        assert runbook_diagnostics["entity_count"] >= 1
        extracted_stage = next(
            stage for stage in runbook_summary["stages"] if stage["name"] == "extracted"
        )
        assert extracted_stage["diagnostics"] == runbook_diagnostics

        repository_summary = items["repo.zip"].summary
        assert repository_summary is not None
        repository_diagnostics = repository_summary["diagnostics"]
        assert repository_diagnostics["repository_file_count"] == 1
        assert repository_diagnostics["ignored_file_count"] == 2
        assert repository_diagnostics["document_count"] == 1
        assert repository_diagnostics["chunk_count"] >= 1
        repository_parsed_stage = next(
            stage for stage in repository_summary["stages"] if stage["name"] == "parsed"
        )
        assert repository_parsed_stage["diagnostics"]["ignored_file_count"] == 2


def test_import_service_keeps_successful_items_when_batch_item_fails(
    tmp_workspace: Path, tmp_path: Path
):
    customers = tmp_path / "customers.csv"
    broken = tmp_path / "broken.json"
    customers.write_text("id,name\nc1,Acme\n", encoding="utf-8")
    broken.write_text("{not valid json", encoding="utf-8")
    paths, session_factory, project_id = _project_id(tmp_workspace)

    result = ImportService(paths, session_factory).import_structured_batch(
        project_id=project_id,
        files=[customers, broken],
        label="Partial batch",
    )

    assert result.dataset_count == 1
    with session_factory() as session:
        batch = session.query(ImportBatch).filter_by(project_id=project_id).one()
        items = (
            session.query(ImportItem)
            .filter(ImportItem.project_id == project_id)
            .order_by(ImportItem.filename)
            .all()
        )
        nodes = session.query(GraphNode).filter_by(project_id=project_id).all()

        assert batch.status == "partial"
        assert batch.summary is not None
        assert batch.summary["succeeded_item_count"] == 1
        assert batch.summary["failed_item_count"] == 1
        assert [(item.filename, item.status) for item in items] == [
            ("broken.json", "failed"),
            ("customers.csv", "succeeded"),
        ]
        for item in items:
            assert item.raw_data_ref
            assert (tmp_workspace / item.raw_data_ref).exists()
        failed_item = items[0]
        assert failed_item.error_message
        assert failed_item.summary is not None
        assert failed_item.summary["stage"] == "failed"
        assert failed_item.summary["stages"][-1]["name"] == "failed"
        assert failed_item.summary["stages"][-1]["status"] == "failed"
        assert (tmp_workspace / failed_item.raw_data_ref).read_text(
            encoding="utf-8"
        ) == "{not valid json"
        assert nodes


def test_import_service_retries_failed_batch_item_from_archived_raw_file(
    tmp_workspace: Path, tmp_path: Path
):
    customers = tmp_path / "customers.csv"
    broken = tmp_path / "broken.json"
    customers.write_text("id,name\nc1,Acme\n", encoding="utf-8")
    broken.write_text("{not valid json", encoding="utf-8")
    paths, session_factory, project_id = _project_id(tmp_workspace)
    service = ImportService(paths, session_factory)

    service.import_structured_batch(
        project_id=project_id,
        files=[customers, broken],
        label="Retry batch",
    )

    with session_factory() as session:
        failed_item = session.query(ImportItem).filter_by(filename="broken.json").one()
        raw_path = tmp_workspace / failed_item.raw_data_ref
        raw_path.write_text(
            '[{"order_id":"o1","customer_id":"c1","amount":120}]',
            encoding="utf-8",
        )
        failed_item_id = failed_item.id

    result = service.retry_import_item(project_id=project_id, item_id=failed_item_id)

    assert result.dataset_count == 2
    with session_factory() as session:
        batch = session.query(ImportBatch).filter_by(project_id=project_id).one()
        retried_item = session.get(ImportItem, failed_item_id)
        items = (
            session.query(ImportItem)
            .filter(ImportItem.project_id == project_id)
            .order_by(ImportItem.filename)
            .all()
        )

        assert batch.status == "succeeded"
        assert batch.error_message is None
        assert batch.summary is not None
        assert batch.summary["succeeded_item_count"] == 2
        assert batch.summary["failed_item_count"] == 0
        assert [(item.filename, item.status) for item in items] == [
            ("broken.json", "succeeded"),
            ("customers.csv", "succeeded"),
        ]
        assert retried_item is not None
        assert retried_item.error_message is None
        assert retried_item.summary is not None
        assert retried_item.summary["dataset_id"] > 0
        assert [stage["name"] for stage in retried_item.summary["stages"]] == [
            "staged",
            "parsed",
            "profiled",
            "resolved",
            "graphed",
            "indexed",
        ]
        assert "failed" not in {stage["name"] for stage in retried_item.summary["stages"]}


def test_import_service_retry_does_not_duplicate_relationship_suggestions(
    tmp_workspace: Path, tmp_path: Path
):
    customers = tmp_path / "customers.csv"
    broken = tmp_path / "broken.json"
    customers.write_text(
        "\n".join(["id,name", "c1,Acme", "c2,Beacon", "c3,Cedar"]),
        encoding="utf-8",
    )
    broken.write_text("{not valid json", encoding="utf-8")
    paths, session_factory, project_id = _project_id(tmp_workspace)
    service = ImportService(paths, session_factory)

    service.import_structured_batch(
        project_id=project_id,
        files=[customers, broken],
        label="Retry dedup batch",
    )

    with session_factory() as session:
        failed_item = session.query(ImportItem).filter_by(filename="broken.json").one()
        raw_path = tmp_workspace / failed_item.raw_data_ref
        raw_path.write_text(
            """
            [
              {"order_id": "o1", "customer_id": "c1", "amount": 120},
              {"order_id": "o2", "customer_id": "c2", "amount": 240},
              {"order_id": "o3", "customer_id": "c1", "amount": 80}
            ]
            """,
            encoding="utf-8",
        )
        failed_item_id = failed_item.id

    service.retry_import_item(project_id=project_id, item_id=failed_item_id)

    with session_factory() as session:
        retried_item = session.get(ImportItem, failed_item_id)
        assert retried_item is not None
        retried_item.status = "failed"
        retried_item.error_message = "Synthetic retry failure"
        session.commit()

    service.retry_import_item(project_id=project_id, item_id=failed_item_id)

    with session_factory() as session:
        field_labels = {
            field.id: f"{field.sheet.name}.{field.normalized_name}"
            for field in session.query(FieldProfile).all()
        }
        suggestion_keys = [
            (
                field_labels[suggestion.source_field_id],
                field_labels.get(suggestion.target_field_id),
                suggestion.relationship_type,
            )
            for suggestion in session.query(RelationshipSuggestion)
            .filter(RelationshipSuggestion.project_id == project_id)
            .all()
        ]

    assert suggestion_keys.count(("broken.customer_id", "customers.id", "foreign_key")) == 1
    assert len(suggestion_keys) == len(set(suggestion_keys))


def test_import_repository_profile_suggestions_dedupe_by_semantic_field_labels(
    tmp_workspace: Path,
):
    _paths, session_factory, project_id = _project_id(tmp_workspace)

    customers_profile = SheetProfileData(
        name="customers",
        normalized_name="customers",
        row_count=1,
        column_count=1,
        duckdb_table_name="customers_table",
        fields=[
            FieldProfileData(
                original_name="id",
                normalized_name="id",
                inferred_type="identifier",
                null_count=0,
                unique_count=1,
                sample_values=["c1"],
                min_value=None,
                max_value=None,
                semantic_label=None,
                key_candidate_score=1.0,
            )
        ],
    )
    first_broken_profile = SheetProfileData(
        name="broken",
        normalized_name="broken",
        row_count=1,
        column_count=1,
        duckdb_table_name="broken_table_1",
        fields=[
            FieldProfileData(
                original_name="customer_id",
                normalized_name="customer_id",
                inferred_type="identifier",
                null_count=0,
                unique_count=1,
                sample_values=["c1"],
                min_value=None,
                max_value=None,
                semantic_label=None,
                key_candidate_score=1.0,
            )
        ],
    )
    second_broken_profile = SheetProfileData(
        name="broken",
        normalized_name="broken",
        row_count=1,
        column_count=1,
        duckdb_table_name="broken_table_2",
        fields=first_broken_profile.fields,
    )
    suggestion = RelationshipSuggestionData(
        source_sheet="broken",
        source_field="customer_id",
        target_sheet="customers",
        target_field="id",
        relationship_type="foreign_key",
        confidence=0.95,
        evidence_summary="same semantic retry relationship",
        evidence_payload={},
    )

    with session_factory() as session:
        repository = ImportRepository(session)
        customers_dataset = repository.create_dataset(project_id, "customers.csv")
        first_broken_dataset = repository.create_dataset(project_id, "broken.json")
        repository.add_sheet_profile(customers_dataset.id, customers_profile)
        repository.add_sheet_profile(first_broken_dataset.id, first_broken_profile)
        first_saved = repository.add_relationship_suggestions_for_profiles(
            project_id,
            [suggestion],
        )
        session.commit()

        second_broken_dataset = repository.create_dataset(project_id, "broken.json")
        repository.add_sheet_profile(second_broken_dataset.id, second_broken_profile)
        second_saved = repository.add_relationship_suggestions_for_profiles(
            project_id,
            [suggestion],
        )
        session.commit()

        saved_suggestions = (
            session.query(RelationshipSuggestion)
            .filter(RelationshipSuggestion.project_id == project_id)
            .all()
        )

    assert first_saved[0].id == second_saved[0].id
    assert len(saved_suggestions) == 1


def test_structured_batch_graph_merge_dedupes_repeated_table_and_field_labels(
    tmp_workspace: Path, tmp_path: Path
):
    first = tmp_path / "first_customers.csv"
    second = tmp_path / "second_customers.csv"
    first.write_text("id,name\nc1,Acme\nc2,Beacon", encoding="utf-8")
    second.write_text("id,name\nc1,Acme\nc2,Beacon", encoding="utf-8")
    paths, session_factory, project_id = _project_id(tmp_workspace)

    ImportService(paths, session_factory).import_structured_batch(
        project_id=project_id,
        files=[first, second],
        label="Duplicate customers",
    )

    with session_factory() as session:
        labels = [node.label for node in session.query(GraphNode).all()]
        assert labels.count("first_customers.id") == 1
        assert labels.count("second_customers.id") == 1
        edge_keys = [
            (edge.source_node_id, edge.target_node_id, edge.edge_type, edge.status)
            for edge in session.query(GraphEdge).all()
        ]
        assert len(edge_keys) == len(set(edge_keys))


def test_import_repository_add_graph_reuses_existing_nodes_and_edges(tmp_workspace: Path):
    _paths, session_factory, project_id = _project_id(tmp_workspace)
    graph = GraphData(
        project_id=project_id,
        nodes=[
            GraphNodeData(
                id="table:Customers",
                node_type="table",
                label="Customers",
                source_ref="p1_d1_customers",
                metadata={"row_count": 2},
                position_x=0,
                position_y=0,
            ),
            GraphNodeData(
                id="field:Customers.id",
                node_type="field",
                label="Customers.id",
                source_ref="p1_d1_customers.id",
                metadata={"inferred_type": "identifier"},
                position_x=0,
                position_y=80,
            ),
        ],
        edges=[
            GraphEdgeData(
                id="contains:customers-id",
                source_node_id="table:Customers",
                target_node_id="field:Customers.id",
                edge_type="contains_field",
                confidence=1.0,
                status="auto_trusted",
                evidence_ref="field:Customers.id",
                metadata={},
            )
        ],
    )

    with session_factory() as session:
        repository = ImportRepository(session)
        repository.add_graph(graph)
        repository.add_graph(graph)
        session.commit()

    with session_factory() as session:
        assert session.query(GraphNode).filter(GraphNode.project_id == project_id).count() == 2
        assert session.query(GraphEdge).filter(GraphEdge.project_id == project_id).count() == 1


def test_import_batch_endpoint_accepts_multiple_structured_files(
    tmp_workspace: Path, tmp_path: Path
):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Batch API"}).json()["id"]
    customers = tmp_path / "customers.csv"
    orders = tmp_path / "orders.json"
    customers.write_text("id,name\nc1,Acme\nc2,Beacon", encoding="utf-8")
    orders.write_text(
        '[{"order_id":"o1","customer_id":"c1"},{"order_id":"o2","customer_id":"c2"}]',
        encoding="utf-8",
    )

    with customers.open("rb") as first_upload, orders.open("rb") as second_upload:
        response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "Customer batch"},
            files=[
                ("files", ("customers.csv", first_upload, "text/csv")),
                ("files", ("orders.json", second_upload, "application/json")),
            ],
        )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] > 0
    assert body["label"] == "Customer batch"
    assert body["status"] == "succeeded"
    assert body["progress"] == 100
    assert body["summary"]["dataset_count"] == 2
    assert len(body["items"]) == 2
    assert {item["filename"] for item in body["items"]} == {"customers.csv", "orders.json"}
    assert {item["status"] for item in body["items"]} == {"succeeded"}

    graph = client.get(f"/api/projects/{project_id}/graph").json()
    suggestions = client.get(f"/api/projects/{project_id}/relationship-suggestions").json()
    assert graph["nodes"]
    assert any(
        suggestion["relationship_type"] == "foreign_key"
        and suggestion["source_label"] == "orders.customer_id"
        and suggestion["target_label"] == "customers.id"
        for suggestion in suggestions
    )


def test_import_batch_endpoint_preserves_duplicate_upload_filenames(tmp_workspace: Path):
    client = TestClient(create_app(workspace_root=tmp_workspace))
    project_id = client.post("/api/projects", json={"name": "Duplicate Names"}).json()["id"]

    response = client.post(
        f"/api/projects/{project_id}/import-batches",
        data={"label": "Duplicate filenames"},
        files=[
            ("files", ("records.csv", BytesIO(b"id,name\n1,First"), "text/csv")),
            ("files", ("records.csv", BytesIO(b"id,name\n2,Second"), "text/csv")),
        ],
    )

    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 2
    contents = sorted(
        (tmp_workspace / item["raw_data_ref"]).read_text(encoding="utf-8") for item in items
    )
    assert contents == ["id,name\n1,First", "id,name\n2,Second"]


def test_import_batch_endpoint_returns_partial_when_one_file_fails(
    tmp_workspace: Path, tmp_path: Path
):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Partial Batch API"}).json()["id"]
    customers = tmp_path / "customers.csv"
    broken = tmp_path / "broken.json"
    customers.write_text("id,name\nc1,Acme\n", encoding="utf-8")
    broken.write_text("{not valid json", encoding="utf-8")

    with customers.open("rb") as first_upload, broken.open("rb") as second_upload:
        response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "Partial Customer batch"},
            files=[
                ("files", ("customers.csv", first_upload, "text/csv")),
                ("files", ("broken.json", second_upload, "application/json")),
            ],
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "partial"
    assert body["summary"]["succeeded_item_count"] == 1
    assert body["summary"]["failed_item_count"] == 1
    assert [(item["filename"], item["status"]) for item in body["items"]] == [
        ("customers.csv", "succeeded"),
        ("broken.json", "failed"),
    ]
    failed_item = next(item for item in body["items"] if item["status"] == "failed")
    assert failed_item["error"]
    assert failed_item["raw_data_ref"]
    assert (tmp_workspace / failed_item["raw_data_ref"]).read_text(
        encoding="utf-8"
    ) == "{not valid json"
    assert failed_item["summary"]["stage"] == "failed"
    assert failed_item["summary"]["stages"][-1]["name"] == "failed"
    assert failed_item["summary"]["stages"][-1]["status"] == "failed"
    successful_item = next(item for item in body["items"] if item["status"] == "succeeded")
    assert successful_item["raw_data_ref"]

    graph = client.get(f"/api/projects/{project_id}/graph").json()
    assert graph["nodes"]


def test_import_batch_endpoint_rejects_batch_over_total_upload_limit(
    tmp_workspace: Path, tmp_path: Path
):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Huge Batch API"}).json()["id"]
    first = tmp_path / "first.csv"
    second = tmp_path / "second.csv"
    first.write_bytes(b"id\n" + (b"c1\n" * (5 * 1024 * 1024 // 3)))
    second.write_bytes(b"id\n" + (b"c2\n" * (5 * 1024 * 1024 // 3 + 2)))

    with first.open("rb") as first_upload, second.open("rb") as second_upload:
        response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "Huge Customer batch"},
            files=[
                ("files", ("first.csv", first_upload, "text/csv")),
                ("files", ("second.csv", second_upload, "text/csv")),
            ],
        )

    assert response.status_code == 400
    assert response.json()["detail"] == {
        "code": "UPLOAD_LIMIT_EXCEEDED",
        "message": "Batch exceeds the 10 MB upload limit",
        "user_action": "Choose smaller files or increase GRAPHMIND_MAX_UPLOAD_BYTES.",
        "retryable": True,
        "field_errors": {},
    }
    assert client.get(f"/api/projects/{project_id}/import-batches").json() == []


def test_import_item_retry_endpoint_returns_updated_batch(tmp_workspace: Path, tmp_path: Path):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Retry Item API"}).json()["id"]
    customers = tmp_path / "customers.csv"
    broken = tmp_path / "broken.json"
    customers.write_text("id,name\nc1,Acme\n", encoding="utf-8")
    broken.write_text("{not valid json", encoding="utf-8")

    with customers.open("rb") as first_upload, broken.open("rb") as second_upload:
        response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "Retry Customer batch"},
            files=[
                ("files", ("customers.csv", first_upload, "text/csv")),
                ("files", ("broken.json", second_upload, "application/json")),
            ],
        )

    assert response.status_code == 200
    partial_body = response.json()
    failed_item = next(item for item in partial_body["items"] if item["status"] == "failed")
    (tmp_workspace / failed_item["raw_data_ref"]).write_text(
        '[{"order_id":"o1","customer_id":"c1"}]',
        encoding="utf-8",
    )

    retry_response = client.post(
        f"/api/projects/{project_id}/import-items/{failed_item['id']}/retry"
    )

    assert retry_response.status_code == 200
    body = retry_response.json()
    assert body["status"] == "succeeded"
    assert body["summary"]["succeeded_item_count"] == 2
    assert body["summary"]["failed_item_count"] == 0
    retried_item = next(item for item in body["items"] if item["id"] == failed_item["id"])
    assert retried_item["status"] == "succeeded"
    assert retried_item["error"] is None
    assert "failed" not in {stage["name"] for stage in retried_item["summary"]["stages"]}


def test_reset_project_data_clears_import_batches_and_items(tmp_workspace: Path, tmp_path: Path):
    csv_path = tmp_path / "customers.csv"
    csv_path.write_text("id,name\nc1,Acme", encoding="utf-8")
    paths, session_factory, project_id = _project_id(tmp_workspace)
    ImportService(paths, session_factory).import_structured_batch(
        project_id,
        [csv_path],
        label="Reset batch",
    )

    with session_factory() as session:
        assert session.query(ImportBatch).filter(ImportBatch.project_id == project_id).count() == 1
        assert session.query(ImportItem).filter(ImportItem.project_id == project_id).count() == 1
        item_refs = [
            item.raw_data_ref
            for item in session.query(ImportItem).filter(ImportItem.project_id == project_id).all()
        ]
        item_paths = [tmp_workspace / raw_data_ref for raw_data_ref in item_refs]
        assert item_paths
        assert all(path.exists() for path in item_paths)

    ProjectDataService(paths, session_factory).reset_project_data(project_id)

    with session_factory() as session:
        assert session.query(ImportBatch).filter(ImportBatch.project_id == project_id).count() == 0
        assert session.query(ImportItem).filter(ImportItem.project_id == project_id).count() == 0
    assert all(not path.exists() for path in item_paths)
