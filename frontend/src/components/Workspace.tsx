import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ListChecks, Network, Upload, X } from "lucide-react";
import type {
  ChatMessage,
  ChatSelectionContext,
  Citation,
  DocumentChunk,
  EntityMatchDecisionStatus,
  EntityMatchReview,
  ExtractedEntity,
  ExtractedRelationship,
  GraphAction,
  GraphActionActivity,
  GraphActionExecutionResult,
  GraphActionTargetPreview,
  GraphNode,
  GraphResponse,
  GraphSelection,
  CreatedProjectShareToken,
  ProjectSettings,
  ReviewAnalyticsTrendDays,
  ProjectShareRole,
  ProjectShareToken,
  ProjectShareTokenRevocation,
  RetrievedEvidence,
  ReviewAnalytics,
  ReviewAnalyticsSnapshotCleanupEvent,
  ReviewAnalyticsSnapshotSummary,
  ReviewAnalyticsTrend,
  RelationshipDecisionStatus,
  RelationshipGovernanceSummary,
  RelationshipModelingReview,
  RelationshipSuggestion,
  SourceDetail,
  SourceSummary
} from "../api/types";
import GraphCanvas, { type GraphFocusRequest } from "./GraphCanvas";
import type { ReviewFilter } from "./RelationshipReview";
import ImportPanel, {
  type FailedImportShortcutContext,
  type ImportDataStats
} from "./ImportPanel";
import type { ImportTask } from "./importTasks";
import {
  getNodeNeighborhood,
  getRelationshipPathSummary,
  mergeHighlightedPaths,
  type ExplorationMode,
  type RelationshipPathActionHint
} from "./graph/graphPathInsights";
import { getSelectionForEdge, getSelectionForNode } from "./graph/graphSemantics";
import DataExplorerPanel from "./workbench/DataExplorerPanel";
import InsightPanel, {
  type InsightPanelTab,
  type QualityPreviewSelection
} from "./workbench/InsightPanel";
import WorkbenchHeader, { type WorkbenchModule } from "./workbench/WorkbenchHeader";
import WorkbenchStatusBar from "./workbench/WorkbenchStatusBar";
import AISettingsPanel from "./workbench/AISettingsPanel";
import CommandPalette, { type WorkbenchCommand } from "./workbench/CommandPalette";
import { buildGraphQualitySummary, buildWorkbenchTree } from "./workbench/workbenchStats";
import { useDialogFocusTrap } from "./workbench/useDialogFocusTrap";
import { defaultProjectSettings } from "../state/workspaceStore";
import {
  persistWorkbenchLayoutPreferences,
  readWorkbenchLayoutPreferences
} from "../state/workbenchLayoutPreferences";
import {
  persistWorkbenchTheme,
  readWorkbenchTheme,
  type WorkbenchTheme
} from "../state/workbenchTheme";
import { useI18n } from "../i18n/I18nProvider";
import { useDialogEntranceMotion } from "../motion/useWorkbenchMotion";
import type { WorkspaceOperationError } from "../state/operationError";

type Props = {
  projectId?: number | null;
  theme?: WorkbenchTheme;
  graph: GraphResponse;
  suggestions?: RelationshipSuggestion[];
  relationshipGovernance?: RelationshipGovernanceSummary | null;
  reviewAnalytics?: ReviewAnalytics | null;
  reviewAnalyticsTrend?: ReviewAnalyticsTrend | null;
  reviewAnalyticsTrendDays?: ReviewAnalyticsTrendDays;
  reviewerName?: string;
  reviewAnalyticsSnapshotSummary?: ReviewAnalyticsSnapshotSummary | null;
  reviewAnalyticsSnapshotCleanupEvents?: ReviewAnalyticsSnapshotCleanupEvent[];
  highlightedGraphPath?: number[];
  onReview?: (
    suggestionId: number,
    decisionStatus: Exclude<RelationshipDecisionStatus, "pending">,
    reviewedBy?: string
  ) => void;
  messages?: ChatMessage[];
  onAsk?: (question: string, selection?: ChatSelectionContext | null) => Promise<void>;
  settings?: ProjectSettings;
  onSettingsChange?: (settings: ProjectSettings) => Promise<void>;
  operationError?: WorkspaceOperationError | null;
  onDismissOperationError?: () => void;
  onThemeChange?: (theme: WorkbenchTheme) => void;
  onBuildVectorIndex?: () => void;
  importStatus?: string | null;
  importTasks?: ImportTask[];
  isRecoveringImportJobs?: boolean;
  sourceSummaries?: SourceSummary[];
  sourceDetails?: SourceDetail[];
  sourceChunksBySourceId?: Record<number, DocumentChunk[]>;
  onLoadSourceChunks?: (sourceId: number) => Promise<DocumentChunk[]>;
  extractedEntities?: ExtractedEntity[];
  extractedRelationships?: ExtractedRelationship[];
  entityMatchReviews?: EntityMatchReview[];
  mappingReviews?: EntityMatchReview[];
  onImport?: (file: File) => void;
  onImportBatch?: (files: File[]) => void;
  onImportSample?: () => void;
  onImportUrl?: (url: string) => void;
  onConfirmRelationship?: (suggestionId: number, review: RelationshipModelingReview) => void;
  onCleanupAnalyticsSnapshots?: (retentionDays: number) => void;
  onCleanupDuplicateRelationships?: () => void;
  onReviewAnalyticsTrendDaysChange?: (days: ReviewAnalyticsTrendDays) => void;
  onReviewerNameChange?: (reviewerName: string) => void;
  onReviewEntityMatch?: (
    edgeId: number,
    decisionStatus: EntityMatchDecisionStatus
  ) => void;
  onReviewMappingEdge?: (
    edgeId: number,
    decisionStatus: EntityMatchDecisionStatus
  ) => void;
  onResetData?: () => void;
  onCancelImportTask?: (taskId: string) => void;
  onRefreshImportTask?: (taskId: string) => void;
  onRecoverImportJobs?: () => void;
  onRetryImportItem?: (taskId: string, itemId: number) => void;
  onRetryImportTask?: (taskId: string) => void;
  onClearHighlightedGraphPath?: () => void;
  onCreateProjectShareToken?: (
    projectId: number,
    role: ProjectShareRole,
    label: string
  ) => Promise<CreatedProjectShareToken>;
  onLoadProjectShareTokens?: (projectId: number) => Promise<ProjectShareToken[]>;
  onRevokeProjectShareToken?: (
    projectId: number,
    shareTokenId: number
  ) => Promise<ProjectShareTokenRevocation>;
};

const SINGLE_PANE_MODULE_QUERY = "(max-width: 1080px)";

