import { HelpCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { MessageKey } from "../i18n/messages";
import type { ImportTask } from "./importTasks";

type Props = {
  hasFailedImports: boolean;
  hasQualityWork: boolean;
  importTasks: ImportTask[];
  onOpenAISettings: () => void;
  onOpenFailedImports: () => void;
  onOpenPendingReview: () => void;
  onOpenUrlInput: () => void;
};

type HelpTopic = {
  bodyKey: MessageKey;
  id: string;
  keywords: string[];
  steps: MessageKey[];
  titleKey: MessageKey;
};

const helpTopics: HelpTopic[] = [
  {
    bodyKey: "import.help.failed.body",
    id: "failed-imports",
    keywords: ["失败", "failed", "retry", "重试", "error"],
    steps: [
      "import.help.failed.step.retry",
      "import.help.failed.step.fieldErrors",
      "import.help.failed.step.reupload"
    ],
    titleKey: "import.help.failed.title"
  },
  {
    bodyKey: "import.help.url.body",
    id: "url-safety",
    keywords: ["url", "allowlist", "denylist", "ssrf", "端口", "安全", "GRAPHMIND_URL_IMPORT_ALLOWLIST"],
    steps: [
      "import.help.url.step.allowlist",
      "import.help.url.step.protocol",
      "import.help.url.step.public"
    ],
    titleKey: "import.help.url.title"
  },
  {
    bodyKey: "import.help.template.body",
    id: "templates",
    keywords: ["模板", "template", "preset", "预设", "首图"],
    steps: [
      "import.help.template.step.source",
      "import.help.template.step.preset",
      "import.help.template.step.save"
    ],
    titleKey: "import.help.template.title"
  },
  {
    bodyKey: "import.help.quality.body",
    id: "quality",
    keywords: ["质量", "quality", "duplicate", "pending", "evidence", "重复", "证据"],
    steps: [
      "import.help.quality.step.pending",
      "import.help.quality.step.duplicates",
      "import.help.quality.step.bulk"
    ],
    titleKey: "import.help.quality.title"
  }
];

export default function ImportHelpPanel({
  hasFailedImports,
  hasQualityWork,
  importTasks,
  onOpenAISettings,
  onOpenFailedImports,
  onOpenPendingReview,
  onOpenUrlInput
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const activeTopicIds = useMemo(
    () => activeHelpTopicIds({ hasFailedImports, hasQualityWork, importTasks }),
    [hasFailedImports, hasQualityWork, importTasks]
  );
  const visibleTopics = useMemo(
    () => filterHelpTopics(query, activeTopicIds),
    [activeTopicIds, query]
  );

  return (
    <section className="import-help-panel" aria-label={t("import.help.region")}>
      <div className="import-help-heading">
        <HelpCircle aria-hidden="true" size={16} />
        <strong>{t("import.help.region")}</strong>
      </div>
      <label className="import-help-search">
        <Search aria-hidden="true" size={15} />
        <span>{t("import.help.search")}</span>
        <input
          aria-label={t("import.help.search")}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("import.help.searchPlaceholder")}
        />
      </label>
      {visibleTopics.length > 0 ? (
        <ul className="import-help-topic-list" aria-label={t("import.help.topicList")}>
          {visibleTopics.map((topic) => (
            <li className="import-help-topic" key={topic.id}>
              <strong>{t(topic.titleKey)}</strong>
              <p>{t(topic.bodyKey)}</p>
              <ol>
                {topic.steps.map((stepKey) => (
                  <li key={stepKey}>{t(stepKey)}</li>
                ))}
              </ol>
              <HelpTopicAction
                topicId={topic.id}
                onOpenAISettings={onOpenAISettings}
                onOpenFailedImports={onOpenFailedImports}
                onOpenPendingReview={onOpenPendingReview}
                onOpenUrlInput={onOpenUrlInput}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="import-help-empty">{t("import.help.empty")}</p>
      )}
    </section>
  );
}

function HelpTopicAction({
  topicId,
  onOpenAISettings,
  onOpenFailedImports,
  onOpenPendingReview,
  onOpenUrlInput
}: {
  topicId: string;
  onOpenAISettings: () => void;
  onOpenFailedImports: () => void;
  onOpenPendingReview: () => void;
  onOpenUrlInput: () => void;
}) {
  const { t } = useI18n();
  if (topicId === "failed-imports") {
    return (
      <button
        aria-label={t("import.help.failed.actionLabel")}
        className="import-help-action"
        onClick={onOpenFailedImports}
        type="button"
      >
        {t("import.help.failed.action")}
      </button>
    );
  }
  if (topicId === "quality") {
    return (
      <button
        aria-label={t("import.help.quality.actionLabel")}
        className="import-help-action"
        onClick={onOpenPendingReview}
        type="button"
      >
        {t("import.help.quality.action")}
      </button>
    );
  }
  if (topicId === "url-safety") {
    return (
      <button
        aria-label={t("import.help.url.actionLabel")}
        className="import-help-action"
        onClick={onOpenUrlInput}
        type="button"
      >
        {t("import.help.url.action")}
      </button>
    );
  }
  if (topicId === "templates") {
    return (
      <button
        aria-label={t("import.help.template.actionLabel")}
        className="import-help-action"
        onClick={onOpenAISettings}
        type="button"
      >
        {t("import.help.template.action")}
      </button>
    );
  }
  return null;
}

function activeHelpTopicIds({
  hasFailedImports,
  hasQualityWork,
  importTasks
}: {
  hasFailedImports: boolean;
  hasQualityWork: boolean;
  importTasks: ImportTask[];
}): Set<string> {
  const activeIds = new Set(["templates"]);
  if (hasFailedImports) {
    activeIds.add("failed-imports");
  }
  if (hasQualityWork) {
    activeIds.add("quality");
  }
  if (importTasks.some((task) => task.kind === "url" || hasUrlSafetySignal(task))) {
    activeIds.add("url-safety");
  }
  return activeIds;
}

function filterHelpTopics(query: string, activeTopicIds: Set<string>): HelpTopic[] {
  const normalizedQuery = query.trim().toLowerCase();
  return helpTopics.filter((topic) => {
    if (!activeTopicIds.has(topic.id) && normalizedQuery.length === 0) {
      return false;
    }
    if (normalizedQuery.length === 0) {
      return true;
    }
    return (
      topic.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery)) ||
      topic.id.includes(normalizedQuery)
    );
  });
}

function hasUrlSafetySignal(task: ImportTask): boolean {
  const safetyReason = task.diagnostics?.["safety_reason"];
  return (
    typeof safetyReason === "string" ||
    /allowlist|denylist|url|ssrf|port|private network/i.test(task.error ?? "") ||
    /URL_IMPORT/i.test(task.errorCode ?? "")
  );
}
