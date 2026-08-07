from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RelationshipQuality:
    quality_label: str
    review_priority: str
    quality_reasons: list[str]


def assess_relationship_quality(
    relationship_type: str,
    confidence: float,
    evidence_payload: dict[str, Any] | None,
    decision_status: str = "pending",
) -> RelationshipQuality:
    payload = evidence_payload or {}
    reviewed_quality = payload.get("review_evidence_quality")
    if reviewed_quality in {"high", "medium", "low"}:
        quality_label = str(reviewed_quality)
        reasons = [f"human_review:{quality_label}"]
    else:
        quality_label = _quality_from_confidence(confidence)
        reasons = [f"confidence:{quality_label}"]

    source_match_ratio = _number_payload(payload, "source_match_ratio")
    matched_row_count = _number_payload(payload, "matched_row_count")
    source_non_null_count = _number_payload(payload, "source_non_null_count")
    field_type_compatible = payload.get("field_type_compatible")
    relationship_strength = payload.get("relationship_strength")
    source_kind = payload.get("source_kind")
    source_refs = _string_list_payload(payload, "source_refs")
    evidence_refs = _string_list_payload(payload, "evidence_refs")
    evidence_ref_count = len(evidence_refs or source_refs)
    source_count = len(_source_roots(source_refs or evidence_refs))

    if source_match_ratio is not None and source_match_ratio >= 0.9:
        reasons.append("high_source_match")
    if (
        matched_row_count is not None
        and source_non_null_count is not None
        and source_non_null_count > 0
        and matched_row_count / source_non_null_count >= 0.9
    ):
        reasons.append("high_row_coverage")
    if field_type_compatible is True:
        reasons.append("compatible_field_types")
    if relationship_strength in {"strong", "likely", "possible"}:
        reasons.append(f"strength:{relationship_strength}")
    if source_kind in {"extracted_relationship", "document", "code", "log"}:
        reasons.append(f"source:{source_kind}")
    if source_count >= 2:
        reasons.append("evidence:multi_source")
    if evidence_ref_count >= 2:
        reasons.append("evidence:multiple_refs")

    if reviewed_quality not in {"high", "medium", "low"} and _has_strong_evidence(
        confidence=confidence,
        source_match_ratio=source_match_ratio,
        field_type_compatible=field_type_compatible,
        relationship_strength=relationship_strength,
    ):
        quality_label = "high"
        reasons[0] = "confidence:high"
    elif reviewed_quality not in {"high", "medium", "low"} and _has_strong_multisource_evidence(
        confidence=confidence,
        source_kind=source_kind,
        evidence_ref_count=evidence_ref_count,
        source_count=source_count,
    ):
        quality_label = "high"
        reasons[0] = "confidence:high"

    review_priority = _review_priority(
        relationship_type=relationship_type,
        quality_label=quality_label,
        confidence=confidence,
        decision_status=decision_status,
    )
    return RelationshipQuality(
        quality_label=quality_label,
        review_priority=review_priority,
        quality_reasons=reasons,
    )


def _quality_from_confidence(confidence: float) -> str:
    if confidence >= 0.9:
        return "high"
    if confidence >= 0.75:
        return "medium"
    return "low"


def _has_strong_evidence(
    confidence: float,
    source_match_ratio: float | None,
    field_type_compatible: object,
    relationship_strength: object,
) -> bool:
    return (
        confidence >= 0.85
        and source_match_ratio is not None
        and source_match_ratio >= 0.9
        and field_type_compatible is True
        and relationship_strength in {"strong", "likely"}
    )


def _has_strong_multisource_evidence(
    confidence: float,
    source_kind: object,
    evidence_ref_count: int,
    source_count: int,
) -> bool:
    return (
        source_kind == "extracted_relationship"
        and confidence >= 0.8
        and evidence_ref_count >= 2
        and source_count >= 2
    )


def _review_priority(
    relationship_type: str,
    quality_label: str,
    confidence: float,
    decision_status: str,
) -> str:
    if decision_status != "pending":
        return "low"
    if quality_label == "low":
        return "high"
    if relationship_type in {"foreign_key", "same_entity", "documented_mapping"}:
        return "high" if confidence >= 0.85 else "medium"
    if quality_label == "high":
        return "medium"
    return "low"


def _number_payload(payload: dict[str, Any], key: str) -> float | None:
    value = payload.get(key)
    if isinstance(value, int | float):
        return float(value)
    return None


def _string_list_payload(payload: dict[str, Any], key: str) -> list[str]:
    value = payload.get(key)
    if not isinstance(value, list):
        return []
    return [entry for entry in value if isinstance(entry, str) and entry.strip()]


def _source_roots(refs: list[str]) -> set[str]:
    roots = set()
    for ref in refs:
        root = ref.split("#", maxsplit=1)[0].split(":line:", maxsplit=1)[0]
        if root:
            roots.add(root)
    return roots
