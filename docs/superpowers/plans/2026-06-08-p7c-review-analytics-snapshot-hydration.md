# P7-C Review Analytics Snapshot Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hydrate persisted review analytics trend data through the workspace snapshot/delta path and include trend snapshots in review audit exports.

**Architecture:** Keep the P7-B trend endpoint as the canonical trend computation path, but reuse its helper in workspace snapshot and delta responses. The frontend hydrates trend data from snapshot/delta when present and preserves the legacy fallback endpoint for older backends. Review audit export adds the trend payload beside current analytics.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, pytest, React, TypeScript, Vitest.

---

### Task 1: Backend Snapshot And Delta Trend Hydration

**Files:**
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_api.py`

- [x] Write failing tests requiring `review_analytics_trend` in workspace snapshot.
- [x] Verify tests fail because the snapshot response lacks trend data.
- [x] Add `review_analytics_trend` to workspace snapshot and delta schemas.
- [x] Reuse the trend response helper in workspace snapshot and delta responses.
- [x] Verify targeted backend tests pass.

### Task 2: Frontend Snapshot Hydration And Audit Export

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/state/workspaceStore.ts`
- Modify: `frontend/src/components/reviewOps.ts`
- Modify: `frontend/src/components/RelationshipReview.tsx`
- Test: `frontend/tests/workspaceStore.test.ts`
- Test: `frontend/tests/reviewOps.test.ts`

- [x] Write failing tests requiring snapshot/delta trend hydration and trend export fields.
- [x] Verify tests fail because trend hydration and export are missing.
- [x] Hydrate `reviewAnalyticsTrend` from `review_analytics_trend`.
- [x] Merge `review_analytics_trend` from workspace delta responses.
- [x] Add `reviewAnalyticsTrend` to review audit reports.
- [x] Pass trend data into the export call.
- [x] Verify targeted frontend tests pass.

### Task 3: Documentation And Verification

**Files:**
- Modify: `docs/productization-roadmap.md`
- Modify: `docs/productization-implementation-tracker.md`
- Modify: `docs/productization-acceptance-plan.md`
- Create: `docs/superpowers/plans/2026-06-08-p7c-review-analytics-snapshot-hydration.md`

- [x] Record P7-C scope and future boundaries.
- [x] Execute backend and frontend full quality gates.
- [x] Capture final verification evidence after commands pass.

### Verification Evidence

- Backend targeted:
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_endpoint_reports_sla_trends_and_project_scope tests/test_api.py::test_review_analytics_trend_endpoint_persists_today_and_returns_snapshots tests/test_storage.py::test_initialize_database_creates_review_analytics_snapshot_table -q`
  reported 4 passed.
- Frontend targeted:
  `cd frontend && npm test -- apiClientImportBatch.test.ts workspaceStore.test.ts reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx useReviewActions.test.tsx useWorkspaceBootstrap.test.tsx useImportActions.test.tsx useAiActions.test.tsx --run`
  reported 9 files and 58 tests passed.
- Frontend type check:
  `cd frontend && npm run lint`
  exited 0 during implementation.
- Backend full:
  `cd backend && . .venv/bin/activate && pytest -q`
  reported 246 passed.
- Backend lint:
  `cd backend && . .venv/bin/activate && ruff check graphmind tests`
  reported all checks passed.
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

- Spec coverage: workspace snapshot/delta hydration, frontend state, audit export, docs, and verification are covered.
- Placeholder scan: no unresolved placeholder markers remain.
- Type consistency: backend `review_analytics_trend` maps to frontend `reviewAnalyticsTrend`.
