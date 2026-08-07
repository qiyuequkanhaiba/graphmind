# PDF Word Document Ingestion Phase 8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve non-table document ingestion so simple text PDFs are parsed into chunks, entities, relationships, graph nodes, evidence, and source inspection data without adding external runtime dependencies.

**Architecture:** Keep the existing `document_import.py` parser boundary and replace the fragile single-regex PDF extractor with a small internal PDF text-content decoder. It should read uncompressed PDF text streams and handle common `Tj`, `TJ`, escaped literal strings, hex strings, and line-position operators well enough for generated/simple text PDFs used in local workflows.

**Tech Stack:** Python standard library, existing FastAPI import pipeline, pytest.

---

## File Structure

- Modify: `backend/graphmind/services/document_import.py`
  - Add focused helpers for extracting text operands from uncompressed PDF content streams.
  - Keep `.docx` behavior unchanged except for regression coverage.
- Modify: `backend/tests/test_document_import_phase_2.py`
  - Add parser-level tests for PDF `TJ`, escaped literal strings, and hex strings.
  - Add import endpoint test that verifies PDF-derived entities show up through source inspection APIs.

## Task 1: Parser-Level PDF Text Extraction

**Files:**
- Modify: `backend/tests/test_document_import_phase_2.py`
- Modify: `backend/graphmind/services/document_import.py`

- [x] **Step 1: Write failing PDF parser test**

```python
def test_parse_pdf_extracts_text_from_tj_arrays_escaped_literals_and_hex_strings(tmp_path):
    source = tmp_path / "runbook.pdf"
    source.write_bytes(
        b"%PDF-1.4\n"
        b"1 0 obj << /Length 170 >> stream\n"
        b"BT /F1 12 Tf 72 720 Td "
        b"[(GraphMind ) (links ) <2F6170692F70726F6A65637473>] TJ "
        b"0 -14 Td (Customer\\\\(ID\\\\) maps to customerId.) Tj "
        b"ET\n"
        b"endstream endobj\n%%EOF"
    )

    parsed = parse_document_file(source)

    assert parsed.document_type == "pdf"
    assert "/api/projects" in parsed.chunks[0].content
    assert "Customer(ID) maps to customerId." in parsed.chunks[0].content
    assert any(entity.canonical_name == "/api/projects" for entity in parsed.entities)
    assert any(entity.canonical_name == "customerId" for entity in parsed.entities)
```

- [x] **Step 2: Run parser test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_parse_pdf_extracts_text_from_tj_arrays_escaped_literals_and_hex_strings -q`

Expected: FAIL because current parser only handles simple literal `Tj`.

- [x] **Step 3: Implement PDF stream text decoder**

Add helpers:

- `_extract_pdf_text(raw: bytes) -> str`
- `_pdf_stream_bodies(raw_text: str) -> list[str]`
- `_decode_pdf_literal(value: str) -> str`
- `_decode_pdf_hex(value: str) -> str`
- `_pdf_text_operands(stream: str) -> list[str]`

Support:

- `(...) Tj`
- `[...] TJ`
- `<hex> Tj`
- escaped parentheses and backslashes inside literal strings
- newline-producing text-position operators such as `Td`, `TD`, `T*`, and quote operators

- [x] **Step 4: Run parser test**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_parse_pdf_extracts_text_from_tj_arrays_escaped_literals_and_hex_strings -q`

Expected: PASS.

## Task 2: Import Endpoint PDF Source Inspection

**Files:**
- Modify: `backend/tests/test_document_import_phase_2.py`
- Modify: `backend/graphmind/services/document_import.py`

- [x] **Step 1: Write failing import endpoint test**

```python
def test_import_batch_endpoint_persists_pdf_chunks_and_entities(tmp_workspace, tmp_path):
    source = tmp_path / "runbook.pdf"
    source.write_bytes(simple_pdf_bytes_with_api_path_and_customer_id())
    response = client.post(... files=[("files", ("runbook.pdf", upload, "application/pdf"))])
    sources = client.get(f"/api/projects/{project_id}/sources/detail").json()
    chunks = client.get(f"/api/projects/{project_id}/sources/{sources[0]['id']}/chunks").json()
    entities = client.get(f"/api/projects/{project_id}/entities").json()
    assert sources[0]["document_type"] == "pdf"
    assert "/api/projects" in chunks[0]["content"]
    assert any(entity["canonical_name"] == "customerId" for entity in entities)
```

- [x] **Step 2: Run import endpoint test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_import_batch_endpoint_persists_pdf_chunks_and_entities -q`

Expected: FAIL until the enhanced PDF parser is implemented.

- [x] **Step 3: Reuse parser implementation in import pipeline**

No new route code should be needed; `parse_document_file()` already dispatches `.pdf` into `_parse_pdf_text()`.

- [x] **Step 4: Run document import tests**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py -q`

Expected: PASS.

## Task 3: Verification

**Files:**
- All modified backend files.

- [x] **Step 1: Run focused backend tests**

Run: `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py tests/test_source_entity_inspection_api_phase_5.py tests/test_entity_match_review_phase_7.py -q`

Expected: PASS.

- [x] **Step 2: Run backend regression and lint**

Run: `cd backend && .venv/bin/pytest tests/test_source_entity_inspection_api_phase_5.py tests/test_cross_source_entity_resolution_phase_4.py tests/test_code_repository_import_phase_3.py tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_api.py tests/test_evidence_retrieval.py -q`

Expected: PASS.

Run: `cd backend && .venv/bin/ruff check graphmind tests`

Expected: PASS.

- [x] **Step 3: Run frontend smoke and build**

Run: `cd frontend && npm test -- App.test.tsx ImportPanel.test.tsx Workspace.test.tsx --run`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: PASS.

## Self-Review

- Spec coverage: Improves PDF ingestion under the existing universal document pipeline and keeps `.docx` support intact.
- Placeholder scan: No placeholder-only tasks remain.
- Type consistency: No API shape changes are required; existing source inspection responses expose the parsed PDF chunks/entities.
