# Phase 45: Import Panel Modularization Assessment

## Goal

Assess the import workflow after the Phase 38-44 component extraction work and identify the next highest-value implementation phases for multi-file, semi-structured, and unstructured source imports into a complete relationship knowledge graph.

## Frontend Modularization Status

`ImportPanel` is now a coordinator instead of a monolithic UI surface. It still owns:

- Import health overview and queue derivation.
- Failed import shortcut focus and retry routing.
- Field node filtering from graph nodes.
- Passing data and callbacks into focused child components.

Focused import UI modules now own their own display and local interaction state:

- `ImportIntakeControls`: upload controls, sample/reset actions, batch-only file routing, and import wizard steps.
- `ImportHealthPanel`: health status metrics, retry affordance, and action queue rendering.
- `ImportSummaryCard`: detected tables/fields/candidates, import status copy, and graph footprint.
- `ImportSourceSummaryCard`: source-kind counts.
- `ImportTaskListCard`: import task progress, stages, failure details, retry actions, and shortcut focus styling.
- `FieldMappingCard`: local field type/key-candidate/confirmation drafts.
- `RelationshipModelingCard`: local relationship draft state, rule filters, merge groups, and confirmation callbacks.
- `importHealth.ts`: pure import health overview and queue model helpers.

## Current Import Capability

The project already has a meaningful end-to-end foundation:

- Single table import persists datasets, profiles, relationship suggestions, and graph nodes/edges.
- Structured batch import handles multiple files with per-item stages, partial failures, retryable items, source summaries, graph creation, and cross-source resolution.
- Non-table and semi-structured intake exists for Markdown, text, JSON-as-document, logs, common code files, DOCX, PDF text extraction, and ZIP code repositories.
- Code repository ZIP parsing filters unsafe paths, ignored dependency/build directories, oversized files, and binary payloads.
- Document/code/log parsing produces chunks, extracted entities, extracted relationships, and source references.
- Cross-source entity resolution can create `matches_entity` and `documented_mapping` graph edges.
- Relationship governance, review filters, quality priority, duplicate cleanup, and import health shortcuts already have UI coverage.

## Remaining Gaps

The largest remaining gap is not more `ImportPanel` UI splitting. It is improving the backend graph construction and evidence model so imported non-tabular sources contribute richer, reviewable relationships.

Priority gaps:

- Document/code/log extracted entities and relationships need stronger promotion into the main graph and relationship review flow.
- Evidence inspection should connect table-derived relationship suggestions, extracted document/code relationships, and generated graph edges through consistent evidence refs.
- Import batch summaries should expose richer per-source diagnostics: parsed chunk count, extracted entity count, extracted relationship count, ignored repository file count, and resolved edge count.
- Relationship quality scoring should include document/code/log evidence, not only table overlap heuristics.
- Retry and partial failure reporting should distinguish parser failures, unsupported file types, binary/oversized files, and relationship extraction failures.
- There is still a public type dependency on `ImportPanel` for `ImportTask`; moving import task types into a neutral model module would reduce coupling.

## Recommended Next Phases

1. Phase 46: Move `ImportTask` and import task/stage helpers into a neutral `importTasks.ts` model module.
   - Why: decouples `App`, `Workspace`, store, and task UI from `ImportPanel`.
   - Risk: low; type/import-path cleanup with existing tests.

2. Phase 47: Add backend import batch diagnostics for parsed documents/code/logs.
   - Track chunk/entity/relationship counts and ignored repository files in item and batch summaries.
   - Surface these counts through existing source summary/task UI.

3. Phase 48: Promote extracted document/code/log relationships into reviewable relationship suggestions.
   - Use source refs and evidence payloads so they can be accepted/rejected like table relationship candidates.

4. Phase 49: Unify evidence references across graph edges, relationship suggestions, extracted relationships, and source inspection.
   - Goal: clicking a graph edge or review candidate can reliably open the supporting document/table/code evidence.

5. Phase 50: Add relationship quality scoring for multi-source evidence.
   - Incorporate entity aliases, source kind, document relationship confidence, field overlap, and duplicate/governance signals.

## Verification

- [x] Run frontend import component tests.
- [x] Run broader frontend import/review/workspace/i18n tests.
- [x] Run frontend production build.
- [x] Run backend import service tests.
- [x] Run backend relationship quality tests.
- [x] Run backend lint.

Commands run:

- `cd frontend && npm test -- ImportIntakeControls.test.tsx RelationshipModelingCard.test.tsx FieldMappingCard.test.tsx ImportTaskListCard.test.tsx ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx --run`
- `cd frontend && npm test -- ImportIntakeControls.test.tsx RelationshipModelingCard.test.tsx FieldMappingCard.test.tsx ImportTaskListCard.test.tsx ImportSourceSummaryCard.test.tsx ImportSummaryCard.test.tsx ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx RelationshipReview.test.tsx Workspace.test.tsx i18n.test.tsx --run`
- `cd frontend && npm run build`
- `cd backend && .venv/bin/pytest tests/test_import_service.py tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`

## Recommendation

Proceed with Phase 46 first. It is a small architecture cleanup that prepares for backend import-task diagnostics without pulling more types through `ImportPanel`.
