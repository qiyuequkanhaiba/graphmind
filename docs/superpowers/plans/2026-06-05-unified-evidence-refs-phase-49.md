# Phase 49: Unified Evidence Refs

## Goal

Normalize evidence references across relationship suggestions, graph edges, extracted relationships, and document chunks so review and graph surfaces can consistently navigate back to source evidence.

## Plan

- [x] Add regression coverage for graph edge `evidence_refs`.
- [x] Add regression coverage that document-derived suggestions, extracted relationships, and graph edges share the same `evidence_refs`.
- [x] Add a backend helper for normalized evidence ref arrays.
- [x] Populate `evidence_refs` in extracted relationship payloads and promoted suggestions.
- [x] Expose `evidence_refs` on graph edge API responses.
- [x] Update frontend graph edge typing.
- [x] Run backend/API/frontend checks.

## Expected Outcome

Every relationship-oriented surface keeps the legacy single `evidence_ref` while also exposing a canonical `evidence_refs` array for stable source navigation.

## Verification

- `cd backend && .venv/bin/pytest tests/test_api.py::test_get_graph_returns_edge_evidence_and_suggestion_linkage -q`
- `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_import_batch_endpoint_accepts_document_files -q`
- `cd backend && .venv/bin/pytest tests/test_api.py tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_evidence_retrieval.py tests/test_graph_service.py tests/test_import_service.py tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`
- `cd frontend && npm test -- RelationshipReview.test.tsx RelationshipModelingCard.test.tsx ImportPanel.test.tsx Workspace.test.tsx importHealth.test.ts --run`
- `cd frontend && npm run build`
