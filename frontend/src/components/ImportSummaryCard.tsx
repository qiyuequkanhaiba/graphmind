import { GitBranch, Network } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

export type ImportSummaryStats = {
  tableCount: number;
  fieldCount: number;
  suggestionCount: number;
  pendingSuggestionCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
};

type Props = {
  dataStats: ImportSummaryStats;
  dataSummary?: string | null;
  importStatus?: string | null;
};

export default function ImportSummaryCard({
  dataStats,
  dataSummary = null,
  importStatus = null
}: Props) {
  const { t } = useI18n();

  return (
    <section className="profile-summary-empty import-summary-card" aria-label={t("import.resultSummary")}>
      <div className="import-summary-heading">
        <h3>{t("import.detectedTables")}</h3>
        <Network aria-hidden="true" size={15} />
      </div>
      <div className="import-summary-metrics">
        <ImportMetric value={t("import.metric.tables", { count: dataStats.tableCount })} />
        <ImportMetric value={t("import.metric.fields", { count: dataStats.fieldCount })} />
        <ImportMetric value={t("import.metric.candidates", { count: dataStats.suggestionCount })} />
        <ImportMetric value={t("import.metric.pending", { count: dataStats.pendingSuggestionCount })} />
      </div>
      <p>{importStatus ?? dataSummary ?? t("import.emptyProfiles")}</p>
      {dataSummary && importStatus ? <small>{dataSummary}</small> : null}
      <div className="import-graph-footprint">
        <GitBranch aria-hidden="true" size={14} />
        <span>
          {t("import.metric.graph", {
            nodes: dataStats.graphNodeCount,
            edges: dataStats.graphEdgeCount
          })}
        </span>
      </div>
    </section>
  );
}

function ImportMetric({ value }: { value: string }) {
  return <span className="import-summary-metric">{value}</span>;
}
