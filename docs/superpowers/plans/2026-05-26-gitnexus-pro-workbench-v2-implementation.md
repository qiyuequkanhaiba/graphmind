# GraphMind GitNexus Pro Workbench v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade GraphMind from a light analyst workbench into a GitNexus-inspired dark professional graph workbench.

**Architecture:** Keep the existing React/FastAPI data flow and React Flow graph. Add focused frontend helpers/components for resource-tree grouping, tabbed insights, and graph selection overlay, then restyle the existing workbench shell into a dark pro interface. `Workspace` remains the coordinator for selection, panel collapse, graph focus, and right-panel tab state.

**Tech Stack:** React, TypeScript, React Flow, Vitest, Testing Library, CSS.

---

## File Structure

Create frontend files:

- `frontend/src/components/workbench/GraphDetailOverlay.tsx`: selected-node overlay shown inside the graph area.
- `frontend/tests/DataExplorerPanel.test.tsx`: data tree and collapse tests.
- `frontend/tests/InsightPanel.test.tsx`: right-panel tab tests.
- `frontend/tests/GraphDetailOverlay.test.tsx`: overlay tests.

Modify frontend files:

- `frontend/src/components/workbench/workbenchStats.ts`: add `buildWorkbenchTree` and tree row types.
- `frontend/tests/workbenchStats.test.ts`: add resource-tree grouping tests.
- `frontend/src/components/workbench/DataExplorerPanel.tsx`: render a table/field/dimension resource tree and support node selection.
- `frontend/src/components/workbench/InsightPanel.tsx`: convert stacked panels into tabs.
- `frontend/src/components/Workspace.tsx`: wire data-tree selection, right panel tabs, graph overlay, and close-selection behavior.
- `frontend/src/components/GraphCanvas.tsx`: host `GraphDetailOverlay` and add pro canvas class hooks.
- `frontend/src/components/graph/SemanticNode.tsx`: dark node visual metadata hooks if needed.
- `frontend/src/styles/app.css`: dark pro workbench theme and layout.
- `frontend/tests/Workspace.test.tsx`: update expectations for pro shell, tree selection, tabs, overlay.
- `frontend/tests/graphStyles.test.js`: assert v2 dark selectors and tokens.

This workspace is not a git repository. At each checkpoint, run `git rev-parse --is-inside-work-tree`; if it fails with `fatal: not a git repository`, skip the commit command and record that checkpoint was verified without a commit.

## Task 1: Workbench Resource Tree Helper

**Files:**
- Modify: `frontend/src/components/workbench/workbenchStats.ts`
- Modify: `frontend/tests/workbenchStats.test.ts`

- [ ] **Step 1: Write the failing resource tree helper test**

Append this test inside `describe("workbenchStats", () => { ... })` in `frontend/tests/workbenchStats.test.ts`:

```ts
  it("builds a GitNexus-style resource tree from graph nodes and suggestions", () => {
    const tree = buildWorkbenchTree(graph, suggestions);

    expect(tree.tables).toEqual([
      {
        id: "table-1",
        label: "Orders",
        meta: "3 rows · 2 fields",
        node: graph.nodes[0],
        type: "table"
      }
    ]);
    expect(tree.fields).toEqual([
      {
        id: "field-2",
        label: "Orders.customer_id",
        meta: "identifier",
        node: graph.nodes[1],
        parentLabel: "Orders",
        type: "field"
      }
    ]);
    expect(tree.dimensions).toEqual([
      {
        id: "dimension-3",
        label: "region values",
        meta: "2 values",
        node: graph.nodes[2],
        type: "dimension"
      }
    ]);
    expect(tree.reviews).toEqual([
      {
        id: "review-7",
        label: "Orders.region",
        meta: "76% · derived dimension",
        suggestion: suggestions[0],
        type: "review"
      }
    ]);
  });
```

Add `buildWorkbenchTree` to the import list at the top of the test file.

