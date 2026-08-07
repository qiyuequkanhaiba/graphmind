# Relationship Quality Priority Phase 19 Implementation Plan

**Goal:** Help users review complex generated relationship graphs by showing relationship quality and review priority directly on suggestions.

**Architecture:** Add a deterministic backend quality assessor that derives `quality_label`, `review_priority`, and `quality_reasons` from confidence, evidence payload metrics, and human-reviewed evidence quality. Expose those fields in relationship suggestion API responses. The frontend renders compact quality and priority chips in the relationship review cards.

**Tech Stack:** FastAPI backend, deterministic scoring helper, React/TypeScript frontend, pytest, Vitest.

---

### Task 1: Backend Quality Scoring

- [x] Add `graphmind.core.relationship_quality.assess_relationship_quality`.
- [x] Score quality from confidence, source match, row coverage, field type compatibility, relationship strength, and human reviewed evidence quality.
- [x] Derive review priority from pending status, quality, confidence, and relationship type.
- [x] Cover scoring rules with `backend/tests/test_relationship_quality.py`.

### Task 2: API Response Fields

- [x] Add `quality_label`, `review_priority`, and `quality_reasons` to `RelationshipSuggestionResponse`.
- [x] Populate quality fields in relationship suggestion API mapping.
- [x] Update API tests with explicit quality expectations.

### Task 3: Frontend Review Visibility

- [x] Extend `RelationshipSuggestion` type with optional quality fields for backwards-compatible mocks.
- [x] Render quality and priority chips on relationship review cards.
- [x] Add Chinese and English labels for quality and priority.
- [x] Cover quality chips in `RelationshipReview.test.tsx`.

### Verification

- [x] `cd backend && .venv/bin/pytest tests/test_relationship_quality.py ... -q`
- [x] `cd backend && .venv/bin/ruff check graphmind tests`
- [x] `cd frontend && npm test -- RelationshipReview.test.tsx App.test.tsx apiClientImportBatch.test.ts --run`
- [x] `cd frontend && npm run build`

### Self-Review

- Scope: This phase adds transparent deterministic quality signals; it does not add ML/LLM scoring.
- Safety: Existing frontend mocks remain compatible because quality fields are optional on the TypeScript type.
- Next expansion: Use priority to sort review cards and expose reason details in an inspector or tooltip.
