import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  BoxSelect,
  Crosshair,
  FileCode2,
  FileImage,
  FileJson,
  Filter,
  Focus,
  GitFork,
  ImageDown,
  Layers3,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  PinOff,
  Save,
  ScanEye,
  Table2,
  Undo2,
  Maximize2,
  Minimize2,
  RotateCcw,
  SlidersHorizontal,
  X
} from "lucide-react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  SelectionMode,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance
} from "reactflow";
import "reactflow/dist/style.css";
import type { GraphFilters, GraphResponse, GraphSelection } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import type { Language } from "../i18n/messages";
import {
  createExportFileName,
  createGraphJsonExportPayload,
  createGraphMlExport,
  createSvgGraphExport
} from "./graph/graphExport";
import {
  buildGraphLayout,
  deserializeGraphLayout,
  type GraphLayoutWorkerResponse,
  type LayoutPreset
} from "./graph/graphLayout";
import {
  getFieldLineagePath,
  getNodeNeighborhood,
  getRelationshipStrengthLayers,
  getShortestRelationshipPath,
  type ExplorationMode,
  type RelationshipTraversalPath
} from "./graph/graphPathInsights";
import SemanticNode from "./graph/SemanticNode";
import {
  defaultGraphFilters,
  edgeIsVisibleForMode,
  edgeMatchesFilters,
  formatConfidence,
  getEdgeClassName,
  getRelationshipStrength,
  getRelationshipChipLabel,
  getRelationshipLabel,
  getSelectionForEdge,
  getSelectionForNode,
  graphNodeIsVisibleForMode
} from "./graph/graphSemantics";
import GraphDetailOverlay from "./workbench/GraphDetailOverlay";

type ViewMode = "analysis" | "table" | "field" | "entity";
type GraphDimensionMode = "2d" | "3d";
type StrengthFilter = "all" | "strong" | "pending";
type RelationshipGroupKey = "foreign_key" | "derived_dimension" | "other" | "structural";
type PathAnalysisMode = "shortest" | "field_lineage";

type GraphViewSnapshot = {
  filters: GraphFilters;
  hiddenEdgeIds: number[];
  hiddenNodeIds: number[];
  layoutPreset: LayoutPreset;
  name: string;
  strengthFilter: StrengthFilter;
  viewMode: ViewMode;
};

export type GraphFocusRequest = {
  nodeId: number;
  nonce: number;
};

type Props = {
  canExploreSelection?: boolean;
  explorationMode?: ExplorationMode;
  graph: GraphResponse;
  focusRequest?: GraphFocusRequest | null;
  highlightedGraphPath?: number[];
  onAiPathEdgeSelect?: (selection: GraphSelection) => void;
  onExplorationModeChange?: (mode: ExplorationMode) => void;
  selectedItem?: GraphSelection | null;
  onSelectionChange?: (selection: GraphSelection | null) => void;
  onClearSelection?: () => void;
  graphFocusMode?: boolean;
  onGraphFocusModeChange?: (focused: boolean) => void;
  toolsDefaultOpen?: boolean;
};

const nodeTypes = { semantic: SemanticNode };
const GraphCanvas3D = lazy(() => import("./graph/GraphCanvas3D"));
const LARGE_GRAPH_NODE_THRESHOLD = 45;
const RELATIONSHIP_GROUP_PAGE_SIZE = 12;

const viewModes: {
  labelKey: "graph.view.analysis" | "graph.view.table" | "graph.view.field" | "graph.view.entity";
  value: ViewMode;
}[] = [
  { labelKey: "graph.view.analysis", value: "analysis" },
  { labelKey: "graph.view.table", value: "table" },
  { labelKey: "graph.view.field", value: "field" },
  { labelKey: "graph.view.entity", value: "entity" }
];

const strengthFilters: {
  labelKey: "graph.strength.all" | "graph.strength.strong" | "graph.strength.pending";
  value: StrengthFilter;
}[] = [
  { labelKey: "graph.strength.all", value: "all" },
  { labelKey: "graph.strength.strong", value: "strong" },
  { labelKey: "graph.strength.pending", value: "pending" }
];

const explorationModes: {
  labelKey: "graph.neighborhood.off" | "graph.neighborhood.oneHop" | "graph.neighborhood.twoHop";
  value: ExplorationMode;
}[] = [
  { labelKey: "graph.neighborhood.off", value: "off" },
  { labelKey: "graph.neighborhood.oneHop", value: "one_hop" },
  { labelKey: "graph.neighborhood.twoHop", value: "two_hop" }
];

const layoutPresets: {
  icon: typeof Layers3;
  labelKey: "graph.layout.semantic" | "graph.layout.fieldFirst" | "graph.layout.compact";
  value: LayoutPreset;
}[] = [
  { icon: Layers3, labelKey: "graph.layout.semantic", value: "semantic" },
  { icon: Table2, labelKey: "graph.layout.fieldFirst", value: "field_first" },
  { icon: GitFork, labelKey: "graph.layout.compact", value: "compact" }
];

const statusFilters: { labelKey: "graph.filter.autoTrusted" | "graph.filter.suggested" | "graph.filter.accepted" | "graph.filter.edited" | "graph.filter.rejected"; value: keyof GraphFilters["statuses"] }[] = [
  { labelKey: "graph.filter.autoTrusted", value: "auto_trusted" },
  { labelKey: "graph.filter.suggested", value: "suggested" },
  { labelKey: "graph.filter.accepted", value: "accepted" },
  { labelKey: "graph.filter.edited", value: "edited" },
  { labelKey: "graph.filter.rejected", value: "rejected" }
];

const typeFilters: { labelKey: "graph.filter.contains" | "graph.filter.foreignKey" | "graph.filter.dimension"; value: keyof GraphFilters["types"] }[] = [
  { labelKey: "graph.filter.contains", value: "contains_field" },
  { labelKey: "graph.filter.foreignKey", value: "foreign_key" },
  { labelKey: "graph.filter.dimension", value: "derived_dimension" }
];

