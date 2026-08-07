# Phase 38: Extract Import Health Panel Component

## Goal

Move the import health presentation out of `ImportPanel` so the main import panel keeps the workflow and data wiring, while the health card owns metrics, retry affordance, and action queue rendering.

## Plan

- [x] Add `frontend/src/components/ImportHealthPanel.tsx`.
- [x] Move import health status labels, metric action rendering, retry action rendering, and queue markup into the new component.
- [x] Update `ImportPanel` to pass health state, queue items, and callbacks to `ImportHealthPanel`.
- [x] Add `frontend/tests/ImportHealthPanel.test.tsx`.
- [x] Run targeted frontend tests.
- [x] Run broader frontend import/review/workspace/i18n tests.
- [x] Run frontend production build.
- [x] Run backend relationship quality tests.
- [x] Run backend lint.

## Verification

- `cd frontend && npm test -- ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx --run`
- `cd frontend && npm test -- ImportHealthPanel.test.tsx importHealth.test.ts ImportPanel.test.tsx RelationshipReview.test.tsx Workspace.test.tsx i18n.test.tsx --run`
- `cd frontend && npm run build`
- `cd backend && .venv/bin/pytest tests/test_relationship_quality.py -q`
- `cd backend && .venv/bin/ruff check graphmind tests`

## Notes

This phase keeps import health behavior unchanged. `ImportPanel` still derives health state and owns failed import focus/retry behavior; `ImportHealthPanel` only renders the card and invokes supplied callbacks.