export default function Workspace({
  projectId = null,
  theme: controlledTheme,
  graph,
  suggestions = [],
  relationshipGovernance = null,
  reviewAnalytics = null,
  reviewAnalyticsTrend = null,
  reviewAnalyticsTrendDays = 14,
  reviewerName = "",
  reviewAnalyticsSnapshotSummary = null,
  reviewAnalyticsSnapshotCleanupEvents = [],
  highlightedGraphPath = [],
  onReview = () => undefined,
  messages = [],
  onAsk = async () => undefined,
  settings = defaultProjectSettings,
  onSettingsChange = async () => undefined,
  operationError = null,
  onDismissOperationError = () => undefined,
  onThemeChange,
  onBuildVectorIndex = () => undefined,
  importStatus = null,
  importTasks = [],
  isRecoveringImportJobs = false,
  sourceSummaries = [],
  sourceDetails = [],
  sourceChunksBySourceId = {},
  onLoadSourceChunks = async () => [],
  extractedEntities = [],
  extractedRelationships = [],
  entityMatchReviews = [],
  mappingReviews = [],
  onImport = () => undefined,
  onImportBatch = () => undefined,
  onImportSample = () => undefined,
  onImportUrl = () => undefined,
  onConfirmRelationship = () => undefined,
  onCleanupAnalyticsSnapshots = () => undefined,
  onCleanupDuplicateRelationships = () => undefined,
  onReviewAnalyticsTrendDaysChange = () => undefined,
  onReviewerNameChange = () => undefined,
  onReviewEntityMatch = () => undefined,
  onReviewMappingEdge = () => undefined,
  onResetData = () => undefined,
  onCancelImportTask = () => undefined,
  onRefreshImportTask = () => undefined,
  onRecoverImportJobs = () => undefined,
  onRetryImportItem = () => undefined,
  onRetryImportTask = () => undefined,
  onClearHighlightedGraphPath = () => undefined,
  onCreateProjectShareToken = async () => {
    throw new Error("Project sharing is not connected");
  },
  onLoadProjectShareTokens = async () => [],
  onRevokeProjectShareToken = async () => {
    throw new Error("Project sharing is not connected");
  }
}: Props) {
  const { language, t } = useI18n();
  const initialLayoutPreferences = readWorkbenchLayoutPreferences();
  const [selection, setSelection] = useState<GraphSelection | null>(null);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(
    initialLayoutPreferences.leftPanelCollapsed
  );
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(
    initialLayoutPreferences.rightPanelCollapsed
  );
  const [activeModule, setActiveModule] = useState<WorkbenchModule>("graph");
  const [dataActionsOpen, setDataActionsOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [projectSharingOpen, setProjectSharingOpen] = useState(false);
  const [projectShareTokens, setProjectShareTokens] = useState<ProjectShareToken[]>([]);
  const [projectShareRole, setProjectShareRole] = useState<ProjectShareRole>("viewer");
  const [projectShareLabel, setProjectShareLabel] = useState("");
  const [createdShareToken, setCreatedShareToken] = useState<string | null>(null);
  const [projectSharingStatus, setProjectSharingStatus] = useState<string | null>(null);
  const [shareTokenCopyStatus, setShareTokenCopyStatus] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [graphFocusMode, setGraphFocusMode] = useState(initialLayoutPreferences.graphFocusMode);
  const [internalTheme, setInternalTheme] = useState<WorkbenchTheme>(() => readWorkbenchTheme());
  const theme = controlledTheme ?? internalTheme;
  const commandPaletteButtonRef = useRef<HTMLButtonElement | null>(null);
  const aiSettingsRestoreFocusRef = useRef<HTMLElement | null>(null);
  const [panelStateBeforeGraphFocus, setPanelStateBeforeGraphFocus] = useState<{
    leftPanelCollapsed: boolean;
    rightPanelCollapsed: boolean;
  } | null>(null);
  const [focusRequest, setFocusRequest] = useState<GraphFocusRequest | null>(null);
  const [explorationMode, setExplorationMode] = useState<ExplorationMode>("off");
  const [aiSelectionPath, setAiSelectionPath] = useState<number[]>([]);
  const [graphActionStates, setGraphActionStates] = useState<
    Record<string, GraphActionExecutionResult>
  >({});
  const [graphActionActivities, setGraphActionActivities] = useState<GraphActionActivity[]>([]);
  const [rightPanelTab, setRightPanelTab] = useState<InsightPanelTab>(
    suggestions.some((suggestion) => suggestion.decision_status === "pending") ? "review" : "evidence"
  );
  const [reviewInitialFilter, setReviewInitialFilter] = useState<ReviewFilter>("all");
  const [reviewShortcutFocusKey, setReviewShortcutFocusKey] = useState(0);
  const [reviewShortcutAnnouncement, setReviewShortcutAnnouncement] = useState<string | null>(null);
  const [focusedSourceRef, setFocusedSourceRef] = useState<string | null>(null);
  const [focusedEvidenceRef, setFocusedEvidenceRef] = useState<string | null>(null);
  const dataTree = useMemo(
    () => buildWorkbenchTree(graph, suggestions, language),
    [graph, language, suggestions]
  );
  const isSinglePaneModuleLayout = useMediaQuery(SINGLE_PANE_MODULE_QUERY);
  const shouldRenderGraphCanvas = activeModule === "graph" || !isSinglePaneModuleLayout;
  const graphQualitySummary = useMemo(
    () =>
      buildGraphQualitySummary(
        graph,
        suggestions,
        relationshipGovernance,
        entityMatchReviews,
        mappingReviews
      ),
    [entityMatchReviews, graph, mappingReviews, relationshipGovernance, suggestions]
  );
  const importDataStats: ImportDataStats = {
    tableCount: dataTree.tables.length,
    fieldCount: dataTree.fields.length,
    suggestionCount: suggestions.length,
    pendingSuggestionCount: suggestions.filter(
      (suggestion) => suggestion.decision_status === "pending"
    ).length,
    graphNodeCount: graph.nodes.length,
    graphEdgeCount: graph.edges.length
  };
  const importDataSummary = formatImportDataSummary(
    importDataStats.tableCount,
    importDataStats.fieldCount,
    importDataStats.suggestionCount,
    language
  );
  const workflowRecommendation = useMemo(
    () =>
      buildWorkflowRecommendation({
        graphEdgeCount: graph.edges.length,
        graphNodeCount: graph.nodes.length,
        pendingSuggestionCount: importDataStats.pendingSuggestionCount,
        t
      }),
    [graph.edges.length, graph.nodes.length, importDataStats.pendingSuggestionCount, t]
  );
  const evidenceRefSources = useMemo(
    () => buildEvidenceRefSourceTitles(sourceDetails, sourceChunksBySourceId),
    [sourceChunksBySourceId, sourceDetails]
  );
  const explorationDepth = explorationMode === "two_hop" ? 2 : 1;
  const explorationNeighborhood =
    selection?.kind === "node" && explorationMode !== "off"
      ? getNodeNeighborhood(graph, selection.node.id, explorationDepth)
      : null;
  const explorationPath = explorationNeighborhood
    ? [...explorationNeighborhood.nodeIds, ...explorationNeighborhood.edgeIds]
    : [];
  const activeHighlightedGraphPath = mergeHighlightedPaths(
    mergeHighlightedPaths(highlightedGraphPath, aiSelectionPath),
    explorationPath
  );
  const pathSummary = selection
    ? getRelationshipPathSummary(graph, selection, explorationDepth)
    : null;
  const defaultLayoutActive =
    !graphFocusMode && !leftPanelCollapsed && !rightPanelCollapsed;
  const workbenchCommands = useMemo<WorkbenchCommand[]>(
    () => [
      {
        category: t("command.category.navigation"),
        description: t("command.description.graph"),
        id: "module-graph",
        keywords: ["graph", "canvas", "关系图谱", "图谱"],
        label: t("command.module.graph"),
        onRun: () => changeModule("graph"),
        shortcut: "Ctrl+G"
      },
      {
        category: t("command.category.navigation"),
        description: t("command.description.data"),
        id: "module-data",
        keywords: ["data", "tree", "数据树", "数据"],
        label: t("command.module.data"),
        onRun: () => changeModule("data"),
        shortcut: "Ctrl+D"
      },
      {
        category: t("command.category.navigation"),
        description: t("command.description.insights"),
        id: "module-insights",
        keywords: ["insights", "review", "ai", "洞察", "审核"],
        label: t("command.module.insights"),
        onRun: () => changeModule("insights"),
        shortcut: "Ctrl+I"
      },
      {
        category: t("command.category.data"),
        description: t("command.description.import"),
        id: "open-data-intake",
        keywords: ["import", "upload", "spreadsheet", "导入", "上传"],
        label: t("workbench.openDataIntake"),
        onRun: () => setDataActionsOpen(true)
      },
      {
        category: t("command.category.ai"),
        description: t("command.description.aiSettings"),
        id: "open-ai-settings",
        keywords: ["settings", "model", "vector", "配置", "模型", "向量"],
        label: t("workbench.openAISettings"),
        onRun: openAiSettings
      },
      {
        category: t("command.category.data"),
        description: t("share.subtitle"),
        id: "open-project-sharing",
        keywords: ["share", "token", "permission", "sharing", "分享", "权限", "令牌"],
        label: t("workbench.openProjectSharing"),
        onRun: openProjectSharing
      },
      {
        category: t("command.category.layout"),
        description: t("command.description.resetLayout"),
        id: "reset-layout",
        keywords: ["reset", "layout", "恢复", "布局"],
        label: t("workbench.resetLayout"),
        onRun: resetWorkbenchLayout
      },
      {
        category: t("command.category.layout"),
        description: t("command.description.theme"),
        id: "toggle-theme",
        keywords: ["theme", "appearance", "dark", "light", "主题", "亮色", "暗色"],
        label: theme === "dark" ? t("workbench.theme.toLight") : t("workbench.theme.toDark"),
        onRun: toggleWorkbenchTheme
      }
    ],
    [t, theme]
  );
  const {
    dialogRef: dataActionsDialogRef,
    handleDialogKeyDown: handleDataActionsDialogKeyDown
  } = useDialogFocusTrap<HTMLElement>(() => setDataActionsOpen(false), dataActionsOpen);
  const {
    dialogRef: projectSharingDialogRef,
    handleDialogKeyDown: handleProjectSharingDialogKeyDown
  } = useDialogFocusTrap<HTMLElement>(() => setProjectSharingOpen(false), projectSharingOpen);
  useDialogEntranceMotion(dataActionsDialogRef);

  function closeCommandPalette({ restoreFocus = false } = {}) {
    setCommandPaletteOpen(false);
    if (restoreFocus) {
      commandPaletteButtonRef.current?.focus({ preventScroll: true });
    }
  }

  function openAiSettings() {
    aiSettingsRestoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAiSettingsOpen(true);
  }

  function openAiSettingsFromDataIntake() {
    setDataActionsOpen(false);
    openAiSettings();
  }

  function closeAiSettings() {
    const restoreFocusTarget = aiSettingsRestoreFocusRef.current;
    setAiSettingsOpen(false);
    window.setTimeout(() => {
      if (restoreFocusTarget && document.contains(restoreFocusTarget)) {
        restoreFocusTarget.focus({ preventScroll: true });
      }
    }, 0);
  }

  async function openProjectSharing() {
    setProjectSharingOpen(true);
    setProjectSharingStatus(null);
    setShareTokenCopyStatus(null);
    setCreatedShareToken(null);
    if (projectId === null) {
      return;
    }
    try {
      setProjectShareTokens(await onLoadProjectShareTokens(projectId));
    } catch (error) {
      setProjectSharingStatus(error instanceof Error ? error.message : t("share.loadFailed"));
    }
  }

  async function createShareToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (projectId === null || !projectShareLabel.trim()) {
      return;
    }
    try {
      const created = await onCreateProjectShareToken(
        projectId,
        projectShareRole,
        projectShareLabel.trim()
      );
      setCreatedShareToken(created.token);
      setShareTokenCopyStatus(null);
      setProjectShareLabel("");
      setProjectShareTokens((current) => [
        {
          id: created.id,
          project_id: created.project_id,
          role: created.role,
          label: created.label,
          created_at: created.created_at,
          last_used_at: created.last_used_at,
          revoked_at: created.revoked_at
        },
        ...current
      ]);
      setProjectSharingStatus(t("share.created"));
    } catch (error) {
      setProjectSharingStatus(error instanceof Error ? error.message : t("share.createFailed"));
    }
  }

  async function revokeShareToken(shareToken: ProjectShareToken) {
    if (projectId === null) {
      return;
    }
    try {
      await onRevokeProjectShareToken(projectId, shareToken.id);
      setProjectShareTokens((current) =>
        current.map((token) =>
          token.id === shareToken.id
            ? { ...token, revoked_at: token.revoked_at || new Date().toISOString() }
            : token
        )
      );
      setProjectSharingStatus(t("share.revoked"));
    } catch (error) {
      setProjectSharingStatus(error instanceof Error ? error.message : t("share.revokeFailed"));
    }
  }

  async function copyCreatedShareToken() {
    if (!createdShareToken || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(createdShareToken);
    setShareTokenCopyStatus(t("share.copied"));
  }

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    }

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!selection) {
      return;
    }
    const selectionStillExists =
      selection.kind === "node"
        ? graph.nodes.some((node) => node.id === selection.node.id)
        : graph.edges.some((edge) => edge.id === selection.edge.id);
    if (!selectionStillExists) {
      setSelection(null);
    }
  }, [graph.edges, graph.nodes, selection]);

  useEffect(() => {
    persistWorkbenchLayoutPreferences({
      leftPanelCollapsed,
      rightPanelCollapsed,
      graphFocusMode
    });
  }, [graphFocusMode, leftPanelCollapsed, rightPanelCollapsed]);

  useEffect(() => {
    if (controlledTheme !== undefined) {
      return;
    }
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    return () => {
      document.documentElement.removeAttribute("data-theme");
      document.body.removeAttribute("data-theme");
      document.documentElement.style.colorScheme = "";
    };
  }, [controlledTheme, theme]);

  function selectNode(node: GraphNode) {
    setSelection(getSelectionForNode(String(node.id), graph.nodes, graph.edges));
    setAiSelectionPath([]);
    setFocusRequest({ nodeId: node.id, nonce: Date.now() });
    setRightPanelTab("evidence");
    setActiveModule("graph");
  }

  function openEvidenceRef(reference: string) {
    const matchedSource = sourceDetails.find((source) =>
      evidenceRefMatchesSource(reference, source.source_ref)
    );
    if (!matchedSource) {
      return;
    }
    setFocusedSourceRef(reference);
    setFocusedEvidenceRef(reference);
    setLeftPanelCollapsed(false);
    setActiveModule("data");
  }

  function openGraphEvidenceRef(reference: string) {
    const citedEdge = findEdgeByEvidenceReference(reference, reference);
    if (!citedEdge) {
      return;
    }
    selectEdgeFromAi(citedEdge);
  }

  function selectGraphItem(nextSelection: GraphSelection | null) {
    setSelection(nextSelection);
    setAiSelectionPath([]);
    if (!nextSelection || nextSelection.kind === "edge") {
      setExplorationMode("off");
    }
    if (nextSelection) {
      setRightPanelTab("evidence");
      setActiveModule("graph");
    }
  }

  function selectQualityPreview(selection: QualityPreviewSelection) {
    const nextSelection =
      selection.kind === "node"
        ? getSelectionForNode(String(selection.id), graph.nodes, graph.edges)
        : selection.kind === "edge"
          ? getSelectionForEdge(String(selection.id), graph.nodes, graph.edges)
          : getSelectionForNode(String(selection.sourceNodeId), graph.nodes, graph.edges) ??
            getSelectionForNode(String(selection.targetNodeId), graph.nodes, graph.edges);
    if (nextSelection) {
      selectGraphItem(nextSelection);
    }
  }

  function selectCitation(citation: Citation) {
    const suggestionMatch = citation.source_ref.match(/^suggestion:(\d+)$/i);
    if (suggestionMatch) {
      const suggestionId = Number(suggestionMatch[1]);
      const citedEdge = graph.edges.find((edge) => edge.created_from_suggestion_id === suggestionId);
      if (citedEdge) {
        selectEdgeFromAi(citedEdge);
        return;
      }
    }

    const citedEdge = findEdgeByEvidenceReference(citation.source_ref, citation.label);
    if (citedEdge) {
      selectEdgeFromAi(citedEdge);
      return;
    }

    const citedNode = graph.nodes.find(
      (node) =>
        node.source_ref.toLowerCase() === citation.source_ref.toLowerCase() ||
        node.label.toLowerCase() === citation.label.toLowerCase()
    );
    if (citedNode) {
      selectNodeFromAi(citedNode);
    }
  }

  function selectRetrievedEvidence(evidence: RetrievedEvidence) {
    const suggestionMatch = evidence.source_ref.match(/^suggestion:(\d+)$/i);
    if (suggestionMatch) {
      selectCitation({
        label: evidence.label,
        source_ref: evidence.source_ref,
        citation_type: evidence.kind
      });
      return;
    }

    const citedEdge = findEdgeByEvidenceReference(evidence.source_ref, evidence.label);
    if (citedEdge) {
      selectEdgeFromAi(citedEdge);
      return;
    }

    const citedNode = graph.nodes.find(
      (node) =>
        node.source_ref.toLowerCase() === evidence.source_ref.toLowerCase() ||
        node.label.toLowerCase() === evidence.label.toLowerCase()
    );
    if (citedNode) {
      selectNodeFromAi(citedNode);
    }
  }

  function handleGraphAction(action: GraphAction) {
    if (action.type === "filter_pending_reviews") {
      if (
        action.suggestion_ids.length === 0 &&
        !suggestions.some((suggestion) => suggestion.decision_status === "pending")
      ) {
        recordGraphActionState(action, "failed", t("chat.actionResult.noReviewTarget"));
        return;
      }
      setRightPanelTab("review");
      setReviewInitialFilter("pending");
      setActiveModule("insights");
      recordGraphActionState(action, "executed", t("chat.actionResult.executed"));
      return;
    }

    if (action.type === "focus_node") {
      const node = findActionNode(action);
      if (node) {
        selectNodeFromAi(node);
        recordGraphActionState(action, "executed", t("chat.actionResult.executed"));
        return;
      }
      recordGraphActionState(action, "failed", t("chat.actionResult.missingTarget"));
      return;
    }

    if (action.type === "open_evidence") {
      const edge = findActionEdge(action);
      if (edge) {
        selectEdgeFromAi(edge);
        recordGraphActionState(action, "executed", t("chat.actionResult.executed"));
        return;
      }

      const node = findActionNode(action);
      if (node) {
        selectNodeFromAi(node);
        recordGraphActionState(action, "executed", t("chat.actionResult.executed"));
        return;
      }
      recordGraphActionState(action, "failed", t("chat.actionResult.missingTarget"));
      return;
    }

    if (action.type === "highlight_path") {
      const actionPath = actionExistingPath(action);
      if (actionPath.length === 0) {
        recordGraphActionState(action, "failed", t("chat.actionResult.missingTarget"));
        return;
      }
      setAiSelectionPath(actionPath);
      const node = findActionNode(action);
      if (node) {
        setFocusRequest({ nodeId: node.id, nonce: Date.now() });
      }
      setActiveModule("graph");
      recordGraphActionState(action, "executed", t("chat.actionResult.executed"));
      return;
    }

    recordGraphActionState(action, "failed", t("chat.actionResult.unsupported"));
  }

  function clearGraphAction(action: GraphAction) {
    setAiSelectionPath([]);
    onClearHighlightedGraphPath();
    recordGraphActionState(action, "reverted", t("chat.actionResult.reverted"));
  }

  function recordGraphActionState(
    action: GraphAction,
    status: GraphActionExecutionResult["status"],
    message: string
  ) {
    const actionId = action.id;
    setGraphActionStates((current) => ({
      ...current,
      [actionId]: {
        actionId,
        status,
        message
      }
    }));
    if (status !== "idle") {
      const createdAt = Date.now();
      setGraphActionActivities((current) => {
        const activity: GraphActionActivity = {
          id: `${action.id}-${status}-${createdAt}-${current.length}`,
          actionId: action.id,
          label: action.label,
          status,
          message,
          createdAt,
          targetPreview: graphActionActivityTargetPreview(action)
        };
        return [
          activity,
          ...current
        ].slice(0, 8);
      });
    }
  }

  function clearGraphActionActivities() {
    setGraphActionActivities([]);
  }

  function selectNodeFromAi(node: GraphNode) {
    setSelection(getSelectionForNode(String(node.id), graph.nodes, graph.edges));
    setAiSelectionPath([node.id]);
    setFocusRequest({ nodeId: node.id, nonce: Date.now() });
    setRightPanelTab("evidence");
    setActiveModule("graph");
  }

  function selectEdge(edge: GraphResponse["edges"][number]) {
    selectGraphItem({
      kind: "edge",
      edge,
      sourceNode: graph.nodes.find((node) => node.id === edge.source_node_id),
      targetNode: graph.nodes.find((node) => node.id === edge.target_node_id)
    });
  }

  function selectEdgeFromAi(edge: GraphResponse["edges"][number]) {
    setSelection({
      kind: "edge",
      edge,
      sourceNode: graph.nodes.find((node) => node.id === edge.source_node_id),
      targetNode: graph.nodes.find((node) => node.id === edge.target_node_id)
    });
    setAiSelectionPath([edge.source_node_id, edge.target_node_id, edge.id]);
    setExplorationMode("off");
    setRightPanelTab("evidence");
    setActiveModule("graph");
  }

  function selectAiPathEdge(nextSelection: GraphSelection) {
    setSelection(nextSelection);
    setExplorationMode("off");
    setRightPanelTab("evidence");
    setActiveModule("graph");
  }

  function findEdgeByEvidenceReference(sourceRef: string, label: string) {
    const normalizedSourceRef = normalizeReference(sourceRef);
    const normalizedLabel = normalizeReference(label);
    const edgeReferences = graph.edges.map((edge) => {
      const sourceNode = graph.nodes.find((node) => node.id === edge.source_node_id);
      const targetNode = graph.nodes.find((node) => node.id === edge.target_node_id);
      return {
        edge,
        edgeLabel: normalizeReference(
          `${sourceNode?.label ?? edge.source_node_id} -> ${targetNode?.label ?? edge.target_node_id}`
        )
      };
    });
    return (
      edgeReferences.find(({ edgeLabel }) => edgeLabel === normalizedLabel)?.edge ??
      edgeReferences.find(({ edge }) => {
        return (
          edgeMatchesEvidenceReference(edge, normalizedSourceRef) ||
          (edge.created_from_suggestion_id !== null &&
            normalizedSourceRef === `suggestion:${edge.created_from_suggestion_id}`)
        );
      })?.edge
    );
  }

  function findActionEdge(action: GraphAction) {
    return findActionEdges(action)[0];
  }

  function findActionEdges(action: GraphAction): GraphResponse["edges"] {
    const matchedEdges: GraphResponse["edges"] = [];
    const pushEdge = (edge: GraphResponse["edges"][number] | undefined) => {
      if (edge && !matchedEdges.some((matchedEdge) => matchedEdge.id === edge.id)) {
        matchedEdges.push(edge);
      }
    };

    action.edge_ids.forEach((id) => {
      pushEdge(graph.edges.find((edge) => edge.id === id));
    });

    action.suggestion_ids.forEach((id) => {
      pushEdge(graph.edges.find((edge) => edge.created_from_suggestion_id === id));
    });

    action.evidence_refs.forEach((reference) => {
      const normalizedReference = normalizeReference(reference);
      const suggestionMatch = normalizedReference.match(/^suggestion:(\d+)$/i);
      if (suggestionMatch) {
        const suggestionId = Number(suggestionMatch[1]);
        pushEdge(graph.edges.find((edge) => edge.created_from_suggestion_id === suggestionId));
      }
      pushEdge(
        graph.edges.find((edge) => edgeMatchesEvidenceReference(edge, normalizedReference))
      );
    });

    return matchedEdges;
  }

  function edgeMatchesEvidenceReference(
    edge: GraphResponse["edges"][number],
    normalizedReference: string
  ): boolean {
    return edgeEvidenceReferences(edge).some(
      (reference) => normalizeReference(reference) === normalizedReference
    );
  }

  function edgeEvidenceReferences(edge: GraphResponse["edges"][number]): string[] {
    return uniqueValues([edge.evidence_ref, ...(edge.evidence_refs ?? [])].filter(Boolean));
  }

  function findActionExplicitEdge(edgeId: number) {
    return graph.edges.find((edge) => edge.id === edgeId);
  }

  function findSuggestionEndpointCount(suggestionId: number) {
    const suggestion = suggestions.find((candidate) => candidate.id === suggestionId);
    if (!suggestion) {
      return 0;
    }
    return 1 + (suggestion.target_field_id === null ? 0 : 1);
  }

  function findActionNode(action: GraphAction) {
    const nodeId = action.node_ids.find((id) => graph.nodes.some((node) => node.id === id));
    return nodeId === undefined ? undefined : graph.nodes.find((node) => node.id === nodeId);
  }

  function actionExistingPath(action: GraphAction) {
    return uniqueNumbers([
      ...action.node_ids.filter((id) => graph.nodes.some((node) => node.id === id)),
      ...findActionEdges(action).flatMap((edge) => [
        edge.source_node_id,
        edge.target_node_id,
        edge.id
      ])
    ]);
  }

  function graphActionActivityTargetPreview(action: GraphAction): GraphActionTargetPreview {
    const edgeEndpointCount = action.edge_ids.reduce((count, edgeId) => {
      const edge = findActionExplicitEdge(edgeId);
      return edge ? count + 2 : count;
    }, 0);
    const suggestionEndpointCount = action.suggestion_ids.reduce(
      (count, suggestionId) => count + findSuggestionEndpointCount(suggestionId),
      0
    );

    return {
      nodeCount:
        action.node_ids.filter((id) => graph.nodes.some((node) => node.id === id)).length +
        edgeEndpointCount +
        suggestionEndpointCount +
        action.evidence_refs.length,
      edgeCount: findActionEdges(action).length,
      suggestionCount: action.suggestion_ids.length,
      evidenceCount: action.evidence_refs.length
    };
  }

  function askWithSelection(question: string) {
    return onAsk(question, selection ? selectionContext(selection) : null);
  }

  function explainSelection() {
    if (!selection) {
      return;
    }
    const question =
      selection.kind === "node"
        ? "解释当前选中节点的上下游关系，并说明证据来源。"
        : "解释当前选中关系为什么可能成立，并说明置信度和证据。";
    void onAsk(question, selectionContext(selection));
    setRightPanelTab("ai");
    setActiveModule("insights");
  }

  function askPathAction(hint: RelationshipPathActionHint) {
    if (!selection) {
      return;
    }
    void onAsk(questionForPathAction(hint), selectionContext(selection));
    setRightPanelTab("ai");
    setActiveModule("insights");
  }

  function openReviewHealthShortcut(filter: ReviewFilter) {
    setReviewInitialFilter(filter);
    setReviewShortcutFocusKey((currentKey) => currentKey + 1);
    setReviewShortcutAnnouncement(t(reviewShortcutAnnouncementKey(filter)));
    setRightPanelTab("review");
    setRightPanelCollapsed(false);
    setActiveModule("insights");
    setDataActionsOpen(false);
  }

  function runWorkflowRecommendation() {
    if (workflowRecommendation.action === "review_pending") {
      openReviewHealthShortcut("pending");
      return;
    }
    if (workflowRecommendation.action === "inspect_graph") {
      setActiveModule("graph");
      setRightPanelTab("evidence");
      setReviewShortcutAnnouncement(null);
      return;
    }
    setDataActionsOpen(true);
    setReviewShortcutAnnouncement(null);
  }

  function openFailedImportsHealthShortcut(context: FailedImportShortcutContext) {
    setReviewShortcutAnnouncement(
      t("import.health.shortcut.failures", {
        label: context.stageLabel ?? context.taskLabel ?? String(context.failedTaskCount)
      })
    );
  }

  function announceFailedImportRetryStarted(context: FailedImportShortcutContext) {
    setReviewShortcutAnnouncement(
      t("import.health.shortcut.retryStarted", {
        label: context.stageLabel ?? context.taskLabel ?? String(context.failedTaskCount)
      })
    );
  }

  function toggleGraphFocusMode(focused: boolean) {
    if (focused) {
      setPanelStateBeforeGraphFocus({ leftPanelCollapsed, rightPanelCollapsed });
      setLeftPanelCollapsed(true);
      setRightPanelCollapsed(true);
      setGraphFocusMode(true);
      return;
    }

    setGraphFocusMode(false);
    if (panelStateBeforeGraphFocus) {
      setLeftPanelCollapsed(panelStateBeforeGraphFocus.leftPanelCollapsed);
      setRightPanelCollapsed(panelStateBeforeGraphFocus.rightPanelCollapsed);
    }
    setPanelStateBeforeGraphFocus(null);
  }

  function toggleLeftPanelCollapsed() {
    if (graphFocusMode) {
      setGraphFocusMode(false);
      setPanelStateBeforeGraphFocus(null);
    }
    setLeftPanelCollapsed((current) => !current);
  }

  function toggleRightPanelCollapsed() {
    if (graphFocusMode) {
      setGraphFocusMode(false);
      setPanelStateBeforeGraphFocus(null);
    }
    setRightPanelCollapsed((current) => !current);
  }

  function resetWorkbenchLayout() {
    setGraphFocusMode(false);
    setPanelStateBeforeGraphFocus(null);
    setLeftPanelCollapsed(false);
    setRightPanelCollapsed(false);
    setActiveModule("graph");
  }

  function toggleWorkbenchTheme() {
    const nextTheme: WorkbenchTheme = theme === "dark" ? "light" : "dark";
    if (controlledTheme === undefined) {
      setInternalTheme(nextTheme);
      persistWorkbenchTheme(nextTheme);
    }
    onThemeChange?.(nextTheme);
  }

  function changeModule(nextModule: WorkbenchModule) {
    setActiveModule(nextModule);
    setReviewShortcutAnnouncement(null);
    if (nextModule === "data" && leftPanelCollapsed) {
      setLeftPanelCollapsed(false);
    }
    if (nextModule === "insights" && rightPanelCollapsed) {
      setRightPanelCollapsed(false);
    }
  }

  return (
    <div
      className={`workbench-shell pro-workbench${leftPanelCollapsed ? " is-left-collapsed" : ""}${
        rightPanelCollapsed ? " is-right-collapsed" : ""
      }${graphFocusMode ? " is-graph-focus" : ""} is-module-${activeModule} theme-${theme}`}
      data-theme={theme}
    >
      {operationError ? (
        <section aria-atomic="true" className="workbench-operation-alert" role="alert">
          <div>
            <strong>{operationError.message}</strong>
            {operationError.code ? <code>{operationError.code}</code> : null}
          </div>
          <button
            aria-label={t("app.dismissError")}
            onClick={onDismissOperationError}
            title={t("app.dismissError")}
            type="button"
          >
            <X aria-hidden="true" size={15} />
          </button>
        </section>
      ) : null}
      <WorkbenchHeader
        activeModule={activeModule}
        commandPaletteButtonRef={commandPaletteButtonRef}
        graph={graph}
        onModuleChange={changeModule}
        onOpenAISettings={openAiSettings}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenDataActions={() => setDataActionsOpen(true)}
        onOpenProjectSharing={openProjectSharing}
        onThemeToggle={toggleWorkbenchTheme}
        suggestions={suggestions}
        theme={theme}
        onSelectNode={selectNode}
      />
      <div className="workbench-module-context" aria-live="polite">
        {reviewShortcutAnnouncement ?? moduleContextLabel(activeModule)}
      </div>
      <section className="workbench-next-step" aria-label={t("workbench.nextStep.region")}>
        <div className="workbench-next-step-icon" aria-hidden="true">
          <WorkflowRecommendationIcon action={workflowRecommendation.action} />
        </div>
        <div>
          <strong>{workflowRecommendation.title}</strong>
          <span>{workflowRecommendation.description}</span>
        </div>
        <button onClick={runWorkflowRecommendation} type="button">
          <span>{workflowRecommendation.actionLabel}</span>
          <ArrowRight aria-hidden="true" size={14} />
        </button>
      </section>
      <div className="workbench-main">
        <DataExplorerPanel
          collapsed={leftPanelCollapsed}
          focusedEvidenceRef={focusedEvidenceRef}
          graph={graph}
          focusedSourceRef={focusedSourceRef}
          onActionsOpenChange={setDataActionsOpen}
          onSelectNode={selectNode}
          onToggleCollapsed={toggleLeftPanelCollapsed}
          sourceChunksBySourceId={sourceChunksBySourceId}
          sourceDetails={sourceDetails}
          extractedEntities={extractedEntities}
          extractedRelationships={extractedRelationships}
          entityMatchReviews={entityMatchReviews}
          mappingReviews={mappingReviews}
          onReviewEntityMatch={onReviewEntityMatch}
          onReviewMappingEdge={onReviewMappingEdge}
          onOpenGraphEvidenceRef={openGraphEvidenceRef}
          onLoadSourceChunks={onLoadSourceChunks}
          suggestions={suggestions}
        />
        {shouldRenderGraphCanvas ? (
          <GraphCanvas
            canExploreSelection={selection?.kind === "node"}
            explorationMode={explorationMode}
            focusRequest={focusRequest}
            graph={graph}
            graphFocusMode={graphFocusMode}
            highlightedGraphPath={activeHighlightedGraphPath}
            onAiPathEdgeSelect={selectAiPathEdge}
            onClearSelection={() => selectGraphItem(null)}
            onExplorationModeChange={setExplorationMode}
            onGraphFocusModeChange={toggleGraphFocusMode}
            onSelectionChange={selectGraphItem}
            selectedItem={selection}
            toolsDefaultOpen={false}
          />
        ) : null}
        <InsightPanel
          activeTab={rightPanelTab}
          collapsed={rightPanelCollapsed}
          highlightedGraphPath={activeHighlightedGraphPath}
          evidenceRefSources={evidenceRefSources}
          graphQualitySummary={graphQualitySummary}
          messages={messages}
          graphActionActivities={graphActionActivities}
          onAsk={askWithSelection}
          onAskPathAction={askPathAction}
          onCitationClick={selectCitation}
          onEvidenceClick={selectRetrievedEvidence}
          onOpenEvidenceRef={openEvidenceRef}
          graphActionStates={graphActionStates}
          onClearGraphActionActivities={clearGraphActionActivities}
          onClearGraphAction={clearGraphAction}
          onGraphAction={handleGraphAction}
          onExplainSelection={explainSelection}
          onBuildVectorIndex={onBuildVectorIndex}
          onOpenQualityReviewFilter={openReviewHealthShortcut}
          onSelectQualityPreview={selectQualityPreview}
          onSettingsChange={onSettingsChange}
          pathSummary={pathSummary}
          onReview={onReview}
          governanceSummary={relationshipGovernance}
          reviewAnalytics={reviewAnalytics}
          reviewAnalyticsTrend={reviewAnalyticsTrend}
          reviewAnalyticsTrendDays={reviewAnalyticsTrendDays}
          reviewerName={reviewerName}
          reviewAnalyticsSnapshotSummary={reviewAnalyticsSnapshotSummary}
          reviewAnalyticsSnapshotCleanupEvents={reviewAnalyticsSnapshotCleanupEvents}
          reviewInitialFilter={reviewInitialFilter}
          reviewShortcutFocusKey={reviewShortcutFocusKey}
          onCleanupAnalyticsSnapshots={onCleanupAnalyticsSnapshots}
          onCleanupDuplicateRelationships={onCleanupDuplicateRelationships}
          onReviewAnalyticsTrendDaysChange={onReviewAnalyticsTrendDaysChange}
          onReviewerNameChange={onReviewerNameChange}
          onTabChange={setRightPanelTab}
          onToggleCollapsed={toggleRightPanelCollapsed}
          selection={selection}
          settings={settings}
          suggestions={suggestions}
        />
      </div>
      <WorkbenchStatusBar
        graph={graph}
        highlightedGraphPath={activeHighlightedGraphPath}
        graphFocusMode={graphFocusMode}
        leftPanelCollapsed={leftPanelCollapsed}
        onResetLayout={resetWorkbenchLayout}
        resetLayoutDisabled={defaultLayoutActive}
        rightPanelCollapsed={rightPanelCollapsed}
        selection={selection}
        suggestions={suggestions}
      />
      {aiSettingsOpen ? (
        <AISettingsPanel
          settings={settings}
          onClose={closeAiSettings}
          onSave={async (nextSettings) => {
            await onSettingsChange(nextSettings);
            closeAiSettings();
          }}
        />
      ) : null}
      {projectSharingOpen ? (
        <div className="data-actions-backdrop" role="presentation">
          <section
            aria-labelledby="project-sharing-title"
            aria-modal="true"
            className={`project-sharing-dialog pro-tree-panel theme-${theme}`}
            onKeyDown={handleProjectSharingDialogKeyDown}
            ref={projectSharingDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <header>
              <div>
                <h2 id="project-sharing-title">{t("share.title")}</h2>
                <p>{t("share.subtitle")}</p>
              </div>
              <button
                aria-label={t("share.close")}
                className="panel-icon-button"
                onClick={() => setProjectSharingOpen(false)}
                title={t("share.close")}
                type="button"
              >
                <X aria-hidden="true" size={15} />
              </button>
            </header>
            <form className="project-sharing-form" onSubmit={createShareToken}>
              <label>
                {t("share.role")}
                <select
                  aria-label={t("share.role")}
                  onChange={(event) => setProjectShareRole(event.target.value as ProjectShareRole)}
                  value={projectShareRole}
                >
                  <option value="viewer">{t("share.role.viewer")}</option>
                  <option value="editor">{t("share.role.editor")}</option>
                </select>
              </label>
              <label>
                {t("share.label")}
                <input
                  aria-label={t("share.label")}
                  onChange={(event) => setProjectShareLabel(event.target.value)}
                  required
                  type="text"
                  value={projectShareLabel}
                />
              </label>
              <button disabled={projectId === null} type="submit">
                {t("share.create")}
              </button>
            </form>
            {createdShareToken ? (
              <div className="project-sharing-created">
                <strong>{t("share.createdToken")}</strong>
                <code>{createdShareToken}</code>
                <span>{t("share.createdTokenHelp")}</span>
                <button onClick={copyCreatedShareToken} type="button">
                  {t("share.copy")}
                </button>
                {shareTokenCopyStatus ? <span role="status">{shareTokenCopyStatus}</span> : null}
              </div>
            ) : null}
            {projectSharingStatus ? (
              <p className="project-sharing-status" role="status">
                {projectSharingStatus}
              </p>
            ) : null}
            <ul className="project-sharing-list" aria-label={t("share.tokens")}>
              {projectShareTokens.map((shareToken) => (
                <li key={shareToken.id}>
                  <div>
                    <strong>{shareToken.label}</strong>
                    <span>
                      {shareToken.role === "editor"
                        ? t("share.role.editor")
                        : t("share.role.viewer")}
                      {shareToken.revoked_at ? ` · ${t("share.revokedBadge")}` : ""}
                    </span>
                    <span>{t("share.createdAt", { date: formatShareTokenDate(shareToken.created_at) })}</span>
                    <span>
                      {shareToken.last_used_at
                        ? t("share.lastUsed", { date: formatShareTokenDate(shareToken.last_used_at) })
                        : t("share.neverUsed")}
                    </span>
                    {shareToken.revoked_at ? (
                      <span>{t("share.revokedAt", { date: formatShareTokenDate(shareToken.revoked_at) })}</span>
                    ) : null}
                  </div>
                  <button
                    aria-label={t("share.revokeToken", { label: shareToken.label })}
                    disabled={Boolean(shareToken.revoked_at)}
                    onClick={() => revokeShareToken(shareToken)}
                    type="button"
                  >
                    {t("share.revoke")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
      {commandPaletteOpen ? (
        <CommandPalette
          commands={workbenchCommands}
          onClose={() => closeCommandPalette({ restoreFocus: true })}
        />
      ) : null}
      {dataActionsOpen ? (
        <div className="data-actions-backdrop" role="presentation">
          <section
            className={`data-actions-dialog pro-tree-panel theme-${theme}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-actions-title"
            onKeyDown={handleDataActionsDialogKeyDown}
            ref={dataActionsDialogRef}
            tabIndex={-1}
          >
            <header>
              <h2 id="data-actions-title">{t("import.heading")}</h2>
              <button
                aria-label={language === "en-US" ? "Close data actions" : "关闭数据操作"}
                className="panel-icon-button"
                onClick={() => setDataActionsOpen(false)}
                title={language === "en-US" ? "Close data actions" : "关闭数据操作"}
                type="button"
              >
                <X aria-hidden="true" size={15} />
              </button>
            </header>
            <ImportPanel
              dataStats={importDataStats}
              dataSummary={importDataSummary}
              fieldProfiles={graph.nodes}
              importStatus={importStatus}
              importTasks={importTasks}
              isRecoveringImportJobs={isRecoveringImportJobs}
              sourceSummaries={sourceSummaries}
              relationshipGovernance={relationshipGovernance}
              relationshipCandidates={suggestions}
              onOpenDuplicateReview={() => openReviewHealthShortcut("duplicates")}
              onOpenAISettings={openAiSettingsFromDataIntake}
              onOpenFailedImports={openFailedImportsHealthShortcut}
              onOpenHighPriorityReview={() => openReviewHealthShortcut("highPriority")}
              onOpenPendingReview={() => openReviewHealthShortcut("pending")}
              onRetryFailedImportStarted={announceFailedImportRetryStarted}
              onConfirmRelationship={onConfirmRelationship}
              onImport={onImport}
              onImportBatch={onImportBatch}
              onImportSample={onImportSample}
              onImportUrl={onImportUrl}
              onResetData={onResetData}
              onCancelImportTask={onCancelImportTask}
              onRefreshImportTask={onRefreshImportTask}
              onRecoverImportJobs={onRecoverImportJobs}
              onRetryImportItem={onRetryImportItem}
              onRetryImportTask={onRetryImportTask}
              showHeading={false}
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}

function moduleContextLabel(module: WorkbenchModule) {
  const labels: Record<WorkbenchModule, string> = {
    graph: "图谱模块",
    data: "数据模块",
    insights: "洞察模块"
  };
  return labels[module];
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQuery.matches);
    updateMatches();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMatches);
      return () => mediaQuery.removeEventListener("change", updateMatches);
    }

    mediaQuery.addListener(updateMatches);
    return () => mediaQuery.removeListener(updateMatches);
  }, [query]);

  return matches;
}

type WorkflowRecommendationAction = "import_data" | "review_pending" | "inspect_graph";

function WorkflowRecommendationIcon({ action }: { action: WorkflowRecommendationAction }) {
  if (action === "review_pending") {
    return <ListChecks size={15} />;
  }
  if (action === "inspect_graph") {
    return <Network size={15} />;
  }
  return <Upload size={15} />;
}

function buildWorkflowRecommendation({
  graphEdgeCount,
  graphNodeCount,
  pendingSuggestionCount,
  t
}: {
  graphEdgeCount: number;
  graphNodeCount: number;
  pendingSuggestionCount: number;
  t: ReturnType<typeof useI18n>["t"];
}): {
  action: WorkflowRecommendationAction;
  actionLabel: string;
  description: string;
  title: string;
} {
  if (pendingSuggestionCount > 0) {
    return {
      action: "review_pending",
      actionLabel: t("workbench.nextStep.reviewAction"),
      description: t("workbench.nextStep.reviewBody"),
      title: t("workbench.nextStep.reviewTitle", { count: pendingSuggestionCount })
    };
  }
  if (graphNodeCount > 0 || graphEdgeCount > 0) {
    return {
      action: "inspect_graph",
      actionLabel: t("workbench.nextStep.graphAction"),
      description: t("workbench.nextStep.graphBody"),
      title: t("workbench.nextStep.graphTitle")
    };
  }
  return {
    action: "import_data",
    actionLabel: t("workbench.nextStep.importAction"),
    description: t("workbench.nextStep.importBody"),
    title: t("workbench.nextStep.importTitle")
  };
}

function reviewShortcutAnnouncementKey(filter: ReviewFilter) {
  const keys: Record<ReviewFilter, "import.health.shortcut.duplicates" | "import.health.shortcut.highPriority" | "import.health.shortcut.pending"> = {
    all: "import.health.shortcut.pending",
    duplicates: "import.health.shortcut.duplicates",
    highPriority: "import.health.shortcut.highPriority",
    pending: "import.health.shortcut.pending"
  };
  return keys[filter];
}

function formatImportDataSummary(
  tableCount: number,
  fieldCount: number,
  suggestionCount: number,
  language: string
): string | null {
  if (tableCount === 0 && fieldCount === 0 && suggestionCount === 0) {
    return null;
  }
  if (language === "en-US") {
    return `${tableCount} ${tableCount === 1 ? "table" : "tables"} · ${fieldCount} ${
      fieldCount === 1 ? "field" : "fields"
    } · ${suggestionCount} ${suggestionCount === 1 ? "suggestion" : "suggestions"}`;
  }
  return `${tableCount} 张表 · ${fieldCount} 个字段 · ${suggestionCount} 条建议`;
}

function selectionContext(selection: GraphSelection): ChatSelectionContext {
  return selection.kind === "node"
    ? { kind: "node", id: selection.node.id }
    : { kind: "edge", id: selection.edge.id };
}

function normalizeReference(value: string): string {
  return value.toLowerCase().replace(/\s*(?:->|→)\s*/g, "->").trim();
}

function formatShareTokenDate(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return new Date(timestamp).toISOString().slice(0, 10);
}

function evidenceRefMatchesSource(reference: string, sourceRef: string): boolean {
  const normalizedReference = reference.trim().toLowerCase();
  const normalizedSourceRef = sourceRef.trim().toLowerCase();
  return (
    normalizedReference === normalizedSourceRef ||
    normalizedReference.startsWith(`${normalizedSourceRef}#`) ||
    normalizedReference.startsWith(`${normalizedSourceRef}:`)
  );
}

function buildEvidenceRefSourceTitles(
  sourceDetails: SourceDetail[],
  sourceChunksBySourceId: Record<number, DocumentChunk[]>
): Record<string, string> {
  const titles: Record<string, string> = {};
  sourceDetails.forEach((source) => {
    titles[source.source_ref] = source.title;
    (sourceChunksBySourceId[source.id] ?? []).forEach((chunk) => {
      titles[chunk.source_ref] = source.title;
    });
  });
  return titles;
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values));
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function questionForPathAction(hint: RelationshipPathActionHint): string {
  const questions: Record<RelationshipPathActionHint, string> = {
    confirm_dimension: "请基于当前路径确认维度分组是否符合业务口径，并列出需要核对的字段和值。",
    inspect_schema: "请基于当前路径检查表结构和字段归属，并指出可能影响关系判断的结构问题。",
    review_pending: "请基于当前路径梳理待确认关系的审核优先级，并说明每条关系的证据强弱。",
    validate_foreign_key: "请基于当前路径核验外键字段的唯一性和覆盖率，并指出需要人工确认的证据。"
  };
  return questions[hint];
}
