from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import and_, or_, update
from sqlalchemy.orm import Session

from graphmind.storage.models import ImportJob, utc_now


class ImportJobRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_import_job(self, project_id: int, label: str, kind: str) -> ImportJob:
        job = ImportJob(
            project_id=project_id,
            label=label,
            kind=kind,
            status="running",
            progress=10,
            summary=None,
            error_message=None,
            retryable=False,
        )
        self.session.add(job)
        self.session.flush()
        return job

    def create_staging_import_job(self, project_id: int, label: str, kind: str) -> ImportJob:
        job = ImportJob(
            project_id=project_id,
            label=label,
            kind=kind,
            status="staging",
            progress=0,
            summary=None,
            error_message=None,
            retryable=False,
        )
        self.session.add(job)
        self.session.flush()
        return job

    def queue_staged_import_job(
        self,
        *,
        project_id: int,
        job_id: int,
        staged_path: str,
        uploaded_bytes: int,
    ) -> bool:
        result = self.session.execute(
            update(ImportJob)
            .where(
                ImportJob.id == job_id,
                ImportJob.project_id == project_id,
                ImportJob.status == "staging",
            )
            .values(
                status="queued",
                progress=0,
                summary={"staged_path": staged_path, "uploaded_bytes": uploaded_bytes},
                error_message=None,
                retryable=False,
                updated_at=utc_now(),
            )
        )
        return result.rowcount == 1

    def fail_staging_import_job(
        self,
        *,
        project_id: int,
        job_id: int,
        error_message: str,
        staged_path: str | None = None,
        uploaded_bytes: int | None = None,
    ) -> bool:
        values = {
            "status": "failed",
            "progress": 100,
            "error_message": error_message,
            "retryable": staged_path is not None,
            "updated_at": utc_now(),
        }
        if staged_path is not None and uploaded_bytes is not None:
            values["summary"] = {
                "staged_path": staged_path,
                "uploaded_bytes": uploaded_bytes,
            }
        result = self.session.execute(
            update(ImportJob)
            .where(
                ImportJob.id == job_id,
                ImportJob.project_id == project_id,
                ImportJob.status == "staging",
            )
            .values(**values)
        )
        return result.rowcount == 1

    def complete_import_job(
        self,
        job: ImportJob,
        dataset_id: int,
        summary: dict[str, int],
        *,
        lease_token: str | None = None,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or utc_now()
        lease_conditions = (
            [ImportJob.lease_token.is_(None)]
            if lease_token is None
            else [
                ImportJob.lease_token == lease_token,
                ImportJob.lease_expires_at.is_not(None),
                ImportJob.lease_expires_at > current_time,
            ]
        )

        result = self.session.execute(
            update(ImportJob)
            .where(
                ImportJob.id == job.id,
                ImportJob.project_id == job.project_id,
                ImportJob.status == "running",
                *lease_conditions,
            )
            .values(
                status="succeeded",
                progress=100,
                summary=summary,
                error_message=None,
                retryable=False,
                dataset_id=dataset_id,
                worker_id=None,
                lease_token=None,
                claimed_at=None,
                heartbeat_at=None,
                lease_expires_at=None,
                updated_at=current_time,
            )
        )
        return result.rowcount == 1

    def fail_import_job(
        self,
        job: ImportJob,
        error_message: str,
        retryable: bool = True,
        *,
        lease_token: str | None = None,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or utc_now()
        lease_conditions = (
            [ImportJob.lease_token.is_(None)]
            if lease_token is None
            else [
                ImportJob.lease_token == lease_token,
                ImportJob.lease_expires_at.is_not(None),
                ImportJob.lease_expires_at > current_time,
            ]
        )

        result = self.session.execute(
            update(ImportJob)
            .where(
                ImportJob.id == job.id,
                ImportJob.project_id == job.project_id,
                ImportJob.status == "running",
                *lease_conditions,
            )
            .values(
                status="failed",
                progress=100,
                error_message=error_message,
                retryable=retryable,
                worker_id=None,
                lease_token=None,
                claimed_at=None,
                heartbeat_at=None,
                lease_expires_at=None,
                updated_at=current_time,
            )
        )
        return result.rowcount == 1

    def cancel_import_job(
        self,
        job: ImportJob,
        error_message: str = "Import job canceled",
    ) -> bool:
        result = self.session.execute(
            update(ImportJob)
            .where(
                ImportJob.id == job.id,
                ImportJob.project_id == job.project_id,
                ImportJob.status.in_({"queued", "running"}),
            )
            .values(
                status="canceled",
                progress=100,
                error_message=error_message,
                retryable=False,
                worker_id=None,
                lease_token=None,
                claimed_at=None,
                heartbeat_at=None,
                lease_expires_at=None,
                updated_at=utc_now(),
            )
        )
        self.session.expire(job)
        self.session.refresh(job)
        return result.rowcount == 1

    def reset_import_job_for_retry(self, job: ImportJob) -> None:
        job.status = "queued"
        job.progress = 0
        job.error_message = None
        job.retryable = False
        job.dataset_id = None
        self._clear_import_job_lease(job)
        self.session.flush()

    def update_import_job_progress(
        self, job: ImportJob, status: str, progress: int, summary: dict[str, int] | None = None
    ) -> None:
        job.status = status
        job.progress = max(0, min(100, progress))
        if summary is not None:
            job.summary = summary
        if status != "running":
            self._clear_import_job_lease(job)
        self.session.flush()

    def claim_import_job(
        self,
        *,
        project_id: int,
        job_id: int,
        worker_id: str,
        lease_token: str,
        now: datetime,
        lease_duration: timedelta,
    ) -> ImportJob | None:
        result = self.session.execute(
            update(ImportJob)
            .where(
                ImportJob.id == job_id,
                ImportJob.project_id == project_id,
                ImportJob.status == "queued",
            )
            .values(
                status="running",
                progress=25,
                error_message=None,
                retryable=False,
                worker_id=worker_id,
                lease_token=lease_token,
                claimed_at=now,
                heartbeat_at=now,
                lease_expires_at=now + lease_duration,
                updated_at=now,
            )
        )
        if result.rowcount != 1:
            return None
        return (
            self.session.query(ImportJob)
            .execution_options(populate_existing=True)
            .filter(ImportJob.id == job_id, ImportJob.project_id == project_id)
            .one()
        )

    def heartbeat_import_job(
        self,
        *,
        project_id: int,
        job_id: int,
        lease_token: str,
        now: datetime,
        lease_duration: timedelta,
    ) -> bool:
        result = self.session.execute(
            update(ImportJob)
            .where(
                ImportJob.id == job_id,
                ImportJob.project_id == project_id,
                ImportJob.status == "running",
                ImportJob.lease_token == lease_token,
                ImportJob.lease_expires_at.is_not(None),
                ImportJob.lease_expires_at > now,
            )
            .values(
                heartbeat_at=now,
                lease_expires_at=now + lease_duration,
                updated_at=now,
            )
        )
        return result.rowcount == 1

    def import_job_claim_is_active(
        self,
        *,
        project_id: int,
        job_id: int,
        lease_token: str,
        now: datetime | None = None,
    ) -> bool:
        current_time = now or utc_now()
        return (
            self.session.query(ImportJob.id)
            .filter(
                ImportJob.id == job_id,
                ImportJob.project_id == project_id,
                ImportJob.status == "running",
                ImportJob.lease_token == lease_token,
                ImportJob.lease_expires_at.is_not(None),
                ImportJob.lease_expires_at > current_time,
            )
            .first()
            is not None
        )

    def get_import_job(self, project_id: int, job_id: int) -> ImportJob | None:
        return (
            self.session.query(ImportJob)
            .filter(ImportJob.project_id == project_id, ImportJob.id == job_id)
            .first()
        )

    def list_import_jobs(self, project_id: int, limit: int = 20) -> list[ImportJob]:
        return (
            self.session.query(ImportJob)
            .filter(ImportJob.project_id == project_id)
            .order_by(ImportJob.updated_at.desc(), ImportJob.id.desc())
            .limit(limit)
            .all()
        )

    def list_runnable_import_jobs(
        self,
        *,
        project_id: int | None = None,
        limit: int = 20,
    ) -> list[ImportJob]:
        query = self.session.query(ImportJob).filter(ImportJob.status == "queued")
        if project_id is not None:
            query = query.filter(ImportJob.project_id == project_id)
        return query.order_by(ImportJob.updated_at.asc(), ImportJob.id.asc()).limit(limit).all()

    def list_stale_import_jobs(
        self,
        cutoff: datetime,
        *,
        now: datetime,
        project_id: int | None = None,
        limit: int = 20,
    ) -> list[ImportJob]:
        query = self.session.query(ImportJob).filter(
            ImportJob.status == "running",
            or_(
                ImportJob.lease_expires_at <= now,
                and_(
                    ImportJob.lease_expires_at.is_(None),
                    ImportJob.updated_at < cutoff,
                ),
            ),
        )
        if project_id is not None:
            query = query.filter(ImportJob.project_id == project_id)
        return query.order_by(ImportJob.updated_at.asc(), ImportJob.id.asc()).limit(limit).all()

    def list_stale_staging_import_jobs(
        self,
        cutoff: datetime,
        *,
        project_id: int | None = None,
        limit: int = 20,
    ) -> list[ImportJob]:
        query = self.session.query(ImportJob).filter(
            ImportJob.status == "staging",
            ImportJob.updated_at < cutoff,
        )
        if project_id is not None:
            query = query.filter(ImportJob.project_id == project_id)
        return query.order_by(ImportJob.updated_at.asc(), ImportJob.id.asc()).limit(limit).all()

    def recover_stale_import_job(
        self,
        job: ImportJob,
        *,
        cutoff: datetime,
        now: datetime,
    ) -> bool:
        result = self.session.execute(
            update(ImportJob)
            .where(
                ImportJob.id == job.id,
                ImportJob.project_id == job.project_id,
                ImportJob.status == "running",
                or_(
                    ImportJob.lease_expires_at <= now,
                    and_(
                        ImportJob.lease_expires_at.is_(None),
                        ImportJob.updated_at < cutoff,
                    ),
                ),
            )
            .values(
                status="queued",
                progress=0,
                error_message=None,
                retryable=False,
                dataset_id=None,
                worker_id=None,
                lease_token=None,
                claimed_at=None,
                heartbeat_at=None,
                lease_expires_at=None,
                updated_at=now,
            )
        )
        return result.rowcount == 1

    @staticmethod
    def _clear_import_job_lease(job: ImportJob) -> None:
        job.worker_id = None
        job.lease_token = None
        job.claimed_at = None
        job.heartbeat_at = None
        job.lease_expires_at = None
