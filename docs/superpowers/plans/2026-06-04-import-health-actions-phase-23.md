# Import Health Actions Phase 23 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make import health metrics clickable shortcuts into import tasks and review queue filters.

**Architecture:** Keep all behavior frontend-local. `ImportPanel` emits health action callbacks; `Workspace` coordinates opening the Insights review tab and selected `RelationshipReview` filter. `RelationshipReview` accepts an optional requested filter and keeps Phase 21 local filtering behavior.

**Tech Stack:** React/TypeScript, existing i18n catalog, CSS, Vitest.

---

### Task 1: Review Filter Control Tests

**Files:**
- Modify: `frontend/tests/RelationshipReview.test.tsx`
- Modify: `frontend/src/components/RelationshipReview.tsx`

- [x] Add failing test that `initialFilter="highPriority"` shows only high-priority suggestions.
- [x] Implement optional `initialFilter` prop and sync it into active filter state.
- [x] Run focused RelationshipReview test.

### Task 2: Import Health Action Tests

**Files:**
- Modify: `frontend/tests/ImportPanel.test.tsx`
- Modify: `frontend/tests/Workspace.test.tsx`

- [x] Add failing test that failed health metric triggers the import task shortcut callback.
- [x] Add failing test that Workspace health high-priority action opens the review tab with high-priority filter selected.

### Task 3: Health Action Implementation

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/components/workbench/InsightPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`

- [x] Add health metric action callbacks to ImportPanel.
- [x] Scroll failed task shortcut to import task card.
- [x] Pass review filter through Workspace and InsightPanel.
- [x] Add accessible button labels and compact action styles.

### Task 4: Verification

- [x] Run `cd frontend && npm test -- RelationshipReview.test.tsx ImportPanel.test.tsx Workspace.test.tsx --run`.
- [x] Run `cd frontend && npm test -- ImportPanel.test.tsx RelationshipReview.test.tsx App.test.tsx apiClientImportBatch.test.ts --run`.
- [x] Run `cd frontend && npm run build`.
- [x] Run `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`.
- [x] Run `cd backend && .venv/bin/ruff check graphmind tests`.

### Self-Review

- Scope: frontend-only shortcut flow.
- Safety: no route/API changes; static health metrics stay static when no action is useful.
- Next expansion: add focus announcements or toast feedback after shortcuts navigate.
