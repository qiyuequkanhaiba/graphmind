from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from zipfile import ZipFile


@dataclass(frozen=True)
class ParsedChunk:
    heading: str | None
    content: str
    source_ref: str
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedEntity:
    canonical_name: str
    entity_type: str
    aliases: list[str]
    confidence: float
    source_refs: list[str]
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedRelationship:
    source_name: str
    source_type: str
    target_name: str
    target_type: str
    relationship_type: str
    confidence: float
    status: str
    evidence_summary: str
    evidence_payload: dict[str, object]
    source_refs: list[str]


@dataclass(frozen=True)
class ParsedDocument:
    title: str
    document_type: str
    source_ref: str
    chunks: list[ParsedChunk]
    entities: list[ParsedEntity]
    relationships: list[ParsedRelationship]
    metadata: dict[str, object] = field(default_factory=dict)


CODE_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".java",
    ".go",
    ".rs",
    ".sql",
    ".sh",
    ".yaml",
    ".yml",
    ".toml",
}
DOCUMENT_EXTENSIONS = {".md", ".markdown", ".txt", ".docx", ".pdf"}
LOG_EXTENSIONS = {".log"}
MAX_TEXT_CHUNK_TOKENS = 240
MAX_DOCX_ARCHIVE_ENTRIES = 2_000
MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
MAX_DOCX_COMPRESSION_RATIO = 100.0
MAX_DOCX_DOCUMENT_XML_BYTES = 16 * 1024 * 1024


def parse_document_file(path: str | Path, display_name: str | None = None) -> ParsedDocument:
    source_path = Path(path)
    title = display_name.replace("\\", "/") if display_name else source_path.name
    extension = source_path.suffix.lower()
    if extension in {".md", ".markdown"}:
        return _parse_markdown(source_path, title)
    if extension == ".json":
        return _parse_json_document(source_path, title)
    if extension in LOG_EXTENSIONS:
        return _parse_log(source_path, title)
    if extension in CODE_EXTENSIONS:
        return _parse_code(source_path, title)
    if extension == ".docx":
        return _parse_docx(source_path, title)
    if extension == ".pdf":
        return _parse_pdf_text(source_path, title)
    return _parse_plain_text(source_path, title, "document")


def source_kind_for_path(path: str | Path) -> str:
    extension = Path(path).suffix.lower()
    if extension in CODE_EXTENSIONS:
        return "code"
    if extension in LOG_EXTENSIONS:
        return "log"
    if extension == ".json":
        return "json"
    return "document"


def is_document_like_path(path: str | Path) -> bool:
    extension = Path(path).suffix.lower()
    return (
        extension in DOCUMENT_EXTENSIONS
        or extension in LOG_EXTENSIONS
        or extension in CODE_EXTENSIONS
    )


def _parse_markdown(path: Path, title: str) -> ParsedDocument:
    text = path.read_text(encoding="utf-8")
    chunks = _markdown_chunks(text, title)
    entities, relationships = _entities_and_relationships(title, "file", chunks)
    return ParsedDocument(
        title=title,
        document_type="markdown",
        source_ref=title,
        chunks=chunks,
        entities=entities,
        relationships=relationships,
        metadata={"parser": "markdown"},
    )


def _markdown_chunks(text: str, title: str) -> list[ParsedChunk]:
    chunks: list[ParsedChunk] = []
    current_heading: str | None = None
    current_lines: list[str] = []
    heading_index = 0

    def flush() -> None:
        nonlocal heading_index
        content = "\n".join(line for line in current_lines if line.strip()).strip()
        if not content:
            return
        heading = current_heading or title
        section_chunks = _text_chunks(
            title=title,
            heading=heading,
            text=content,
            source_ref_base=f"{title}#{_slug(heading)}",
            metadata={
                "heading_level": 1 if current_heading else 0,
                "section_index": heading_index,
            },
        )
        chunks.extend(
            _renumber_chunk(
                chunk,
                chunk_index=heading_index + offset,
                metadata={**chunk.metadata, "section_chunk_index": offset},
            )
            for offset, chunk in enumerate(section_chunks)
        )
        heading_index += len(section_chunks)

    for line in text.splitlines():
        heading_match = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading_match:
            flush()
            current_heading = heading_match.group(2).strip()
            current_lines = []
            continue
        current_lines.append(line)
    flush()
    if not chunks and text.strip():
        chunks.extend(
            _text_chunks(
                title=title,
                heading=title,
                text=text,
                source_ref_base=title,
                metadata={},
            )
        )
    return chunks


