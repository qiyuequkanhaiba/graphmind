# Universal Multisource Knowledge Graph Import Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first working document/code/log ingestion path so non-table files become document sources, chunks, extracted entities, graph nodes/edges, and searchable evidence.

**Architecture:** Keep the Phase 1 structured batch pipeline intact and extend the batch dispatcher with a document pipeline for Markdown, text/log files, nested JSON, common source-code files, DOCX text, and conservative PDF text. Parsed artifacts are stored in new document/entity tables and summarized on the same import batch/item APIs. Chunks remain evidence-first, while documents, important entities, and deterministic relationships are merged into the existing graph tables with persistent dedupe.

**Tech Stack:** Python, FastAPI, SQLAlchemy, SQLite, standard-library parsers, pytest, React, TypeScript, Vite, Vitest.

---

## Scope Boundary

This phase implements a small deterministic ingestion core:

- `DocumentSource`, `DocumentChunk`, `ExtractedEntity`, and `ExtractedRelationship` persistence.
- Markdown/TXT/log/code/nested-JSON/DOCX parsing into document chunks.
- Lightweight PDF text extraction with a clear failure when no text can be found.
- Rule-based entities for URLs, emails, file paths, API paths, error codes, code symbols, and concepts.
- Rule-based relationships for links, mentions, code dependencies, log co-occurrence, and source containment.
- Batch API support for structured and document-like files in one upload.
- Evidence retrieval includes document chunks and extracted relationships.
- Source summary counts include `document`, `code`, `log`, and `json`.

This phase does not implement OCR, complex PDF layout parsing, full AST parsers, zip/folder repository import, or LLM extraction.

## File Structure

Backend:

- Modify `backend/graphmind/storage/models.py`: add document/entity/relationship ORM models.
- Modify `backend/graphmind/storage/database.py`: add migration DDL for the new tables.
- Modify `backend/graphmind/storage/repositories.py`: add `DocumentRepository` and graph merge helpers for extracted graph data.
- Create `backend/graphmind/services/document_import.py`: parse files, chunk text, extract deterministic entities/relationships.
- Modify `backend/graphmind/services/import_service.py`: dispatch mixed batches to structured or document pipeline.
- Modify `backend/graphmind/services/evidence_retrieval.py`: include chunks and extracted relationships in evidence documents.
- Modify `backend/graphmind/services/project_data_service.py`: reset document/entity/relationship rows.
- Modify `backend/graphmind/api/routes.py`: allow document-like file extensions in batch upload.
- Modify `backend/graphmind/api/schemas.py`: add source/chunk/entity responses only if frontend/API needs direct inspection.
- Add `backend/tests/test_document_import_phase_2.py`: focused document/code/log ingestion tests.

Frontend:

- Modify `frontend/src/components/ImportPanel.tsx` only if accepted extensions/help text need updating.
- Modify `frontend/src/i18n/messages.ts` for updated upload copy.
- Modify `frontend/tests/ImportPanel.test.tsx` and `frontend/tests/App.test.tsx` for new upload label/acceptance if needed.

## Task 1: Add Document Persistence

**Files:**

- Modify: `backend/graphmind/storage/models.py`
- Modify: `backend/graphmind/storage/database.py`
- Modify: `backend/graphmind/storage/repositories.py`
- Test: `backend/tests/test_document_import_phase_2.py`

- [ ] **Step 1: Write failing model/repository tests**

Create tests that initialize a project, create one `ImportBatch`/`ImportItem`, persist a `DocumentSource`, two `DocumentChunk` rows, one `ExtractedEntity`, and one `ExtractedRelationship`, then assert they can be listed by project and item.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd backend
.venv/bin/pytest tests/test_document_import_phase_2.py::test_document_repository_persists_sources_chunks_entities_and_relationships -q
```

Expected: import/model failure because the new persistence types do not exist.

- [ ] **Step 3: Add ORM models and migration DDL**

Add:

- `DocumentSource(project_id, import_item_id, title, document_type, source_ref, metadata)`
- `DocumentChunk(project_id, document_id, chunk_index, heading, content, token_count, source_ref, content_hash, metadata)`
- `ExtractedEntity(project_id, canonical_name, entity_type, aliases, confidence, source_refs, metadata)`
- `ExtractedRelationship(project_id, source_entity_id, target_entity_id, relationship_type, confidence, status, evidence_summary, evidence_payload, source_refs)`

- [ ] **Step 4: Add `DocumentRepository`**

Implement create/list methods plus exact entity dedupe by `(project_id, entity_type, canonical_name)`.

- [ ] **Step 5: Verify GREEN**

Run the focused repository test.

## Task 2: Parse and Chunk Document-Like Files

**Files:**

- Create: `backend/graphmind/services/document_import.py`
- Test: `backend/tests/test_document_import_phase_2.py`

- [ ] **Step 1: Write failing parser tests**

Cover:

- Markdown headings produce chunk headings and link entities.
- Nested JSON produces path-based chunks and scalar content.
- Log lines extract level, endpoint, and error code.
- Python/TypeScript import statements extract `depends_on` relationships.
- DOCX text can be extracted from `word/document.xml`.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd backend
.venv/bin/pytest tests/test_document_import_phase_2.py -q
```

