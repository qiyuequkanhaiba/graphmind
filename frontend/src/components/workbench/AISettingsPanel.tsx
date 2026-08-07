import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { Download, Upload, X } from "lucide-react";
import type { AIChatProvider, ProjectSettings, VectorProvider } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { useDialogEntranceMotion } from "../../motion/useWorkbenchMotion";
import { normalizeProjectSettings } from "../../state/projectSettings";
import { useDialogFocusTrap } from "./useDialogFocusTrap";

type Props = {
  settings: ProjectSettings;
  onClose: () => void;
  onSave: (settings: ProjectSettings) => Promise<void>;
};

const chatProviders: AIChatProvider[] = [
  "rules",
  "openai-compatible",
  "ollama",
  "deepseek",
  "openrouter"
];

const vectorProviders: VectorProvider[] = ["none", "openai-compatible", "ollama"];
const reviewAnalyticsRetentionOptions = [30, 90, 180, 365] as const;

export type ProjectPresetExport = {
  schema: "graphmind.project-preset.v1";
  exportedAt: string;
  settings: {
    ai: {
      chat: {
        baseUrl: string;
        model: string;
        provider: AIChatProvider;
        temperature: number;
      };
      vector: {
        baseUrl: string;
        dimensions: number;
        model: string;
        provider: VectorProvider;
      };
    };
    reviewAnalytics: {
      autoCleanupEnabled: boolean;
      retentionDays: number;
    };
  };
};

