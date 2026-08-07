# Import Health Retry Failure Phase 29 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users retry the first retryable failed import directly from the import health area.

**Architecture:** Reuse the failed import target resolver from the shortcut focus flow. If the first failed target is a retryable failed stage, the health action calls `onRetryImportItem(taskId, itemId)`. Otherwise, if the failed task itself is retryable, it calls `onRetryImportTask(taskId)`. The action also applies the same shortcut focus state so users can see what was retried.

**Tech Stack:** React/TypeScript, i18n, CSS, Vitest.

---

### Task 1: Retry Action Tests

**Files:**
- Modify: `frontend/tests/ImportPanel.test.tsx`
- Modify: `frontend/tests/Workspace.test.tsx`

- [x] Add ImportPanel test for retrying a retryable failed task from health.
- [x] Add ImportPanel test for retrying a retryable failed batch stage from health.
- [x] Add Workspace test that the health retry action reaches the parent retry callback.

### Task 2: Retry Action Implementation

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`

- [x] Add localized `import.health.action.retryFailure` label.
- [x] Extend the failed import target resolver with retryability and optional stage metadata.
- [x] Render a compact retry action only when the failed target is retryable.
- [x] Wire retry action to item retry before task retry and preserve focused target styling.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- ImportPanel.test.tsx i18n.test.tsx --run`.
- [x] Run `cd frontend && npm test -- Workspace.test.tsx ImportPanel.test.tsx i18n.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: frontend-only health action.
- Safety: no API/backend changes; existing retry callbacks remain the integration point.
- Follow-up: add live-region confirmation specifically for retry-started if users need explicit non-visual retry feedback.
