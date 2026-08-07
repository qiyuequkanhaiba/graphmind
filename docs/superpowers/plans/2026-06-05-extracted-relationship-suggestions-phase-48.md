# Phase 48: Extracted Relationship Suggestions

## Goal

Promote document/code/log extracted relationships into the existing relationship review queue so non-tabular imports can be accepted, edited, or rejected like table-derived relationship candidates.

## Plan

- [x] Add a regression test that document import creates pending relationship suggestions from extracted relationships.
- [x] Add reusable document relationship anchor fields compatible with current `RelationshipSuggestion` schema.
- [x] Create/dedupe pending suggestions for extracted relationships during document and repository persistence.
- [x] Preserve source refs and extracted relationship IDs in evidence payloads.
- [x] Run targeted backend tests.
- [x] Run backend lint and frontend relationship-review checks.

## Expected Outcome

Imported Markdown, PDF, Word, JSON-document, code, and log relationships produce reviewable `RelationshipSuggestion` rows without changing the frontend suggestion contract.

## Verification

- `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_import_service_imports_mixed_structured_and_document_batch -q`
- `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py -q`
- `cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py tests/test_document_import_phase_2.py tests/test_import_service.py tests/test_relationship_quality.py tests/test_api.py tests/test_graph_service.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`
- `cd frontend && npm test -- RelationshipReview.test.tsx RelationshipModelingCard.test.tsx ImportPanel.test.tsx Workspace.test.tsx importHealth.test.ts --run`
- `cd frontend && npm run build`