export default function AISettingsPanel({ settings, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<ProjectSettings>(() =>
    normalizeProjectSettings(settings)
  );
  const [importedPreset, setImportedPreset] = useState<ProjectPresetExport | null>(null);
  const [presetImportError, setPresetImportError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const presetInputRef = useRef<HTMLInputElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const requestClose = () => {
    if (!isSaving) {
      onClose();
    }
  };
  const { dialogRef, handleDialogKeyDown } = useDialogFocusTrap<HTMLElement>(requestClose, {
    initialFocusRef: closeButtonRef
  });
  useDialogEntranceMotion(dialogRef);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(normalizeProjectSettings(draft));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("app.settingsFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  function exportProjectPreset() {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    if (typeof window.URL.createObjectURL !== "function") {
      return;
    }
    const preset = createProjectPresetExport(draft);
    const blob = new Blob([JSON.stringify(preset, null, 2)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `graphmind-project-preset-${preset.exportedAt.slice(0, 10)}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  async function importProjectPreset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const preset = parseProjectPresetExport(await readPresetFileText(file));
      setImportedPreset(preset);
      setPresetImportError(null);
    } catch {
      setImportedPreset(null);
      setPresetImportError(t("ai.settings.importPresetFailed"));
    }
  }

  function applyImportedPreset() {
    if (!importedPreset) {
      return;
    }
    setDraft((current) => mergePresetIntoDraft(current, importedPreset));
    setPresetImportError(null);
  }

  return (
    <div className="ai-settings-backdrop" role="presentation">
      <section
        aria-labelledby="ai-settings-title"
        aria-modal="true"
        className="ai-settings-panel"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <div>
            <h2 id="ai-settings-title">{t("ai.settings.title")}</h2>
            <p>{t("ai.settings.subtitle")}</p>
          </div>
          <button
            aria-label={t("ai.settings.close")}
            disabled={isSaving}
            onClick={requestClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </header>
        <form aria-busy={isSaving} onSubmit={handleSubmit}>
          <div className="ai-settings-fields">
            <fieldset>
              <legend>{t("ai.settings.chatLegend")}</legend>
              <label>
                {t("ai.settings.chatProvider")}
                <select
                  aria-label={t("ai.settings.chatProvider")}
                  value={draft.ai.chat.provider}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ai: {
                        ...current.ai,
                        chat: {
                          ...current.ai.chat,
                          provider: event.target.value as AIChatProvider
                        }
                      }
                    }))
                  }
                >
                  {chatProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {formatProviderOption(provider)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("ai.settings.chatModel")}
                <input
                  aria-label={t("ai.settings.chatModel")}
                  value={draft.ai.chat.model}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ai: {
                        ...current.ai,
                        chat: { ...current.ai.chat, model: event.target.value }
                      }
                    }))
                  }
                />
              </label>
              <label>
                {t("ai.settings.chatBaseUrl")}
                <input
                  aria-label={t("ai.settings.chatBaseUrl")}
                  value={draft.ai.chat.base_url}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ai: {
                        ...current.ai,
                        chat: { ...current.ai.chat, base_url: event.target.value }
                      }
                    }))
                  }
                />
              </label>
              <label>
                {t("ai.settings.apiKey")}
                <input
                  aria-label={t("ai.settings.apiKey")}
                  type="password"
                  value={draft.ai.chat.api_key}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ai: {
                        ...current.ai,
                        chat: { ...current.ai.chat, api_key: event.target.value }
                      }
                    }))
                  }
                />
              </label>
              <label>
                {t("ai.settings.temperature")}
                <input
                  aria-label={t("ai.settings.temperature")}
                  max="1"
                  min="0"
                  step="0.1"
                  type="number"
                  value={draft.ai.chat.temperature}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ai: {
                        ...current.ai,
                        chat: {
                          ...current.ai.chat,
                          temperature: Number(event.target.value)
                        }
                      }
                    }))
                  }
                />
              </label>
            </fieldset>
            <fieldset>
              <legend>{t("ai.settings.vectorLegend")}</legend>
              <label>
                {t("ai.settings.vectorProvider")}
                <select
                  aria-label={t("ai.settings.vectorProvider")}
                  value={draft.ai.vector.provider}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ai: {
                        ...current.ai,
                        vector: {
                          ...current.ai.vector,
                          provider: event.target.value as VectorProvider
                        }
                      }
                    }))
                  }
                >
                  {vectorProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {formatProviderOption(provider)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("ai.settings.vectorModel")}
                <input
                  aria-label={t("ai.settings.vectorModel")}
                  value={draft.ai.vector.model}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ai: {
                        ...current.ai,
                        vector: { ...current.ai.vector, model: event.target.value }
                      }
                    }))
                  }
                />
              </label>
              <label>
                {t("ai.settings.vectorBaseUrl")}
                <input
                  aria-label={t("ai.settings.vectorBaseUrl")}
                  value={draft.ai.vector.base_url}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ai: {
                        ...current.ai,
                        vector: { ...current.ai.vector, base_url: event.target.value }
                      }
                    }))
                  }
                />
              </label>
              <label>
                {t("ai.settings.vectorApiKey")}
                <input
                  aria-label={t("ai.settings.vectorApiKey")}
                  type="password"
                  value={draft.ai.vector.api_key}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ai: {
                        ...current.ai,
                        vector: { ...current.ai.vector, api_key: event.target.value }
                      }
                    }))
                  }
                />
              </label>
              <label>
                {t("ai.settings.dimensions")}
                <input
                  aria-label={t("ai.settings.dimensions")}
                  min="0"
                  type="number"
                  value={draft.ai.vector.dimensions}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ai: {
                        ...current.ai,
                        vector: {
                          ...current.ai.vector,
                          dimensions: Number(event.target.value)
                        }
                      }
                    }))
                  }
                />
              </label>
            </fieldset>
            <fieldset>
              <legend>{t("ai.settings.reviewAnalyticsLegend")}</legend>
              <label>
                {t("ai.settings.reviewRetention")}
                <select
                  aria-label={t("ai.settings.reviewRetention")}
                  value={draft.review_analytics.retention_days}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      review_analytics: {
                        ...current.review_analytics,
                        retention_days: Number(event.target.value)
                      }
                    }))
                  }
                >
                  {reviewAnalyticsRetentionOptions.map((days) => (
                    <option key={days} value={days}>
                      {t("review.analytics.retentionDays", { days })}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  aria-label={t("ai.settings.reviewAutoCleanup")}
                  checked={draft.review_analytics.auto_cleanup_enabled}
                  type="checkbox"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      review_analytics: {
                        ...current.review_analytics,
                        auto_cleanup_enabled: event.target.checked
                      }
                    }))
                  }
                />
                {t("ai.settings.reviewAutoCleanup")}
              </label>
              <p className="ai-settings-inline-note">
                {draft.review_analytics.auto_cleanup_enabled
                  ? t("ai.settings.reviewAutoCleanupEnabledNote")
                  : t("ai.settings.reviewAutoCleanupDisabledNote")}
              </p>
            </fieldset>
            <fieldset>
              <legend>{t("ai.settings.projectPresetLegend")}</legend>
              <div className="ai-settings-preset-actions">
                <button onClick={() => presetInputRef.current?.click()} type="button">
                  <Upload aria-hidden="true" size={14} />
                  <span>{t("ai.settings.importPreset")}</span>
                </button>
                <button onClick={exportProjectPreset} type="button">
                  <Download aria-hidden="true" size={14} />
                  <span>{t("ai.settings.exportPreset")}</span>
                </button>
              </div>
              <input
                accept="application/json,.json"
                aria-label={t("ai.settings.importPreset")}
                className="ai-settings-preset-input"
                onChange={importProjectPreset}
                ref={presetInputRef}
                type="file"
              />
              <p className="ai-settings-inline-note">{t("ai.settings.presetExportNote")}</p>
              {presetImportError ? (
                <p className="ai-settings-preset-error" role="alert">
                  {presetImportError}
                </p>
              ) : null}
              {importedPreset ? (
                <div className="ai-settings-preset-preview">
                  <strong>
                    {t("ai.settings.importPresetPreviewChat", {
                      model: importedPreset.settings.ai.chat.model,
                      provider: formatProviderOption(importedPreset.settings.ai.chat.provider)
                    })}
                  </strong>
                  <span>
                    {t("ai.settings.importPresetPreviewVector", {
                      dimensions: importedPreset.settings.ai.vector.dimensions,
                      model: importedPreset.settings.ai.vector.model,
                      provider: formatProviderOption(importedPreset.settings.ai.vector.provider)
                    })}
                  </span>
                  <span>
                    {t("ai.settings.importPresetPreviewReview", {
                      cleanup: importedPreset.settings.reviewAnalytics.autoCleanupEnabled
                        ? t("ai.settings.importPresetCleanupAuto")
                        : t("ai.settings.importPresetCleanupManual"),
                      days: importedPreset.settings.reviewAnalytics.retentionDays
                    })}
                  </span>
                  <button onClick={applyImportedPreset} type="button">
                    {t("ai.settings.applyPreset")}
                  </button>
                </div>
              ) : null}
            </fieldset>
          </div>
          <p className="ai-settings-note">{t("ai.settings.honestNote")}</p>
          {saveError ? (
            <p className="ai-settings-save-error" role="alert">
              {saveError}
            </p>
          ) : null}
          <footer>
            <button disabled={isSaving} onClick={requestClose} type="button">
              {t("ai.settings.cancel")}
            </button>
            <button disabled={isSaving} type="submit">
              {isSaving ? t("ai.settings.saving") : t("ai.settings.save")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function createProjectPresetExport(
  settings: ProjectSettings,
  exportedAt = new Date().toISOString()
): ProjectPresetExport {
  const normalized = normalizeProjectSettings(settings);
  return {
    schema: "graphmind.project-preset.v1",
    exportedAt,
    settings: {
      ai: {
        chat: {
          baseUrl: normalized.ai.chat.base_url,
          model: normalized.ai.chat.model,
          provider: normalized.ai.chat.provider,
          temperature: normalized.ai.chat.temperature
        },
        vector: {
          baseUrl: normalized.ai.vector.base_url,
          dimensions: normalized.ai.vector.dimensions,
          model: normalized.ai.vector.model,
          provider: normalized.ai.vector.provider
        }
      },
      reviewAnalytics: {
        autoCleanupEnabled: normalized.review_analytics.auto_cleanup_enabled,
        retentionDays: normalized.review_analytics.retention_days
      }
    }
  };
}

function mergePresetIntoDraft(
  draft: ProjectSettings,
  preset: ProjectPresetExport
): ProjectSettings {
  const normalized = normalizeProjectSettings(draft);
  return normalizeProjectSettings({
    ...normalized,
    ai: {
      chat: {
        ...normalized.ai.chat,
        base_url: preset.settings.ai.chat.baseUrl,
        model: preset.settings.ai.chat.model,
        provider: preset.settings.ai.chat.provider,
        temperature: preset.settings.ai.chat.temperature
      },
      vector: {
        ...normalized.ai.vector,
        base_url: preset.settings.ai.vector.baseUrl,
        dimensions: preset.settings.ai.vector.dimensions,
        model: preset.settings.ai.vector.model,
        provider: preset.settings.ai.vector.provider
      }
    },
    review_analytics: {
      ...normalized.review_analytics,
      auto_cleanup_enabled: preset.settings.reviewAnalytics.autoCleanupEnabled,
      retention_days: preset.settings.reviewAnalytics.retentionDays
    }
  });
}

export function parseProjectPresetExport(rawPreset: string): ProjectPresetExport {
  const parsed = JSON.parse(rawPreset) as unknown;
  if (!isProjectPresetExport(parsed)) {
    throw new Error("Invalid project preset");
  }
  return parsed;
}

function isProjectPresetExport(value: unknown): value is ProjectPresetExport {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ProjectPresetExport>;
  const presetSettings = candidate.settings;
  return (
    candidate.schema === "graphmind.project-preset.v1" &&
    typeof candidate.exportedAt === "string" &&
    Boolean(presetSettings) &&
    isChatProvider(presetSettings?.ai?.chat?.provider) &&
    typeof presetSettings?.ai?.chat?.model === "string" &&
    typeof presetSettings?.ai?.chat?.baseUrl === "string" &&
    typeof presetSettings?.ai?.chat?.temperature === "number" &&
    isVectorProvider(presetSettings?.ai?.vector?.provider) &&
    typeof presetSettings?.ai?.vector?.model === "string" &&
    typeof presetSettings?.ai?.vector?.baseUrl === "string" &&
    typeof presetSettings?.ai?.vector?.dimensions === "number" &&
    typeof presetSettings?.reviewAnalytics?.autoCleanupEnabled === "boolean" &&
    reviewAnalyticsRetentionOptions.includes(
      presetSettings?.reviewAnalytics
        ?.retentionDays as (typeof reviewAnalyticsRetentionOptions)[number]
    )
  );
}

function isChatProvider(value: unknown): value is AIChatProvider {
  return typeof value === "string" && chatProviders.includes(value as AIChatProvider);
}

function isVectorProvider(value: unknown): value is VectorProvider {
  return typeof value === "string" && vectorProviders.includes(value as VectorProvider);
}

function readPresetFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function formatProviderOption(provider: string): string {
  const labels: Record<string, string> = {
    rules: "规则问答",
    none: "未配置",
    "openai-compatible": "OpenAI Compatible",
    ollama: "Ollama",
    deepseek: "DeepSeek",
    openrouter: "OpenRouter"
  };
  return labels[provider] ?? provider;
}
