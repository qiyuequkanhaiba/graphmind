import type {
  GraphSelection,
  RelationshipDecisionStatus,
  RelationshipSuggestion
} from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import type {
  RelationshipPathActionHint,
  RelationshipPathSummary
} from "./graph/graphPathInsights";
import {
  evidenceRowsFromPayload,
  formatEvidenceSummary,
  formatStatusLabel,
  formatConfidence,
  getNodeKindLabel,
  getRelationshipLabel
} from "./graph/graphSemantics";

type ReviewStatus = Exclude<RelationshipDecisionStatus, "pending">;

type Props = {
  selection: GraphSelection | null;
  suggestions: RelationshipSuggestion[];
  highlightedGraphPath?: number[];
  evidenceRefSources?: Record<string, string>;
  pathSummary?: RelationshipPathSummary | null;
  onAskPathAction?: (hint: RelationshipPathActionHint) => void;
  onExplainSelection?: () => void;
  onOpenEvidenceRef?: (reference: string) => void;
  onReview: (suggestionId: number, decisionStatus: ReviewStatus, reviewedBy?: string) => void;
};

const reviewActions: {
  label: "evidence.accept" | "evidence.edit" | "evidence.reject";
  ariaLabel: "evidence.acceptRelationship" | "evidence.editRelationship" | "evidence.rejectRelationship";
  status: ReviewStatus;
}[] = [
  { label: "evidence.accept", ariaLabel: "evidence.acceptRelationship", status: "accepted" },
  { label: "evidence.edit", ariaLabel: "evidence.editRelationship", status: "edited" },
  { label: "evidence.reject", ariaLabel: "evidence.rejectRelationship", status: "rejected" }
];

