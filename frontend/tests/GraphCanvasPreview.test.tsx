import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphResponse } from "../src/api/types";

const { fitViewMock, reactFlowInstance } = vi.hoisted(() => {
  const fitViewMock = vi.fn();
  return { fitViewMock, reactFlowInstance: { fitView: fitViewMock } };
});

vi.mock("reactflow", () => ({
  default: ({
    children,
    edges,
    nodes,
    onInit
  }: {
    children?: ReactNode;
    edges: { className?: string; id: string; label: string }[];
    nodes: { data: { graphNode: { label: string }; highlighted: boolean }; id: string }[];
    onInit?: (instance: typeof reactFlowInstance) => void;
  }) => {
    useEffect(() => {
      onInit?.(reactFlowInstance);
    }, [onInit]);
    return (
      <div>
        {nodes.map((node) => (
          <div
            className={`semantic-node${node.data.highlighted ? " is-highlighted" : ""}`}
            data-testid={`node-${node.id}`}
            key={node.id}
          >
            <strong>{node.data.graphNode.label}</strong>
          </div>
        ))}
        {edges.map((edge) => (
          <div className={edge.className} data-testid={`edge-${edge.id}`} key={edge.id}>
            {edge.label}
          </div>
        ))}
        {children}
      </div>
    );
  },
  Background: () => null,
  Controls: () => null,
  Handle: () => null,
  MarkerType: { ArrowClosed: "arrowclosed" },
  MiniMap: ({ ariaLabel }: { ariaLabel?: string }) => (
    <div aria-label={ariaLabel} role="group" />
  ),
  Position: { Left: "left", Right: "right" },
  SelectionMode: { Partial: "partial" }
}));

import GraphCanvas from "../src/components/GraphCanvas";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

const graph: GraphResponse = {
  nodes: [
    {
      id: 2,
      node_type: "field",
      label: "Orders.customer_id",
      source_ref: "orders.customer_id",
      metadata: { inferred_type: "string", key_candidate_score: 0.91 },
      position_x: 80,
      position_y: 180
    },
    {
      id: 3,
      node_type: "field",
      label: "Customers.customer_id",
      source_ref: "customers.customer_id",
      metadata: { inferred_type: "string", key_candidate_score: 0.99 },
      position_x: 360,
      position_y: 180
    },
    {
      id: 4,
      node_type: "field",
      label: "Products.product_code",
      source_ref: "products.product_code",
      metadata: { inferred_type: "string", key_candidate_score: 0.88 },
      position_x: 80,
      position_y: 320
    },
    {
      id: 5,
      node_type: "derived_entity",
      label: "product_code values",
      source_ref: "Products.product_code",
      metadata: { unique_count: 3 },
      position_x: 620,
      position_y: 320
    }
  ],
  edges: [
    {
      id: 11,
      source_node_id: 2,
      target_node_id: 3,
      edge_type: "foreign_key",
      confidence: 0.94,
      status: "suggested",
      evidence_ref: "suggestion:0",
      created_from_suggestion_id: 7,
      metadata: {},
      evidence_summary: "2 of 2 values overlap.",
      evidence_payload: { aggregate_count: 2, overlap_count: 2 }
    },
    {
      id: 12,
      source_node_id: 4,
      target_node_id: 5,
      edge_type: "derived_dimension",
      confidence: 0.72,
      status: "suggested",
      evidence_ref: "suggestion:1",
      created_from_suggestion_id: 8,
      metadata: {},
      evidence_summary: "Can be explored as a dimension.",
      evidence_payload: null
    }
  ]
};

describe("GraphCanvas relationship preview", () => {
  beforeEach(() => {
    fitViewMock.mockClear();
  });

  it("highlights the relationship endpoints and edge while hovering the relationship shelf item", () => {
    render(<GraphCanvas graph={graph} />);

    const relationshipButton = within(
      getRelationshipShelf()
    ).getByRole("button", {
      name: "Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 聚合 2"
    });

    fireEvent.mouseEnter(relationshipButton);

    expect(screen.getByTestId("node-2")).toHaveClass("is-highlighted");
    expect(screen.getByTestId("node-3")).toHaveClass("is-highlighted");
    expect(screen.getByTestId("edge-11")).toHaveClass("is-highlighted");
  });

  it("marks neighborhood edges and dims unrelated edges for selected node exploration", () => {
    render(
      <GraphCanvas
        canExploreSelection
        explorationMode="one_hop"
        graph={graph}
        selectedItem={{
          kind: "node",
          node: graph.nodes[0],
          adjacentEdges: [graph.edges[0]]
        }}
      />
    );

    expect(screen.getByTestId("edge-11")).toHaveClass("is-neighborhood");
    expect(screen.getByTestId("edge-12")).toHaveClass("is-dimmed");
  });

  it("keeps AI-highlighted edges emphasized while neighborhood exploration is active", () => {
    render(
      <GraphCanvas
        canExploreSelection
        explorationMode="one_hop"
        graph={graph}
        highlightedGraphPath={[12]}
        selectedItem={{
          kind: "node",
          node: graph.nodes[0],
          adjacentEdges: [graph.edges[0]]
        }}
      />
    );

    expect(screen.getByTestId("edge-12")).toHaveClass("is-highlighted");
    expect(screen.getByTestId("edge-12")).not.toHaveClass("is-dimmed");
  });

  it("focuses the selected relationship segment from the AI path summary", () => {
    render(<GraphCanvas graph={graph} highlightedGraphPath={[2, 3, 11]} />);

    fireEvent.click(
      within(getAiPathSummary()).getByRole("button", {
        name: "查看路径片段 Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 聚合 2 · 强度 强 · 证据 suggestion:0"
      })
    );

    expect(fitViewMock).toHaveBeenCalledWith({
      nodes: [{ id: "2" }, { id: "3" }],
      padding: 0.35
    });
  });

  it("focuses the full AI evidence path from the path summary controls", () => {
    render(<GraphCanvas graph={graph} highlightedGraphPath={[2, 3, 11, 12]} />);

    fireEvent.click(
      within(getAiPathSummary()).getByRole("button", {
        name: "聚焦完整路径"
      })
    );

    expect(fitViewMock).toHaveBeenCalledWith({
      nodes: [{ id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }],
      padding: 0.28
    });
  });
});

function openAnalysisDrawer(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "打开分析抽屉" }));
  return screen.getByRole("region", { name: "图谱分析抽屉" });
}

function getAnalysisDrawer(): HTMLElement {
  return screen.queryByRole("region", { name: "图谱分析抽屉" }) ?? openAnalysisDrawer();
}

function getRelationshipShelf(): HTMLElement {
  return within(getAnalysisDrawer()).getByRole("group", { name: "可见关系" });
}

function getAiPathSummary(): HTMLElement {
  return within(getAnalysisDrawer()).getByRole("status", { name: "AI 证据路径" });
}
