from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Barrier, Event

import duckdb
import pandas as pd
import pytest
from sqlalchemy import select

from graphmind.services import import_job_staging as import_job_staging_module
from graphmind.services import import_service as import_service_module
from graphmind.services.import_job_queue import ImportJobQueue
from graphmind.services.import_paths import staged_import_destinations
from graphmind.services.import_service import ImportJobCanceledError, ImportService
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import Dataset, GraphNode, ImportJob, Sheet
from graphmind.storage.repositories import ImportRepository, ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def _create_project_and_service(
    tmp_workspace: Path,
) -> tuple[WorkspacePaths, object, int, ImportService]:
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)

    with session_factory() as session:
        project = ProjectRepository(session).create_project(name="Import Queue")
        session.commit()
        project_id = project.id

    service = ImportService(paths=paths, session_factory=session_factory)
    return paths, session_factory, project_id, service


def test_import_job_queue_runs_persisted_queued_job(tmp_workspace: Path, sample_csv: Path):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")

    attempted = ImportJobQueue(paths=paths, session_factory=session_factory).run_pending_once()

    assert attempted == 1
    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "succeeded"
        assert job.progress == 100
        assert job.dataset_id is not None
        assert job.summary is not None
        assert job.summary["sheet_count"] == 1
        assert session.scalars(select(GraphNode).where(GraphNode.project_id == project_id)).all()


def test_import_job_queue_does_not_rerun_completed_job(
    tmp_workspace: Path, sample_csv: Path
):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")
    queue = ImportJobQueue(paths=paths, session_factory=session_factory)
    assert queue.run_pending_once() == 1
    with session_factory() as session:
        graph_node_count = (
            session.query(GraphNode).filter(GraphNode.project_id == project_id).count()
        )

    attempted = queue.run_pending_once()

    assert attempted == 0
    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "succeeded"
        assert (
            session.query(GraphNode).filter(GraphNode.project_id == project_id).count()
            == graph_node_count
        )


def test_import_job_queue_recovers_stale_running_job(
    tmp_workspace: Path, sample_csv: Path
):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")
    stale_updated_at = datetime.now(UTC) - timedelta(hours=2)

    with session_factory() as session:
        repository = ImportRepository(session)
        job = repository.get_import_job(project_id=project_id, job_id=job_id)
        assert job is not None
        repository.update_import_job_progress(job, "running", 25)
        job.updated_at = stale_updated_at
        session.commit()

    queue = ImportJobQueue(paths=paths, session_factory=session_factory)
    recovered = queue.recover_stale_jobs(stale_after=timedelta(minutes=30))
    attempted = queue.run_pending_once()

    assert recovered == 1
    assert attempted == 1
    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "succeeded"
        assert job.progress == 100
        assert job.dataset_id is not None


def test_import_job_queue_fails_job_when_staged_file_is_missing(
    tmp_workspace: Path, sample_csv: Path
):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")

    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        staged_path = paths.root / str((job.summary or {})["staged_path"])
    staged_path.unlink()

    attempted = ImportJobQueue(paths=paths, session_factory=session_factory).run_pending_once()

    assert attempted == 1
    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "failed"
        assert job.progress == 100
        assert job.retryable is False
        assert job.dataset_id is None
        assert "staged file not found" in (job.error_message or "")


def test_import_job_claim_is_atomic_across_worker_sessions(
    tmp_workspace: Path, sample_csv: Path
):
    _paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")
    barrier = Barrier(2)
    claimed_at = datetime.now(UTC)

    def claim(worker_id: str) -> bool:
        with session_factory() as session:
            barrier.wait()
            claimed = ImportRepository(session).claim_import_job(
                project_id=project_id,
                job_id=job_id,
                worker_id=worker_id,
                lease_token=f"lease-{worker_id}",
                now=claimed_at,
                lease_duration=timedelta(minutes=5),
            )
            session.commit()
            return claimed is not None

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(claim, ["worker-a", "worker-b"]))

    assert sorted(results) == [False, True]
    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "running"
        assert job.worker_id in {"worker-a", "worker-b"}
        assert job.lease_token == f"lease-{job.worker_id}"
        assert job.claimed_at == claimed_at
        assert job.heartbeat_at == claimed_at
        assert job.lease_expires_at == claimed_at + timedelta(minutes=5)


