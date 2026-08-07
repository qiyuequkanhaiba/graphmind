import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  createProjectShareToken,
  getReviewAnalyticsTrend,
  getProjectShareTokens,
  getSourceChunksPage,
  loginSession,
  revokeProjectShareToken
} from "./api/client";
import type { ImportJob, ReviewAnalyticsTrendDays } from "./api/types";
import Workspace from "./components/Workspace";
import { I18nProvider, useI18n } from "./i18n/I18nProvider";
import {
  defaultProjectSettings,
  emptyGraph,
  type WorkspaceState
} from "./state/workspaceStore";
import { useAiActions } from "./state/useAiActions";
import { buildImportTaskFromJob, useImportActions } from "./state/useImportActions";
import { useReviewActions } from "./state/useReviewActions";
import { useSessionAuthChallenge } from "./state/useSessionAuthChallenge";
import { useWorkspaceBootstrap } from "./state/useWorkspaceBootstrap";
import { workspaceOperationErrorPatch } from "./state/operationError";
import { useAppTheme } from "./state/useAppTheme";

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const { t } = useI18n();
  const [state, setState] = useState<WorkspaceState>({
    projectId: null,
    workspaceVersion: null,
    graph: emptyGraph,
    suggestions: [],
    relationshipGovernance: null,
    reviewAnalytics: null,
    reviewAnalyticsTrend: null,
    reviewAnalyticsSnapshotSummary: null,
    reviewAnalyticsSnapshotCleanupEvents: [],
    settings: defaultProjectSettings,
    messages: [],
    highlightedGraphPath: [],
    status: "idle",
    error: null,
    errorCode: null,
    operationError: null,
    importStatus: null,
    importTasks: [],
    sourceSummaries: [],
    sourceDetails: [],
    sourceChunksBySourceId: {},
    extractedEntities: [],
    extractedRelationships: [],
    entityMatchReviews: [],
    mappingReviews: []
  });
  const [bootstrapKey, setBootstrapKey] = useState(0);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [reviewAnalyticsTrendDays, setReviewAnalyticsTrendDays] = useState<ReviewAnalyticsTrendDays>(14);
  const [reviewerName, setReviewerName] = useState("");
  const { handleThemeChange, theme } = useAppTheme();
  const reviewTrendRequestIdRef = useRef(0);

  useEffect(() => {
    reviewTrendRequestIdRef.current += 1;
  }, [state.projectId]);

  useSessionAuthChallenge(setState);

  const formatLoadedStatus = useCallback(
    (nodeCount: number, suggestionCount: number) =>
      t("app.loaded", { nodes: nodeCount, suggestions: suggestionCount }),
    [t]
  );
  const buildImportTaskFromJobForLocale = useCallback(
    (job: ImportJob) => buildImportTaskFromJob(job, t),
    [t]
  );

  useWorkspaceBootstrap({
    bootstrapKey,
    buildImportTaskFromJob: buildImportTaskFromJobForLocale,
    formatLoadedStatus,
    setState
  });
  const handleLogin = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setLoginSubmitting(true);
      setLoginError(null);
      try {
        await loginSession(loginUsername, loginPassword);
        setLoginPassword("");
        setBootstrapKey((current) => current + 1);
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : t("auth.loginFailed"));
      } finally {
        setLoginSubmitting(false);
      }
    },
    [loginPassword, loginUsername, t]
  );
  const {
    handleReview,
    handleConfirmRelationship,
    handleReviewEntityMatch,
    handleReviewMappingEdge,
    handleCleanupAnalyticsSnapshots,
    handleCleanupDuplicateRelationships
  } = useReviewActions({
    projectId: state.projectId,
    reviewAnalyticsTrendDays,
    reviewerName,
    setState,
    t
  });
  const {
    handleAsk,
    handleSettingsChange,
    handleBuildVectorIndex,
    clearHighlightedGraphPath
  } = useAiActions({
    projectId: state.projectId,
    setState,
    t
  });
  const {
    handleImport,
    handleImportBatch,
    handleImportSample,
    handleImportUrl,
    handleResetData,
    handleCancelImportTask,
    handleRefreshImportTask,
    handleRecoverImportJobs,
    handleRetryImportItem,
    handleRetryImportTask,
    isRecoveringImportJobs
  } = useImportActions({
    projectId: state.projectId,
    importTasks: state.importTasks,
    workspaceState: state,
    reviewAnalyticsTrendDays,
    setState,
    t
  });
  const handleLoadSourceChunks = useCallback(
    async (sourceId: number) => {
      if (state.projectId === null) {
        return [];
      }
      const cachedChunks = state.sourceChunksBySourceId[sourceId];
      if (cachedChunks) {
        return cachedChunks;
      }
      const page = await getSourceChunksPage(state.projectId, sourceId, {
        limit: 50,
        offset: 0
      });
      setState((current) => ({
        ...current,
        sourceChunksBySourceId: {
          ...current.sourceChunksBySourceId,
          [sourceId]: page.items
        }
      }));
      return page.items;
    },
    [state.projectId, state.sourceChunksBySourceId]
  );

  const handleReviewAnalyticsTrendDaysChange = useCallback(
    async (days: number) => {
      if (!isReviewAnalyticsTrendDays(days)) {
        return;
      }
      setReviewAnalyticsTrendDays(days);
      const projectId = state.projectId;
      if (projectId === null) {
        return;
      }
      const requestId = ++reviewTrendRequestIdRef.current;
      try {
        const trend = await getReviewAnalyticsTrend(projectId, days);
        if (requestId !== reviewTrendRequestIdRef.current) {
          return;
        }
        setState((current) =>
          current.projectId === projectId
            ? { ...current, reviewAnalyticsTrend: trend, error: null, operationError: null }
            : current
        );
      } catch (error) {
        if (requestId !== reviewTrendRequestIdRef.current) {
          return;
        }
        setState((current) =>
          current.projectId === projectId
            ? {
                ...current,
                ...workspaceOperationErrorPatch(error, t("app.reviewFailed"))
              }
            : current
        );
      }
    },
    [state.projectId, t]
  );

  const dismissOperationError = useCallback(() => {
    setState((current) => ({ ...current, error: null, operationError: null }));
  }, []);

  const isAuthChallenge =
    state.status === "error" &&
    ["AUTH_REQUIRED", "AUTH_INVALID", "CSRF_REQUIRED", "CSRF_INVALID"].includes(
      state.errorCode ?? ""
    );

  return (
    <main className="app-shell">
      {state.status === "error" ? (
        <>
          <header className="topbar">
            <div className="brand-mark" aria-hidden="true" />
            <div>
              <h1>GraphMind</h1>
              <p>{t("app.subtitle")}</p>
            </div>
          </header>
          <section className="empty-workspace">
            {isAuthChallenge ? (
              <form className="auth-login-form" onSubmit={handleLogin}>
                <h2>{t("auth.loginTitle")}</h2>
                <label>
                  {t("auth.username")}
                  <input
                    autoComplete="username"
                    name="username"
                    onChange={(event) => setLoginUsername(event.target.value)}
                    required
                    type="text"
                    value={loginUsername}
                  />
                </label>
                <label>
                  {t("auth.password")}
                  <input
                    autoComplete="current-password"
                    name="password"
                    onChange={(event) => setLoginPassword(event.target.value)}
                    required
                    type="password"
                    value={loginPassword}
                  />
                </label>
                {loginError ? <p role="alert">{loginError}</p> : null}
                <button disabled={loginSubmitting} type="submit">
                  {loginSubmitting ? t("auth.loggingIn") : t("auth.login")}
                </button>
              </form>
            ) : (
              <>
                <h2>{t("app.backendUnavailable")}</h2>
                <p>{state.error}</p>
              </>
            )}
          </section>
        </>
      ) : (
        <Workspace
          projectId={state.projectId}
          theme={theme}
          graph={state.graph}
          suggestions={state.suggestions}
          relationshipGovernance={state.relationshipGovernance}
          reviewAnalytics={state.reviewAnalytics}
          reviewAnalyticsTrend={state.reviewAnalyticsTrend}
          reviewAnalyticsTrendDays={reviewAnalyticsTrendDays}
          reviewerName={reviewerName}
          reviewAnalyticsSnapshotSummary={state.reviewAnalyticsSnapshotSummary}
          reviewAnalyticsSnapshotCleanupEvents={state.reviewAnalyticsSnapshotCleanupEvents}
          settings={state.settings}
          highlightedGraphPath={state.highlightedGraphPath}
          messages={state.messages}
          operationError={state.operationError}
          importStatus={state.importStatus}
          importTasks={state.importTasks}
          isRecoveringImportJobs={isRecoveringImportJobs}
          sourceSummaries={state.sourceSummaries}
          sourceDetails={state.sourceDetails}
          sourceChunksBySourceId={state.sourceChunksBySourceId}
          onLoadSourceChunks={handleLoadSourceChunks}
          extractedEntities={state.extractedEntities}
          extractedRelationships={state.extractedRelationships}
          entityMatchReviews={state.entityMatchReviews}
          mappingReviews={state.mappingReviews}
          onReview={handleReview}
          onReviewEntityMatch={handleReviewEntityMatch}
          onReviewMappingEdge={handleReviewMappingEdge}
          onImport={handleImport}
          onImportBatch={handleImportBatch}
          onImportSample={handleImportSample}
          onImportUrl={handleImportUrl}
          onConfirmRelationship={handleConfirmRelationship}
          onCleanupAnalyticsSnapshots={handleCleanupAnalyticsSnapshots}
          onCleanupDuplicateRelationships={handleCleanupDuplicateRelationships}
          onReviewAnalyticsTrendDaysChange={handleReviewAnalyticsTrendDaysChange}
          onReviewerNameChange={setReviewerName}
          onResetData={handleResetData}
          onCancelImportTask={handleCancelImportTask}
          onRefreshImportTask={handleRefreshImportTask}
          onRecoverImportJobs={handleRecoverImportJobs}
          onRetryImportItem={handleRetryImportItem}
          onRetryImportTask={handleRetryImportTask}
          onAsk={handleAsk}
          onBuildVectorIndex={handleBuildVectorIndex}
          onClearHighlightedGraphPath={clearHighlightedGraphPath}
          onSettingsChange={handleSettingsChange}
          onDismissOperationError={dismissOperationError}
          onThemeChange={handleThemeChange}
          onCreateProjectShareToken={createProjectShareToken}
          onLoadProjectShareTokens={getProjectShareTokens}
          onRevokeProjectShareToken={revokeProjectShareToken}
        />
      )}
    </main>
  );
}

function isReviewAnalyticsTrendDays(value: number): value is ReviewAnalyticsTrendDays {
  return value === 7 || value === 14 || value === 30 || value === 90;
}
