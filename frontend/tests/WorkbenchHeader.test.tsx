import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
    },
    {
      id: 3,
      node_type: "field",
      label: "Customers.customer_id",
      source_ref: "customers.customer_id",
      metadata: {},
      position_x: 0,
      position_y: 240
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
    evidence_summary: "建议 dimension.",
    evidence_payload: {},
    decision_status: "pending"
  }
];

describe("WorkbenchHeader", () => {
  it("renders brand, graph summary, and search results", () => {
    const onSelectNode = vi.fn();
    render(<WorkbenchHeader graph={graph} suggestions={suggestions} onSelectNode={onSelectNode} />);

    expect(screen.getByRole("heading", { name: "GraphMind" })).toBeInTheDocument();
    expect(screen.getByText("3 个节点 · 1 条边 · 1 条待审核")).toBeInTheDocument();
    expect(screen.queryByLabelText("搜索")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    fireEvent.change(screen.getByLabelText("搜索"), {
      target: { value: "customer" }
    });

    const firstSearchResult = screen.getByRole("option", { name: "选择 Orders.customer_id" });
    expect(within(firstSearchResult).getByText("Orders.customer_id")).toBeInTheDocument();
    expect(within(firstSearchResult).getByText("字段")).toBeInTheDocument();
    expect(within(firstSearchResult).getByText("orders.customer_id")).toBeInTheDocument();

    fireEvent.click(firstSearchResult);
    expect(onSelectNode).toHaveBeenCalledWith(graph.nodes[1]);
  });

  it("renders an empty search result state", () => {
    render(<WorkbenchHeader graph={graph} suggestions={[]} onSelectNode={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    fireEvent.change(screen.getByLabelText("搜索"), {
      target: { value: "missing" }
    });

    expect(screen.getByText("没有匹配的图谱项目")).toBeInTheDocument();
  });

  it("supports arrow and Home/End keyboard navigation for module tabs", () => {
    const onModuleChange = vi.fn();
    render(
      <WorkbenchHeader
        activeModule="graph"
        graph={graph}
        onModuleChange={onModuleChange}
        onSelectNode={vi.fn()}
        suggestions={suggestions}
      />
    );

    const graphTab = screen.getByRole("tab", { name: "图谱" });

    fireEvent.keyDown(graphTab, { key: "ArrowRight" });
    expect(onModuleChange).toHaveBeenLastCalledWith("data");
    expect(screen.getByRole("tab", { name: "数据" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("tab", { name: "数据" }), { key: "End" });
    expect(onModuleChange).toHaveBeenLastCalledWith("insights");
    expect(screen.getByRole("tab", { name: "洞察" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("tab", { name: "洞察" }), { key: "Home" });
    expect(onModuleChange).toHaveBeenLastCalledWith("graph");
    expect(graphTab).toHaveFocus();
  });

  it("supports keyboard navigation and Escape focus restore in search", () => {
    const onSelectNode = vi.fn();
    render(<WorkbenchHeader graph={graph} suggestions={suggestions} onSelectNode={onSelectNode} />);

    const searchToggle = screen.getByRole("button", { name: "搜索" });
    searchToggle.focus();
    fireEvent.click(searchToggle);

    const searchInput = screen.getByLabelText("搜索");
    fireEvent.change(searchInput, {
      target: { value: "customer" }
    });

    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    const firstResult = screen.getByRole("option", { name: "选择 Orders.customer_id" });
    expect(firstResult).toHaveFocus();

    fireEvent.keyDown(firstResult, { key: "ArrowDown" });
    const secondResult = screen.getByRole("option", { name: "选择 Customers.customer_id" });
    expect(secondResult).toHaveFocus();

    fireEvent.keyDown(secondResult, { key: "ArrowUp" });
    expect(firstResult).toHaveFocus();

    fireEvent.keyDown(firstResult, { key: "Enter" });
    expect(onSelectNode).toHaveBeenCalledWith(graph.nodes[1]);
    expect(screen.queryByLabelText("搜索")).not.toBeInTheDocument();
    expect(searchToggle).toHaveFocus();
  });

  it("closes search with Escape and restores focus to the search button", () => {
    render(<WorkbenchHeader graph={graph} suggestions={suggestions} onSelectNode={vi.fn()} />);

    const searchToggle = screen.getByRole("button", { name: "搜索" });
    searchToggle.focus();
    fireEvent.click(searchToggle);

    const searchInput = screen.getByLabelText("搜索");
    expect(searchInput).toHaveFocus();

    fireEvent.keyDown(searchInput, { key: "Escape" });

    expect(screen.queryByLabelText("搜索")).not.toBeInTheDocument();
    expect(searchToggle).toHaveFocus();
  });

  it("renders a compact theme toggle action", () => {
    const onThemeToggle = vi.fn();
    render(
      <WorkbenchHeader
        graph={graph}
        onSelectNode={vi.fn()}
        onThemeToggle={onThemeToggle}
        suggestions={suggestions}
        theme="dark"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "切换到亮色主题" }));

    expect(onThemeToggle).toHaveBeenCalledTimes(1);
  });
});
