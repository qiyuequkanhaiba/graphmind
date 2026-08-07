import type { GraphEdge, GraphNode } from "../../api/types";
import { buildSemanticLayout, type SemanticLayoutPosition } from "./graphSemantics";

export type LayoutPreset = "semantic" | "field_first" | "compact";

export type GraphLayoutGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type SerializedGraphLayout = [number, SemanticLayoutPosition][];

export type GraphLayoutWorkerRequest = {
  graph: GraphLayoutGraph;
  layoutPreset: LayoutPreset;
};

export type GraphLayoutWorkerResponse = {
  layoutPreset: LayoutPreset;
  positions: SerializedGraphLayout;
};

export function buildGraphLayout(
  graph: GraphLayoutGraph,
  layoutPreset: LayoutPreset
): Map<number, SemanticLayoutPosition> {
  if (layoutPreset === "semantic") {
    return buildSemanticLayout(graph);
  }
  if (layoutPreset === "field_first") {
    return buildFieldFirstLayout(graph.nodes);
  }
  return buildCompactLayout(graph.nodes);
}

export function serializeGraphLayout(
  layout: Map<number, SemanticLayoutPosition>
): SerializedGraphLayout {
  return Array.from(layout.entries());
}

export function deserializeGraphLayout(
  positions: SerializedGraphLayout
): Map<number, SemanticLayoutPosition> {
  return new Map(positions);
}

function buildFieldFirstLayout(nodes: GraphNode[]): Map<number, SemanticLayoutPosition> {
  const layout = new Map<number, SemanticLayoutPosition>();
  const orderedNodes = [...nodes].sort((left, right) => {
    const rank: Record<GraphNode["node_type"], number> = {
      field: 0,
      table: 1,
      document: 1,
      derived_entity: 2,
      entity: 2,
      code_symbol: 2
    };
    return rank[left.node_type] - rank[right.node_type] || left.label.localeCompare(right.label);
  });
  orderedNodes.forEach((node, index) => {
    layout.set(node.id, {
      x: 120 + (index % 3) * 260,
      y: 80 + Math.floor(index / 3) * 150
    });
  });
  return layout;
}

function buildCompactLayout(nodes: GraphNode[]): Map<number, SemanticLayoutPosition> {
  const layout = new Map<number, SemanticLayoutPosition>();
  const radius = Math.max(170, nodes.length * 26);
  nodes.forEach((node, index) => {
    const angle = nodes.length === 0 ? 0 : (index / nodes.length) * Math.PI * 2;
    layout.set(node.id, {
      x: 360 + Math.cos(angle) * radius,
      y: 260 + Math.sin(angle) * radius
    });
  });
  return layout;
}
