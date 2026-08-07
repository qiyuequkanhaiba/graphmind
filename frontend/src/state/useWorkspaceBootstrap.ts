import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ApiError } from "../api/client";
import type { ImportJob } from "../api/types";
import type { ImportTask } from "../components/importTasks";
import {
  bootstrapWorkspace,
  defaultProjectSettings,
  emptyGraph,
  type WorkspaceState
} from "./workspaceStore";

export function useWorkspaceBootstrap({
  bootstrapKey,
  buildImportTaskFromJob,
  formatLoadedStatus,
  setState
}: {
  bootstrapKey?: number;
  buildImportTaskFromJob: (job: ImportJob) => ImportTask;
  formatLoadedStatus: (nodeCount: number, suggestionCount: number) => string;
  setState: Dispatch<SetStateAction<WorkspaceState>>;
}) {
  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: "loading" }));
    bootstrapWorkspace()
      .then((snapshot) => {
        if (cancelled) {
          return;
        }
        const importStatus =
          snapshot.graph.nodes.length > 0
            ? formatLoadedStatus(snapshot.graph.nodes.length, snapshot.suggestions.length)
            : null;
        setState({
          projectId: snapshot.projectId,
          workspaceVersion: snapshot.workspaceVersion,
          graph: snapshot.graph,
          suggestions: snapshot.suggestions,
          relationshipGovernance: snapshot.relationshipGovernance,
          reviewAnalytics: snapshot.reviewAnalytics,
          reviewAnalyticsTrend: snapshot.reviewAnalyticsTrend,
          reviewAnalyticsSnapshotSummary: snapshot.reviewAnalyticsSnapshotSummary,
          reviewAnalyticsSnapshotCleanupEvents: snapshot.reviewAnalyticsSnapshotCleanupEvents,
          settings: snapshot.settings,
          messages: [],
          highlightedGraphPath: [],
          status: "ready",
          error: null,
          errorCode: null,
          operationError: null,
          importStatus,
          importTasks: snapshot.importJobs.map(buildImportTaskFromJob),
          sourceSummaries: snapshot.sourceSummaries,
          sourceDetails: snapshot.sourceDetails,
          sourceChunksBySourceId: snapshot.sourceChunksBySourceId,
          extractedEntities: snapshot.extractedEntities,
          extractedRelationships: snapshot.extractedRelationships,
          entityMatchReviews: snapshot.entityMatchReviews,
          mappingReviews: snapshot.mappingReviews
        });
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setState(emptyWorkspaceErrorState(error.message, apiErrorCode(error)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrapKey, buildImportTaskFromJob, formatLoadedStatus, setState]);
}

function emptyWorkspaceErrorState(message: string, errorCode: string | null): WorkspaceState {
  return {
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
    status: "error",
    error: message,
    errorCode,
    operationError: null,
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
}

function apiErrorCode(error: Error): string | null {
  return error instanceof ApiError ? error.code : null;
}
