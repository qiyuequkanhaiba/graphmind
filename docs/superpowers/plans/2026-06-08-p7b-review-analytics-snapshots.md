# P7-B Review Analytics Snapshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist project-level daily review analytics snapshots and render a compact historical trend summary in the review SLA panel.

**Architecture:** Keep P7-B project-scoped and local-first. The backend stores one analytics payload per project, day, and window when trend data is requested; the frontend loads the snapshot sequence through the existing review analytics state path and renders a small textual trend summary without adding a charting library.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, pytest, React, TypeScript, Vitest, Testing Library.

---

### Task 1: Backend Snapshot Storage And Trend API

**Files:**
- Modify: `backend/graphmind/storage/models.py`
- Modify: `backend/graphmind/storage/database.py`
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_api.py`
- Test: `backend/tests/test_storage.py`

- [x] Write failing API tests for persisted review analytics trend snapshots.
- [x] Verify tests fail because `ReviewAnalyticsSnapshot` and the trend endpoint do not exist.
- [x] Add `review_analytics_snapshots` storage model and SQLite migration.
- [x] Add trend response schemas.
- [x] Implement `GET /api/projects/{project_id}/review-analytics/trend?window=30d&days=14`.
- [x] Upsert today's analytics snapshot when the trend endpoint is requested.
- [x] Verify backend targeted tests pass.

### Task 2: Frontend Trend State And UI

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/state/workspaceStore.ts`
- Modify: `frontend/src/state/useWorkspaceBootstrap.ts`
- Modify: `frontend/src/state/useReviewActions.ts`
- Modify: `frontend/src/state/useImportActions.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/components/workbench/InsightPanel.tsx`
- Modify: `frontend/src/components/RelationshipReview.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/tests/apiClientImportBatch.test.ts`
- Test: `frontend/tests/workspaceStore.test.ts`
- Test: `frontend/tests/RelationshipReview.test.tsx`
- Test: `frontend/tests/InsightPanel.test.tsx`
- Test: `frontend/tests/useReviewActions.test.tsx`

- [x] Write failing tests for trend client loading, state hydration, prop pass-through, and UI rendering.
- [x] Verify tests fail because the trend client, state field, props, and UI do not exist.
- [x] Add `ReviewAnalyticsTrend` types and `getReviewAnalyticsTrend`.
- [x] Load trend snapshots in legacy bootstrap and after review/import refresh flows.
- [x] Pass trend data through `App`, `Workspace`, `InsightPanel`, and `RelationshipReview`.
- [x] Render snapshot count, overdue trend, and evidence coverage trend in the SLA panel.
- [x] Verify frontend targeted tests pass.

### Task 3: Documentation And Verification

**Files:**
- Modify: `docs/productization-roadmap.md`
- Modify: `docs/productization-implementation-tracker.md`
- Modify: `docs/productization-acceptance-plan.md`
- Create: `docs/superpowers/plans/2026-06-08-p7b-review-analytics-snapshots.md`

- [x] Record P7-B scope and future boundaries.
- [x] Run backend full tests/lint and frontend full tests/lint/build/layout/quality.
- [x] Record full verification evidence after commands pass.

### Verification Evidence

- Backend targeted:
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_endpoint_reports_sla_trends_and_project_scope tests/test_api.py::test_review_analytics_endpoint_returns_404_for_missing_project tests/test_api.py::test_review_analytics_trend_endpoint_persists_today_and_returns_snapshots tests/test_api.py::test_review_analytics_trend_endpoint_returns_404_for_missing_project tests/test_storage.py::test_initialize_database_creates_review_analytics_snapshot_table -q`
  reported 6 passed.
- Frontend targeted:
  `cd frontend && npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx useReviewActions.test.tsx useWorkspaceBootstrap.test.tsx useImportActions.test.tsx useAiActions.test.tsx --run`
  reported 8 files and 52 tests passed.
- Frontend type check:
  `cd frontend && npm run lint`
  exited 0 during implementation.
- Backend full:
  `cd backend && . .venv/bin/activate && pytest -q`
  reported 246 passed.
- Backend lint:
  `cd backend && . .venv/bin/activate && ruff check graphmind tests`
  reported all checks passed after import sorting was fixed.
- Frontend full:
  `cd frontend && npm test`
  reported 44 files and 337 tests passed. The only output was the existing Node
  `--localstorage-file` warning.
- Frontend type check:
  `cd frontend && npm run lint`
  exited 0.
- Frontend production build:
  `cd frontend && npm run build`
  exited 0 with no Vite build warnings.
- Frontend quality audit:
  `cd frontend && npm run audit:quality`
  reported `buildWarningCount=0` and passed.
- Frontend layout audit:
  `cd frontend && npm run audit:layout`
  reported 60 viewport/state checks passed. The generated summary at
  `tmp-layout-audit-auto/layout-audit-summary.json` reported
  `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`.

### Self-Review

- Spec coverage: backend snapshot persistence, trend API, frontend state, UI, docs, and verification are covered.
- Placeholder scan: no unresolved placeholder markers remain.
- Type consistency: backend `review_analytics_snapshots` maps to frontend `ReviewAnalyticsTrend.snapshots`.
