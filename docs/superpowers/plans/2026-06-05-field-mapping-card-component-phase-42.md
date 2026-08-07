# Phase 42: Extract Field Mapping Card Component

## Goal

Move field profile mapping and local confirmation UI out of `ImportPanel`, including inferred type selection, key candidate toggles, and field confirmation counts.

## Plan

- [x] Add `frontend/src/components/FieldMappingCard.tsx`.
- [x] Move field draft state and field mapping helpers into the new component.
- [x] Update `ImportPanel` to render `FieldMappingCard`.
- [x] Add `frontend/tests/FieldMappingCard.test.tsx`.
- [x] Run targeted frontend tests.
- [x] Run broader frontend import/review/workspace/i18n tests.
- [x] Run frontend production build.
- [x] Run backend relationship quality tests.
- [x] Run backend lint.

## Verification

- `cd frontend && npm test -- FieldMappingCard.test.tsx ImportTaskListCard.test.tsx ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx --run`
- `cd frontend && npm test -- FieldMappingCard.test.tsx ImportTaskListCard.test.tsx ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx RelationshipReview.test.tsx Workspace.test.tsx i18n.test.tsx --run`
- `cd frontend && npm run build`
- `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`

## Notes

This phase preserves behavior: field mapping changes remain local UI state, field confirmation counts update in the card, unknown inferred types still fall back to `text`, and fields without a table prefix still show `Ungrouped`.
