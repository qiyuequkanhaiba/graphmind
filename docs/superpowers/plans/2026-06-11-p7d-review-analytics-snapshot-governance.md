# P7-D Review Analytics Snapshot Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit governance for persisted review analytics snapshots so local-first workspaces can inspect retention state and manually clean expired analytics history.

**Architecture:** Keep snapshot governance project-scoped, local-first, and manual. The backend owns retention summary and cleanup semantics; the frontend hydrates the summary through workspace snapshot/delta and the legacy fallback path, then exposes a compact cleanup action in the existing SLA trend panel.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, pytest, React, TypeScript, Vitest, Testing Library.

---

### Task 1: Backend Snapshot Governance API

**Files:**
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_api.py`

- [x] Write failing tests for snapshot summary and cleanup.
- [x] Verify tests fail because snapshot governance endpoints are absent.
- [x] Add snapshot summary response schema.
- [x] Add cleanup request/response schemas.
- [x] Implement `GET /api/projects/{project_id}/review-analytics/snapshots`.
- [x] Implement `POST /api/projects/{project_id}/review-analytics/snapshots/cleanup`.
- [x] Enforce a conservative retention whitelist: 30, 90, 180, and 365 days.
- [x] Return 404 for missing projects.
- [x] Verify targeted backend tests pass.

### Task 2: Workspace Hydration And Frontend Actions

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
- Test: `frontend/tests/useWorkspaceBootstrap.test.tsx`
- Test: `frontend/tests/useReviewActions.test.tsx`
- Test: `frontend/tests/InsightPanel.test.tsx`
- Test: `frontend/tests/Workspace.test.tsx`
- Test: `frontend/tests/RelationshipReview.test.tsx`

- [x] Write failing tests for API client, workspace hydration, action refresh, prop pass-through, and UI cleanup.
- [x] Verify tests fail because state and action wiring are missing.
- [x] Add frontend types for snapshot summary and cleanup result.
- [x] Add `getReviewAnalyticsSnapshotSummary` and `cleanupReviewAnalyticsSnapshots`.
- [x] Hydrate `reviewAnalyticsSnapshotSummary` from workspace snapshot and delta.
- [x] Keep legacy fallback loading through the standalone summary endpoint.
- [x] Refresh the summary after review, duplicate cleanup, analytics snapshot cleanup, and import refresh paths.
- [x] Pass summary and cleanup action through `App`, `Workspace`, `InsightPanel`, and `RelationshipReview`.
- [x] Render snapshot count, expired count, retention window, and manual cleanup action in the SLA panel.
- [x] Verify targeted frontend tests pass.

### Task 3: Documentation And Verification

**Files:**
- Modify: `docs/productization-roadmap.md`
- Modify: `docs/productization-implementation-tracker.md`
- Modify: `docs/productization-acceptance-plan.md`
- Create: `docs/superpowers/plans/2026-06-11-p7d-review-analytics-snapshot-governance.md`

- [x] Record P7-D scope and future boundaries.
- [x] Run backend full tests/lint and frontend full tests/lint/build/layout/quality.
- [x] Record full verification evidence after commands pass.

### Verification Evidence

- Backend targeted:
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_snapshot_summary_returns_404_for_missing_project -q`
  reported 3 passed during implementation.
- Frontend targeted:
  `cd frontend && npm test -- workspaceStore.test.ts useWorkspaceBootstrap.test.tsx useReviewActions.test.tsx InsightPanel.test.tsx Workspace.test.tsx apiClientImportBatch.test.ts RelationshipReview.test.tsx --run`
  reported 7 files and 100 tests passed during implementation.
- Backend full:
  `cd backend && . .venv/bin/activate && pytest -q`
  reported 248 passed.
- Backend lint:
  `cd backend && . .venv/bin/activate && ruff check graphmind tests`
  reported all checks passed.
- Frontend full:
  `cd frontend && npm test`
  reported 44 files and 341 tests passed. The only output was the existing Node
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

- Spec coverage: backend governance endpoints, workspace hydration, frontend cleanup action, docs, and verification are covered.
- Placeholder scan: no unresolved placeholder markers remain in this plan.
- Type consistency: backend `review_analytics_snapshot_summary` maps to frontend `reviewAnalyticsSnapshotSummary`.
- Scope boundary: automated schedulers, per-project custom retention settings, reviewer attribution, and multi-user SLA ownership remain future work.
