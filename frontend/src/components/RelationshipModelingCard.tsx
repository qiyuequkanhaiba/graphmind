import { CheckCircle2, Link2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { RelationshipModelingReview, RelationshipSuggestion } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";

type Props = {
  candidates: RelationshipSuggestion[];
  onConfirmRelationship: (suggestionId: number, review: RelationshipModelingReview) => void;
};

type RelationshipModelingDraft = {
  confirmed: boolean;
  evidenceQuality: string;
  type: string;
};

type RelationshipModelingRules = {
  minimumConfidence: number;
  type: string;
};

type RelationshipMergeGroup = {
  key: string;
  source: string;
  target: string;
  candidates: RelationshipSuggestion[];
};

const relationshipTypeOptions = [
  { value: "foreign_key", labelKey: "import.relationshipModeling.type.foreign_key" },
  { value: "same_entity", labelKey: "import.relationshipModeling.type.same_entity" },
  { value: "derived_dimension", labelKey: "import.relationshipModeling.type.derived_dimension" },
  { value: "contains_field", labelKey: "import.relationshipModeling.type.contains_field" }
] as const;

const evidenceQualityOptions = [
  { value: "low", labelKey: "import.relationshipModeling.quality.low" },
  { value: "medium", labelKey: "import.relationshipModeling.quality.medium" },
  { value: "high", labelKey: "import.relationshipModeling.quality.high" }
] as const;

export default function RelationshipModelingCard({
  candidates,
  onConfirmRelationship
}: Props) {
  const { t } = useI18n();
  const [relationshipDrafts, setRelationshipDrafts] = useState<Record<number, RelationshipModelingDraft>>(() =>
    Object.fromEntries(candidates.map((candidate) => [candidate.id, buildRelationshipModelingDraft(candidate)]))
  );
  const [relationshipRules, setRelationshipRules] = useState<RelationshipModelingRules>({
    minimumConfidence: 0,
    type: "all"
  });
  const mergeGroups = useMemo(() => buildRelationshipMergeGroups(candidates), [candidates]);
  const visibleCandidates = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          candidate.confidence * 100 >= relationshipRules.minimumConfidence &&
          (relationshipRules.type === "all" || candidate.relationship_type === relationshipRules.type)
      ),
    [candidates, relationshipRules]
  );
  const confirmedRelationshipCount = candidates.filter(
    (candidate) => (relationshipDrafts[candidate.id] ?? buildRelationshipModelingDraft(candidate)).confirmed
  ).length;

  if (candidates.length === 0) {
    return null;
  }

  function updateRelationshipDraft(
    candidate: RelationshipSuggestion,
    update: Partial<RelationshipModelingDraft>
  ) {
    setRelationshipDrafts((current) => ({
      ...current,
      [candidate.id]: {
        ...(current[candidate.id] ?? buildRelationshipModelingDraft(candidate)),
        ...update
      }
    }));
  }

  function confirmRelationship(candidate: RelationshipSuggestion) {
    const draft = relationshipDrafts[candidate.id] ?? buildRelationshipModelingDraft(candidate);
    const originalDraft = buildRelationshipModelingDraft(candidate);
    const hasModelingChanges =
      draft.type !== candidate.relationship_type ||
      draft.evidenceQuality !== originalDraft.evidenceQuality;
    let decisionStatus: RelationshipModelingReview["decisionStatus"] = "accepted";
    if (hasModelingChanges) {
      decisionStatus = "edited";
    } else if (candidate.decision_status !== "pending") {
      decisionStatus = candidate.decision_status;
    }
    updateRelationshipDraft(candidate, { confirmed: true });
    onConfirmRelationship(candidate.id, {
      decisionStatus,
      evidenceQuality: draft.evidenceQuality,
      relationshipType: draft.type
    });
  }

  function confirmRelationshipMergeGroup(group: RelationshipMergeGroup) {
    const canonicalType = group.candidates[0]?.relationship_type ?? "foreign_key";
    const nextDrafts: Record<number, RelationshipModelingDraft> = {};
    for (const candidate of group.candidates) {
      const currentDraft = relationshipDrafts[candidate.id] ?? buildRelationshipModelingDraft(candidate);
      const nextDraft = {
        ...currentDraft,
        confirmed: true,
        type: canonicalType
      };
      nextDrafts[candidate.id] = nextDraft;
      const decisionStatus: RelationshipModelingReview["decisionStatus"] =
        candidate.relationship_type === canonicalType &&
        currentDraft.type === canonicalType &&
        candidate.decision_status === "pending"
          ? "accepted"
          : "edited";
      onConfirmRelationship(candidate.id, {
        decisionStatus,
        evidenceQuality: nextDraft.evidenceQuality,
        relationshipType: nextDraft.type
      });
    }
    setRelationshipDrafts((current) => ({
      ...current,
      ...nextDrafts
    }));
  }

  return (
    <section className="relationship-modeling-card" aria-label={t("import.relationshipModeling.heading")}>
      <div className="relationship-modeling-heading">
        <div>
          <h3>{t("import.relationshipModeling.heading")}</h3>
          <p>
            {t("import.relationshipModeling.modeled", {
              confirmed: confirmedRelationshipCount,
              total: candidates.length
            })}
          </p>
        </div>
        <Link2 aria-hidden="true" size={15} />
      </div>
      <div className="relationship-rule-panel">
        <div className="relationship-rule-summary">
          <span>
            {t("import.relationshipModeling.ruleMatched", {
              visible: visibleCandidates.length,
              total: candidates.length
            })}
          </span>
          <span>
            {t("import.relationshipModeling.mergeable", {
              count: mergeGroups.reduce((total, group) => total + group.candidates.length, 0)
            })}
          </span>
        </div>
        <div className="relationship-rule-controls">
          <label>
            <span>{t("import.relationshipModeling.confidenceRule")}</span>
            <input
              aria-label={t("import.relationshipModeling.confidenceRule")}
              max={100}
              min={0}
              onChange={(event) =>
                setRelationshipRules((current) => ({
                  ...current,
                  minimumConfidence: Number(event.target.value)
                }))
              }
              type="number"
              value={relationshipRules.minimumConfidence}
            />
          </label>
          <label>
            <span>{t("import.relationshipModeling.typeRule")}</span>
            <select
              aria-label={t("import.relationshipModeling.typeRule")}
              onChange={(event) =>
                setRelationshipRules((current) => ({
                  ...current,
                  type: event.target.value
                }))
              }
              value={relationshipRules.type}
            >
              <option value="all">{t("import.relationshipModeling.typeRule.all")}</option>
              {relationshipTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {mergeGroups.length > 0 ? (
          <div className="relationship-merge-list">
            {mergeGroups.map((group) => (
              <button
                aria-label={t("import.relationshipModeling.mergeGroup", {
                  source: group.source,
                  target: group.target,
                  count: group.candidates.length
                })}
                key={group.key}
                onClick={() => confirmRelationshipMergeGroup(group)}
                type="button"
              >
                <Link2 aria-hidden="true" size={13} />
                <span>
                  {group.source} {"->"} {group.target}
                </span>
                <strong>
                  {t("import.relationshipModeling.mergeCount", {
                    count: group.candidates.length
                  })}
                </strong>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="relationship-candidate-list">
        {visibleCandidates.map((candidate) => {
          const draft = relationshipDrafts[candidate.id] ?? buildRelationshipModelingDraft(candidate);
          const targetLabel = candidate.target_label ?? t("review.derivedDimension");
          return (
            <article
              className={`relationship-candidate-row${draft.confirmed ? " is-confirmed" : ""}`}
              key={candidate.id}
            >
              <div className="relationship-candidate-main">
                <strong>{candidate.source_label}</strong>
                <span>{targetLabel}</span>
              </div>
              <div className="relationship-candidate-meta">
                <span>
                  {t("import.relationshipModeling.confidence", {
                    confidence: Math.round(candidate.confidence * 100)
                  })}
                </span>
                <span>{candidate.decision_status}</span>
              </div>
              <p>{candidate.evidence_summary}</p>
              <div className="relationship-candidate-controls">
                <label>
                  <span>{t("import.relationshipModeling.type")}</span>
                  <select
                    aria-label={t("import.relationshipModeling.typeFor", {
                      source: candidate.source_label,
                      target: targetLabel
                    })}
                    onChange={(event) => updateRelationshipDraft(candidate, { type: event.target.value })}
                    value={draft.type}
                  >
                    {relationshipTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("import.relationshipModeling.quality")}</span>
                  <select
                    aria-label={t("import.relationshipModeling.qualityFor", {
                      source: candidate.source_label,
                      target: targetLabel
                    })}
                    onChange={(event) =>
                      updateRelationshipDraft(candidate, { evidenceQuality: event.target.value })
                    }
                    value={draft.evidenceQuality}
                  >
                    {evidenceQualityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                aria-label={t("import.relationshipModeling.confirmRelationship", {
                  source: candidate.source_label,
                  target: targetLabel
                })}
                className="relationship-confirm-button"
                onClick={() => confirmRelationship(candidate)}
                type="button"
              >
                <CheckCircle2 aria-hidden="true" size={14} />
                <span>
                  {draft.confirmed
                    ? t("import.relationshipModeling.confirmedState")
                    : t("import.relationshipModeling.confirm")}
                </span>
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function buildRelationshipModelingDraft(candidate: RelationshipSuggestion): RelationshipModelingDraft {
  return {
    confirmed: candidate.decision_status !== "pending",
    evidenceQuality: inferEvidenceQuality(candidate.confidence),
    type: relationshipTypeOptions.some((option) => option.value === candidate.relationship_type)
      ? candidate.relationship_type
      : "foreign_key"
  };
}

function buildRelationshipMergeGroups(candidates: RelationshipSuggestion[]): RelationshipMergeGroup[] {
  const grouped = new Map<string, RelationshipMergeGroup>();
  for (const candidate of candidates) {
    const target = candidate.target_label ?? "derived_dimension";
    const key = `${candidate.source_label}::${target}`;
    const group = grouped.get(key);
    if (group) {
      group.candidates.push(candidate);
    } else {
      grouped.set(key, {
        key,
        source: candidate.source_label,
        target,
        candidates: [candidate]
      });
    }
  }

  return [...grouped.values()]
    .filter((group) => group.candidates.length > 1)
    .map((group) => ({
      ...group,
      candidates: [...group.candidates].sort((a, b) => b.confidence - a.confidence)
    }));
}

function inferEvidenceQuality(confidence: number): string {
  if (confidence >= 0.85) {
    return "high";
  }
  if (confidence >= 0.65) {
    return "medium";
  }
  return "low";
}
