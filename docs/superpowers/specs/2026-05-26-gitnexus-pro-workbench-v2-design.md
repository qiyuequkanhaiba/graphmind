# GraphMind GitNexus Pro Workbench v2 Design

## Summary

GraphMind v2 workbench will move from a light analyst dashboard toward a GitNexus-inspired professional graph workbench. The goal is not to copy GitNexus code semantics, but to match the perceived product quality: dark immersive shell, dense workbench hierarchy, graph-first composition, left resource tree, right tabbed context, overlay details, and a compact system status bar.

The previous implementation borrowed GitNexus only at the layout skeleton level. This v2 explicitly upgrades visual language and interaction density so the first impression feels much closer to GitNexus while preserving GraphMind's spreadsheet/data relationship domain.

## Goals

- Make the first screen feel like a professional graph exploration workbench rather than a light three-panel data page.
- Adopt a dark, high-contrast workspace with restrained accent glow, compact typography, and clearer panel hierarchy.
- Turn the left data explorer into a table/field resource tree, closer to GitNexus `FileTreePanel` behavior.
- Keep the graph canvas as the visual center and reduce form-heavy visual weight around it.
- Convert the right insights area into a tabbed context panel so evidence, review, and AI feel like workbench tools instead of stacked cards.
- Add a node detail overlay or drawer over the graph area for selected table/field context, echoing GitNexus code-reference overlay behavior.
- Keep current import, graph, review, and chat APIs unchanged.

## Non-Goals

- Do not replicate GitNexus repository, code, file, class, or symbol semantics.
- Do not add new backend endpoints in this pass.
- Do not add heavy new visualization dependencies.
- Do not build draggable/resizable panel infrastructure yet.
- Do not implement a full command palette in this pass.
- Do not prioritize mobile layout; this is a desktop workbench.

## Visual Direction

The new theme uses a GitNexus-like dark workspace:

- App background: near-black void.
- Panels: deep elevated surfaces with subtle borders.
- Accent: blue/teal primary with limited violet secondary, used for focus, active tabs, graph highlights, and status pills.
- Typography: compact, utilitarian, with clear label/value hierarchy.
- Shadows: restrained glow on active graph nodes, overlays, and focused controls.
- Borders: thin, low-contrast, consistent across header, side panels, graph container, and status bar.

GraphMind should avoid a one-note purple theme. The palette should combine neutral dark surfaces, blue/teal graph accents, amber review status, and green trusted states.

## Workbench Layout

