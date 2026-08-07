# Documented Field Mapping Resolution Phase 11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use document-extracted `maps_to` relationships to create source-backed graph edges between structured fields when documents describe how business concepts map to table columns.

**Architecture:** Extend the existing cross-source entity resolution service without changing API contracts. The service already creates `matches_entity` edges between field nodes and extracted entity nodes; it will also read persisted `ExtractedRelationship` rows with `relationship_type="maps_to"`, resolve each endpoint to field graph nodes by normalized keys, and create `documented_mapping` graph edges with document chunk evidence.

**Tech Stack:** Python standard library, SQLAlchemy models, existing graph repository, pytest, ruff.

---

## File Structure

- Modify: `backend/graphmind/services/entity_resolution.py`
  - Add `maps_to` relationship scanning.
  - Add helpers that map extracted entity names and aliases to field graph nodes.
  - Persist `documented_mapping` graph edges via existing `ImportRepository.add_graph()`.
- Modify: `backend/tests/test_cross_source_entity_resolution_phase_4.py`
  - Add a service-level test for graph nodes plus extracted entities/relationships.
  - Add a batch import test proving CSV plus document mapping produces a `documented_mapping` graph edge.

## Task 1: Service-Level Documented Mapping Edges

**Files:**
- Modify: `backend/tests/test_cross_source_entity_resolution_phase_4.py`
- Modify: `backend/graphmind/services/entity_resolution.py`

- [x] **Step 1: Write failing service-level test**

Add a test that seeds two field graph nodes (`customers.customer_id`, `orders.customer_id`), two extracted entity graph nodes (`Customer ID`, `customerId`), and one persisted extracted relationship `Customer ID maps_to customerId` with `source_refs=["identity.md#chunk-1"]`. Assert that `CrossSourceEntityResolutionService.resolve()` creates a `documented_mapping` graph edge between the two field nodes with metadata:

- `rule == "documented_field_mapping"`
- `document_relationship_id` set
- `evidence_summary` includes the document mapping text
- `source_refs == ["identity.md#chunk-1"]`

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_cross_source_entity_resolution_phase_4.py::test_resolve_cross_source_entities_creates_documented_mapping_between_fields -q`

Expected: FAIL because current resolution only creates `matches_entity`.

- [x] **Step 3: Implement documented mapping resolution**

In `entity_resolution.py`:

- Import `ExtractedEntity` and `ExtractedRelationship`.
- Build a field-node lookup from normalized keys.
- Build an extracted-entity lookup from canonical names and aliases.
- For each `maps_to` extracted relationship, resolve source/target extracted entities to candidate field nodes and create `documented_mapping` graph edges.
- Reuse `_existing_node_passthrough()` and `ImportRepository.add_graph()`.

- [x] **Step 4: Run service-level test**

Run: `cd backend && .venv/bin/pytest tests/test_cross_source_entity_resolution_phase_4.py::test_resolve_cross_source_entities_creates_documented_mapping_between_fields -q`

Expected: PASS.

## Task 2: Batch Import Documented Mapping Integration

**Files:**
- Modify: `backend/tests/test_cross_source_entity_resolution_phase_4.py`
- Modify: `backend/graphmind/services/entity_resolution.py`

- [x] **Step 1: Write integration test**

Add a batch import test with `customers.csv`, `orders.csv`, and `identity.md` containing `Customer ID maps to customerId.` Assert that the imported graph contains at least one `documented_mapping` edge whose endpoints are field nodes and whose metadata rule is `documented_field_mapping`.

- [x] **Step 2: Run integration test**

Run: `cd backend && .venv/bin/pytest tests/test_cross_source_entity_resolution_phase_4.py::test_batch_import_uses_documented_maps_to_relationships_between_fields -q`

Expected: PASS after Task 1 implementation, or FAIL if import-derived names need helper adjustment.

- [x] **Step 3: Confirm matching helpers need no further adjustment**

If the integration test fails because document entity names are not matching field labels, adjust `_match_keys()` or entity candidate generation conservatively so `Customer ID`, `customerId`, and `customer_id` share the same key.

- [x] **Step 4: Run integration test again**

Run: `cd backend && .venv/bin/pytest tests/test_cross_source_entity_resolution_phase_4.py::test_batch_import_uses_documented_maps_to_relationships_between_fields -q`

Expected: PASS.

## Task 3: Verification

**Files:**
- All modified backend files.

- [x] **Step 1: Run focused backend tests**

Run: `cd backend && .venv/bin/pytest tests/test_cross_source_entity_resolution_phase_4.py tests/test_document_import_phase_2.py tests/test_entity_match_review_phase_7.py -q`

Expected: PASS.

- [x] **Step 2: Run backend regression and lint**

Run: `cd backend && .venv/bin/pytest tests/test_source_entity_inspection_api_phase_5.py tests/test_cross_source_entity_resolution_phase_4.py tests/test_code_repository_import_phase_3.py tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_api.py tests/test_evidence_retrieval.py -q`

Expected: PASS.

Run: `cd backend && .venv/bin/ruff check graphmind tests`

Expected: PASS.

- [x] **Step 3: Run frontend smoke and build**

Run: `cd frontend && npm test -- App.test.tsx DataExplorerPanel.test.tsx Workspace.test.tsx --run`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: PASS.

## Self-Review

- Spec coverage: This phase turns document relationships into graph edges between structured fields, directly improving complete multisource graph linkage.
- Placeholder scan: No placeholder-only tasks remain.
- Type consistency: Uses existing `GraphEdgeData`, `ExtractedEntity`, `ExtractedRelationship`, and `ImportRepository.add_graph()`.
