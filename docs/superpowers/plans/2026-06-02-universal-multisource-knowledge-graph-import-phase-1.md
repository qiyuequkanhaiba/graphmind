# Universal Multisource Knowledge Graph Import Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first working multisource import phase with batch records, multiple CSV/XLSX/JSON uploads, cross-dataset structured relationship inference, persistent graph dedupe, and frontend batch/source summaries.

**Architecture:** Keep the existing single-file spreadsheet import path intact and add a batch orchestration layer around it. Phase 1 only implements structured sources (`csv`, `xlsx`, `xls`, table-shaped `json`) and prepares the data model/API shape for later document/code/log phases.

**Tech Stack:** Python, FastAPI, SQLAlchemy, SQLite, DuckDB, pandas, pytest, React, TypeScript, Vite, Vitest, Testing Library.

---

## Scope Boundary

This plan implements Phase 1 from the design spec:

- `ImportBatch` and `ImportItem` persistence.
- Multiple CSV/XLSX/JSON file upload endpoint.
- JSON table flattening for array-of-object JSON.
- Cross-dataset relationship inference for structured files.
- Persistent graph node/edge dedupe during graph writes.
- Basic source/batch API responses and frontend display.

This plan does not implement PDF, Word, Markdown chunking, code repository parsing, log parsing, `DocumentSource`, `DocumentChunk`, `ExtractedEntity`, `ExtractedRelationship`, or optional AI extraction. Those are separate plans.

## File Structure

Backend files:

- Modify `backend/graphmind/storage/models.py`: add `ImportBatch` and `ImportItem` ORM models.
- Modify `backend/graphmind/storage/database.py`: create migration DDL for the new tables.
- Modify `backend/graphmind/storage/repositories.py`: add `ImportBatchRepository` and persistent graph dedupe helpers.
- Create `backend/graphmind/services/json_import.py`: detect table-shaped JSON and flatten it to pandas dataframes.
- Modify `backend/graphmind/services/import_service.py`: support JSON reading, structured batch imports, and cross-dataset relationship inference.
- Modify `backend/graphmind/services/project_data_service.py`: reset batch and item records.
- Modify `backend/graphmind/api/schemas.py`: add batch/item/source response schemas.
- Modify `backend/graphmind/api/routes.py`: add batch endpoints and source summary endpoint.
- Add `backend/tests/test_universal_import_phase_1.py`: focused backend coverage for batch import and cross-file relationships.

Frontend files:

- Modify `frontend/src/api/types.ts`: add batch, item, and source summary types; widen import task kind.
- Modify `frontend/src/api/client.ts`: add batch/source API methods.
- Modify `frontend/src/components/ImportPanel.tsx`: allow multiple structured uploads and display batch/source summary copy.
- Modify `frontend/src/App.tsx`: submit multiple selected files through the batch endpoint and refresh graph/suggestions.
- Modify `frontend/src/components/Workspace.tsx`: pass source summary stats into the import panel.
- Modify `frontend/src/i18n/messages.ts`: add localized strings.
- Add or modify `frontend/tests/ImportPanel.test.tsx`: cover multiple file selection and batch/source summary display.
- Add `frontend/tests/apiClientImportBatch.test.ts`: cover new client request shape.

## Task 1: Persist Import Batches and Items

**Files:**

- Modify: `backend/graphmind/storage/models.py`
- Modify: `backend/graphmind/storage/database.py`
- Modify: `backend/graphmind/storage/repositories.py`
- Test: `backend/tests/test_universal_import_phase_1.py`

- [ ] **Step 1: Write failing model/repository tests**

Add this test file:

```python
# backend/tests/test_universal_import_phase_1.py
from pathlib import Path

from graphmind.storage.database import create_session_factory, initialize_database
from graphmind.storage.models import ImportBatch, ImportItem
from graphmind.storage.repositories import ImportBatchRepository, ProjectRepository
from graphmind.storage.workspace import WorkspacePaths


def _project_id(tmp_workspace: Path) -> tuple[WorkspacePaths, object, int]:
    paths = WorkspacePaths(tmp_workspace)
    paths.ensure()
    initialize_database(paths.database_path)
    session_factory = create_session_factory(paths.database_path)
    with session_factory() as session:
        project = ProjectRepository(session).create_project("Batch Project")
        session.commit()
        return paths, session_factory, project.id


def test_import_batch_repository_creates_batch_and_items(tmp_workspace: Path):
    _paths, session_factory, project_id = _project_id(tmp_workspace)

    with session_factory() as session:
        repository = ImportBatchRepository(session)
        batch = repository.create_batch(project_id, "Customer import")
        first = repository.create_item(
            batch_id=batch.id,
            project_id=project_id,
            filename="customers.csv",
            file_type="csv",
            source_kind="table",
            raw_data_ref="import_batches/project_1/batch_1/customers.csv",
        )
        second = repository.create_item(
            batch_id=batch.id,
            project_id=project_id,
            filename="orders.json",
            file_type="json",
            source_kind="json",
            raw_data_ref="import_batches/project_1/batch_1/orders.json",
        )
        repository.update_item_status(first, "parsed", {"stage": "parsed"})
        repository.update_batch_progress(batch, "running", 40, {"item_count": 2})
        session.commit()

    with session_factory() as session:
        saved_batch = session.get(ImportBatch, batch.id)
        saved_items = (
            session.query(ImportItem)
            .filter(ImportItem.batch_id == batch.id)
            .order_by(ImportItem.id)
            .all()
        )

        assert saved_batch is not None
        assert saved_batch.project_id == project_id
        assert saved_batch.label == "Customer import"
        assert saved_batch.status == "running"
        assert saved_batch.progress == 40
        assert saved_batch.summary == {"item_count": 2}
        assert [item.filename for item in saved_items] == ["customers.csv", "orders.json"]
        assert saved_items[0].status == "parsed"
        assert saved_items[0].summary == {"stage": "parsed"}
        assert saved_items[1].source_kind == "json"
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_import_batch_repository_creates_batch_and_items -q
```

Expected: failure because `ImportBatch`, `ImportItem`, and `ImportBatchRepository` do not exist.

- [ ] **Step 3: Add ORM models**

In `backend/graphmind/storage/models.py`, add these classes after `ImportJob`:

```python
class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, onupdate=utc_now
    )


class ImportItem(Base):
    __tablename__ = "import_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("import_batches.id"), nullable=False)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    file_type: Mapped[str] = mapped_column(String(40), nullable=False)
    source_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    raw_data_ref: Mapped[str] = mapped_column(String(500), nullable=False)
    artifact_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utc_now, onupdate=utc_now
    )
```

- [ ] **Step 4: Add migration DDL**

In `backend/graphmind/storage/database.py`, append these DDL blocks inside `_migrate_existing_database()` after the existing `import_jobs` block:

```python
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS import_batches (
                id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                label VARCHAR(300) NOT NULL,
                status VARCHAR(40) NOT NULL,
                progress INTEGER NOT NULL,
                summary JSON,
                error_message TEXT,
                created_at DATETIME,
                updated_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(project_id) REFERENCES projects (id)
            )
            """
        )
        connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS import_items (
                id INTEGER NOT NULL,
                batch_id INTEGER NOT NULL,
                project_id INTEGER NOT NULL,
                filename VARCHAR(300) NOT NULL,
                file_type VARCHAR(40) NOT NULL,
                source_kind VARCHAR(40) NOT NULL,
                status VARCHAR(40) NOT NULL,
                raw_data_ref VARCHAR(500) NOT NULL,
                artifact_ref VARCHAR(500),
                error_message TEXT,
                summary JSON,
                created_at DATETIME,
                updated_at DATETIME,
                PRIMARY KEY (id),
                FOREIGN KEY(batch_id) REFERENCES import_batches (id),
                FOREIGN KEY(project_id) REFERENCES projects (id)
            )
            """
        )
```

- [ ] **Step 5: Add repository**

In `backend/graphmind/storage/repositories.py`, import `ImportBatch` and `ImportItem`, then add:

```python
class ImportBatchRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_batch(self, project_id: int, label: str) -> ImportBatch:
        batch = ImportBatch(
            project_id=project_id,
            label=label,
            status="queued",
            progress=0,
            summary=None,
            error_message=None,
        )
        self.session.add(batch)
        self.session.flush()
        return batch

    def create_item(
        self,
        batch_id: int,
        project_id: int,
        filename: str,
        file_type: str,
        source_kind: str,
        raw_data_ref: str,
    ) -> ImportItem:
        item = ImportItem(
            batch_id=batch_id,
            project_id=project_id,
            filename=filename,
            file_type=file_type,
            source_kind=source_kind,
            status="staged",
            raw_data_ref=raw_data_ref,
            artifact_ref=None,
            error_message=None,
            summary={"stage": "staged"},
        )
        self.session.add(item)
        self.session.flush()
        return item

    def update_batch_progress(
        self,
        batch: ImportBatch,
        status: str,
        progress: int,
        summary: dict[str, object] | None = None,
        error_message: str | None = None,
    ) -> None:
        batch.status = status
        batch.progress = max(0, min(100, progress))
        if summary is not None:
            batch.summary = summary
        batch.error_message = error_message
        self.session.flush()

    def update_item_status(
        self,
        item: ImportItem,
        status: str,
        summary: dict[str, object] | None = None,
        artifact_ref: str | None = None,
        error_message: str | None = None,
    ) -> None:
        item.status = status
        if summary is not None:
            item.summary = summary
        if artifact_ref is not None:
            item.artifact_ref = artifact_ref
        item.error_message = error_message
        self.session.flush()

    def get_batch(self, project_id: int, batch_id: int) -> ImportBatch | None:
        return (
            self.session.query(ImportBatch)
            .filter(ImportBatch.project_id == project_id, ImportBatch.id == batch_id)
            .first()
        )

    def list_batches(self, project_id: int, limit: int = 20) -> list[ImportBatch]:
        return (
            self.session.query(ImportBatch)
            .filter(ImportBatch.project_id == project_id)
            .order_by(ImportBatch.updated_at.desc(), ImportBatch.id.desc())
            .limit(limit)
            .all()
        )

    def list_items(self, project_id: int, batch_id: int | None = None) -> list[ImportItem]:
        query = self.session.query(ImportItem).filter(ImportItem.project_id == project_id)
        if batch_id is not None:
            query = query.filter(ImportItem.batch_id == batch_id)
        return query.order_by(ImportItem.id).all()
```

- [ ] **Step 6: Run the model/repository test**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_import_batch_repository_creates_batch_and_items -q
```

Expected: pass.

- [ ] **Step 7: Commit**

If this project is inside a git repository, run:

```bash
git add backend/graphmind/storage/models.py backend/graphmind/storage/database.py backend/graphmind/storage/repositories.py backend/tests/test_universal_import_phase_1.py
git commit -m "feat: add import batch persistence"
```

If `git rev-parse --show-toplevel` fails, skip the commit and note it in the task review.

## Task 2: Add JSON Structured Import Support

**Files:**

- Create: `backend/graphmind/services/json_import.py`
- Modify: `backend/graphmind/services/import_service.py`
- Test: `backend/tests/test_universal_import_phase_1.py`

- [ ] **Step 1: Write failing JSON import tests**

Append to `backend/tests/test_universal_import_phase_1.py`:

```python
from graphmind.services.import_service import ImportService
from graphmind.storage.models import Dataset, Sheet


def test_import_service_imports_top_level_json_array_as_table(tmp_workspace: Path, tmp_path: Path):
    json_path = tmp_path / "customers.json"
    json_path.write_text(
        """
        [
          {"id": "c1", "name": "Acme", "region": "East"},
          {"id": "c2", "name": "Beacon", "region": "West"}
        ]
        """,
        encoding="utf-8",
    )
    paths, session_factory, project_id = _project_id(tmp_workspace)

    result = ImportService(paths, session_factory).import_file(project_id, json_path)

    assert result.sheet_count == 1
    assert result.field_count == 3
    with session_factory() as session:
        dataset = session.get(Dataset, result.dataset_id)
        assert dataset is not None
        assert dataset.file_type == "json"
        sheet = session.query(Sheet).filter(Sheet.dataset_id == dataset.id).one()
        assert sheet.name == "customers"
        assert sheet.row_count == 2
        assert sheet.column_count == 3
```

- [ ] **Step 2: Run the JSON test to verify it fails**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_import_service_imports_top_level_json_array_as_table -q
```

Expected: failure with unsupported `.json` import type.

- [ ] **Step 3: Add JSON helper**

Create `backend/graphmind/services/json_import.py`:

```python
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
```

- [ ] **Step 4: Wire JSON into import service**

In `backend/graphmind/services/import_service.py`, import:

```python
from graphmind.services.json_import import read_table_json
```

Then update `_read_file`:

```python
    def _read_file(self, path: Path, import_name: str | None = None) -> dict[str, pd.DataFrame]:
        extension = path.suffix.lower()
        if extension == ".csv":
            sheet_name = Path(import_name).stem if import_name else path.stem
            return {sheet_name: pd.read_csv(path)}
        if extension in {".xlsx", ".xls"}:
            return pd.read_excel(path, sheet_name=None)
        if extension == ".json":
            return read_table_json(path, import_name)
        raise ValueError(f"Unsupported import file type: {extension}")
```