- [ ] **Step 2: Run helper test and verify it fails**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- workbenchStats.test.ts
```

Expected: FAIL because `buildWorkbenchTree` is not exported.

- [ ] **Step 3: Implement tree helper**

Update `frontend/src/components/workbench/workbenchStats.ts`:

```ts
export type WorkbenchTreeRow =
  | {
      id: string;
      type: "table";
      label: string;
      meta: string;
      node: GraphNode;
    }
  | {
      id: string;
      type: "field";
      label: string;
      meta: string;
      parentLabel: string;
      node: GraphNode;
    }
  | {
      id: string;
      type: "dimension";
      label: string;
      meta: string;
      node: GraphNode;
    }
  | {
      id: string;
      type: "review";
      label: string;
      meta: string;
      suggestion: RelationshipSuggestion;
    };

export type WorkbenchTree = {
  tables: Extract<WorkbenchTreeRow, { type: "table" }>[];
  fields: Extract<WorkbenchTreeRow, { type: "field" }>[];
  dimensions: Extract<WorkbenchTreeRow, { type: "dimension" }>[];
  reviews: Extract<WorkbenchTreeRow, { type: "review" }>[];
};

export function buildWorkbenchTree(
  graph: GraphResponse,
  suggestions: RelationshipSuggestion[]
): WorkbenchTree {
  const tables = graph.nodes
    .filter((node) => node.node_type === "table")
    .map((node) => ({
      id: `table-${node.id}`,
      type: "table" as const,
      label: node.label,
      meta: `${Number(node.metadata.row_count ?? 0)} rows · ${Number(
        node.metadata.column_count ?? 0
      )} fields`,
      node
    }));

  const fields = graph.nodes
    .filter((node) => node.node_type === "field")
    .map((node) => ({
      id: `field-${node.id}`,
      type: "field" as const,
      label: node.label,
      meta: String(node.metadata.inferred_type ?? "field"),
      parentLabel: inferParentLabel(node.label, node.source_ref),
      node
    }));

  const dimensions = graph.nodes
    .filter((node) => node.node_type === "derived_entity")
    .map((node) => ({
      id: `dimension-${node.id}`,
      type: "dimension" as const,
      label: node.label,
      meta: `${Number(node.metadata.unique_count ?? 0)} values`,
      node
    }));

  const reviews = suggestions
    .filter((suggestion) => suggestion.decision_status === "pending")
    .map((suggestion) => ({
      id: `review-${suggestion.id}`,
      type: "review" as const,
      label: suggestion.source_label,
      meta: `${Math.round(suggestion.confidence * 100)}% · ${formatRelationshipType(
        suggestion.relationship_type
      )}`,
      suggestion
    }));

  return { tables, fields, dimensions, reviews };
}

function inferParentLabel(label: string, sourceRef: string): string {
  const labelParent = label.includes(".") ? label.split(".")[0] : "";
  if (labelParent) {
    return labelParent;
  }
  return sourceRef.includes(".") ? sourceRef.split(".")[0] : "Ungrouped";
}

function formatRelationshipType(type: string): string {
  return type.replace(/_/g, " ");
}
```

Keep existing exports unchanged.

- [ ] **Step 4: Run helper tests and verify they pass**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- workbenchStats.test.ts
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add frontend/src/components/workbench/workbenchStats.ts frontend/tests/workbenchStats.test.ts
git commit -m "feat: add workbench resource tree helpers"
```

If it fails with `fatal: not a git repository`, skip commit and continue.

## Task 2: Pro Data Explorer Tree

**Files:**
- Modify: `frontend/src/components/workbench/DataExplorerPanel.tsx`
- Create: `frontend/tests/DataExplorerPanel.test.tsx`
- Modify: `frontend/tests/Workspace.test.tsx`

- [ ] **Step 1: Write failing DataExplorerPanel tests**

