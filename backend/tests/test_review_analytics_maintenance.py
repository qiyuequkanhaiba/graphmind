from datetime import UTC, datetime, timedelta

import pytest

from graphmind.services.review_analytics_maintenance import (
    cleanup_expired_review_analytics_snapshots,
)
from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import (
    Project,
    ReviewAnalyticsSnapshot,
    ReviewAnalyticsSnapshotCleanupAudit,
)
from graphmind.storage.workspace import WorkspacePaths
from graphmind.workers.review_analytics_maintenance import main


def _prepare_workspace(tmp_workspace):
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    return create_session_factory(paths.database_path)


def _seed_project(session, *, name: str, retention_days: int, ages: tuple[int, ...]) -> int:
    now = datetime.now(UTC)
    project = Project(
        name=name,
        settings={
            "review_analytics": {
                "retention_days": retention_days,
                "auto_cleanup_enabled": False,
            }
        },
    )
    session.add(project)
    session.flush()
    for age_days in ages:
        generated_at = now - timedelta(days=age_days)
        session.add(
            ReviewAnalyticsSnapshot(
                project_id=project.id,
                snapshot_date=generated_at.date().isoformat(),
                window_days=30,
                generated_at=generated_at,
                analytics_payload={},
            )
        )
    session.flush()
    return project.id


def _snapshot_count(session, project_id: int) -> int:
    return (
        session.query(ReviewAnalyticsSnapshot)
        .filter(ReviewAnalyticsSnapshot.project_id == project_id)
        .count()
    )


def _cleanup_audits(session) -> list[ReviewAnalyticsSnapshotCleanupAudit]:
    return (
        session.query(ReviewAnalyticsSnapshotCleanupAudit)
        .order_by(ReviewAnalyticsSnapshotCleanupAudit.project_id)
        .all()
    )


def test_cleanup_all_projects_uses_project_retention_defaults(tmp_workspace):
    session_factory = _prepare_workspace(tmp_workspace)
    with session_factory() as session:
        short_retention_project = _seed_project(
            session,
            name="Short Retention",
            retention_days=30,
            ages=(40, 20),
        )
        long_retention_project = _seed_project(
            session,
            name="Long Retention",
            retention_days=90,
            ages=(100, 20),
        )
        session.commit()

    summary = cleanup_expired_review_analytics_snapshots(session_factory)

    assert summary.project_count == 2
    assert summary.total_removed_count == 2
    assert summary.total_remaining_count == 2
    results_by_project = {result.project_id: result for result in summary.results}
    assert results_by_project[short_retention_project].retention_days == 30
    assert results_by_project[short_retention_project].removed_count == 1
    assert results_by_project[long_retention_project].retention_days == 90
    assert results_by_project[long_retention_project].removed_count == 1

    with session_factory() as session:
        assert _snapshot_count(session, short_retention_project) == 1
        assert _snapshot_count(session, long_retention_project) == 1
        audits = _cleanup_audits(session)
        audit_summaries = [
            (audit.project_id, audit.retention_days, audit.removed_count)
            for audit in audits
        ]
        assert audit_summaries == [
            (short_retention_project, 30, 1),
            (long_retention_project, 90, 1),
        ]


def test_cleanup_project_filter_uses_retention_override(tmp_workspace):
    session_factory = _prepare_workspace(tmp_workspace)
    with session_factory() as session:
        untouched_project = _seed_project(
            session,
            name="Untouched",
            retention_days=365,
            ages=(400, 20),
        )
        target_project = _seed_project(
            session,
            name="Target",
            retention_days=365,
            ages=(100, 40, 20),
        )
        session.commit()

    summary = cleanup_expired_review_analytics_snapshots(
        session_factory,
        project_id=target_project,
        retention_days=30,
    )

    assert summary.project_count == 1
    assert summary.total_removed_count == 2
    assert summary.results[0].project_id == target_project
    assert summary.results[0].retention_days == 30

    with session_factory() as session:
        assert _snapshot_count(session, untouched_project) == 2
        assert _snapshot_count(session, target_project) == 1
        audits = _cleanup_audits(session)
        assert len(audits) == 1
        assert audits[0].project_id == target_project
        assert audits[0].retention_days == 30
        assert audits[0].removed_count == 2


def test_cleanup_dry_run_reports_without_deleting_or_auditing(tmp_workspace):
    session_factory = _prepare_workspace(tmp_workspace)
    with session_factory() as session:
        project_id = _seed_project(
            session,
            name="Dry Run",
            retention_days=30,
            ages=(45, 20),
        )
        session.commit()

    summary = cleanup_expired_review_analytics_snapshots(session_factory, dry_run=True)

    assert summary.dry_run is True
    assert summary.total_removed_count == 1
    assert summary.total_remaining_count == 1
    assert summary.results[0].dry_run is True

    with session_factory() as session:
        assert _snapshot_count(session, project_id) == 2
        assert _cleanup_audits(session) == []


def test_cleanup_missing_project_raises_value_error(tmp_workspace):
    session_factory = _prepare_workspace(tmp_workspace)

    with pytest.raises(ValueError, match="Project not found"):
        cleanup_expired_review_analytics_snapshots(session_factory, project_id=404)


def test_review_analytics_maintenance_cli_dry_run_reports_summary(
    tmp_workspace,
    capsys,
):
    session_factory = _prepare_workspace(tmp_workspace)
    with session_factory() as session:
        project_id = _seed_project(
            session,
            name="CLI Dry Run",
            retention_days=365,
            ages=(45, 20),
        )
        session.commit()

    exit_code = main(
        [
            "--workspace-root",
            str(tmp_workspace),
            "--project-id",
            str(project_id),
            "--retention-days",
            "30",
            "--dry-run",
        ]
    )

    output = capsys.readouterr().out
    assert exit_code == 0
    assert "dry-run" in output
    assert "processed 1 project(s)" in output
    assert "removed 1 expired snapshot(s)" in output
    assert f"project={project_id}" in output

    with session_factory() as session:
        assert _snapshot_count(session, project_id) == 2
        assert _cleanup_audits(session) == []
