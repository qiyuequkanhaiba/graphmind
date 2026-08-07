# Source Explorer UI Phase 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the source/entity inspection APIs to the frontend so imported documents, code repositories, logs, chunks, entities, and extracted relationships are visible from the data explorer.

**Architecture:** Keep the graph canvas focused on merged graph nodes and add a compact source explorer inside the existing left data panel. App/bootstrap and import refreshes load source details, chunks, entities, and extracted relationships with defensive fallbacks, then DataExplorerPanel filters inspection rows by the selected source.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing FastAPI inspection endpoints.

---

## File Structure

- Modify: `frontend/src/api/types.ts`
  - Add `SourceDetail`, `DocumentChunk`, `ExtractedEntity`, and `ExtractedRelationship`.
- Modify: `frontend/src/api/client.ts`
  - Add `getSourceDetails`, `getSourceChunks`, `getExtractedEntities`, and `getExtractedRelationships`.
- Modify: `frontend/src/state/workspaceStore.ts`
  - Load source inspection state at bootstrap with `catch(() => [])` fallbacks.
- Modify: `frontend/src/App.tsx`
  - Store source inspection state, refresh it after file, sample, batch, and reset flows, and pass it to `Workspace`.
- Modify: `frontend/src/components/Workspace.tsx`
  - Accept and forward source inspection props to `DataExplorerPanel`.
- Modify: `frontend/src/components/workbench/DataExplorerPanel.tsx`
  - Add source sections, source selection, chunk/entity/relationship summary panel.
- Modify: `frontend/src/i18n/messages.ts`
  - Add compact Chinese and English labels for source explorer UI.
- Modify: `frontend/src/styles/app.css`
  - Add dense source inspector styles aligned with the existing workbench.
- Modify: `frontend/tests/apiClientImportBatch.test.ts`
  - Cover new API client endpoints.
- Modify: `frontend/tests/DataExplorerPanel.test.tsx`
  - Cover source rows and selection details.
- Modify: `frontend/tests/Workspace.test.tsx`
  - Cover Workspace prop forwarding.
- Modify: `frontend/tests/App.test.tsx`
  - Cover bootstrap loading and post-batch refresh.