def _parse_json_document(path: Path, title: str) -> ParsedDocument:
    payload = json.loads(path.read_text(encoding="utf-8"))
    sections = _json_sections(payload)
    chunks = [
        ParsedChunk(
            heading=heading,
            content="\n".join(lines),
            source_ref=f"{title}#{_slug(heading)}",
            metadata={"json_path": heading},
        )
        for heading, lines in sections
        if lines
    ]
    if not chunks:
        chunks = [
            ParsedChunk(
                heading=title,
                content=json.dumps(payload, ensure_ascii=False),
                source_ref=title,
                metadata={"json_path": "$"},
            )
        ]
    entities, relationships = _entities_and_relationships(title, "file", chunks)
    return ParsedDocument(
        title=title,
        document_type="json_document",
        source_ref=title,
        chunks=chunks,
        entities=entities,
        relationships=relationships,
        metadata={"parser": "json_document"},
    )


def _json_sections(value: object, prefix: str = "") -> list[tuple[str, list[str]]]:
    if isinstance(value, dict):
        sections = []
        scalar_lines = []
        for key, child in value.items():
            next_prefix = f"{prefix}.{key}" if prefix else key
            if isinstance(child, dict):
                sections.extend(_json_sections(child, next_prefix))
            elif isinstance(child, list):
                scalar_lines.append(f"{next_prefix}: {json.dumps(child, ensure_ascii=False)}")
            else:
                scalar_lines.append(f"{next_prefix}: {child}")
        if scalar_lines:
            heading = prefix or "root"
            sections.insert(0, (heading, scalar_lines))
        return sections
    return [(prefix or "root", [f"{prefix or 'value'}: {value}"])]


def _parse_log(path: Path, title: str) -> ParsedDocument:
    chunks: list[ParsedChunk] = []
    for index, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
        if not line.strip():
            continue
        chunks.append(
            ParsedChunk(
                heading=f"event {index + 1}",
                content=line.strip(),
                source_ref=f"{title}:line:{index + 1}",
                metadata=_log_metadata(line),
            )
        )
    entities, relationships = _entities_and_relationships(title, "file", chunks)
    relationships.extend(_trace_relationships(chunks))
    return ParsedDocument(
        title=title,
        document_type="log",
        source_ref=title,
        chunks=chunks,
        entities=entities,
        relationships=relationships,
        metadata={"parser": "log"},
    )


def _parse_code(path: Path, title: str) -> ParsedDocument:
    text = path.read_text(encoding="utf-8")
    chunk = ParsedChunk(
        heading=title,
        content=text,
        source_ref=title,
        metadata={"language": path.suffix.lower().lstrip(".")},
    )
    entities, relationships = _entities_and_relationships(title, "file", [chunk])
    entities.append(
        ParsedEntity(
            canonical_name=title,
            entity_type="file",
            aliases=[],
            confidence=1.0,
            source_refs=[title],
            metadata={"rule": "code_file"},
        )
    )
    for dependency in _code_dependencies(text):
        entities.append(
            ParsedEntity(
                canonical_name=dependency,
                entity_type="module",
                aliases=[],
                confidence=0.95,
                source_refs=[title],
                metadata={"rule": "code_import"},
            )
        )
        relationships.append(
            ParsedRelationship(
                source_name=title,
                source_type="file",
                target_name=dependency,
                target_type="module",
                relationship_type="depends_on",
                confidence=0.95,
                status="auto_trusted",
                evidence_summary=f"{title} imports {dependency}.",
                evidence_payload={"rule": "code_import"},
                source_refs=[title],
            )
        )
    for symbol_name, symbol_type in _code_symbols(text, title):
        entities.append(
            ParsedEntity(
                canonical_name=symbol_name,
                entity_type=symbol_type,
                aliases=[symbol_name.rsplit("::", maxsplit=1)[-1]],
                confidence=0.9,
                source_refs=[title],
                metadata={"rule": "code_symbol"},
            )
        )
        relationships.append(
            ParsedRelationship(
                source_name=title,
                source_type="file",
                target_name=symbol_name,
                target_type=symbol_type,
                relationship_type="defines",
                confidence=0.9,
                status="auto_trusted",
                evidence_summary=f"{title} defines {symbol_name}.",
                evidence_payload={"rule": "code_symbol"},
                source_refs=[title],
            )
        )
    return ParsedDocument(
        title=title,
        document_type="code",
        source_ref=title,
        chunks=[chunk],
        entities=_dedupe_entities(entities),
        relationships=_dedupe_relationships(relationships),
        metadata={"parser": "code"},
    )