def test_import_job_heartbeat_requires_current_lease_and_extends_it(
    tmp_workspace: Path, sample_csv: Path
):
    _paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")
    claimed_at = datetime.now(UTC)

    with session_factory() as session:
        repository = ImportRepository(session)
        claimed = repository.claim_import_job(
            project_id=project_id,
            job_id=job_id,
            worker_id="worker-a",
            lease_token="lease-a",
            now=claimed_at,
            lease_duration=timedelta(minutes=5),
        )
        assert claimed is not None
        session.commit()

    heartbeat_at = claimed_at + timedelta(minutes=1)
    with session_factory() as session:
        repository = ImportRepository(session)
        assert not repository.heartbeat_import_job(
            project_id=project_id,
            job_id=job_id,
            lease_token="wrong-lease",
            now=heartbeat_at,
            lease_duration=timedelta(minutes=5),
        )
        assert repository.heartbeat_import_job(
            project_id=project_id,
            job_id=job_id,
            lease_token="lease-a",
            now=heartbeat_at,
            lease_duration=timedelta(minutes=5),
        )
        session.commit()

    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.heartbeat_at == heartbeat_at
        assert job.lease_expires_at == heartbeat_at + timedelta(minutes=5)


def test_expired_import_job_lease_cannot_heartbeat_or_commit(
    tmp_workspace: Path,
    sample_csv: Path,
):
    _paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")
    claimed_at = datetime.now(UTC)
    expired_at = claimed_at + timedelta(minutes=6)

    with session_factory() as session:
        repository = ImportRepository(session)
        claimed = repository.claim_import_job(
            project_id=project_id,
            job_id=job_id,
            worker_id="worker-a",
            lease_token="lease-a",
            now=claimed_at,
            lease_duration=timedelta(minutes=5),
        )
        assert claimed is not None
        session.commit()

    with session_factory() as session:
        repository = ImportRepository(session)
        job = repository.get_import_job(project_id=project_id, job_id=job_id)
        assert job is not None
        assert not repository.import_job_claim_is_active(
            project_id=project_id,
            job_id=job_id,
            lease_token="lease-a",
            now=expired_at,
        )
        assert not repository.heartbeat_import_job(
            project_id=project_id,
            job_id=job_id,
            lease_token="lease-a",
            now=expired_at,
            lease_duration=timedelta(minutes=5),
        )
        assert not repository.complete_import_job(
            job,
            dataset_id=999,
            summary={},
            lease_token="lease-a",
            now=expired_at,
        )
        assert not repository.fail_import_job(
            job,
            "expired worker",
            lease_token="lease-a",
            now=expired_at,
        )
        session.commit()

    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "running"
        assert job.dataset_id is None


def test_canceled_unleased_import_job_cannot_commit_terminal_state(
    tmp_workspace: Path,
    sample_csv: Path,
):
    _paths, session_factory, project_id, _service = _create_project_and_service(tmp_workspace)
    with session_factory() as session:
        repository = ImportRepository(session)
        job = repository.create_import_job(project_id, sample_csv.name, "file")
        job_id = job.id
        assert repository.cancel_import_job(job)
        session.commit()

    with session_factory() as session:
        repository = ImportRepository(session)
        job = repository.get_import_job(project_id=project_id, job_id=job_id)
        assert job is not None
        assert not repository.complete_import_job(job, 999, {})
        assert not repository.fail_import_job(job, "late failure")
        session.commit()

    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "canceled"
        assert job.dataset_id is None


