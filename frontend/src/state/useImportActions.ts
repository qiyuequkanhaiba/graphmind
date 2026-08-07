import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  ApiError,
  cancelImportJob,
  createImportBatch,
  createImportJob,
  createUrlImport,
  getGraph,
  getImportJob,
  getImportJobs,
  getRelationshipGovernanceSummary,
  getReviewAnalytics,
  getReviewAnalyticsSnapshotCleanupEvents,
  getReviewAnalyticsSnapshotSummary,
  getReviewAnalyticsTrend,
  getRelationshipSuggestions,
  getSourceSummaries,
  importSampleDataset,
  recoverImportJobs,
  resetProjectData,
  retryImportJob,
  retryImportItem
} from "../api/client";
import type {
  ImportBatch,
  ImportDiagnostics,
  ImportEvent,
  ImportJob,
  ImportResult,
  ImportStage,
  ReviewAnalyticsTrendDays
} from "../api/types";
import type { ImportTask } from "../components/importTasks";
import type { MessageKey } from "../i18n/messages";
import {
  loadSourceInspection,
  refreshWorkspaceIncrementally,
  type WorkspaceState
} from "./workspaceStore";
import { useImportEvents } from "./useImportEvents";

const IMPORT_JOB_POLL_ATTEMPTS = 8;
const IMPORT_JOB_POLL_DELAY_MS = 30_000;

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type SourceInspectionState = Pick<
  WorkspaceState,
  | "sourceDetails"
  | "sourceChunksBySourceId"
  | "extractedEntities"
  | "extractedRelationships"
  | "entityMatchReviews"
  | "mappingReviews"
>;

let importTaskSequence = 0;

type ImportJobTaskUpdate = Pick<
  ImportTask,
  | "label"
  | "kind"
  | "status"
  | "progress"
  | "summary"
  | "error"
  | "errorCode"
  | "recoveryAction"
  | "fieldErrors"
  | "retryable"
  | "jobId"
  | "updatedAt"
>;

type ImportFailureUpdate = Partial<ImportTask> &
  Pick<ImportTask, "status" | "error" | "retryable">;