export default function GraphCanvas({
  canExploreSelection = false,
  explorationMode = "off",
  graph,
  focusRequest = null,
  highlightedGraphPath = [],
  onAiPathEdgeSelect,
  onExplorationModeChange = () => undefined,
  selectedItem = null,
  onSelectionChange = () => undefined,
  onClearSelection = () => undefined,
  graphFocusMode = false,
  onGraphFocusModeChange = () => undefined,
  toolsDefaultOpen = true
}: Props) {
  const { language, t } = useI18n();
  const [viewMode, setViewMode] = useState<ViewMode>("analysis");
  const [dimensionMode, setDimensionMode] = useState<GraphDimensionMode>("2d");
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>("semantic");
  const [strengthFilter, setStrengthFilter] = useState<StrengthFilter>("all");
  const [filters, setFilters] = useState<GraphFilters>(defaultGraphFilters);
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const [previewedEdgeId, setPreviewedEdgeId] = useState<number | null>(null);
  const [toolsOpen, setToolsOpen] = useState(toolsDefaultOpen);
  const [analysisDrawerOpen, setAnalysisDrawerOpen] = useState(false);
  const [hiddenNodeIds, setHiddenNodeIds] = useState<number[]>([]);
  const [hiddenEdgeIds, setHiddenEdgeIds] = useState<number[]>([]);
  const [boxSelectionEnabled, setBoxSelectionEnabled] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<number[]>([]);
  const [pinnedNodeIds, setPinnedNodeIds] = useState<number[]>([]);
  const [pathEndpointNodeIds, setPathEndpointNodeIds] = useState<number[]>([]);
  const [pathAnalysisResult, setPathAnalysisResult] = useState<{
    mode: PathAnalysisMode;
    path: RelationshipTraversalPath;
  } | null>(null);
  const [snapshots, setSnapshots] = useState<GraphViewSnapshot[]>([]);
  const [collapsedRelationshipGroups, setCollapsedRelationshipGroups] = useState<
    Partial<Record<RelationshipGroupKey, boolean>>
  >({ structural: true });
  const [relationshipGroupVisibleCounts, setRelationshipGroupVisibleCounts] = useState<
    Partial<Record<RelationshipGroupKey, number>>
  >({});
  const [manualNodePositions, setManualNodePositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  const hiddenNodeIdSet = useMemo(() => new Set(hiddenNodeIds), [hiddenNodeIds]);
  const hiddenEdgeIdSet = useMemo(() => new Set(hiddenEdgeIds), [hiddenEdgeIds]);
  const pinnedNodeIdSet = useMemo(() => new Set(pinnedNodeIds), [pinnedNodeIds]);

  const visibleGraph = useMemo(() => {
    const nodes = graph.nodes.filter(
      (node) => graphNodeIsVisibleForMode(node, viewMode) && !hiddenNodeIdSet.has(node.id)
    );
    const visibleNodeIds = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter(
      (edge) =>
        !hiddenEdgeIdSet.has(edge.id) &&
        edgeMatchesFilters(edge, filters) &&
        edgeIsVisibleForMode(edge, viewMode) &&
        edgeMatchesStrengthFilter(edge, strengthFilter) &&
        visibleNodeIds.has(edge.source_node_id) &&
        visibleNodeIds.has(edge.target_node_id)
    );
    return { nodes, edges };
  }, [filters, graph.edges, graph.nodes, hiddenEdgeIdSet, hiddenNodeIdSet, strengthFilter, viewMode]);

  const semanticLayout = useMemo(
    () => buildGraphLayout(visibleGraph, layoutPreset),
    [layoutPreset, visibleGraph]
  );
  const visibleRelationshipEdges = useMemo(
    () => prioritizeRelationshipShelfEdges(visibleGraph.edges),
    [visibleGraph.edges]
  );
  const legendCounts = useMemo(() => getLegendCounts(visibleGraph.edges), [visibleGraph.edges]);
  const relationshipStrengthLayers = useMemo(
    () => getRelationshipStrengthLayers(visibleGraph.edges),
    [visibleGraph.edges]
  );
  const relationshipGroups = useMemo(
    () => buildRelationshipShelfGroups(visibleRelationshipEdges),
    [visibleRelationshipEdges]
  );
  const tableMetrics = useMemo(
    () => getTableMetrics(visibleGraph.nodes, visibleGraph.edges),
    [visibleGraph.edges, visibleGraph.nodes]
  );
  const largeGraphGuard = useMemo(
    () =>
      visibleGraph.nodes.length > LARGE_GRAPH_NODE_THRESHOLD
        ? getLargeGraphGuardSummary(visibleGraph)
        : null,
    [visibleGraph]
  );
  const nodeLabelById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node.label])),
    [graph.nodes]
  );
  const previewedEdge = useMemo(
    () => visibleGraph.edges.find((edge) => edge.id === previewedEdgeId) ?? null,
    [previewedEdgeId, visibleGraph.edges]
  );
  const highlightedEdgeIds = useMemo(
    () =>
      uniqueNumbers([
        ...highlightedGraphPath,
        ...(pathAnalysisResult?.path.edgeIds ?? []),
        ...(previewedEdgeId === null ? [] : [previewedEdgeId])
      ]),
    [highlightedGraphPath, pathAnalysisResult, previewedEdgeId]
  );
  const highlightedNodeIds = useMemo(
    () => new Set([...(pathAnalysisResult?.path.nodeIds ?? []), ...pathEndpointNodeIds]),
    [pathAnalysisResult, pathEndpointNodeIds]
  );
  const activeNeighborhood = useMemo(() => {
    if (selectedItem?.kind !== "node" || explorationMode === "off") {
      return null;
    }
    return getNodeNeighborhood(
      visibleGraph,
      selectedItem.node.id,
      explorationMode === "two_hop" ? 2 : 1
    );
  }, [explorationMode, selectedItem, visibleGraph]);
  const neighborhoodNodeIds = useMemo(
    () => new Set(activeNeighborhood?.nodeIds ?? []),
    [activeNeighborhood]
  );
  const neighborhoodEdgeIds = useMemo(
    () => new Set(activeNeighborhood?.edgeIds ?? []),
    [activeNeighborhood]
  );
  const neighborhoodSummary = useMemo(() => {
    if (!activeNeighborhood) {
      return null;
    }
    const edgeIds = new Set(activeNeighborhood.edgeIds);
    const neighborhoodEdges = visibleGraph.edges.filter((edge) => edgeIds.has(edge.id));
    return {
      depthLabel:
        explorationMode === "two_hop"
          ? t("graph.neighborhood.twoHop")
          : t("graph.neighborhood.oneHop"),
      edgeCount: activeNeighborhood.edgeIds.length,
      nodeCount: activeNeighborhood.nodeIds.length,
      pendingCount: neighborhoodEdges.filter((edge) => edge.status === "suggested").length
    };
  }, [activeNeighborhood, explorationMode, t, visibleGraph.edges]);
  const aiPathSummary = useMemo(
    () => getAiPathSummary(visibleGraph, highlightedGraphPath, language),
    [highlightedGraphPath, language, visibleGraph]
  );
  const currentAiPathPosition = useMemo(
    () => getCurrentAiPathPosition(aiPathSummary, selectedItem),
    [aiPathSummary, selectedItem]
  );
  const visibleSelectedItem =
    selectedItem && selectionIsHidden(selectedItem, hiddenNodeIdSet, hiddenEdgeIdSet)
      ? null
      : selectedItem;
  const hiddenSummary =
    hiddenNodeIds.length > 0 || hiddenEdgeIds.length > 0
      ? t("graph.hidden.summary", {
          edgeCount: hiddenEdgeIds.length,
          nodeCount: hiddenNodeIds.length
        })
      : null;
  const selectionSummary =
    selectedNodeIds.length > 1 || selectedEdgeIds.length > 0
      ? t("graph.selection.summary", {
          edgeCount: selectedEdgeIds.length,
          nodeCount: selectedNodeIds.length
        })
      : null;
  const pinnedSummary =
    pinnedNodeIds.length > 0
      ? t("graph.pinned.summary", { count: pinnedNodeIds.length })
      : t("graph.pinned.none");
  const hasSelectedNodes = selectedNodeIds.length > 0;
  const hasPathEndpoints = pathEndpointNodeIds.length === 2;
  const canBuildFieldLineagePath =
    hasPathEndpoints &&
    pathEndpointNodeIds.every(
      (nodeId) => graph.nodes.find((node) => node.id === nodeId)?.node_type === "field"
    );

  useEffect(() => {
    if (visibleGraph.nodes.length <= LARGE_GRAPH_NODE_THRESHOLD || typeof Worker === "undefined") {
      return undefined;
    }

    const worker = new Worker(new URL("./graph/graphLayout.worker.ts", import.meta.url), {
      type: "module"
    });
    worker.onmessage = (event: MessageEvent<GraphLayoutWorkerResponse>) => {
      if (event.data.layoutPreset !== layoutPreset) {
        return;
      }
      setManualNodePositions(Object.fromEntries(deserializeGraphLayout(event.data.positions)));
    };
    worker.postMessage({ graph: visibleGraph, layoutPreset });

    return () => {
      worker.terminate();
    };
  }, [layoutPreset, visibleGraph]);

  const nodes: Node[] = useMemo(
    () =>
      visibleGraph.nodes.map((node) => {
        const neighborhoodActive = activeNeighborhood !== null;
        const isNeighborhoodNode = neighborhoodNodeIds.has(node.id);
        const isPathHighlightedNode = highlightedGraphPath.includes(node.id);
        const isPathAnalysisNode = highlightedNodeIds.has(node.id);
        const isSelectedEdgeEndpoint =
          selectedItem?.kind === "edge" &&
          (selectedItem.edge.source_node_id === node.id || selectedItem.edge.target_node_id === node.id);
        const isPreviewedEdgeEndpoint =
          previewedEdge !== null &&
          (previewedEdge.source_node_id === node.id || previewedEdge.target_node_id === node.id);
        return {
          id: String(node.id),
          draggable: !pinnedNodeIdSet.has(node.id),
          position:
            manualNodePositions[String(node.id)] ??
            semanticLayout.get(node.id) ??
            { x: node.position_x, y: node.position_y },
          data: {
            graphNode: node,
            highlighted:
              isPathHighlightedNode ||
              isPathAnalysisNode ||
              isSelectedEdgeEndpoint ||
              isPreviewedEdgeEndpoint,
            ...tableMetrics.get(node.id)
          },
          type: "semantic",
          className: getNodeClassName({
            dimmed: neighborhoodActive && !isNeighborhoodNode && !isPathHighlightedNode,
            neighborhood: neighborhoodActive && isNeighborhoodNode,
            pathAnalysis: isPathAnalysisNode,
            selected: selectedItem?.kind === "node" && selectedItem.node.id === node.id
          })
        };
      }),
    [
      activeNeighborhood,
      highlightedGraphPath,
      highlightedNodeIds,
      manualNodePositions,
      neighborhoodNodeIds,
      previewedEdge,
      pinnedNodeIdSet,
      selectedItem,
      semanticLayout,
      tableMetrics,
      visibleGraph.nodes
    ]
  );

  const edges: Edge[] = useMemo(
    () =>
      visibleGraph.edges.map((edge) => {
        const neighborhoodActive = activeNeighborhood !== null;
        const isNeighborhoodEdge = neighborhoodEdgeIds.has(edge.id);
        const isPathHighlightedEdge = highlightedEdgeIds.includes(edge.id);
        return {
          id: String(edge.id),
          source: String(edge.source_node_id),
          target: String(edge.target_node_id),
          label: getRelationshipLabel(edge.edge_type, language),
          ariaLabel: getRelationshipLabel(edge.edge_type, language),
          className: [
            getEdgeClassName(edge, highlightedEdgeIds),
            neighborhoodActive && isNeighborhoodEdge ? "is-neighborhood" : "",
            neighborhoodActive && !isNeighborhoodEdge && !isPathHighlightedEdge ? "is-dimmed" : ""
          ]
            .filter(Boolean)
            .join(" "),
          markerEnd: { type: MarkerType.ArrowClosed },
          selected: selectedItem?.kind === "edge" && selectedItem.edge.id === edge.id
        };
      }),
    [
      activeNeighborhood,
      highlightedEdgeIds,
      language,
      neighborhoodEdgeIds,
      selectedItem,
      visibleGraph.edges
    ]
  );

  function toggleStatus(status: keyof GraphFilters["statuses"]) {
    setFilters((current) => ({
      ...current,
      statuses: { ...current.statuses, [status]: !current.statuses[status] }
    }));
  }

  function toggleType(type: keyof GraphFilters["types"]) {
    setFilters((current) => ({
      ...current,
      types: { ...current.types, [type]: !current.types[type] }
    }));
  }

  function focusSelection() {
    if (!instance || !selectedItem) {
      return;
    }
    if (selectedItem.kind === "node") {
      instance.fitView({ nodes: [{ id: String(selectedItem.node.id) }], padding: 0.35 });
      return;
    }
    instance.fitView({
      nodes: [
        { id: String(selectedItem.edge.source_node_id) },
        { id: String(selectedItem.edge.target_node_id) }
      ],
      padding: 0.35
    });
  }

  function focusEdge(edge: GraphResponse["edges"][number]) {
    instance?.fitView({
      nodes: [
        { id: String(edge.source_node_id) },
        { id: String(edge.target_node_id) }
      ],
      padding: 0.35
    });
  }

  function focusAiPath() {
    if (!aiPathSummary || aiPathSummary.nodeIds.length === 0) {
      return;
    }
    instance?.fitView({
      nodes: aiPathSummary.nodeIds.map((id) => ({ id: String(id) })),
      padding: 0.28
    });
  }

  function selectAiPathSegment(edge: GraphResponse["edges"][number]) {
    const nextSelection = getSelectionForEdge(String(edge.id), graph.nodes, graph.edges);
    if (nextSelection) {
      (onAiPathEdgeSelect ?? onSelectionChange)(nextSelection);
      focusEdge(edge);
    }
  }

  function selectRelativeAiPathSegment(direction: -1 | 1) {
    if (!aiPathSummary || aiPathSummary.segments.length === 0) {
      return;
    }

    const selectedSegmentIndex =
      selectedItem?.kind === "edge"
        ? aiPathSummary.segments.findIndex((segment) => segment.edge.id === selectedItem.edge.id)
        : -1;
    const currentIndex = selectedSegmentIndex === -1 ? 0 : selectedSegmentIndex;
    const nextIndex =
      (currentIndex + direction + aiPathSummary.segments.length) % aiPathSummary.segments.length;

    selectAiPathSegment(aiPathSummary.segments[nextIndex].edge);
  }

  function resetLayout() {
    setManualNodePositions({});
    setLayoutPreset("semantic");
    window.requestAnimationFrame(() => {
      instance?.fitView({ padding: 0.2 });
    });
  }

  function resetFilters() {
    setFilters(defaultGraphFilters);
    setStrengthFilter("all");
  }

  function changeLayoutPreset(nextLayoutPreset: LayoutPreset) {
    setLayoutPreset(nextLayoutPreset);
    setManualNodePositions({});
    window.requestAnimationFrame(() => {
      instance?.fitView({ padding: 0.24 });
    });
  }

  function hideSelection() {
    if (!selectedItem) {
      return;
    }
    if (selectedItem.kind === "node") {
      setHiddenNodeIds((current) => uniqueNumbers([...current, selectedItem.node.id]));
      onClearSelection();
      return;
    }
    setHiddenEdgeIds((current) => uniqueNumbers([...current, selectedItem.edge.id]));
    onClearSelection();
  }

  function restoreHiddenItems() {
    setHiddenNodeIds([]);
    setHiddenEdgeIds([]);
  }

  function rememberPathEndpoint(nodeId: number) {
    setPathEndpointNodeIds((current) => uniqueNumbers([...current.filter((id) => id !== nodeId), nodeId]).slice(-2));
    setPathAnalysisResult(null);
  }

  function highlightShortestPath() {
    if (!hasPathEndpoints) {
      return;
    }
    const path = getShortestRelationshipPath(graph, pathEndpointNodeIds[0], pathEndpointNodeIds[1]);
    if (path) {
      setPathAnalysisResult({ mode: "shortest", path });
      focusPath(path);
    }
  }

  function highlightFieldLineagePath() {
    if (!canBuildFieldLineagePath) {
      return;
    }
    const path = getFieldLineagePath(graph, pathEndpointNodeIds[0], pathEndpointNodeIds[1]);
    if (path) {
      setPathAnalysisResult({ mode: "field_lineage", path });
      focusPath(path);
    }
  }

  function clearPathAnalysis() {
    setPathEndpointNodeIds([]);
    setPathAnalysisResult(null);
  }

  function focusPath(path: RelationshipTraversalPath) {
    window.requestAnimationFrame(() => {
      instance?.fitView({
        nodes: path.nodeIds.map((id) => ({ id: String(id) })),
        padding: 0.28
      });
    });
  }

  function toggleBoxSelection() {
    setBoxSelectionEnabled((current) => !current);
  }

  function pinSelectedNodes() {
    if (selectedNodeIds.length === 0) {
      return;
    }
    setPinnedNodeIds((current) => uniqueNumbers([...current, ...selectedNodeIds]));
  }

  function unpinSelectedNodes() {
    if (selectedNodeIds.length === 0) {
      return;
    }
    const selectedNodeIdSet = new Set(selectedNodeIds);
    setPinnedNodeIds((current) => current.filter((nodeId) => !selectedNodeIdSet.has(nodeId)));
  }

  function saveSnapshot() {
    const snapshotNumber = snapshots.length + 1;
    setSnapshots((current) => [
      ...current,
      {
        filters: cloneGraphFilters(filters),
        hiddenEdgeIds,
        hiddenNodeIds,
        layoutPreset,
        name: t("graph.snapshot.defaultName", { count: snapshotNumber }),
        strengthFilter,
        viewMode
      }
    ]);
  }

  function applySnapshot(snapshot: GraphViewSnapshot) {
    setFilters(cloneGraphFilters(snapshot.filters));
    setHiddenEdgeIds(snapshot.hiddenEdgeIds);
    setHiddenNodeIds(snapshot.hiddenNodeIds);
    setLayoutPreset(snapshot.layoutPreset);
    setManualNodePositions({});
    setStrengthFilter(snapshot.strengthFilter);
    setViewMode(snapshot.viewMode);
    window.requestAnimationFrame(() => {
      instance?.fitView({ padding: 0.24 });
    });
  }

  function exportVisibleGraphJson() {
    if (typeof document === "undefined" || typeof URL === "undefined") {
      return;
    }
    const payload = createGraphJsonExportPayload(visibleGraph, {
      filters,
      hiddenEdgeIds,
      hiddenNodeIds,
      layoutPreset,
      viewMode
    });
    downloadTextFile(JSON.stringify(payload, null, 2), createExportFileName("json"), "application/json");
  }

  function exportVisibleGraphMl() {
    downloadTextFile(createGraphMlExport(visibleGraph), createExportFileName("graphml"), "application/graphml+xml");
  }

  function exportVisibleGraphSvg() {
    downloadTextFile(
      createSvgGraphExport(visibleGraph, semanticLayout, language),
      createExportFileName("svg"),
      "image/svg+xml"
    );
  }

  function exportVisibleGraphPng() {
    const flowCanvas = document.querySelector<HTMLCanvasElement>(".graph-canvas canvas");
    if (!flowCanvas) {
      exportVisibleGraphSvg();
      return;
    }
    flowCanvas.toBlob((blob) => {
      if (!blob) {
        exportVisibleGraphSvg();
        return;
      }
      downloadBlob(blob, createExportFileName("png"));
    }, "image/png");
  }

  function handleNodesChange(changes: NodeChange[]) {
    const positionChanges = changes.filter(
      (
        change
      ): change is Extract<NodeChange, { type: "position" }> & {
        position: { x: number; y: number };
      } => change.type === "position" && change.position !== undefined
    );
    if (positionChanges.length === 0) {
      return;
    }

    const movablePositionChanges = positionChanges.filter(
      (change) => !pinnedNodeIdSet.has(Number(change.id))
    );
    if (movablePositionChanges.length === 0) {
      return;
    }

    setManualNodePositions((current) => {
      const next = { ...current };
      for (const change of movablePositionChanges) {
        next[change.id] = change.position;
      }
      return next;
    });
  }

  function handleFlowSelectionChange(selection: { edges: Edge[]; nodes: Node[] }) {
    const nextNodeIds = selection.nodes.map((node) => Number(node.id)).filter(Number.isFinite);
    const nextEdgeIds = selection.edges.map((edge) => Number(edge.id)).filter(Number.isFinite);
    setSelectedNodeIds((current) => (numberArraysEqual(current, nextNodeIds) ? current : nextNodeIds));
    setSelectedEdgeIds((current) => (numberArraysEqual(current, nextEdgeIds) ? current : nextEdgeIds));
  }

  function handleNodeClick(nodeId: string) {
    const nextSelection = getSelectionForNode(nodeId, graph.nodes, graph.edges);
    if (nextSelection?.kind === "node") {
      rememberPathEndpoint(nextSelection.node.id);
    }
    onSelectionChange(nextSelection);
  }

  function toggleRelationshipGroup(groupKey: RelationshipGroupKey) {
    setCollapsedRelationshipGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey]
    }));
  }

  function showMoreRelationshipGroupItems(groupKey: RelationshipGroupKey) {
    setRelationshipGroupVisibleCounts((current) => ({
      ...current,
      [groupKey]: (current[groupKey] ?? RELATIONSHIP_GROUP_PAGE_SIZE) + RELATIONSHIP_GROUP_PAGE_SIZE
    }));
  }

  useEffect(() => {
    if (!instance || !focusRequest) {
      return;
    }
    instance.fitView({ nodes: [{ id: String(focusRequest.nodeId) }], padding: 0.35 });
  }, [focusRequest, instance]);

  const relationshipShelf =
    graph.nodes.length > 0 ? (
      <div className="edge-summary" role="group" aria-label={t("graph.relationships")}>
        {relationshipGroups.length === 0 ? (
          <div className="edge-summary-empty">
            <strong>{t("graph.relationships.emptyTitle")}</strong>
            <span>{t("graph.relationships.emptyDescription")}</span>
          </div>
        ) : null}
        {relationshipGroups.map((group) => {
          const collapsed = collapsedRelationshipGroups[group.key] ?? false;
          const groupLabel = getRelationshipGroupLabel(group.key, language);
          const visibleEdgeCount = Math.min(
            relationshipGroupVisibleCounts[group.key] ?? RELATIONSHIP_GROUP_PAGE_SIZE,
            group.edges.length
          );
          const visibleEdges = group.edges.slice(0, visibleEdgeCount);
          const hasHiddenWindowItems = visibleEdgeCount < group.edges.length;
          return (
            <section
              aria-label={groupLabel}
              className={`edge-summary-group is-${group.key.replace(/_/g, "-")}${collapsed ? " is-collapsed" : ""}`}
              key={group.key}
              role="group"
            >
              <div className="edge-summary-group-heading">
                <button
                  aria-expanded={!collapsed}
                  aria-label={`${collapsed ? t("graph.relationshipGroup.expand") : t("graph.relationshipGroup.collapse")}${groupLabel}`}
                  onClick={() => toggleRelationshipGroup(group.key)}
                  type="button"
                >
                  <span aria-hidden>{collapsed ? "+" : "-"}</span>
                  <strong>{groupLabel}</strong>
                </button>
                <span>{t("graph.relationshipGroup.count", { count: group.edges.length })}</span>
                {group.pendingCount > 0 ? (
                  <span>{t("graph.relationshipGroup.pending", { count: group.pendingCount })}</span>
                ) : null}
                {group.edges.length > RELATIONSHIP_GROUP_PAGE_SIZE ? (
                  <span>{t("graph.relationshipGroup.visible", { total: group.edges.length, visible: visibleEdgeCount })}</span>
                ) : null}
              </div>
              {collapsed ? null : (
                <>
                  <div className="edge-summary-cards">
                    {visibleEdges.map((edge) => (
                      <button
                        aria-label={`${relationshipEndpointLabel(edge, nodeLabelById)} · ${getRelationshipChipLabel(edge, language)}`}
                        className={getRelationshipCardClassName({
                          dimmed: activeNeighborhood !== null && !neighborhoodEdgeIds.has(edge.id),
                          highlighted: highlightedEdgeIds.includes(edge.id),
                          neighborhood: activeNeighborhood !== null && neighborhoodEdgeIds.has(edge.id),
                          previewed: previewedEdgeId === edge.id
                        })}
                        key={edge.id}
                        onBlur={() => setPreviewedEdgeId(null)}
                        onClick={() =>
                          onSelectionChange(getSelectionForEdge(String(edge.id), graph.nodes, graph.edges))
                        }
                        onFocus={() => setPreviewedEdgeId(edge.id)}
                        onMouseEnter={() => setPreviewedEdgeId(edge.id)}
                        onMouseLeave={() => setPreviewedEdgeId(null)}
                        type="button"
                      >
                        <span>{relationshipEndpointLabel(edge, nodeLabelById)}</span>
                        <small>{getRelationshipChipLabel(edge, language)}</small>
                      </button>
                    ))}
                  </div>
                  {hasHiddenWindowItems ? (
                    <button
                      aria-label={t("graph.relationshipGroup.showMore", { label: groupLabel })}
                      className="edge-summary-more"
                      onClick={() => showMoreRelationshipGroupItems(group.key)}
                      type="button"
                    >
                      {t("graph.relationshipGroup.showMore", { label: groupLabel })}
                    </button>
                  ) : null}
                </>
              )}
            </section>
          );
        })}
      </div>
    ) : null;

  const neighborhoodSummaryCard = neighborhoodSummary ? (
    <div
      aria-label={t("graph.neighborhood.summary")}
      className="graph-neighborhood-summary nodrag nopan"
      role="status"
    >
      <strong>{t("graph.neighborhood.summary")}</strong>
      <span>{neighborhoodSummary.depthLabel}</span>
      <span>{t("graph.neighborhood.summaryNodes", { count: neighborhoodSummary.nodeCount })}</span>
      <span>{t("graph.neighborhood.summaryEdges", { count: neighborhoodSummary.edgeCount })}</span>
      <span>{t("graph.neighborhood.summaryPending", { count: neighborhoodSummary.pendingCount })}</span>
    </div>
  ) : null;

  const aiPathSummaryCard = aiPathSummary ? (
    <div
      aria-label={t("graph.aiPath.summary")}
      className="graph-ai-path-summary nodrag nopan"
      role="status"
    >
      <strong>{t("graph.aiPath.summary")}</strong>
      {aiPathSummary.segments.length > 0 ? (
        <span className="path-segments">
          {aiPathSummary.segments.length > 1 ? (
            <span className="path-navigation" aria-label={t("graph.aiPath.navigation")}>
              <button
                aria-label={t("graph.aiPath.previousSegment")}
                onClick={() => selectRelativeAiPathSegment(-1)}
                type="button"
              >
                <span aria-hidden>{"<"}</span>
              </button>
              <button
                aria-label={t("graph.aiPath.focusFullPath")}
                onClick={focusAiPath}
                type="button"
              >
                <span aria-hidden>{"[]"}</span>
              </button>
              <button
                aria-label={t("graph.aiPath.nextSegment")}
                onClick={() => selectRelativeAiPathSegment(1)}
                type="button"
              >
                <span aria-hidden>{">"}</span>
              </button>
            </span>
          ) : null}
          {aiPathSummary.segments.map((segment, index) => (
            <button
              aria-label={t("graph.aiPath.viewSegment", {
                label: `${segment.label} · ${segment.metaLabel} · ${segment.evidenceLabel}`
              })}
              className={
                selectedItem?.kind === "edge" && selectedItem.edge.id === segment.edge.id
                  ? "is-current"
                  : ""
              }
              key={segment.edge.id}
              onBlur={() => setPreviewedEdgeId(null)}
              onClick={() => selectAiPathSegment(segment.edge)}
              onFocus={() => setPreviewedEdgeId(segment.edge.id)}
              onMouseEnter={() => setPreviewedEdgeId(segment.edge.id)}
              onMouseLeave={() => setPreviewedEdgeId(null)}
              type="button"
            >
              {aiPathSummary.segments.length > 1 ? (
                <span className="path-segment-index">
                  {index + 1}/{aiPathSummary.segments.length}
                </span>
              ) : null}
              <span className="path-segment-endpoints">{segment.label}</span>
              <span className="path-segment-meta">{segment.metaLabel}</span>
              <span className="path-segment-evidence">
                <span className="path-evidence-chip">{segment.strengthEvidenceLabel}</span>
                <span className="path-evidence-chip">{segment.sourceEvidenceLabel}</span>
              </span>
            </button>
          ))}
        </span>
      ) : (
        <span className="path-label">{aiPathSummary.label}</span>
      )}
      {currentAiPathPosition ? (
        <span className="path-current-position">
          {t("graph.aiPath.currentSegment", currentAiPathPosition)}
        </span>
      ) : null}
      <span>{formatNodeCount(aiPathSummary.nodeCount, language)}</span>
      <span>{formatRelationshipCount(aiPathSummary.edgeCount, language)}</span>
      <span>{formatPendingCount(aiPathSummary.pendingCount, language)}</span>
      <span>{t(aiPathSummary.strengthLabelKey)}</span>
    </div>
  ) : null;

  const pathAnalysisSummaryCard = pathAnalysisResult ? (
    <div
      aria-label={t("graph.path.result")}
      className="graph-path-analysis-summary nodrag nopan"
      role="status"
    >
      <strong>{t("graph.path.result")}</strong>
      <span>{t(pathAnalysisModeLabelKey(pathAnalysisResult.mode))}</span>
      <span>{formatNodeCount(pathAnalysisResult.path.nodeIds.length, language)}</span>
      <span>{formatRelationshipCount(pathAnalysisResult.path.edgeIds.length, language)}</span>
    </div>
  ) : null;

  const hasAnalysisDrawerContent =
    relationshipShelf !== null ||
    neighborhoodSummaryCard !== null ||
    aiPathSummaryCard !== null ||
    pathAnalysisSummaryCard !== null;

  return (
    <section
      className={`graph-panel is-${viewMode}-mode${toolsOpen ? " is-tools-open" : ""}${
        analysisDrawerOpen ? " is-analysis-drawer-open" : ""
      }`}
    >
      <div className="panel-heading graph-heading">
        <div className="graph-heading-main">
          <h2>{t("graph.title")}</h2>
          <div className="graph-heading-metrics" aria-label={t("graph.visibleSummary")}>
            <span>{formatNodeCount(visibleGraph.nodes.length, language)}</span>
            <span>{formatRelationshipCount(visibleGraph.edges.length, language)}</span>
            <span>{formatConfidence(filters.minConfidence)}</span>
          </div>
        </div>
        <div className="graph-heading-actions">
          <button
            aria-expanded={toolsOpen}
            aria-label={toolsOpen ? t("graph.tools.collapse") : t("graph.tools.expand")}
            className="graph-tools-toggle"
            onClick={() => setToolsOpen((current) => !current)}
            title={toolsOpen ? t("graph.tools.collapse") : t("graph.tools.expand")}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" size={15} />
            <span>{toolsOpen ? t("graph.tools.collapse") : t("graph.tools.expand")}</span>
          </button>
          <button
            aria-controls="graph-analysis-drawer"
            aria-expanded={analysisDrawerOpen}
            aria-label={analysisDrawerOpen ? t("graph.analysis.close") : t("graph.analysis.open")}
            className={analysisDrawerOpen ? "graph-analysis-toggle active" : "graph-analysis-toggle"}
            onClick={() => setAnalysisDrawerOpen((current) => !current)}
            title={analysisDrawerOpen ? t("graph.analysis.close") : t("graph.analysis.open")}
            type="button"
          >
            {analysisDrawerOpen ? (
              <PanelRightClose aria-hidden="true" size={15} />
            ) : (
              <PanelRightOpen aria-hidden="true" size={15} />
            )}
            <span>{analysisDrawerOpen ? t("graph.analysis.close") : t("graph.analysis.open")}</span>
          </button>
          <button
            aria-pressed={graphFocusMode}
            aria-label={graphFocusMode ? t("graph.focusMode.exit") : t("graph.focusMode.enter")}
            className={graphFocusMode ? "graph-focus-action active" : "graph-focus-action"}
            onClick={() => onGraphFocusModeChange(!graphFocusMode)}
            title={graphFocusMode ? t("graph.focusMode.exit") : t("graph.focusMode.enter")}
            type="button"
          >
            {graphFocusMode ? <Minimize2 aria-hidden="true" size={15} /> : <Maximize2 aria-hidden="true" size={15} />}
            <span>{graphFocusMode ? t("graph.focusMode.exit") : t("graph.focusMode.enter")}</span>
          </button>
        </div>
      </div>

      {toolsOpen ? (
        <div className="graph-tools-drawer">
          <div className="graph-toolbar" aria-label={t("graph.filters")}>
            <section className="graph-filter-card graph-filter-card-view" aria-label={t("graph.view.mode")}>
              <span className="graph-filter-card-title">{t("graph.view.mode")}</span>
              <div className="segmented" aria-label={t("graph.view.mode")}>
                {viewModes.map((mode) => (
                  <button
                    aria-label={t(mode.labelKey)}
                    className={viewMode === mode.value ? "active" : ""}
                    key={mode.value}
                    onClick={() => setViewMode(mode.value)}
                    type="button"
                  >
                    {t(mode.labelKey)}
                  </button>
                ))}
              </div>
            </section>

            <section className="graph-filter-card graph-filter-card-dimension" aria-label={t("graph.dimension.mode")}>
              <span className="graph-filter-card-title">{t("graph.dimension.mode")}</span>
              <div className="segmented compact" aria-label={t("graph.dimension.mode")}>
                <button
                  className={dimensionMode === "2d" ? "active" : ""}
                  onClick={() => setDimensionMode("2d")}
                  type="button"
                >
                  {t("graph.dimension.twoD")}
                </button>
                <button
                  className={dimensionMode === "3d" ? "active" : ""}
                  onClick={() => setDimensionMode("3d")}
                  type="button"
                >
                  {t("graph.dimension.threeD")}
                </button>
              </div>
            </section>

            <section className="graph-filter-card graph-filter-card-status" aria-label={t("graph.filter.status")}>
              <span className="graph-filter-card-title">{t("graph.filter.status")}</span>
              <div className="filter-chip-grid">
                {statusFilters.map((status) => (
                  <label
                    className={filters.statuses[status.value] ? "filter-chip active" : "filter-chip"}
                    key={status.value}
                  >
                    <input
                      checked={filters.statuses[status.value]}
                      onChange={() => toggleStatus(status.value)}
                      type="checkbox"
                    />
                    <span>{t(status.labelKey)}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="graph-filter-card graph-filter-card-type" aria-label={t("graph.filter.type")}>
              <span className="graph-filter-card-title">{t("graph.filter.type")}</span>
              <div className="filter-chip-grid compact">
                {typeFilters.map((type) => (
                  <label
                    className={filters.types[type.value] ? "filter-chip active" : "filter-chip"}
                    key={type.value}
                  >
                    <input
                      checked={filters.types[type.value]}
                      onChange={() => toggleType(type.value)}
                      type="checkbox"
                    />
                    <span>{t(type.labelKey)}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="graph-filter-card graph-filter-card-strength" aria-label={t("graph.strength.filter")}>
              <span className="graph-filter-card-title">{t("graph.strength.filter")}</span>
              <div className="segmented compact" aria-label={t("graph.strength.filter")}>
                {strengthFilters.map((filter) => (
                  <button
                    className={strengthFilter === filter.value ? "active" : ""}
                    key={filter.value}
                    onClick={() => setStrengthFilter(filter.value)}
                    type="button"
                  >
                    {t(filter.labelKey)}
                  </button>
                ))}
              </div>
            </section>

            <section className="graph-filter-card graph-filter-card-neighborhood" aria-label={t("graph.neighborhood.label")}>
              <span className="graph-filter-card-title">{t("graph.neighborhood.label")}</span>
              <div className="segmented compact" aria-label={t("graph.neighborhood.label")}>
                {explorationModes.map((mode) => (
                  <button
                    className={explorationMode === mode.value ? "active" : ""}
                    disabled={!canExploreSelection}
                    key={mode.value}
                    onClick={() => onExplorationModeChange(mode.value)}
                    type="button"
                  >
                    {t(mode.labelKey)}
                  </button>
                ))}
              </div>
            </section>

            <section className="graph-filter-card graph-filter-card-layout" aria-label={t("graph.layout.label")}>
              <span className="graph-filter-card-title">{t("graph.layout.label")}</span>
              <div className="graph-preset-actions" aria-label={t("graph.layout.label")}>
                {layoutPresets.map((preset) => {
                  const Icon = preset.icon;
                  const label = t(preset.labelKey);
                  return (
                    <button
                      aria-label={label}
                      className={layoutPreset === preset.value ? "icon-action active" : "icon-action"}
                      key={preset.value}
                      onClick={() => changeLayoutPreset(preset.value)}
                      title={label}
                      type="button"
                    >
                      <Icon aria-hidden="true" size={15} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="graph-filter-card graph-filter-card-confidence">
              <span className="graph-filter-card-title">{t("graph.minConfidence")}</span>
              <label className="confidence-filter">
                <input
                  aria-label={t("graph.minConfidence")}
                  max="1"
                  min="0"
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      minConfidence: Number(event.target.value)
                    }))
                  }
                  step="0.05"
                  type="range"
                  value={filters.minConfidence}
                />
                <span>{formatConfidence(filters.minConfidence)}</span>
              </label>
            </section>

            <section className="graph-filter-card graph-filter-card-actions" aria-label={t("graph.filter.actions")}>
              <span className="graph-filter-card-title">{t("graph.filter.actions")}</span>
              <div className="graph-toolbar-actions">
                <button
                  aria-label={t("graph.resetFilters")}
                  className="secondary-action icon-action"
                  onClick={resetFilters}
                  title={t("graph.resetFilters")}
                  type="button"
                >
                  <Filter aria-hidden="true" size={15} />
                  <span>{t("graph.resetFilters")}</span>
                </button>
                <button
                  aria-label={t("graph.resetLayout")}
                  className="icon-action"
                  onClick={resetLayout}
                  title={t("graph.resetLayout")}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={15} />
                  <span>{t("graph.resetLayout")}</span>
                </button>
                <button
                  aria-label={t("graph.fit")}
                  className="icon-action"
                  onClick={() => instance?.fitView({ padding: 0.2 })}
                  title={t("graph.fit")}
                  type="button"
                >
                  <Crosshair aria-hidden="true" size={15} />
                  <span>{t("graph.fit")}</span>
                </button>
                <button
                  aria-label={t("graph.focus")}
                  className="icon-action"
                  disabled={!visibleSelectedItem}
                  onClick={focusSelection}
                  title={t("graph.focus")}
                  type="button"
                >
                  <Focus aria-hidden="true" size={15} />
                  <span>{t("graph.focus")}</span>
                </button>
                <button
                  aria-label={t("graph.hideSelection")}
                  className="icon-action"
                  disabled={!visibleSelectedItem}
                  onClick={hideSelection}
                  title={t("graph.hideSelection")}
                  type="button"
                >
                  <ScanEye aria-hidden="true" size={15} />
                  <span>{t("graph.hideSelection")}</span>
                </button>
                <button
                  aria-label={t("graph.restoreHidden")}
                  className="icon-action"
                  disabled={hiddenNodeIds.length === 0 && hiddenEdgeIds.length === 0}
                  onClick={restoreHiddenItems}
                  title={t("graph.restoreHidden")}
                  type="button"
                >
                  <Undo2 aria-hidden="true" size={15} />
                  <span>{t("graph.restoreHidden")}</span>
                </button>
                <button
                  aria-label={t("graph.snapshot.save")}
                  className="icon-action"
                  onClick={saveSnapshot}
                  title={t("graph.snapshot.save")}
                  type="button"
                >
                  <Save aria-hidden="true" size={15} />
                  <span>{t("graph.snapshot.save")}</span>
                </button>
                <button
                  aria-label={boxSelectionEnabled ? t("graph.selection.boxDisable") : t("graph.selection.boxEnable")}
                  aria-pressed={boxSelectionEnabled}
                  className={boxSelectionEnabled ? "icon-action active" : "icon-action"}
                  onClick={toggleBoxSelection}
                  title={boxSelectionEnabled ? t("graph.selection.boxDisable") : t("graph.selection.boxEnable")}
                  type="button"
                >
                  <BoxSelect aria-hidden="true" size={15} />
                  <span>{boxSelectionEnabled ? t("graph.selection.boxDisable") : t("graph.selection.boxEnable")}</span>
                </button>
                <button
                  aria-label={t("graph.pinSelection")}
                  className="icon-action"
                  disabled={!hasSelectedNodes}
                  onClick={pinSelectedNodes}
                  title={t("graph.pinSelection")}
                  type="button"
                >
                  <Pin aria-hidden="true" size={15} />
                  <span>{t("graph.pinSelection")}</span>
                </button>
                <button
                  aria-label={t("graph.unpinSelection")}
                  className="icon-action"
                  disabled={!hasSelectedNodes}
                  onClick={unpinSelectedNodes}
                  title={t("graph.unpinSelection")}
                  type="button"
                >
                  <PinOff aria-hidden="true" size={15} />
                  <span>{t("graph.unpinSelection")}</span>
                </button>
                <button
                  aria-label={t("graph.export.json")}
                  className="icon-action"
                  onClick={exportVisibleGraphJson}
                  title={t("graph.export.json")}
                  type="button"
                >
                  <FileJson aria-hidden="true" size={15} />
                  <span>{t("graph.export.json")}</span>
                </button>
                <button
                  aria-label={t("graph.export.svg")}
                  className="icon-action"
                  onClick={exportVisibleGraphSvg}
                  title={t("graph.export.svg")}
                  type="button"
                >
                  <FileImage aria-hidden="true" size={15} />
                  <span>{t("graph.export.svg")}</span>
                </button>
                <button
                  aria-label={t("graph.export.png")}
                  className="icon-action"
                  onClick={exportVisibleGraphPng}
                  title={t("graph.export.png")}
                  type="button"
                >
                  <ImageDown aria-hidden="true" size={15} />
                  <span>{t("graph.export.png")}</span>
                </button>
                <button
                  aria-label={t("graph.export.graphml")}
                  className="icon-action"
                  onClick={exportVisibleGraphMl}
                  title={t("graph.export.graphml")}
                  type="button"
                >
                  <FileCode2 aria-hidden="true" size={15} />
                  <span>{t("graph.export.graphml")}</span>
                </button>
              </div>
            </section>

            <section className="graph-filter-card graph-filter-card-paths" aria-label={t("graph.path.actions")}>
              <span className="graph-filter-card-title">{t("graph.path.actions")}</span>
              <div className="graph-path-actions">
                <button
                  aria-label={t("graph.path.shortest")}
                  className="icon-action"
                  disabled={!hasPathEndpoints}
                  onClick={highlightShortestPath}
                  title={t("graph.path.shortest")}
                  type="button"
                >
                  <Crosshair aria-hidden="true" size={15} />
                  <span>{t("graph.path.shortest")}</span>
                </button>
                <button
                  aria-label={t("graph.path.fieldLineage")}
                  className="icon-action"
                  disabled={!canBuildFieldLineagePath}
                  onClick={highlightFieldLineagePath}
                  title={t("graph.path.fieldLineage")}
                  type="button"
                >
                  <GitFork aria-hidden="true" size={15} />
                  <span>{t("graph.path.fieldLineage")}</span>
                </button>
                <button
                  aria-label={t("graph.path.clear")}
                  className="icon-action"
                  disabled={pathEndpointNodeIds.length === 0 && pathAnalysisResult === null}
                  onClick={clearPathAnalysis}
                  title={t("graph.path.clear")}
                  type="button"
                >
                  <Undo2 aria-hidden="true" size={15} />
                  <span>{t("graph.path.clear")}</span>
                </button>
              </div>
            </section>

            <section className="graph-filter-card graph-filter-card-strength-layers" aria-label={t("graph.strength.layers")}>
              <span className="graph-filter-card-title">{t("graph.strength.layers")}</span>
              <div className="graph-strength-layers" role="group" aria-label={t("graph.strength.layers")}>
                {relationshipStrengthLayers.map((layer) => (
                  <button
                    aria-label={t("graph.strength.layerLabel", {
                      count: layer.count,
                      label: t(strengthLayerLabelKey(layer.key))
                    })}
                    key={layer.key}
                    onClick={() => setStrengthFilter(layer.key === "strong" ? "strong" : "all")}
                    type="button"
                  >
                    <span>{t(strengthLayerLabelKey(layer.key))}</span>
                    <strong>{t("graph.strength.layerCount", { count: layer.count })}</strong>
                    <i style={{ width: `${Math.max(6, Math.round(layer.percentage * 100))}%` }} />
                  </button>
                ))}
              </div>
            </section>

            <section className="graph-filter-card graph-filter-card-snapshots" aria-label={t("graph.snapshot.region")}>
              <span className="graph-filter-card-title">{t("graph.snapshot.region")}</span>
              <div className="graph-snapshot-list">
                {snapshots.length === 0 ? (
                  <span>{t("graph.snapshot.empty")}</span>
                ) : (
                  snapshots.map((snapshot) => (
                    <button
                      aria-label={t("graph.snapshot.apply", { name: snapshot.name })}
                      key={snapshot.name}
                      onClick={() => applySnapshot(snapshot)}
                      type="button"
                    >
                      {snapshot.name}
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>
          <div className="graph-workflow-strip" role="status">
            <span>{t("graph.layout.current", { label: t(layoutLabelKey(layoutPreset)) })}</span>
            <span>{hiddenSummary ?? t("graph.hidden.none")}</span>
            <span>{t("graph.snapshot.count", { count: snapshots.length })}</span>
            <span>{selectionSummary ?? t("graph.selection.none")}</span>
            <span>{pinnedSummary}</span>
            <span>
              {pathAnalysisResult
                ? t("graph.path.summary", { count: pathAnalysisResult.path.edgeIds.length })
                : t("graph.path.endpointSummary", { count: pathEndpointNodeIds.length })}
            </span>
          </div>
        </div>
      ) : null}

      <div className="graph-canvas">
        {graph.nodes.length === 0 ? (
          <section className="graph-empty-state" aria-label={t("graph.emptyGuide.region")}>
            <h3>{t("graph.emptyTitle")}</h3>
            <p>{t("graph.emptyDescription")}</p>
            <ul className="graph-empty-guide-list">
              <li>{t("graph.emptyGuide.spreadsheet")}</li>
              <li>{t("graph.emptyGuide.document")}</li>
              <li>{t("graph.emptyGuide.code")}</li>
              <li>{t("graph.emptyGuide.url")}</li>
            </ul>
          </section>
        ) : dimensionMode === "3d" ? (
          <Suspense
            fallback={
              <div
                aria-label={t("graph.dimension.loading")}
                className="graph-3d-loading"
                role="status"
              >
                <span>{t("graph.dimension.loadingText")}</span>
              </div>
            }
          >
            <GraphCanvas3D graph={visibleGraph} language={language} />
          </Suspense>
        ) : (
          <>
            <ReactFlow
              edges={edges}
              fitView
              nodeTypes={nodeTypes}
              nodes={nodes}
              multiSelectionKeyCode={["Shift", "Meta", "Control"]}
              onEdgeClick={(_, edge) =>
                onSelectionChange(getSelectionForEdge(edge.id, graph.nodes, graph.edges))
              }
              onInit={setInstance}
              onNodesChange={handleNodesChange}
              onNodeClick={(_, node) => handleNodeClick(node.id)}
              onPaneClick={() => onSelectionChange(null)}
              onSelectionChange={handleFlowSelectionChange}
              panOnDrag={!boxSelectionEnabled}
              selectionMode={SelectionMode.Partial}
              selectionOnDrag={boxSelectionEnabled}
            >
              <Background />
              <MiniMap
                ariaLabel={t("graph.minimap")}
                nodeColor={getMiniMapNodeColor}
                nodeStrokeColor={getMiniMapNodeStrokeColor}
                pannable
                position="bottom-left"
                role="group"
                zoomable
              />
              <Controls />
              {largeGraphGuard ? (
                <div
                  aria-label={t("graph.performance.guard")}
                  className="graph-performance-guard nodrag nopan"
                  role="status"
                >
                  <strong>{t("graph.performance.enabled")}</strong>
                  <span>{t("graph.performance.nodes", { count: largeGraphGuard.nodeCount })}</span>
                  <span>{t("graph.performance.edges", { count: largeGraphGuard.edgeCount })}</span>
                  {largeGraphGuard.clusters.map((cluster) => (
                    <span key={cluster.key}>{t(cluster.labelKey, { count: cluster.count })}</span>
                  ))}
                </div>
              ) : null}
              <div className="graph-legend is-compact nodrag nopan">
                <button
                  aria-label={t("graph.legend.toggleContains")}
                  aria-pressed={filters.types.contains_field}
                  className={filters.types.contains_field ? "active" : "is-muted"}
                  onClick={() => toggleType("contains_field")}
                  type="button"
                >
                  <i className="legend-line contains" />
                  <span>{t("graph.legend.contains")}</span>
                  <strong>{legendCounts.containsField}</strong>
                </button>
                <button
                  aria-label={t("graph.legend.toggleForeignKey")}
                  aria-pressed={filters.types.foreign_key}
                  className={filters.types.foreign_key ? "active" : "is-muted"}
                  onClick={() => toggleType("foreign_key")}
                  type="button"
                >
                  <i className="legend-line foreign-key" />
                  <span>{t("graph.legend.foreignKey")}</span>
                  <strong>{legendCounts.foreignKey}</strong>
                </button>
                <button
                  aria-label={t("graph.legend.toggleDimension")}
                  aria-pressed={filters.types.derived_dimension}
                  className={filters.types.derived_dimension ? "active" : "is-muted"}
                  onClick={() => toggleType("derived_dimension")}
                  type="button"
                >
                  <i className="legend-line dimension" />
                  <span>{t("graph.legend.dimension")}</span>
                  <strong>{legendCounts.dimension}</strong>
                </button>
                <button
                  aria-label={t("graph.legend.toggleSuggested")}
                  aria-pressed={filters.statuses.suggested}
                  className={filters.statuses.suggested ? "active" : "is-muted"}
                  onClick={() => toggleStatus("suggested")}
                  type="button"
                >
                  <i className="legend-line suggested" />
                  <span>{t("graph.legend.suggested")}</span>
                  <strong>{legendCounts.suggested}</strong>
                </button>
              </div>
            </ReactFlow>
            <GraphDetailOverlay onClose={onClearSelection} selection={visibleSelectedItem} />
          </>
        )}
      </div>

      {analysisDrawerOpen ? (
        <aside
          aria-label={t("graph.analysis.drawer")}
          className="graph-analysis-drawer nodrag nopan"
          id="graph-analysis-drawer"
          role="region"
        >
          <header>
            <div>
              <strong>{t("graph.analysis.drawer")}</strong>
              <span>{t("graph.analysis.subtitle")}</span>
            </div>
            <button
              aria-label={t("graph.analysis.close")}
              className="graph-analysis-drawer-close"
              onClick={() => setAnalysisDrawerOpen(false)}
              title={t("graph.analysis.close")}
              type="button"
            >
              <X aria-hidden="true" size={15} />
            </button>
          </header>
          <div className="graph-analysis-drawer-body">
            {hasAnalysisDrawerContent ? (
              <>
                {relationshipShelf}
                {neighborhoodSummaryCard}
                {aiPathSummaryCard}
                {pathAnalysisSummaryCard}
              </>
            ) : (
              <div className="graph-analysis-empty">{t("graph.analysis.empty")}</div>
            )}
          </div>
        </aside>
      ) : null}

    </section>
  );
}

function edgeMatchesStrengthFilter(edge: GraphResponse["edges"][number], filter: StrengthFilter) {
  if (filter === "all") {
    return true;
  }
  if (filter === "pending") {
    return edge.status === "suggested";
  }
  return edge.edge_type === "contains_field" || getRelationshipStrength(edge) === "strong";
}

function layoutLabelKey(
  layoutPreset: LayoutPreset
): "graph.layout.semantic" | "graph.layout.fieldFirst" | "graph.layout.compact" {
  if (layoutPreset === "field_first") {
    return "graph.layout.fieldFirst";
  }
  if (layoutPreset === "compact") {
    return "graph.layout.compact";
  }
  return "graph.layout.semantic";
}

function pathAnalysisModeLabelKey(
  mode: PathAnalysisMode
): "graph.path.shortestLabel" | "graph.path.fieldLineageLabel" {
  return mode === "field_lineage" ? "graph.path.fieldLineageLabel" : "graph.path.shortestLabel";
}

function strengthLayerLabelKey(
  strength: ReturnType<typeof getRelationshipStrength>
): "graph.strength.layerStrong" | "graph.strength.layerLikely" | "graph.strength.layerPossible" {
  if (strength === "strong") {
    return "graph.strength.layerStrong";
  }
  if (strength === "likely") {
    return "graph.strength.layerLikely";
  }
  return "graph.strength.layerPossible";
}

function selectionIsHidden(
  selectedItem: GraphSelection,
  hiddenNodeIds: Set<number>,
  hiddenEdgeIds: Set<number>
): boolean {
  if (selectedItem.kind === "node") {
    return hiddenNodeIds.has(selectedItem.node.id);
  }
  return hiddenEdgeIds.has(selectedItem.edge.id);
}

function cloneGraphFilters(filters: GraphFilters): GraphFilters {
  return {
    minConfidence: filters.minConfidence,
    statuses: { ...filters.statuses },
    types: { ...filters.types }
  };
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values));
}

function numberArraysEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function downloadTextFile(content: string, fileName: string, mimeType: string) {
  downloadBlob(new Blob([content], { type: mimeType }), fileName);
}

function downloadBlob(blob: Blob, fileName: string) {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    return;
  }
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(href);
}

function getCurrentAiPathPosition(
  summary: ReturnType<typeof getAiPathSummary>,
  selectedItem: GraphSelection | null
): { current: number; total: number } | null {
  if (!summary || summary.segments.length <= 1) {
    return null;
  }

  const selectedIndex =
    selectedItem?.kind === "edge"
      ? summary.segments.findIndex((segment) => segment.edge.id === selectedItem.edge.id)
      : -1;

  return {
    current: selectedIndex === -1 ? 1 : selectedIndex + 1,
    total: summary.segments.length
  };
}

function getAiPathSummary(
  graph: GraphResponse,
  highlightedGraphPath: number[],
  language: Language
):
  | {
      edgeCount: number;
      label: string;
      nodeIds: number[];
      nodeCount: number;
      pendingCount: number;
      segments: {
        edge: GraphResponse["edges"][number];
        evidenceLabel: string;
        label: string;
        metaLabel: string;
        sourceEvidenceLabel: string;
        strengthEvidenceLabel: string;
      }[];
      strengthLabelKey:
        | "graph.aiPath.strongEvidence"
        | "graph.aiPath.mediumEvidence"
        | "graph.aiPath.weakEvidence";
    }
  | null {
  if (highlightedGraphPath.length === 0) {
    return null;
  }
  const highlightedIds = new Set(highlightedGraphPath);
  const pathEdges = graph.edges.filter((edge) => highlightedIds.has(edge.id));
  const graphNodeLabelById = new Map(graph.nodes.map((node) => [node.id, node.label]));
  const pathNodeIds = new Set(
    graph.nodes.filter((node) => highlightedIds.has(node.id)).map((node) => node.id)
  );
  for (const edge of pathEdges) {
    pathNodeIds.add(edge.source_node_id);
    pathNodeIds.add(edge.target_node_id);
  }
  const pathNodes = graph.nodes.filter((node) => pathNodeIds.has(node.id));
  const segments = pathEdges.map((edge) => ({
    edge,
    evidenceLabel: formatPathSegmentEvidence(edge, language),
    label: relationshipEndpointLabel(edge, graphNodeLabelById),
    metaLabel: getRelationshipChipLabel(edge, language),
    sourceEvidenceLabel: formatPathSegmentSourceEvidence(edge, language),
    strengthEvidenceLabel: formatPathSegmentStrengthEvidence(edge, language)
  }));
  const label =
    pathEdges.length > 0
      ? segments.map((segment) => segment.label).join(" · ")
      : pathNodes.map((node) => node.label).join(" → ");
  const averageConfidence =
    pathEdges.length > 0
      ? pathEdges.reduce((total, edge) => total + edge.confidence, 0) / pathEdges.length
      : null;

  return {
    edgeCount: pathEdges.length,
    label: label || (language === "en-US" ? "Highlighted evidence" : "已高亮证据"),
    nodeIds: pathNodes.map((node) => node.id),
    nodeCount: pathNodeIds.size,
    pendingCount: pathEdges.filter((edge) => edge.status === "suggested").length,
    segments,
    strengthLabelKey: getAiEvidenceStrengthLabelKey(averageConfidence)
  };
}

function getAiEvidenceStrengthLabelKey(confidence: number | null) {
  if (confidence === null || confidence >= 0.9) {
    return "graph.aiPath.strongEvidence" as const;
  }
  if (confidence >= 0.7) {
    return "graph.aiPath.mediumEvidence" as const;
  }
  return "graph.aiPath.weakEvidence" as const;
}

function formatNodeCount(count: number, language: Language): string {
  return language === "en-US" ? `${count} ${count === 1 ? "node" : "nodes"}` : `${count} 个节点`;
}

function formatRelationshipCount(count: number, language: Language): string {
  return language === "en-US"
    ? `${count} ${count === 1 ? "relationship" : "relationships"}`
    : `${count} 条关系`;
}

function formatPendingCount(count: number, language: Language): string {
  return language === "en-US" ? `${count} pending` : `待审核 ${count}`;
}

function formatPathSegmentEvidence(edge: GraphResponse["edges"][number], language: Language): string {
  const strengthLabel = formatPathSegmentStrengthEvidence(edge, language);
  const sourceLabel = formatPathSegmentSourceEvidence(edge, language);
  return `${strengthLabel} · ${sourceLabel}`;
}

function formatPathSegmentStrengthEvidence(
  edge: GraphResponse["edges"][number],
  language: Language
): string {
  const strengthLabel = formatRelationshipStrengthForPath(getRelationshipStrength(edge), language);
  if (language === "en-US") {
    return `Strength ${strengthLabel}`;
  }
  return `强度 ${strengthLabel}`;
}

function formatPathSegmentSourceEvidence(
  edge: GraphResponse["edges"][number],
  language: Language
): string {
  if (language === "en-US") {
    return `Evidence ${edge.evidence_ref}`;
  }
  return `证据 ${edge.evidence_ref}`;
}

function formatRelationshipStrengthForPath(
  strength: ReturnType<typeof getRelationshipStrength>,
  language: Language
): string {
  const labels: Record<Language, Record<ReturnType<typeof getRelationshipStrength>, string>> = {
    "zh-CN": {
      strong: "强",
      likely: "较可能",
      possible: "可能"
    },
    "en-US": {
      strong: "strong",
      likely: "likely",
      possible: "possible"
    }
  };
  return labels[language][strength];
}

function getNodeClassName({
  dimmed,
  neighborhood,
  pathAnalysis,
  selected
}: {
  dimmed: boolean;
  neighborhood: boolean;
  pathAnalysis: boolean;
  selected: boolean;
}): string | undefined {
  const classNames = [
    selected ? "is-selected" : "",
    pathAnalysis ? "is-path-analysis" : "",
    neighborhood ? "is-neighborhood" : "",
    dimmed ? "is-dimmed" : ""
  ].filter(Boolean);
  return classNames.length > 0 ? classNames.join(" ") : undefined;
}

function getRelationshipCardClassName({
  dimmed,
  highlighted,
  neighborhood,
  previewed
}: {
  dimmed: boolean;
  highlighted: boolean;
  neighborhood: boolean;
  previewed: boolean;
}): string {
  return [
    "edge-summary-card",
    highlighted ? "is-highlighted" : "",
    previewed ? "is-previewed" : "",
    neighborhood ? "is-neighborhood" : "",
    dimmed ? "is-dimmed" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function getLegendCounts(edges: GraphResponse["edges"]) {
  return edges.reduce(
    (counts, edge) => {
      if (edge.edge_type === "contains_field") {
        counts.containsField += 1;
      }
      if (edge.edge_type === "foreign_key") {
        counts.foreignKey += 1;
      }
      if (edge.edge_type === "derived_dimension") {
        counts.dimension += 1;
      }
      if (edge.status === "suggested") {
        counts.suggested += 1;
      }
      return counts;
    },
    {
      containsField: 0,
      foreignKey: 0,
      dimension: 0,
      suggested: 0
    }
  );
}

function prioritizeRelationshipShelfEdges(
  edges: GraphResponse["edges"]
): GraphResponse["edges"] {
  return edges
    .map((edge, index) => ({ edge, index }))
    .sort((left, right) => compareRelationshipShelfEdges(left.edge, right.edge) || left.index - right.index)
    .map(({ edge }) => edge);
}

function buildRelationshipShelfGroups(edges: GraphResponse["edges"]) {
  const groups: {
    edges: GraphResponse["edges"];
    key: RelationshipGroupKey;
    pendingCount: number;
  }[] = [
    { key: "foreign_key", edges: [], pendingCount: 0 },
    { key: "derived_dimension", edges: [], pendingCount: 0 },
    { key: "other", edges: [], pendingCount: 0 },
    { key: "structural", edges: [], pendingCount: 0 }
  ];
  const groupByKey = new Map(groups.map((group) => [group.key, group]));

  for (const edge of edges) {
    const group = groupByKey.get(relationshipShelfGroupKey(edge.edge_type));
    if (!group) {
      continue;
    }
    group.edges.push(edge);
    if (edge.status === "suggested") {
      group.pendingCount += 1;
    }
  }

  return groups.filter((group) => group.edges.length > 0);
}

function relationshipShelfGroupKey(edgeType: string): RelationshipGroupKey {
  if (edgeType === "foreign_key") {
    return "foreign_key";
  }
  if (edgeType === "derived_dimension") {
    return "derived_dimension";
  }
  if (edgeType === "contains_field") {
    return "structural";
  }
  return "other";
}

function getRelationshipGroupLabel(groupKey: RelationshipGroupKey, language: Language): string {
  const labels = {
    "zh-CN": {
      foreign_key: "外键关系",
      derived_dimension: "派生维度",
      other: "其他关系",
      structural: "结构字段"
    },
    "en-US": {
      foreign_key: "Foreign keys",
      derived_dimension: "Dimensions",
      other: "Other relationships",
      structural: "Structural fields"
    }
  };
  return labels[language][groupKey];
}

function getMiniMapNodeColor(node: Node): string {
  const graphNode = node.data?.graphNode;
  if (node.data?.highlighted) {
    return "#24d3b5";
  }
  if (graphNode?.node_type === "table") {
    return "#5ba7ff";
  }
  if (graphNode?.node_type === "field") {
    return "#24d3b5";
  }
  return "#f2b84b";
}

function getMiniMapNodeStrokeColor(node: Node): string {
  return node.data?.highlighted ? "#dffdf6" : "#172033";
}

function compareRelationshipShelfEdges(
  left: GraphResponse["edges"][number],
  right: GraphResponse["edges"][number]
): number {
  const typeDifference =
    relationshipShelfTypePriority(left.edge_type) - relationshipShelfTypePriority(right.edge_type);
  if (typeDifference !== 0) {
    return typeDifference;
  }

  const strengthDifference =
    relationshipStrengthPriority(left) - relationshipStrengthPriority(right);
  if (strengthDifference !== 0) {
    return strengthDifference;
  }

  return right.confidence - left.confidence;
}

function relationshipShelfTypePriority(edgeType: string): number {
  if (edgeType === "foreign_key") {
    return 0;
  }
  if (edgeType === "derived_dimension") {
    return 1;
  }
  if (edgeType === "contains_field") {
    return 3;
  }
  return 2;
}

function relationshipStrengthPriority(edge: GraphResponse["edges"][number]): number {
  const priority = {
    strong: 0,
    likely: 1,
    possible: 2
  } satisfies Record<ReturnType<typeof getRelationshipStrength>, number>;
  return priority[getRelationshipStrength(edge)];
}

function relationshipEndpointLabel(
  edge: GraphResponse["edges"][number],
  nodeLabelById: Map<number, string>
): string {
  const sourceLabel = nodeLabelById.get(edge.source_node_id) ?? String(edge.source_node_id);
  const targetLabel = nodeLabelById.get(edge.target_node_id) ?? String(edge.target_node_id);
  return `${sourceLabel} → ${targetLabel}`;
}

function getTableMetrics(nodes: GraphResponse["nodes"], edges: GraphResponse["edges"]) {
  const metrics = new Map<number, { keyFieldCount: number; relationshipCount: number }>();
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const tableByFieldId = new Map<number, number>();

  for (const table of nodes.filter((node) => node.node_type === "table")) {
    metrics.set(table.id, { keyFieldCount: 0, relationshipCount: 0 });
  }

  for (const edge of edges) {
    if (edge.edge_type !== "contains_field") {
      continue;
    }

    const table = nodesById.get(edge.source_node_id);
    const field = nodesById.get(edge.target_node_id);
    if (table?.node_type !== "table" || field?.node_type !== "field") {
      continue;
    }

    tableByFieldId.set(field.id, table.id);
    const tableMetrics = metrics.get(table.id);
    if (tableMetrics && hasKeyCandidateScore(field)) {
      tableMetrics.keyFieldCount += 1;
    }
  }

  for (const edge of edges) {
    if (edge.edge_type === "contains_field") {
      continue;
    }

    const tableIds = new Set<number>();
    const sourceTableId = tableByFieldId.get(edge.source_node_id);
    const targetTableId = tableByFieldId.get(edge.target_node_id);

    if (sourceTableId !== undefined) {
      tableIds.add(sourceTableId);
    }
    if (targetTableId !== undefined) {
      tableIds.add(targetTableId);
    }

    for (const tableId of tableIds) {
      const tableMetrics = metrics.get(tableId);
      if (tableMetrics) {
        tableMetrics.relationshipCount += 1;
      }
    }
  }

  return metrics;
}

function getLargeGraphGuardSummary(graph: {
  edges: GraphResponse["edges"];
  nodes: GraphResponse["nodes"];
}) {
  return {
    clusters: [
      {
        count: graph.nodes.filter((node) => node.node_type === "table").length,
        key: "table",
        labelKey: "graph.performance.clusterTable" as const
      },
      {
        count: graph.nodes.filter((node) => node.node_type === "field").length,
        key: "field",
        labelKey: "graph.performance.clusterField" as const
      },
      {
        count: graph.nodes.filter((node) => node.node_type === "derived_entity").length,
        key: "derived_entity",
        labelKey: "graph.performance.clusterEntity" as const
      }
    ],
    edgeCount: graph.edges.length,
    nodeCount: graph.nodes.length
  };
}

function hasKeyCandidateScore(node: GraphResponse["nodes"][number]) {
  const score = node.metadata.key_candidate_score;
  return typeof score === "number" && score > 0;
}