def _parse_docx(path: Path, title: str) -> ParsedDocument:
    with ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_DOCX_ARCHIVE_ENTRIES:
            raise ValueError("DOCX archive contains too many entries")
        total_uncompressed_bytes = sum(info.file_size for info in entries if not info.is_dir())
        if total_uncompressed_bytes > MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES:
            raise ValueError("DOCX archive exceeds the total uncompressed size limit")
        for info in entries:
            if info.is_dir() or info.file_size == 0:
                continue
            if info.compress_size == 0:
                raise ValueError("DOCX archive entry exceeds the compression ratio limit")
            if info.file_size / info.compress_size > MAX_DOCX_COMPRESSION_RATIO:
                raise ValueError("DOCX archive entry exceeds the compression ratio limit")

        with archive.open("word/document.xml") as document_xml:
            xml_payload = document_xml.read(MAX_DOCX_DOCUMENT_XML_BYTES + 1)
        if len(xml_payload) > MAX_DOCX_DOCUMENT_XML_BYTES:
            raise ValueError("DOCX document XML exceeds the uncompressed size limit")
        xml_text = xml_payload.decode("utf-8")
    root = ET.fromstring(xml_text)
    text_parts = [element.text or "" for element in root.iter() if element.tag.endswith("}t")]
    text = " ".join(part.strip() for part in text_parts if part.strip())
    return _parsed_text_document(title, "word", text, {"parser": "docx"})


def _parse_pdf_text(path: Path, title: str) -> ParsedDocument:
    extracted = _extract_pdf_text(path.read_bytes())
    if not extracted:
        raise ValueError("PDF text extraction failed: no embedded text found")
    return _parsed_text_document(title, "pdf", extracted, {"parser": "pdf_text"})


def _extract_pdf_text(raw: bytes) -> str:
    raw_text = raw.decode("latin-1", errors="ignore")
    pieces: list[str] = []
    for stream in _pdf_stream_bodies(raw_text):
        pieces.extend(_pdf_text_operands(stream))
    text = "".join(pieces)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def _pdf_stream_bodies(raw_text: str) -> list[str]:
    bodies = [
        match.group(1).strip("\r\n")
        for match in re.finditer(r"stream\r?\n?(.*?)\r?\n?endstream", raw_text, re.DOTALL)
    ]
    return bodies or [raw_text]


def _pdf_text_operands(stream: str) -> list[str]:
    pieces: list[str] = []
    stack: list[tuple[str, str]] = []
    for kind, value in _pdf_tokens(stream):
        if kind == "atom" and value in {"Td", "TD", "T*"}:
            _append_pdf_line_break(pieces)
            stack.clear()
            continue
        if kind == "atom" and value in {"Tj", "TJ", "'", '"'}:
            if value in {"'", '"'}:
                _append_pdf_line_break(pieces)
            _append_pdf_text_piece(pieces, _last_pdf_text_operand(stack))
            stack.clear()
            continue
        if kind == "atom" and _looks_like_pdf_operator(value):
            stack.clear()
            continue
        stack.append((kind, value))
    return pieces


