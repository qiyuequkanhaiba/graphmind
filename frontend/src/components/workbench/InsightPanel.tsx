import { ChevronsLeft, ChevronsRight, GitMerge, ListChecks, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  ChatSelectionContext,
  Citation,
  GraphAction,
  GraphActionActivity,
  GraphActionExecutionResult,
  GraphSelection,
  ProjectSettings,
  RetrievedEvidence,
  ReviewAnalytics,
  ReviewAnalyticsSnapshotCleanupEvent,
  ReviewAnalyticsSnapshotSummary,
  ReviewAnalyticsTrend,
  ReviewAnalyticsTrendDays,
  RelationshipDecisionStatus,
  RelationshipGovernanceSummary,
  RelationshipSuggestion
} from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { usePanelEntranceMotion } from "../../motion/useWorkbenchMotion";
import type {
  RelationshipPathActionHint,
  RelationshipPathSummary
} from "../graph/graphPathInsights";
import ChatPanel from "../ChatPanel";
import EvidenceInspector from "../EvidenceInspector";
import RelationshipReview, { type ReviewFilter } from "../RelationshipReview";
import { createRovingTabKeyDownHandler } from "./useRovingTabNavigation";
import type { GraphQualitySummary } from "./workbenchStats";

export type InsightPanelTab = "evidence" | "review" | "ai";

export type QualityPreviewSelection = {
  id: number;
  kind: "node";
} | {
  id: number;
  kind: "edge";
} | {
  id: number;
  kind: "review";
  sourceNodeId: number;
  targetNodeId: number;
};

const insightTabOptions = [
  { value: "evidence" },
  { value: "review" },
  { value: "ai" }
] as const;

