# Import Health Action Queue Phase 31 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact prioritized action queue to import health so users can see the next work items at a glance.

**Architecture:** Keep the existing metric chips and shortcuts. `ImportPanel` derives a small ordered queue from `ImportHealthOverview`: failed imports first, then pending reviews, high-priority reviews, and duplicates. Queue actions reuse the same callbacks as the metric shortcuts. Queue buttons receive unique accessible labels to avoid colliding with metric action buttons.

**Tech Stack:** React/TypeScript, i18n, CSS, Vitest.

---

### Task 1: Queue Test

**Files:**
- Modify: `frontend/tests/ImportPanel.test.tsx`

- [x] Extend the import health test to assert a four-item prioritized action queue.

### Task 2: Queue Implementation

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`

- [x] Add localized queue heading and item labels.
- [x] Build queue from failed, pending, high-priority, and duplicate health counts.
- [x] Render queue below health metrics and reuse existing shortcut callbacks.
- [x] Add compact base and pro-tree styles.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- ImportPanel.test.tsx i18n.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: frontend-only health summary.
- Safety: no API/backend changes; queue actions reuse existing callbacks.
- Follow-up: add queue item counts in the visible label if users need denser triage information.
