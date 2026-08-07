import type { ImportDiagnostics, ImportStage } from "../api/types";
import type { MessageKey } from "../i18n/messages";

export type ImportTaskStatus =
  | "staging"
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "canceled";

export type ImportTask = {
  id: string;
  label: string;
  kind: "file" | "sample" | "batch" | "url";
  status: ImportTaskStatus;
  progress: number;
  summary: string | null;
  error: string | null;
  errorCode?: string | null;
  recoveryAction?: string | null;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  createdAt: number;
  updatedAt?: number;
  jobId?: number;
  diagnostics?: ImportDiagnostics;
  stages?: ImportStage[];
  retryFile?: File;
};

export const importTaskStatusLabels: Record<ImportTaskStatus, MessageKey> = {
  staging: "import.tasks.status.staging",
  queued: "import.tasks.status.queued",
  running: "import.tasks.status.running",
  succeeded: "import.tasks.status.succeeded",
  partial: "import.tasks.status.partial",
  failed: "import.tasks.status.failed",
  canceled: "import.tasks.status.canceled"
};

export function importStageKey(task: ImportTask, stage: ImportStage, index: number): string {
  return `${stage.source ?? task.label}-${stage.name}-${index}`;
}

export function formatImportStageName(
  stageName: string,
  t: (key: MessageKey, values?: Record<string, string | number>) => string
): string {
  const labelKeys: Record<string, MessageKey> = {
    extracted: "import.tasks.stage.extracted",
    failed: "import.tasks.stage.failed",
    fetched: "import.tasks.stage.fetched",
    graphed: "import.tasks.stage.graphed",
    indexed: "import.tasks.stage.indexed",
    parsed: "import.tasks.stage.parsed",
    profiled: "import.tasks.stage.profiled",
    resolved: "import.tasks.stage.resolved",
    staged: "import.tasks.stage.staged"
  };
  const labelKey = labelKeys[stageName];
  return labelKey ? t(labelKey) : stageName;
}
