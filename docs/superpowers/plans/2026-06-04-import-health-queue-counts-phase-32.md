# Import Health Queue Counts Phase 32 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show counts in the import health action queue so the queue doubles as a quick triage summary.

**Architecture:** Reuse existing health metric count strings to avoid new pluralization logic. `buildImportHealthQueue` adds a `countLabel` to each item, and the queue renders the item title plus a compact count chip inside the label area.

**Tech Stack:** React/TypeScript, CSS, Vitest.

---

### Task 1: Queue Count Test

**Files:**
- Modify: `frontend/tests/ImportPanel.test.tsx`

- [x] Extend queue test to assert each item title and count label independently.

### Task 2: Queue Count Implementation

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/styles/app.css`

- [x] Add `countLabel` to queue item data.
- [x] Reuse existing health count translations for failed, pending, high-priority, and duplicate counts.
- [x] Render title and count in the queue label area.
- [x] Add compact count styling for base and pro-tree themes.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- ImportPanel.test.tsx i18n.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: frontend-only queue summary refinement.
- Safety: no API/backend changes; queue actions are unchanged.
- Follow-up: consider hiding duplicated metric chips on very small screens if the queue becomes the primary triage surface.
