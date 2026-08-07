# Import Partial Failure Isolation Phase 14 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let mixed multi-file import batches keep successful files and graph output when one or more files fail to parse or persist.

**Architecture:** Keep the existing synchronous FastAPI batch flow and SQLite transaction scope. Handle failures at the per-item boundary inside `ImportService.import_structured_batch()`, persist failed item status/stage metadata, continue processing the remaining files, and mark the batch as `partial` when at least one item succeeds and at least one item fails. If every item fails, mark the batch `failed` and raise a `ValueError` so the API still returns `400`.

**Tech Stack:** FastAPI, SQLAlchemy, pandas, existing document/code import parsers, pytest, React, TypeScript, Vitest.

---

## File Structure

- Modify: `backend/graphmind/storage/repositories.py`
  - Allow `update_item_stage()` to record `failed` item status and failed stage entries.
- Modify: `backend/graphmind/services/import_service.py`
  - Catch per-file exceptions inside batch imports.
  - Continue graph generation for successful structured/document/code items.
  - Summarize succeeded and failed item counts.
- Modify: `backend/tests/test_universal_import_phase_1.py`
  - Add service-level and API-level coverage for a valid CSV plus invalid JSON in one batch.
- Modify: `frontend/src/i18n/messages.ts`
  - Add `partial` import task status labels in Chinese and English.
- Modify: `frontend/src/components/ImportPanel.tsx`
  - Accept and render `partial` task status.
- Modify: `frontend/src/App.tsx`
  - Map batch `partial` status to an import task status that the task list can display.
- Modify: `frontend/tests/ImportPanel.test.tsx`
  - Assert partial import tasks and failed stage details are visible.
- Modify: `frontend/tests/App.test.tsx`
  - Assert a partial batch response renders as partial rather than failed or succeeded.

## Task 1: Backend Service Partial Failure Behavior

**Files:**
- Modify: `backend/tests/test_universal_import_phase_1.py`
- Modify: `backend/graphmind/storage/repositories.py`
- Modify: `backend/graphmind/services/import_service.py`

- [x] **Step 1: Write failing service test**

Add `test_import_service_keeps_successful_items_when_batch_item_fails` to `backend/tests/test_universal_import_phase_1.py`.

The test should:

- Create `customers.csv` with one row.
- Create `broken.json` with invalid JSON content.
- Call `ImportService.import_structured_batch(project_id, [customers, broken], label="Partial batch")`.
- Assert the returned result has `dataset_count == 1`.
- Query `ImportBatch` and `ImportItem`.
- Assert batch status is `partial`.
- Assert the CSV item is `succeeded`.
- Assert the JSON item is `failed`, has a non-empty `error_message`, and includes a failed stage entry.

Use this assertion shape:

```python
assert batch.status == "partial"
assert batch.summary["succeeded_item_count"] == 1
assert batch.summary["failed_item_count"] == 1
assert [(item.filename, item.status) for item in items] == [
    ("broken.json", "failed"),
    ("customers.csv", "succeeded"),
]
failed_item = items[0]
assert failed_item.error_message
assert failed_item.summary["stage"] == "failed"
assert failed_item.summary["stages"][-1]["name"] == "failed"
assert failed_item.summary["stages"][-1]["status"] == "failed"
```

- [x] **Step 2: Run service test to verify RED**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_service_keeps_successful_items_when_batch_item_fails -q
```

Expected: FAIL because invalid JSON aborts the whole batch and no partial batch status is written.

- [x] **Step 3: Add failed stage support**

In `backend/graphmind/storage/repositories.py`:

- Add `"failed": 100` to `_IMPORT_STAGE_PROGRESS`.
- Change `update_item_stage()` so `status == "failed"` sets `item.status = "failed"` instead of the stage name.
- Keep existing behavior for indexed success.

Target logic:

```python
if status == "failed":
    item.status = "failed"
elif stage == "indexed":
    item.status = "succeeded"
else:
    item.status = stage
```

- [x] **Step 4: Catch per-item failures in batch import**

In `ImportService.import_structured_batch()`:

- Add `failed_item_ids: list[int] = []` near `item_ids`.
- Wrap each file's parsing/persistence work in `try/except Exception as exc`.
- In `except`, append `item.id` to `failed_item_ids`, call:

```python
batch_repository.update_item_stage(
    item,
    "failed",
    status="failed",
    stage_summary=str(exc),
    summary={"failed_stage": (item.summary or {}).get("stage", "staged")},
    error_message=str(exc),
)
```

- Continue to the next source path.
- Only run `infer_relationships`, `build_graph`, `resolve_cross_source_entities`, and final `indexed` updates for successful items.
- Set batch status:
  - `succeeded` when `failed_item_ids` is empty.
  - `partial` when at least one item succeeded and at least one item failed.
  - `failed` and raise `ValueError("All import batch items failed")` when all items failed.
- Add `succeeded_item_count` and `failed_item_count` to the batch summary.

- [x] **Step 5: Run service test to verify GREEN**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_service_keeps_successful_items_when_batch_item_fails -q
```

