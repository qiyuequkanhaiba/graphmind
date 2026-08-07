import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GraphResponse,
  GraphSelection,
  ProjectSettings,
  ReviewAnalytics,
  ReviewAnalyticsSnapshotSummary,
  ReviewAnalyticsTrend,
  RelationshipSuggestion
} from "../src/api/types";
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

const settings: ProjectSettings = {
  ai: {
    chat: {
      provider: "rules",
      model: "graphmind-rules",
      base_url: "",
      api_key: "",
      temperature: 0.1
    },
    vector: {
      provider: "none",
      model: "",
      base_url: "",
      api_key: "",
      dimensions: 0,
      index_status: "not_built",
      document_count: 0,
      last_built_at: null,
      embedding_model: ""
    }
  },
  review_analytics: {
    retention_days: 30,
    auto_cleanup_enabled: false
  }
};

const reviewAnalytics: ReviewAnalytics = {
  window_days: 30,
  generated_at: "2026-06-08T00:00:00.000Z",
  sla: {
    pending_sla_days: 3,
    pending_total: 1,
    overdue_pending_count: 1,
    oldest_pending_age_days: 8
  },
  aging_buckets: {
    "0_1_days": 0,
    "2_3_days": 0,
    "4_7_days": 0,
    "8_plus_days": 1
  },
  decision_trend: {
    accepted: 0,
    edited: 0,
    pending: 1,
    rejected: 0
  },
  quality_distribution: {
    high: 0,
    medium: 1,
    low: 0
  },
  evidence_coverage: {
    with_evidence_count: 1,
    without_evidence_count: 0,
    coverage_ratio: 1
  }
};

const reviewAnalyticsTrend: ReviewAnalyticsTrend = {
  window_days: 30,
  days: 14,
  generated_at: "2026-06-08T00:00:00.000Z",
  snapshots: [
    {
      snapshot_date: "2026-06-07",
      analytics: {
        ...reviewAnalytics,
        generated_at: "2026-06-07T00:00:00.000Z",
        sla: {
          pending_sla_days: 3,
          pending_total: 2,
          overdue_pending_count: 2,
          oldest_pending_age_days: 10
        },
        evidence_coverage: {
          with_evidence_count: 1,
          without_evidence_count: 1,
          coverage_ratio: 0.5
        }
      }
    },
    {
      snapshot_date: "2026-06-08",
      analytics: reviewAnalytics
    }
  ]
};

const reviewAnalyticsSnapshotSummary: ReviewAnalyticsSnapshotSummary = {
  retention_days: 30,
  snapshot_count: 4,
  expired_snapshot_count: 2,
  oldest_snapshot_date: "2026-03-05",
  latest_snapshot_date: "2026-06-10"
};