- [ ] **Step 5: Run the JSON test**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_import_service_imports_top_level_json_array_as_table -q
```

Expected: pass.

- [ ] **Step 6: Run existing import service tests**

Run:

```bash
cd backend
pytest tests/test_import_service.py -q
```

Expected: pass.

- [ ] **Step 7: Commit**

If git is available:

```bash
git add backend/graphmind/services/json_import.py backend/graphmind/services/import_service.py backend/tests/test_universal_import_phase_1.py
git commit -m "feat: import table-shaped json files"
```

## Task 3: Implement Structured Batch Import Service

**Files:**

- Modify: `backend/graphmind/services/import_service.py`
- Modify: `backend/graphmind/storage/repositories.py`
- Test: `backend/tests/test_universal_import_phase_1.py`

- [ ] **Step 1: Write failing structured batch test**

Append:

```python
from graphmind.storage.models import FieldProfile, RelationshipSuggestion


def test_import_service_imports_structured_batch_and_finds_cross_file_foreign_key(
    tmp_workspace: Path, tmp_path: Path
):
    customers = tmp_path / "customers.csv"
    customers.write_text(
        "\n".join(
            [
                "id,name,region",
                "c1,Acme,East",
                "c2,Beacon,West",
                "c3,Cedar,North",
            ]
        ),
        encoding="utf-8",
    )
    orders = tmp_path / "orders.json"
    orders.write_text(
        """
        [
          {"order_id": "o1", "customer_id": "c1", "amount": 120},
          {"order_id": "o2", "customer_id": "c2", "amount": 240},
          {"order_id": "o3", "customer_id": "c1", "amount": 80}
        ]
        """,
        encoding="utf-8",
    )
    paths, session_factory, project_id = _project_id(tmp_workspace)

    result = ImportService(paths, session_factory).import_structured_batch(
        project_id=project_id,
        files=[customers, orders],
        label="Customers and orders",
    )

    assert result.batch_id > 0
    assert result.dataset_count == 2
    assert result.sheet_count == 2
    assert result.field_count == 6
    assert result.suggestion_count >= 1

    with session_factory() as session:
        suggestions = (
            session.query(RelationshipSuggestion)
            .filter(RelationshipSuggestion.project_id == project_id)
            .all()
        )
        field_labels = {
            field.id: f"{field.sheet.name}.{field.normalized_name}"
            for field in session.query(FieldProfile).all()
        }
        assert any(
            suggestion.relationship_type == "foreign_key"
            and field_labels[suggestion.source_field_id] == "orders.customer_id"
            and suggestion.target_field_id is not None
            and field_labels[suggestion.target_field_id] == "customers.id"
            for suggestion in suggestions
        )
```

- [ ] **Step 2: Run the batch test to verify it fails**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_import_service_imports_structured_batch_and_finds_cross_file_foreign_key -q
```

Expected: failure because `import_structured_batch` and batch result types do not exist.

- [ ] **Step 3: Add result dataclass**

In `backend/graphmind/services/import_service.py`, add after `ImportResult`:

```python
@dataclass(frozen=True)
class StructuredBatchImportResult:
    batch_id: int
    dataset_ids: list[int]
    dataset_count: int
    sheet_count: int
    field_count: int
    suggestion_count: int
    graph_node_count: int
    graph_edge_count: int
```

- [ ] **Step 4: Add reusable extension helpers**

In `ImportService`, add:

```python
    def _file_source_kind(self, path: Path) -> str:
        extension = path.suffix.lower()
        if extension in {".csv", ".xlsx", ".xls"}:
            return "table"
        if extension == ".json":
            return "json"
        raise ValueError(f"Unsupported import file type: {extension}")

    def _create_dataset_from_sheets(
        self,
        session: Session,
        repository: ImportRepository,
        project_id: int,
        source_path: Path,
        import_name: str,
        sheets: dict[str, pd.DataFrame],
    ) -> tuple[int, list[SheetProfileData], dict[str, pd.DataFrame]]:
        dataset = repository.create_dataset(project_id=project_id, file_path=import_name)
        raw_data_ref = self._copy_to_imports(project_id, dataset.id, source_path, import_name)
        repository.set_dataset_raw_data_ref(dataset, raw_data_ref)
        dataframes: dict[str, pd.DataFrame] = {}
        profiles: list[SheetProfileData] = []

        with duckdb.connect(str(self.paths.duckdb_path)) as connection:
            for sheet_name, dataframe in sheets.items():
                table_name = self._table_name(project_id, dataset.id, sheet_name)
                normalized = self._normalize_dataframe_columns(dataframe)
                connection.register("import_dataframe", normalized)
                connection.execute(
                    f'CREATE OR REPLACE TABLE "{table_name}" AS SELECT * FROM import_dataframe'
                )
                connection.unregister("import_dataframe")
                dataframes[table_name] = normalized
                profiles.append(profile_dataframe(sheet_name, table_name, normalized))

        for profile in profiles:
            repository.add_sheet_profile(dataset.id, profile)
        return dataset.id, profiles, dataframes
```

- [ ] **Step 5: Refactor single-file import to use the helper**

In `_execute_import_file`, replace dataset/table/profile creation with:

```python
            dataset_id, profiles, dataframes = self._create_dataset_from_sheets(
                session=session,
                repository=repository,
                project_id=project_id,
                source_path=source_path,
                import_name=import_name,
                sheets=sheets,
            )
```

Then update references from `dataset.id` to `dataset_id` in that method:

```python
            saved_suggestions = repository.add_relationship_suggestions(
                project_id, dataset_id, suggestions
            )
            repository.complete_import_job(job, dataset_id, summary)
```

And return:

```python
                dataset_id=dataset_id,
```

- [ ] **Step 6: Add structured batch method**

In `ImportService`, add:

