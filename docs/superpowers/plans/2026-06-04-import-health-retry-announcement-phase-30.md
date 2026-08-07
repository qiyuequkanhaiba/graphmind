# Import Health Retry Announcement Phase 30 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Announce when the import health retry action starts retrying a failed task or failed batch stage.

**Architecture:** Keep retry execution in existing callbacks. `ImportPanel` emits the same failed-target context used by shortcut focus through a new optional `onRetryFailedImportStarted` callback before calling retry. `Workspace` writes a localized confirmation into the existing polite live region.

**Tech Stack:** React/TypeScript, i18n, Vitest.

---

### Task 1: Retry Announcement Test

**Files:**
- Modify: `frontend/tests/Workspace.test.tsx`

- [x] Extend the health retry test to assert the live-region retry-started confirmation.

### Task 2: Retry Announcement Implementation

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/i18n/messages.ts`

- [x] Add localized `import.health.shortcut.retryStarted` message.
- [x] Extract failed import shortcut context creation for reuse.
- [x] Emit retry-started context from `ImportPanel` before retry callback execution.
- [x] Render retry-started confirmation through the existing Workspace live region.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- Workspace.test.tsx ImportPanel.test.tsx i18n.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: frontend-only accessibility feedback.
- Safety: no API/backend/persistence changes; retry execution still uses existing callbacks.
- Follow-up: include retry-started status in an import activity log if the product adds one.
