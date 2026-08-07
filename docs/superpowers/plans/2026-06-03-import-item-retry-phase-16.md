# Import Item Retry Phase 16 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users retry one failed file inside a partial multisource import batch from the archived raw file and refresh the graph/task UI with the updated batch state.

**Architecture:** Add a synchronous backend item retry endpoint that reuses the archived `ImportItem.raw_data_ref`, reruns the whole failed item through the existing import stages, clears stale failed stage state on success, and recomputes the parent batch summary/status from all items. Add a frontend client method and stage-level retry affordance for failed batch items, then refresh graph, suggestions, source summaries, source inspection, and the import task row from the returned batch.

**Tech Stack:** FastAPI, SQLAlchemy repositories, pandas/DuckDB import pipeline, React, TypeScript, Vitest, Testing Library.

---

### File Structure

- Modify `backend/graphmind/storage/repositories.py`
  - Add item lookup by project/item id.
  - Add a small helper to reset an item before retry and remove stale failed stage entries from summary.
- Modify `backend/graphmind/services/import_service.py`
  - Extract item processing helpers from `import_structured_batch`.
  - Add `retry_import_item(project_id, item_id) -> StructuredBatchImportResult`.
  - Recompute batch graph metadata and summary after retry.
- Modify `backend/graphmind/api/routes.py`
  - Add `POST /api/projects/{project_id}/import-items/{item_id}/retry`.
- Modify `backend/tests/test_universal_import_phase_1.py`
  - Add service and API tests for failed item retry.
- Modify `frontend/src/api/types.ts`
  - Add optional retry metadata on `ImportStage`.
- Modify `frontend/src/api/client.ts`
  - Add `retryImportItem(projectId, itemId)`.
- Modify `frontend/src/components/ImportPanel.tsx`
  - Render a retry button on failed batch item stages.
- Modify `frontend/src/App.tsx`
  - Wire retry handler, set stage running state, refresh graph/suggestions/source data, and update the batch task.
- Modify `frontend/tests/apiClientImportBatch.test.ts`
  - Add client route test.
- Modify `frontend/tests/ImportPanel.test.tsx`
  - Add failed batch item retry button test.
- Modify `frontend/tests/App.test.tsx`
  - Add end-to-end UI wiring test for retrying a failed batch item.

---

### Task 1: Backend Service Retry

**Files:**
- Modify: `backend/tests/test_universal_import_phase_1.py`
- Modify: `backend/graphmind/storage/repositories.py`
- Modify: `backend/graphmind/services/import_service.py`

- [ ] **Step 1: Write the failing service test**

Add this test after `test_import_service_keeps_successful_items_when_batch_item_fails`:

```python
def test_import_service_retries_failed_batch_item_from_archived_raw_file(
    tmp_workspace: Path, tmp_path: Path
):
    customers = tmp_path / "customers.csv"
    broken = tmp_path / "broken.json"
    customers.write_text("id,name\nc1,Acme\n", encoding="utf-8")
    broken.write_text("{not valid json", encoding="utf-8")
    paths, session_factory, project_id = _project_id(tmp_workspace)
    service = ImportService(paths, session_factory)

    service.import_structured_batch(
        project_id=project_id,
        files=[customers, broken],
        label="Retry batch",
    )

    with session_factory() as session:
        failed_item = session.query(ImportItem).filter_by(filename="broken.json").one()
        raw_path = tmp_workspace / failed_item.raw_data_ref
        raw_path.write_text(
            '[{"order_id":"o1","customer_id":"c1","amount":120}]',
            encoding="utf-8",
        )
        failed_item_id = failed_item.id

    result = service.retry_import_item(project_id=project_id, item_id=failed_item_id)

    assert result.dataset_count == 2
    with session_factory() as session:
        batch = session.query(ImportBatch).filter_by(project_id=project_id).one()
        retried_item = session.get(ImportItem, failed_item_id)
        items = (
            session.query(ImportItem)
            .filter(ImportItem.project_id == project_id)
            .order_by(ImportItem.filename)
            .all()
        )

        assert batch.status == "succeeded"
        assert batch.error_message is None
        assert batch.summary is not None
        assert batch.summary["succeeded_item_count"] == 2
        assert batch.summary["failed_item_count"] == 0
        assert [(item.filename, item.status) for item in items] == [
            ("broken.json", "succeeded"),
            ("customers.csv", "succeeded"),
        ]
        assert retried_item is not None
        assert retried_item.error_message is None
        assert retried_item.summary is not None
        assert retried_item.summary["dataset_id"] > 0
        assert [stage["name"] for stage in retried_item.summary["stages"]] == [
            "staged",
            "parsed",
            "profiled",
            "resolved",
            "graphed",
            "indexed",
        ]
        assert "failed" not in {
            stage["name"] for stage in retried_item.summary["stages"]
        }
```