```python
    def import_structured_batch(
        self,
        project_id: int,
        files: list[str | Path],
        label: str = "Structured import batch",
    ) -> StructuredBatchImportResult:
        self.paths.ensure()
        source_paths = [Path(file) for file in files]
        with self.session_factory() as session:
            batch_repository = ImportBatchRepository(session)
            import_repository = ImportRepository(session)
            batch = batch_repository.create_batch(project_id, label)
            batch_repository.update_batch_progress(
                batch,
                "running",
                10,
                {"item_count": len(source_paths), "stage": "staged"},
            )
            session.commit()
            batch_id = batch.id

        all_profiles: list[SheetProfileData] = []
        all_dataframes: dict[str, pd.DataFrame] = {}
        dataset_ids: list[int] = []
        item_ids: list[int] = []

        with self.session_factory() as session:
            batch_repository = ImportBatchRepository(session)
            import_repository = ImportRepository(session)
            batch = batch_repository.get_batch(project_id, batch_id)
            if batch is None:
                raise ValueError(f"Import batch {batch_id} not found")

            for source_path in source_paths:
                import_name = source_path.name
                source_kind = self._file_source_kind(source_path)
                item = batch_repository.create_item(
                    batch_id=batch.id,
                    project_id=project_id,
                    filename=import_name,
                    file_type=source_path.suffix.lower().lstrip("."),
                    source_kind=source_kind,
                    raw_data_ref="",
                )
                item_ids.append(item.id)
                sheets = self._read_file(source_path, import_name)
                dataset_id, profiles, dataframes = self._create_dataset_from_sheets(
                    session=session,
                    repository=import_repository,
                    project_id=project_id,
                    source_path=source_path,
                    import_name=import_name,
                    sheets=sheets,
                )
                dataset_ids.append(dataset_id)
                all_profiles.extend(profiles)
                all_dataframes.update(dataframes)
                dataset = session.get(Dataset, dataset_id)
                raw_data_ref = dataset.raw_data_ref if dataset is not None else ""
                batch_repository.update_item_status(
                    item,
                    "profiled",
                    {
                        "stage": "profiled",
                        "dataset_id": dataset_id,
                        "sheet_count": len(profiles),
                        "field_count": sum(len(profile.fields) for profile in profiles),
                    },
                    artifact_ref=None,
                )
                item.raw_data_ref = raw_data_ref

            suggestions = infer_relationships(profiles=all_profiles, dataframes=all_dataframes)
            saved_suggestions = import_repository.add_relationship_suggestions_for_profiles(
                project_id,
                suggestions,
            )
            graph = build_graph(project_id=project_id, profiles=all_profiles, suggestions=suggestions)
            saved_nodes, saved_edges = import_repository.add_graph(graph)
            import_repository.link_graph_edges_to_suggestions(saved_edges, saved_suggestions)

            summary = {
                "dataset_count": len(dataset_ids),
                "sheet_count": len(all_profiles),
                "field_count": sum(len(profile.fields) for profile in all_profiles),
                "suggestion_count": len(saved_suggestions),
                "graph_node_count": len(saved_nodes),
                "graph_edge_count": len(saved_edges),
                "item_ids": item_ids,
                "stage": "graphed",
            }
            batch_repository.update_batch_progress(batch, "succeeded", 100, summary)
            for item in batch_repository.list_items(project_id, batch.id):
                batch_repository.update_item_status(
                    item,
                    "succeeded",
                    {**(item.summary or {}), "stage": "indexed"},
                )
            session.commit()

            return StructuredBatchImportResult(
                batch_id=batch.id,
                dataset_ids=dataset_ids,
                dataset_count=summary["dataset_count"],
                sheet_count=summary["sheet_count"],
                field_count=summary["field_count"],
                suggestion_count=summary["suggestion_count"],
                graph_node_count=summary["graph_node_count"],
                graph_edge_count=summary["graph_edge_count"],
            )
```

Also import `ImportBatchRepository` and `Dataset` at the top of `import_service.py` if missing.

- [ ] **Step 7: Add profile-wide relationship suggestion persistence**

In `ImportRepository`, add:

```python
    def add_relationship_suggestions_for_profiles(
        self,
        project_id: int,
        suggestions: list[RelationshipSuggestionData],
    ) -> list[RelationshipSuggestion]:
        fields = (
            self.session.query(FieldProfile)
            .join(Sheet)
            .join(Dataset)
            .filter(Dataset.project_id == project_id)
            .all()
        )
        field_id_map = {
            (field.sheet.name, field.normalized_name): field.id
            for field in fields
            if field.sheet is not None
        }
        return self._add_relationship_suggestions_from_field_map(
            project_id,
            suggestions,
            field_id_map,
        )
```

Then refactor existing `add_relationship_suggestions` to use a private helper:

```python
    def _add_relationship_suggestions_from_field_map(
        self,
        project_id: int,
        suggestions: list[RelationshipSuggestionData],
        field_id_map: dict[tuple[str, str], int],
    ) -> list[RelationshipSuggestion]:
        saved_suggestions = []
        for suggestion in suggestions:
            source_field_id = field_id_map.get(
                (suggestion.source_sheet, suggestion.source_field)
            )
            if source_field_id is None:
                continue

            target_field_id = None
            if suggestion.target_sheet is not None and suggestion.target_field is not None:
                target_field_id = field_id_map.get(
                    (suggestion.target_sheet, suggestion.target_field)
                )
                if target_field_id is None:
                    continue

            saved = RelationshipSuggestion(
                project_id=project_id,
                source_field_id=source_field_id,
                target_field_id=target_field_id,
                relationship_type=suggestion.relationship_type,
                confidence=suggestion.confidence,
                evidence_summary=suggestion.evidence_summary,
                evidence_payload=suggestion.evidence_payload,
                decision_status="pending",
            )
            self.session.add(saved)
            saved_suggestions.append(saved)

        self.session.flush()
        return saved_suggestions
```

Update `add_relationship_suggestions` to build its dataset-scoped `field_id_map` and return this helper.

- [ ] **Step 8: Run structured batch test**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_import_service_imports_structured_batch_and_finds_cross_file_foreign_key -q
```

Expected: pass.

- [ ] **Step 9: Run import-related backend tests**

Run:

```bash
cd backend
pytest tests/test_import_service.py tests/test_relationships.py tests/test_universal_import_phase_1.py -q
```

Expected: pass.

- [ ] **Step 10: Commit**

If git is available:

```bash
git add backend/graphmind/services/import_service.py backend/graphmind/storage/repositories.py backend/tests/test_universal_import_phase_1.py
git commit -m "feat: import structured files as a batch"
```

## Task 4: Add Persistent Graph Dedupe

**Files:**

- Modify: `backend/graphmind/storage/repositories.py`
- Test: `backend/tests/test_universal_import_phase_1.py`

- [ ] **Step 1: Write failing graph dedupe test**

Append:

```python
def test_structured_batch_graph_merge_dedupes_repeated_table_and_field_labels(
    tmp_workspace: Path, tmp_path: Path
):
    first = tmp_path / "first_customers.csv"
    second = tmp_path / "second_customers.csv"
    first.write_text("id,name\nc1,Acme\nc2,Beacon", encoding="utf-8")
    second.write_text("id,name\nc1,Acme\nc2,Beacon", encoding="utf-8")
    paths, session_factory, project_id = _project_id(tmp_workspace)

    ImportService(paths, session_factory).import_structured_batch(
        project_id=project_id,
        files=[first, second],
        label="Duplicate customers",
    )

    with session_factory() as session:
        labels = [node.label for node in session.query(GraphNode).all()]
        assert labels.count("first_customers.id") == 1
        assert labels.count("second_customers.id") == 1
        edge_keys = [
            (edge.source_node_id, edge.target_node_id, edge.edge_type, edge.status)
            for edge in session.query(GraphEdge).all()
        ]
        assert len(edge_keys) == len(set(edge_keys))
