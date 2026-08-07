import importlib.util
import json
import os
import subprocess
import sys
import tarfile
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import duckdb
import pytest

from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import (
    Project,
    ReviewAnalyticsSnapshot,
    ReviewAnalyticsSnapshotCleanupAudit,
)
from graphmind.storage.workspace import WorkspacePaths

REPO_ROOT = Path(__file__).resolve().parents[2]
OPS_SCRIPT = REPO_ROOT / "deploy" / "graphmind-ops.py"
OPS_SPEC = importlib.util.spec_from_file_location("graphmind_ops", OPS_SCRIPT)
assert OPS_SPEC is not None and OPS_SPEC.loader is not None
OPS_MODULE = importlib.util.module_from_spec(OPS_SPEC)
OPS_SPEC.loader.exec_module(OPS_MODULE)


def _run_ops(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(OPS_SCRIPT), *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def test_preflight_reports_ready_for_hardened_env(tmp_path):
    workspace = tmp_path / "workspace"
    backup_dir = tmp_path / "backups"
    env_file = tmp_path / ".env.production"
    env_file.write_text(
        "\n".join(
            [
                "GRAPHMIND_DEPLOYMENT_MODE=production",
                "GRAPHMIND_ALLOWED_ORIGINS=https://graphmind.example.com",
                "GRAPHMIND_TRUSTED_HOSTS=graphmind.example.com",
                "GRAPHMIND_URL_IMPORT_ALLOWLIST=docs.example.com,*.trusted.example.com",
                "GRAPHMIND_AI_PROVIDER_ALLOWLIST=api.openai.com",
                f"GRAPHMIND_WORKSPACE_ROOT={workspace}",
                "GRAPHMIND_HTTP_PORT=8080",
            ]
        ),
        encoding="utf-8",
    )

    result = _run_ops(
        "preflight",
        "--env-file",
        str(env_file),
        "--backup-dir",
        str(backup_dir),
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["status"] == "ready"
    assert payload["checks"]["deployment_config"]["status"] == "ok"
    assert payload["checks"]["workspace"]["status"] == "ok"
    assert payload["checks"]["backup_dir"]["status"] == "ok"
    assert payload["checks"]["deploy_artifacts"]["status"] == "ok"
    assert workspace.exists()
    assert backup_dir.exists()


def test_preflight_fails_for_unsafe_production_env(tmp_path):
    env_file = tmp_path / ".env.production"
    env_file.write_text(
        "\n".join(
            [
                "GRAPHMIND_DEPLOYMENT_MODE=production",
                "GRAPHMIND_ALLOWED_ORIGINS=*",
                f"GRAPHMIND_WORKSPACE_ROOT={tmp_path / 'workspace'}",
            ]
        ),
        encoding="utf-8",
    )

    result = _run_ops("preflight", "--env-file", str(env_file))

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "not_ready"
    assert payload["checks"]["deployment_config"]["status"] == "failed"
    assert "wildcard" in payload["checks"]["deployment_config"]["detail"]


def test_backup_creates_tarball_and_restore_recovers_workspace(tmp_path):
    workspace = tmp_path / "workspace"
    backup_dir = tmp_path / "backups"
    _prepare_backup_workspace(workspace)
    workspace.joinpath("imports", "sample.csv").write_text("id,name\n1,Ada", encoding="utf-8")

    backup_result = _run_ops(
        "backup",
        "--workspace-root",
        str(workspace),
        "--backup-dir",
        str(backup_dir),
        "--label",
        "acceptance",
        "--quiesced",
    )

    assert backup_result.returncode == 0, backup_result.stderr
    backup_payload = json.loads(backup_result.stdout)
    archive_path = Path(backup_payload["archive_path"])
    assert archive_path.exists()
    assert archive_path.name.startswith("graphmind-workspace-acceptance-")
    assert archive_path.suffixes[-2:] == [".tar", ".gz"]
    with tarfile.open(archive_path, "r:gz") as archive:
        names = archive.getnames()
    assert "workspace/state/graphmind.sqlite3" in names
    assert "workspace/state/graphmind.duckdb" in names
    assert "workspace/imports/sample.csv" in names
    assert "manifest.json" in names
    assert "checksums.sha256" in names

    restored_workspace = tmp_path / "restored"
    restore_result = _run_ops(
        "restore",
        "--archive",
        str(archive_path),
        "--workspace-root",
        str(restored_workspace),
    )

    assert restore_result.returncode == 0, restore_result.stderr
    restore_payload = json.loads(restore_result.stdout)
    assert restore_payload["status"] == "restored"
    assert restored_workspace.joinpath("state", "graphmind.sqlite3").exists()
    assert restored_workspace.joinpath("state", "graphmind.duckdb").exists()
    assert restored_workspace.joinpath("imports", "sample.csv").read_text(
        encoding="utf-8"
    ) == "id,name\n1,Ada"


def test_restore_refuses_non_empty_workspace_without_force(tmp_path):
    workspace = tmp_path / "workspace"
    backup_dir = tmp_path / "backups"
    _prepare_backup_workspace(workspace)
    backup_result = _run_ops(
        "backup",
        "--workspace-root",
        str(workspace),
        "--backup-dir",
        str(backup_dir),
        "--quiesced",
    )
    archive_path = Path(json.loads(backup_result.stdout)["archive_path"])
    target = tmp_path / "target"
    target.mkdir()
    target.joinpath("existing.txt").write_text("keep", encoding="utf-8")

    result = _run_ops(
        "restore",
        "--archive",
        str(archive_path),
        "--workspace-root",
        str(target),
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert "non-empty" in payload["message"]


def test_backup_requires_sqlite_duckdb_and_import_directories(tmp_path):
    workspace = tmp_path / "workspace"
    WorkspacePaths(workspace).ensure()

    result = _run_ops(
        "backup",
        "--workspace-root",
        str(workspace),
        "--backup-dir",
        str(tmp_path / "backups"),
        "--quiesced",
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert "graphmind.sqlite3" in payload["message"]
    assert "graphmind.duckdb" in payload["message"]


@pytest.mark.parametrize(
    ("database_name", "expected_error"),
    [
        ("graphmind.sqlite3", "SQLite integrity check failed"),
        ("graphmind.duckdb", "DuckDB integrity check failed"),
    ],
)
def test_backup_rejects_corrupt_workspace_databases(
    tmp_path,
    database_name,
    expected_error,
):
    workspace = tmp_path / "workspace"
    paths = _prepare_backup_workspace(workspace)
    (paths.database_path.parent / database_name).write_bytes(b"not-a-database")

    result = _run_ops(
        "backup",
        "--workspace-root",
        str(workspace),
        "--backup-dir",
        str(tmp_path / "backups"),
        "--quiesced",
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert expected_error in payload["message"]


def test_restore_rejects_backup_with_a_tampered_checksum(tmp_path):
    workspace = tmp_path / "workspace"
    backup_dir = tmp_path / "backups"
    _prepare_backup_workspace(workspace)
    workspace.joinpath("imports", "sample.csv").write_text("original", encoding="utf-8")
    backup_result = _run_ops(
        "backup",
        "--workspace-root",
        str(workspace),
        "--backup-dir",
        str(backup_dir),
        "--quiesced",
    )
    archive_path = Path(json.loads(backup_result.stdout)["archive_path"])
    tampered_archive = tmp_path / "tampered.tar.gz"
    with tempfile.TemporaryDirectory() as extracted_name:
        extracted = Path(extracted_name)
        with tarfile.open(archive_path, "r:gz") as archive:
            archive.extractall(extracted)
        extracted.joinpath("workspace", "imports", "sample.csv").write_text(
            "tampered",
            encoding="utf-8",
        )
        with tarfile.open(tampered_archive, "w:gz") as archive:
            for path in sorted(extracted.iterdir()):
                archive.add(path, arcname=path.name)

    result = _run_ops(
        "restore",
        "--archive",
        str(tampered_archive),
        "--workspace-root",
        str(tmp_path / "target"),
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert "checksum verification failed" in payload["message"]


def test_restore_rolls_back_when_atomic_activation_fails(tmp_path, monkeypatch):
    source_workspace = tmp_path / "source"
    backup_dir = tmp_path / "backups"
    _prepare_backup_workspace(source_workspace)
    source_workspace.joinpath("imports", "new.csv").write_text("new", encoding="utf-8")
    backup_result = _run_ops(
        "backup",
        "--workspace-root",
        str(source_workspace),
        "--backup-dir",
        str(backup_dir),
        "--quiesced",
    )
    archive_path = Path(json.loads(backup_result.stdout)["archive_path"])

    target_workspace = tmp_path / "volume" / "workspace"
    _prepare_backup_workspace(target_workspace)
    target_workspace.joinpath("imports", "active.csv").write_text("active", encoding="utf-8")

    original_replace = os.replace
    replace_calls = 0

    def fail_activation(source, destination):
        nonlocal replace_calls
        replace_calls += 1
        if replace_calls == 2:
            raise OSError("activation rename failed")
        return original_replace(source, destination)

    monkeypatch.setattr(OPS_MODULE.os, "replace", fail_activation)

    result = OPS_MODULE._restore(archive_path, target_workspace, force=True)

    assert result == 1
    assert (
        target_workspace.joinpath("imports", "active.csv").read_text(encoding="utf-8")
        == "active"
    )
    assert not target_workspace.joinpath("imports", "new.csv").exists()
    assert not list(target_workspace.parent.glob(".workspace.restore-*"))
    assert not list(target_workspace.parent.glob(".workspace.failed-*"))


def test_restore_cleans_replacement_when_post_switch_validation_fails(
    tmp_path,
    monkeypatch,
):
    source_workspace = tmp_path / "source"
    backup_dir = tmp_path / "backups"
    _prepare_backup_workspace(source_workspace)
    source_workspace.joinpath("imports", "new.csv").write_text("new", encoding="utf-8")
    backup_result = _run_ops(
        "backup",
        "--workspace-root",
        str(source_workspace),
        "--backup-dir",
        str(backup_dir),
        "--quiesced",
    )
    archive_path = Path(json.loads(backup_result.stdout)["archive_path"])

    target_workspace = tmp_path / "volume" / "workspace"
    _prepare_backup_workspace(target_workspace)
    target_workspace.joinpath("imports", "active.csv").write_text("active", encoding="utf-8")
    original_validate = OPS_MODULE._validate_restored_workspace
    validation_calls = 0

    def fail_post_switch_validation(workspace_root, manifest):
        nonlocal validation_calls
        validation_calls += 1
        original_validate(workspace_root, manifest)
        if validation_calls == 2:
            raise ValueError("post-switch validation failed")

    monkeypatch.setattr(
        OPS_MODULE,
        "_validate_restored_workspace",
        fail_post_switch_validation,
    )

    result = OPS_MODULE._restore(archive_path, target_workspace, force=True)

    assert result == 1
    assert target_workspace.joinpath("imports", "active.csv").read_text(
        encoding="utf-8"
    ) == "active"
    assert not target_workspace.joinpath("imports", "new.csv").exists()
    assert not list(target_workspace.parent.glob(".workspace.restore-*"))
    assert not list(target_workspace.parent.glob(".workspace.failed-*"))


def test_restore_rejects_archive_members_that_escape_workspace(tmp_path):
    archive_path = tmp_path / "unsafe.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        unsafe_file = tmp_path / "unsafe.txt"
        unsafe_file.write_text("unsafe", encoding="utf-8")
        archive.add(unsafe_file, arcname="../unsafe.txt")

    result = _run_ops(
        "restore",
        "--archive",
        str(archive_path),
        "--workspace-root",
        str(tmp_path / "target"),
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert "cannot be restored safely" in payload["message"]


def test_restore_rejects_archive_links_that_escape_workspace(tmp_path):
    archive_path = tmp_path / "unsafe-link.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        link_info = tarfile.TarInfo("workspace/unsafe-link")
        link_info.type = tarfile.SYMTYPE
        link_info.linkname = "/etc/passwd"
        archive.addfile(link_info)

    result = _run_ops(
        "restore",
        "--archive",
        str(archive_path),
        "--workspace-root",
        str(tmp_path / "target"),
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert "cannot be restored safely" in payload["message"]


def test_restore_rejects_special_archive_member_types(tmp_path):
    archive_path = tmp_path / "unsafe-device.tar.gz"
    with tarfile.open(archive_path, "w:gz") as archive:
        fifo_info = tarfile.TarInfo("workspace/unsafe-fifo")
        fifo_info.type = tarfile.FIFOTYPE
        archive.addfile(fifo_info)

    result = _run_ops(
        "restore",
        "--archive",
        str(archive_path),
        "--workspace-root",
        str(tmp_path / "target"),
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert "cannot be restored safely" in payload["message"]


def test_review_analytics_maintenance_dry_run_reports_without_mutation(tmp_path):
    session_factory = _prepare_workspace(tmp_path / "workspace")
    with session_factory() as session:
        project_id = _seed_review_analytics_project(
            session,
            name="Ops Dry Run",
            retention_days=365,
            ages=(45, 20),
        )
        session.commit()

    result = _run_ops(
        "review-analytics-maintenance",
        "--workspace-root",
        str(tmp_path / "workspace"),
        "--project-id",
        str(project_id),
        "--retention-days",
        "30",
        "--dry-run",
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["status"] == "dry_run"
    assert payload["project_count"] == 1
    assert payload["total_removed_count"] == 1
    assert payload["total_remaining_count"] == 1
    assert payload["results"][0]["project_id"] == project_id
    assert payload["results"][0]["dry_run"] is True

    with session_factory() as session:
        assert _snapshot_count(session, project_id) == 2
        assert session.query(ReviewAnalyticsSnapshotCleanupAudit).count() == 0


def test_review_analytics_maintenance_applies_cleanup_and_audit(tmp_path):
    session_factory = _prepare_workspace(tmp_path / "workspace")
    with session_factory() as session:
        project_id = _seed_review_analytics_project(
            session,
            name="Ops Apply",
            retention_days=30,
            ages=(45, 20),
        )
        session.commit()

    result = _run_ops(
        "review-analytics-maintenance",
        "--workspace-root",
        str(tmp_path / "workspace"),
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["status"] == "applied"
    assert payload["project_count"] == 1
    assert payload["total_removed_count"] == 1
    assert payload["total_remaining_count"] == 1
    assert payload["results"][0]["retention_days"] == 30

    with session_factory() as session:
        assert _snapshot_count(session, project_id) == 1
        audits = session.query(ReviewAnalyticsSnapshotCleanupAudit).all()
        assert len(audits) == 1
        assert audits[0].project_id == project_id
        assert audits[0].removed_count == 1


def test_review_analytics_maintenance_uses_env_file_workspace_root(tmp_path):
    workspace = tmp_path / "workspace"
    session_factory = _prepare_workspace(workspace)
    with session_factory() as session:
        project_id = _seed_review_analytics_project(
            session,
            name="Ops Env File",
            retention_days=30,
            ages=(45, 20),
        )
        session.commit()
    env_file = tmp_path / ".env.production"
    env_file.write_text(
        "\n".join(
            [
                "GRAPHMIND_DEPLOYMENT_MODE=production",
                "GRAPHMIND_ALLOWED_ORIGINS=https://graphmind.example.com",
                "GRAPHMIND_URL_IMPORT_ALLOWLIST=docs.example.com",
                f"GRAPHMIND_WORKSPACE_ROOT={workspace}",
            ]
        ),
        encoding="utf-8",
    )

    result = _run_ops(
        "review-analytics-maintenance",
        "--env-file",
        str(env_file),
        "--dry-run",
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["status"] == "dry_run"
    assert payload["results"][0]["project_id"] == project_id
    assert payload["total_removed_count"] == 1


def test_review_analytics_maintenance_workspace_root_overrides_env_file(tmp_path):
    env_workspace = tmp_path / "env-workspace"
    override_workspace = tmp_path / "override-workspace"
    _prepare_workspace(env_workspace)
    session_factory = _prepare_workspace(override_workspace)
    with session_factory() as session:
        project_id = _seed_review_analytics_project(
            session,
            name="Ops Override",
            retention_days=30,
            ages=(45, 20),
        )
        session.commit()
    env_file = tmp_path / ".env.production"
    env_file.write_text(
        "\n".join(
            [
                "GRAPHMIND_DEPLOYMENT_MODE=production",
                "GRAPHMIND_ALLOWED_ORIGINS=https://graphmind.example.com",
                "GRAPHMIND_URL_IMPORT_ALLOWLIST=docs.example.com",
                f"GRAPHMIND_WORKSPACE_ROOT={env_workspace}",
            ]
        ),
        encoding="utf-8",
    )

    result = _run_ops(
        "review-analytics-maintenance",
        "--env-file",
        str(env_file),
        "--workspace-root",
        str(override_workspace),
        "--dry-run",
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["project_count"] == 1
    assert payload["results"][0]["project_id"] == project_id
    assert payload["total_removed_count"] == 1


def test_review_analytics_maintenance_requires_workspace_configuration():
    result = _run_ops("review-analytics-maintenance", "--dry-run")

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert "Workspace root is required" in payload["message"]
    assert "--workspace-root" in payload["message"]
    assert "--env-file" in payload["message"]


def test_review_analytics_maintenance_reports_env_file_without_workspace_root(tmp_path):
    env_file = tmp_path / ".env.production"
    env_file.write_text(
        "\n".join(
            [
                "GRAPHMIND_DEPLOYMENT_MODE=production",
                "GRAPHMIND_ALLOWED_ORIGINS=https://graphmind.example.com",
                "GRAPHMIND_URL_IMPORT_ALLOWLIST=docs.example.com",
            ]
        ),
        encoding="utf-8",
    )

    result = _run_ops(
        "review-analytics-maintenance",
        "--env-file",
        str(env_file),
        "--dry-run",
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert "Workspace root is required" in payload["message"]


def test_review_analytics_maintenance_reports_unreadable_env_file(tmp_path):
    missing_env_file = tmp_path / ".env.missing"

    result = _run_ops(
        "review-analytics-maintenance",
        "--env-file",
        str(missing_env_file),
        "--dry-run",
    )

    assert result.returncode == 1
    payload = json.loads(result.stdout)
    assert payload["status"] == "failed"
    assert "Environment file could not be read" in payload["message"]
    assert str(missing_env_file) in payload["message"]


def _prepare_workspace(workspace_root: Path):
    paths = WorkspacePaths(workspace_root)
    paths.ensure()
    initialize_database(paths.database_path)
    return create_session_factory(paths.database_path)


def _prepare_backup_workspace(workspace_root: Path) -> WorkspacePaths:
    paths = WorkspacePaths(workspace_root)
    paths.ensure()
    initialize_database(paths.database_path)
    with duckdb.connect(str(paths.duckdb_path)) as connection:
        connection.execute("CREATE TABLE backup_probe (id INTEGER)")
    return paths


def _seed_review_analytics_project(
    session,
    *,
    name: str,
    retention_days: int,
    ages: tuple[int, ...],
) -> int:
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
