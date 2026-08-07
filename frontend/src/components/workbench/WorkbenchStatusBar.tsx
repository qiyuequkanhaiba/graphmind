import { RotateCcw } from "lucide-react";
import type { GraphResponse, GraphSelection, RelationshipSuggestion } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { getPendingSuggestionCount, getSelectionSummary } from "./workbenchStats";

type Props = {
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
  selection: GraphSelection | null;
  highlightedGraphPath: number[];
  graphFocusMode?: boolean;
  leftPanelCollapsed: boolean;
  onResetLayout?: () => void;
  resetLayoutDisabled?: boolean;
  rightPanelCollapsed?: boolean;
};

export default function WorkbenchStatusBar({
  graph,
  suggestions,
  selection,
  highlightedGraphPath,
  graphFocusMode = false,
  leftPanelCollapsed,
  onResetLayout = () => undefined,
  resetLayoutDisabled,
  rightPanelCollapsed = false
}: Props) {
  const { language, t } = useI18n();
  const pending = getPendingSuggestionCount(suggestions);
  const resetDisabled =
    resetLayoutDisabled ?? (!graphFocusMode && !leftPanelCollapsed && !rightPanelCollapsed);

  return (
    <footer className="workbench-status-bar">
      <div className="workbench-status-metrics" aria-label={language === "en-US" ? "Graph metrics" : "图谱指标"}>
        <StatusMetric
          fullLabel={formatNodeCount(graph.nodes.length, language)}
          label={language === "en-US" ? "Nodes" : "节点"}
          value={graph.nodes.length}
        />
        <StatusMetric
          fullLabel={formatEdgeCount(graph.edges.length, language)}
          label={language === "en-US" ? "Edges" : "边"}
          value={graph.edges.length}
        />
        <StatusMetric
          fullLabel={formatPendingCount(pending, language)}
          label={language === "en-US" ? "Review" : "审核"}
          value={pending}
        />
        <StatusMetric
          fullLabel={formatAiPath(highlightedGraphPath.length, language)}
          label={language === "en-US" ? "Path" : "路径"}
          value={highlightedGraphPath.length}
        />
      </div>
      <div className="workbench-status-context" aria-label={language === "en-US" ? "Workbench state" : "工作台状态"}>
        <span>{getSelectionSummary(selection, language)}</span>
        {graphFocusMode ? <span>{t("graph.focusMode.status")}</span> : null}
        <span>{leftPanelCollapsed ? t("data.collapsed") : t("data.expanded")}</span>
        <span>{rightPanelCollapsed ? t("workbench.insightsCollapsed") : t("workbench.insightsExpanded")}</span>
      </div>
      <button
        aria-label={t("workbench.resetLayout")}
        className="workbench-status-action"
        disabled={resetDisabled}
        onClick={onResetLayout}
        title={t("workbench.resetLayout")}
        type="button"
      >
        <RotateCcw aria-hidden="true" size={14} />
        <span>{t("workbench.resetLayout")}</span>
      </button>
    </footer>
  );
}

function StatusMetric({
  fullLabel,
  label,
  value
}: {
  fullLabel: string;
  label: string;
  value: number;
}) {
  return (
    <span className="workbench-status-item" title={fullLabel}>
      <span className="workbench-status-full">{fullLabel}</span>
      <strong className="workbench-status-value">{value}</strong>
      <small className="workbench-status-label">{label}</small>
    </span>
  );
}

function formatNodeCount(count: number, language: string): string {
  return language === "en-US" ? `${count} ${count === 1 ? "node" : "nodes"}` : `${count} 个节点`;
}

function formatEdgeCount(count: number, language: string): string {
  return language === "en-US" ? `${count} ${count === 1 ? "edge" : "edges"}` : `${count} 条边`;
}

function formatPendingCount(count: number, language: string): string {
  return language === "en-US"
    ? `${count} pending ${count === 1 ? "review" : "reviews"}`
    : `${count} 条待审核`;
}

function formatAiPath(count: number, language: string): string {
  return language === "en-US"
    ? `AI path: ${count} ${count === 1 ? "item" : "items"}`
    : `AI 路径：${count} 个项目`;
}
