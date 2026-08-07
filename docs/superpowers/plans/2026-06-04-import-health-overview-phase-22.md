# Import Health Overview Phase 22 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact import health overview that summarizes source coverage, failed imports, pending reviews, high-priority relationships, and duplicate governance risk.

**Architecture:** Keep backend contracts unchanged. `Workspace` passes the existing `relationshipGovernance` summary into `ImportPanel`; `ImportPanel` derives health status and metrics from current props and renders the overview above detailed source/task cards.

**Tech Stack:** React/TypeScript, existing i18n catalog, CSS, Vitest.

---

### Task 1: Health Overview Tests

**Files:**
- Modify: `frontend/tests/ImportPanel.test.tsx`

- [x] Add failing tests for attention-needed, healthy, and waiting import health states.
- [x] Run `cd frontend && npm test -- ImportPanel.test.tsx --run` and verify the tests fail because the overview does not exist yet.

### Task 2: Health Overview Implementation

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`

- [x] Add optional `relationshipGovernance` prop to `ImportPanel`.
- [x] Pass `relationshipGovernance` from `Workspace` to `ImportPanel`.
- [x] Derive source, failure, pending, high-priority, and duplicate counts.
- [x] Render health status and compact metrics.
- [x] Add Chinese and English labels.
- [x] Add styles that match existing import summary cards.

### Task 3: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-04-import-health-overview-phase-22.md`

- [x] Run `cd frontend && npm test -- ImportPanel.test.tsx --run`.
- [x] Run `cd frontend && npm test -- ImportPanel.test.tsx RelationshipReview.test.tsx App.test.tsx apiClientImportBatch.test.ts --run`.
- [x] Run `cd frontend && npm run build`.
- [x] Run `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`.
- [x] Run `cd backend && .venv/bin/ruff check graphmind tests`.

### Self-Review

- Scope: frontend-only operational health overview.
- Safety: missing governance data counts as zero duplicate risk.
- Next expansion: make health metrics clickable shortcuts into import tasks, source explorer, and relationship filters.