type Props = {
  selection: GraphSelection | null;
  suggestions: RelationshipSuggestion[];
  evidenceRefSources?: Record<string, string>;
  graphQualitySummary?: GraphQualitySummary | null;
  governanceSummary?: RelationshipGovernanceSummary | null;
  reviewAnalytics?: ReviewAnalytics | null;
  reviewAnalyticsTrend?: ReviewAnalyticsTrend | null;
  reviewAnalyticsTrendDays?: ReviewAnalyticsTrendDays;
  reviewerName?: string;
  reviewAnalyticsSnapshotSummary?: ReviewAnalyticsSnapshotSummary | null;
  reviewAnalyticsSnapshotCleanupEvents?: ReviewAnalyticsSnapshotCleanupEvent[];
  reviewInitialFilter?: ReviewFilter;
  reviewShortcutFocusKey?: number;
  highlightedGraphPath: number[];
  pathSummary?: RelationshipPathSummary | null;
  messages: ChatMessage[];
  settings: ProjectSettings;
  onReview: (
    suggestionId: number,
    decisionStatus: Exclude<RelationshipDecisionStatus, "pending">,
    reviewedBy?: string
  ) => void;
  onCleanupDuplicateRelationships?: () => void;
  onCleanupAnalyticsSnapshots?: (retentionDays: number) => void;
  onReviewAnalyticsTrendDaysChange?: (days: ReviewAnalyticsTrendDays) => void;
  onReviewerNameChange?: (reviewerName: string) => void;
  onAsk: (question: string, selection?: ChatSelectionContext | null) => Promise<void>;
  onCitationClick?: (citation: Citation) => void;
  onEvidenceClick?: (evidence: RetrievedEvidence) => void;
  onOpenEvidenceRef?: (reference: string) => void;
  onGraphAction?: (action: GraphAction) => void;
  onClearGraphAction?: (action: GraphAction) => void;
  graphActionStates?: Record<string, GraphActionExecutionResult>;
  graphActionActivities?: GraphActionActivity[];
  onClearGraphActionActivities?: () => void;
  onExplainSelection?: () => void;
  onAskPathAction?: (hint: RelationshipPathActionHint) => void;
  onSettingsChange?: (settings: ProjectSettings) => Promise<void>;
  onBuildVectorIndex?: () => void;
  onSelectQualityPreview?: (selection: QualityPreviewSelection) => void;
  onOpenQualityReviewFilter?: (filter: Extract<ReviewFilter, "pending" | "duplicates">) => void;
  activeTab?: InsightPanelTab;
  onTabChange?: (tab: InsightPanelTab) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

export default function InsightPanel({
  selection,
  suggestions,
  evidenceRefSources = {},
  graphQualitySummary = null,
  governanceSummary = null,
  reviewAnalytics = null,
  reviewAnalyticsTrend = null,
  reviewAnalyticsTrendDays = 14,
  reviewerName = "",
  reviewAnalyticsSnapshotSummary = null,
  reviewAnalyticsSnapshotCleanupEvents = [],
  reviewInitialFilter = "all",
  reviewShortcutFocusKey = 0,
  highlightedGraphPath,
  pathSummary = null,
  messages,
  settings,
  onReview,
  onCleanupDuplicateRelationships = () => undefined,
  onCleanupAnalyticsSnapshots = () => undefined,
  onReviewAnalyticsTrendDaysChange = () => undefined,
  onReviewerNameChange = () => undefined,
  onAsk,
  onCitationClick = () => undefined,
  onEvidenceClick = () => undefined,
  onOpenEvidenceRef = () => undefined,
  onGraphAction = () => undefined,
  onClearGraphAction = () => undefined,
  graphActionStates = {},
  graphActionActivities = [],
  onClearGraphActionActivities = () => undefined,
  onExplainSelection = () => undefined,
  onAskPathAction = () => undefined,
  onSettingsChange = async () => undefined,
  onBuildVectorIndex = () => undefined,
  onSelectQualityPreview = () => undefined,
  onOpenQualityReviewFilter = () => undefined,
  activeTab = "evidence",
  onTabChange = () => undefined,
  collapsed = false,
  onToggleCollapsed = () => undefined
}: Props) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLElement>(null);
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>(() =>
    readStoredQualityFilter()
  );
  const handleInsightTabKeyDown = createRovingTabKeyDownHandler({
    activeValue: activeTab,
    onChange: onTabChange,
    options: insightTabOptions
  });
  usePanelEntranceMotion(panelRef, activeTab);

  useEffect(() => {
    persistQualityFilter(qualityFilter);
  }, [qualityFilter]);

  if (collapsed) {
    return (
      <aside className="insight-panel is-collapsed" aria-label={t("workbench.insights")}>
        <button
          aria-label={t("workbench.expandInsights")}
          className="insight-expand-button"
          onClick={onToggleCollapsed}
          title={t("workbench.expandInsights")}
          type="button"
        >
          <ChevronsLeft aria-hidden="true" size={16} />
          <span>{t("workbench.insightRailLabel")}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="insight-panel" aria-label={t("workbench.insights")} ref={panelRef}>
      <div className="panel-heading compact">
        <h2>{t("workbench.insights")}</h2>
        <button
          aria-label={t("workbench.collapseInsights")}
          className="panel-icon-button"
          onClick={onToggleCollapsed}
          title={t("workbench.collapseInsights")}
          type="button"
        >
          <ChevronsRight aria-hidden="true" size={15} />
          <span>{t("data.collapse")}</span>
        </button>
      </div>
      <div className="insight-tabs" role="tablist" aria-label={t("workbench.insightTools")}>
        <TabButton
          activeTab={activeTab}
          label={t("workbench.tab.evidence")}
          onKeyDown={handleInsightTabKeyDown}
          onTabChange={onTabChange}
          tab="evidence"
        />
        <TabButton
          activeTab={activeTab}
          label={t("workbench.tab.review")}
          onKeyDown={handleInsightTabKeyDown}
          onTabChange={onTabChange}
          tab="review"
        />
        <TabButton
          activeTab={activeTab}
          label={t("workbench.tab.ai")}
          onKeyDown={handleInsightTabKeyDown}
          onTabChange={onTabChange}
          tab="ai"
        />
      </div>
      <div className="insight-tab-panel">
        {activeTab === "evidence" ? (
          <EvidenceInspector
            evidenceRefSources={evidenceRefSources}
            highlightedGraphPath={highlightedGraphPath}
            onAskPathAction={onAskPathAction}
            onExplainSelection={onExplainSelection}
            onOpenEvidenceRef={onOpenEvidenceRef}
            onReview={onReview}
            pathSummary={pathSummary}
            selection={selection}
            suggestions={suggestions}
          />
        ) : null}
        {activeTab === "review" ? (
          <div className="insight-review-stack">
            {graphQualitySummary ? (
              <GraphQualityOperations
                qualityFilter={qualityFilter}
                onCleanupDuplicateRelationships={onCleanupDuplicateRelationships}
                onOpenQualityReviewFilter={onOpenQualityReviewFilter}
                onSelectQualityPreview={onSelectQualityPreview}
                summary={graphQualitySummary}
                onQualityFilterChange={setQualityFilter}
              />
            ) : null}
            <RelationshipReview
              governanceSummary={governanceSummary}
              initialFilter={reviewInitialFilter}
              reviewAnalytics={reviewAnalytics}
              reviewAnalyticsSnapshotCleanupEvents={reviewAnalyticsSnapshotCleanupEvents}
              reviewAnalyticsSnapshotSummary={reviewAnalyticsSnapshotSummary}
              reviewAnalyticsTrend={reviewAnalyticsTrend}
              reviewAnalyticsTrendDays={reviewAnalyticsTrendDays}
              reviewerName={reviewerName}
              shortcutFocusKey={reviewShortcutFocusKey}
              onCleanupAnalyticsSnapshots={onCleanupAnalyticsSnapshots}
              onCleanupDuplicates={onCleanupDuplicateRelationships}
              onReviewAnalyticsTrendDaysChange={onReviewAnalyticsTrendDaysChange}
              onReviewerNameChange={onReviewerNameChange}
              onReview={onReview}
              suggestions={suggestions}
            />
          </div>
        ) : null}
        {activeTab === "ai" ? (
          <ChatPanel
            activeSelectionContext={selection ? selectionContext(selection) : null}
            activeSelectionLabel={selection ? selectionLabel(selection) : null}
            messages={messages}
            graphActionActivities={graphActionActivities}
            graphActionStates={graphActionStates}
            onAsk={onAsk}
            onClearGraphActionActivities={onClearGraphActionActivities}
            onClearGraphAction={onClearGraphAction}
            onCitationClick={onCitationClick}
            onEvidenceClick={onEvidenceClick}
            onGraphAction={onGraphAction}
            onBuildVectorIndex={onBuildVectorIndex}
            onSettingsChange={onSettingsChange}
            settings={settings}
          />
        ) : null}
      </div>
    </aside>
  );
}

type QualityFilter =
  | "all"
  | "isolated"
  | "weakEvidence"
  | "pending"
  | "duplicates"
  | "entityMatches"
  | "mappingReviews";

const qualityFilterStorageKey = "graphmind.qualityFilter";
const qualityFilterOptions: { labelKey: Parameters<ReturnType<typeof useI18n>["t"]>[0]; value: QualityFilter }[] = [
  { labelKey: "quality.filter.all", value: "all" },
  { labelKey: "quality.filter.isolated", value: "isolated" },
  { labelKey: "quality.filter.weakEvidence", value: "weakEvidence" },
  { labelKey: "quality.filter.pending", value: "pending" },
  { labelKey: "quality.filter.duplicates", value: "duplicates" },
  { labelKey: "quality.filter.entityMatches", value: "entityMatches" },
  { labelKey: "quality.filter.mappingReviews", value: "mappingReviews" }
];

function GraphQualityOperations({
  onCleanupDuplicateRelationships,
  onOpenQualityReviewFilter,
  onSelectQualityPreview,
  qualityFilter,
  summary,
  onQualityFilterChange
}: {
  onCleanupDuplicateRelationships: () => void;
  onOpenQualityReviewFilter: (filter: Extract<ReviewFilter, "pending" | "duplicates">) => void;
  onSelectQualityPreview: (selection: QualityPreviewSelection) => void;
  qualityFilter: QualityFilter;
  summary: GraphQualitySummary;
  onQualityFilterChange: (filter: QualityFilter) => void;
}) {
  const { t } = useI18n();
  const coveragePercent = Math.round(summary.evidenceCoverageRatio * 100);
  const insight = buildQualityFilterInsight(qualityFilter, summary, t);
  const metrics = [
    { detail: null, label: t("quality.metric.isolatedNodes"), value: summary.isolatedNodes },
    { detail: null, label: t("quality.metric.weakEvidence"), value: summary.weakEvidenceRelationships },
    { detail: null, label: t("quality.metric.pendingReviews"), value: summary.pendingReviews },
    { detail: null, label: t("quality.metric.duplicateGroups"), value: summary.duplicateGroups },
    { detail: null, label: t("quality.metric.entityMatches"), value: summary.unresolvedEntityMatches },
    { detail: null, label: t("quality.metric.mappingReviews"), value: summary.unresolvedMappingReviews },
    {
      detail: t("quality.metric.evidenceCoverageDetail", {
        covered: summary.evidenceCoveredRelationships,
        total: summary.relationshipCount
      }),
      label: t("quality.metric.evidenceCoverage"),
      value: `${coveragePercent}%`
    }
  ];

  return (
    <section className="graph-quality-operations" aria-label={t("quality.region")}>
      <div className="graph-quality-heading">
        <strong>{t("quality.region")}</strong>
        <label>
          <span>{t("quality.filter.label")}</span>
          <select
            aria-label={t("quality.filter.label")}
            value={qualityFilter}
            onChange={(event) => onQualityFilterChange(event.target.value as QualityFilter)}
          >
            {qualityFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <dl className="graph-quality-metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            {metric.detail ? <small>{metric.detail}</small> : null}
          </div>
        ))}
      </dl>
      <p className="graph-quality-filter-insight">{insight}</p>
      <QualityReviewShortcut
        onCleanupDuplicateRelationships={onCleanupDuplicateRelationships}
        onOpenQualityReviewFilter={onOpenQualityReviewFilter}
        qualityFilter={qualityFilter}
        summary={summary}
      />
      <QualityBulkRemediationGuard qualityFilter={qualityFilter} />
      <QualityDrilldownList
        onSelectQualityPreview={onSelectQualityPreview}
        qualityFilter={qualityFilter}
        summary={summary}
      />
    </section>
  );
}

