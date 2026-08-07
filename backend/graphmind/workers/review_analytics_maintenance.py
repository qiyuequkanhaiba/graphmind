from __future__ import annotations

import argparse
from pathlib import Path

from graphmind.api.deployment import load_deployment_settings
from graphmind.services.review_analytics_maintenance import (
    cleanup_expired_review_analytics_snapshots,
)
from graphmind.storage.database import create_session_factory, initialize_workspace_databases
from graphmind.storage.workspace import WorkspacePaths


def run_review_analytics_maintenance(
    *,
    workspace_root: Path | None = None,
    project_id: int | None = None,
    retention_days: int | None = None,
    dry_run: bool = False,
) -> str:
    settings = load_deployment_settings(workspace_root)
    paths = WorkspacePaths(settings.workspace_root)
    paths.ensure()
    initialize_workspace_databases(paths)
    session_factory = create_session_factory(paths.database_path)
    summary = cleanup_expired_review_analytics_snapshots(
        session_factory,
        project_id=project_id,
        retention_days=retention_days,
        dry_run=dry_run,
    )
    return _format_summary(summary)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Clean up expired GraphMind review analytics snapshots."
    )
    parser.add_argument("--workspace-root", type=Path, default=None)
    parser.add_argument("--project-id", type=int, default=None)
    parser.add_argument("--retention-days", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    output = run_review_analytics_maintenance(
        workspace_root=args.workspace_root,
        project_id=args.project_id,
        retention_days=args.retention_days,
        dry_run=args.dry_run,
    )
    print(output)
    return 0


def _format_summary(summary) -> str:
    mode = "dry-run" if summary.dry_run else "applied"
    lines = [
        (
            f"Review analytics snapshot maintenance {mode}: "
            f"processed {summary.project_count} project(s), "
            f"removed {summary.total_removed_count} expired snapshot(s), "
            f"{summary.total_remaining_count} snapshot(s) remaining."
        )
    ]
    for result in summary.results:
        lines.append(
            f"project={result.project_id} retention_days={result.retention_days} "
            f"cutoff_date={result.cutoff_date} removed={result.removed_count} "
            f"remaining={result.remaining_count}"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
