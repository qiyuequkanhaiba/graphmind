import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useState } from "react";
import {
  defaultProjectSettings,
  emptyGraph,
  type WorkspaceState
} from "../src/state/workspaceStore";
import { useReviewActions } from "../src/state/useReviewActions";

type ReviewActions = ReturnType<typeof useReviewActions>;

const initialState: WorkspaceState = {
  projectId: 42,
  workspaceVersion: null,
  graph: emptyGraph,
  suggestions: [],
  relationshipGovernance: null,
  reviewAnalytics: null,
  reviewAnalyticsTrend: null,
  reviewAnalyticsSnapshotSummary: null,
  reviewAnalyticsSnapshotCleanupEvents: [],
  settings: defaultProjectSettings,
  messages: [],
  highlightedGraphPath: [],
  status: "ready",
  error: null,
  importStatus: null,
  importTasks: [],
  sourceSummaries: [],
  sourceDetails: [],
  sourceChunksBySourceId: {},
  extractedEntities: [],
  extractedRelationships: [],
  entityMatchReviews: [],
  mappingReviews: []
};

const reviewAnalytics = {
  window_days: 30,
  generated_at: "2026-06-08T00:00:00+00:00",
  sla: {
    pending_sla_days: 3,
    pending_total: 0,
    overdue_pending_count: 0,
    oldest_pending_age_days: null
  },
  aging_buckets: {
    "0_1_days": 0,
    "2_3_days": 0,
    "4_7_days": 0,
    "8_plus_days": 0
  },
  decision_trend: {
    accepted: 1,
    edited: 0,
    pending: 0,
    rejected: 0
  },
  quality_distribution: {
    high: 1,
    medium: 0,
    low: 0
  },
  evidence_coverage: {
    with_evidence_count: 1,
    without_evidence_count: 0,
    coverage_ratio: 1
  }
};

const reviewAnalyticsTrend = {
  window_days: 30,
  days: 14,
  generated_at: "2026-06-08T00:00:00+00:00",
  snapshots: [
    {
      snapshot_date: "2026-06-08",
      analytics: reviewAnalytics
    }
  ]
};

const reviewAnalyticsSnapshotSummary = {
  retention_days: 30,
  snapshot_count: 3,
  expired_snapshot_count: 1,
  oldest_snapshot_date: "2026-05-01",
  latest_snapshot_date: "2026-06-08"
};

const reviewAnalyticsSnapshotCleanupEvents = [
  {
    id: 9,
    project_id: 42,
    retention_days: 90,
    cutoff_date: "2026-03-13",
    removed_count: 2,
    remaining_count: 4,
    created_at: "2026-06-11T08:30:00+00:00"
  }
];

function Harness({
  onActions,
  reviewAnalyticsTrendDays = 14,
  reviewerName = ""
}: {
  onActions: (actions: ReviewActions) => void;
  reviewAnalyticsTrendDays?: 7 | 14 | 30 | 90;
  reviewerName?: string;
}) {
  const [state, setState] = useState<WorkspaceState>(initialState);
  const actions = useReviewActions({
    projectId: state.projectId,
    reviewAnalyticsTrendDays,
    reviewerName,
    setState,
    t: (key: string) => key
  });
  onActions(actions);
  return null;
}

