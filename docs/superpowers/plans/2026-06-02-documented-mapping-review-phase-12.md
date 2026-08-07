# Documented Mapping Review Phase 12 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users inspect and accept or reject document-derived field mapping graph edges created from `maps_to` evidence.

**Architecture:** Reuse the existing entity match review response shape for `documented_mapping` graph edges. Add backend endpoints for listing and reviewing mapping edges, then extend frontend data loading and Data Explorer review rows to include these mappings alongside entity matches.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React, TypeScript, Vitest, pytest, ruff.

---

## File Structure

- Modify: `backend/graphmind/api/routes.py`
  - Add `GET /api/projects/{project_id}/mapping-reviews`.
  - Add `POST /api/mapping-reviews/{edge_id}/review`.
  - Reuse `_entity_match_review_response()` for edge-to-node response payloads.
- Modify: `backend/tests/test_entity_match_review_phase_7.py`
  - Add API tests for mapping review list and review decisions.
- Modify: `frontend/src/api/client.ts`
  - Add `getMappingReviews()` and `reviewMappingEdge()`.
- Modify: `frontend/src/state/workspaceStore.ts`
  - Load mapping reviews with source details.
- Modify: `frontend/src/App.tsx`
  - Store mapping reviews and refresh after review.
- Modify: `frontend/src/components/Workspace.tsx`
  - Pass mapping reviews and review callback to Data Explorer.
- Modify: `frontend/src/components/workbench/DataExplorerPanel.tsx`
  - Render mapping reviews in the source inspector.
- Modify: `frontend/tests/DataExplorerPanel.test.tsx`
  - Add UI expectations for document mapping review rows.
- Modify: `frontend/tests/App.test.tsx`
  - Add API call expectations for mapping reviews.

## Task 1: Backend Mapping Review API

**Files:**
- Modify: `backend/tests/test_entity_match_review_phase_7.py`
- Modify: `backend/graphmind/api/routes.py`

- [x] **Step 1: Write failing backend API tests**

Add tests that seed a `documented_mapping` graph edge between two field nodes and verify:

- `GET /api/projects/{project_id}/mapping-reviews` returns the edge with labels, `relationship_type == "documented_mapping"`, document `source_refs`, and evidence summary.
- `POST /api/mapping-reviews/{edge_id}/review` accepts and rejects the mapping.
- Posting to a non-`documented_mapping` edge returns 404.

- [x] **Step 2: Run backend API tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_entity_match_review_phase_7.py::test_mapping_review_endpoint_lists_documented_mapping_edges tests/test_entity_match_review_phase_7.py::test_mapping_review_endpoint_accepts_and_rejects_mapping -q`

Expected: FAIL with 404 because routes do not exist yet.

- [x] **Step 3: Implement backend routes**

In `routes.py`, add:

- `GET /projects/{project_id}/mapping-reviews`
- `POST /mapping-reviews/{edge_id}/review`

Both should mirror the entity match behavior but filter `edge_type == "documented_mapping"` and use an error detail naming mapping review.

- [x] **Step 4: Run backend API tests**

Run: `cd backend && .venv/bin/pytest tests/test_entity_match_review_phase_7.py -q`

Expected: PASS.

## Task 2: Frontend Mapping Review Data Flow

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/state/workspaceStore.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/tests/App.test.tsx`

- [x] **Step 1: Write failing frontend data-flow tests**

Extend existing API mock tests so project loading expects a call to `/api/projects/42/mapping-reviews`. Extend review flow tests so accepting a mapping review posts to `/api/mapping-reviews/{edgeId}/review`.

- [x] **Step 2: Run frontend tests to verify failure**

Run: `cd frontend && npm test -- App.test.tsx --run`

Expected: FAIL because no mapping review client/store state exists.

- [x] **Step 3: Implement client and state**

Add API client functions and pass mapping reviews through App and Workspace state similarly to entity match reviews.

- [x] **Step 4: Run frontend data-flow tests**

Run: `cd frontend && npm test -- App.test.tsx --run`

Expected: PASS.

## Task 3: Data Explorer Mapping Review UI

**Files:**
- Modify: `frontend/src/components/workbench/DataExplorerPanel.tsx`
- Modify: `frontend/tests/DataExplorerPanel.test.tsx`
- Modify: `frontend/src/i18n/messages.ts`

- [x] **Step 1: Write failing Data Explorer test**

Add a `documented_mapping` review fixture and assert the source inspector renders it with accept/reject controls and calls `onReviewMappingEdge(edgeId, "accepted")`.

- [x] **Step 2: Run Data Explorer test to verify failure**

Run: `cd frontend && npm test -- DataExplorerPanel.test.tsx --run`

Expected: FAIL because mapping reviews are not rendered.

- [x] **Step 3: Implement mapping review UI**

Render a "Documented mappings" inspection list with the same compact row pattern as entity matches.

- [x] **Step 4: Run Data Explorer test**

Run: `cd frontend && npm test -- DataExplorerPanel.test.tsx --run`

Expected: PASS.

## Task 4: Verification

**Files:**
- All modified backend and frontend files.

- [x] **Step 1: Run focused backend tests**

Run: `cd backend && .venv/bin/pytest tests/test_entity_match_review_phase_7.py tests/test_cross_source_entity_resolution_phase_4.py -q`

Expected: PASS.

- [x] **Step 2: Run backend regression and lint**

Run: `cd backend && .venv/bin/pytest tests/test_source_entity_inspection_api_phase_5.py tests/test_cross_source_entity_resolution_phase_4.py tests/test_code_repository_import_phase_3.py tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_api.py tests/test_evidence_retrieval.py tests/test_entity_match_review_phase_7.py -q`

Expected: PASS.

Run: `cd backend && .venv/bin/ruff check graphmind tests`

Expected: PASS.

- [x] **Step 3: Run frontend regression and build**

Run: `cd frontend && npm test -- App.test.tsx DataExplorerPanel.test.tsx Workspace.test.tsx apiClientImportBatch.test.ts --run`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: PASS.

## Self-Review

- Spec coverage: This phase exposes Phase 11 document-derived mapping edges for user review without changing graph persistence.
- Placeholder scan: No placeholder-only tasks remain.
- Type consistency: Reuses existing `EntityMatchReview` response shape and decision statuses for mapping review rows.