- [ ] **Step 2: Run service test to verify RED**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_service_retries_failed_batch_item_from_archived_raw_file -q
```

Expected: fail with `AttributeError: 'ImportService' object has no attribute 'retry_import_item'`.

- [ ] **Step 3: Add repository helpers**

In `backend/graphmind/storage/repositories.py`, add methods to `ImportBatchRepository`:

```python
    def get_item(self, project_id: int, item_id: int) -> ImportItem | None:
        return (
            self.session.query(ImportItem)
            .filter(ImportItem.project_id == project_id, ImportItem.id == item_id)
            .first()
        )

    def reset_item_for_retry(self, item: ImportItem) -> None:
        item.status = "staged"
        item.error_message = None
        item.summary = _stage_summary(
            stage="staged",
            stage_summary="File staged for retry.",
            summary=_without_failed_stage(item.summary),
        )
        self.session.flush()
```

Add helper near `_stage_summary`:

```python
def _without_failed_stage(summary: dict[str, object] | None) -> dict[str, object]:
    next_summary = {
        key: value
        for key, value in (summary or {}).items()
        if key not in {"failed_stage"}
    }
    stages = next_summary.get("stages")
    if isinstance(stages, list):
        next_summary["stages"] = [
            stage
            for stage in stages
            if isinstance(stage, dict) and stage.get("name") != "failed"
        ]
    return next_summary
```

- [ ] **Step 4: Extract item processing and add retry service**

In `backend/graphmind/services/import_service.py`, add a private `_process_import_item(...)` that handles one item and returns item-level profiles/dataframes/dataset ids/document ids. Use it from both `import_structured_batch` and `retry_import_item`.

The retry method should:

```python
    def retry_import_item(self, project_id: int, item_id: int) -> StructuredBatchImportResult:
        self.paths.ensure()
        with self.session_factory() as session:
            batch_repository = ImportBatchRepository(session)
            import_repository = ImportRepository(session)
            document_repository = DocumentRepository(session)
            item = batch_repository.get_item(project_id, item_id)
            if item is None:
                raise ValueError(f"Import item {item_id} not found")
            if item.status != "failed":
                raise ValueError("Only failed import items can be retried")
            batch = batch_repository.get_batch(project_id, item.batch_id)
            if batch is None:
                raise ValueError(f"Import batch {item.batch_id} not found")
            if not item.raw_data_ref:
                raise ValueError("Import item archived raw file not found")
            source_path = self.paths.root / item.raw_data_ref
            if not source_path.exists():
                raise ValueError("Import item archived raw file not found")

            batch_repository.update_batch_progress(
                batch,
                "running",
                90,
                {**(batch.summary or {}), "stage": "retrying", "retry_item_id": item.id},
            )
            batch_repository.reset_item_for_retry(item)
            session.commit()

            try:
                self._process_import_item(
                    project_id=project_id,
                    source_path=source_path,
                    import_name=item.filename,
                    item=item,
                    batch_repository=batch_repository,
                    import_repository=import_repository,
                    document_repository=document_repository,
                )
                session.flush()
            except Exception as exc:
                batch_repository.update_item_stage(
                    item,
                    "failed",
                    status="failed",
                    stage_summary=str(exc),
                    summary={"failed_stage": (item.summary or {}).get("stage", "staged")},
                    error_message=str(exc),
                )

            return self._finalize_batch_graph_and_summary(
                project_id=project_id,
                batch=batch,
                batch_repository=batch_repository,
                import_repository=import_repository,
                session=session,
            )