Create `frontend/tests/DataExplorerPanel.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphResponse, RelationshipSuggestion } from "../src/api/types";
import DataExplorerPanel from "../src/components/workbench/DataExplorerPanel";

const graph: GraphResponse = {
  nodes: [
    {
      id: 1,
      node_type: "table",
      label: "Orders",
      source_ref: "orders",
      metadata: { row_count: 3, column_count: 2 },
      position_x: 0,
      position_y: 0
    },
    {
      id: 2,
      node_type: "field",
      label: "Orders.customer_id",
      source_ref: "orders.customer_id",
      metadata: { inferred_type: "identifier" },
      position_x: 0,
      position_y: 120
    },
    {
      id: 3,
      node_type: "derived_entity",
      label: "region values",
      source_ref: "orders.region",
      metadata: { unique_count: 2 },
      position_x: 160,
      position_y: 120
    }
  ],
  edges: []
};

const suggestions: RelationshipSuggestion[] = [
  {
    id: 7,
    source_field_id: 2,
    target_field_id: null,
    source_label: "Orders.region",
    target_label: null,
    relationship_type: "derived_dimension",
    confidence: 0.76,
    evidence_summary: "Region dimension.",
    evidence_payload: {},
    decision_status: "pending"
  }
];

describe("DataExplorerPanel", () => {
  it("renders a pro resource tree and selects graph nodes", () => {
    const onSelectNode = vi.fn();
    render(
      <DataExplorerPanel
        collapsed={false}
        graph={graph}
        onSelectNode={onSelectNode}
        onToggleCollapsed={vi.fn()}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("heading", { name: "Data Tree" })).toBeInTheDocument();
    expect(screen.getByText("Tables")).toBeInTheDocument();
    expect(screen.getByText("Fields")).toBeInTheDocument();
    expect(screen.getByText("Dimensions")).toBeInTheDocument();
    expect(screen.getByText("Pending Reviews")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select Orders.customer_id" }));
    expect(onSelectNode).toHaveBeenCalledWith(graph.nodes[1]);
  });

  it("renders a slim collapsed rail", () => {
    render(
      <DataExplorerPanel
        collapsed
        graph={graph}
        onToggleCollapsed={vi.fn()}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("button", { name: "Expand data tree" })).toBeInTheDocument();
    expect(screen.getByText("Data")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run DataExplorerPanel tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- DataExplorerPanel.test.tsx
```

Expected: FAIL because the component does not accept `onSelectNode` and still renders the old summary-oriented panel.

- [ ] **Step 3: Update DataExplorerPanel implementation**

Modify `frontend/src/components/workbench/DataExplorerPanel.tsx`:

- Add `GraphNode` to imported types.
- Import `buildWorkbenchTree`.
- Add prop `onSelectNode?: (node: GraphNode) => void`.
- Rename expanded heading to `Data Tree`.
- Render tree sections for `tables`, `fields`, `dimensions`, and `reviews`.
- For table/field/dimension rows, render `<button aria-label={`Select ${row.label}`}>`.
- For review rows, render non-clickable review hints.
- Change collapsed button label to `Expand data tree`.

Use these class names so styling and tests can target the pro workbench:

```tsx
<aside className="data-explorer-panel pro-tree-panel" aria-label="Data tree">
<section className="tree-section">
<button className="tree-row tree-row-field" ...>
<span className="tree-row-type">FIELD</span>
<span className="tree-row-label">Orders.customer_id</span>
<span className="tree-row-meta">identifier</span>
```

- [ ] **Step 4: Run DataExplorerPanel tests and verify they pass**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- DataExplorerPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, commit changed files. If it fails with `fatal: not a git repository`, skip commit and continue.

## Task 3: Tabbed Right Insight Panel

**Files:**
- Modify: `frontend/src/components/workbench/InsightPanel.tsx`
- Create: `frontend/tests/InsightPanel.test.tsx`

- [ ] **Step 1: Write failing InsightPanel tests**

