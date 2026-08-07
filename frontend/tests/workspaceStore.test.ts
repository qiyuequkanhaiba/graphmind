import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapWorkspace,
  defaultProjectSettings,
  refreshWorkspaceIncrementally
} from "../src/state/workspaceStore";

const reviewAnalytics = {
  window_days: 30,
  generated_at: "2026-06-08T00:00:00+00:00",
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

const reviewAnalyticsTrend = {
  window_days: 30,
  days: 14,
  generated_at: "2026-06-08T00:00:00+00:00",
  snapshots: [
    {
      snapshot_date: "2026-06-07",
      analytics: {
        ...reviewAnalytics,
        generated_at: "2026-06-07T00:00:00+00:00",
        sla: {
          ...reviewAnalytics.sla,
          pending_total: 4,
          overdue_pending_count: 2,
          oldest_pending_age_days: 11
        }
      }
    },
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
    project_id: 3,
    retention_days: 90,
    cutoff_date: "2026-03-13",
    removed_count: 2,
    remaining_count: 4,
    created_at: "2026-06-11T08:30:00+00:00"
  }
];

describe("workspace store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("bootstraps from the workspace snapshot without source inspection fan-out", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 3, name: "Default" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          project: { id: 3, name: "Default" },
          workspace_version: "v1",
          graph: { nodes: [], edges: [] },
          suggestions: [],
          relationship_governance: null,
          review_analytics: reviewAnalytics,
          review_analytics_trend: reviewAnalyticsTrend,
          review_analytics_snapshot_summary: reviewAnalyticsSnapshotSummary,
          review_analytics_snapshot_cleanup_events: reviewAnalyticsSnapshotCleanupEvents,
          settings: {
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
          },
          import_jobs: [],
          source_summaries: [{ source_kind: "table", count: 1 }],
          source_details: [],
          source_chunks_by_source_id: {},
          extracted_entities: [],
          extracted_relationships: [],
          entity_match_reviews: [],
          mapping_reviews: []
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await bootstrapWorkspace();

    expect(result.projectId).toBe(3);
    expect(result.workspaceVersion).toBe("v1");
    expect(result.reviewAnalytics).toEqual(reviewAnalytics);
    expect(result.reviewAnalyticsTrend).toEqual(reviewAnalyticsTrend);
    expect(result.reviewAnalyticsSnapshotSummary).toEqual(reviewAnalyticsSnapshotSummary);
    expect(result.reviewAnalyticsSnapshotCleanupEvents).toEqual(
      reviewAnalyticsSnapshotCleanupEvents
    );
    expect(result.sourceSummaries).toEqual([{ source_kind: "table", count: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/projects/default", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/projects/3/workspace-snapshot");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/projects/3/sources/detail");
  });

  it("normalizes legacy settings from the workspace snapshot", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 3, name: "Default" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          project: { id: 3, name: "Default" },
          workspace_version: "v1",
          graph: { nodes: [], edges: [] },
          suggestions: [],
          relationship_governance: null,
          review_analytics: null,
          review_analytics_trend: null,
          review_analytics_snapshot_summary: null,
          review_analytics_snapshot_cleanup_events: null,
          settings: {
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
            }
          },
          import_jobs: [],
          source_summaries: [],
          source_details: [],
          source_chunks_by_source_id: {},
          extracted_entities: [],
          extracted_relationships: [],
          entity_match_reviews: [],
          mapping_reviews: []
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await bootstrapWorkspace();

    expect(result.settings.review_analytics).toEqual(
      defaultProjectSettings.review_analytics
    );
  });

  it("keeps current workspace data when incremental refresh is not modified", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "not_modified",
        workspace_version: "v1",
        graph: null,
        suggestions: null,
        review_analytics: null,
        review_analytics_trend: null,
        review_analytics_snapshot_summary: null,
        review_analytics_snapshot_cleanup_events: null,
        import_jobs: null,
        source_summaries: null,
        source_details: null,
        extracted_entities: null,
        extracted_relationships: null,
        entity_match_reviews: null,
        mapping_reviews: null
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const current = {
      workspaceVersion: "v1",
      graph: { nodes: [], edges: [] },
      suggestions: [],
      relationshipGovernance: null,
      reviewAnalytics,
      reviewAnalyticsTrend,
      reviewAnalyticsSnapshotSummary,
      reviewAnalyticsSnapshotCleanupEvents,
      importJobs: [],
      sourceSummaries: [],
      sourceDetails: [],
      extractedEntities: [],
      extractedRelationships: [],
      entityMatchReviews: [],
      mappingReviews: []
    };

    await expect(refreshWorkspaceIncrementally(3, current)).resolves.toEqual(current);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/3/workspace-delta?since_version=v1"
    );
  });

  it("merges changed workspace data from an incremental refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "changed",
        workspace_version: "v2",
        graph: {
          nodes: [
            {
              id: 1,
              node_type: "table",
              label: "Orders",
              source_ref: "orders",
              metadata: {},
              position_x: 0,
              position_y: 0
            }
          ],
          edges: []
        },
        suggestions: [],
        relationship_governance: null,
        review_analytics: reviewAnalytics,
        review_analytics_trend: reviewAnalyticsTrend,
        review_analytics_snapshot_summary: reviewAnalyticsSnapshotSummary,
        review_analytics_snapshot_cleanup_events: reviewAnalyticsSnapshotCleanupEvents,
        import_jobs: [],
        source_summaries: [{ source_kind: "table", count: 1 }],
        source_details: [],
        extracted_entities: [],
        extracted_relationships: [],
        entity_match_reviews: [],
        mapping_reviews: []
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const current = {
      workspaceVersion: "v1",
      graph: { nodes: [], edges: [] },
      suggestions: [],
      relationshipGovernance: null,
      reviewAnalytics: null,
      reviewAnalyticsTrend: null,
      reviewAnalyticsSnapshotSummary: null,
      reviewAnalyticsSnapshotCleanupEvents: [],
      importJobs: [],
      sourceSummaries: [],
      sourceDetails: [],
      extractedEntities: [],
      extractedRelationships: [],
      entityMatchReviews: [],
      mappingReviews: []
    };

    const refreshed = await refreshWorkspaceIncrementally(3, current);

    expect(refreshed.workspaceVersion).toBe("v2");
    expect(refreshed.graph.nodes[0].label).toBe("Orders");
    expect(refreshed.reviewAnalytics).toEqual(reviewAnalytics);
    expect(refreshed.reviewAnalyticsTrend).toEqual(reviewAnalyticsTrend);
    expect(refreshed.reviewAnalyticsSnapshotSummary).toEqual(reviewAnalyticsSnapshotSummary);
    expect(refreshed.reviewAnalyticsSnapshotCleanupEvents).toEqual(
      reviewAnalyticsSnapshotCleanupEvents
    );
    expect(refreshed.sourceSummaries).toEqual([{ source_kind: "table", count: 1 }]);
  });

  it("falls back to legacy bootstrap requests when the snapshot is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 3, name: "Default" })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ detail: "Not found" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ nodes: [], edges: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
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
        json: async () => reviewAnalyticsSnapshotCleanupEvents
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ source_kind: "table", count: 1 }]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 1,
            import_item_id: 7,
            title: "README.md",
            document_type: "markdown",
            source_ref: "README.md",
            metadata: {},
            chunk_count: 3,
            entity_count: 0,
            relationship_count: 0,
            created_at: "2026-06-02T00:00:00Z"
          }
        ]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await bootstrapWorkspace();

    expect(result.projectId).toBe(3);
    expect(result.reviewAnalytics).toEqual(reviewAnalytics);
    expect(result.reviewAnalyticsTrend).toEqual(reviewAnalyticsTrend);
    expect(result.reviewAnalyticsSnapshotSummary).toEqual(reviewAnalyticsSnapshotSummary);
    expect(result.reviewAnalyticsSnapshotCleanupEvents).toEqual(
      reviewAnalyticsSnapshotCleanupEvents
    );
    expect(result.settings.review_analytics).toEqual(
      defaultProjectSettings.review_analytics
    );
    expect(result.sourceSummaries).toEqual([{ source_kind: "table", count: 1 }]);
    expect(result.sourceChunksBySourceId).toEqual({});
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/3/workspace-snapshot");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/3/graph");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/3/review-analytics?window=30d");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/3/review-analytics/trend?window=30d&days=14"
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/3/review-analytics/snapshots");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/3/review-analytics/snapshots/cleanup-events"
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/3/sources/detail");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/projects/3/sources/1/chunks");
  });
});
