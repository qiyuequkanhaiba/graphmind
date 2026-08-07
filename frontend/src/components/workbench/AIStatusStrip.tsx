import { DatabaseZap, Settings2 } from "lucide-react";
import type { ProjectSettings } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";

type Props = {
  settings: ProjectSettings;
  onOpenSettings: () => void;
  onBuildVectorIndex?: () => void;
};

export default function AIStatusStrip({
  settings,
  onOpenSettings,
  onBuildVectorIndex = () => undefined
}: Props) {
  const { t } = useI18n();
  const chatProvider = formatChatProvider(settings.ai.chat.provider);
  const vectorProvider = formatVectorProvider(settings.ai.vector.provider);
  const indexStatus = formatIndexStatus(settings.ai.vector.index_status);

  return (
    <div className="ai-status-strip" aria-label={t("ai.status.region")}>
      <div className="ai-status-summary">
        <div className="ai-status-card">
          <span>{t("ai.status.chat")}</span>
          <strong>{chatProvider}</strong>
          <small>{settings.ai.chat.model || t("ai.status.noModel")}</small>
        </div>
        <div className="ai-status-card">
          <span>{t("ai.status.vector")}</span>
          <strong>{vectorProvider}</strong>
          <small>{indexStatus}</small>
          {settings.ai.vector.document_count > 0 ? (
            <small>{t("ai.status.documentCount", { count: settings.ai.vector.document_count })}</small>
          ) : null}
        </div>
      </div>
      <div className="ai-status-actions" aria-label={t("ai.status.actions")}>
        <button aria-label={t("ai.index.build")} onClick={onBuildVectorIndex} title={t("ai.index.build")} type="button">
          <DatabaseZap aria-hidden="true" size={15} />
          <span>{t("ai.index.build")}</span>
        </button>
        <button aria-label={t("ai.settings.open")} onClick={onOpenSettings} title={t("ai.settings.open")} type="button">
          <Settings2 aria-hidden="true" size={15} />
          <span>{t("ai.settings.open")}</span>
        </button>
      </div>
    </div>
  );
}

export function formatChatProvider(provider: ProjectSettings["ai"]["chat"]["provider"]): string {
  const labels: Record<ProjectSettings["ai"]["chat"]["provider"], string> = {
    rules: "规则问答",
    "openai-compatible": "OpenAI Compatible",
    ollama: "Ollama",
    deepseek: "DeepSeek",
    openrouter: "OpenRouter"
  };
  return labels[provider];
}

export function formatVectorProvider(provider: ProjectSettings["ai"]["vector"]["provider"]): string {
  const labels: Record<ProjectSettings["ai"]["vector"]["provider"], string> = {
    none: "未配置",
    "openai-compatible": "OpenAI Compatible",
    ollama: "Ollama"
  };
  return labels[provider];
}

function formatIndexStatus(status: ProjectSettings["ai"]["vector"]["index_status"]): string {
  const labels: Record<ProjectSettings["ai"]["vector"]["index_status"], string> = {
    not_built: "未构建",
    pending: "待构建",
    building: "构建中",
    ready: "已就绪",
    failed: "失败"
  };
  return labels[status];
}
