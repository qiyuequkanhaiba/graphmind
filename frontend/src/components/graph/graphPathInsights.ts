import type { GraphEdge, GraphResponse, GraphSelection } from "../../api/types";
import { getRelationshipStrength } from "./graphSemantics";

export type ExplorationMode = "off" | "one_hop" | "two_hop";

export type NodeNeighborhood = {
  edgeIds: number[];
  nodeIds: number[];
};

export type RelationshipTraversalPath = {
  edgeIds: number[];
  nodeIds: number[];
};

export type RelationshipStrengthLayer = {
  count: number;
  edgeIds: number[];
  key: ReturnType<typeof getRelationshipStrength>;
  percentage: number;
};

export type RelationshipPathSummary = {
  actionHints: RelationshipPathActionHint[];
  confidence: number | null;
  downstreamCount: number;
  edgeStatus: string | null;
  evidenceRefs: string[];
  impactLabels: string[];
  pendingCount: number;
  pathNodeLabels: string[];
  relationshipTypes: string[];
  sourceLabel: string | null;
  targetLabel: string | null;
  upstreamCount: number;
};

export type RelationshipPathActionHint =
  | "review_pending"
  | "validate_foreign_key"
  | "confirm_dimension"
  | "inspect_schema";

export function getNodeNeighborhood(
  graph: GraphResponse,
  nodeId: number,
  depth: 1 | 2
): NodeNeighborhood {
  const nodeIds: number[] = [nodeId];
  const edgeIds: number[] = [];
  const seenNodes = new Set(nodeIds);
  const seenEdges = new Set<number>();
  let frontier = [nodeId];

  for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
    const nextFrontier: number[] = [];
    for (const frontierNodeId of frontier) {
      for (const edge of adjacentEdges(graph.edges, frontierNodeId)) {
        if (!seenEdges.has(edge.id)) {
          seenEdges.add(edge.id);
          edgeIds.push(edge.id);
        }

        const adjacentNodeId =
          edge.source_node_id === frontierNodeId ? edge.target_node_id : edge.source_node_id;
        if (!seenNodes.has(adjacentNodeId)) {
          seenNodes.add(adjacentNodeId);
          nodeIds.push(adjacentNodeId);
          nextFrontier.push(adjacentNodeId);
        }
      }
    }
    frontier = nextFrontier;
  }

  return { edgeIds, nodeIds };
}

export function getShortestRelationshipPath(
  graph: GraphResponse,
  sourceNodeId: number,
  targetNodeId: number
): RelationshipTraversalPath | null {
  if (sourceNodeId === targetNodeId) {
    return { edgeIds: [], nodeIds: [sourceNodeId] };
  }

  const visitedNodeIds = new Set([sourceNodeId]);
  const queue: RelationshipTraversalPath[] = [{ edgeIds: [], nodeIds: [sourceNodeId] }];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath) {
      break;
    }

    const currentNodeId = currentPath.nodeIds[currentPath.nodeIds.length - 1];
    for (const edge of adjacentEdges(graph.edges, currentNodeId)) {
      const adjacentNodeId =
        edge.source_node_id === currentNodeId ? edge.target_node_id : edge.source_node_id;
      if (visitedNodeIds.has(adjacentNodeId)) {
        continue;
      }

      const nextPath = {
        edgeIds: [...currentPath.edgeIds, edge.id],
        nodeIds: [...currentPath.nodeIds, adjacentNodeId]
      };
      if (adjacentNodeId === targetNodeId) {
        return nextPath;
      }

      visitedNodeIds.add(adjacentNodeId);
      queue.push(nextPath);
    }
  }

  return null;
}

export function getFieldLineagePath(
  graph: GraphResponse,
  sourceFieldNodeId: number,
  targetFieldNodeId: number
): RelationshipTraversalPath | null {
  const analyticalPath =
    getShortestRelationshipPath(
      { nodes: graph.nodes, edges: graph.edges.filter((edge) => edge.edge_type !== "contains_field") },
      sourceFieldNodeId,
      targetFieldNodeId
    ) ?? getShortestRelationshipPath(graph, sourceFieldNodeId, targetFieldNodeId);

  if (!analyticalPath) {
    return null;
  }

  const sourceOwnerEdge = getFieldOwnerEdge(graph.edges, sourceFieldNodeId);
  const targetOwnerEdge = getFieldOwnerEdge(graph.edges, targetFieldNodeId);
  const nodeIds = uniqueValues([
    sourceOwnerEdge?.source_node_id,
    ...analyticalPath.nodeIds,
    targetOwnerEdge?.source_node_id
  ].filter(isNumber));
  const edgeIds = uniqueValues([
    sourceOwnerEdge?.id,
    ...analyticalPath.edgeIds,
    targetOwnerEdge?.id
  ].filter(isNumber));

  return { edgeIds, nodeIds };
}

