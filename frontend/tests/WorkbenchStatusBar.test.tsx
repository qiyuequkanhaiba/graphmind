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
    evidence_summary: "建议 dimension.",
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

    expect(screen.getByText("1 个节点")).toBeInTheDocument();
    expect(screen.getByText("0 条边")).toBeInTheDocument();
    expect(screen.getByText("1 条待审核")).toBeInTheDocument();
    expect(screen.getByText("节点：Orders")).toBeInTheDocument();
    expect(screen.getByText("AI 路径：2 个项目")).toBeInTheDocument();
    expect(screen.getByText("浏览器已收起")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复默认布局" })).toBeEnabled();
  });

  it("disables layout reset when the workbench is already in the default layout", () => {
    render(
      <WorkbenchStatusBar
        graph={graph}
        highlightedGraphPath={[]}
        leftPanelCollapsed={false}
        selection={null}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("button", { name: "恢复默认布局" })).toBeDisabled();
  });
});
