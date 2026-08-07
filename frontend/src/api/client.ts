import type {
  ChatAnswer,
  ChatSelectionContext,
  ApiErrorDetail,
  DocumentChunk,
  EntityMatchDecisionStatus,
  EntityMatchReview,
  ExtractedEntity,
  ExtractedRelationship,
  GraphResponse,
  ImportBatch,
  ImportJob,
  ImportJobRecoveryResult,
  ImportResult,
  CreatedProjectShareToken,
  ProjectSettings,
  ProjectShareRole,
  ProjectShareToken,
  ProjectShareTokenRevocation,
  ReviewAnalyticsSnapshotCleanupEvent,
  ReviewAnalytics,
  ReviewAnalyticsSnapshotCleanupResult,
  ReviewAnalyticsSnapshotSummary,
  ReviewAnalyticsTrend,
  RelationshipDuplicateCleanupResult,
  RelationshipDecisionStatus,
  RelationshipGovernanceSummary,
  RelationshipModelingReview,
  RelationshipSuggestion,
  ResetProjectDataResult,
  SessionLoginResponse,
  SourceDetail,
  SourceChunkPage,
  SourceSummary,
  WorkspaceDelta,
  WorkspaceSnapshot
} from "./types";

const API_BASE = "/api";
const UNSAFE_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"]);
const SESSION_CSRF_STORAGE_KEY = "graphmind.session.csrf";

let sessionCsrfToken: string | null = readStoredSessionCsrfToken();
const sessionAuthChallengeListeners = new Set<(error: ApiError) => void>();

export function subscribeSessionAuthChallenges(listener: (error: ApiError) => void): () => void {
  sessionAuthChallengeListeners.add(listener);
  return () => sessionAuthChallengeListeners.delete(listener);
}

export function clearSessionAuthState(): void {
  sessionCsrfToken = null;
  try {
    window.sessionStorage.removeItem(SESSION_CSRF_STORAGE_KEY);
  } catch {
    // Session storage can be unavailable; the in-memory token is still cleared.
  }
}

export async function loginSession(
  username: string,
  password: string
): Promise<SessionLoginResponse> {
  clearSessionAuthState();
  const response = await apiFetch(`${API_BASE}/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    await throwApiError(response, "Login failed");
  }
  const session = (await response.json()) as SessionLoginResponse;
  persistSessionCsrfToken(session.csrf_token || null);
  return session;
}

function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const csrfToken = sessionCsrfToken ?? readStoredSessionCsrfToken();
  if (!csrfToken || !UNSAFE_METHODS.has(method)) {
    return init ? fetch(input, init) : fetch(input);
  }
  sessionCsrfToken = csrfToken;
  const headers = headersWithCsrf(init?.headers, csrfToken);
  return fetch(input, {
    ...init,
    credentials: init?.credentials || "same-origin",
    headers
  });
}

function headersWithCsrf(headers: HeadersInit | undefined, csrfToken: string): HeadersInit {
  if (headers instanceof Headers) {
    return {
      ...Object.fromEntries(headers.entries()),
      "X-CSRF-Token": csrfToken
    };
  }
  if (Array.isArray(headers)) {
    return {
      ...Object.fromEntries(headers),
      "X-CSRF-Token": csrfToken
    };
  }
  return {
    ...(headers || {}),
    "X-CSRF-Token": csrfToken
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  userAction: string;
  retryable: boolean;
  fieldErrors: Record<string, string>;

  constructor(status: number, detail: ApiErrorDetail) {
    const message = detail.user_action
      ? `${detail.message} ${detail.user_action}`
      : detail.message;
    super(message);
    this.name = "ApiError";
    this.code = detail.code;
    this.status = status;
    this.userAction = detail.user_action;
    this.retryable = detail.retryable;
    this.fieldErrors = detail.field_errors;
  }
}

async function throwApiError(response: Response, fallbackMessage: string): Promise<never> {
  const detail = await readErrorDetail(response);
  if (isApiErrorDetail(detail)) {
    const error = new ApiError(response.status, detail);
    if (["AUTH_INVALID", "AUTH_REQUIRED", "CSRF_INVALID", "CSRF_REQUIRED"].includes(detail.code)) {
      clearSessionAuthState();
      for (const listener of sessionAuthChallengeListeners) {
        listener(error);
      }
    }
    throw error;
  }
  throw new Error(`${fallbackMessage}: ${response.status}`);
}

function persistSessionCsrfToken(token: string | null): void {
  sessionCsrfToken = token;
  try {
    if (token) {
      window.sessionStorage.setItem(SESSION_CSRF_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(SESSION_CSRF_STORAGE_KEY);
    }
  } catch {
    // The current page can continue with the in-memory token.
  }
}

function readStoredSessionCsrfToken(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_CSRF_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function readErrorDetail(response: Response): Promise<unknown> {
  try {
    const body = await response.json();
    return body?.detail;
  } catch {
    return null;
  }
}

function isApiErrorDetail(detail: unknown): detail is ApiErrorDetail {
  if (!detail || typeof detail !== "object") {
    return false;
  }
  const candidate = detail as Partial<ApiErrorDetail>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.user_action === "string" &&
    typeof candidate.retryable === "boolean" &&
    typeof candidate.field_errors === "object" &&
    candidate.field_errors !== null
  );
}

export async function createProject(name: string): Promise<{ id: number; name: string }> {
  const response = await apiFetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if (!response.ok) {
    await throwApiError(response, "Create project failed");
  }
  return response.json();
}

export async function getOrCreateDefaultProject(): Promise<{ id: number; name: string }> {
  const response = await apiFetch(`${API_BASE}/projects/default`, {
    method: "POST"
  });
  if (!response.ok) {
    await throwApiError(response, "Get default project failed");
  }
  return response.json();
}

export async function getGraph(projectId: number): Promise<GraphResponse> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/graph`);
  if (!response.ok) {
    await throwApiError(response, "Get graph failed");
  }
  return response.json();
}