Create `frontend/tests/InsightPanel.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphResponse, GraphSelection, RelationshipSuggestion } from "../src/api/types";
import InsightPanel from "../src/components/workbench/InsightPanel";

const graph: GraphResponse = {
  nodes: [
    {
      id: 1,
      node_type: "field",
      label: "Orders.customer_id",
      source_ref: "orders.customer_id",
      metadata: {},
      position_x: 0,
      position_y: 0
    }
  ],
  edges: []
};

const suggestions: RelationshipSuggestion[] = [
  {
    id: 7,
    source_field_id: 1,
    target_field_id: null,
    source_label: "Orders.customer_id",
    target_label: null,
    relationship_type: "derived_dimension",
    confidence: 0.76,
    evidence_summary: "Candidate dimension.",
    evidence_payload: {},
    decision_status: "pending"
  }
];

describe("InsightPanel", () => {
  it("renders Evidence, Review, and AI tabs", () => {
    const selection: GraphSelection = {
      kind: "node",
      node: graph.nodes[0],
      adjacentEdges: []
    };

    render(
      <InsightPanel
        activeTab="evidence"
        highlightedGraphPath={[]}
        messages={[]}
        onAsk={vi.fn()}
        onReview={vi.fn()}
        onTabChange={vi.fn()}
        selection={selection}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("tab", { name: "Evidence" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Node Details" })).toBeInTheDocument();
  });

  it("notifies when switching tabs", () => {
    const onTabChange = vi.fn();
    render(
      <InsightPanel
        activeTab="review"
        highlightedGraphPath={[]}
        messages={[]}
        onAsk={vi.fn()}
        onReview={vi.fn()}
        onTabChange={onTabChange}
        selection={null}
        suggestions={suggestions}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    expect(onTabChange).toHaveBeenCalledWith("ai");
  });
});
```

- [ ] **Step 2: Run InsightPanel tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- InsightPanel.test.tsx
```

Expected: FAIL because tab props and roles do not exist.

- [ ] **Step 3: Implement tabbed InsightPanel**

Modify `frontend/src/components/workbench/InsightPanel.tsx`:

- Export type `InsightPanelTab = "evidence" | "review" | "ai"`.
- Add props `activeTab: InsightPanelTab` and `onTabChange: (tab: InsightPanelTab) => void`.
- Render `<div className="insight-tabs" role="tablist">`.
- Render tab buttons with role `tab`, active class, `aria-selected`.
- Render only the active panel:
  - Evidence: `EvidenceInspector`
  - Review: `RelationshipReview`
  - AI: `ChatPanel`

- [ ] **Step 4: Run InsightPanel tests and verify they pass**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- InsightPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run git checkpoint detection and skip commit if not a git repository.

## Task 4: Graph Detail Overlay

**Files:**
- Create: `frontend/src/components/workbench/GraphDetailOverlay.tsx`
- Create: `frontend/tests/GraphDetailOverlay.test.tsx`
- Modify: `frontend/src/components/GraphCanvas.tsx`
- Modify: `frontend/tests/GraphCanvas.test.tsx`

- [ ] **Step 1: Write failing overlay component test**

Create `frontend/tests/GraphDetailOverlay.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphNode, GraphSelection } from "../src/api/types";
import GraphDetailOverlay from "../src/components/workbench/GraphDetailOverlay";

const node: GraphNode = {
  id: 2,
  node_type: "field",
  label: "Orders.customer_id",
  source_ref: "orders.customer_id",
  metadata: { inferred_type: "identifier", key_candidate_score: 0.91 },
  position_x: 0,
  position_y: 0
};

