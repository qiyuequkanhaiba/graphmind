# Failed Import Shortcut Focus Phase 26 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the failed import health shortcut land on the exact failed import task with visible and non-visual feedback.

**Architecture:** Keep behavior frontend-local. `ImportPanel` identifies the first failed or partial import task, scrolls the task section into view, marks that task row with the existing shortcut focus style language, and emits a small context payload. `Workspace` uses the payload to update the existing polite live region with a localized confirmation.

**Tech Stack:** React/TypeScript, CSS, i18n catalog, Vitest.

---

### Task 1: Failed Task Shortcut Tests

**Files:**
- Modify: `frontend/tests/ImportPanel.test.tsx`
- Modify: `frontend/tests/Workspace.test.tsx`

- [x] Update ImportPanel shortcut test to assert callback context and focused failed row.
- [x] Add Workspace shortcut test that keeps the import dialog open, focuses the failed task row, and announces the target.

### Task 2: Failed Task Shortcut Implementation

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`

- [x] Add `FailedImportShortcutContext` callback payload.
- [x] Track the first failed/partial task as the shortcut focus target.
- [x] Add focused task-row styling for base and pro-tree themes.
- [x] Add localized live-region message for failed import target focus.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- ImportPanel.test.tsx Workspace.test.tsx i18n.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: frontend-only shortcut feedback.
- Safety: no backend, API, or persistence changes.
- Follow-up: focus an individual failed batch stage when a partial task contains retryable failed items.
