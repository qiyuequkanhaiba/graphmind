import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  cleanupReviewAnalyticsSnapshots,
  cleanupDuplicateRelationshipSuggestions,
  getGraph,
  getRelationshipGovernanceSummary,
  getReviewAnalytics,
  getReviewAnalyticsSnapshotCleanupEvents,
  getReviewAnalyticsSnapshotSummary,
  getReviewAnalyticsTrend,
  getRelationshipSuggestions,
  reviewEntityMatch,
  reviewMappingEdge,
  reviewRelationshipSuggestion
} from "../api/client";
import type {
  EntityMatchDecisionStatus,
  ReviewAnalyticsTrendDays,
  RelationshipDecisionStatus,
  RelationshipModelingReview
} from "../api/types";
import type { MessageKey } from "../i18n/messages";
import { workspaceOperationErrorPatch } from "./operationError";
import { loadSourceInspection, type WorkspaceState } from "./workspaceStore";

export function useReviewActions({
  projectId,
  reviewAnalyticsTrendDays = 14,
  reviewerName = "",
  setState,
  t
}: {
  projectId: number | null;
  reviewAnalyticsTrendDays?: ReviewAnalyticsTrendDays;
  reviewerName?: string;
  setState: Dispatch<SetStateAction<WorkspaceState>>;
  t: (key: MessageKey) => string;
}) {
  const loadRelationshipGovernance = useCallback(
    (nextProjectId: number) => getRelationshipGovernanceSummary(nextProjectId).catch(() => null),
    []
  );

  const refreshRelationshipReviewState = useCallback(async () => {
    if (projectId === null) {
      return;
    }
    const [
      graph,
      suggestions,
      relationshipGovernance,
      reviewAnalytics,
      reviewAnalyticsTrend,
      reviewAnalyticsSnapshotSummary,
      reviewAnalyticsSnapshotCleanupEvents
    ] = await Promise.all([
      getGraph(projectId),
      getRelationshipSuggestions(projectId),
      loadRelationshipGovernance(projectId),
      getReviewAnalytics(projectId).catch(() => null),
      getReviewAnalyticsTrend(projectId, reviewAnalyticsTrendDays).catch(() => null),
      getReviewAnalyticsSnapshotSummary(projectId).catch(() => null),
      getReviewAnalyticsSnapshotCleanupEvents(projectId).catch(() => [])
    ]);
    setState((current) => ({
      ...current,
      graph,
      suggestions,
      relationshipGovernance,
      reviewAnalytics,
      reviewAnalyticsTrend,
      reviewAnalyticsSnapshotSummary,
      reviewAnalyticsSnapshotCleanupEvents,
      error: null,
      operationError: null
    }));
  }, [loadRelationshipGovernance, projectId, reviewAnalyticsTrendDays, setState]);

  const refreshSourceReviewState = useCallback(async () => {
    if (projectId === null) {
      return;
    }
    const [graph, sourceInspection] = await Promise.all([
      getGraph(projectId),
      loadSourceInspection(projectId)
    ]);
    setState((current) => ({
      ...current,
      graph,
      ...sourceInspection,
      error: null,
      operationError: null
    }));
  }, [projectId, setState]);

  const handleReview = useCallback(
    async (
      suggestionId: number,
      decisionStatus: Exclude<RelationshipDecisionStatus, "pending">,
      reviewedBy?: string
    ) => {
      if (projectId === null) {
        return;
      }
      try {
        await reviewRelationshipSuggestion(projectId, suggestionId, decisionStatus, null, {
          reviewedBy: normalizeReviewerName(reviewedBy ?? reviewerName)
        });
        await refreshRelationshipReviewState();
      } catch (error) {
        setState((current) => ({
          ...current,
          ...workspaceOperationErrorPatch(error, t("app.reviewFailed"))
        }));
      }
    },
    [projectId, refreshRelationshipReviewState, reviewerName, setState, t]
  );

  const handleConfirmRelationship = useCallback(
    async (suggestionId: number, review: RelationshipModelingReview) => {
      if (projectId === null) {
        return;
      }
      try {
        await reviewRelationshipSuggestion(projectId, suggestionId, review.decisionStatus, null, {
          evidenceQuality: review.evidenceQuality,
          relationshipType: review.relationshipType,
          reviewedBy: normalizeReviewerName(review.reviewedBy ?? reviewerName)
        });
        await refreshRelationshipReviewState();
      } catch (error) {
        setState((current) => ({
          ...current,
          ...workspaceOperationErrorPatch(error, t("app.reviewFailed"))
        }));
      }
    },
    [projectId, refreshRelationshipReviewState, reviewerName, setState, t]
  );

  const handleReviewEntityMatch = useCallback(
    async (edgeId: number, decisionStatus: EntityMatchDecisionStatus) => {
      if (projectId === null) {
        return;
      }
      try {
        await reviewEntityMatch(projectId, edgeId, decisionStatus);
        await refreshSourceReviewState();
      } catch (error) {
        setState((current) => ({
          ...current,
          ...workspaceOperationErrorPatch(error, t("app.entityMatchReviewFailed"))
        }));
      }
    },
    [projectId, refreshSourceReviewState, setState, t]
  );

  const handleReviewMappingEdge = useCallback(
    async (edgeId: number, decisionStatus: EntityMatchDecisionStatus) => {
      if (projectId === null) {
        return;
      }
      try {
        await reviewMappingEdge(projectId, edgeId, decisionStatus);
        await refreshSourceReviewState();
      } catch (error) {
        setState((current) => ({
          ...current,
          ...workspaceOperationErrorPatch(error, t("app.mappingReviewFailed"))
        }));
      }
    },
    [projectId, refreshSourceReviewState, setState, t]
  );

  const handleCleanupDuplicateRelationships = useCallback(async () => {
    if (projectId === null) {
      return;
    }

    try {
      await cleanupDuplicateRelationshipSuggestions(projectId);
      await refreshRelationshipReviewState();
    } catch (error) {
      setState((current) => ({
        ...current,
        ...workspaceOperationErrorPatch(error, t("app.reviewFailed"))
      }));
    }
  }, [projectId, refreshRelationshipReviewState, setState, t]);

  const handleCleanupAnalyticsSnapshots = useCallback(async (retentionDays = 30) => {
    if (projectId === null) {
      return;
    }

    try {
      await cleanupReviewAnalyticsSnapshots(projectId, retentionDays);
      await refreshRelationshipReviewState();
    } catch (error) {
      setState((current) => ({
        ...current,
        ...workspaceOperationErrorPatch(error, t("app.reviewFailed"))
      }));
    }
  }, [projectId, refreshRelationshipReviewState, setState, t]);

  return {
    handleReview,
    handleConfirmRelationship,
    handleReviewEntityMatch,
    handleReviewMappingEdge,
    handleCleanupAnalyticsSnapshots,
    handleCleanupDuplicateRelationships
  };
}

function normalizeReviewerName(reviewerName: string): string | undefined {
  const normalized = reviewerName.trim().replace(/\s+/g, " ");
  return normalized || undefined;
}
