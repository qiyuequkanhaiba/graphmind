import type {
  RelationshipGovernanceSummary,
  ReviewAnalytics,
  ReviewAnalyticsSnapshotCleanupEvent,
  ReviewAnalyticsSnapshotSummary,
  ReviewAnalyticsTrend,
  ReviewAnalyticsTrendDays,
  RelationshipSuggestion
} from "../api/types";

export type ReviewFilter = "all" | "pending" | "highPriority" | "duplicates";

export type ReviewRecommendedAction =
  | "duplicates"
  | "lowQuality"
  | "highPriority"
  | "aging"
  | "pending"
  | "handoffReady";

export type ReviewOperationsOptions = {
  agingThresholdDays?: number;
  now?: Date | string | number;
};

export type ReviewOperationsSummary = {
  acceptedCount: number;
  agedPendingCount: number;
  duplicateSuggestionCount: number;
  editedCount: number;
  evidenceCoveragePercent: number;
  evidenceCoveredCount: number;
  hasPendingAgeData: boolean;
  highPriorityCount: number;
  lowQualityPendingCount: number;
  oldestPendingAgeDays: number | null;
  pendingCount: number;
  recommendedAction: ReviewRecommendedAction;
  rejectedCount: number;
  totalCount: number;
};

export type ReviewAuditSuggestion = {
  id: number;
  sourceLabel: string;
  targetLabel: string | null;
  relationshipType: string;
  confidence: number;
  decisionStatus: string;
  createdAt: string | null;
  updatedAt: string | null;
  qualityLabel: string | undefined;
  reviewPriority: string | undefined;
  qualityReasons: string[];
  evidenceSummary: string;
  evidencePayload: Record<string, unknown>;
};

export type ReviewAnalyticsTrendSummary = {
  snapshotCount: number;
  firstSnapshotDate: string;
  latestSnapshotDate: string;
  overduePendingDelta: number;
  oldestPendingAgeDelta: number | null;
  evidenceCoverageDeltaPercent: number;
  firstOverduePendingCount: number;
  latestOverduePendingCount: number;
  firstEvidenceCoveragePercent: number;
  latestEvidenceCoveragePercent: number;
};

export type ReviewAnalyticsTrendContext = {
  selectedTrendDays: ReviewAnalyticsTrendDays | number;
  trendSnapshotCount: number;
  trendWindowDays: number;
  firstSnapshotDate: string | null;
  latestSnapshotDate: string | null;
};

export type ReviewAnalyticsSnapshotContext = {
  retentionDays: number;
  snapshotCount: number;
  expiredSnapshotCount: number;
  oldestSnapshotDate: string | null;
  latestSnapshotDate: string | null;
  latestCleanupEvent: {
    id: number;
    retentionDays: number;
    cutoffDate: string;
    removedCount: number;
    remainingCount: number;
    createdAt: string;
  } | null;
};

export type ReviewAuditReport = {
  schema: "graphmind.review-audit.v1";
  generatedAt: string;
  activeFilter: ReviewFilter;
  visibleSuggestionIds: number[];
  summary: ReviewOperationsSummary;
  governanceSummary: RelationshipGovernanceSummary | null;
  reviewAnalytics: ReviewAnalytics | null;
  reviewAnalyticsSnapshotContext: ReviewAnalyticsSnapshotContext | null;
  reviewAnalyticsTrend: ReviewAnalyticsTrend | null;
  reviewAnalyticsTrendContext: ReviewAnalyticsTrendContext | null;
  reviewAnalyticsTrendSummary: ReviewAnalyticsTrendSummary | null;
  suggestions: ReviewAuditSuggestion[];
};