def test_stale_recovery_waits_for_lease_expiry(tmp_workspace: Path, sample_csv: Path):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")
    claimed_at = datetime.now(UTC)
    with session_factory() as session:
        claimed = ImportRepository(session).claim_import_job(
            project_id=project_id,
            job_id=job_id,
            worker_id="worker-a",
            lease_token="lease-a",
            now=claimed_at,
            lease_duration=timedelta(minutes=5),
        )
        assert claimed is not None
        claimed.updated_at = claimed_at - timedelta(hours=2)
        session.commit()

    queue = ImportJobQueue(paths=paths, session_factory=session_factory)

    assert queue.recover_stale_jobs(
        stale_after=timedelta(minutes=30),
        now=claimed_at + timedelta(minutes=4),
    ) == 0
    assert queue.recover_stale_jobs(
        stale_after=timedelta(minutes=30),
        now=claimed_at + timedelta(minutes=6),
    ) == 1

    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "queued"
        assert job.worker_id is None
        assert job.lease_token is None
        assert job.lease_expires_at is None


def test_canceled_claim_cannot_transition_to_succeeded(tmp_workspace: Path, sample_csv: Path):
    _paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")
    with session_factory() as session:
        repository = ImportRepository(session)
        claimed = repository.claim_import_job(
            project_id=project_id,
            job_id=job_id,
            worker_id="worker-a",
            lease_token="lease-a",
            now=datetime.now(UTC),
            lease_duration=timedelta(minutes=5),
        )
        assert claimed is not None
        session.commit()

    with session_factory() as session:
        repository = ImportRepository(session)
        job = repository.get_import_job(project_id=project_id, job_id=job_id)
        assert job is not None
        assert repository.cancel_import_job(job)
        session.commit()

    with session_factory() as session:
        repository = ImportRepository(session)
        job = repository.get_import_job(project_id=project_id, job_id=job_id)
        assert job is not None
        assert not repository.complete_import_job(
            job,
            dataset_id=999,
            summary={},
            lease_token="lease-a",
        )
        session.commit()

    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "canceled"
        assert job.dataset_id is None


