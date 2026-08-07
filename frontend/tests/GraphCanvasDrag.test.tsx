import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphResponse } from "../src/api/types";
import GraphCanvas from "../src/components/GraphCanvas";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

vi.mock("reactflow", () => ({
  default: ({
    nodes,
    onNodesChange,
    onSelectionChange,
    selectionOnDrag
  }: {
    nodes: {
      draggable?: boolean;
      id: string;
      position: { x: number; y: number };
      data: { graphNode: { label: string } };
    }[];
    onNodesChange?: (changes: { id: string; type: string; position: { x: number; y: number } }[]) => void;
    onSelectionChange?: (params: {
      edges: { id: string }[];
      nodes: { id: string }[];
    }) => void;
    selectionOnDrag?: boolean;
  }) => (
    <div>
      {nodes.map((node) => (
        <div
          data-draggable={String(node.draggable)}
          data-position={`${node.position.x},${node.position.y}`}
          data-testid={`node-${node.id}`}
          key={node.id}
        >
          {node.data.graphNode.label}
        </div>
      ))}
      <button
        onClick={() =>
          onNodesChange?.([
            {
              id: "2",
              type: "position",
              position: { x: 520, y: 420 }
            }
          ])
        }
        type="button"
      >
        drag node 2
      </button>
      <button
        onClick={() =>
          onSelectionChange?.({
            edges: [],
            nodes: [{ id: "1" }, { id: "2" }]
          })
        }
        type="button"
      >
        select nodes 1 and 2
      </button>
      <output aria-label="selection mode">{selectionOnDrag ? "box" : "pan"}</output>
    </div>
  ),
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
      metadata: { inferred_type: "string", key_candidate_score: 0.91 },
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

describe("GraphCanvas node dragging", () => {
  it("keeps a dragged node at its new position", () => {
    render(<GraphCanvas graph={graph} />);

    expect(screen.getByTestId("node-2")).toHaveAttribute("data-position", "340,80");

    fireEvent.click(screen.getByRole("button", { name: "drag node 2" }));

    expect(screen.getByTestId("node-2")).toHaveAttribute("data-position", "520,420");
  });

  it("resets a dragged node back to the automatic layout", () => {
    render(<GraphCanvas graph={graph} />);

    fireEvent.click(screen.getByRole("button", { name: "drag node 2" }));
    expect(screen.getByTestId("node-2")).toHaveAttribute("data-position", "520,420");

    fireEvent.click(screen.getByRole("button", { name: "重置布局" }));

    expect(screen.getByTestId("node-2")).toHaveAttribute("data-position", "340,80");
  });

  it("supports box selection and fixes selected nodes", () => {
    render(<GraphCanvas graph={graph} />);

    expect(screen.getByLabelText("selection mode")).toHaveTextContent("pan");

    fireEvent.click(screen.getByRole("button", { name: "开启框选" }));
    expect(screen.getByLabelText("selection mode")).toHaveTextContent("box");

    fireEvent.click(screen.getByRole("button", { name: "select nodes 1 and 2" }));
    expect(screen.getByText("已选择：2 个节点 · 0 条关系")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "固定选中节点" }));

    expect(screen.getByTestId("node-1")).toHaveAttribute("data-draggable", "false");
    expect(screen.getByTestId("node-2")).toHaveAttribute("data-draggable", "false");
    expect(screen.getByText("已固定：2 个节点")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "drag node 2" }));

    expect(screen.getByTestId("node-2")).toHaveAttribute("data-position", "340,80");
  });

  it("unfixes selected nodes so they can be dragged again", () => {
    render(<GraphCanvas graph={graph} />);

    fireEvent.click(screen.getByRole("button", { name: "select nodes 1 and 2" }));
    fireEvent.click(screen.getByRole("button", { name: "固定选中节点" }));
    fireEvent.click(screen.getByRole("button", { name: "取消固定选中节点" }));

    expect(screen.getByTestId("node-2")).toHaveAttribute("data-draggable", "true");

    fireEvent.click(screen.getByRole("button", { name: "drag node 2" }));

    expect(screen.getByTestId("node-2")).toHaveAttribute("data-position", "520,420");
  });
});
