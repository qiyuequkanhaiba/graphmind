from pathlib import Path

import duckdb
import pandas as pd
import pytest
from sqlalchemy import select

from graphmind.services.import_service import ImportJobCanceledError, ImportService
from graphmind.services.project_data_service import ProjectDataService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import (
    Dataset,
    FieldProfile,
    GraphEdge,
    GraphNode,
    ImportItem,
    ImportJob,
    RelationshipSuggestion,
    Sheet,
)
from graphmind.storage.repositories import ImportRepository, ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def test_import_file_persists_profiles_relationships_and_graph(
    tmp_workspace: Path, sample_csv: Path
):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = ProjectRepository(session).create_project(name="Demo Project")
        session.commit()
        project_id = project.id

    result = ImportService(paths, session_factory).import_file(project_id, sample_csv)

    assert result.dataset_id > 0
    assert result.sheet_count == 1
    assert result.field_count == 5
    assert result.suggestion_count >= 1
    assert result.graph_node_count >= 6
    assert result.graph_edge_count >= 5

    with session_factory() as session:
        dataset_count = session.query(Dataset).count()
        assert dataset_count == 1

        dataset = session.get(Dataset, result.dataset_id)
        assert dataset is not None
        assert dataset.project_id == project_id
        assert dataset.filename == "customers_orders.csv"
        assert dataset.file_type == "csv"
        assert dataset.import_status == "imported"
        assert (tmp_workspace / dataset.raw_data_ref).exists()

        sheets = session.scalars(select(Sheet).where(Sheet.dataset_id == dataset.id)).all()
        assert len(sheets) == 1
        sheet = sheets[0]
        assert sheet.name == "customers_orders"
        assert sheet.normalized_name == "customers_orders"
        assert sheet.row_count == 3
        assert sheet.column_count == 5
        assert sheet.duckdb_table_name.startswith(
            f"p{project_id}_j{result.import_job_id}_a"
        )
        assert sheet.duckdb_table_name.endswith("_customers_orders")

        fields = session.scalars(
            select(FieldProfile).where(FieldProfile.sheet_id == sheet.id)
        ).all()
        assert len(fields) == 5
        field_names = {field.normalized_name for field in fields}
        assert field_names == {"order_id", "customer_id", "product_id", "amount", "region"}
        assert any(field.key_candidate_score > 0 for field in fields)

        suggestions = session.scalars(
            select(RelationshipSuggestion).where(RelationshipSuggestion.project_id == project_id)
        ).all()
        assert {suggestion.relationship_type for suggestion in suggestions} >= {
            "derived_dimension"
        }
        assert all(suggestion.source_field_id for suggestion in suggestions)

        nodes = session.scalars(select(GraphNode).where(GraphNode.project_id == project_id)).all()
        edges = session.scalars(select(GraphEdge).where(GraphEdge.project_id == project_id)).all()
        assert len(nodes) == result.graph_node_count
        assert len(edges) == result.graph_edge_count
        assert {node.node_type for node in nodes} >= {"table", "field", "derived_entity"}
        node_ids = {node.id for node in nodes}
        assert all(
            edge.source_node_id in node_ids and edge.target_node_id in node_ids
            for edge in edges
        )

        import_job = session.get(ImportJob, result.import_job_id)
        assert import_job is not None
        assert import_job.project_id == project_id
        assert import_job.dataset_id == result.dataset_id
        assert import_job.label == "customers_orders.csv"
        assert import_job.kind == "file"
        assert import_job.status == "succeeded"
        assert import_job.progress == 100
        assert import_job.retryable is False
        assert import_job.error_message is None
        assert import_job.summary == {
            "sheet_count": result.sheet_count,
            "field_count": result.field_count,
            "suggestion_count": result.suggestion_count,
            "graph_node_count": result.graph_node_count,
            "graph_edge_count": result.graph_edge_count,
        }


