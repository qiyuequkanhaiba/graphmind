import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useState } from "react";
import {
  defaultProjectSettings,
  emptyGraph,
  type WorkspaceState
} from "../src/state/workspaceStore";
import { buildImportTaskFromJob, useImportActions } from "../src/state/useImportActions";
import type { ReviewAnalyticsTrendDays } from "../src/api/types";

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

type ImportActions = ReturnType<typeof useImportActions>;

function t(key: string, values: Record<string, string | number> = {}) {
  if (key === "app.importComplete") {
    return `Imported ${values.sheets} sheets, ${values.fields} fields, ${values.suggestions} suggestions`;
  }
  return key;
}

function Harness({
  onActions,
  onState,
  initialStateOverride = initialState,
  reviewAnalyticsTrendDays = 14
}: {
  onActions: (actions: ImportActions) => void;
  onState: (state: WorkspaceState) => void;
  initialStateOverride?: WorkspaceState;
  reviewAnalyticsTrendDays?: ReviewAnalyticsTrendDays;
}) {
  const [state, setState] = useState<WorkspaceState>(initialStateOverride);
  const actions = useImportActions({
    projectId: state.projectId,
    importTasks: state.importTasks,
    workspaceState: state,
    reviewAnalyticsTrendDays,
    setState,
    t
  });
  onActions(actions);
  onState(state);
  return null;
}