```

Also import `GraphEdge` and `GraphNode` at the top if missing:

```python
from graphmind.storage.models import GraphEdge, GraphNode
```

- [ ] **Step 2: Run the dedupe test**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_structured_batch_graph_merge_dedupes_repeated_table_and_field_labels -q
```

Expected: it may pass for labels but fail for duplicate edges depending on current graph generation. Keep this test as the guard.

- [ ] **Step 3: Add node dedupe in `add_graph`**

In `ImportRepository.add_graph`, before creating a `GraphNode`, query existing node by stable key:

```python
            existing = (
                self.session.query(GraphNode)
                .filter(
                    GraphNode.project_id == graph.project_id,
                    GraphNode.node_type == node.node_type,
                    GraphNode.label == node.label,
                    GraphNode.source_ref == node.source_ref,
                )
                .first()
            )
            if existing is not None:
                node_id_map[node.id] = existing.id
                saved_nodes.append(existing)
                continue
```

Place this inside the node loop before constructing `saved = GraphNode(...)`.

- [ ] **Step 4: Add edge dedupe in `add_graph`**

Before creating a `GraphEdge`, query for an existing equivalent edge:

```python
            existing_edge = (
                self.session.query(GraphEdge)
                .filter(
                    GraphEdge.project_id == graph.project_id,
                    GraphEdge.source_node_id == source_node_id,
                    GraphEdge.target_node_id == target_node_id,
                    GraphEdge.edge_type == edge.edge_type,
                    GraphEdge.status == edge.status,
                    GraphEdge.evidence_ref == edge.evidence_ref,
                )
                .first()
            )
            if existing_edge is not None:
                saved_edges.append(existing_edge)
                continue
```

Place this before constructing `saved = GraphEdge(...)`.

- [ ] **Step 5: Run graph dedupe and existing graph tests**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_structured_batch_graph_merge_dedupes_repeated_table_and_field_labels tests/test_api.py::test_sample_import_endpoint_is_idempotent_for_demo_dataset -q
```

Expected: pass.

- [ ] **Step 6: Commit**

If git is available:

```bash
git add backend/graphmind/storage/repositories.py backend/tests/test_universal_import_phase_1.py
git commit -m "feat: dedupe graph writes"
```

## Task 5: Add Batch API Schemas and Routes

**Files:**

- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_universal_import_phase_1.py`

- [ ] **Step 1: Write failing API test**

Append:

```python
from fastapi.testclient import TestClient

from graphmind.api.app import create_app


def test_import_batch_endpoint_accepts_multiple_structured_files(tmp_workspace: Path, tmp_path: Path):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Batch API"}).json()["id"]
    customers = tmp_path / "customers.csv"
    orders = tmp_path / "orders.json"
    customers.write_text("id,name\nc1,Acme\nc2,Beacon", encoding="utf-8")
    orders.write_text(
        '[{"order_id":"o1","customer_id":"c1"},{"order_id":"o2","customer_id":"c2"}]',
        encoding="utf-8",
    )

    with customers.open("rb") as first_upload, orders.open("rb") as second_upload:
        response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "Customer batch"},
            files=[
                ("files", ("customers.csv", first_upload, "text/csv")),
                ("files", ("orders.json", second_upload, "application/json")),
            ],
        )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] > 0
    assert body["label"] == "Customer batch"
    assert body["status"] == "succeeded"
    assert body["progress"] == 100
    assert body["summary"]["dataset_count"] == 2
    assert len(body["items"]) == 2
    assert {item["filename"] for item in body["items"]} == {"customers.csv", "orders.json"}
    assert {item["status"] for item in body["items"]} == {"succeeded"}

    graph = client.get(f"/api/projects/{project_id}/graph").json()
    suggestions = client.get(f"/api/projects/{project_id}/relationship-suggestions").json()
    assert graph["nodes"]
    assert any(
        suggestion["relationship_type"] == "foreign_key"
        and suggestion["source_label"] == "orders.customer_id"
        and suggestion["target_label"] == "customers.id"
        for suggestion in suggestions
    )
```

- [ ] **Step 2: Run API test to verify it fails**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_import_batch_endpoint_accepts_multiple_structured_files -q
```

Expected: 404 for missing route.

- [ ] **Step 3: Add schemas**

In `backend/graphmind/api/schemas.py`, add:

```python
class ImportItemResponse(BaseModel):
    id: int
    batch_id: int
    project_id: int
    filename: str
    file_type: str
    source_kind: str
    status: str
    raw_data_ref: str
    artifact_ref: str | None
    error: str | None
    summary: dict[str, Any] | None
    created_at: str
    updated_at: str


class ImportBatchResponse(BaseModel):
    id: int
    project_id: int
    label: str
    status: str
    progress: int
    summary: dict[str, Any] | None
    error: str | None
    items: list[ImportItemResponse] = Field(default_factory=list)
    created_at: str
    updated_at: str


class SourceSummaryResponse(BaseModel):
    source_kind: str
    count: int
```

- [ ] **Step 4: Import new schemas and SQLAlchemy models in routes**

In `backend/graphmind/api/routes.py`, extend imports:

```python
from graphmind.api.schemas import (
    ...
    ImportBatchResponse,
    ImportItemResponse,
    SourceSummaryResponse,
)
```

Extend model imports:

```python
from graphmind.storage.models import (
    ...
    ImportBatch,
    ImportItem,
)
```

Extend repository imports:

```python
from graphmind.storage.repositories import ImportBatchRepository, ImportRepository, ProjectRepository
```

- [ ] **Step 5: Allow JSON upload in existing checks**

In both existing upload endpoints in `routes.py`, change:

```python
if suffix.lower() not in {".csv", ".xlsx", ".xls"}:
```

to:

```python
if suffix.lower() not in {".csv", ".xlsx", ".xls", ".json"}:
```

- [ ] **Step 6: Add route helpers**

Inside `create_router`, near `_import_job_response`, add:

```python
    def _import_item_response(item: ImportItem) -> ImportItemResponse:
        return ImportItemResponse(
            id=item.id,
            batch_id=item.batch_id,
            project_id=item.project_id,
            filename=item.filename,
            file_type=item.file_type,
            source_kind=item.source_kind,
            status=item.status,
            raw_data_ref=item.raw_data_ref,
            artifact_ref=item.artifact_ref,
            error=item.error_message,
            summary=item.summary,
            created_at=item.created_at.isoformat(),
            updated_at=item.updated_at.isoformat(),
        )

    def _import_batch_response(
        batch: ImportBatch,
        items: list[ImportItem],
    ) -> ImportBatchResponse:
        return ImportBatchResponse(
            id=batch.id,
            project_id=batch.project_id,
            label=batch.label,
            status=batch.status,
            progress=batch.progress,
            summary=batch.summary,
            error=batch.error_message,
            items=[_import_item_response(item) for item in items],
            created_at=batch.created_at.isoformat(),
            updated_at=batch.updated_at.isoformat(),
        )
