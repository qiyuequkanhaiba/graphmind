# Import Guidance Relationship Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-run sample import flow and improve spreadsheet relationship inference so GraphMind can demonstrate credible table relationships immediately.

**Architecture:** Reuse the existing import pipeline for both uploaded files and the built-in sample dataset. Upgrade `infer_relationships` to score all compatible cross-table field pairs using value overlap, key-likeness, type compatibility, and field-name similarity, then surface richer evidence through the existing graph/suggestion response models.

**Tech Stack:** FastAPI, SQLAlchemy, DuckDB, pandas/openpyxl, React, TypeScript, Vitest, pytest.

---

## File Structure

- Modify `backend/graphmind/core/relationships.py`: add cross-name relationship scoring and richer evidence payload.
- Modify `backend/graphmind/services/import_service.py`: add sample dataset generation and import entrypoint.
- Modify `backend/graphmind/api/routes.py`: add sample import route and reuse existing response helpers.
- Modify `backend/tests/test_relationships.py`: cover异名字段外键与新证据字段.
- Modify `backend/tests/test_api.py`: cover sample import API.
- Modify `frontend/src/api/client.ts`: add `importSampleDataset`.
- Modify `frontend/src/components/ImportPanel.tsx`: add sample button and summary props.
- Modify `frontend/src/components/workbench/DataExplorerPanel.tsx`: compute/present import summary and pass sample handler.
- Modify `frontend/src/components/graph/graphSemantics.ts`: add new evidence labels and Chinese formatting.
- Modify `frontend/src/App.tsx`: wire sample import flow.
- Modify `frontend/src/i18n/messages.ts`: add Chinese and English strings.
- Modify frontend tests for App, DataExplorerPanel, and graphSemantics.

## Task 1: Relationship Inference Quality

- [ ] Write a failing backend test for `Orders.customer_id -> Customers.id`.
- [ ] Run the specific pytest test and confirm it fails because the relationship is not inferred.
- [ ] Implement cross-field scoring, richer evidence payload, sample matches, and relationship strength.
- [ ] Run relationship tests until green.

## Task 2: Built-In Sample Import API

- [ ] Write a failing API test for `POST /api/projects/{project_id}/sample-import`.
- [ ] Run the specific pytest test and confirm it fails because the route is missing.
- [ ] Implement `ImportService.import_sample_dataset`.
- [ ] Add the FastAPI route and response wiring.
- [ ] Run API/import tests until green.

## Task 3: Frontend Sample Import Flow

- [ ] Write failing Vitest coverage for the sample import button and app wiring.
- [ ] Run the specific Vitest tests and confirm they fail because the UI/API do not exist.
- [ ] Add API client method, i18n strings, App handler, ImportPanel button, and summary display.
- [ ] Run the targeted frontend tests until green.

## Task 4: Evidence Formatting

- [ ] Write failing Vitest coverage for new evidence payload rows and Chinese summary.
- [ ] Run the specific Vitest test and confirm it fails because labels/formatting are missing.
- [ ] Extend `graphSemantics.ts` formatting.
- [ ] Run graph semantics tests until green.

## Task 5: Final Verification

- [ ] Run `uv run pytest -q` in `backend`.
- [ ] Run `uv run ruff check graphmind tests` in `backend`.
- [ ] Run `npm test` in `frontend`.
- [ ] Run `npm run lint` in `frontend`.
- [ ] Run `npm run build` in `frontend`.
- [ ] Use the browser against `http://127.0.0.1:5173/` if the dev server is running, or start it and inspect the sample import path.

## Self-Review

- Spec coverage: Tasks cover sample import, import guidance,异名字段关系发现, richer evidence, and frontend Chinese display.
- Placeholder scan: No `TBD` or incomplete implementation instructions remain.
- Type consistency: `ImportResult` is reused for sample import, so frontend and backend response shapes remain aligned.
