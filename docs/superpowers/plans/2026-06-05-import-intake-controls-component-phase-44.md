# Phase 44: Extract Import Intake Controls Component

## Goal

Move upload controls, sample/reset actions, batch-only file routing, and the import modeling wizard out of `ImportPanel`.

## Plan

- [x] Add `frontend/src/components/ImportIntakeControls.tsx`.
- [x] Move file routing and wizard step derivation into the new component.
- [x] Update `ImportPanel` to render `ImportIntakeControls`.
- [x] Add `frontend/tests/ImportIntakeControls.test.tsx`.
- [x] Run targeted frontend tests.
- [x] Run broader frontend import/review/workspace/i18n tests.
- [x] Run frontend production build.
- [x] Run backend relationship quality tests.
- [x] Run backend lint.

## Verification

- `cd frontend && npm test -- ImportIntakeControls.test.tsx RelationshipModelingCard.test.tsx FieldMappingCard.test.tsx ImportTaskListCard.test.tsx ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx --run`
- `cd frontend && npm test -- ImportIntakeControls.test.tsx RelationshipModelingCard.test.tsx FieldMappingCard.test.tsx ImportTaskListCard.test.tsx ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx RelationshipReview.test.tsx Workspace.test.tsx i18n.test.tsx --run`
- `cd frontend && npm run build`
- `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`

## Notes

This phase preserves behavior: multi-file uploads use batch import, batch-only extensions such as `.zip`, `.pdf`, `.docx`, code, markdown, and logs use batch import, table files still use single-file import, and wizard state still follows `dataStats`.