export async function getWorkspaceSnapshot(projectId: number): Promise<WorkspaceSnapshot> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/workspace-snapshot`);
  if (!response.ok) {
    await throwApiError(response, "Get workspace snapshot failed");
  }
  return response.json();
}

export async function getWorkspaceDelta(
  projectId: number,
  sinceVersion: string
): Promise<WorkspaceDelta> {
  const params = new URLSearchParams({ since_version: sinceVersion });
  const response = await apiFetch(
    `${API_BASE}/projects/${projectId}/workspace-delta?${params.toString()}`
  );
  if (!response.ok) {
    await throwApiError(response, "Get workspace delta failed");
  }
  return response.json();
}

export async function getRelationshipSuggestions(
  projectId: number
): Promise<RelationshipSuggestion[]> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/relationship-suggestions`);
  if (!response.ok) {
    await throwApiError(response, "Get relationship suggestions failed");
  }
  return response.json();
}

export async function getRelationshipGovernanceSummary(
  projectId: number
): Promise<RelationshipGovernanceSummary> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/relationship-governance`);
  if (!response.ok) {
    await throwApiError(response, "Get relationship governance failed");
  }
  return response.json();
}

export async function getReviewAnalytics(projectId: number): Promise<ReviewAnalytics> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/review-analytics?window=30d`);
  if (!response.ok) {
    await throwApiError(response, "Get review analytics failed");
  }
  return response.json();
}

export async function getReviewAnalyticsTrend(
  projectId: number,
  days = 14
): Promise<ReviewAnalyticsTrend> {
  const response = await apiFetch(
    `${API_BASE}/projects/${projectId}/review-analytics/trend?window=30d&days=${days}`
  );
  if (!response.ok) {
    await throwApiError(response, "Get review analytics trend failed");
  }
  return response.json();
}

export async function getReviewAnalyticsSnapshotSummary(
  projectId: number
): Promise<ReviewAnalyticsSnapshotSummary> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/review-analytics/snapshots`);
  if (!response.ok) {
    await throwApiError(response, "Get review analytics snapshot summary failed");
  }
  return response.json();
}

export async function getReviewAnalyticsSnapshotCleanupEvents(
  projectId: number
): Promise<ReviewAnalyticsSnapshotCleanupEvent[]> {
  const response = await apiFetch(
    `${API_BASE}/projects/${projectId}/review-analytics/snapshots/cleanup-events`
  );
  if (!response.ok) {
    await throwApiError(response, "Get review analytics snapshot cleanup events failed");
  }
  return response.json();
}

export async function cleanupReviewAnalyticsSnapshots(
  projectId: number,
  retentionDays = 30
): Promise<ReviewAnalyticsSnapshotCleanupResult> {
  const response = await apiFetch(
    `${API_BASE}/projects/${projectId}/review-analytics/snapshots/cleanup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retention_days: retentionDays })
    }
  );
  if (!response.ok) {
    await throwApiError(response, "Cleanup review analytics snapshots failed");
  }
  return response.json();
}

