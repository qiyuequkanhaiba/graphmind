from __future__ import annotations

import shutil
from collections.abc import Callable
from pathlib import Path

from sqlalchemy.orm import Session

from graphmind.services.import_paths import safe_import_basename, staged_import_destinations
from graphmind.storage.repositories import ImportRepository
from graphmind.storage.workspace import WorkspacePaths


def create_staged_import_job(
    *,
    paths: WorkspacePaths,
    session_factory: Callable[[], Session],
    project_id: int,
    file_path: str | Path,
    display_filename: str,
    kind: str,
) -> int:
    paths.ensure()
    source_path = Path(file_path)
    import_name = safe_import_basename(display_filename)
    with session_factory() as session:
        job = ImportRepository(session).create_staging_import_job(
            project_id=project_id,
            label=import_name,
            kind=kind,
        )
        job_id = job.id
        session.commit()

    job_dir = paths.import_jobs_dir / f"project_{project_id}" / f"job_{job_id}"
    job_path, partial_path = staged_import_destinations(job_dir, import_name)
    try:
        shutil.move(str(source_path), partial_path)
        partial_path.replace(job_path)
        uploaded_bytes = job_path.stat().st_size
    except Exception as exc:
        retryable = job_path.is_file() and not job_path.is_symlink()
        partial_path.unlink(missing_ok=True)
        with session_factory() as session:
            ImportRepository(session).fail_staging_import_job(
                project_id=project_id,
                job_id=job_id,
                error_message=str(exc),
                staged_path=job_path.relative_to(paths.root).as_posix() if retryable else None,
                uploaded_bytes=job_path.stat().st_size if retryable else None,
            )
            session.commit()
        raise

    try:
        with session_factory() as session:
            queued = ImportRepository(session).queue_staged_import_job(
                project_id=project_id,
                job_id=job_id,
                staged_path=job_path.relative_to(paths.root).as_posix(),
                uploaded_bytes=uploaded_bytes,
            )
            if not queued:
                raise RuntimeError("Import job staging state changed before it could be queued")
            session.commit()
    except Exception as exc:
        with session_factory() as session:
            ImportRepository(session).fail_staging_import_job(
                project_id=project_id,
                job_id=job_id,
                error_message=str(exc),
                staged_path=job_path.relative_to(paths.root).as_posix(),
                uploaded_bytes=uploaded_bytes,
            )
            session.commit()
        raise
    return job_id
