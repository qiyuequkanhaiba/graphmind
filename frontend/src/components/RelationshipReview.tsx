import type {
  RelationshipDecisionStatus,
  RelationshipGovernanceSummary,
  ReviewAnalytics,
  ReviewAnalyticsSnapshotCleanupEvent,
  ReviewAnalyticsSnapshotSummary,
  ReviewAnalyticsTrend,
  ReviewAnalyticsTrendDays,
  RelationshipSuggestion
} from "../api/types";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { MessageKey } from "../i18n/messages";
import { useI18n } from "../i18n/I18nProvider";
import {
  formatEvidenceSummary,
  formatStatusLabel,
  getRelationshipLabel
} from "./graph/graphSemantics";
import {
  buildReviewAuditReport,
  buildReviewOperationsSummary,
  duplicateSuggestionIdSet,
  filterRelationshipSuggestions,
  persistReviewFilter,
  readStoredReviewFilter,
  type ReviewFilter,
  type ReviewOperationsSummary,
  type ReviewRecommendedAction
} from "./reviewOps";

type ReviewStatus = Exclude<RelationshipDecisionStatus, "pending">;
export type { ReviewFilter };

type Props = {
  suggestions: RelationshipSuggestion[];
  governanceSummary?: RelationshipGovernanceSummary | null;
  reviewAnalytics?: ReviewAnalytics | null;
  reviewAnalyticsSnapshotCleanupEvents?: ReviewAnalyticsSnapshotCleanupEvent[];
  reviewAnalyticsSnapshotSummary?: ReviewAnalyticsSnapshotSummary | null;
  reviewAnalyticsTrend?: ReviewAnalyticsTrend | null;
  reviewAnalyticsTrendDays?: ReviewAnalyticsTrendDays;
  reviewerName?: string;
  initialFilter?: ReviewFilter;
  shortcutFocusKey?: number;
  onReview: (suggestionId: number, decisionStatus: ReviewStatus, reviewedBy?: string) => void;
  onCleanupAnalyticsSnapshots?: (retentionDays: number) => void;
  onCleanupDuplicates?: () => void;
  onReviewAnalyticsTrendDaysChange?: (days: ReviewAnalyticsTrendDays) => void;
  onReviewerNameChange?: (reviewerName: string) => void;
};

const actions: { label: "review.accept" | "review.edit" | "review.reject"; ariaLabel: "review.acceptRelationship" | "review.editRelationship" | "review.rejectRelationship"; status: ReviewStatus }[] = [
  { label: "review.accept", ariaLabel: "review.acceptRelationship", status: "accepted" },
  { label: "review.edit", ariaLabel: "review.editRelationship", status: "edited" },
  { label: "review.reject", ariaLabel: "review.rejectRelationship", status: "rejected" }
];

const analyticsSnapshotRetentionOptions = [30, 90, 180, 365] as const;
const reviewAnalyticsTrendDayOptions = [7, 14, 30, 90] as const;
const analyticsSnapshotCleanupStorageKey = "graphmind.reviewAnalyticsSnapshotCleanup";

