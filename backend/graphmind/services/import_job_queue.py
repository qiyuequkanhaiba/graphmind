from __future__ import annotations

import logging
import os
import shutil
import socket
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock
from uuid import uuid4

from sqlalchemy.orm import Session

from graphmind.services.import_paths import staged_import_destinations
from graphmind.services.import_service import ImportService
from graphmind.storage.models import ImportJob
from graphmind.storage.repositories import ImportRepository
from graphmind.storage.workspace import WorkspacePaths

DEFAULT_STALE_AFTER = timedelta(minutes=30)
logger = logging.getLogger(__name__)


class ImportJobQueue:
    def __init__(
        self,
        paths: WorkspacePaths,
        session_factory: Callable[[], Session],
        *,
        max_workers: int = 1,
    ) -> None:
        self.paths = paths
        self.session_factory = session_factory
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="graphmind-import",
        )
        self._lock = Lock()
        self._inflight_job_ids: set[int] = set()
        self._worker_id = f"{socket.gethostname()}:{os.getpid()}:{uuid4().hex}"

    def submit(self, project_id: int, job_id: int) -> bool:
        with self._lock:
            if job_id in self._inflight_job_ids:
                return False
            self._inflight_job_ids.add(job_id)
        try:
            future = self._executor.submit(self._run_job_safely, project_id, job_id)
        except RuntimeError:
            with self._lock:
                self._inflight_job_ids.discard(job_id)
            raise
        future.add_done_callback(self._clear_inflight(job_id))
        return True

    def submit_pending(self, project_id: int | None = None, limit: int = 20) -> int:
        jobs = self._list_runnable_jobs(project_id=project_id, limit=limit)
        submitted = 0
        for job in jobs:
            if self.submit(job.project_id, job.id):
                submitted += 1
        return submitted

    def run_pending_once(self, project_id: int | None = None, limit: int = 20) -> int:
        jobs = self._list_runnable_jobs(project_id=project_id, limit=limit)
        for job in jobs:
            self._run_job_safely(job.project_id, job.id)
        return len(jobs)

    def recover_stale_jobs(
        self,
        *,
        stale_after: timedelta = DEFAULT_STALE_AFTER,
        now: datetime | None = None,
        project_id: int | None = None,
        limit: int = 20,
    ) -> int:
        current_time = now or datetime.now(UTC)
        cutoff = current_time - stale_after
        with self.session_factory() as session:
            repository = ImportRepository(session)
            staging_jobs = repository.list_stale_staging_import_jobs(
                cutoff=cutoff,
                project_id=project_id,
                limit=limit,
            )
            recovered = 0
            for job in staging_jobs:
                job_dir = (
                    self.paths.import_jobs_dir
                    / f"project_{job.project_id}"
                    / f"job_{job.id}"
                )
                staged_path, partial_path = staged_import_destinations(job_dir, job.label)
                if staged_path.is_file() and not staged_path.is_symlink():
                    transitioned = repository.queue_staged_import_job(
                        project_id=job.project_id,
                        job_id=job.id,
                        staged_path=staged_path.relative_to(self.paths.root).as_posix(),
                        uploaded_bytes=staged_path.stat().st_size,
                    )
                else:
                    transitioned = repository.fail_staging_import_job(
                        project_id=job.project_id,
                        job_id=job.id,
                        error_message="Upload staging was interrupted before the file was ready",
                    )
                    if transitioned:
                        _remove_staging_artifact(partial_path)
                        _remove_staging_artifact(staged_path)
                        try:
                            job_dir.rmdir()
                        except OSError:
                            pass
                if transitioned:
                    recovered += 1

            remaining_limit = max(limit - recovered, 0)
            jobs = repository.list_stale_import_jobs(
                cutoff=cutoff,
                now=current_time,
                project_id=project_id,
                limit=remaining_limit,
            )
            for job in jobs:
                if repository.recover_stale_import_job(
                    job,
                    cutoff=cutoff,
                    now=current_time,
                ):
                    recovered += 1
            session.commit()
            return recovered

    def recover_and_submit_pending(
        self,
        *,
        stale_after: timedelta = DEFAULT_STALE_AFTER,
        project_id: int | None = None,
        limit: int = 20,
    ) -> int:
        self.recover_stale_jobs(stale_after=stale_after, project_id=project_id, limit=limit)
        return self.submit_pending(project_id=project_id, limit=limit)

    def close(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=False)

    def _list_runnable_jobs(
        self,
        *,
        project_id: int | None = None,
        limit: int,
    ) -> list[ImportJob]:
        with self.session_factory() as session:
            return ImportRepository(session).list_runnable_import_jobs(
                project_id=project_id,
                limit=limit,
            )

    def _run_job_safely(self, project_id: int, job_id: int) -> None:
        service = ImportService(paths=self.paths, session_factory=self.session_factory)
        try:
            service.run_import_job(
                project_id=project_id,
                job_id=job_id,
                worker_id=self._worker_id,
            )
        except Exception:
            logger.exception("Import job execution failed", extra={"import_job_id": job_id})
            return

    def _clear_inflight(self, job_id: int):
        def clear(_future: Future[object]) -> None:
            with self._lock:
                self._inflight_job_ids.discard(job_id)

        return clear


def _remove_staging_artifact(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink(missing_ok=True)