export const reviewFilterStorageKey = "graphmind.reviewFilter";
const defaultAgingThresholdDays = 7;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function buildReviewOperationsSummary(
  suggestions: RelationshipSuggestion[],
  governanceSummary: RelationshipGovernanceSummary | null = null,
  options: ReviewOperationsOptions = {}
): ReviewOperationsSummary {
  const duplicateSuggestionCount = duplicateSuggestionIdSet(governanceSummary).size;
  const totalCount = suggestions.length;
  const pendingCount = countByStatus(suggestions, "pending");
  const effectivePendingCount = governanceSummary?.pending_suggestion_count ?? pendingCount;
  const acceptedCount = countByStatus(suggestions, "accepted");
  const rejectedCount = countByStatus(suggestions, "rejected");
  const editedCount = countByStatus(suggestions, "edited");
  const highPriorityCount = suggestions.filter(
    (suggestion) => suggestion.review_priority === "high"
  ).length;
  const lowQualityPendingCount = suggestions.filter(
    (suggestion) =>
      suggestion.decision_status === "pending" &&
      (suggestion.quality_label === "low" || suggestion.confidence < 0.6)
  ).length;
  const evidenceCoveredCount = suggestions.filter(suggestionHasEvidence).length;
  const pendingAgeSummary = summarizePendingAge(suggestions, options);

  return {
    acceptedCount,
    agedPendingCount: pendingAgeSummary.agedPendingCount,
    duplicateSuggestionCount,
    editedCount,
    evidenceCoveragePercent:
      totalCount === 0 ? 0 : Math.round((evidenceCoveredCount / totalCount) * 100),
    evidenceCoveredCount,
    hasPendingAgeData: pendingAgeSummary.hasPendingAgeData,
    highPriorityCount,
    lowQualityPendingCount,
    oldestPendingAgeDays: pendingAgeSummary.oldestPendingAgeDays,
    pendingCount: effectivePendingCount,
    recommendedAction: recommendedAction({
      agedPendingCount: pendingAgeSummary.agedPendingCount,
      duplicateSuggestionCount,
      highPriorityCount,
      lowQualityPendingCount,
      pendingCount: effectivePendingCount
    }),
    rejectedCount,
    totalCount
  };
}

export function filterRelationshipSuggestions(
  suggestions: RelationshipSuggestion[],
  filter: ReviewFilter,
  governanceSummary: RelationshipGovernanceSummary | null = null
): RelationshipSuggestion[] {
  const duplicateSuggestionIds = duplicateSuggestionIdSet(governanceSummary);
  if (filter === "pending") {
    return suggestions.filter((suggestion) => suggestion.decision_status === "pending");
  }
  if (filter === "highPriority") {
    return suggestions.filter((suggestion) => suggestion.review_priority === "high");
  }
  if (filter === "duplicates") {
    return suggestions.filter((suggestion) => duplicateSuggestionIds.has(suggestion.id));
  }
  return suggestions;
}

export function buildReviewAuditReport({
  activeFilter,
  generatedAt = new Date().toISOString(),
  governanceSummary = null,
  reviewAnalytics = null,
  reviewAnalyticsSnapshotCleanupEvents = [],
  reviewAnalyticsSnapshotSummary = null,
  reviewAnalyticsTrend = null,
  reviewAnalyticsTrendDays,
  suggestions
}: {
  activeFilter: ReviewFilter;
  generatedAt?: string;
  governanceSummary?: RelationshipGovernanceSummary | null;
  reviewAnalytics?: ReviewAnalytics | null;
  reviewAnalyticsSnapshotCleanupEvents?: ReviewAnalyticsSnapshotCleanupEvent[];
  reviewAnalyticsSnapshotSummary?: ReviewAnalyticsSnapshotSummary | null;
  reviewAnalyticsTrend?: ReviewAnalyticsTrend | null;
  reviewAnalyticsTrendDays?: ReviewAnalyticsTrendDays;
  suggestions: RelationshipSuggestion[];
}): ReviewAuditReport {
  const visibleSuggestions = filterRelationshipSuggestions(
    suggestions,
    activeFilter,
    governanceSummary
  );

  return {
    schema: "graphmind.review-audit.v1",
    generatedAt,
    activeFilter,
    visibleSuggestionIds: visibleSuggestions.map((suggestion) => suggestion.id),
    summary: buildReviewOperationsSummary(suggestions, governanceSummary, { now: generatedAt }),
    governanceSummary,
    reviewAnalytics,
    reviewAnalyticsSnapshotContext: buildReviewAnalyticsSnapshotContext(
      reviewAnalyticsSnapshotSummary,
      reviewAnalyticsSnapshotCleanupEvents
    ),
    reviewAnalyticsTrend,
    reviewAnalyticsTrendContext: buildReviewAnalyticsTrendContext(
      reviewAnalyticsTrend,
      reviewAnalyticsTrendDays
    ),
    reviewAnalyticsTrendSummary: summarizeReviewAnalyticsTrend(reviewAnalyticsTrend),
    suggestions: visibleSuggestions.map((suggestion) => ({
      id: suggestion.id,
      sourceLabel: suggestion.source_label,
      targetLabel: suggestion.target_label,
      relationshipType: suggestion.relationship_type,
      confidence: suggestion.confidence,
      decisionStatus: suggestion.decision_status,
      reviewedBy: suggestion.reviewed_by ?? null,
      createdAt: suggestion.created_at ?? null,
      updatedAt: suggestion.updated_at ?? null,
      qualityLabel: suggestion.quality_label,
      reviewPriority: suggestion.review_priority,
      qualityReasons: suggestion.quality_reasons ?? [],
      evidenceSummary: suggestion.evidence_summary,
      evidencePayload: suggestion.evidence_payload
    }))
  };
}

