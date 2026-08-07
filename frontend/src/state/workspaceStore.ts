import {
  getExtractedEntities,
  getExtractedRelationships,
  getEntityMatchReviews,
  getGraph,
  getImportJobs,
  getWorkspaceDelta,
  getMappingReviews,
  getOrCreateDefaultProject,
  getProjectSettings,
  getReviewAnalytics,
  getReviewAnalyticsSnapshotCleanupEvents,
  getReviewAnalyticsSnapshotSummary,
  getReviewAnalyticsTrend,
  getRelationshipGovernanceSummary,
  getRelationshipSuggestions,
  getSourceDetails,
  getSourceSummaries,
  getWorkspaceSnapshot
} from "../api/client";
import type {
  ChatMessage,
  DocumentChunk,
  EntityMatchReview,
  ExtractedEntity,
  ExtractedRelationship,
  GraphResponse,
  ImportJob,
  ProjectSettings,
  ReviewAnalytics,
  ReviewAnalyticsSnapshotCleanupEvent,
  ReviewAnalyticsSnapshotSummary,
  ReviewAnalyticsTrend,
  RelationshipGovernanceSummary,
  RelationshipSuggestion,
  SourceDetail,
  SourceSummary
} from "../api/types";
import type { ImportTask } from "../components/importTasks";
import type { WorkspaceOperationError } from "./operationError";
import {
  defaultProjectSettings,
  normalizeProjectSettings
} from "./projectSettings";

export { defaultProjectSettings, normalizeProjectSettings } from "./projectSettings";

