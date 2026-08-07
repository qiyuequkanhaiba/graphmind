# Phase 58: Evidence Inspector Source Navigation

## Goal

Finish the remaining evidence navigation gap by showing canonical relationship evidence refs in EvidenceInspector and letting users jump from a relationship back to the originating source inspection.

## Plan

- [x] Render unique relationship evidence refs from legacy `evidence_ref` plus canonical `evidence_refs`.
- [x] Keep non-source refs such as `suggestion:*` visible but non-clickable.
- [x] Make source-like refs clickable in EvidenceInspector.
- [x] Wire EvidenceInspector clicks through InsightPanel and Workspace.
- [x] Focus the matching source in DataExplorer and switch the workbench to the data module.
- [x] Add regression coverage for deduplicated evidence refs and source inspection navigation.
- [x] Run frontend evidence/workspace/data/review/import/i18n checks and production build.

## Expected Outcome

Users can select a relationship, see all canonical evidence refs such as `architecture.md#overview`, and open the matching source inspection directly from the evidence panel.

## Verification

- `cd frontend && npm test -- EvidenceInspector.test.tsx Workspace.test.tsx --run`
- `cd frontend && npm test -- EvidenceInspector.test.tsx Workspace.test.tsx DataExplorerPanel.test.tsx RelationshipReview.test.tsx RelationshipModelingCard.test.tsx ImportPanel.test.tsx importHealth.test.ts i18n.test.tsx --run`
- `cd frontend && npm run build`

Known non-blocking warning:

- Vitest still prints `--localstorage-file was provided without a valid path`.