export function buildReviewAnalyticsSnapshotContext(
  summary: ReviewAnalyticsSnapshotSummary | null,
  cleanupEvents: ReviewAnalyticsSnapshotCleanupEvent[] = []
): ReviewAnalyticsSnapshotContext | null {
  if (!summary) {
    return null;
  }
  const latestCleanup = cleanupEvents[0] ?? null;
  return {
    retentionDays: summary.retention_days,
    snapshotCount: summary.snapshot_count,
    expiredSnapshotCount: summary.expired_snapshot_count,
    oldestSnapshotDate: summary.oldest_snapshot_date,
    latestSnapshotDate: summary.latest_snapshot_date,
    latestCleanupEvent: latestCleanup
      ? {
          id: latestCleanup.id,
          retentionDays: latestCleanup.retention_days,
          cutoffDate: latestCleanup.cutoff_date,
          removedCount: latestCleanup.removed_count,
          remainingCount: latestCleanup.remaining_count,
          createdAt: latestCleanup.created_at
        }
      : null
  };
}

export function buildReviewAnalyticsTrendContext(
  trend: ReviewAnalyticsTrend | null,
  selectedTrendDays?: ReviewAnalyticsTrendDays
): ReviewAnalyticsTrendContext | null {
  if (!trend) {
    return null;
  }
  const firstSnapshot = trend.snapshots[0] ?? null;
  const latestSnapshot = trend.snapshots[trend.snapshots.length - 1] ?? null;
  return {
    selectedTrendDays: selectedTrendDays ?? trend.days,
    trendSnapshotCount: trend.snapshots.length,
    trendWindowDays: trend.window_days,
    firstSnapshotDate: firstSnapshot?.snapshot_date ?? null,
    latestSnapshotDate: latestSnapshot?.snapshot_date ?? null
  };
}

export function summarizeReviewAnalyticsTrend(
  trend: ReviewAnalyticsTrend | null
): ReviewAnalyticsTrendSummary | null {
  if (!trend || trend.snapshots.length < 2) {
    return null;
  }
  const firstSnapshot = trend.snapshots[0];
  const latestSnapshot = trend.snapshots[trend.snapshots.length - 1];
  const firstOldestPendingAge = firstSnapshot.analytics.sla.oldest_pending_age_days;
  const latestOldestPendingAge = latestSnapshot.analytics.sla.oldest_pending_age_days;
  const firstEvidenceCoveragePercent = Math.round(
    firstSnapshot.analytics.evidence_coverage.coverage_ratio * 100
  );
  const latestEvidenceCoveragePercent = Math.round(
    latestSnapshot.analytics.evidence_coverage.coverage_ratio * 100
  );

  return {
    snapshotCount: trend.snapshots.length,
    firstSnapshotDate: firstSnapshot.snapshot_date,
    latestSnapshotDate: latestSnapshot.snapshot_date,
    overduePendingDelta:
      latestSnapshot.analytics.sla.overdue_pending_count -
      firstSnapshot.analytics.sla.overdue_pending_count,
    oldestPendingAgeDelta:
      typeof firstOldestPendingAge === "number" && typeof latestOldestPendingAge === "number"
        ? latestOldestPendingAge - firstOldestPendingAge
        : null,
    evidenceCoverageDeltaPercent: latestEvidenceCoveragePercent - firstEvidenceCoveragePercent,
    firstOverduePendingCount: firstSnapshot.analytics.sla.overdue_pending_count,
    latestOverduePendingCount: latestSnapshot.analytics.sla.overdue_pending_count,
    firstEvidenceCoveragePercent,
    latestEvidenceCoveragePercent
  };
}

