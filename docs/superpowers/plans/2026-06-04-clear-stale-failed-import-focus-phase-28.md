# Clear Stale Failed Import Focus Phase 28 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear failed import shortcut highlights after the focused task or stage is no longer failed.

**Architecture:** Keep the shortcut state local to `ImportPanel`. A small effect watches `importTasks` and the current focused task/stage keys. If the focused task disappears or leaves failed/partial status, it clears both task and stage focus. If only the focused stage changes away from failed, it clears stage focus while preserving valid task focus.

**Tech Stack:** React/TypeScript, Vitest.

---

### Task 1: Stale Focus Test

**Files:**
- Modify: `frontend/tests/ImportPanel.test.tsx`

- [x] Add rerender test that focuses a failed batch stage, updates it to non-failed, and verifies shortcut highlight is removed.

### Task 2: Stale Focus Implementation

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`

- [x] Add effect that clears focused failed task when it disappears or recovers.
- [x] Add effect branch that clears focused failed stage when that stage is no longer failed.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- ImportPanel.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: frontend-only stale focus cleanup.
- Safety: no API/backend/persistence changes.
- Follow-up: clear the live-region announcement after the task recovers if a visible success confirmation is added later.