describe("GraphDetailOverlay", () => {
  it("renders selected node details and closes selection", () => {
    const selection: GraphSelection = {
      kind: "node",
      node,
      adjacentEdges: []
    };
    const onClose = vi.fn();

    render(<GraphDetailOverlay onClose={onClose} selection={selection} />);

    expect(screen.getByRole("heading", { name: "Orders.customer_id" })).toBeInTheDocument();
    expect(screen.getByText("FIELD")).toBeInTheDocument();
    expect(screen.getByText("orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("Adjacent relationships: 0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close graph detail" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render for edge selections", () => {
    const { container } = render(<GraphDetailOverlay onClose={vi.fn()} selection={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run overlay tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- GraphDetailOverlay.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement GraphDetailOverlay**

Create `frontend/src/components/workbench/GraphDetailOverlay.tsx`:

```tsx
import type { GraphSelection } from "../../api/types";
import { getNodeKindLabel } from "../graph/graphSemantics";

type Props = {
  selection: GraphSelection | null;
  onClose: () => void;
};

export default function GraphDetailOverlay({ selection, onClose }: Props) {
  if (!selection || selection.kind !== "node") {
    return null;
  }

  const metadata = Object.entries(selection.node.metadata).slice(0, 4);

  return (
    <aside className="graph-detail-overlay" aria-label="Graph detail overlay">
      <div className="graph-detail-header">
        <span>{getNodeKindLabel(selection.node.node_type).toUpperCase()}</span>
        <button aria-label="Close graph detail" onClick={onClose} type="button">
          ×
        </button>
      </div>
      <h3>{selection.node.label}</h3>
      <p>{selection.node.source_ref}</p>
      <dl>
        {metadata.map(([key, value]) => (
          <div key={key}>
            <dt>{key.replace(/_/g, " ")}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
      <small>Adjacent relationships: {selection.adjacentEdges.length}</small>
    </aside>
  );
}
```

- [ ] **Step 4: Wire overlay into GraphCanvas**

Modify `frontend/src/components/GraphCanvas.tsx`:

- Import `GraphDetailOverlay`.
- Add prop `onClearSelection?: () => void`.
- Render `<GraphDetailOverlay selection={selectedItem} onClose={onClearSelection} />` inside `.graph-canvas` next to `ReactFlow`.
- Ensure it appears only when a node is selected.

- [ ] **Step 5: Run overlay and GraphCanvas tests**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- GraphDetailOverlay.test.tsx GraphCanvas.test.tsx
```

Expected: PASS after implementation.

- [ ] **Step 6: Checkpoint**

Run git checkpoint detection and skip commit if not a git repository.

## Task 5: Workspace Pro State Wiring

**Files:**
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/tests/Workspace.test.tsx`

- [ ] **Step 1: Write failing Workspace v2 tests**

Update `frontend/tests/Workspace.test.tsx`:

- Rename first test to `"renders the GitNexus-inspired pro workbench shell"`.
- Expect `Data Tree` instead of `Data Explorer`.
- Add expectations for tabs:

```tsx
expect(screen.getByRole("tab", { name: "Evidence" })).toBeInTheDocument();
expect(screen.getByRole("tab", { name: "Review" })).toBeInTheDocument();
expect(screen.getByRole("tab", { name: "AI" })).toBeInTheDocument();
```

Add this test:

```tsx
  it("selects graph nodes from the data tree and shows the graph overlay", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Orders.customer_id" }));

    expect(screen.getByLabelText("Graph detail overlay")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Orders.customer_id" })).toBeInTheDocument();
    expect(screen.getByText("Node: Orders.customer_id")).toBeInTheDocument();
  });
```

Add this test:

```tsx
  it("switches right-panel tabs without losing the selected node", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "Select Orders.customer_id" }));
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));

    expect(screen.getByRole("heading", { name: "AI Relationship Q&A" })).toBeInTheDocument();
    expect(screen.getByText("Node: Orders.customer_id")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run Workspace tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- Workspace.test.tsx
```

Expected: FAIL because data tree selection and tab props are not wired yet.

- [ ] **Step 3: Wire Workspace v2 state**

Modify `frontend/src/components/Workspace.tsx`:

- Import `InsightPanelTab`.
- Add state:

```ts
const [rightPanelTab, setRightPanelTab] = useState<InsightPanelTab>(
  suggestions.some((suggestion) => suggestion.decision_status === "pending") ? "review" : "evidence"
);
```

- Update `selectNodeFromSearch` into reusable `selectNode(node: GraphNode)`:
  - Set selection.
  - Set focus request.
  - Set right panel tab to `"evidence"`.
- Pass `onSelectNode={selectNode}` into `DataExplorerPanel`.
- Pass `activeTab={rightPanelTab}` and `onTabChange={setRightPanelTab}` into `InsightPanel`.
- Pass `onClearSelection={() => setSelection(null)}` into `GraphCanvas`.

- [ ] **Step 4: Run Workspace tests and verify they pass**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- Workspace.test.tsx DataExplorerPanel.test.tsx InsightPanel.test.tsx GraphDetailOverlay.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run git checkpoint detection and skip commit if not a git repository.

## Task 6: Dark Pro Workbench Styling

**Files:**
- Modify: `frontend/src/styles/app.css`
- Modify: `frontend/tests/graphStyles.test.js`

- [ ] **Step 1: Write failing CSS contract test**

Update `frontend/tests/graphStyles.test.js` to assert these v2 selectors and tokens:

```js
    expect(css).toContain("--gm-void: #06070b;");
    expect(css).toContain("--gm-panel: #10131b;");
    expect(css).toContain("--gm-accent: #24d3b5;");
    expect(css).toContain(".workbench-shell.pro-workbench");
    expect(css).toContain(".pro-tree-panel");
    expect(css).toContain(".tree-row-field");
    expect(css).toContain(".insight-tabs");
    expect(css).toContain(".graph-detail-overlay");
    expect(css).toContain(".react-flow__controls");
```

- [ ] **Step 2: Run CSS contract test and verify it fails**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- graphStyles.test.js
```

Expected: FAIL because v2 dark tokens/selectors are missing.

- [ ] **Step 3: Add dark pro CSS**

Modify `frontend/src/styles/app.css`:

- Add root tokens:

```css
  --gm-void: #06070b;
  --gm-deep: #0a0d14;
  --gm-panel: #10131b;
  --gm-elevated: #161b26;
  --gm-border: #263044;
  --gm-text: #e5edf7;
  --gm-muted: #8b98ad;
  --gm-accent: #24d3b5;
  --gm-accent-blue: #5ba7ff;
  --gm-warning: #f6b95f;
  --gm-success: #45d483;
```

- Change `.app-shell`, `.workbench-shell`, `.workbench-header`, `.data-explorer-panel`, `.graph-panel`, `.insight-panel`, and `.workbench-status-bar` to use dark surfaces.
- Add `.pro-workbench`, `.pro-tree-panel`, `.tree-section`, `.tree-row`, `.insight-tabs`, `.graph-detail-overlay` styles.
- Restyle React Flow controls, minimap, semantic nodes, graph toolbar, and edge summary for dark surfaces.
- Keep responsive rules from existing CSS, adjusted for the pro layout.

- [ ] **Step 4: Run CSS and focused component tests**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- graphStyles.test.js Workspace.test.tsx DataExplorerPanel.test.tsx InsightPanel.test.tsx GraphDetailOverlay.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run git checkpoint detection and skip commit if not a git repository.

## Task 7: Final Verification and Browser Smoke

**Files:**
- No planned code changes.

- [ ] **Step 1: Run full frontend verification**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Run backend regression verification**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/backend
.venv/bin/python -m pytest -q
.venv/bin/ruff check graphmind tests
```

Expected: all backend tests pass and ruff reports no issues.

- [ ] **Step 3: Start or reuse local services**

Check ports:

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN || true
lsof -nP -iTCP:5173 -sTCP:LISTEN || true
```

If backend is not listening, run from `backend`:

```bash
.venv/bin/uvicorn graphmind.api.app:create_app --factory --host 127.0.0.1 --port 8000
```

If frontend is not listening, run from `frontend`:

```bash
npm run dev -- --port 5173
```

- [ ] **Step 4: Browser smoke test**

Open `http://127.0.0.1:5173/` in the in-app browser.

Verify:

- The first screen is dark, not the previous light dashboard.
- `GraphMind` header is visible once.
- `Data Tree` is visible in the left panel.
- Tables, Fields, Dimensions, and Pending Reviews sections are visible.
- The graph remains the central dominant area.
- Right panel tabs `Evidence`, `Review`, and `AI` are visible and switch content.
- Selecting `customer_id` from search shows `Node Details` and `Graph detail overlay`.
- Selecting `customer_id` from the data tree shows the same overlay and status selection.
- Collapse and expand data tree works.
- Status bar is compact and dark.
- Console has no errors.

- [ ] **Step 5: Final checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git status --short
```

If it fails with `fatal: not a git repository`, record that commits were skipped because this workspace is not a git repository.
