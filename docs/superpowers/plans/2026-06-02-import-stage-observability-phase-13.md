# Import Stage Observability Phase 13 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multi-file imports inspectable by showing per-file pipeline stages from staged input through indexed graph evidence.

**Architecture:** Use the existing `ImportItem.summary` JSON column rather than adding a database table. Backend writes a stable `stages` array into each item summary; frontend normalizes that array into import task stage rows and renders them in the existing import task card.

**Tech Stack:** FastAPI, SQLAlchemy, existing import services, React, TypeScript, Vitest, pytest, ruff.

---

## File Structure

- Modify: `backend/graphmind/storage/repositories.py`
  - Add small helpers to build and update import item stage summaries.
  - Preserve existing summary counts while adding `stages`.
- Modify: `backend/graphmind/services/import_service.py`
  - Update structured, document, repository, and final graph/index stages with counts.
- Modify: `backend/tests/test_universal_import_phase_1.py`
  - Assert structured batch items expose ordered stage details.
- Modify: `backend/tests/test_document_import_phase_2.py`
  - Assert document batch items expose parse/extract/graph/index stages.
- Modify: `frontend/src/api/types.ts`
  - Add import stage types and allow import item summaries to carry `stages`.
- Modify: `frontend/src/components/ImportPanel.tsx`
  - Add optional import task stage rows below task summary.
- Modify: `frontend/src/App.tsx`
  - Convert batch response item stages into import task stages.
- Modify: `frontend/src/i18n/messages.ts`
  - Add compact labels for stage names/status.
- Modify: `frontend/tests/ImportPanel.test.tsx`
  - Assert stage rows render in the import task card.
- Modify: `frontend/tests/App.test.tsx`
  - Assert a completed batch response with item stages renders per-file stage details.

## Task 1: Backend Stage Summary Helpers

**Files:**
- Modify: `backend/tests/test_universal_import_phase_1.py`
- Modify: `backend/graphmind/storage/repositories.py`

- [x] **Step 1: Write failing repository test**

Add a test that creates an import item, updates the stage to `parsed`, then `profiled`, and asserts:

- `summary["stage"] == "profiled"`
- `summary["stages"]` includes ordered entries for `staged`, `parsed`, and `profiled`
- each entry has `name`, `status`, `progress`, and `summary`

- [x] **Step 2: Run repository test**

Run: `cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_batch_repository_tracks_item_stage_summaries -q`

Expected: FAIL because stage history is not tracked yet.

- [x] **Step 3: Implement repository helpers**

In `ImportBatchRepository`, add:

- `update_item_stage(item, stage, status="complete", progress=None, stage_summary=None, summary=None, artifact_ref=None, error_message=None)`
- private helpers to merge `stages` arrays without duplicating stage names

Stage progress map:

- `staged`: 5
- `parsed`: 20
- `profiled`: 40
- `extracted`: 60
- `resolved`: 75
- `graphed`: 90
- `indexed`: 100

- [x] **Step 4: Run repository test**

Run: `cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_batch_repository_tracks_item_stage_summaries -q`

Expected: PASS.

## Task 2: Backend Import Pipeline Stage Writes

**Files:**
- Modify: `backend/tests/test_universal_import_phase_1.py`
- Modify: `backend/tests/test_document_import_phase_2.py`
- Modify: `backend/graphmind/services/import_service.py`

- [x] **Step 1: Write failing structured batch integration test**

Extend the structured batch test to load `ImportItem` rows and assert the `orders.json` item has completed stage names:

`["staged", "parsed", "profiled", "resolved", "graphed", "indexed"]`

- [x] **Step 2: Write failing document batch integration test**

Extend a document batch test to assert a Markdown item has completed stage names:

`["staged", "parsed", "extracted", "graphed", "indexed"]`

- [x] **Step 3: Run backend integration tests**

Run: `cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_service_imports_structured_batch_and_finds_cross_file_foreign_key tests/test_document_import_phase_2.py::test_batch_import_accepts_markdown_text_code_logs_docx_and_nested_json -q`

Expected: FAIL because detailed stages are not written by the import service yet.

- [x] **Step 4: Write import service stage updates**

Use `update_item_stage()`:

- after file read: `parsed`
- after profiles are created: `profiled`
- after document parse persistence begins: `parsed`
- after entities/relationships are persisted: `extracted`
- after document graph nodes/edges are persisted: `graphed`
- after cross-source resolution completes: add `resolved` to structured items
- after final batch success: add `indexed`

- [x] **Step 5: Run backend integration tests**

Run: `cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_service_imports_structured_batch_and_finds_cross_file_foreign_key tests/test_document_import_phase_2.py::test_batch_import_accepts_markdown_text_code_logs_docx_and_nested_json -q`

Expected: PASS.

## Task 3: Frontend Stage Rendering

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/tests/ImportPanel.test.tsx`

- [x] **Step 1: Write failing ImportPanel test**

Add an import task with stages:

- `staged` complete, summary `Saved upload`
- `parsed` complete, summary `Read 2 sheets`
- `indexed` complete, summary `Indexed evidence`

Assert the task card renders localized stage labels and summaries.

- [x] **Step 2: Run ImportPanel test**

Run: `cd frontend && npm test -- ImportPanel.test.tsx --run`

Expected: FAIL because task stages are not supported yet.

- [x] **Step 3: Implement types and rendering**

Add:

- `ImportStageStatus`
- `ImportStage`
- `ImportTask.stages?: ImportStage[]`

Render a compact `<ol className="import-task-stages">` under each task summary.

- [x] **Step 4: Run ImportPanel test**

Run: `cd frontend && npm test -- ImportPanel.test.tsx --run`

Expected: PASS.

## Task 4: App Batch Response Stage Mapping

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/tests/App.test.tsx`

- [x] **Step 1: Write failing App batch test**

Update the existing batch import test response so each `ImportBatch.items[].summary.stages` includes at least `parsed`, `profiled`, and `indexed`. Assert the rendered import task includes the first file name and one stage summary.

- [x] **Step 2: Run App test**

Run: `cd frontend && npm test -- App.test.tsx --run`

Expected: FAIL because batch item stages are not mapped into `ImportTask`.

- [x] **Step 3: Map batch item stages to ImportTask**

In `buildBatchImportTaskSummary()` and task updates, store `stages` on the batch import task. Use a flattened list where each stage label is prefixed by the filename, e.g. `customers.csv · Profiled`.

- [x] **Step 4: Run App test**

Run: `cd frontend && npm test -- App.test.tsx --run`

Expected: PASS.

## Task 5: Verification

**Files:**
- All modified backend/frontend files.

- [x] **Step 1: Run focused backend tests**

Run: `cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py tests/test_document_import_phase_2.py tests/test_code_repository_import_phase_3.py -q`

Expected: PASS.

- [x] **Step 2: Run backend lint**

Run: `cd backend && .venv/bin/ruff check graphmind tests`

Expected: PASS.

- [x] **Step 3: Run focused frontend tests**

Run: `cd frontend && npm test -- ImportPanel.test.tsx App.test.tsx apiClientImportBatch.test.ts --run`

Expected: PASS.

- [x] **Step 4: Run frontend build**

Run: `cd frontend && npm run build`

Expected: PASS.

## Self-Review

- Spec coverage: Implements the existing import state machine visibility without adding a migration-heavy stage table.
- Placeholder scan: No TODO/TBD placeholders remain.
- Type consistency: Backend stage entries and frontend `ImportStage` both use `name`, `status`, `progress`, and `summary`.
