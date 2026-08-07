from __future__ import annotations

import shutil
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import duckdb
import pandas as pd

from graphmind.core.normalizers import normalize_header, unique_normalized_sheet_names
from graphmind.core.profiling import SheetProfileData, profile_dataframe
from graphmind.services.import_paths import safe_import_destination
from graphmind.storage.workspace import WorkspacePaths


class ArtifactTracker(Protocol):
    def track_file(self, path: Path) -> None: ...

    def track_duckdb_table(self, table_name: str) -> None: ...


@dataclass(frozen=True)
class PreparedDataset:
    raw_data_ref: str
    profiles: list[SheetProfileData]
    dataframes: dict[str, pd.DataFrame]


def normalize_dataframe_columns(dataframe: pd.DataFrame) -> pd.DataFrame:
    normalized = dataframe.copy()
    used_names: set[str] = set()
    columns = []
    for column in normalized.columns:
        base_name = normalize_header(str(column))
        column_name = base_name
        suffix = 2
        while column_name in used_names:
            column_name = f"{base_name}_{suffix}"
            suffix += 1
        used_names.add(column_name)
        columns.append(column_name)
    normalized.columns = columns
    return normalized


def prepare_dataset(
    *,
    paths: WorkspacePaths,
    project_id: int,
    job_id: int,
    source_path: Path,
    import_name: str,
    sheets: dict[str, pd.DataFrame],
    normalize_dataframe: Callable[[pd.DataFrame], pd.DataFrame],
    artifacts: ArtifactTracker,
    attempt_id: str,
    assert_claim_active: Callable[[], None] | None = None,
) -> PreparedDataset:
    job_dir = (
        paths.imports_dir
        / f"project_{project_id}"
        / f"job_{job_id}"
        / f"attempt_{attempt_id}"
    )
    destination = safe_import_destination(job_dir, import_name)
    if source_path.resolve() != destination.resolve():
        artifacts.track_file(destination)
        shutil.copy2(source_path, destination)

    dataframes: dict[str, pd.DataFrame] = {}
    profiles: list[SheetProfileData] = []
    with duckdb.connect(str(paths.duckdb_path)) as connection:
        for sheet_name, table_suffix in unique_normalized_sheet_names(sheets):
            dataframe = sheets[sheet_name]
            table_name = f"p{project_id}_j{job_id}_a{attempt_id}_{table_suffix}"
            normalized = normalize_dataframe(dataframe)
            connection.register("import_dataframe", normalized)
            artifacts.track_duckdb_table(table_name)
            try:
                connection.execute(
                    f'CREATE OR REPLACE TABLE "{table_name}" AS SELECT * FROM import_dataframe'
                )
            finally:
                connection.unregister("import_dataframe")

            dataframes[table_name] = normalized
            profiles.append(profile_dataframe(sheet_name, table_name, normalized))
            if assert_claim_active is not None:
                assert_claim_active()

    return PreparedDataset(
        raw_data_ref=destination.relative_to(paths.root).as_posix(),
        profiles=profiles,
        dataframes=dataframes,
    )
