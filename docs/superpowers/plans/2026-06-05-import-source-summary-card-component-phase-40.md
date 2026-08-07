# Phase 40: Extract Import Source Summary Card Component

## Goal

Move the source kind overview card out of `ImportPanel` so source summary rendering has its own focused component.

## Plan

- [x] Add `frontend/src/components/ImportSourceSummaryCard.tsx`.
- [x] Move source summary card rendering into the new component.
- [x] Update `ImportPanel` to render `ImportSourceSummaryCard`.
- [x] Remove the source-summary-only metric helper from `ImportPanel`.
- [x] Add `frontend/tests/ImportSourceSummaryCard.test.tsx`.
- [x] Run targeted frontend tests.
- [x] Run broader frontend import/review/workspace/i18n tests.
- [x] Run frontend production build.
- [x] Run backend relationship quality tests.
- [x] Run backend lint.

## Verification

- `cd frontend && npm test -- ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx --run`
- `cd frontend && npm test -- ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx RelationshipReview.test.tsx Workspace.test.tsx i18n.test.tsx --run`
- `cd frontend && npm run build`
- `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`

## Notes

This phase preserves behavior: the source overview card still appears only when source summaries exist and renders the same `{kind} · {count}` metric labels.
