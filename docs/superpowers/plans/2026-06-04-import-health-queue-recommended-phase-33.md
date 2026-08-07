# Import Health Queue Recommended Phase 33 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark the highest-priority import health queue item as the recommended next action.

**Architecture:** Preserve the existing queue ordering as the priority model. `buildImportHealthQueue` marks the first queue item as recommended, and `ImportPanel` renders a compact localized badge next to that item title.

**Tech Stack:** React/TypeScript, i18n, CSS, Vitest.

---

### Task 1: Recommended Badge Test

**Files:**
- Modify: `frontend/tests/ImportPanel.test.tsx`

- [x] Extend queue test to assert only the first item has the recommended badge.

### Task 2: Recommended Badge Implementation

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`

- [x] Add localized recommended badge text.
- [x] Mark the first queue item as recommended.
- [x] Render a compact badge next to the item title.
- [x] Add base and pro-tree badge styles.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- ImportPanel.test.tsx i18n.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: frontend-only priority hint.
- Safety: no API/backend changes; queue action order is unchanged.
- Follow-up: if queue ordering becomes configurable, move the recommended decision into a named priority function.
