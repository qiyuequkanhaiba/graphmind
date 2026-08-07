# Phase 37: Rename Import Health Model Module

## Goal

Align the shared import health model module name with its current responsibility. The module now owns both health overview derivation and action queue construction, so `importHealth.ts` is clearer than `importHealthQueue.ts`.

## Plan

- [x] Rename `frontend/src/components/importHealthQueue.ts` to `frontend/src/components/importHealth.ts`.
- [x] Rename `frontend/tests/ImportPanelQueue.test.ts` to `frontend/tests/importHealth.test.ts`.
- [x] Update `ImportPanel` imports to use `./importHealth`.
- [x] Update unit tests to import from `../src/components/importHealth`.
- [x] Run targeted frontend tests.
- [x] Run broader frontend import/review/workspace/i18n tests.
- [x] Run frontend production build.
- [x] Run backend relationship quality tests.
- [x] Run backend lint.

## Verification

- `cd frontend && npm test -- importHealth.test.ts ImportPanel.test.tsx --run`
- `cd frontend && npm test -- importHealth.test.ts ImportPanel.test.tsx RelationshipReview.test.tsx Workspace.test.tsx i18n.test.tsx --run`
- `cd frontend && npm run build`
- `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`

## Notes

This phase is a naming and ownership cleanup only. It intentionally preserves the existing health overview and queue behavior.