def _pdf_tokens(stream: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
    index = 0
    while index < len(stream):
        char = stream[index]
        if char.isspace():
            index += 1
            continue
        if char == "%":
            index = _skip_pdf_comment(stream, index)
            continue
        if char == "(":
            value, index = _read_pdf_literal(stream, index)
            tokens.append(("text", value))
            continue
        if char == "[":
            value, index = _read_pdf_array_text(stream, index)
            tokens.append(("array", value))
            continue
        if char == "<":
            if index + 1 < len(stream) and stream[index + 1] == "<":
                tokens.append(("atom", "<<"))
                index += 2
                continue
            value, index = _read_pdf_hex(stream, index)
            tokens.append(("text", value))
            continue
        if char == ">" and index + 1 < len(stream) and stream[index + 1] == ">":
            tokens.append(("atom", ">>"))
            index += 2
            continue
        value, index = _read_pdf_atom(stream, index)
        if value:
            tokens.append(("atom", value))
    return tokens


def _read_pdf_array_text(stream: str, index: int) -> tuple[str, int]:
    parts: list[str] = []
    index += 1
    while index < len(stream):
        char = stream[index]
        if char.isspace():
            index += 1
            continue
        if char == "%":
            index = _skip_pdf_comment(stream, index)
            continue
        if char == "]":
            return "".join(parts), index + 1
        if char == "(":
            value, index = _read_pdf_literal(stream, index)
            parts.append(value)
            continue
        if char == "[":
            value, index = _read_pdf_array_text(stream, index)
            parts.append(value)
            continue
        if char == "<":
            if index + 1 < len(stream) and stream[index + 1] == "<":
                index += 2
                continue
            value, index = _read_pdf_hex(stream, index)
            parts.append(value)
            continue
        _value, index = _read_pdf_atom(stream, index)
    return "".join(parts), index


def _read_pdf_literal(stream: str, index: int) -> tuple[str, int]:
    index += 1
    depth = 1
    chars: list[str] = []
    while index < len(stream):
        char = stream[index]
        if char == "\\":
            chars.append(char)
            if index + 1 < len(stream):
                index += 1
                chars.append(stream[index])
                if stream[index] == "\r" and index + 1 < len(stream) and stream[index + 1] == "\n":
                    index += 1
                    chars.append(stream[index])
            index += 1
            continue
        if char == "(":
            depth += 1
            chars.append(char)
            index += 1
            continue
        if char == ")":
            depth -= 1
            if depth == 0:
                return _decode_pdf_literal("".join(chars)), index + 1
            chars.append(char)
            index += 1
            continue
        chars.append(char)
        index += 1
    return _decode_pdf_literal("".join(chars)), index


def _read_pdf_hex(stream: str, index: int) -> tuple[str, int]:
    end_index = stream.find(">", index + 1)
    if end_index == -1:
        return "", len(stream)
    return _decode_pdf_hex(stream[index + 1 : end_index]), end_index + 1


def _read_pdf_atom(stream: str, index: int) -> tuple[str, int]:
    start = index
    while index < len(stream):
        char = stream[index]
        if char.isspace() or char in "()<>[]{}%":
            break
        index += 1
    if index == start:
        return stream[index], index + 1
    return stream[start:index], index


def _skip_pdf_comment(stream: str, index: int) -> int:
    while index < len(stream) and stream[index] not in "\r\n":
        index += 1
    return index


def _decode_pdf_literal(value: str) -> str:
    result: list[str] = []
    index = 0
    escape_map = {
        "n": "\n",
        "r": "\r",
        "t": "\t",
        "b": "\b",
        "f": "\f",
        "(": "(",
        ")": ")",
        "\\": "\\",
    }
    while index < len(value):
        char = value[index]
        if char != "\\":
            result.append(char)
            index += 1
            continue
        index += 1
        if index >= len(value):
            break
        escaped = value[index]
        if escaped in "\r\n":
            if escaped == "\r" and index + 1 < len(value) and value[index + 1] == "\n":
                index += 2
            else:
                index += 1
            continue
        if escaped in "01234567":
            octal_start = index
            while index < len(value) and index - octal_start < 3 and value[index] in "01234567":
                index += 1
            result.append(chr(int(value[octal_start:index], 8) & 0xFF))
            continue
        result.append(escape_map.get(escaped, escaped))
        index += 1
    return "".join(result)


def _decode_pdf_hex(value: str) -> str:
    cleaned = re.sub(r"\s+", "", value)
    if not cleaned:
        return ""
    if len(cleaned) % 2:
        cleaned = f"{cleaned}0"
    try:
        decoded = bytes.fromhex(cleaned)
    except ValueError:
        return ""
    try:
        return decoded.decode("utf-8")
    except UnicodeDecodeError:
        return decoded.decode("latin-1", errors="ignore")


def _append_pdf_text_piece(pieces: list[str], text: str) -> None:
    text = text.strip()
    if not text:
        return
    if pieces and pieces[-1] != "\n":
        pieces.append(" ")
    pieces.append(text)


def _append_pdf_line_break(pieces: list[str]) -> None:
    if pieces and pieces[-1] != "\n":
        pieces.append("\n")


def _last_pdf_text_operand(stack: list[tuple[str, str]]) -> str:
    for kind, value in reversed(stack):
        if kind in {"array", "text"} and value.strip():
            return value
    return ""


def _looks_like_pdf_operator(value: str) -> bool:
    if not value or value.startswith("/") or value in {"<<", ">>"}:
        return False
    if re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", value):
        return False
    return bool(re.fullmatch(r"[A-Za-z*'\".]+", value))


def _parse_plain_text(path: Path, title: str, document_type: str) -> ParsedDocument:
    text = path.read_text(encoding="utf-8")
    return _parsed_text_document(title, document_type, text, {"parser": "plain_text"})


def _parsed_text_document(
    title: str, document_type: str, text: str, metadata: dict[str, object]
) -> ParsedDocument:
    chunks = _text_chunks(
        title=title,
        heading=title,
        text=text,
        source_ref_base=title,
        metadata={},
    )
    entities, relationships = _entities_and_relationships(title, "file", chunks)
    return ParsedDocument(
        title=title,
        document_type=document_type,
        source_ref=title,
        chunks=chunks,
        entities=entities,
        relationships=relationships,
        metadata=metadata,
    )


def _text_chunks(
    title: str,
    heading: str | None,
    text: str,
    source_ref_base: str,
    metadata: dict[str, object],
) -> list[ParsedChunk]:
    stripped = text.strip()
    if not stripped:
        return []
    blocks = _split_text_blocks(stripped)
    if len(stripped.split()) <= MAX_TEXT_CHUNK_TOKENS:
        return [
            ParsedChunk(
                heading=heading or title,
                content=stripped,
                source_ref=source_ref_base,
                metadata={
                    **metadata,
                    "chunk_index": 0,
                    "chunk_count": 1,
                    "token_start": 0,
                    "token_end": len(stripped.split()),
                },
            )
        ]

    chunks: list[ParsedChunk] = []
    current_blocks: list[str] = []
    current_token_count = 0
    token_cursor = 0

    def flush() -> None:
        nonlocal current_blocks, current_token_count, token_cursor
        if not current_blocks:
            return
        content = "\n\n".join(current_blocks).strip()
        chunks.append(
            ParsedChunk(
                heading=heading or title,
                content=content,
                source_ref="",
                metadata={
                    **metadata,
                    "token_start": token_cursor,
                    "token_end": token_cursor + current_token_count,
                },
            )
        )
        token_cursor += current_token_count
        current_blocks = []
        current_token_count = 0

    for block in blocks:
        block_tokens = block.split()
        if not block_tokens:
            continue
        if len(block_tokens) > MAX_TEXT_CHUNK_TOKENS:
            flush()
            for start in range(0, len(block_tokens), MAX_TEXT_CHUNK_TOKENS):
                token_slice = block_tokens[start : start + MAX_TEXT_CHUNK_TOKENS]
                content = " ".join(token_slice)
                chunks.append(
                    ParsedChunk(
                        heading=heading or title,
                        content=content,
                        source_ref="",
                        metadata={
                            **metadata,
                            "token_start": token_cursor,
                            "token_end": token_cursor + len(token_slice),
                        },
                    )
                )
                token_cursor += len(token_slice)
            continue
        if current_token_count and current_token_count + len(block_tokens) > MAX_TEXT_CHUNK_TOKENS:
            flush()
        current_blocks.append(block)
        current_token_count += len(block_tokens)
    flush()

    total = len(chunks)
    return [
        ParsedChunk(
            heading=chunk.heading,
            content=chunk.content,
            source_ref=_chunk_source_ref(source_ref_base, index, total),
            metadata={
                **chunk.metadata,
                "chunk_index": index,
                "chunk_count": total,
            },
        )
        for index, chunk in enumerate(chunks)
    ]


def _split_text_blocks(text: str) -> list[str]:
    blocks = [block.strip() for block in re.split(r"\n\s*\n+", text) if block.strip()]
    if blocks:
        return blocks
    return [text.strip()] if text.strip() else []


def _chunk_source_ref(source_ref_base: str, index: int, total: int) -> str:
    if total <= 1:
        return source_ref_base
    return f"{source_ref_base}#chunk-{index + 1}"


def _renumber_chunk(
    chunk: ParsedChunk,
    chunk_index: int,
    metadata: dict[str, object] | None = None,
) -> ParsedChunk:
    return ParsedChunk(
        heading=chunk.heading,
        content=chunk.content,
        source_ref=chunk.source_ref,
        metadata={**chunk.metadata, **(metadata or {}), "chunk_index": chunk_index},
    )


def _entities_and_relationships(
    source_name: str, source_type: str, chunks: list[ParsedChunk]
) -> tuple[list[ParsedEntity], list[ParsedRelationship]]:
    entities = [
        ParsedEntity(
            canonical_name=source_name,
            entity_type=source_type,
            aliases=[],
            confidence=1.0,
            source_refs=[source_name],
            metadata={"rule": "source"},
        )
    ]
    relationships: list[ParsedRelationship] = []
    for chunk in chunks:
        chunk_entities = _extract_entities(chunk.content)
        for name, entity_type, rule in chunk_entities:
            entities.append(
                ParsedEntity(
                    canonical_name=name,
                    entity_type=entity_type,
                    aliases=[],
                    confidence=0.9,
                    source_refs=[chunk.source_ref],
                    metadata={"rule": rule},
                )
            )
            relationship_type = "references" if rule in {"markdown_link", "url"} else "mentions"
            relationships.append(
                ParsedRelationship(
                    source_name=source_name,
                    source_type=source_type,
                    target_name=name,
                    target_type=entity_type,
                    relationship_type=relationship_type,
                    confidence=0.85,
                    status="suggested",
                    evidence_summary=f"{source_name} {relationship_type} {name}.",
                    evidence_payload={"rule": rule, "chunk_ref": chunk.source_ref},
                    source_refs=[chunk.source_ref],
                )
            )
        relationships.extend(_mapping_relationships(chunk))
        relationships.extend(_cooccurrence_relationships(chunk, chunk_entities))
    return _dedupe_entities(entities), _dedupe_relationships(relationships)


def _mapping_relationships(chunk: ParsedChunk) -> list[ParsedRelationship]:
    relationships: list[ParsedRelationship] = []
    mapping_pattern = re.compile(
        r"\b(?P<source>[A-Z][A-Za-z0-9]*(?:\s+(?:ID|Id|Code|Number|Key)))\s+"
        r"(?:maps?\s+to|maps?\s+onto|corresponds\s+to|aliases?)\s+"
        r"(?P<target>[a-z][A-Za-z0-9]*(?:Id|ID|Code|Number|Key))\b",
        re.IGNORECASE,
    )
    for match in mapping_pattern.finditer(chunk.content):
        source_name = _normalize_mapping_concept(match.group("source"))
        target_name = match.group("target").strip().rstrip(".,;:")
        if not source_name or not target_name or source_name == target_name:
            continue
        relationships.append(
            ParsedRelationship(
                source_name=source_name,
                source_type="concept",
                target_name=target_name,
                target_type="concept",
                relationship_type="maps_to",
                confidence=0.92,
                status="suggested",
                evidence_summary=f"{source_name} maps to {target_name}.",
                evidence_payload={
                    "rule": "field_mapping_phrase",
                    "chunk_ref": chunk.source_ref,
                    "matched_text": match.group(0),
                },
                source_refs=[chunk.source_ref],
            )
        )
    return relationships


def _cooccurrence_relationships(
    chunk: ParsedChunk,
    chunk_entities: list[tuple[str, str, str]],
) -> list[ParsedRelationship]:
    relationships: list[ParsedRelationship] = []
    for sentence_index, sentence in enumerate(_sentences(chunk.content)):
        sentence_entities = [
            (name, entity_type)
            for name, entity_type, _rule in chunk_entities
            if name in sentence
        ]
        sentence_entities = _unique_name_type_tuples(sentence_entities)
        if len(sentence_entities) < 2:
            continue
        for source_index, (source_name, source_type) in enumerate(sentence_entities):
            for target_name, target_type in sentence_entities[source_index + 1 :]:
                if source_name == target_name:
                    continue
                relationships.append(
                    ParsedRelationship(
                        source_name=source_name,
                        source_type=source_type,
                        target_name=target_name,
                        target_type=target_type,
                        relationship_type="co_occurs_with",
                        confidence=0.72,
                        status="suggested",
                        evidence_summary=(
                            f"{source_name} appears with {target_name} in the same sentence."
                        ),
                        evidence_payload={
                            "rule": "sentence_entity_cooccurrence",
                            "chunk_ref": chunk.source_ref,
                            "sentence_index": sentence_index,
                        },
                        source_refs=[chunk.source_ref],
                    )
                )
    return relationships


def _sentences(text: str) -> list[str]:
    return [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", text) if sentence.strip()]


def _normalize_mapping_concept(value: str) -> str:
    words = value.strip().rstrip(".,;:").split()
    return " ".join(word[:1].upper() + word[1:] for word in words)


def _extract_entities(content: str) -> list[tuple[str, str, str]]:
    entities: list[tuple[str, str, str]] = []
    for _label, link in re.findall(r"\[([^\]]+)\]\(([^)]+)\)", content):
        entities.append((link, _entity_type_for_value(link), "markdown_link"))
    for url in re.findall(r"https?://[^\s)]+", content):
        entities.append((url.rstrip(".,;"), "url", "url"))
    for email in re.findall(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", content):
        entities.append((email, "email", "email"))
    for endpoint in re.findall(r"(?<![\w:])/[a-zA-Z0-9_./{}-]+", content):
        entities.append((endpoint.rstrip(".,;"), "endpoint", "api_path"))
    for error_code in re.findall(r"\b(?:ERR|ERROR|HTTP)-?\d+\b", content):
        entities.append((error_code, "error", "error_code"))
    for file_path in re.findall(r"\b[\w.-]+/[\w./-]+\.[a-zA-Z0-9]+\b", content):
        entities.append((file_path.rstrip(".,;"), "file", "file_path"))
    for identifier in re.findall(r"\b[a-z][A-Za-z0-9]*(?:Id|ID|Code|Number|Key)\b", content):
        entities.append((identifier.rstrip(".,;"), "concept", "identifier_name"))
    for identifier in re.findall(
        r"\b[A-Z][A-Za-z0-9]*(?:\s+(?:ID|Id|Code|Number|Key))\b",
        content,
    ):
        entities.append((identifier.rstrip(".,;"), "concept", "identifier_name"))
    return _unique_entity_tuples(entities)


def _code_dependencies(text: str) -> list[str]:
    dependencies = []
    for match in re.finditer(r"^\s*from\s+([\w.]+)\s+import\s+", text, re.MULTILINE):
        dependencies.append(match.group(1))
    for match in re.finditer(r"^\s*import\s+([\w.]+)", text, re.MULTILINE):
        dependencies.append(match.group(1))
    for match in re.finditer(r"require\(['\"]([^'\"]+)['\"]\)", text):
        dependencies.append(match.group(1))
    return _unique_strings(dependencies)


def _code_symbols(text: str, title: str) -> list[tuple[str, str]]:
    symbols: list[tuple[str, str]] = []
    for match in re.finditer(r"^\s*def\s+([A-Za-z_]\w*)\s*\(", text, re.MULTILINE):
        symbols.append((f"{title}::{match.group(1)}", "function"))
    for match in re.finditer(r"^\s*class\s+([A-Za-z_]\w*)\b", text, re.MULTILINE):
        symbols.append((f"{title}::{match.group(1)}", "class"))
    for match in re.finditer(
        r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(",
        text,
        re.MULTILINE,
    ):
        symbols.append((f"{title}::{match.group(1)}", "function"))
    for match in re.finditer(
        r"^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)\b",
        text,
        re.MULTILINE,
    ):
        symbols.append((f"{title}::{match.group(1)}", "class"))
    for match in re.finditer(
        r"^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(",
        text,
        re.MULTILINE,
    ):
        symbols.append((f"{title}::{match.group(1)}", "function"))
    return _unique_symbol_tuples(symbols)


def _log_metadata(line: str) -> dict[str, object]:
    metadata: dict[str, object] = {}
    level_match = re.search(r"\b(ERROR|WARN|WARNING|INFO|DEBUG|TRACE)\b", line, re.IGNORECASE)
    if level_match:
        metadata["level"] = level_match.group(1).upper()
    trace_match = re.search(r"\b(?:trace_id|trace|request_id|request)=([A-Za-z0-9_-]+)", line)
    if trace_match:
        metadata["trace_id"] = trace_match.group(1)
    timestamp_match = re.match(r"^(\d{4}-\d{2}-\d{2}T[^\s]+)", line)
    if timestamp_match:
        metadata["timestamp"] = timestamp_match.group(1)
    return metadata


def _trace_relationships(chunks: list[ParsedChunk]) -> list[ParsedRelationship]:
    by_trace: dict[str, list[ParsedChunk]] = {}
    for chunk in chunks:
        trace_id = chunk.metadata.get("trace_id")
        if isinstance(trace_id, str):
            by_trace.setdefault(trace_id, []).append(chunk)
    relationships: list[ParsedRelationship] = []
    for trace_id, trace_chunks in by_trace.items():
        if len(trace_chunks) < 2:
            continue
        relationships.append(
            ParsedRelationship(
                source_name=trace_chunks[0].source_ref,
                source_type="log_event",
                target_name=trace_chunks[1].source_ref,
                target_type="log_event",
                relationship_type="co_occurs_with",
                confidence=0.9,
                status="auto_trusted",
                evidence_summary=f"Log events share trace id {trace_id}.",
                evidence_payload={"rule": "shared_trace_id", "trace_id": trace_id},
                source_refs=[chunk.source_ref for chunk in trace_chunks],
            )
        )
    return relationships


def _entity_type_for_value(value: str) -> str:
    if value.startswith("http://") or value.startswith("https://"):
        return "url"
    if value.startswith("/"):
        return "endpoint"
    if "/" in value and "." in value:
        return "file"
    return "concept"


def _dedupe_entities(entities: list[ParsedEntity]) -> list[ParsedEntity]:
    deduped: dict[tuple[str, str], ParsedEntity] = {}
    for entity in entities:
        key = (entity.canonical_name, entity.entity_type)
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = entity
            continue
        deduped[key] = ParsedEntity(
            canonical_name=entity.canonical_name,
            entity_type=entity.entity_type,
            aliases=_unique_strings([*existing.aliases, *entity.aliases]),
            confidence=max(existing.confidence, entity.confidence),
            source_refs=_unique_strings([*existing.source_refs, *entity.source_refs]),
            metadata={**existing.metadata, **entity.metadata},
        )
    return list(deduped.values())


def _dedupe_relationships(relationships: list[ParsedRelationship]) -> list[ParsedRelationship]:
    deduped: dict[tuple[str, str, str], ParsedRelationship] = {}
    for relationship in relationships:
        key = (
            relationship.source_name,
            relationship.target_name,
            relationship.relationship_type,
        )
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = relationship
            continue
        deduped[key] = ParsedRelationship(
            source_name=relationship.source_name,
            source_type=relationship.source_type,
            target_name=relationship.target_name,
            target_type=relationship.target_type,
            relationship_type=relationship.relationship_type,
            confidence=max(existing.confidence, relationship.confidence),
            status=relationship.status,
            evidence_summary=relationship.evidence_summary,
            evidence_payload={**existing.evidence_payload, **relationship.evidence_payload},
            source_refs=_unique_strings([*existing.source_refs, *relationship.source_refs]),
        )
    return list(deduped.values())


def _unique_entity_tuples(values: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    seen = set()
    unique = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def _unique_symbol_tuples(values: list[tuple[str, str]]) -> list[tuple[str, str]]:
    seen = set()
    unique = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def _unique_name_type_tuples(values: list[tuple[str, str]]) -> list[tuple[str, str]]:
    seen = set()
    unique = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def _unique_strings(values: list[str]) -> list[str]:
    seen = set()
    unique = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return slug or "section"
