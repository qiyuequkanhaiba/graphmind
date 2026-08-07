# AI Provider Chat Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect saved AI chat settings to `/chat` with a tested provider layer and safe rule-answer fallback.

**Architecture:** `ChatService` continues to create the trusted rule-based answer first. A new provider module receives the question, settings, and traceable answer context, calls an OpenAI-compatible chat endpoint when configured, and returns enhanced content or a structured fallback reason. Existing citations and graph path remain authoritative.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, Python stdlib HTTP, pytest, React/Vitest for copy updates.

---

## File Map

- Create `backend/graphmind/services/ai_provider.py`: provider protocol, OpenAI-compatible client, fallback result types.
- Modify `backend/graphmind/services/chat_service.py`: load project settings and call the provider after producing the rule answer.
- Modify `backend/tests/test_chat_service.py`: add provider success/fallback tests.
- Create `backend/tests/test_ai_provider.py`: verify request payload construction without network.
- Modify `frontend/src/i18n/messages.ts`: update configured-mode copy to reflect real backend model attempt and fallback.
- Modify `frontend/tests/ChatPanel.test.tsx`: update configured-mode assertion if needed.

## Task 1: Provider Result And Client

**Files:**
- Create: `backend/graphmind/services/ai_provider.py`
- Test: `backend/tests/test_ai_provider.py`

- [ ] **Step 1: Write failing provider tests**

Add tests for OpenAI-compatible payload construction and missing-config fallback.

- [ ] **Step 2: Run provider tests and verify failure**

Run: `cd backend && uv run pytest tests/test_ai_provider.py -q`

Expected: fails because `graphmind.services.ai_provider` does not exist.

- [ ] **Step 3: Implement provider module**

Add `AIProviderResult`, `OpenAICompatibleChatProvider`, and `build_openai_chat_payload`.

- [ ] **Step 4: Run provider tests**

Run: `cd backend && uv run pytest tests/test_ai_provider.py -q`

Expected: provider tests pass.

## Task 2: ChatService Model Execution

**Files:**
- Modify: `backend/graphmind/services/chat_service.py`
- Test: `backend/tests/test_chat_service.py`

- [ ] **Step 1: Write failing ChatService tests**

Add one test where a fake provider replaces rule content and one where provider failure falls back to rule content.

- [ ] **Step 2: Run ChatService tests and verify failure**

Run: `cd backend && uv run pytest tests/test_chat_service.py -q`

Expected: new tests fail because `ChatService` does not accept or invoke a provider.

- [ ] **Step 3: Refactor ChatService entrypoint**

Keep current rule behavior in a private method and add provider enhancement after the rule answer is built.

- [ ] **Step 4: Run ChatService tests**

Run: `cd backend && uv run pytest tests/test_chat_service.py -q`

Expected: ChatService tests pass.

## Task 3: Frontend Copy Update

**Files:**
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/tests/ChatPanel.test.tsx`

- [ ] **Step 1: Update configured-mode test copy**

Make the configured provider note say the backend will attempt model execution and fall back to graph rules.

- [ ] **Step 2: Run ChatPanel test and verify failure if copy is stale**

Run: `cd frontend && npm test -- ChatPanel.test.tsx`

- [ ] **Step 3: Update i18n strings**

Update Chinese and English `ai.status.configuredNote`.

- [ ] **Step 4: Run ChatPanel tests**

Run: `cd frontend && npm test -- ChatPanel.test.tsx`

Expected: ChatPanel tests pass.

## Task 4: Full Verification

- [ ] Run backend provider and chat tests: `cd backend && uv run pytest tests/test_ai_provider.py tests/test_chat_service.py -q`
- [ ] Run backend API tests: `cd backend && uv run pytest tests/test_api.py -q`
- [ ] Run frontend tests: `cd frontend && npm test`
- [ ] Run frontend lint: `cd frontend && npm run lint`
- [ ] Run frontend build: `cd frontend && npm run build`
- [ ] Browser check: open AI tab, confirm configured-mode note no longer claims model execution is future-only.

## Self-Review

- Spec coverage: provider execution, fallback, traceable citations, and copy update are covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: `AIProviderResult`, provider settings dicts, and `query_plan` fields are named consistently.
