# Import Batch Raw File Archive Phase 15 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every batch import item's original uploaded file path so successful and failed files remain inspectable after parsing.

**Architecture:** Copy each batch item source file into a stable workspace path immediately after creating the `ImportItem`. Store that path in `ImportItem.raw_data_ref` before parsing, so later parser failures still leave a source reference. Keep existing dataset/document copies intact for compatibility; this phase only guarantees item-level raw references and reset cleanup.

**Tech Stack:** FastAPI upload temp files, SQLAlchemy, filesystem workspace helpers, pytest, existing reset service.

---

## File Structure

- Modify: `backend/graphmind/services/import_service.py`
  - Add a batch item raw-copy helper.
  - Call it immediately after `ImportBatchRepository.create_item()`.
  - Preserve existing dataset/document raw copies.
- Modify: `backend/graphmind/services/project_data_service.py`
  - Include `ImportItem.raw_data_ref` values in project reset cleanup.
- Modify: `backend/tests/test_universal_import_phase_1.py`
  - Assert successful and failed batch items have stable raw file refs.
  - Assert reset removes batch item raw files.
- Modify: `docs/superpowers/plans/2026-06-03-import-batch-raw-file-archive-phase-15.md`
  - Track implementation progress.

## Task 1: Batch Item Raw File References

**Files:**
- Modify: `backend/tests/test_universal_import_phase_1.py`
- Modify: `backend/graphmind/services/import_service.py`

- [x] **Step 1: Write failing partial-failure raw ref assertions**

Extend `test_import_service_keeps_successful_items_when_batch_item_fails` in `backend/tests/test_universal_import_phase_1.py`.

After loading `items`, add:

```python
for item in items:
    assert item.raw_data_ref
    raw_path = tmp_workspace / item.raw_data_ref
    assert raw_path.exists()

failed_item = items[0]
assert (tmp_workspace / failed_item.raw_data_ref).read_text(encoding="utf-8") == "{not valid json"
```

This proves even failed parser items keep their raw upload.

- [x] **Step 2: Run test to verify RED**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_service_keeps_successful_items_when_batch_item_fails -q
```

Expected: FAIL because failed `broken.json` currently has an empty `raw_data_ref`.

- [x] **Step 3: Implement raw file copy helper**

In `backend/graphmind/services/import_service.py`, add:

```python
def _copy_to_batch_item_imports(
    self,
    project_id: int,
    batch_id: int,
    item_id: int,
    source_path: Path,
    import_name: str,
) -> str:
    item_dir = (
        self.paths.imports_dir
        / f"project_{project_id}"
        / f"batch_{batch_id}"
        / f"item_{item_id}"
    )
    item_dir.mkdir(parents=True, exist_ok=True)
    destination = item_dir / Path(import_name).name
    shutil.copy2(source_path, destination)
    return destination.relative_to(self.paths.root).as_posix()
```

- [x] **Step 4: Call helper before parsing**

In `ImportService.import_structured_batch()`, immediately after `create_item()` and `item_ids.append(item.id)`, set:

```python
item.raw_data_ref = self._copy_to_batch_item_imports(
    project_id=project_id,
    batch_id=batch.id,
    item_id=item.id,
    source_path=source_path,
    import_name=import_name,
)
```

Remove the structured branch line that overwrites `item.raw_data_ref` with the dataset copy. Leave `_persist_document_import()` and `_persist_repository_import()` as-is for this phase because `DocumentSource` workflows may already rely on those copies; the batch item ref should remain the first stable source ref unless those helpers intentionally overwrite it later in a follow-up.

- [x] **Step 5: Run test to verify GREEN**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_service_keeps_successful_items_when_batch_item_fails -q
```

Expected: PASS.

## Task 2: API Exposes Raw File References

**Files:**
- Modify: `backend/tests/test_universal_import_phase_1.py`

- [x] **Step 1: Write failing API assertions**

Extend `test_import_batch_endpoint_returns_partial_when_one_file_fails`.

After finding `failed_item`, add:

```python
assert failed_item["raw_data_ref"]
assert (tmp_workspace / failed_item["raw_data_ref"]).read_text(encoding="utf-8") == "{not valid json"
```

Also assert the successful item has a raw data ref:

```python
successful_item = next(item for item in body["items"] if item["status"] == "succeeded")
assert successful_item["raw_data_ref"]
```

- [x] **Step 2: Run API test**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_batch_endpoint_returns_partial_when_one_file_fails -q
```

Expected after Task 1: PASS because `_import_item_response()` already includes `raw_data_ref`.

## Task 3: Reset Cleans Batch Item Raw Files

**Files:**
- Modify: `backend/tests/test_universal_import_phase_1.py`
- Modify: `backend/graphmind/services/project_data_service.py`

- [x] **Step 1: Write failing reset cleanup assertions**

Extend `test_reset_project_data_clears_import_batches_and_items`.

Before `ProjectDataService(...).reset_project_data(project_id)`, collect:

```python
with session_factory() as session:
    item_refs = [
        item.raw_data_ref
        for item in session.query(ImportItem).filter(ImportItem.project_id == project_id).all()
    ]
    item_paths = [tmp_workspace / raw_data_ref for raw_data_ref in item_refs]
    assert item_paths
    assert all(path.exists() for path in item_paths)
```

After reset, add:

```python
assert all(not path.exists() for path in item_paths)
```

- [x] **Step 2: Run reset test to verify RED**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_reset_project_data_clears_import_batches_and_items -q
```

Expected: FAIL because reset currently collects only dataset raw refs before deleting import items.

- [x] **Step 3: Include import item raw refs in reset cleanup**

In `ProjectDataService.reset_project_data()`, before deleting `ImportItem`, query item raw refs:

```python
item_raw_data_refs = [
    raw_data_ref
    for (raw_data_ref,) in session.query(ImportItem.raw_data_ref)
    .filter(ImportItem.project_id == project_id)
    .all()
    if raw_data_ref
]
```

Then call:

```python
self._remove_import_files([*raw_data_refs, *item_raw_data_refs])
```

instead of only `raw_data_refs`.

- [x] **Step 4: Run reset test to verify GREEN**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_reset_project_data_clears_import_batches_and_items -q
```

Expected: PASS.

## Task 4: Verification

**Files:**
- All modified backend files.

- [x] **Step 1: Run focused backend tests**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py tests/test_document_import_phase_2.py tests/test_code_repository_import_phase_3.py -q
```

Expected: PASS.

- [x] **Step 2: Run backend lint**

Run:

```bash
cd backend && .venv/bin/ruff check graphmind tests
```

Expected: PASS.

- [x] **Step 3: Run frontend regression smoke**

Run:

```bash
cd frontend && npm test -- ImportPanel.test.tsx App.test.tsx apiClientImportBatch.test.ts --run
```

Expected: PASS.

- [x] **Step 4: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: PASS.

## Self-Review

- Spec coverage: Supports inspectable per-item source references, including failed files, without adding a retry endpoint.
- Placeholder scan: No TODO/TBD placeholders remain.
- Type consistency: Uses existing `ImportItem.raw_data_ref` and existing API response field names.
