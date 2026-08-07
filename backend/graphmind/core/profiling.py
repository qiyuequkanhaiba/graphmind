from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from graphmind.core.normalizers import normalize_header, normalize_sheet_name

DATE_NAME_TOKENS = {"date", "datetime", "time"}


@dataclass(frozen=True)
class FieldProfileData:
    original_name: str
    normalized_name: str
    inferred_type: str
    null_count: int
    unique_count: int
    sample_values: list[Any]
    min_value: str | None
    max_value: str | None
    semantic_label: str | None
    key_candidate_score: float


@dataclass(frozen=True)
class SheetProfileData:
    name: str
    normalized_name: str
    row_count: int
    column_count: int
    duckdb_table_name: str
    fields: list[FieldProfileData]
    metadata: dict[str, Any] | None = None


def _has_date_like_name(normalized_name: str) -> bool:
    tokens = normalized_name.split("_")
    return (
        any(token in DATE_NAME_TOKENS for token in tokens)
        or normalized_name == "at"
        or normalized_name.endswith("_at")
    )


def infer_field_type(name: str, series: pd.Series) -> str:
    normalized_name = normalize_header(name)
    non_null = series.dropna()
    if non_null.empty:
        return "empty"

    if normalized_name.endswith("_id") or normalized_name == "id":
        return "identifier"

    if _has_date_like_name(normalized_name):
        converted_dates = pd.to_datetime(non_null, errors="coerce")
        if converted_dates.notna().mean() >= 0.8:
            return "date"

    if pd.api.types.is_numeric_dtype(non_null):
        return "number"

    unique_ratio = non_null.nunique(dropna=True) / max(len(non_null), 1)
    if unique_ratio <= 0.8:
        return "category"

    return "text"


def key_candidate_score(name: str, series: pd.Series) -> float:
    non_null = series.dropna()
    if non_null.empty:
        return 0.0
    normalized_name = normalize_header(name)
    unique_ratio = non_null.nunique(dropna=True) / len(non_null)
    if normalized_name == "id" or normalized_name.endswith("_id"):
        return round(float(unique_ratio), 3)
    if unique_ratio == 1.0 and len(non_null) >= 2:
        return 0.75
    return 0.0


def _sample_values(series: pd.Series) -> list[Any]:
    values = []
    for value in series.dropna().head(5).tolist():
        if hasattr(value, "item"):
            value = value.item()
        values.append(value)
    return values


def _min_max(series: pd.Series) -> tuple[str | None, str | None]:
    non_null = series.dropna()
    if non_null.empty:
        return None, None
    try:
        return str(non_null.min()), str(non_null.max())
    except TypeError:
        return None, None


def profile_dataframe(
    sheet_name: str, duckdb_table_name: str, df: pd.DataFrame
) -> SheetProfileData:
    fields = []
    for column in df.columns:
        series = df[column]
        min_value, max_value = _min_max(series)
        fields.append(
            FieldProfileData(
                original_name=str(column),
                normalized_name=normalize_header(str(column)),
                inferred_type=infer_field_type(str(column), series),
                null_count=int(series.isna().sum()),
                unique_count=int(series.dropna().nunique()),
                sample_values=_sample_values(series),
                min_value=min_value,
                max_value=max_value,
                semantic_label=None,
                key_candidate_score=key_candidate_score(str(column), series),
            )
        )

    return SheetProfileData(
        name=sheet_name,
        normalized_name=normalize_sheet_name(sheet_name),
        row_count=len(df),
        column_count=len(df.columns),
        duckdb_table_name=duckdb_table_name,
        fields=fields,
    )
