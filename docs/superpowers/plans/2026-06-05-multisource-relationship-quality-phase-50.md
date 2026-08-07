# Phase 50: Multi-Source Relationship Quality

## Goal

Improve relationship quality scoring so document/code/log extracted relationships can be prioritized alongside table-derived candidates using source kind, evidence ref count, and cross-source support.

## Plan

- [x] Add tests for multi-source extracted relationship promotion.
- [x] Add tests for weak extracted relationship high-priority review.
- [x] Extend quality scoring with extracted-source and evidence-ref reasons.
- [x] Add i18n labels for new quality reasons.
- [x] Run backend quality/API tests.
- [x] Run frontend relationship review/i18n tests and build.

## Expected Outcome

Review queues treat strong multi-source extracted relationships as higher quality while still surfacing weak extracted relationships for urgent human review.

## Verification

- `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/pytest tests/test_document_import_phase_2.py::test_import_batch_endpoint_accepts_document_files -q`
- `cd backend && .venv/bin/pytest tests/test_relationship_quality.py tests/test_document_import_phase_2.py tests/test_api.py tests/test_graph_service.py tests/test_import_service.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`
- `cd frontend && npm test -- RelationshipReview.test.tsx RelationshipModelingCard.test.tsx ImportPanel.test.tsx Workspace.test.tsx importHealth.test.ts i18n.test.tsx --run`
- `cd frontend && npm run build`
