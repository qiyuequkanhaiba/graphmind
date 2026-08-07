# Answer Evidence Explainability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose retrieved graph evidence in chat answers and render it under assistant messages.

**Architecture:** Add a structured `RetrievedEvidence` answer contract, have `ChatService` keep retrieved `EvidenceDocument` objects alongside provider text context, extend the FastAPI chat schema, then render the evidence list in `ChatPanel`.

**Tech Stack:** Python 3.11, FastAPI, Pydantic, React, TypeScript, Vitest, pytest.

---

### Task 1: Backend Answer Contract

**Files:**
- Modify: `backend/graphmind/core/answer_contract.py`
- Modify: `backend/graphmind/services/chat_service.py`
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_chat_service.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: Write failing service test**

Add a test asserting `answer.retrieved_evidence` contains label, kind, source ref, score, and excerpt for a relationship question with graph evidence.

- [ ] **Step 2: Run focused test**

```bash
cd backend && uv run pytest tests/test_chat_service.py::test_chat_service_returns_structured_retrieved_evidence -q
```

Expected: fail because `CitedAnswer` has no `retrieved_evidence`.

- [ ] **Step 3: Write failing API test**

Add a test asserting `/chat` returns `retrieved_evidence`.

- [ ] **Step 4: Run focused API test**

```bash
cd backend && uv run pytest tests/test_api.py::test_chat_response_includes_retrieved_evidence -q
```

Expected: fail because schema/route do not return the field.

- [ ] **Step 5: Implement minimal backend contract**

Add `RetrievedEvidence`, include it in `CitedAnswer`, serialize it through API schemas, and keep existing rule/model behavior.

- [ ] **Step 6: Run backend focused tests**

```bash
cd backend && uv run pytest tests/test_chat_service.py::test_chat_service_returns_structured_retrieved_evidence tests/test_api.py::test_chat_response_includes_retrieved_evidence -q
```

Expected: pass.

### Task 2: Frontend Evidence Rendering

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ChatPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/tests/ChatPanel.test.tsx`
- Test: `frontend/tests/App.test.tsx`

- [ ] **Step 1: Write failing ChatPanel test**

Add a test rendering an assistant message with `retrieved_evidence` and asserting the evidence section appears.

- [ ] **Step 2: Run focused ChatPanel test**

```bash
cd frontend && npm test -- --run ChatPanel.test.tsx
```

Expected: fail because ChatPanel does not render retrieved evidence.

- [ ] **Step 3: Write failing App test**

Update the chat API mock to return `retrieved_evidence` and assert rendered assistant message includes it.

- [ ] **Step 4: Run focused App test**

```bash
cd frontend && npm test -- --run App.test.tsx
```

Expected: fail because App does not copy the field into messages.

- [ ] **Step 5: Implement minimal frontend UI**

Add types, copy answer evidence into messages, render a compact localized list, and add restrained CSS.

- [ ] **Step 6: Run frontend focused tests**

```bash
cd frontend && npm test -- --run ChatPanel.test.tsx App.test.tsx
```

Expected: pass.

### Task 3: Verification

**Files:**
- No new source files expected.

- [ ] **Step 1: Backend verification**

```bash
cd backend && uv run pytest -q
cd backend && uv run ruff check graphmind tests
```

Expected: all tests and lint pass.

- [ ] **Step 2: Frontend verification**

```bash
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

Expected: tests, typecheck, and build pass.

- [ ] **Step 3: Runtime smoke**

Restart backend and verify a chat answer in `http://127.0.0.1:5173/` can show retrieved evidence.
