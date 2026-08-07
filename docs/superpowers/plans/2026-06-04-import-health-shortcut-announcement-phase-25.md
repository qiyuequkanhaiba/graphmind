# Import Health Shortcut Announcement Phase 25 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-visual confirmation after import health shortcuts navigate into relationship review.

**Architecture:** Reuse the existing `workbench-module-context` live region instead of introducing a toast framework. `Workspace` stores the latest review shortcut announcement, sets it when a health metric opens a review filter, and clears it on normal module navigation. Localized messages live in the existing i18n catalog.

**Tech Stack:** React/TypeScript, i18n catalog, Vitest.

---

### Task 1: Announcement Test

**Files:**
- Modify: `frontend/tests/Workspace.test.tsx`

- [x] Extend the import health shortcut test to assert the live-region confirmation text.

### Task 2: Announcement Implementation

**Files:**
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/i18n/messages.ts`

- [x] Add localized shortcut confirmation messages.
- [x] Store a workbench-level shortcut announcement after review health navigation.
- [x] Render the announcement through the existing polite live region.
- [x] Clear the announcement on regular module changes.

### Task 3: Verification

- [x] Run `cd frontend && npm test -- Workspace.test.tsx RelationshipReview.test.tsx i18n.test.tsx --run`.
- [x] Run focused import/review/workspace regression tests.
- [x] Run frontend build.

### Self-Review

- Scope: frontend-only accessibility feedback.
- Safety: no route/API/backend changes; the live region already exists in the workbench shell.
- Follow-up: consider turning repeated shortcut announcements into a small dismissible toast only if users need visible history.
