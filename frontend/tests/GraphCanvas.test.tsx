import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphResponse } from "../src/api/types";
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
      metadata: { aggregate_count: 2, inferred_type: "string", key_candidate_score: 0.91 },
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
      node_type: "derived_entity",
      label: "customer_id values",
      source_ref: "Orders.customer_id",
      metadata: { unique_count: 2 },
      position_x: 620,
      position_y: 180
    },
    {
      id: 5,
      node_type: "field",
      label: "Products.product_code",
      source_ref: "products.product_code",
      metadata: { inferred_type: "string", key_candidate_score: 0.87 },
      position_x: 80,
      position_y: 320
    },
    {
      id: 6,
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
    },
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
      source_node_id: 2,
      target_node_id: 4,
      edge_type: "derived_dimension",
      confidence: 0.76,
      status: "suggested",
      evidence_ref: "suggestion:1",
      created_from_suggestion_id: 8,
      metadata: {},
      evidence_summary: "Can be explored as a dimension.",
      evidence_payload: { unique_count: 2 }
    },
    {
      id: 13,
      source_node_id: 5,
      target_node_id: 6,
      edge_type: "derived_dimension",
      confidence: 0.72,
      status: "suggested",
      evidence_ref: "suggestion:2",
      created_from_suggestion_id: 9,
      metadata: {},
      evidence_summary: "Product codes can be explored as a dimension.",
      evidence_payload: { unique_count: 3 }
    }
  ]
};

