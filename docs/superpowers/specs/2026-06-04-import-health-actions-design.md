# Import Health Actions Design

## Goal

Turn the Phase 22 import health overview into actionable shortcuts so users can jump directly from a health issue to the relevant review or import task area.

## Recommended Approach

Add lightweight action callbacks to `ImportPanel` health metrics:

- Failed items: scroll the import dialog to the import task card.
- Pending reviews: close the import dialog, open Insights, select Review tab, and preselect the pending review filter.
- High priority: close the import dialog, open Insights, select Review tab, and preselect the high-priority review filter.
- Duplicates: close the import dialog, open Insights, select Review tab, and preselect the duplicate governance filter.

Source count remains informational in this phase. This avoids adding routing or persistent UI state and builds directly on the Phase 21 review filters.

## Component Behavior

`RelationshipReview` gains an optional `initialFilter` prop. When the prop changes, it updates its active filter. `InsightPanel` passes the requested filter through. `Workspace` owns the current review shortcut filter so import health actions can coordinate with the right panel.

`ImportPanel` renders health metrics as buttons when an action is available and as static chips otherwise. Disabled or zero-count buttons are not needed; zero-count metrics remain static.

## Data Flow

New local frontend-only flow:

`ImportPanel health button -> Workspace handler -> set active module to insights -> set review tab -> set review filter -> close import dialog`

For failed import tasks, the handler stays inside `ImportPanel` and scrolls the existing task card into view.

## Error Handling

If a shortcut is triggered while the right panel is collapsed, `Workspace` expands it. If governance data is missing, duplicate count remains zero and no duplicate shortcut is rendered.

## Testing

Add focused coverage for:

- `RelationshipReview` respects an initial high-priority filter.
- `ImportPanel` failed metric triggers a local callback/scroll hook.
- `Workspace` health pending/high-priority/duplicate action opens the review panel with the expected selected filter.

## Self-Review

No placeholders remain. Scope is limited to local UI coordination; no backend, routing, or persistence changes are included.