describe("InsightPanel", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value)
      }
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders 证据, 审核, and AI tabs", () => {
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
        settings={settings}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("tab", { name: "证据" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "审核" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "AI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "节点详情" })).toBeInTheDocument();
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
        settings={settings}
        suggestions={suggestions}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    expect(onTabChange).toHaveBeenCalledWith("ai");
  });

  it("passes review analytics into the review tab", () => {
    const onCleanupAnalyticsSnapshots = vi.fn();
    render(
      <InsightPanel
        activeTab="review"
        highlightedGraphPath={[]}
        messages={[]}
        onAsk={vi.fn()}
        onReview={vi.fn()}
        onTabChange={vi.fn()}
        reviewAnalytics={reviewAnalytics}
        reviewAnalyticsSnapshotSummary={reviewAnalyticsSnapshotSummary}
        reviewAnalyticsTrend={reviewAnalyticsTrend}
        onCleanupAnalyticsSnapshots={onCleanupAnalyticsSnapshots}
        selection={null}
        settings={settings}
        suggestions={suggestions}
      />
    );

    const analytics = screen.getByRole("region", { name: "SLA 趋势分析" });
    expect(within(analytics).getByText("1 条超期")).toBeInTheDocument();
    expect(within(analytics).getByText("证据覆盖 100%")).toBeInTheDocument();
    expect(within(analytics).getByText("超期 2 → 1")).toBeInTheDocument();
    expect(within(analytics).getByText("4 个快照")).toBeInTheDocument();
    expect(within(analytics).getByText("2 个过期")).toBeInTheDocument();

    fireEvent.change(within(analytics).getByLabelText("快照保留周期"), {
      target: { value: "90" }
    });
    fireEvent.click(within(analytics).getByRole("button", { name: "清理过期快照" }));
    expect(onCleanupAnalyticsSnapshots).toHaveBeenCalledWith(90);
  });

  it("supports arrow and Home/End keyboard navigation for insight tabs", () => {
    const onTabChange = vi.fn();
    render(
      <InsightPanel
        activeTab="evidence"
        highlightedGraphPath={[]}
        messages={[]}
        onAsk={vi.fn()}
        onReview={vi.fn()}
        onTabChange={onTabChange}
        selection={null}
        settings={settings}
        suggestions={suggestions}
      />
    );

    const evidenceTab = screen.getByRole("tab", { name: "证据" });

    fireEvent.keyDown(evidenceTab, { key: "ArrowRight" });
    expect(onTabChange).toHaveBeenLastCalledWith("review");
    expect(screen.getByRole("tab", { name: "审核" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("tab", { name: "审核" }), { key: "End" });
    expect(onTabChange).toHaveBeenLastCalledWith("ai");
    expect(screen.getByRole("tab", { name: "AI" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("tab", { name: "AI" }), { key: "Home" });
    expect(onTabChange).toHaveBeenLastCalledWith("evidence");
    expect(evidenceTab).toHaveFocus();
  });

  it("surfaces graph quality operations and persists the local quality filter", () => {
    const graphQualitySummary = {
      duplicateGroups: 1,
      entityMatchPreview: [],
      evidenceCoverageRatio: 0.67,
      evidenceCoveredRelationships: 2,
      isolatedNodes: 2,
      isolatedNodePreview: [
        {
          id: 4,
          label: "Products.sku",
          nodeType: "field",
          sourceRef: "products.sku"
        },
        {
          id: 5,
          label: "Customers.segment",
          nodeType: "field",
          sourceRef: "customers.segment"
        }
      ],
      mappingReviewPreview: [],
      pendingReviews: 3,
      relationshipCount: 3,
      unresolvedEntityMatches: 4,
      unresolvedMappingReviews: 2,
      weakEvidenceRelationshipPreview: [
        {
          confidence: 0.52,
          id: 11,
          label: "Orders.customer_id → Customers.customer_id",
          relationshipType: "foreign_key"
        }
      ],
      weakEvidenceRelationships: 1
    };
    const props = {
      activeTab: "review" as const,
      graphQualitySummary,
      highlightedGraphPath: [],
      messages: [],
      onAsk: vi.fn(),
      onReview: vi.fn(),
      selection: null,
      settings,
      suggestions
    };
    const { unmount } = render(<InsightPanel {...props} />);

    const quality = screen.getByRole("region", { name: "图谱质量运营" });
    expect(within(quality).getAllByText("孤立节点")).toHaveLength(2);
    expect(within(quality).getAllByText("弱证据关系")).toHaveLength(2);
    expect(within(quality).getAllByText("待审核")).toHaveLength(2);
    expect(within(quality).getAllByText("重复组")).toHaveLength(2);
    expect(within(quality).getByText("实体匹配待处理")).toBeInTheDocument();
    expect(within(quality).getByText("映射审核待处理")).toBeInTheDocument();
    expect(within(quality).getByRole("option", { name: "实体匹配" })).toBeInTheDocument();
    expect(within(quality).getByRole("option", { name: "映射审核" })).toBeInTheDocument();
    expect(metricValue(quality, "实体匹配待处理")).toBe("4");
    expect(metricValue(quality, "映射审核待处理")).toBe("2");
    expect(within(quality).getByText("证据覆盖率")).toBeInTheDocument();
    expect(within(quality).getByText("67%")).toBeInTheDocument();
    expect(within(quality).getByText("2/3 已覆盖")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "isolated" }
    });

    expect(within(quality).getByText("优先连接 2 个没有关系的节点。")).toBeInTheDocument();
    expect(within(quality).getByText("Products.sku")).toBeInTheDocument();
    expect(within(quality).getByText("products.sku")).toBeInTheDocument();
    expect(within(quality).getByText("Customers.segment")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "weakEvidence" }
    });

    expect(within(quality).getByText("补强或拒绝 1 条低置信/无证据关系。")).toBeInTheDocument();
    expect(within(quality).getByText("Orders.customer_id → Customers.customer_id")).toBeInTheDocument();
    expect(within(quality).getByText("foreign_key · 52%")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "entityMatches" }
    });

    expect(window.localStorage.getItem("graphmind.qualityFilter")).toBe("entityMatches");

    unmount();
    render(<InsightPanel {...props} />);

    expect(screen.getByLabelText("质量筛选")).toHaveValue("entityMatches");
  });

  it("routes pending and duplicate quality filters into review queues", () => {
    const onOpenQualityReviewFilter = vi.fn();
    const graphQualitySummary = {
      duplicateGroups: 1,
      entityMatchPreview: [],
      evidenceCoverageRatio: 0.67,
      evidenceCoveredRelationships: 2,
      isolatedNodes: 0,
      isolatedNodePreview: [],
      mappingReviewPreview: [],
      pendingReviews: 3,
      relationshipCount: 3,
      unresolvedEntityMatches: 0,
      unresolvedMappingReviews: 0,
      weakEvidenceRelationshipPreview: [],
      weakEvidenceRelationships: 0
    };

    render(
      <InsightPanel
        activeTab="review"
        graphQualitySummary={graphQualitySummary}
        highlightedGraphPath={[]}
        messages={[]}
        onAsk={vi.fn()}
        onOpenQualityReviewFilter={onOpenQualityReviewFilter}
        onReview={vi.fn()}
        selection={null}
        settings={settings}
        suggestions={suggestions}
      />
    );

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "pending" }
    });
    fireEvent.click(screen.getByRole("button", { name: "打开待审核队列" }));
    expect(onOpenQualityReviewFilter).toHaveBeenLastCalledWith("pending");

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "duplicates" }
    });
    fireEvent.click(screen.getByRole("button", { name: "打开重复治理队列" }));
    expect(onOpenQualityReviewFilter).toHaveBeenLastCalledWith("duplicates");
  });

  it("surfaces duplicate cleanup from the duplicate quality filter", () => {
    const onCleanupDuplicateRelationships = vi.fn();
    const graphQualitySummary = {
      duplicateGroups: 2,
      entityMatchPreview: [],
      evidenceCoverageRatio: 1,
      evidenceCoveredRelationships: 3,
      isolatedNodes: 0,
      isolatedNodePreview: [],
      mappingReviewPreview: [],
      pendingReviews: 3,
      relationshipCount: 3,
      unresolvedEntityMatches: 0,
      unresolvedMappingReviews: 0,
      weakEvidenceRelationshipPreview: [],
      weakEvidenceRelationships: 0
    };

    render(
      <InsightPanel
        activeTab="review"
        graphQualitySummary={graphQualitySummary}
        highlightedGraphPath={[]}
        messages={[]}
        onAsk={vi.fn()}
        onCleanupDuplicateRelationships={onCleanupDuplicateRelationships}
        onReview={vi.fn()}
        selection={null}
        settings={settings}
        suggestions={suggestions}
      />
    );

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "duplicates" }
    });
    fireEvent.click(screen.getByRole("button", { name: "清理重复组" }));

    expect(onCleanupDuplicateRelationships).toHaveBeenCalledTimes(1);
  });

  it("keeps non-duplicate bulk remediation guarded until manual review is complete", () => {
    const graphQualitySummary = {
      duplicateGroups: 0,
      entityMatchPreview: [
        {
          confidence: 0.81,
          id: 30,
          label: "Orders.customer_id → Customer",
          reviewType: "matches_entity",
          sourceNodeId: 2,
          targetNodeId: 31
        }
      ],
      evidenceCoverageRatio: 0.5,
      evidenceCoveredRelationships: 1,
      isolatedNodes: 2,
      isolatedNodePreview: [
        {
          id: 4,
          label: "Products.sku",
          nodeType: "field",
          sourceRef: "products.sku"
        }
      ],
      mappingReviewPreview: [
        {
          confidence: 0.84,
          id: 40,
          label: "Customer ID → customerId",
          reviewType: "documented_mapping",
          sourceNodeId: 2,
          targetNodeId: 3
        }
      ],
      pendingReviews: 0,
      relationshipCount: 2,
      unresolvedEntityMatches: 1,
      unresolvedMappingReviews: 1,
      weakEvidenceRelationshipPreview: [
        {
          confidence: 0.52,
          id: 11,
          label: "Orders.customer_id → Customers.customer_id",
          relationshipType: "foreign_key"
        }
      ],
      weakEvidenceRelationships: 1
    };

    render(
      <InsightPanel
        activeTab="review"
        graphQualitySummary={graphQualitySummary}
        highlightedGraphPath={[]}
        messages={[]}
        onAsk={vi.fn()}
        onReview={vi.fn()}
        selection={null}
        settings={settings}
        suggestions={suggestions}
      />
    );

    const quality = screen.getByRole("region", { name: "图谱质量运营" });

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "isolated" }
    });
    expect(
      within(quality).getByText("批量治理准备度：需逐个定位孤立节点，并补充关系证据后再治理。")
    ).toBeInTheDocument();
    expect(within(quality).getByRole("button", { name: "批量治理未解锁" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "weakEvidence" }
    });
    expect(
      within(quality).getByText("批量治理准备度：需逐条检查弱证据关系，补充证据或拒绝后再治理。")
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "entityMatches" }
    });
    expect(
      within(quality).getByText("批量治理准备度：需在实体匹配审核中逐项确认，暂不支持批量接受。")
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "mappingReviews" }
    });
    expect(
      within(quality).getByText("批量治理准备度：需在映射审核中逐项确认，暂不支持批量接受。")
    ).toBeInTheDocument();
  });

  it("renders entity match and mapping review quality previews as selectable rows", () => {
    const onSelectQualityPreview = vi.fn();
    const graphQualitySummary = {
      duplicateGroups: 0,
      entityMatchPreview: [
        {
          confidence: 0.81,
          id: 30,
          label: "Orders.customer_id → Customer",
          reviewType: "matches_entity",
          sourceNodeId: 2,
          targetNodeId: 31
        }
      ],
      evidenceCoverageRatio: 1,
      evidenceCoveredRelationships: 3,
      isolatedNodes: 0,
      isolatedNodePreview: [],
      mappingReviewPreview: [
        {
          confidence: 0.84,
          id: 40,
          label: "Customer ID → customerId",
          reviewType: "documented_mapping",
          sourceNodeId: 2,
          targetNodeId: 3
        }
      ],
      pendingReviews: 0,
      relationshipCount: 3,
      unresolvedEntityMatches: 1,
      unresolvedMappingReviews: 1,
      weakEvidenceRelationshipPreview: [],
      weakEvidenceRelationships: 0
    };

    render(
      <InsightPanel
        activeTab="review"
        graphQualitySummary={graphQualitySummary}
        highlightedGraphPath={[]}
        messages={[]}
        onAsk={vi.fn()}
        onReview={vi.fn()}
        onSelectQualityPreview={onSelectQualityPreview}
        selection={null}
        settings={settings}
        suggestions={suggestions}
      />
    );

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "entityMatches" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "定位实体匹配 Orders.customer_id → Customer" })
    );
    expect(onSelectQualityPreview).toHaveBeenLastCalledWith({
      id: 30,
      kind: "review",
      sourceNodeId: 2,
      targetNodeId: 31
    });

    fireEvent.change(screen.getByLabelText("质量筛选"), {
      target: { value: "mappingReviews" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "定位映射审核 Customer ID → customerId" })
    );
    expect(onSelectQualityPreview).toHaveBeenLastCalledWith({
      id: 40,
      kind: "review",
      sourceNodeId: 2,
      targetNodeId: 3
    });
  });
});

function metricValue(region: HTMLElement, label: string): string | null {
  return within(region).getByText(label).closest("div")?.querySelector("dd")?.textContent ?? null;
}