function QualityReviewShortcut({
  onCleanupDuplicateRelationships,
  onOpenQualityReviewFilter,
  qualityFilter,
  summary
}: {
  onCleanupDuplicateRelationships: () => void;
  onOpenQualityReviewFilter: (filter: Extract<ReviewFilter, "pending" | "duplicates">) => void;
  qualityFilter: QualityFilter;
  summary: GraphQualitySummary;
}) {
  const { t } = useI18n();
  if (qualityFilter === "pending") {
    return (
      <button
        className="graph-quality-review-shortcut"
        onClick={() => onOpenQualityReviewFilter("pending")}
        type="button"
      >
        <ListChecks aria-hidden="true" size={14} />
        <span>{t("quality.action.openPendingReview")}</span>
      </button>
    );
  }
  if (qualityFilter === "duplicates") {
    return (
      <div className="graph-quality-action-row">
        <button
          className="graph-quality-review-shortcut"
          onClick={() => onOpenQualityReviewFilter("duplicates")}
          type="button"
        >
          <GitMerge aria-hidden="true" size={14} />
          <span>{t("quality.action.openDuplicateReview")}</span>
        </button>
        <button
          className="graph-quality-review-shortcut secondary"
          disabled={summary.duplicateGroups === 0}
          onClick={onCleanupDuplicateRelationships}
          type="button"
        >
          <GitMerge aria-hidden="true" size={14} />
          <span>{t("quality.action.cleanupDuplicates")}</span>
        </button>
      </div>
    );
  }
  return null;
}