describe("GraphCanvas", () => {
  it("shows an actionable empty state for first graph onboarding", () => {
    render(<GraphCanvas graph={{ nodes: [], edges: [] }} />);

    const emptyState = screen.getByRole("region", { name: "首图引导" });
    expect(within(emptyState).getByRole("heading", { name: "选择来源后生成第一张图谱" })).toBeInTheDocument();
    expect(within(emptyState).getByText("表格关系")).toBeInTheDocument();
    expect(within(emptyState).getByText("文档知识")).toBeInTheDocument();
    expect(within(emptyState).getByText("代码依赖")).toBeInTheDocument();
    expect(within(emptyState).getByText("URL 内容")).toBeInTheDocument();
  });

  it("renders professional semantic nodes and graph controls", () => {
    render(<GraphCanvas graph={graph} highlightedGraphPath={[11]} toolsDefaultOpen={false} />);

    expect(screen.getByRole("heading", { name: "关系图谱" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开图谱工具" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "关系分析" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "可见关系" })).not.toBeInTheDocument();

    const drawer = openAnalysisDrawer();

    expect(within(drawer).getByRole("group", { name: "可见关系" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开图谱工具" }));

    expect(screen.getByRole("button", { name: "收起图谱工具" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关系分析" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "表" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "字段" })).not.toHaveClass("active");
    expect(screen.getByLabelText("建议")).toBeChecked();
    expect(screen.getByLabelText("已拒绝")).not.toBeChecked();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("3 行 · 2 个字段")).toBeInTheDocument();
    expect(screen.getByText("Orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("string · 键候选 91%")).toBeInTheDocument();
    expect(screen.getByText("聚合 2")).toBeInTheDocument();
    expect(screen.getByText("Orders").closest(".semantic-node")).toHaveClass("semantic-node-table");
    expect(screen.getByText("Orders.customer_id").closest(".semantic-node")).toHaveClass(
      "semantic-node-field"
    );
  });

  it("renders a minimap navigation surface for dense graphs", () => {
    render(<GraphCanvas graph={graph} />);

    expect(screen.getByRole("img", { name: "图谱小地图" })).toBeInTheDocument();
  });

  it("filters edges by status and confidence threshold", () => {
    render(<GraphCanvas graph={graph} />);

    const relationships = getRelationshipShelf();
    expect(within(relationships).getByText("外键 · 94% · 建议 · 聚合 2")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("建议"));
    expect(within(relationships).queryByText("外键 · 94% · 建议 · 聚合 2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("建议"));
    fireEvent.change(screen.getByLabelText("最低置信度"), {
      target: { value: "0.95" }
    });
    expect(within(relationships).queryByText("外键 · 94% · 建议 · 聚合 2")).not.toBeInTheDocument();
    fireEvent.click(within(relationships).getByRole("button", { name: "展开结构字段" }));
    expect(within(relationships).getByText("包含字段 · 100% · 自动可信")).toBeInTheDocument();
  });

  it("toggles relationship visibility from the graph legend", () => {
    render(<GraphCanvas graph={graph} />);

    const relationships = getRelationshipShelf();
    expect(within(relationships).getByText("外键 · 94% · 建议 · 聚合 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "切换外键关系" }));

    expect(within(relationships).queryByText("外键 · 94% · 建议 · 聚合 2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "切换外键关系" }));

    expect(within(relationships).getByText("外键 · 94% · 建议 · 聚合 2")).toBeInTheDocument();
  });

  it("shows visible relationship counts in the graph legend", () => {
    render(<GraphCanvas graph={graph} />);

    expect(screen.getByRole("button", { name: "切换外键关系" })).toHaveTextContent("外键1");
    expect(screen.getByRole("button", { name: "切换维度关系" })).toHaveTextContent("维度2");
    expect(screen.getByRole("button", { name: "切换包含关系" })).toHaveTextContent("包含1");
    expect(screen.getByRole("button", { name: "切换建议关系" })).toHaveTextContent("建议3");

    fireEvent.click(screen.getByRole("button", { name: "切换外键关系" }));

    expect(screen.getByRole("button", { name: "切换外键关系" })).toHaveTextContent("外键0");
  });

  it("resets graph filters from the toolbar", () => {
    render(<GraphCanvas graph={graph} />);

    const relationships = getRelationshipShelf();
    fireEvent.click(screen.getByRole("button", { name: "切换外键关系" }));

    expect(within(relationships).queryByText("外键 · 94% · 建议 · 聚合 2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));

    expect(within(relationships).getByText("外键 · 94% · 建议 · 聚合 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换外键关系" })).toHaveTextContent("外键1");
  });

  it("switches professional layout presets from the toolbar", () => {
    render(<GraphCanvas graph={graph} />);

    fireEvent.click(screen.getByRole("button", { name: "字段优先" }));

    expect(screen.getByRole("button", { name: "字段优先" })).toHaveClass("active");
    expect(screen.getByText("当前布局：字段优先")).toBeInTheDocument();
  });

  it("hides and restores the selected graph item", () => {
    render(
      <GraphCanvas
        graph={graph}
        selectedItem={{
          kind: "node",
          node: graph.nodes[1],
          adjacentEdges: [graph.edges[0], graph.edges[1], graph.edges[2]]
        }}
      />
    );

    expect(screen.getAllByText("Orders.customer_id").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "隐藏选中项" }));

    expect(screen.queryAllByText("Orders.customer_id")).toHaveLength(0);
    expect(screen.getByText("已隐藏：1 个节点 · 0 条关系")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "恢复隐藏项" }));

    expect(screen.getAllByText("Orders.customer_id").length).toBeGreaterThan(0);
  });

  it("saves and reapplies graph view snapshots", () => {
    render(<GraphCanvas graph={graph} />);

    fireEvent.click(screen.getByRole("button", { name: "字段" }));
    fireEvent.change(screen.getByLabelText("最低置信度"), {
      target: { value: "0.8" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存当前视图快照" }));

    fireEvent.click(screen.getByRole("button", { name: "关系分析" }));
    fireEvent.change(screen.getByLabelText("最低置信度"), {
      target: { value: "0" }
    });
    fireEvent.click(screen.getByRole("button", { name: "应用快照 快照 1" }));

    expect(screen.getByRole("button", { name: "字段" })).toHaveClass("active");
    expect(screen.getByLabelText("最低置信度")).toHaveValue("0.8");
  });

  it("exports the current visible graph as JSON", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => "blob:graphmind-export");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });

    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "a") {
        element.click = click;
      }
      return element;
    });

    render(<GraphCanvas graph={graph} />);

    fireEvent.click(screen.getByRole("button", { name: "导出当前图谱 JSON" }));

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:graphmind-export");

    createElement.mockRestore();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL
    });
  });

  it("exports the current visible graph as SVG and GraphML", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => "blob:graphmind-export");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });

    const click = vi.fn();
    const downloads: string[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "a") {
        Object.defineProperty(element, "download", {
          configurable: true,
          get: () => downloads[downloads.length - 1] ?? "",
          set: (value: string) => downloads.push(value)
        });
        element.click = click;
      }
      return element;
    });

    render(<GraphCanvas graph={graph} />);

    fireEvent.click(screen.getByRole("button", { name: "导出 SVG" }));
    fireEvent.click(screen.getByRole("button", { name: "导出 GraphML" }));

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
    expect(downloads.some((download) => download.endsWith(".svg"))).toBe(true);
    expect(downloads.some((download) => download.endsWith(".graphml"))).toBe(true);

    createElement.mockRestore();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL
    });
  });

  it("falls back to SVG export when PNG canvas capture is unavailable", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => "blob:graphmind-export");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });

    const click = vi.fn();
    const downloads: string[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === "a") {
        Object.defineProperty(element, "download", {
          configurable: true,
          get: () => downloads[downloads.length - 1] ?? "",
          set: (value: string) => downloads.push(value)
        });
        element.click = click;
      }
      return element;
    });

    render(<GraphCanvas graph={graph} />);

    fireEvent.click(screen.getByRole("button", { name: "导出 PNG" }));

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(downloads.some((download) => download.endsWith(".svg"))).toBe(true);

    createElement.mockRestore();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectURL
    });
  });

  it("shows an empty state when relationship filters hide every edge", () => {
    render(<GraphCanvas graph={graph} />);

    const relationships = getRelationshipShelf();

    fireEvent.click(screen.getByRole("button", { name: "切换外键关系" }));
    fireEvent.click(screen.getByRole("button", { name: "切换维度关系" }));
    fireEvent.click(screen.getByRole("button", { name: "切换包含关系" }));

    expect(within(relationships).getByText("当前筛选下没有可见关系")).toBeInTheDocument();
    expect(within(relationships).getByText("重置筛选可恢复默认图谱视图。")).toBeInTheDocument();
  });

  it("shows relationship endpoints in the relationship shelf", () => {
    render(<GraphCanvas graph={graph} />);

    const relationships = getRelationshipShelf();

    expect(
      within(relationships).getByText("Orders.customer_id → Customers.customer_id")
    ).toBeInTheDocument();
    expect(within(relationships).getByText("外键 · 94% · 建议 · 聚合 2")).toBeInTheDocument();
  });

  it("prioritizes analytical relationships before structural field containment in the relationship shelf", () => {
    render(<GraphCanvas graph={graph} />);

    const relationshipButtons = Array.from(getRelationshipShelf().querySelectorAll(".edge-summary-card"));

    expect(relationshipButtons.map((button) => button.textContent)).toEqual([
      "Orders.customer_id → Customers.customer_id外键 · 94% · 建议 · 聚合 2",
      "Orders.customer_id → customer_id values派生维度 · 76% · 建议",
      "Products.product_code → product_code values派生维度 · 72% · 建议"
    ]);
  });

  it("groups visible relationships by analysis role and keeps structural fields collapsed", () => {
    render(<GraphCanvas graph={graph} />);

    const relationships = getRelationshipShelf();
    const foreignKeyGroup = within(relationships).getByRole("group", { name: "外键关系" });
    const dimensionGroup = within(relationships).getByRole("group", { name: "派生维度" });
    const structuralGroup = within(relationships).getByRole("group", { name: "结构字段" });

    expect(within(foreignKeyGroup).getByText("1 条")).toBeInTheDocument();
    expect(within(foreignKeyGroup).getByText("待审核 1")).toBeInTheDocument();
    expect(
      within(foreignKeyGroup).getByText("Orders.customer_id → Customers.customer_id")
    ).toBeInTheDocument();
    expect(within(dimensionGroup).getByText("待审核 2")).toBeInTheDocument();
    expect(within(structuralGroup).queryByText("Orders → Orders.customer_id")).not.toBeInTheDocument();

    fireEvent.click(within(structuralGroup).getByRole("button", { name: "展开结构字段" }));

    expect(within(structuralGroup).getByText("Orders → Orders.customer_id")).toBeInTheDocument();
  });

  it("previews relationship endpoints and edge when hovering a relationship shelf item", () => {
    const { container } = render(<GraphCanvas graph={graph} />);

    const relationships = getRelationshipShelf();
    const relationshipButton = within(relationships).getByRole("button", {
      name: "Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 聚合 2"
    });

    fireEvent.mouseEnter(relationshipButton);

    expect(relationshipButton).toHaveClass("is-previewed");
    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass("is-highlighted");
    expect(getSemanticNodeByText("Customers.customer_id")).toHaveClass("is-highlighted");

    fireEvent.mouseLeave(relationshipButton);

    expect(relationshipButton).not.toHaveClass("is-previewed");
    expect(getSemanticNodeByText("Orders.customer_id")).not.toHaveClass("is-highlighted");
    expect(getSemanticNodeByText("Customers.customer_id")).not.toHaveClass("is-highlighted");

    fireEvent.focus(relationshipButton);

    expect(relationshipButton).toHaveClass("is-previewed");
    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass("is-highlighted");
    expect(getSemanticNodeByText("Customers.customer_id")).toHaveClass("is-highlighted");

    fireEvent.blur(relationshipButton);

    expect(relationshipButton).not.toHaveClass("is-previewed");
  });

  it("filters the relationship shelf to strong relationships", () => {
    render(<GraphCanvas graph={graph} />);

    const relationships = getRelationshipShelf();
    expect(within(relationships).getByText("派生维度 · 76% · 建议")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "强关系" }));

    expect(within(relationships).getByText("外键 · 94% · 建议 · 聚合 2")).toBeInTheDocument();
    fireEvent.click(within(relationships).getByRole("button", { name: "展开结构字段" }));
    expect(within(relationships).getByText("包含字段 · 100% · 自动可信")).toBeInTheDocument();
    expect(within(relationships).queryByText("派生维度 · 76% · 建议")).not.toBeInTheDocument();
  });

  it("disables path exploration controls without a selected node", () => {
    render(<GraphCanvas graph={graph} />);

    expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "一跳" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "两跳" })).toBeDisabled();
  });

  it("changes path exploration mode for a selected node", () => {
    const onExplorationModeChange = vi.fn();
    render(
      <GraphCanvas
        canExploreSelection
        explorationMode="off"
        graph={graph}
        onExplorationModeChange={onExplorationModeChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "一跳" }));

    expect(onExplorationModeChange).toHaveBeenCalledWith("one_hop");
  });

  it("summarizes table relationship and key field metrics", () => {
    render(<GraphCanvas graph={graph} />);

    const ordersNode = screen.getByText("Orders").closest(".semantic-node");
    expect(ordersNode).not.toBeNull();
    expect(within(ordersNode as HTMLElement).getByText("关联 2")).toBeInTheDocument();
    expect(within(ordersNode as HTMLElement).getByText("关键字段 1")).toBeInTheDocument();
  });

  it("notifies when a node or edge is selected", () => {
    const onSelectionChange = vi.fn();
    render(<GraphCanvas graph={graph} onSelectionChange={onSelectionChange} />);

    fireEvent.click(screen.getByText("Orders.customer_id"));
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "node" }));

    fireEvent.click(
      within(getRelationshipShelf()).getByText(
        "外键 · 94% · 建议 · 聚合 2"
      )
    );
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ kind: "edge" }));
  });

  it("highlights both endpoint nodes for the selected relationship", () => {
    render(
      <GraphCanvas
        graph={graph}
        selectedItem={{
          kind: "edge",
          edge: graph.edges[1],
          sourceNode: graph.nodes[1],
          targetNode: graph.nodes[2]
        }}
      />
    );

    expect(screen.getByText("Orders.customer_id").closest(".semantic-node")).toHaveClass(
      "is-highlighted"
    );
    expect(screen.getByText("Customers.customer_id").closest(".semantic-node")).toHaveClass(
      "is-highlighted"
    );
  });

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

    const selectedGraphNode = screen
      .getAllByText("Orders.customer_id")
      .map((element) => element.closest(".react-flow__node"))
      .find((element): element is Element => element !== null);

    expect(selectedGraphNode?.querySelector(".semantic-node")).toHaveClass("semantic-node-field");
    expect(selectedGraphNode).toHaveClass("is-selected");
  });

  it("emphasizes selected node neighborhoods and dims unrelated graph items", () => {
    render(
      <GraphCanvas
        canExploreSelection
        explorationMode="one_hop"
        graph={graph}
        selectedItem={{
          kind: "node",
          node: graph.nodes[1],
          adjacentEdges: [graph.edges[0], graph.edges[1], graph.edges[2]]
        }}
      />
    );

    const selectedGraphNode = getReactFlowNodeByText("Orders.customer_id");
    const adjacentGraphNode = getReactFlowNodeByText("Customers.customer_id");
    const outsideGraphNode = getReactFlowNodeByText("Products.product_code");

    expect(selectedGraphNode).toHaveClass("is-selected");
    expect(adjacentGraphNode).toHaveClass("is-neighborhood");
    expect(outsideGraphNode).toHaveClass("is-dimmed");
  });

  it("shows a graph neighborhood summary while exploring a selected node", () => {
    render(
      <GraphCanvas
        canExploreSelection
        explorationMode="one_hop"
        graph={graph}
        selectedItem={{
          kind: "node",
          node: graph.nodes[1],
          adjacentEdges: [graph.edges[0], graph.edges[1], graph.edges[2]]
        }}
      />
    );

    const summary = getNeighborhoodSummary();

    expect(within(summary).getByText("一跳")).toBeInTheDocument();
    expect(within(summary).getByText("4 个节点")).toBeInTheDocument();
    expect(within(summary).getByText("3 条关系")).toBeInTheDocument();
    expect(within(summary).getByText("待审核 2")).toBeInTheDocument();
  });

  it("shows an AI evidence path summary for highlighted graph paths", () => {
    render(<GraphCanvas graph={graph} highlightedGraphPath={[2, 3, 11]} />);

    const summary = getAiPathSummary();
    const segment = within(summary).getByRole("button", {
      name: "查看路径片段 Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 聚合 2 · 强度 强 · 证据 suggestion:0"
    });

    expect(within(segment).getByText("Orders.customer_id → Customers.customer_id")).toBeInTheDocument();
    expect(within(segment).getByText("外键 · 94% · 建议 · 聚合 2")).toBeInTheDocument();
    expect(within(segment).getByText("强度 强")).toHaveClass("path-evidence-chip");
    expect(within(segment).getByText("证据 suggestion:0")).toHaveClass("path-evidence-chip");
    expect(within(summary).getByText("2 个节点")).toBeInTheDocument();
    expect(within(summary).getByText("1 条关系")).toBeInTheDocument();
    expect(within(summary).getByText("待审核 1")).toBeInTheDocument();
    expect(within(summary).getByText("强证据")).toBeInTheDocument();
  });

  it("notifies when an AI evidence path relationship segment is selected", () => {
    const onSelectionChange = vi.fn();
    render(
      <GraphCanvas
        graph={graph}
        highlightedGraphPath={[2, 3, 11]}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.click(
      within(getAiPathSummary()).getByRole("button", {
        name: "查看路径片段 Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 聚合 2 · 强度 强 · 证据 suggestion:0"
      })
    );

    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        edge: graph.edges[1],
        kind: "edge"
      })
    );
  });

  it("marks the selected AI evidence path segment", () => {
    render(
      <GraphCanvas
        graph={graph}
        highlightedGraphPath={[2, 3, 11]}
        selectedItem={{
          kind: "edge",
          edge: graph.edges[1],
          sourceNode: graph.nodes[1],
          targetNode: graph.nodes[2]
        }}
      />
    );

    expect(
      within(getAiPathSummary()).getByRole("button", {
        name: "查看路径片段 Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 聚合 2 · 强度 强 · 证据 suggestion:0"
      })
    ).toHaveClass("is-current");
  });

  it("previews graph endpoints when hovering an AI evidence path segment", () => {
    render(<GraphCanvas graph={graph} highlightedGraphPath={[2, 3, 11]} />);

    const segment = within(getAiPathSummary()).getByRole(
      "button",
      {
        name: "查看路径片段 Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 聚合 2 · 强度 强 · 证据 suggestion:0"
      }
    );

    fireEvent.mouseEnter(segment);

    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass("is-highlighted");
    expect(getSemanticNodeByText("Customers.customer_id")).toHaveClass("is-highlighted");
    expect(
      within(getRelationshipShelf()).getByRole("button", {
        name: "Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 聚合 2"
      })
    ).toHaveClass("is-previewed");

    fireEvent.mouseLeave(segment);

    expect(
      within(getRelationshipShelf()).getByRole("button", {
        name: "Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 聚合 2"
      })
    ).not.toHaveClass("is-previewed");
  });

  it("shows AI evidence path navigation controls for multi-segment paths", () => {
    render(<GraphCanvas graph={graph} highlightedGraphPath={[2, 3, 11, 12]} />);

    const summary = getAiPathSummary();

    expect(within(summary).getByRole("button", { name: "上一段路径" })).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "下一段路径" })).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "聚焦完整路径" })).toBeInTheDocument();
  });

  it("numbers AI evidence path segments only when multiple segments are visible", () => {
    render(<GraphCanvas graph={graph} highlightedGraphPath={[2, 3, 11, 12]} />);

    const summary = getAiPathSummary();
    const firstSegment = within(summary).getByRole("button", {
      name: "查看路径片段 Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 聚合 2 · 强度 强 · 证据 suggestion:0"
    });
    const secondSegment = within(summary).getByRole("button", {
      name: "查看路径片段 Orders.customer_id → customer_id values · 派生维度 · 76% · 建议 · 强度 可能 · 证据 suggestion:1"
    });

    expect(within(firstSegment).getByText("1/2")).toHaveClass("path-segment-index");
    expect(within(secondSegment).getByText("2/2")).toHaveClass("path-segment-index");
  });

  it("does not add a segment number for single-segment AI evidence paths", () => {
    render(<GraphCanvas graph={graph} highlightedGraphPath={[2, 3, 11]} />);

    const summary = getAiPathSummary();

    expect(within(summary).queryByText("1/1")).not.toBeInTheDocument();
  });

  it("shows the current AI evidence path segment position", () => {
    const { rerender } = render(<GraphCanvas graph={graph} highlightedGraphPath={[2, 3, 11, 12]} />);

    expect(
      within(getAiPathSummary()).getByText("当前 1/2")
    ).toHaveClass("path-current-position");

    rerender(
      <GraphCanvas
        graph={graph}
        highlightedGraphPath={[2, 3, 11, 12]}
        selectedItem={{
          kind: "edge",
          edge: graph.edges[2],
          sourceNode: graph.nodes[1],
          targetNode: graph.nodes[3]
        }}
      />
    );

    expect(
      within(getAiPathSummary()).getByText("当前 2/2")
    ).toHaveClass("path-current-position");
  });

  it("cycles the selected AI evidence path segment with navigation controls", () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <GraphCanvas
        graph={graph}
        highlightedGraphPath={[2, 3, 11, 12]}
        onSelectionChange={onSelectionChange}
        selectedItem={{
          kind: "edge",
          edge: graph.edges[1],
          sourceNode: graph.nodes[1],
          targetNode: graph.nodes[2]
        }}
      />
    );

    const summary = getAiPathSummary();

    fireEvent.click(within(summary).getByRole("button", { name: "下一段路径" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        edge: graph.edges[2],
        kind: "edge"
      })
    );

    rerender(
      <GraphCanvas
        graph={graph}
        highlightedGraphPath={[2, 3, 11, 12]}
        onSelectionChange={onSelectionChange}
        selectedItem={{
          kind: "edge",
          edge: graph.edges[2],
          sourceNode: graph.nodes[1],
          targetNode: graph.nodes[3]
        }}
      />
    );

    fireEvent.click(within(summary).getByRole("button", { name: "上一段路径" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        edge: graph.edges[1],
        kind: "edge"
      })
    );
  });

  it("syncs neighborhood emphasis into the visible relationship shelf", () => {
    render(
      <GraphCanvas
        canExploreSelection
        explorationMode="one_hop"
        graph={graph}
        selectedItem={{
          kind: "node",
          node: graph.nodes[1],
          adjacentEdges: [graph.edges[0], graph.edges[1], graph.edges[2]]
        }}
      />
    );

    const relationships = getRelationshipShelf();
    const foreignKeyCard = within(relationships).getByRole("button", {
      name: "Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 聚合 2"
    });
    const relatedDimensionCard = within(relationships).getByRole("button", {
      name: "Orders.customer_id → customer_id values · 派生维度 · 76% · 建议"
    });
    const unrelatedDimensionCard = within(relationships).getByRole("button", {
      name: "Products.product_code → product_code values · 派生维度 · 72% · 建议"
    });

    expect(foreignKeyCard).toHaveClass("is-neighborhood");
    expect(relatedDimensionCard).toHaveClass("is-neighborhood");
    expect(unrelatedDimensionCard).toHaveClass("is-dimmed");
  });

  it("highlights the shortest path between two selected graph nodes", () => {
    render(<GraphCanvas graph={graph} />);

    fireEvent.click(screen.getByText("Orders"));
    fireEvent.click(screen.getByText("Customers.customer_id"));
    fireEvent.click(screen.getByRole("button", { name: "高亮最短路径" }));

    expect(screen.getByText("路径 2 段")).toBeInTheDocument();
    expect(getReactFlowNodeByText("Orders")).toHaveClass("is-path-analysis");
    expect(getReactFlowNodeByText("Orders.customer_id")).toHaveClass("is-path-analysis");
    expect(getReactFlowNodeByText("Customers.customer_id")).toHaveClass("is-path-analysis");
  });

  it("builds a field lineage path from selected field nodes", () => {
    render(<GraphCanvas graph={graph} />);

    fireEvent.click(screen.getByText("Orders.customer_id"));
    fireEvent.click(screen.getByText("Customers.customer_id"));
    fireEvent.click(screen.getByRole("button", { name: "字段血缘路径" }));

    const summary = getPathAnalysisSummary();

    expect(within(summary).getByText("字段血缘")).toBeInTheDocument();
    expect(within(summary).getByText("3 个节点")).toBeInTheDocument();
    expect(within(summary).getByText("2 条关系")).toBeInTheDocument();
  });

  it("shows relationship strength layers for the visible graph", () => {
    render(<GraphCanvas graph={graph} />);

    const layers = screen.getByRole("group", { name: "关系强度分层" });

    expect(within(layers).getByText("强")).toBeInTheDocument();
    expect(within(layers).getAllByText("2 条")).toHaveLength(2);
    expect(within(layers).getByText("可能")).toBeInTheDocument();
  });

  it("switches to the experimental 3D graph view without replacing the default 2D mode", async () => {
    render(<GraphCanvas graph={graph} />);

    expect(screen.getByRole("button", { name: "2D 图谱" })).toHaveClass("active");
    fireEvent.click(screen.getByRole("button", { name: "3D 实验视图" }));

    expect(screen.getByRole("button", { name: "3D 实验视图" })).toHaveClass("active");
    expect(screen.getByRole("status", { name: "3D 图谱加载状态" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "3D 图谱实验视图" })).toBeInTheDocument()
    );
    expect(screen.getByLabelText("3D 图谱画布")).toBeInTheDocument();
  });

  it("shows a large-graph performance guard with cluster summaries", () => {
    const largeGraph = createLargeGraph(46);

    render(<GraphCanvas graph={largeGraph} />);

    const guard = screen.getByRole("status", { name: "大图谱性能保护" });

    expect(within(guard).getByText("已启用大图谱保护")).toBeInTheDocument();
    expect(within(guard).getByText("表 16")).toBeInTheDocument();
    expect(within(guard).getByText("字段 15")).toBeInTheDocument();
    expect(within(guard).getByText("维度 15")).toBeInTheDocument();
  });

  it("windows large relationship shelves to protect the rendering budget", () => {
    const largeGraph = createLargeGraph(80);

    render(<GraphCanvas graph={largeGraph} />);

    const relationships = getRelationshipShelf();
    const foreignKeyGroup = within(relationships).getByRole("group", { name: "外键关系" });

    expect(within(foreignKeyGroup).getByText("已显示 12/40")).toBeInTheDocument();
    expect(foreignKeyGroup.querySelectorAll(".edge-summary-card")).toHaveLength(12);

    fireEvent.click(within(foreignKeyGroup).getByRole("button", { name: "显示更多外键关系" }));

    expect(within(foreignKeyGroup).getByText("已显示 24/40")).toBeInTheDocument();
    expect(foreignKeyGroup.querySelectorAll(".edge-summary-card")).toHaveLength(24);
  });

  it("delegates large graph layout calculation to a worker when available", async () => {
    const largeGraph = createLargeGraph(80);
    const originalWorker = globalThis.Worker;
    const postMessage = vi.fn();
    const terminate = vi.fn();

    class LayoutWorkerStub {
      onmessage: ((event: MessageEvent) => void) | null = null;

      postMessage(message: unknown) {
        postMessage(message);
      }

      terminate() {
        terminate();
      }
    }

    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: LayoutWorkerStub
    });

    try {
      render(<GraphCanvas graph={largeGraph} />);

      await waitFor(() =>
        expect(postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            graph: expect.objectContaining({
              edges: expect.arrayContaining([expect.objectContaining({ id: 100 })]),
              nodes: expect.arrayContaining([expect.objectContaining({ id: 1 })])
            }),
            layoutPreset: "semantic"
          })
        )
      );
    } finally {
      Object.defineProperty(globalThis, "Worker", {
        configurable: true,
        value: originalWorker
      });
    }
  });
});

