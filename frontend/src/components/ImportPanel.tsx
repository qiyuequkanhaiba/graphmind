import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GraphNode,
  ImportStage,
  RelationshipGovernanceSummary,
  RelationshipModelingReview,
  RelationshipSuggestion,
  SourceSummary
} from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";
import {
  buildImportHealthOverview,
  buildImportHealthQueue
} from "./importHealth";
import FieldMappingCard from "./FieldMappingCard";
import ImportHealthPanel from "./ImportHealthPanel";
import ImportHelpPanel from "./ImportHelpPanel";
import ImportIntakeControls from "./ImportIntakeControls";
import ImportSourceSummaryCard from "./ImportSourceSummaryCard";
import ImportSummaryCard from "./ImportSummaryCard";
import ImportTaskListCard from "./ImportTaskListCard";
import {
  importStageKey,
  formatImportStageName,
  type ImportTask
} from "./importTasks";
import RelationshipModelingCard from "./RelationshipModelingCard";

export type ImportDataStats = {
  tableCount: number;
  fieldCount: number;
  suggestionCount: number;
  pendingSuggestionCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
};

type Props = {
  dataStats?: ImportDataStats;
  dataSummary?: string | null;
  fieldProfiles?: GraphNode[];
  importStatus?: string | null;
  importTasks?: ImportTask[];
  isRecoveringImportJobs?: boolean;
  sourceSummaries?: SourceSummary[];
  relationshipGovernance?: RelationshipGovernanceSummary | null;
  relationshipCandidates?: RelationshipSuggestion[];
  onOpenDuplicateReview?: () => void;
  onOpenAISettings?: () => void;
  onOpenFailedImports?: (context: FailedImportShortcutContext) => void;
  onOpenHighPriorityReview?: () => void;
  onOpenPendingReview?: () => void;
  onRetryFailedImportStarted?: (context: FailedImportShortcutContext) => void;
  onImport?: (file: File) => void;
  onImportBatch?: (files: File[]) => void;
  onImportSample?: () => void;
  onImportUrl?: (url: string) => void;
  onConfirmRelationship?: (suggestionId: number, review: RelationshipModelingReview) => void;
  onResetData?: () => void;
  onCancelImportTask?: (taskId: string) => void;
  onRefreshImportTask?: (taskId: string) => void;
  onRecoverImportJobs?: () => void;
  onRetryImportItem?: (taskId: string, itemId: number) => void;
  onRetryImportTask?: (taskId: string) => void;
  showHeading?: boolean;
};

export type FailedImportShortcutContext = {
  failedTaskCount: number;
  stageLabel?: string | null;
  taskLabel: string | null;
};

