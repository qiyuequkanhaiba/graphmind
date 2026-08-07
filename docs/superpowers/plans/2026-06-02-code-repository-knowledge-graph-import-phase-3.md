# Code Repository Knowledge Graph Import Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ZIP code repository import so GraphMind can turn repository files, symbols, imports, and README-style documentation into evidence-backed graph nodes and relationships.

**Architecture:** Treat a ZIP archive as one batch item with `source_kind="code"` and multiple `DocumentSource` records inside it. Repository files are safely enumerated from the archive, filtered for source/document extensions, parsed through the existing document pipeline, and persisted into the existing document/entity/relationship graph path. Code parsing adds symbol entities for functions/classes and `defines` relationships from file entities to symbols.

**Tech Stack:** Python `zipfile`, existing SQLAlchemy repositories, existing `ImportService`/`DocumentRepository`, FastAPI upload route, React/Vitest upload component tests.

---

## File Structure

- Create: `backend/graphmind/services/code_repository_import.py`
  - Enumerates `.zip` archives without unsafe path traversal.
  - Skips generated/vendor/cache directories and oversized/binary entries.
  - Writes safe archive entries to a temporary directory and returns parsed repository documents with repo-relative paths.
- Modify: `backend/graphmind/services/document_import.py`
  - Extract function/class symbols from code files.
  - Add `defines` relationships from code file entities to symbol entities.
- Modify: `backend/graphmind/services/import_service.py`
  - Detect ZIP archives in batch import.
  - Persist multiple parsed repository documents under a single batch item.
  - Preserve repo-relative titles and raw artifact references.
- Modify: `backend/graphmind/api/routes.py`
  - Accept `.zip` in the batch import endpoint.
- Create: `backend/tests/test_code_repository_import_phase_3.py`
  - Cover archive filtering, parser extraction, service persistence, API acceptance, graph output, and evidence retrieval.
- Modify: `frontend/src/components/ImportPanel.tsx`
  - Add `.zip` to the file input accept list.
- Modify: `frontend/src/i18n/messages.ts`
  - Mention ZIP repositories in upload help text.
- Modify: `frontend/tests/ImportPanel.test.tsx`
  - Assert ZIP is accepted by the upload control.

## Task 1: Repository Archive Parser

**Files:**
- Create: `backend/graphmind/services/code_repository_import.py`
- Test: `backend/tests/test_code_repository_import_phase_3.py`

- [ ] **Step 1: Write the failing parser test**

```python
def test_parse_code_repository_archive_filters_and_preserves_repo_paths(tmp_path: Path):
    archive_path = tmp_path / "repo.zip"
    with ZipFile(archive_path, "w") as archive:
        archive.writestr(
            "repo/src/app.py",
            "from graphmind.storage.repositories import DocumentRepository\n"
            "class ImportRunner:\n"
            "    pass\n"
            "def run_import():\n"
            "    return DocumentRepository\n",
        )
        archive.writestr("repo/README.md", "# Repo\nUses rareword-zeta import flow.\n")
        archive.writestr("repo/node_modules/pkg/index.js", "export const ignored = true;\n")

    parsed = parse_code_repository_archive(archive_path, display_name="repo.zip")

    assert [document.title for document in parsed] == ["README.md", "src/app.py"]
    assert any(entity.canonical_name == "src/app.py::run_import" for entity in parsed[1].entities)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_code_repository_import_phase_3.py::test_parse_code_repository_archive_filters_and_preserves_repo_paths -q`

Expected: FAIL because `parse_code_repository_archive` does not exist yet.

- [ ] **Step 3: Implement archive parsing**

Implement safe ZIP iteration, ignored directory checks, text/binary checks, and `parse_document_file(extracted_path, relative_path)` reuse.

- [ ] **Step 4: Run parser test**

Run: `cd backend && .venv/bin/pytest tests/test_code_repository_import_phase_3.py::test_parse_code_repository_archive_filters_and_preserves_repo_paths -q`

Expected: PASS.

## Task 2: Code Symbols

**Files:**
- Modify: `backend/graphmind/services/document_import.py`
- Test: `backend/tests/test_code_repository_import_phase_3.py`

- [ ] **Step 1: Write failing symbol assertions**

```python
assert any(entity.entity_type == "function" and entity.canonical_name == "src/app.py::run_import" for entity in parsed[1].entities)
assert any(entity.entity_type == "class" and entity.canonical_name == "src/app.py::ImportRunner" for entity in parsed[1].entities)
assert any(relationship.relationship_type == "defines" and relationship.target_name == "src/app.py::run_import" for relationship in parsed[1].relationships)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_code_repository_import_phase_3.py::test_parse_code_repository_archive_filters_and_preserves_repo_paths -q`

