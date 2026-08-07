# Phase 57: Backend Internal Anchor Metadata

## Goal

Mark internal extracted-relationship anchor graph nodes explicitly in backend metadata so frontend hiding does not depend only on generated labels or source refs.

## Plan

- [x] Add backend regression coverage for internal `Extracted entities` graph nodes.
- [x] Extend `SheetProfileData` with optional metadata.
- [x] Populate profile metadata from the owning dataset when loading sheet profiles from storage.
- [x] Add `import_status: "internal"` and `source_kind: "extracted_relationship_anchor"` to graph node metadata for internal profiles.
- [x] Reload project graph profiles before batch graph construction so internal anchor sheets are included after document relationship promotion.
- [x] Run backend document/universal/API/graph checks and ruff.
- [x] Run frontend resource tree checks and build.

## Expected Outcome

Internal anchor graph nodes now carry explicit metadata:

- `import_status: "internal"`
- `source_kind: "extracted_relationship_anchor"`

The frontend can hide these nodes through explicit metadata while keeping the existing generated-name fallback for older graphs.

## Verification

- `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_import_service_imports_mixed_structured_and_document_batch -q`
- `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_api.py tests/test_graph_service.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`
- `cd frontend && npm test -- workbenchStats.test.ts DataExplorerPanel.test.tsx Workspace.test.tsx --run`
- `cd frontend && npm run build`
