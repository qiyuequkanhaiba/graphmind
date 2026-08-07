import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GraphResponse,
  RelationshipGovernanceSummary,
  ReviewAnalytics,
  ReviewAnalyticsSnapshotCleanupEvent,
  ReviewAnalyticsTrend,
  RelationshipSuggestion
} from "../src/api/types";
import RelationshipReview from "../src/components/RelationshipReview";
import Workspace from "../src/components/Workspace";

const suggestions: RelationshipSuggestion[] = [
  {
    id: 7,
    source_field_id: 2,
    target_field_id: 3,
    source_label: "Orders.customer_id",
    target_label: "Customers.customer_id",
    relationship_type: "same_entity",
    confidence: 0.92,
    evidence_summary: "Values overlap strongly.",
    evidence_payload: { overlap_count: 2, source_distinct_count: 2, source_match_ratio: 1 },
    decision_status: "pending",
    quality_label: "high",
    review_priority: "high",
    quality_reasons: ["confidence:high", "high_source_match"]
  }
];

const graph: GraphResponse = {
  nodes: [],
  edges: []
};

const governanceSummary: RelationshipGovernanceSummary = {
  total_suggestion_count: 3,
  visible_suggestion_count: 2,
  duplicate_suggestion_count: 1,
  duplicate_group_count: 1,
  pending_suggestion_count: 2,
  accepted_suggestion_count: 1,
  rejected_suggestion_count: 0,
  edited_suggestion_count: 0,
  duplicate_groups: [
    {
      canonical_suggestion_id: 7,
      duplicate_suggestion_ids: [8],
      source_label: "Orders.customer_id",
      target_label: "Customers.customer_id",
      relationship_type: "same_entity"
    }
  ]
};

const reviewAnalytics: ReviewAnalytics = {
  window_days: 30,
  generated_at: "2026-06-08T00:00:00.000Z",
  sla: {
    pending_sla_days: 3,
    pending_total: 2,
    overdue_pending_count: 1,
    oldest_pending_age_days: 9
  },
  aging_buckets: {
    "0_1_days": 1,
    "2_3_days": 0,
    "4_7_days": 0,
    "8_plus_days": 1
  },
  decision_trend: {
    accepted: 1,
    edited: 1,
    pending: 2,
    rejected: 1
  },
  quality_distribution: {
    high: 2,
    medium: 2,
    low: 1
  },
  evidence_coverage: {
    with_evidence_count: 3,
    without_evidence_count: 2,
    coverage_ratio: 0.6
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
          pending_total: 5,
          overdue_pending_count: 2,
          oldest_pending_age_days: 11
        },
        evidence_coverage: {
          with_evidence_count: 7,
          without_evidence_count: 3,
          coverage_ratio: 0.7
        }
      }
    },
    {
      snapshot_date: "2026-06-08",
      analytics: reviewAnalytics
    }
  ]
};

const reviewAnalyticsSnapshotCleanupEvents: ReviewAnalyticsSnapshotCleanupEvent[] = [
  {
    id: 9,
    project_id: 3,
    retention_days: 90,
    cutoff_date: "2026-03-13",
    removed_count: 2,
    remaining_count: 4,
    created_at: "2026-06-11T08:30:00+00:00"
  }
];

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

