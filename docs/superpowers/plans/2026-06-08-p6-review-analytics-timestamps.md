# P6 Review Analytics Timestamps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable relationship suggestion timestamps and use them for first-pass review aging analytics.

**Architecture:** Extend the existing relationship suggestion storage model and API response with UTC timestamps. Keep frontend analytics in the existing pure `reviewOps` helper so aging metrics, filtering, and export payloads stay testable without a backend analytics endpoint.

**Tech Stack:** Python, SQLAlchemy, SQLite migration helpers, FastAPI/Pydantic schemas, React/TypeScript, Vitest, Testing Library.

---

### Task 1: Backend Timestamp Tests

**Files:**
- Modify: `backend/tests/test_storage.py`
- Modify: `backend/tests/test_api.py`

- [x] Add failing storage tests for relationship suggestion UTC timestamps and migration backfill.
- [x] Add failing API test for `created_at` and `updated_at` in relationship suggestion responses.
- [x] Run `cd backend && . .venv/bin/activate && pytest tests/test_storage.py tests/test_api.py::test_get_relationship_suggestions_maps_field_labels_for_project -q` and verify the new assertions fail.

Red evidence: targeted backend test run failed with the expected missing `RelationshipSuggestion.created_at` / `updated_at` attributes and missing migrated columns before implementation.

### Task 2: Backend Timestamp Implementation

**Files:**
- Modify: `backend/graphmind/storage/models.py`
- Modify: `backend/graphmind/storage/database.py`
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`

- [x] Add `created_at` and `updated_at` to `RelationshipSuggestion`.
- [x] Add migration/backfill for old `relationship_suggestions` tables.
- [x] Add timestamp fields to `RelationshipSuggestionResponse`.
- [x] Serialize timestamps in `_relationship_suggestion_response`.
- [x] Run the backend timestamp tests and verify they pass.

Green evidence: `cd backend && . .venv/bin/activate && pytest tests/test_storage.py tests/test_api.py::test_get_relationship_suggestions_maps_field_labels_for_project tests/test_api.py::test_get_relationship_suggestions_uses_none_for_missing_target -q` reported 11 passed.

### Task 3: Frontend Aging Analytics Tests

**Files:**
- Modify: `frontend/tests/reviewOps.test.ts`
- Modify: `frontend/tests/RelationshipReview.test.tsx`

- [x] Add failing `reviewOps` tests for aged pending count, oldest pending age, missing timestamp fallback, and report timestamps.
- [x] Add failing `RelationshipReview` test for aging metrics in the operations summary.
- [x] Run `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx --run` and verify the new assertions fail.

Red evidence: targeted frontend run failed on missing aging summary fields, missing `aging` recommendation, missing `createdAt` / `updatedAt` in audit export, and missing aging metrics in the operations summary.

### Task 4: Frontend Aging Analytics Implementation

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/components/reviewOps.ts`
- Modify: `frontend/src/components/RelationshipReview.tsx`
- Modify: `frontend/src/i18n/messages.ts`

- [x] Add optional timestamp fields to `RelationshipSuggestion`.
- [x] Extend `ReviewOperationsSummary` with aged pending and oldest pending age fields.
- [x] Include `createdAt` and `updatedAt` in review audit exports.
- [x] Render the aging metric only when timestamp evidence exists.
- [x] Add Chinese and English labels.
- [x] Run frontend targeted tests and verify they pass.

Green evidence: `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx --run` reported 2 files and 24 tests passed.

### Task 5: Documentation And Verification

**Files:**
- Modify: `docs/productization-roadmap.md`
- Modify: `docs/productization-implementation-tracker.md`
- Modify: `docs/productization-acceptance-plan.md`
- Modify: `docs/superpowers/plans/2026-06-08-p6-review-analytics-timestamps.md`

- [x] Mark P6-A as implemented after verification.
- [x] Document that trend charts and SLA reporting remain future work.
- [x] Run backend targeted tests, frontend targeted tests, full frontend/backend gates, layout audit, and quality audit.
- [x] Record verification evidence and completion audit in this plan.

Verification evidence:

- Backend targeted: `cd backend && . .venv/bin/activate && pytest tests/test_storage.py tests/test_api.py::test_get_relationship_suggestions_maps_field_labels_for_project tests/test_api.py::test_get_relationship_suggestions_uses_none_for_missing_target -q` reported 11 passed.
- Frontend targeted: `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx --run` reported 2 files and 24 tests passed.
- URL import security: `cd backend && . .venv/bin/activate && pytest tests/test_url_import_phase_60.py -q` reported 15 passed.
- Backend full: `cd backend && . .venv/bin/activate && pytest -q` reported 241 passed.
- Backend lint: `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported all checks passed.
- Frontend full: `cd frontend && npm test` reported 44 files and 332 tests passed.
- Frontend type check: `cd frontend && npm run lint` exited 0.
- Frontend build: `cd frontend && npm run build` exited 0 without large chunk warnings after vendor chunk splitting.
- Layout audit: `cd frontend && npm run audit:layout` reported 60 viewport/state checks passed with `problemCount=0`, `consoleIssueCount=0`, and `unexpectedConsoleIssueCount=0`.
- Quality audit: `cd frontend && npm run audit:quality` reported quality audit passed.

Completion audit:

- Implemented: durable UTC timestamps, migration/backfill, API response fields, frontend aging metrics, timestamped review audit export, and productization docs.
- Deferred: trend charts, SLA dashboards, reviewer attribution, and backend analytics endpoints.

### Self-Review

- Spec coverage: storage, migration, API, frontend analytics, export, docs, and verification are covered.
- Placeholder scan: no unresolved placeholder keywords remain.
- Type consistency: timestamp names use snake_case in API responses and camelCase in audit export objects.