def test_running_import_checks_cancellation_before_persisting_artifacts(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")
    original_read_file = ImportService._read_file

    def cancel_after_parse(self, source_path, import_name=None):
        sheets = original_read_file(self, source_path, import_name)
        with session_factory() as session:
            repository = ImportRepository(session)
            job = repository.get_import_job(project_id=project_id, job_id=job_id)
            assert job is not None
            assert repository.cancel_import_job(job)
            session.commit()
        return sheets

    monkeypatch.setattr(ImportService, "_read_file", cancel_after_parse)

    with pytest.raises(ImportJobCanceledError):
        service.run_import_job(project_id, job_id, worker_id="worker-a")

    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "canceled"
        assert session.query(GraphNode).filter(GraphNode.project_id == project_id).count() == 0


def test_running_import_can_be_canceled_after_external_artifacts_are_prepared(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")
    artifacts_ready = Event()
    release_import = Event()

    original_prepare_dataset = import_service_module.prepare_dataset

    def pause_after_prepare(*args, **kwargs):
        prepared = original_prepare_dataset(*args, **kwargs)
        artifacts_ready.set()
        assert release_import.wait(timeout=5)
        return prepared

    monkeypatch.setattr(import_service_module, "prepare_dataset", pause_after_prepare)

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(service.run_import_job, project_id, job_id)
        assert artifacts_ready.wait(timeout=5)
        with session_factory() as session:
            repository = ImportRepository(session)
            job = repository.get_import_job(project_id=project_id, job_id=job_id)
            assert job is not None
            assert repository.cancel_import_job(job)
            session.commit()
        release_import.set()
        with pytest.raises(ImportJobCanceledError):
            future.result(timeout=10)

    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "canceled"
        assert session.query(GraphNode).filter(GraphNode.project_id == project_id).count() == 0
    assert not [path for path in paths.imports_dir.rglob("*") if path.is_file()]


def test_queued_workbook_assigns_unique_tables_to_colliding_sheet_names(
    tmp_workspace: Path,
    tmp_path: Path,
):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    workbook = tmp_path / "colliding-sheets.xlsx"
    with pd.ExcelWriter(workbook) as writer:
        pd.DataFrame({"value": [1]}).to_excel(writer, sheet_name="Sales Data", index=False)
        pd.DataFrame({"value": [2]}).to_excel(writer, sheet_name="sales-data", index=False)

    service.create_import_job(project_id, workbook, workbook.name)
    assert ImportJobQueue(paths, session_factory).run_pending_once() == 1

    with session_factory() as session:
        sheets = session.scalars(select(Sheet).order_by(Sheet.id)).all()
        assert [sheet.name for sheet in sheets] == ["Sales Data", "sales-data"]
        table_names = [sheet.duckdb_table_name for sheet in sheets]
    assert table_names[0].endswith("_sales_data")
    assert table_names[1].endswith("_sales_data_2")
    with duckdb.connect(str(paths.duckdb_path)) as connection:
        assert connection.execute(f'SELECT value FROM "{table_names[0]}"').fetchall() == [(1,)]
        assert connection.execute(f'SELECT value FROM "{table_names[1]}"').fetchall() == [(2,)]


def test_stale_worker_compensates_only_its_attempt_artifacts(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    job_id = service.create_import_job(project_id, sample_csv, "customers_orders.csv")
    artifacts_ready = Event()
    release_first_worker = Event()
    original_prepare_dataset = import_service_module.prepare_dataset
    call_count = 0

    def pause_first_attempt(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        prepared = original_prepare_dataset(*args, **kwargs)
        if call_count == 1:
            artifacts_ready.set()
            assert release_first_worker.wait(timeout=5)
        return prepared

    monkeypatch.setattr(import_service_module, "prepare_dataset", pause_first_attempt)

    with ThreadPoolExecutor(max_workers=1) as executor:
        first_attempt = executor.submit(
            service.run_import_job,
            project_id,
            job_id,
            worker_id="worker-a",
        )
        assert artifacts_ready.wait(timeout=5)
        with session_factory() as session:
            job = session.get(ImportJob, job_id)
            assert job is not None
            job.lease_expires_at = datetime.now(UTC) - timedelta(seconds=1)
            session.commit()

        queue = ImportJobQueue(paths, session_factory)
        assert queue.recover_stale_jobs(now=datetime.now(UTC), stale_after=timedelta()) == 1
        second_result = service.run_import_job(project_id, job_id, worker_id="worker-b")

        with session_factory() as session:
            dataset = session.get(Dataset, second_result.dataset_id)
            assert dataset is not None
            persisted_file = paths.root / dataset.raw_data_ref
            table_names = [
                sheet.duckdb_table_name
                for sheet in session.scalars(select(Sheet).where(Sheet.dataset_id == dataset.id))
            ]
        assert persisted_file.exists()
        release_first_worker.set()
        with pytest.raises(ImportJobCanceledError):
            first_attempt.result(timeout=10)

    assert persisted_file.exists()
    with duckdb.connect(str(paths.duckdb_path)) as connection:
        for table_name in table_names:
            assert connection.execute(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ?",
                [table_name],
            ).fetchone() == (1,)


def test_staging_move_does_not_hold_a_sqlite_write_transaction(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)
    move_started = Event()
    release_move = Event()
    write_finished = Event()
    original_move = import_job_staging_module.shutil.move

    def block_move(source, destination):
        move_started.set()
        assert release_move.wait(timeout=5)
        return original_move(source, destination)

    def concurrent_write():
        with session_factory() as session:
            ProjectRepository(session).create_project(name="Concurrent Write")
            session.commit()
        write_finished.set()

    monkeypatch.setattr(import_job_staging_module.shutil, "move", block_move)
    with ThreadPoolExecutor(max_workers=2) as executor:
        staging = executor.submit(
            service.create_import_job,
            project_id,
            sample_csv,
            sample_csv.name,
        )
        assert move_started.wait(timeout=5)
        with session_factory() as session:
            staging_job = session.query(ImportJob).filter_by(project_id=project_id).one()
            assert staging_job.status == "staging"
        assert ImportJobQueue(paths, session_factory).run_pending_once() == 0
        executor.submit(concurrent_write)
        assert write_finished.wait(timeout=2)
        release_move.set()
        job_id = staging.result(timeout=10)

    with session_factory() as session:
        job = session.get(ImportJob, job_id)
        assert job is not None
        assert job.status == "queued"
        assert isinstance((job.summary or {}).get("staged_path"), str)


def test_staging_move_failure_creates_a_non_runnable_failed_job(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)

    def fail_move(_source, destination):
        Path(destination).write_text("partial", encoding="utf-8")
        raise OSError("injected staging failure")

    monkeypatch.setattr(import_job_staging_module.shutil, "move", fail_move)
    with pytest.raises(OSError, match="injected staging failure"):
        service.create_import_job(project_id, sample_csv, sample_csv.name)

    with session_factory() as session:
        job = session.query(ImportJob).filter_by(project_id=project_id).one()
        assert job.status == "failed"
        assert not job.retryable
        assert job.summary is None
    assert ImportJobQueue(paths, session_factory).run_pending_once() == 0
    assert not [path for path in paths.import_jobs_dir.rglob("*") if path.is_file()]


def test_stale_staging_job_with_completed_file_is_requeued(
    tmp_workspace: Path,
    sample_csv: Path,
):
    paths, session_factory, project_id, _service = _create_project_and_service(tmp_workspace)
    stale_updated_at = datetime.now(UTC) - timedelta(hours=2)
    with session_factory() as session:
        job = ImportRepository(session).create_staging_import_job(
            project_id=project_id,
            label=sample_csv.name,
            kind="file",
        )
        job_id = job.id
        job.updated_at = stale_updated_at
        session.commit()

    job_dir = paths.import_jobs_dir / f"project_{project_id}" / f"job_{job_id}"
    staged_path, _partial_path = staged_import_destinations(job_dir, sample_csv.name)
    staged_path.write_bytes(sample_csv.read_bytes())

    queue = ImportJobQueue(paths, session_factory)
    assert queue.recover_stale_jobs(stale_after=timedelta(minutes=30)) == 1
    with session_factory() as session:
        recovered = session.get(ImportJob, job_id)
        assert recovered is not None
        assert recovered.status == "queued"
        assert recovered.summary == {
            "staged_path": staged_path.relative_to(paths.root).as_posix(),
            "uploaded_bytes": staged_path.stat().st_size,
        }


def test_stale_staging_job_with_partial_file_is_failed_and_cleaned(
    tmp_workspace: Path,
    sample_csv: Path,
):
    paths, session_factory, project_id, _service = _create_project_and_service(tmp_workspace)
    stale_updated_at = datetime.now(UTC) - timedelta(hours=2)
    with session_factory() as session:
        job = ImportRepository(session).create_staging_import_job(
            project_id=project_id,
            label=sample_csv.name,
            kind="file",
        )
        job_id = job.id
        job.updated_at = stale_updated_at
        session.commit()

    job_dir = paths.import_jobs_dir / f"project_{project_id}" / f"job_{job_id}"
    _staged_path, partial_path = staged_import_destinations(job_dir, sample_csv.name)
    partial_path.write_bytes(b"partial")

    queue = ImportJobQueue(paths, session_factory)
    assert queue.recover_stale_jobs(stale_after=timedelta(minutes=30)) == 1
    with session_factory() as session:
        recovered = session.get(ImportJob, job_id)
        assert recovered is not None
        assert recovered.status == "failed"
        assert not recovered.retryable
    assert not partial_path.exists()


def test_post_move_staging_failure_keeps_a_retryable_staged_job(
    tmp_workspace: Path,
    sample_csv: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    paths, session_factory, project_id, service = _create_project_and_service(tmp_workspace)

    def fail_queue(*_args, **_kwargs):
        raise RuntimeError("injected queue transition failure")

    monkeypatch.setattr(ImportRepository, "queue_staged_import_job", fail_queue)
    with pytest.raises(RuntimeError, match="injected queue transition failure"):
        service.create_import_job(project_id, sample_csv, sample_csv.name)

    with session_factory() as session:
        job = session.query(ImportJob).filter_by(project_id=project_id).one()
        assert job.status == "failed"
        assert job.retryable
        staged_path = paths.root / str((job.summary or {})["staged_path"])
    assert staged_path.exists()

    service.retry_import_job(project_id, job.id)
    with session_factory() as session:
        retried = session.get(ImportJob, job.id)
        assert retried is not None
        assert retried.status == "queued"
