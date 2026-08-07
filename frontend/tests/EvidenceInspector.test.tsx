import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphEdge, GraphNode, GraphSelection, RelationshipSuggestion } from "../src/api/types";
import EvidenceInspector from "../src/components/EvidenceInspector";

const sourceNode: GraphNode = {
  id: 2,
  node_type: "field",
  label: "Orders.customer_id",
  source_ref: "orders.customer_id",
  metadata: { inferred_type: "string", key_candidate_score: 0.91 },
  position_x: 80,
  position_y: 180
};

const targetNode: GraphNode = {
  id: 3,
  node_type: "field",
  label: "Customers.customer_id",
  source_ref: "customers.customer_id",
  metadata: { inferred_type: "string", key_candidate_score: 0.99 },
  position_x: 360,
  position_y: 180
};

const evidenceEdge: GraphEdge = {
  id: 11,
  source_node_id: 2,
  target_node_id: 3,
  edge_type: "foreign_key",
  confidence: 0.94,
  status: "suggested",
  evidence_ref: "suggestion:0",
  evidence_refs: ["suggestion:0", "architecture.md#overview", "architecture.md#overview"],
  created_from_suggestion_id: 7,
  metadata: {},
  evidence_summary: "2 of 2 distinct source values overlap.",
  evidence_payload: {
    aggregate_count: 2,
    overlap_count: 2,
    source_distinct_count: 2,
    source_match_ratio: 1
  }
};

const suggestions: RelationshipSuggestion[] = [
  {
    id: 7,
    source_field_id: 21,
    target_field_id: 31,
    source_label: "Orders.customer_id",
    target_label: "Customers.customer_id",
    relationship_type: "foreign_key",
    confidence: 0.94,
    evidence_summary: "Fallback summary.",
    evidence_payload: { overlap_count: 2 },
    decision_status: "pending"
  }
];

