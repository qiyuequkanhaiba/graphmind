# Import Health Shortcut Focus Phase 24 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give import health shortcuts an immediate visual landing point after they navigate into the review queue.

**Architecture:** Keep the Phase 23 shortcut flow frontend-only. `Workspace` increments a review shortcut focus key when an import health metric opens the review queue. `InsightPanel` passes the key to `RelationshipReview`, which marks the active shortcut filter and first matching review card. Styling stays local to the existing review card/filter UI.

**Tech Stack:** React/TypeScript, CSS, Vitest.

---

### Task 1: Shortcut Focus Tests

**Files:**
- Modify: `frontend/tests/RelationshipReview.test.tsx`
- Modify: `frontend/tests/Workspace.test.tsx`

- [x] Add test that a shortcut focus key marks the active filter and first matching review card.
- [x] Extend Workspace health shortcut test to verify the highlighted landing point.

### Task 2: Shortcut Focus Implementation

**Files:**
- Modify: `frontend/src/components/RelationshipReview.tsx`
- Modify: `frontend/src/components/workbench/InsightPanel.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/styles/app.css`

- [x] Add optional `shortcutFocusKey` prop to `RelationshipReview`.
- [x] Increment the focus key when Workspace opens review shortcuts from import health.
- [x] Pass the key through `InsightPanel`.
- [x] Add focused styles for the selected filter and first matching review card.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- RelationshipReview.test.tsx Workspace.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: frontend-only visual feedback.
- Safety: no API, routing, or data model changes.
- Follow-up: add an aria-live announcement or toast if users need non-visual confirmation after shortcut navigation.
