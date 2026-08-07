# Import Health Overview Module Phase 36 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move import health overview calculation into the import health model module.

**Architecture:** Extend `frontend/src/components/importHealthQueue.ts` into the shared import health model for overview and queue rules. Keep lightweight structural input types so the module does not depend on `ImportPanel` UI types. `ImportPanel` imports `buildImportHealthOverview` and `buildImportHealthQueue` from the same module.

**Tech Stack:** TypeScript, React, Vitest.

---

### Task 1: Overview Extraction

**Files:**
- Modify: `frontend/src/components/importHealthQueue.ts`
- Modify: `frontend/src/components/ImportPanel.tsx`

- [x] Move `buildImportHealthOverview` into the import health module.
- [x] Add lightweight structural input types for data stats, tasks, source summaries, relationship candidates, and governance summary.
- [x] Update `ImportPanel` to import the overview builder.

### Task 2: Overview Tests

**Files:**
- Modify: `frontend/tests/ImportPanelQueue.test.ts`

- [x] Add waiting-state overview test.
- [x] Add attention-state overview test.
- [x] Add healthy-state overview test.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- ImportPanelQueue.test.ts ImportPanel.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: frontend health-model extraction only.
- Safety: no UI, API, backend, or behavior changes.
- Follow-up: rename `importHealthQueue.ts` to `importHealth.ts` if more health model helpers move into it.
