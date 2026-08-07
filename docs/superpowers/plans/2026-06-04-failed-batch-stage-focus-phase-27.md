# Failed Batch Stage Focus Phase 27 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a partial batch import has failed stages, make the failed import shortcut focus the exact failed stage instead of only the parent task.

**Architecture:** Keep all behavior frontend-local. `ImportPanel` resolves the first failed or partial task, then looks for the first failed stage inside it. The parent task remains highlighted and the matching stage receives a nested shortcut-focus class. The failed import callback includes an optional `stageLabel`, and `Workspace` prefers that label in the live-region announcement.

**Tech Stack:** React/TypeScript, CSS, i18n, Vitest.

---

### Task 1: Failed Stage Tests

**Files:**
- Modify: `frontend/tests/ImportPanel.test.tsx`
- Modify: `frontend/tests/Workspace.test.tsx`

- [x] Add ImportPanel test for partial batch task stage focus and callback payload.
- [x] Add Workspace test that announces and highlights the failed stage label.

### Task 2: Failed Stage Implementation

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/styles/app.css`

- [x] Extend `FailedImportShortcutContext` with optional `stageLabel`.
- [x] Add failed import target resolver for task and failed stage.
- [x] Track focused failed stage key and apply nested highlight styling.
- [x] Prefer `stageLabel` in Workspace live-region feedback.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- ImportPanel.test.tsx Workspace.test.tsx i18n.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: frontend-only partial batch shortcut refinement.
- Safety: no API/backend/persistence changes.
- Follow-up: after stage retry, clear the shortcut focus when the stage is no longer failed.
