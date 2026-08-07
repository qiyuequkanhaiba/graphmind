# Import Health Queue Priority Function Phase 34 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make import health queue priority explicit and covered by focused unit tests.

**Architecture:** Export `buildImportHealthQueue` and the queue health type from `ImportPanel`. Add a pure function test that verifies the priority order remains failures, pending, high-priority, duplicates, and that the first available item is recommended.

**Tech Stack:** TypeScript, Vitest.

---

### Task 1: Queue Priority Tests

**Files:**
- Add: `frontend/tests/ImportPanelQueue.test.ts`

- [x] Add pure function test for full queue priority order.
- [x] Add pure function test for first-available recommendation when failures are absent.

### Task 2: Queue Builder Exports

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`

- [x] Export `ImportHealthOverview`.
- [x] Export `ImportHealthQueueItem`.
- [x] Export `buildImportHealthQueue`.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- ImportPanelQueue.test.ts ImportPanel.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: testability and priority-rule guardrails only.
- Safety: no UI, API, backend, or behavior changes beyond exporting the pure queue builder.
- Follow-up: move queue-building into a separate module if `ImportPanel.tsx` grows further.
