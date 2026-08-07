# Phase 41: Extract Import Task List Card Component

## Goal

Move import task list rendering out of `ImportPanel`, including task progress, stage progress, error details, retry buttons, and shortcut focus styling.

## Plan

- [x] Add `frontend/src/components/ImportTaskListCard.tsx`.
- [x] Move task list card rendering into the new component.
- [x] Export shared stage key/name helpers for failed import focus logic.
- [x] Update `ImportPanel` to render `ImportTaskListCard` and keep failed import target derivation in the parent.
- [x] Add `frontend/tests/ImportTaskListCard.test.tsx`.
- [x] Run targeted frontend tests.
- [x] Run broader frontend import/review/workspace/i18n tests.
- [x] Run frontend production build.
- [x] Run backend relationship quality tests.
- [x] Run backend lint.

## Verification

- `cd frontend && npm test -- ImportTaskListCard.test.tsx ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx --run`
- `cd frontend && npm test -- ImportTaskListCard.test.tsx ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx RelationshipReview.test.tsx Workspace.test.tsx i18n.test.tsx --run`
- `cd frontend && npm run build`
- `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`

## Notes

This phase preserves behavior: health shortcuts still focus the failed task or failed stage, and task-level and item-level retry buttons still call the supplied retry callbacks.
