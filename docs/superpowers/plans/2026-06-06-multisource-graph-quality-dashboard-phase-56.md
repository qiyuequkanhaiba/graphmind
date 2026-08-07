# Phase 56: Multi-Source Graph Quality Dashboard

## Goal

Surface multi-source knowledge graph quality signals in the import health panel so users can quickly see whether non-table imports produced useful evidence-backed relationships.

## Plan

- [x] Add import health regression coverage for multi-source relationship evidence.
- [x] Count high-priority extracted relationships separately from general high-priority reviews.
- [x] Count ignored files from task diagnostics, falling back to stage diagnostics when task-level diagnostics are absent.
- [x] Render the new quality signals in the existing import health metrics.
- [x] Add Chinese and English labels for the new metrics.
- [x] Run import health, import panel, diagnostics, i18n checks, and frontend build.

## Metrics

- Multi-source evidence relationships: relationship candidates with `evidence:multi_source` or multiple `evidence_refs` / `source_refs`.
- Extracted high-priority relationships: high-priority candidates from `source:extracted_relationship` or `evidence_payload.source_kind == "extracted_relationship"`.
- Ignored files: summed from import task diagnostics, with stage diagnostics fallback.

## Expected Outcome

The import health panel now shows concise multi-source graph quality signals such as `2 条多源证据`, `1 条抽取高优先级`, and `3 个忽略文件` alongside existing failure/review/duplicate metrics.

## Verification

- `cd frontend && npm test -- importHealth.test.ts ImportHealthPanel.test.tsx --run`
- `cd frontend && npm test -- importHealth.test.ts ImportHealthPanel.test.tsx ImportPanel.test.tsx ImportTaskListCard.test.tsx i18n.test.tsx --run`
- `cd frontend && npm run build`

Known non-blocking warning:

- Vitest still prints `--localstorage-file was provided without a valid path`.
