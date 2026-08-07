# Relationship Governance Phase 18 Implementation Plan

**Goal:** Expose and clean historical duplicate relationship suggestions that may have been created before retry-level semantic dedup was added.

**Architecture:** Add a relationship governance service that groups suggestions by semantic labels and relationship type. The service reports duplicate counts and can clean duplicates by preserving the earliest suggestion, relinking graph edges to that canonical suggestion, and deleting duplicate suggestion rows. The frontend displays the governance summary inside the relationship review panel and provides a cleanup action.

**Tech Stack:** FastAPI backend, SQLAlchemy services, React/TypeScript frontend, pytest, Vitest.

---

### Task 1: Backend Governance Service

- [x] Add `RelationshipGovernanceService`.
- [x] Add governance summary models for total, visible, duplicate, and status counts.
- [x] Add duplicate cleanup that relinks graph edges before deleting duplicate suggestions.
- [x] Cover service behavior with tests in `backend/tests/test_graph_service.py`.

### Task 2: Backend API

- [x] Add `GET /api/projects/{project_id}/relationship-governance`.
- [x] Add `POST /api/projects/{project_id}/relationship-governance/cleanup-duplicates`.
- [x] Add response schemas for duplicate groups, governance summary, and cleanup result.
- [x] Cover API behavior with tests in `backend/tests/test_api.py`.

### Task 3: Frontend Review Panel

- [x] Add frontend types and API client functions for relationship governance.
- [x] Load governance summary during workspace bootstrap and major graph/suggestion refreshes.
- [x] Show compact governance summary in `RelationshipReview`.
- [x] Add cleanup action that refreshes graph, suggestions, and governance summary.
- [x] Cover UI and API client behavior with Vitest tests.

### Verification

- [x] `cd backend && .venv/bin/pytest tests/test_graph_service.py tests/test_api.py -q`
- [x] `cd backend && .venv/bin/ruff check graphmind tests`
- [x] `cd frontend && npm test -- RelationshipReview.test.tsx App.test.tsx apiClientImportBatch.test.ts --run`
- [x] `cd frontend && npm run build`

### Self-Review

- Scope: Focused on historical duplicate relationship suggestions and visibility in the review workflow.
- Intentional limitation: Cleanup only deduplicates suggestions by semantic field labels and relationship type; it does not merge divergent human review notes.
- Safety: Cleanup preserves the earliest suggestion and migrates linked graph edges before deletion.
