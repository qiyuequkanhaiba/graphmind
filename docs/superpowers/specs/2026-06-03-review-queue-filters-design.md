# Review Queue Filters Design

## Goal

Make the relationship review queue easier to work through after large multi-source imports by adding local filters to the existing review panel.

## Recommended Approach

Use a small segmented filter control in `RelationshipReview` with four views:

- `全部`: every visible suggestion after the existing priority sort.
- `待处理`: suggestions whose `decision_status` is `pending`.
- `高优先级`: suggestions whose `review_priority` is `high`.
- `重复治理`: suggestions that belong to a duplicate governance group, including both the canonical suggestion and duplicate suggestions.

This keeps Phase 21 focused on review workflow ergonomics and avoids adding backend query parameters before the product proves it needs server-side paging or filtering.

## Component Behavior

`RelationshipReview` will derive a duplicate suggestion id set from `governanceSummary.duplicate_groups`. It will sort suggestions first, then apply the selected filter. The empty panel remains for zero total suggestions; filtered views with no matches show a separate filtered-empty message so users know the import still produced suggestions.

The filter buttons include counts, so the user can see queue size before switching views. The duplicate filter is disabled when there are no duplicate governance suggestions.

## Data Flow

Inputs stay unchanged:

- `suggestions`
- `governanceSummary`
- `onReview`
- `onCleanupDuplicates`

No API contract changes are required. This phase only reshapes presentation state in the frontend.

## Error Handling

If `governanceSummary` is missing, duplicate count is treated as zero and the duplicate filter is disabled. Unknown future priority/status values remain visible in the `全部` view and are excluded only from filters that explicitly match known values.

## Testing

Add focused Vitest coverage for:

- Rendering filter buttons with counts.
- Switching to the high-priority filter.
- Switching to the duplicate governance filter.
- Showing a filtered-empty state when a filter has no matches.

## Self-Review

No placeholders remain. Scope is limited to local review filtering and does not introduce server-side pagination, new API fields, or persistence of filter state.