def test_reimporting_same_named_file_keeps_dataset_files_tables_and_suggestions_isolated(
    tmp_workspace: Path, tmp_path: Path
):
    first_dir = tmp_path / "first"
    second_dir = tmp_path / "second"
    first_dir.mkdir()
    second_dir.mkdir()
    first_csv = first_dir / "customers_orders.csv"
    second_csv = second_dir / "customers_orders.csv"
    first_csv.write_text(
        "\n".join(
            [
                "order_id,customer_id,product_id,amount,region",
                "o1,c1,p1,120,East",
                "o2,c1,p2,240,East",
                "o3,c2,p1,80,West",
            ]
        ),
        encoding="utf-8",
    )
    second_csv.write_text(
        "\n".join(
            [
                "order_id,customer_id,product_id,amount,region",
                "n1,c9,p9,999,North",
                "n2,c8,p8,777,South",
                "n3,c9,p9,555,North",
            ]
        ),
        encoding="utf-8",
    )

    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = ProjectRepository(session).create_project(name="Demo Project")
        session.commit()
        project_id = project.id

    service = ImportService(paths, session_factory)
    first_result = service.import_file(project_id, first_csv)
    second_result = service.import_file(project_id, second_csv)

    with session_factory() as session:
        datasets = session.scalars(select(Dataset).order_by(Dataset.id)).all()
        assert len(datasets) == 2
        assert datasets[0].raw_data_ref != datasets[1].raw_data_ref
        assert (tmp_workspace / datasets[0].raw_data_ref).read_text(encoding="utf-8") != (
            tmp_workspace / datasets[1].raw_data_ref
        ).read_text(encoding="utf-8")

        sheets = session.scalars(select(Sheet).order_by(Sheet.dataset_id)).all()
        assert len(sheets) == 2
        assert sheets[0].duckdb_table_name != sheets[1].duckdb_table_name
        assert sheets[0].duckdb_table_name.startswith(
            f"p{project_id}_j{first_result.import_job_id}_a"
        )
        assert sheets[0].duckdb_table_name.endswith("_customers_orders")
        assert sheets[1].duckdb_table_name.startswith(
            f"p{project_id}_j{second_result.import_job_id}_a"
        )
        assert sheets[1].duckdb_table_name.endswith("_customers_orders")

        second_field_ids = {
            field.id
            for field in session.scalars(
                select(FieldProfile)
                .join(Sheet)
                .where(Sheet.dataset_id == second_result.dataset_id)
            )
        }
        assert len(second_field_ids) == 5

        second_suggestions = session.scalars(
            select(RelationshipSuggestion).where(
                RelationshipSuggestion.source_field_id.in_(second_field_ids)
            )
        ).all()
        assert second_suggestions
        assert all(
            suggestion.source_field_id in second_field_ids
            for suggestion in second_suggestions
        )
        assert all(
            suggestion.target_field_id is None or suggestion.target_field_id in second_field_ids
            for suggestion in second_suggestions
        )

    with duckdb.connect(str(paths.duckdb_path)) as connection:
        first_rows = connection.execute(
            f'SELECT order_id, amount FROM "{sheets[0].duckdb_table_name}" ORDER BY order_id'
        ).fetchall()
        second_rows = connection.execute(
            f'SELECT order_id, amount FROM "{sheets[1].duckdb_table_name}" ORDER BY order_id'
        ).fetchall()

    assert first_rows == [("o1", 120), ("o2", 240), ("o3", 80)]
    assert second_rows == [("n1", 999), ("n2", 777), ("n3", 555)]


def test_reset_project_data_drops_duckdb_tables_and_import_files(
    tmp_workspace: Path, sample_csv: Path
):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = ProjectRepository(session).create_project(name="Reset Project")
        session.commit()
        project_id = project.id

    result = ImportService(paths, session_factory).import_file(project_id, sample_csv)
    with session_factory() as session:
        dataset = session.get(Dataset, result.dataset_id)
        assert dataset is not None
        raw_data_path = tmp_workspace / dataset.raw_data_ref
        table_names = [
            table.duckdb_table_name
            for table in session.scalars(select(Sheet).where(Sheet.dataset_id == dataset.id))
        ]

    assert raw_data_path.exists()
    with duckdb.connect(str(paths.duckdb_path)) as connection:
        for table_name in table_names:
            assert connection.execute(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ?",
                [table_name],
            ).fetchone() == (1,)

    ProjectDataService(paths, session_factory).reset_project_data(project_id)

    assert not raw_data_path.exists()
    with session_factory() as session:
        assert session.query(ImportJob).filter(ImportJob.project_id == project_id).count() == 0
    with duckdb.connect(str(paths.duckdb_path)) as connection:
        for table_name in table_names:
            assert connection.execute(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ?",
                [table_name],
            ).fetchone() == (0,)


