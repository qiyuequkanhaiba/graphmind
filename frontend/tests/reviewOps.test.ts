import { describe, expect, it } from "vitest";
import type {
  RelationshipGovernanceSummary,
  ReviewAnalytics,
  ReviewAnalyticsSnapshotCleanupEvent,
  ReviewAnalyticsSnapshotSummary,
  ReviewAnalyticsTrend,
  RelationshipSuggestion
} from "../src/api/types";
import {
  buildReviewAuditReport,
  buildReviewOperationsSummary,
  filterRelationshipSuggestions,
  persistReviewFilter,
  readStoredReviewFilter
} from "../src/components/reviewOps";

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
    evidence_payload: { overlap_count: 2 },
    decision_status: "pending",
    quality_label: "high",
    review_priority: "high",
    quality_reasons: ["confidence:high"]
  },
  {
    id: 8,
    source_field_id: 4,
    target_field_id: 5,
    source_label: "Orders.region",
    target_label: "Regions.code",
    relationship_type: "foreign_key",
    confidence: 0.45,
    evidence_summary: "",
    evidence_payload: {},
    decision_status: "pending",
    quality_label: "low",
    review_priority: "high",
    quality_reasons: ["confidence:low"]
  },
  {
    id: 9,
    source_field_id: 6,
    target_field_id: null,
    source_label: "Orders.created_at",
    target_label: null,
    relationship_type: "derived_dimension",
    confidence: 0.81,
    evidence_summary: "Accepted date dimension.",
    evidence_payload: {},
    decision_status: "accepted",
    quality_label: "medium",
    review_priority: "low",
    quality_reasons: ["confidence:medium"]
  },
  {
    id: 10,
    source_field_id: 8,
    target_field_id: 9,
    source_label: "Orders.account_id",
    target_label: "Accounts.id",
    relationship_type: "same_entity",
    confidence: 0.66,
    evidence_summary: "Rejected by reviewer.",
    evidence_payload: {},
    decision_status: "rejected",
    quality_label: "medium",
    review_priority: "low",
    quality_reasons: ["human_review:medium"]
  },
  {
    id: 11,
    source_field_id: 10,
    target_field_id: 11,
    source_label: "Orders.product_id",
    target_label: "Products.id",
    relationship_type: "same_entity",
    confidence: 0.72,
    evidence_summary: "Edited relationship.",
    evidence_payload: {},
    decision_status: "edited",
    quality_label: "medium",
    review_priority: "low",
    quality_reasons: ["human_review:medium"]
  }
];

