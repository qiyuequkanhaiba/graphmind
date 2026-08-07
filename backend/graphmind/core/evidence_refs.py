from __future__ import annotations

from typing import Any


def normalize_evidence_refs(*values: object) -> list[str]:
    refs: list[str] = []
    for value in values:
        refs.extend(_refs_from_value(value))
    return _unique_refs(refs)


def payload_with_evidence_refs(
    payload: dict[str, Any] | None,
    *values: object,
) -> dict[str, Any]:
    next_payload = dict(payload or {})
    refs = normalize_evidence_refs(
        next_payload.get("evidence_refs"),
        next_payload.get("source_refs"),
        next_payload.get("chunk_ref"),
        *values,
    )
    if refs:
        next_payload["evidence_refs"] = refs
        next_payload.setdefault("source_refs", refs)
    return next_payload


def _refs_from_value(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        cleaned = value.strip()
        return [cleaned] if cleaned else []
    if isinstance(value, (list, tuple, set)):
        refs: list[str] = []
        for item in value:
            refs.extend(_refs_from_value(item))
        return refs
    return []


def _unique_refs(refs: list[str]) -> list[str]:
    seen = set()
    unique: list[str] = []
    for ref in refs:
        if ref in seen:
            continue
        seen.add(ref)
        unique.append(ref)
    return unique