The ready-state app becomes a full-screen workbench:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Header: brand · dataset status · global search · quick state         │
├──────────────┬────────────────────────────────────────┬─────────────┤
│ Data Tree    │ Graph Canvas                           │ Right Tabs   │
│ tables       │ full-bleed dark graph area             │ Evidence     │
│ fields       │ floating graph toolbar                 │ Review       │
│ suggestions  │ optional selected-node overlay         │ AI           │
├──────────────┴────────────────────────────────────────┴─────────────┤
│ Status Bar: nodes · edges · pending · selection · AI path · backend  │
└─────────────────────────────────────────────────────────────────────┘
```

Panels stay fixed-width for this pass:

- Left panel: expanded around 300px, collapsed around 48px.
- Right panel: around 360px.
- Graph area: remaining space, with the strongest visual weight.
- Status bar: 28-32px.

## Components

### WorkbenchHeader

The header becomes a dark global command strip:

- Brand mark and `GraphMind` name.
- Dataset/graph state pill, e.g. `14 nodes · 12 edges · 2 pending`.
- Global search with GitNexus-like compact result dropdown.
- Small status cluster for backend/local workspace state.

Search behavior remains local over `graph.nodes`. Selecting a result updates selection, focuses the graph, and clears the dropdown.

### DataExplorerPanel

The left panel changes from summary cards to a resource tree:

- Top section: compact import action/status.
- Tree groups:
  - Tables
  - Fields grouped under table labels when possible
  - Dimensions
  - Pending Reviews
- Each row has a type badge/icon-like marker, label, and secondary metadata.
- Clicking table/field/dimension rows selects and focuses the graph node.
- Collapsed state shows a slim rail with a rotate-free icon/short label and expand control.

Tree grouping can be derived from `GraphNode.source_ref`, `label`, and adjacency data. No backend change is required.

### GraphCanvas

The central graph should feel more like the GitNexus graph surface:

- Dark canvas background with subtle grid.
- Floating toolbar instead of large bright toolbar blocks.
- Compact segmented controls and filters.
- Node cards restyled for dark surfaces.
- Selected nodes and AI-highlighted nodes get visible but restrained glow.
- Edge summary becomes a compact overlay/rail or is visually reduced.
- Empty state should be integrated into the canvas rather than looking like a card.

The current React Flow integration remains.

### Right Insight Panel

The right side becomes a tabbed panel:

- Tabs: `Evidence`, `Review`, `AI`.
- Evidence tab shows `EvidenceInspector`.
- Review tab shows `RelationshipReview`.
- AI tab shows `ChatPanel`.
- When a graph item is selected, tab content should prioritize context for that selection.

Default active tab:

- `Evidence` when a node or edge is selected.
- `Review` when there is no selection and pending suggestions exist.
- `AI` can remain manually selectable.

### Graph Detail Overlay

Selected table/field/dimension details should also appear as a graph overlay:

- Anchored to the left side of the graph canvas or lower-left corner.
- Shows node type, label, source ref, key metadata, and adjacent relationship count.
- Includes a close button that clears selection.
- Does not resize graph layout.

This mirrors the GitNexus idea of code reference/context overlay without copying code-specific behavior.

### WorkbenchStatusBar

The status bar becomes a compact dark system strip:

- Nodes and edges.
- Pending review count.
- Current selection.
- AI path length.
- Explorer collapsed/expanded.
- Local/backend ready state text.

It should read like a tool status line, not a dashboard footer.

## State And Data Flow

`Workspace` remains the coordinator:

- Owns `selection`.
- Owns `leftPanelCollapsed`.
- Owns `rightPanelTab`.
- Owns `focusRequest`.
- Receives node selection from header search and data tree.
- Passes selection to graph, right panel, overlay, and status bar.

New helper needed:

- `buildWorkbenchTree(graph, suggestions)` in `workbenchStats.ts` or a new helper file.
- It groups nodes into table, field, dimension, and review rows.

No API contract changes.

## Implementation Scope

This v2 is one front-end pass:

- Update tests to expect dark pro workbench selectors and tree/tab behavior.
- Add or extend helper tests for tree grouping.
- Update `DataExplorerPanel` to render selectable tree rows.
- Update `InsightPanel` to use tabs.
- Add `GraphDetailOverlay`.
- Restyle `WorkbenchHeader`, `GraphCanvas`, `SemanticNode`, panels, and status bar in `app.css`.
- Update `Workspace` selection flow so data tree clicks focus graph nodes.
- Keep existing import/review/chat behavior intact.

## Testing Strategy

Unit and component tests:

- `workbenchStats.test.ts`
  - groups graph nodes into tables, fields, dimensions, pending reviews.
- `DataExplorerPanel.test.tsx`
  - renders tree groups.
  - clicking a field row calls `onSelectNode`.
  - collapsed rail can expand.
- `InsightPanel.test.tsx`
  - renders tabs.
  - switches Evidence/Review/AI.
  - selection defaults to evidence context.
- `Workspace.test.tsx`
  - data tree selection updates status/insights.
  - header search still works.
- `graphStyles.test.js`
  - asserts dark workbench selectors/tokens exist.

Verification:

- `npm test`
- `npm run lint`
- `npm run build`
- Browser smoke at `http://127.0.0.1:5173/`
  - first screen is dark pro workbench.
  - left tree visible.
  - graph dominates center.
  - right panel tabs work.
  - node selection shows graph detail overlay.
  - search and data tree both focus/select nodes.
  - console has no errors.

## Risks

- The current graph data only has flat nodes, so table/field grouping must be inferred. The grouping should be robust but conservative.
- CSS is currently centralized in `app.css`; the v2 styling pass must avoid accidental overlap with older selectors.
- React Flow dark styling can look unfinished if only the container changes. Node, edge, control, minimap, and toolbar styles must be updated together.

## Success Criteria

The page should no longer read as a light dashboard. On first glance it should read as a GitNexus-class workbench adapted to spreadsheet relationships:

- dark full-screen shell,
- dense header,
- navigable resource tree,
- graph-first center,
- tabbed AI/context side panel,
- overlay detail context,
- compact status bar.
