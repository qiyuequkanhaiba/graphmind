# Cross Source Entity Resolution Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect structured fields with entities extracted from documents, code, JSON, and logs using deterministic normalized-name matching.

**Architecture:** Add a small merge layer after batch graph creation. It reads persisted `field` graph nodes and extracted entity graph nodes for the project, normalizes names with case/underscore/dash/camel-case folding, and creates `matches_entity` graph edges with reviewable evidence when names align. The first version only writes graph edges, leaving stronger alias merging and AI-assisted resolution for later.

**Tech Stack:** Existing SQLAlchemy models/repositories, existing graph storage, Python deterministic normalizers, pytest, Ruff.

---

## File Structure

- Create: `backend/graphmind/services/entity_resolution.py`
  - Normalizes field/entity labels.
  - Builds deterministic `matches_entity` graph edges between table fields and extracted entities.
  - Avoids duplicates through existing graph repository edge dedupe.
- Modify: `backend/graphmind/services/import_service.py`
  - Run cross-source entity resolution after batch graph creation and before final summary.
  - Include `resolved_relationship_count` in batch summary.
- Create: `backend/tests/test_cross_source_entity_resolution_phase_4.py`
  - Cover normalized matching and batch integration.
- Keep unchanged: frontend, API schema, database DDL. New edges use existing `GraphEdge` rows and response schema.

## Task 1: Entity Resolution Service

**Files:**
- Create: `backend/graphmind/services/entity_resolution.py`
- Test: `backend/tests/test_cross_source_entity_resolution_phase_4.py`

- [ ] **Step 1: Write the failing service test**

```python
def test_resolve_cross_source_entities_links_field_nodes_to_extracted_entities(tmp_workspace):
    # create a field graph node Customers.customer_id and an entity graph node Customer ID
    # call CrossSourceEntityResolutionService(...).resolve(project_id)
    # assert one matches_entity edge connects field -> entity
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_cross_source_entity_resolution_phase_4.py::test_resolve_cross_source_entities_links_field_nodes_to_extracted_entities -q`

Expected: FAIL because `entity_resolution.py` does not exist.

- [ ] **Step 3: Implement minimal service**

Create `CrossSourceEntityResolutionService` that:

```python
service = CrossSourceEntityResolutionService(session_factory)
created_edges = service.resolve(project_id)
```

The service should:

- normalize `Customers.customer_id` into tokens including `customerid`
- normalize aliases and entity labels such as `Customer ID` and `customerId`
- create `matches_entity` edges from field graph nodes to entity/code_symbol graph nodes
- use evidence metadata `{rule: "normalized_name_match", field_label, entity_label}`

- [ ] **Step 4: Run service test**

Run: `cd backend && .venv/bin/pytest tests/test_cross_source_entity_resolution_phase_4.py::test_resolve_cross_source_entities_links_field_nodes_to_extracted_entities -q`

Expected: PASS.

## Task 2: Batch Import Integration

**Files:**
- Modify: `backend/graphmind/services/import_service.py`
- Test: `backend/tests/test_cross_source_entity_resolution_phase_4.py`

- [ ] **Step 1: Write failing batch integration test**

```python
def test_batch_import_resolves_markdown_entity_to_csv_field(tmp_workspace, tmp_path):
    customers.csv has id,customer_id
    architecture.md mentions `customerId` and `Customer ID`
    ImportService.import_structured_batch(...)
    assert GraphEdge edge_type == "matches_entity"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_cross_source_entity_resolution_phase_4.py::test_batch_import_resolves_markdown_entity_to_csv_field -q`

Expected: FAIL because the import service does not call the resolver.

- [ ] **Step 3: Call resolver from batch import**

After table/document graph creation, call `CrossSourceEntityResolutionService.resolve(project_id, session=session)` or a session-aware helper. Include the count in `summary["resolved_relationship_count"]`.

- [ ] **Step 4: Run integration test**

Run: `cd backend && .venv/bin/pytest tests/test_cross_source_entity_resolution_phase_4.py -q`

Expected: PASS.

## Task 3: Verification

**Files:**
- All modified backend files.

- [ ] **Step 1: Run focused backend tests**

Run: `cd backend && .venv/bin/pytest tests/test_cross_source_entity_resolution_phase_4.py tests/test_code_repository_import_phase_3.py tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_import_service.py tests/test_api.py tests/test_relationships.py tests/test_storage.py tests/test_evidence_retrieval.py -q`

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

- Spec coverage: This plan implements the deterministic level of the entity resolution section and starts the shared merge layer without adding database tables.
- Placeholder scan: No placeholder-only implementation steps remain.
- Type consistency: The resolver returns persisted `GraphEdge` rows and uses existing `matches_entity` edge types, so no API schema change is needed.