function QualityBulkRemediationGuard({ qualityFilter }: { qualityFilter: QualityFilter }) {
  const { t } = useI18n();
  const guardKey = getBulkRemediationGuardKey(qualityFilter);
  if (!guardKey) {
    return null;
  }

  return (
    <div className="graph-quality-bulk-guard">
      <p>{t(guardKey)}</p>
      <button disabled type="button">
        <ShieldAlert aria-hidden="true" size={14} />
        <span>{t("quality.action.bulkLocked")}</span>
      </button>
    </div>
  );
}

function QualityDrilldownList({
  onSelectQualityPreview,
  qualityFilter,
  summary
}: {
  onSelectQualityPreview: (selection: QualityPreviewSelection) => void;
  qualityFilter: QualityFilter;
  summary: GraphQualitySummary;
}) {
  if (qualityFilter === "isolated" && summary.isolatedNodePreview.length > 0) {
    return (
      <ul className="graph-quality-drilldown-list">
        {summary.isolatedNodePreview.map((node) => (
          <li key={node.id}>
            <button
              aria-label={`定位孤立节点 ${node.label}`}
              onClick={() => onSelectQualityPreview({ id: node.id, kind: "node" })}
              type="button"
            >
              <strong>{node.label}</strong>
              <span>{node.sourceRef}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (qualityFilter === "weakEvidence" && summary.weakEvidenceRelationshipPreview.length > 0) {
    return (
      <ul className="graph-quality-drilldown-list">
        {summary.weakEvidenceRelationshipPreview.map((relationship) => (
          <li key={relationship.id}>
            <button
              aria-label={`定位弱证据关系 ${relationship.label}`}
              onClick={() => onSelectQualityPreview({ id: relationship.id, kind: "edge" })}
              type="button"
            >
              <strong>{relationship.label}</strong>
              <span>
                {relationship.relationshipType} · {Math.round(relationship.confidence * 100)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (qualityFilter === "entityMatches" && summary.entityMatchPreview.length > 0) {
    return (
      <ul className="graph-quality-drilldown-list">
        {summary.entityMatchPreview.map((review) => (
          <li key={review.id}>
            <button
              aria-label={`定位实体匹配 ${review.label}`}
              onClick={() =>
                onSelectQualityPreview({
                  id: review.id,
                  kind: "review",
                  sourceNodeId: review.sourceNodeId,
                  targetNodeId: review.targetNodeId
                })
              }
              type="button"
            >
              <strong>{review.label}</strong>
              <span>
                {review.reviewType} · {Math.round(review.confidence * 100)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  if (qualityFilter === "mappingReviews" && summary.mappingReviewPreview.length > 0) {
    return (
      <ul className="graph-quality-drilldown-list">
        {summary.mappingReviewPreview.map((review) => (
          <li key={review.id}>
            <button
              aria-label={`定位映射审核 ${review.label}`}
              onClick={() =>
                onSelectQualityPreview({
                  id: review.id,
                  kind: "review",
                  sourceNodeId: review.sourceNodeId,
                  targetNodeId: review.targetNodeId
                })
              }
              type="button"
            >
              <strong>{review.label}</strong>
              <span>
                {review.reviewType} · {Math.round(review.confidence * 100)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}

function getBulkRemediationGuardKey(
  qualityFilter: QualityFilter
): Parameters<ReturnType<typeof useI18n>["t"]>[0] | null {
  if (qualityFilter === "isolated") {
    return "quality.bulkGuard.isolated";
  }
  if (qualityFilter === "weakEvidence") {
    return "quality.bulkGuard.weakEvidence";
  }
  if (qualityFilter === "entityMatches") {
    return "quality.bulkGuard.entityMatches";
  }
  if (qualityFilter === "mappingReviews") {
    return "quality.bulkGuard.mappingReviews";
  }
  return null;
}

function buildQualityFilterInsight(
  qualityFilter: QualityFilter,
  summary: GraphQualitySummary,
  t: ReturnType<typeof useI18n>["t"]
): string {
  const values: Record<string, string | number> = {
    duplicates: summary.duplicateGroups,
    entityMatches: summary.unresolvedEntityMatches,
    isolated: summary.isolatedNodes,
    mappingReviews: summary.unresolvedMappingReviews,
    pending: summary.pendingReviews,
    weakEvidence: summary.weakEvidenceRelationships
  };
  const insightKeys: Record<QualityFilter, Parameters<typeof t>[0]> = {
    all: "quality.insight.all",
    duplicates: "quality.insight.duplicates",
    entityMatches: "quality.insight.entityMatches",
    isolated: "quality.insight.isolated",
    mappingReviews: "quality.insight.mappingReviews",
    pending: "quality.insight.pending",
    weakEvidence: "quality.insight.weakEvidence"
  };
  return t(insightKeys[qualityFilter], values);
}

function selectionContext(selection: GraphSelection): ChatSelectionContext {
  return selection.kind === "node"
    ? { kind: "node", id: selection.node.id }
    : { kind: "edge", id: selection.edge.id };
}

function readStoredQualityFilter(): QualityFilter {
  if (typeof window === "undefined") {
    return "all";
  }
  try {
    const stored = window.localStorage.getItem(qualityFilterStorageKey);
    return isQualityFilter(stored) ? stored : "all";
  } catch {
    return "all";
  }
}

function persistQualityFilter(filter: QualityFilter) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(qualityFilterStorageKey, filter);
  } catch {
    // Keep the UI usable when local storage is unavailable.
  }
}

function isQualityFilter(value: string | null): value is QualityFilter {
  return (
    value === "all" ||
    value === "isolated" ||
    value === "weakEvidence" ||
    value === "pending" ||
    value === "duplicates" ||
    value === "entityMatches" ||
    value === "mappingReviews"
  );
}

function selectionLabel(selection: GraphSelection): string {
  if (selection.kind === "node") {
    return selection.node.label;
  }
  const source = selection.sourceNode?.label ?? String(selection.edge.source_node_id);
  const target = selection.targetNode?.label ?? String(selection.edge.target_node_id);
  return `${source} → ${target}`;
}

function TabButton({
  activeTab,
  label,
  onKeyDown,
  onTabChange,
  tab
}: {
  activeTab: InsightPanelTab;
  label: string;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onTabChange: (tab: InsightPanelTab) => void;
  tab: InsightPanelTab;
}) {
  return (
    <button
      aria-selected={activeTab === tab}
      className={activeTab === tab ? "active" : ""}
      onClick={() => onTabChange(tab)}
      onKeyDown={onKeyDown}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}
