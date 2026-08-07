import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type {
  DocumentChunk,
  EntityMatchReview,
  ExtractedEntity,
  ExtractedRelationship,
  GraphResponse,
  ReviewAnalytics,
  ReviewAnalyticsSnapshotSummary,
  RelationshipSuggestion,
  SourceDetail
} from "../src/api/types";
import type { ChatMessage } from "../src/api/types";
import Workspace from "../src/components/Workspace";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

const localStorageStub = (() => {
  let values: Record<string, string> = {};
  return {
    clear: () => {
      values = {};
    },
    getItem: (key: string) => values[key] ?? null,
    removeItem: (key: string) => {
      delete values[key];
    },
    setItem: (key: string, value: string) => {
      values[key] = value;
    }
  };
})();

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageStub
});

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList = {
    addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") {
        listeners.add(listener);
      }
    }),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    dispatchEvent: vi.fn((event: Event) => {
      for (const listener of listeners) {
        listener(event as MediaQueryListEvent);
      }
      return true;
    }),
    matches,
    media: "(max-width: 1080px)",
    onchange: null,
    removeEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") {
        listeners.delete(listener);
      }
    }),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    })
  } as unknown as MediaQueryList;

  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mediaQueryList));
  return mediaQueryList;
}

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
    },
    {
      id: 3,
      node_type: "field",
      label: "Customers.customer_id",
      source_ref: "customers.customer_id",
      metadata: { inferred_type: "identifier", key_candidate_score: 0.99 },
      position_x: 360,
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
    },
    {
      id: 11,
      source_node_id: 2,
      target_node_id: 3,
      edge_type: "foreign_key",
      confidence: 0.94,
      status: "suggested",
      evidence_ref: "suggestion:0",
      evidence_refs: ["suggestion:0", "architecture.md#overview"],
      created_from_suggestion_id: 8,
      metadata: {},
      evidence_summary: "Customer IDs overlap across imported sheets.",
      evidence_payload: { overlap_count: 2 }
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
  },
  {
    id: 8,
    source_field_id: 2,
    target_field_id: 3,
    source_label: "Orders.customer_id",
    target_label: "Customers.customer_id",
    relationship_type: "foreign_key",
    confidence: 0.94,
    evidence_summary: "Customer IDs overlap across imported sheets.",
    evidence_payload: { overlap_count: 2 },
    decision_status: "pending"
  }
];

const messages: ChatMessage[] = [
  {
    role: "assistant",
    content: "Orders.customer_id links customer records across sheets.",
    citations: [
      {
        label: "Orders.customer_id",
        source_ref: "orders.customer_id",
        citation_type: "field"
      }
    ],
    answer_confidence: "high",
    highlighted_graph_path: [11]
  }
];

const relationshipMessages: ChatMessage[] = [
  {
    role: "assistant",
    content: "有 1 条关系需要人工确认：Orders.customer_id -> Customers.customer_id。",
    citations: [
      {
        label: "Orders.customer_id -> Customers.customer_id",
        source_ref: "suggestion:8",
        citation_type: "relationship_suggestion"
      }
    ],
    answer_confidence: "high",
    highlighted_graph_path: [2, 3]
  }
];

const actionMessages: ChatMessage[] = [
  {
    role: "assistant",
    content: "有 1 条关系需要人工确认：Orders.customer_id -> Customers.customer_id。",
    graph_actions: [
      {
        id: "highlight-path",
        type: "highlight_path",
        label: "高亮图谱路径",
        description: "高亮回答涉及的图谱路径。",
        node_ids: [2, 3],
        edge_ids: [11],
        suggestion_ids: [8],
        evidence_refs: ["suggestion:8"],
        metadata: {}
      },
      {
        id: "open-evidence",
        type: "open_evidence",
        label: "打开证据",
        description: "打开回答引用的关系证据。",
        node_ids: [2, 3],
        edge_ids: [11],
        suggestion_ids: [8],
        evidence_refs: ["suggestion:8"],
        metadata: {}
      },
      {
        id: "filter-pending-reviews",
        type: "filter_pending_reviews",
        label: "查看待审核关系",
        description: "切换到审核面板查看待确认关系。",
        node_ids: [2, 3],
        edge_ids: [],
        suggestion_ids: [8],
        evidence_refs: [],
        metadata: { count: 1 }
      },
      {
        id: "focus-node-2",
        type: "focus_node",
        label: "聚焦节点",
        description: "把画布视角移动到字段节点。",
        node_ids: [2],
        edge_ids: [],
        suggestion_ids: [],
        evidence_refs: [],
        metadata: {}
      }
    ],
    next_steps: ["查看 AI 高亮路径中的字段关系。"]
  }
];

const invalidActionMessages: ChatMessage[] = [
  {
    role: "assistant",
    content: "尝试打开一条当前图谱中不存在的证据。",
    graph_actions: [
      {
        id: "missing-target",
        type: "open_evidence",
        label: "打开缺失证据",
        description: "打开当前图谱中不存在的证据。",
        node_ids: [404],
        edge_ids: [999],
        suggestion_ids: [],
        evidence_refs: [],
        metadata: {}
      }
    ]
  }
];

const suggestionOnlyActionMessages: ChatMessage[] = [
  {
    role: "assistant",
    content: "AI 只返回了建议关系目标，需要前端反查图谱边。",
    graph_actions: [
      {
        id: "highlight-suggestion-path",
        type: "highlight_path",
        label: "高亮建议路径",
        description: "根据建议关系高亮图谱路径。",
        node_ids: [999],
        edge_ids: [],
        suggestion_ids: [8],
        evidence_refs: [],
        metadata: {}
      }
    ]
  }
];

const sourceDetails: SourceDetail[] = [
  {
    id: 1,
    import_item_id: 9,
    title: "README.md",
    document_type: "markdown",
    source_ref: "document:1",
    metadata: { path: "README.md" },
    chunk_count: 1,
    entity_count: 1,
    relationship_count: 1,
    created_at: "2026-06-02T00:00:00Z"
  }
];

const sourceChunksBySourceId: Record<number, DocumentChunk[]> = {
  1: [
    {
      id: 2,
      document_id: 1,
      chunk_index: 0,
      heading: "Overview",
      content: "GraphMind imports sources and builds a knowledge graph.",
      token_count: 8,
      source_ref: "document:1#chunk:0",
      content_hash: "abc",
      metadata: {},
      created_at: "2026-06-02T00:00:00Z"
    }
  ]
};

const extractedEntities: ExtractedEntity[] = [
  {
    id: 3,
    canonical_name: "GraphMind",
    entity_type: "product",
    aliases: ["graphmind"],
    confidence: 0.92,
    source_refs: ["document:1#chunk:0"],
    metadata: {},
    created_at: "2026-06-02T00:00:00Z"
  }
];

const extractedRelationships: ExtractedRelationship[] = [
  {
    id: 4,
    source_entity_id: 3,
    target_entity_id: 5,
    source_name: "README.md",
    source_type: "file",
    target_name: "GraphMind",
    target_type: "product",
    relationship_type: "mentions",
    confidence: 0.87,
    status: "suggested",
    evidence_summary: "README.md mentions GraphMind.",
    evidence_payload: {},
    source_refs: ["document:1#chunk:0"],
    created_at: "2026-06-02T00:00:00Z"
  }
];

const entityMatchReviews: EntityMatchReview[] = [
  {
    id: 7,
    project_id: 42,
    source_node_id: 30,
    target_node_id: 31,
    source_label: "customers.customer_id",
    source_type: "field",
    target_label: "Customer ID",
    target_type: "entity",
    relationship_type: "matches_entity",
    confidence: 0.78,
    status: "suggested",
    evidence_ref: "entity_resolution:30:31",
    evidence_summary: "customers.customer_id matches Customer ID by normalized name.",
    matched_keys: ["customerid"],
    source_refs: ["document:1#chunk:0"],
    metadata: { rule: "normalized_name_match" }
  }
];

