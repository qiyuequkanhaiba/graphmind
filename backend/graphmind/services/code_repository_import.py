from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from graphmind.services.document_import import (
    CODE_EXTENSIONS,
    DOCUMENT_EXTENSIONS,
    LOG_EXTENSIONS,
    ParsedDocument,
    parse_document_file,
)

REPOSITORY_ARCHIVE_EXTENSIONS = {".zip"}
REPOSITORY_DOCUMENT_EXTENSIONS = {
    *CODE_EXTENSIONS,
    *DOCUMENT_EXTENSIONS,
    *LOG_EXTENSIONS,
    ".json",
}
IGNORED_REPOSITORY_PARTS = {
    ".git",
    ".hg",
    ".svn",
    ".venv",
    "__macosx",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
}
MAX_REPOSITORY_FILE_BYTES = 512 * 1024
MAX_REPOSITORY_ARCHIVE_ENTRIES = 10_000
MAX_REPOSITORY_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_REPOSITORY_COMPRESSION_RATIO = 100.0


@dataclass(frozen=True)
class CodeRepositoryArchiveResult:
    documents: list[ParsedDocument]
    ignored_file_count: int


@dataclass(frozen=True)
class _ArchiveEntry:
    archive_name: str
    path: PurePosixPath
    file_size: int


def parse_code_repository_archive(
    path: str | Path,
    display_name: str | None = None,
) -> list[ParsedDocument]:
    return parse_code_repository_archive_result(path, display_name).documents


def parse_code_repository_archive_result(
    path: str | Path,
    display_name: str | None = None,
) -> CodeRepositoryArchiveResult:
    archive_path = Path(path)
    with ZipFile(archive_path) as archive:
        _validate_repository_archive(archive)
        entries, unsafe_count = _safe_archive_entries(archive)
        common_root = _common_root(entries)
        parsed_documents: list[ParsedDocument] = []
        ignored_file_count = unsafe_count
        with TemporaryDirectory(prefix="graphmind_repo_import_") as temp_dir:
            temp_root = Path(temp_dir)
            for entry in sorted(
                entries,
                key=lambda candidate: _relative_path(candidate, common_root),
            ):
                relative_path = _relative_path(entry, common_root)
                if _is_ignored_repository_path(relative_path):
                    ignored_file_count += 1
                    continue
                if relative_path.suffix.lower() not in REPOSITORY_DOCUMENT_EXTENSIONS:
                    ignored_file_count += 1
                    continue
                if entry.file_size > MAX_REPOSITORY_FILE_BYTES:
                    ignored_file_count += 1
                    continue

                with archive.open(entry.archive_name) as archived_file:
                    payload = archived_file.read(MAX_REPOSITORY_FILE_BYTES + 1)
                if len(payload) > MAX_REPOSITORY_FILE_BYTES:
                    ignored_file_count += 1
                    continue
                if _looks_binary(relative_path, payload):
                    ignored_file_count += 1
                    continue

                extracted_path = temp_root / relative_path
                extracted_path.parent.mkdir(parents=True, exist_ok=True)
                extracted_path.write_bytes(payload)
                parsed = parse_document_file(extracted_path, relative_path.as_posix())
                parsed_documents.append(
                    ParsedDocument(
                        title=relative_path.as_posix(),
                        document_type=parsed.document_type,
                        source_ref=relative_path.as_posix(),
                        chunks=parsed.chunks,
                        entities=parsed.entities,
                        relationships=parsed.relationships,
                        metadata={
                            **parsed.metadata,
                            "repository_archive": Path(display_name).name
                            if display_name
                            else archive_path.name,
                            "repository_path": relative_path.as_posix(),
                            "parser": parsed.metadata.get("parser", parsed.document_type),
                        },
                    )
                )

    return CodeRepositoryArchiveResult(
        documents=parsed_documents,
        ignored_file_count=ignored_file_count,
    )


def is_repository_archive_path(path: str | Path) -> bool:
    return Path(path).suffix.lower() in REPOSITORY_ARCHIVE_EXTENSIONS


def _validate_repository_archive(archive: ZipFile) -> None:
    entries = archive.infolist()
    if len(entries) > MAX_REPOSITORY_ARCHIVE_ENTRIES:
        raise ValueError("Repository archive contains too many entries")

    total_uncompressed_bytes = sum(info.file_size for info in entries if not info.is_dir())
    if total_uncompressed_bytes > MAX_REPOSITORY_TOTAL_UNCOMPRESSED_BYTES:
        raise ValueError("Repository archive exceeds the total uncompressed size limit")

    for info in entries:
        if info.is_dir() or info.file_size == 0:
            continue
        if info.compress_size == 0:
            raise ValueError("Repository archive entry exceeds the compression ratio limit")
        if info.file_size / info.compress_size > MAX_REPOSITORY_COMPRESSION_RATIO:
            raise ValueError("Repository archive entry exceeds the compression ratio limit")


def _safe_archive_entries(archive: ZipFile) -> tuple[list[_ArchiveEntry], int]:
    entries: list[_ArchiveEntry] = []
    ignored_count = 0
    for info in archive.infolist():
        if info.is_dir():
            continue
        normalized_name = info.filename.replace("\\", "/")
        candidate = PurePosixPath(normalized_name)
        if candidate.is_absolute() or ".." in candidate.parts or not candidate.name:
            ignored_count += 1
            continue
        entries.append(
            _ArchiveEntry(
                archive_name=info.filename,
                path=candidate,
                file_size=info.file_size,
            )
        )
    return entries, ignored_count


def _common_root(entries: list[_ArchiveEntry]) -> str | None:
    first_parts = {
        entry.path.parts[0]
        for entry in entries
        if len(entry.path.parts) > 1 and entry.path.parts[0]
    }
    if len(first_parts) != 1:
        return None
    root = next(iter(first_parts))
    if "." in root or root.casefold() in IGNORED_REPOSITORY_PARTS:
        return None
    if all(len(entry.path.parts) > 1 and entry.path.parts[0] == root for entry in entries):
        return root
    return None


def _relative_path(entry: _ArchiveEntry, common_root: str | None) -> PurePosixPath:
    if common_root is not None and entry.path.parts and entry.path.parts[0] == common_root:
        return PurePosixPath(*entry.path.parts[1:])
    return entry.path


def _is_ignored_repository_path(path: PurePosixPath) -> bool:
    return any(part.casefold() in IGNORED_REPOSITORY_PARTS for part in path.parts)


def _looks_binary(path: PurePosixPath, payload: bytes) -> bool:
    if path.suffix.lower() in {".docx", ".pdf"}:
        return False
    if b"\x00" in payload:
        return True
    try:
        payload.decode("utf-8")
    except UnicodeDecodeError:
        return True
    return False
