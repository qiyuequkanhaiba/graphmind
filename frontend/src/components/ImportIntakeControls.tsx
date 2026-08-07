import {
  CheckCircle2,
  Circle,
  FileCode2,
  FileText,
  Globe2,
  Link,
  RotateCcw,
  Sheet,
  UploadCloud
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { ImportDataStats } from "./ImportPanel";

type FirstGraphTemplateId = "spreadsheet" | "document" | "code" | "url";

type Props = {
  dataStats: ImportDataStats;
  focusUrlRequest?: number;
  onImport: (file: File) => void;
  onImportBatch: (files: File[]) => void;
  onImportSample: () => void;
  onImportUrl?: (url: string) => void;
  onResetData: () => void;
};

export default function ImportIntakeControls({
  dataStats,
  focusUrlRequest = 0,
  onImport,
  onImportBatch,
  onImportSample,
  onImportUrl = () => undefined,
  onResetData
}: Props) {
  const { t } = useI18n();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<FirstGraphTemplateId | null>(null);
  const wizardSteps = buildWizardSteps(dataStats, t);
  const firstGraphTemplates = buildFirstGraphTemplates({
    onImportSample,
    onOpenUpload: () => uploadInputRef.current?.click(),
    onOpenUrl: () => urlInputRef.current?.focus()
  });

  useEffect(() => {
    if (focusUrlRequest > 0) {
      urlInputRef.current?.focus();
    }
  }, [focusUrlRequest]);

  function submitUrlImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return;
    }
    onImportUrl(trimmedUrl);
    setUrl("");
  }

  return (
    <>
      <label className="upload-box">
        <UploadCloud aria-hidden="true" size={18} />
        <span>{t("import.uploadLabel")}</span>
        <small>{t("import.uploadHelp")}</small>
        <input
          aria-label={t("import.uploadLabel")}
          ref={uploadInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json,.md,.markdown,.txt,.log,.py,.ts,.tsx,.js,.jsx,.java,.go,.rs,.sql,.sh,.yaml,.yml,.toml,.docx,.pdf,.zip"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length > 1) {
              onImportBatch(files);
              event.target.value = "";
              return;
            }
            const file = files[0];
            if (file) {
              if (shouldUseBatchImport(file)) {
                onImportBatch([file]);
              } else {
                onImport(file);
              }
              event.target.value = "";
            }
          }}
        />
      </label>
      <form className="url-import-box" onSubmit={submitUrlImport}>
        <Link aria-hidden="true" size={17} />
        <input
          aria-label={t("import.urlInput")}
          placeholder={t("import.urlPlaceholder")}
          ref={urlInputRef}
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button disabled={!url.trim()} type="submit">
          {t("import.urlSubmit")}
        </button>
      </form>
      <ul className="first-graph-template-list" aria-label={t("import.template.label")}>
        {firstGraphTemplates.map((template) => {
          const TemplateIcon = template.icon;
          const title = t(template.titleKey);
          return (
            <li className="first-graph-template" key={template.id}>
              <button
                aria-label={t("import.template.apply", { label: title })}
                aria-pressed={selectedTemplateId === template.id}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  template.onApply();
                }}
                type="button"
              >
                <TemplateIcon aria-hidden="true" size={15} />
                <span>
                  <strong>{title}</strong>
                  <small>{t(template.bodyKey)}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selectedTemplateId ? (
        <FirstGraphTemplateGuidance
          template={firstGraphTemplates.find((template) => template.id === selectedTemplateId) ?? firstGraphTemplates[0]}
        />
      ) : null}
      <div className="import-action-row">
        <button
          aria-label={t("import.sampleData")}
          className="sample-data-button"
          onClick={onImportSample}
          title={t("import.sampleData")}
          type="button"
        >
          <Sheet aria-hidden="true" size={15} />
          <span>{t("import.sampleData")}</span>
        </button>
        <button
          aria-label={t("import.resetData")}
          className="reset-data-button"
          onClick={onResetData}
          title={t("import.resetData")}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={15} />
          <span>{t("import.resetData")}</span>
        </button>
      </div>
      <ol className="import-wizard" aria-label={t("import.wizardLabel")}>
        {wizardSteps.map((step, index) => {
          const StepIcon = step.status === "complete" ? CheckCircle2 : Circle;
          return (
            <li className={`import-wizard-step is-${step.status}`} key={step.label}>
              <span className="import-wizard-index" aria-hidden="true">
                {index + 1}
              </span>
              <StepIcon aria-hidden="true" size={15} />
              <span className="import-wizard-copy">
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </span>
              <span className="import-wizard-state">{step.stateLabel}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function FirstGraphTemplateGuidance({
  template
}: {
  template: ReturnType<typeof buildFirstGraphTemplates>[number];
}) {
  const { t } = useI18n();
  const TemplateIcon = template.icon;
  const title = t(template.titleKey);

  return (
    <section className="first-graph-template-guidance" aria-label={t("import.template.nextStep.region")}>
      <TemplateIcon aria-hidden="true" size={15} />
      <div className="first-graph-template-guidance-copy">
        <strong>{title}</strong>
        <p>{t(template.nextStepKey)}</p>
        <div className="first-graph-template-preset" aria-label={t("import.template.preset.region")}>
          <span>{t("import.template.preset.label")}</span>
          <p>{t(template.presetSummaryKey)}</p>
          <small>{t("import.template.preset.note")}</small>
        </div>
      </div>
      <button onClick={template.onApply} type="button">
        {t(template.actionKey)}
      </button>
    </section>
  );
}

function buildFirstGraphTemplates({
  onImportSample,
  onOpenUpload,
  onOpenUrl
}: {
  onImportSample: () => void;
  onOpenUpload: () => void;
  onOpenUrl: () => void;
}) {
  return [
    {
      actionKey: "import.template.action.sample" as const,
      bodyKey: "import.template.spreadsheet.body" as const,
      icon: Sheet,
      id: "spreadsheet" as const,
      nextStepKey: "import.template.spreadsheet.nextStep" as const,
      onApply: onImportSample,
      presetSummaryKey: "import.template.preset.rulesSummary" as const,
      titleKey: "import.template.spreadsheet.title" as const
    },
    {
      actionKey: "import.template.action.upload" as const,
      bodyKey: "import.template.document.body" as const,
      icon: FileText,
      id: "document" as const,
      nextStepKey: "import.template.document.nextStep" as const,
      onApply: onOpenUpload,
      presetSummaryKey: "import.template.preset.vectorSummary" as const,
      titleKey: "import.template.document.title" as const
    },
    {
      actionKey: "import.template.action.upload" as const,
      bodyKey: "import.template.code.body" as const,
      icon: FileCode2,
      id: "code" as const,
      nextStepKey: "import.template.code.nextStep" as const,
      onApply: onOpenUpload,
      presetSummaryKey: "import.template.preset.vectorSummary" as const,
      titleKey: "import.template.code.title" as const
    },
    {
      actionKey: "import.template.action.url" as const,
      bodyKey: "import.template.url.body" as const,
      icon: Globe2,
      id: "url" as const,
      nextStepKey: "import.template.url.nextStep" as const,
      onApply: onOpenUrl,
      presetSummaryKey: "import.template.preset.rulesSummary" as const,
      titleKey: "import.template.url.title" as const
    }
  ];
}

const BATCH_ONLY_EXTENSIONS = new Set([
  ".docx",
  ".go",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".markdown",
  ".md",
  ".pdf",
  ".py",
  ".rs",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
  ".zip"
]);

function shouldUseBatchImport(file: File) {
  const lowerName = file.name.toLowerCase();
  const dotIndex = lowerName.lastIndexOf(".");
  const extension = dotIndex >= 0 ? lowerName.slice(dotIndex) : "";
  return BATCH_ONLY_EXTENSIONS.has(extension);
}

function buildWizardSteps(dataStats: ImportDataStats, t: ReturnType<typeof useI18n>["t"]) {
  const hasTables = dataStats.tableCount > 0;
  const hasFields = dataStats.fieldCount > 0;
  const hasSuggestions = dataStats.suggestionCount > 0;
  const hasGraph = dataStats.graphNodeCount > 0 || dataStats.graphEdgeCount > 0;
  const hasPending = dataStats.pendingSuggestionCount > 0;

  return [
    {
      label: t("import.step.upload"),
      detail: hasTables
        ? t("import.stepDetail.uploadDone", { count: dataStats.tableCount })
        : t("import.stepDetail.uploadReady"),
      status: hasTables ? "complete" : "active",
      stateLabel: hasTables ? t("import.stepState.done") : t("import.stepState.active")
    },
    {
      label: t("import.step.profile"),
      detail: hasFields
        ? t("import.stepDetail.profileDone", { count: dataStats.fieldCount })
        : t("import.stepDetail.profileWaiting"),
      status: hasFields ? "complete" : hasTables ? "active" : "idle",
      stateLabel: hasFields
        ? t("import.stepState.done")
        : hasTables
          ? t("import.stepState.active")
          : t("import.stepState.waiting")
    },
    {
      label: t("import.step.relationships"),
      detail: hasSuggestions
        ? t("import.stepDetail.relationshipDone", { count: dataStats.suggestionCount })
        : t("import.stepDetail.relationshipWaiting"),
      status: hasSuggestions ? "complete" : hasFields ? "active" : "idle",
      stateLabel: hasSuggestions
        ? t("import.stepState.done")
        : hasFields
          ? t("import.stepState.active")
          : t("import.stepState.waiting")
    },
    {
      label: t("import.step.confirm"),
      detail: hasPending
        ? t("import.stepDetail.confirmPending", { count: dataStats.pendingSuggestionCount })
        : t("import.stepDetail.confirmReady"),
      status: hasSuggestions && !hasPending ? "complete" : hasPending ? "active" : "idle",
      stateLabel:
        hasSuggestions && !hasPending
          ? t("import.stepState.done")
          : hasPending
            ? t("import.stepState.active")
            : t("import.stepState.waiting")
    },
    {
      label: t("import.step.graph"),
      detail: hasGraph
        ? t("import.stepDetail.graphDone", {
            nodes: dataStats.graphNodeCount,
            edges: dataStats.graphEdgeCount
          })
        : t("import.stepDetail.graphWaiting"),
      status: hasGraph ? "complete" : hasSuggestions ? "active" : "idle",
      stateLabel: hasGraph
        ? t("import.stepState.done")
        : hasSuggestions
          ? t("import.stepState.active")
          : t("import.stepState.waiting")
    }
  ];
}
