import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { askQuestion, buildVectorIndex, updateProjectSettings } from "../api/client";
import type { ChatMessage, ChatSelectionContext, ProjectSettings } from "../api/types";
import type { MessageKey } from "../i18n/messages";
import { workspaceOperationErrorPatch } from "./operationError";
import { normalizeProjectSettings, type WorkspaceState } from "./workspaceStore";

export function useAiActions({
  projectId,
  setState,
  t
}: {
  projectId: number | null;
  setState: Dispatch<SetStateAction<WorkspaceState>>;
  t: (key: MessageKey) => string;
}) {
  const handleAsk = useCallback(
    async (question: string, selection?: ChatSelectionContext | null) => {
      if (projectId === null) {
        return;
      }

      const userMessage: ChatMessage = { role: "user", content: question };
      setState((current) => ({
        ...current,
        messages: [...current.messages, userMessage],
        error: null
      }));

      try {
        const answer = await askQuestion(projectId, question, selection);
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: answer.content,
          citations: answer.citations,
          answer_confidence: answer.answer_confidence,
          highlighted_graph_path: answer.highlighted_graph_path,
          retrieved_evidence: answer.retrieved_evidence ?? [],
          graph_actions: answer.graph_actions ?? [],
          next_steps: answer.next_steps ?? []
        };
        setState((current) => ({
          ...current,
          messages: [...current.messages, assistantMessage],
          highlightedGraphPath: answer.highlighted_graph_path,
          error: null,
          operationError: null
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.chatFailed");
        setState((current) => ({
          ...current,
          messages: [
            ...current.messages,
            {
              role: "assistant",
              content: message,
              answer_confidence: "low"
            }
          ],
          error: message
        }));
      }
    },
    [projectId, setState, t]
  );

  const handleSettingsChange = useCallback(
    async (settings: ProjectSettings) => {
      if (projectId === null) {
        return;
      }

      try {
        const savedSettings = await updateProjectSettings(
          projectId,
          normalizeProjectSettings(settings)
        );
        setState((current) => ({
          ...current,
          settings: normalizeProjectSettings(savedSettings),
          error: null,
          operationError: null
        }));
      } catch (error) {
        setState((current) => ({
          ...current,
          ...workspaceOperationErrorPatch(error, t("app.settingsFailed"))
        }));
        throw error;
      }
    },
    [projectId, setState, t]
  );

  const handleBuildVectorIndex = useCallback(async () => {
    if (projectId === null) {
      return;
    }

    try {
      const savedSettings = await buildVectorIndex(projectId);
      setState((current) => ({
        ...current,
        settings: normalizeProjectSettings(savedSettings),
        error: null,
        operationError: null
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        ...workspaceOperationErrorPatch(error, t("app.settingsFailed"))
      }));
    }
  }, [projectId, setState, t]);

  const clearHighlightedGraphPath = useCallback(() => {
    setState((current) => ({
      ...current,
      highlightedGraphPath: []
    }));
  }, [setState]);

  return {
    handleAsk,
    handleSettingsChange,
    handleBuildVectorIndex,
    clearHighlightedGraphPath
  };
}
