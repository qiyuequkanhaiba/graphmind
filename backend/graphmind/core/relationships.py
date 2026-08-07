from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

import pandas as pd

from graphmind.core.profiling import FieldProfileData, SheetProfileData


@dataclass(frozen=True)
class RelationshipSuggestionData:
    source_sheet: str
    source_field: str
    target_sheet: str | None
    target_field: str | None
    relationship_type: str
    confidence: float
    evidence_summary: str
    evidence_payload: dict[str, Any]


def _clean_values(series: pd.Series) -> set[str]:
    values = set()
    for value in series.dropna().tolist():
        cleaned = str(value).strip()
        if cleaned:
            values.add(cleaned)
    return values


def _field_name_similarity(left_name: str, right_name: str) -> float:
    if left_name == right_name:
        return 1.0

    left_tokens = {token for token in left_name.split("_") if token}
    right_tokens = {token for token in right_name.split("_") if token}
    if not left_tokens or not right_tokens:
        return round(SequenceMatcher(None, left_name, right_name).ratio(), 3)

    token_overlap = len(left_tokens & right_tokens)
    jaccard = token_overlap / len(left_tokens | right_tokens)
    containment = token_overlap / min(len(left_tokens), len(right_tokens))
    sequence = SequenceMatcher(None, left_name, right_name).ratio()
    return round(max(jaccard, containment * 0.85, sequence), 3)


def _field_type_compatible(left_type: str, right_type: str) -> bool:
    if left_type == right_type:
        return True
    string_like = {"identifier", "text", "category"}
    if left_type in string_like and right_type in string_like:
        return True
    return left_type == "number" and right_type == "number"


def _null_ratio(series: pd.Series) -> float:
    if series.empty:
        return 0.0
    return float(series.isna().sum() / len(series))


def _relationship_strength(confidence: float) -> str:
    if confidence >= 0.9:
        return "strong"
    if confidence >= 0.8:
        return "likely"
    return "possible"


def _field_pair_key(
    left_profile: SheetProfileData,
    left_field: FieldProfileData,
    right_profile: SheetProfileData,
    right_field: FieldProfileData,
) -> tuple[tuple[str, str], tuple[str, str]]:
    return tuple(
        sorted(
            (
                (left_profile.duckdb_table_name, left_field.normalized_name),
                (right_profile.duckdb_table_name, right_field.normalized_name),
            )
        )
    )


def _direction_score(suggestion: RelationshipSuggestionData) -> tuple[float, float, str, str]:
    source_unique_ratio = float(suggestion.evidence_payload["source_unique_ratio"])
    target_unique_ratio = float(suggestion.evidence_payload["target_unique_ratio"])
    source_key_score = float(suggestion.evidence_payload["source_key_candidate_score"])
    target_key_score = float(suggestion.evidence_payload["target_key_candidate_score"])
    return (
        target_unique_ratio - source_unique_ratio,
        target_key_score - source_key_score,
        suggestion.source_sheet,
        suggestion.target_sheet or "",
    )


def _foreign_key_evidence_summary(
    overlap_count: int,
    source_distinct_count: int,
    matched_row_count: int,
    source_non_null_count: int,
    field_name_similarity: float | None = None,
    relationship_strength: str | None = None,
) -> str:
    summary = (
        f"{source_distinct_count} 个源字段不同取值中有 {overlap_count} 个与目标字段重合；"
        f"{source_non_null_count} 行非空源数据中有 {matched_row_count} 行可匹配目标取值。"
    )
    if field_name_similarity is None or relationship_strength is None:
        return summary

    strength_label = {
        "strong": "强",
        "likely": "较可能",
        "possible": "可能",
    }.get(relationship_strength, relationship_strength)
    return (
        f"{summary} 字段名相似度 {round(field_name_similarity * 100)}%，"
        f"关系强度：{strength_label}。"
    )


def _derived_dimension_evidence_summary(
    sheet_name: str,
    field_name: str,
    unique_count: int,
) -> str:
    return f"{sheet_name}.{field_name} 有 {unique_count} 个不同类别值，可作为维度进行分析。"


