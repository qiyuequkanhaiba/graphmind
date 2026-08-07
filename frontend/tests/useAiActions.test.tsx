import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useState } from "react";
import {
  defaultProjectSettings,
  emptyGraph,
  type WorkspaceState
} from "../src/state/workspaceStore";
import { useAiActions } from "../src/state/useAiActions";

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

type AiActions = ReturnType<typeof useAiActions>;

function Harness({
  onActions,
  onState
}: {
  onActions: (actions: AiActions) => void;
  onState: (state: WorkspaceState) => void;
}) {
  const [state, setState] = useState<WorkspaceState>(initialState);
  const actions = useAiActions({
    projectId: state.projectId,
    setState,
    t: (key: string) => key
  });
  onActions(actions);
  onState(state);
  return null;
}

describe("useAiActions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("submits a question and stores cited assistant response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: "Customers connect to orders.",
        query_plan: {},
        answer_confidence: "high",
        citations: [{ label: "orders.csv", source_ref: "orders", citation_type: "table" }],
        highlighted_graph_path: [1, 2],
        retrieved_evidence: [],
        graph_actions: [],
        next_steps: ["Review foreign keys"]
      })
    });
    vi.stubGlobal("fetch", fetchMock);
    let actions: AiActions | null = null;
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
    await actions!.handleAsk("How are customers connected?");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/42/chat",
      expect.objectContaining({ method: "POST" })
    );
    await waitFor(() => {
      expect(states[states.length - 1].messages).toHaveLength(2);
    });
    const latest = states[states.length - 1];
    expect(latest.messages[1].content).toBe("Customers connect to orders.");
    expect(latest.highlightedGraphPath).toEqual([1, 2]);
  });

  it("preserves structured settings errors and rejects the save promise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          detail: {
            code: "SETTINGS_UNAVAILABLE",
            message: "Settings service unavailable",
            user_action: "Retry shortly.",
            retryable: true,
            field_errors: { model: "Model is unavailable" }
          }
        })
      })
    );
    let actions: AiActions | null = null;
    const states: WorkspaceState[] = [];
    render(
      <Harness
        onActions={(nextActions) => { actions = nextActions; }}
        onState={(state) => states.push(state)}
      />
    );
    await waitFor(() => expect(actions).not.toBeNull());

    await expect(actions!.handleSettingsChange(defaultProjectSettings)).rejects.toMatchObject({
      code: "SETTINGS_UNAVAILABLE"
    });
    await waitFor(() => {
      expect(states[states.length - 1].operationError).toMatchObject({
        code: "SETTINGS_UNAVAILABLE",
        retryable: true,
        fieldErrors: { model: "Model is unavailable" }
      });
    });
  });
});