def test_import_failure_compensates_sqlite_duckdb_and_copied_file(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project(name="Fault Injection")
        session.commit()
        project_id = project.id

    def fail_after_external_artifacts(self, dataset_id, profile):
        raise RuntimeError("injected sheet persistence failure")

    monkeypatch.setattr(ImportRepository, "add_sheet_profile", fail_after_external_artifacts)

    with pytest.raises(RuntimeError, match="injected sheet persistence failure"):
        ImportService(paths, session_factory).import_file(project_id, sample_csv)

    with session_factory() as session:
        assert session.query(Dataset).filter(Dataset.project_id == project_id).count() == 0
        job = session.query(ImportJob).filter(ImportJob.project_id == project_id).one()
        assert job.status == "failed"
        assert job.dataset_id is None
    with duckdb.connect(str(paths.duckdb_path)) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'main'"
        ).fetchone() == (0,)
    assert list(paths.imports_dir.rglob("*")) == []


def test_structured_batch_assigns_unique_tables_to_colliding_dataframe_sheet_names(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project(name="Sheet Collision")
        session.commit()
        project_id = project.id

    sheets = {
        "Sales Data": pd.DataFrame({"value": [1]}),
        "sales-data": pd.DataFrame({"value": [2]}),
    }
    monkeypatch.setattr(ImportService, "_read_file", lambda *_args, **_kwargs: sheets)

    result = ImportService(paths, session_factory).import_structured_batch(
        project_id,
        [sample_csv],
    )

    assert result.dataset_count == 1
    with session_factory() as session:
        profiles = session.scalars(select(Sheet).order_by(Sheet.id)).all()
        assert [profile.name for profile in profiles] == ["Sales Data", "sales-data"]
        table_names = [profile.duckdb_table_name for profile in profiles]
    assert table_names[0].endswith("_sales_data")
    assert table_names[1].endswith("_sales_data_2")
    with duckdb.connect(str(paths.duckdb_path)) as connection:
        assert connection.execute(f'SELECT value FROM "{table_names[0]}"').fetchall() == [(1,)]
        assert connection.execute(f'SELECT value FROM "{table_names[1]}"').fetchall() == [(2,)]


def test_synchronous_import_preserves_canceled_terminal_state(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project(name="Canceled Sync Import")
        session.commit()
        project_id = project.id

    original_read_file = ImportService._read_file

    def cancel_after_parse(self, source_path, import_name=None):
        sheets = original_read_file(self, source_path, import_name)
        with session_factory() as session:
            repository = ImportRepository(session)
            job = session.query(ImportJob).filter_by(project_id=project_id).one()
            assert repository.cancel_import_job(job)
            session.commit()
        return sheets

    monkeypatch.setattr(ImportService, "_read_file", cancel_after_parse)

    with pytest.raises(ImportJobCanceledError):
        ImportService(paths, session_factory).import_file(project_id, sample_csv)

    with session_factory() as session:
        job = session.query(ImportJob).filter_by(project_id=project_id).one()
        assert job.status == "canceled"
        assert session.query(Dataset).filter_by(project_id=project_id).count() == 0


def test_failed_batch_item_keeps_retry_source_but_compensates_dataset_artifacts(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project(name="Batch Fault Injection")
        session.commit()
        project_id = project.id

    def fail_after_external_artifacts(self, dataset_id, profile):
        raise RuntimeError("injected batch sheet persistence failure")

    monkeypatch.setattr(ImportRepository, "add_sheet_profile", fail_after_external_artifacts)

    with pytest.raises(ValueError, match="All import batch items failed"):
        ImportService(paths, session_factory).import_structured_batch(
            project_id,
            [sample_csv],
            label="Faulty batch",
        )

    with session_factory() as session:
        assert session.query(Dataset).filter(Dataset.project_id == project_id).count() == 0
        item = session.query(ImportItem).filter(ImportItem.project_id == project_id).one()
        assert item.status == "failed"
        retry_source = paths.root / item.raw_data_ref
    assert retry_source.exists()
    assert not list(paths.imports_dir.rglob("dataset_*"))
    with duckdb.connect(str(paths.duckdb_path)) as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'main'"
        ).fetchone() == (0,)