export function readStoredReviewFilter(storage: Storage | null = browserStorage()): ReviewFilter {
  if (!storage) {
    return "all";
  }
  try {
    const stored = storage.getItem(reviewFilterStorageKey);
    return isReviewFilter(stored) ? stored : "all";
  } catch {
    return "all";
  }
}

export function persistReviewFilter(
  filter: ReviewFilter,
  storage: Storage | null = browserStorage()
) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(reviewFilterStorageKey, filter);
  } catch {
    // Keep review workflows usable when storage is blocked or quota-limited.
  }
}

export function duplicateSuggestionIdSet(
  governanceSummary: RelationshipGovernanceSummary | null
): Set<number> {
  const suggestionIds = new Set<number>();
  for (const duplicateGroup of governanceSummary?.duplicate_groups ?? []) {
    suggestionIds.add(duplicateGroup.canonical_suggestion_id);
    for (const duplicateSuggestionId of duplicateGroup.duplicate_suggestion_ids) {
      suggestionIds.add(duplicateSuggestionId);
    }
  }
  return suggestionIds;
}

export function isReviewFilter(value: string | null): value is ReviewFilter {
  return (
    value === "all" ||
    value === "pending" ||
    value === "highPriority" ||
    value === "duplicates"
  );
}

function countByStatus(
  suggestions: RelationshipSuggestion[],
  status: RelationshipSuggestion["decision_status"]
): number {
  return suggestions.filter((suggestion) => suggestion.decision_status === status).length;
}

function suggestionHasEvidence(suggestion: RelationshipSuggestion): boolean {
  if (suggestion.evidence_summary.trim().length > 0) {
    return true;
  }
  return Object.keys(suggestion.evidence_payload ?? {}).length > 0;
}

function summarizePendingAge(
  suggestions: RelationshipSuggestion[],
  options: ReviewOperationsOptions
): {
  agedPendingCount: number;
  hasPendingAgeData: boolean;
  oldestPendingAgeDays: number | null;
} {
  const nowMs = parseTimestamp(options.now ?? new Date());
  if (nowMs === null) {
    return {
      agedPendingCount: 0,
      hasPendingAgeData: false,
      oldestPendingAgeDays: null
    };
  }

  const agingThresholdDays = options.agingThresholdDays ?? defaultAgingThresholdDays;
  const pendingAges = suggestions
    .filter((suggestion) => suggestion.decision_status === "pending")
    .map((suggestion) => ageInWholeDays(suggestion.created_at, nowMs))
    .filter((ageDays): ageDays is number => ageDays !== null);

  if (pendingAges.length === 0) {
    return {
      agedPendingCount: 0,
      hasPendingAgeData: false,
      oldestPendingAgeDays: null
    };
  }

  return {
    agedPendingCount: pendingAges.filter((ageDays) => ageDays >= agingThresholdDays).length,
    hasPendingAgeData: true,
    oldestPendingAgeDays: Math.max(...pendingAges)
  };
}

function ageInWholeDays(createdAt: string | undefined, nowMs: number): number | null {
  const createdAtMs = parseTimestamp(createdAt);
  if (createdAtMs === null) {
    return null;
  }
  return Math.max(0, Math.floor((nowMs - createdAtMs) / millisecondsPerDay));
}

function parseTimestamp(value: Date | string | number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function recommendedAction({
  agedPendingCount,
  duplicateSuggestionCount,
  highPriorityCount,
  lowQualityPendingCount,
  pendingCount
}: {
  agedPendingCount: number;
  duplicateSuggestionCount: number;
  highPriorityCount: number;
  lowQualityPendingCount: number;
  pendingCount: number;
}): ReviewRecommendedAction {
  if (lowQualityPendingCount > 0) {
    return "lowQuality";
  }
  if (duplicateSuggestionCount > 0) {
    return "duplicates";
  }
  if (highPriorityCount > 0) {
    return "highPriority";
  }
  if (agedPendingCount > 0) {
    return "aging";
  }
  if (pendingCount > 0) {
    return "pending";
  }
  return "handoffReady";
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}
