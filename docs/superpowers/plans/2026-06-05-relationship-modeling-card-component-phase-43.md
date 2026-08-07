# Phase 43: Extract Relationship Modeling Card Component

## Goal

Move relationship candidate modeling out of `ImportPanel`, including local draft state, confidence/type rules, merge group detection, single relationship confirmation, and merge group confirmation.

## Plan

- [x] Add `frontend/src/components/RelationshipModelingCard.tsx`.
- [x] Move relationship modeling state and helpers into the new component.
- [x] Update `ImportPanel` to render `RelationshipModelingCard`.
- [x] Add `frontend/tests/RelationshipModelingCard.test.tsx`.
- [x] Run targeted frontend tests.
- [x] Run broader frontend import/review/workspace/i18n tests.
- [x] Run frontend production build.
- [x] Run backend relationship quality tests.
- [x] Run backend lint.

## Verification

- `cd frontend && npm test -- RelationshipModelingCard.test.tsx FieldMappingCard.test.tsx ImportTaskListCard.test.tsx ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx --run`
- `cd frontend && npm test -- RelationshipModelingCard.test.tsx FieldMappingCard.test.tsx ImportTaskListCard.test.tsx ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx RelationshipReview.test.tsx Workspace.test.tsx i18n.test.tsx --run`
- `cd frontend && npm run build`
- `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`

## Notes

This phase preserves behavior: relationship modeling changes remain local UI state until confirmation, merge confirmation still uses the highest-confidence candidate as canonical type, and the parent `onConfirmRelationship` callback receives the same review payloads.