export function useImportActions({
  projectId,
  importTasks,
  workspaceState,
  reviewAnalyticsTrendDays = 14,
  setState,
  t
}: {
  projectId: number | null;
  importTasks: ImportTask[];
  workspaceState: WorkspaceState;
  reviewAnalyticsTrendDays?: ReviewAnalyticsTrendDays;
  setState: Dispatch<SetStateAction<WorkspaceState>>;
  t: TFunction;
}) {
  const recoveringImportJobsRef = useRef(false);
  const eventCompletedJobIdsRef = useRef<Set<number>>(new Set());
  const workspaceStateRef = useRef(workspaceState);
  workspaceStateRef.current = workspaceState;
  const [isRecoveringImportJobs, setIsRecoveringImportJobs] = useState(false);

  const loadRelationshipGovernance = useCallback(
    (nextProjectId: number) => getRelationshipGovernanceSummary(nextProjectId).catch(() => null),
    []
  );

  const applyImportResult = useCallback(
    (
      result: ImportResult,
      taskId: string,
      sourceSummaries?: WorkspaceState["sourceSummaries"],
      sourceInspection?: SourceInspectionState,
      relationshipGovernance?: WorkspaceState["relationshipGovernance"],
      reviewAnalytics?: WorkspaceState["reviewAnalytics"],
      reviewAnalyticsTrend?: WorkspaceState["reviewAnalyticsTrend"],
      reviewAnalyticsSnapshotSummary?: WorkspaceState["reviewAnalyticsSnapshotSummary"],
      reviewAnalyticsSnapshotCleanupEvents?: WorkspaceState["reviewAnalyticsSnapshotCleanupEvents"]
    ) => {
      setState((current) => ({
        ...current,
        graph: result.graph,
        suggestions: result.suggestions,
        relationshipGovernance: relationshipGovernance ?? current.relationshipGovernance,
        reviewAnalytics: reviewAnalytics ?? current.reviewAnalytics,
        reviewAnalyticsTrend: reviewAnalyticsTrend ?? current.reviewAnalyticsTrend,
        reviewAnalyticsSnapshotSummary:
          reviewAnalyticsSnapshotSummary ?? current.reviewAnalyticsSnapshotSummary,
        reviewAnalyticsSnapshotCleanupEvents:
          reviewAnalyticsSnapshotCleanupEvents ??
          current.reviewAnalyticsSnapshotCleanupEvents,
        sourceSummaries: sourceSummaries ?? current.sourceSummaries,
        ...(sourceInspection ?? {}),
        highlightedGraphPath: [],
        importTasks: updateImportTask(current.importTasks, taskId, {
          id: result.import_job_id > 0 ? `job-${result.import_job_id}` : taskId,
          status: "succeeded",
          progress: 100,
          summary: t("import.tasks.summary.succeeded", {
            sheets: result.sheet_count,
            fields: result.field_count,
            suggestions: result.suggestion_count
          }),
          ...clearImportFailureDetails(),
          retryable: false
        }),
        importStatus: t("app.importComplete", {
          sheets: result.sheet_count,
          fields: result.field_count,
          suggestions: result.suggestion_count
        }),
        error: null
      }));
    },
    [setState, t]
  );

  const refreshWorkspaceAfterImportJob = useCallback(
    async (nextProjectId: number, taskId: string, job: ImportJob) => {
      const currentWorkspace = workspaceStateRef.current;
      if (currentWorkspace.workspaceVersion) {
        try {
          const incrementalData = await refreshWorkspaceIncrementally(nextProjectId, {
            workspaceVersion: currentWorkspace.workspaceVersion,
            graph: currentWorkspace.graph,
            suggestions: currentWorkspace.suggestions,
            relationshipGovernance: currentWorkspace.relationshipGovernance,
            reviewAnalytics: currentWorkspace.reviewAnalytics,
            reviewAnalyticsTrend: currentWorkspace.reviewAnalyticsTrend,
            reviewAnalyticsSnapshotSummary: currentWorkspace.reviewAnalyticsSnapshotSummary,
            reviewAnalyticsSnapshotCleanupEvents:
              currentWorkspace.reviewAnalyticsSnapshotCleanupEvents,
            importJobs: [],
            sourceSummaries: currentWorkspace.sourceSummaries,
            sourceDetails: currentWorkspace.sourceDetails,
            extractedEntities: currentWorkspace.extractedEntities,
            extractedRelationships: currentWorkspace.extractedRelationships,
            entityMatchReviews: currentWorkspace.entityMatchReviews,
            mappingReviews: currentWorkspace.mappingReviews
          });
          setState((current) =>
            workspaceStateAfterImportRefresh(current, taskId, job, t, {
              workspaceVersion: incrementalData.workspaceVersion,
              graph: incrementalData.graph,
              suggestions: incrementalData.suggestions,
              relationshipGovernance: incrementalData.relationshipGovernance,
              reviewAnalytics: incrementalData.reviewAnalytics,
              reviewAnalyticsTrend: incrementalData.reviewAnalyticsTrend,
              reviewAnalyticsSnapshotSummary: incrementalData.reviewAnalyticsSnapshotSummary,
              reviewAnalyticsSnapshotCleanupEvents:
                incrementalData.reviewAnalyticsSnapshotCleanupEvents,
              sourceSummaries: incrementalData.sourceSummaries,
              sourceDetails: incrementalData.sourceDetails,
              extractedEntities: incrementalData.extractedEntities,
              extractedRelationships: incrementalData.extractedRelationships,
              entityMatchReviews: incrementalData.entityMatchReviews,
              mappingReviews: incrementalData.mappingReviews
            })
          );
          return;
        } catch {
          // Fall back to legacy refresh when the delta endpoint is unavailable.
        }
      }
      const legacyData = await loadLegacyImportRefreshData(
        nextProjectId,
        loadRelationshipGovernance,
        reviewAnalyticsTrendDays
      );
      setState((current) =>
        workspaceStateAfterImportRefresh(current, taskId, job, t, legacyData)
      );
    },
    [loadRelationshipGovernance, reviewAnalyticsTrendDays, setState, t]
  );

  const pollImportJob = useCallback(
    async (nextProjectId: number, jobId: number, taskId: string) => {
      for (let attempt = 0; attempt < IMPORT_JOB_POLL_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
          await delay(IMPORT_JOB_POLL_DELAY_MS);
        }
        const job = await getImportJob(nextProjectId, jobId);
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            ...buildImportTaskUpdateFromJob(job, t),
            id: `job-${job.id}`
          }),
          importStatus:
            job.status === "failed"
              ? t("app.importFailed")
              : job.status === "canceled"
                ? t("import.tasks.status.canceled")
                : job.status === "succeeded" && job.summary
                  ? t("app.importComplete", {
                      sheets: job.summary.sheet_count,
                      fields: job.summary.field_count,
                      suggestions: job.summary.suggestion_count
                    })
                  : t("import.tasks.summary.running")
        }));

        if (job.status === "failed") {
          throw new Error(job.error ?? t("app.importFailed"));
        }

        if (job.status === "canceled") {
          return;
        }

        if (job.status === "succeeded") {
          await refreshWorkspaceAfterImportJob(nextProjectId, taskId, job);
          return;
        }
      }

      const message = t("import.tasks.error.timeout");
      setState((current) => ({
        ...current,
        importTasks: updateImportTask(current.importTasks, taskId, {
          ...buildImportFailureUpdate(new Error(message), message, {
            retryable: true
          })
        }),
        importStatus: t("app.importFailed"),
        error: message
      }));
      throw new Error(message);
    },
    [refreshWorkspaceAfterImportJob, setState, t]
  );

  const handleImportEvent = useCallback(
    (event: ImportEvent) => {
      if (event.type !== "import_job_snapshot") {
        return;
      }
      setState((current) => ({
        ...current,
        importTasks: mergeRecoveredImportTasks(
          current.importTasks,
          event.jobs.map((job) => buildImportTaskFromJob(job, t))
        ),
        importStatus: buildRecoveredImportStatus(event.jobs, current.importStatus, t)
      }));

      for (const job of event.jobs) {
        if (projectId === null || job.status !== "succeeded") {
          continue;
        }
        if (eventCompletedJobIdsRef.current.has(job.id)) {
          continue;
        }
        eventCompletedJobIdsRef.current.add(job.id);
        refreshWorkspaceAfterImportJob(projectId, `job-${job.id}`, job).catch(() => undefined);
      }
    },
    [projectId, refreshWorkspaceAfterImportJob, setState, t]
  );

  useImportEvents(projectId, handleImportEvent);

  const handleImport = useCallback(
    async (file: File) => {
      if (projectId === null) {
        return;
      }

      const taskId = createImportTaskId("file");
      setState((current) => ({
        ...current,
        importTasks: [
          buildImportTask({
            id: taskId,
            kind: "file",
            label: file.name,
            status: "running",
            progress: 35,
            summary: t("import.tasks.summary.running"),
            retryFile: file
          }),
          ...current.importTasks
        ].slice(0, 6),
        importStatus: t("app.importing", { file: file.name }),
        error: null
      }));

      try {
        const job = await createImportJob(projectId, file);
        const syncedTaskId = `job-${job.id}`;
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            ...buildImportTaskUpdateFromJob(job, t),
            id: syncedTaskId
          })
        }));
        await pollImportJob(projectId, job.id, syncedTaskId);
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.importFailed");
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            ...buildImportFailureUpdate(error, t("app.importFailed"), {
              retryable: true
            })
          }),
          importStatus: t("app.importFailed"),
          error: message
        }));
      }
    },
    [pollImportJob, projectId, setState, t]
  );

  const handleImportBatch = useCallback(
    async (files: File[]) => {
      if (projectId === null || files.length === 0) {
        return;
      }

      const taskId = createImportTaskId("batch");
      const label = t("import.tasks.batchLabel", { count: files.length });
      setState((current) => ({
        ...current,
        importTasks: [
          buildImportTask({
            id: taskId,
            kind: "batch",
            label,
            status: "running",
            progress: 25,
            summary: t("import.tasks.summary.running")
          }),
          ...current.importTasks
        ].slice(0, 6),
        importStatus: t("app.importingBatch", { count: files.length }),
        error: null
      }));

      try {
        const batch = await createImportBatch(projectId, files, label);
        await applyBatchResult(
          projectId,
          taskId,
          batch,
          setState,
          loadRelationshipGovernance,
          t,
          reviewAnalyticsTrendDays
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.importFailed");
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            ...buildImportFailureUpdate(error, t("app.importFailed"), {
              retryable: false
            })
          }),
          importStatus: t("app.importFailed"),
          error: message
        }));
      }
    },
    [loadRelationshipGovernance, projectId, reviewAnalyticsTrendDays, setState, t]
  );

  const handleImportUrl = useCallback(
    async (url: string) => {
      if (projectId === null || !url.trim()) {
        return;
      }

      const taskId = createImportTaskId("url");
      const label = t("import.tasks.urlLabel", { url });
      setState((current) => ({
        ...current,
        importTasks: [
          buildImportTask({
            id: taskId,
            kind: "url",
            label,
            status: "running",
            progress: 15,
            summary: t("import.tasks.summary.running")
          }),
          ...current.importTasks
        ].slice(0, 6),
        importStatus: t("app.importingUrl", { url }),
        error: null
      }));

      try {
        const batch = await createUrlImport(projectId, url, label);
        await applyBatchResult(
          projectId,
          taskId,
          batch,
          setState,
          loadRelationshipGovernance,
          t,
          reviewAnalyticsTrendDays
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.importFailed");
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            ...buildImportFailureUpdate(error, t("app.importFailed"), {
              retryable: false
            })
          }),
          importStatus: t("app.importFailed"),
          error: message
        }));
      }
    },
    [loadRelationshipGovernance, projectId, reviewAnalyticsTrendDays, setState, t]
  );

  const runImportFileTask = useCallback(
    async (file: File, taskId: string) => {
      if (projectId === null) {
        return;
      }

      setState((current) => ({
        ...current,
        importTasks: updateImportTask(current.importTasks, taskId, {
          status: "running",
          progress: 35,
          summary: t("import.tasks.summary.running"),
          ...clearImportFailureDetails(),
          retryable: false
        }),
        importStatus: t("app.importing", { file: file.name }),
        error: null
      }));

      try {
        const job = await createImportJob(projectId, file);
        const syncedTaskId = `job-${job.id}`;
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            ...buildImportTaskUpdateFromJob(job, t),
            id: syncedTaskId
          })
        }));
        await pollImportJob(projectId, job.id, syncedTaskId);
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.importFailed");
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            ...buildImportFailureUpdate(error, t("app.importFailed"), {
              retryable: true
            })
          }),
          importStatus: t("app.importFailed"),
          error: message
        }));
      }
    },
    [pollImportJob, projectId, setState, t]
  );

  const handleImportSample = useCallback(async () => {
    if (projectId === null) {
      return;
    }

    const taskId = createImportTaskId("sample");
    setState((current) => ({
      ...current,
      importTasks: [
        buildImportTask({
          id: taskId,
          kind: "sample",
          label: t("import.tasks.sampleLabel"),
          status: "running",
          progress: 35,
          summary: t("import.tasks.summary.running")
        }),
        ...current.importTasks
      ].slice(0, 6),
      importStatus: t("app.importingSample"),
      error: null
    }));

    try {
      const result = await importSampleDataset(projectId);
      const [
        relationshipGovernance,
        reviewAnalytics,
        reviewAnalyticsTrend,
        reviewAnalyticsSnapshotSummary,
        reviewAnalyticsSnapshotCleanupEvents,
        sourceSummaries,
        sourceInspection
      ] = await Promise.all([
        loadRelationshipGovernance(projectId),
        getReviewAnalytics(projectId).catch(() => null),
        getReviewAnalyticsTrend(projectId, reviewAnalyticsTrendDays).catch(() => null),
        getReviewAnalyticsSnapshotSummary(projectId).catch(() => null),
        getReviewAnalyticsSnapshotCleanupEvents(projectId).catch(() => []),
        loadSourceSummaries(projectId),
        loadSourceInspection(projectId)
      ]);
      applyImportResult(
        result,
        taskId,
        sourceSummaries,
        sourceInspection,
        relationshipGovernance,
        reviewAnalytics,
        reviewAnalyticsTrend,
        reviewAnalyticsSnapshotSummary,
        reviewAnalyticsSnapshotCleanupEvents
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : t("app.importFailed");
      setState((current) => ({
        ...current,
        importTasks: updateImportTask(current.importTasks, taskId, {
          ...buildImportFailureUpdate(error, t("app.importFailed"), {
            retryable: true
          })
        }),
        importStatus: t("app.importFailed"),
        error: message
      }));
    }
  }, [
    applyImportResult,
    loadRelationshipGovernance,
    projectId,
    reviewAnalyticsTrendDays,
    setState,
    t
  ]);

  const runSampleImportTask = useCallback(
    async (taskId: string) => {
      if (projectId === null) {
        return;
      }

      setState((current) => ({
        ...current,
        importTasks: updateImportTask(current.importTasks, taskId, {
          status: "running",
          progress: 35,
          summary: t("import.tasks.summary.running"),
          ...clearImportFailureDetails(),
          retryable: false
        }),
        importStatus: t("app.importingSample"),
        error: null
      }));

      try {
        const result = await importSampleDataset(projectId);
        const [
          relationshipGovernance,
          reviewAnalytics,
          reviewAnalyticsTrend,
          reviewAnalyticsSnapshotSummary,
          reviewAnalyticsSnapshotCleanupEvents,
          sourceSummaries,
          sourceInspection
        ] = await Promise.all([
          loadRelationshipGovernance(projectId),
          getReviewAnalytics(projectId).catch(() => null),
          getReviewAnalyticsTrend(projectId, reviewAnalyticsTrendDays).catch(() => null),
          getReviewAnalyticsSnapshotSummary(projectId).catch(() => null),
          getReviewAnalyticsSnapshotCleanupEvents(projectId).catch(() => []),
          loadSourceSummaries(projectId),
          loadSourceInspection(projectId)
        ]);
        applyImportResult(
          result,
          taskId,
          sourceSummaries,
          sourceInspection,
          relationshipGovernance,
          reviewAnalytics,
          reviewAnalyticsTrend,
          reviewAnalyticsSnapshotSummary,
          reviewAnalyticsSnapshotCleanupEvents
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.importFailed");
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            ...buildImportFailureUpdate(error, t("app.importFailed"), {
              retryable: true
            })
          }),
          importStatus: t("app.importFailed"),
          error: message
        }));
      }
    },
    [
      applyImportResult,
      loadRelationshipGovernance,
      projectId,
      reviewAnalyticsTrendDays,
      setState,
      t
    ]
  );

  const handleRefreshImportTask = useCallback(
    async (taskId: string) => {
      if (projectId === null) {
        return;
      }
      const task = importTasks.find((candidate) => candidate.id === taskId);
      if (!task?.jobId) {
        return;
      }

      try {
        const job = await getImportJob(projectId, task.jobId);
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            ...buildImportTaskUpdateFromJob(job, t),
            id: `job-${job.id}`
          }),
          importStatus:
            job.status === "failed"
              ? t("app.importFailed")
              : job.status === "canceled"
                ? t("import.tasks.status.canceled")
                : job.status === "succeeded" && job.summary
                  ? t("app.importComplete", {
                      sheets: job.summary.sheet_count,
                      fields: job.summary.field_count,
                      suggestions: job.summary.suggestion_count
                    })
                  : t("import.tasks.summary.running"),
          error: null
        }));
        if (job.status === "succeeded") {
          await refreshWorkspaceAfterImportJob(projectId, taskId, job);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.importFailed");
        setState((current) => ({ ...current, error: message }));
      }
    },
    [importTasks, projectId, refreshWorkspaceAfterImportJob, setState, t]
  );

  const handleRecoverImportJobs = useCallback(async () => {
    if (projectId === null || recoveringImportJobsRef.current) {
      return;
    }
    recoveringImportJobsRef.current = true;
    setIsRecoveringImportJobs(true);

    setState((current) => ({
      ...current,
      importStatus: t("import.tasks.recovering"),
      error: null
    }));

    try {
      const recovery = await recoverImportJobs(projectId);
      const jobs = await getImportJobs(projectId);
      const activeJobs = jobs.filter((job) =>
        ["staging", "queued", "running"].includes(job.status)
      );
      const recoveryStatus = t("import.tasks.recovered", {
        recovered: recovery.recovered_count,
        submitted: recovery.submitted_count
      });
      setState((current) => ({
        ...current,
        importTasks: mergeRecoveredImportTasks(
          current.importTasks,
          jobs.map((job) => buildImportTaskFromJob(job, t))
        ),
        importStatus:
          activeJobs.length > 0
            ? recoveryStatus
            : buildRecoveredImportStatus(jobs, recoveryStatus, t),
        error: null
      }));

      recoveringImportJobsRef.current = false;
      setIsRecoveringImportJobs(false);

      await Promise.all(
        activeJobs.map((job) =>
          pollImportJob(projectId, job.id, `job-${job.id}`).catch(() => undefined)
        )
      );
    } catch (error) {
      recoveringImportJobsRef.current = false;
      setIsRecoveringImportJobs(false);
      const message = error instanceof Error ? error.message : t("app.importFailed");
      setState((current) => ({
        ...current,
        importStatus: t("import.tasks.recoverFailed", { message }),
        error: message
      }));
    }
  }, [pollImportJob, projectId, setState, t]);

  const handleCancelImportTask = useCallback(
    async (taskId: string) => {
      if (projectId === null) {
        return;
      }
      const task = importTasks.find((candidate) => candidate.id === taskId);
      if (!task?.jobId) {
        return;
      }

      try {
        const job = await cancelImportJob(projectId, task.jobId);
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            ...buildImportTaskUpdateFromJob(job, t),
            id: `job-${job.id}`
          }),
          importStatus: t("import.tasks.status.canceled"),
          error: null
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.importFailed");
        setState((current) => ({ ...current, error: message }));
      }
    },
    [importTasks, projectId, setState, t]
  );

  const retryPersistedImportJob = useCallback(
    async (task: ImportTask) => {
      if (projectId === null || !task.jobId) {
        return;
      }

      setState((current) => ({
        ...current,
        importTasks: updateImportTask(current.importTasks, task.id, {
          status: "running",
          progress: Math.max(25, task.progress),
          summary: t("import.tasks.summary.running"),
          ...clearImportFailureDetails(),
          retryable: false
        }),
        importStatus: t("import.tasks.summary.running"),
        error: null
      }));

      try {
        const job = await retryImportJob(projectId, task.jobId);
        const syncedTaskId = `job-${job.id}`;
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, task.id, {
            ...buildImportTaskUpdateFromJob(job, t),
            id: syncedTaskId
          })
        }));
        await pollImportJob(projectId, job.id, syncedTaskId);
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.importFailed");
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, task.id, {
            ...buildImportFailureUpdate(error, t("app.importFailed"), {
              retryable: true
            })
          }),
          importStatus: t("app.importFailed"),
          error: message
        }));
      }
    },
    [pollImportJob, projectId, setState, t]
  );

  const handleRetryImportTask = useCallback(
    (taskId: string) => {
      const task = importTasks.find((candidate) => candidate.id === taskId);
      if (!task) {
        return;
      }
      if (task.kind === "file" && task.retryFile) {
        void runImportFileTask(task.retryFile, task.id);
        return;
      }
      if (task.jobId) {
        void retryPersistedImportJob(task);
        return;
      }
      if (task.kind === "sample") {
        void runSampleImportTask(task.id);
      }
    },
    [importTasks, retryPersistedImportJob, runImportFileTask, runSampleImportTask]
  );

  const handleRetryImportItem = useCallback(
    async (taskId: string, itemId: number) => {
      if (projectId === null) {
        return;
      }

      setState((current) => {
        const task = current.importTasks.find((candidate) => candidate.id === taskId);
        return {
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            status: "running",
            progress: 90,
            ...clearImportFailureDetails(),
            stages: task?.stages?.map((stage) =>
              stage.itemId === itemId
                ? {
                    ...stage,
                    status: "running",
                    progress: 90,
                    summary: t("import.tasks.summary.running")
                  }
                : stage
            )
          }),
          importStatus: t("import.tasks.summary.running"),
          error: null
        };
      });

      try {
        const batch = await retryImportItem(projectId, itemId);
        await applyBatchResult(
          projectId,
          taskId,
          batch,
          setState,
          loadRelationshipGovernance,
          t,
          reviewAnalyticsTrendDays
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : t("app.importFailed");
        setState((current) => ({
          ...current,
          importTasks: updateImportTask(current.importTasks, taskId, {
            ...buildImportFailureUpdate(error, t("app.importFailed"), {
              retryable: true,
              status: "partial",
              progress: current.importTasks.find((task) => task.id === taskId)?.progress ?? 100,
              summary: current.importTasks.find((task) => task.id === taskId)?.summary ?? null
            })
          }),
          importStatus: t("app.importFailed"),
          error: message
        }));
      }
    },
    [loadRelationshipGovernance, projectId, reviewAnalyticsTrendDays, setState, t]
  );

  const handleResetData = useCallback(async () => {
    if (projectId === null) {
      return;
    }
    if (!window.confirm(t("import.resetConfirm"))) {
      return;
    }

    setState((current) => ({
      ...current,
      importStatus: t("import.resetting"),
      error: null
    }));

    try {
      const result = await resetProjectData(projectId);
      setState((current) => ({
        ...current,
        graph: result.graph,
        suggestions: result.suggestions,
        relationshipGovernance: null,
        reviewAnalytics: null,
        reviewAnalyticsTrend: null,
        reviewAnalyticsSnapshotSummary: null,
        reviewAnalyticsSnapshotCleanupEvents: [],
        sourceSummaries: [],
        sourceDetails: [],
        sourceChunksBySourceId: {},
        extractedEntities: [],
        extractedRelationships: [],
        entityMatchReviews: [],
        mappingReviews: [],
        messages: [],
        highlightedGraphPath: [],
        importStatus: t("import.resetComplete"),
        importTasks: [],
        error: null
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("import.resetFailed");
      setState((current) => ({ ...current, importStatus: message, error: message }));
    }
  }, [projectId, setState, t]);

  return {
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
  };
}

function createImportTaskId(kind: ImportTask["kind"]): string {
  importTaskSequence += 1;
  return `${kind}-${Date.now()}-${importTaskSequence}`;
}

function buildImportFailureUpdate(
  error: unknown,
  fallbackMessage: string,
  {
    retryable,
    status = "failed",
    progress = 100,
    summary = null
  }: {
    retryable: boolean;
    status?: ImportTask["status"];
    progress?: number;
    summary?: string | null;
  }
): ImportFailureUpdate {
  const message = error instanceof Error ? error.message : fallbackMessage;
  if (error instanceof ApiError) {
    return {
      status,
      progress,
      summary,
      error: message,
      errorCode: error.code,
      recoveryAction: error.userAction || null,
      fieldErrors: error.fieldErrors,
      retryable: error.retryable
    };
  }
  return {
    status,
    progress,
    summary,
    error: message,
    errorCode: null,
    recoveryAction: null,
    fieldErrors: {},
    retryable
  };
}

function clearImportFailureDetails(): Pick<
  ImportTask,
  "error" | "errorCode" | "recoveryAction" | "fieldErrors"
> {
  return {
    error: null,
    errorCode: null,
    recoveryAction: null,
    fieldErrors: {}
  };
}

function buildImportTask({
  id,
  kind,
  label,
  status,
  progress,
  summary,
  retryFile
}: {
  id: string;
  kind: ImportTask["kind"];
  label: string;
  status: ImportTask["status"];
  progress: number;
  summary: string | null;
  retryFile?: File;
}): ImportTask {
  const now = Date.now();
  return {
    id,
    kind,
    label,
    status,
    progress,
    summary,
    ...clearImportFailureDetails(),
    retryable: false,
    retryFile,
    createdAt: now,
    updatedAt: now
  };
}

function updateImportTask(
  tasks: ImportTask[],
  taskId: string,
  update: Partial<ImportTask>
): ImportTask[] {
  return tasks.map((task) => (task.id === taskId ? { ...task, ...update } : task));
}

function mergeRecoveredImportTasks(
  currentTasks: ImportTask[],
  recoveredTasks: ImportTask[]
): ImportTask[] {
  const recoveredJobIds = new Set(
    recoveredTasks
      .map((task) => task.jobId)
      .filter((jobId): jobId is number => jobId !== undefined)
  );
  const localTasks = currentTasks.filter(
    (task) => task.jobId === undefined || !recoveredJobIds.has(task.jobId)
  );
  return [...recoveredTasks, ...localTasks];
}

function buildRecoveredImportStatus(
  jobs: ImportJob[],
  fallbackStatus: string | null,
  t: TFunction
): string | null {
  const newestCompletedJob = jobs.find((job) => job.status === "succeeded" && job.summary);
  if (newestCompletedJob?.summary) {
    return t("app.importComplete", {
      sheets: newestCompletedJob.summary.sheet_count,
      fields: newestCompletedJob.summary.field_count,
      suggestions: newestCompletedJob.summary.suggestion_count
    });
  }
  const newestFailedJob = jobs.find((job) => job.status === "failed");
  if (newestFailedJob) {
    return t("app.importFailed");
  }
  return fallbackStatus;
}

export function buildImportTaskFromJob(job: ImportJob, t: TFunction): ImportTask {
  return {
    id: `job-${job.id}`,
    ...buildImportTaskUpdateFromJob(job, t),
    createdAt: parseImportJobTimestamp(job.created_at, Date.now())
  };
}

function buildImportTaskUpdateFromJob(job: ImportJob, t: TFunction): ImportJobTaskUpdate {
  const createdAt = parseImportJobTimestamp(job.created_at, Date.now());
  return {
    label: job.label,
    kind: normalizeImportTaskKind(job.kind),
    status: normalizeImportTaskStatus(job.status),
    progress: clampProgress(job.progress),
    summary: buildImportTaskSummary(job, t),
    error: job.error,
    errorCode: null,
    recoveryAction: null,
    fieldErrors: {},
    retryable: job.retryable,
    jobId: job.id,
    updatedAt: parseImportJobTimestamp(job.updated_at, createdAt)
  };
}

function parseImportJobTimestamp(value: string, fallback: number): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function normalizeImportTaskKind(kind: string): ImportTask["kind"] {
  if (kind === "sample" || kind === "batch" || kind === "url") {
    return kind;
  }
  return "file";
}

function buildBatchImportTaskSummary(batch: ImportBatch, t: TFunction): string | null {
  const summary = batch.summary ?? {};
  const sheetCount = Number(summary.sheet_count ?? summary.dataset_count ?? batch.items.length);
  const fieldCount = Number(summary.field_count ?? 0);
  const suggestionCount = Number(summary.suggestion_count ?? 0);
  if (batch.status === "succeeded") {
    return t("import.tasks.summary.succeeded", {
      sheets: sheetCount,
      fields: fieldCount,
      suggestions: suggestionCount
    });
  }
  if (batch.status === "partial") {
    const succeededCount = Number(batch.summary?.succeeded_item_count ?? 0);
    const failedCount = Number(batch.summary?.failed_item_count ?? 0);
    return `${succeededCount} 个文件完成，${failedCount} 个文件失败。`;
  }
  if (batch.status === "running" || batch.status === "queued") {
    return t("import.tasks.summary.running");
  }
  return null;
}

function buildBatchImportTaskStages(batch: ImportBatch): ImportStage[] {
  return batch.items.flatMap((item) => {
    const stages = item.summary?.stages;
    if (!Array.isArray(stages)) {
      return [];
    }
    return stages.map((stage) => ({
      name: String(stage.name),
      status: String(stage.status),
      progress: clampProgress(Number(stage.progress)),
      summary: typeof stage.summary === "string" ? stage.summary : null,
      source: item.filename,
      itemId: item.id,
      retryable: item.status === "failed" && stage.name === "failed",
      diagnostics: isImportDiagnostics(stage.diagnostics) ? stage.diagnostics : undefined
    }));
  });
}

function isImportDiagnostics(value: unknown): value is ImportDiagnostics {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildBatchImportStatus(batch: ImportBatch, t: TFunction): string {
  if (batch.status === "failed") {
    return t("app.importFailed");
  }
  const summary = batch.summary ?? {};
  return t("app.importComplete", {
    sheets: Number(summary.sheet_count ?? summary.dataset_count ?? batch.items.length),
    fields: Number(summary.field_count ?? 0),
    suggestions: Number(summary.suggestion_count ?? 0)
  });
}

function buildImportTaskSummary(job: ImportJob, t: TFunction): string | null {
  if (job.summary) {
    return t("import.tasks.summary.succeeded", {
      sheets: job.summary.sheet_count,
      fields: job.summary.field_count,
      suggestions: job.summary.suggestion_count
    });
  }
  if (job.status === "staging" || job.status === "running" || job.status === "queued") {
    return t("import.tasks.summary.running");
  }
  return null;
}

function normalizeImportTaskStatus(status: string): ImportTask["status"] {
  if (
    status === "staging" ||
    status === "queued" ||
    status === "running" ||
    status === "succeeded" ||
    status === "partial" ||
    status === "failed" ||
    status === "canceled"
  ) {
    return status;
  }
  return "failed";
}

function clampProgress(progress: number): number {
  return Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function loadSourceSummaries(projectId: number): Promise<WorkspaceState["sourceSummaries"]> {
  try {
    return await getSourceSummaries(projectId);
  } catch {
    return [];
  }
}

type ImportWorkspaceRefreshData = {
  workspaceVersion?: string | null;
  graph: WorkspaceState["graph"];
  suggestions: WorkspaceState["suggestions"];
  relationshipGovernance: WorkspaceState["relationshipGovernance"];
  reviewAnalytics: WorkspaceState["reviewAnalytics"];
  reviewAnalyticsTrend: WorkspaceState["reviewAnalyticsTrend"];
  reviewAnalyticsSnapshotSummary: WorkspaceState["reviewAnalyticsSnapshotSummary"];
  reviewAnalyticsSnapshotCleanupEvents: WorkspaceState["reviewAnalyticsSnapshotCleanupEvents"];
  sourceSummaries: WorkspaceState["sourceSummaries"];
  sourceDetails: WorkspaceState["sourceDetails"];
  extractedEntities: WorkspaceState["extractedEntities"];
  extractedRelationships: WorkspaceState["extractedRelationships"];
  entityMatchReviews: WorkspaceState["entityMatchReviews"];
  mappingReviews: WorkspaceState["mappingReviews"];
};

async function loadLegacyImportRefreshData(
  projectId: number,
  loadRelationshipGovernance: (
    projectId: number
  ) => Promise<WorkspaceState["relationshipGovernance"]>,
  reviewAnalyticsTrendDays: ReviewAnalyticsTrendDays
): Promise<ImportWorkspaceRefreshData> {
  const [
    graph,
    suggestions,
    relationshipGovernance,
    reviewAnalytics,
    reviewAnalyticsTrend,
    reviewAnalyticsSnapshotSummary,
    reviewAnalyticsSnapshotCleanupEvents,
    sourceSummaries,
    sourceInspection
  ] = await Promise.all([
    getGraph(projectId),
    getRelationshipSuggestions(projectId),
    loadRelationshipGovernance(projectId),
    getReviewAnalytics(projectId).catch(() => null),
    getReviewAnalyticsTrend(projectId, reviewAnalyticsTrendDays).catch(() => null),
    getReviewAnalyticsSnapshotSummary(projectId).catch(() => null),
    getReviewAnalyticsSnapshotCleanupEvents(projectId).catch(() => []),
    loadSourceSummaries(projectId),
    loadSourceInspection(projectId)
  ]);
  return {
    graph,
    suggestions,
    relationshipGovernance,
    reviewAnalytics,
    reviewAnalyticsTrend,
    reviewAnalyticsSnapshotSummary,
    reviewAnalyticsSnapshotCleanupEvents,
    sourceSummaries,
    sourceDetails: sourceInspection.sourceDetails,
    extractedEntities: sourceInspection.extractedEntities,
    extractedRelationships: sourceInspection.extractedRelationships,
    entityMatchReviews: sourceInspection.entityMatchReviews,
    mappingReviews: sourceInspection.mappingReviews
  };
}

function workspaceStateAfterImportRefresh(
  current: WorkspaceState,
  taskId: string,
  job: ImportJob,
  t: TFunction,
  refreshData: ImportWorkspaceRefreshData
): WorkspaceState {
  return {
    ...current,
    workspaceVersion: refreshData.workspaceVersion ?? current.workspaceVersion,
    graph: refreshData.graph,
    suggestions: refreshData.suggestions,
    relationshipGovernance: refreshData.relationshipGovernance,
    reviewAnalytics: refreshData.reviewAnalytics,
    reviewAnalyticsTrend: refreshData.reviewAnalyticsTrend,
    reviewAnalyticsSnapshotSummary: refreshData.reviewAnalyticsSnapshotSummary,
    reviewAnalyticsSnapshotCleanupEvents: refreshData.reviewAnalyticsSnapshotCleanupEvents,
    sourceSummaries: refreshData.sourceSummaries,
    sourceDetails: refreshData.sourceDetails,
    sourceChunksBySourceId: {},
    extractedEntities: refreshData.extractedEntities,
    extractedRelationships: refreshData.extractedRelationships,
    entityMatchReviews: refreshData.entityMatchReviews,
    mappingReviews: refreshData.mappingReviews,
    highlightedGraphPath: [],
    importTasks: updateImportTask(current.importTasks, taskId, {
      ...buildImportTaskUpdateFromJob(job, t),
      id: `job-${job.id}`
    }),
    importStatus: job.summary
      ? t("app.importComplete", {
          sheets: job.summary.sheet_count,
          fields: job.summary.field_count,
          suggestions: job.summary.suggestion_count
        })
      : t("import.tasks.summary.succeeded", {
          sheets: 0,
          fields: 0,
          suggestions: 0
        }),
    error: null
  };
}

async function applyBatchResult(
  projectId: number,
  taskId: string,
  batch: ImportBatch,
  setState: Dispatch<SetStateAction<WorkspaceState>>,
  loadRelationshipGovernance: (
    projectId: number
  ) => Promise<WorkspaceState["relationshipGovernance"]>,
  t: TFunction,
  reviewAnalyticsTrendDays: ReviewAnalyticsTrendDays
) {
  const [
    graph,
    suggestions,
    relationshipGovernance,
    reviewAnalytics,
    reviewAnalyticsTrend,
    reviewAnalyticsSnapshotSummary,
    reviewAnalyticsSnapshotCleanupEvents,
    sourceSummaries,
    sourceInspection
  ] = await Promise.all([
    getGraph(projectId),
    getRelationshipSuggestions(projectId),
    loadRelationshipGovernance(projectId),
    getReviewAnalytics(projectId).catch(() => null),
    getReviewAnalyticsTrend(projectId, reviewAnalyticsTrendDays).catch(() => null),
    getReviewAnalyticsSnapshotSummary(projectId).catch(() => null),
    getReviewAnalyticsSnapshotCleanupEvents(projectId).catch(() => []),
    loadSourceSummaries(projectId),
    loadSourceInspection(projectId)
  ]);
  setState((current) => ({
    ...current,
    graph,
    suggestions,
    relationshipGovernance,
    reviewAnalytics,
    reviewAnalyticsTrend,
    reviewAnalyticsSnapshotSummary,
    reviewAnalyticsSnapshotCleanupEvents,
    sourceSummaries,
    ...sourceInspection,
    highlightedGraphPath: [],
    importTasks: updateImportTask(current.importTasks, taskId, {
      id: `batch-${batch.id}`,
      status: normalizeImportTaskStatus(batch.status),
      progress: Math.max(0, Math.min(100, batch.progress)),
      summary: buildBatchImportTaskSummary(batch, t),
      diagnostics: batch.summary?.diagnostics,
      error: batch.error,
      errorCode: null,
      recoveryAction: null,
      fieldErrors: {},
      retryable: false,
      stages: buildBatchImportTaskStages(batch)
    }),
    importStatus: buildBatchImportStatus(batch, t),
    error: null
  }));
}