type AnalyticsSnapshotCleanupRecord = {
  cleanedAt: string;
  expiredSnapshotCount: number;
  retentionDays: number;
  snapshotCount: number;
};

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export default function RelationshipReview({
  suggestions,
  governanceSummary = null,
  reviewAnalytics = null,
  reviewAnalyticsSnapshotCleanupEvents = [],
  reviewAnalyticsSnapshotSummary = null,
  reviewAnalyticsTrend = null,
  reviewAnalyticsTrendDays = 14,
  reviewerName,
  initialFilter = "all",
  shortcutFocusKey = 0,
  onCleanupAnalyticsSnapshots = () => undefined,
  onReview,
  onCleanupDuplicates = () => undefined,
  onReviewAnalyticsTrendDaysChange = () => undefined,
  onReviewerNameChange = () => undefined
}: Props) {
  const { language, t } = useI18n();
  const [expandedReasonIds, setExpandedReasonIds] = useState<number[]>([]);
  const [localReviewerName, setLocalReviewerName] = useState(reviewerName ?? "");
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>(() =>
    initialFilter === "all" ? readStoredReviewFilter() : initialFilter
  );
  const [focusedShortcutKey, setFocusedShortcutKey] = useState(0);
  const sortedSuggestions = useMemo(() => [...suggestions].sort(compareSuggestions), [suggestions]);
  const duplicateSuggestionIds = useMemo(
    () => duplicateSuggestionIdSet(governanceSummary),
    [governanceSummary]
  );
  const operationsSummary = useMemo(
    () => buildReviewOperationsSummary(suggestions, governanceSummary),
    [governanceSummary, suggestions]
  );
  const filterCounts = useMemo(
    () => ({
      all: suggestions.length,
      pending: suggestions.filter((suggestion) => suggestion.decision_status === "pending").length,
      highPriority: suggestions.filter((suggestion) => suggestion.review_priority === "high").length,
      duplicates: suggestions.filter((suggestion) => duplicateSuggestionIds.has(suggestion.id)).length
    }),
    [duplicateSuggestionIds, suggestions]
  );
  const filteredSuggestions = useMemo(
    () => filterRelationshipSuggestions(sortedSuggestions, activeFilter, governanceSummary),
    [activeFilter, governanceSummary, sortedSuggestions]
  );
  const shortcutFocusActive = focusedShortcutKey > 0 && activeFilter === initialFilter;
  const activeReviewerName = reviewerName ?? localReviewerName;

  useEffect(() => {
    if (shortcutFocusKey > 0 || initialFilter !== "all") {
      setActiveFilter(initialFilter);
    }
  }, [initialFilter, shortcutFocusKey]);

  useEffect(() => {
    if (reviewerName !== undefined) {
      setLocalReviewerName(reviewerName);
    }
  }, [reviewerName]);

  useEffect(() => {
    setFocusedShortcutKey(shortcutFocusKey);
  }, [shortcutFocusKey]);

  useEffect(() => {
    persistReviewFilter(activeFilter);
  }, [activeFilter]);

  const toggleQualityReasons = (suggestionId: number) => {
    setExpandedReasonIds((currentIds) =>
      currentIds.includes(suggestionId)
        ? currentIds.filter((currentId) => currentId !== suggestionId)
        : [...currentIds, suggestionId]
    );
  };

  const handleFilterChange = (filter: ReviewFilter) => {
    setActiveFilter(filter);
  };

  const exportAuditReport = () => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    if (typeof window.URL.createObjectURL !== "function") {
      return;
    }
    const report = buildReviewAuditReport({
      activeFilter,
      governanceSummary,
      reviewAnalytics,
      reviewAnalyticsSnapshotCleanupEvents,
      reviewAnalyticsSnapshotSummary,
      reviewAnalyticsTrend,
      reviewAnalyticsTrendDays,
      suggestions
    });
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `graphmind-review-audit-${report.generatedAt.slice(0, 10)}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <section className="relationship-review" aria-label={t("review.region")}>
      <div className="review-heading-row">
        <h2>{t("review.heading")}</h2>
        {suggestions.length > 0 ? (
          <button className="review-export-button" onClick={exportAuditReport} type="button">
            {t("review.exportReport")}
          </button>
        ) : null}
      </div>
      {governanceSummary ? (
        <div className="relationship-governance-summary" aria-label={t("review.governance")}>
          <div>
            <strong>{t("review.governance")}</strong>
            <span>{t("review.totalSuggestions", { count: governanceSummary.total_suggestion_count })}</span>
            <span>{t("review.duplicateSuggestions", { count: governanceSummary.duplicate_suggestion_count })}</span>
            <span>{t("review.pendingSuggestions", { count: governanceSummary.pending_suggestion_count })}</span>
          </div>
          <button
            disabled={governanceSummary.duplicate_suggestion_count === 0}
            onClick={onCleanupDuplicates}
            type="button"
          >
            {t("review.cleanupDuplicates")}
          </button>
        </div>
      ) : null}
      {suggestions.length === 0 ? (
        <p>{t("review.empty")}</p>
      ) : (
        <>
          <ReviewOperationsSummaryPanel summary={operationsSummary} />
          {reviewAnalytics ? (
            <ReviewAnalyticsPanel
              analytics={reviewAnalytics}
              snapshotCleanupEvents={reviewAnalyticsSnapshotCleanupEvents}
              snapshotSummary={reviewAnalyticsSnapshotSummary}
              trend={reviewAnalyticsTrend}
              trendDays={reviewAnalyticsTrendDays}
              onCleanupAnalyticsSnapshots={onCleanupAnalyticsSnapshots}
              onTrendDaysChange={onReviewAnalyticsTrendDaysChange}
            />
          ) : null}
          <label className="reviewer-attribution">
            <span>{t("review.reviewer")}</span>
            <input
              autoComplete="name"
              onChange={(event) => {
                setLocalReviewerName(event.target.value);
                onReviewerNameChange(event.target.value);
              }}
              placeholder={t("review.reviewerPlaceholder")}
              type="text"
              value={activeReviewerName}
            />
          </label>
          <div className="review-filter-bar" aria-label={t("review.filters")}>
            {reviewFilters.map((filter) => (
              <button
                aria-pressed={activeFilter === filter.value}
                className={[
                  activeFilter === filter.value ? "active" : "",
                  shortcutFocusActive && filter.value === activeFilter ? "is-shortcut-focused" : ""
                ].filter(Boolean).join(" ")}
                disabled={filter.value === "duplicates" && filterCounts.duplicates === 0}
                key={filter.value}
                onClick={() => handleFilterChange(filter.value)}
                type="button"
              >
                {t(filter.labelKey)} {filterCounts[filter.value]}
              </button>
            ))}
          </div>
          {filteredSuggestions.length === 0 ? (
            <p className="review-filter-empty">{t("review.filteredEmpty")}</p>
          ) : (
            <div className="review-card-list">
              {filteredSuggestions.map((suggestion) => {
                const isExpanded = expandedReasonIds.includes(suggestion.id);
                const qualityReasons = suggestion.quality_reasons ?? [];
                const isShortcutFocused =
                  shortcutFocusActive && suggestion.id === filteredSuggestions[0]?.id;

                return (
                  <article
                    className={`review-card${isShortcutFocused ? " is-shortcut-focused" : ""}`}
                    key={suggestion.id}
                  >
                    <div className="review-card-header">
                      <span className="relationship-type">
                        {getRelationshipLabel(suggestion.relationship_type, language)}
                      </span>
                      <span className="confidence-score">{formatConfidence(suggestion.confidence)}</span>
                    </div>
                    <div className="relationship-quality-meta">
                      <span>{formatQualityLabel(suggestion.quality_label, t)}</span>
                      <span>{formatPriorityLabel(suggestion.review_priority, t)}</span>
                      {qualityReasons.length > 0 ? (
                        <button
                          aria-expanded={isExpanded}
                          className="quality-reason-toggle"
                          onClick={() => toggleQualityReasons(suggestion.id)}
                          type="button"
                        >
                          {isExpanded ? t("review.hideQualityReasons") : t("review.showQualityReasons")}
                        </button>
                      ) : null}
                    </div>
                    {isExpanded && qualityReasons.length > 0 ? (
                      <ul className="quality-reason-list">
                        {qualityReasons.map((reason) => (
                          <li key={reason}>{formatQualityReason(reason, t)}</li>
                        ))}
                      </ul>
                    ) : null}
                    {shouldShowLowConfidenceRecovery(suggestion) ? (
                      <LowConfidenceRecoveryPlaybook />
                    ) : null}
                    <div className="field-pair">
                      <strong>{suggestion.source_label}</strong>
                      <span>{t("review.to")}</span>
                      <strong>{suggestion.target_label ?? t("review.derivedDimension")}</strong>
                    </div>
                    <p>
                      {formatEvidenceSummary(
                        suggestion.source_label,
                        suggestion.target_label,
                        suggestion.evidence_payload,
                        suggestion.evidence_summary,
                        language
                      )}
                    </p>
                    <div className="suggestion-meta">
                      <span>{formatStatusLabel(suggestion.decision_status, language)}</span>
                    </div>
                    <div className="review-actions">
                      {actions.map((action) => (
                        <button
                          aria-label={t(action.ariaLabel)}
                          key={action.status}
                          onClick={() => onReview(suggestion.id, action.status, activeReviewerName)}
                          type="button"
                        >
                          {t(action.label)}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ReviewAnalyticsPanel({
  analytics,
  snapshotCleanupEvents,
  snapshotSummary,
  onCleanupAnalyticsSnapshots,
  onTrendDaysChange,
  trend,
  trendDays
}: {
  analytics: ReviewAnalytics;
  snapshotCleanupEvents?: ReviewAnalyticsSnapshotCleanupEvent[];
  snapshotSummary?: ReviewAnalyticsSnapshotSummary | null;
  onCleanupAnalyticsSnapshots?: (retentionDays: number) => void;
  onTrendDaysChange?: (days: ReviewAnalyticsTrendDays) => void;
  trend?: ReviewAnalyticsTrend | null;
  trendDays?: ReviewAnalyticsTrendDays;
}) {
  const { t } = useI18n();
  const evidenceCoveragePercent = Math.round(
    analytics.evidence_coverage.coverage_ratio * 100
  );
  const agingBuckets = [
    { key: "0_1_days", label: t("review.analytics.bucket.0_1"), value: analytics.aging_buckets["0_1_days"] },
    { key: "2_3_days", label: t("review.analytics.bucket.2_3"), value: analytics.aging_buckets["2_3_days"] },
    { key: "4_7_days", label: t("review.analytics.bucket.4_7"), value: analytics.aging_buckets["4_7_days"] },
    { key: "8_plus_days", label: t("review.analytics.bucket.8_plus"), value: analytics.aging_buckets["8_plus_days"] }
  ];
  const maxBucketValue = Math.max(1, ...agingBuckets.map((bucket) => bucket.value));
  const oldestPendingAgeDays = analytics.sla.oldest_pending_age_days ?? 0;

  return (
    <section className="review-analytics-panel" aria-label={t("review.analytics.region")}>
      <div className="review-analytics-heading">
        <strong>{t("review.analytics.region")}</strong>
        <span className="review-analytics-window">
          <span>{t("review.analytics.window", { days: analytics.window_days })}</span>
          <span>{t("review.analytics.slaDays", { days: analytics.sla.pending_sla_days })}</span>
        </span>
      </div>
      {trend ? (
        <label className="review-analytics-trend-window">
          <span>{t("review.analytics.trendRange")}</span>
          <select
            aria-label={t("review.analytics.trendRange")}
            onChange={(event) => {
              const days = Number(event.target.value);
              if (isReviewAnalyticsTrendDays(days)) {
                onTrendDaysChange?.(days);
              }
            }}
            value={trendDays}
          >
            {reviewAnalyticsTrendDayOptions.map((days) => (
              <option key={days} value={days}>
                {t("review.analytics.trendRangeDays", { days })}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <dl className="review-analytics-metrics">
        <div>
          <dt>{t("review.ops.pending")}</dt>
          <dd>{t("review.ops.pendingCount", { count: analytics.sla.pending_total })}</dd>
        </div>
        <div>
          <dt>{t("review.ops.agedPending")}</dt>
          <dd>{t("review.analytics.overdue", { count: analytics.sla.overdue_pending_count })}</dd>
        </div>
        <div>
          <dt>{t("review.ops.oldestPendingAge")}</dt>
          <dd>{t("review.analytics.oldest", { days: oldestPendingAgeDays })}</dd>
        </div>
        <div>
          <dt>{t("review.ops.evidenceCoverage")}</dt>
          <dd>{t("review.analytics.evidenceCoverage", { percent: evidenceCoveragePercent })}</dd>
        </div>
      </dl>
      <p>
        {t("review.analytics.decisionTrend", {
          accepted: analytics.decision_trend.accepted,
          edited: analytics.decision_trend.edited,
          rejected: analytics.decision_trend.rejected
        })}
      </p>
      <div className="review-aging-bars" aria-label={t("review.analytics.agingBuckets")}>
        {agingBuckets.map((bucket) => (
          <div className="review-aging-bar" key={bucket.key}>
            <span>{bucket.label}</span>
            <div aria-hidden="true">
              <span style={{ inlineSize: `${(bucket.value / maxBucketValue) * 100}%` }} />
            </div>
            <strong>{bucket.value}</strong>
          </div>
        ))}
      </div>
      {trend && trend.snapshots.length > 1 ? (
        <>
          <ReviewAnalyticsTrendSummary trend={trend} />
          <ReviewAnalyticsTrendChart trend={trend} />
        </>
      ) : null}
      {snapshotSummary ? (
        <ReviewAnalyticsSnapshotGovernance
          onCleanupAnalyticsSnapshots={onCleanupAnalyticsSnapshots}
          snapshotCleanupEvents={snapshotCleanupEvents}
          summary={snapshotSummary}
        />
      ) : null}
    </section>
  );
}

function isReviewAnalyticsTrendDays(value: number): value is ReviewAnalyticsTrendDays {
  return value === 7 || value === 14 || value === 30 || value === 90;
}

function ReviewAnalyticsSnapshotGovernance({
  onCleanupAnalyticsSnapshots = () => undefined,
  snapshotCleanupEvents = [],
  summary
}: {
  onCleanupAnalyticsSnapshots?: (retentionDays: number) => void;
  snapshotCleanupEvents?: ReviewAnalyticsSnapshotCleanupEvent[];
  summary: ReviewAnalyticsSnapshotSummary;
}) {
  const { t } = useI18n();
  const [retentionDays, setRetentionDays] = useState(summary.retention_days);
  const [cleanupStatus, setCleanupStatus] = useState<string | null>(null);
  const [cleanupHistory, setCleanupHistory] = useState<AnalyticsSnapshotCleanupRecord[]>(() =>
    readAnalyticsSnapshotCleanupHistory()
  );

  useEffect(() => {
    setRetentionDays(summary.retention_days);
  }, [summary.retention_days]);

  const latestCleanupEvent = snapshotCleanupEvents[0] ?? null;
  const latestCleanup = cleanupHistory[0] ?? null;

  const handleCleanup = () => {
    onCleanupAnalyticsSnapshots(retentionDays);
    const record: AnalyticsSnapshotCleanupRecord = {
      cleanedAt: new Date().toISOString(),
      expiredSnapshotCount: summary.expired_snapshot_count,
      retentionDays,
      snapshotCount: summary.snapshot_count
    };
    const nextHistory = [record, ...cleanupHistory].slice(0, 5);
    setCleanupHistory(nextHistory);
    persistAnalyticsSnapshotCleanupHistory(nextHistory);
    setCleanupStatus(
      t("review.analytics.cleanupSuccess", {
        days: retentionDays,
        expired: summary.expired_snapshot_count
      })
    );
  };

  return (
    <div className="review-analytics-snapshot-governance">
      <span>{t("review.analytics.snapshots", { count: summary.snapshot_count })}</span>
      <span>{t("review.analytics.expiredSnapshots", { count: summary.expired_snapshot_count })}</span>
      <span>{t("review.analytics.retentionDays", { days: summary.retention_days })}</span>
      <label>
        <span>{t("review.analytics.retentionLabel")}</span>
        <select
          aria-label={t("review.analytics.retentionLabel")}
          onChange={(event) => setRetentionDays(Number(event.target.value))}
          value={retentionDays}
        >
          {analyticsSnapshotRetentionOptions.map((days) => (
            <option key={days} value={days}>
              {t("review.analytics.retentionDays", { days })}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={summary.expired_snapshot_count === 0}
        onClick={handleCleanup}
        type="button"
      >
        {t("review.analytics.cleanupSnapshots")}
      </button>
      {latestCleanupEvent ? (
        <span>
          {t("review.analytics.cleanupAuditHistory", {
            days: latestCleanupEvent.retention_days,
            removed: latestCleanupEvent.removed_count,
            remaining: latestCleanupEvent.remaining_count
          })}
        </span>
      ) : latestCleanup ? (
        <span>
          {t("review.analytics.cleanupHistory", {
            days: latestCleanup.retentionDays,
            expired: latestCleanup.expiredSnapshotCount,
            snapshots: latestCleanup.snapshotCount
          })}
        </span>
      ) : null}
      {cleanupStatus ? <span role="status">{cleanupStatus}</span> : null}
    </div>
  );
}

function readAnalyticsSnapshotCleanupHistory(): AnalyticsSnapshotCleanupRecord[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const stored = window.localStorage.getItem(analyticsSnapshotCleanupStorageKey);
    if (!stored) {
      return [];
    }
    const records = JSON.parse(stored);
    if (!Array.isArray(records)) {
      return [];
    }
    return records.filter(isAnalyticsSnapshotCleanupRecord).slice(0, 5);
  } catch {
    return [];
  }
}

function persistAnalyticsSnapshotCleanupHistory(records: AnalyticsSnapshotCleanupRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      analyticsSnapshotCleanupStorageKey,
      JSON.stringify(records.slice(0, 5))
    );
  } catch {
    // Local audit history is best-effort and should not block cleanup.
  }
}

function isAnalyticsSnapshotCleanupRecord(
  record: unknown
): record is AnalyticsSnapshotCleanupRecord {
  if (!record || typeof record !== "object") {
    return false;
  }
  const candidate = record as Partial<AnalyticsSnapshotCleanupRecord>;
  return (
    typeof candidate.cleanedAt === "string" &&
    typeof candidate.expiredSnapshotCount === "number" &&
    typeof candidate.retentionDays === "number" &&
    typeof candidate.snapshotCount === "number"
  );
}

function ReviewAnalyticsTrendSummary({ trend }: { trend: ReviewAnalyticsTrend }) {
  const { t } = useI18n();
  const firstSnapshot = trend.snapshots[0];
  const latestSnapshot = trend.snapshots[trend.snapshots.length - 1];
  const firstEvidencePercent = Math.round(
    firstSnapshot.analytics.evidence_coverage.coverage_ratio * 100
  );
  const latestEvidencePercent = Math.round(
    latestSnapshot.analytics.evidence_coverage.coverage_ratio * 100
  );

  return (
    <div className="review-analytics-trend-summary">
      <span>{t("review.analytics.snapshots", { count: trend.snapshots.length })}</span>
      <span>
        {t("review.analytics.overdueTrend", {
          from: firstSnapshot.analytics.sla.overdue_pending_count,
          to: latestSnapshot.analytics.sla.overdue_pending_count
        })}
      </span>
      <span>
        {t("review.analytics.evidenceTrend", {
          from: firstEvidencePercent,
          to: latestEvidencePercent
        })}
      </span>
    </div>
  );
}

function ReviewAnalyticsTrendChart({ trend }: { trend: ReviewAnalyticsTrend }) {
  const { t } = useI18n();
  const maxOverdue = Math.max(
    1,
    ...trend.snapshots.map((snapshot) => snapshot.analytics.sla.overdue_pending_count)
  );
  const maxOldest = Math.max(
    1,
    ...trend.snapshots.map((snapshot) => snapshot.analytics.sla.oldest_pending_age_days ?? 0)
  );

  return (
    <ul className="review-analytics-trend-chart" aria-label={t("review.analytics.trendChart")}>
      {trend.snapshots.map((snapshot) => {
        const overdueCount = snapshot.analytics.sla.overdue_pending_count;
        const oldestAge = snapshot.analytics.sla.oldest_pending_age_days ?? 0;
        const evidencePercent = Math.round(
          snapshot.analytics.evidence_coverage.coverage_ratio * 100
        );
        return (
          <li key={snapshot.snapshot_date}>
            <strong>{snapshot.snapshot_date}</strong>
            <div>
              <span>{t("review.analytics.overduePoint", { count: overdueCount })}</span>
              <span
                aria-hidden="true"
                className="review-analytics-trend-meter overdue"
                style={{ "--trend-size": `${(overdueCount / maxOverdue) * 100}%` } as CSSProperties}
              />
            </div>
            <div>
              <span>{t("review.analytics.oldest", { days: oldestAge })}</span>
              <span
                aria-hidden="true"
                className="review-analytics-trend-meter oldest"
                style={{ "--trend-size": `${(oldestAge / maxOldest) * 100}%` } as CSSProperties}
              />
            </div>
            <div>
              <span>{t("review.analytics.evidencePoint", { percent: evidencePercent })}</span>
              <span
                aria-hidden="true"
                className="review-analytics-trend-meter evidence"
                style={{ "--trend-size": `${evidencePercent}%` } as CSSProperties}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ReviewOperationsSummaryPanel({ summary }: { summary: ReviewOperationsSummary }) {
  const { t } = useI18n();

  return (
    <section className="review-operations-summary" aria-label={t("review.ops.region")}>
      <div className="review-operations-heading">
        <strong>{t("review.ops.region")}</strong>
        <span>
          {t("review.ops.statusDistribution", {
            accepted: summary.acceptedCount,
            rejected: summary.rejectedCount,
            edited: summary.editedCount
          })}
        </span>
      </div>
      <dl className="review-operations-metrics">
        <div>
          <dt>{t("review.ops.total")}</dt>
          <dd>{t("review.totalSuggestions", { count: summary.totalCount })}</dd>
        </div>
        <div>
          <dt>{t("review.ops.pending")}</dt>
          <dd>{t("review.ops.pendingCount", { count: summary.pendingCount })}</dd>
        </div>
        <div>
          <dt>{t("review.ops.highPriority")}</dt>
          <dd>{t("review.ops.highPriorityCount", { count: summary.highPriorityCount })}</dd>
        </div>
        <div>
          <dt>{t("review.ops.lowQualityPending")}</dt>
          <dd>{t("review.ops.lowQualityPendingCount", { count: summary.lowQualityPendingCount })}</dd>
        </div>
        <div>
          <dt>{t("review.ops.evidenceCoverage")}</dt>
          <dd>{t("review.ops.evidenceCoverageValue", { percent: summary.evidenceCoveragePercent })}</dd>
        </div>
        {summary.hasPendingAgeData ? (
          <>
            <div>
              <dt>{t("review.ops.agedPending")}</dt>
              <dd>{t("review.ops.agedPendingCount", { count: summary.agedPendingCount })}</dd>
            </div>
            <div>
              <dt>{t("review.ops.oldestPendingAge")}</dt>
              <dd>{t("review.ops.oldestPendingAgeValue", { days: summary.oldestPendingAgeDays ?? 0 })}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <p>{formatRecommendedAction(summary.recommendedAction, t)}</p>
    </section>
  );
}

function LowConfidenceRecoveryPlaybook() {
  const { t } = useI18n();
  const steps = [
    t("review.recovery.lowConfidence.coverage"),
    t("review.recovery.lowConfidence.edit"),
    t("review.recovery.lowConfidence.moreEvidence")
  ];

  return (
    <section
      aria-label={t("review.recovery.lowConfidence.region")}
      className="relationship-recovery-playbook"
    >
      <strong>{t("review.recovery.lowConfidence.region")}</strong>
      <ul>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
    </section>
  );
}

const reviewFilters: { value: ReviewFilter; labelKey: MessageKey }[] = [
  { value: "all", labelKey: "review.filter.all" },
  { value: "pending", labelKey: "review.filter.pending" },
  { value: "highPriority", labelKey: "review.filter.highPriority" },
  { value: "duplicates", labelKey: "review.filter.duplicates" }
];

function shouldShowLowConfidenceRecovery(suggestion: RelationshipSuggestion): boolean {
  return (
    suggestion.confidence < 0.6 ||
    suggestion.quality_label === "low" ||
    (suggestion.quality_reasons ?? []).includes("confidence:low")
  );
}

function formatRecommendedAction(
  action: ReviewRecommendedAction,
  t: ReturnType<typeof useI18n>["t"]
): string {
  const actionLabelKeys: Record<ReviewRecommendedAction, MessageKey> = {
    duplicates: "review.ops.action.duplicates",
    lowQuality: "review.ops.action.lowQuality",
    highPriority: "review.ops.action.highPriority",
    aging: "review.ops.action.aging",
    pending: "review.ops.action.pending",
    handoffReady: "review.ops.action.handoffReady"
  };
  return t(actionLabelKeys[action]);
}

function compareSuggestions(left: RelationshipSuggestion, right: RelationshipSuggestion): number {
  const statusDifference = reviewStatusRank(left.decision_status) - reviewStatusRank(right.decision_status);
  if (statusDifference !== 0) {
    return statusDifference;
  }

  const priorityDifference = priorityRank(left.review_priority) - priorityRank(right.review_priority);
  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const confidenceDifference = right.confidence - left.confidence;
  if (confidenceDifference !== 0) {
    return confidenceDifference;
  }

  return left.id - right.id;
}

function reviewStatusRank(status: RelationshipDecisionStatus): number {
  return status === "pending" ? 0 : 1;
}

function priorityRank(priority: RelationshipSuggestion["review_priority"]): number {
  if (priority === "high") {
    return 0;
  }
  if (priority === "medium") {
    return 1;
  }
  if (priority === "low") {
    return 2;
  }
  return 3;
}

function formatQualityReason(
  reason: string,
  t: ReturnType<typeof useI18n>["t"]
): string {
  const reasonLabelKeys: Partial<Record<string, MessageKey>> = {
    "confidence:high": "review.reason.confidence.high",
    "confidence:medium": "review.reason.confidence.medium",
    "confidence:low": "review.reason.confidence.low",
    high_source_match: "review.reason.highSourceMatch",
    high_row_coverage: "review.reason.highRowCoverage",
    compatible_field_types: "review.reason.compatibleFieldTypes",
    "strength:strong": "review.reason.strength.strong",
    "strength:likely": "review.reason.strength.likely",
    "strength:possible": "review.reason.strength.possible",
    "source:extracted_relationship": "review.reason.source.extractedRelationship",
    "source:document": "review.reason.source.document",
    "source:code": "review.reason.source.code",
    "source:log": "review.reason.source.log",
    "evidence:multi_source": "review.reason.evidence.multiSource",
    "evidence:multiple_refs": "review.reason.evidence.multipleRefs",
    "human_review:high": "review.reason.humanReview.high",
    "human_review:medium": "review.reason.humanReview.medium",
    "human_review:low": "review.reason.humanReview.low"
  };

  const reasonLabelKey = reasonLabelKeys[reason];
  if (reasonLabelKey) {
    return t(reasonLabelKey);
  }

  return reason.replace(/[:_]/g, " ");
}

function formatQualityLabel(
  quality: RelationshipSuggestion["quality_label"],
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (quality === "high") {
    return t("review.quality.high");
  }
  if (quality === "medium") {
    return t("review.quality.medium");
  }
  if (quality === "low") {
    return t("review.quality.low");
  }
  return t("review.quality.unknown");
}

function formatPriorityLabel(
  priority: RelationshipSuggestion["review_priority"],
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (priority === "high") {
    return t("review.priority.high");
  }
  if (priority === "medium") {
    return t("review.priority.medium");
  }
  if (priority === "low") {
    return t("review.priority.low");
  }
  return t("review.priority.unknown");
}