export async function cleanupDuplicateRelationshipSuggestions(
  projectId: number
): Promise<RelationshipDuplicateCleanupResult> {
  const response = await apiFetch(
    `${API_BASE}/projects/${projectId}/relationship-governance/cleanup-duplicates`,
    { method: "POST" }
  );
  if (!response.ok) {
    await throwApiError(response, "Cleanup duplicate relationship suggestions failed");
  }
  return response.json();
}

export async function getProjectSettings(projectId: number): Promise<ProjectSettings> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/settings`);
  if (!response.ok) {
    await throwApiError(response, "Get project settings failed");
  }
  return response.json();
}

export async function updateProjectSettings(
  projectId: number,
  settings: ProjectSettings
): Promise<ProjectSettings> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
  if (!response.ok) {
    await throwApiError(response, "Update project settings failed");
  }
  return response.json();
}

export async function buildVectorIndex(projectId: number): Promise<ProjectSettings> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/vector-index/build`, {
    method: "POST"
  });
  if (!response.ok) {
    await throwApiError(response, "Build vector index failed");
  }
  return response.json();
}

export async function createProjectShareToken(
  projectId: number,
  role: ProjectShareRole,
  label: string
): Promise<CreatedProjectShareToken> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/share-tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, label })
  });
  if (!response.ok) {
    await throwApiError(response, "Create project share token failed");
  }
  return response.json();
}

export async function getProjectShareTokens(projectId: number): Promise<ProjectShareToken[]> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/share-tokens`);
  if (!response.ok) {
    await throwApiError(response, "Get project share tokens failed");
  }
  return response.json();
}

export async function revokeProjectShareToken(
  projectId: number,
  shareTokenId: number
): Promise<ProjectShareTokenRevocation> {
  const response = await apiFetch(
    `${API_BASE}/projects/${projectId}/share-tokens/${shareTokenId}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    await throwApiError(response, "Revoke project share token failed");
  }
  return response.json();
}

export async function reviewRelationshipSuggestion(
  projectId: number,
  suggestionId: number,
  decisionStatus: Exclude<RelationshipDecisionStatus, "pending">,
  decisionNote?: string | null,
  modelingReview?: Omit<RelationshipModelingReview, "decisionStatus">
): Promise<void> {
  const response = await apiFetch(
    `${API_BASE}/projects/${projectId}/relationship-suggestions/${suggestionId}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision_status: decisionStatus,
        decision_note: decisionNote ?? null,
        ...(modelingReview?.reviewedBy
          ? { reviewed_by: modelingReview.reviewedBy }
          : {}),
        ...(modelingReview?.relationshipType
          ? { relationship_type: modelingReview.relationshipType }
          : {}),
        ...(modelingReview?.evidenceQuality
          ? { evidence_quality: modelingReview.evidenceQuality }
          : {})
      })
    }
  );
  if (!response.ok) {
    await throwApiError(response, "Review relationship suggestion failed");
  }
}

export async function importFile(projectId: number, file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/imports`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    await throwApiError(response, "Import file failed");
  }
  return response.json();
}

export async function createImportJob(projectId: number, file: File): Promise<ImportJob> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/import-jobs`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    await throwApiError(response, "Import file failed");
  }
  return response.json();
}

export async function createImportBatch(
  projectId: number,
  files: File[],
  label = "Structured import batch"
): Promise<ImportBatch> {
  const formData = new FormData();
  formData.append("label", label);
  for (const file of files) {
    formData.append("files", file);
  }
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/import-batches`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    await throwApiError(response, "Import batch failed");
  }
  return response.json();
}

export async function createUrlImport(
  projectId: number,
  url: string,
  label = "URL source import"
): Promise<ImportBatch> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/url-imports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, label })
  });
  if (!response.ok) {
    await throwApiError(response, "URL import failed");
  }
  return response.json();
}

export async function importSampleDataset(projectId: number): Promise<ImportResult> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/sample-import`, {
    method: "POST"
  });
  if (!response.ok) {
    await throwApiError(response, "Import sample dataset failed");
  }
  return response.json();
}

export async function getImportJobs(projectId: number): Promise<ImportJob[]> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/import-jobs`);
  if (!response.ok) {
    await throwApiError(response, "Get import jobs failed");
  }
  return response.json();
}

export async function getImportJob(projectId: number, jobId: number): Promise<ImportJob> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/import-jobs/${jobId}`);
  if (!response.ok) {
    await throwApiError(response, "Get import job failed");
  }
  return response.json();
}

export async function cancelImportJob(projectId: number, jobId: number): Promise<ImportJob> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/import-jobs/${jobId}/cancel`, {
    method: "POST"
  });
  if (!response.ok) {
    await throwApiError(response, "Cancel import job failed");
  }
  return response.json();
}