describe("EvidenceInspector", () => {
  it("renders selected edge evidence and review actions", () => {
    const onReview = vi.fn();
    const onOpenEvidenceRef = vi.fn();
    const selection: GraphSelection = {
      kind: "edge",
      edge: evidenceEdge,
      sourceNode,
      targetNode
    };

    render(
      <EvidenceInspector
        highlightedGraphPath={[11]}
        evidenceRefSources={{ "architecture.md#overview": "architecture.md" }}
        onOpenEvidenceRef={onOpenEvidenceRef}
        onReview={onReview}
        selection={selection}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("heading", { name: "关系证据" })).toBeInTheDocument();
    expect(screen.getByText("外键")).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();
    expect(screen.getByText("Orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("Customers.customer_id")).toBeInTheDocument();
    expect(
      screen.getByText("2 个源字段不同取值中有 2 个与目标字段重合；源字段匹配率 100%。")
    ).toBeInTheDocument();
    expect(screen.getByText("重合取值数")).toBeInTheDocument();
    const aggregateRow = screen.getByText("聚合关系数").closest("div");
    expect(aggregateRow).not.toBeNull();
    expect(within(aggregateRow as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("源字段匹配率")).toBeInTheDocument();
    expect(screen.getByText("AI 答案路径：1 个图谱项")).toBeInTheDocument();
    expect(screen.getByText("证据来源")).toBeInTheDocument();
    const evidenceRefs = screen.getByRole("region", { name: "证据来源" });
    expect(within(evidenceRefs).getByText("suggestion:0")).toBeInTheDocument();
    expect(within(evidenceRefs).getByRole("button", { name: "打开证据来源 architecture.md#overview" })).toBeInTheDocument();
    expect(within(evidenceRefs).getByText("architecture.md")).toBeInTheDocument();
    expect(within(evidenceRefs).getAllByText("architecture.md#overview")).toHaveLength(1);
    expect(screen.getAllByText("建议").find((element) => element.classList.contains("status-pill"))).toBeTruthy();

    fireEvent.click(within(evidenceRefs).getByRole("button", { name: "打开证据来源 architecture.md#overview" }));
    expect(onOpenEvidenceRef).toHaveBeenCalledWith("architecture.md#overview");

    fireEvent.click(screen.getByRole("button", { name: "接受所选关系" }));
    expect(onReview).toHaveBeenCalledWith(7, "accepted");
  });

  it("renders read-only structural edges", () => {
    const structuralEdge: GraphEdge = {
      ...evidenceEdge,
      id: 12,
      edge_type: "contains_field",
      status: "auto_trusted",
      created_from_suggestion_id: null,
      evidence_summary: null,
      evidence_payload: null
    };
    render(
      <EvidenceInspector
        onReview={vi.fn()}
        selection={{ kind: "edge", edge: structuralEdge, sourceNode, targetNode }}
        suggestions={[]}
      />
    );

    expect(screen.getByText("包含字段")).toBeInTheDocument();
    expect(
      screen.getByText("这是从导入表格结构中识别出的关系。")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "接受所选关系" })
    ).not.toBeInTheDocument();
  });

  it("renders node details when a node is selected", () => {
    const onExplainSelection = vi.fn();
    const onAskPathAction = vi.fn();
    render(
      <EvidenceInspector
        onAskPathAction={onAskPathAction}
        onExplainSelection={onExplainSelection}
        onReview={vi.fn()}
        pathSummary={{
          actionHints: ["review_pending", "validate_foreign_key"],
          confidence: null,
          downstreamCount: 1,
          edgeStatus: null,
          evidenceRefs: ["field:orders.customer_id", "suggestion:7"],
          impactLabels: ["Orders", "Customers.customer_id"],
          pendingCount: 1,
          pathNodeLabels: ["Orders.customer_id", "Orders", "Customers.customer_id"],
          relationshipTypes: ["contains_field", "foreign_key"],
          sourceLabel: null,
          targetLabel: null,
          upstreamCount: 1
        }}
        selection={{ kind: "node", node: sourceNode, adjacentEdges: [evidenceEdge] }}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("heading", { name: "节点详情" })).toBeInTheDocument();
    expect(screen.getByText("字段")).toBeInTheDocument();
    expect(screen.getByText("orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("相邻关系：1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "路径摘要" })).toBeInTheDocument();
    expect(screen.getByText("上游 1")).toBeInTheDocument();
    expect(screen.getByText("下游 1")).toBeInTheDocument();
    expect(screen.getByText("待审核 1")).toBeInTheDocument();
    expect(screen.getByText("影响范围")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("Customers.customer_id")).toBeInTheDocument();
    expect(screen.getByText("证据引用")).toBeInTheDocument();
    expect(screen.getByText("suggestion:7")).toBeInTheDocument();
    expect(screen.getByText("操作建议")).toBeInTheDocument();
    expect(screen.getByText("优先审核待确认关系")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "让 AI 分析：优先审核待确认关系" }));
    expect(onAskPathAction).toHaveBeenCalledWith("review_pending");

    fireEvent.click(screen.getByRole("button", { name: "解释当前节点" }));
    expect(onExplainSelection).toHaveBeenCalledTimes(1);
  });

  it("renders edge path summary and explain shortcut", () => {
    const onExplainSelection = vi.fn();
    const onAskPathAction = vi.fn();
    render(
      <EvidenceInspector
        onAskPathAction={onAskPathAction}
        onExplainSelection={onExplainSelection}
        onReview={vi.fn()}
        pathSummary={{
          actionHints: ["review_pending", "validate_foreign_key"],
          confidence: 0.94,
          downstreamCount: 0,
          edgeStatus: "suggested",
          evidenceRefs: ["suggestion:7"],
          impactLabels: ["Orders.customer_id", "Customers.customer_id"],
          pendingCount: 1,
          pathNodeLabels: ["Orders.customer_id", "Customers.customer_id"],
          relationshipTypes: ["foreign_key"],
          sourceLabel: "Orders.customer_id",
          targetLabel: "Customers.customer_id",
          upstreamCount: 0
        }}
        selection={{ kind: "edge", edge: evidenceEdge, sourceNode, targetNode }}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("heading", { name: "路径摘要" })).toBeInTheDocument();
    expect(screen.getByText("关系外键")).toBeInTheDocument();
    expect(screen.getByText("置信度 94%")).toBeInTheDocument();
    expect(screen.getByText("路径节点")).toBeInTheDocument();
    expect(screen.getByText("Orders.customer_id → Customers.customer_id")).toBeInTheDocument();
    expect(screen.getByText("核验外键字段的唯一性和覆盖率")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "让 AI 分析：核验外键字段的唯一性和覆盖率" }));
    expect(onAskPathAction).toHaveBeenCalledWith("validate_foreign_key");

    fireEvent.click(screen.getByRole("button", { name: "解释当前关系" }));
    expect(onExplainSelection).toHaveBeenCalledTimes(1);
  });

  it("renders empty state without selection", () => {
    render(<EvidenceInspector onReview={vi.fn()} selection={null} suggestions={[]} />);

    expect(
      screen.getByText("选择一个节点或关系来查看证据。")
    ).toBeInTheDocument();
  });
});
