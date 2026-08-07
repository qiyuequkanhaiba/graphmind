# P8-A Review Analytics Governance UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn review analytics snapshot governance from a one-click cleanup into an operator-friendly manual workflow with retention choice, cleanup feedback, and local audit history.

**Architecture:** Keep P8-A frontend-led and local-first. The backend contract already accepts a retention payload, so the API client becomes parameterized while the review panel owns retention selection, success feedback, and browser-local cleanup history. No background scheduler, new backend audit table, or multi-user attribution is introduced.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, FastAPI/Pydantic compatibility tests, CSS.

---

### Task 1: API Client Retention Parameter

**Files:**
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/tests/apiClientImportBatch.test.ts`

- [x] Write a failing test that calls `cleanupReviewAnalyticsSnapshots(3, 90)` and expects `{ retention_days: 90 }` in the JSON body.
- [x] Verify the test fails because the client always sends 30 days.
- [x] Add an optional `retentionDays = 30` parameter to `cleanupReviewAnalyticsSnapshots`.
- [x] Verify the targeted API client test passes.

### Task 2: Review Action Cleanup Result

**Files:**
- Modify: `frontend/src/state/useReviewActions.ts`
- Test: `frontend/tests/useReviewActions.test.tsx`

- [x] Write a failing test that calls `handleCleanupAnalyticsSnapshots(90)` and expects the cleanup endpoint body to use 90 days.
- [x] Extend `handleCleanupAnalyticsSnapshots` to accept a retention days argument.
- [x] Keep post-cleanup refresh behavior unchanged.
- [x] Verify targeted hook tests pass.

### Task 3: Relationship Review Governance UX

**Files:**
- Modify: `frontend/src/components/RelationshipReview.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/tests/RelationshipReview.test.tsx`

- [x] Write failing UI tests for retention selector, cleanup success feedback, and local cleanup history.
- [x] Add a retention selector with 30, 90, 180, and 365 day options.
- [x] Pass the selected retention value to the cleanup handler.
- [x] Store a compact local audit record after cleanup is clicked: retention days, expired count, snapshot count, and cleanup timestamp.
- [x] Render the latest local cleanup record in the snapshot governance row.
- [x] Show accessible cleanup feedback after the handler runs.
- [x] Verify targeted component tests pass.

### Task 4: Prop Pass-Through

**Files:**
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/components/workbench/InsightPanel.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/tests/Workspace.test.tsx`
- Test: `frontend/tests/InsightPanel.test.tsx`

- [x] Update cleanup callback types from `() => void` to `(retentionDays: number) => void`.
- [x] Write/adjust pass-through tests to prove retention selection reaches the top-level handler.
- [x] Verify targeted pass-through tests pass.

### Task 5: Documentation And Verification

**Files:**
- Modify: `docs/productization-roadmap.md`
- Modify: `docs/productization-implementation-tracker.md`
- Modify: `docs/productization-acceptance-plan.md`
- Create: `docs/superpowers/plans/2026-06-11-p8a-review-analytics-governance-ux.md`

- [x] Record P8-A scope and future boundaries.
- [x] Run targeted backend/frontend checks.
- [x] Run full backend tests/lint and frontend tests/lint/build/layout/quality.
- [x] Record verification evidence.

### Verification Commands

```bash
cd frontend && npm test -- apiClientImportBatch.test.ts useReviewActions.test.tsx RelationshipReview.test.tsx InsightPanel.test.tsx Workspace.test.tsx --run
cd frontend && npm run lint
cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_snapshot_summary_returns_404_for_missing_project -q
cd backend && . .venv/bin/activate && pytest -q
cd backend && . .venv/bin/activate && ruff check graphmind tests
cd frontend && npm test
cd frontend && npm run build
cd frontend && npm run audit:quality
cd frontend && npm run audit:layout
```

### Verification Evidence

- Frontend targeted:
  `cd frontend && npm test -- apiClientImportBatch.test.ts useReviewActions.test.tsx RelationshipReview.test.tsx InsightPanel.test.tsx Workspace.test.tsx --run`
  reported 5 files and 95 tests passed.
- Frontend type check:
  `cd frontend && npm run lint`
  exited 0 during implementation.
- Backend targeted:
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_review_analytics_snapshot_summary_and_cleanup tests/test_api.py::test_review_analytics_snapshot_summary_returns_404_for_missing_project -q`
  reported 2 passed.
- Backend full:
  `cd backend && . .venv/bin/activate && pytest -q`
  reported 248 passed.
- Backend lint:
  `cd backend && . .venv/bin/activate && ruff check graphmind tests`
  reported all checks passed.
- Frontend full:
  `cd frontend && npm test`
  reported 44 files and 342 tests passed. The only output was the existing Node
  `--localstorage-file` warning.
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

- Spec coverage: API parameterization, hook action, UI feedback, local audit history, prop pass-through, docs, and verification are covered.
- Placeholder scan: no unresolved placeholder markers remain.
- Type consistency: cleanup callbacks use `(retentionDays: number) => void`, and local cleanup history stays frontend-only.
- Scope boundary: backend audit logs, background cleanup scheduling, shared multi-user audit history, and per-project retention persistence remain future work.