const governanceSummary: RelationshipGovernanceSummary = {
  total_suggestion_count: 5,
  visible_suggestion_count: 5,
  duplicate_suggestion_count: 1,
  duplicate_group_count: 1,
  pending_suggestion_count: 2,
  accepted_suggestion_count: 1,
  rejected_suggestion_count: 1,
  edited_suggestion_count: 1,
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
          ...reviewAnalytics.sla,
          pending_total: 4,
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

const reviewAnalyticsSnapshotSummary: ReviewAnalyticsSnapshotSummary = {
  retention_days: 90,
  snapshot_count: 4,
  expired_snapshot_count: 1,
  oldest_snapshot_date: "2026-05-20",
  latest_snapshot_date: "2026-06-08"
};

const reviewAnalyticsSnapshotCleanupEvents: ReviewAnalyticsSnapshotCleanupEvent[] = [
  {
    id: 21,
    project_id: 3,
    retention_days: 90,
    cutoff_date: "2026-03-10",
    removed_count: 2,
    remaining_count: 4,
    created_at: "2026-06-08T06:30:00.000Z"
  }
];

describe("reviewOps", () => {
  it("summarizes review workload, evidence coverage, status distribution, and the next action", () => {
    expect(buildReviewOperationsSummary(suggestions, governanceSummary)).toEqual({
      acceptedCount: 1,
      agedPendingCount: 0,
      duplicateSuggestionCount: 2,
      editedCount: 1,
      evidenceCoveragePercent: 80,
      evidenceCoveredCount: 4,
      hasPendingAgeData: false,
      highPriorityCount: 2,
      lowQualityPendingCount: 1,
      oldestPendingAgeDays: null,
      pendingCount: 2,
      recommendedAction: "lowQuality",
      rejectedCount: 1,
      totalCount: 5
    });
  });

  it("summarizes aged pending suggestions from valid creation timestamps", () => {
    const agingSuggestions: RelationshipSuggestion[] = [
      {
        ...suggestions[0],
        id: 21,
        confidence: 0.72,
        created_at: "2026-05-30T00:00:00.000Z",
        decision_status: "pending",
        quality_label: "medium",
        review_priority: "medium"
      },
      {
        ...suggestions[0],
        id: 22,
        confidence: 0.74,
        created_at: "2026-06-03T13:00:00.000Z",
        decision_status: "pending",
        quality_label: "medium",
        review_priority: "medium"
      },
      {
        ...suggestions[0],
        id: 23,
        confidence: 0.76,
        created_at: "not-a-date",
        decision_status: "pending",
        quality_label: "medium",
        review_priority: "medium"
      },
      {
        ...suggestions[0],
        id: 24,
        confidence: 0.78,
        created_at: "2026-05-01T00:00:00.000Z",
        decision_status: "accepted",
        quality_label: "medium",
        review_priority: "medium"
      }
    ];

    const summary = buildReviewOperationsSummary(agingSuggestions, null, {
      agingThresholdDays: 7,
      now: "2026-06-08T12:00:00.000Z"
    });

    expect(summary).toMatchObject({
      agedPendingCount: 1,
      hasPendingAgeData: true,
      oldestPendingAgeDays: 9,
      pendingCount: 3,
      recommendedAction: "aging"
    });
  });

  it("ignores missing or invalid creation timestamps when summarizing pending age", () => {
    const summary = buildReviewOperationsSummary(
      [
        {
          ...suggestions[0],
          id: 31,
          confidence: 0.76,
          created_at: "invalid",
          quality_label: "medium",
          review_priority: "medium"
        },
        {
          ...suggestions[0],
          id: 32,
          confidence: 0.78,
          quality_label: "medium",
          review_priority: "medium"
        }
      ],
      null,
      { now: "2026-06-08T12:00:00.000Z" }
    );

    expect(summary).toMatchObject({
      agedPendingCount: 0,
      hasPendingAgeData: false,
      oldestPendingAgeDays: null,
      pendingCount: 2,
      recommendedAction: "pending"
    });
  });

  it("filters suggestions by pending, high priority, and duplicate membership", () => {
    expect(filterRelationshipSuggestions(suggestions, "pending", governanceSummary).map(({ id }) => id)).toEqual([
      7,
      8
    ]);
    expect(
      filterRelationshipSuggestions(suggestions, "highPriority", governanceSummary).map(({ id }) => id)
    ).toEqual([7, 8]);
    expect(filterRelationshipSuggestions(suggestions, "duplicates", governanceSummary).map(({ id }) => id)).toEqual([
      7,
      8
    ]);
    expect(filterRelationshipSuggestions(suggestions, "all", governanceSummary)).toHaveLength(5);
  });

  it("persists and restores valid review filters with a safe invalid fallback", () => {
    const storage = new Map<string, string>();
    const localStorage = {
      get length() {
        return storage.size;
      },
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      }
    } as Storage;

    expect(readStoredReviewFilter(localStorage)).toBe("all");

    persistReviewFilter("highPriority", localStorage);

    expect(readStoredReviewFilter(localStorage)).toBe("highPriority");

    storage.set("graphmind.reviewFilter", "stale-value");

    expect(readStoredReviewFilter(localStorage)).toBe("all");
  });

  it("builds a handoff-ready audit report for the current filtered view", () => {
    const timestampedSuggestions: RelationshipSuggestion[] = suggestions.map((suggestion) => ({
      ...suggestion,
      reviewed_by:
        suggestion.id === 7 ? "ops-reviewer" : suggestion.reviewed_by,
      created_at:
        suggestion.id === 7 ? "2026-06-01T08:00:00.000Z" : suggestion.created_at,
      updated_at:
        suggestion.id === 7 ? "2026-06-07T12:00:00.000Z" : suggestion.updated_at
    }));
    const report = buildReviewAuditReport({
      activeFilter: "pending",
      generatedAt: "2026-06-07T12:00:00.000Z",
      governanceSummary,
      reviewAnalytics,
      reviewAnalyticsSnapshotCleanupEvents,
      reviewAnalyticsSnapshotSummary,
      reviewAnalyticsTrend,
      suggestions: timestampedSuggestions
    });

    expect(report).toMatchObject({
      schema: "graphmind.review-audit.v1",
      generatedAt: "2026-06-07T12:00:00.000Z",
      activeFilter: "pending",
      visibleSuggestionIds: [7, 8],
      summary: {
        totalCount: 5,
        pendingCount: 2,
        lowQualityPendingCount: 1,
        evidenceCoveragePercent: 80,
        recommendedAction: "lowQuality"
      },
      governanceSummary: {
        duplicate_group_count: 1,
        pending_suggestion_count: 2
      },
      reviewAnalytics,
      reviewAnalyticsSnapshotContext: {
        retentionDays: 90,
        snapshotCount: 4,
        expiredSnapshotCount: 1,
        oldestSnapshotDate: "2026-05-20",
        latestSnapshotDate: "2026-06-08",
        latestCleanupEvent: {
          id: 21,
          retentionDays: 90,
          cutoffDate: "2026-03-10",
          removedCount: 2,
          remainingCount: 4,
          createdAt: "2026-06-08T06:30:00.000Z"
        }
      },
      reviewAnalyticsTrend,
      reviewAnalyticsTrendContext: {
        selectedTrendDays: 14,
        trendSnapshotCount: 2,
        trendWindowDays: 30,
        firstSnapshotDate: "2026-06-07",
        latestSnapshotDate: "2026-06-08"
      },
      reviewAnalyticsTrendSummary: {
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
      }
    });
    expect(report.suggestions).toHaveLength(2);
    expect(report.suggestions[0]).toEqual({
      id: 7,
      sourceLabel: "Orders.customer_id",
      targetLabel: "Customers.customer_id",
      relationshipType: "same_entity",
      confidence: 0.92,
      decisionStatus: "pending",
      reviewedBy: "ops-reviewer",
      createdAt: "2026-06-01T08:00:00.000Z",
      updatedAt: "2026-06-07T12:00:00.000Z",
      qualityLabel: "high",
      reviewPriority: "high",
      qualityReasons: ["confidence:high"],
      evidenceSummary: "Values overlap strongly.",
      evidencePayload: { overlap_count: 2 }
    });
  });
});