export default function EvidenceInspector({
  selection,
  suggestions,
  highlightedGraphPath = [],
  evidenceRefSources = {},
  pathSummary = null,
  onAskPathAction = () => undefined,
  onExplainSelection = () => undefined,
  onOpenEvidenceRef = () => undefined,
  onReview
}: Props) {
  const { language, t } = useI18n();
  if (!selection) {
    return (
      <section className="evidence-inspector">
        <h2>{t("evidence.heading")}</h2>
        <p>{t("evidence.empty")}</p>
        {highlightedGraphPath.length > 0 ? (
          <small>{formatPathSummary(highlightedGraphPath.length, language)}</small>
        ) : null}
      </section>
    );
  }

  if (selection.kind === "node") {
    return (
      <section className="evidence-inspector">
        <h2>{t("evidence.nodeHeading")}</h2>
        <div className="inspector-kv">
          <span>{t("evidence.type")}</span>
          <strong>{getNodeKindLabel(selection.node.node_type, language)}</strong>
          <span>{t("evidence.label")}</span>
          <strong>{selection.node.label}</strong>
          <span>{t("evidence.source")}</span>
          <strong>{selection.node.source_ref}</strong>
        </div>
        <div className="metadata-table">
          {Object.entries(selection.node.metadata).map(([key, value]) => (
            <div key={key}>
              <span>{key.replace(/_/g, " ")}</span>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
        <p>{t("evidence.adjacentCount", { count: selection.adjacentEdges.length })}</p>
        <PathSummaryCard onAskPathAction={onAskPathAction} pathSummary={pathSummary} />
        <ExplainSelectionButton
          label={t("evidence.explainNode")}
          onExplainSelection={onExplainSelection}
        />
        {highlightedGraphPath.length > 0 ? (
          <small>{formatPathSummary(highlightedGraphPath.length, language)}</small>
        ) : null}
      </section>
    );
  }

  const suggestion = suggestions.find(
    (candidate) => candidate.id === selection.edge.created_from_suggestion_id
  );
  const payload = selection.edge.evidence_payload ?? suggestion?.evidence_payload ?? null;
  const evidenceRows = evidenceRowsFromPayload(payload, language);
  const evidenceRefs = relationshipEvidenceRefs(selection.edge.evidence_ref, selection.edge.evidence_refs);
  const evidenceSummary = formatEvidenceSummary(
    selection.sourceNode?.label ?? String(selection.edge.source_node_id),
    selection.targetNode?.label ?? null,
    payload,
    selection.edge.evidence_summary ?? suggestion?.evidence_summary ?? t("evidence.structuralSummary"),
    language
  );
  const canReview =
    selection.edge.created_from_suggestion_id !== null && selection.edge.status !== "auto_trusted";

  return (
    <section className="evidence-inspector">
      <div className="inspector-heading-row">
        <h2>{t("evidence.relationshipHeading")}</h2>
        <span className={`status-pill status-${String(selection.edge.status).replace(/_/g, "-")}`}>
          {formatStatusLabel(selection.edge.status, language)}
        </span>
      </div>
      <div className="inspector-kv">
        <span>{t("evidence.type")}</span>
        <strong>{getRelationshipLabel(selection.edge.edge_type, language)}</strong>
        <span>{t("evidence.confidence")}</span>
        <strong>{formatConfidence(selection.edge.confidence)}</strong>
        <span>{t("evidence.source")}</span>
        <strong>{selection.sourceNode?.label ?? selection.edge.source_node_id}</strong>
        <span>{t("evidence.target")}</span>
        <strong>{selection.targetNode?.label ?? selection.edge.target_node_id}</strong>
        <span>{t("evidence.ref")}</span>
        <strong>{selection.edge.evidence_ref}</strong>
        <span>{t("evidence.suggestion")}</span>
        <strong>{selection.edge.created_from_suggestion_id ?? t("evidence.notLinked")}</strong>
      </div>
      <p>{evidenceSummary}</p>
      {evidenceRows.length > 0 ? (
        <div className="metadata-table">
          {evidenceRows.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <EvidenceRefList
        evidenceRefSources={evidenceRefSources}
        references={evidenceRefs}
        onOpenEvidenceRef={onOpenEvidenceRef}
      />
      {highlightedGraphPath.length > 0 ? (
        <small>{formatPathSummary(highlightedGraphPath.length, language)}</small>
      ) : null}
      <PathSummaryCard onAskPathAction={onAskPathAction} pathSummary={pathSummary} />
      <ExplainSelectionButton
        label={t("evidence.explainRelationship")}
        onExplainSelection={onExplainSelection}
      />
      {canReview ? (
        <div className="review-actions inspector-actions">
          {reviewActions.map((action) => (
            <button
              aria-label={t(action.ariaLabel)}
              key={action.status}
              onClick={() =>
                onReview(selection.edge.created_from_suggestion_id as number, action.status)
              }
              type="button"
            >
              {t(action.label)}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EvidenceRefList({
  evidenceRefSources,
  references,
  onOpenEvidenceRef
}: {
  evidenceRefSources: Record<string, string>;
  references: string[];
  onOpenEvidenceRef: (reference: string) => void;
}) {
  const { t } = useI18n();
  if (references.length === 0) {
    return null;
  }
  return (
    <section className="evidence-ref-list" aria-label={t("evidence.refs")}>
      <h3>{t("evidence.refs")}</h3>
      <ul>
        {references.map((reference) => (
          <li key={reference}>
            {isSourceEvidenceRef(reference) ? (
              <button
                aria-label={t("evidence.openRef", { ref: reference })}
                onClick={() => onOpenEvidenceRef(reference)}
                type="button"
              >
                <EvidenceRefLabel reference={reference} title={evidenceRefSources[reference]} />
              </button>
            ) : (
              <span>
                <EvidenceRefLabel reference={reference} title={evidenceRefSources[reference]} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EvidenceRefLabel({ reference, title }: { reference: string; title?: string }) {
  if (!title || title === reference) {
    return <>{reference}</>;
  }
  return (
    <>
      <strong>{title}</strong>
      <small>{reference}</small>
    </>
  );
}

function PathSummaryCard({
  onAskPathAction,
  pathSummary
}: {
  onAskPathAction: (hint: RelationshipPathActionHint) => void;
  pathSummary: RelationshipPathSummary | null;
}) {
  const { language, t } = useI18n();
  if (!pathSummary) {
    return null;
  }
  const relationshipTypes = pathSummary.relationshipTypes
    .map((type) => getRelationshipLabel(type, language))
    .join("、");

  return (
    <section className="path-summary-card">
      <h3>{t("evidence.pathSummaryHeading")}</h3>
      <div className="path-summary-metrics">
        <span>{t("evidence.pathUpstream", { count: pathSummary.upstreamCount })}</span>
        <span>{t("evidence.pathDownstream", { count: pathSummary.downstreamCount })}</span>
        <span>{t("evidence.pathPending", { count: pathSummary.pendingCount })}</span>
        {relationshipTypes ? (
          <span>
            {t("evidence.pathRelationshipTypes", {
              types: relationshipTypes
            })}
          </span>
        ) : null}
        {pathSummary.confidence !== null ? (
          <span>{t("evidence.pathConfidence", { confidence: formatConfidence(pathSummary.confidence) })}</span>
        ) : null}
      </div>
      <PathDetailRows onAskPathAction={onAskPathAction} pathSummary={pathSummary} />
    </section>
  );
}

function PathDetailRows({
  onAskPathAction,
  pathSummary
}: {
  onAskPathAction: (hint: RelationshipPathActionHint) => void;
  pathSummary: RelationshipPathSummary;
}) {
  const { t } = useI18n();
  const nodePath = pathSummary.pathNodeLabels.join(" → ");
  const pathActionLabels = pathSummary.actionHints.map((hint) => ({
    hint,
    label: formatPathActionHint(hint, t)
  }));
  return (
    <div className="path-detail-rows">
      {nodePath ? (
        <div>
          <span>{t("evidence.pathNodes")}</span>
          <strong>{nodePath}</strong>
        </div>
      ) : null}
      {pathSummary.impactLabels.length > 0 ? (
        <div>
          <span>{t("evidence.pathImpact")}</span>
          <PathDetailValues values={pathSummary.impactLabels} />
        </div>
      ) : null}
      {pathSummary.evidenceRefs.length > 0 ? (
        <div>
          <span>{t("evidence.pathEvidenceRefs")}</span>
          <PathDetailValues values={pathSummary.evidenceRefs} />
        </div>
      ) : null}
      {pathSummary.actionHints.length > 0 ? (
        <div>
          <span>{t("evidence.pathActions")}</span>
          <strong className="path-detail-values path-action-buttons">
            {pathActionLabels.map((action) => (
              <button
                aria-label={t("evidence.askPathAction", { label: action.label })}
                key={action.hint}
                onClick={() => onAskPathAction(action.hint)}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </strong>
        </div>
      ) : null}
    </div>
  );
}

function PathDetailValues({ values }: { values: string[] }) {
  return (
    <strong className="path-detail-values">
      {values.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </strong>
  );
}

function formatPathActionHint(
  hint: RelationshipPathActionHint,
  t: (key: PathActionMessageKey) => string
): string {
  const keyByHint: Record<RelationshipPathActionHint, PathActionMessageKey> = {
    confirm_dimension: "evidence.pathAction.confirmDimension",
    inspect_schema: "evidence.pathAction.inspectSchema",
    review_pending: "evidence.pathAction.reviewPending",
    validate_foreign_key: "evidence.pathAction.validateForeignKey"
  };
  return t(keyByHint[hint]);
}

type PathActionMessageKey =
  | "evidence.pathAction.confirmDimension"
  | "evidence.pathAction.inspectSchema"
  | "evidence.pathAction.reviewPending"
  | "evidence.pathAction.validateForeignKey";

function ExplainSelectionButton({
  label,
  onExplainSelection
}: {
  label: string;
  onExplainSelection: () => void;
}) {
  return (
    <button className="explain-selection-button" onClick={onExplainSelection} type="button">
      {label}
    </button>
  );
}

function relationshipEvidenceRefs(evidenceRef: string, evidenceRefs: string[] | undefined): string[] {
  return uniqueValues([evidenceRef, ...(evidenceRefs ?? [])].filter(Boolean));
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isSourceEvidenceRef(reference: string): boolean {
  return !/^(suggestion|field|entity_resolution|entity-resolution):/i.test(reference);
}

function formatPathSummary(count: number, language: string): string {
  return language === "en-US"
    ? `AI answer path: ${count} graph ${count === 1 ? "item" : "items"}`
    : `AI 答案路径：${count} 个图谱项`;
}