export default function ImportPanel({
  dataStats = emptyImportDataStats,
  dataSummary = null,
  fieldProfiles = [],
  importStatus = null,
  importTasks = [],
  isRecoveringImportJobs = false,
  sourceSummaries = [],
  relationshipGovernance = null,
  relationshipCandidates = [],
  onOpenDuplicateReview = () => undefined,
  onOpenAISettings = () => undefined,
  onOpenFailedImports,
  onOpenHighPriorityReview = () => undefined,
  onOpenPendingReview = () => undefined,
  onRetryFailedImportStarted,
  onImport = () => undefined,
  onImportBatch = () => undefined,
  onImportSample = () => undefined,
  onImportUrl = () => undefined,
  onConfirmRelationship = () => undefined,
  onResetData = () => undefined,
  onCancelImportTask = () => undefined,
  onRefreshImportTask = () => undefined,
  onRecoverImportJobs = () => undefined,
  onRetryImportItem = () => undefined,
  onRetryImportTask = () => undefined,
  showHeading = true
}: Props) {
  const { t } = useI18n();
  const importTaskCardRef = useRef<HTMLElement | null>(null);
  const [focusedFailedTaskId, setFocusedFailedTaskId] = useState<string | null>(null);
  const [focusedFailedStageKey, setFocusedFailedStageKey] = useState<string | null>(null);
  const [focusUrlRequest, setFocusUrlRequest] = useState(0);
  const fields = useMemo(() => fieldProfiles.filter((node) => node.node_type === "field"), [fieldProfiles]);
  const importHealth = buildImportHealthOverview(
    dataStats,
    importTasks,
    sourceSummaries,
    relationshipCandidates,
    relationshipGovernance
  );
  const failedImportTarget = findFailedImportTarget(importTasks, t);
  const activePersistedImportJobCount = importTasks.filter(
    (task) => task.jobId !== undefined && ["staging", "queued", "running"].includes(task.status)
  ).length;
  const importHealthQueue = buildImportHealthQueue(
    importHealth,
    failedImportTarget?.retryable ? retryFailedImportTarget : openFailedImports,
    onOpenPendingReview,
    onOpenHighPriorityReview,
    onOpenDuplicateReview,
    t,
    activePersistedImportJobCount > 0
      ? {
          activeImportJobCount: activePersistedImportJobCount,
          disabled: isRecoveringImportJobs,
          onRecover: onRecoverImportJobs
        }
      : undefined
  );
  const canRecoverImportJobs = activePersistedImportJobCount > 0;

  useEffect(() => {
    if (!focusedFailedTaskId) {
      return;
    }

    const focusedTask = importTasks.find((task) => task.id === focusedFailedTaskId);
    if (!focusedTask || !isFailedImportTask(focusedTask)) {
      setFocusedFailedTaskId(null);
      setFocusedFailedStageKey(null);
      return;
    }

    if (!focusedFailedStageKey) {
      return;
    }

    const focusedStageStillFailed = focusedTask.stages?.some(
      (stage, index) =>
        importStageKey(focusedTask, stage, index) === focusedFailedStageKey &&
        stage.status === "failed"
    );
    if (!focusedStageStillFailed) {
      setFocusedFailedStageKey(null);
    }
  }, [focusedFailedStageKey, focusedFailedTaskId, importTasks]);

  function openFailedImports() {
    importTaskCardRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    setFocusedFailedTaskId(failedImportTarget?.task.id ?? null);
    setFocusedFailedStageKey(failedImportTarget?.stageKey ?? null);
    onOpenFailedImports?.(failedImportShortcutContext(failedImportTarget, importHealth.failedTaskCount));
  }

  function retryFailedImportTarget() {
    if (!failedImportTarget) {
      return;
    }

    setFocusedFailedTaskId(failedImportTarget.task.id);
    setFocusedFailedStageKey(failedImportTarget.stageKey);
    onRetryFailedImportStarted?.(failedImportShortcutContext(failedImportTarget, importHealth.failedTaskCount));
    if (failedImportTarget.stage?.retryable && failedImportTarget.stage.itemId !== undefined) {
      onRetryImportItem(failedImportTarget.task.id, failedImportTarget.stage.itemId);
      return;
    }

    if (failedImportTarget.task.retryable) {
      onRetryImportTask(failedImportTarget.task.id);
    }
  }

  return (
    <aside className="panel intake-panel">
      {showHeading ? <h2>{t("import.heading")}</h2> : null}
      <ImportIntakeControls
        dataStats={dataStats}
        focusUrlRequest={focusUrlRequest}
        onImport={onImport}
        onImportBatch={onImportBatch}
        onImportSample={onImportSample}
        onImportUrl={onImportUrl}
        onResetData={onResetData}
      />
      <ImportHealthPanel
        canRetryFailure={Boolean(failedImportTarget?.retryable)}
        health={importHealth}
        canRecoverImportJobs={canRecoverImportJobs}
        isRecoveringImportJobs={isRecoveringImportJobs}
        onDuplicates={onOpenDuplicateReview}
        onFailures={openFailedImports}
        onHighPriority={onOpenHighPriorityReview}
        onPending={onOpenPendingReview}
        onRecoverImportJobs={onRecoverImportJobs}
        onRetryFailure={retryFailedImportTarget}
        queue={importHealthQueue}
      />
      <ImportHelpPanel
        hasFailedImports={importHealth.failedTaskCount > 0}
        hasQualityWork={
          importHealth.pendingReviewCount > 0 ||
          importHealth.highPriorityCount > 0 ||
          importHealth.duplicateSuggestionCount > 0
        }
        importTasks={importTasks}
        onOpenAISettings={onOpenAISettings}
        onOpenFailedImports={openFailedImports}
        onOpenPendingReview={onOpenPendingReview}
        onOpenUrlInput={() => setFocusUrlRequest((request) => request + 1)}
      />
      <ImportCompletionGuidance
        dataStats={dataStats}
        onOpenPendingReview={onOpenPendingReview}
      />
      <ImportSummaryCard dataStats={dataStats} dataSummary={dataSummary} importStatus={importStatus} />
      <ImportSourceSummaryCard sourceSummaries={sourceSummaries} />
      <ImportTaskListCard
        focusedFailedStageKey={focusedFailedStageKey}
        focusedFailedTaskId={focusedFailedTaskId}
        importTasks={importTasks}
        onCancelImportTask={onCancelImportTask}
        onRefreshImportTask={onRefreshImportTask}
        onRetryImportItem={onRetryImportItem}
        onRetryImportTask={onRetryImportTask}
        ref={importTaskCardRef}
      />
      <FieldMappingCard fields={fields} />
      <RelationshipModelingCard
        candidates={relationshipCandidates}
        onConfirmRelationship={onConfirmRelationship}
      />
    </aside>
  );
}