```

The finalizer should rebuild suggestions and graph from all current project profiles, update non-failed batch items through `resolved`, `graphed`, and `indexed`, and recompute:

```python
{
    "dataset_count": ...,
    "document_count": ...,
    "sheet_count": ...,
    "field_count": ...,
    "suggestion_count": ...,
    "graph_node_count": ...,
    "graph_edge_count": ...,
    "resolved_relationship_count": ...,
    "item_ids": ...,
    "succeeded_item_count": ...,
    "failed_item_count": ...,
    "stage": "partial" or "graphed",
}
```

- [ ] **Step 5: Run service test to verify GREEN**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_service_retries_failed_batch_item_from_archived_raw_file -q
```

Expected: pass.

---

### Task 2: Backend Retry API

**Files:**
- Modify: `backend/tests/test_universal_import_phase_1.py`
- Modify: `backend/graphmind/api/routes.py`

- [ ] **Step 1: Write the failing API test**

Add this test after `test_import_batch_endpoint_returns_partial_when_one_file_fails`:

```python
def test_import_item_retry_endpoint_returns_updated_batch(tmp_workspace: Path, tmp_path: Path):
    app = create_app(workspace_root=tmp_workspace)
    client = TestClient(app)
    project_id = client.post("/api/projects", json={"name": "Retry Item API"}).json()["id"]
    customers = tmp_path / "customers.csv"
    broken = tmp_path / "broken.json"
    customers.write_text("id,name\nc1,Acme\n", encoding="utf-8")
    broken.write_text("{not valid json", encoding="utf-8")

    with customers.open("rb") as first_upload, broken.open("rb") as second_upload:
        response = client.post(
            f"/api/projects/{project_id}/import-batches",
            data={"label": "Retry Customer batch"},
            files=[
                ("files", ("customers.csv", first_upload, "text/csv")),
                ("files", ("broken.json", second_upload, "application/json")),
            ],
        )

    assert response.status_code == 200
    partial_body = response.json()
    failed_item = next(item for item in partial_body["items"] if item["status"] == "failed")
    (tmp_workspace / failed_item["raw_data_ref"]).write_text(
        '[{"order_id":"o1","customer_id":"c1"}]',
        encoding="utf-8",
    )

    retry_response = client.post(
        f"/api/projects/{project_id}/import-items/{failed_item['id']}/retry"
    )

    assert retry_response.status_code == 200
    body = retry_response.json()
    assert body["status"] == "succeeded"
    assert body["summary"]["succeeded_item_count"] == 2
    assert body["summary"]["failed_item_count"] == 0
    retried_item = next(item for item in body["items"] if item["id"] == failed_item["id"])
    assert retried_item["status"] == "succeeded"
    assert retried_item["error"] is None
    assert "failed" not in {
        stage["name"] for stage in retried_item["summary"]["stages"]
    }
```

