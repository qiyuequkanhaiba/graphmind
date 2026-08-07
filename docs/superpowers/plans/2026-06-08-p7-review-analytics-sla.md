# P7 Review Analytics SLA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-level review analytics API data and a frontend SLA/trend view for relationship review operations.

**Architecture:** Keep P7-A project-scoped and local-first. The backend derives analytics from existing `RelationshipSuggestion` timestamps/status/quality data, while the frontend loads the analytics beside existing suggestions/governance and renders a compact operations view inside the existing review panel.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, TypeScript, Vitest, Testing Library.

---

### Task 1: Backend Review Analytics API

**Files:**
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_api.py`

- [x] Write failing tests for `GET /api/projects/{project_id}/review-analytics`.
- [x] Verify tests fail because the endpoint and response model do not exist.
- [x] Add response schemas for SLA, aging buckets, decision trend, quality distribution, and evidence coverage.
- [x] Implement analytics aggregation from relationship suggestions with default `window=30d` and `sla_days=3`.
- [x] Verify backend targeted tests pass.

### Task 2: Frontend API And State

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/state/workspaceStore.ts`
- Modify: `frontend/src/state/useWorkspaceBootstrap.ts`
- Modify: `frontend/src/state/useReviewActions.ts`
- Test: `frontend/tests/apiClientImportBatch.test.ts`
- Test: `frontend/tests/workspaceStore.test.ts`
- Test: `frontend/tests/useReviewActions.test.tsx`

- [x] Write failing tests for analytics client fetch and workspace state hydration.
- [x] Verify tests fail because analytics type/loading is missing.
- [x] Add `ReviewAnalytics` types and `getReviewAnalytics`.
- [x] Load analytics from snapshot when available and fallback endpoint otherwise.
- [x] Refresh analytics after review and duplicate cleanup actions.
- [x] Verify frontend targeted state/client tests pass.

### Task 3: SLA Trend View And Export

**Files:**
- Modify: `frontend/src/components/RelationshipReview.tsx`
- Modify: `frontend/src/components/reviewOps.ts`
- Modify: `frontend/src/components/workbench/InsightPanel.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/tests/reviewOps.test.ts`
- Test: `frontend/tests/RelationshipReview.test.tsx`
- Test: `frontend/tests/InsightPanel.test.tsx`
- Test: `frontend/tests/Workspace.test.tsx`

- [x] Write failing tests for SLA summary rendering, trend rendering, and analytics export fields.
- [x] Verify tests fail because UI/export does not consume backend analytics.
- [x] Render a compact analytics strip in the review panel.
- [x] Add analytics data to the JSON audit export.
- [x] Pass analytics through `InsightPanel` and `Workspace`.
- [x] Verify frontend targeted UI tests pass.

### Task 4: Documentation And Verification

**Files:**
- Modify: `docs/productization-roadmap.md`
- Modify: `docs/productization-implementation-tracker.md`
- Modify: `docs/productization-acceptance-plan.md`
- Modify: `docs/superpowers/plans/2026-06-08-p7-review-analytics-sla.md`

- [x] Mark P7-A implemented after verification.
- [x] Record backend/frontend targeted and full verification evidence.
- [x] Run backend full tests/lint and frontend full tests/lint/build/layout/quality.
- [x] Record remaining future analytics scope.

### Verification Evidence

- Backend targeted:
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_workspace_snapshot_endpoint_returns_first_load_payload tests/test_api.py::test_review_analytics_endpoint_reports_sla_trends_and_project_scope tests/test_api.py::test_review_analytics_endpoint_returns_404_for_missing_project -q`
  reported 3 passed.
- Frontend UI/export targeted:
  `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx --run`
  reported 3 files and 30 tests passed.
- Frontend state/workspace targeted:
  `cd frontend && npm test -- Workspace.test.tsx App.test.tsx useWorkspaceBootstrap.test.tsx useImportActions.test.tsx useAiActions.test.tsx workspaceStore.test.ts apiClientImportBatch.test.ts useReviewActions.test.tsx --run`
  reported 8 files and 101 tests passed. The only output was the existing Node
  `--localstorage-file` warning.
- Backend full:
  `cd backend && . .venv/bin/activate && pytest -q`
  reported 243 passed.
- Backend lint:
  `cd backend && . .venv/bin/activate && ruff check graphmind tests`
  reported all checks passed after import sorting was fixed.
- Frontend full:
  `cd frontend && npm test`
  reported 44 files and 335 tests passed. The only output was the existing Node
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

- Spec coverage: backend analytics API, frontend loading, SLA/trend view, export, docs, and verification are covered.
- Placeholder scan: no unresolved placeholder markers remain.
- Type consistency: backend snake_case response names map directly to frontend snake_case API types.
