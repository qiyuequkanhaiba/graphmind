# P5 Import Recovery Help Surface

Date: 2026-06-11

## Goal

Complete the local-first P5 recovery increment by preserving structured API
failure details in import tasks and rendering actionable remediation in the
import task list.

## Scope

- Preserve frontend `ApiError` details on failed import creation and retry
  paths: `code`, `userAction`, `retryable`, and `fieldErrors`.
- Clear stale recovery details when an import task returns to running or
  succeeds.
- Render recovery action, field-level issues, and error code beside existing
  file/URL recovery playbooks.
- Keep the work frontend-only because the unified backend error contract and
  frontend `ApiError` parser already exist.

## TDD Evidence

Red tests were added before implementation:

- `frontend/tests/useImportActions.test.tsx`
  - `preserves structured API recovery details when file import creation fails`
- `frontend/tests/ImportTaskListCard.test.tsx`
  - `renders structured recovery action and field errors from API failures`

Initial targeted run failed as expected because failed import tasks did not yet
store `errorCode`, `recoveryAction`, or `fieldErrors`, and the task card did not
render structured recovery details.

## Implementation

- `frontend/src/components/importTasks.ts`
  - Added optional structured recovery fields to `ImportTask`.
- `frontend/src/state/useImportActions.ts`
  - Added `buildImportFailureUpdate()` to normalize `ApiError` into import task
    failure state.
  - Added `clearImportFailureDetails()` for running/success/job refresh paths.
  - Applied structured recovery handling to file, batch, URL, sample, persisted
    retry, item retry, timeout, and job refresh transitions.
- `frontend/src/components/ImportTaskListCard.tsx`
  - Rendered error code, recovery action, and field errors in the recovery
    playbook section.
- `frontend/src/i18n/messages.ts`
  - Added Chinese and English labels for recovery action, field issues, and
    error code.
- `frontend/src/styles/app.css`
  - Added compact recovery detail styles with overflow-safe text wrapping.

## Verification

Fresh command evidence:

```bash
cd frontend && npm test -- useImportActions.test.tsx ImportTaskListCard.test.tsx --run
# 2 files, 8 tests passed

cd frontend && npm test -- ImportPanel.test.tsx App.test.tsx workspaceStore.test.ts apiClientImportBatch.test.ts --run
# 4 files, 77 tests passed

cd frontend && npm test
# 44 files, 351 tests passed

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

- Project templates for spreadsheet, document, repository, and URL use cases.
- First-graph onboarding refinements that remain workbench-first.
- Low-confidence relationship suggestion recovery playbooks.
- Searchable help or guided repair flows after repeated real-world failures
  identify the highest-value cases.
