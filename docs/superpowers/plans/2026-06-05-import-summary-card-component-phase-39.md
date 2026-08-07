# Phase 39: Extract Import Summary Card Component

## Goal

Move the detected tables, fields, relationship candidate counts, import message, and graph footprint card out of `ImportPanel`.

## Plan

- [x] Add `frontend/src/components/ImportSummaryCard.tsx`.
- [x] Move result summary card rendering into the new component.
- [x] Update `ImportPanel` to render `ImportSummaryCard`.
- [x] Add `frontend/tests/ImportSummaryCard.test.tsx`.
- [x] Run targeted frontend tests.
- [x] Run broader frontend import/review/workspace/i18n tests.
- [x] Run frontend production build.
- [x] Run backend relationship quality tests.
- [x] Run backend lint.

## Verification

- `cd frontend && npm test -- ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx --run`
- `cd frontend && npm test -- ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx RelationshipReview.test.tsx Workspace.test.tsx i18n.test.tsx --run`
- `cd frontend && npm run build`
- `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`

## Notes

This phase preserves behavior: `importStatus` remains the primary message, `dataSummary` remains supporting copy when both are present, and the graph footprint continues to show node and edge counts.
