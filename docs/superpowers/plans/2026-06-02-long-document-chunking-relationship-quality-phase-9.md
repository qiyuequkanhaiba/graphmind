# Long Document Chunking Relationship Quality Phase 9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve document ingestion quality by splitting long text documents into inspectable chunks and extracting source-backed relationships between entities that appear together in document evidence.

**Architecture:** Keep the existing `document_import.py` parser boundary and API response shapes. Add deterministic chunking helpers for plain text-like documents, then extend document relationship extraction with conservative rule-based `maps_to` and sentence-level `co_occurs_with` relationships that persist through the current import pipeline.

**Tech Stack:** Python standard library, existing FastAPI import pipeline, pytest, ruff.

---

## File Structure

- Modify: `backend/graphmind/services/document_import.py`
  - Add reusable text chunking helpers for plain text, Word, PDF, and long Markdown sections.
  - Extend document entity relationship extraction with mapping phrase and sentence co-occurrence rules.
- Modify: `backend/tests/test_document_import_phase_2.py`
  - Add parser-level tests for long text chunking.
  - Add parser-level tests for `maps_to` and `co_occurs_with` relationships.
  - Add import endpoint coverage to verify chunk and relationship persistence through source inspection APIs.

## Task 1: Long Text Chunking

**Files:**
- Modify: `backend/tests/test_document_import_phase_2.py`
- Modify: `backend/graphmind/services/document_import.py`

- [x] **Step 1: Write failing parser test for long text chunks**

Add a test that writes a `.txt` document with two large paragraphs containing `/api/projects`, `customerId`, and `orderId`. Assert that `parse_document_file()` returns more than one chunk, stable chunk refs like `runbook.txt#chunk-1`, and chunk metadata with `chunk_index`, `chunk_count`, `token_start`, and `token_end`.

- [x] **Step 2: Run parser test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_parse_plain_text_splits_long_documents_into_stable_chunks -q`

Expected: FAIL because current `_parsed_text_document()` always creates one chunk.

- [x] **Step 3: Implement reusable text chunking**

Add helpers in `document_import.py`:

- `_text_chunks(title, heading, text, source_ref_base, metadata)`
- `_split_text_blocks(text)`
- `_chunk_source_ref(source_ref_base, index, total)`

Use them from `_parsed_text_document()` and `_markdown_chunks()` while keeping small documents on their existing source refs.

- [x] **Step 4: Run parser test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_parse_plain_text_splits_long_documents_into_stable_chunks -q`

Expected: PASS.

## Task 2: Document Entity Relationship Quality

**Files:**
- Modify: `backend/tests/test_document_import_phase_2.py`
- Modify: `backend/graphmind/services/document_import.py`

- [x] **Step 1: Write failing parser test for mapping and co-occurrence relationships**

Add a test that parses text containing `Customer ID maps to customerId. The /api/projects endpoint uses customerId.` Assert that extracted relationships include:

- `Customer ID` `maps_to` `customerId` with evidence rule `field_mapping_phrase`
- `/api/projects` `co_occurs_with` `customerId` with evidence rule `sentence_entity_cooccurrence`

- [x] **Step 2: Run parser test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_parse_document_extracts_mapping_and_sentence_cooccurrence_relationships -q`

Expected: FAIL because current relationship extraction only links the source document to entities.

- [x] **Step 3: Implement relationship extraction rules**

Update `_entities_and_relationships()` to build per-chunk entity lists once and add:

- `_mapping_relationships(chunk)`
- `_cooccurrence_relationships(chunk, chunk_entities)`
- `_sentences(text)`

Keep these rules deterministic and source-backed. Deduplicate through the existing `_dedupe_relationships()`.

- [x] **Step 4: Run parser test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_parse_document_extracts_mapping_and_sentence_cooccurrence_relationships -q`

Expected: PASS.

## Task 3: Import Pipeline Persistence

**Files:**
- Modify: `backend/tests/test_document_import_phase_2.py`
- Modify: `backend/graphmind/services/document_import.py`

- [x] **Step 1: Write import endpoint persistence test**

Add a test that uploads a long `.txt` runbook through `/api/projects/{project_id}/import-batches`, then reads `/sources/detail`, `/sources/{id}/chunks`, and `/extracted-relationships`. Assert that multiple chunks persist and that `maps_to` persists with source refs pointing to a chunk.

- [x] **Step 2: Run import endpoint persistence test**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_import_batch_endpoint_persists_long_text_chunks_and_relationships -q`

Expected: FAIL until Tasks 1 and 2 are implemented.

- [x] **Step 3: Reuse parser output through current persistence path**

No API shape change should be needed. The current import service persists parsed chunks and relationships.

- [x] **Step 4: Run import endpoint test**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_import_batch_endpoint_persists_long_text_chunks_and_relationships -q`

Expected: PASS.

## Task 4: Verification

**Files:**
- All modified backend files.

- [x] **Step 1: Run document import tests**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py -q`

Expected: PASS.

- [x] **Step 2: Run focused backend regression**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py tests/test_source_entity_inspection_api_phase_5.py tests/test_entity_match_review_phase_7.py -q`

Expected: PASS.

- [x] **Step 3: Run backend regression and lint**

Run: `cd backend && .venv/bin/pytest tests/test_source_entity_inspection_api_phase_5.py tests/test_cross_source_entity_resolution_phase_4.py tests/test_code_repository_import_phase_3.py tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_api.py tests/test_evidence_retrieval.py -q`

Expected: PASS.

Run: `cd backend && .venv/bin/ruff check graphmind tests`

Expected: PASS.

- [x] **Step 4: Run frontend smoke and build**

Run: `cd frontend && npm test -- App.test.tsx ImportPanel.test.tsx Workspace.test.tsx --run`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: PASS.

## Self-Review

- Spec coverage: The plan covers long document chunking and relationship quality while preserving existing API shapes.
- Placeholder scan: No placeholder-only tasks remain.
- Type consistency: All tasks use existing parser dataclasses and persistence models.
