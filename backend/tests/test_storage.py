from datetime import UTC

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from graphmind.services.graph_service import GraphService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import (
    Dataset,
    FieldProfile,
    GraphEdge,
    GraphNode,
    Project,
    RelationshipSuggestion,
    ReviewAnalyticsSnapshotCleanupAudit,
    Sheet,
)
from graphmind.storage.repositories import ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def test_workspace_paths_create_expected_directories(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)

    paths.ensure()

    assert paths.database_path.parent.exists()
    assert paths.imports_dir.exists()
    assert paths.duckdb_path.parent.exists()
    assert paths.database_path.name == "graphmind.sqlite3"
    assert paths.duckdb_path.name == "graphmind.duckdb"


def test_project_repository_creates_default_project(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        repo = ProjectRepository(session)
        project = repo.create_project(name="Demo Project")
        session.commit()

    with session_factory() as session:
        saved = session.get(Project, project.id)
        assert saved is not None
        assert saved.name == "Demo Project"
        assert saved.settings == {}


def test_initialize_database_creates_review_analytics_cleanup_audit_table(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = ProjectRepository(session).create_project(name="Cleanup Audit")
        session.flush()
        event = ReviewAnalyticsSnapshotCleanupAudit(
            project_id=project.id,
            retention_days=90,
            cutoff_date="2026-03-13",
            removed_count=2,
            remaining_count=4,
        )
        session.add(event)
        session.commit()
        event_id = event.id

    with session_factory() as session:
        saved = session.get(ReviewAnalyticsSnapshotCleanupAudit, event_id)
        assert saved is not None
        assert saved.project_id == project.id
        assert saved.retention_days == 90
        assert saved.cutoff_date == "2026-03-13"
        assert saved.created_at.tzinfo is UTC


def test_sqlite_foreign_keys_are_enforced(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        session.add(
            Dataset(
                project_id=999,
                filename="missing-project.csv",
                file_type="csv",
                raw_data_ref="imports/missing-project.csv",
            )
        )

        with pytest.raises(IntegrityError):
            session.commit()


def test_datetimes_round_trip_as_utc_aware(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = ProjectRepository(session).create_project(name="Demo Project")
        session.commit()
        project_id = project.id

    with session_factory() as session:
        saved = session.get(Project, project_id)
        assert saved is not None
        assert saved.created_at.tzinfo is UTC
        assert saved.updated_at.tzinfo is UTC


def test_project_updated_at_changes_on_update(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = ProjectRepository(session).create_project(name="Demo Project")
        session.commit()
        original_updated_at = project.updated_at

        project.name = "Renamed Project"
        session.commit()

        assert project.updated_at.tzinfo is UTC
        assert project.updated_at > original_updated_at


def test_relationship_suggestion_datetimes_round_trip_and_update_on_review(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Suggestion Times", settings={})
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
            row_count=2,
            column_count=2,
            duckdb_table_name="orders",
        )
        session.add(sheet)
        session.flush()
        source = FieldProfile(
            sheet_id=sheet.id,
            original_name="Customer ID",
            normalized_name="customer_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1", "c2"],
            key_candidate_score=0.9,
        )
        target = FieldProfile(
            sheet_id=sheet.id,
            original_name="Account ID",
            normalized_name="account_id",
            inferred_type="string",
            null_count=0,
            unique_count=2,
            sample_values=["c1", "c2"],
            key_candidate_score=0.8,
        )
        session.add_all([source, target])
        session.flush()
        suggestion = RelationshipSuggestion(
            project_id=project.id,
            source_field_id=source.id,
            target_field_id=target.id,
            relationship_type="same_entity",
            confidence=0.91,
            evidence_summary="Matched identifiers.",
            evidence_payload={"overlap": 0.95},
            decision_status="pending",
        )
        session.add(suggestion)
        session.commit()
        suggestion_id = suggestion.id
        original_updated_at = suggestion.updated_at

        assert suggestion.created_at.tzinfo is UTC
        assert suggestion.updated_at.tzinfo is UTC

    GraphService(session_factory).review_suggestion(
        suggestion_id=suggestion_id,
        decision_status="accepted",
        decision_note="Confirmed by reviewer.",
    )

    with session_factory() as session:
        saved = session.get(RelationshipSuggestion, suggestion_id)
        assert saved is not None
        assert saved.created_at.tzinfo is UTC
        assert saved.updated_at.tzinfo is UTC
        assert saved.updated_at > original_updated_at


def test_initialize_database_backfills_relationship_suggestion_timestamps(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    engine = create_engine(f"sqlite:///{paths.database_path}", future=True)

    with engine.begin() as connection:
        connection.execute(
            text(
                """
                CREATE TABLE projects (
                    id INTEGER NOT NULL,
                    name VARCHAR(200) NOT NULL,
                    created_at DATETIME,
                    updated_at DATETIME,
                    settings JSON,
                    ai_provider_config_ref VARCHAR(300),
                    PRIMARY KEY (id)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE datasets (
                    id INTEGER NOT NULL,
                    project_id INTEGER NOT NULL,
                    filename VARCHAR(300) NOT NULL,
                    file_type VARCHAR(30) NOT NULL,
                    imported_at DATETIME,
                    import_status VARCHAR(30) NOT NULL,
                    raw_data_ref VARCHAR(500) NOT NULL,
                    error_message TEXT,
                    PRIMARY KEY (id)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE sheets (
                    id INTEGER NOT NULL,
                    dataset_id INTEGER NOT NULL,
                    name VARCHAR(200) NOT NULL,
                    normalized_name VARCHAR(200) NOT NULL,
                    row_count INTEGER NOT NULL,
                    column_count INTEGER NOT NULL,
                    duckdb_table_name VARCHAR(200) NOT NULL,
                    PRIMARY KEY (id)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE field_profiles (
                    id INTEGER NOT NULL,
                    sheet_id INTEGER NOT NULL,
                    original_name VARCHAR(200) NOT NULL,
                    normalized_name VARCHAR(200) NOT NULL,
                    inferred_type VARCHAR(50) NOT NULL,
                    null_count INTEGER NOT NULL,
                    unique_count INTEGER NOT NULL,
                    sample_values JSON,
                    min_value VARCHAR(200),
                    max_value VARCHAR(200),
                    semantic_label VARCHAR(200),
                    key_candidate_score FLOAT NOT NULL,
                    PRIMARY KEY (id)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE relationship_suggestions (
                    id INTEGER NOT NULL,
                    project_id INTEGER NOT NULL,
                    source_field_id INTEGER NOT NULL,
                    target_field_id INTEGER,
                    relationship_type VARCHAR(80) NOT NULL,
                    confidence FLOAT NOT NULL,
                    evidence_summary TEXT NOT NULL,
                    evidence_payload JSON,
                    ai_explanation TEXT,
                    decision_status VARCHAR(40) NOT NULL,
                    decision_note TEXT,
                    PRIMARY KEY (id)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO relationship_suggestions (
                    id,
                    project_id,
                    source_field_id,
                    target_field_id,
                    relationship_type,
                    confidence,
                    evidence_summary,
                    evidence_payload,
                    decision_status
                )
                VALUES (1, 1, 1, 2, 'same_entity', 0.91, 'Matched identifiers.', '{}', 'pending')
                """
            )
        )

    initialize_database(paths.database_path)

    with engine.connect() as connection:
        columns = {
            row[1]
            for row in connection.exec_driver_sql(
                "PRAGMA table_info(relationship_suggestions)"
            ).fetchall()
        }
        assert {"created_at", "updated_at"}.issubset(columns)
        row = connection.execute(
            text(
                """
                SELECT created_at, updated_at
                FROM relationship_suggestions
                WHERE id = 1
                """
            )
        ).one()

    assert row.created_at is not None
    assert row.updated_at is not None


def test_initialize_database_creates_review_analytics_snapshot_table(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()

    initialize_database(paths.database_path)

    with create_engine(f"sqlite:///{paths.database_path}", future=True).connect() as connection:
        columns = {
            row[1]
            for row in connection.exec_driver_sql(
                "PRAGMA table_info(review_analytics_snapshots)"
            ).fetchall()
        }
        indexes = {
            row[1]
            for row in connection.exec_driver_sql(
                "PRAGMA index_list(review_analytics_snapshots)"
            ).fetchall()
        }

    assert {
        "id",
        "project_id",
        "snapshot_date",
        "window_days",
        "generated_at",
        "analytics_payload",
    }.issubset(columns)
    assert "ix_review_analytics_snapshots_project_date_window" in indexes


def test_initialize_database_adds_relationship_suggestion_reviewer_column(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()

    initialize_database(paths.database_path)

    with create_engine(f"sqlite:///{paths.database_path}", future=True).connect() as connection:
        columns = {
            row[1]
            for row in connection.exec_driver_sql(
                "PRAGMA table_info(relationship_suggestions)"
            ).fetchall()
        }

    assert "reviewed_by" in columns


def test_initialize_database_creates_import_job_lease_columns_and_index(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()

    initialize_database(paths.database_path)

    with create_engine(f"sqlite:///{paths.database_path}", future=True).connect() as connection:
        columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(import_jobs)").fetchall()
        }
        indexes = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA index_list(import_jobs)").fetchall()
        }

    assert {
        "worker_id",
        "lease_token",
        "claimed_at",
        "heartbeat_at",
        "lease_expires_at",
    }.issubset(columns)
    assert "ix_import_jobs_status_lease" in indexes


def test_graph_edge_created_from_suggestion_has_foreign_key():
    targets = {
        foreign_key.target_fullname
        for foreign_key in GraphEdge.__table__.c.created_from_suggestion_id.foreign_keys
    }

    assert targets == {"relationship_suggestions.id"}


def test_graph_edge_metadata_round_trips(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = Project(name="Edge Metadata", settings={})
        session.add(project)
        session.flush()

        source = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Orders.customer_id",
            source_ref="orders.customer_id",
            node_metadata={},
            position_x=0,
            position_y=0,
        )
        target = GraphNode(
            project_id=project.id,
            node_type="field",
            label="Customers.customer_id",
            source_ref="customers.customer_id",
            node_metadata={},
            position_x=120,
            position_y=0,
        )
        session.add_all([source, target])
        session.flush()

        edge = GraphEdge(
            project_id=project.id,
            source_node_id=source.id,
            target_node_id=target.id,
            edge_type="foreign_key",
            confidence=0.91,
            status="suggested",
            evidence_ref="suggestion:0",
            edge_metadata={"evidence_payload": {"overlap_count": 3}},
        )
        session.add(edge)
        session.commit()
        edge_id = edge.id

    with session_factory() as session:
        saved = session.get(GraphEdge, edge_id)
        assert saved is not None
        assert saved.edge_metadata == {"evidence_payload": {"overlap_count": 3}}
