import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  RefreshCw,
  RotateCcw,
  UploadCloud,
  XCircle
} from "lucide-react";
import { forwardRef, useRef } from "react";
import type { ImportDiagnostics } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { useStaggeredListMotion } from "../motion/useWorkbenchMotion";
import {
  formatImportStageName,
  importStageKey,
  importTaskStatusLabels,
  type ImportTask
} from "./importTasks";

type Props = {
  focusedFailedStageKey?: string | null;
  focusedFailedTaskId?: string | null;
  importTasks: ImportTask[];
  onCancelImportTask: (taskId: string) => void;
  onRefreshImportTask: (taskId: string) => void;
  onRetryImportItem: (taskId: string, itemId: number) => void;
  onRetryImportTask: (taskId: string) => void;
};

const ImportTaskListCard = forwardRef<HTMLElement, Props>(function ImportTaskListCard(
  {
    focusedFailedStageKey = null,
    focusedFailedTaskId = null,
    importTasks,
    onCancelImportTask,
    onRefreshImportTask,
    onRetryImportItem,
    onRetryImportTask
  },
  ref
) {
  const { t } = useI18n();
  const taskListRef = useRef<HTMLDivElement>(null);
  useStaggeredListMotion(taskListRef, ".import-task-row", importTasks.map((task) => task.id).join("|"));

  if (importTasks.length === 0) {
    return null;
  }

  return (
    <section className="import-task-card" aria-label={t("import.tasks.heading")} ref={ref}>
      <div className="import-task-heading">
        <div>
          <h3>{t("import.tasks.heading")}</h3>
          <p>{t("import.tasks.count", { count: importTasks.length })}</p>
        </div>
        <UploadCloud aria-hidden="true" size={15} />
      </div>
      <div className="import-task-list" ref={taskListRef}>
        {importTasks.map((task) => {
          const TaskIcon =
            task.status === "failed" ? AlertTriangle : task.status === "succeeded" ? CheckCircle2 : Circle;
          const canRefreshTask = task.jobId !== undefined;
          const canCancelTask = task.jobId !== undefined && ["queued", "running"].includes(task.status);
          return (
            <article
              className={[
                "import-task-row",
                `is-${task.status}`,
                focusedFailedTaskId === task.id ? "is-shortcut-focused" : ""
              ].filter(Boolean).join(" ")}
              key={task.id}
            >
              <div className="import-task-main">
                <TaskIcon aria-hidden="true" size={14} />
                <div>
                  <strong>{task.label}</strong>
                  <span>{t(importTaskStatusLabels[task.status])}</span>
                </div>
                <span className="import-task-progress">{t("import.tasks.progress", { progress: task.progress })}</span>
              </div>
              <div
                aria-label={t("import.tasks.progressFor", { label: task.label })}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={task.progress}
                className="import-task-bar"
                role="progressbar"
              >
                <span style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }} />
              </div>
              {task.summary ? <p>{task.summary}</p> : null}
              <ImportDiagnosticsPills diagnostics={task.diagnostics} />
              {task.stages && task.stages.length > 0 ? (
                <ol className="import-task-stages" aria-label={t("import.tasks.stagesFor", { label: task.label })}>
                  {task.stages.map((stage, index) => {
                    const stageKey = importStageKey(task, stage, index);
                    return (
                      <li
                        className={[
                          "import-task-stage",
                          `is-${stage.status}`,
                          focusedFailedStageKey === stageKey ? "is-shortcut-focused" : ""
                        ].filter(Boolean).join(" ")}
                        key={stageKey}
                      >
                        <span className="import-task-stage-label">
                          {stage.source ? `${stage.source} · ` : ""}
                          {formatImportStageName(stage.name, t)}
                        </span>
                        <span className="import-task-stage-progress">
                          {t("import.tasks.stageProgress", { progress: stage.progress })}
                        </span>
                        {stage.summary ? <small>{stage.summary}</small> : null}
                        <ImportDiagnosticsPills diagnostics={stage.diagnostics} />
                        {stage.retryable && stage.itemId !== undefined ? (
                          <button
                            aria-label={t("import.tasks.retryItem", {
                              label: stage.source ?? task.label
                            })}
                            className="import-task-stage-retry"
                            onClick={() => onRetryImportItem(task.id, stage.itemId as number)}
                            type="button"
                          >
                            <RotateCcw aria-hidden="true" size={13} />
                            <span>{t("import.tasks.retry")}</span>
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : null}
              {task.error ? (
                <div className="import-task-error">
                  <strong>{t("import.tasks.errorDetail")}</strong>
                  <span>{task.error}</span>
                </div>
              ) : null}
              <ImportRecoveryPlaybook task={task} />
              {task.retryable ? (
                <div className="import-task-actions">
                  <button
                    aria-label={t("import.tasks.retryTask", { label: task.label })}
                    className="import-task-retry"
                    onClick={() => onRetryImportTask(task.id)}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" size={14} />
                    <span>{t("import.tasks.retry")}</span>
                  </button>
                </div>
              ) : null}
              {canRefreshTask || canCancelTask ? (
                <div className="import-task-actions">
                  {canRefreshTask ? (
                    <button
                      aria-label={t("import.tasks.refreshTask", { label: task.label })}
                      className="import-task-action"
                      onClick={() => onRefreshImportTask(task.id)}
                      title={t("import.tasks.refresh")}
                      type="button"
                    >
                      <RefreshCw aria-hidden="true" size={14} />
                      <span>{t("import.tasks.refresh")}</span>
                    </button>
                  ) : null}
                  {canCancelTask ? (
                    <button
                      aria-label={t("import.tasks.cancelTask", { label: task.label })}
                      className="import-task-action"
                      onClick={() => onCancelImportTask(task.id)}
                      title={t("import.tasks.cancel")}
                      type="button"
                    >
                      <XCircle aria-hidden="true" size={14} />
                      <span>{t("import.tasks.cancel")}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
});

function ImportRecoveryPlaybook({ task }: { task: ImportTask }) {
  const { t } = useI18n();
  const steps = getImportRecoverySteps(task, t);
  const fieldErrors = Object.entries(task.fieldErrors ?? {}).filter(
    ([field, message]) => field.trim().length > 0 && message.trim().length > 0
  );
  if (steps.length === 0 && !task.recoveryAction && fieldErrors.length === 0 && !task.errorCode) {
    return null;
  }

  return (
    <section className="import-task-recovery" aria-label={t("import.tasks.recovery.heading")}>
      <strong>{t("import.tasks.recovery.heading")}</strong>
      {task.errorCode ? (
        <div className="import-task-recovery-detail">
          <span>{t("import.tasks.recovery.code")}</span>
          <code>{task.errorCode}</code>
        </div>
      ) : null}
      {task.recoveryAction ? (
        <div className="import-task-recovery-detail">
          <span>{t("import.tasks.recovery.action")}</span>
          <p>{task.recoveryAction}</p>
        </div>
      ) : null}
      {fieldErrors.length > 0 ? (
        <div className="import-task-recovery-detail">
          <span>{t("import.tasks.recovery.fieldErrors")}</span>
          <ul>
            {fieldErrors.map(([field, message]) => (
              <li key={field}>{`${field}: ${message}`}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
    </section>
  );
}

function getImportRecoverySteps(
  task: ImportTask,
  t: ReturnType<typeof useI18n>["t"]
): string[] {
  if (task.status !== "failed" && task.status !== "partial") {
    return [];
  }

  if (task.kind === "url" || importDiagnosticsIndicateUrlSafety(task.diagnostics, task.error)) {
    return [
      t("import.tasks.recovery.urlStep.safety"),
      t("import.tasks.recovery.urlStep.allowlist"),
      t("import.tasks.recovery.urlStep.source")
    ];
  }

  return [
    t("import.tasks.recovery.fileStep.format"),
    t("import.tasks.recovery.fileStep.retry")
  ];
}

function importDiagnosticsIndicateUrlSafety(
  diagnostics: ImportDiagnostics | undefined,
  error: string | null
): boolean {
  const safetyReason = diagnostics?.["safety_reason"];
  return (
    (typeof safetyReason === "string" && safetyReason.length > 0) ||
    /url safety|allowlist|denylist|ssrf|private network/i.test(error ?? "")
  );
}

function ImportDiagnosticsPills({ diagnostics }: { diagnostics?: ImportDiagnostics }) {
  const { t } = useI18n();
  const items = formatImportDiagnostics(diagnostics, t);
  if (items.length === 0) {
    return null;
  }
  return (
    <ul className="import-task-diagnostics" aria-label={t("import.tasks.diagnostics")}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function formatImportDiagnostics(
  diagnostics: ImportDiagnostics | undefined,
  t: ReturnType<typeof useI18n>["t"]
): string[] {
  if (!diagnostics) {
    return [];
  }
  const values = [
    diagnosticLabel(diagnostics.document_count, "import.tasks.diagnostic.documents", t),
    diagnosticLabel(diagnostics.repository_file_count, "import.tasks.diagnostic.repositoryFiles", t),
    diagnosticLabel(diagnostics.chunk_count, "import.tasks.diagnostic.chunks", t),
    diagnosticLabel(diagnostics.entity_count, "import.tasks.diagnostic.entities", t),
    diagnosticLabel(diagnostics.relationship_count, "import.tasks.diagnostic.relationships", t),
    diagnosticLabel(diagnostics.graph_node_count, "import.tasks.diagnostic.graphNodes", t),
    diagnosticLabel(diagnostics.graph_edge_count, "import.tasks.diagnostic.graphEdges", t),
    diagnosticLabel(diagnostics.byte_count, "import.tasks.diagnostic.bytes", t),
    typeof diagnostics.http_status === "number"
      ? t("import.tasks.diagnostic.httpStatus", { status: diagnostics.http_status })
      : null,
    typeof diagnostics.content_type === "string" && diagnostics.content_type
      ? t("import.tasks.diagnostic.contentType", { type: diagnostics.content_type })
      : null,
    diagnosticLabel(diagnostics.ignored_file_count, "import.tasks.diagnostic.ignoredFiles", t)
  ].filter((item): item is string => Boolean(item));
  const sourceKinds = diagnostics.source_kind_counts ?? {};
  Object.entries(sourceKinds)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([kind, count]) => {
      values.push(
        t("import.tasks.diagnostic.sourceKind", {
          kind: formatSourceKind(kind, t),
          count
        })
      );
    });
  return values;
}

function diagnosticLabel(
  value: number | undefined,
  key: Parameters<ReturnType<typeof useI18n>["t"]>[0],
  t: ReturnType<typeof useI18n>["t"]
): string | null {
  return typeof value === "number" && value > 0 ? t(key, { count: value }) : null;
}

function formatSourceKind(kind: string, t: ReturnType<typeof useI18n>["t"]): string {
  const labels: Record<string, Parameters<ReturnType<typeof useI18n>["t"]>[0]> = {
    code: "import.tasks.sourceKind.code",
    document: "import.tasks.sourceKind.document",
    json: "import.tasks.sourceKind.json",
    log: "import.tasks.sourceKind.log",
    table: "import.tasks.sourceKind.table",
    url: "import.tasks.sourceKind.url"
  };
  const label = labels[kind];
  return label ? t(label) : kind;
}

export default ImportTaskListCard;
