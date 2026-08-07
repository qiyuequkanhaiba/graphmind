# Source Entity Inspection API Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend APIs for inspecting imported document/code/log sources, their chunks, extracted entities, and extracted relationships.

**Architecture:** Keep the graph canvas API unchanged and add focused read-only endpoints backed by existing `DocumentSource`, `DocumentChunk`, `ExtractedEntity`, and `ExtractedRelationship` tables. Responses are compact, ordered, project-scoped, and include enough metadata/source references for future frontend source explorer and evidence review UI.

**Tech Stack:** FastAPI, Pydantic response models, SQLAlchemy queries, pytest/TestClient.

---

## File Structure

- Modify: `backend/graphmind/api/schemas.py`
  - Add `SourceDetailResponse`, `DocumentChunkResponse`, `ExtractedEntityResponse`, and `ExtractedRelationshipResponse`.
- Modify: `backend/graphmind/api/routes.py`
  - Add `GET /api/projects/{project_id}/sources/detail`.
  - Add `GET /api/projects/{project_id}/sources/{source_id}/chunks`.
  - Add `GET /api/projects/{project_id}/entities`.
  - Add `GET /api/projects/{project_id}/extracted-relationships`.
- Create: `backend/tests/test_source_entity_inspection_api_phase_5.py`
  - Cover source details, chunk lookup, entity listing, relationship listing, and project scoping.

## Task 1: Source Detail and Chunk Endpoints

**Files:**
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_source_entity_inspection_api_phase_5.py`

- [ ] **Step 1: Write failing API test**

```python
def test_source_detail_and_chunks_endpoints_return_imported_document_artifacts(...):
    ImportService(...).import_structured_batch(project_id, [architecture_md])
    sources = client.get(f"/api/projects/{project_id}/sources/detail").json()
    chunks = client.get(f"/api/projects/{project_id}/sources/{sources[0]['id']}/chunks").json()
    assert sources[0]["title"] == "architecture.md"
    assert chunks[0]["content"].startswith("GraphMind")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_source_entity_inspection_api_phase_5.py::test_source_detail_and_chunks_endpoints_return_imported_document_artifacts -q`

Expected: FAIL because the endpoints do not exist.

- [ ] **Step 3: Implement response models and routes**

Add ordered, project-scoped queries for `DocumentSource` and `DocumentChunk`. Return 404 for missing project or a source not owned by that project.

- [ ] **Step 4: Run source/chunk test**

Run: `cd backend && .venv/bin/pytest tests/test_source_entity_inspection_api_phase_5.py::test_source_detail_and_chunks_endpoints_return_imported_document_artifacts -q`

Expected: PASS.

## Task 2: Entity and Relationship Endpoints

**Files:**
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_source_entity_inspection_api_phase_5.py`

- [ ] **Step 1: Write failing entity/relationship test**

```python
def test_entities_and_extracted_relationships_endpoints_return_source_backed_facts(...):
    ImportService(...).import_structured_batch(project_id, [architecture_md])
    entities = client.get(f"/api/projects/{project_id}/entities").json()
    relationships = client.get(f"/api/projects/{project_id}/extracted-relationships").json()
    assert any(entity["canonical_name"] == "/api/projects" for entity in entities)
    assert any(rel["target_name"] == "/api/projects" for rel in relationships)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_source_entity_inspection_api_phase_5.py::test_entities_and_extracted_relationships_endpoints_return_source_backed_facts -q`

Expected: FAIL because the endpoints do not exist.

- [ ] **Step 3: Implement entity and relationship routes**

Query entities and relationships with source/target names resolved from `ExtractedEntity`. Return metadata, aliases, confidence, status, evidence summary, payload, and source refs.

- [ ] **Step 4: Run entity/relationship tests**

Run: `cd backend && .venv/bin/pytest tests/test_source_entity_inspection_api_phase_5.py -q`

Expected: PASS.

## Task 3: Verification

**Files:**
- All modified backend files.

- [ ] **Step 1: Run focused backend tests**

Run: `cd backend && .venv/bin/pytest tests/test_source_entity_inspection_api_phase_5.py tests/test_cross_source_entity_resolution_phase_4.py tests/test_code_repository_import_phase_3.py tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_api.py tests/test_evidence_retrieval.py -q`

Expected: PASS.

- [ ] **Step 2: Run backend lint**

Run: `cd backend && .venv/bin/ruff check graphmind tests`

Expected: PASS.

- [ ] **Step 3: Run frontend smoke tests and build**

Run: `cd frontend && npm test -- App.test.tsx ImportPanel.test.tsx Workspace.test.tsx --run`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: PASS.

## Self-Review

- Spec coverage: Implements the planned source chunks and entities API endpoints needed for source explorer and inspection workflows.
- Placeholder scan: No placeholder-only steps remain.
- Type consistency: Response model names match route implementations and tests.