describe("useImportActions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps persisted import job timestamps and URL kind into import tasks", () => {
    expect(
      buildImportTaskFromJob(
        {
          id: 12,
          project_id: 42,
          label: "https://example.com/docs",
          kind: "url",
          status: "running",
          progress: 35,
          summary: null,
          error: null,
          retryable: false,
          dataset_id: null,
          created_at: "2026-06-11T09:00:00Z",
          updated_at: "2026-06-11T09:29:00Z"
        },
        t
      )
    ).toMatchObject({
      id: "job-12",
      kind: "url",
      createdAt: Date.parse("2026-06-11T09:00:00Z"),
      updatedAt: Date.parse("2026-06-11T09:29:00Z")
    });
  });

  it("keeps a persisted staging job nonterminal", () => {
    expect(
      buildImportTaskFromJob(
        {
          id: 13,
          project_id: 42,
          label: "large.csv",
          kind: "file",
          status: "staging",
          progress: 0,
          summary: null,
          error: null,
          retryable: false,
          dataset_id: null,
          created_at: "2026-06-11T09:00:00Z",
          updated_at: "2026-06-11T09:01:00Z"
        },
        t
      )
    ).toMatchObject({
      id: "job-13",
      status: "staging",
      summary: "import.tasks.summary.running"
    });
  });

  it("imports a file job and refreshes workspace data after polling succeeds", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/42/import-jobs" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
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
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:01Z"
          }),
          { status: 202, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "/api/projects/42/import-jobs/95") {
        return new Response(
          JSON.stringify({
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
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:02Z"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "/api/projects/42/graph") {
        return new Response(
          JSON.stringify({
            nodes: [
              {
                id: 10,
                node_type: "table",
                label: "Orders",
                source_ref: "orders",
                metadata: {},
                position_x: 0,
                position_y: 0
              }
            ],
            edges: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (
        url === "/api/projects/42/relationship-governance" ||
        url === "/api/projects/42/sources/summary" ||
        url === "/api/projects/42/sources/detail" ||
        url === "/api/projects/42/entities" ||
        url === "/api/projects/42/extracted-relationships" ||
        url === "/api/projects/42/entity-matches" ||
        url === "/api/projects/42/mapping-reviews"
      ) {
        return new Response(JSON.stringify(url.endsWith("relationship-governance") ? null : []), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    let actions: ImportActions | null = null;
    const states: WorkspaceState[] = [];

    render(
      <Harness
        onActions={(nextActions) => { actions = nextActions; }}
        onState={(state) => states.push(state)}
      />
    );
    await waitFor(() => {
      expect(actions).not.toBeNull();
    });

    await actions!.handleImport(new File(["order_id\n1"], "orders.csv", { type: "text/csv" }));

    await waitFor(() => {
      expect(states[states.length - 1].graph.nodes[0]?.label).toBe("Orders");
    });
    const latest = states[states.length - 1];
    expect(latest.importTasks[0].id).toBe("job-95");
    expect(latest.importTasks[0].status).toBe("succeeded");
    expect(latest.importStatus).toBe("Imported 1 sheets, 2 fields, 1 suggestions");
  });

  it("keeps the selected review analytics trend window when refreshing after import", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/42/import-jobs" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: 97,
            project_id: 42,
            label: "orders.csv",
            kind: "file",
            status: "running",
            progress: 25,
            summary: null,
            error: null,
            retryable: false,
            dataset_id: null,
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:01Z"
          }),
          { status: 202, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "/api/projects/42/import-jobs/97") {
        return new Response(
          JSON.stringify({
            id: 97,
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
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:02Z"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "/api/projects/42/graph") {
        return new Response(JSON.stringify({ nodes: [], edges: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "/api/projects/42/relationship-suggestions") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (
        url === "/api/projects/42/relationship-governance" ||
        url === "/api/projects/42/sources/summary" ||
        url === "/api/projects/42/sources/detail" ||
        url === "/api/projects/42/entities" ||
        url === "/api/projects/42/extracted-relationships" ||
        url === "/api/projects/42/entity-matches" ||
        url === "/api/projects/42/mapping-reviews"
      ) {
        return new Response(JSON.stringify(url.endsWith("relationship-governance") ? null : []), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "/api/projects/42/review-analytics") {
        return new Response(
          JSON.stringify({
            window_days: 30,
            generated_at: "2026-06-11T00:00:00Z",
            sla: {
              pending_sla_days: 3,
              pending_total: 1,
              overdue_pending_count: 0,
              oldest_pending_age_days: 1
            },
            aging_buckets: {
              "0_1_days": 1,
              "2_3_days": 0,
              "4_7_days": 0,
              "8_plus_days": 0
            },
            decision_trend: {
              accepted: 0,
              edited: 0,
              pending: 1,
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
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "/api/projects/42/review-analytics/trend?window=30d&days=30") {
        return new Response(
          JSON.stringify({
            window_days: 30,
            days: 30,
            generated_at: "2026-06-11T00:00:00Z",
            snapshots: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    let actions: ImportActions | null = null;
    const states: WorkspaceState[] = [];

    render(
      <Harness
        onActions={(nextActions) => { actions = nextActions; }}
        onState={(state) => states.push(state)}
        reviewAnalyticsTrendDays={30}
      />
    );
    await waitFor(() => {
      expect(actions).not.toBeNull();
    });

    await actions!.handleImport(new File(["order_id\n1"], "orders.csv", { type: "text/csv" }));

    await waitFor(() => {
      expect(states[states.length - 1].importTasks[0]?.status).toBe("succeeded");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/42/review-analytics/trend?window=30d&days=30"
    );
  });

  it("preserves structured API recovery details when file import creation fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/42/import-jobs" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            detail: {
              code: "UNSUPPORTED_IMPORT_FILE_TYPE",
              message: "Unsupported import file type",
              user_action: "Upload a supported file type: CSV, XLSX, JSON, document, code, log, or archive.",
              retryable: true,
              field_errors: { file: "Unsupported import file type" }
            }
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    let actions: ImportActions | null = null;
    const states: WorkspaceState[] = [];

    render(
      <Harness
        onActions={(nextActions) => { actions = nextActions; }}
        onState={(state) => states.push(state)}
      />
    );
    await waitFor(() => {
      expect(actions).not.toBeNull();
    });

    await actions!.handleImport(new File(["binary"], "notes.exe", { type: "application/octet-stream" }));

    await waitFor(() => {
      expect(states[states.length - 1].importTasks[0]?.status).toBe("failed");
    });
    const failedTask = states[states.length - 1].importTasks[0];
    expect(failedTask.errorCode).toBe("UNSUPPORTED_IMPORT_FILE_TYPE");
    expect(failedTask.recoveryAction).toBe(
      "Upload a supported file type: CSV, XLSX, JSON, document, code, log, or archive."
    );
    expect(failedTask.fieldErrors).toEqual({ file: "Unsupported import file type" });
    expect(failedTask.retryable).toBe(true);
  });

  it("uses workspace delta after a successful import when a version is available", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/42/import-jobs" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: 96,
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
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:02Z"
          }),
          { status: 202, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "/api/projects/42/import-jobs/96") {
        return new Response(
          JSON.stringify({
            id: 96,
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
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:02Z"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "/api/projects/42/workspace-delta?since_version=v1") {
        return new Response(
          JSON.stringify({
            status: "changed",
            workspace_version: "v2",
            graph: {
              nodes: [
                {
                  id: 10,
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
            import_jobs: [],
            source_summaries: [{ source_kind: "table", count: 1 }],
            source_details: [],
            extracted_entities: [],
            extracted_relationships: [],
            entity_match_reviews: [],
            mapping_reviews: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    let actions: ImportActions | null = null;
    const states: WorkspaceState[] = [];

    render(
      <Harness
        initialStateOverride={{ ...initialState, workspaceVersion: "v1" }}
        onActions={(nextActions) => { actions = nextActions; }}
        onState={(state) => states.push(state)}
      />
    );
    await waitFor(() => {
      expect(actions).not.toBeNull();
    });

    await actions!.handleImport(new File(["order_id\n1"], "orders.csv", { type: "text/csv" }));

    await waitFor(() => {
      expect(states[states.length - 1].workspaceVersion).toBe("v2");
    });
    expect(states[states.length - 1].graph.nodes[0]?.label).toBe("Orders");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/42/workspace-delta?since_version=v1"
    );
    expect(fetchMock).not.toHaveBeenCalledWith("/api/projects/42/graph");
  });

  it("clears review analytics trend and snapshot governance state after reset", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/projects/42/data" && init?.method === "DELETE") {
        return new Response(
          JSON.stringify({
            graph: { nodes: [], edges: [] },
            suggestions: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
    let actions: ImportActions | null = null;
    const states: WorkspaceState[] = [];

    render(
      <Harness
        initialStateOverride={{
          ...initialState,
          reviewAnalytics: {
            window_days: 30,
            generated_at: "2026-06-11T00:00:00Z",
            sla: {
              pending_sla_days: 3,
              pending_total: 1,
              overdue_pending_count: 0,
              oldest_pending_age_days: 1
            },
            aging_buckets: {
              "0_1_days": 1,
              "2_3_days": 0,
              "4_7_days": 0,
              "8_plus_days": 0
            },
            decision_trend: {
              accepted: 0,
              edited: 0,
              pending: 1,
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
          },
          reviewAnalyticsTrend: {
            window_days: 30,
            days: 30,
            generated_at: "2026-06-11T00:00:00Z",
            snapshots: []
          },
          reviewAnalyticsSnapshotSummary: {
            retention_days: 90,
            snapshot_count: 4,
            oldest_snapshot_date: "2026-06-01",
            latest_snapshot_date: "2026-06-11",
            expired_snapshot_count: 1
          },
          reviewAnalyticsSnapshotCleanupEvents: [
            {
              id: 8,
              project_id: 42,
              retention_days: 90,
              cutoff_date: "2026-03-13",
              removed_count: 1,
              remaining_count: 3,
              created_at: "2026-06-11T00:00:00Z"
            }
          ]
        }}
        onActions={(nextActions) => { actions = nextActions; }}
        onState={(state) => states.push(state)}
      />
    );
    await waitFor(() => {
      expect(actions).not.toBeNull();
    });

    await actions!.handleResetData();

    await waitFor(() => {
      expect(states[states.length - 1].importStatus).toBe("import.resetComplete");
    });
    const latest = states[states.length - 1];
    expect(latest.reviewAnalytics).toBeNull();
    expect(latest.reviewAnalyticsTrend).toBeNull();
    expect(latest.reviewAnalyticsSnapshotSummary).toBeNull();
    expect(latest.reviewAnalyticsSnapshotCleanupEvents).toEqual([]);
  });
});
