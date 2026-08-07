import type { MessageKey } from "../i18n/messages";

export type ImportHealthOverview = {
  status: "waiting" | "healthy" | "attention";
  sourceKindCount: number;
  failedTaskCount: number;
  pendingReviewCount: number;
  highPriorityCount: number;
  duplicateSuggestionCount: number;
  multiSourceRelationshipCount: number;
  extractedHighPriorityCount: number;
  staleImportJobCount: number;
  ignoredFileCount: number;
};

export type ImportHealthDataStats = {
  tableCount: number;
  fieldCount: number;
  suggestionCount: number;
  pendingSuggestionCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
};

export type ImportHealthTask = {
  jobId?: number;
  status: string;
  updatedAt?: number;
  diagnostics?: ImportHealthDiagnostics;
  stages?: Array<{
    diagnostics?: ImportHealthDiagnostics;
  }>;
};

export type ImportHealthSourceSummary = {
  source_kind: string;
};

export type ImportHealthRelationshipCandidate = {
  review_priority?: string;
  quality_reasons?: string[];
  evidence_payload?: Record<string, unknown>;
};

export type ImportHealthDiagnostics = {
  ignored_file_count?: number;
};

export type ImportHealthGovernanceSummary = {
  duplicate_suggestion_count: number;
};

export const STALE_IMPORT_JOB_MS = 30 * 60 * 1000;

export function buildImportHealthOverview(
  dataStats: ImportHealthDataStats,
  importTasks: ImportHealthTask[],
  sourceSummaries: ImportHealthSourceSummary[],
  relationshipCandidates: ImportHealthRelationshipCandidate[],
  relationshipGovernance: ImportHealthGovernanceSummary | null,
  now = Date.now()
): ImportHealthOverview {
  const failedTaskCount = importTasks.filter((task) => isFailedImportTaskStatus(task.status)).length;
  const highPriorityCount = relationshipCandidates.filter(
    (candidate) => candidate.review_priority === "high"
  ).length;
  const extractedHighPriorityCount = relationshipCandidates.filter(
    (candidate) => candidate.review_priority === "high" && isExtractedRelationshipCandidate(candidate)
  ).length;
  const multiSourceRelationshipCount = relationshipCandidates.filter(hasMultiSourceEvidence).length;
  const ignoredFileCount = importTasks.reduce(
    (count, task) => count + ignoredFileCountForTask(task),
    0
  );
  const duplicateSuggestionCount = relationshipGovernance?.duplicate_suggestion_count ?? 0;
  const activeImportJobCount = importTasks.filter(isActivePersistedImportJob).length;
  const staleImportJobCount = importTasks.filter((task) => isStalePersistedImportJob(task, now))
    .length;
  const hasImportSignal =
    sourceSummaries.length > 0 ||
    importTasks.length > 0 ||
    dataStats.graphNodeCount > 0 ||
    dataStats.graphEdgeCount > 0 ||
    dataStats.tableCount > 0 ||
    dataStats.fieldCount > 0 ||
    dataStats.suggestionCount > 0;
  const needsAttention =
    activeImportJobCount > 0 ||
    staleImportJobCount > 0 ||
    failedTaskCount > 0 ||
    dataStats.pendingSuggestionCount > 0 ||
    highPriorityCount > 0 ||
    duplicateSuggestionCount > 0;

  return {
    status: hasImportSignal ? (needsAttention ? "attention" : "healthy") : "waiting",
    sourceKindCount: sourceSummaries.length,
    failedTaskCount,
    pendingReviewCount: dataStats.pendingSuggestionCount,
    highPriorityCount,
    duplicateSuggestionCount,
    multiSourceRelationshipCount,
    extractedHighPriorityCount,
    staleImportJobCount,
    ignoredFileCount
  };
}

function isFailedImportTaskStatus(status: string): boolean {
  return status === "failed" || status === "partial";
}

function isActivePersistedImportJob(task: ImportHealthTask): boolean {
  return task.jobId !== undefined && ["staging", "queued", "running"].includes(task.status);
}