Expected: missing `document_import` module or parser behavior.

- [ ] **Step 3: Implement parser dataclasses and dispatch**

Create:

- `ParsedDocument`
- `ParsedChunk`
- `ParsedEntity`
- `ParsedRelationship`
- `parse_document_file(path, display_name=None)`

- [ ] **Step 4: Implement deterministic extraction rules**

Use regex/rules only:

- URL/email/API path/file path/error code entities.
- Markdown links create `references`.
- Code import/from/require statements create `depends_on`.
- Log lines sharing trace/request IDs create `co_occurs_with`.
- Document contains chunks and mentions extracted entities.

- [ ] **Step 5: Verify GREEN**

Run the parser tests.

## Task 3: Import Mixed Batches Through Both Pipelines

**Files:**

- Modify: `backend/graphmind/services/import_service.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_document_import_phase_2.py`

- [ ] **Step 1: Write failing mixed-batch service/API tests**

Upload one CSV and one Markdown file. Assert:

- CSV still creates a table source.
- Markdown creates a document source and chunks.
- Batch items are marked `succeeded`.
- Source summaries include both `table` and `document`.
- Graph includes a document node and an entity node.

- [ ] **Step 2: Verify RED**

Run the mixed-batch tests.

- [ ] **Step 3: Split batch files by source kind**

Keep CSV/XLSX/table-shaped JSON on the existing structured path. Send Markdown/TXT/log/code/nested-JSON/DOCX/PDF files through `DocumentRepository` and `document_import`.

- [ ] **Step 4: Merge parsed document artifacts into graph tables**

Create graph nodes for document sources and extracted entities. Create graph edges for extracted relationships and deterministic `contains` edges.

- [ ] **Step 5: Verify GREEN**

Run document phase tests and Phase 1 tests together.

## Task 4: Evidence Retrieval for Documents and Extracted Relationships

**Files:**

- Modify: `backend/graphmind/services/evidence_retrieval.py`
- Test: `backend/tests/test_document_import_phase_2.py`

- [ ] **Step 1: Write failing evidence retrieval test**

After Markdown import, search for a unique term in a chunk and assert retrieved evidence includes `document_chunk` with the chunk source ref.

- [ ] **Step 2: Verify RED**

Run the evidence retrieval test.

- [ ] **Step 3: Add document evidence builders**

Extend `build_documents()` with:

- `DocumentChunk` as `document_chunk`
- `ExtractedRelationship` as `extracted_relationship`

- [ ] **Step 4: Verify GREEN**

Run evidence retrieval tests.

## Task 5: Reset and Frontend Upload Copy

**Files:**

- Modify: `backend/graphmind/services/project_data_service.py`
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Tests: `backend/tests/test_document_import_phase_2.py`, `frontend/tests/ImportPanel.test.tsx`, `frontend/tests/App.test.tsx`

- [ ] **Step 1: Write failing reset and UI tests**

Assert project reset deletes document rows and source summaries clear. Assert upload input accepts document/code/log extensions and label mentions documents/logs.

- [ ] **Step 2: Verify RED**

Run focused backend and frontend tests.

- [ ] **Step 3: Implement reset cleanup and upload copy**

Delete extracted relationships, extracted entities, chunks, and document sources during reset. Update upload accept list and localized labels.

- [ ] **Step 4: Verify GREEN**

Run focused backend and frontend tests.

## Final Verification

Run:

```bash
cd backend
.venv/bin/pytest tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_import_service.py tests/test_api.py tests/test_relationships.py tests/test_storage.py tests/test_evidence_retrieval.py -q
.venv/bin/ruff check graphmind tests

cd ../frontend
npm test -- App.test.tsx ImportPanel.test.tsx apiClientImportBatch.test.ts Workspace.test.tsx --run
npm test -- --run
npm run build
```

Expected:

- Backend tests pass.
- Ruff reports `All checks passed!`.
- Frontend tests pass.
- Frontend build succeeds.

## Self-Review

- Spec coverage: covers Phase 2 data model, parsing, graph merge, evidence, reset, and upload visibility.
- Placeholder scan: no implementation step depends on TBD behavior.
- Type consistency: model names and service names are consistent across tasks.
