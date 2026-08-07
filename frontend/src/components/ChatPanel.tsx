import { type FormEvent, useState } from "react";
import type {
  ChatMessage,
  ChatSelectionContext,
  Citation,
  GraphAction,
  GraphActionActivity,
  GraphActionExecutionResult,
  GraphActionExecutionStatus,
  GraphActionTargetPreview,
  ProjectSettings,
  RetrievedEvidence
} from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { normalizeProjectSettings } from "../state/projectSettings";
import AISettingsPanel from "./workbench/AISettingsPanel";
import AIStatusStrip from "./workbench/AIStatusStrip";

type Props = {
  activeSelectionContext?: ChatSelectionContext | null;
  activeSelectionLabel?: string | null;
  messages: ChatMessage[];
  onAsk: (question: string) => Promise<void>;
  settings: ProjectSettings;
  onSettingsChange?: (settings: ProjectSettings) => Promise<void>;
  onBuildVectorIndex?: () => void;
  onCitationClick?: (citation: Citation) => void;
  onEvidenceClick?: (evidence: RetrievedEvidence) => void;
  onGraphAction?: (action: GraphAction) => void;
  onClearGraphAction?: (action: GraphAction) => void;
  graphActionStates?: Record<string, GraphActionExecutionResult>;
  graphActionActivities?: GraphActionActivity[];
  onClearGraphActionActivities?: () => void;
};

const suggestionKeys = [
  "chat.suggestionRelatedFields",
  "chat.suggestionPendingReviews",
  "chat.suggestionExplainGraph",
  "chat.suggestionExplainSelection"
] as const;

