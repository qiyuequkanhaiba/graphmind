from __future__ import annotations

import re
from hashlib import sha256
from pathlib import Path, PurePosixPath
from uuid import uuid4


def safe_import_basename(value: str, *, default: str = "import") -> str:
    """Return a portable filename component suitable for an import destination."""
    name = PurePosixPath(str(value).replace("\\", "/").replace("\x00", "")).name
    return name if name not in {"", ".", ".."} else default


def safe_import_destination(directory: Path, filename: str) -> Path:
    """Build a destination that cannot escape *directory*, including through a symlink."""
    directory.mkdir(parents=True, exist_ok=True)
    resolved_directory = directory.resolve()
    destination = directory / safe_import_basename(filename)
    if not destination.resolve(strict=False).is_relative_to(resolved_directory):
        raise ValueError("Import destination must remain within its import directory")
    return destination


def staged_import_destinations(directory: Path, filename: str) -> tuple[Path, Path]:
    """Return final and deterministic partial paths for a crash-safe staged upload."""
    destination = safe_import_destination(directory, filename)
    digest = sha256(destination.name.encode("utf-8")).hexdigest()[:16]
    partial = safe_import_destination(directory, f".graphmind-{digest}.staging")
    if partial == destination:
        partial = safe_import_destination(directory, f".{digest}.graphmind-staging")
    return destination, partial


def import_attempt_id(lease_token: str | None) -> str:
    token = lease_token or uuid4().hex
    return sha256(token.encode("utf-8")).hexdigest()[:20]


def url_import_filename(title: str, content_hash: str, extension: str) -> str:
    safe_title = "".join(
        char if char.isalnum() or char in {"-", "_"} else "-" for char in title.lower()
    ).strip("-")
    safe_title = re.sub(r"-{2,}", "-", safe_title)[:80] or "url-source"
    return f"{safe_title}-{content_hash[:12]}{extension}"
