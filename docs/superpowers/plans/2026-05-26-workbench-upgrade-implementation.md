# GraphMind Workbench Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current GraphMind workspace into a GitNexus-inspired balanced analyst workbench with header search, collapsible data explorer, central graph focus workflow, right insights area, and bottom status bar.

**Architecture:** Keep the existing React single-workspace route and FastAPI backend unchanged. Add focused frontend components around the existing `GraphCanvas`, `EvidenceInspector`, `RelationshipReview`, `ChatPanel`, and `ImportPanel`; keep `Workspace` as the state coordinator for selection, left panel collapse, and graph focus requests.

**Tech Stack:** React, TypeScript, React Flow, Vitest, Testing Library, CSS.

---

## File Structure

Create frontend files:

- `frontend/src/components/workbench/workbenchStats.ts`: pure helpers for node counts, pending suggestions, selection labels, and graph item search.
- `frontend/src/components/workbench/WorkbenchHeader.tsx`: top workbench header with brand, graph status, and graph item search.
- `frontend/src/components/workbench/DataExplorerPanel.tsx`: left explorer wrapper around import plus graph resource summary and collapse controls.
- `frontend/src/components/workbench/InsightPanel.tsx`: right insights wrapper for evidence, review, and chat.
- `frontend/src/components/workbench/WorkbenchStatusBar.tsx`: bottom status bar.
- `frontend/tests/workbenchStats.test.ts`: pure helper tests.
- `frontend/tests/WorkbenchHeader.test.tsx`: header search tests.
- `frontend/tests/WorkbenchStatusBar.test.tsx`: status bar tests.

Modify frontend files:

- `frontend/src/components/GraphCanvas.tsx`: accept a focus request and focus a node when search selects it.
- `frontend/src/components/Workspace.tsx`: compose the new workbench shell, own collapse and focus request state, route search selection into graph selection.
- `frontend/src/styles/app.css`: add workbench shell, header, explorer, insight panel, and status bar styling.
- `frontend/tests/GraphCanvas.test.tsx`: cover focus request prop.
- `frontend/tests/Workspace.test.tsx`: cover shell rendering, collapse, search-to-selection, and status bar integration.
- `frontend/tests/graphStyles.test.js`: add CSS contract checks for new workbench selectors.

This workspace is not a git repository. At each checkpoint, run `git rev-parse --is-inside-work-tree`; if it fails with `fatal: not a git repository`, skip the commit command and record that the checkpoint was verified without a commit.

## Task 1: Workbench Statistics and Search Helpers

**Files:**
- Create: `frontend/src/components/workbench/workbenchStats.ts`
- Create: `frontend/tests/workbenchStats.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `frontend/tests/workbenchStats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  GraphNode,
  GraphResponse,
  GraphSelection,
  RelationshipSuggestion
} from "../src/api/types";
import {
  countGraphNodeTypes,
  formatGraphSummary,
  getPendingSuggestionCount,
  getSelectionSummary,
  searchGraphNodes
} from "../src/components/workbench/workbenchStats";

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
  edges: [
    {
      id: 10,
      source_node_id: 1,
      target_node_id: 2,
      edge_type: "contains_field",
      confidence: 1,
      status: "auto_trusted",
      evidence_ref: "field:orders.customer_id",
      created_from_suggestion_id: null,
      metadata: {},
      evidence_summary: null,
      evidence_payload: null
    }
  ]
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
    evidence_summary: "Region can be explored as a dimension.",
    evidence_payload: { unique_count: 2 },
    decision_status: "pending"
  },
  {
    id: 8,
    source_field_id: 2,
    target_field_id: 3,
    source_label: "Orders.customer_id",
    target_label: "Customers.customer_id",
    relationship_type: "foreign_key",
    confidence: 0.94,
    evidence_summary: "Accepted relationship.",
    evidence_payload: {},
    decision_status: "accepted"
  }
];

