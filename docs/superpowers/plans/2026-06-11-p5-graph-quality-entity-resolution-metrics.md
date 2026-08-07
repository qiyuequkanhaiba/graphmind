# P5 Graph Quality Entity Resolution Metrics

Date: 2026-06-11

## Goal

Close the stable part of the deferred graph quality dashboard scope by surfacing
unresolved entity-match and documented-mapping review counts in the graph
quality operations panel.

## Scope

- Use existing frontend workspace state:
  - `entityMatchReviews`
  - `mappingReviews`
- Count reviews whose status is still `suggested`.
- Add the counts to the graph quality summary and right-panel quality
  operations metrics.
- Add local quality filter options for entity matches and mapping reviews.

Out of scope:

- Stale import counts. This plan only covered entity/mapping review metrics;
  P5 stale import health metrics are tracked separately in
  `2026-06-11-p5-stale-import-health-metrics.md`.
- New backend endpoints. The required review state already hydrates through the
  current workspace paths.

## TDD Evidence

Red tests were added before implementation:

- `frontend/tests/workbenchStats.test.ts`
  - `builds graph quality operations metrics`
  - expected unresolved entity-match and mapping-review counts.
- `frontend/tests/InsightPanel.test.tsx`
  - `surfaces graph quality operations and persists the local quality filter`
  - expected new metrics and local filter options.

Initial targeted run failed because the graph quality summary and panel did not
yet expose those counts.

## Implementation

- `frontend/src/components/workbench/workbenchStats.ts`
  - Added `unresolvedEntityMatches` and `unresolvedMappingReviews`.
  - Counted `suggested` entity-match and mapping-review rows.
- `frontend/src/components/Workspace.tsx`
  - Passed `entityMatchReviews` and `mappingReviews` into
    `buildGraphQualitySummary()`.
- `frontend/src/components/workbench/InsightPanel.tsx`
  - Added metric rows and local filter values for entity matches and mapping
    reviews.
- `frontend/src/i18n/messages.ts`
  - Added Chinese and English labels for the new metrics and filters.
- Documentation updated:
  - `docs/productization-implementation-tracker.md`
  - `docs/productization-roadmap.md`
  - `docs/productization-acceptance-plan.md`

## Verification

Fresh command evidence:

```bash
cd frontend && npm test -- workbenchStats.test.ts InsightPanel.test.tsx Workspace.test.tsx DataExplorerPanel.test.tsx --run
# 4 files, 66 tests passed

cd frontend && npm test
# 44 files, 352 tests passed

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

- Stale import semantics are covered separately by the P5 stale import health
  metrics plan using the backend 30-minute recovery threshold.
- Richer quality dashboards can build on this once stable stale-import and
  hosted/user attribution data exists.
