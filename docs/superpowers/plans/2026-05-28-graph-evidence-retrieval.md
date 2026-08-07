# Graph Evidence Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic graph-evidence retrieval layer and expose a “build index” action that feeds retrieved evidence into AI chat.

**Architecture:** A backend retrieval service builds evidence documents from graph nodes, graph edges, field profiles, and relationship suggestions. Project vector settings track index status and document count. ChatService retrieves top evidence snippets and passes them to the provider prompt; frontend calls a new build endpoint and refreshes settings.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, Python stdlib, pytest, React, TypeScript, Vitest.

---

## File Map

- Create `backend/graphmind/services/evidence_retrieval.py`: evidence document model, document builder, lexical retrieval, settings update.
- Modify `backend/graphmind/services/ai_provider.py`: accept retrieved evidence snippets in prompt payload.
- Modify `backend/graphmind/services/chat_service.py`: retrieve top evidence and pass it to provider.
- Modify `backend/graphmind/api/schemas.py`: add vector metadata fields to settings schema.
- Modify `backend/graphmind/api/routes.py`: add vector-index build endpoint.
- Create `backend/tests/test_evidence_retrieval.py`: service tests.
- Modify `backend/tests/test_ai_provider.py`: provider prompt includes evidence.
- Modify `backend/tests/test_chat_service.py`: ChatService provider receives retrieved evidence.
- Modify `backend/tests/test_api.py`: build endpoint tests.
- Modify `frontend/src/api/types.ts`: add vector metadata fields.
- Modify `frontend/src/api/client.ts`: add `buildVectorIndex`.
- Modify `frontend/src/components/workbench/AIStatusStrip.tsx`: render build button and document count.
- Modify `frontend/src/components/ChatPanel.tsx`: pass build handler.
- Modify `frontend/src/components/workbench/InsightPanel.tsx`, `frontend/src/components/Workspace.tsx`, and `frontend/src/App.tsx`: wire build handler.
- Modify `frontend/src/i18n/messages.ts`: add build index strings.
- Modify `frontend/tests/ChatPanel.test.tsx` and `frontend/tests/App.test.tsx`: frontend behavior tests.

## Task 1: Evidence Retrieval Service

**Files:**
- Create: `backend/graphmind/services/evidence_retrieval.py`
- Test: `backend/tests/test_evidence_retrieval.py`

- [ ] **Step 1: Write failing service tests**

Add tests that create graph nodes, graph edges, field profiles, and relationship suggestions, then assert retrieved evidence ranks relationship hits above unrelated fields.

- [ ] **Step 2: Run service test and verify failure**

Run: `cd backend && uv run pytest tests/test_evidence_retrieval.py -q`

Expected: fails because the module does not exist.

- [ ] **Step 3: Implement service**

Add `EvidenceDocument`, `EvidenceRetrievalService.build_documents`, `search`, and `build_index_metadata`.

- [ ] **Step 4: Run service tests**

Run: `cd backend && uv run pytest tests/test_evidence_retrieval.py -q`

Expected: service tests pass.

## Task 2: Provider Prompt Evidence

**Files:**
- Modify: `backend/graphmind/services/ai_provider.py`
- Test: `backend/tests/test_ai_provider.py`

- [ ] **Step 1: Write failing provider prompt test**

Assert `build_openai_chat_payload` includes retrieved evidence text when provided.

- [ ] **Step 2: Run provider tests and verify failure**

Run: `cd backend && uv run pytest tests/test_ai_provider.py -q`

- [ ] **Step 3: Update provider payload**

Add optional `retrieved_evidence` argument and include evidence in the user prompt.

- [ ] **Step 4: Run provider tests**

Run: `cd backend && uv run pytest tests/test_ai_provider.py -q`

Expected: provider tests pass.

## Task 3: API Build Endpoint

**Files:**
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: Write failing API tests**

Add tests for `POST /api/projects/{project_id}/vector-index/build`, missing project 404, and settings response metadata.

- [ ] **Step 2: Run API tests and verify failure**

Run: `cd backend && uv run pytest tests/test_api.py -q`

- [ ] **Step 3: Implement schema and route**

Add `document_count` and `last_built_at` to vector settings, call retrieval service, update project settings, and return settings response.

- [ ] **Step 4: Run API tests**

Run: `cd backend && uv run pytest tests/test_api.py -q`

Expected: API tests pass.

## Task 4: ChatService Retrieval Context

**Files:**
- Modify: `backend/graphmind/services/chat_service.py`
- Test: `backend/tests/test_chat_service.py`

- [ ] **Step 1: Write failing ChatService test**

Assert fake provider receives retrieved evidence snippets for a relationship question.

- [ ] **Step 2: Run ChatService tests and verify failure**

Run: `cd backend && uv run pytest tests/test_chat_service.py -q`

- [ ] **Step 3: Wire retrieval into ChatService**

Retrieve top evidence before provider generation and add `retrieval_document_count` to `query_plan`.

- [ ] **Step 4: Run ChatService tests**

Run: `cd backend && uv run pytest tests/test_chat_service.py -q`

Expected: ChatService tests pass.

## Task 5: Frontend Build Index UX

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/components/workbench/InsightPanel.tsx`
- Modify: `frontend/src/components/ChatPanel.tsx`
- Modify: `frontend/src/components/workbench/AIStatusStrip.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Test: `frontend/tests/ChatPanel.test.tsx`
- Test: `frontend/tests/App.test.tsx`

- [ ] **Step 1: Write failing frontend tests**

Assert the AI panel shows a build-index button and App calls `/api/projects/42/vector-index/build`.

- [ ] **Step 2: Run frontend tests and verify failure**

Run: `cd frontend && npm test -- ChatPanel.test.tsx App.test.tsx`

- [ ] **Step 3: Implement client and wiring**

Add `buildVectorIndex`, pass `onBuildVectorIndex` through the component tree, and update settings from the response.

- [ ] **Step 4: Update status strip UI**

Render build button, index status, and document count.

- [ ] **Step 5: Run frontend tests**

Run: `cd frontend && npm test -- ChatPanel.test.tsx App.test.tsx`

Expected: targeted frontend tests pass.

## Task 6: Full Verification

- [ ] Run backend tests: `cd backend && uv run pytest -q`
- [ ] Run backend lint: `cd backend && uv run ruff check graphmind tests`
- [ ] Run frontend tests: `cd frontend && npm test`
- [ ] Run frontend lint: `cd frontend && npm run lint`
- [ ] Run frontend build: `cd frontend && npm run build`
- [ ] Restart backend and browser-check AI tab: build index, verify status changes to ready and document count appears.

## Self-Review

- Spec coverage: evidence build, retrieval, provider context, API route, frontend action, and verification are covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: vector metadata fields use `document_count` and `last_built_at` consistently across backend and frontend.
