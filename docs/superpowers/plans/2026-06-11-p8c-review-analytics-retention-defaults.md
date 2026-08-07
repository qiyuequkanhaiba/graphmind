# P8-C Review Analytics Retention Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before claiming completion.

**Goal:** Close the remaining review analytics retention-default gap by making snapshot retention a project-level setting and adding an explicit request-time cleanup option that stays local-first.

**Architecture:** Extend project settings with a `review_analytics` section. The backend continues to whitelist retention windows to 30, 90, 180, and 365 days. Snapshot summary and cleanup defaults read the project setting when callers do not provide an explicit retention value. When `auto_cleanup_enabled` is true, review analytics trend hydration performs request-time cleanup before returning snapshot governance data. No background scheduler, user attribution, organization tenancy, or hosted audit system is introduced.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy/SQLite JSON settings, React, TypeScript, Vitest, Testing Library.

---

### Task 1: Backend Settings Contract

**Files:**
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_api.py`

- [x] Write failing tests that project settings include default `review_analytics`.
- [x] Write failing tests that saving settings persists `retention_days` and `auto_cleanup_enabled`.
- [x] Add settings schema and merge/normalization helpers.
- [x] Verify targeted settings tests pass.

### Task 2: Retention Defaults And Request-Time Cleanup

**Files:**
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_api.py`

- [x] Write failing tests that snapshot summary defaults to the project retention window.
- [x] Write failing tests that cleanup without payload uses the project retention window.
- [x] Write failing tests that auto cleanup removes expired snapshots during trend hydration.
- [x] Refactor cleanup logic into a helper shared by manual cleanup and auto cleanup.
- [x] Verify targeted analytics tests pass.

### Task 3: Frontend Settings UX

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/state/workspaceStore.ts`
- Modify: `frontend/src/components/workbench/AISettingsPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Test: `frontend/tests/ChatPanel.test.tsx`
- Test: `frontend/tests/App.test.tsx`
- Test: `frontend/tests/apiClientImportBatch.test.ts`

- [x] Write failing tests for settings types/API payload with `review_analytics`.
- [x] Add retention selector and auto cleanup checkbox to the settings dialog.
- [x] Preserve existing AI/vector settings behavior.
- [x] Verify targeted frontend tests pass.

### Task 4: Documentation And Verification

**Files:**
- Modify: `docs/productization-roadmap.md`
- Modify: `docs/productization-implementation-tracker.md`
- Modify: `docs/productization-acceptance-plan.md`
- Create: `docs/superpowers/plans/2026-06-11-p8c-review-analytics-retention-defaults.md`

- [x] Record P8-C scope and future boundaries.
- [x] Run targeted backend/frontend checks.
- [x] Run full backend tests/lint and frontend tests/lint/build/layout/quality.
- [x] Record verification evidence.

### Verification Commands

```bash
cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_project_settings_return_ai_vector_and_review_analytics_defaults tests/test_api.py::test_project_settings_can_save_review_analytics_retention_defaults tests/test_api.py::test_review_analytics_snapshot_summary_uses_project_retention_default tests/test_api.py::test_review_analytics_cleanup_uses_project_retention_default tests/test_api.py::test_review_analytics_auto_cleanup_runs_during_trend_hydration -q
cd frontend && npm test -- apiClientImportBatch.test.ts ChatPanel.test.tsx App.test.tsx --run
cd frontend && npm run lint
cd backend && . .venv/bin/activate && ruff check graphmind/api/routes.py graphmind/api/schemas.py tests/test_api.py
cd backend && . .venv/bin/activate && pytest -q
cd backend && . .venv/bin/activate && ruff check graphmind tests
cd frontend && npm test
cd frontend && npm run build
cd frontend && npm run audit:quality
cd frontend && npm run audit:layout
```

### Verification Evidence

- Targeted backend:
  `cd backend && . .venv/bin/activate && pytest tests/test_api.py::test_project_settings_return_ai_vector_and_review_analytics_defaults tests/test_api.py::test_project_settings_can_be_saved_and_reloaded tests/test_api.py::test_project_settings_normalizes_review_analytics_retention tests/test_api.py::test_review_analytics_snapshot_summary_uses_project_retention_default tests/test_api.py::test_review_analytics_cleanup_uses_project_retention_default tests/test_api.py::test_review_analytics_auto_cleanup_runs_during_trend_hydration -q`
  reported 6 passed.
- Targeted frontend:
  `cd frontend && npm test -- apiClientImportBatch.test.ts ChatPanel.test.tsx App.test.tsx --run`
  reported 3 files and 58 tests passed.
- Frontend type check:
  `cd frontend && npm run lint` exited 0.
- Backend targeted lint:
  `cd backend && . .venv/bin/activate && ruff check graphmind/api/routes.py graphmind/api/schemas.py tests/test_api.py`
  reported all checks passed.
- Legacy settings compatibility regression:
  `cd frontend && npm test -- workspaceStore.test.ts ChatPanel.test.tsx --run`
  first reproduced missing `review_analytics` defaults, then reported 2 files
  and 17 tests passed after frontend settings normalization.
- Layout audit CI exit regression:
  `cd frontend && npm test -- layoutAuditScript.test.js --run` first
  reproduced that the audit script did not explicitly exit after writing its
  report, then reported 1 file and 4 tests passed after the exit-path fix.
- Full backend behavior:
  `cd backend && . .venv/bin/activate && pytest -q` reported 254 passed.
- Full backend lint:
  `cd backend && . .venv/bin/activate && ruff check graphmind tests` reported
  all checks passed.
- Full frontend behavior:
  `cd frontend && npm test` reported 44 files and 349 tests passed.
- Full frontend type/build:
  `cd frontend && npm run lint` and `cd frontend && npm run build` exited 0.
- Full frontend layout:
  `cd frontend && npm run audit:layout` exited 0 and reported 60
  viewport/state checks. Summary reported `resultCount: 60`,
  `problemCount: 0`, `consoleIssueCount: 0`, and
  `unexpectedConsoleIssueCount: 0`.
- Full frontend quality:
  `cd frontend && npm run audit:quality` exited 0 and reported
  `initialJsKb=289`, `largestAsyncJsKb=504`, `cssKb=144`, and
  `buildWarningCount=0`.
