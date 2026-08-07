# P5 Stale Import Health Metrics

Date: 2026-06-11

## Goal

Close the remaining stable graph/import quality dashboard scope by surfacing
stuck persisted import jobs in the import health surface.

## Product Semantics

- A stale import is a persisted import job with `jobId`, status `queued` or
  `running`, and no backend `updated_at` refresh for at least 30 minutes.
- The 30-minute threshold mirrors the backend import worker recovery threshold
  in `import_job_queue.py`.
- The health metric is informational; the existing recovery action still
  handles all active persisted queued/running jobs.

Out of scope:

- New backend endpoint: import job responses already expose `updated_at`.
- Hosted/shared queue rate limits or distributed worker SLA reporting.
- Rich component/evidence drilldowns for graph quality dashboards.

## TDD Evidence

Red tests were added before implementation:

- `frontend/tests/importHealth.test.ts`
  - expected `staleImportJobCount` to count only persisted queued/running jobs
    older than the recovery threshold.
- `frontend/tests/ImportHealthPanel.test.tsx`
  - expected the import health panel to render the stuck-job metric.
- `frontend/tests/useImportActions.test.tsx`
  - expected persisted job mapping to preserve `updated_at` and `url` kind.

The initial targeted run failed because the overview did not return
`staleImportJobCount`, the panel did not render the metric, and the task mapper
did not expose `updatedAt`.

## Implementation

- `frontend/src/components/importTasks.ts`
  - Added optional `updatedAt` to `ImportTask`.
- `frontend/src/state/useImportActions.ts`
  - Mapped backend `updated_at` into `ImportTask.updatedAt`.
  - Added timestamp parsing with fallback to `created_at`.
  - Preserved persisted `url` import job kind.
- `frontend/src/components/importHealth.ts`
  - Added `STALE_IMPORT_JOB_MS = 30 * 60 * 1000`.
  - Added `staleImportJobCount` to `ImportHealthOverview`.
  - Counted stale queued/running persisted jobs using `updatedAt`.
- `frontend/src/components/ImportHealthPanel.tsx`
  - Rendered the stuck import job metric.
- `frontend/src/i18n/messages.ts`
  - Added Chinese and English metric labels.
- Documentation updated:
  - `docs/productization-implementation-tracker.md`
  - `docs/productization-roadmap.md`
  - `docs/productization-acceptance-plan.md`

## Verification

Fresh command evidence:

```bash
cd frontend && npm test -- importHealth.test.ts ImportHealthPanel.test.tsx useImportActions.test.tsx --run
# 3 files, 15 tests passed

cd frontend && npm test -- ImportPanel.test.tsx App.test.tsx useWorkspaceBootstrap.test.tsx i18n.test.tsx workspaceStore.test.ts --run
# 5 files, 64 tests passed

cd frontend && npm test
# 44 files, 354 tests passed

cd frontend && npm run lint
# exited 0

cd frontend && npm run build
# exited 0

cd frontend && npm run audit:layout
# 60 viewport/state checks passed

cd frontend && npm run audit:quality
# quality audit passed; buildWarningCount=0
```

## Remaining Follow-Ups

- Treat disconnected component and weak-evidence drilldowns as future quality
  dashboard work rather than current stuck-import scope.