export type WorkspaceState = {
  projectId: number | null;
  workspaceVersion: string | null;
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
  relationshipGovernance: RelationshipGovernanceSummary | null;
  reviewAnalytics: ReviewAnalytics | null;
  reviewAnalyticsTrend: ReviewAnalyticsTrend | null;
  reviewAnalyticsSnapshotSummary: ReviewAnalyticsSnapshotSummary | null;
  reviewAnalyticsSnapshotCleanupEvents: ReviewAnalyticsSnapshotCleanupEvent[];
  settings: ProjectSettings;
  messages: ChatMessage[];
  highlightedGraphPath: number[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  errorCode?: string | null;
  operationError?: WorkspaceOperationError | null;
  importStatus: string | null;
  importTasks: ImportTask[];
  sourceSummaries: SourceSummary[];
  sourceDetails: SourceDetail[];
  sourceChunksBySourceId: Record<number, DocumentChunk[]>;
  extractedEntities: ExtractedEntity[];
  extractedRelationships: ExtractedRelationship[];
  entityMatchReviews: EntityMatchReview[];
  mappingReviews: EntityMatchReview[];
};

export const emptyGraph: GraphResponse = { nodes: [], edges: [] };

export async function bootstrapWorkspace(): Promise<{
  projectId: number;
  workspaceVersion: string;
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
  relationshipGovernance: RelationshipGovernanceSummary | null;
  reviewAnalytics: ReviewAnalytics | null;
  reviewAnalyticsTrend: ReviewAnalyticsTrend | null;
  reviewAnalyticsSnapshotSummary: ReviewAnalyticsSnapshotSummary | null;
  reviewAnalyticsSnapshotCleanupEvents: ReviewAnalyticsSnapshotCleanupEvent[];
  settings: ProjectSettings;
  importJobs: ImportJob[];
  sourceSummaries: SourceSummary[];
  sourceDetails: SourceDetail[];
  sourceChunksBySourceId: Record<number, DocumentChunk[]>;
  extractedEntities: ExtractedEntity[];
  extractedRelationships: ExtractedRelationship[];
  entityMatchReviews: EntityMatchReview[];
  mappingReviews: EntityMatchReview[];
}> {
  const project = await getOrCreateDefaultProject();
  try {
    const snapshot = await getWorkspaceSnapshot(project.id);
    return {
      projectId: snapshot.project.id,
      workspaceVersion: snapshot.workspace_version,
      graph: snapshot.graph,
      suggestions: snapshot.suggestions,
      relationshipGovernance: snapshot.relationship_governance,
      reviewAnalytics: snapshot.review_analytics ?? null,
      reviewAnalyticsTrend: snapshot.review_analytics_trend ?? null,
      reviewAnalyticsSnapshotSummary: snapshot.review_analytics_snapshot_summary ?? null,
      reviewAnalyticsSnapshotCleanupEvents:
        snapshot.review_analytics_snapshot_cleanup_events ?? [],
      settings: normalizeProjectSettings(snapshot.settings),
      importJobs: snapshot.import_jobs,
      sourceSummaries: snapshot.source_summaries,
      sourceDetails: snapshot.source_details,
      sourceChunksBySourceId: snapshot.source_chunks_by_source_id,
      extractedEntities: snapshot.extracted_entities,
      extractedRelationships: snapshot.extracted_relationships,
      entityMatchReviews: snapshot.entity_match_reviews,
      mappingReviews: snapshot.mapping_reviews
    };
  } catch {
    return loadLegacyWorkspaceBootstrap(project.id);
  }
}

async function loadLegacyWorkspaceBootstrap(projectId: number): Promise<{
  projectId: number;
  workspaceVersion: string;
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
  relationshipGovernance: RelationshipGovernanceSummary | null;
  reviewAnalytics: ReviewAnalytics | null;
  reviewAnalyticsTrend: ReviewAnalyticsTrend | null;
  reviewAnalyticsSnapshotSummary: ReviewAnalyticsSnapshotSummary | null;
  reviewAnalyticsSnapshotCleanupEvents: ReviewAnalyticsSnapshotCleanupEvent[];
  settings: ProjectSettings;
  importJobs: ImportJob[];
  sourceSummaries: SourceSummary[];
  sourceDetails: SourceDetail[];
  sourceChunksBySourceId: Record<number, DocumentChunk[]>;
  extractedEntities: ExtractedEntity[];
  extractedRelationships: ExtractedRelationship[];
  entityMatchReviews: EntityMatchReview[];
  mappingReviews: EntityMatchReview[];
}> {
  const [graph, suggestions, relationshipGovernance, reviewAnalytics, reviewAnalyticsTrend, reviewAnalyticsSnapshotSummary, reviewAnalyticsSnapshotCleanupEvents, settings, importJobs, sourceSummaries, sourceInspection] = await Promise.all([
    getGraph(projectId),
    getRelationshipSuggestions(projectId),
    getRelationshipGovernanceSummary(projectId).catch(() => null),
    getReviewAnalytics(projectId).catch(() => null),
    getReviewAnalyticsTrend(projectId).catch(() => null),
    getReviewAnalyticsSnapshotSummary(projectId).catch(() => null),
    getReviewAnalyticsSnapshotCleanupEvents(projectId).catch(() => []),
    getProjectSettings(projectId),
    getImportJobs(projectId).catch(() => []),
    getSourceSummaries(projectId).catch(() => []),
    loadSourceInspection(projectId)
  ]);
  return {
    projectId,
    workspaceVersion: "",
    graph,
    suggestions,
    relationshipGovernance,
    reviewAnalytics,
    reviewAnalyticsTrend,
    reviewAnalyticsSnapshotSummary,
    reviewAnalyticsSnapshotCleanupEvents,
    settings: normalizeProjectSettings(settings),
    importJobs,
    sourceSummaries,
    ...sourceInspection
  };
}

export type IncrementalWorkspaceData = {
  workspaceVersion: string;
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
  relationshipGovernance: RelationshipGovernanceSummary | null;
  reviewAnalytics: ReviewAnalytics | null;
  reviewAnalyticsTrend: ReviewAnalyticsTrend | null;
  reviewAnalyticsSnapshotSummary: ReviewAnalyticsSnapshotSummary | null;
  reviewAnalyticsSnapshotCleanupEvents: ReviewAnalyticsSnapshotCleanupEvent[];
  importJobs: ImportJob[];
  sourceSummaries: SourceSummary[];
  sourceDetails: SourceDetail[];
  extractedEntities: ExtractedEntity[];
  extractedRelationships: ExtractedRelationship[];
  entityMatchReviews: EntityMatchReview[];
  mappingReviews: EntityMatchReview[];
};

export async function refreshWorkspaceIncrementally(
  projectId: number,
  current: IncrementalWorkspaceData
): Promise<IncrementalWorkspaceData> {
  if (!current.workspaceVersion) {
    return current;
  }
  const delta = await getWorkspaceDelta(projectId, current.workspaceVersion);
  if (delta.status === "not_modified") {
    return {
      ...current,
      workspaceVersion: delta.workspace_version
    };
  }
  return {
    workspaceVersion: delta.workspace_version,
    graph: delta.graph ?? current.graph,
    suggestions: delta.suggestions ?? current.suggestions,
    relationshipGovernance: delta.relationship_governance ?? current.relationshipGovernance,
    reviewAnalytics: delta.review_analytics ?? current.reviewAnalytics,
    reviewAnalyticsTrend: delta.review_analytics_trend ?? current.reviewAnalyticsTrend,
    reviewAnalyticsSnapshotSummary:
      delta.review_analytics_snapshot_summary ?? current.reviewAnalyticsSnapshotSummary,
    reviewAnalyticsSnapshotCleanupEvents:
      delta.review_analytics_snapshot_cleanup_events ??
      current.reviewAnalyticsSnapshotCleanupEvents,
    importJobs: delta.import_jobs ?? current.importJobs,
    sourceSummaries: delta.source_summaries ?? current.sourceSummaries,
    sourceDetails: delta.source_details ?? current.sourceDetails,
    extractedEntities: delta.extracted_entities ?? current.extractedEntities,
    extractedRelationships: delta.extracted_relationships ?? current.extractedRelationships,
    entityMatchReviews: delta.entity_match_reviews ?? current.entityMatchReviews,
    mappingReviews: delta.mapping_reviews ?? current.mappingReviews
  };
}

export async function loadSourceInspection(projectId: number): Promise<{
  sourceDetails: SourceDetail[];
  sourceChunksBySourceId: Record<number, DocumentChunk[]>;
  extractedEntities: ExtractedEntity[];
  extractedRelationships: ExtractedRelationship[];
  entityMatchReviews: EntityMatchReview[];
  mappingReviews: EntityMatchReview[];
}> {
  const sourceDetails = await getSourceDetails(projectId).catch(() => []);
  const [extractedEntities, extractedRelationships, entityMatchReviews, mappingReviews] = await Promise.all([
    getExtractedEntities(projectId).catch(() => []),
    getExtractedRelationships(projectId).catch(() => []),
    getEntityMatchReviews(projectId).catch(() => []),
    getMappingReviews(projectId).catch(() => [])
  ]);

  return {
    sourceDetails,
    sourceChunksBySourceId: {},
    extractedEntities,
    extractedRelationships,
    entityMatchReviews,
    mappingReviews
  };
}
