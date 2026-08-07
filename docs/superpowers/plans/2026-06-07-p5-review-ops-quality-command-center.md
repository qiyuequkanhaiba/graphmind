# P5 Review Ops And Quality Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the confirmed P5-A optimization by adding review operations metrics, saved review filters, exportable audit reports, and updated productization documentation.

**Architecture:** Keep P5-A frontend-first and API-compatible. Add a pure `reviewOps` helper module for review metrics, filtering, storage, and report generation; keep `RelationshipReview` responsible for rendering, persistence side effects, and the browser download action.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing i18n catalog, existing CSS and productization docs.

---

### Task 1: Review Operations Helper Tests

**Files:**
- Create: `frontend/tests/reviewOps.test.ts`

- [x] Write failing tests for `buildReviewOperationsSummary`, evidence coverage, recommended next action, `filterRelationshipSuggestions`, stored filter restore, and `buildReviewAuditReport`.
- [x] Run `cd frontend && npm test -- reviewOps.test.ts --run` and verify the tests fail because `reviewOps` does not exist.

### Task 2: Review Operations Helper Implementation

**Files:**
- Create: `frontend/src/components/reviewOps.ts`

- [x] Implement `ReviewOperationsSummary`, `ReviewAuditReport`, `buildReviewOperationsSummary`, `filterRelationshipSuggestions`, `buildReviewAuditReport`, `readStoredReviewFilter`, and `persistReviewFilter`.
- [x] Run `cd frontend && npm test -- reviewOps.test.ts --run` and verify the helper tests pass.

### Task 3: Relationship Review Component Tests

**Files:**
- Modify: `frontend/tests/RelationshipReview.test.tsx`

- [x] Add failing tests for the visible operations summary.
- [x] Add failing tests for local saved review filter restore and persistence.
- [x] Add failing tests for exporting a JSON audit report with a mocked object URL.
- [x] Run `cd frontend && npm test -- RelationshipReview.test.tsx --run` and verify the new tests fail before implementation.

### Task 4: Relationship Review Component Implementation

**Files:**
- Modify: `frontend/src/components/RelationshipReview.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`

- [x] Render the P5 operations summary above the filter bar.
- [x] Use `reviewOps` filtering helpers instead of component-local duplicate logic where practical.
- [x] Persist the active review filter and restore it when no explicit parent shortcut overrides it.
- [x] Add a report export button that downloads the current review audit report as JSON.
- [x] Add Chinese and English labels.
- [x] Add compact styles that match the existing operational workbench.
- [x] Run `cd frontend && npm test -- RelationshipReview.test.tsx reviewOps.test.ts --run` and verify the component and helper tests pass.

### Task 5: Documentation Updates

**Files:**
- Modify: `docs/productization-roadmap.md`
- Modify: `docs/productization-acceptance-plan.md`
- Modify: `docs/productization-implementation-tracker.md`
- Modify: `docs/superpowers/plans/2026-06-07-p5-review-ops-quality-command-center.md`

- [x] Mark P5-A as the active/completed productization layer after implementation.
- [x] Document onboarding/recovery, performance, and hosted scale-out P5 follow-up boundaries.
- [x] Add targeted and full verification commands for P5-A.
- [x] Record verification evidence in this plan.

### Task 6: Verification And Completion Audit

**Files:**
- Modify: `docs/superpowers/plans/2026-06-07-p5-review-ops-quality-command-center.md`

- [x] Run `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx i18n.test.tsx --run`.
- [x] Run `cd frontend && npm test`.
- [x] Run `cd frontend && npm run lint`.
- [x] Run `cd frontend && npm run build`.
- [x] Run `cd frontend && npm run audit:layout`.
- [x] Run `cd frontend && npm run audit:quality`.
- [x] Run `cd backend && . .venv/bin/activate && pytest -q`.
- [x] Run `cd backend && . .venv/bin/activate && ruff check graphmind tests`.
- [x] Audit each P5-A requirement against code, docs, and command output before marking the goal complete.

### Verification Evidence

- RED helper test: `cd frontend && npm test -- reviewOps.test.ts --run` failed
  because `frontend/src/components/reviewOps.ts` did not exist.
- GREEN helper test: `cd frontend && npm test -- reviewOps.test.ts --run` --
  Passed, 1 file and 4 tests.
- RED component test: `cd frontend && npm test -- RelationshipReview.test.tsx --run`
  failed for missing operations summary, missing saved filter persistence, and
  missing export report button.
- GREEN component/helper test:
  `cd frontend && npm test -- RelationshipReview.test.tsx reviewOps.test.ts --run`
  -- Passed, 2 files and 21 tests.
- Targeted P5 frontend test:
  `cd frontend && npm test -- reviewOps.test.ts RelationshipReview.test.tsx InsightPanel.test.tsx i18n.test.tsx --run`
  -- Passed, 4 files and 28 tests.
- Frontend full test: `cd frontend && npm test` -- Passed, 44 files and 328
  tests. Vitest emitted existing `--localstorage-file` warnings.
- Frontend type check: `cd frontend && npm run lint` -- Passed.
- Frontend build: `cd frontend && npm run build` -- Passed; later residual risk
  closure split vendor chunks and removed the Vite large chunk warning.
- Frontend layout audit: `cd frontend && npm run audit:layout` -- Passed, 60
  viewport/state checks. Later residual risk closure removed React Flow
  parent-container warnings from audited responsive states.
- Frontend quality audit: `cd frontend && npm run audit:quality` -- Passed;
  later residual risk closure tightened the budget to `buildWarningCount=0`.
- Backend full suite: `cd backend && . .venv/bin/activate && pytest -q` --
  Passed, 239 tests.
- Backend lint: `cd backend && . .venv/bin/activate && ruff check graphmind tests`
  -- Passed.

### Completion Audit

- Review operations summary: implemented in
  `frontend/src/components/reviewOps.ts` and rendered by
  `frontend/src/components/RelationshipReview.tsx`; covered by
  `frontend/tests/reviewOps.test.ts` and
  `frontend/tests/RelationshipReview.test.tsx`.
- Saved review filters: implemented with `graphmind.reviewFilter` storage in
  `reviewOps`; covered by helper and component tests. Invalid or blocked storage
  falls back to `all`.
- Exportable review/audit report: implemented as a JSON Blob download in
  `RelationshipReview`; report shape covered by helper and component tests.
- Graph quality and P5 documentation: roadmap, acceptance plan, tracker, design,
  and this implementation plan document completed scope and follow-up
  boundaries.
- Onboarding/recovery, performance, and hosted scale-out: documented as future
  boundaries rather than hidden implementation gaps. Time-based review aging and
  trend reporting are deferred because current relationship suggestions do not
  expose durable public timestamps.

### Self-Review

- Spec coverage: the plan covers review operations metrics, saved filters, audit export, docs, and verification.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: helper names and component responsibilities match the design document.