describe("useReviewActions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reviews a relationship and refreshes graph, suggestions, and governance", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ok" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nodes: [{ id: 1, label: "Customers" }], edges: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 7, decision_status: "accepted" }]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_suggestion_count: 1,
          visible_suggestion_count: 1,
          duplicate_suggestion_count: 0,
          duplicate_group_count: 0,
          pending_suggestion_count: 0,
          accepted_suggestion_count: 1,
          rejected_suggestion_count: 0,
          edited_suggestion_count: 0,
          duplicate_groups: []
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalytics
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalyticsTrend
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalyticsSnapshotSummary
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalyticsSnapshotCleanupEvents
      });
    vi.stubGlobal("fetch", fetchMock);
    let actions: ReviewActions | null = null;

    render(<Harness onActions={(nextActions) => { actions = nextActions; }} />);
    await waitFor(() => {
      expect(actions).not.toBeNull();
    });
    await actions!.handleReview(7, "accepted");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/relationship-suggestions/7/review",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/graph");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/relationship-suggestions");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/relationship-governance");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/review-analytics?window=30d");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/42/review-analytics/trend?window=30d&days=14"
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/review-analytics/snapshots");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/42/review-analytics/snapshots/cleanup-events"
    );
  });

  it("keeps the selected review analytics trend window when refreshing after review", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ok" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nodes: [{ id: 1, label: "Customers" }], edges: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 7, decision_status: "accepted" }]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => null
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalytics
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...reviewAnalyticsTrend, days: 30 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalyticsSnapshotSummary
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });
    vi.stubGlobal("fetch", fetchMock);
    let actions: ReviewActions | null = null;

    render(
      <Harness
        reviewAnalyticsTrendDays={30}
        onActions={(nextActions) => {
          actions = nextActions;
        }}
      />
    );
    await waitFor(() => {
      expect(actions).not.toBeNull();
    });
    await actions!.handleReview(7, "accepted");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/42/review-analytics/trend?window=30d&days=30"
    );
  });

  it("submits the local reviewer attribution when reviewing a relationship", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "ok" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nodes: [], edges: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 7, decision_status: "accepted", reviewed_by: "ops-reviewer" }]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => null
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalytics
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalyticsTrend
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalyticsSnapshotSummary
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });
    vi.stubGlobal("fetch", fetchMock);
    let actions: ReviewActions | null = null;

    render(
      <Harness
        reviewerName="ops-reviewer"
        onActions={(nextActions) => {
          actions = nextActions;
        }}
      />
    );
    await waitFor(() => {
      expect(actions).not.toBeNull();
    });
    await actions!.handleReview(7, "accepted");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/42/relationship-suggestions/7/review",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          decision_status: "accepted",
          decision_note: null,
          reviewed_by: "ops-reviewer"
        })
      })
    );
  });

  it("cleans up duplicate relationships and refreshes review state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ removed_duplicate_count: 2 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nodes: [{ id: 1, label: "Customers" }], edges: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 7, decision_status: "pending" }]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_suggestion_count: 1,
          visible_suggestion_count: 1,
          duplicate_suggestion_count: 0,
          duplicate_group_count: 0,
          pending_suggestion_count: 1,
          accepted_suggestion_count: 0,
          rejected_suggestion_count: 0,
          edited_suggestion_count: 0,
          duplicate_groups: []
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalytics
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalyticsTrend
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalyticsSnapshotSummary
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalyticsSnapshotCleanupEvents
      });
    vi.stubGlobal("fetch", fetchMock);
    let actions: ReviewActions | null = null;

    render(<Harness onActions={(nextActions) => { actions = nextActions; }} />);
    await waitFor(() => {
      expect(actions).not.toBeNull();
    });
    await actions!.handleCleanupDuplicateRelationships();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/relationship-governance/cleanup-duplicates",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/graph");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/relationship-suggestions");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/relationship-governance");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/review-analytics?window=30d");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/42/review-analytics/trend?window=30d&days=14"
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/review-analytics/snapshots");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/42/review-analytics/snapshots/cleanup-events"
    );
  });

  it("cleans expired analytics snapshots and refreshes analytics governance", async () => {
    const refreshedSummary = {
      ...reviewAnalyticsSnapshotSummary,
      snapshot_count: 2,
      expired_snapshot_count: 0,
      oldest_snapshot_date: "2026-06-01"
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          retention_days: 30,
          cutoff_date: "2026-05-12",
          removed_count: 1,
          remaining_count: 2
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nodes: [{ id: 1, label: "Customers" }], edges: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 7, decision_status: "pending" }]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_suggestion_count: 1,
          visible_suggestion_count: 1,
          duplicate_suggestion_count: 0,
          duplicate_group_count: 0,
          pending_suggestion_count: 1,
          accepted_suggestion_count: 0,
          rejected_suggestion_count: 0,
          edited_suggestion_count: 0,
          duplicate_groups: []
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalytics
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalyticsTrend
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => refreshedSummary
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewAnalyticsSnapshotCleanupEvents
      });
    vi.stubGlobal("fetch", fetchMock);
    let actions: ReviewActions | null = null;

    render(<Harness onActions={(nextActions) => { actions = nextActions; }} />);
    await waitFor(() => {
      expect(actions).not.toBeNull();
    });
    await actions!.handleCleanupAnalyticsSnapshots(90);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/42/review-analytics/snapshots/cleanup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ retention_days: 90 })
      })
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/graph");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/relationship-suggestions");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/review-analytics/snapshots");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/42/review-analytics/snapshots/cleanup-events"
    );
  });
});
