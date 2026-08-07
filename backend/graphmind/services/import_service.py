from __future__ import annotations

import logging
import shutil
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Event, Thread
from uuid import uuid4

import duckdb
import pandas as pd
from sqlalchemy.orm import Session

from graphmind.core.graph_builder import build_graph
from graphmind.core.normalizers import (
    normalize_sheet_name,
    unique_normalized_sheet_names,
)
from graphmind.core.profiling import FieldProfileData, SheetProfileData, profile_dataframe
from graphmind.core.relationships import infer_relationships
from graphmind.services.code_repository_import import (
    is_repository_archive_path,
    parse_code_repository_archive_result,
)
from graphmind.services.document_import import (
    ParsedDocument,
    is_document_like_path,
    parse_document_file,
    source_kind_for_path,
)
from graphmind.services.document_persistence import (
    PersistedDocumentImport,
    persist_parsed_document,
)
from graphmind.services.entity_resolution import resolve_cross_source_entities
from graphmind.services.import_batch_diagnostics import batch_import_diagnostics
from graphmind.services.import_job_staging import create_staged_import_job
from graphmind.services.import_paths import (
    import_attempt_id,
    safe_import_basename,
    safe_import_destination,
    url_import_filename,
)
from graphmind.services.json_import import read_table_json
from graphmind.services.prepared_dataset import normalize_dataframe_columns, prepare_dataset
from graphmind.services.url_import import (
    FetchedURLSource,
    fetch_diagnostics,
    fetch_url_source,
)
from graphmind.storage.models import (
    Dataset,
    FieldProfile,
    GraphEdge,
    GraphNode,
    ImportJob,
    RelationshipSuggestion,
    Sheet,
)
from graphmind.storage.repositories import (
    DocumentRepository,
    ImportBatchRepository,
    ImportRepository,
)
from graphmind.storage.workspace import WorkspacePaths

IMPORT_JOB_LEASE_DURATION = timedelta(minutes=5)
IMPORT_JOB_HEARTBEAT_INTERVAL_SECONDS = 30.0
logger = logging.getLogger(__name__)


class ImportJobCanceledError(RuntimeError):
    pass


class _ImportArtifacts:
    def __init__(self, paths: WorkspacePaths) -> None:
        self.paths = paths
        self._files: list[Path] = []
        self._duckdb_tables: list[str] = []
        self._retained = False

    def __enter__(self) -> _ImportArtifacts:
        return self

    def __exit__(self, exc_type, _exc, _traceback) -> None:
        if exc_type is not None or not self._retained:
            self.compensate()

    def track_file(self, path: Path) -> None:
        self._files.append(path)

    def track_duckdb_table(self, table_name: str) -> None:
        self._duckdb_tables.append(table_name)

    def absorb(self, other: _ImportArtifacts) -> None:
        self._files.extend(other._files)
        self._duckdb_tables.extend(other._duckdb_tables)
        other._files.clear()
        other._duckdb_tables.clear()

    def retain(self) -> None:
        self._retained = True
        self._files.clear()
        self._duckdb_tables.clear()

    def compensate(self) -> None:
        failed_tables: list[str] = []
        for table_name in reversed(self._duckdb_tables):
            try:
                with duckdb.connect(str(self.paths.duckdb_path)) as connection:
                    quoted_name = table_name.replace('"', '""')
                    connection.execute(f'DROP TABLE IF EXISTS "{quoted_name}"')
            except Exception:
                failed_tables.append(table_name)
                logger.exception(
                    "Failed to compensate DuckDB import artifact",
                    extra={"table_name": table_name},
                )

        for path in reversed(self._files):
            try:
                if not path.resolve(strict=False).is_relative_to(self.paths.imports_dir.resolve()):
                    logger.error(
                        "Refusing to compensate file outside import directory",
                        extra={"path": str(path)},
                    )
                    continue
                path.unlink(missing_ok=True)
                parent = path.parent
                while parent != self.paths.imports_dir and parent.is_relative_to(
                    self.paths.imports_dir
                ):
                    try:
                        parent.rmdir()
                    except OSError:
                        break
                    parent = parent.parent
            except OSError:
                logger.exception("Failed to compensate imported file", extra={"path": str(path)})

        self._files.clear()
        self._duckdb_tables = failed_tables


class _ImportJobHeartbeat:
    def __init__(
        self,
        session_factory: Callable[[], Session],
        *,
        project_id: int,
        job_id: int,
        lease_token: str,
    ) -> None:
        self.session_factory = session_factory
        self.project_id = project_id
        self.job_id = job_id
        self.lease_token = lease_token
        self._stop = Event()
        self._lease_lost = Event()
        self._thread = Thread(
            target=self._run,
            name=f"graphmind-import-heartbeat-{job_id}",
            daemon=True,
        )

    def __enter__(self) -> _ImportJobHeartbeat:
        self._thread.start()
        return self

    def __exit__(self, _exc_type, _exc, _traceback) -> None:
        self._stop.set()
        self._thread.join(timeout=IMPORT_JOB_HEARTBEAT_INTERVAL_SECONDS + 1)

    def assert_active(self) -> None:
        if self._lease_lost.is_set():
            raise ImportJobCanceledError("Import job canceled or lease ownership lost")
        with self.session_factory() as session:
            active = ImportRepository(session).import_job_claim_is_active(
                project_id=self.project_id,
                job_id=self.job_id,
                lease_token=self.lease_token,
            )
        if not active:
            self._lease_lost.set()
            raise ImportJobCanceledError("Import job canceled or lease ownership lost")

    def _run(self) -> None:
        while not self._stop.wait(IMPORT_JOB_HEARTBEAT_INTERVAL_SECONDS):
            try:
                with self.session_factory() as session:
                    renewed = ImportRepository(session).heartbeat_import_job(
                        project_id=self.project_id,
                        job_id=self.job_id,
                        lease_token=self.lease_token,
                        now=datetime.now(UTC),
                        lease_duration=IMPORT_JOB_LEASE_DURATION,
                    )
                    session.commit()
            except Exception:
                logger.exception(
                    "Import job heartbeat failed",
                    extra={"import_job_id": self.job_id},
                )
                continue
            if not renewed:
                self._lease_lost.set()
                return


@dataclass(frozen=True)
class ImportResult:
    import_job_id: int
    dataset_id: int
    sheet_count: int
    field_count: int
    suggestion_count: int
    graph_node_count: int
    graph_edge_count: int


@dataclass(frozen=True)
class StructuredBatchImportResult:
    batch_id: int
    dataset_ids: list[int]
    dataset_count: int
    document_count: int
    sheet_count: int
    field_count: int
    suggestion_count: int
    graph_node_count: int
    graph_edge_count: int


@dataclass(frozen=True)
class BatchItemImportResult:
    dataset_ids: list[int]
    document_ids: list[int]
    profiles: list[SheetProfileData]
    dataframes: dict[str, pd.DataFrame]