export async function retryImportJob(projectId: number, jobId: number): Promise<ImportJob> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/import-jobs/${jobId}/retry`, {
    method: "POST"
  });
  if (!response.ok) {
    await throwApiError(response, "Retry import job failed");
  }
  return response.json();
}

export async function recoverImportJobs(projectId: number): Promise<ImportJobRecoveryResult> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/import-jobs/recover`, {
    method: "POST"
  });
  if (!response.ok) {
    await throwApiError(response, "Recover import jobs failed");
  }
  return response.json();
}

export async function getImportBatches(projectId: number): Promise<ImportBatch[]> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/import-batches`);
  if (!response.ok) {
    await throwApiError(response, "Get import batches failed");
  }
  return response.json();
}

export async function retryImportItem(projectId: number, itemId: number): Promise<ImportBatch> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/import-items/${itemId}/retry`, {
    method: "POST"
  });
  if (!response.ok) {
    await throwApiError(response, "Retry import item failed");
  }
  return response.json();
}

export async function getSourceSummaries(projectId: number): Promise<SourceSummary[]> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/sources`);
  if (!response.ok) {
    await throwApiError(response, "Get source summaries failed");
  }
  return response.json();
}

export async function getSourceDetails(projectId: number): Promise<SourceDetail[]> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/sources/detail`);
  if (!response.ok) {
    await throwApiError(response, "Get source details failed");
  }
  return response.json();
}

export async function getSourceChunks(
  projectId: number,
  sourceId: number
): Promise<DocumentChunk[]> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/sources/${sourceId}/chunks`);
  if (!response.ok) {
    await throwApiError(response, "Get source chunks failed");
  }
  return response.json();
}

export async function getSourceChunksPage(
  projectId: number,
  sourceId: number,
  options: { limit: number; offset: number }
): Promise<SourceChunkPage> {
  const params = new URLSearchParams({
    limit: String(options.limit),
    offset: String(options.offset)
  });
  const response = await apiFetch(
    `${API_BASE}/projects/${projectId}/sources/${sourceId}/chunks?${params.toString()}`
  );
  if (!response.ok) {
    await throwApiError(response, "Get source chunks page failed");
  }
  return response.json();
}

export async function getExtractedEntities(projectId: number): Promise<ExtractedEntity[]> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/entities`);
  if (!response.ok) {
    await throwApiError(response, "Get extracted entities failed");
  }
  return response.json();
}

export async function getExtractedRelationships(
  projectId: number
): Promise<ExtractedRelationship[]> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/extracted-relationships`);
  if (!response.ok) {
    await throwApiError(response, "Get extracted relationships failed");
  }
  return response.json();
}

export async function getEntityMatchReviews(projectId: number): Promise<EntityMatchReview[]> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/entity-matches`);
  if (!response.ok) {
    await throwApiError(response, "Get entity match reviews failed");
  }
  return response.json();
}

export async function getMappingReviews(projectId: number): Promise<EntityMatchReview[]> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/mapping-reviews`);
  if (!response.ok) {
    await throwApiError(response, "Get mapping reviews failed");
  }
  return response.json();
}

export async function reviewEntityMatch(
  projectId: number,
  edgeId: number,
  decisionStatus: EntityMatchDecisionStatus
): Promise<EntityMatchReview> {
  const response = await apiFetch(
    `${API_BASE}/projects/${projectId}/entity-matches/${edgeId}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision_status: decisionStatus })
    }
  );
  if (!response.ok) {
    await throwApiError(response, "Review entity match failed");
  }
  return response.json();
}

export async function reviewMappingEdge(
  projectId: number,
  edgeId: number,
  decisionStatus: EntityMatchDecisionStatus
): Promise<EntityMatchReview> {
  const response = await apiFetch(
    `${API_BASE}/projects/${projectId}/mapping-reviews/${edgeId}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision_status: decisionStatus })
    }
  );
  if (!response.ok) {
    await throwApiError(response, "Review mapping edge failed");
  }
  return response.json();
}

export async function resetProjectData(projectId: number): Promise<ResetProjectDataResult> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/data`, {
    method: "DELETE"
  });
  if (!response.ok) {
    await throwApiError(response, "Reset project data failed");
  }
  return response.json();
}

export async function askQuestion(
  projectId: number,
  question: string,
  selection?: ChatSelectionContext | null
): Promise<ChatAnswer> {
  const response = await apiFetch(`${API_BASE}/projects/${projectId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      ...(selection ? { selection } : {})
    })
  });
  if (!response.ok) {
    await throwApiError(response, "Ask question failed");
  }
  return response.json();
}