Expected: FAIL because code symbols are not extracted yet.

- [ ] **Step 3: Implement symbol extraction**

Add conservative regex/AST-light rules for Python and JS/TS-style function/class declarations. Keep symbol canonical names repo-relative: `<path>::<symbol>`.

- [ ] **Step 4: Run parser test**

Run: `cd backend && .venv/bin/pytest tests/test_code_repository_import_phase_3.py::test_parse_code_repository_archive_filters_and_preserves_repo_paths -q`

Expected: PASS.

## Task 3: Batch Import Persistence

**Files:**
- Modify: `backend/graphmind/services/import_service.py`
- Test: `backend/tests/test_code_repository_import_phase_3.py`

- [ ] **Step 1: Write failing service test**

```python
result = ImportService(paths, session_factory).import_structured_batch(project_id, [archive_path], label="Repo batch")

assert result.document_count == 2
assert item.filename == "repo.zip"
assert item.source_kind == "code"
assert item.summary["repository_file_count"] == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_code_repository_import_phase_3.py::test_import_service_imports_repository_zip_as_code_documents -q`

Expected: FAIL because ZIP is unsupported.

- [ ] **Step 3: Implement service support**

Detect `.zip`, create one import item, parse archive documents, persist each parsed document under that item, aggregate item summary counts, and keep ignored files out of graph/evidence.

- [ ] **Step 4: Run service test**

Run: `cd backend && .venv/bin/pytest tests/test_code_repository_import_phase_3.py::test_import_service_imports_repository_zip_as_code_documents -q`

Expected: PASS.

## Task 4: API and Evidence

**Files:**
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_code_repository_import_phase_3.py`

- [ ] **Step 1: Write failing API/evidence tests**

Add a FastAPI upload test for `.zip` and an evidence search test for `DocumentRepository run_import`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_code_repository_import_phase_3.py::test_import_batch_endpoint_accepts_repository_zip tests/test_code_repository_import_phase_3.py::test_evidence_retrieval_finds_code_repository_chunks -q`

Expected: FAIL because route suffix and service support are missing before implementation.

- [ ] **Step 3: Implement API suffix support**

Add `.zip` to `BATCH_IMPORT_SUFFIXES`.

- [ ] **Step 4: Run API/evidence tests**

Run: `cd backend && .venv/bin/pytest tests/test_code_repository_import_phase_3.py -q`

Expected: PASS.

## Task 5: Frontend Upload Contract

**Files:**
- Modify: `frontend/src/components/ImportPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/tests/ImportPanel.test.tsx`

- [ ] **Step 1: Write failing frontend assertion**

```typescript
expect(screen.getByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志")).toHaveAttribute(
  "accept",
  expect.stringContaining(".zip")
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- ImportPanel.test.tsx --run`

Expected: FAIL because `.zip` is not in the accept attribute yet.

- [ ] **Step 3: Add `.zip` and copy text**

Update upload `accept` and upload help copy to mention ZIP repositories.

- [ ] **Step 4: Run frontend test**

Run: `cd frontend && npm test -- ImportPanel.test.tsx --run`

Expected: PASS.

## Task 6: Verification

**Files:**
- All modified files.

- [ ] **Step 1: Run focused backend tests**

Run: `cd backend && .venv/bin/pytest tests/test_code_repository_import_phase_3.py tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_import_service.py tests/test_api.py tests/test_relationships.py tests/test_storage.py tests/test_evidence_retrieval.py -q`

Expected: PASS.

- [ ] **Step 2: Run backend lint**

Run: `cd backend && .venv/bin/ruff check graphmind tests`

Expected: PASS.

- [ ] **Step 3: Run focused frontend tests**

Run: `cd frontend && npm test -- App.test.tsx ImportPanel.test.tsx apiClientImportBatch.test.ts Workspace.test.tsx --run`

Expected: PASS.

- [ ] **Step 4: Run full frontend tests**

Run: `cd frontend && npm test -- --run`

Expected: PASS.

- [ ] **Step 5: Build frontend**

Run: `cd frontend && npm run build`

Expected: PASS.

## Self-Review

- Spec coverage: This plan covers Phase 3 repository ZIP import, code symbol extraction, persistence into existing evidence graph, API upload, and frontend acceptance.
- Placeholder scan: No placeholder tasks remain; each step names concrete files and commands.
- Type consistency: The plan keeps source kinds compatible with existing frontend summaries by using `source_kind="code"` for repository ZIP items.
