import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphEdge, GraphNode, GraphSelection } from "../src/api/types";
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

const targetNode: GraphNode = {
  id: 3,
  node_type: "field",
  label: "Customers.id",
  source_ref: "customers.id",
  metadata: { aggregate_count: 2, inferred_type: "identifier", key_candidate_score: 1 },
  position_x: 200,
  position_y: 0
};

const edge: GraphEdge = {
  id: 11,
  source_node_id: node.id,
  target_node_id: targetNode.id,
  edge_type: "foreign_key",
  confidence: 0.99,
  status: "suggested",
  evidence_ref: "suggestion:2",
  created_from_suggestion_id: 2,
  metadata: { aggregate_count: 2 },
  evidence_summary: "4 个源字段不同取值中有 4 个与目标字段重合。",
  evidence_payload: { aggregate_count: 2, overlap_count: 4 }
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
    expect(screen.getByText("字段")).toBeInTheDocument();
    expect(screen.getByText("orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("相邻关系：0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭图谱详情" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders selected relationship details inside the graph overlay", () => {
    const selection: GraphSelection = {
      kind: "edge",
      edge,
      sourceNode: node,
      targetNode
    };

    render(<GraphDetailOverlay onClose={vi.fn()} selection={selection} />);

    expect(screen.getByRole("heading", { name: "Orders.customer_id → Customers.id" })).toBeInTheDocument();
    expect(screen.getByText("关系证据")).toBeInTheDocument();
    expect(screen.getByText("外键")).toBeInTheDocument();
    expect(screen.getByText("99%")).toBeInTheDocument();
    expect(screen.getByText("状态")).toBeInTheDocument();
    expect(screen.getByText("建议")).toBeInTheDocument();
    expect(screen.getByText("聚合关系数")).toBeInTheDocument();
    const aggregateRow = screen.getByText("聚合关系数").closest("div");
    expect(aggregateRow).not.toBeNull();
    expect(within(aggregateRow as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("4 个源字段不同取值中有 4 个与目标字段重合。")).toBeInTheDocument();
  });

  it("renders structured evidence rows for selected relationships", () => {
    const selection: GraphSelection = {
      kind: "edge",
      edge: {
        ...edge,
        evidence_payload: {
          aggregate_count: 2,
          overlap_count: 4,
          source_match_ratio: 1,
          field_type_compatible: true,
          sample_matches: ["c1", "c2"]
        }
      },
      sourceNode: node,
      targetNode
    };

    render(<GraphDetailOverlay onClose={vi.fn()} selection={selection} />);

    expect(screen.getByText("证据指标")).toBeInTheDocument();
    expect(screen.getByText("重合取值数")).toBeInTheDocument();
    expect(screen.getByText("源字段匹配率")).toBeInTheDocument();
    expect(screen.getByText("字段类型兼容")).toBeInTheDocument();
    expect(screen.getByText("匹配样例")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("是")).toBeInTheDocument();
    expect(screen.getByText("c1, c2")).toBeInTheDocument();
  });

  it("does not render for empty selections", () => {
    const { container } = render(<GraphDetailOverlay onClose={vi.fn()} selection={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