## Task 1: API Client and Types

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/tests/apiClientImportBatch.test.ts`

- [ ] **Step 1: Write failing API client test**

```typescript
it("loads source inspection endpoints", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 1, title: "README.md" }] })
    .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 2, content: "GraphMind" }] })
    .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 3, canonical_name: "GraphMind" }] })
    .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 4, source_name: "GraphMind" }] });
  vi.stubGlobal("fetch", fetchMock);

  await expect(getSourceDetails(3)).resolves.toEqual([{ id: 1, title: "README.md" }]);
  await expect(getSourceChunks(3, 1)).resolves.toEqual([{ id: 2, content: "GraphMind" }]);
  await expect(getExtractedEntities(3)).resolves.toEqual([{ id: 3, canonical_name: "GraphMind" }]);
  await expect(getExtractedRelationships(3)).resolves.toEqual([{ id: 4, source_name: "GraphMind" }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- apiClientImportBatch.test.ts --run`

Expected: FAIL because the exported functions do not exist.

- [ ] **Step 3: Implement types and client functions**

Add response types matching Phase 5 backend schemas and functions for:

- `/api/projects/{projectId}/sources/detail`
- `/api/projects/{projectId}/sources/{sourceId}/chunks`
- `/api/projects/{projectId}/entities`
- `/api/projects/{projectId}/extracted-relationships`

- [ ] **Step 4: Run API client test**

Run: `cd frontend && npm test -- apiClientImportBatch.test.ts --run`

Expected: PASS.

## Task 2: Workspace State Loading and Refresh

**Files:**
- Modify: `frontend/src/state/workspaceStore.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/tests/App.test.tsx`

- [ ] **Step 1: Write failing bootstrap and refresh tests**

```typescript
it("loads source inspection data on startup", async () => {
  // Mock /sources/detail, /sources/1/chunks, /entities, /extracted-relationships.
  render(<App />);
  expect(await screen.findByRole("button", { name: "选择来源 README.md" })).toBeInTheDocument();
  expect(screen.getByText("GraphMind")).toBeInTheDocument();
});

it("refreshes source inspection data after batch import", async () => {
  // Return no sources before import, then README.md source and entity after import.
  render(<App />);
  fireEvent.change(await screen.findByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志"), {
    target: { files: [new File(["# GraphMind"], "README.md", { type: "text/markdown" })] }
  });
  expect(await screen.findByRole("button", { name: "选择来源 README.md" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- App.test.tsx --run`

Expected: FAIL because state does not load or refresh source inspection data.

- [ ] **Step 3: Implement workspace source inspection state**

Add `sourceDetails`, `sourceChunksBySourceId`, `extractedEntities`, and `extractedRelationships` to `WorkspaceState`. Add `loadSourceInspection(projectId)` that loads details, chunks for each detail, entities, and relationships with per-call fallbacks. Refresh it after imports and reset it to empty after project reset.

- [ ] **Step 4: Run App tests**

Run: `cd frontend && npm test -- App.test.tsx --run`

Expected: PASS.

## Task 3: Data Explorer Source Inspector UI

**Files:**
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/src/components/workbench/DataExplorerPanel.tsx`
- Modify: `frontend/src/i18n/messages.ts`
- Modify: `frontend/src/styles/app.css`
- Test: `frontend/tests/DataExplorerPanel.test.tsx`
- Test: `frontend/tests/Workspace.test.tsx`

- [ ] **Step 1: Write failing panel tests**

```typescript
it("renders source documents and selected source inspection details", () => {
  render(<DataExplorerPanel sourceDetails={[readmeSource]} sourceChunksBySourceId={{ 1: [chunk] }} extractedEntities={[entity]} extractedRelationships={[relationship]} ... />);

  fireEvent.click(screen.getByRole("button", { name: "选择来源 README.md" }));

  expect(screen.getByRole("heading", { name: "来源" })).toBeInTheDocument();
  expect(screen.getByText("1 个片段 · 1 个实体 · 1 条关系")).toBeInTheDocument();
  expect(screen.getByText("GraphMind imports")).toBeInTheDocument();
  expect(screen.getByText("GraphMind")).toBeInTheDocument();
  expect(screen.getByText("README.md -> GraphMind")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run panel tests to verify they fail**

Run: `cd frontend && npm test -- DataExplorerPanel.test.tsx Workspace.test.tsx --run`

Expected: FAIL because the panel props and UI do not exist.

- [ ] **Step 3: Implement source explorer UI**

Add a `Sources` tree section grouped with source rows. Selecting a source sets local panel selection and renders a compact inspector with:

- source kind/type and source ref
- chunk, entity, relationship counts
- up to 3 chunks
- up to 6 entities whose `source_refs` match source ref
- up to 6 relationships whose `source_refs` match source ref

- [ ] **Step 4: Run panel tests**

Run: `cd frontend && npm test -- DataExplorerPanel.test.tsx Workspace.test.tsx --run`

Expected: PASS.

## Task 4: Verification

**Files:**
- All modified frontend files.
- Existing backend files for smoke verification.

- [ ] **Step 1: Run focused frontend tests**

Run: `cd frontend && npm test -- apiClientImportBatch.test.ts App.test.tsx DataExplorerPanel.test.tsx Workspace.test.tsx --run`

Expected: PASS.

- [ ] **Step 2: Run established frontend smoke tests**

Run: `cd frontend && npm test -- App.test.tsx ImportPanel.test.tsx Workspace.test.tsx --run`

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`

Expected: PASS.

- [ ] **Step 4: Run backend regression smoke**

Run: `cd backend && .venv/bin/pytest tests/test_source_entity_inspection_api_phase_5.py tests/test_cross_source_entity_resolution_phase_4.py tests/test_code_repository_import_phase_3.py tests/test_document_import_phase_2.py tests/test_universal_import_phase_1.py tests/test_api.py tests/test_evidence_retrieval.py -q`

Expected: PASS.

- [ ] **Step 5: Run backend lint**

Run: `cd backend && .venv/bin/ruff check graphmind tests`

Expected: PASS.

## Self-Review

- Spec coverage: Connects the Phase 5 inspection endpoints to the frontend source explorer and keeps graph canvas unchanged.
- Placeholder scan: No placeholder-only tasks remain.
- Type consistency: Frontend type names match backend response model names and API endpoint paths.
