# AI And Vector Workbench Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add viewport-bounded workbench scrolling plus AI/vector configuration and readiness status modeled after GitNexus workbench patterns.

**Architecture:** Backend project settings are stored in `Project.settings` with defaults merged at the API boundary. Frontend loads project settings during bootstrap, passes them into the workbench, and renders a focused AI settings modal and status strip without pretending full LLM or vector RAG execution exists yet.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React, TypeScript, Vitest, Testing Library, CSS.

---

## File Map

- Modify `backend/graphmind/api/schemas.py`: add project AI/vector settings schemas.
- Modify `backend/graphmind/api/routes.py`: add `GET` and `PUT` project settings routes.
- Modify `backend/tests/test_api.py`: add settings API coverage.
- Modify `frontend/src/api/types.ts`: add `ProjectSettings` and nested settings types.
- Modify `frontend/src/api/client.ts`: add settings client functions.
- Modify `frontend/src/App.tsx`: load, save, and pass project settings.
- Modify `frontend/src/components/Workspace.tsx`: pass settings into the right panel.
- Modify `frontend/src/components/workbench/InsightPanel.tsx`: pass settings into chat.
- Modify `frontend/src/components/ChatPanel.tsx`: render status strip and settings modal.
- Create `frontend/src/components/workbench/AIStatusStrip.tsx`: display chat/vector status.
- Create `frontend/src/components/workbench/AISettingsPanel.tsx`: edit AI/vector settings.
- Modify `frontend/src/components/workbench/DataExplorerPanel.tsx`: add stable scroll region wrapper semantics if needed.
- Modify `frontend/src/styles/app.css`: bound workbench layout and style settings/status UI.
- Modify `frontend/src/i18n/messages.ts`: add Chinese and English strings.
- Modify `frontend/tests/graphStyles.test.js`: assert bounded workbench CSS.
- Modify `frontend/tests/DataExplorerPanel.test.tsx`: assert resource tree region.
- Modify `frontend/tests/ChatPanel.test.tsx`: assert status and settings modal behavior.
- Modify `frontend/tests/App.test.tsx`: assert settings load/save wiring.

## Task 1: Backend Settings API

**Files:**
- Modify: `backend/graphmind/api/schemas.py`
- Modify: `backend/graphmind/api/routes.py`
- Test: `backend/tests/test_api.py`

- [ ] **Step 1: Write failing API tests**

Add tests that call `GET /api/projects/{project_id}/settings`, `PUT /api/projects/{project_id}/settings`, and missing-project settings routes.

- [ ] **Step 2: Run backend API tests and verify failure**

Run: `cd backend && uv run pytest tests/test_api.py -q`

Expected: settings route tests fail with `404 Not Found`.

- [ ] **Step 3: Add Pydantic schemas**

Add `AIChatSettings`, `AIVectorSettings`, `AISettings`, and `ProjectSettingsResponse` with explicit defaults.

- [ ] **Step 4: Add routes**

Add `GET` and `PUT` routes that merge saved `Project.settings` with default `ai` settings and persist updated settings.

- [ ] **Step 5: Run backend API tests**

Run: `cd backend && uv run pytest tests/test_api.py -q`

Expected: all tests in `test_api.py` pass.

## Task 2: Frontend API And State Wiring

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/tests/App.test.tsx`

- [ ] **Step 1: Write failing App wiring test**

Add a test that expects startup to fetch `/api/projects/42/settings`, and saving settings to call `PUT /api/projects/42/settings`.

- [ ] **Step 2: Run App test and verify failure**

Run: `cd frontend && npm test -- App.test.tsx`

Expected: test fails because settings are not fetched or saved.

- [ ] **Step 3: Add frontend settings types and client functions**

Define `ProjectSettings` and implement `getProjectSettings` / `updateProjectSettings`.

- [ ] **Step 4: Wire settings into App state**

Load settings during bootstrap and pass `settings` plus `onSettingsChange` to `Workspace`.

- [ ] **Step 5: Run App test**

Run: `cd frontend && npm test -- App.test.tsx`

Expected: App tests pass.

## Task 3: AI Status And Settings UI

**Files:**
- Create: `frontend/src/components/workbench/AIStatusStrip.tsx`
- Create: `frontend/src/components/workbench/AISettingsPanel.tsx`
- Modify: `frontend/src/components/ChatPanel.tsx`
- Modify: `frontend/src/components/workbench/InsightPanel.tsx`
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/tests/ChatPanel.test.tsx`

- [ ] **Step 1: Write failing ChatPanel tests**

Add tests for default rule mode status, vector index status, opening settings, editing model fields, and saving settings.

- [ ] **Step 2: Run ChatPanel test and verify failure**

Run: `cd frontend && npm test -- ChatPanel.test.tsx`

Expected: tests fail because status strip and settings modal do not exist.

- [ ] **Step 3: Implement status strip**

Create a compact component showing chat provider, chat model, vector provider, vector model, and index status.

- [ ] **Step 4: Implement settings modal**

Create a modal with provider selects and form fields. Use controlled inputs and call `onSave(nextSettings)`.

- [ ] **Step 5: Wire components into ChatPanel**

Pass settings through `Workspace` and `InsightPanel`, render status strip, and open the modal from a settings button.

- [ ] **Step 6: Run ChatPanel tests**

Run: `cd frontend && npm test -- ChatPanel.test.tsx`

Expected: ChatPanel tests pass.

## Task 4: Workbench Scroll Layout

**Files:**
- Modify: `frontend/src/styles/app.css`
- Modify: `frontend/src/components/workbench/DataExplorerPanel.tsx`
- Test: `frontend/tests/graphStyles.test.js`
- Test: `frontend/tests/DataExplorerPanel.test.tsx`

- [ ] **Step 1: Write failing layout tests**

Assert CSS contains `height: 100vh`, `overflow: hidden` on the shell/main, and `overflow-y: auto` on `.resource-tree`.

- [ ] **Step 2: Run layout tests and verify failure**

Run: `cd frontend && npm test -- graphStyles.test.js DataExplorerPanel.test.tsx`

Expected: CSS assertions fail.

- [ ] **Step 3: Implement bounded layout CSS**

Update app shell, workbench shell, workbench main, data explorer, resource tree, and insight panel layout rules.

- [ ] **Step 4: Run layout tests**

Run: `cd frontend && npm test -- graphStyles.test.js DataExplorerPanel.test.tsx`

Expected: layout tests pass.

## Task 5: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run frontend tests**

Run: `cd frontend && npm test`

Expected: all frontend tests pass.

- [ ] **Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`

Expected: TypeScript check exits with 0.

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`

Expected: Vite build exits with 0.

- [ ] **Step 4: Run backend tests**

Run: `cd backend && uv run pytest -q`

Expected: all backend tests pass.

- [ ] **Step 5: Browser verification**

Use the in-app browser at `http://127.0.0.1:5173/` to verify body height is bounded, `.resource-tree` scrolls independently, and the AI settings modal opens and saves.

## Self-Review

- Spec coverage: layout, AI settings, vector settings, persistence, status UI, and GitNexus gap closure are covered.
- Placeholder scan: no implementation step depends on undefined future behavior; real LLM/RAG is explicitly out of scope.
- Type consistency: settings types use `ProjectSettings` throughout frontend and project settings schemas throughout backend.