function isStalePersistedImportJob(task: ImportHealthTask, now: number): boolean {
  return (
    isActivePersistedImportJob(task) &&
    typeof task.updatedAt === "number" &&
    Number.isFinite(task.updatedAt) &&
    now - task.updatedAt >= STALE_IMPORT_JOB_MS
  );
}

function isExtractedRelationshipCandidate(candidate: ImportHealthRelationshipCandidate): boolean {
  return (
    candidate.evidence_payload?.source_kind === "extracted_relationship" ||
    candidate.quality_reasons?.includes("source:extracted_relationship") === true
  );
}

function hasMultiSourceEvidence(candidate: ImportHealthRelationshipCandidate): boolean {
  if (candidate.quality_reasons?.includes("evidence:multi_source")) {
    return true;
  }
  const payload = candidate.evidence_payload ?? {};
  return evidenceRefCount(payload.evidence_refs) > 1 || evidenceRefCount(payload.source_refs) > 1;
}

function evidenceRefCount(value: unknown): number {
  return Array.isArray(value) ? new Set(value.filter((item) => typeof item === "string")).size : 0;
}

function ignoredFileCountForTask(task: ImportHealthTask): number {
  if (typeof task.diagnostics?.ignored_file_count === "number") {
    return task.diagnostics.ignored_file_count;
  }
  return (task.stages ?? []).reduce((count, stage) => {
    const ignoredFileCount = stage.diagnostics?.ignored_file_count;
    return count + (typeof ignoredFileCount === "number" ? ignoredFileCount : 0);
  }, 0);
}

export type ImportHealthQueueItem = {
  actionLabel: string;
  countLabel: string;
  disabled?: boolean;
  key: string;
  label: string;
  onClick: () => void;
  recommended?: boolean;
};

export function buildImportHealthQueue(
  importHealth: ImportHealthOverview,
  onFailures: () => void,
  onPending: () => void,
  onHighPriority: () => void,
  onDuplicates: () => void,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
  recovery?: {
    activeImportJobCount: number;
    disabled?: boolean;
    onRecover: () => void;
  }
): ImportHealthQueueItem[] {
  const queue: ImportHealthQueueItem[] = [];
  if (recovery && recovery.activeImportJobCount > 0) {
    queue.push({
      actionLabel: t("import.health.action.recoverJobs"),
      countLabel: t("import.health.queue.recoverJobs.count", {
        count: recovery.activeImportJobCount
      }),
      key: "recoverJobs",
      label: t("import.health.queue.recoverJobs"),
      onClick: recovery.onRecover,
      disabled: recovery.disabled
    });
  }
  if (importHealth.failedTaskCount > 0) {
    queue.push({
      actionLabel: t("import.health.action.failures"),
      countLabel: t("import.health.failures", { count: importHealth.failedTaskCount }),
      key: "failures",
      label: t("import.health.queue.failures"),
      onClick: onFailures
    });
  }
  if (importHealth.pendingReviewCount > 0) {
    queue.push({
      actionLabel: t("import.health.action.pending"),
      countLabel: t("import.health.pending", { count: importHealth.pendingReviewCount }),
      key: "pending",
      label: t("import.health.queue.pending"),
      onClick: onPending
    });
  }
  if (importHealth.highPriorityCount > 0) {
    queue.push({
      actionLabel: t("import.health.action.highPriority"),
      countLabel: t("import.health.highPriority", { count: importHealth.highPriorityCount }),
      key: "highPriority",
      label: t("import.health.queue.highPriority"),
      onClick: onHighPriority
    });
  }
  if (importHealth.duplicateSuggestionCount > 0) {
    queue.push({
      actionLabel: t("import.health.action.duplicates"),
      countLabel: t("import.health.duplicates", { count: importHealth.duplicateSuggestionCount }),
      key: "duplicates",
      label: t("import.health.queue.duplicates"),
      onClick: onDuplicates
    });
  }
  return queue.map((item, index) => ({ ...item, recommended: index === 0 }));
}