export default function ChatPanel({
  activeSelectionContext = null,
  activeSelectionLabel = null,
  messages,
  onAsk,
  settings,
  onSettingsChange = async () => undefined,
  onBuildVectorIndex = () => undefined,
  onCitationClick = () => undefined,
  onEvidenceClick = () => undefined,
  onGraphAction = () => undefined,
  onClearGraphAction = () => undefined,
  graphActionStates = {},
  graphActionActivities = [],
  onClearGraphActionActivities = () => undefined
}: Props) {
  const { language, t } = useI18n();
  const [question, setQuestion] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const normalizedSettings = normalizeProjectSettings(settings);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isAsking) {
      return;
    }
    setQuestion("");
    await submitQuestion(trimmed);
  }

  async function submitQuestion(nextQuestion: string) {
    if (isAsking) {
      return;
    }
    setIsAsking(true);
    try {
      await onAsk(nextQuestion);
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <section className="chat-panel">
      <div className="chat-panel-header">
        <div>
          <h2>{t("chat.heading")}</h2>
          {normalizedSettings.ai.chat.provider === "rules" ? (
            <p className="ai-mode-note">{t("ai.status.rulesNote")}</p>
          ) : (
            <p className="ai-mode-note">{t("ai.status.configuredNote")}</p>
          )}
        </div>
        <span className="chat-panel-body-label">{t("workbench.tab.ai")}</span>
      </div>
      <AIStatusStrip
        settings={normalizedSettings}
        onBuildVectorIndex={onBuildVectorIndex}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {graphActionActivities.length > 0 ? (
        <section className="chat-activity-timeline" aria-label={t("chat.activityHeading")}>
          <div className="chat-activity-heading">
            <h3>{t("chat.activityHeading")}</h3>
            <button
              aria-label={t("chat.clearActionActivities")}
              onClick={onClearGraphActionActivities}
              type="button"
            >
              {t("chat.activityClear")}
            </button>
          </div>
          <ol className="chat-activity-list">
            {graphActionActivities.slice(0, 8).map((activity) => (
              <li className={`chat-activity-item is-${activity.status}`} key={activity.id}>
                <div className="chat-activity-row">
                  <strong>{activity.label}</strong>
                  <span>{statusLabel(activity.status, t)}</span>
                </div>
                <p>{activity.message}</p>
                <small>{formatActionPreview(activity.targetPreview, t)}</small>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {activeSelectionContext && activeSelectionLabel ? (
        <section className="chat-context-strip" aria-label={t("chat.currentContext")}>
          <span>{t("chat.currentContext")}</span>
          <strong>
            {formatSelectionContext(activeSelectionContext, activeSelectionLabel, t)}
          </strong>
        </section>
      ) : null}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <strong>{t("chat.emptyTitle")}</strong>
            <p>{t("chat.emptyDescription")}</p>
            <div className="question-suggestions">
              {suggestionKeys.map((key) => {
                const suggestion = t(key);
                return (
                  <button
                    disabled={isAsking}
                    key={key}
                    onClick={() => void submitQuestion(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <article className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              {message.role === "assistant" ? (
                <span className="chat-message-kicker">{t("chat.traceableAnswer")}</span>
              ) : null}
              <p>{message.content}</p>
              {message.answer_confidence ? (
                <small>{t("chat.confidence", { confidence: message.answer_confidence })}</small>
              ) : null}
              {message.highlighted_graph_path && message.highlighted_graph_path.length > 0 ? (
                <small>
                  {formatPathSummary(message.highlighted_graph_path.length, language, t)}
                </small>
              ) : null}
              {message.graph_actions && message.graph_actions.length > 0 ? (
                <section className="chat-graph-actions" aria-label={t("chat.graphActions")}>
                  <h3>{t("chat.graphActions")}</h3>
                  <div className="chat-graph-action-list">
                    {message.graph_actions.map((action) => (
                      <GraphActionCard
                        action={action}
                        execution={graphActionStates[action.id]}
                        key={action.id}
                        onClear={onClearGraphAction}
                        onExecute={onGraphAction}
                        t={t}
                      />
                    ))}
                  </div>
                  {message.next_steps && message.next_steps.length > 0 ? (
                    <ul className="chat-next-steps">
                      {message.next_steps.map((step, stepIndex) => (
                        <li key={`next-step-${index}-${stepIndex}-${step}`}>{step}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}
              {message.citations && message.citations.length > 0 ? (
                <div className="citations">
                  {message.citations.map((citation, citationIndex) => (
                    <button
                      aria-label={t("chat.viewCitation", { label: citation.label })}
                      key={chatCitationKey(citation, citationIndex)}
                      onClick={() => onCitationClick(citation)}
                      type="button"
                    >
                      {citation.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {hasEvidenceChain(message) ? (
                <section className="retrieved-evidence-list">
                  <h3>{t("chat.evidenceHeading")}</h3>
                  {message.citations?.map((citation, citationIndex) => (
                    <article key={`evidence-${chatCitationKey(citation, citationIndex)}`}>
                      <button
                        aria-label={t("chat.viewEvidence", { label: citation.label })}
                        onClick={() => onCitationClick(citation)}
                        type="button"
                      >
                        {citation.label}
                      </button>
                      <small>
                        {citation.citation_type ?? "citation"} · {citation.source_ref}
                      </small>
                    </article>
                  ))}
                  {(message.retrieved_evidence ?? []).map((evidence, evidenceIndex) => (
                    <article key={retrievedEvidenceKey(evidence, evidenceIndex)}>
                      <button
                        aria-label={t("chat.viewEvidence", { label: evidence.label })}
                        onClick={() => onEvidenceClick(evidence)}
                        type="button"
                      >
                        {evidence.label}
                      </button>
                      <small>
                        {evidence.kind} · {evidence.source_ref} · {evidence.score.toFixed(2)}
                      </small>
                      <p>{evidence.excerpt}</p>
                    </article>
                  ))}
                </section>
              ) : null}
            </article>
          ))
        )}
      </div>
      <form className="chat-form" onSubmit={handleSubmit}>
        <label htmlFor="relationship-question">{t("chat.questionLabel")}</label>
        <textarea
          id="relationship-question"
          disabled={isAsking}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
        />
        <button disabled={isAsking} type="submit">
          {t("chat.ask")}
        </button>
      </form>
      {settingsOpen ? (
        <AISettingsPanel
          settings={normalizedSettings}
          onClose={() => setSettingsOpen(false)}
          onSave={async (nextSettings) => {
            await onSettingsChange(nextSettings);
            setSettingsOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

function GraphActionCard({
  action,
  execution,
  onClear,
  onExecute,
  t
}: {
  action: GraphAction;
  execution?: GraphActionExecutionResult;
  onClear: (action: GraphAction) => void;
  onExecute: (action: GraphAction) => void;
  t: (
    key:
      | "chat.actionStatus.executed"
      | "chat.actionStatus.failed"
      | "chat.actionStatus.idle"
      | "chat.actionStatus.reverted"
      | "chat.activityClear"
      | "chat.activityHeading"
      | "chat.actionClear"
      | "chat.actionExecute"
      | "chat.actionPreview"
      | "chat.clearGraphAction"
      | "chat.clearActionActivities"
      | "chat.executeGraphAction",
    values?: Record<string, string | number>
  ) => string;
}) {
  const status = execution?.status ?? "idle";
  const canClear = status === "executed" && isClearableAction(action);
  const tone = isPrimaryAction(action) ? "primary" : "secondary";

  return (
    <article className={`chat-graph-action-card is-${tone} is-${status}`}>
      <div className="chat-graph-action-main">
        <div>
          <strong>{action.label}</strong>
          {action.description ? <p>{action.description}</p> : null}
        </div>
        <span className="chat-graph-action-status">{statusLabel(status, t)}</span>
      </div>
      <small>{formatActionPreview(actionTargetPreview(action), t)}</small>
      {execution?.message ? (
        <p className="chat-graph-action-message">{execution.message}</p>
      ) : null}
      <div className="chat-graph-action-controls">
        <button
          aria-label={t("chat.executeGraphAction", { label: action.label })}
          onClick={() => onExecute(action)}
          title={action.description ?? action.label}
          type="button"
        >
          {t("chat.actionExecute")}
        </button>
        {canClear ? (
          <button
            aria-label={t("chat.clearGraphAction", { label: action.label })}
            onClick={() => onClear(action)}
            type="button"
          >
            {t("chat.actionClear")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function actionTargetPreview(action: GraphAction): GraphActionTargetPreview {
  return {
    nodeCount: action.node_ids.length,
    edgeCount: action.edge_ids.length,
    suggestionCount: action.suggestion_ids.length,
    evidenceCount: action.evidence_refs.length
  };
}

function formatActionPreview(
  preview: GraphActionTargetPreview,
  t: (key: "chat.actionPreview", values?: Record<string, string | number>) => string
): string {
  return t("chat.actionPreview", {
    nodes: preview.nodeCount,
    edges: preview.edgeCount,
    suggestions: preview.suggestionCount,
    evidence: preview.evidenceCount
  });
}

function statusLabel(
  status: GraphActionExecutionStatus,
  t: (
    key:
      | "chat.actionStatus.executed"
      | "chat.actionStatus.failed"
      | "chat.actionStatus.idle"
      | "chat.actionStatus.reverted",
    values?: Record<string, string | number>
  ) => string
): string {
  const keyByStatus: Record<GraphActionExecutionStatus, Parameters<typeof t>[0]> = {
    idle: "chat.actionStatus.idle",
    executed: "chat.actionStatus.executed",
    failed: "chat.actionStatus.failed",
    reverted: "chat.actionStatus.reverted"
  };
  return t(keyByStatus[status]);
}

function isPrimaryAction(action: GraphAction): boolean {
  return action.type === "highlight_path" || action.type === "open_evidence";
}

function isClearableAction(action: GraphAction): boolean {
  return (
    action.type === "highlight_path" ||
    action.type === "focus_node" ||
    action.type === "open_evidence"
  );
}

function hasEvidenceChain(message: ChatMessage): boolean {
  return Boolean(
    (message.citations && message.citations.length > 0) ||
      (message.retrieved_evidence && message.retrieved_evidence.length > 0)
  );
}

function chatCitationKey(citation: Citation, index: number): string {
  return `citation-${index}-${citation.source_ref}-${citation.label}`;
}

function retrievedEvidenceKey(evidence: RetrievedEvidence, index: number): string {
  return `retrieved-${index}-${evidence.kind}-${evidence.source_ref}-${evidence.label}`;
}

function formatSelectionContext(
  context: ChatSelectionContext,
  label: string,
  t: (
    key: "chat.contextNode" | "chat.contextRelationship",
    values?: Record<string, string | number>
  ) => string
): string {
  return context.kind === "node"
    ? t("chat.contextNode", { label })
    : t("chat.contextRelationship", { label });
}

function formatPathSummary(
  count: number,
  language: string,
  t: (key: "chat.pathSummary", values?: Record<string, string | number>) => string
): string {
  return language === "en-US"
    ? t("chat.pathSummary", { count, itemLabel: count === 1 ? "item" : "items" })
    : t("chat.pathSummary", { count });
}
