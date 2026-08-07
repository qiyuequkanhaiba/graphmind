# Phase 46: Import Task Model Module

## Goal

Move import task model types and stage helper functions out of `ImportTaskListCard` so app state, workspace orchestration, and task rendering no longer depend on a UI component or `ImportPanel` as a type barrel.

## Plan

- [x] Add `frontend/src/components/importTasks.ts` for `ImportTaskStatus`, `ImportTask`, task status labels, stage keys, and localized stage names.
- [x] Update `ImportTaskListCard` to consume the neutral task model module.
- [x] Update `ImportPanel`, `App`, `Workspace`, `workspaceStore`, and task-list tests to import `ImportTask` from `importTasks.ts`.
- [x] Run focused frontend tests for import tasks, import panel, and workspace.
- [x] Run broader frontend import/review/workspace tests.
- [x] Run production build.
- [x] Run backend import and relationship quality checks to guard against integration drift.

## Expected Outcome

`ImportPanel` remains a coordinator for the import screen, while reusable import task data shapes live in a small neutral module that can support later diagnostics work without pulling in UI components.

## Verification

- `cd frontend && npm test -- ImportTaskListCard.test.tsx ImportPanel.test.tsx Workspace.test.tsx --run`
- `cd frontend && npm test -- ImportIntakeControls.test.tsx RelationshipModelingCard.test.tsx FieldMappingCard.test.tsx ImportTaskListCard.test.tsx ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx RelationshipReview.test.tsx Workspace.test.tsx i18n.test.tsx --run`
- `cd frontend && npm run build`
- `cd backend && .venv/bin/pytest tests/test_import_service.py tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`
