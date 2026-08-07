# Phase 54: Import Diagnostics UI

## Goal

Render backend import diagnostics in the import task UI so users can understand what multi-file and multi-format imports produced.

## Plan

- [x] Add frontend regression coverage for task-level and stage-level diagnostics.
- [x] Add `ImportDiagnostics` typing for batch summaries, item summaries, stages, and import tasks.
- [x] Carry batch and stage diagnostics from API responses into `ImportTask` state.
- [x] Render compact diagnostics chips for documents, repository files, chunks, entities, relationships, graph nodes, graph edges, ignored files, and source kind counts.
- [x] Add Chinese and English labels for diagnostics chips.
- [x] Keep chips responsive inside task rows and stage rows.
- [x] Run frontend import/task/App/i18n checks and production build.

## Expected Outcome

Import tasks now show concise operational diagnostics such as `2 文档`, `8 分块`, `5 实体`, `3 关系`, `1 忽略`, and source kind counts. This makes large document/code/log/table imports easier to inspect without opening backend summaries.

## Verification

- `cd frontend && npm test -- ImportTaskListCard.test.tsx --run`
- `cd frontend && npm test -- ImportTaskListCard.test.tsx ImportPanel.test.tsx App.test.tsx apiClientImportBatch.test.ts i18n.test.tsx --run`
- `cd frontend && npm run build`

Known non-blocking warning:

- Vitest still prints `--localstorage-file was provided without a valid path`.
