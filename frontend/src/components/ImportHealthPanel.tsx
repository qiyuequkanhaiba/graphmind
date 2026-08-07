import { AlertTriangle, RotateCcw } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";
import type { ImportHealthOverview, ImportHealthQueueItem } from "./importHealth";

type Props = {
  health: ImportHealthOverview;
  queue: ImportHealthQueueItem[];
  canRecoverImportJobs?: boolean;
  canRetryFailure?: boolean;
  isRecoveringImportJobs?: boolean;
  onDuplicates: () => void;
  onFailures: () => void;
  onHighPriority: () => void;
  onPending: () => void;
  onRecoverImportJobs: () => void;
  onRetryFailure: () => void;
};

type ImportHealthOverviewStatus = ImportHealthOverview["status"];

export default function ImportHealthPanel({
  health,
  queue,
  canRecoverImportJobs = false,
  canRetryFailure = false,
  isRecoveringImportJobs = false,
  onDuplicates,
  onFailures,
  onHighPriority,
  onPending,
  onRecoverImportJobs,
  onRetryFailure
}: Props) {
  const { t } = useI18n();

  return (
    <section className={`import-health-card is-${health.status}`} aria-label={t("import.health.heading")}>
      <div className="import-summary-heading">
        <div>
          <h3>{t("import.health.heading")}</h3>
          <span>{t(importHealthStatusLabels[health.status])}</span>
        </div>
        <AlertTriangle aria-hidden="true" size={15} />
      </div>
      <div className="import-health-metrics">
        <ImportMetric value={t("import.health.sources", { count: health.sourceKindCount })} />
        <ImportMetric
          value={t("import.health.multiSourceRelationships", {
            count: health.multiSourceRelationshipCount
          })}
        />
        <ImportMetric
          value={t("import.health.extractedHighPriority", {
            count: health.extractedHighPriorityCount
          })}
        />
        <ImportMetric value={t("import.health.ignoredFiles", { count: health.ignoredFileCount })} />
        <ImportMetric value={t("import.health.staleImports", { count: health.staleImportJobCount })} />
        <ImportHealthMetric
          actionLabel={t("import.health.action.failures")}
          onClick={health.failedTaskCount > 0 ? onFailures : undefined}
          value={t("import.health.failures", { count: health.failedTaskCount })}
        />
        {canRetryFailure ? (
          <button
            aria-label={t("import.health.action.retryFailure")}
            className="import-summary-metric import-health-action import-health-retry-action"
            onClick={onRetryFailure}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={13} />
            <span>{t("import.health.action.retryFailure")}</span>
          </button>
        ) : null}
        {canRecoverImportJobs ? (
          <button
            aria-label={t("import.health.action.recoverJobs")}
            className="import-summary-metric import-health-action import-health-retry-action"
            disabled={isRecoveringImportJobs}
            onClick={onRecoverImportJobs}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={13} />
            <span>{t("import.health.action.recoverJobs")}</span>
          </button>
        ) : null}
        <ImportHealthMetric
          actionLabel={t("import.health.action.pending")}
          onClick={health.pendingReviewCount > 0 ? onPending : undefined}
          value={t("import.health.pending", { count: health.pendingReviewCount })}
        />
        <ImportHealthMetric
          actionLabel={t("import.health.action.highPriority")}
          onClick={health.highPriorityCount > 0 ? onHighPriority : undefined}
          value={t("import.health.highPriority", { count: health.highPriorityCount })}
        />
        <ImportHealthMetric
          actionLabel={t("import.health.action.duplicates")}
          onClick={health.duplicateSuggestionCount > 0 ? onDuplicates : undefined}
          value={t("import.health.duplicates", { count: health.duplicateSuggestionCount })}
        />
      </div>
      {queue.length > 0 ? (
        <ol className="import-health-queue" aria-label={t("import.health.queue.heading")}>
          {queue.map((item) => (
            <li key={item.key}>
              <span>
                {item.label}
                {item.recommended ? (
                  <em className="import-health-queue-badge">{t("import.health.queue.recommended")}</em>
                ) : null}
                <small>{item.countLabel}</small>
              </span>
              <button
                aria-label={`${item.label}: ${item.actionLabel}`}
                disabled={item.disabled}
                onClick={item.onClick}
                type="button"
              >
                {item.actionLabel}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ImportMetric({ value }: { value: string }) {
  return <span className="import-summary-metric">{value}</span>;
}

function ImportHealthMetric({
  actionLabel,
  onClick,
  value
}: {
  actionLabel: string;
  onClick?: () => void;
  value: string;
}) {
  if (onClick) {
    return (
      <button
        aria-label={actionLabel}
        className="import-summary-metric import-health-action"
        onClick={onClick}
        type="button"
      >
        {value}
      </button>
    );
  }

  return <ImportMetric value={value} />;
}

const importHealthStatusLabels: Record<ImportHealthOverviewStatus, MessageKey> = {
  attention: "import.health.status.attention",
  healthy: "import.health.status.healthy",
  waiting: "import.health.status.waiting"
};