```

- [ ] **Step 7: Add batch routes**

Inside `create_router`, add:

```python
    @router.post(
        "/projects/{project_id}/import-batches",
        response_model=ImportBatchResponse,
    )
    async def import_structured_batch(
        project_id: int,
        files: list[UploadFile],
        session: SessionDependency,
        label: str = "Structured import batch",
    ) -> ImportBatchResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        if not files:
            raise HTTPException(status_code=400, detail="No files uploaded")

        temp_paths: list[Path] = []
        try:
            for file in files:
                suffix = Path(file.filename or "").suffix
                if suffix.lower() not in {".csv", ".xlsx", ".xls", ".json"}:
                    raise HTTPException(status_code=400, detail="Unsupported import file type")
                with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                    temp_path = Path(temp_file.name)
                    while chunk := await file.read(1024 * 1024):
                        temp_file.write(chunk)
                display_path = temp_path.with_name(file.filename or f"import{suffix}")
                display_path.write_bytes(temp_path.read_bytes())
                temp_path.unlink(missing_ok=True)
                temp_paths.append(display_path)

            result = ImportService(
                paths=WorkspacePaths(workspace_root),
                session_factory=session_factory,
            ).import_structured_batch(project_id, temp_paths, label=label)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        finally:
            for temp_path in temp_paths:
                temp_path.unlink(missing_ok=True)

        repository = ImportBatchRepository(session)
        batch = repository.get_batch(project_id, result.batch_id)
        if batch is None:
            raise HTTPException(status_code=404, detail="Import batch not found")
        return _import_batch_response(batch, repository.list_items(project_id, batch.id))

    @router.get(
        "/projects/{project_id}/import-batches",
        response_model=list[ImportBatchResponse],
    )
    def get_import_batches(
        project_id: int,
        session: SessionDependency,
    ) -> list[ImportBatchResponse]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        repository = ImportBatchRepository(session)
        return [
            _import_batch_response(batch, repository.list_items(project_id, batch.id))
            for batch in repository.list_batches(project_id)
        ]

    @router.get(
        "/projects/{project_id}/import-batches/{batch_id}",
        response_model=ImportBatchResponse,
    )
    def get_import_batch(
        project_id: int,
        batch_id: int,
        session: SessionDependency,
    ) -> ImportBatchResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        repository = ImportBatchRepository(session)
        batch = repository.get_batch(project_id, batch_id)
        if batch is None:
            raise HTTPException(status_code=404, detail="Import batch not found")
        return _import_batch_response(batch, repository.list_items(project_id, batch.id))
```

- [ ] **Step 8: Add source summary route**

Inside `create_router`, add:

```python
    @router.get(
        "/projects/{project_id}/sources",
        response_model=list[SourceSummaryResponse],
    )
    def get_source_summaries(
        project_id: int,
        session: SessionDependency,
    ) -> list[SourceSummaryResponse]:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        rows = (
            session.query(ImportItem.source_kind, ImportItem.id)
            .filter(ImportItem.project_id == project_id, ImportItem.status == "succeeded")
            .all()
        )
        counts: dict[str, int] = {}
        for source_kind, _item_id in rows:
            counts[source_kind] = counts.get(source_kind, 0) + 1
        return [
            SourceSummaryResponse(source_kind=source_kind, count=count)
            for source_kind, count in sorted(counts.items())
        ]
```

- [ ] **Step 9: Run API batch test**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_import_batch_endpoint_accepts_multiple_structured_files -q
```

Expected: pass.

- [ ] **Step 10: Run backend API tests**

Run:

```bash
cd backend
pytest tests/test_api.py tests/test_universal_import_phase_1.py -q
```

Expected: pass.

- [ ] **Step 11: Commit**

If git is available:

```bash
git add backend/graphmind/api/schemas.py backend/graphmind/api/routes.py backend/tests/test_universal_import_phase_1.py
git commit -m "feat: expose structured import batches"
```

## Task 6: Reset Project Batch Data

**Files:**

- Modify: `backend/graphmind/services/project_data_service.py`
- Test: `backend/tests/test_universal_import_phase_1.py`

- [ ] **Step 1: Write failing reset test**

Append:

```python
from graphmind.services.project_data_service import ProjectDataService


def test_reset_project_data_clears_import_batches_and_items(tmp_workspace: Path, tmp_path: Path):
    csv_path = tmp_path / "customers.csv"
    csv_path.write_text("id,name\nc1,Acme", encoding="utf-8")
    paths, session_factory, project_id = _project_id(tmp_workspace)
    ImportService(paths, session_factory).import_structured_batch(
        project_id,
        [csv_path],
        label="Reset batch",
    )

    with session_factory() as session:
        assert session.query(ImportBatch).filter(ImportBatch.project_id == project_id).count() == 1
        assert session.query(ImportItem).filter(ImportItem.project_id == project_id).count() == 1

    ProjectDataService(paths, session_factory).reset_project_data(project_id)

    with session_factory() as session:
        assert session.query(ImportBatch).filter(ImportBatch.project_id == project_id).count() == 0
        assert session.query(ImportItem).filter(ImportItem.project_id == project_id).count() == 0
```

- [ ] **Step 2: Run reset test to verify it fails**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_reset_project_data_clears_import_batches_and_items -q
```

Expected: failure because reset does not delete new records.

- [ ] **Step 3: Update reset service**

In `backend/graphmind/services/project_data_service.py`, import:

```python
    ImportBatch,
    ImportItem,
```

Then in `reset_project_data`, delete items and batches before datasets:

```python
            session.query(ImportItem).filter(ImportItem.project_id == project_id).delete(
                synchronize_session=False
            )
            session.query(ImportBatch).filter(ImportBatch.project_id == project_id).delete(
                synchronize_session=False
            )
```

Place these before deleting `Dataset`.

- [ ] **Step 4: Run reset tests**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py::test_reset_project_data_clears_import_batches_and_items tests/test_import_service.py::test_reset_project_data_drops_duckdb_tables_and_import_files tests/test_api.py::test_reset_project_data_clears_imported_graph_and_suggestions -q
```

Expected: pass.

- [ ] **Step 5: Commit**

If git is available:

```bash
git add backend/graphmind/services/project_data_service.py backend/tests/test_universal_import_phase_1.py
git commit -m "feat: reset import batch records"
```

## Task 7: Frontend API Types and Client

**Files:**

- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/tests/apiClientImportBatch.test.ts`

- [ ] **Step 1: Add failing API client tests**

Create `frontend/tests/apiClientImportBatch.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createImportBatch, getImportBatches, getSourceSummaries } from "../src/api/client";

describe("import batch API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts multiple files to the import batch endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 4,
        project_id: 2,
        label: "Batch",
        status: "succeeded",
        progress: 100,
        summary: { dataset_count: 2 },
        error: null,
        items: [],
        created_at: "2026-06-02T00:00:00+00:00",
        updated_at: "2026-06-02T00:00:00+00:00"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const files = [
      new File(["id,name"], "customers.csv", { type: "text/csv" }),
      new File(['[{"id":"o1"}]'], "orders.json", { type: "application/json" })
    ];
    const result = await createImportBatch(2, files, "Batch");

    expect(result.id).toBe(4);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/2/import-batches",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })
    );
  });

  it("loads import batches and source summaries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ source_kind: "table", count: 2 }]
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getImportBatches(3)).resolves.toEqual([]);
    await expect(getSourceSummaries(3)).resolves.toEqual([{ source_kind: "table", count: 2 }]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/projects/3/import-batches");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/projects/3/sources");
  });
});
```

- [ ] **Step 2: Run client test to verify it fails**

Run:

```bash
cd frontend
npm test -- apiClientImportBatch.test.ts --run
```

Expected: failure because the functions/types do not exist.

- [ ] **Step 3: Add TypeScript types**

In `frontend/src/api/types.ts`, add:

```ts
export type ImportItem = {
  id: number;
  batch_id: number;
  project_id: number;
  filename: string;
  file_type: string;
  source_kind: "table" | "json" | "document" | "code" | "log" | string;
  status: "staged" | "profiled" | "succeeded" | "failed" | string;
  raw_data_ref: string;
  artifact_ref: string | null;
  error: string | null;
  summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ImportBatch = {
  id: number;
  project_id: number;
  label: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled" | string;
  progress: number;
  summary: Record<string, unknown> | null;
  error: string | null;
  items: ImportItem[];
  created_at: string;
  updated_at: string;
};

export type SourceSummary = {
  source_kind: string;
  count: number;
};
```

Also update `ImportJob["kind"]` if needed:

```ts
kind: "file" | "sample" | "batch" | string;
```

- [ ] **Step 4: Add client functions**

In `frontend/src/api/client.ts`, import the new types:

```ts
  ImportBatch,
  SourceSummary,
```

Add:

```ts
export async function createImportBatch(
  projectId: number,
  files: File[],
  label = "Structured import batch"
): Promise<ImportBatch> {
  const formData = new FormData();
  formData.append("label", label);
  for (const file of files) {
    formData.append("files", file);
  }
  const response = await fetch(`${API_BASE}/projects/${projectId}/import-batches`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    throw new Error(`Import batch failed: ${response.status}`);
  }
  return response.json();
}

export async function getImportBatches(projectId: number): Promise<ImportBatch[]> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/import-batches`);
  if (!response.ok) {
    throw new Error(`Get import batches failed: ${response.status}`);
  }
  return response.json();
}

export async function getSourceSummaries(projectId: number): Promise<SourceSummary[]> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/sources`);
  if (!response.ok) {
    throw new Error(`Get source summaries failed: ${response.status}`);
  }
  return response.json();
}
```

- [ ] **Step 5: Run frontend client test**

Run:

```bash
cd frontend
npm test -- apiClientImportBatch.test.ts --run
```

Expected: pass.

- [ ] **Step 6: Commit**

If git is available:

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/tests/apiClientImportBatch.test.ts
git commit -m "feat: add import batch client"
```

## Task 8: Frontend Multiple File Upload and Batch Summary

**Files:**

- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Test: `frontend/tests/ImportPanel.test.tsx`

- [ ] **Step 1: Write failing ImportPanel tests**

Append to `frontend/tests/ImportPanel.test.tsx`:

```tsx
  it("accepts multiple structured files for batch import", () => {
    const onImportBatch = vi.fn();
    render(<ImportPanel onImportBatch={onImportBatch} />);

    const files = [
      new File(["id,name\nc1,Acme"], "customers.csv", { type: "text/csv" }),
      new File(['[{"order_id":"o1"}]'], "orders.json", { type: "application/json" })
    ];

    fireEvent.change(screen.getByLabelText("拖入 CSV、Excel 或 JSON"), {
      target: { files }
    });

    expect(onImportBatch).toHaveBeenCalledWith(files);
  });

  it("shows source summary counts", () => {
    render(
      <ImportPanel
        sourceSummaries={[
          { source_kind: "table", count: 2 },
          { source_kind: "json", count: 1 }
        ]}
      />
    );

    expect(screen.getByText("来源概览")).toBeInTheDocument();
    expect(screen.getByText("table · 2")).toBeInTheDocument();
    expect(screen.getByText("json · 1")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd frontend
npm test -- ImportPanel.test.tsx --run
```

Expected: failure because `onImportBatch`, `sourceSummaries`, and new label text do not exist.

- [ ] **Step 3: Update ImportPanel props and input**

In `frontend/src/components/ImportPanel.tsx`, import `SourceSummary`:

```ts
import type {
  GraphNode,
  RelationshipModelingReview,
  RelationshipSuggestion,
  SourceSummary
} from "../api/types";
```

Update `ImportTask` kind:

```ts
kind: "file" | "sample" | "batch";
```

Update `Props`:

```ts
  sourceSummaries?: SourceSummary[];
  onImportBatch?: (files: File[]) => void;
```

Set defaults in function args:

```ts
  sourceSummaries = [],
  onImportBatch = () => undefined,
```

Update the upload input:

```tsx
        <input
          aria-label={t("import.uploadLabel")}
          type="file"
          accept=".csv,.xlsx,.xls,.json"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 1) {
              onImportBatch(files);
              event.target.value = "";
              return;
            }
            const file = files[0];
            if (file) {
              onImport(file);
              event.target.value = "";
            }
          }}
        />
```

- [ ] **Step 4: Add source summary display**

In `ImportPanel`, after the import summary card, add:

```tsx
      {sourceSummaries.length > 0 ? (
        <section className="import-source-summary-card" aria-label={t("import.sources.heading")}>
          <div className="import-summary-heading">
            <h3>{t("import.sources.heading")}</h3>
            <Network aria-hidden="true" size={15} />
          </div>
          <div className="import-summary-metrics">
            {sourceSummaries.map((source) => (
              <ImportMetric
                key={source.source_kind}
                value={t("import.sources.metric", {
                  kind: source.source_kind,
                  count: source.count
                })}
              />
            ))}
          </div>
        </section>
      ) : null}
```