Expected: PASS.

## Task 2: Backend API Partial Response

**Files:**
- Modify: `backend/tests/test_universal_import_phase_1.py`

- [x] **Step 1: Write failing API test**

Add `test_import_batch_endpoint_returns_partial_when_one_file_fails` to `backend/tests/test_universal_import_phase_1.py`.

The test should:

- Upload `customers.csv` and invalid `broken.json`.
- Assert response status `200`.
- Assert body status `partial`.
- Assert `summary.succeeded_item_count == 1` and `summary.failed_item_count == 1`.
- Assert response items include one `succeeded` item and one `failed` item.
- Assert the failed item includes an `error` and failed stage metadata.
- Assert the graph endpoint still returns nodes.

- [x] **Step 2: Run API test to verify RED or GREEN**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_batch_endpoint_returns_partial_when_one_file_fails -q
```

Expected before Task 1 implementation: FAIL. Expected after Task 1 implementation: PASS unless the API catches `partial` as an error.

- [x] **Step 3: Keep API behavior minimal**

If the API test fails because `partial` is treated as an error, adjust only the `POST /import-batches` route so it returns the saved batch when `ImportService.import_structured_batch()` returns normally. Do not add new schemas; `ImportBatchResponse.status` already accepts any string.

- [x] **Step 4: Run backend focused tests**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py -q
```

Expected: PASS.

## Task 3: Frontend Partial Status Display

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/tests/ImportPanel.test.tsx`

- [x] **Step 1: Write failing ImportPanel test**

In `frontend/tests/ImportPanel.test.tsx`, add a task with:

```ts
{
  id: "task-partial",
  label: "2 个文件批量导入",
  kind: "batch",
  status: "partial",
  progress: 100,
  summary: "1 个文件完成，1 个文件失败。",
  error: null,
  retryable: false,
  createdAt: Date.now(),
  stages: [
    {
      name: "failed",
      status: "failed",
      progress: 100,
      summary: "Unexpected token",
      source: "broken.json"
    }
  ]
}
```

Assert the task region contains:

- `部分完成`
- `broken.json · 失败`
- `Unexpected token`

- [x] **Step 2: Run ImportPanel test to verify RED**

Run:

```bash
cd frontend && npm test -- ImportPanel.test.tsx --run
```

Expected: FAIL because `partial` and `failed` stage labels are not localized and `ImportTaskStatus` does not include partial.

- [x] **Step 3: Implement partial/failed labels**

In `frontend/src/components/ImportPanel.tsx`:

- Add `"partial"` to `ImportTaskStatus`.
- Add `partial: "import.tasks.status.partial"` to `importTaskStatusLabels`.
- Add `failed: "import.tasks.stage.failed"` to `formatImportStageName()` label keys.

In `frontend/src/i18n/messages.ts`, add:

```ts
"import.tasks.status.partial": "部分完成",
"import.tasks.stage.failed": "失败",
```

and English:

```ts
"import.tasks.status.partial": "Partial",
"import.tasks.stage.failed": "Failed",
```

- [x] **Step 4: Run ImportPanel test to verify GREEN**

Run:

```bash
cd frontend && npm test -- ImportPanel.test.tsx --run
```

Expected: PASS.

## Task 4: Frontend App Partial Batch Mapping

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/tests/App.test.tsx`

- [x] **Step 1: Write failing App test**

In the existing batch upload area of `frontend/tests/App.test.tsx`, add a test where `/api/projects/42/import-batches` returns:

- `status: "partial"`
- one item with `status: "succeeded"`
- one item with `status: "failed"`, `error: "Unexpected token"`, and `summary.stages` containing `{ name: "failed", status: "failed", progress: 100, summary: "Unexpected token" }`

Assert the import task region contains:

- `部分完成`
- `broken.json · 失败`
- `Unexpected token`

- [x] **Step 2: Run App test to verify RED**

Run:

```bash
cd frontend && npm test -- App.test.tsx --run
```

Expected: FAIL because `partial` is currently mapped to the existing task status type incorrectly.

- [x] **Step 3: Map partial batch status**

In `frontend/src/App.tsx`, update the batch task status mapping so:

- `batch.status === "succeeded"` maps to `succeeded`
- `batch.status === "partial"` maps to `partial`
- `batch.status === "failed"` maps to `failed`
- everything else maps to `running`

Keep `buildBatchImportTaskStages(batch)` unchanged except it should now render failed stages once Task 3 adds the label.

- [x] **Step 4: Run App test to verify GREEN**

Run:

```bash
cd frontend && npm test -- App.test.tsx --run
```

Expected: PASS.

## Task 5: Verification

**Files:**
- All modified backend/frontend files.

- [x] **Step 1: Run backend focused tests**

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

- [x] **Step 3: Run frontend focused tests**

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

- Spec coverage: Implements the design risk mitigation for mixed-batch failures without expanding parser scope.
- Placeholder scan: No TODO/TBD placeholders remain.
- Type consistency: Backend uses `partial`, `failed`, `succeeded`; frontend adds `partial` task status and `failed` stage label.