const emptyImportDataStats: ImportDataStats = {
  tableCount: 0,
  fieldCount: 0,
  suggestionCount: 0,
  pendingSuggestionCount: 0,
  graphNodeCount: 0,
  graphEdgeCount: 0
};

function ImportCompletionGuidance({
  dataStats,
  onOpenPendingReview
}: {
  dataStats: ImportDataStats;
  onOpenPendingReview: () => void;
}) {
  const { t } = useI18n();
  if (dataStats.graphNodeCount === 0 && dataStats.tableCount === 0 && dataStats.fieldCount === 0) {
    return null;
  }
  if (dataStats.pendingSuggestionCount === 0) {
    return null;
  }

  return (
    <section className="import-completion-guidance" aria-label={t("import.completionGuidance")}>
      <div>
        <strong>{t("import.completionGuidance.pendingTitle", { count: dataStats.pendingSuggestionCount })}</strong>
        <span>
          {t("import.completionGuidance.pendingBody", {
            nodes: dataStats.graphNodeCount,
            edges: dataStats.graphEdgeCount
          })}
        </span>
      </div>
      <button onClick={onOpenPendingReview} type="button">
        {t("import.health.action.pending")}
      </button>
    </section>
  );
}

function isFailedImportTask(task: ImportTask): boolean {
  return task.status === "failed" || task.status === "partial";
}

function findFailedImportTarget(
  importTasks: ImportTask[],
  t: (key: MessageKey, values?: Record<string, string | number>) => string
) {
  const task = importTasks.find((candidate) => isFailedImportTask(candidate));
  if (!task) {
    return null;
  }

  const failedStageIndex = task.stages?.findIndex((stage) => stage.status === "failed") ?? -1;
  if (failedStageIndex >= 0 && task.stages) {
    const stage = task.stages[failedStageIndex];
    return {
      retryable: Boolean(stage.retryable && stage.itemId !== undefined),
      stage,
      stageKey: importStageKey(task, stage, failedStageIndex),
      stageLabel: formatImportStageLabel(task, stage, t),
      task
    };
  }

  return {
    retryable: task.retryable,
    stage: null,
    stageKey: null,
    stageLabel: null,
    task
  };
}

function failedImportShortcutContext(
  target: ReturnType<typeof findFailedImportTarget>,
  failedTaskCount: number
): FailedImportShortcutContext {
  return {
    failedTaskCount,
    ...(target?.stageLabel ? { stageLabel: target.stageLabel } : {}),
    taskLabel: target?.task.label ?? null
  };
}

function formatImportStageLabel(
  task: ImportTask,
  stage: ImportStage,
  t: (key: MessageKey, values?: Record<string, string | number>) => string
): string {
  return `${stage.source ?? task.label} · ${formatImportStageName(stage.name, t)}`;
}
