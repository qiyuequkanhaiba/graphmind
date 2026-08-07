#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import tarfile
import uuid
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from graphmind.api.deployment import (  # noqa: E402
    DeploymentConfigError,
    load_deployment_settings,
    readiness_payload,
)
from graphmind.storage.workspace import WorkspacePaths  # noqa: E402

REQUIRED_DEPLOY_ARTIFACTS = [
    "deploy/.env.production.example",
    "deploy/backend.Dockerfile",
    "deploy/frontend.Dockerfile",
    "deploy/docker-compose.yml",
    "deploy/graphmind-ops.py",
    "deploy/nginx.conf",
    "deploy/smoke-check.sh",
]

BACKUP_MANIFEST_NAME = "manifest.json"
BACKUP_CHECKSUMS_NAME = "checksums.sha256"
BACKUP_FORMAT_VERSION = 1
MAX_BACKUP_METADATA_BYTES = 16 * 1024 * 1024
WORKSPACE_REQUIRED_DIRECTORIES = ("state", "imports", "import_jobs")
WORKSPACE_REQUIRED_FILES = ("state/graphmind.sqlite3", "state/graphmind.duckdb")


def main() -> int:
    parser = argparse.ArgumentParser(description="GraphMind deployment operations helper.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    preflight_parser = subparsers.add_parser("preflight", help="Validate deployment config.")
    preflight_parser.add_argument("--env-file", required=True, type=Path)
    preflight_parser.add_argument("--backup-dir", type=Path)
    preflight_parser.add_argument("--workspace-root", type=Path)

    backup_parser = subparsers.add_parser("backup", help="Archive a workspace directory.")
    backup_parser.add_argument("--workspace-root", required=True, type=Path)
    backup_parser.add_argument("--backup-dir", required=True, type=Path)
    backup_parser.add_argument("--label", default="manual")
    backup_parser.add_argument(
        "--quiesced",
        action="store_true",
        help="Confirm all backend and worker writers are stopped before backup.",
    )

    restore_parser = subparsers.add_parser("restore", help="Restore a workspace archive.")
    restore_parser.add_argument("--archive", required=True, type=Path)
    restore_parser.add_argument("--workspace-root", required=True, type=Path)
    restore_parser.add_argument("--force", action="store_true")

    review_maintenance_parser = subparsers.add_parser(
        "review-analytics-maintenance",
        help="Clean expired review analytics snapshots.",
    )
    review_maintenance_parser.add_argument("--env-file", type=Path)
    review_maintenance_parser.add_argument("--workspace-root", type=Path)
    review_maintenance_parser.add_argument("--project-id", type=int)
    review_maintenance_parser.add_argument("--retention-days", type=int)
    review_maintenance_parser.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()
    if args.command == "preflight":
        return _preflight(args.env_file, args.backup_dir, args.workspace_root)
    if args.command == "backup":
        return _backup(args.workspace_root, args.backup_dir, args.label, args.quiesced)
    if args.command == "restore":
        return _restore(args.archive, args.workspace_root, args.force)
    if args.command == "review-analytics-maintenance":
        return _review_analytics_maintenance(
            args.env_file,
            args.workspace_root,
            args.project_id,
            args.retention_days,
            args.dry_run,
        )
    parser.error(f"Unknown command: {args.command}")
    return 2


def _preflight(env_file: Path, backup_dir: Path | None, workspace_root: Path | None) -> int:
    checks: dict[str, dict[str, str]] = {}
    env = _read_env_file(env_file)
    if workspace_root is not None:
        env["GRAPHMIND_WORKSPACE_ROOT"] = str(workspace_root)
    try:
        settings = load_deployment_settings(environ=env)
        paths = WorkspacePaths(settings.workspace_root)
        checks["deployment_config"] = {
            "status": "ok",
            "detail": f"Deployment mode: {settings.deployment_mode}.",
        }
        try:
            paths.ensure()
            readiness = readiness_payload(settings, paths)
            for check_name, check in readiness["checks"].items():
                checks[check_name] = {
                    "status": str(check["status"]),
                    "detail": str(check["detail"]),
                }
        except OSError as exc:
            checks["workspace"] = {
                "status": "failed",
                "detail": f"Workspace could not be initialized at {paths.root}: {exc}.",
            }
            checks["url_import_allowlist"] = {
                "status": "ok" if settings.url_import_allowlist else "failed",
                "detail": (
                    f"{len(settings.url_import_allowlist)} URL import allowlist pattern(s) "
                    "configured."
                    if settings.url_import_allowlist
                    else "GRAPHMIND_URL_IMPORT_ALLOWLIST must be set before production use."
                ),
            }
    except DeploymentConfigError as exc:
        checks["deployment_config"] = {"status": "failed", "detail": str(exc)}
        checks["workspace"] = {
            "status": "failed",
            "detail": (
                "Workspace was not initialized because deployment configuration failed."
                if env.get("GRAPHMIND_WORKSPACE_ROOT", "").strip()
                else "GRAPHMIND_WORKSPACE_ROOT is not configured."
            ),
        }
        checks["url_import_allowlist"] = {
            "status": "failed",
            "detail": "URL import allowlist was not checked because deployment config failed.",
        }

    if backup_dir is not None:
        try:
            backup_dir.mkdir(parents=True, exist_ok=True)
            checks["backup_dir"] = {"status": "ok", "detail": f"Backup directory: {backup_dir}."}
        except OSError as exc:
            checks["backup_dir"] = {"status": "failed", "detail": str(exc)}

    missing_artifacts = [
        artifact for artifact in REQUIRED_DEPLOY_ARTIFACTS if not (REPO_ROOT / artifact).exists()
    ]
    checks["deploy_artifacts"] = {
        "status": "failed" if missing_artifacts else "ok",
        "detail": (
            f"Missing deployment artifacts: {', '.join(missing_artifacts)}."
            if missing_artifacts
            else "All required deployment artifacts are present."
        ),
    }
    checks["docker_cli"] = {
        "status": "ok" if _has_docker_cli() else "warning",
        "detail": (
            "Docker CLI is available."
            if _has_docker_cli()
            else "Docker CLI is not available locally; run docker compose config on the server."
        ),
    }
    return _emit_status(checks, ready_word="ready")


def _backup(workspace_root: Path, backup_dir: Path, label: str, quiesced: bool) -> int:
    if not quiesced:
        return _emit_error(
            "Backup requires a quiesced workspace. Stop backend and worker writers, "
            "then rerun with --quiesced."
        )
    try:
        manifest = _build_backup_manifest(workspace_root)
    except (OSError, ValueError) as exc:
        return _emit_error(f"Workspace cannot be backed up safely: {exc}.")

    backup_dir.mkdir(parents=True, exist_ok=True)
    safe_label = _safe_label(label)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    archive_path = backup_dir / f"graphmind-workspace-{safe_label}-{timestamp}.tar.gz"
    temporary_archive_path = backup_dir / f".{archive_path.name}.{uuid.uuid4().hex}.tmp"
    try:
        _write_backup_archive(temporary_archive_path, workspace_root, manifest)
        _validate_backup_archive(temporary_archive_path)
        os.replace(temporary_archive_path, archive_path)
    except (OSError, ValueError, tarfile.TarError) as exc:
        temporary_archive_path.unlink(missing_ok=True)
        return _emit_error(f"Backup archive could not be verified: {exc}.")
    return _emit(
        {
            "status": "backed_up",
            "workspace_root": str(workspace_root),
            "archive_path": str(archive_path),
            "archive_bytes": archive_path.stat().st_size,
            "manifest": BACKUP_MANIFEST_NAME,
            "checksums": BACKUP_CHECKSUMS_NAME,
        },
        0,
    )


def _restore(archive_path: Path, workspace_root: Path, force: bool) -> int:
    if not archive_path.exists():
        return _emit_error(f"Archive does not exist: {archive_path}.")
    if workspace_root.exists() and any(workspace_root.iterdir()) and not force:
        return _emit_error(
            f"Target workspace is non-empty: {workspace_root}. Use --force to replace it."
        )
    try:
        manifest = _validate_backup_archive(archive_path)
    except (OSError, ValueError, tarfile.TarError) as exc:
        return _emit_error(f"Archive cannot be restored safely: {exc}.")

    try:
        previous_workspace = _stage_and_activate_restore(archive_path, workspace_root, manifest)
    except Exception as exc:
        return _emit_error(f"Restore failed: {exc}.")
    return _emit(
        {
            "status": "restored",
            "archive_path": str(archive_path),
            "workspace_root": str(workspace_root),
            "previous_workspace": str(previous_workspace) if previous_workspace else None,
        },
        0,
    )


def _build_backup_manifest(workspace_root: Path) -> dict[str, object]:
    if not workspace_root.is_dir():
        raise ValueError(f"workspace root does not exist: {workspace_root}")

    required_directories = [workspace_root / path for path in WORKSPACE_REQUIRED_DIRECTORIES]
    required_files = [workspace_root / path for path in WORKSPACE_REQUIRED_FILES]
    missing_directories = [str(path) for path in required_directories if not path.is_dir()]
    missing_files = [str(path) for path in required_files if not path.is_file()]
    if missing_directories or missing_files:
        missing = [*missing_directories, *missing_files]
        raise ValueError(f"required workspace data is missing: {', '.join(missing)}")
    _validate_workspace_databases(workspace_root)

    files: list[dict[str, object]] = []
    directories = ["workspace"]
    for path in sorted(workspace_root.rglob("*"), key=lambda item: item.as_posix()):
        if path.is_symlink():
            raise ValueError(f"workspace symlinks are not supported: {path}")
        archive_path = f"workspace/{path.relative_to(workspace_root).as_posix()}"
        if path.is_dir():
            directories.append(archive_path)
        elif path.is_file():
            files.append(
                {
                    "path": archive_path,
                    "bytes": path.stat().st_size,
                    "sha256": _sha256_file(path),
                }
            )
        else:
            raise ValueError(f"workspace contains unsupported path type: {path}")

    return {
        "format_version": BACKUP_FORMAT_VERSION,
        "created_at": datetime.now(UTC).isoformat(),
        "required_directories": [f"workspace/{path}" for path in WORKSPACE_REQUIRED_DIRECTORIES],
        "required_files": [f"workspace/{path}" for path in WORKSPACE_REQUIRED_FILES],
        "directories": directories,
        "files": files,
    }


def _write_backup_archive(
    archive_path: Path,
    workspace_root: Path,
    manifest: dict[str, object],
) -> None:
    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
    checksums = [f"{_sha256_bytes(manifest_bytes)}  {BACKUP_MANIFEST_NAME}"]
    checksums.extend(
        f"{file_info['sha256']}  {file_info['path']}" for file_info in manifest["files"]
    )
    checksums_bytes = ("\n".join(checksums) + "\n").encode("utf-8")

    with tarfile.open(archive_path, "w:gz", dereference=True) as archive:
        archive.add(workspace_root, arcname="workspace")
        _add_archive_bytes(archive, BACKUP_MANIFEST_NAME, manifest_bytes)
        _add_archive_bytes(archive, BACKUP_CHECKSUMS_NAME, checksums_bytes)


def _add_archive_bytes(archive: tarfile.TarFile, name: str, contents: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(contents)
    archive.addfile(info, fileobj=_bytes_file(contents))


def _bytes_file(contents: bytes):
    from io import BytesIO

    return BytesIO(contents)


def _validate_backup_archive(archive_path: Path) -> dict[str, object]:
    with tarfile.open(archive_path, "r:gz") as archive:
        members = archive.getmembers()
        _validate_archive_members(members)
        members_by_name = {member.name: member for member in members}
        manifest_bytes = _read_archive_file(archive, members_by_name, BACKUP_MANIFEST_NAME)
        checksums_bytes = _read_archive_file(archive, members_by_name, BACKUP_CHECKSUMS_NAME)
        try:
            manifest = json.loads(manifest_bytes)
        except json.JSONDecodeError as exc:
            raise ValueError(f"backup manifest is invalid JSON: {exc}") from exc
        if not isinstance(manifest, dict):
            raise ValueError("backup manifest must be a JSON object")
        _validate_manifest(manifest, members_by_name)

        checksums = _parse_checksums(checksums_bytes)
        declared_files = manifest["files"]
        expected_checksums = {
            BACKUP_MANIFEST_NAME: _sha256_bytes(manifest_bytes),
            **{file_info["path"]: file_info["sha256"] for file_info in declared_files},
        }
        if checksums != expected_checksums:
            raise ValueError("backup checksums do not match the manifest")
        for path, expected_checksum in checksums.items():
            actual_checksum = (
                _sha256_bytes(manifest_bytes)
                if path == BACKUP_MANIFEST_NAME
                else _sha256_archive_member(archive, members_by_name, path)
            )
            if actual_checksum != expected_checksum:
                raise ValueError(f"checksum verification failed for {path}")
    return manifest


def _validate_manifest(
    manifest: dict[str, object],
    members_by_name: dict[str, tarfile.TarInfo],
) -> None:
    if manifest.get("format_version") != BACKUP_FORMAT_VERSION:
        raise ValueError("backup manifest format is unsupported")
    directories = manifest.get("directories")
    files = manifest.get("files")
    required_directories = manifest.get("required_directories")
    required_files = manifest.get("required_files")
    manifest_lists = (directories, files, required_directories, required_files)
    if not all(isinstance(value, list) for value in manifest_lists):
        raise ValueError("backup manifest is missing required lists")
    if not all(isinstance(directory, str) for directory in directories):
        raise ValueError("backup manifest contains an invalid directory entry")
    if not all(isinstance(directory, str) for directory in required_directories):
        raise ValueError("backup manifest contains an invalid required directory entry")
    if not all(isinstance(file_path, str) for file_path in required_files):
        raise ValueError("backup manifest contains an invalid required file entry")
    expected_directories = {
        "workspace",
        *(f"workspace/{path}" for path in WORKSPACE_REQUIRED_DIRECTORIES),
    }
    if not expected_directories.issubset(set(directories)):
        raise ValueError("backup manifest is missing required workspace directories")
    expected_files = {f"workspace/{path}" for path in WORKSPACE_REQUIRED_FILES}
    if not expected_files.issubset(set(required_files)):
        raise ValueError("backup manifest is missing required workspace files")
    if not set(required_directories).issuperset(expected_directories - {"workspace"}):
        raise ValueError("backup manifest is missing required directory declarations")

    declared_file_paths: set[str] = set()
    for file_info in files:
        if not isinstance(file_info, dict):
            raise ValueError("backup manifest contains an invalid file entry")
        path = file_info.get("path")
        checksum = file_info.get("sha256")
        size = file_info.get("bytes")
        if (
            not isinstance(path, str)
            or not path.startswith("workspace/")
            or path in declared_file_paths
            or not isinstance(checksum, str)
            or not re.fullmatch(r"[a-f0-9]{64}", checksum)
            or not isinstance(size, int)
            or size < 0
        ):
            raise ValueError("backup manifest contains an invalid file checksum entry")
        member = members_by_name.get(path)
        if member is None or not member.isfile() or member.size != size:
            raise ValueError(f"backup archive is missing declared file: {path}")
        declared_file_paths.add(path)
    if not expected_files.issubset(declared_file_paths):
        raise ValueError("backup archive is missing SQLite or DuckDB data")
    for directory in directories:
        member = members_by_name.get(directory)
        if member is None or not member.isdir():
            raise ValueError(f"backup archive is missing declared directory: {directory}")
    archive_workspace_paths = {
        name for name in members_by_name if name == "workspace" or name.startswith("workspace/")
    }
    declared_paths = set(directories) | declared_file_paths
    if archive_workspace_paths != declared_paths:
        raise ValueError("backup archive workspace contents do not match the manifest")


def _read_archive_file(
    archive: tarfile.TarFile,
    members_by_name: dict[str, tarfile.TarInfo],
    path: str,
) -> bytes:
    member = members_by_name.get(path)
    if member is None or not member.isfile():
        raise ValueError(f"backup archive is missing file: {path}")
    if member.size > MAX_BACKUP_METADATA_BYTES:
        raise ValueError(f"backup metadata file is too large: {path}")
    file_object = archive.extractfile(member)
    if file_object is None:
        raise ValueError(f"backup archive cannot read file: {path}")
    return file_object.read()


def _parse_checksums(contents: bytes) -> dict[str, str]:
    checksums: dict[str, str] = {}
    for line in contents.decode("utf-8").splitlines():
        checksum, separator, path = line.partition("  ")
        if (
            not separator
            or not re.fullmatch(r"[a-f0-9]{64}", checksum)
            or not path
            or path in checksums
        ):
            raise ValueError("backup checksum file is invalid")
        checksums[path] = checksum
    if BACKUP_MANIFEST_NAME not in checksums:
        raise ValueError("backup checksum file does not cover the manifest")
    return checksums


def _stage_and_activate_restore(
    archive_path: Path,
    workspace_root: Path,
    manifest: dict[str, object],
) -> Path | None:
    workspace_root.parent.mkdir(parents=True, exist_ok=True)
    stage_parent = workspace_root.parent
    stage_root = stage_parent / f".{workspace_root.name}.restore-{uuid.uuid4().hex}"
    extracted_workspace = stage_root / "workspace"
    previous_workspace = stage_parent / f".{workspace_root.name}.previous-{uuid.uuid4().hex}"
    moved_active = False
    switched = False
    failed_workspace: Path | None = None
    try:
        required_bytes = sum(int(file_info["bytes"]) for file_info in manifest["files"])
        if required_bytes > shutil.disk_usage(stage_parent).free:
            raise ValueError("insufficient free space to stage the restored workspace")
        stage_root.mkdir()
        with tarfile.open(archive_path, "r:gz") as archive:
            archive.extractall(stage_root, archive.getmembers())
        _validate_restored_workspace(extracted_workspace, manifest)

        if workspace_root.exists():
            os.replace(workspace_root, previous_workspace)
            moved_active = True
        os.replace(extracted_workspace, workspace_root)
        switched = True
        _validate_restored_workspace(workspace_root, manifest)
    except Exception as restore_error:
        try:
            if switched and workspace_root.exists():
                failed_workspace = (
                    stage_parent / f".{workspace_root.name}.failed-{uuid.uuid4().hex}"
                )
                os.replace(workspace_root, failed_workspace)
            if moved_active and previous_workspace.exists():
                os.replace(previous_workspace, workspace_root)
        except Exception as rollback_error:
            raise RuntimeError(
                f"restore failed: {restore_error}; rollback failed: {rollback_error}"
            ) from rollback_error
        cleanup_errors = _cleanup_failed_restore_paths(stage_root, failed_workspace)
        if cleanup_errors:
            raise RuntimeError(
                f"restore failed: {restore_error}; rollback succeeded but cleanup failed: "
                + "; ".join(cleanup_errors)
            ) from restore_error
        raise RuntimeError(
            f"{restore_error}; target workspace was restored to its pre-restore state"
        ) from restore_error
    shutil.rmtree(stage_root, ignore_errors=True)
    return previous_workspace if moved_active else None


def _cleanup_failed_restore_paths(stage_root: Path, failed_workspace: Path | None) -> list[str]:
    errors: list[str] = []
    for path in (failed_workspace, stage_root):
        if path is None or not path.exists():
            continue
        try:
            shutil.rmtree(path)
        except OSError as exc:
            errors.append(f"{path}: {exc}")
    return errors


def _validate_restored_workspace(workspace_root: Path, manifest: dict[str, object]) -> None:
    restored_manifest = _build_backup_manifest(workspace_root)
    for key in ("directories", "required_directories", "required_files"):
        if restored_manifest[key] != manifest[key]:
            raise ValueError(f"restored workspace {key} do not match the backup manifest")
    restored_files = {
        file_info["path"]: (file_info["bytes"], file_info["sha256"])
        for file_info in restored_manifest["files"]
    }
    archived_files = {
        file_info["path"]: (file_info["bytes"], file_info["sha256"])
        for file_info in manifest["files"]
    }
    if restored_files != archived_files:
        raise ValueError("restored workspace checksums do not match the backup manifest")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_object:
        for chunk in iter(lambda: file_object.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sha256_archive_member(
    archive: tarfile.TarFile,
    members_by_name: dict[str, tarfile.TarInfo],
    path: str,
) -> str:
    member = members_by_name.get(path)
    if member is None or not member.isfile():
        raise ValueError(f"backup archive is missing file: {path}")
    file_object = archive.extractfile(member)
    if file_object is None:
        raise ValueError(f"backup archive cannot read file: {path}")
    digest = hashlib.sha256()
    for chunk in iter(lambda: file_object.read(1024 * 1024), b""):
        digest.update(chunk)
    return digest.hexdigest()


def _sha256_bytes(contents: bytes) -> str:
    return hashlib.sha256(contents).hexdigest()


def _review_analytics_maintenance(
    env_file: Path | None,
    workspace_root: Path | None,
    project_id: int | None,
    retention_days: int | None,
    dry_run: bool,
) -> int:
    try:
        resolved_workspace_root = _resolve_workspace_root(env_file, workspace_root)
    except OSError as exc:
        return _emit_error(f"Environment file could not be read: {env_file}: {exc}.")
    if resolved_workspace_root is None:
        return _emit_error(
            "Workspace root is required. Pass --workspace-root or an --env-file "
            "with GRAPHMIND_WORKSPACE_ROOT."
        )
    from graphmind.services.review_analytics_maintenance import (
        cleanup_expired_review_analytics_snapshots,
    )
    from graphmind.storage.database import (
        create_session_factory,
        initialize_workspace_databases,
    )

    paths = WorkspacePaths(resolved_workspace_root)
    paths.ensure()
    initialize_workspace_databases(paths)
    session_factory = create_session_factory(paths.database_path)
    try:
        summary = cleanup_expired_review_analytics_snapshots(
            session_factory,
            project_id=project_id,
            retention_days=retention_days,
            dry_run=dry_run,
        )
    except ValueError as exc:
        return _emit_error(str(exc))
    return _emit(
        {
            "status": "dry_run" if summary.dry_run else "applied",
            "project_count": summary.project_count,
            "total_removed_count": summary.total_removed_count,
            "total_remaining_count": summary.total_remaining_count,
            "results": [
                {
                    "project_id": result.project_id,
                    "retention_days": result.retention_days,
                    "cutoff_date": result.cutoff_date,
                    "removed_count": result.removed_count,
                    "remaining_count": result.remaining_count,
                    "dry_run": result.dry_run,
                }
                for result in summary.results
            ],
        },
        0,
    )


def _resolve_workspace_root(env_file: Path | None, workspace_root: Path | None) -> Path | None:
    if workspace_root is not None:
        return workspace_root
    if env_file is None:
        return None
    env = _read_env_file(env_file)
    configured_workspace_root = env.get("GRAPHMIND_WORKSPACE_ROOT", "").strip()
    return Path(configured_workspace_root) if configured_workspace_root else None


def _read_env_file(env_file: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in env_file.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        values[name.strip()] = _strip_quotes(value.strip())
    return values


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _safe_label(label: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9_.-]+", "-", label.strip()).strip("-")
    return sanitized or "manual"


def _validate_archive_members(members: list[tarfile.TarInfo]) -> None:
    expected_metadata_files = {BACKUP_MANIFEST_NAME, BACKUP_CHECKSUMS_NAME}
    member_names: set[str] = set()
    for member in members:
        path = Path(member.name)
        if member.name in member_names:
            raise ValueError(f"duplicate archive member path: {member.name}")
        member_names.add(member.name)
        if member.name.startswith("/") or ".." in path.parts:
            raise ValueError(f"unsafe archive member path: {member.name}")
        if member.name not in expected_metadata_files and (
            not path.parts or path.parts[0] != "workspace"
        ):
            raise ValueError(f"archive member is outside workspace root: {member.name}")
        if member.issym() or member.islnk():
            raise ValueError(f"archive links are not supported: {member.name}")
        if not (member.isfile() or member.isdir()):
            raise ValueError(f"unsupported archive member type: {member.name}")
        if not member.isfile() and not member.isdir():
            raise ValueError(f"archive member has unsupported type: {member.name}")
    missing_metadata = expected_metadata_files - member_names
    if missing_metadata:
        raise ValueError(f"archive is missing metadata: {', '.join(sorted(missing_metadata))}")


def _validate_workspace_databases(workspace_root: Path) -> None:
    sqlite_path = workspace_root / "state" / "graphmind.sqlite3"
    try:
        sqlite_uri = f"{sqlite_path.resolve().as_uri()}?mode=ro"
        with sqlite3.connect(sqlite_uri, uri=True, timeout=2) as connection:
            integrity_result = connection.execute("PRAGMA integrity_check").fetchone()
    except sqlite3.Error as exc:
        raise ValueError(f"SQLite integrity check failed: {exc}") from exc
    if integrity_result != ("ok",):
        detail = integrity_result[0] if integrity_result else "no result"
        raise ValueError(f"SQLite integrity check failed: {detail}")

    duckdb_path = workspace_root / "state" / "graphmind.duckdb"
    try:
        import duckdb

        with duckdb.connect(str(duckdb_path), read_only=True) as connection:
            connection.execute("SELECT 1").fetchone()
    except Exception as exc:
        raise ValueError(f"DuckDB integrity check failed: {exc}") from exc


def _has_docker_cli() -> bool:
    return shutil.which("docker") is not None


def _emit_status(checks: dict[str, dict[str, str]], ready_word: str) -> int:
    failed = any(check["status"] == "failed" for check in checks.values())
    payload = {"status": "not_ready" if failed else ready_word, "checks": checks}
    return _emit(payload, 1 if failed else 0)


def _emit_error(message: str) -> int:
    return _emit({"status": "failed", "message": message}, 1)


def _emit(payload: dict[str, object], status_code: int) -> int:
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return status_code


if __name__ == "__main__":
    raise SystemExit(main())
