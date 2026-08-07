import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import type { ImportJob } from "../src/api/types";
import type { ImportTask } from "../src/components/importTasks";
import {
  defaultProjectSettings,
  emptyGraph,
  type WorkspaceState
} from "../src/state/workspaceStore";
import { useWorkspaceBootstrap } from "../src/state/useWorkspaceBootstrap";

const initialState: WorkspaceState = {
  projectId: null,
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
  status: "idle",
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

function Harness({ onState }: { onState: (state: WorkspaceState) => void }) {
  const [state, setState] = useState<WorkspaceState>(initialState);
  const buildImportTaskFromJob = useCallback((job: ImportJob): ImportTask => ({
      id: `job-${job.id}`,
      label: job.label,
      kind: "file",
      status: "succeeded",
    progress: 100,
    summary: "done",
    error: null,
    retryable: false,
    createdAt: 0
  }), []);
  const formatLoadedStatus = useCallback(
    (nodeCount: number, suggestionCount: number) =>
      `Loaded ${nodeCount} nodes and ${suggestionCount} suggestions`,
    []
  );
  useWorkspaceBootstrap({
    buildImportTaskFromJob,
    formatLoadedStatus,
    setState
  });
  onState(state);
  return null;
}

describe("useWorkspaceBootstrap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the workspace and maps import jobs into tasks", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 3, name: "Default" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workspace_version: "v1",
          project: { id: 3, name: "Default" },
          graph: {
            nodes: [
              {
                id: 1,
                node_type: "table",
                label: "Customers",
                source_ref: "customers",
                metadata: {},
                position_x: 0,
                position_y: 0
              }
            ],
            edges: []
          },
          suggestions: [],
          relationship_governance: null,
          review_analytics_snapshot_summary: {
            retention_days: 30,
            snapshot_count: 2,
            expired_snapshot_count: 1,
            oldest_snapshot_date: "2026-05-01",
            latest_snapshot_date: "2026-06-08"
          },
          review_analytics_snapshot_cleanup_events: [
            {
              id: 9,
              project_id: 3,
              retention_days: 90,
              cutoff_date: "2026-03-13",
              removed_count: 2,
              remaining_count: 4,
              created_at: "2026-06-11T08:30:00+00:00"
            }
          ],
          settings: defaultProjectSettings,
          import_jobs: [
            {
              id: 7,
              project_id: 3,
              label: "customers.csv",
              kind: "file",
              status: "succeeded",
              progress: 100,
              summary: null,
              error: null,
              retryable: false,
              dataset_id: 1,
              created_at: "2026-06-07T00:00:00Z",
              updated_at: "2026-06-07T00:00:01Z"
            }
          ],
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
    const states: WorkspaceState[] = [];

    render(<Harness onState={(state) => states.push(state)} />);

    await waitFor(() => {
      expect(states[states.length - 1]?.status).toBe("ready");
    });
    expect(states[states.length - 1]?.projectId).toBe(3);
    expect(states[states.length - 1]?.reviewAnalyticsSnapshotSummary).toEqual({
      retention_days: 30,
      snapshot_count: 2,
      expired_snapshot_count: 1,
      oldest_snapshot_date: "2026-05-01",
      latest_snapshot_date: "2026-06-08"
    });
    expect(states[states.length - 1]?.reviewAnalyticsSnapshotCleanupEvents).toEqual([
      {
        id: 9,
        project_id: 3,
        retention_days: 90,
        cutoff_date: "2026-03-13",
        removed_count: 2,
        remaining_count: 4,
        created_at: "2026-06-11T08:30:00+00:00"
      }
    ]);
    expect(states[states.length - 1]?.importStatus).toBe("Loaded 1 nodes and 0 suggestions");
    expect(states[states.length - 1]?.importTasks[0].label).toBe("customers.csv");
  });

  it("sets an error state when bootstrap fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: "broken" })
    });
    vi.stubGlobal("fetch", fetchMock);
    const states: WorkspaceState[] = [];

    render(<Harness onState={(state) => states.push(state)} />);

    await waitFor(() => {
      expect(states[states.length - 1]?.status).toBe("error");
    });
    expect(states[states.length - 1]?.error).toBe("Get default project failed: 500");
    expect(states[states.length - 1]?.graph).toEqual(emptyGraph);
  });
});