function getSemanticNodeByText(text: string): HTMLElement {
  const node = screen
    .getAllByText(text)
    .map((element) => element.closest(".semantic-node"))
    .find((element): element is HTMLElement => element !== null);
  if (!node) {
    throw new Error(`No semantic node found for ${text}`);
  }
  return node;
}

function getReactFlowNodeByText(text: string): Element {
  const node = screen
    .getAllByText(text)
    .map((element) => element.closest(".react-flow__node"))
    .find((element): element is Element => element !== null);
  if (!node) {
    throw new Error(`No React Flow node found for ${text}`);
  }
  return node;
}

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

function getNeighborhoodSummary(): HTMLElement {
  return within(getAnalysisDrawer()).getByRole("status", { name: "邻域摘要" });
}

function getAiPathSummary(): HTMLElement {
  return within(getAnalysisDrawer()).getByRole("status", { name: "AI 证据路径" });
}

function getPathAnalysisSummary(): HTMLElement {
  return within(getAnalysisDrawer()).getByRole("status", { name: "路径分析结果" });
}

function createLargeGraph(count: number): GraphResponse {
  const nodes = Array.from({ length: count }, (_, index) => {
    const nodeType = index % 3 === 0 ? "table" : index % 3 === 1 ? "field" : "derived_entity";
    return {
      id: index + 1,
      node_type: nodeType,
      label: `${nodeType}-${index + 1}`,
      source_ref: `${nodeType}-${index + 1}`,
      metadata: {},
      position_x: 0,
      position_y: 0
    } satisfies GraphResponse["nodes"][number];
  });
  const edges = nodes.slice(1).map((node, index) => ({
    id: index + 100,
    source_node_id: nodes[index].id,
    target_node_id: node.id,
    edge_type: index % 2 === 0 ? "foreign_key" : "derived_dimension",
    confidence: index % 2 === 0 ? 0.92 : 0.72,
    status: "suggested",
    evidence_ref: `large:${index}`,
    created_from_suggestion_id: index,
    metadata: {},
    evidence_summary: null,
    evidence_payload: null
  })) satisfies GraphResponse["edges"];

  return { edges, nodes };
}