export function getRelationshipStrengthLayers(edges: GraphEdge[]): RelationshipStrengthLayer[] {
  const layerKeys: RelationshipStrengthLayer["key"][] = ["strong", "likely", "possible"];
  const totalCount = edges.length;
  return layerKeys.map((key) => {
    const edgeIds = edges
      .filter((edge) => getRelationshipStrength(edge) === key)
      .map((edge) => edge.id);
    return {
      count: edgeIds.length,
      edgeIds,
      key,
      percentage: totalCount === 0 ? 0 : edgeIds.length / totalCount
    };
  });
}

export function getRelationshipPathSummary(
  graph: GraphResponse,
  selection: GraphSelection,
  depth: 1 | 2
): RelationshipPathSummary {
  if (selection.kind === "edge") {
    const sourceLabel =
      selection.sourceNode?.label ??
      graph.nodes.find((node) => node.id === selection.edge.source_node_id)?.label ??
      null;
    const targetLabel =
      selection.targetNode?.label ??
      graph.nodes.find((node) => node.id === selection.edge.target_node_id)?.label ??
      null;
    return {
      actionHints: getActionHints([selection.edge]),
      confidence: selection.edge.confidence,
      downstreamCount: 0,
      edgeStatus: selection.edge.status,
      evidenceRefs: uniqueValues([selection.edge.evidence_ref].filter(Boolean)),
      impactLabels: uniqueValues([sourceLabel, targetLabel].filter(isString)),
      pendingCount: selection.edge.status === "suggested" ? 1 : 0,
      pathNodeLabels: uniqueValues([sourceLabel, targetLabel].filter(isString)),
      relationshipTypes: [selection.edge.edge_type],
      sourceLabel,
      targetLabel,
      upstreamCount: 0
    };
  }

  const neighborhood = getNodeNeighborhood(graph, selection.node.id, depth);
  const edges = graph.edges.filter((edge) => neighborhood.edgeIds.includes(edge.id));
  const directEdges = adjacentEdges(edges, selection.node.id);
  const pathNodeLabels = neighborhood.nodeIds
    .map((nodeId) => graph.nodes.find((node) => node.id === nodeId)?.label ?? null)
    .filter(isString);

  return {
    actionHints: getActionHints(edges),
    confidence: null,
    downstreamCount: directEdges.filter((edge) => edge.source_node_id === selection.node.id).length,
    edgeStatus: null,
    evidenceRefs: uniqueValues(edges.map((edge) => edge.evidence_ref).filter(Boolean)),
    impactLabels: pathNodeLabels.filter((label) => label !== selection.node.label),
    pendingCount: edges.filter((edge) => edge.status === "suggested").length,
    pathNodeLabels,
    relationshipTypes: uniqueValues(edges.map((edge) => edge.edge_type)),
    sourceLabel: null,
    targetLabel: null,
    upstreamCount: directEdges.filter((edge) => edge.target_node_id === selection.node.id).length
  };
}

export function mergeHighlightedPaths(aiPath: number[], explorationPath: number[]): number[] {
  return uniqueValues([...explorationPath, ...aiPath]);
}

function adjacentEdges(edges: GraphEdge[], nodeId: number): GraphEdge[] {
  return edges.filter((edge) => edge.source_node_id === nodeId || edge.target_node_id === nodeId);
}

function getFieldOwnerEdge(edges: GraphEdge[], fieldNodeId: number): GraphEdge | null {
  return (
    edges.find(
      (edge) => edge.edge_type === "contains_field" && edge.target_node_id === fieldNodeId
    ) ?? null
  );
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number";
}

function getActionHints(edges: GraphEdge[]): RelationshipPathActionHint[] {
  const hints: RelationshipPathActionHint[] = [];
  if (edges.some((edge) => edge.status === "suggested")) {
    hints.push("review_pending");
  }
  if (edges.some((edge) => edge.edge_type === "foreign_key")) {
    hints.push("validate_foreign_key");
  }
  if (edges.some((edge) => edge.edge_type === "derived_dimension")) {
    hints.push("confirm_dimension");
  }
  if (edges.some((edge) => edge.edge_type === "contains_field") && hints.length === 0) {
    hints.push("inspect_schema");
  }
  return hints;
}

function isString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}
