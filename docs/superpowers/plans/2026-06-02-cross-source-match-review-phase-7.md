# Cross Source Match Review Phase 7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users inspect and confirm cross-source `matches_entity` relationships between structured fields and extracted document/code/log entities.

**Architecture:** Keep `matches_entity` as graph edges and add a focused review API over those edges. The frontend loads these reviews alongside source inspection data and shows a compact review list in the Data Explorer source inspector, with accept/reject actions that update the graph edge status and refresh the graph.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, React, TypeScript, Vitest, pytest.

---

## File Structure

- Modify: `backend/graphmind/api/schemas.py`
  - Add `EntityMatchReviewResponse` and `EntityMatchReviewRequest`.
- Modify: `backend/graphmind/api/routes.py`
  - Add `GET /api/projects/{project_id}/entity-matches`.
  - Add `POST /api/entity-matches/{edge_id}/review`.
- Create: `backend/tests/test_entity_match_review_phase_7.py`
  - Cover listing cross-source match candidates, project scoping, and accept/reject updates.
- Modify: `frontend/src/api/types.ts`
  - Add `EntityMatchReview`.
- Modify: `frontend/src/api/client.ts`
  - Add `getEntityMatchReviews` and `reviewEntityMatch`.
- Modify: `frontend/src/state/workspaceStore.ts`
  - Load entity match reviews during bootstrap.
- Modify: `frontend/src/App.tsx`
  - Store entity match reviews, refresh them after imports/review/reset, and wire review handler.
- Modify: `frontend/src/components/Workspace.tsx`
  - Forward entity match reviews and review callback to `DataExplorerPanel`.
- Modify: `frontend/src/components/workbench/DataExplorerPanel.tsx`
  - Render source-scoped entity match review rows with accept/reject controls.
- Modify: `frontend/src/i18n/messages.ts`
  - Add Chinese and English labels for entity match review UI.
- Modify: `frontend/src/styles/app.css`
  - Add compact match review row styles.
- Modify tests:
  - `frontend/tests/apiClientImportBatch.test.ts`
  - `frontend/tests/App.test.tsx`
  - `frontend/tests/DataExplorerPanel.test.tsx`
  - `frontend/tests/Workspace.test.tsx`

## Task 1: Backend Entity Match Review API

**Files:**
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Create: `backend/tests/test_entity_match_review_phase_7.py`

- [ ] **Step 1: Write failing list/review API tests**

```python
def test_entity_match_review_endpoint_lists_matches_with_node_labels(client, project_id):
    create_field_node_and_entity_node_with_matches_entity_edge(project_id)
    response = client.get(f"/api/projects/{project_id}/entity-matches")
    assert response.status_code == 200
    assert response.json()[0]["source_label"] == "customers.customer_id"
    assert response.json()[0]["target_label"] == "Customer ID"
    assert response.json()[0]["status"] == "suggested"

def test_entity_match_review_endpoint_accepts_and_rejects_match(client, project_id):
    edge_id = create_matches_entity_edge(project_id)
    response = client.post(f"/api/entity-matches/{edge_id}/review", json={"decision_status": "accepted"})
    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_entity_match_review_phase_7.py -q`

Expected: FAIL because the endpoints and schemas do not exist.

- [ ] **Step 3: Implement backend schemas and routes**

Add a project-scoped query for `GraphEdge.edge_type == "matches_entity"` joined to source and target `GraphNode` labels/types/metadata. Accept `decision_status` values `accepted`, `rejected`, and `suggested`; update the edge status and return the same response shape. Return 404 for non-match edge IDs and invalid projects.

- [ ] **Step 4: Run backend focused tests**

Run: `cd backend && .venv/bin/pytest tests/test_entity_match_review_phase_7.py -q`

Expected: PASS.