const mappingReviews: EntityMatchReview[] = [
  {
    id: 9,
    project_id: 42,
    source_node_id: 40,
    target_node_id: 41,
    source_label: "customers.customer_id",
    source_type: "field",
    target_label: "orders.customer_id",
    target_type: "field",
    relationship_type: "documented_mapping",
    confidence: 0.92,
    status: "suggested",
    evidence_ref: "document:1#chunk:0",
    evidence_summary: "Customer ID maps to customerId.",
    matched_keys: [],
    source_refs: ["document:1#chunk:0"],
    metadata: { rule: "documented_field_mapping" }
  }
];

const reviewAnalytics: ReviewAnalytics = {
  window_days: 30,
  generated_at: "2026-06-08T00:00:00.000Z",
  sla: {
    pending_sla_days: 3,
    pending_total: 2,
    overdue_pending_count: 1,
    oldest_pending_age_days: 8
  },
  aging_buckets: {
    "0_1_days": 1,
    "2_3_days": 0,
    "4_7_days": 0,
    "8_plus_days": 1
  },
  decision_trend: {
    accepted: 0,
    edited: 0,
    pending: 2,
    rejected: 0
  },
  quality_distribution: {
    high: 1,
    medium: 1,
    low: 0
  },
  evidence_coverage: {
    with_evidence_count: 2,
    without_evidence_count: 0,
    coverage_ratio: 1
  }
};

const reviewAnalyticsSnapshotSummary: ReviewAnalyticsSnapshotSummary = {
  retention_days: 30,
  snapshot_count: 4,
  expired_snapshot_count: 2,
  oldest_snapshot_date: "2026-03-05",
  latest_snapshot_date: "2026-06-10"
};

