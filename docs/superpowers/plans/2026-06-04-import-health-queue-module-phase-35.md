# Import Health Queue Module Phase 35 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move import health queue rules out of `ImportPanel.tsx` into a focused module.

**Architecture:** Create `frontend/src/components/importHealthQueue.ts` with `ImportHealthOverview`, `ImportHealthQueueItem`, and `buildImportHealthQueue`. `ImportPanel` imports the builder and type, while queue unit tests import from the new module directly.

**Tech Stack:** TypeScript, React, Vitest.

---

### Task 1: Queue Module Extraction

**Files:**
- Add: `frontend/src/components/importHealthQueue.ts`
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/tests/ImportPanelQueue.test.ts`

- [x] Move queue types and builder into a standalone module.
- [x] Import queue builder into `ImportPanel`.
- [x] Update queue tests to target the standalone module.

### Task 2: Verification

- [x] Run `cd frontend && npm test -- ImportPanelQueue.test.ts ImportPanel.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: module extraction only.
- Safety: no UI, behavior, API, or backend changes.
- Follow-up: consider extracting import health overview calculation if the health model grows beyond the panel.
