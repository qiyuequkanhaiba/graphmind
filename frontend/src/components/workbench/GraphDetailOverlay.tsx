import type { GraphSelection } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import {
  aggregateCountFromRecord,
  evidenceRowsFromPayload,
  formatConfidence,
  formatStatusLabel,
  getNodeKindLabel,
  getRelationshipLabel
} from "../graph/graphSemantics";

type Props = {
  selection: GraphSelection | null;
  onClose: () => void;
};

export default function GraphDetailOverlay({ selection, onClose }: Props) {
  const { language, t } = useI18n();
  if (!selection) {
    return null;
  }

  if (selection.kind === "edge") {
    const sourceLabel = selection.sourceNode?.label ?? String(selection.edge.source_node_id);
    const targetLabel = selection.targetNode?.label ?? String(selection.edge.target_node_id);
    const aggregateCount = aggregateCountFromRecord(
      selection.edge.evidence_payload ?? selection.edge.metadata
    );
    const evidenceRows = evidenceRowsFromPayload(selection.edge.evidence_payload, language).filter(
      (row) => row.label !== (language === "en-US" ? "Aggregated relationships" : "聚合关系数")
    );
    const evidenceSummary =
      selection.edge.evidence_summary ?? t("evidence.structuralSummary");

    return (
      <aside className="graph-detail-overlay graph-detail-relationship" aria-label={t("evidence.graphDetail")}>
        <div className="graph-detail-header">
          <span>{t("evidence.relationshipHeading")}</span>
          <button aria-label={t("evidence.closeDetail")} onClick={onClose} type="button">
            ×
          </button>
        </div>
        <h3>{sourceLabel} → {targetLabel}</h3>
        <p>{evidenceSummary}</p>
        <dl>
          <div>
            <dt>{t("evidence.type")}</dt>
            <dd>{getRelationshipLabel(selection.edge.edge_type, language)}</dd>
          </div>
          <div>
            <dt>{t("evidence.confidence")}</dt>
            <dd>{formatConfidence(selection.edge.confidence)}</dd>
          </div>
          <div>
            <dt>{language === "en-US" ? "Status" : "状态"}</dt>
            <dd>{formatStatusLabel(selection.edge.status, language)}</dd>
          </div>
          <div>
            <dt>{t("evidence.ref")}</dt>
            <dd>{selection.edge.evidence_ref}</dd>
          </div>
          {aggregateCount > 1 ? (
            <div>
              <dt>{language === "en-US" ? "Aggregated relationships" : "聚合关系数"}</dt>
              <dd>{aggregateCount}</dd>
            </div>
          ) : null}
        </dl>
        {evidenceRows.length > 0 ? (
          <section className="graph-detail-evidence-metrics">
            <h4>{language === "en-US" ? "Evidence metrics" : "证据指标"}</h4>
            <div>
              {evidenceRows.slice(0, 6).map((row) => (
                <span key={row.label}>
                  <strong>{row.label}</strong>
                  <em>{row.value}</em>
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    );
  }

  const metadata = Object.entries(selection.node.metadata).slice(0, 4);

  return (
    <aside className="graph-detail-overlay" aria-label={t("evidence.graphDetail")}>
      <div className="graph-detail-header">
        <span>{getNodeKindLabel(selection.node.node_type, language)}</span>
        <button aria-label={t("evidence.closeDetail")} onClick={onClose} type="button">
          ×
        </button>
      </div>
      <h3>{selection.node.label}</h3>
      <p>{selection.node.source_ref}</p>
      <dl>
        {metadata.map(([key, value]) => (
          <div key={key}>
            <dt>{key.replace(/_/g, " ")}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
      <small>{t("evidence.adjacentCount", { count: selection.adjacentEdges.length })}</small>
    </aside>
  );
}