describe("Workspace", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.body.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  it("renders the GitNexus-inspired pro workbench shell", () => {
    const { container } = render(<Workspace graph={graph} suggestions={suggestions} />);

    expect(screen.getByRole("heading", { name: "GraphMind" })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("theme-dark");
    expect(container.firstElementChild).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("tablist", { name: "工作台模块" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "图谱" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "数据" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "洞察" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开数据导入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 AI 配置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "数据树" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "关系图谱" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "洞察" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "证据" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "审核" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI" })).toBeInTheDocument();
    expect(screen.getAllByText("3 个节点").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 条边").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 条待审核").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "展开图谱工具" })).toBeInTheDocument();
    expect(getRelationshipShelf()).toBeInTheDocument();
  });

  it("switches between dark and light themes and persists the preference", () => {
    const { container, unmount } = render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "切换到亮色主题" }));

    expect(container.firstElementChild).toHaveClass("theme-light");
    expect(container.firstElementChild).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.body).toHaveAttribute("data-theme", "light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(window.localStorage.getItem("graphmind.workbench.theme")).toBe("light");
    expect(screen.getByRole("button", { name: "切换到暗色主题" })).toBeInTheDocument();

    unmount();
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(document.body).not.toHaveAttribute("data-theme");
    const { container: remountedContainer } = render(
      <Workspace graph={graph} suggestions={suggestions} />
    );

    expect(remountedContainer.firstElementChild).toHaveClass("theme-light");
    expect(remountedContainer.firstElementChild).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("switches product workspace modules from the top navigation", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("tab", { name: "数据" }));
    expect(screen.getByRole("tab", { name: "数据" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("数据模块")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "洞察" }));
    expect(screen.getByRole("tab", { name: "洞察" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("洞察模块")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "图谱" }));
    expect(screen.getByRole("tab", { name: "图谱" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("图谱模块")).toBeInTheDocument();
  });

  it("does not mount React Flow inside hidden modules on responsive single-pane layouts", () => {
    stubMatchMedia(true);
    const { container } = render(<Workspace graph={graph} suggestions={suggestions} />);

    expect(container.querySelector(".react-flow")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "数据" }));

    expect(screen.getByRole("tab", { name: "数据" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".react-flow")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "洞察" }));

    expect(screen.getByRole("tab", { name: "洞察" })).toHaveAttribute("aria-selected", "true");
    expect(container.querySelector(".react-flow")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "图谱" }));

    expect(container.querySelector(".react-flow")).toBeInTheDocument();
  });

  it("opens data intake and AI settings from product-level header actions", () => {
    const onSettingsChange = vi.fn();
    const onConfirmRelationship = vi.fn();
    render(
      <Workspace
        graph={graph}
        onConfirmRelationship={onConfirmRelationship}
        onSettingsChange={onSettingsChange}
        suggestions={suggestions}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开数据导入" }));
    const dataDialog = screen.getByRole("dialog", { name: "数据导入" });
    expect(dataDialog).toBeInTheDocument();
    expect(dataDialog.closest(".data-explorer-panel")).toBeNull();
    expect(screen.getByRole("list", { name: "导入建模向导" })).toBeInTheDocument();
    const resultSummary = within(dataDialog).getByRole("region", { name: "导入结果摘要" });
    expect(within(resultSummary).getByText("2 条候选关系")).toBeInTheDocument();
    expect(within(resultSummary).getByText("2 条待确认")).toBeInTheDocument();
    const modeling = within(dataDialog).getByRole("region", { name: "关系建模编辑器" });
    expect(within(modeling).getByText("已建模 0/2 条关系")).toBeInTheDocument();
    expect(within(modeling).getAllByText("Orders.customer_id")).toHaveLength(2);
    expect(within(modeling).getByText("Customers.customer_id")).toBeInTheDocument();
    fireEvent.change(
      within(modeling).getByLabelText("关系 Orders.customer_id 到 Customers.customer_id 的类型"),
      {
        target: { value: "same_entity" }
      }
    );
    fireEvent.change(
      within(modeling).getByLabelText("关系 Orders.customer_id 到 Customers.customer_id 的证据质量"),
      {
        target: { value: "high" }
      }
    );
    fireEvent.click(
      within(modeling).getByRole("button", {
        name: "确认关系 Orders.customer_id 到 Customers.customer_id"
      })
    );
    expect(onConfirmRelationship).toHaveBeenCalledWith(8, {
      decisionStatus: "edited",
      evidenceQuality: "high",
      relationshipType: "same_entity"
    });

    fireEvent.click(screen.getByRole("button", { name: "关闭数据操作" }));
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 配置" }));
    const aiDialog = screen.getByRole("dialog", { name: "AI 和向量设置" });
    expect(aiDialog).toHaveAttribute("aria-modal", "true");

    fireEvent.change(within(aiDialog).getByLabelText("对话模型名称"), {
      target: { value: "qwen3" }
    });
    fireEvent.click(within(aiDialog).getByRole("button", { name: "保存设置" }));

    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        ai: expect.objectContaining({
          chat: expect.objectContaining({ model: "qwen3" })
        })
      })
    );
  });

  it("opens AI settings from first-graph preset help in data intake", () => {
    const onSettingsChange = vi.fn();
    render(
      <Workspace
        graph={graph}
        onSettingsChange={onSettingsChange}
        suggestions={suggestions}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开数据导入" }));
    const dataDialog = screen.getByRole("dialog", { name: "数据导入" });

    fireEvent.click(
      within(dataDialog).getByRole("button", { name: "帮助：打开 AI 和向量设置" })
    );

    expect(screen.getByRole("dialog", { name: "AI 和向量设置" })).toHaveAttribute(
      "aria-modal",
      "true"
    );
    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  it("opens the project sharing panel and manages share tokens", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    const onCreateProjectShareToken = vi.fn().mockResolvedValue({
      id: 12,
      project_id: 42,
      role: "viewer",
      label: "Partner",
      token: "gm_share_created",
      created_at: "2026-06-07T00:00:00+00:00",
      last_used_at: null,
      revoked_at: null
    });
    const onLoadProjectShareTokens = vi.fn().mockResolvedValue([
      {
        id: 11,
        project_id: 42,
        role: "editor",
        label: "Editor partner",
        created_at: "2026-06-06T00:00:00+00:00",
        last_used_at: "2026-06-08T08:30:00+00:00",
        revoked_at: null
      }
    ]);
    const onRevokeProjectShareToken = vi.fn().mockResolvedValue({
      id: 11,
      project_id: 42,
      revoked: true
    });
    render(
      <Workspace
        graph={graph}
        projectId={42}
        relationshipGovernance={null}
        suggestions={suggestions}
        onCreateProjectShareToken={onCreateProjectShareToken}
        onLoadProjectShareTokens={onLoadProjectShareTokens}
        onRevokeProjectShareToken={onRevokeProjectShareToken}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "项目分享" }));

    const dialog = await screen.findByRole("dialog", { name: "项目分享" });
    expect(onLoadProjectShareTokens).toHaveBeenCalledWith(42);
    expect(await within(dialog).findByText("Editor partner")).toBeInTheDocument();
    expect(within(dialog).getByText("创建于 2026-06-06")).toBeInTheDocument();
    expect(within(dialog).getByText("最近使用 2026-06-08")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("标签"), {
      target: { value: "Partner" }
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建分享令牌" }));

    expect(await within(dialog).findByText("gm_share_created")).toBeInTheDocument();
    expect(within(dialog).getByText("仅显示一次，请立即复制并妥善保存。")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "复制分享令牌" }));
    expect(writeText).toHaveBeenCalledWith("gm_share_created");
    expect(await within(dialog).findByText("分享令牌已复制。")).toHaveAttribute("role", "status");
    expect(onCreateProjectShareToken).toHaveBeenCalledWith(42, "viewer", "Partner");

    fireEvent.click(within(dialog).getByRole("button", { name: "撤销 Editor partner" }));

    expect(onRevokeProjectShareToken).toHaveBeenCalledWith(42, 11);
    expect(await within(dialog).findByText(/已撤销于/)).toBeInTheDocument();
  });

  it("traps focus in project sharing, closes with Escape, and restores the opener", async () => {
    render(<Workspace graph={graph} projectId={42} suggestions={suggestions} />);
    const openButton = screen.getByRole("button", { name: "项目分享" });
    openButton.focus();
    fireEvent.click(openButton);

    const dialog = await screen.findByRole("dialog", { name: "项目分享" });
    const closeButton = within(dialog).getByRole("button", { name: "关闭项目分享" });
    const createButton = within(dialog).getByRole("button", { name: "创建分享令牌" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(createButton).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "项目分享" })).not.toBeInTheDocument();
    expect(openButton).toHaveFocus();
  });

  it("surfaces and dismisses structured workspace operation errors", () => {
    const onDismissOperationError = vi.fn();
    render(
      <Workspace
        graph={graph}
        onDismissOperationError={onDismissOperationError}
        operationError={{
          code: "REVIEW_WRITE_FAILED",
          fieldErrors: {},
          message: "Review could not be saved.",
          retryable: true,
          userAction: "Retry the review."
        }}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Review could not be saved.");
    expect(screen.getByRole("alert")).toHaveTextContent("REVIEW_WRITE_FAILED");
    fireEvent.click(screen.getByRole("button", { name: "关闭错误提示" }));
    expect(onDismissOperationError).toHaveBeenCalledTimes(1);
  });

  it("traps keyboard focus in the AI settings dialog and restores focus after closing", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    const openSettingsButton = screen.getByRole("button", { name: "打开 AI 配置" });
    openSettingsButton.focus();
    fireEvent.click(openSettingsButton);

    const aiDialog = screen.getByRole("dialog", { name: "AI 和向量设置" });
    const closeButton = within(aiDialog).getByRole("button", { name: "关闭 AI 设置" });
    const saveButton = within(aiDialog).getByRole("button", { name: "保存设置" });

    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(aiDialog, { key: "Tab", shiftKey: true });
    expect(saveButton).toHaveFocus();

    fireEvent.keyDown(aiDialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(aiDialog, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "AI 和向量设置" })).not.toBeInTheDocument();
    expect(openSettingsButton).toHaveFocus();
  });

  it("keeps AI settings open when persistence rejects", async () => {
    const onSettingsChange = vi.fn().mockRejectedValue(new Error("Settings write failed"));
    render(
      <Workspace
        graph={graph}
        onSettingsChange={onSettingsChange}
        suggestions={suggestions}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "打开 AI 配置" }));
    const dialog = screen.getByRole("dialog", { name: "AI 和向量设置" });

    fireEvent.click(within(dialog).getByRole("button", { name: "保存设置" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Settings write failed");
    expect(screen.getByRole("dialog", { name: "AI 和向量设置" })).toBeInTheDocument();
  });

  it("opens the review queue high-priority filter from import health", () => {
    const shortcutSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        review_priority: "medium"
      },
      {
        ...suggestions[1],
        review_priority: "high",
        quality_label: "high",
        quality_reasons: ["confidence:high"]
      }
    ];

    render(<Workspace graph={graph} suggestions={shortcutSuggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "打开数据导入" }));
    const dataDialog = screen.getByRole("dialog", { name: "数据导入" });

    fireEvent.click(within(dataDialog).getByRole("button", { name: "查看高优先级关系" }));

    expect(screen.queryByRole("dialog", { name: "数据导入" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "洞察" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("已打开高优先级关系审核，并定位到第一条匹配建议。")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "审核" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "高优先级 1" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "高优先级 1" })).toHaveClass(
      "is-shortcut-focused"
    );
    const reviewPanel = screen.getByRole("region", { name: "关系建议" });
    expect(within(reviewPanel).getByText("Customers.customer_id")).toBeInTheDocument();
    expect(within(reviewPanel).getByText("Customers.customer_id").closest(".review-card")).toHaveClass(
      "is-shortcut-focused"
    );
    expect(within(reviewPanel).queryByText("派生维度")).not.toBeInTheDocument();
  });

  it("passes analytics snapshot governance into the review workspace", () => {
    const onCleanupAnalyticsSnapshots = vi.fn();
    render(
      <Workspace
        graph={graph}
        reviewAnalytics={reviewAnalytics}
        reviewAnalyticsSnapshotSummary={reviewAnalyticsSnapshotSummary}
        suggestions={suggestions}
        onCleanupAnalyticsSnapshots={onCleanupAnalyticsSnapshots}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "审核" }));
    const analytics = screen.getByRole("region", { name: "SLA 趋势分析" });

    expect(within(analytics).getByText("4 个快照")).toBeInTheDocument();
    expect(within(analytics).getByText("2 个过期")).toBeInTheDocument();

    fireEvent.change(within(analytics).getByLabelText("快照保留周期"), {
      target: { value: "90" }
    });
    fireEvent.click(within(analytics).getByRole("button", { name: "清理过期快照" }));
    expect(onCleanupAnalyticsSnapshots).toHaveBeenCalledWith(90);
  });

  it("surfaces a product next-step recommendation and routes it to pending review", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    const nextSteps = screen.getByRole("region", { name: "推荐下一步" });

    expect(within(nextSteps).getByText("先处理 2 条待确认关系")).toBeInTheDocument();
    expect(
      within(nextSteps).getByText("确认关键关系后，图谱和 AI 证据会更可靠。")
    ).toBeInTheDocument();

    fireEvent.click(within(nextSteps).getByRole("button", { name: "查看待确认关系" }));

    expect(screen.getByRole("tab", { name: "洞察" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "审核" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("已打开待确认关系审核，并定位到第一条匹配建议。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "待处理 2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("recommends inspecting graph evidence after import has no pending review", () => {
    const acceptedSuggestions = suggestions.map((suggestion) => ({
      ...suggestion,
      decision_status: "accepted" as const
    }));

    render(<Workspace graph={graph} suggestions={acceptedSuggestions} />);

    const nextSteps = screen.getByRole("region", { name: "推荐下一步" });

    expect(within(nextSteps).getByText("检查图谱证据路径")).toBeInTheDocument();
    fireEvent.click(within(nextSteps).getByRole("button", { name: "查看图谱证据" }));

    expect(screen.getByRole("tab", { name: "图谱" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "展开图谱工具" })).toBeInTheDocument();
  });

  it("focuses a failed import task from import health", () => {
    render(
      <Workspace
        graph={graph}
        importTasks={[
          {
            id: "task-failed",
            label: "broken.json",
            kind: "file",
            status: "failed",
            progress: 100,
            summary: null,
            error: "Unexpected token",
            retryable: true,
            createdAt: 1780222860000
          }
        ]}
        sourceSummaries={[{ source_kind: "document", count: 1 }]}
        suggestions={suggestions}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开数据导入" }));
    const dataDialog = screen.getByRole("dialog", { name: "数据导入" });

    fireEvent.click(within(dataDialog).getByRole("button", { name: "查看失败导入项" }));

    expect(screen.getByRole("dialog", { name: "数据导入" })).toBeInTheDocument();
    expect(screen.getByText("已定位到失败导入项：broken.json。")).toBeInTheDocument();
    expect(within(dataDialog).getByText("broken.json").closest(".import-task-row")).toHaveClass(
      "is-shortcut-focused"
    );
  });

  it("focuses a failed batch stage from import health", () => {
    render(
      <Workspace
        graph={graph}
        importTasks={[
          {
            id: "task-partial",
            label: "2 个文件批量导入",
            kind: "batch",
            status: "partial",
            progress: 100,
            summary: "1 个文件完成，1 个文件失败。",
            error: null,
            retryable: false,
            createdAt: 1780222920000,
            stages: [
              {
                name: "failed",
                status: "failed",
                progress: 100,
                summary: "Unexpected token",
                source: "broken.json",
                itemId: 19,
                retryable: true
              }
            ]
          }
        ]}
        sourceSummaries={[{ source_kind: "document", count: 1 }]}
        suggestions={suggestions}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开数据导入" }));
    const dataDialog = screen.getByRole("dialog", { name: "数据导入" });

    fireEvent.click(within(dataDialog).getByRole("button", { name: "查看失败导入项" }));

    expect(screen.getByText("已定位到失败导入项：broken.json · 失败。")).toBeInTheDocument();
    expect(within(dataDialog).getByText("2 个文件批量导入").closest(".import-task-row")).toHaveClass(
      "is-shortcut-focused"
    );
    expect(within(dataDialog).getByText("broken.json · 失败").closest(".import-task-stage")).toHaveClass(
      "is-shortcut-focused"
    );
  });

  it("retries a failed batch stage from import health", () => {
    const onRetryImportItem = vi.fn();
    render(
      <Workspace
        graph={graph}
        importTasks={[
          {
            id: "task-partial",
            label: "2 个文件批量导入",
            kind: "batch",
            status: "partial",
            progress: 100,
            summary: "1 个文件完成，1 个文件失败。",
            error: null,
            retryable: false,
            createdAt: 1780222920000,
            stages: [
              {
                name: "failed",
                status: "failed",
                progress: 100,
                summary: "Unexpected token",
                source: "broken.json",
                itemId: 19,
                retryable: true
              }
            ]
          }
        ]}
        onRetryImportItem={onRetryImportItem}
        sourceSummaries={[{ source_kind: "document", count: 1 }]}
        suggestions={suggestions}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "打开数据导入" }));
    const dataDialog = screen.getByRole("dialog", { name: "数据导入" });

    fireEvent.click(within(dataDialog).getByRole("button", { name: "重试失败导入项" }));

    expect(onRetryImportItem).toHaveBeenCalledWith("task-partial", 19);
    expect(screen.getByText("已开始重试失败导入项：broken.json · 失败。")).toBeInTheDocument();
    expect(within(dataDialog).getByText("broken.json · 失败").closest(".import-task-stage")).toHaveClass(
      "is-shortcut-focused"
    );
  });

  it("traps keyboard focus in the data intake dialog and restores focus after closing", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    const openDataButton = screen.getByRole("button", { name: "打开数据导入" });
    openDataButton.focus();
    fireEvent.click(openDataButton);

    const dataDialog = screen.getByRole("dialog", { name: "数据导入" });
    const closeButton = within(dataDialog).getByRole("button", { name: "关闭数据操作" });
    const dialogButtons = within(dataDialog).getAllByRole("button");
    const lastDialogButton = dialogButtons[dialogButtons.length - 1];

    expect(lastDialogButton).toBeDefined();
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dataDialog, { key: "Tab", shiftKey: true });
    expect(lastDialogButton).toHaveFocus();

    fireEvent.keyDown(dataDialog, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(dataDialog, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "数据导入" })).not.toBeInTheDocument();
    expect(openDataButton).toHaveFocus();
  });

  it("keeps graph tools collapsed by default and expands them on demand", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    expect(screen.queryByRole("button", { name: "一跳" })).not.toBeInTheDocument();
    expect(getRelationshipShelf()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开图谱工具" }));

    expect(screen.getByRole("button", { name: "收起图谱工具" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "一跳" })).toBeDisabled();
    expect(getRelationshipShelf()).toBeInTheDocument();
  });

  it("collapses and expands the data explorer", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "收起数据浏览器" }));
    expect(screen.getByText("浏览器已收起")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开数据树" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开数据树" }));
    expect(screen.getByText("浏览器已展开")).toBeInTheDocument();
  });

  it("collapses and expands the insight panel", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "收起洞察面板" }));
    expect(screen.getByText("洞察已收起")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "证据" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开洞察面板" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开洞察面板" }));
    expect(screen.getByText("洞察已展开")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "证据" })).toBeInTheDocument();
  });

  it("toggles graph focus mode and restores side panels", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "进入图谱聚焦模式" }));
    expect(screen.getByText("图谱聚焦模式")).toBeInTheDocument();
    expect(screen.getByText("浏览器已收起")).toBeInTheDocument();
    expect(screen.getByText("洞察已收起")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开数据树" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开洞察面板" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "退出图谱聚焦模式" }));
    expect(screen.queryByText("图谱聚焦模式")).not.toBeInTheDocument();
    expect(screen.getByText("浏览器已展开")).toBeInTheDocument();
    expect(screen.getByText("洞察已展开")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起数据浏览器" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起洞察面板" })).toBeInTheDocument();
  });

  it("restores persisted layout preferences after remount", () => {
    const { unmount } = render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "收起数据浏览器" }));
    fireEvent.click(screen.getByRole("button", { name: "收起洞察面板" }));
    unmount();

    render(<Workspace graph={graph} suggestions={suggestions} />);

    expect(screen.getByText("浏览器已收起")).toBeInTheDocument();
    expect(screen.getByText("洞察已收起")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开数据树" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开洞察面板" })).toBeInTheDocument();
  });

  it("restores persisted graph focus mode after remount", () => {
    const { unmount } = render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "进入图谱聚焦模式" }));
    unmount();

    render(<Workspace graph={graph} suggestions={suggestions} />);

    expect(screen.getByText("图谱聚焦模式")).toBeInTheDocument();
    expect(screen.getByText("浏览器已收起")).toBeInTheDocument();
    expect(screen.getByText("洞察已收起")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出图谱聚焦模式" })).toBeInTheDocument();
  });

  it("resets the persisted workbench layout to the default view", () => {
    const { unmount } = render(<Workspace graph={graph} suggestions={suggestions} />);

    expect(screen.getByRole("button", { name: "恢复默认布局" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "进入图谱聚焦模式" }));
    expect(screen.getByRole("button", { name: "恢复默认布局" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "恢复默认布局" }));

    expect(screen.queryByText("图谱聚焦模式")).not.toBeInTheDocument();
    expect(screen.getByText("浏览器已展开")).toBeInTheDocument();
    expect(screen.getByText("洞察已展开")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起数据浏览器" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起洞察面板" })).toBeInTheDocument();

    unmount();
    render(<Workspace graph={graph} suggestions={suggestions} />);

    expect(screen.queryByText("图谱聚焦模式")).not.toBeInTheDocument();
    expect(screen.getByText("浏览器已展开")).toBeInTheDocument();
    expect(screen.getByText("洞察已展开")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复默认布局" })).toBeDisabled();
  });

  it("selects graph nodes from header search and updates insights", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.change(screen.getByLabelText("搜索"), {
      target: { value: "customer" }
    });
    fireEvent.click(
      within(screen.getByRole("listbox")).getByRole("option", {
        name: "选择 Orders.customer_id"
      })
    );

    expect(screen.getByRole("heading", { name: "节点详情" })).toBeInTheDocument();
    expect(screen.getByText("节点：Orders.customer_id")).toBeInTheDocument();
  });

  it("opens a global command palette with the keyboard and runs workbench commands", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.keyDown(document.body, { ctrlKey: true, key: "k" });

    const dialog = screen.getByRole("dialog", { name: "命令面板" });
    const commandSearch = within(dialog).getByRole("searchbox", { name: "搜索命令" });
    expect(commandSearch).toHaveFocus();
    expect(within(dialog).getByRole("option", { name: "打开数据导入" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: "项目分享" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: "切换到洞察" })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: "切换到亮色主题" })).toBeInTheDocument();
    expect(within(dialog).getByText("8 条命令")).toBeInTheDocument();
    expect(within(dialog).getByText("进入 AI 问答、证据和审核面板")).toBeInTheDocument();
    expect(within(dialog).getByText("Ctrl+I")).toBeInTheDocument();

    fireEvent.change(commandSearch, {
      target: { value: "洞察" }
    });
    expect(within(dialog).getByText("1 条命令")).toBeInTheDocument();
    fireEvent.keyDown(commandSearch, { key: "ArrowDown" });
    const insightsCommand = within(dialog).getByRole("option", { name: "切换到洞察" });
    expect(insightsCommand).toHaveFocus();

    fireEvent.keyDown(insightsCommand, { key: "Enter" });
    expect(screen.queryByRole("dialog", { name: "命令面板" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "洞察" })).toHaveAttribute("aria-selected", "true");
  });

  it("switches theme from the command palette", () => {
    const { container } = render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.keyDown(document.body, { ctrlKey: true, key: "k" });
    const dialog = screen.getByRole("dialog", { name: "命令面板" });
    const commandSearch = within(dialog).getByRole("searchbox", { name: "搜索命令" });

    fireEvent.change(commandSearch, {
      target: { value: "主题" }
    });
    fireEvent.click(within(dialog).getByRole("option", { name: "切换到亮色主题" }));

    expect(screen.queryByRole("dialog", { name: "命令面板" })).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("theme-light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("graphmind.workbench.theme")).toBe("light");
  });

  it("closes the command palette with Escape and restores focus to the command button", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    const commandButton = screen.getByRole("button", { name: "打开命令面板" });
    commandButton.focus();
    fireEvent.click(commandButton);

    expect(screen.getByRole("dialog", { name: "命令面板" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "搜索命令" }), { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "命令面板" })).not.toBeInTheDocument();
    expect(commandButton).toHaveFocus();
  });

  it("selects graph nodes from the data tree and shows the graph overlay", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "选择 Orders.customer_id" }));

    expect(screen.getByLabelText("图谱详情")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Orders.customer_id" }).length).toBeGreaterThan(0);
    expect(screen.getByText("节点：Orders.customer_id")).toBeInTheDocument();
  });

  it("passes source inspection data into the data explorer", () => {
    const onReviewEntityMatch = vi.fn();
    const onReviewMappingEdge = vi.fn();
    render(
      <Workspace
        entityMatchReviews={entityMatchReviews}
        extractedEntities={extractedEntities}
        extractedRelationships={extractedRelationships}
        graph={graph}
        mappingReviews={mappingReviews}
        onReviewEntityMatch={onReviewEntityMatch}
        onReviewMappingEdge={onReviewMappingEdge}
        sourceChunksBySourceId={sourceChunksBySourceId}
        sourceDetails={sourceDetails}
        suggestions={suggestions}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "选择来源 README.md" }));

    expect(screen.getByRole("heading", { name: "来源检查" })).toBeInTheDocument();
    expect(screen.getByText("GraphMind imports sources and builds a knowledge graph.")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "拒绝文档映射 customers.customer_id 到 orders.customer_id"
      })
    );
    expect(onReviewMappingEdge).toHaveBeenCalledWith(9, "rejected");
    fireEvent.click(
      screen.getByRole("button", {
        name: "拒绝实体匹配 customers.customer_id 到 Customer ID"
      })
    );
    expect(onReviewEntityMatch).toHaveBeenCalledWith(7, "rejected");
  });

  it("highlights adjacent nodes when one-hop exploration is enabled", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "选择 Orders.customer_id" }));
    fireEvent.click(screen.getByRole("button", { name: "展开图谱工具" }));
    fireEvent.click(screen.getByRole("button", { name: "一跳" }));

    expect(getSemanticNodeByText("Orders")).toHaveClass("is-highlighted");
    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass(
      "is-highlighted"
    );
    expect(getSemanticNodeByText("Customers.customer_id")).toHaveClass(
      "is-highlighted"
    );
  });

  it("includes adjacent relationship edges when one-hop exploration is enabled", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "选择 Orders.customer_id" }));
    fireEvent.click(screen.getByRole("button", { name: "展开图谱工具" }));
    fireEvent.click(screen.getByRole("button", { name: "一跳" }));

    expect(screen.getByText("AI 路径：5 个项目")).toBeInTheDocument();
  });

  it("switches right-panel tabs without losing the selected node", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "选择 Orders.customer_id" }));
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));

    expect(screen.getByRole("heading", { name: "AI 关系问答" })).toBeInTheDocument();
    expect(screen.getByText("节点：Orders.customer_id")).toBeInTheDocument();
  });

  it("asks AI from a path action with the selected node context", () => {
    const onAsk = vi.fn();
    render(<Workspace graph={graph} onAsk={onAsk} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "选择 Orders.customer_id" }));
    fireEvent.click(screen.getByRole("button", { name: "让 AI 分析：核验外键字段的唯一性和覆盖率" }));

    expect(onAsk).toHaveBeenCalledWith(
      "请基于当前路径核验外键字段的唯一性和覆盖率，并指出需要人工确认的证据。",
      { kind: "node", id: 2 }
    );
    expect(screen.getByRole("tab", { name: "AI" })).toHaveAttribute("aria-selected", "true");
  });

  it("returns to relationship evidence when selecting a graph relationship from another tab", () => {
    render(<Workspace graph={graph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("button", { name: "展开图谱工具" }));
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    expect(screen.getByRole("heading", { name: "AI 关系问答" })).toBeInTheDocument();

    fireEvent.click(
      within(getRelationshipShelf()).getByText(
        "外键 · 94% · 建议"
      )
    );

    const evidenceInspector = screen
      .getByRole("heading", { name: "关系证据" })
      .closest(".evidence-inspector");
    expect(evidenceInspector).not.toBeNull();
    expect(
      within(evidenceInspector as HTMLElement).getByText(
        "Customer IDs overlap across imported sheets."
      )
    ).toBeInTheDocument();
  });

  it("selects cited graph nodes from AI answers and returns to evidence", () => {
    render(<Workspace graph={graph} messages={messages} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "查看引用 Orders.customer_id" }));

    expect(screen.getByRole("heading", { name: "节点详情" })).toBeInTheDocument();
    expect(screen.getByText("节点：Orders.customer_id")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("AI 路径：1 个项目")).toBeInTheDocument();
    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass("is-highlighted");
  });

  it("selects cited relationship suggestions from AI answers and returns to evidence", () => {
    render(
      <Workspace graph={graph} messages={relationshipMessages} suggestions={suggestions} />
    );

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "查看引用 Orders.customer_id -> Customers.customer_id"
      })
    );

    const evidenceInspector = screen
      .getByRole("heading", { name: "关系证据" })
      .closest(".evidence-inspector");
    expect(evidenceInspector).not.toBeNull();
    expect(
      within(evidenceInspector as HTMLElement).getByText(
        "Customer IDs overlap across imported sheets."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("AI 路径：3 个项目")).toBeInTheDocument();
    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass("is-highlighted");
    expect(getSemanticNodeByText("Customers.customer_id")).toHaveClass("is-highlighted");
    expect(
      within(getAiPathSummary()).getByRole("button", {
        name: "查看路径片段 Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 强度 强 · 证据 suggestion:0"
      })
    ).toHaveClass("is-current");
  });

  it("selects AI path relationship segments without clearing the full highlighted path", () => {
    render(
      <Workspace
        graph={graph}
        highlightedGraphPath={[1, 2, 10, 3, 11]}
        messages={relationshipMessages}
        suggestions={suggestions}
      />
    );

    fireEvent.click(
      within(getAiPathSummary()).getByRole("button", {
        name: "查看路径片段 Orders.customer_id → Customers.customer_id · 外键 · 94% · 建议 · 强度 强 · 证据 suggestion:0"
      })
    );

    const evidenceInspector = screen
      .getByRole("heading", { name: "关系证据" })
      .closest(".evidence-inspector");
    expect(evidenceInspector).not.toBeNull();
    expect(
      within(evidenceInspector as HTMLElement).getByText(
        "Customer IDs overlap across imported sheets."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("AI 路径：5 个项目")).toBeInTheDocument();
    expect(getSemanticNodeByText("Orders")).toHaveClass("is-highlighted");
    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass("is-highlighted");
    expect(getSemanticNodeByText("Customers.customer_id")).toHaveClass("is-highlighted");
  });

  it("selects retrieved relationship evidence from AI answers and returns to evidence", () => {
    const evidenceMessages: ChatMessage[] = [
      {
        role: "assistant",
        content: "Orders.customer_id 可以关联 Customers.customer_id。",
        retrieved_evidence: [
          {
            label: "Orders.customer_id -> Customers.customer_id",
            kind: "graph_edge",
            source_ref: "suggestion:8",
            score: 3.2,
            excerpt: "Customer IDs overlap across imported sheets."
          }
        ]
      }
    ];
    render(
      <Workspace graph={graph} messages={evidenceMessages} suggestions={suggestions} />
    );

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "查看证据 Orders.customer_id -> Customers.customer_id"
      })
    );

    const evidenceInspector = screen
      .getByRole("heading", { name: "关系证据" })
      .closest(".evidence-inspector");
    expect(evidenceInspector).not.toBeNull();
    expect(
      within(evidenceInspector as HTMLElement).getByText(
        "Customer IDs overlap across imported sheets."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");
  });

  it("selects retrieved relationship evidence by label when the source ref is not a suggestion", () => {
    const evidenceMessages: ChatMessage[] = [
      {
        role: "assistant",
        content: "Orders.customer_id 可以关联 Customers.customer_id。",
        retrieved_evidence: [
          {
            label: "Orders.customer_id -> Customers.customer_id",
            kind: "graph_edge",
            source_ref: "field:orders.customer_id",
            score: 2.8,
            excerpt: "Customer IDs overlap across imported sheets."
          }
        ]
      }
    ];
    render(
      <Workspace graph={graph} messages={evidenceMessages} suggestions={suggestions} />
    );

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "查看证据 Orders.customer_id -> Customers.customer_id"
      })
    );

    const evidenceInspector = screen
      .getByRole("heading", { name: "关系证据" })
      .closest(".evidence-inspector");
    expect(evidenceInspector).not.toBeNull();
    expect(
      within(evidenceInspector as HTMLElement).getByText(
        "Customer IDs overlap across imported sheets."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");
  });

  it("selects retrieved relationship evidence by canonical evidence refs", () => {
    const evidenceMessages: ChatMessage[] = [
      {
        role: "assistant",
        content: "architecture.md 中说明了客户字段关系。",
        retrieved_evidence: [
          {
            label: "Architecture overview",
            kind: "document_chunk",
            source_ref: "architecture.md#overview",
            score: 2.8,
            excerpt: "Customer IDs overlap across imported sheets."
          }
        ]
      }
    ];
    render(
      <Workspace graph={graph} messages={evidenceMessages} suggestions={suggestions} />
    );

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "查看证据 Architecture overview"
      })
    );

    const evidenceInspector = screen
      .getByRole("heading", { name: "关系证据" })
      .closest(".evidence-inspector");
    expect(evidenceInspector).not.toBeNull();
    expect(
      within(evidenceInspector as HTMLElement).getByText(
        "Customer IDs overlap across imported sheets."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens source inspection from relationship evidence refs", () => {
    const architectureSources: SourceDetail[] = [
      {
        id: 99,
        import_item_id: 199,
        title: "architecture.md",
        document_type: "markdown",
        source_ref: "architecture.md",
        metadata: { path: "architecture.md" },
        chunk_count: 1,
        entity_count: 1,
        relationship_count: 1,
        created_at: "2026-06-02T00:00:00Z"
      }
    ];
    const architectureChunks: Record<number, DocumentChunk[]> = {
      99: [
        {
          id: 299,
          document_id: 99,
          chunk_index: 0,
          heading: "Overview",
          content: "Customer IDs overlap across imported sheets.",
          token_count: 6,
          source_ref: "architecture.md#overview",
          content_hash: "architecture",
          metadata: {},
          created_at: "2026-06-02T00:00:00Z"
        }
      ]
    };

    render(
      <Workspace
        graph={graph}
        sourceChunksBySourceId={architectureChunks}
        sourceDetails={architectureSources}
        suggestions={suggestions}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "展开图谱工具" }));
    fireEvent.click(within(getRelationshipShelf()).getByText("外键 · 94% · 建议"));
    const evidenceRefs = screen.getByRole("region", { name: "证据来源" });
    expect(within(evidenceRefs).getByText("architecture.md")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开证据来源 architecture.md#overview" }));

    expect(screen.getByRole("button", { name: "选择来源 architecture.md" })).toHaveClass(
      "is-selected"
    );
    const sourceInspector = screen
      .getByRole("heading", { name: "来源检查" })
      .closest(".source-inspector");
    expect(sourceInspector).not.toBeNull();
    expect(
      within(sourceInspector as HTMLElement).getByText("architecture.md", {
        selector: ".source-inspector-ref"
      })
    ).toBeInTheDocument();
    expect(
      within(sourceInspector as HTMLElement).getByText(
        "Customer IDs overlap across imported sheets."
      )
    ).toBeInTheDocument();
    expect(
      within(sourceInspector as HTMLElement)
        .getByText("Customer IDs overlap across imported sheets.")
        .closest("li")
    ).toHaveClass("is-focused");

    fireEvent.click(screen.getByRole("button", { name: "在图谱中查看 architecture.md#overview" }));

    const returnedInspector = screen
      .getByRole("heading", { name: "关系证据" })
      .closest(".evidence-inspector");
    expect(returnedInspector).not.toBeNull();
    expect(
      within(returnedInspector as HTMLElement).getByText(
        "Customer IDs overlap across imported sheets."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens source inspection when evidence ref casing differs from source refs", () => {
    const caseMismatchGraph: GraphResponse = {
      ...graph,
      edges: graph.edges.map((edge) =>
        edge.id === 11
          ? {
              ...edge,
              evidence_refs: ["suggestion:0", "Architecture.md#Overview"]
            }
          : edge
      )
    };
    const mixedSources: SourceDetail[] = [
      {
        id: 98,
        import_item_id: 198,
        title: "README.md",
        document_type: "markdown",
        source_ref: "README.md",
        metadata: { path: "README.md" },
        chunk_count: 1,
        entity_count: 0,
        relationship_count: 0,
        created_at: "2026-06-02T00:00:00Z"
      },
      {
        id: 99,
        import_item_id: 199,
        title: "architecture.md",
        document_type: "markdown",
        source_ref: "architecture.md",
        metadata: { path: "architecture.md" },
        chunk_count: 1,
        entity_count: 1,
        relationship_count: 1,
        created_at: "2026-06-02T00:00:00Z"
      }
    ];
    const mixedChunks: Record<number, DocumentChunk[]> = {
      98: [
        {
          id: 298,
          document_id: 98,
          chunk_index: 0,
          heading: "README",
          content: "Default source content.",
          token_count: 4,
          source_ref: "README.md#overview",
          content_hash: "readme",
          metadata: {},
          created_at: "2026-06-02T00:00:00Z"
        }
      ],
      99: [
        {
          id: 299,
          document_id: 99,
          chunk_index: 0,
          heading: "Overview",
          content: "Customer IDs overlap across imported sheets.",
          token_count: 6,
          source_ref: "architecture.md#overview",
          content_hash: "architecture",
          metadata: {},
          created_at: "2026-06-02T00:00:00Z"
        }
      ]
    };

    render(
      <Workspace
        graph={caseMismatchGraph}
        sourceChunksBySourceId={mixedChunks}
        sourceDetails={mixedSources}
        suggestions={suggestions}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "展开图谱工具" }));
    fireEvent.click(within(getRelationshipShelf()).getByText("外键 · 94% · 建议"));
    fireEvent.click(screen.getByRole("button", { name: "打开证据来源 Architecture.md#Overview" }));

    expect(screen.getByRole("button", { name: "选择来源 architecture.md" })).toHaveClass(
      "is-selected"
    );
    const sourceInspector = screen
      .getByRole("heading", { name: "来源检查" })
      .closest(".source-inspector");
    expect(sourceInspector).not.toBeNull();
    expect(
      within(sourceInspector as HTMLElement).getByText(
        "Customer IDs overlap across imported sheets."
      )
    ).toBeInTheDocument();
    expect(
      within(sourceInspector as HTMLElement)
        .getByText("Customer IDs overlap across imported sheets.")
        .closest("li")
    ).toHaveClass("is-focused");
  });

  it("opens graph action evidence by canonical evidence refs", () => {
    const evidenceRefActionMessages: ChatMessage[] = [
      {
        role: "assistant",
        content: "打开文档证据。",
        graph_actions: [
          {
            id: "open-document-evidence",
            type: "open_evidence",
            label: "打开文档证据",
            description: "打开文档片段关联的图谱关系。",
            node_ids: [],
            edge_ids: [],
            suggestion_ids: [],
            evidence_refs: ["architecture.md#overview"],
            metadata: {}
          }
        ]
      }
    ];
    render(
      <Workspace graph={graph} messages={evidenceRefActionMessages} suggestions={suggestions} />
    );

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "执行图谱动作 打开文档证据" }));

    const evidenceInspector = screen
      .getByRole("heading", { name: "关系证据" })
      .closest(".evidence-inspector");
    expect(evidenceInspector).not.toBeNull();
    expect(
      within(evidenceInspector as HTMLElement).getByText(
        "Customer IDs overlap across imported sheets."
      )
    ).toBeInTheDocument();
  });

  it("executes AI graph actions from chat answers", () => {
    render(<Workspace graph={graph} messages={actionMessages} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "执行图谱动作 高亮图谱路径" }));

    expect(screen.getAllByText("已执行").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("AI 分析活动")).toBeInTheDocument();
    expect(screen.getAllByText("已执行动作。").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("7 节点 · 1 关系 · 1 建议 · 1 证据")).toBeInTheDocument();
    expect(screen.getByText("AI 路径：3 个项目")).toBeInTheDocument();
    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass("is-highlighted");
    expect(getSemanticNodeByText("Customers.customer_id")).toHaveClass("is-highlighted");

    fireEvent.click(screen.getByRole("button", { name: "执行图谱动作 打开证据" }));

    const evidenceInspector = screen
      .getByRole("heading", { name: "关系证据" })
      .closest(".evidence-inspector");
    expect(evidenceInspector).not.toBeNull();
    expect(
      within(evidenceInspector as HTMLElement).getByText(
        "Customer IDs overlap across imported sheets."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "执行图谱动作 查看待审核关系" }));

    expect(screen.getByRole("tab", { name: "审核" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "洞察" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "执行图谱动作 聚焦节点" }));

    expect(screen.getByRole("heading", { name: "节点详情" })).toBeInTheDocument();
    expect(screen.getByText("节点：Orders.customer_id")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");
  });

  it("reports failed AI graph actions without changing the evidence panel", () => {
    render(
      <Workspace graph={graph} messages={invalidActionMessages} suggestions={suggestions} />
    );

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "执行图谱动作 打开缺失证据" }));

    expect(screen.getByText("AI 分析活动")).toBeInTheDocument();
    expect(screen.getAllByText("失败").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("当前图谱中找不到动作目标。").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("heading", { name: "关系证据" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI" })).toHaveAttribute("aria-selected", "true");
  });

  it("highlights graph paths from suggestion-only AI graph actions", () => {
    render(
      <Workspace graph={graph} messages={suggestionOnlyActionMessages} suggestions={suggestions} />
    );

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "执行图谱动作 高亮建议路径" }));

    expect(screen.getByText("AI 分析活动")).toBeInTheDocument();
    expect(screen.getAllByText("已执行").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("当前图谱中找不到动作目标。")).not.toBeInTheDocument();
    expect(screen.getByText("2 节点 · 1 关系 · 1 建议 · 0 证据")).toBeInTheDocument();
    expect(screen.getByText("AI 路径：3 个项目")).toBeInTheDocument();
    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass("is-highlighted");
    expect(getSemanticNodeByText("Customers.customer_id")).toHaveClass("is-highlighted");
  });

  it("clears AI action highlights and marks the action reverted", () => {
    render(<Workspace graph={graph} messages={actionMessages} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "执行图谱动作 高亮图谱路径" }));

    expect(screen.getByText("AI 路径：3 个项目")).toBeInTheDocument();
    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass("is-highlighted");

    fireEvent.click(screen.getByRole("button", { name: "清除图谱动作 高亮图谱路径" }));

    expect(screen.getAllByText("已撤销").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("已清除 AI 高亮。").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("AI 路径：3 个项目")).not.toBeInTheDocument();
    expect(getSemanticNodeByText("Orders.customer_id")).not.toHaveClass("is-highlighted");
  });

  it("clears AI activity history without removing chat answers", () => {
    render(<Workspace graph={graph} messages={actionMessages} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "执行图谱动作 高亮图谱路径" }));

    expect(screen.getByText("AI 分析活动")).toBeInTheDocument();
    expect(screen.getByText("有 1 条关系需要人工确认：Orders.customer_id -> Customers.customer_id。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清空 AI 分析活动" }));

    expect(screen.queryByText("AI 分析活动")).not.toBeInTheDocument();
    expect(screen.getByText("有 1 条关系需要人工确认：Orders.customer_id -> Customers.customer_id。")).toBeInTheDocument();
  });

  it("selects isolated graph quality preview nodes from the review panel", () => {
    const qualityGraph: GraphResponse = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: 20,
          node_type: "field",
          label: "Products.sku",
          source_ref: "products.sku",
          metadata: { inferred_type: "identifier" },
          position_x: 640,
          position_y: 240
        }
      ]
    };

    render(<Workspace graph={qualityGraph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("tab", { name: "审核" }));
    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "isolated" }
    });
    fireEvent.click(screen.getByRole("button", { name: "定位孤立节点 Products.sku" }));

    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "节点详情" })).toBeInTheDocument();
    expect(screen.getByText("节点：Products.sku")).toBeInTheDocument();
  });

  it("selects weak-evidence graph quality preview relationships from the review panel", () => {
    const qualityGraph: GraphResponse = {
      ...graph,
      edges: [
        ...graph.edges,
        {
          id: 20,
          source_node_id: 2,
          target_node_id: 3,
          edge_type: "foreign_key",
          confidence: 0.52,
          status: "suggested",
          evidence_ref: "",
          created_from_suggestion_id: 8,
          metadata: {},
          evidence_summary: null,
          evidence_payload: null
        }
      ]
    };

    render(<Workspace graph={qualityGraph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("tab", { name: "审核" }));
    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "weakEvidence" }
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "定位弱证据关系 Orders.customer_id → Customers.customer_id"
      })
    );

    const evidenceInspector = screen
      .getByRole("heading", { name: "关系证据" })
      .closest(".evidence-inspector");
    expect(evidenceInspector).not.toBeNull();
    expect(within(evidenceInspector as HTMLElement).getByText("52%")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");
    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass("is-highlighted");
    expect(getSemanticNodeByText("Customers.customer_id")).toHaveClass("is-highlighted");
  });

  it("surfaces guarded bulk remediation guidance for non-duplicate graph quality filters", () => {
    const qualityGraph: GraphResponse = {
      ...graph,
      edges: [
        ...graph.edges,
        {
          id: 20,
          source_node_id: 2,
          target_node_id: 3,
          edge_type: "foreign_key",
          confidence: 0.52,
          status: "suggested",
          evidence_ref: "",
          created_from_suggestion_id: 8,
          metadata: {},
          evidence_summary: null,
          evidence_payload: null
        }
      ]
    };

    render(<Workspace graph={qualityGraph} suggestions={suggestions} />);

    fireEvent.click(screen.getByRole("tab", { name: "审核" }));
    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "weakEvidence" }
    });

    const quality = screen.getByRole("region", { name: "图谱质量运营" });
    expect(
      within(quality).getByText("批量治理准备度：需逐条检查弱证据关系，补充证据或拒绝后再治理。")
    ).toBeInTheDocument();
    expect(within(quality).getByRole("button", { name: "批量治理未解锁" })).toBeDisabled();
    expect(
      within(quality).getByRole("button", {
        name: "定位弱证据关系 Orders.customer_id → Customers.customer_id"
      })
    ).toBeInTheDocument();
  });

  it("opens review queues from graph quality pending and duplicate filters", () => {
    const duplicateSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 7,
        source_label: "Orders.customer_id"
      },
      {
        ...suggestions[1],
        id: 8,
        source_label: "Orders.customer_id_copy"
      },
      {
        ...suggestions[1],
        id: 9,
        source_label: "Orders.region",
        target_label: "Customers.region"
      }
    ];
    const relationshipGovernance = {
      total_suggestion_count: 3,
      visible_suggestion_count: 3,
      duplicate_suggestion_count: 1,
      duplicate_group_count: 1,
      pending_suggestion_count: 3,
      accepted_suggestion_count: 0,
      rejected_suggestion_count: 0,
      edited_suggestion_count: 0,
      duplicate_groups: [
        {
          canonical_suggestion_id: 7,
          duplicate_suggestion_ids: [8],
          source_label: "Orders.customer_id",
          target_label: "Customers.customer_id",
          relationship_type: "foreign_key"
        }
      ]
    };

    render(
      <Workspace
        graph={graph}
        relationshipGovernance={relationshipGovernance}
        suggestions={duplicateSuggestions}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "审核" }));
    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "pending" }
    });
    fireEvent.click(screen.getByRole("button", { name: "打开待审核队列" }));

    expect(screen.getByRole("tab", { name: "洞察" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("已打开待确认关系审核，并定位到第一条匹配建议。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "待处理 3" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "duplicates" }
    });
    fireEvent.click(screen.getByRole("button", { name: "打开重复治理队列" }));

    expect(screen.getByText("已打开重复关系审核，并定位到第一条匹配建议。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重复治理 2" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    const reviewPanel = screen.getByRole("region", { name: "关系建议" });
    expect(within(reviewPanel).getByText("Orders.customer_id")).toBeInTheDocument();
    expect(within(reviewPanel).getByText("Orders.customer_id_copy")).toBeInTheDocument();
    expect(within(reviewPanel).queryByText("Orders.region")).not.toBeInTheDocument();
  });

  it("runs duplicate cleanup from the graph quality duplicate filter", () => {
    const onCleanupDuplicateRelationships = vi.fn();
    const duplicateSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 7,
        source_label: "Orders.customer_id"
      },
      {
        ...suggestions[1],
        id: 8,
        source_label: "Orders.customer_id_copy"
      }
    ];
    const relationshipGovernance = {
      total_suggestion_count: 2,
      visible_suggestion_count: 2,
      duplicate_suggestion_count: 1,
      duplicate_group_count: 1,
      pending_suggestion_count: 2,
      accepted_suggestion_count: 0,
      rejected_suggestion_count: 0,
      edited_suggestion_count: 0,
      duplicate_groups: [
        {
          canonical_suggestion_id: 7,
          duplicate_suggestion_ids: [8],
          source_label: "Orders.customer_id",
          target_label: "Customers.customer_id",
          relationship_type: "foreign_key"
        }
      ]
    };

    render(
      <Workspace
        graph={graph}
        onCleanupDuplicateRelationships={onCleanupDuplicateRelationships}
        relationshipGovernance={relationshipGovernance}
        suggestions={duplicateSuggestions}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "审核" }));
    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "duplicates" }
    });
    fireEvent.click(screen.getByRole("button", { name: "清理重复组" }));

    expect(onCleanupDuplicateRelationships).toHaveBeenCalledTimes(1);
  });

  it("selects entity match and mapping review quality previews from the review panel", () => {
    const entityReviews: EntityMatchReview[] = [
      {
        ...entityMatchReviews[0],
        source_node_id: 2,
        target_node_id: 31,
        source_label: "Orders.customer_id",
        target_label: "Customer"
      }
    ];
    const mappings: EntityMatchReview[] = [
      {
        ...mappingReviews[0],
        source_node_id: 2,
        target_node_id: 3,
        source_label: "Orders.customer_id",
        target_label: "Customers.customer_id"
      }
    ];

    render(
      <Workspace
        entityMatchReviews={entityReviews}
        graph={graph}
        mappingReviews={mappings}
        suggestions={suggestions}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "审核" }));
    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "entityMatches" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "定位实体匹配 Orders.customer_id → Customer" })
    );

    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("节点：Orders.customer_id")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "审核" }));
    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "mappingReviews" }
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "定位映射审核 Orders.customer_id → Customers.customer_id"
      })
    );

    expect(screen.getByRole("tab", { name: "证据" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("节点：Orders.customer_id")).toBeInTheDocument();
  });

  it("clears global AI answer highlights when reverting an action", () => {
    function ControlledWorkspace() {
      const [path, setPath] = useState([2, 3, 11]);
      return (
        <Workspace
          graph={graph}
          highlightedGraphPath={path}
          messages={actionMessages}
          onClearHighlightedGraphPath={() => setPath([])}
          suggestions={suggestions}
        />
      );
    }

    render(<ControlledWorkspace />);

    expect(screen.getByText("AI 路径：3 个项目")).toBeInTheDocument();
    expect(getSemanticNodeByText("Orders.customer_id")).toHaveClass("is-highlighted");

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "执行图谱动作 高亮图谱路径" }));
    fireEvent.click(screen.getByRole("button", { name: "清除图谱动作 高亮图谱路径" }));

    expect(screen.getAllByText("已撤销").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("AI 路径：3 个项目")).not.toBeInTheDocument();
    expect(getSemanticNodeByText("Orders.customer_id")).not.toHaveClass("is-highlighted");
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