- [ ] **Step 5: Add i18n strings**

In `frontend/src/i18n/messages.ts`, update Chinese messages:

```ts
"import.uploadLabel": "拖入 CSV、Excel 或 JSON",
"import.uploadHelp": "支持单文件或一次选择多个结构化文件",
"import.sources.heading": "来源概览",
"import.sources.metric": "{{kind}} · {{count}}",
"app.importingBatch": "正在导入 {{count}} 个文件...",
```

Update English messages:

```ts
"import.uploadLabel": "Drop CSV, Excel, or JSON",
"import.uploadHelp": "Import one file or select multiple structured files",
"import.sources.heading": "Source overview",
"import.sources.metric": "{{kind}} · {{count}}",
"app.importingBatch": "Importing {{count}} files...",
```

If existing keys already exist, replace their values instead of adding duplicates.

- [ ] **Step 6: Wire App batch state**

In `frontend/src/App.tsx`, import:

```ts
  createImportBatch,
  getSourceSummaries,
```

Import types:

```ts
  SourceSummary,
```

Add `sourceSummaries: []` to the initial state in `WorkspaceState`. If `WorkspaceState` is defined in `frontend/src/state/workspaceStore.ts`, update that type there:

```ts
sourceSummaries: SourceSummary[];
```

After bootstrap, fetch source summaries:

```ts
const sourceSummaries = await getSourceSummaries(projectId);
```

If changing the existing bootstrap helper is cleaner, update `bootstrapWorkspace()` to return `sourceSummaries`.

Add handler:

```ts
  async function handleImportBatch(files: File[]) {
    if (state.projectId === null || files.length === 0) {
      return;
    }

    const taskId = createImportTaskId("batch");
    setState((current) => ({
      ...current,
      importTasks: [
        buildImportTask({
          id: taskId,
          kind: "batch",
          label: t("import.tasks.batchLabel", { count: files.length }),
          status: "running",
          progress: 25,
          summary: t("import.tasks.summary.running")
        }),
        ...current.importTasks
      ].slice(0, 6),
      importStatus: t("app.importingBatch", { count: files.length }),
      error: null
    }));

    try {
      await createImportBatch(state.projectId, files, t("import.tasks.batchLabel", { count: files.length }));
      const [graph, suggestions, sourceSummaries] = await Promise.all([
        getGraph(state.projectId),
        getRelationshipSuggestions(state.projectId),
        getSourceSummaries(state.projectId)
      ]);
      setState((current) => ({
        ...current,
        graph,
        suggestions,
        sourceSummaries,
        highlightedGraphPath: [],
        importTasks: updateImportTask(current.importTasks, taskId, {
          status: "succeeded",
          progress: 100,
          summary: t("import.tasks.summary.complete", {
            sheets: sourceSummaries.reduce((total, source) => total + source.count, 0),
            fields: graph.nodes.filter((node) => node.node_type === "field").length,
            suggestions: suggestions.length
          }),
          error: null,
          retryable: false
        }),
        importStatus: formatLoadedStatus(graph.nodes.length, suggestions.length),
        error: null
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("app.importFailed");
      setState((current) => ({
        ...current,
        importTasks: updateImportTask(current.importTasks, taskId, {
          status: "failed",
          progress: 100,
          summary: null,
          error: message,
          retryable: false
        }),
        importStatus: t("app.importFailed"),
        error: message
      }));
    }
  }
```

Pass `sourceSummaries` and `handleImportBatch` into `Workspace`.

- [ ] **Step 7: Wire Workspace props**

In `frontend/src/components/Workspace.tsx`, import `SourceSummary`, add prop:

```ts
  sourceSummaries?: SourceSummary[];
  onImportBatch?: (files: File[]) => void;
```

Set defaults:

```ts
  sourceSummaries = [],
  onImportBatch = () => undefined,
```

Pass into `ImportPanel` wherever it is rendered:

```tsx
sourceSummaries={sourceSummaries}
onImportBatch={onImportBatch}
```

- [ ] **Step 8: Run ImportPanel tests**

Run:

```bash
cd frontend
npm test -- ImportPanel.test.tsx --run
```

Expected: pass.

- [ ] **Step 9: Commit**

If git is available:

```bash
git add frontend/src/components/ImportPanel.tsx frontend/src/App.tsx frontend/src/components/Workspace.tsx frontend/src/i18n/messages.ts frontend/tests/ImportPanel.test.tsx frontend/src/state/workspaceStore.ts
git commit -m "feat: show multisource import batches in workbench"
```

## Task 9: Full Verification

**Files:**

- No new files.

- [ ] **Step 1: Run backend unit tests for touched areas**

Run:

```bash
cd backend
pytest tests/test_universal_import_phase_1.py tests/test_import_service.py tests/test_api.py tests/test_relationships.py tests/test_storage.py -q
```

Expected: all pass.

- [ ] **Step 2: Run backend lint**

Run:

```bash
cd backend
ruff check graphmind tests
```

Expected: no lint errors.

- [ ] **Step 3: Run frontend focused tests**

Run:

```bash
cd frontend
npm test -- ImportPanel.test.tsx apiClientImportBatch.test.ts --run
```

Expected: all pass.

- [ ] **Step 4: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 5: Manual smoke test**

Start backend:

```bash
cd backend
uvicorn graphmind.api.app:app --reload --host 127.0.0.1 --port 8000
```

Start frontend:

```bash
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173`, select two files:

`customers.csv`

```csv
id,name
c1,Acme
c2,Beacon
```

`orders.json`

```json
[
  {"order_id": "o1", "customer_id": "c1"},
  {"order_id": "o2", "customer_id": "c2"}
]
```

Expected:

- one batch task completes
- source overview shows table/json counts
- graph contains customer/order fields
- relationship review includes `orders.customer_id -> customers.id`

- [ ] **Step 6: Final commit**

If git is available and there are uncommitted changes:

```bash
git status --short
git add backend frontend docs/superpowers/plans/2026-06-02-universal-multisource-knowledge-graph-import-phase-1.md
git commit -m "feat: add structured multisource import phase"
```

If git is not available, record the verification output and leave files in place.

## Self-Review

- Spec coverage: Phase 1 covers batch/item persistence, multiple structured uploads, JSON array import, cross-file relationship inference, graph dedupe, API response shape, source summary, and frontend batch display. PDF, Word, Markdown, code, logs, document chunks, extracted entities, and AI enhancement are intentionally excluded for later phase plans.
- Placeholder scan: no implementation step uses TBD, TODO, or vague "handle edge cases" instructions.
- Type consistency: backend uses `ImportBatch`, `ImportItem`, `ImportBatchRepository`, and `StructuredBatchImportResult`; frontend uses `ImportBatch`, `ImportItem`, and `SourceSummary` consistently.