class ImportService:
    def __init__(
        self,
        paths: WorkspacePaths,
        session_factory: Callable[[], Session],
    ) -> None:
        self.paths = paths
        self.session_factory = session_factory

    def import_file(
        self,
        project_id: int,
        file_path: str | Path,
        display_filename: str | None = None,
        kind: str = "file",
    ) -> ImportResult:
        self.paths.ensure()
        source_path = Path(file_path)
        import_name = safe_import_basename(display_filename or source_path.name)
        with self.session_factory() as session:
            repository = ImportRepository(session)
            job = repository.create_import_job(project_id=project_id, label=import_name, kind=kind)
            job_id = job.id
            session.commit()

        try:
            return self._execute_import_file(project_id, source_path, import_name, job_id)
        except ImportJobCanceledError:
            raise
        except Exception as exc:
            with self.session_factory() as session:
                repository = ImportRepository(session)
                saved_job = session.get(ImportJob, job_id)
                if saved_job is not None:
                    repository.fail_import_job(saved_job, str(exc), retryable=True)
                    session.commit()
            raise

    def create_import_job(
        self,
        project_id: int,
        file_path: str | Path,
        display_filename: str,
        kind: str = "file",
    ) -> int:
        return create_staged_import_job(
            paths=self.paths,
            session_factory=self.session_factory,
            project_id=project_id,
            file_path=file_path,
            display_filename=display_filename,
            kind=kind,
        )

    def run_import_job(
        self,
        project_id: int,
        job_id: int,
        *,
        worker_id: str = "inline-worker",
    ) -> ImportResult:
        lease_token = uuid4().hex
        claimed_at = datetime.now(UTC)
        with self.session_factory() as session:
            repository = ImportRepository(session)
            claimed_job = repository.claim_import_job(
                project_id=project_id,
                job_id=job_id,
                worker_id=worker_id,
                lease_token=lease_token,
                now=claimed_at,
                lease_duration=IMPORT_JOB_LEASE_DURATION,
            )
            if claimed_job is None:
                job = repository.get_import_job(project_id=project_id, job_id=job_id)
                if job is not None and job.status == "canceled":
                    raise ImportJobCanceledError("Import job canceled")
                if job is None:
                    raise ValueError(f"Import job {job_id} not found")
                raise ValueError("Import job is not queued")
            staged_path_ref = (claimed_job.summary or {}).get("staged_path")
            import_name = claimed_job.label
            session.commit()

        if not isinstance(staged_path_ref, str):
            self._fail_claimed_import_job(
                project_id=project_id,
                job_id=job_id,
                lease_token=lease_token,
                error_message="Import job staged file not found",
                retryable=False,
            )
            raise ValueError("Import job staged file not found")
        source_path = self.paths.root / staged_path_ref
        if not source_path.exists():
            self._fail_claimed_import_job(
                project_id=project_id,
                job_id=job_id,
                lease_token=lease_token,
                error_message="Import job staged file not found",
                retryable=False,
            )
            raise ValueError("Import job staged file not found")

        try:
            with _ImportJobHeartbeat(
                self.session_factory,
                project_id=project_id,
                job_id=job_id,
                lease_token=lease_token,
            ) as heartbeat:
                return self._execute_import_file(
                    project_id,
                    source_path,
                    import_name,
                    job_id,
                    lease_token=lease_token,
                    assert_claim_active=heartbeat.assert_active,
                )
        except ImportJobCanceledError:
            raise
        except Exception as exc:
            self._fail_claimed_import_job(
                project_id=project_id,
                job_id=job_id,
                lease_token=lease_token,
                error_message=str(exc),
                retryable=True,
            )
            raise

    def _fail_claimed_import_job(
        self,
        *,
        project_id: int,
        job_id: int,
        lease_token: str,
        error_message: str,
        retryable: bool,
    ) -> bool:
        with self.session_factory() as session:
            repository = ImportRepository(session)
            job = repository.get_import_job(project_id=project_id, job_id=job_id)
            if job is None:
                return False
            failed = repository.fail_import_job(
                job,
                error_message,
                retryable=retryable,
                lease_token=lease_token,
            )
            session.commit()
            return failed

    def retry_import_job(self, project_id: int, job_id: int) -> None:
        self.paths.ensure()
        with self.session_factory() as session:
            repository = ImportRepository(session)
            job = repository.get_import_job(project_id=project_id, job_id=job_id)
            if job is None:
                raise ValueError(f"Import job {job_id} not found")
            if job.status != "failed":
                raise ValueError("Only failed import jobs can be retried")
            if not job.retryable:
                raise ValueError("Import job is not retryable")
            staged_path_ref = (job.summary or {}).get("staged_path")
            if not isinstance(staged_path_ref, str):
                raise ValueError("Import job staged file not found")
            if not (self.paths.root / staged_path_ref).exists():
                raise ValueError("Import job staged file not found")
            repository.reset_import_job_for_retry(job)
            session.commit()

    def _execute_import_file(
        self,
        project_id: int,
        source_path: Path,
        import_name: str,
        job_id: int,
        *,
        lease_token: str | None = None,
        assert_claim_active: Callable[[], None] | None = None,
    ) -> ImportResult:
        if assert_claim_active is not None:
            assert_claim_active()
        sheets = self._read_file(source_path, import_name=import_name)
        if assert_claim_active is not None:
            assert_claim_active()

        with _ImportArtifacts(self.paths) as artifacts:
            attempt_id = import_attempt_id(lease_token)
            prepared = prepare_dataset(
                paths=self.paths,
                project_id=project_id,
                job_id=job_id,
                source_path=source_path,
                import_name=import_name,
                sheets=sheets,
                normalize_dataframe=normalize_dataframe_columns,
                artifacts=artifacts,
                attempt_id=attempt_id,
                assert_claim_active=assert_claim_active,
            )
            suggestions = infer_relationships(
                profiles=prepared.profiles,
                dataframes=prepared.dataframes,
            )
            graph = build_graph(
                project_id=project_id,
                profiles=prepared.profiles,
                suggestions=suggestions,
            )
            if assert_claim_active is not None:
                assert_claim_active()

            with self.session_factory() as session:
                repository = ImportRepository(session)
                job = session.get(ImportJob, job_id)
                if job is None:
                    raise ValueError("Import job not found")
                if lease_token is None and job.status == "canceled":
                    raise ImportJobCanceledError("Import job canceled")
                if assert_claim_active is not None:
                    assert_claim_active()
                dataset = repository.create_dataset(
                    project_id=project_id,
                    file_path=import_name,
                )
                repository.set_dataset_raw_data_ref(dataset, prepared.raw_data_ref)
                for profile in prepared.profiles:
                    repository.add_sheet_profile(dataset.id, profile)
                saved_suggestions = repository.add_relationship_suggestions(
                    project_id, dataset.id, suggestions
                )
                saved_nodes, saved_edges = repository.add_graph(graph)
                repository.link_graph_edges_to_suggestions(saved_edges, saved_suggestions)
                summary = {
                    "sheet_count": len(prepared.profiles),
                    "field_count": sum(
                        len(profile.fields) for profile in prepared.profiles
                    ),
                    "suggestion_count": len(saved_suggestions),
                    "graph_node_count": len(saved_nodes),
                    "graph_edge_count": len(saved_edges),
                }
                if not repository.complete_import_job(
                    job,
                    dataset.id,
                    summary,
                    lease_token=lease_token,
                ):
                    raise ImportJobCanceledError("Import job canceled or lease ownership lost")
                session.commit()

                result = ImportResult(
                    import_job_id=job.id,
                    dataset_id=dataset.id,
                    sheet_count=summary["sheet_count"],
                    field_count=summary["field_count"],
                    suggestion_count=summary["suggestion_count"],
                    graph_node_count=summary["graph_node_count"],
                    graph_edge_count=summary["graph_edge_count"],
                )
            artifacts.retain()
            return result

    def import_structured_batch(
        self,
        project_id: int,
        files: list[str | Path],
        label: str = "Structured import batch",
    ) -> StructuredBatchImportResult:
        self.paths.ensure()
        source_paths = [Path(file) for file in files]
        if not source_paths:
            raise ValueError("No files supplied for import batch")

        with self.session_factory() as session:
            batch_repository = ImportBatchRepository(session)
            batch = batch_repository.create_batch(project_id, label)
            batch_repository.update_batch_progress(
                batch,
                "running",
                10,
                {"item_count": len(source_paths), "stage": "staged"},
            )
            session.commit()
            batch_id = batch.id

        all_profiles: list[SheetProfileData] = []
        all_dataframes: dict[str, pd.DataFrame] = {}
        dataset_ids: list[int] = []
        document_ids: list[int] = []
        item_ids: list[int] = []
        failed_item_ids: list[int] = []

        with _ImportArtifacts(self.paths) as batch_artifacts, self.session_factory() as session:
            batch_repository = ImportBatchRepository(session)
            import_repository = ImportRepository(session)
            document_repository = DocumentRepository(session)
            batch = batch_repository.get_batch(project_id, batch_id)
            if batch is None:
                raise ValueError(f"Import batch {batch_id} not found")

            for source_path in source_paths:
                import_name = source_path.name
                source_kind = self._file_source_kind(source_path)
                item = batch_repository.create_item(
                    batch_id=batch.id,
                    project_id=project_id,
                    filename=import_name,
                    file_type=source_path.suffix.lower().lstrip("."),
                    source_kind=source_kind,
                    raw_data_ref="",
                )
                item_ids.append(item.id)
                item.raw_data_ref = self._copy_to_batch_item_imports(
                    project_id=project_id,
                    batch_id=batch.id,
                    item_id=item.id,
                    source_path=source_path,
                    import_name=import_name,
                    artifacts=batch_artifacts,
                )
                item_artifacts = _ImportArtifacts(self.paths)
                try:
                    with session.begin_nested():
                        item_result = self._process_import_item(
                            project_id=project_id,
                            source_path=source_path,
                            import_name=import_name,
                            item=item,
                            batch_repository=batch_repository,
                            import_repository=import_repository,
                            document_repository=document_repository,
                            artifacts=item_artifacts,
                        )
                        dataset_ids.extend(item_result.dataset_ids)
                        document_ids.extend(item_result.document_ids)
                        all_profiles.extend(item_result.profiles)
                        all_dataframes.update(item_result.dataframes)
                except Exception as exc:
                    item_artifacts.compensate()
                    failed_item_ids.append(item.id)
                    batch_repository.update_item_stage(
                        item,
                        "failed",
                        status="failed",
                        stage_summary=str(exc),
                        summary={"failed_stage": (item.summary or {}).get("stage", "staged")},
                        error_message=str(exc),
                    )
                else:
                    batch_artifacts.absorb(item_artifacts)

            suggestions = infer_relationships(profiles=all_profiles, dataframes=all_dataframes)
            saved_suggestions = import_repository.add_relationship_suggestions_for_profiles(
                project_id,
                suggestions,
            )
            graph_profiles = self._load_project_graph_profiles(project_id, session)
            graph = build_graph(
                project_id=project_id,
                profiles=graph_profiles,
                suggestions=suggestions,
            )
            saved_nodes, saved_edges = import_repository.add_graph(graph)
            import_repository.link_graph_edges_to_suggestions(saved_edges, saved_suggestions)
            resolved_edges = resolve_cross_source_entities(project_id, session)
            failed_item_id_set = set(failed_item_ids)
            for item in batch_repository.list_items(project_id, batch.id):
                if item.id in failed_item_id_set:
                    continue
                if item.source_kind in {"table", "json"}:
                    batch_repository.update_item_stage(
                        item,
                        "resolved",
                        stage_summary=(
                            f"Resolved {len(resolved_edges)} cross-source relationship(s)."
                        ),
                    )
                batch_repository.update_item_stage(
                    item,
                    "graphed",
                    stage_summary=(
                        f"Wrote graph with {len(saved_nodes)} node(s) and "
                        f"{len(saved_edges) + len(resolved_edges)} edge(s)."
                    ),
                )

            summary = {
                "dataset_count": len(dataset_ids),
                "document_count": len(document_ids),
                "sheet_count": len(all_profiles),
                "field_count": sum(len(profile.fields) for profile in all_profiles),
                "suggestion_count": len(saved_suggestions),
                "graph_node_count": len(saved_nodes),
                "graph_edge_count": len(saved_edges) + len(resolved_edges),
                "resolved_relationship_count": len(resolved_edges),
                "item_ids": item_ids,
                "succeeded_item_count": len(item_ids) - len(failed_item_ids),
                "failed_item_count": len(failed_item_ids),
                "stage": "partial" if failed_item_ids else "graphed",
            }
            summary["diagnostics"] = batch_import_diagnostics(
                batch_repository.list_items(project_id, batch.id)
            )
            if summary["succeeded_item_count"] == 0:
                batch_repository.update_batch_progress(
                    batch,
                    "failed",
                    100,
                    summary,
                    error_message="All import batch items failed.",
                )
                session.commit()
                batch_artifacts.retain()
                raise ValueError("All import batch items failed")

            batch_status = "partial" if failed_item_ids else "succeeded"
            batch_repository.update_batch_progress(batch, batch_status, 100, summary)
            for item in batch_repository.list_items(project_id, batch.id):
                if item.id in failed_item_id_set:
                    continue
                batch_repository.update_item_stage(
                    item,
                    "indexed",
                    stage_summary="Evidence and graph artifacts are ready.",
                )
            session.commit()
            batch_artifacts.retain()

            return StructuredBatchImportResult(
                batch_id=batch.id,
                dataset_ids=dataset_ids,
                dataset_count=summary["dataset_count"],
                document_count=summary["document_count"],
                sheet_count=summary["sheet_count"],
                field_count=summary["field_count"],
                suggestion_count=summary["suggestion_count"],
                graph_node_count=summary["graph_node_count"],
                graph_edge_count=summary["graph_edge_count"],
            )

    def import_url(
        self,
        project_id: int,
        url: str,
        label: str = "URL source import",
    ) -> StructuredBatchImportResult:
        self.paths.ensure()
        fetched = fetch_url_source(url)
        safe_name = url_import_filename(fetched.title, fetched.content_hash, fetched.extension)
        url_dir = self.paths.imports_dir / f"project_{project_id}" / "url_sources"
        staged_path = safe_import_destination(url_dir, safe_name)
        url_artifacts = _ImportArtifacts(self.paths)
        try:
            staged_path.write_bytes(fetched.body)
        except Exception:
            staged_path.unlink(missing_ok=True)
            raise

        with url_artifacts, self.session_factory() as session:
            batch_repository = ImportBatchRepository(session)
            import_repository = ImportRepository(session)
            document_repository = DocumentRepository(session)
            batch = batch_repository.create_batch(project_id, label)
            batch_repository.update_batch_progress(
                batch,
                "running",
                10,
                {
                    "item_count": 1,
                    "stage": "staged",
                    "source_kind": "url",
                    "url": fetched.requested_url,
                    "final_url": fetched.final_url,
                    "diagnostics": fetch_diagnostics(fetched),
                },
            )
            item = batch_repository.create_item(
                batch_id=batch.id,
                project_id=project_id,
                filename=fetched.title,
                file_type=fetched.extension.lstrip(".") or "txt",
                source_kind="url",
                raw_data_ref=staged_path.relative_to(self.paths.root).as_posix(),
            )
            batch_repository.update_item_stage(
                item,
                "fetched",
                progress=15,
                stage_summary=f"Fetched URL source from {fetched.final_url}.",
                summary={
                    "url": fetched.requested_url,
                    "final_url": fetched.final_url,
                    "fetch": fetch_diagnostics(fetched),
                },
                diagnostics=fetch_diagnostics(fetched),
            )
            try:
                with session.begin_nested():
                    item_result = self._process_url_import_item(
                        project_id=project_id,
                        source_path=staged_path,
                        import_name=fetched.title,
                        item=item,
                        fetched=fetched,
                        batch_repository=batch_repository,
                        import_repository=import_repository,
                        document_repository=document_repository,
                        artifacts=url_artifacts,
                    )
            except Exception as exc:
                url_artifacts.compensate()
                item.raw_data_ref = staged_path.relative_to(self.paths.root).as_posix()
                batch_repository.update_item_stage(
                    item,
                    "failed",
                    status="failed",
                    stage_summary=str(exc),
                    summary={"failed_stage": (item.summary or {}).get("stage", "fetched")},
                    error_message=str(exc),
                )
                item_result = BatchItemImportResult([], [], [], {})

            suggestions = infer_relationships(
                profiles=item_result.profiles,
                dataframes=item_result.dataframes,
            )
            saved_suggestions = import_repository.add_relationship_suggestions_for_profiles(
                project_id,
                suggestions,
            )
            graph_profiles = self._load_project_graph_profiles(project_id, session)
            graph = build_graph(
                project_id=project_id,
                profiles=graph_profiles,
                suggestions=suggestions,
            )
            saved_nodes, saved_edges = import_repository.add_graph(graph)
            import_repository.link_graph_edges_to_suggestions(saved_edges, saved_suggestions)
            resolved_edges = resolve_cross_source_entities(project_id, session)
            if item.status != "failed":
                batch_repository.update_item_stage(
                    item,
                    "graphed",
                    stage_summary=(
                        f"Wrote graph with {len(saved_nodes)} node(s) and "
                        f"{len(saved_edges) + len(resolved_edges)} edge(s)."
                    ),
                )
            items = batch_repository.list_items(project_id, batch.id)
            failed_item_ids = [
                saved_item.id for saved_item in items if saved_item.status == "failed"
            ]
            summary = {
                "dataset_count": len(item_result.dataset_ids),
                "document_count": len(item_result.document_ids),
                "sheet_count": len(item_result.profiles),
                "field_count": sum(len(profile.fields) for profile in item_result.profiles),
                "suggestion_count": len(saved_suggestions),
                "graph_node_count": len(saved_nodes),
                "graph_edge_count": len(saved_edges) + len(resolved_edges),
                "resolved_relationship_count": len(resolved_edges),
                "item_ids": [item.id],
                "succeeded_item_count": 0 if failed_item_ids else 1,
                "failed_item_count": len(failed_item_ids),
                "stage": "failed" if failed_item_ids else "graphed",
                "url": fetched.requested_url,
                "final_url": fetched.final_url,
            }
            summary["diagnostics"] = {
                **batch_import_diagnostics(items),
                **fetch_diagnostics(fetched),
            }
            if failed_item_ids:
                batch_repository.update_batch_progress(
                    batch,
                    "failed",
                    100,
                    summary,
                    error_message=item.error_message or "URL import failed.",
                )
            else:
                batch_repository.update_batch_progress(batch, "succeeded", 100, summary)
                batch_repository.update_item_stage(
                    item,
                    "indexed",
                    stage_summary="Evidence and graph artifacts are ready.",
                )
            session.commit()
            url_artifacts.retain()

            if failed_item_ids:
                raise ValueError(item.error_message or "URL import failed")

            return StructuredBatchImportResult(
                batch_id=batch.id,
                dataset_ids=item_result.dataset_ids,
                dataset_count=summary["dataset_count"],
                document_count=summary["document_count"],
                sheet_count=summary["sheet_count"],
                field_count=summary["field_count"],
                suggestion_count=summary["suggestion_count"],
                graph_node_count=summary["graph_node_count"],
                graph_edge_count=summary["graph_edge_count"],
            )

    def retry_import_item(self, project_id: int, item_id: int) -> StructuredBatchImportResult:
        self.paths.ensure()
        with _ImportArtifacts(self.paths) as retry_artifacts, self.session_factory() as session:
            batch_repository = ImportBatchRepository(session)
            import_repository = ImportRepository(session)
            document_repository = DocumentRepository(session)
            item = batch_repository.get_item(project_id, item_id)
            if item is None:
                raise ValueError(f"Import item {item_id} not found")
            if item.status != "failed":
                raise ValueError("Only failed import items can be retried")
            batch = batch_repository.get_batch(project_id, item.batch_id)
            if batch is None:
                raise ValueError(f"Import batch {item.batch_id} not found")
            if not item.raw_data_ref:
                raise ValueError("Import item archived raw file not found")
            source_path = self.paths.root / item.raw_data_ref
            if not source_path.exists():
                raise ValueError("Import item archived raw file not found")

            batch_repository.update_batch_progress(
                batch,
                "running",
                90,
                {
                    **(batch.summary or {}),
                    "stage": "retrying",
                    "retry_item_id": item.id,
                },
            )
            batch_repository.reset_item_for_retry(item)
            session.commit()

            try:
                with session.begin_nested():
                    self._process_import_item(
                        project_id=project_id,
                        source_path=source_path,
                        import_name=item.filename,
                        item=item,
                        batch_repository=batch_repository,
                        import_repository=import_repository,
                        document_repository=document_repository,
                        artifacts=retry_artifacts,
                    )
            except Exception as exc:
                retry_artifacts.compensate()
                batch_repository.update_item_stage(
                    item,
                    "failed",
                    status="failed",
                    stage_summary=str(exc),
                    summary={"failed_stage": (item.summary or {}).get("stage", "staged")},
                    error_message=str(exc),
                )

            result = self._finalize_batch_after_retry(
                project_id=project_id,
                batch=batch,
                batch_repository=batch_repository,
                import_repository=import_repository,
                session=session,
            )
            retry_artifacts.retain()
            return result

    def _process_import_item(
        self,
        project_id: int,
        source_path: Path,
        import_name: str,
        item,
        batch_repository: ImportBatchRepository,
        import_repository: ImportRepository,
        document_repository: DocumentRepository,
        artifacts: _ImportArtifacts | None = None,
    ) -> BatchItemImportResult:
        if self._is_structured_file(source_path):
            sheets = self._read_file(source_path, import_name)
            batch_repository.update_item_stage(
                item,
                "parsed",
                stage_summary=f"Parsed {len(sheets)} structured sheet(s).",
            )
            dataset_id, profiles, dataframes = self._create_dataset_from_sheets(
                session=batch_repository.session,
                repository=import_repository,
                project_id=project_id,
                source_path=source_path,
                import_name=import_name,
                sheets=sheets,
                artifacts=artifacts,
            )
            batch_repository.update_item_stage(
                item,
                "profiled",
                stage_summary=(
                    f"Profiled {len(profiles)} sheet(s) and "
                    f"{sum(len(profile.fields) for profile in profiles)} field(s)."
                ),
                summary={
                    "dataset_id": dataset_id,
                    "sheet_count": len(profiles),
                    "field_count": sum(len(profile.fields) for profile in profiles),
                },
            )
            return BatchItemImportResult(
                dataset_ids=[dataset_id],
                document_ids=[],
                profiles=profiles,
                dataframes=dataframes,
            )

        if is_repository_archive_path(source_path):
            repository_documents = parse_code_repository_archive_result(
                source_path,
                display_name=import_name,
            )
            persisted_documents = self._persist_repository_import(
                project_id=project_id,
                source_path=source_path,
                import_name=import_name,
                item=item,
                parsed_documents=repository_documents.documents,
                ignored_file_count=repository_documents.ignored_file_count,
                batch_repository=batch_repository,
                document_repository=document_repository,
                import_repository=import_repository,
                artifacts=artifacts,
            )
            return BatchItemImportResult(
                dataset_ids=[],
                document_ids=[
                    persisted_document.document_id for persisted_document in persisted_documents
                ],
                profiles=[],
                dataframes={},
            )

        parsed = parse_document_file(source_path, import_name)
        document_id = self._persist_document_import(
            project_id=project_id,
            source_path=source_path,
            import_name=import_name,
            item=item,
            parsed=parsed,
            batch_repository=batch_repository,
            document_repository=document_repository,
            import_repository=import_repository,
            artifacts=artifacts,
        )
        return BatchItemImportResult(
            dataset_ids=[],
            document_ids=[document_id],
            profiles=[],
            dataframes={},
        )

    def _process_url_import_item(
        self,
        project_id: int,
        source_path: Path,
        import_name: str,
        item,
        fetched: FetchedURLSource,
        batch_repository: ImportBatchRepository,
        import_repository: ImportRepository,
        document_repository: DocumentRepository,
        artifacts: _ImportArtifacts | None = None,
    ) -> BatchItemImportResult:
        item.raw_data_ref = source_path.relative_to(self.paths.root).as_posix()
        if self._is_structured_file(source_path):
            return self._process_import_item(
                project_id=project_id,
                source_path=source_path,
                import_name=import_name,
                item=item,
                batch_repository=batch_repository,
                import_repository=import_repository,
                document_repository=document_repository,
                artifacts=artifacts,
            )

        parsed = parse_document_file(source_path, import_name)
        parsed = ParsedDocument(
            title=parsed.title,
            document_type=f"url_{parsed.document_type}",
            source_ref=fetched.final_url,
            chunks=[
                type(chunk)(
                    heading=chunk.heading,
                    content=chunk.content,
                    source_ref=f"{fetched.final_url}#chunk:{index}",
                    metadata={
                        **chunk.metadata,
                        "url": fetched.requested_url,
                        "final_url": fetched.final_url,
                        "content_type": fetched.content_type,
                    },
                )
                for index, chunk in enumerate(parsed.chunks)
            ],
            entities=[
                type(entity)(
                    canonical_name=entity.canonical_name,
                    entity_type=entity.entity_type,
                    aliases=entity.aliases,
                    confidence=entity.confidence,
                    source_refs=[
                        f"{fetched.final_url}#chunk:{index}"
                        for index, _chunk in enumerate(parsed.chunks[:1])
                    ]
                    or [fetched.final_url],
                    metadata={**entity.metadata, "source_kind": "url"},
                )
                for entity in parsed.entities
            ],
            relationships=[
                type(relationship)(
                    source_name=relationship.source_name,
                    source_type=relationship.source_type,
                    target_name=relationship.target_name,
                    target_type=relationship.target_type,
                    relationship_type=relationship.relationship_type,
                    confidence=relationship.confidence,
                    status=relationship.status,
                    evidence_summary=relationship.evidence_summary,
                    evidence_payload={
                        **relationship.evidence_payload,
                        "source_refs": [f"{fetched.final_url}#chunk:0"],
                    },
                    source_refs=[f"{fetched.final_url}#chunk:0"],
                )
                for relationship in parsed.relationships
            ],
            metadata={
                **parsed.metadata,
                **fetch_diagnostics(fetched),
                "source_kind": "url",
            },
        )
        document_id = self._persist_document_import(
            project_id=project_id,
            source_path=source_path,
            import_name=import_name,
            item=item,
            parsed=parsed,
            batch_repository=batch_repository,
            document_repository=document_repository,
            import_repository=import_repository,
            artifacts=artifacts,
        )
        return BatchItemImportResult(
            dataset_ids=[],
            document_ids=[document_id],
            profiles=[],
            dataframes={},
        )

    def _finalize_batch_after_retry(
        self,
        project_id: int,
        batch,
        batch_repository: ImportBatchRepository,
        import_repository: ImportRepository,
        session: Session,
    ) -> StructuredBatchImportResult:
        items = batch_repository.list_items(project_id, batch.id)
        failed_item_ids = [item.id for item in items if item.status == "failed"]
        dataset_ids = self._dataset_ids_for_items(items)
        document_ids = self._document_ids_for_items(items)
        all_profiles, all_dataframes = self._load_batch_structured_profiles(
            project_id=project_id,
            dataset_ids=dataset_ids,
            session=session,
        )

        suggestions = infer_relationships(profiles=all_profiles, dataframes=all_dataframes)
        saved_suggestions = import_repository.add_relationship_suggestions_for_profiles(
            project_id,
            suggestions,
        )
        graph_profiles = self._load_project_graph_profiles(project_id, session)
        graph = build_graph(
            project_id=project_id,
            profiles=graph_profiles,
            suggestions=suggestions,
        )
        saved_nodes, saved_edges = import_repository.add_graph(graph)
        import_repository.link_graph_edges_to_suggestions(saved_edges, saved_suggestions)
        resolved_edges = resolve_cross_source_entities(project_id, session)
        failed_item_id_set = set(failed_item_ids)
        for item in items:
            if item.id in failed_item_id_set:
                continue
            if item.source_kind in {"table", "json"}:
                batch_repository.update_item_stage(
                    item,
                    "resolved",
                    stage_summary=f"Resolved {len(resolved_edges)} cross-source relationship(s).",
                )
            batch_repository.update_item_stage(
                item,
                "graphed",
                stage_summary=(
                    f"Wrote graph with {len(saved_nodes)} node(s) and "
                    f"{len(saved_edges) + len(resolved_edges)} edge(s)."
                ),
            )

        item_ids = [item.id for item in items]
        succeeded_item_count = len(items) - len(failed_item_ids)
        summary = {
            "dataset_count": len(dataset_ids),
            "document_count": len(document_ids),
            "sheet_count": len(all_profiles),
            "field_count": sum(len(profile.fields) for profile in all_profiles),
            "suggestion_count": len(saved_suggestions),
            "graph_node_count": len(saved_nodes),
            "graph_edge_count": len(saved_edges) + len(resolved_edges),
            "resolved_relationship_count": len(resolved_edges),
            "item_ids": item_ids,
            "succeeded_item_count": succeeded_item_count,
            "failed_item_count": len(failed_item_ids),
            "stage": "partial" if failed_item_ids else "graphed",
        }
        summary["diagnostics"] = batch_import_diagnostics(items)
        if succeeded_item_count == 0:
            batch_repository.update_batch_progress(
                batch,
                "failed",
                100,
                {**summary, "stage": "failed"},
                error_message="All import batch items failed.",
            )
        else:
            batch_repository.update_batch_progress(
                batch,
                "partial" if failed_item_ids else "succeeded",
                100,
                summary,
            )
            for item in items:
                if item.id in failed_item_id_set:
                    continue
                batch_repository.update_item_stage(
                    item,
                    "indexed",
                    stage_summary="Evidence and graph artifacts are ready.",
                )
        session.commit()

        return StructuredBatchImportResult(
            batch_id=batch.id,
            dataset_ids=dataset_ids,
            dataset_count=summary["dataset_count"],
            document_count=summary["document_count"],
            sheet_count=summary["sheet_count"],
            field_count=summary["field_count"],
            suggestion_count=summary["suggestion_count"],
            graph_node_count=summary["graph_node_count"],
            graph_edge_count=summary["graph_edge_count"],
        )

    def import_sample_dataset(self, project_id: int) -> ImportResult:
        self.paths.ensure()
        sample_name = "graphmind_sample_sales.xlsx"
        existing_import = self._existing_import_result(project_id, sample_name)
        if existing_import is not None:
            return existing_import

        with NamedTemporaryFile(delete=False, suffix=".xlsx") as temp_file:
            temp_path = Path(temp_file.name)

        try:
            with pd.ExcelWriter(temp_path, engine="openpyxl") as writer:
                pd.DataFrame(
                    {
                        "id": ["c1", "c2", "c3", "c4"],
                        "customer_name": ["Acme Co", "Beacon Ltd", "Cedar Studio", "Delta Mart"],
                        "region": ["East", "West", "North", "East"],
                        "segment": ["Enterprise", "SMB", "SMB", "Retail"],
                    }
                ).to_excel(writer, sheet_name="Customers", index=False)
                pd.DataFrame(
                    {
                        "product_code": ["p1", "p2", "p3"],
                        "product_name": ["Analytics Seat", "CRM Pack", "Support Bundle"],
                        "category": ["Software", "Software", "Service"],
                    }
                ).to_excel(writer, sheet_name="Products", index=False)
                pd.DataFrame(
                    {
                        "order_id": ["o1", "o2", "o3", "o4", "o5"],
                        "customer_id": ["c1", "c1", "c2", "c3", "c4"],
                        "product_code": ["p1", "p2", "p2", "p3", "p1"],
                        "order_date": [
                            "2026-01-05",
                            "2026-01-12",
                            "2026-02-03",
                            "2026-02-18",
                            "2026-03-02",
                        ],
                        "amount": [1200, 2400, 1800, 950, 3200],
                    }
                ).to_excel(writer, sheet_name="Orders", index=False)

            return self.import_file(
                project_id, temp_path, display_filename=sample_name, kind="sample"
            )
        finally:
            temp_path.unlink(missing_ok=True)

    def _existing_import_result(self, project_id: int, filename: str) -> ImportResult | None:
        with self.session_factory() as session:
            dataset = (
                session.query(Dataset)
                .filter(
                    Dataset.project_id == project_id,
                    Dataset.filename == filename,
                    Dataset.import_status == "imported",
                )
                .order_by(Dataset.id)
                .first()
            )
            if dataset is None:
                return None

            sheet_count = session.query(Sheet).filter(Sheet.dataset_id == dataset.id).count()
            field_count = (
                session.query(FieldProfile)
                .join(Sheet)
                .filter(Sheet.dataset_id == dataset.id)
                .count()
            )
            suggestion_count = (
                session.query(RelationshipSuggestion)
                .filter(RelationshipSuggestion.project_id == project_id)
                .count()
            )
            graph_node_count = (
                session.query(GraphNode).filter(GraphNode.project_id == project_id).count()
            )
            graph_edge_count = (
                session.query(GraphEdge).filter(GraphEdge.project_id == project_id).count()
            )
            import_job = (
                session.query(ImportJob)
                .filter(
                    ImportJob.project_id == project_id,
                    ImportJob.dataset_id == dataset.id,
                    ImportJob.status == "succeeded",
                )
                .order_by(ImportJob.id.desc())
                .first()
            )

            return ImportResult(
                import_job_id=import_job.id if import_job is not None else 0,
                dataset_id=dataset.id,
                sheet_count=sheet_count or 0,
                field_count=field_count or 0,
                suggestion_count=suggestion_count or 0,
                graph_node_count=graph_node_count or 0,
                graph_edge_count=graph_edge_count or 0,
            )

    def _read_file(self, path: Path, import_name: str | None = None) -> dict[str, pd.DataFrame]:
        extension = path.suffix.lower()
        if extension == ".csv":
            sheet_name = Path(import_name).stem if import_name else path.stem
            return {sheet_name: pd.read_csv(path)}
        if extension in {".xlsx", ".xls"}:
            return pd.read_excel(path, sheet_name=None)
        if extension == ".json":
            return read_table_json(path, import_name)
        raise ValueError(f"Unsupported import file type: {extension}")

    def _file_source_kind(self, path: Path) -> str:
        extension = path.suffix.lower()
        if extension in {".csv", ".xlsx", ".xls"}:
            return "table"
        if extension == ".json":
            try:
                read_table_json(path)
                return "json"
            except ValueError:
                return "json"
        if is_repository_archive_path(path):
            return "code"
        if is_document_like_path(path):
            return source_kind_for_path(path)
        raise ValueError(f"Unsupported import file type: {extension}")

    def _is_structured_file(self, path: Path) -> bool:
        extension = path.suffix.lower()
        if extension in {".csv", ".xlsx", ".xls"}:
            return True
        if extension == ".json":
            try:
                read_table_json(path)
            except ValueError:
                return False
            return True
        return False

    def _dataset_ids_for_items(self, items: list) -> list[int]:
        dataset_ids = []
        for item in items:
            if item.status == "failed":
                continue
            dataset_id = (item.summary or {}).get("dataset_id")
            if isinstance(dataset_id, int):
                dataset_ids.append(dataset_id)
        return dataset_ids

    def _document_ids_for_items(self, items: list) -> list[int]:
        document_ids: list[int] = []
        for item in items:
            if item.status == "failed":
                continue
            summary = item.summary or {}
            document_id = summary.get("document_id")
            if isinstance(document_id, int):
                document_ids.append(document_id)
            summary_document_ids = summary.get("document_ids")
            if isinstance(summary_document_ids, list):
                document_ids.extend(
                    value for value in summary_document_ids if isinstance(value, int)
                )
        return document_ids

    def _load_batch_structured_profiles(
        self,
        project_id: int,
        dataset_ids: list[int],
        session: Session,
    ) -> tuple[list[SheetProfileData], dict[str, pd.DataFrame]]:
        if not dataset_ids:
            return [], {}

        sheets = (
            session.query(Sheet)
            .join(Dataset)
            .filter(Dataset.project_id == project_id, Sheet.dataset_id.in_(dataset_ids))
            .order_by(Sheet.dataset_id, Sheet.id)
            .all()
        )
        profiles = [self._sheet_profile_from_model(sheet) for sheet in sheets]
        dataframes: dict[str, pd.DataFrame] = {}
        with duckdb.connect(str(self.paths.duckdb_path), read_only=True) as connection:
            for profile in profiles:
                try:
                    dataframes[profile.duckdb_table_name] = connection.execute(
                        f'SELECT * FROM "{profile.duckdb_table_name}"'
                    ).fetchdf()
                except duckdb.CatalogException:
                    dataframes[profile.duckdb_table_name] = pd.DataFrame()
        return profiles, dataframes

    def _load_project_graph_profiles(
        self,
        project_id: int,
        session: Session,
    ) -> list[SheetProfileData]:
        sheets = (
            session.query(Sheet)
            .join(Dataset)
            .filter(Dataset.project_id == project_id)
            .order_by(Sheet.dataset_id, Sheet.id)
            .all()
        )
        return [self._sheet_profile_from_model(sheet) for sheet in sheets]

    def _sheet_profile_from_model(self, sheet: Sheet) -> SheetProfileData:
        return SheetProfileData(
            name=sheet.name,
            normalized_name=sheet.normalized_name,
            row_count=sheet.row_count,
            column_count=sheet.column_count,
            duckdb_table_name=sheet.duckdb_table_name,
            metadata={
                "import_status": sheet.dataset.import_status,
                "dataset_filename": sheet.dataset.filename,
                "dataset_file_type": sheet.dataset.file_type,
            },
            fields=[
                FieldProfileData(
                    original_name=field.original_name,
                    normalized_name=field.normalized_name,
                    inferred_type=field.inferred_type,
                    null_count=field.null_count,
                    unique_count=field.unique_count,
                    sample_values=field.sample_values,
                    min_value=field.min_value,
                    max_value=field.max_value,
                    semantic_label=field.semantic_label,
                    key_candidate_score=field.key_candidate_score,
                )
                for field in sorted(sheet.fields, key=lambda field: field.id)
            ],
        )

    def _persist_document_import(
        self,
        project_id: int,
        source_path: Path,
        import_name: str,
        item,
        parsed: ParsedDocument,
        batch_repository: ImportBatchRepository,
        document_repository: DocumentRepository,
        import_repository: ImportRepository,
        artifacts: _ImportArtifacts | None = None,
    ) -> int:
        raw_data_ref = self._copy_to_document_imports(
            project_id,
            item.id,
            source_path,
            import_name,
            artifacts=artifacts,
        )
        item.raw_data_ref = raw_data_ref
        batch_repository.update_item_stage(
            item,
            "parsed",
            stage_summary=f"Parsed {len(parsed.chunks)} document chunk(s).",
            diagnostics={
                "document_count": 1,
                "chunk_count": len(parsed.chunks),
                "entity_count": len(parsed.entities),
                "relationship_count": len(parsed.relationships),
                "ignored_file_count": 0,
            },
        )
        persisted = persist_parsed_document(
            project_id=project_id,
            item=item,
            parsed=parsed,
            document_repository=document_repository,
            import_repository=import_repository,
        )
        diagnostics = {
            "document_count": 1,
            "chunk_count": persisted.chunk_count,
            "entity_count": persisted.entity_count,
            "relationship_count": persisted.relationship_count,
            "graph_node_count": persisted.graph_node_count,
            "graph_edge_count": persisted.graph_edge_count,
            "ignored_file_count": 0,
        }
        batch_repository.update_item_stage(
            item,
            "extracted",
            stage_summary=(
                f"Extracted {persisted.entity_count} entity/entities and "
                f"{persisted.relationship_count} relationship(s)."
            ),
            summary={
                "document_id": persisted.document_id,
                "document_count": 1,
                "chunk_count": persisted.chunk_count,
                "entity_count": persisted.entity_count,
                "relationship_count": persisted.relationship_count,
                "graph_node_count": persisted.graph_node_count,
                "graph_edge_count": persisted.graph_edge_count,
                "diagnostics": diagnostics,
            },
            diagnostics=diagnostics,
        )
        batch_repository.update_item_stage(
            item,
            "graphed",
            stage_summary=(
                f"Wrote {persisted.graph_node_count} graph node(s) and "
                f"{persisted.graph_edge_count} graph edge(s)."
            ),
            artifact_ref=f"document_sources:{persisted.document_id}",
        )
        return persisted.document_id

    def _persist_repository_import(
        self,
        project_id: int,
        source_path: Path,
        import_name: str,
        item,
        parsed_documents: list[ParsedDocument],
        ignored_file_count: int,
        batch_repository: ImportBatchRepository,
        document_repository: DocumentRepository,
        import_repository: ImportRepository,
        artifacts: _ImportArtifacts | None = None,
    ) -> list[PersistedDocumentImport]:
        raw_data_ref = self._copy_to_document_imports(
            project_id,
            item.id,
            source_path,
            import_name,
            artifacts=artifacts,
        )
        item.raw_data_ref = raw_data_ref
        batch_repository.update_item_stage(
            item,
            "parsed",
            stage_summary=f"Parsed {len(parsed_documents)} repository document(s).",
            diagnostics={
                "document_count": len(parsed_documents),
                "repository_file_count": len(parsed_documents),
                "ignored_file_count": ignored_file_count,
                "chunk_count": sum(len(document.chunks) for document in parsed_documents),
                "entity_count": sum(len(document.entities) for document in parsed_documents),
                "relationship_count": sum(
                    len(document.relationships) for document in parsed_documents
                ),
            },
        )
        persisted_documents = [
            persist_parsed_document(
                project_id=project_id,
                item=item,
                parsed=parsed,
                document_repository=document_repository,
                import_repository=import_repository,
            )
            for parsed in parsed_documents
        ]
        document_ids = [document.document_id for document in persisted_documents]
        summary = {
            "document_ids": document_ids,
            "document_count": len(document_ids),
            "repository_file_count": len(parsed_documents),
            "ignored_file_count": ignored_file_count,
            "chunk_count": sum(document.chunk_count for document in persisted_documents),
            "entity_count": sum(document.entity_count for document in persisted_documents),
            "relationship_count": sum(
                document.relationship_count for document in persisted_documents
            ),
            "graph_node_count": sum(
                document.graph_node_count for document in persisted_documents
            ),
            "graph_edge_count": sum(
                document.graph_edge_count for document in persisted_documents
            ),
        }
        diagnostics = {
            key: summary[key]
            for key in (
                "document_count",
                "repository_file_count",
                "ignored_file_count",
                "chunk_count",
                "entity_count",
                "relationship_count",
                "graph_node_count",
                "graph_edge_count",
            )
        }
        summary["diagnostics"] = diagnostics
        batch_repository.update_item_stage(
            item,
            "extracted",
            stage_summary=(
                f"Extracted {summary['entity_count']} entity/entities and "
                f"{summary['relationship_count']} relationship(s)."
            ),
            summary=summary,
            diagnostics=diagnostics,
        )
        batch_repository.update_item_stage(
            item,
            "graphed",
            stage_summary=(
                f"Wrote {summary['graph_node_count']} graph node(s) and "
                f"{summary['graph_edge_count']} graph edge(s)."
            ),
            artifact_ref=(
                "document_sources:" + ",".join(str(document_id) for document_id in document_ids)
                if document_ids
                else None
            ),
        )
        return persisted_documents

    def _create_dataset_from_sheets(
        self,
        session: Session,
        repository: ImportRepository,
        project_id: int,
        source_path: Path,
        import_name: str,
        sheets: dict[str, pd.DataFrame],
        *,
        artifacts: _ImportArtifacts | None = None,
        assert_claim_active: Callable[[], None] | None = None,
    ) -> tuple[int, list[SheetProfileData], dict[str, pd.DataFrame]]:
        if assert_claim_active is not None:
            assert_claim_active()
        dataset = repository.create_dataset(
            project_id=project_id,
            file_path=import_name,
        )
        raw_data_ref = self._copy_to_imports(
            project_id,
            dataset.id,
            source_path,
            import_name,
            artifacts=artifacts,
        )
        repository.set_dataset_raw_data_ref(dataset, raw_data_ref)
        if assert_claim_active is not None:
            assert_claim_active()
        dataframes: dict[str, pd.DataFrame] = {}
        profiles: list[SheetProfileData] = []

        with duckdb.connect(str(self.paths.duckdb_path)) as connection:
            for sheet_name, table_suffix in unique_normalized_sheet_names(sheets):
                dataframe = sheets[sheet_name]
                table_name = f"p{project_id}_d{dataset.id}_{normalize_sheet_name(table_suffix)}"
                normalized = normalize_dataframe_columns(dataframe)
                connection.register("import_dataframe", normalized)
                if artifacts is not None:
                    artifacts.track_duckdb_table(table_name)
                connection.execute(
                    f'CREATE OR REPLACE TABLE "{table_name}" AS SELECT * FROM import_dataframe'
                )
                connection.unregister("import_dataframe")

                dataframes[table_name] = normalized
                profiles.append(profile_dataframe(sheet_name, table_name, normalized))
                if assert_claim_active is not None:
                    assert_claim_active()

        for profile in profiles:
            repository.add_sheet_profile(dataset.id, profile)
            if assert_claim_active is not None:
                assert_claim_active()
        session.flush()
        return dataset.id, profiles, dataframes

    def _copy_to_imports(
        self,
        project_id: int,
        dataset_id: int,
        source_path: Path,
        import_name: str,
        *,
        artifacts: _ImportArtifacts | None = None,
    ) -> str:
        dataset_dir = self.paths.imports_dir / f"project_{project_id}" / f"dataset_{dataset_id}"
        destination = safe_import_destination(dataset_dir, import_name)
        if source_path.resolve() != destination.resolve():
            if artifacts is not None:
                artifacts.track_file(destination)
            shutil.copy2(source_path, destination)
        return destination.relative_to(self.paths.root).as_posix()

    def _copy_to_batch_item_imports(
        self,
        project_id: int,
        batch_id: int,
        item_id: int,
        source_path: Path,
        import_name: str,
        *,
        artifacts: _ImportArtifacts | None = None,
    ) -> str:
        item_dir = (
            self.paths.imports_dir
            / f"project_{project_id}"
            / f"batch_{batch_id}"
            / f"item_{item_id}"
        )
        destination = safe_import_destination(item_dir, import_name)
        if source_path.resolve() != destination.resolve():
            if artifacts is not None:
                artifacts.track_file(destination)
            shutil.copy2(source_path, destination)
        return destination.relative_to(self.paths.root).as_posix()

    def _copy_to_document_imports(
        self,
        project_id: int,
        item_id: int,
        source_path: Path,
        import_name: str,
        *,
        artifacts: _ImportArtifacts | None = None,
    ) -> str:
        document_dir = (
            self.paths.imports_dir
            / f"project_{project_id}"
            / "documents"
            / f"item_{item_id}"
        )
        destination = safe_import_destination(document_dir, import_name)
        if source_path.resolve() != destination.resolve():
            if artifacts is not None:
                artifacts.track_file(destination)
            shutil.copy2(source_path, destination)
        return destination.relative_to(self.paths.root).as_posix()