## Task 2: Frontend API and State

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/state/workspaceStore.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/tests/apiClientImportBatch.test.ts`
- Test: `frontend/tests/App.test.tsx`

- [ ] **Step 1: Write failing frontend API/state tests**

```typescript
it("loads and reviews entity match endpoints", async () => {
  await expect(getEntityMatchReviews(3)).resolves.toEqual([match]);
  await expect(reviewEntityMatch(7, "accepted")).resolves.toEqual({ ...match, status: "accepted" });
});

it("loads entity match reviews on startup and refreshes graph after review", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "接受实体匹配 customers.customer_id 到 Customer ID" }));
  expect(fetchMock).toHaveBeenCalledWith("/api/entity-matches/7/review", expect.objectContaining({ method: "POST" }));
  expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/entity-matches");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- apiClientImportBatch.test.ts App.test.tsx --run`

Expected: FAIL because client/state/UI wiring does not exist.

- [ ] **Step 3: Implement frontend client and state**

Add `EntityMatchReview` type, client functions, and `entityMatchReviews` to `WorkspaceState`. Load with `catch(() => [])`. Add `handleReviewEntityMatch(edgeId, decisionStatus)` in `App` that posts review, then reloads graph and match reviews.

- [ ] **Step 4: Run frontend API/state tests**

Run: `cd frontend && npm test -- apiClientImportBatch.test.ts App.test.tsx --run`

Expected: PASS.

## Task 3: Data Explorer Match Review UI

**Files:**
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/components/workbench/DataExplorerPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/tests/DataExplorerPanel.test.tsx`
- Test: `frontend/tests/Workspace.test.tsx`

- [ ] **Step 1: Write failing panel tests**

```typescript
it("renders source-scoped entity match review actions", () => {
  render(<DataExplorerPanel entityMatchReviews={[match]} onReviewEntityMatch={onReview} ... />);
  fireEvent.click(screen.getByRole("button", { name: "接受实体匹配 customers.customer_id 到 Customer ID" }));
  expect(onReview).toHaveBeenCalledWith(7, "accepted");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- DataExplorerPanel.test.tsx Workspace.test.tsx --run`

Expected: FAIL because match rows/actions are not rendered.

- [ ] **Step 3: Implement match review list**

Inside the source inspector, show up to six entity matches whose `source_refs` include the selected source ref. Include source label, target label, confidence, status, matched keys, evidence summary, and accept/reject buttons for suggested matches.

- [ ] **Step 4: Run panel tests**

Run: `cd frontend && npm test -- DataExplorerPanel.test.tsx Workspace.test.tsx --run`

Expected: PASS.

## Task 4: Verification

**Files:**
- All modified frontend and backend files.

- [ ] **Step 1: Run focused backend tests**

Run: `cd backend && .venv/bin/pytest tests/test_entity_match_review_phase_7.py tests/test_source_entity_inspection_api_phase_5.py tests/test_cross_source_entity_resolution_phase_4.py -q`

Expected: PASS.

- [ ] **Step 2: Run backend regression and lint**

Run: `cd backend && .venv/bin/pytest tests/test_source_entity_inspection_api_phase_5.py tests/test_cross_source_entity_resolution_phase_4.py tests/test_code_repository_import_phase_3.py tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_api.py tests/test_evidence_retrieval.py -q`

Expected: PASS.

Run: `cd backend && .venv/bin/ruff check graphmind tests`

Expected: PASS.

- [ ] **Step 3: Run focused frontend tests**

Run: `cd frontend && npm test -- apiClientImportBatch.test.ts App.test.tsx DataExplorerPanel.test.tsx Workspace.test.tsx --run`

Expected: PASS.

- [ ] **Step 4: Run frontend smoke and build**

Run: `cd frontend && npm test -- App.test.tsx ImportPanel.test.tsx Workspace.test.tsx --run`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: PASS.

## Self-Review

- Spec coverage: Turns Phase 4 cross-source matching and Phase 6 source explorer into a reviewable user workflow.
- Placeholder scan: No placeholder-only tasks remain.
- Type consistency: Backend and frontend use `EntityMatchReview`/`EntityMatchReviewResponse`, `decision_status`, and `matches_entity` consistently.
