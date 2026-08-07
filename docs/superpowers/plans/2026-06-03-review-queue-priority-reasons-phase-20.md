# Review Queue Priority Reasons Phase 20 Implementation Plan

**Goal:** Make relationship review faster by ordering suggestions by review priority and exposing the deterministic quality reasons behind each suggestion.

**Architecture:** Keep quality scoring on the backend from Phase 19. In the frontend review panel, sort the existing suggestion response deterministically and add an expandable reason list per suggestion using translated labels for known backend reason codes.

**Tech Stack:** React/TypeScript frontend, i18n message catalog, CSS, Vitest, pytest/ruff verification.

---

### Task 1: Review Queue Ordering

- [x] Add a failing frontend test for priority and confidence ordering.
- [x] Sort pending suggestions before reviewed suggestions.
- [x] Sort by priority high to low, confidence descending, then id ascending.

### Task 2: Quality Reason Expansion

- [x] Add a failing frontend test for expanding quality reasons.
- [x] Add compact expand/collapse controls on relationship cards that have reasons.
- [x] Translate known reason codes from backend quality assessment.
- [x] Fall back to readable raw reason text for future reason codes.

### Task 3: Styling And Copy

- [x] Add Chinese and English labels for quality reason controls and known reason codes.
- [x] Add compact list/button styles for default and pro workbench themes.

### Verification

- [x] `cd frontend && npm test -- RelationshipReview.test.tsx --run`
- [x] `cd frontend && npm test -- RelationshipReview.test.tsx App.test.tsx apiClientImportBatch.test.ts --run`
- [x] `cd frontend && npm run build`
- [x] `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`
- [x] `cd backend && .venv/bin/ruff check graphmind tests`
- [x] `cd backend && .venv/bin/pytest -q`

### Self-Review

- Scope: This phase only changes the review queue presentation and localized explanation labels.
- Safety: Backend contracts remain unchanged; unknown reason codes still render as readable text.
- Next expansion: Add queue filters for high-priority pending suggestions and governance issue groups.
