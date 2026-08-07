import { CheckCircle2, KeyRound, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type { GraphNode } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";

type Props = {
  fields: GraphNode[];
};

type FieldProfileDraft = {
  confirmed: boolean;
  keyCandidate: boolean;
  keyScore: number;
  originalType: string;
  type: string;
};

const fieldTypeOptions = ["identifier", "text", "number", "date", "category", "metric", "boolean"];

export default function FieldMappingCard({ fields }: Props) {
  const { t } = useI18n();
  const [fieldDrafts, setFieldDrafts] = useState<Record<number, FieldProfileDraft>>(() =>
    Object.fromEntries(fields.map((field) => [field.id, buildFieldProfileDraft(field)]))
  );
  const confirmedFieldCount = fields.filter((field) => fieldDrafts[field.id]?.confirmed).length;

  if (fields.length === 0) {
    return null;
  }

  function updateFieldDraft(field: GraphNode, update: Partial<FieldProfileDraft>) {
    setFieldDrafts((current) => ({
      ...current,
      [field.id]: {
        ...(current[field.id] ?? buildFieldProfileDraft(field)),
        ...update
      }
    }));
  }

  return (
    <section className="field-mapping-card" aria-label={t("import.fieldMapping.heading")}>
      <div className="field-mapping-heading">
        <div>
          <h3>{t("import.fieldMapping.heading")}</h3>
          <p>{t("import.fieldMapping.confirmed", { confirmed: confirmedFieldCount, total: fields.length })}</p>
        </div>
        <SlidersHorizontal aria-hidden="true" size={15} />
      </div>
      <div className="field-profile-list">
        {fields.map((field) => {
          const draft = fieldDrafts[field.id] ?? buildFieldProfileDraft(field);
          return (
            <article className={`field-profile-row${draft.confirmed ? " is-confirmed" : ""}`} key={field.id}>
              <div className="field-profile-main">
                <strong>{field.label}</strong>
                <span>{inferTableLabel(field)}</span>
              </div>
              <div className="field-profile-controls">
                <label>
                  <span>{t("import.fieldMapping.type")}</span>
                  <select
                    aria-label={t("import.fieldMapping.typeFor", { label: field.label })}
                    onChange={(event) => updateFieldDraft(field, { type: event.target.value })}
                    value={draft.type}
                  >
                    {fieldTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  aria-label={
                    draft.keyCandidate
                      ? t("import.fieldMapping.unmarkKey", { label: field.label })
                      : t("import.fieldMapping.markKey", { label: field.label })
                  }
                  className={draft.keyCandidate ? "field-key-toggle active" : "field-key-toggle"}
                  onClick={() => updateFieldDraft(field, { keyCandidate: !draft.keyCandidate })}
                  type="button"
                >
                  <KeyRound aria-hidden="true" size={14} />
                  <span>
                    {draft.keyCandidate
                      ? t("import.fieldMapping.keyCandidate")
                      : t("import.fieldMapping.notKeyCandidate")}
                  </span>
                </button>
              </div>
              <div className="field-profile-meta">
                <span>{draft.originalType}</span>
                <span>{t("import.fieldMapping.keyScore", { score: draft.keyScore })}</span>
              </div>
              <button
                aria-label={t("import.fieldMapping.confirmField", { label: field.label })}
                className="field-confirm-button"
                onClick={() => updateFieldDraft(field, { confirmed: true })}
                type="button"
              >
                <CheckCircle2 aria-hidden="true" size={14} />
                <span>
                  {draft.confirmed ? t("import.fieldMapping.confirmedState") : t("import.fieldMapping.confirm")}
                </span>
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function buildFieldProfileDraft(field: GraphNode): FieldProfileDraft {
  const originalType = String(field.metadata.inferred_type ?? "text");
  const keyScore = Math.round(Number(field.metadata.key_candidate_score ?? 0) * 100);
  return {
    confirmed: false,
    keyCandidate: keyScore >= 80,
    keyScore,
    originalType,
    type: fieldTypeOptions.includes(originalType) ? originalType : "text"
  };
}

function inferTableLabel(field: GraphNode): string {
  if (field.label.includes(".")) {
    return field.label.split(".")[0];
  }
  if (field.source_ref.includes(".")) {
    return field.source_ref.split(".")[0];
  }
  return "Ungrouped";
}
