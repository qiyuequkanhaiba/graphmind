# AI Graph Action Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI answer action loop so chat responses can drive graph highlighting, focus, evidence opening, and pending-review navigation.

**Architecture:** Extend the existing cited-answer contract with deterministic `graph_actions` and `next_steps`. The backend keeps rule-derived actions as the trusted control plane, while the frontend renders action buttons in `ChatPanel` and lets `Workspace` translate each action into current graph selection, tab, and highlight state.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, React, TypeScript, React Flow, Vitest, pytest.

---

## File Map

- Modify: `backend/graphmind/core/answer_contract.py` - add `GraphAction` and answer fields.
- Modify: `backend/graphmind/api/schemas.py` - add API response schema fields.
- Modify: `backend/graphmind/api/routes.py` - serialize new answer fields.
- Modify: `backend/graphmind/services/chat_service.py` - build deterministic graph actions.
- Modify: `backend/tests/test_chat_service.py` - lock service action behavior.
- Modify: `backend/tests/test_api.py` - lock API response shape.
- Modify: `frontend/src/api/types.ts` - add `GraphAction`, `graph_actions`, `next_steps`.
- Modify: `frontend/src/App.tsx` - persist actions on assistant messages.
- Modify: `frontend/src/components/ChatPanel.tsx` - render action buttons.
- Modify: `frontend/src/components/Workspace.tsx` - execute graph actions.
- Modify: `frontend/src/components/workbench/InsightPanel.tsx` - pass action callback.
- Modify: `frontend/src/i18n/messages.ts` - add labels.
- Modify: `frontend/src/styles/app.css` - style compact action buttons.
- Modify: `frontend/tests/ChatPanel.test.tsx` - lock action rendering.
- Modify: `frontend/tests/Workspace.test.tsx` - lock action execution.
- Modify: `frontend/tests/App.test.tsx` - lock API-to-message propagation.

## Tasks

### Task 1: Backend Contract Tests

- [x] Add service tests that expect `answer.graph_actions` and `answer.next_steps`.
- [x] Add API test that expects `answer`, `confidence`, `graph_actions`, and `next_steps`.
- [x] Run:

```bash
cd backend && .venv/bin/python -m pytest tests/test_chat_service.py::test_chat_service_returns_pending_relationship_review_answer tests/test_chat_service.py::test_chat_service_explains_selected_node_upstream_and_downstream tests/test_api.py::test_chat_response_includes_retrieved_evidence -q
```

Observed: failed because `CitedAnswer.graph_actions` and API `answer` did not exist.

### Task 2: Backend Contract Implementation

- [x] Add `GraphAction` to `answer_contract.py`.
- [x] Add default `graph_actions` and `next_steps` fields to `CitedAnswer`.
- [x] Add `GraphActionResponse` to `schemas.py`.
- [x] Serialize fields in `routes.py`.
- [x] Implement action builders in `chat_service.py`.
- [x] Run the same backend focused tests.

Observed: focused backend tests pass.

### Task 3: Frontend Chat Action Tests

- [x] Extend `frontend/src/api/types.ts` in test expectations.
- [x] Add `ChatPanel` test for rendering `graph_actions`.
- [x] Add `Workspace` tests for `highlight_path`, `open_evidence`, `filter_pending_reviews`, and `focus_node`.
- [x] Run:

```bash
cd frontend && npm test -- ChatPanel.test.tsx Workspace.test.tsx --run
```

Observed: failed because action buttons did not exist yet.

### Task 4: Frontend Action Implementation

- [x] Add `GraphAction` types.
- [x] Persist `graph_actions` and `next_steps` in `App`.
- [x] Render compact action buttons in `ChatPanel`.
- [x] Pass `onGraphAction` through `InsightPanel`.
- [x] Implement `handleGraphAction` in `Workspace`.
- [x] Add responsive CSS for action buttons.
- [x] Run the same frontend focused tests.

Observed: focused frontend tests pass.

### Task 5: Full Verification and Documentation Sync

- [x] Update this plan checkboxes.
- [x] Update the design spec progress checklist.
- [x] Run:

```bash
cd backend && pytest
cd frontend && npm test -- --run
cd frontend && npm run lint
cd frontend && npm run build
```

Observed: backend pytest passed, frontend Vitest passed, frontend lint passed, frontend build passed, and backend ruff passed.

- [x] Browser verify `http://127.0.0.1:5173/` at desktop and mobile widths:
  - no horizontal overflow;
  - graph card title is not covered;
  - AI action buttons are visible;
  - action click changes graph evidence or review context.

Observed: browser layout checks at mobile and desktop widths reported no horizontal overflow and the graph title remained visible. In-app browser click automation timed out on top-level module tabs, so the action-click behavior is verified through `ChatPanel.test.tsx`, `Workspace.test.tsx`, and `App.test.tsx`, which exercise the same user-facing buttons and state transitions.

## Implementation Log

- 2026-05-31: Spec and plan created.
- 2026-05-31: Backend contract, backend action generation, frontend action buttons, and Workspace action execution implemented with focused tests passing.
- 2026-05-31: Full backend/frontend tests, lint, build, ruff, and browser layout checks completed.
