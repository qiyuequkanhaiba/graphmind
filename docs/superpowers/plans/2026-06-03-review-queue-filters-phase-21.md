# Review Queue Filters Phase 21 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local review queue filters for all, pending, high-priority, and duplicate-governance relationship suggestions.

**Architecture:** Keep backend APIs unchanged. `RelationshipReview` derives filter counts from current suggestions and optional governance summary, applies sorting first, then filters the rendered queue. The component shows a filtered-empty state when a selected filter has no matches.

**Tech Stack:** React/TypeScript, existing i18n catalog, CSS, Vitest.

---

### Task 1: Filter Behavior Tests

**Files:**
- Modify: `frontend/tests/RelationshipReview.test.tsx`

- [x] Write failing tests for filter counts, high-priority filtering, duplicate filtering, and filtered-empty state.
- [x] Run `cd frontend && npm test -- RelationshipReview.test.tsx --run` and verify the new tests fail because filter controls do not exist yet.

### Task 2: Filter UI Implementation

**Files:**
- Modify: `frontend/src/components/RelationshipReview.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`

- [x] Add filter state and derived counts in `RelationshipReview`.
- [x] Render a compact segmented filter control above the card list.
- [x] Apply selected filter after existing sort.
- [x] Add Chinese and English filter labels and filtered-empty copy.
- [x] Add compact styles for default and pro workbench themes.

### Task 3: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-03-review-queue-filters-phase-21.md`

- [x] Run `cd frontend && npm test -- RelationshipReview.test.tsx --run`.
- [x] Run `cd frontend && npm test -- RelationshipReview.test.tsx App.test.tsx apiClientImportBatch.test.ts --run`.
- [x] Run `cd frontend && npm run build`.
- [x] Run `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`.
- [x] Run `cd backend && .venv/bin/ruff check graphmind tests`.

### Self-Review

- Scope: frontend-only queue filtering.
- Safety: no API contract changes; duplicate filter gracefully disables without governance summary.
- Next expansion: persist the selected filter per workspace or add server-side pagination if imported queues become very large.
