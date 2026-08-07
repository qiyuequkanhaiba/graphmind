from collections.abc import Callable
from pathlib import Path

import duckdb
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from graphmind.storage.models import Base
from graphmind.storage.workspace import WorkspacePaths


def create_engine_for_path(database_path: Path) -> Engine:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{database_path}", future=True)

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def initialize_database(database_path: Path) -> None:
    engine = create_engine_for_path(database_path)
    try:
        Base.metadata.create_all(engine)
        _migrate_existing_database(engine)
    finally:
        engine.dispose()


def initialize_workspace_databases(paths: WorkspacePaths) -> None:
    initialize_database(paths.database_path)
    with duckdb.connect(str(paths.duckdb_path)):
        pass


def _migrate_existing_database(engine: Engine) -> None:
    with engine.begin() as connection:
        columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(projects)").fetchall()
        }
        if "default_key" not in columns:
            connection.exec_driver_sql("ALTER TABLE projects ADD COLUMN default_key VARCHAR(40)")
        default_key_count = connection.exec_driver_sql(
            "SELECT COUNT(*) FROM projects WHERE default_key = 'default'"
        ).scalar_one()
        if default_key_count == 0:
            connection.exec_driver_sql(
                """
                UPDATE projects
                SET default_key = 'default'
                WHERE id = (
                    SELECT id
                    FROM projects
                    WHERE settings LIKE '%"default"%true%'
                    ORDER BY id
                    LIMIT 1
                )
                """
            )
        connection.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_projects_default_key ON projects(default_key)"
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS project_share_tokens (
                id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                label VARCHAR(200) NOT NULL,
                role VARCHAR(40) NOT NULL,
                token_hash VARCHAR(80) NOT NULL,
                created_at DATETIME,
                last_used_at DATETIME,
                revoked_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(project_id) REFERENCES projects (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS ix_project_share_tokens_token_hash
            ON project_share_tokens(token_hash)
            """
        )
        graph_edge_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(graph_edges)").fetchall()
        }
        if graph_edge_columns and "edge_metadata" not in graph_edge_columns:
            connection.exec_driver_sql("ALTER TABLE graph_edges ADD COLUMN edge_metadata JSON")
        relationship_suggestion_columns = {
            row[1]
            for row in connection.exec_driver_sql(
                "PRAGMA table_info(relationship_suggestions)"
            ).fetchall()
        }
        if relationship_suggestion_columns and "created_at" not in relationship_suggestion_columns:
            connection.exec_driver_sql(
                "ALTER TABLE relationship_suggestions ADD COLUMN created_at DATETIME"
            )
            connection.exec_driver_sql(
                """
                UPDATE relationship_suggestions
                SET created_at = CURRENT_TIMESTAMP
                WHERE created_at IS NULL
                """
            )
            relationship_suggestion_columns.add("created_at")
        if relationship_suggestion_columns and "updated_at" not in relationship_suggestion_columns:
            connection.exec_driver_sql(
                "ALTER TABLE relationship_suggestions ADD COLUMN updated_at DATETIME"
            )
            connection.exec_driver_sql(
                """
                UPDATE relationship_suggestions
                SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP)
                WHERE updated_at IS NULL
                """
            )
        if relationship_suggestion_columns and "reviewed_by" not in relationship_suggestion_columns:
            connection.exec_driver_sql(
                "ALTER TABLE relationship_suggestions ADD COLUMN reviewed_by VARCHAR(120)"
            )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS review_analytics_snapshots (
                id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                snapshot_date VARCHAR(10) NOT NULL,
                window_days INTEGER NOT NULL,
                generated_at DATETIME,
                analytics_payload JSON,
                PRIMARY KEY (id),
                FOREIGN KEY(project_id) REFERENCES projects (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS ix_review_analytics_snapshots_project_date_window
            ON review_analytics_snapshots(project_id, snapshot_date, window_days)
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS review_analytics_snapshot_cleanup_audits (
                id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                retention_days INTEGER NOT NULL,
                cutoff_date VARCHAR(10) NOT NULL,
                removed_count INTEGER NOT NULL,
                remaining_count INTEGER NOT NULL,
                created_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(project_id) REFERENCES projects (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE INDEX IF NOT EXISTS ix_review_analytics_cleanup_audits_project_created
            ON review_analytics_snapshot_cleanup_audits(project_id, created_at)
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS evidence_index_entries (
                id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                document_id VARCHAR(120) NOT NULL,
                kind VARCHAR(80) NOT NULL,
                label VARCHAR(300) NOT NULL,
                content TEXT NOT NULL,
                source_ref VARCHAR(500) NOT NULL,
                embedding JSON,
                embedding_model VARCHAR(200),
                created_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(project_id) REFERENCES projects (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS import_jobs (
                id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                label VARCHAR(300) NOT NULL,
                kind VARCHAR(30) NOT NULL,
                status VARCHAR(40) NOT NULL,
                progress INTEGER NOT NULL,
                summary JSON,
                error_message TEXT,
                retryable BOOLEAN NOT NULL,
                dataset_id INTEGER,
                worker_id VARCHAR(200),
                lease_token VARCHAR(80),
                claimed_at DATETIME,
                heartbeat_at DATETIME,
                lease_expires_at DATETIME,
                created_at DATETIME,
                updated_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(project_id) REFERENCES projects (id),
                FOREIGN KEY(dataset_id) REFERENCES datasets (id)
            )
            """
        )
        import_job_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(import_jobs)").fetchall()
        }
        import_job_column_migrations = {
            "worker_id": "VARCHAR(200)",
            "lease_token": "VARCHAR(80)",
            "claimed_at": "DATETIME",
            "heartbeat_at": "DATETIME",
            "lease_expires_at": "DATETIME",
        }
        for column_name, column_type in import_job_column_migrations.items():
            if column_name not in import_job_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE import_jobs ADD COLUMN {column_name} {column_type}"
                )
        connection.exec_driver_sql(
            """
            CREATE INDEX IF NOT EXISTS ix_import_jobs_status_lease
            ON import_jobs(status, lease_expires_at, updated_at)
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS import_batches (
                id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                label VARCHAR(300) NOT NULL,
                status VARCHAR(40) NOT NULL,
                progress INTEGER NOT NULL,
                summary JSON,
                error_message TEXT,
                created_at DATETIME,
                updated_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(project_id) REFERENCES projects (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS import_items (
                id INTEGER NOT NULL,
                batch_id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                filename VARCHAR(300) NOT NULL,
                file_type VARCHAR(40) NOT NULL,
                source_kind VARCHAR(40) NOT NULL,
                status VARCHAR(40) NOT NULL,
                raw_data_ref VARCHAR(500) NOT NULL,
                artifact_ref VARCHAR(500),
                error_message TEXT,
                summary JSON,
                created_at DATETIME,
                updated_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(batch_id) REFERENCES import_batches (id),
                FOREIGN KEY(project_id) REFERENCES projects (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS document_sources (
                id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                import_item_id INTEGER NOT NULL,
                title VARCHAR(300) NOT NULL,
                document_type VARCHAR(80) NOT NULL,
                source_ref VARCHAR(500) NOT NULL,
                source_metadata JSON,
                created_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(project_id) REFERENCES projects (id),
                FOREIGN KEY(import_item_id) REFERENCES import_items (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS document_chunks (
                id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                document_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                heading VARCHAR(300),
                content TEXT NOT NULL,
                token_count INTEGER NOT NULL,
                source_ref VARCHAR(500) NOT NULL,
                content_hash VARCHAR(80) NOT NULL,
                chunk_metadata JSON,
                created_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(project_id) REFERENCES projects (id),
                FOREIGN KEY(document_id) REFERENCES document_sources (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS extracted_entities (
                id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                canonical_name VARCHAR(300) NOT NULL,
                entity_type VARCHAR(80) NOT NULL,
                aliases JSON,
                confidence FLOAT NOT NULL,
                source_refs JSON,
                entity_metadata JSON,
                created_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(project_id) REFERENCES projects (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS extracted_relationships (
                id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                source_entity_id INTEGER NOT NULL,
                target_entity_id INTEGER NOT NULL,
                relationship_type VARCHAR(80) NOT NULL,
                confidence FLOAT NOT NULL,
                status VARCHAR(40) NOT NULL,
                evidence_summary TEXT NOT NULL,
                evidence_payload JSON,
                source_refs JSON,
                created_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(project_id) REFERENCES projects (id),
                FOREIGN KEY(source_entity_id) REFERENCES extracted_entities (id),
                FOREIGN KEY(target_entity_id) REFERENCES extracted_entities (id)
            )
            """
        )


def create_session_factory(database_path: Path) -> Callable[[], Session]:
    engine = create_engine_for_path(database_path)
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)
