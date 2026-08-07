import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { clearSessionAuthState } from "../src/api/client";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  listeners: Record<string, Array<(event: MessageEvent) => void>> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: unknown) {
    for (const listener of this.listeners[type] ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent);
    }
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

async function flushAsyncWork(iterations = 5) {
  await act(async () => {
    for (let index = 0; index < iterations; index += 1) {
      await Promise.resolve();
    }
  });
}

function emptyGraphResponse() {
  return { nodes: [], edges: [] };
}

function defaultSettingsResponse() {
  return {
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
}

function workspaceSnapshotResponse() {
  return {
    workspace_version: "v1",
    project: { id: 42, name: "Local Project" },
    graph: emptyGraphResponse(),
    suggestions: [],
    relationship_governance: null,
    settings: defaultSettingsResponse(),
    import_jobs: [],
    source_summaries: [],
    source_details: [],
    source_chunks_by_source_id: {},
    extracted_entities: [],
    extracted_relationships: [],
    entity_match_reviews: [],
    mapping_reviews: []
  };
}

function reviewAnalyticsResponse(overrides: Partial<ReturnType<typeof baseReviewAnalyticsResponse>> = {}) {
  return {
    ...baseReviewAnalyticsResponse(),
    ...overrides
  };
}

function baseReviewAnalyticsResponse() {
  return {
    window_days: 30,
    generated_at: "2026-06-11T00:00:00Z",
    sla: {
      pending_sla_days: 3,
      pending_total: 2,
      overdue_pending_count: 1,
      oldest_pending_age_days: 5
    },
    aging_buckets: {
      "0_1_days": 1,
      "2_3_days": 1,
      "4_7_days": 0,
      "8_plus_days": 0
    },
    decision_trend: {
      accepted: 1,
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
}

function reviewAnalyticsTrendResponse(days: 7 | 14 | 30 | 90, snapshotCount: number) {
  return {
    window_days: 30,
    days,
    generated_at: "2026-06-11T00:00:00Z",
    snapshots: Array.from({ length: snapshotCount }, (_, index) => ({
      snapshot_date: `2026-06-${String(10 - snapshotCount + index + 1).padStart(2, "0")}`,
      analytics: reviewAnalyticsResponse({
        sla: {
          pending_sla_days: 3,
          pending_total: 2 + index,
          overdue_pending_count: index,
          oldest_pending_age_days: 2 + index
        },
        evidence_coverage: {
          with_evidence_count: 1 + index,
          without_evidence_count: 1,
          coverage_ratio: index === 0 ? 0.5 : 1
        }
      })
    }))
  };
}

function importJobsResponse() {
  return [
    {
      id: 91,
      project_id: 42,
      label: "历史客户.csv",
      kind: "file",
      status: "succeeded",
      progress: 100,
      summary: {
        sheet_count: 1,
        field_count: 5,
        suggestion_count: 2,
        graph_node_count: 8,
        graph_edge_count: 7
      },
      error: null,
      retryable: false,
      dataset_id: 12,
      created_at: "2026-05-31T10:00:00Z",
      updated_at: "2026-05-31T10:00:08Z"
    }
  ];
}

function pendingSuggestionResponse(decisionStatus: "pending" | "accepted" = "pending") {
  return [
    {
      id: 7,
      source_field_id: 21,
      target_field_id: 31,
      source_label: "Orders.customer_id",
      target_label: "Customers.customer_id",
      relationship_type: "foreign_key",
      confidence: 0.94,
      evidence_summary: "3 of 3 rows match.",
      evidence_payload: { overlap_count: 3 },
      decision_status: decisionStatus
    }
  ];
}

function importSuggestionResponse() {
  return [
    {
      id: 7,
      source_field_id: 21,
      target_field_id: null,
      source_label: "Orders.customer_id",
      target_label: null,
      relationship_type: "derived_dimension",
      confidence: 0.82,
      evidence_summary: "Repeated values.",
      evidence_payload: { unique_count: 2 },
      decision_status: "pending"
    }
  ];
}

function sourceDetailsResponse() {
  return [
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
}

function sourceChunksResponse() {
  return [
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
}

function sourceChunksPageResponse() {
  return {
    items: sourceChunksResponse(),
    total: sourceChunksResponse().length,
    limit: 50,
    offset: 0,
    has_more: false
  };
}

function extractedEntitiesResponse() {
  return [
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
}

function extractedRelationshipsResponse() {
  return [
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
}

function entityMatchReviewsResponse(status = "suggested") {
  return [
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
      status,
      evidence_ref: "entity_resolution:30:31",
      evidence_summary: "customers.customer_id matches Customer ID by normalized name.",
      matched_keys: ["customerid"],
      source_refs: ["document:1#chunk:0"],
      metadata: { rule: "normalized_name_match" }
    }
  ];
}

function mappingReviewsResponse(status = "suggested") {
  return [
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
      status,
      evidence_ref: "identity.md#chunk-1",
      evidence_summary: "Customer ID maps to customerId.",
      matched_keys: [],
      source_refs: ["document:1#chunk:0"],
      metadata: { rule: "documented_field_mapping" }
    }
  ];
}

describe("App relationship review wiring", () => {
  afterEach(() => {
    clearSessionAuthState();
    window.localStorage.clear();
    window.sessionStorage.clear();
    FakeEventSource.instances = [];
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the hosted login form after an auth challenge and reloads after login", async () => {
    let authenticated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === "/api/projects/default" && !authenticated) {
        return jsonResponse(
          {
            detail: {
              code: "AUTH_REQUIRED",
              message: "Authentication is required",
              user_action: "Sign in to continue.",
              retryable: true,
              field_errors: {}
            }
          },
          { status: 401 }
        );
      }
      if (url === "/api/auth/session") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          username: "admin",
          password: "correct-password"
        });
        authenticated = true;
        return jsonResponse({
          username: "admin",
          auth_mode: "session",
          csrf_token: "csrf-token-123",
          expires_at: "2026-06-07T12:00:00+00:00"
        });
      }
      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }
      if (url === "/api/projects/42/workspace-snapshot") {
        return jsonResponse(workspaceSnapshotResponse());
      }
      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "登录 GraphMind" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "correct-password" }
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await screen.findByRole("heading", { name: "GraphMind" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/workspace-snapshot");
  });

  it("treats missing or invalid CSRF state as a recoverable login challenge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            detail: {
              code: "CSRF_REQUIRED",
              message: "CSRF token is required",
              user_action: "Sign in again.",
              retryable: true,
              field_errors: {}
            }
          },
          { status: 403 }
        )
      )
    );

    render(<App />);

    expect(await screen.findByRole("heading", { name: "登录 GraphMind" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "后端不可用" })).not.toBeInTheDocument();
  });

  it("returns to login when a hosted session expires during an action", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }
      if (url === "/api/projects/42/workspace-snapshot") {
        return jsonResponse({
          ...workspaceSnapshotResponse(),
          suggestions: pendingSuggestionResponse(),
          review_analytics: reviewAnalyticsResponse(),
          review_analytics_trend: reviewAnalyticsTrendResponse(14, 2)
        });
      }
      if (url === "/api/projects/42/review-analytics/trend?window=30d&days=30") {
        return jsonResponse(
          {
            detail: {
              code: "AUTH_REQUIRED",
              message: "Session expired",
              user_action: "Sign in again.",
              retryable: true,
              field_errors: {}
            }
          },
          { status: 401 }
        );
      }
      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("tab", { name: "审核" }));
    fireEvent.change(await screen.findByLabelText("趋势快照范围"), {
      target: { value: "30" }
    });

    expect(await screen.findByRole("heading", { name: "登录 GraphMind" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "后端不可用" })).not.toBeInTheDocument();
  });

  it("applies the stored theme before rendering a bootstrap failure", async () => {
    window.localStorage.setItem("graphmind.workbench.theme", "light");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 })));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "后端不可用" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.body.dataset.theme).toBe("light");
  });

  it("loads relationship suggestions and updates one after review", async () => {
    let graphRequestCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        graphRequestCount += 1;
        return jsonResponse({
          nodes: [
            {
              id: 1,
              node_type: "field",
              label: "Orders.customer_id",
              source_ref: "orders.customer_id",
              metadata: { inferred_type: "string" },
              position_x: 80,
              position_y: 180
            },
            {
              id: 2,
              node_type: "field",
              label: "Customers.customer_id",
              source_ref: "customers.customer_id",
              metadata: { inferred_type: "string" },
              position_x: 360,
              position_y: 180
            }
          ],
          edges: [
            {
              id: 100,
              source_node_id: 1,
              target_node_id: 2,
              edge_type: "foreign_key",
              confidence: 0.94,
              status: graphRequestCount > 1 ? "accepted" : "suggested",
              evidence_ref: "suggestion:0",
              created_from_suggestion_id: 7,
              metadata: {},
              evidence_summary: "3 of 3 rows match.",
              evidence_payload: { overlap_count: 3 }
            }
          ]
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse(pendingSuggestionResponse(graphRequestCount > 1 ? "accepted" : "pending"));
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions/7/review") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          decision_status: "accepted",
          decision_note: null,
          reviewed_by: "ops-reviewer"
        });
        return jsonResponse({ status: "ok" });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("button", { name: "选择 Orders.customer_id" });
    fireEvent.click(screen.getByRole("tab", { name: "审核" }));
    const reviewPanel = await screen.findByRole("region", { name: "关系建议" });

    expect(within(reviewPanel).getByText("Orders.customer_id")).toBeInTheDocument();
    expect(within(reviewPanel).getByText("Customers.customer_id")).toBeInTheDocument();
    expect(
      within(reviewPanel.querySelector(".suggestion-meta") as HTMLElement).getByText("待处理")
    ).toBeInTheDocument();

    fireEvent.change(within(reviewPanel).getByLabelText("审核人"), {
      target: { value: "ops-reviewer" }
    });
    fireEvent.click(within(reviewPanel).getByRole("button", { name: "接受关系" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/relationship-suggestions/7/review",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/graph");
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/relationship-suggestions");
    await waitFor(() => {
      expect(
        within(screen.getByRole("region", { name: "关系建议" })).getByText("已接受")
      ).toBeInTheDocument();
    });
  });

  it("lets reviewers change the SLA trend snapshot range", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/workspace-snapshot") {
        return jsonResponse({
          ...workspaceSnapshotResponse(),
          suggestions: pendingSuggestionResponse(),
          review_analytics: reviewAnalyticsResponse(),
          review_analytics_trend: reviewAnalyticsTrendResponse(14, 2)
        });
      }

      if (url === "/api/projects/42/review-analytics/trend?window=30d&days=30") {
        return jsonResponse(reviewAnalyticsTrendResponse(30, 3));
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("tab", { name: "审核" }));
    expect(await screen.findByText("2 个快照")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("趋势快照范围"), {
      target: { value: "30" }
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/review-analytics/trend?window=30d&days=30"
      );
    });
    expect(await screen.findByText("3 个快照")).toBeInTheDocument();
  });

  it("ignores an older SLA trend response that resolves after the current range", async () => {
    let resolveSevenDays!: (response: Response) => void;
    let resolveNinetyDays!: (response: Response) => void;
    const sevenDaysResponse = new Promise<Response>((resolve) => {
      resolveSevenDays = resolve;
    });
    const ninetyDaysResponse = new Promise<Response>((resolve) => {
      resolveNinetyDays = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/projects/default") {
        return Promise.resolve(jsonResponse({ id: 42, name: "Local Project" }));
      }
      if (url === "/api/projects/42/workspace-snapshot") {
        return Promise.resolve(
          jsonResponse({
            ...workspaceSnapshotResponse(),
            suggestions: pendingSuggestionResponse(),
            review_analytics: reviewAnalyticsResponse(),
            review_analytics_trend: reviewAnalyticsTrendResponse(14, 2)
          })
        );
      }
      if (url.endsWith("days=7")) {
        return sevenDaysResponse;
      }
      if (url.endsWith("days=90")) {
        return ninetyDaysResponse;
      }
      return Promise.resolve(jsonResponse({ detail: "Not found" }, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(await screen.findByRole("tab", { name: "审核" }));
    const range = screen.getByLabelText("趋势快照范围");
    fireEvent.change(range, { target: { value: "7" } });
    fireEvent.change(range, { target: { value: "90" } });

    await act(async () => {
      resolveNinetyDays(jsonResponse(reviewAnalyticsTrendResponse(90, 9)));
    });
    expect(await screen.findByText("9 个快照")).toBeInTheDocument();

    await act(async () => {
      resolveSevenDays(jsonResponse(reviewAnalyticsTrendResponse(7, 4)));
    });
    await waitFor(() => {
      expect(screen.getByText("9 个快照")).toBeInTheDocument();
      expect(screen.queryByText("4 个快照")).not.toBeInTheDocument();
    });
  });

  it("persists edited relationship modeling drafts from the import drawer", async () => {
    let reviewSubmitted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse({
          nodes: [
            {
              id: 1,
              node_type: "field",
              label: "Orders.customer_id",
              source_ref: "orders.customer_id",
              metadata: { inferred_type: "identifier", key_candidate_score: 0.91 },
              position_x: 80,
              position_y: 180
            },
            {
              id: 2,
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
              id: 100,
              source_node_id: 1,
              target_node_id: 2,
              edge_type: reviewSubmitted ? "same_entity" : "foreign_key",
              confidence: 0.94,
              status: reviewSubmitted ? "edited" : "suggested",
              evidence_ref: "suggestion:0",
              created_from_suggestion_id: 7,
              metadata: reviewSubmitted ? { review_evidence_quality: "high" } : {},
              evidence_summary: "3 of 3 rows match.",
              evidence_payload: { overlap_count: 3 }
            }
          ]
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([
          {
            id: 7,
            source_field_id: 1,
            target_field_id: 2,
            source_label: "Orders.customer_id",
            target_label: "Customers.customer_id",
            relationship_type: reviewSubmitted ? "same_entity" : "foreign_key",
            confidence: 0.94,
            evidence_summary: "3 of 3 rows match.",
            evidence_payload: reviewSubmitted
              ? { overlap_count: 3, review_evidence_quality: "high" }
              : { overlap_count: 3 },
            decision_status: reviewSubmitted ? "edited" : "pending"
          }
        ]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions/7/review") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          decision_status: "edited",
          decision_note: null,
          relationship_type: "same_entity",
          evidence_quality: "high"
        });
        reviewSubmitted = true;
        return jsonResponse({ status: "ok" });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const modeling = await screen.findByRole("region", { name: "关系建模编辑器" });

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

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/relationship-suggestions/7/review",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await within(modeling).findByText("已建模 1/1 条关系")).toBeInTheDocument();
    expect(screen.getByLabelText("关系 Orders.customer_id 到 Customers.customer_id 的类型")).toHaveValue(
      "same_entity"
    );
  });

  it("uses the default project endpoint instead of creating a new project every startup", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("button", { name: "搜索" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/default",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("loads project AI settings and saves edited provider settings", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings" && init?.method === "PUT") {
        expect(JSON.parse(String(init.body))).toEqual({
          ai: {
            chat: {
              provider: "openai-compatible",
              model: "gpt-4.1-mini",
              base_url: "https://api.example.com/v1",
              api_key: "sk-test",
              temperature: 0.2
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
        });
        return jsonResponse({
          ai: {
            chat: {
              provider: "openai-compatible",
              model: "gpt-4.1-mini",
              base_url: "https://api.example.com/v1",
              api_key: "sk-test",
              temperature: 0.2
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
        });
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("button", { name: "搜索" });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/settings");

    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "AI 和向量设置" }));
    fireEvent.change(screen.getByLabelText("对话模型提供方"), {
      target: { value: "openai-compatible" }
    });
    fireEvent.change(screen.getByLabelText("对话模型名称"), {
      target: { value: "gpt-4.1-mini" }
    });
    fireEvent.change(screen.getByLabelText("对话 Base URL"), {
      target: { value: "https://api.example.com/v1" }
    });
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "sk-test" }
    });
    fireEvent.change(screen.getByLabelText("温度"), {
      target: { value: "0.2" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/settings",
        expect.objectContaining({ method: "PUT" })
      );
    });
    expect(await screen.findByText("OpenAI Compatible")).toBeInTheDocument();
  });

  it("saves review analytics retention settings from the settings dialog", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings" && init?.method === "PUT") {
        expect(JSON.parse(String(init.body))).toEqual({
          ...defaultSettingsResponse(),
          review_analytics: {
            retention_days: 90,
            auto_cleanup_enabled: true
          }
        });
        return jsonResponse({
          ...defaultSettingsResponse(),
          review_analytics: {
            retention_days: 90,
            auto_cleanup_enabled: true
          }
        });
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("button", { name: "搜索" });
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "AI 和向量设置" }));
    fireEvent.change(screen.getByLabelText("快照默认保留周期"), {
      target: { value: "90" }
    });
    fireEvent.click(screen.getByLabelText("请求时自动清理过期快照"));
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/settings",
        expect.objectContaining({ method: "PUT" })
      );
    });
  });

  it("surfaces project preset export from the settings dialog", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("button", { name: "搜索" });
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "AI 和向量设置" }));

    expect(screen.getByLabelText("导入项目预设")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入项目预设" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出项目预设" })).toBeInTheDocument();
    expect(screen.getByText(/项目预设导出不包含 API Key。/)).toBeInTheDocument();
    expect(
      screen.getByText("自动清理关闭：仍可在 SLA 趋势分析中手动清理过期快照。")
    ).toBeInTheDocument();
  });

  it("builds the local evidence index and refreshes AI vector status", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/vector-index/build") {
        expect(init?.method).toBe("POST");
        return jsonResponse({
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
              index_status: "ready",
              document_count: 8,
              last_built_at: "2026-05-28T12:00:00Z",
              embedding_model: ""
            }
          }
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("button", { name: "搜索" });
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "构建索引" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/vector-index/build",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByText("8 条证据")).toBeInTheDocument();
    expect(screen.getByText("已就绪")).toBeInTheDocument();
  });

  it("uses the workbench header as the only ready-state app header", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("button", { name: "搜索" });
    expect(screen.getAllByRole("heading", { name: "GraphMind" })).toHaveLength(1);
  });

  it("loads persisted import task history on startup", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/import-jobs") {
        return jsonResponse(importJobsResponse());
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const tasks = await screen.findByRole("region", { name: "导入任务" });
    expect(within(tasks).getByText("历史客户.csv")).toBeInTheDocument();
    expect(within(tasks).getByText("完成")).toBeInTheDocument();
    expect(
      within(tasks).getByText("已生成 1 个工作表、5 个字段和 2 条建议。")
    ).toBeInTheDocument();
  });

  it("updates import tasks from the import event stream", async () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/import-jobs") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/sources") {
        return jsonResponse([{ source_kind: "table", count: 1 }]);
      }

      if (url === "/api/projects/42/sources/detail") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/entities") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/extracted-relationships") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/entity-matches") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/mapping-reviews") {
        return jsonResponse([]);
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("button", { name: "数据操作" });
    expect(FakeEventSource.instances[0].url).toBe("/api/projects/42/import-events");

    act(() => {
      FakeEventSource.instances[0].emit("import_job_snapshot", {
        type: "import_job_snapshot",
        jobs: importJobsResponse()
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "数据操作" }));
    const tasks = await screen.findByRole("region", { name: "导入任务" });
    expect(within(tasks).getByText("历史客户.csv")).toBeInTheDocument();
    expect(within(tasks).getByText("完成")).toBeInTheDocument();
  });

  it("refreshes, cancels, and retries persisted import jobs", async () => {
    let failedJobRetried = false;
    let queuedJobCanceled = false;
    let queuedJobRefreshed = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(
          failedJobRetried
            ? {
                nodes: [
                  {
                    id: 10,
                    node_type: "table",
                    label: "Orders",
                    source_ref: "orders",
                    metadata: {},
                    position_x: 80,
                    position_y: 80
                  }
                ],
                edges: []
              }
            : emptyGraphResponse()
        );
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/sources") {
        return jsonResponse(failedJobRetried ? [{ source_kind: "table", count: 1 }] : []);
      }

      if (url === "/api/projects/42/import-jobs") {
        return jsonResponse([
          {
            id: 77,
            project_id: 42,
            label: "failed.csv",
            kind: "file",
            status: "failed",
            progress: 100,
            summary: null,
            error: "Synthetic import failure",
            retryable: true,
            dataset_id: null,
            created_at: "2026-06-06T00:00:00Z",
            updated_at: "2026-06-06T00:00:01Z"
          },
          {
            id: 78,
            project_id: 42,
            label: "stuck.csv",
            kind: "file",
            status: "queued",
            progress: 0,
            summary: null,
            error: null,
            retryable: false,
            dataset_id: null,
            created_at: "2026-06-06T00:01:00Z",
            updated_at: "2026-06-06T00:01:01Z"
          }
        ]);
      }

      if (url === "/api/projects/42/import-jobs/78" && init?.method !== "POST") {
        queuedJobRefreshed = true;
        return jsonResponse({
          id: 78,
          project_id: 42,
          label: "stuck.csv",
          kind: "file",
          status: queuedJobCanceled ? "canceled" : "running",
          progress: queuedJobCanceled ? 100 : 40,
          summary: null,
          error: queuedJobCanceled ? "Import job canceled" : null,
          retryable: false,
          dataset_id: null,
          created_at: "2026-06-06T00:01:00Z",
          updated_at: "2026-06-06T00:01:02Z"
        });
      }

      if (url === "/api/projects/42/import-jobs/78/cancel") {
        expect(init?.method).toBe("POST");
        queuedJobCanceled = true;
        return jsonResponse({
          id: 78,
          project_id: 42,
          label: "stuck.csv",
          kind: "file",
          status: "canceled",
          progress: 100,
          summary: null,
          error: "Import job canceled",
          retryable: false,
          dataset_id: null,
          created_at: "2026-06-06T00:01:00Z",
          updated_at: "2026-06-06T00:01:03Z"
        });
      }

      if (url === "/api/projects/42/import-jobs/77/retry") {
        expect(init?.method).toBe("POST");
        return jsonResponse(
          {
            id: 77,
            project_id: 42,
            label: "failed.csv",
            kind: "file",
            status: "running",
            progress: 25,
            summary: null,
            error: null,
            retryable: false,
            dataset_id: null,
            created_at: "2026-06-06T00:00:00Z",
            updated_at: "2026-06-06T00:02:00Z"
          },
          { status: 202 }
        );
      }

      if (url === "/api/projects/42/import-jobs/77") {
        failedJobRetried = true;
        return jsonResponse({
          id: 77,
          project_id: 42,
          label: "failed.csv",
          kind: "file",
          status: "succeeded",
          progress: 100,
          summary: {
            sheet_count: 1,
            field_count: 2,
            suggestion_count: 0,
            graph_node_count: 3,
            graph_edge_count: 2
          },
          error: null,
          retryable: false,
          dataset_id: 12,
          created_at: "2026-06-06T00:00:00Z",
          updated_at: "2026-06-06T00:02:04Z"
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const tasks = await screen.findByRole("region", { name: "导入任务" });

    fireEvent.click(within(tasks).getByRole("button", { name: "刷新任务 stuck.csv" }));
    await waitFor(() => {
      expect(queuedJobRefreshed).toBe(true);
    });
    expect(within(tasks).getByText("40%")).toBeInTheDocument();

    fireEvent.click(within(tasks).getByRole("button", { name: "取消任务 stuck.csv" }));
    await waitFor(() => {
      expect(queuedJobCanceled).toBe(true);
    });
    expect(await within(tasks).findByText("已取消")).toBeInTheDocument();

    fireEvent.click(within(tasks).getByRole("button", { name: "重试任务 failed.csv" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/import-jobs/77/retry",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByRole("button", { name: "选择 Orders" })).toBeInTheDocument();
    expect(within(tasks).getByText("已生成 1 个工作表、2 个字段和 0 条建议。")).toBeInTheDocument();
  });

  it("recovers queued persisted import jobs from the import health panel", async () => {
    let recoveryRequested = false;
    let recoveredJobPolled = false;
    let resolveRecoveredJobPoll: () => void = () => undefined;
    const recoveredJobPollReady = new Promise<void>((resolve) => {
      resolveRecoveredJobPoll = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(
          recoveredJobPolled
            ? {
                nodes: [
                  {
                    id: 20,
                    node_type: "table",
                    label: "Recovered",
                    source_ref: "recovered",
                    metadata: {},
                    position_x: 80,
                    position_y: 80
                  }
                ],
                edges: []
              }
            : emptyGraphResponse()
        );
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/sources") {
        return jsonResponse(recoveredJobPolled ? [{ source_kind: "table", count: 1 }] : []);
      }

      if (url === "/api/projects/42/import-jobs/recover") {
        expect(init?.method).toBe("POST");
        recoveryRequested = true;
        return jsonResponse({ recovered_count: 1, submitted_count: 1 });
      }

      if (url === "/api/projects/42/import-jobs") {
        return jsonResponse([
          {
            id: 78,
            project_id: 42,
            label: "stuck.csv",
            kind: "file",
            status: recoveryRequested ? "running" : "queued",
            progress: recoveryRequested ? 25 : 0,
            summary: null,
            error: null,
            retryable: false,
            dataset_id: null,
            created_at: "2026-06-06T00:01:00Z",
            updated_at: "2026-06-06T00:01:01Z"
          }
        ]);
      }

      if (url === "/api/projects/42/import-jobs/78") {
        await recoveredJobPollReady;
        recoveredJobPolled = true;
        return jsonResponse({
          id: 78,
          project_id: 42,
          label: "stuck.csv",
          kind: "file",
          status: "succeeded",
          progress: 100,
          summary: {
            sheet_count: 1,
            field_count: 3,
            suggestion_count: 0,
            graph_node_count: 4,
            graph_edge_count: 3
          },
          error: null,
          retryable: false,
          dataset_id: 13,
          created_at: "2026-06-06T00:01:00Z",
          updated_at: "2026-06-06T00:01:04Z"
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    fireEvent.click(await screen.findByRole("button", { name: "恢复卡住任务" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/import-jobs/recover",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(
      await screen.findByText("已恢复 1 个卡住任务，并提交 1 个导入任务。")
    ).toBeInTheDocument();
    resolveRecoveredJobPoll();
    expect(await screen.findByRole("button", { name: "选择 Recovered" })).toBeInTheDocument();
    expect(screen.getByText("已生成 1 个工作表、3 个字段和 0 条建议。")).toBeInTheDocument();
  });

  it("shows recovery failure feedback and allows retrying recovery", async () => {
    let recoverRequestCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/import-jobs") {
        return jsonResponse([
          {
            id: 78,
            project_id: 42,
            label: "stuck.csv",
            kind: "file",
            status: "running",
            progress: 25,
            summary: null,
            error: null,
            retryable: false,
            dataset_id: null,
            created_at: "2026-06-06T00:01:00Z",
            updated_at: "2026-06-06T00:01:01Z"
          }
        ]);
      }

      if (url === "/api/projects/42/import-jobs/recover") {
        expect(init?.method).toBe("POST");
        recoverRequestCount += 1;
        return jsonResponse({ detail: "Recover failed" }, { status: 500 });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const recoverButton = await screen.findByRole("button", { name: "恢复卡住任务" });
    const queueRecoverButton = await screen.findByRole("button", {
      name: "恢复导入任务: 恢复卡住任务"
    });

    fireEvent.click(recoverButton);
    expect(
      await screen.findByText("恢复导入任务失败：Recover import jobs failed: 500")
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(recoverRequestCount).toBe(1);
      expect(recoverButton).toBeEnabled();
      expect(queueRecoverButton).toBeEnabled();
    });

    fireEvent.click(queueRecoverButton);
    await waitFor(() => {
      expect(recoverRequestCount).toBe(2);
    });
  });

  it("ignores duplicate recover requests while one is already running", async () => {
    let recoverRequestCount = 0;
    let resolveRecovery: () => void = () => undefined;
    const recoveryReady = new Promise<void>((resolve) => {
      resolveRecovery = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/import-jobs") {
        return jsonResponse([
          {
            id: 78,
            project_id: 42,
            label: "stuck.csv",
            kind: "file",
            status: "running",
            progress: 25,
            summary: null,
            error: null,
            retryable: false,
            dataset_id: null,
            created_at: "2026-06-06T00:01:00Z",
            updated_at: "2026-06-06T00:01:01Z"
          }
        ]);
      }

      if (url === "/api/projects/42/import-jobs/recover") {
        expect(init?.method).toBe("POST");
        recoverRequestCount += 1;
        await recoveryReady;
        return jsonResponse({ recovered_count: 1, submitted_count: 1 });
      }

      if (url === "/api/projects/42/import-jobs/78") {
        return jsonResponse({
          id: 78,
          project_id: 42,
          label: "stuck.csv",
          kind: "file",
          status: "running",
          progress: 30,
          summary: null,
          error: null,
          retryable: false,
          dataset_id: null,
          created_at: "2026-06-06T00:01:00Z",
          updated_at: "2026-06-06T00:01:02Z"
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const recoverButton = await screen.findByRole("button", { name: "恢复卡住任务" });
    const queueRecoverButton = await screen.findByRole("button", {
      name: "恢复导入任务: 恢复卡住任务"
    });
    fireEvent.click(recoverButton);
    fireEvent.click(recoverButton);
    fireEvent.click(queueRecoverButton);

    await waitFor(() => {
      expect(recoverRequestCount).toBe(1);
    });
    expect(recoverButton).toBeDisabled();
    expect(queueRecoverButton).toBeDisabled();

    resolveRecovery();
  });

  it("waits between running import job polls and refreshes after success", async () => {
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/import-jobs" && init?.method === "POST") {
        return jsonResponse(
          {
            id: 55,
            project_id: 42,
            label: "customers.csv",
            kind: "file",
            status: "running",
            progress: 15,
            summary: null,
            error: null,
            retryable: false,
            dataset_id: null,
            created_at: "2026-06-06T00:00:00Z",
            updated_at: "2026-06-06T00:00:00Z"
          },
          { status: 202 }
        );
      }

      if (url === "/api/projects/42/import-jobs/55") {
        pollCount += 1;
        return jsonResponse({
          id: 55,
          project_id: 42,
          label: "customers.csv",
          kind: "file",
          status: pollCount === 1 ? "running" : "succeeded",
          progress: pollCount === 1 ? 40 : 100,
          summary:
            pollCount === 1
              ? null
              : {
                  sheet_count: 1,
                  field_count: 2,
                  suggestion_count: 0,
                  graph_node_count: 3,
                  graph_edge_count: 2
                },
          error: null,
          retryable: false,
          dataset_id: pollCount === 1 ? null : 12,
          created_at: "2026-06-06T00:00:00Z",
          updated_at: "2026-06-06T00:00:02Z"
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志"), {
      target: {
        files: [new File(["id,name\nc1,Acme"], "customers.csv", { type: "text/csv" })]
      }
    });

    await flushAsyncWork();
    expect(pollCount).toBe(1);
    expect(screen.getByText("处理中")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await flushAsyncWork();

    expect(pollCount).toBe(2);
    expect(screen.getByText("完成")).toBeInTheDocument();
    expect(screen.getByText("已生成 1 个工作表、2 个字段和 0 条建议。")).toBeInTheDocument();
  });

  it("loads source inspection data on startup", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/sources/detail") {
        return jsonResponse(sourceDetailsResponse());
      }

      if (url === "/api/projects/42/sources/1/chunks?limit=50&offset=0") {
        return jsonResponse(sourceChunksPageResponse());
      }

      if (url === "/api/projects/42/entities") {
        return jsonResponse(extractedEntitiesResponse());
      }

      if (url === "/api/projects/42/extracted-relationships") {
        return jsonResponse(extractedRelationshipsResponse());
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("button", { name: "搜索" });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/sources/detail");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/entities");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/extracted-relationships");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/projects/42/sources/1/chunks");
  });

  it("loads entity match reviews on startup and refreshes graph after review", async () => {
    let matchAccepted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse({
          nodes: [
            {
              id: 30,
              node_type: "field",
              label: "customers.customer_id",
              source_ref: "customers.customer_id",
              metadata: { inferred_type: "identifier" },
              position_x: 80,
              position_y: 80
            },
            {
              id: 31,
              node_type: "entity",
              label: "Customer ID",
              source_ref: "entity:customer-id",
              metadata: { entity_type: "concept", source_refs: ["document:1#chunk:0"] },
              position_x: 180,
              position_y: 80
            }
          ],
          edges: [
            {
              id: 7,
              source_node_id: 30,
              target_node_id: 31,
              edge_type: "matches_entity",
              confidence: 0.78,
              status: matchAccepted ? "accepted" : "suggested",
              evidence_ref: "entity_resolution:30:31",
              created_from_suggestion_id: null,
              metadata: { rule: "normalized_name_match", matched_keys: ["customerid"] },
              evidence_summary: "customers.customer_id matches Customer ID by normalized name.",
              evidence_payload: {}
            }
          ]
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/sources/detail") {
        return jsonResponse(sourceDetailsResponse());
      }

      if (url === "/api/projects/42/sources/1/chunks?limit=50&offset=0") {
        return jsonResponse(sourceChunksPageResponse());
      }

      if (url === "/api/projects/42/entities") {
        return jsonResponse(extractedEntitiesResponse());
      }

      if (url === "/api/projects/42/extracted-relationships") {
        return jsonResponse(extractedRelationshipsResponse());
      }

      if (url === "/api/projects/42/entity-matches") {
        return jsonResponse(entityMatchReviewsResponse(matchAccepted ? "accepted" : "suggested"));
      }

      if (url === "/api/projects/42/mapping-reviews") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/entity-matches/7/review") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ decision_status: "accepted" });
        matchAccepted = true;
        return jsonResponse(entityMatchReviewsResponse("accepted")[0]);
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const acceptButton = await screen.findByRole("button", {
      name: "接受实体匹配 customers.customer_id 到 Customer ID"
    });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/entity-matches/7/review",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/entity-matches");
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/graph");
    });
    expect(await screen.findByText("已接受")).toBeInTheDocument();
  });

  it("loads mapping reviews on startup and refreshes graph after review", async () => {
    let mappingAccepted = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse({
          nodes: [
            {
              id: 40,
              node_type: "field",
              label: "customers.customer_id",
              source_ref: "customers.customer_id",
              metadata: { inferred_type: "identifier" },
              position_x: 80,
              position_y: 80
            },
            {
              id: 41,
              node_type: "field",
              label: "orders.customer_id",
              source_ref: "orders.customer_id",
              metadata: { inferred_type: "identifier" },
              position_x: 180,
              position_y: 80
            }
          ],
          edges: [
            {
              id: 9,
              source_node_id: 40,
              target_node_id: 41,
              edge_type: "documented_mapping",
              confidence: 0.92,
              status: mappingAccepted ? "accepted" : "suggested",
              evidence_ref: "identity.md#chunk-1",
              created_from_suggestion_id: null,
              metadata: { rule: "documented_field_mapping" },
              evidence_summary: "Customer ID maps to customerId.",
              evidence_payload: {}
            }
          ]
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/sources/detail") {
        return jsonResponse(sourceDetailsResponse());
      }

      if (url === "/api/projects/42/sources/1/chunks?limit=50&offset=0") {
        return jsonResponse(sourceChunksPageResponse());
      }

      if (url === "/api/projects/42/entities") {
        return jsonResponse(extractedEntitiesResponse());
      }

      if (url === "/api/projects/42/extracted-relationships") {
        return jsonResponse(extractedRelationshipsResponse());
      }

      if (url === "/api/projects/42/entity-matches") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/mapping-reviews") {
        return jsonResponse(mappingReviewsResponse(mappingAccepted ? "accepted" : "suggested"));
      }

      if (url === "/api/projects/42/mapping-reviews/9/review") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ decision_status: "accepted" });
        mappingAccepted = true;
        return jsonResponse(mappingReviewsResponse("accepted")[0]);
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const acceptButton = await screen.findByRole("button", {
      name: "接受文档映射 customers.customer_id 到 orders.customer_id"
    });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/mapping-reviews/9/review",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/mapping-reviews");
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/graph");
    });
    expect(await screen.findByText("已接受")).toBeInTheDocument();
  });

  it("uploads a CSV and refreshes graph and suggestions from the import result", async () => {
    let asyncImportComplete = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        if (!asyncImportComplete) {
          return jsonResponse(emptyGraphResponse());
        }
        return jsonResponse({
          nodes: [
            {
              id: 10,
              node_type: "table",
              label: "Orders",
              source_ref: "orders",
              metadata: {},
              position_x: 80,
              position_y: 80
            }
          ],
          edges: []
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse(asyncImportComplete ? importSuggestionResponse() : []);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/import-jobs" && init?.method === "POST") {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBeInstanceOf(FormData);
        return jsonResponse({
          id: 95,
          project_id: 42,
          label: "orders.csv",
          kind: "file",
          status: "running",
          progress: 25,
          summary: null,
          error: null,
          retryable: false,
          dataset_id: null,
          created_at: "2026-05-31T10:00:00Z",
          updated_at: "2026-05-31T10:00:01Z"
        }, { status: 202 });
      }

      if (url === "/api/projects/42/import-jobs/95") {
        asyncImportComplete = true;
        return jsonResponse({
          id: 95,
          project_id: 42,
          label: "orders.csv",
          kind: "file",
          status: "succeeded",
          progress: 100,
          summary: {
            sheet_count: 1,
            field_count: 2,
            suggestion_count: 1,
            graph_node_count: 2,
            graph_edge_count: 1
          },
          error: null,
          retryable: false,
          dataset_id: 5,
          created_at: "2026-05-31T10:00:00Z",
          updated_at: "2026-05-31T10:00:02Z"
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const input = await screen.findByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志");
    const file = new File(["order_id,customer_id\no1,c1"], "orders.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/import-jobs",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByRole("button", { name: "选择 Orders" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "待审核" })).getByText("Orders.customer_id")
    ).toBeInTheDocument();
    expect(screen.getByText("导入完成：1 个工作表，2 个字段，1 条建议。")).toBeInTheDocument();
    const tasks = screen.getByRole("region", { name: "导入任务" });
    expect(within(tasks).getByText("orders.csv")).toBeInTheDocument();
    expect(within(tasks).getByText("完成")).toBeInTheDocument();
  });

  it("uploads multiple structured files as a batch and refreshes source summaries", async () => {
    let batchComplete = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        if (!batchComplete) {
          return jsonResponse(emptyGraphResponse());
        }
        return jsonResponse({
          nodes: [
            {
              id: 10,
              node_type: "table",
              label: "Customers",
              source_ref: "customers",
              metadata: {},
              position_x: 80,
              position_y: 80
            }
          ],
          edges: []
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/sources") {
        return jsonResponse(
          batchComplete
            ? [
                { source_kind: "table", count: 1 },
                { source_kind: "json", count: 1 }
              ]
            : []
        );
      }

      if (url === "/api/projects/42/import-batches" && init?.method === "POST") {
        expect(init.body).toBeInstanceOf(FormData);
        batchComplete = true;
        return jsonResponse({
          id: 17,
          project_id: 42,
          label: "2 个文件批量导入",
          status: "succeeded",
          progress: 100,
          summary: {
            dataset_count: 2,
            item_count: 2,
            sheet_count: 2,
            field_count: 4,
            suggestion_count: 0
          },
          error: null,
          items: [
            {
              id: 1,
              batch_id: 17,
              project_id: 42,
              filename: "customers.csv",
              file_type: ".csv",
              source_kind: "table",
              status: "succeeded",
              raw_data_ref: "uploads/customers.csv",
              artifact_ref: null,
              error: null,
              summary: {
                stages: [
                  {
                    name: "parsed",
                    status: "complete",
                    progress: 20,
                    summary: "Parsed 1 structured sheet."
                  },
                  {
                    name: "profiled",
                    status: "complete",
                    progress: 40,
                    summary: "Profiled 2 fields."
                  },
                  {
                    name: "indexed",
                    status: "complete",
                    progress: 100,
                    summary: "Evidence and graph artifacts are ready."
                  }
                ]
              },
              created_at: "2026-06-02T00:00:00Z",
              updated_at: "2026-06-02T00:00:00Z"
            },
            {
              id: 2,
              batch_id: 17,
              project_id: 42,
              filename: "orders.json",
              file_type: ".json",
              source_kind: "json",
              status: "succeeded",
              raw_data_ref: "uploads/orders.json",
              artifact_ref: null,
              error: null,
              summary: {
                stages: [
                  {
                    name: "parsed",
                    status: "complete",
                    progress: 20,
                    summary: "Parsed 1 structured sheet."
                  },
                  {
                    name: "profiled",
                    status: "complete",
                    progress: 40,
                    summary: "Profiled 2 fields."
                  },
                  {
                    name: "indexed",
                    status: "complete",
                    progress: 100,
                    summary: "Evidence and graph artifacts are ready."
                  }
                ]
              },
              created_at: "2026-06-02T00:00:00Z",
              updated_at: "2026-06-02T00:00:00Z"
            }
          ],
          created_at: "2026-06-02T00:00:00Z",
          updated_at: "2026-06-02T00:00:00Z"
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const input = await screen.findByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志");
    fireEvent.change(input, {
      target: {
        files: [
          new File(["id,name\nc1,Alice"], "customers.csv", { type: "text/csv" }),
          new File(['[{"order_id":"o1","customer_id":"c1"}]'], "orders.json", {
            type: "application/json"
          })
        ]
      }
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/import-batches",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByRole("button", { name: "选择 Customers" })).toBeInTheDocument();
    expect(screen.getByText("table · 1")).toBeInTheDocument();
    expect(screen.getByText("json · 1")).toBeInTheDocument();
    const tasks = screen.getByRole("region", { name: "导入任务" });
    expect(within(tasks).getByText("2 个文件批量导入")).toBeInTheDocument();
    expect(within(tasks).getByText("完成")).toBeInTheDocument();
    expect(within(tasks).getByText("customers.csv · 已画像")).toBeInTheDocument();
    expect(within(tasks).getAllByText("Profiled 2 fields.")).toHaveLength(2);
    expect(within(tasks).getByText("orders.json · 已索引")).toBeInTheDocument();
    expect(within(tasks).getAllByText("Evidence and graph artifacts are ready.")).toHaveLength(2);
  });

  it("shows partial batch imports with failed file stages", async () => {
    let batchComplete = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        if (!batchComplete) {
          return jsonResponse(emptyGraphResponse());
        }
        return jsonResponse({
          nodes: [
            {
              id: 10,
              node_type: "table",
              label: "Customers",
              source_ref: "customers",
              metadata: {},
              position_x: 80,
              position_y: 80
            }
          ],
          edges: []
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/sources") {
        return jsonResponse(batchComplete ? [{ source_kind: "table", count: 1 }] : []);
      }

      if (url === "/api/projects/42/import-batches" && init?.method === "POST") {
        expect(init.body).toBeInstanceOf(FormData);
        batchComplete = true;
        return jsonResponse({
          id: 21,
          project_id: 42,
          label: "2 个文件批量导入",
          status: "partial",
          progress: 100,
          summary: {
            dataset_count: 1,
            item_count: 2,
            sheet_count: 1,
            field_count: 2,
            suggestion_count: 0,
            succeeded_item_count: 1,
            failed_item_count: 1
          },
          error: null,
          items: [
            {
              id: 1,
              batch_id: 21,
              project_id: 42,
              filename: "customers.csv",
              file_type: ".csv",
              source_kind: "table",
              status: "succeeded",
              raw_data_ref: "uploads/customers.csv",
              artifact_ref: null,
              error: null,
              summary: {
                stages: [
                  {
                    name: "indexed",
                    status: "complete",
                    progress: 100,
                    summary: "Evidence and graph artifacts are ready."
                  }
                ]
              },
              created_at: "2026-06-03T00:00:00Z",
              updated_at: "2026-06-03T00:00:00Z"
            },
            {
              id: 2,
              batch_id: 21,
              project_id: 42,
              filename: "broken.json",
              file_type: ".json",
              source_kind: "json",
              status: "failed",
              raw_data_ref: "",
              artifact_ref: null,
              error: "Unexpected token",
              summary: {
                stage: "failed",
                stages: [
                  {
                    name: "staged",
                    status: "complete",
                    progress: 5,
                    summary: "File staged for import."
                  },
                  {
                    name: "failed",
                    status: "failed",
                    progress: 100,
                    summary: "Unexpected token"
                  }
                ]
              },
              created_at: "2026-06-03T00:00:00Z",
              updated_at: "2026-06-03T00:00:00Z"
            }
          ],
          created_at: "2026-06-03T00:00:00Z",
          updated_at: "2026-06-03T00:00:00Z"
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const input = await screen.findByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志");
    fireEvent.change(input, {
      target: {
        files: [
          new File(["id,name\nc1,Alice"], "customers.csv", { type: "text/csv" }),
          new File(["{not valid json"], "broken.json", { type: "application/json" })
        ]
      }
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/import-batches",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByRole("button", { name: "选择 Customers" })).toBeInTheDocument();
    const tasks = screen.getByRole("region", { name: "导入任务" });
    expect(within(tasks).getByText("2 个文件批量导入")).toBeInTheDocument();
    expect(within(tasks).getByText("部分完成")).toBeInTheDocument();
    expect(within(tasks).getByText("broken.json · 失败")).toBeInTheDocument();
    expect(within(tasks).getByText("Unexpected token")).toBeInTheDocument();
  });

  it("retries a failed batch item and refreshes the import task", async () => {
    let batchState: "empty" | "partial" | "retried" = "empty";
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        if (batchState === "empty") {
          return jsonResponse(emptyGraphResponse());
        }
        return jsonResponse({
          nodes: [
            {
              id: 10,
              node_type: "table",
              label: batchState === "retried" ? "Orders" : "Customers",
              source_ref: batchState === "retried" ? "orders" : "customers",
              metadata: {},
              position_x: 80,
              position_y: 80
            }
          ],
          edges: []
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/sources") {
        return jsonResponse(
          batchState === "empty"
            ? []
            : [
                { source_kind: "table", count: 1 },
                { source_kind: "json", count: batchState === "retried" ? 1 : 0 }
              ].filter((source) => source.count > 0)
        );
      }

      if (url === "/api/projects/42/sources/detail") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/entities") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/extracted-relationships") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/import-batches" && init?.method === "POST") {
        expect(init.body).toBeInstanceOf(FormData);
        batchState = "partial";
        return jsonResponse({
          id: 31,
          project_id: 42,
          label: "2 个文件批量导入",
          status: "partial",
          progress: 100,
          summary: {
            dataset_count: 1,
            item_count: 2,
            sheet_count: 1,
            field_count: 2,
            suggestion_count: 0,
            succeeded_item_count: 1,
            failed_item_count: 1
          },
          error: null,
          items: [
            {
              id: 18,
              batch_id: 31,
              project_id: 42,
              filename: "customers.csv",
              file_type: ".csv",
              source_kind: "table",
              status: "succeeded",
              raw_data_ref: "uploads/customers.csv",
              artifact_ref: null,
              error: null,
              summary: {
                stages: [
                  {
                    name: "indexed",
                    status: "complete",
                    progress: 100,
                    summary: "Evidence and graph artifacts are ready."
                  }
                ]
              },
              created_at: "2026-06-03T00:00:00Z",
              updated_at: "2026-06-03T00:00:00Z"
            },
            {
              id: 19,
              batch_id: 31,
              project_id: 42,
              filename: "broken.json",
              file_type: ".json",
              source_kind: "json",
              status: "failed",
              raw_data_ref: "uploads/broken.json",
              artifact_ref: null,
              error: "Unexpected token",
              summary: {
                stage: "failed",
                stages: [
                  {
                    name: "failed",
                    status: "failed",
                    progress: 100,
                    summary: "Unexpected token"
                  }
                ]
              },
              created_at: "2026-06-03T00:00:00Z",
              updated_at: "2026-06-03T00:00:00Z"
            }
          ],
          created_at: "2026-06-03T00:00:00Z",
          updated_at: "2026-06-03T00:00:00Z"
        });
      }

      if (url === "/api/projects/42/import-items/19/retry") {
        expect(init?.method).toBe("POST");
        batchState = "retried";
        return jsonResponse({
          id: 31,
          project_id: 42,
          label: "2 个文件批量导入",
          status: "succeeded",
          progress: 100,
          summary: {
            dataset_count: 2,
            item_count: 2,
            sheet_count: 2,
            field_count: 5,
            suggestion_count: 0,
            succeeded_item_count: 2,
            failed_item_count: 0
          },
          error: null,
          items: [
            {
              id: 18,
              batch_id: 31,
              project_id: 42,
              filename: "customers.csv",
              file_type: ".csv",
              source_kind: "table",
              status: "succeeded",
              raw_data_ref: "uploads/customers.csv",
              artifact_ref: null,
              error: null,
              summary: {
                stages: [
                  {
                    name: "indexed",
                    status: "complete",
                    progress: 100,
                    summary: "Evidence and graph artifacts are ready."
                  }
                ]
              },
              created_at: "2026-06-03T00:00:00Z",
              updated_at: "2026-06-03T00:00:03Z"
            },
            {
              id: 19,
              batch_id: 31,
              project_id: 42,
              filename: "broken.json",
              file_type: ".json",
              source_kind: "json",
              status: "succeeded",
              raw_data_ref: "uploads/broken.json",
              artifact_ref: null,
              error: null,
              summary: {
                stages: [
                  {
                    name: "parsed",
                    status: "complete",
                    progress: 20,
                    summary: "Parsed 1 structured sheet."
                  },
                  {
                    name: "profiled",
                    status: "complete",
                    progress: 40,
                    summary: "Profiled 3 fields."
                  },
                  {
                    name: "indexed",
                    status: "complete",
                    progress: 100,
                    summary: "Evidence and graph artifacts are ready."
                  }
                ]
              },
              created_at: "2026-06-03T00:00:00Z",
              updated_at: "2026-06-03T00:00:03Z"
            }
          ],
          created_at: "2026-06-03T00:00:00Z",
          updated_at: "2026-06-03T00:00:03Z"
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const input = await screen.findByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志");
    fireEvent.change(input, {
      target: {
        files: [
          new File(["id,name\nc1,Alice"], "customers.csv", { type: "text/csv" }),
          new File(["{not valid json"], "broken.json", { type: "application/json" })
        ]
      }
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/import-batches",
        expect.objectContaining({ method: "POST" })
      );
    });
    const tasks = await screen.findByRole("region", { name: "导入任务" });
    fireEvent.click(within(tasks).getByRole("button", { name: "重试文件 broken.json" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/import-items/19/retry",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/graph");
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/relationship-suggestions");
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/sources");
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/sources/detail");
    });
    expect(await screen.findByRole("button", { name: "选择 Orders" })).toBeInTheDocument();
    expect(within(tasks).getByText("完成")).toBeInTheDocument();
    expect(within(tasks).queryByText("broken.json · 失败")).not.toBeInTheDocument();
    expect(within(tasks).getByText("broken.json · 已索引")).toBeInTheDocument();
  });

  it("refreshes source inspection data after batch import", async () => {
    let batchComplete = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(
          batchComplete
            ? {
                nodes: [
                  {
                    id: 30,
                    node_type: "document",
                    label: "README.md",
                    source_ref: "document:1",
                    metadata: { document_type: "markdown" },
                    position_x: 80,
                    position_y: 80
                  }
                ],
                edges: []
              }
            : emptyGraphResponse()
        );
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/sources") {
        return jsonResponse(batchComplete ? [{ source_kind: "document", count: 1 }] : []);
      }

      if (url === "/api/projects/42/sources/detail") {
        return jsonResponse(batchComplete ? sourceDetailsResponse() : []);
      }

      if (url === "/api/projects/42/sources/1/chunks?limit=50&offset=0") {
        return jsonResponse(sourceChunksPageResponse());
      }

      if (url === "/api/projects/42/entities") {
        return jsonResponse(batchComplete ? extractedEntitiesResponse() : []);
      }

      if (url === "/api/projects/42/extracted-relationships") {
        return jsonResponse(batchComplete ? extractedRelationshipsResponse() : []);
      }

      if (url === "/api/projects/42/import-batches" && init?.method === "POST") {
        batchComplete = true;
        return jsonResponse({
          id: 19,
          project_id: 42,
          label: "1 个文件批量导入",
          status: "succeeded",
          progress: 100,
          summary: {
            dataset_count: 0,
            document_count: 1,
            item_count: 1,
            sheet_count: 0,
            field_count: 0,
            suggestion_count: 0
          },
          error: null,
          items: [
            {
              id: 1,
              batch_id: 19,
              project_id: 42,
              filename: "README.md",
              file_type: ".md",
              source_kind: "document",
              status: "succeeded",
              raw_data_ref: "uploads/README.md",
              artifact_ref: "document_sources:1",
              error: null,
              summary: { document_count: 1 },
              created_at: "2026-06-02T00:00:00Z",
              updated_at: "2026-06-02T00:00:00Z"
            }
          ],
          created_at: "2026-06-02T00:00:00Z",
          updated_at: "2026-06-02T00:00:00Z"
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const input = await screen.findByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志");
    fireEvent.change(input, {
      target: {
        files: [new File(["# GraphMind"], "README.md", { type: "text/markdown" })]
      }
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/import-batches",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/sources/detail");
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/entities");
      expect(fetchMock).toHaveBeenCalledWith("/api/projects/42/extracted-relationships");
    });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/projects/42/sources/1/chunks");
  });

  it("uploads a single repository zip through batch import", async () => {
    let batchComplete = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        if (!batchComplete) {
          return jsonResponse(emptyGraphResponse());
        }
        return jsonResponse({
          nodes: [
            {
              id: 30,
              node_type: "code_symbol",
              label: "src/app.py::run_import",
              source_ref: "entity:12",
              metadata: { entity_type: "function" },
              position_x: 80,
              position_y: 80
            }
          ],
          edges: []
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/sources") {
        return jsonResponse(batchComplete ? [{ source_kind: "code", count: 1 }] : []);
      }

      if (url === "/api/projects/42/import-batches" && init?.method === "POST") {
        expect(init.body).toBeInstanceOf(FormData);
        batchComplete = true;
        return jsonResponse({
          id: 18,
          project_id: 42,
          label: "1 个文件批量导入",
          status: "succeeded",
          progress: 100,
          summary: {
            dataset_count: 0,
            document_count: 2,
            item_count: 1,
            sheet_count: 0,
            field_count: 0,
            suggestion_count: 0
          },
          error: null,
          items: [
            {
              id: 1,
              batch_id: 18,
              project_id: 42,
              filename: "repo.zip",
              file_type: ".zip",
              source_kind: "code",
              status: "succeeded",
              raw_data_ref: "uploads/repo.zip",
              artifact_ref: "document_sources:1,2",
              error: null,
              summary: { repository_file_count: 2 },
              created_at: "2026-06-02T00:00:00Z",
              updated_at: "2026-06-02T00:00:00Z"
            }
          ],
          created_at: "2026-06-02T00:00:00Z",
          updated_at: "2026-06-02T00:00:00Z"
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const input = await screen.findByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志");
    fireEvent.change(input, {
      target: {
        files: [new File(["zip-bytes"], "repo.zip", { type: "application/zip" })]
      }
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/import-batches",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/projects/42/import-jobs",
      expect.objectContaining({ method: "POST" })
    );
    expect(await screen.findByText("src/app.py::run_import")).toBeInTheDocument();
    expect(screen.getByText("code · 1")).toBeInTheDocument();
  });

  it("records failed import tasks and retries the original file", async () => {
    let importAttempt = 0;
    let asyncImportComplete = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        if (!asyncImportComplete) {
          return jsonResponse(emptyGraphResponse());
        }
        return jsonResponse({
          nodes: [
            {
              id: 10,
              node_type: "table",
              label: "Customers",
              source_ref: "customers",
              metadata: {},
              position_x: 80,
              position_y: 80
            }
          ],
          edges: []
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/import-jobs" && init?.method === "POST") {
        expect(init?.method).toBe("POST");
        importAttempt += 1;
        if (importAttempt === 1) {
          return jsonResponse(
            {
              detail: {
                code: "UNSUPPORTED_IMPORT_FILE_TYPE",
                message: "Unsupported import file type",
                user_action: "Upload a supported file type.",
                retryable: true,
                field_errors: { file: "Unsupported import file type" }
              }
            },
            { status: 400 }
          );
        }
        return jsonResponse({
          id: 96,
          project_id: 42,
          label: "customers.csv",
          kind: "file",
          status: "running",
          progress: 25,
          summary: null,
          error: null,
          retryable: false,
          dataset_id: null,
          created_at: "2026-05-31T10:03:00Z",
          updated_at: "2026-05-31T10:03:01Z"
        }, { status: 202 });
      }

      if (url === "/api/projects/42/import-jobs/96") {
        asyncImportComplete = true;
        return jsonResponse({
          id: 96,
          project_id: 42,
          label: "customers.csv",
          kind: "file",
          status: "succeeded",
          progress: 100,
          summary: {
            sheet_count: 1,
            field_count: 2,
            suggestion_count: 0,
            graph_node_count: 1,
            graph_edge_count: 0
          },
          error: null,
          retryable: false,
          dataset_id: 6,
          created_at: "2026-05-31T10:03:00Z",
          updated_at: "2026-05-31T10:03:02Z"
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    const input = await screen.findByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志");
    const file = new File(["id,name\n1,Alice"], "customers.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText("Unsupported import file type Upload a supported file type.")
    ).toBeInTheDocument();
    const tasks = screen.getByRole("region", { name: "导入任务" });
    expect(within(tasks).getByText("失败")).toBeInTheDocument();
    expect(within(tasks).getByText("错误明细")).toBeInTheDocument();

    fireEvent.click(within(tasks).getByRole("button", { name: "重试任务 customers.csv" }));

    await waitFor(() => {
      expect(importAttempt).toBe(2);
    });
    expect(await screen.findByRole("button", { name: "选择 Customers" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "导入任务" })).getByText("完成")).toBeInTheDocument();
  });

  it("imports built-in sample data and refreshes graph and suggestions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/sample-import") {
        expect(init?.method).toBe("POST");
        return jsonResponse({
          import_job_id: 97,
          dataset_id: 9,
          sheet_count: 3,
          field_count: 12,
          suggestion_count: 4,
          graph_node_count: 15,
          graph_edge_count: 16,
          graph: {
            nodes: [
              {
                id: 10,
                node_type: "table",
                label: "Customers",
                source_ref: "customers",
                metadata: { row_count: 4, column_count: 4 },
                position_x: 80,
                position_y: 80
              }
            ],
            edges: []
          },
          suggestions: [
            {
              id: 11,
              source_field_id: 21,
              target_field_id: 31,
              source_label: "Orders.customer_id",
              target_label: "Customers.id",
              relationship_type: "foreign_key",
              confidence: 0.9,
              evidence_summary: "示例关系。",
              evidence_payload: { relationship_strength: "strong", sample_matches: ["c1"] },
              decision_status: "pending"
            }
          ]
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "数据操作" }));
    fireEvent.click(await screen.findByRole("button", { name: "导入示例数据" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/sample-import",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByRole("button", { name: "选择 Customers" })).toBeInTheDocument();
    expect(screen.getByText("导入完成：3 个工作表，12 个字段，4 条建议。")).toBeInTheDocument();
  });

  it("resets the current project data after confirmation", async () => {
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse({
          nodes: [
            {
              id: 10,
              node_type: "table",
              label: "Orders",
              source_ref: "orders",
              metadata: {},
              position_x: 80,
              position_y: 80
            }
          ],
          edges: []
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse(importSuggestionResponse());
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/data") {
        expect(init?.method).toBe("DELETE");
        return jsonResponse({
          graph: emptyGraphResponse(),
          suggestions: []
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("button", { name: "选择 Orders" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "数据操作" }));
    fireEvent.click(screen.getByRole("button", { name: "重置当前项目数据" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/data",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    expect(confirmMock).toHaveBeenCalledWith(
      "这会删除当前项目已导入的表、图谱和关系建议。是否继续？"
    );
    expect(await screen.findByText("当前项目数据已重置。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择 Orders" })).not.toBeInTheDocument();
  });

  it("submits chat questions and renders cited answers", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse(emptyGraphResponse());
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/chat") {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          question: "What fields are in Orders?"
        });
        return jsonResponse({
          content: "Orders contains order_id and amount.",
          query_plan: { question_type: "schema_explanation" },
          answer_confidence: "high",
          citations: [
            {
              label: "Orders.order_id",
              source_ref: "Orders.order_id",
              citation_type: "field"
            }
          ],
          highlighted_graph_path: [100],
          retrieved_evidence: [
            {
              label: "Orders.customer_id -> Customers.id",
              kind: "graph_edge",
              source_ref: "suggestion:12",
              score: 3.2,
              excerpt: "Customer IDs overlap across all sampled rows."
            }
          ],
          graph_actions: [
            {
              id: "highlight-path",
              type: "highlight_path",
              label: "高亮图谱路径",
              description: "在图谱中高亮回答涉及的字段和关系。",
              node_ids: [100],
              edge_ids: [],
              suggestion_ids: [],
              evidence_refs: [],
              metadata: {}
            }
          ],
          next_steps: ["查看 AI 高亮路径中的字段关系。"]
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await screen.findByRole("button", { name: "搜索" });
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    await screen.findByRole("heading", { name: "AI 关系问答" });
    fireEvent.change(screen.getByLabelText("询问数据关系"), {
      target: { value: "What fields are in Orders?" }
    });
    fireEvent.click(screen.getByRole("button", { name: "询问 AI" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/chat",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByText("Orders contains order_id and amount.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看引用 Orders.order_id" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看证据 Orders.order_id" })).toBeInTheDocument();
    expect(screen.getByText("检索证据")).toBeInTheDocument();
    expect(screen.getByText("Orders.customer_id -> Customers.id")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "执行图谱动作 高亮图谱路径" })).toBeInTheDocument();
    expect(screen.getByText("查看 AI 高亮路径中的字段关系。")).toBeInTheDocument();
    expect(screen.getByText((content) => content.replace(/\s+/g, " ").trim() === "AI 路径：1 个项目")).toBeInTheDocument();
  });

  it("sends selected graph item context with chat questions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/default") {
        return jsonResponse({ id: 42, name: "Local Project" });
      }

      if (url === "/api/projects/42/graph") {
        return jsonResponse({
          nodes: [
            {
              id: 10,
              node_type: "field",
              label: "Orders.customer_id",
              source_ref: "orders.customer_id",
              metadata: { inferred_type: "identifier" },
              position_x: 80,
              position_y: 180
            }
          ],
          edges: []
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return jsonResponse([]);
      }

      if (url === "/api/projects/42/settings") {
        return jsonResponse(defaultSettingsResponse());
      }

      if (url === "/api/projects/42/chat") {
        expect(JSON.parse(String(init?.body))).toEqual({
          question: "解释当前选中项的上下游关系",
          selection: { kind: "node", id: 10 }
        });
        return jsonResponse({
          content: "Orders.customer_id 的上游有 0 个节点：无；下游有 0 个节点：无。",
          query_plan: {
            question_type: "relationship_path",
            selection: { kind: "node", id: 10 }
          },
          answer_confidence: "high",
          citations: [],
          highlighted_graph_path: [10]
        });
      }

      return jsonResponse({ detail: "Not found" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "选择 Orders.customer_id" }));
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    fireEvent.click(screen.getByRole("button", { name: "解释当前选中项的上下游关系" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/projects/42/chat",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByText(/Orders\.customer_id 的上游有 0 个节点/)).toBeInTheDocument();
  });
});
