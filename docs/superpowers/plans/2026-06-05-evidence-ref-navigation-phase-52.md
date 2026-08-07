# Phase 52: Evidence-Ref Navigation Upgrade

## Goal

Use canonical `evidence_refs` for frontend graph/evidence navigation while preserving the legacy single `evidence_ref` behavior.

## Plan

- [x] Add Workspace regression coverage for retrieved evidence that points to a canonical source ref such as `architecture.md#overview`.
- [x] Add Workspace regression coverage for AI graph actions that open evidence through `evidence_refs` without explicit edge IDs or suggestion IDs.
- [x] Update Workspace edge matching to compare normalized references against both `edge.evidence_ref` and `edge.evidence_refs`.
- [x] Keep existing suggestion ID matching, explicit edge matching, and relationship-label matching intact.
- [x] Run focused Workspace tests.
- [x] Run frontend relationship/import/workspace/i18n regression tests.
- [x] Run frontend production build.

## Expected Outcome

AI citations, retrieved evidence, and graph actions can open the correct relationship evidence when the source points at canonical document/code/log/table evidence refs instead of only `suggestion:*` refs.

## Verification

- `cd frontend && npm test -- Workspace.test.tsx --run`
- `cd frontend && npm test -- RelationshipReview.test.tsx RelationshipModelingCard.test.tsx ImportPanel.test.tsx Workspace.test.tsx importHealth.test.ts i18n.test.tsx --run`
- `cd frontend && npm run build`

Known non-blocking warning:

- Vitest still prints `--localstorage-file was provided without a valid path` in the combined frontend run.
