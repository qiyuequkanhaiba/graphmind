# Import Health Overview Design

## Goal

Give users a single post-import health overview for complex multi-source imports, so they can quickly see what succeeded, what failed, and where review attention is needed.

## Recommended Approach

Add a compact `导入健康度` section to the existing `ImportPanel`, near the result summary and before detailed source/task lists. The panel derives all values from existing frontend state:

- source kind count from `sourceSummaries`
- failed or partial import task count from `importTasks`
- pending relationship review count from `dataStats.pendingSuggestionCount`
- high-priority relationship count from `relationshipCandidates`
- duplicate governance count from `relationshipGovernance`

This keeps the phase frontend-only and avoids creating an API endpoint until the health model needs persistence or historical trend data.

## Component Behavior

The panel shows a status label:

- `需处理` when any failed/partial task, high-priority relationship, duplicate suggestion, or pending review exists.
- `健康` when data exists and no attention item is present.
- `等待导入` when there is no imported graph/source/task signal yet.

It then shows compact metrics for sources, failures, pending reviews, high-priority relationships, and duplicate suggestions. Counts remain visible even when zero, because zero is useful reassurance in an operational dashboard.

## Data Flow

`Workspace` already computes `ImportDataStats` and passes import state into `ImportPanel`. Phase 22 adds one optional prop:

- `relationshipGovernance?: RelationshipGovernanceSummary | null`

`ImportPanel` derives the health overview locally. No backend schema, API client, or storage changes are needed.

## Error Handling

Missing governance summary is treated as zero duplicate suggestions. Unknown import task status values do not count as failures unless they are `failed` or `partial`.

## Testing

Add focused `ImportPanel` tests for:

- health metrics with mixed source, failed task, pending relationship, high-priority relationship, and duplicate governance counts
- healthy state when data exists and no attention items are present
- waiting state when nothing has been imported

## Self-Review

No placeholders remain. Scope is limited to a local overview card and does not add navigation actions, persistence, backend aggregation, or trend history.
