import { Network } from "lucide-react";
import type { SourceSummary } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";

type Props = {
  sourceSummaries: SourceSummary[];
};

export default function ImportSourceSummaryCard({ sourceSummaries }: Props) {
  const { t } = useI18n();

  if (sourceSummaries.length === 0) {
    return null;
  }

  return (
    <section className="import-source-summary-card" aria-label={t("import.sources.heading")}>
      <div className="import-summary-heading">
        <h3>{t("import.sources.heading")}</h3>
        <Network aria-hidden="true" size={15} />
      </div>
      <div className="import-summary-metrics">
        {sourceSummaries.map((source) => (
          <span className="import-summary-metric" key={source.source_kind}>
            {t("import.sources.metric", {
              kind: source.source_kind,
              count: source.count
            })}
          </span>
        ))}
      </div>
    </section>
  );
}
