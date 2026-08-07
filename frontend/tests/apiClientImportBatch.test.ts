import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionAuthState,
  createImportBatch,
  createUrlImport,
  createImportJob,
  createProjectShareToken,
  cleanupDuplicateRelationshipSuggestions,
  getEntityMatchReviews,
  getExtractedEntities,
  getExtractedRelationships,
  getImportBatches,
  getProjectShareTokens,
  recoverImportJobs,
  getReviewAnalytics,
  getReviewAnalyticsTrend,
  getReviewAnalyticsSnapshotSummary,
  getReviewAnalyticsSnapshotCleanupEvents,
  cleanupReviewAnalyticsSnapshots,
  getRelationshipGovernanceSummary,
  getSourceChunks,
  getSourceDetails,
  getSourceChunksPage,
  getSourceSummaries,
  getWorkspaceDelta,
  getWorkspaceSnapshot,
  loginSession,
  revokeProjectShareToken,
  retryImportItem,
  reviewEntityMatch,
  reviewRelationshipSuggestion
} from "../src/api/client";

describe("import batch API client", () => {
  afterEach(() => {
    clearSessionAuthState();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stores the session CSRF token and attaches it to unsafe requests", async () => {
    const loginResponse = {
      username: "admin",
      auth_mode: "session",
      csrf_token: "csrf-token-123",
      expires_at: "2026-06-07T12:00:00+00:00"
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => loginResponse
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          recovered_count: 0,
          submitted_count: 0
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginSession("admin", "correct-password")).resolves.toEqual(loginResponse);
    expect(window.sessionStorage.getItem("graphmind.session.csrf")).toBe("csrf-token-123");
    await recoverImportJobs(2);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/auth/session",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "correct-password" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/2/import-jobs/recover",
      expect.objectContaining({
        method: "POST",
        headers: { "X-CSRF-Token": "csrf-token-123" }
      })
    );
  });

  it("restores the session CSRF token from session storage after a page reload", async () => {
    window.sessionStorage.setItem("graphmind.session.csrf", "persisted-csrf-token");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recovered_count: 0, submitted_count: 0 })
    });
    vi.stubGlobal("fetch", fetchMock);

    await recoverImportJobs(2);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/2/import-jobs/recover",
      expect.objectContaining({
        method: "POST",
        headers: { "X-CSRF-Token": "persisted-csrf-token" }
      })
    );
  });

  it("clears a persisted CSRF token when the server rejects it", async () => {
    window.sessionStorage.setItem("graphmind.session.csrf", "expired-csrf-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          detail: {
            code: "CSRF_INVALID",
            message: "CSRF token is invalid",
            user_action: "Sign in again.",
            retryable: true,
            field_errors: {}
          }
        })
      })
    );

    await expect(recoverImportJobs(2)).rejects.toMatchObject({ code: "CSRF_INVALID" });
    expect(window.sessionStorage.getItem("graphmind.session.csrf")).toBeNull();
  });

  it("creates, lists, and revokes project share tokens", async () => {
    const created = {
      id: 5,
      project_id: 2,
      role: "viewer",
      label: "Partner",
      token: "gm_share_abc",
      created_at: "2026-06-07T00:00:00+00:00",
      last_used_at: null,
      revoked_at: null
    };
    const listed = [
      {
        id: 5,
        project_id: 2,
        role: "viewer",
        label: "Partner",
        created_at: "2026-06-07T00:00:00+00:00",
        last_used_at: null,
        revoked_at: null
      }
    ];
    const revoked = { id: 5, project_id: 2, revoked: true };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => created })
      .mockResolvedValueOnce({ ok: true, json: async () => listed })
      .mockResolvedValueOnce({ ok: true, json: async () => revoked });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createProjectShareToken(2, "viewer", "Partner")).resolves.toEqual(created);
    await expect(getProjectShareTokens(2)).resolves.toEqual(listed);
    await expect(revokeProjectShareToken(2, 5)).resolves.toEqual(revoked);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/2/share-tokens",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "viewer", label: "Partner" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/projects/2/share-tokens");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/projects/2/share-tokens/5",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("posts multiple files to the import batch endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 4,
        project_id: 2,
        label: "Batch",
        status: "succeeded",
        progress: 100,
        summary: { dataset_count: 2 },
        error: null,
        items: [],
        created_at: "2026-06-02T00:00:00+00:00",
        updated_at: "2026-06-02T00:00:00+00:00"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const files = [
      new File(["id,name"], "customers.csv", { type: "text/csv" }),
      new File(['[{"id":"o1"}]'], "orders.json", { type: "application/json" })
    ];
    const result = await createImportBatch(2, files, "Batch");

    expect(result.id).toBe(4);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/2/import-batches",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })
    );
  });

  it("posts URL imports as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 7,
        project_id: 2,
        label: "URL source",
        status: "succeeded",
        progress: 100,
        summary: { diagnostics: { source_kind: "url", http_status: 200 } },
        error: null,
        items: [],
        created_at: "2026-06-06T00:00:00+00:00",
        updated_at: "2026-06-06T00:00:00+00:00"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createUrlImport(2, "https://example.com/docs", "URL source");

    expect(result.id).toBe(7);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/2/url-imports",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/docs",
          label: "URL source"
        })
      })
    );
  });

  it("posts failed import item retry requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 4,
        project_id: 2,
        label: "Batch",
        status: "succeeded",
        progress: 100,
        summary: { succeeded_item_count: 2, failed_item_count: 0 },
        error: null,
        items: [],
        created_at: "2026-06-03T00:00:00+00:00",
        updated_at: "2026-06-03T00:00:00+00:00"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await retryImportItem(2, 19);

    expect(result.status).toBe("succeeded");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/2/import-items/19/retry",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("uses structured API error messages when import requests fail", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        detail: {
          code: "UNSUPPORTED_IMPORT_FILE_TYPE",
          message: "Unsupported import file type",
          user_action: "Upload a supported file type: CSV, XLSX, XLS, JSON, document, code, log, or archive.",
          retryable: true,
          field_errors: { file: "Unsupported import file type" }
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["binary"], "notes.exe", { type: "application/octet-stream" });

    await expect(createImportJob(2, file)).rejects.toMatchObject({
      name: "ApiError",
      message:
        "Unsupported import file type Upload a supported file type: CSV, XLSX, XLS, JSON, document, code, log, or archive.",
      code: "UNSUPPORTED_IMPORT_FILE_TYPE",
      retryable: true,
      status: 400
    });
  });

  it("posts import job recovery requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        recovered_count: 1,
        submitted_count: 2
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await recoverImportJobs(2);

    expect(result).toEqual({ recovered_count: 1, submitted_count: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/2/import-jobs/recover",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("loads relationship governance summary and cleans duplicates", async () => {
    const summary = {
      total_suggestion_count: 3,
      visible_suggestion_count: 2,
      duplicate_suggestion_count: 1,
      duplicate_group_count: 1,
      pending_suggestion_count: 2,
      accepted_suggestion_count: 1,
      rejected_suggestion_count: 0,
      edited_suggestion_count: 0,
      duplicate_groups: []
    };
    const cleanup = {
      removed_duplicate_count: 1,
      relinked_edge_count: 2,
      remaining_duplicate_count: 0,
      duplicate_groups: []
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => summary
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => cleanup
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRelationshipGovernanceSummary(3)).resolves.toEqual(summary);
    await expect(cleanupDuplicateRelationshipSuggestions(3)).resolves.toEqual(cleanup);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/projects/3/relationship-governance");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/3/relationship-governance/cleanup-duplicates",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("loads review analytics for a project", async () => {
    const analytics = {
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
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => analytics
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getReviewAnalytics(3)).resolves.toEqual(analytics);
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/3/review-analytics?window=30d");
  });

  it("loads review analytics trend snapshots for a project", async () => {
    const trend = {
      window_days: 30,
      days: 14,
      generated_at: "2026-06-08T00:00:00+00:00",
      snapshots: [
        {
          snapshot_date: "2026-06-07",
          analytics: {
            window_days: 30,
            generated_at: "2026-06-07T00:00:00+00:00",
            sla: {
              pending_sla_days: 3,
              pending_total: 4,
              overdue_pending_count: 2,
              oldest_pending_age_days: 11
            },
            aging_buckets: {
              "0_1_days": 1,
              "2_3_days": 1,
              "4_7_days": 1,
              "8_plus_days": 1
            },
            decision_trend: {
              accepted: 3,
              edited: 1,
              pending: 4,
              rejected: 1
            },
            quality_distribution: {
              high: 3,
              medium: 4,
              low: 2
            },
            evidence_coverage: {
              with_evidence_count: 7,
              without_evidence_count: 2,
              coverage_ratio: 0.78
            }
          }
        }
      ]
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => trend
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => trend
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getReviewAnalyticsTrend(3)).resolves.toEqual(trend);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/3/review-analytics/trend?window=30d&days=14"
    );

    await expect(getReviewAnalyticsTrend(3, 30)).resolves.toEqual(trend);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/projects/3/review-analytics/trend?window=30d&days=30"
    );
  });

  it("loads and cleans review analytics snapshot governance data", async () => {
    const summary = {
      retention_days: 30,
      snapshot_count: 4,
      expired_snapshot_count: 2,
      oldest_snapshot_date: "2026-03-05",
      latest_snapshot_date: "2026-06-10"
    };
    const cleanup = {
      retention_days: 30,
      cutoff_date: "2026-05-12",
      removed_count: 2,
      remaining_count: 2
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => summary
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => cleanup
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getReviewAnalyticsSnapshotSummary(3)).resolves.toEqual(summary);
    await expect(cleanupReviewAnalyticsSnapshots(3, 90)).resolves.toEqual(cleanup);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/3/review-analytics/snapshots"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/3/review-analytics/snapshots/cleanup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ retention_days: 90 })
      })
    );
  });

  it("loads review analytics snapshot cleanup events", async () => {
    const events = [
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
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => events
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getReviewAnalyticsSnapshotCleanupEvents(3)).resolves.toEqual(events);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/3/review-analytics/snapshots/cleanup-events"
    );
  });

  it("loads import batches and source summaries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ source_kind: "table", count: 2 }]
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getImportBatches(3)).resolves.toEqual([]);
    await expect(getSourceSummaries(3)).resolves.toEqual([{ source_kind: "table", count: 2 }]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/projects/3/import-batches");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/projects/3/sources");
  });

  it("loads the workspace snapshot in one request", async () => {
    const snapshot = {
      workspace_version: "v1",
      project: { id: 3, name: "Default" },
      graph: { nodes: [], edges: [] },
      suggestions: [],
      relationship_governance: null,
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
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWorkspaceSnapshot(3)).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/3/workspace-snapshot");
  });

  it("loads workspace delta with the current workspace version", async () => {
    const delta = {
      status: "not_modified",
      workspace_version: "v1",
      graph: null,
      suggestions: null,
      import_jobs: null,
      source_summaries: null,
      source_details: null,
      extracted_entities: null,
      extracted_relationships: null,
      entity_match_reviews: null,
      mapping_reviews: null
    };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => delta
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWorkspaceDelta(3, "v1")).resolves.toEqual(delta);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/3/workspace-delta?since_version=v1"
    );
  });

  it("loads source inspection endpoints", async () => {
    const sourceDetails = [
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
    const chunks = [
      {
        id: 2,
        document_id: 1,
        chunk_index: 0,
        heading: "Overview",
        content: "GraphMind imports sources.",
        token_count: 4,
        source_ref: "document:1#chunk:0",
        content_hash: "abc",
        metadata: {},
        created_at: "2026-06-02T00:00:00Z"
      }
    ];
    const entities = [
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
    const relationships = [
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
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sourceDetails
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => chunks
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => entities
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => relationships
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSourceDetails(3)).resolves.toEqual(sourceDetails);
    await expect(getSourceChunks(3, 1)).resolves.toEqual(chunks);
    await expect(getExtractedEntities(3)).resolves.toEqual(entities);
    await expect(getExtractedRelationships(3)).resolves.toEqual(relationships);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/projects/3/sources/detail");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/projects/3/sources/1/chunks");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/projects/3/entities");
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/projects/3/extracted-relationships");
  });

  it("loads source chunks through a paginated lazy-loading endpoint", async () => {
    const page = {
      items: [
        {
          id: 2,
          document_id: 1,
          chunk_index: 1,
          heading: "README.md",
          content: "GraphMind maps product evidence.",
          token_count: 128,
          source_ref: "README.md#chunk-2",
          content_hash: "abc",
          metadata: {},
          created_at: "2026-06-02T00:00:00Z"
        }
      ],
      total: 4,
      limit: 1,
      offset: 1,
      has_more: true
    };
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => page
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSourceChunksPage(3, 1, { limit: 1, offset: 1 })).resolves.toEqual(page);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/3/sources/1/chunks?limit=1&offset=1"
    );
  });

  it("loads and reviews entity match endpoints", async () => {
    const match = {
      id: 7,
      project_id: 3,
      source_node_id: 10,
      target_node_id: 20,
      source_label: "customers.customer_id",
      source_type: "field",
      target_label: "Customer ID",
      target_type: "entity",
      relationship_type: "matches_entity",
      confidence: 0.78,
      status: "suggested",
      evidence_ref: "entity_resolution:10:20",
      evidence_summary: "customers.customer_id matches Customer ID.",
      matched_keys: ["customerid"],
      source_refs: ["architecture.md#identity"],
      metadata: { rule: "normalized_name_match" }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [match]
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...match, status: "accepted" })
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getEntityMatchReviews(3)).resolves.toEqual([match]);
    await expect(reviewEntityMatch(3, 7, "accepted")).resolves.toEqual({
      ...match,
      status: "accepted"
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/projects/3/entity-matches");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/3/entity-matches/7/review",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ decision_status: "accepted" })
      })
    );
  });

  it("submits relationship review attribution", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      reviewRelationshipSuggestion(3, 7, "edited", "Reviewed during handoff.", {
        evidenceQuality: "high",
        relationshipType: "foreign_key",
        reviewedBy: "ops-reviewer"
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/3/relationship-suggestions/7/review",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          decision_status: "edited",
          decision_note: "Reviewed during handoff.",
          reviewed_by: "ops-reviewer",
          relationship_type: "foreign_key",
          evidence_quality: "high"
        })
      })
    );
  });
});