def infer_relationships(
    profiles: list[SheetProfileData],
    dataframes: dict[str, pd.DataFrame],
) -> list[RelationshipSuggestionData]:
    suggestions: list[RelationshipSuggestionData] = []
    foreign_key_suggestions: dict[
        tuple[tuple[str, str], tuple[str, str]], RelationshipSuggestionData
    ] = {}
    field_index = []

    for profile in profiles:
        df = dataframes[profile.duckdb_table_name]
        for field in profile.fields:
            if field.normalized_name in df.columns:
                field_index.append((profile, field, df[field.normalized_name]))
            elif field.original_name in df.columns:
                field_index.append((profile, field, df[field.original_name]))

    for source_profile, source_field, source_series in field_index:
        source_values = _clean_values(source_series)
        if not source_values:
            continue

        for target_profile, target_field, target_series in field_index:
            if source_profile.duckdb_table_name == target_profile.duckdb_table_name:
                continue
            field_type_compatible = _field_type_compatible(
                source_field.inferred_type,
                target_field.inferred_type,
            )
            if not field_type_compatible:
                continue

            target_values = _clean_values(target_series)
            if not target_values:
                continue

            overlap = source_values & target_values
            source_non_null = source_series.dropna()
            target_non_null = target_series.dropna()
            source_match_ratio = len(overlap) / len(source_values)
            matched_row_count = int(
                source_non_null.astype(str).str.strip().isin(target_values).sum()
            )
            matched_row_ratio = matched_row_count / max(int(source_non_null.shape[0]), 1)
            source_unique_ratio = source_non_null.nunique() / max(len(source_non_null), 1)
            target_unique_ratio = target_non_null.nunique() / max(len(target_non_null), 1)
            target_key_score = max(target_unique_ratio, target_field.key_candidate_score)
            field_name_similarity = _field_name_similarity(
                source_field.normalized_name,
                target_field.normalized_name,
            )

            if (
                source_match_ratio >= 0.8
                and matched_row_ratio >= 0.8
                and target_key_score >= 0.7
            ):
                confidence = round(
                    min(
                        0.99,
                        0.45
                        + source_match_ratio * 0.3
                        + matched_row_ratio * 0.15
                        + target_key_score * 0.15
                        + field_name_similarity * 0.05,
                    ),
                    3,
                )
                relationship_strength = _relationship_strength(confidence)
                suggestion = RelationshipSuggestionData(
                    source_sheet=source_profile.name,
                    source_field=source_field.normalized_name,
                    target_sheet=target_profile.name,
                    target_field=target_field.normalized_name,
                    relationship_type="foreign_key",
                    confidence=confidence,
                    evidence_summary=_foreign_key_evidence_summary(
                        overlap_count=len(overlap),
                        source_distinct_count=len(source_values),
                        matched_row_count=matched_row_count,
                        source_non_null_count=int(source_non_null.shape[0]),
                        field_name_similarity=(
                            None
                            if source_field.normalized_name == target_field.normalized_name
                            else field_name_similarity
                        ),
                        relationship_strength=(
                            None
                            if source_field.normalized_name == target_field.normalized_name
                            else relationship_strength
                        ),
                    ),
                    evidence_payload={
                        "overlap_count": len(overlap),
                        "source_distinct_count": len(source_values),
                        "target_distinct_count": len(target_values),
                        "source_match_ratio": source_match_ratio,
                        "matched_row_count": matched_row_count,
                        "source_non_null_count": int(source_non_null.shape[0]),
                        "source_unique_ratio": source_unique_ratio,
                        "target_unique_ratio": target_unique_ratio,
                        "source_null_ratio": _null_ratio(source_series),
                        "target_null_ratio": _null_ratio(target_series),
                        "source_key_candidate_score": source_field.key_candidate_score,
                        "target_key_candidate_score": target_field.key_candidate_score,
                        "field_name_similarity": field_name_similarity,
                        "field_type_compatible": field_type_compatible,
                        "sample_matches": sorted(overlap)[:5],
                        "relationship_strength": relationship_strength,
                    },
                )
                pair_key = _field_pair_key(
                    source_profile,
                    source_field,
                    target_profile,
                    target_field,
                )
                current = foreign_key_suggestions.get(pair_key)
                if current is None or _direction_score(suggestion) > _direction_score(current):
                    foreign_key_suggestions[pair_key] = suggestion

    suggestions.extend(foreign_key_suggestions.values())

    for profile in profiles:
        for field in profile.fields:
            if field.inferred_type == "category" and 1 < field.unique_count <= 25:
                suggestions.append(
                    RelationshipSuggestionData(
                        source_sheet=profile.name,
                        source_field=field.normalized_name,
                        target_sheet=None,
                        target_field=None,
                        relationship_type="derived_dimension",
                        confidence=0.76,
                        evidence_summary=_derived_dimension_evidence_summary(
                            profile.name,
                            field.normalized_name,
                            field.unique_count,
                        ),
                        evidence_payload={"unique_count": field.unique_count},
                    )
                )

    return suggestions
