# Phase 53: Extracted Relationship Display Labels

## Goal

Show user-facing entity names for extracted relationship suggestions while preserving internal anchor field IDs and storage behavior.

## Plan

- [x] Add backend regression coverage that document-derived relationship suggestions use extracted source/target entity names.
- [x] Keep the internal `__graphmind_extracted_relationships__` anchor fields for review compatibility.
- [x] Resolve extracted relationship display labels at the API response layer from `extracted_relationship_id`.
- [x] Fall back to field labels for table-derived suggestions and incomplete extracted relationship payloads.
- [x] Run backend document import/API/relationship quality checks.

## Expected Outcome

The review queue can show labels such as `architecture.md -> Project API` for document/code/log relationships instead of internal labels such as `Extracted entities.entity_1`.

## Verification

- `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_import_batch_endpoint_accepts_document_files -q`
- `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py tests/test_api.py tests/test_relationship_quality.py -q`
