from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd


def read_table_json(path: Path, import_name: str | None = None) -> dict[str, pd.DataFrame]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
        raise ValueError("Only top-level JSON arrays of objects are supported in phase 1")

    table_name = Path(import_name).stem if import_name else path.stem
    records = [_flatten_record(item) for item in payload]
    return {table_name: pd.DataFrame.from_records(records)}


def _flatten_record(record: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    flattened: dict[str, Any] = {}
    for key, value in record.items():
        next_key = f"{prefix}_{key}" if prefix else str(key)
        if isinstance(value, dict):
            flattened.update(_flatten_record(value, next_key))
        elif isinstance(value, list):
            flattened[next_key] = json.dumps(value, ensure_ascii=False)
        else:
            flattened[next_key] = value
    return flattened