- [ ] **Step 2: Run API test to verify RED**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_item_retry_endpoint_returns_updated_batch -q
```

Expected: fail with HTTP 404 because the route does not exist.

- [ ] **Step 3: Add retry route**

In `backend/graphmind/api/routes.py`, near import batch routes add:

```python
    @router.post(
        "/projects/{project_id}/import-items/{item_id}/retry",
        response_model=ImportBatchResponse,
    )
    def retry_import_item(
        project_id: int,
        item_id: int,
        session: SessionDependency,
    ) -> ImportBatchResponse:
        if session.get(Project, project_id) is None:
            raise HTTPException(status_code=404, detail="Project not found")
        try:
            result = ImportService(
                paths=WorkspacePaths(workspace_root),
                session_factory=session_factory,
            ).retry_import_item(project_id=project_id, item_id=item_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        repository = ImportBatchRepository(session)
        batch = repository.get_batch(project_id, result.batch_id)
        if batch is None:
            raise HTTPException(status_code=404, detail="Import batch not found")
        return _import_batch_response(batch, repository.list_items(project_id, batch.id))
```

- [ ] **Step 4: Run API test to verify GREEN**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py::test_import_item_retry_endpoint_returns_updated_batch -q
```

Expected: pass.

---

### Task 3: Frontend Client And ImportPanel Retry Button

**Files:**
- Modify: `frontend/tests/apiClientImportBatch.test.ts`
- Modify: `frontend/tests/ImportPanel.test.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/ImportPanel.tsx`

- [ ] **Step 1: Write the failing API client test**

In `frontend/tests/apiClientImportBatch.test.ts`, import `retryImportItem` and add:

```typescript
  it("posts failed import item retry requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 4,
        project_id: 2,
        label: "Batch",
        status: "succeeded",
        progress: 100,
        summary: { succeeded_item_count: 2, failed_item_count: 0 },
        error: null,
        items: [],
        created_at: "2026-06-03T00:00:00+00:00",
        updated_at: "2026-06-03T00:00:00+00:00"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await retryImportItem(2, 19);

    expect(result.status).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/2/import-items/19/retry",
      expect.objectContaining({ method: "POST" })
    );
  });
```

- [ ] **Step 2: Write the failing ImportPanel test**

In `frontend/tests/ImportPanel.test.tsx`, extend the partial batch task stage with `itemId: 19` and `retryable: true`, pass `onRetryImportItem`, click `重试文件 broken.json`, and assert:

```typescript
    expect(onRetryImportItem).toHaveBeenCalledWith("task-partial", 19);
```

- [ ] **Step 3: Run frontend tests to verify RED**

Run:

```bash
cd frontend && npm test -- ImportPanel.test.tsx apiClientImportBatch.test.ts --run
```

Expected: fail because `retryImportItem`, `ImportStage.itemId`, `ImportStage.retryable`, and `onRetryImportItem` do not exist.

- [ ] **Step 4: Implement client and panel wiring**

In `frontend/src/api/types.ts`, extend `ImportStage`:

```typescript
  itemId?: number;
  retryable?: boolean;
```

In `frontend/src/api/client.ts`, add:

```typescript
export async function retryImportItem(projectId: number, itemId: number): Promise<ImportBatch> {
  const response = await fetch(`${API_BASE}/projects/${projectId}/import-items/${itemId}/retry`, {
    method: "POST"
  });
  if (!response.ok) {
    throw new Error(`Retry import item failed: ${response.status}`);
  }
  return response.json();
}
```

In `frontend/src/components/ImportPanel.tsx`, add prop:

```typescript
  onRetryImportItem?: (taskId: string, itemId: number) => void;
```

Render a button in failed stage rows when `stage.retryable && stage.itemId !== undefined`:

```tsx
                          {stage.retryable && stage.itemId !== undefined ? (
                            <button
                              aria-label={t("import.tasks.retryItem", {
                                label: stage.source ?? task.label
                              })}
                              className="import-task-stage-retry"
                              onClick={() => onRetryImportItem(task.id, stage.itemId as number)}
                              type="button"
                            >
                              <RotateCcw aria-hidden="true" size={13} />
                              <span>{t("import.tasks.retry")}</span>
                            </button>
                          ) : null}
```

Add i18n message keys for Chinese and English if needed:

```typescript
"import.tasks.retryItem": "重试文件 {label}"
"import.tasks.retryItem": "Retry file {label}"
```

- [ ] **Step 5: Run frontend tests to verify GREEN**

Run:

```bash
cd frontend && npm test -- ImportPanel.test.tsx apiClientImportBatch.test.ts --run
```

Expected: pass.

---

### Task 4: App Retry Wiring

**Files:**
- Modify: `frontend/tests/App.test.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write the failing App test**

Add a test that:

- Starts with an empty graph.
- Uploads a two-file batch that returns `partial` and one failed item with id `19`.
- Opens the data panel and clicks `重试文件 broken.json`.
- The retry endpoint returns the same batch id with status `succeeded`.
- The graph/suggestions/source endpoints are fetched again.
- The import task row updates to `完成` and no longer shows `broken.json · 失败`.

Use the endpoint expectation:

```typescript
expect(fetchMock).toHaveBeenCalledWith(
  "/api/projects/42/import-items/19/retry",
  expect.objectContaining({ method: "POST" })
);
```

- [ ] **Step 2: Run App test to verify RED**

Run:

```bash
cd frontend && npm test -- App.test.tsx --run
```

Expected: fail because App does not import or call `retryImportItem`, and batch stage metadata lacks item retry fields.

- [ ] **Step 3: Implement App retry**

In `frontend/src/App.tsx`:

- Import `retryImportItem`.
- Pass `onRetryImportItem={handleRetryImportItem}` to `Workspace` only if `Workspace` forwards it to `ImportPanel`; otherwise update `Workspace` props accordingly.
- Add:

```typescript
  async function handleRetryImportItem(taskId: string, itemId: number) {
    if (state.projectId === null) {
      return;
    }
    setState((current) => ({
      ...current,
      importTasks: updateImportTask(current.importTasks, taskId, {
        status: "running",
        progress: 90,
        error: null,
        stages: current.importTasks
          .find((task) => task.id === taskId)
          ?.stages?.map((stage) =>
            stage.itemId === itemId
              ? { ...stage, status: "running", progress: 90, summary: t("import.tasks.summary.running") }
              : stage
          )
      }),
      importStatus: t("import.tasks.summary.running"),
      error: null
    }));

    try {
      const batch = await retryImportItem(state.projectId, itemId);
      const [graph, suggestions, sourceSummaries, sourceInspection] = await Promise.all([
        getGraph(state.projectId),
        getRelationshipSuggestions(state.projectId),
        loadSourceSummaries(state.projectId),
        loadSourceInspection(state.projectId)
      ]);
      setState((current) => ({
        ...current,
        graph,
        suggestions,
        sourceSummaries,
        ...sourceInspection,
        highlightedGraphPath: [],
        importTasks: updateImportTask(current.importTasks, taskId, {
          id: `batch-${batch.id}`,
          status: normalizeImportTaskStatus(batch.status),
          progress: Math.max(0, Math.min(100, batch.progress)),
          summary: buildBatchImportTaskSummary(batch, t),
          error: batch.error,
          retryable: false,
          stages: buildBatchImportTaskStages(batch)
        }),
        importStatus: buildBatchImportStatus(batch, t),
        error: null
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("app.importFailed");
      setState((current) => ({
        ...current,
        importTasks: updateImportTask(current.importTasks, taskId, {
          status: "partial",
          error: message
        }),
        importStatus: t("app.importFailed"),
        error: message
      }));
    }
  }
```

Update `buildBatchImportTaskStages` to include:

```typescript
      itemId: item.id,
      retryable: item.status === "failed" && stage.name === "failed"
```

- [ ] **Step 4: Run App test to verify GREEN**

Run:

```bash
cd frontend && npm test -- App.test.tsx --run
```

Expected: pass.

---

### Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run backend focused tests**

Run:

```bash
cd backend && .venv/bin/pytest tests/test_universal_import_phase_1.py tests/test_document_import_phase_2.py tests/test_code_repository_import_phase_3.py -q
```

Expected: all pass.

- [ ] **Step 2: Run backend lint**

Run:

```bash
cd backend && .venv/bin/ruff check graphmind tests
```

Expected: no violations.

- [ ] **Step 3: Run frontend focused tests**

Run:

```bash
cd frontend && npm test -- ImportPanel.test.tsx App.test.tsx apiClientImportBatch.test.ts --run
```

Expected: all pass.

- [ ] **Step 4: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: build succeeds.

---

### Self-Review

- Spec coverage: Covers archived raw retry, failed item only, stale failed stage cleanup, batch status recomputation, API response, UI retry action, and data refresh.
- Placeholder scan: No TODO/TBD placeholders.
- Scope check: Does not implement async retry jobs or stage-from-middle rerun. Those remain future phases.
- Type consistency: Uses `ImportBatch`, `ImportItem`, `ImportStage`, and existing `ImportTask` naming.
