# P8-B Review Analytics Cleanup Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before claiming completion.

**Goal:** Move review analytics snapshot cleanup history from browser-only memory to backend-persisted audit events, then surface the latest shared event in the SLA governance panel.

**Architecture:** Add a narrow backend audit table for manual cleanup events. The cleanup endpoint records retention days, cutoff date, removed count, remaining count, and created time in the same transaction as snapshot deletion. A new list endpoint returns recent events. Workspace snapshot and delta hydrate those events so the frontend can render backend history first and keep P8-A local history as a fallback.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy/SQLite, React, TypeScript, Vitest, Testing Library.

---

### Task 1: Backend Audit Storage

**Files:**
- Modify: `backend/graphmind/storage/models.py`
- Modify: `backend/graphmind/storage/database.py`
- Test: `backend/tests/test_storage.py`

- [x] Write a failing storage test for `ReviewAnalyticsSnapshotCleanupAudit`.
- [x] Add the SQLAlchemy model.
- [x] Add the existing-database `CREATE TABLE IF NOT EXISTS` migration and project/created index.
- [x] Verify targeted storage test passes.

### Task 2: Backend Cleanup Event API

**Files:**
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_api.py`

- [x] Write a failing API test that cleanup creates an audit event.
- [x] Add `ReviewAnalyticsSnapshotCleanupEventResponse`.
- [x] Record an audit event inside the cleanup transaction.
- [x] Add `GET /api/projects/{project_id}/review-analytics/snapshots/cleanup-events`.
- [x] Return recent events newest first and 404 for missing projects.
- [x] Include cleanup events in workspace snapshot and delta responses.
- [x] Include cleanup audit rows in workspace version signatures.
- [x] Verify targeted backend API tests pass.

### Task 3: Frontend API And State Hydration

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/state/workspaceStore.ts`
- Modify: `frontend/src/state/useWorkspaceBootstrap.ts`
- Modify: `frontend/src/state/useReviewActions.ts`
- Modify: `frontend/src/state/useImportActions.ts`
- Test: `frontend/tests/apiClientImportBatch.test.ts`
- Test: `frontend/tests/workspaceStore.test.ts`
- Test: `frontend/tests/useWorkspaceBootstrap.test.tsx`
- Test: `frontend/tests/useReviewActions.test.tsx`

- [x] Write failing tests for cleanup-event API loading.
- [x] Hydrate cleanup events from workspace snapshot and delta.
- [x] Load cleanup events in legacy bootstrap fallback.
- [x] Refresh cleanup events after review actions, duplicate cleanup, snapshot cleanup, and import refreshes.
- [x] Verify targeted frontend state/API tests pass.

### Task 4: SLA Governance UX

**Files:**
- Modify: `frontend/src/components/RelationshipReview.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/components/workbench/InsightPanel.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Test: `frontend/tests/RelationshipReview.test.tsx`

- [x] Write a failing UI test that backend cleanup events override local history.
- [x] Pass cleanup events through App, Workspace, InsightPanel, and RelationshipReview.
- [x] Render backend cleanup history as removed/remaining counts.
- [x] Preserve browser-local history fallback when backend events are empty.
- [x] Verify targeted component tests pass.

### Task 5: Documentation And Verification

**Files:**
- Modify: `docs/productization-roadmap.md`
- Modify: `docs/productization-implementation-tracker.md`
- Modify: `docs/productization-acceptance-plan.md`
- Create: `docs/superpowers/plans/2026-06-11-p8b-review-analytics-cleanup-audit.md`

- [x] Record P8-B scope and future boundaries.
- [x] Run targeted backend/frontend checks.
- [x] Run full backend tests/lint and frontend tests/lint/build/layout/quality.
- [x] Record verification evidence.

### Verification Commands

```bash
cd backend && . .venv/bin/activate && pytest tests/test_storage.py::test_initialize_database_creates_review_analytics_cleanup_audit_table tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_cleanup_events_returns_404_for_missing_project -q
cd frontend && npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts useWorkspaceBootstrap.test.tsx useReviewActions.test.tsx RelationshipReview.test.tsx --run
cd frontend && npm run lint
cd backend && . .venv/bin/activate && ruff check graphmind/api/routes.py graphmind/api/schemas.py graphmind/storage/models.py graphmind/storage/database.py tests/test_api.py tests/test_storage.py
cd backend && . .venv/bin/activate && pytest -q
cd backend && . .venv/bin/activate && ruff check graphmind tests
cd frontend && npm test
cd frontend && npm run build
cd frontend && npm run audit:quality
cd frontend && npm run audit:layout
```

### Verification Evidence

- Targeted backend:
  `cd backend && . .venv/bin/activate && pytest tests/test_storage.py::test_initialize_database_creates_review_analytics_cleanup_audit_table tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_cleanup_events_returns_404_for_missing_project -q`
  reported 3 passed.
- Targeted frontend:
  `cd frontend && npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts useWorkspaceBootstrap.test.tsx useReviewActions.test.tsx RelationshipReview.test.tsx --run`
  reported 5 files and 50 tests passed.
- Frontend type check:
  `cd frontend && npm run lint` exited 0.
- Backend targeted lint:
  `cd backend && . .venv/bin/activate && ruff check graphmind/api/routes.py graphmind/api/schemas.py graphmind/storage/models.py graphmind/storage/database.py tests/test_api.py tests/test_storage.py`
  reported all checks passed.
- Backend regression check:
  `cd backend && . .venv/bin/activate && pytest tests/test_api_workspace_version_phase_p21.py::test_workspace_delta_returns_not_modified_for_matching_version tests/test_storage.py::test_initialize_database_creates_review_analytics_cleanup_audit_table tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_cleanup_events_returns_404_for_missing_project -q`
  reported 4 passed after moving workspace version calculation after snapshot
  hydration side effects.
- Backend full:
  `cd backend && . .venv/bin/activate && pytest -q` reported 250 passed.
- Backend full lint:
  `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported
  all checks passed.
- Frontend full:
  `cd frontend && npm test` reported 44 files and 344 tests passed. The only
  output was the existing Node `--localstorage-file` warning.
- Frontend production build:
  `cd frontend && npm run build` exited 0.
- Frontend quality audit:
  `cd frontend && npm run audit:quality` reported `buildWarningCount=0` and
  passed.
- Frontend layout audit:
  `cd frontend && npm run audit:layout` reported 60 viewport/state checks
  passed. The generated summary at
  `tmp-layout-audit-auto/layout-audit-summary.json` reported
  `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`.

### Self-Review

- Spec coverage: backend storage, API contract, workspace hydration, frontend fallback behavior, docs, and verification are covered.
- Placeholder scan: no unresolved placeholder markers remain.
- Scope boundary: scheduled cleanup, user attribution, per-project retention defaults, and organization-level audit logs remain future work.
