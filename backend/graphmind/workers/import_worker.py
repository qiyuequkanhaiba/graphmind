from __future__ import annotations

import argparse
import logging
import os
import time
from pathlib import Path

from graphmind.api.deployment import load_deployment_settings
from graphmind.services.import_job_queue import ImportJobQueue
from graphmind.storage.database import create_session_factory, initialize_workspace_databases
from graphmind.storage.workspace import WorkspacePaths

logger = logging.getLogger(__name__)


def run_import_worker(
    *,
    workspace_root: Path | None = None,
    once: bool = False,
    interval_seconds: float = 5.0,
    limit: int = 20,
) -> int:
    settings = load_deployment_settings(workspace_root)
    paths = WorkspacePaths(settings.workspace_root)
    paths.ensure()
    initialize_workspace_databases(paths)
    session_factory = create_session_factory(paths.database_path)
    queue = ImportJobQueue(paths=paths, session_factory=session_factory)
    try:
        total_attempted = 0
        while True:
            _write_worker_heartbeat(paths)
            queue.recover_stale_jobs(limit=limit)
            attempted = queue.run_pending_once(limit=limit)
            total_attempted += attempted
            _write_worker_heartbeat(paths)
            if once:
                return total_attempted
            if attempted == 0:
                time.sleep(interval_seconds)
    finally:
        queue.close()


def _write_worker_heartbeat(paths: WorkspacePaths) -> None:
    heartbeat_path = paths.import_worker_heartbeat_path
    temporary_path = heartbeat_path.with_name(f".{heartbeat_path.name}.{os.getpid()}.tmp")
    temporary_path.write_text(str(time.time()), encoding="utf-8")
    temporary_path.replace(heartbeat_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the GraphMind import worker.")
    parser.add_argument("--workspace-root", type=Path, default=None)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--interval-seconds", type=float, default=5.0)
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
    attempted = run_import_worker(
        workspace_root=args.workspace_root,
        once=args.once,
        interval_seconds=max(args.interval_seconds, 0.1),
        limit=max(args.limit, 1),
    )
    logger.info("Import worker attempted %s job(s).", attempted)


if __name__ == "__main__":
    main()