describe("workbenchStats", () => {
  it("counts graph node types and formats graph summary", () => {
    expect(countGraphNodeTypes(graph.nodes)).toEqual({
      tables: 1,
      fields: 1,
      dimensions: 1
    });
    expect(formatGraphSummary(graph, suggestions)).toBe("3 nodes · 1 edge · 1 pending review");
  });

  it("filters graph nodes by label, source ref, and type", () => {
    expect(searchGraphNodes(graph.nodes, "customer")).toEqual([graph.nodes[1]]);
    expect(searchGraphNodes(graph.nodes, "orders.region")).toEqual([graph.nodes[2]]);
    expect(searchGraphNodes(graph.nodes, "table")).toEqual([graph.nodes[0]]);
    expect(searchGraphNodes(graph.nodes, "missing")).toEqual([]);
  });

  it("limits graph node search results", () => {
    const manyNodes: GraphNode[] = Array.from({ length: 12 }, (_, index) => ({
      id: index + 10,
      node_type: "field",
      label: `Field ${index}`,
      source_ref: `orders.field_${index}`,
      metadata: {},
      position_x: 0,
      position_y: index * 80
    }));

    expect(searchGraphNodes(manyNodes, "field", 5)).toHaveLength(5);
  });

  it("summarizes pending suggestions and current selection", () => {
    expect(getPendingSuggestionCount(suggestions)).toBe(1);
    expect(getSelectionSummary(null)).toBe("No selection");

    const nodeSelection: GraphSelection = {
      kind: "node",
      node: graph.nodes[1],
      adjacentEdges: graph.edges
    };
    expect(getSelectionSummary(nodeSelection)).toBe("Node: Orders.customer_id");

    const edgeSelection: GraphSelection = {
      kind: "edge",
      edge: graph.edges[0],
      sourceNode: graph.nodes[0],
      targetNode: graph.nodes[1]
    };
    expect(getSelectionSummary(edgeSelection)).toBe("Relationship: Contains field");
  });
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- workbenchStats.test.ts
```

Expected: FAIL because `workbenchStats.ts` does not exist.

- [ ] **Step 3: Create helper implementation**

Create `frontend/src/components/workbench/workbenchStats.ts`:

```ts
import type {
  GraphNode,
  GraphResponse,
  GraphSelection,
  RelationshipSuggestion
} from "../../api/types";
import { getNodeKindLabel, getRelationshipLabel } from "../graph/graphSemantics";

export type GraphNodeTypeCounts = {
  tables: number;
  fields: number;
  dimensions: number;
};

export function countGraphNodeTypes(nodes: GraphNode[]): GraphNodeTypeCounts {
  return nodes.reduce<GraphNodeTypeCounts>(
    (counts, node) => {
      if (node.node_type === "table") {
        counts.tables += 1;
      } else if (node.node_type === "field") {
        counts.fields += 1;
      } else if (node.node_type === "derived_entity") {
        counts.dimensions += 1;
      }
      return counts;
    },
    { tables: 0, fields: 0, dimensions: 0 }
  );
}

export function getPendingSuggestionCount(suggestions: RelationshipSuggestion[]): number {
  return suggestions.filter((suggestion) => suggestion.decision_status === "pending").length;
}

export function formatGraphSummary(
  graph: GraphResponse,
  suggestions: RelationshipSuggestion[]
): string {
  const pending = getPendingSuggestionCount(suggestions);
  return `${graph.nodes.length} ${pluralize("node", graph.nodes.length)} · ${graph.edges.length} ${pluralize(
    "edge",
    graph.edges.length
  )} · ${pending} pending ${pending === 1 ? "review" : "reviews"}`;
}

export function searchGraphNodes(nodes: GraphNode[], query: string, limit = 8): GraphNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return nodes
    .filter((node) => {
      const haystack = [
        node.label,
        node.source_ref,
        node.node_type,
        getNodeKindLabel(node.node_type)
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    })
    .slice(0, limit);
}

export function getSelectionSummary(selection: GraphSelection | null): string {
  if (!selection) {
    return "No selection";
  }
  if (selection.kind === "node") {
    return `Node: ${selection.node.label}`;
  }
  return `Relationship: ${getRelationshipLabel(selection.edge.edge_type)}`;
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}
```

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
git commit -m "feat: add workbench graph helpers"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 2: Workbench Header Search

**Files:**
- Create: `frontend/src/components/workbench/WorkbenchHeader.tsx`
- Create: `frontend/tests/WorkbenchHeader.test.tsx`

- [ ] **Step 1: Write failing header tests**

Create `frontend/tests/WorkbenchHeader.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphResponse, RelationshipSuggestion } from "../src/api/types";
import WorkbenchHeader from "../src/components/workbench/WorkbenchHeader";

const graph: GraphResponse = {
  nodes: [
    {
      id: 1,
      node_type: "table",
      label: "Orders",
      source_ref: "orders",
      metadata: {},
      position_x: 0,
      position_y: 0
    },
    {
      id: 2,
      node_type: "field",
      label: "Orders.customer_id",
      source_ref: "orders.customer_id",
      metadata: {},
      position_x: 0,
      position_y: 120
    }
  ],
  edges: [
    {
      id: 10,
      source_node_id: 1,
      target_node_id: 2,
      edge_type: "contains_field",
      confidence: 1,
      status: "auto_trusted",
      evidence_ref: "field:orders.customer_id",
      created_from_suggestion_id: null,
      metadata: {},
      evidence_summary: null,
      evidence_payload: null
    }
  ]
};

const suggestions: RelationshipSuggestion[] = [
  {
    id: 7,
    source_field_id: 2,
    target_field_id: null,
    source_label: "Orders.customer_id",
    target_label: null,
    relationship_type: "derived_dimension",
    confidence: 0.76,
    evidence_summary: "Suggested dimension.",
    evidence_payload: {},
    decision_status: "pending"
  }
];

describe("WorkbenchHeader", () => {
  it("renders brand, graph summary, and search results", () => {
    const onSelectNode = vi.fn();
    render(<WorkbenchHeader graph={graph} suggestions={suggestions} onSelectNode={onSelectNode} />);

    expect(screen.getByRole("heading", { name: "GraphMind" })).toBeInTheDocument();
    expect(screen.getByText("2 nodes · 1 edge · 1 pending review")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search graph items"), {
      target: { value: "customer" }
    });

    expect(screen.getByText("Orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("Field")).toBeInTheDocument();
    expect(screen.getByText("orders.customer_id")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select Orders.customer_id" }));
    expect(onSelectNode).toHaveBeenCalledWith(graph.nodes[1]);
  });

  it("renders an empty search result state", () => {
    render(<WorkbenchHeader graph={graph} suggestions={[]} onSelectNode={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Search graph items"), {
      target: { value: "missing" }
    });

    expect(screen.getByText("No matching graph items")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run header tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- WorkbenchHeader.test.tsx
```

Expected: FAIL because `WorkbenchHeader.tsx` does not exist.

- [ ] **Step 3: Create header component**

Create `frontend/src/components/workbench/WorkbenchHeader.tsx`:

```tsx
import { useMemo, useState } from "react";
import type { GraphNode, GraphResponse, RelationshipSuggestion } from "../../api/types";
import { getNodeKindLabel } from "../graph/graphSemantics";
import { formatGraphSummary, searchGraphNodes } from "./workbenchStats";

type Props = {
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
  onSelectNode: (node: GraphNode) => void;
};

export default function WorkbenchHeader({ graph, suggestions, onSelectNode }: Props) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchGraphNodes(graph.nodes, query), [graph.nodes, query]);
  const showResults = query.trim().length > 0;

  function selectNode(node: GraphNode) {
    onSelectNode(node);
    setQuery("");
  }

  return (
    <header className="workbench-header">
      <div className="workbench-brand">
        <div className="brand-mark" aria-hidden="true" />
        <div>
          <h1>GraphMind</h1>
          <p>Spreadsheet relationship workbench</p>
        </div>
      </div>

      <div className="workbench-header-status">{formatGraphSummary(graph, suggestions)}</div>

      <div className="workbench-search">
        <label>
          <span>Search</span>
          <input
            aria-label="Search graph items"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tables, fields, dimensions"
            type="search"
            value={query}
          />
        </label>
        {showResults ? (
          <div className="workbench-search-results" role="listbox">
            {results.length > 0 ? (
              results.map((node) => (
                <button
                  aria-label={`Select ${node.label}`}
                  key={node.id}
                  onClick={() => selectNode(node)}
                  type="button"
                >
                  <span>{getNodeKindLabel(node.node_type)}</span>
                  <strong>{node.label}</strong>
                  <small>{node.source_ref}</small>
                </button>
              ))
            ) : (
              <p>No matching graph items</p>
            )}
          </div>
        ) : null}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run header tests and verify they pass**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- WorkbenchHeader.test.tsx
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
git add frontend/src/components/workbench/WorkbenchHeader.tsx frontend/tests/WorkbenchHeader.test.tsx
git commit -m "feat: add workbench header search"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 3: Data Explorer, Insight Panel, and Status Bar Components

**Files:**
- Create: `frontend/src/components/workbench/DataExplorerPanel.tsx`
- Create: `frontend/src/components/workbench/InsightPanel.tsx`
- Create: `frontend/src/components/workbench/WorkbenchStatusBar.tsx`
- Create: `frontend/tests/WorkbenchStatusBar.test.tsx`

- [ ] **Step 1: Write failing status bar tests**

Create `frontend/tests/WorkbenchStatusBar.test.tsx`:

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GraphResponse, GraphSelection, RelationshipSuggestion } from "../src/api/types";
import WorkbenchStatusBar from "../src/components/workbench/WorkbenchStatusBar";

const graph: GraphResponse = {
  nodes: [
    {
      id: 1,
      node_type: "table",
      label: "Orders",
      source_ref: "orders",
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
    source_field_id: 2,
    target_field_id: null,
    source_label: "Orders.region",
    target_label: null,
    relationship_type: "derived_dimension",
    confidence: 0.76,
    evidence_summary: "Suggested dimension.",
    evidence_payload: {},
    decision_status: "pending"
  }
];

describe("WorkbenchStatusBar", () => {
  it("renders graph metrics, selection, AI path, and panel state", () => {
    const selection: GraphSelection = {
      kind: "node",
      node: graph.nodes[0],
      adjacentEdges: []
    };

    render(
      <WorkbenchStatusBar
        graph={graph}
        highlightedGraphPath={[10, 11]}
        leftPanelCollapsed
        selection={selection}
        suggestions={suggestions}
      />
    );

    expect(screen.getByText("1 node")).toBeInTheDocument();
    expect(screen.getByText("0 edges")).toBeInTheDocument();
    expect(screen.getByText("1 pending review")).toBeInTheDocument();
    expect(screen.getByText("Node: Orders")).toBeInTheDocument();
    expect(screen.getByText("AI path: 2 items")).toBeInTheDocument();
    expect(screen.getByText("Explorer collapsed")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run status bar tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- WorkbenchStatusBar.test.tsx
```

Expected: FAIL because `WorkbenchStatusBar.tsx` does not exist.

- [ ] **Step 3: Create status bar component**

Create `frontend/src/components/workbench/WorkbenchStatusBar.tsx`:

```tsx
import type { GraphResponse, GraphSelection, RelationshipSuggestion } from "../../api/types";
import { getPendingSuggestionCount, getSelectionSummary } from "./workbenchStats";

type Props = {
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
  selection: GraphSelection | null;
  highlightedGraphPath: number[];
  leftPanelCollapsed: boolean;
};

export default function WorkbenchStatusBar({
  graph,
  suggestions,
  selection,
  highlightedGraphPath,
  leftPanelCollapsed
}: Props) {
  const pending = getPendingSuggestionCount(suggestions);

  return (
    <footer className="workbench-status-bar">
      <span>{formatCount(graph.nodes.length, "node")}</span>
      <span>{formatCount(graph.edges.length, "edge")}</span>
      <span>
        {pending} pending {pending === 1 ? "review" : "reviews"}
      </span>
      <span>{getSelectionSummary(selection)}</span>
      <span>
        AI path: {highlightedGraphPath.length}{" "}
        {highlightedGraphPath.length === 1 ? "item" : "items"}
      </span>
      <span>{leftPanelCollapsed ? "Explorer collapsed" : "Explorer expanded"}</span>
    </footer>
  );
}

function formatCount(count: number, label: string): string {
  return `${count} ${count === 1 ? label : `${label}s`}`;
}
```

- [ ] **Step 4: Create data explorer component**

Create `frontend/src/components/workbench/DataExplorerPanel.tsx`:

```tsx
import type { GraphResponse, RelationshipSuggestion } from "../../api/types";
import ImportPanel from "../ImportPanel";
import { countGraphNodeTypes, getPendingSuggestionCount } from "./workbenchStats";

type Props = {
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
  importStatus?: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onImport?: (file: File) => void;
};

export default function DataExplorerPanel({
  graph,
  suggestions,
  importStatus = null,
  collapsed,
  onToggleCollapsed,
  onImport = () => undefined
}: Props) {
  const counts = countGraphNodeTypes(graph.nodes);
  const pending = getPendingSuggestionCount(suggestions);

  if (collapsed) {
    return (
      <aside className="data-explorer-panel is-collapsed" aria-label="Data explorer">
        <button aria-label="Expand data explorer" onClick={onToggleCollapsed} type="button">
          Data
        </button>
      </aside>
    );
  }

  return (
    <aside className="data-explorer-panel" aria-label="Data explorer">
      <div className="panel-heading compact">
        <h2>Data Explorer</h2>
        <button aria-label="Collapse data explorer" onClick={onToggleCollapsed} type="button">
          Collapse
        </button>
      </div>
      <ImportPanel importStatus={importStatus} onImport={onImport} />
      <section className="explorer-summary" aria-label="Graph resource summary">
        <h3>Graph Resources</h3>
        <dl>
          <div>
            <dt>Tables</dt>
            <dd>{counts.tables}</dd>
          </div>
          <div>
            <dt>Fields</dt>
            <dd>{counts.fields}</dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd>{counts.dimensions}</dd>
          </div>
          <div>
            <dt>Pending reviews</dt>
            <dd>{pending}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
```

- [ ] **Step 5: Create insight panel component**

Create `frontend/src/components/workbench/InsightPanel.tsx`:

```tsx
import type {
  ChatMessage,
  GraphSelection,
  RelationshipDecisionStatus,
  RelationshipSuggestion
} from "../../api/types";
import ChatPanel from "../ChatPanel";
import EvidenceInspector from "../EvidenceInspector";
import RelationshipReview from "../RelationshipReview";

type Props = {
  selection: GraphSelection | null;
  suggestions: RelationshipSuggestion[];
  highlightedGraphPath: number[];
  messages: ChatMessage[];
  onReview: (
    suggestionId: number,
    decisionStatus: Exclude<RelationshipDecisionStatus, "pending">
  ) => void;
  onAsk: (question: string) => void;
};

export default function InsightPanel({
  selection,
  suggestions,
  highlightedGraphPath,
  messages,
  onReview,
  onAsk
}: Props) {
  return (
    <aside className="insight-panel">
      <div className="panel-heading compact">
        <h2>Insights</h2>
      </div>
      <EvidenceInspector
        highlightedGraphPath={highlightedGraphPath}
        onReview={onReview}
        selection={selection}
        suggestions={suggestions}
      />
      <RelationshipReview suggestions={suggestions} onReview={onReview} />
      <ChatPanel messages={messages} onAsk={onAsk} />
    </aside>
  );
}
```

- [ ] **Step 6: Run status bar tests and typecheck the new components**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- WorkbenchStatusBar.test.tsx
npm run lint
```

Expected: tests pass and TypeScript emits no errors.

- [ ] **Step 7: Checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add frontend/src/components/workbench/DataExplorerPanel.tsx frontend/src/components/workbench/InsightPanel.tsx frontend/src/components/workbench/WorkbenchStatusBar.tsx frontend/tests/WorkbenchStatusBar.test.tsx
git commit -m "feat: add workbench panels"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 4: GraphCanvas Focus Request Integration

**Files:**
- Modify: `frontend/src/components/GraphCanvas.tsx`
- Modify: `frontend/tests/GraphCanvas.test.tsx`

- [ ] **Step 1: Add a failing GraphCanvas focus request test**

Append this test to `frontend/tests/GraphCanvas.test.tsx` inside the existing `describe("GraphCanvas", () => { ... })` block:

```tsx
  it("keeps selected node styling when a focus request is provided", () => {
    render(
      <GraphCanvas
        focusRequest={{ nodeId: 2, nonce: 1 }}
        graph={graph}
        selectedItem={{
          kind: "node",
          node: graph.nodes[1],
          adjacentEdges: [graph.edges[0], graph.edges[1]]
        }}
      />
    );

    expect(screen.getByText("Orders.customer_id").closest(".semantic-node")).toHaveClass(
      "semantic-node-field"
    );
    expect(screen.getByText("Orders.customer_id").closest(".react-flow__node")).toHaveClass(
      "is-selected"
    );
  });
```

- [ ] **Step 2: Run GraphCanvas tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- GraphCanvas.test.tsx
```

Expected: FAIL because `GraphCanvas` does not accept `focusRequest` yet.

- [ ] **Step 3: Update GraphCanvas props and focus effect**

Modify `frontend/src/components/GraphCanvas.tsx`:

1. Change the React import:

```ts
import { useEffect, useMemo, useState } from "react";
```

2. Add this exported type above `type Props`:

```ts
export type GraphFocusRequest = {
  nodeId: number;
  nonce: number;
};
```

3. Add `focusRequest` to `Props`:

```ts
  focusRequest?: GraphFocusRequest | null;
```

4. Add it to the component destructuring:

```ts
  focusRequest = null,
```

5. Add this effect after `focusSelection`:

```ts
  useEffect(() => {
    if (!instance || !focusRequest) {
      return;
    }
    instance.fitView({ nodes: [{ id: String(focusRequest.nodeId) }], padding: 0.35 });
  }, [focusRequest, instance]);
```

- [ ] **Step 4: Run GraphCanvas tests and verify they pass**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- GraphCanvas.test.tsx
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
git add frontend/src/components/GraphCanvas.tsx frontend/tests/GraphCanvas.test.tsx
git commit -m "feat: support graph focus requests"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 5: Compose the Workbench Shell in Workspace

**Files:**
- Modify: `frontend/src/components/Workspace.tsx`
- Modify: `frontend/tests/Workspace.test.tsx`

- [ ] **Step 1: Replace Workspace tests with failing workbench integration coverage**

Replace `frontend/tests/Workspace.test.tsx` with:

```tsx
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GraphResponse, RelationshipSuggestion } from "../src/api/types";
import Workspace from "../src/components/Workspace";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

const graph: GraphResponse = {
  nodes: [
    {
      id: 1,
      node_type: "table",
      label: "Orders",
      source_ref: "orders",
      metadata: { row_count: 3, column_count: 2 },
      position_x: 80,
      position_y: 80
    },
    {
      id: 2,
      node_type: "field",
      label: "Orders.customer_id",
      source_ref: "orders.customer_id",
      metadata: { inferred_type: "identifier", key_candidate_score: 0.91 },
      position_x: 80,
      position_y: 180
    }
  ],
  edges: [
    {
      id: 10,
      source_node_id: 1,
      target_node_id: 2,
      edge_type: "contains_field",
      confidence: 1,
      status: "auto_trusted",
      evidence_ref: "field:orders.customer_id",
      created_from_suggestion_id: null,
      metadata: {},
      evidence_summary: null,
      evidence_payload: null
    }
  ]
};

const suggestions: RelationshipSuggestion[] = [
  {
    id: 7,
    source_field_id: 2,
    target_field_id: null,
    source_label: "Orders.customer_id",
    target_label: null,
    relationship_type: "derived_dimension",
    confidence: 0.76,
    evidence_summary: "Customer ID can be explored as a dimension.",
    evidence_payload: {},
    decision_status: "pending"
  }
];

describe("Workspace", () => {
  it("renders the balanced analyst workbench shell", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    expect(screen.getByRole("heading", { name: "GraphMind" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Data Explorer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Relationship Graph" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Insights" })).toBeInTheDocument();
    expect(screen.getByText("2 nodes")).toBeInTheDocument();
    expect(screen.getByText("1 edge")).toBeInTheDocument();
    expect(screen.getAllByText("1 pending review").length).toBeGreaterThan(0);
  });

  it("collapses and expands the data explorer", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse data explorer" }));
    expect(screen.getByText("Explorer collapsed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand data explorer" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand data explorer" }));
    expect(screen.getByText("Explorer expanded")).toBeInTheDocument();
  });

  it("selects graph nodes from header search and updates insights", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.change(screen.getByLabelText("Search graph items"), {
      target: { value: "customer" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Select Orders.customer_id" }));

    expect(screen.getByRole("heading", { name: "Node Details" })).toBeInTheDocument();
    expect(screen.getByText("Node: Orders.customer_id")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run Workspace tests and verify they fail**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- Workspace.test.tsx
```

Expected: FAIL because `Workspace` has not composed the new workbench shell.

- [ ] **Step 3: Update Workspace implementation**

Replace `frontend/src/components/Workspace.tsx` with:

```tsx
import { useEffect, useState } from "react";
import type {
  ChatMessage,
  GraphNode,
  GraphResponse,
  GraphSelection,
  RelationshipDecisionStatus,
  RelationshipSuggestion
} from "../api/types";
import GraphCanvas, { type GraphFocusRequest } from "./GraphCanvas";
import { getSelectionForNode } from "./graph/graphSemantics";
import DataExplorerPanel from "./workbench/DataExplorerPanel";
import InsightPanel from "./workbench/InsightPanel";
import WorkbenchHeader from "./workbench/WorkbenchHeader";
import WorkbenchStatusBar from "./workbench/WorkbenchStatusBar";

type Props = {
  graph: GraphResponse;
  suggestions?: RelationshipSuggestion[];
  highlightedGraphPath?: number[];
  onReview?: (
    suggestionId: number,
    decisionStatus: Exclude<RelationshipDecisionStatus, "pending">
  ) => void;
  messages?: ChatMessage[];
  onAsk?: (question: string) => void;
  importStatus?: string | null;
  onImport?: (file: File) => void;
};

export default function Workspace({
  graph,
  suggestions = [],
  highlightedGraphPath = [],
  onReview = () => undefined,
  messages = [],
  onAsk = () => undefined,
  importStatus = null,
  onImport = () => undefined
}: Props) {
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [focusRequest, setFocusRequest] = useState<GraphFocusRequest | null>(null);

  useEffect(() => {
    if (!selection) {
      return;
    }
    const selectionStillExists =
      selection.kind === "node"
        ? graph.nodes.some((node) => node.id === selection.node.id)
        : graph.edges.some((edge) => edge.id === selection.edge.id);
    if (!selectionStillExists) {
      setSelection(null);
    }
  }, [graph.edges, graph.nodes, selection]);

  function selectNodeFromSearch(node: GraphNode) {
    setSelection(getSelectionForNode(String(node.id), graph.nodes, graph.edges));
    setFocusRequest({ nodeId: node.id, nonce: Date.now() });
  }

  return (
    <div className={`workbench-shell${leftPanelCollapsed ? " is-left-collapsed" : ""}`}>
      <WorkbenchHeader graph={graph} suggestions={suggestions} onSelectNode={selectNodeFromSearch} />
      <div className="workbench-main">
        <DataExplorerPanel
          collapsed={leftPanelCollapsed}
          graph={graph}
          importStatus={importStatus}
          onImport={onImport}
          onToggleCollapsed={() => setLeftPanelCollapsed((current) => !current)}
          suggestions={suggestions}
        />
        <GraphCanvas
          focusRequest={focusRequest}
          graph={graph}
          highlightedGraphPath={highlightedGraphPath}
          onSelectionChange={setSelection}
          selectedItem={selection}
        />
        <InsightPanel
          highlightedGraphPath={highlightedGraphPath}
          messages={messages}
          onAsk={onAsk}
          onReview={onReview}
          selection={selection}
          suggestions={suggestions}
        />
      </div>
      <WorkbenchStatusBar
        graph={graph}
        highlightedGraphPath={highlightedGraphPath}
        leftPanelCollapsed={leftPanelCollapsed}
        selection={selection}
        suggestions={suggestions}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run Workspace and focused workbench tests**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- Workspace.test.tsx workbenchStats.test.ts WorkbenchHeader.test.tsx WorkbenchStatusBar.test.tsx GraphCanvas.test.tsx
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
git add frontend/src/components/Workspace.tsx frontend/tests/Workspace.test.tsx
git commit -m "feat: compose graphmind workbench shell"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 6: Workbench Styling and CSS Contract

**Files:**
- Modify: `frontend/src/styles/app.css`
- Modify: `frontend/tests/graphStyles.test.js`

- [ ] **Step 1: Add failing CSS contract assertions**

Update `frontend/tests/graphStyles.test.js` so the existing test also asserts these selectors:

```js
    expect(css).toContain(".workbench-shell {");
    expect(css).toContain(".workbench-header {");
    expect(css).toContain(".data-explorer-panel {");
    expect(css).toContain(".insight-panel {");
    expect(css).toContain(".workbench-status-bar {");
    expect(css).toContain(".workbench-shell.is-left-collapsed .workbench-main");
```

- [ ] **Step 2: Run CSS contract test and verify it fails**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- graphStyles.test.js
```

Expected: FAIL because workbench CSS selectors are not present.

- [ ] **Step 3: Append workbench CSS**

Append this CSS to `frontend/src/styles/app.css`:

```css
.workbench-shell {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) 30px;
  background: #f7f9fc;
}

.workbench-header {
  position: relative;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) auto minmax(280px, 0.9fr);
  gap: 18px;
  align-items: center;
  min-height: 62px;
  padding: 10px 16px;
  border-bottom: 1px solid #d7dde7;
  background: #ffffff;
}

.workbench-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.workbench-brand h1 {
  margin: 0;
  font-size: 18px;
  line-height: 1.1;
}

.workbench-brand p {
  margin: 2px 0 0;
  color: #607088;
  font-size: 12px;
}

.workbench-header-status {
  justify-self: center;
  color: #536278;
  font-size: 12px;
  white-space: nowrap;
}

.workbench-search {
  position: relative;
  justify-self: stretch;
}

.workbench-search label {
  display: grid;
  gap: 4px;
  color: #536278;
  font-size: 11px;
  font-weight: 720;
}

.workbench-search input {
  width: 100%;
  border: 1px solid #cbd4e1;
  border-radius: 8px;
  padding: 8px 10px;
  color: #172033;
}

.workbench-search-results {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  left: 0;
  z-index: 30;
  overflow: hidden;
  border: 1px solid #d7dde7;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 14px 28px rgba(36, 48, 71, 0.14);
}

.workbench-search-results button {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 2px 8px;
  width: 100%;
  border: 0;
  border-bottom: 1px solid #eef2f7;
  background: #ffffff;
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
}

.workbench-search-results button:hover {
  background: #f7f9fc;
}

.workbench-search-results span,
.workbench-search-results small {
  color: #607088;
  font-size: 11px;
}

.workbench-search-results strong {
  min-width: 0;
  overflow: hidden;
  color: #172033;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-search-results small {
  grid-column: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-search-results p {
  margin: 0;
  padding: 10px;
  color: #607088;
  font-size: 12px;
}

.workbench-main {
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(420px, 1fr) 340px;
}

.workbench-shell.is-left-collapsed .workbench-main {
  grid-template-columns: 46px minmax(420px, 1fr) 340px;
}

.data-explorer-panel,
.insight-panel {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: #ffffff;
}

.data-explorer-panel {
  border-right: 1px solid #d7dde7;
  padding: 14px;
}

.data-explorer-panel.is-collapsed {
  display: grid;
  place-items: start center;
  padding: 10px 6px;
}

.data-explorer-panel.is-collapsed button {
  writing-mode: vertical-rl;
  border: 1px solid #cbd4e1;
  border-radius: 8px;
  background: #ffffff;
  color: #536278;
  padding: 8px 6px;
  font-size: 12px;
  cursor: pointer;
}

.panel-heading.compact {
  height: auto;
  padding: 0 0 12px;
  background: transparent;
  border-bottom: 0;
}

.panel-heading.compact button {
  border: 1px solid #cbd4e1;
  border-radius: 7px;
  background: #ffffff;
  color: #536278;
  padding: 5px 8px;
  font-size: 12px;
  cursor: pointer;
}

.explorer-summary {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #d7dde7;
}

.explorer-summary h3 {
  margin: 0;
  font-size: 13px;
}

.explorer-summary dl {
  display: grid;
  gap: 7px;
  margin: 0;
}

.explorer-summary div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #607088;
  font-size: 12px;
}

.explorer-summary dd {
  margin: 0;
  color: #172033;
  font-weight: 760;
}

.insight-panel {
  display: grid;
  align-content: start;
  gap: 16px;
  border-left: 1px solid #d7dde7;
  padding: 14px;
}

.workbench-status-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 0 14px;
  border-top: 1px solid #d7dde7;
  background: #ffffff;
  color: #607088;
  font-size: 12px;
  white-space: nowrap;
}

.workbench-status-bar span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1180px) {
  .workbench-header {
    grid-template-columns: minmax(200px, 1fr) minmax(260px, 1fr);
  }

  .workbench-header-status {
    display: none;
  }

  .workbench-main,
  .workbench-shell.is-left-collapsed .workbench-main {
    grid-template-columns: 240px minmax(360px, 1fr);
  }

  .insight-panel {
    grid-column: 1 / -1;
    border-left: 0;
    border-top: 1px solid #d7dde7;
  }
}
```

- [ ] **Step 4: Run CSS contract and focused workbench tests**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test -- graphStyles.test.js Workspace.test.tsx WorkbenchHeader.test.tsx WorkbenchStatusBar.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run full frontend verification**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind/frontend
npm test
npm run lint
npm run build
```

Expected: all frontend tests pass, TypeScript emits no errors, and Vite builds successfully.

- [ ] **Step 6: Checkpoint**

Run:

```bash
cd /Volumes/outside-ssd/project/graphmind
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add frontend/src/styles/app.css frontend/tests/graphStyles.test.js
git commit -m "style: polish workbench shell"
```

If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 7: Browser Smoke and Final Verification

**Files:**
- No planned code changes.

- [ ] **Step 1: Run final frontend verification**

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

Use the Browser plugin to open `http://127.0.0.1:5173/`.

Verify empty workspace:

- `GraphMind` header is visible.
- Search input is visible.
- `Data Explorer` is visible.
- `Relationship Graph` is visible.
- `Insights` is visible.
- status bar is visible.
- `Backend unavailable` is not visible.
- console has no errors.

Import a temporary CSV through the API or UI using:

```csv
order_id,customer_id,product_id,amount,region
o1,c1,p1,120,East
o2,c1,p2,240,East
o3,c2,p1,80,West
```

After refresh, verify:

- status bar shows non-zero nodes and edges.
- header search for `customer` shows `customer_id`.
- selecting `customer_id` updates the right insight panel to `Node Details`.
- collapse and expand data explorer works.
- console has no errors.

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
