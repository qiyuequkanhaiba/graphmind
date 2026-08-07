# Phase 47: Import Batch Diagnostics

## Goal

Expose richer batch/item diagnostics for document, code repository, log, JSON-document, Word, PDF, and Markdown imports without changing database schema. Diagnostics travel through existing JSON summaries and stage entries so the frontend can render them later.

## Plan

- [x] Add a regression test for mixed document and repository ZIP import diagnostics.
- [x] Extend item stage summaries with optional structured `diagnostics`.
- [x] Add per-document diagnostics for parsed/extracted stages.
- [x] Add per-repository diagnostics including parsed file count and ignored file count.
- [x] Aggregate successful item diagnostics into batch summary.
- [x] Run backend targeted tests.
- [x] Run backend lint and frontend import checks.

## Expected Outcome

Batch API responses include a `summary.diagnostics` object with chunk, entity, relationship, ignored repository file, graph, and source-kind counts. Each relevant item also exposes `summary.diagnostics`, and parsed/extracted stage entries can carry the same structured diagnostics.

## Verification

- `cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_service_adds_document_batch_diagnostics -q`
- `cd backend && .venv/bin/ruff check graphmind/storage/repositories.py graphmind/services/import_service.py tests/test_universal_import_phase_1.py`
- `cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py tests/test_document_import_phase_2.py tests/test_import_service.py tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`
- `cd frontend && npm test -- ImportTaskListCard.test.tsx ImportPanel.test.tsx importHealth.test.ts Workspace.test.tsx --run`
- `cd frontend && npm run build`
