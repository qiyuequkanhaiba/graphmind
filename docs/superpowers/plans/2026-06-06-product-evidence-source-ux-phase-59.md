# Phase 59: Product Evidence Source UX

## Goal

Improve evidence-source navigation from relationship evidence to source inspection with clearer labels and precise chunk focus.

## Product Plan

- [x] Show source titles alongside canonical evidence refs in EvidenceInspector.
- [x] Keep the raw ref visible so advanced users can still audit exact provenance.
- [x] When a user opens an evidence ref, switch to the data module and select the matching source.
- [x] Highlight the matching source chunk when the ref points to a chunk-like location.
- [x] Keep non-source refs such as `suggestion:*` visible but non-clickable.

## UX Rules

- Evidence refs should be compact, not a new heavy panel.
- Source title is the primary human cue; canonical ref remains visible in smaller text.
- Chunk focus is visual only; it must not filter away surrounding context.
- If a ref cannot match a source/chunk, do nothing instead of showing a false destination.

## Verification Plan

- [x] EvidenceInspector test for source title display and raw ref preservation.
- [x] DataExplorerPanel test for focused chunk highlighting.
- [x] Workspace test for full evidence ref to source/chunk focus flow.
- [x] Frontend regression and build.

## Verification

- `cd frontend && npm test -- EvidenceInspector.test.tsx DataExplorerPanel.test.tsx Workspace.test.tsx --run`
- `cd frontend && npm test -- EvidenceInspector.test.tsx DataExplorerPanel.test.tsx Workspace.test.tsx RelationshipReview.test.tsx RelationshipModelingCard.test.tsx ImportPanel.test.tsx importHealth.test.ts i18n.test.tsx --run`
- `cd frontend && npm run build`

Known non-blocking warning:

- Vitest still prints `--localstorage-file was provided without a valid path`.
