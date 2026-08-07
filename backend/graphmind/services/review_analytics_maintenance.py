from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from graphmind.storage.models import (
    Project,
    ReviewAnalyticsSnapshot,
    ReviewAnalyticsSnapshotCleanupAudit,
)

DEFAULT_REVIEW_ANALYTICS_RETENTION_DAYS = 30
SUPPORTED_REVIEW_ANALYTICS_RETENTION_DAYS = {30, 90, 180, 365}


@dataclass(frozen=True)
class ReviewAnalyticsSnapshotCleanupResult:
    project_id: int
    retention_days: int
    cutoff_date: str
    removed_count: int
    remaining_count: int
    dry_run: bool = False


@dataclass(frozen=True)
class ReviewAnalyticsSnapshotSummary:
    retention_days: int
    snapshot_count: int
    expired_snapshot_count: int
    oldest_snapshot_date: str | None
    latest_snapshot_date: str | None


@dataclass(frozen=True)
class ReviewAnalyticsMaintenanceSummary:
    dry_run: bool
    project_count: int
    total_removed_count: int
    total_remaining_count: int
    results: list[ReviewAnalyticsSnapshotCleanupResult]


def normalize_review_analytics_retention_days(value: object) -> int:
    try:
        days = int(value)
    except (TypeError, ValueError):
        return DEFAULT_REVIEW_ANALYTICS_RETENTION_DAYS
    return (
        days
        if days in SUPPORTED_REVIEW_ANALYTICS_RETENTION_DAYS
        else DEFAULT_REVIEW_ANALYTICS_RETENTION_DAYS
    )


def project_review_analytics_settings(project: Project) -> dict[str, object]:
    settings = project.settings or {}
    review_analytics = settings.get("review_analytics") if isinstance(settings, dict) else {}
    review_analytics = review_analytics if isinstance(review_analytics, dict) else {}
    return {
        "retention_days": normalize_review_analytics_retention_days(
            review_analytics.get("retention_days")
        ),
        "auto_cleanup_enabled": bool(review_analytics.get("auto_cleanup_enabled")),
    }


def review_analytics_effective_retention_days(
    project: Project,
    requested_retention_days: int | None,
) -> int:
    if requested_retention_days is not None:
        return normalize_review_analytics_retention_days(requested_retention_days)
    settings = project_review_analytics_settings(project)
    return normalize_review_analytics_retention_days(settings["retention_days"])


def review_analytics_auto_cleanup_enabled(project: Project) -> bool:
    settings = project_review_analytics_settings(project)
    return bool(settings["auto_cleanup_enabled"])


def cleanup_review_analytics_snapshots(
    project_id: int,
    session: Session,
    *,
    retention_days: int,
    dry_run: bool = False,
) -> ReviewAnalyticsSnapshotCleanupResult:
    effective_retention_days = normalize_review_analytics_retention_days(retention_days)
    cutoff_date = _cutoff_date(effective_retention_days)
    expired_snapshots = (
        session.query(ReviewAnalyticsSnapshot)
        .filter(
            ReviewAnalyticsSnapshot.project_id == project_id,
            ReviewAnalyticsSnapshot.snapshot_date < cutoff_date,
        )
        .all()
    )
    removed_count = len(expired_snapshots)
    snapshot_count = (
        session.query(ReviewAnalyticsSnapshot)
        .filter(ReviewAnalyticsSnapshot.project_id == project_id)
        .count()
    )
    remaining_count = snapshot_count - removed_count
    if not dry_run:
        for snapshot in expired_snapshots:
            session.delete(snapshot)
        session.add(
            ReviewAnalyticsSnapshotCleanupAudit(
                project_id=project_id,
                retention_days=effective_retention_days,
                cutoff_date=cutoff_date,
                removed_count=removed_count,
                remaining_count=remaining_count,
            )
        )
    return ReviewAnalyticsSnapshotCleanupResult(
        project_id=project_id,
        retention_days=effective_retention_days,
        cutoff_date=cutoff_date,
        removed_count=removed_count,
        remaining_count=remaining_count,
        dry_run=dry_run,
    )


def summarize_review_analytics_snapshots(
    project_id: int,
    session: Session,
    *,
    retention_days: int,
) -> ReviewAnalyticsSnapshotSummary:
    effective_retention_days = normalize_review_analytics_retention_days(retention_days)
    cutoff_date = _cutoff_date(effective_retention_days)
    snapshots = (
        session.query(ReviewAnalyticsSnapshot)
        .filter(ReviewAnalyticsSnapshot.project_id == project_id)
        .order_by(ReviewAnalyticsSnapshot.snapshot_date, ReviewAnalyticsSnapshot.id)
        .all()
    )
    snapshot_dates = [snapshot.snapshot_date for snapshot in snapshots]
    expired_snapshot_count = sum(
        1 for snapshot_date in snapshot_dates if snapshot_date < cutoff_date
    )
    return ReviewAnalyticsSnapshotSummary(
        retention_days=effective_retention_days,
        snapshot_count=len(snapshots),
        expired_snapshot_count=expired_snapshot_count,
        oldest_snapshot_date=snapshot_dates[0] if snapshot_dates else None,
        latest_snapshot_date=snapshot_dates[-1] if snapshot_dates else None,
    )


def cleanup_expired_review_analytics_snapshots(
    session_factory: Callable[[], Session],
    *,
    project_id: int | None = None,
    retention_days: int | None = None,
    dry_run: bool = False,
) -> ReviewAnalyticsMaintenanceSummary:
    with session_factory() as session:
        try:
            projects = _maintenance_projects(session, project_id)
            results = [
                cleanup_review_analytics_snapshots(
                    project.id,
                    session,
                    retention_days=review_analytics_effective_retention_days(
                        project,
                        retention_days,
                    ),
                    dry_run=dry_run,
                )
                for project in projects
            ]
            if dry_run:
                session.rollback()
            else:
                session.commit()
        except Exception:
            session.rollback()
            raise

    return ReviewAnalyticsMaintenanceSummary(
        dry_run=dry_run,
        project_count=len(results),
        total_removed_count=sum(result.removed_count for result in results),
        total_remaining_count=sum(result.remaining_count for result in results),
        results=results,
    )


def _maintenance_projects(session: Session, project_id: int | None) -> list[Project]:
    if project_id is None:
        return session.query(Project).order_by(Project.id).all()
    project = session.get(Project, project_id)
    if project is None:
        raise ValueError(f"Project not found: {project_id}")
    return [project]


def _cutoff_date(retention_days: int) -> str:
    return (datetime.now(UTC).date() - timedelta(days=retention_days)).isoformat()