describe("RelationshipReview", () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("renders relationship suggestion cards with review actions", () => {
    render(<RelationshipReview suggestions={suggestions} onReview={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "关系审核" })).toBeInTheDocument();
    expect(screen.getByText("Orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("Customers.customer_id")).toBeInTheDocument();
    expect(screen.getByText("同一实体")).toBeInTheDocument();
    expect(screen.getByText("高质量")).toBeInTheDocument();
    expect(screen.getAllByText("高优先级").length).toBeGreaterThan(0);
    expect(
      screen.getByText("2 个源字段不同取值中有 2 个与目标字段重合；源字段匹配率 100%。")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "接受关系" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑关系" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "拒绝关系" })).toBeInTheDocument();
  });

  it("calls onReview with the selected decision status", () => {
    const onReview = vi.fn();
    render(<RelationshipReview suggestions={suggestions} onReview={onReview} />);

    fireEvent.change(screen.getByLabelText("审核人"), {
      target: { value: "ops-reviewer" }
    });
    fireEvent.click(screen.getByRole("button", { name: "接受关系" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑关系" }));
    fireEvent.click(screen.getByRole("button", { name: "拒绝关系" }));

    expect(onReview).toHaveBeenNthCalledWith(1, 7, "accepted", "ops-reviewer");
    expect(onReview).toHaveBeenNthCalledWith(2, 7, "edited", "ops-reviewer");
    expect(onReview).toHaveBeenNthCalledWith(3, 7, "rejected", "ops-reviewer");
  });

  it("renders an empty state when there are no suggestions", () => {
    render(<RelationshipReview suggestions={[]} onReview={vi.fn()} />);

    expect(screen.getByText("暂无关系建议。")).toBeInTheDocument();
  });

  it("shows governance summary and triggers duplicate cleanup", () => {
    const onCleanupDuplicates = vi.fn();
    render(
      <RelationshipReview
        governanceSummary={governanceSummary}
        onCleanupDuplicates={onCleanupDuplicates}
        onReview={vi.fn()}
        suggestions={suggestions}
      />
    );

    expect(screen.getByText("治理摘要")).toBeInTheDocument();
    expect(screen.getByText("3 条总建议")).toBeInTheDocument();
    expect(screen.getByText("1 条重复")).toBeInTheDocument();
    expect(screen.getByText("2 条待审核")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清理重复关系建议" }));

    expect(onCleanupDuplicates).toHaveBeenCalledTimes(1);
  });

  it("renders a review operations summary for handoff readiness", () => {
    const mixedSuggestions: RelationshipSuggestion[] = [
      ...suggestions,
      {
        ...suggestions[0],
        id: 8,
        source_label: "Orders.region",
        target_label: "Regions.code",
        confidence: 0.42,
        evidence_summary: "",
        evidence_payload: {},
        quality_label: "low",
        review_priority: "high"
      },
      {
        ...suggestions[0],
        id: 9,
        source_label: "Orders.created_at",
        decision_status: "accepted",
        review_priority: "low"
      },
      {
        ...suggestions[0],
        id: 10,
        source_label: "Orders.account_id",
        decision_status: "rejected",
        review_priority: "low"
      },
      {
        ...suggestions[0],
        id: 11,
        source_label: "Orders.product_id",
        decision_status: "edited",
        review_priority: "low"
      }
    ];

    render(
      <RelationshipReview
        governanceSummary={governanceSummary}
        onReview={vi.fn()}
        suggestions={mixedSuggestions}
      />
    );

    const summary = screen.getByRole("region", { name: "审核运营摘要" });

    expect(within(summary).getByText("5 条总建议")).toBeInTheDocument();
    expect(within(summary).getByText("2 条待处理")).toBeInTheDocument();
    expect(within(summary).getByText("2 条高优先级")).toBeInTheDocument();
    expect(within(summary).getByText("1 条低质量待处理")).toBeInTheDocument();
    expect(within(summary).getByText("证据覆盖 80%")).toBeInTheDocument();
    expect(within(summary).getByText("建议先处理低质量待确认关系。")).toBeInTheDocument();
    expect(within(summary).getByText("已接受 1 · 已拒绝 1 · 已编辑 1")).toBeInTheDocument();
  });

  it("renders aged pending metrics when suggestion timestamps are available", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-08T12:00:00.000Z"));
    const agedSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 81,
        confidence: 0.74,
        created_at: "2026-05-30T00:00:00.000Z",
        quality_label: "medium",
        review_priority: "medium"
      },
      {
        ...suggestions[0],
        id: 82,
        confidence: 0.78,
        created_at: "2026-06-03T13:00:00.000Z",
        quality_label: "medium",
        review_priority: "medium"
      }
    ];

    render(<RelationshipReview suggestions={agedSuggestions} onReview={vi.fn()} />);

    const summary = screen.getByRole("region", { name: "审核运营摘要" });

    expect(within(summary).getByText("1 条超期待处理")).toBeInTheDocument();
    expect(within(summary).getByText("最久 9 天")).toBeInTheDocument();
    expect(within(summary).getByText("建议先处理等待时间最长的关系。")).toBeInTheDocument();
  });

  it("renders backend SLA and trend analytics when available", () => {
    render(
      <RelationshipReview
        reviewAnalytics={reviewAnalytics}
        suggestions={suggestions}
        onReview={vi.fn()}
      />
    );

    const analytics = screen.getByRole("region", { name: "SLA 趋势分析" });

    expect(within(analytics).getByText("30 天窗口")).toBeInTheDocument();
    expect(within(analytics).getByText("SLA 3 天")).toBeInTheDocument();
    expect(within(analytics).getByText("1 条超期")).toBeInTheDocument();
    expect(within(analytics).getByText("最久 9 天")).toBeInTheDocument();
    expect(within(analytics).getByText("接受 1 · 编辑 1 · 拒绝 1")).toBeInTheDocument();
    expect(within(analytics).getByText("证据覆盖 60%")).toBeInTheDocument();
    expect(within(analytics).getByText("8+天")).toBeInTheDocument();
  });

  it("renders persisted review analytics snapshots when available", () => {
    const onTrendDaysChange = vi.fn();
    render(
      <RelationshipReview
        reviewAnalytics={reviewAnalytics}
        reviewAnalyticsTrend={reviewAnalyticsTrend}
        reviewAnalyticsTrendDays={14}
        suggestions={suggestions}
        onReviewAnalyticsTrendDaysChange={onTrendDaysChange}
        onReview={vi.fn()}
      />
    );

    const analytics = screen.getByRole("region", { name: "SLA 趋势分析" });

    expect(within(analytics).getByLabelText("趋势快照范围")).toHaveValue("14");
    fireEvent.change(within(analytics).getByLabelText("趋势快照范围"), {
      target: { value: "30" }
    });
    expect(onTrendDaysChange).toHaveBeenCalledWith(30);
    expect(within(analytics).getByText("2 个快照")).toBeInTheDocument();
    expect(within(analytics).getByText("超期 2 → 1")).toBeInTheDocument();
    expect(within(analytics).getByText("证据覆盖 70% → 60%")).toBeInTheDocument();
    const chart = within(analytics).getByRole("list", { name: "SLA 趋势快照" });
    expect(within(chart).getByText("2026-06-07")).toBeInTheDocument();
    expect(within(chart).getByText("2026-06-08")).toBeInTheDocument();
    expect(within(chart).getByText("超期 2")).toBeInTheDocument();
    expect(within(chart).getByText("最久 11 天")).toBeInTheDocument();
    expect(within(chart).getByText("证据 70%")).toBeInTheDocument();
    expect(within(chart).getByText("超期 1")).toBeInTheDocument();
    expect(within(chart).getByText("最久 9 天")).toBeInTheDocument();
    expect(within(chart).getByText("证据 60%")).toBeInTheDocument();
  });

  it("renders analytics snapshot governance and triggers cleanup", () => {
    const onCleanupAnalyticsSnapshots = vi.fn();
    render(
      <RelationshipReview
        reviewAnalytics={reviewAnalytics}
        reviewAnalyticsSnapshotSummary={{
          retention_days: 30,
          snapshot_count: 4,
          expired_snapshot_count: 2,
          oldest_snapshot_date: "2026-03-05",
          latest_snapshot_date: "2026-06-10"
        }}
        suggestions={suggestions}
        onCleanupAnalyticsSnapshots={onCleanupAnalyticsSnapshots}
        onReview={vi.fn()}
      />
    );

    const analytics = screen.getByRole("region", { name: "SLA 趋势分析" });

    expect(within(analytics).getByText("4 个快照")).toBeInTheDocument();
    expect(within(analytics).getByText("2 个过期")).toBeInTheDocument();
    expect(within(analytics).getAllByText("保留 30 天").length).toBeGreaterThan(0);
    expect(within(analytics).getByLabelText("快照保留周期")).toHaveValue("30");

    fireEvent.click(within(analytics).getByRole("button", { name: "清理过期快照" }));

    expect(onCleanupAnalyticsSnapshots).toHaveBeenCalledWith(30);
    expect(within(analytics).getByRole("status")).toHaveTextContent(
      "已按 30 天保留策略清理 2 个过期快照"
    );
  });

  it("uses the selected retention window and records local cleanup history", () => {
    const onCleanupAnalyticsSnapshots = vi.fn();
    render(
      <RelationshipReview
        reviewAnalytics={reviewAnalytics}
        reviewAnalyticsSnapshotSummary={{
          retention_days: 30,
          snapshot_count: 4,
          expired_snapshot_count: 2,
          oldest_snapshot_date: "2026-03-05",
          latest_snapshot_date: "2026-06-10"
        }}
        suggestions={suggestions}
        onCleanupAnalyticsSnapshots={onCleanupAnalyticsSnapshots}
        onReview={vi.fn()}
      />
    );

    const analytics = screen.getByRole("region", { name: "SLA 趋势分析" });

    fireEvent.change(within(analytics).getByLabelText("快照保留周期"), {
      target: { value: "90" }
    });
    fireEvent.click(within(analytics).getByRole("button", { name: "清理过期快照" }));

    expect(onCleanupAnalyticsSnapshots).toHaveBeenCalledWith(90);
    expect(within(analytics).getByText("最近清理：90 天 · 2 个过期 · 4 个快照")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("graphmind.reviewAnalyticsSnapshotCleanup") ?? "[]")[0]).toEqual(
      expect.objectContaining({
        retentionDays: 90,
        expiredSnapshotCount: 2,
        snapshotCount: 4
      })
    );
  });

  it("prefers backend cleanup audit events over local cleanup history", () => {
    window.localStorage.setItem(
      "graphmind.reviewAnalyticsSnapshotCleanup",
      JSON.stringify([
        {
          cleanedAt: "2026-06-10T08:00:00.000Z",
          retentionDays: 30,
          expiredSnapshotCount: 1,
          snapshotCount: 3
        }
      ])
    );

    render(
      <RelationshipReview
        reviewAnalytics={reviewAnalytics}
        reviewAnalyticsSnapshotCleanupEvents={reviewAnalyticsSnapshotCleanupEvents}
        reviewAnalyticsSnapshotSummary={{
          retention_days: 30,
          snapshot_count: 4,
          expired_snapshot_count: 2,
          oldest_snapshot_date: "2026-03-05",
          latest_snapshot_date: "2026-06-10"
        }}
        suggestions={suggestions}
        onReview={vi.fn()}
      />
    );

    const analytics = screen.getByRole("region", { name: "SLA 趋势分析" });

    expect(
      within(analytics).getByText("最近清理：90 天 · 删除 2 个 · 保留 4 个")
    ).toBeInTheDocument();
    expect(
      within(analytics).queryByText("最近清理：30 天 · 1 个过期 · 3 个快照")
    ).not.toBeInTheDocument();
  });

  it("sorts pending suggestions by priority and confidence", () => {
    const unorderedSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 11,
        source_label: "Orders.region",
        target_label: "Customers.region",
        confidence: 0.87,
        review_priority: "medium"
      },
      {
        ...suggestions[0],
        id: 12,
        source_label: "Orders.created_at",
        target_label: "Calendar.date",
        confidence: 0.94,
        review_priority: "low"
      },
      {
        ...suggestions[0],
        id: 13,
        source_label: "Orders.customer_id",
        target_label: "Customers.customer_id",
        confidence: 0.91,
        review_priority: "high"
      },
      {
        ...suggestions[0],
        id: 14,
        source_label: "Orders.account_id",
        target_label: "Accounts.account_id",
        confidence: 0.96,
        review_priority: "high"
      }
    ];

    const { container } = render(
      <RelationshipReview suggestions={unorderedSuggestions} onReview={vi.fn()} />
    );

    const cards = Array.from(container.querySelectorAll(".review-card"));

    expect(cards).toHaveLength(4);
    expect(within(cards[0] as HTMLElement).getByText("Orders.account_id")).toBeInTheDocument();
    expect(within(cards[1] as HTMLElement).getByText("Orders.customer_id")).toBeInTheDocument();
    expect(within(cards[2] as HTMLElement).getByText("Orders.region")).toBeInTheDocument();
    expect(within(cards[3] as HTMLElement).getByText("Orders.created_at")).toBeInTheDocument();
  });

  it("expands translated quality reasons for a suggestion", () => {
    render(<RelationshipReview suggestions={suggestions} onReview={vi.fn()} />);

    expect(screen.queryByText("置信度高")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看质量原因" }));

    expect(screen.getByText("置信度高")).toBeInTheDocument();
    expect(screen.getByText("源字段匹配率高")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起质量原因" }));

    expect(screen.queryByText("置信度高")).not.toBeInTheDocument();
  });

  it("filters suggestions by high priority", () => {
    const mixedSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 21,
        source_label: "Orders.customer_id",
        target_label: "Customers.customer_id",
        review_priority: "high"
      },
      {
        ...suggestions[0],
        id: 22,
        source_label: "Orders.region",
        target_label: "Customers.region",
        review_priority: "medium"
      }
    ];

    render(<RelationshipReview suggestions={mixedSuggestions} onReview={vi.fn()} />);

    expect(screen.getByRole("button", { name: "全部 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "高优先级 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "高优先级 1" }));

    expect(screen.getByText("Orders.customer_id")).toBeInTheDocument();
    expect(screen.queryByText("Orders.region")).not.toBeInTheDocument();
  });

  it("uses an initial review filter from a parent shortcut", () => {
    const mixedSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 41,
        source_label: "Orders.customer_id",
        target_label: "Customers.customer_id",
        review_priority: "high"
      },
      {
        ...suggestions[0],
        id: 42,
        source_label: "Orders.region",
        target_label: "Customers.region",
        review_priority: "medium"
      }
    ];

    render(
      <RelationshipReview
        initialFilter="highPriority"
        suggestions={mixedSuggestions}
        onReview={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "高优先级 1" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("Orders.customer_id")).toBeInTheDocument();
    expect(screen.queryByText("Orders.region")).not.toBeInTheDocument();
  });

  it("persists and restores the selected review filter", () => {
    const mixedSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 61,
        source_label: "Orders.customer_id",
        review_priority: "high"
      },
      {
        ...suggestions[0],
        id: 62,
        source_label: "Orders.region",
        review_priority: "medium"
      }
    ];
    const { unmount } = render(
      <RelationshipReview suggestions={mixedSuggestions} onReview={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: "高优先级 1" }));

    expect(window.localStorage.getItem("graphmind.reviewFilter")).toBe("highPriority");

    unmount();
    render(<RelationshipReview suggestions={mixedSuggestions} onReview={vi.fn()} />);

    expect(screen.getByRole("button", { name: "高优先级 1" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("Orders.customer_id")).toBeInTheDocument();
    expect(screen.queryByText("Orders.region")).not.toBeInTheDocument();
  });

  it("exports the current filtered review audit report as JSON", async () => {
    let exportedBlob: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => {
      exportedBlob = blob;
      return "blob:graphmind-review-report";
    });
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const mixedSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 71,
        source_label: "Orders.customer_id",
        review_priority: "high"
      },
      {
        ...suggestions[0],
        id: 72,
        source_label: "Orders.region",
        review_priority: "medium"
      }
    ];

    render(
      <RelationshipReview
        governanceSummary={governanceSummary}
        reviewAnalytics={reviewAnalytics}
        reviewAnalyticsSnapshotCleanupEvents={reviewAnalyticsSnapshotCleanupEvents}
        reviewAnalyticsSnapshotSummary={{
          retention_days: 30,
          snapshot_count: 4,
          expired_snapshot_count: 2,
          oldest_snapshot_date: "2026-03-05",
          latest_snapshot_date: "2026-06-10"
        }}
        reviewAnalyticsTrend={reviewAnalyticsTrend}
        reviewAnalyticsTrendDays={14}
        suggestions={mixedSuggestions}
        onReview={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "高优先级 1" }));
    fireEvent.click(screen.getByRole("button", { name: "导出审核报告" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    if (!exportedBlob) {
      throw new Error("Expected review export to create a Blob");
    }
    const report = JSON.parse(await readBlobText(exportedBlob));

    expect(report.schema).toBe("graphmind.review-audit.v1");
    expect(report.activeFilter).toBe("highPriority");
    expect(report.visibleSuggestionIds).toEqual([71]);
    expect(report.reviewAnalyticsTrendSummary).toEqual({
      snapshotCount: 2,
      firstSnapshotDate: "2026-06-07",
      latestSnapshotDate: "2026-06-08",
      overduePendingDelta: -1,
      oldestPendingAgeDelta: -2,
      evidenceCoverageDeltaPercent: -10,
      firstOverduePendingCount: 2,
      latestOverduePendingCount: 1,
      firstEvidenceCoveragePercent: 70,
      latestEvidenceCoveragePercent: 60
    });
    expect(report.reviewAnalyticsTrendContext).toEqual({
      selectedTrendDays: 14,
      trendSnapshotCount: 2,
      trendWindowDays: 30,
      firstSnapshotDate: "2026-06-07",
      latestSnapshotDate: "2026-06-08"
    });
    expect(report.reviewAnalyticsSnapshotContext).toEqual({
      retentionDays: 30,
      snapshotCount: 4,
      expiredSnapshotCount: 2,
      oldestSnapshotDate: "2026-03-05",
      latestSnapshotDate: "2026-06-10",
      latestCleanupEvent: {
        id: 9,
        retentionDays: 90,
        cutoffDate: "2026-03-13",
        removedCount: 2,
        remainingCount: 4,
        createdAt: "2026-06-11T08:30:00+00:00"
      }
    });
    expect(report.suggestions).toHaveLength(1);
    expect(report.suggestions[0].sourceLabel).toBe("Orders.customer_id");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:graphmind-review-report");
  });

  it("marks the active filter and first matching card when a shortcut focuses the review queue", () => {
    const mixedSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 51,
        source_label: "Orders.customer_id",
        target_label: "Customers.customer_id",
        review_priority: "high"
      },
      {
        ...suggestions[0],
        id: 52,
        source_label: "Orders.region",
        target_label: "Customers.region",
        review_priority: "medium"
      }
    ];

    render(
      <RelationshipReview
        initialFilter="highPriority"
        shortcutFocusKey={1}
        suggestions={mixedSuggestions}
        onReview={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "高优先级 1" })).toHaveClass(
      "is-shortcut-focused"
    );
    expect(screen.getByText("Orders.customer_id").closest(".review-card")).toHaveClass(
      "is-shortcut-focused"
    );
    expect(screen.queryByText("Orders.region")).not.toBeInTheDocument();
  });

  it("filters suggestions by duplicate governance membership", () => {
    const duplicateSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 7,
        source_label: "Orders.customer_id"
      },
      {
        ...suggestions[0],
        id: 8,
        source_label: "Orders.customer_id_copy"
      },
      {
        ...suggestions[0],
        id: 9,
        source_label: "Orders.region"
      }
    ];

    render(
      <RelationshipReview
        governanceSummary={governanceSummary}
        onReview={vi.fn()}
        suggestions={duplicateSuggestions}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "重复治理 2" }));

    expect(screen.getByText("Orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("Orders.customer_id_copy")).toBeInTheDocument();
    expect(screen.queryByText("Orders.region")).not.toBeInTheDocument();
  });

  it("shows a filtered empty state when a filter has no matches", () => {
    const mediumSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 31,
        source_label: "Orders.region",
        review_priority: "medium"
      }
    ];

    render(<RelationshipReview suggestions={mediumSuggestions} onReview={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "高优先级 0" }));

    expect(screen.getByText("当前筛选条件下没有关系建议。")).toBeInTheDocument();
    expect(screen.queryByText("Orders.region")).not.toBeInTheDocument();
  });

  it("shows a low-confidence relationship recovery playbook", () => {
    render(
      <RelationshipReview
        suggestions={[
          {
            ...suggestions[0],
            confidence: 0.42,
            quality_label: "low",
            review_priority: "low",
            quality_reasons: ["confidence:low"]
          }
        ]}
        onReview={vi.fn()}
      />
    );

    const playbook = screen.getByRole("region", { name: "低置信关系处理建议" });
    expect(within(playbook).getByText("低置信关系处理建议")).toBeInTheDocument();
    expect(within(playbook).getByText("检查证据来源是否覆盖足够样本。")).toBeInTheDocument();
    expect(within(playbook).getByText("必要时编辑关系类型或拒绝该建议。")).toBeInTheDocument();
    expect(within(playbook).getByText("可导入补充文档或代码证据后再确认。")).toBeInTheDocument();
  });
});

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("Workspace relationship review panel", () => {
  it("renders relationship review when suggestions are provided", () => {
    render(<Workspace graph={graph} suggestions={suggestions} onReview={vi.fn()} />);

    const reviewPanel = screen.getByRole("region", { name: "关系建议" });

    expect(within(reviewPanel).getByRole("heading", { name: "关系审核" })).toBeInTheDocument();
    expect(within(reviewPanel).getByText("Orders.customer_id")).toBeInTheDocument();
  });

  it("renders relationship review with default props", () => {
    render(<Workspace graph={graph} />);

    fireEvent.click(screen.getByRole("tab", { name: "审核" }));
    const reviewPanel = screen.getByRole("region", { name: "关系建议" });

    expect(within(reviewPanel).getByRole("heading", { name: "关系审核" })).toBeInTheDocument();
    expect(within(reviewPanel).getByText("暂无关系建议。")).toBeInTheDocument();
  });
});
