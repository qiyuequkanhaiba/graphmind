import type { GraphEdge, GraphFilters, GraphNode, GraphResponse } from "../../api/types";
import type { Language } from "../../i18n/messages";
import {
  formatConfidence,
  getNodeKindLabel,
  getRelationshipLabel
} from "./graphSemantics";

export type GraphExportViewState = {
  filters: GraphFilters;
  hiddenEdgeIds: number[];
  hiddenNodeIds: number[];
  layoutPreset: string;
  viewMode: string;
};

export type GraphExportPayload = {
  edges: GraphEdge[];
  exported_at: string;
  filters: GraphFilters;
  hidden_edge_ids: number[];
  hidden_node_ids: number[];
  layout_preset: string;
  nodes: GraphNode[];
  view_mode: string;
};

export function createGraphJsonExportPayload(
  graph: GraphResponse,
  viewState: GraphExportViewState,
  exportedAt = new Date().toISOString()
): GraphExportPayload {
  return {
    exported_at: exportedAt,
    filters: viewState.filters,
    hidden_edge_ids: viewState.hiddenEdgeIds,
    hidden_node_ids: viewState.hiddenNodeIds,
    layout_preset: viewState.layoutPreset,
    nodes: graph.nodes,
    edges: graph.edges,
    view_mode: viewState.viewMode
  };
}

export function createGraphMlExport(graph: GraphResponse): string {
  const nodes = graph.nodes
    .map(
      (node) => `    <node id="${xmlEscape(String(node.id))}">
      <data key="label">${xmlEscape(node.label)}</data>
      <data key="node_type">${xmlEscape(node.node_type)}</data>
      <data key="source_ref">${xmlEscape(node.source_ref)}</data>
    </node>`
    )
    .join("\n");
  const edges = graph.edges
    .map(
      (edge) => `    <edge id="${xmlEscape(String(edge.id))}" source="${xmlEscape(
        String(edge.source_node_id)
      )}" target="${xmlEscape(String(edge.target_node_id))}">
      <data key="edge_type">${xmlEscape(edge.edge_type)}</data>
      <data key="confidence">${xmlEscape(String(edge.confidence))}</data>
      <data key="status">${xmlEscape(String(edge.status))}</data>
      <data key="evidence_ref">${xmlEscape(edge.evidence_ref)}</data>
    </edge>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="label" for="node" attr.name="label" attr.type="string" />
  <key id="node_type" for="node" attr.name="node_type" attr.type="string" />
  <key id="source_ref" for="node" attr.name="source_ref" attr.type="string" />
  <key id="edge_type" for="edge" attr.name="edge_type" attr.type="string" />
  <key id="confidence" for="edge" attr.name="confidence" attr.type="double" />
  <key id="status" for="edge" attr.name="status" attr.type="string" />
  <key id="evidence_ref" for="edge" attr.name="evidence_ref" attr.type="string" />
  <graph id="GraphMind" edgedefault="directed">
${nodes}
${edges}
  </graph>
</graphml>
`;
}

export function createSvgGraphExport(
  graph: GraphResponse,
  positions: Map<number, { x: number; y: number }>,
  language: Language
): string {
  const bounds = getGraphBounds(graph.nodes, positions);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = graph.edges
    .map((edge) => {
      const source = nodeById.get(edge.source_node_id);
      const target = nodeById.get(edge.target_node_id);
      if (!source || !target) {
        return "";
      }
      const sourcePosition = positions.get(source.id) ?? { x: source.position_x, y: source.position_y };
      const targetPosition = positions.get(target.id) ?? { x: target.position_x, y: target.position_y };
      const sourcePoint = {
        x: sourcePosition.x - bounds.minX + 182,
        y: sourcePosition.y - bounds.minY + 118
      };
      const targetPoint = {
        x: targetPosition.x - bounds.minX + 42,
        y: targetPosition.y - bounds.minY + 118
      };
      const labelPoint = {
        x: (sourcePoint.x + targetPoint.x) / 2,
        y: (sourcePoint.y + targetPoint.y) / 2 - 8
      };
      return `  <g class="edge edge-${cssSafe(edge.edge_type)}">
    <path d="M ${round(sourcePoint.x)} ${round(sourcePoint.y)} C ${round(
      sourcePoint.x + 90
    )} ${round(sourcePoint.y)}, ${round(targetPoint.x - 90)} ${round(targetPoint.y)}, ${round(
      targetPoint.x
    )} ${round(targetPoint.y)}" marker-end="url(#arrow)" />
    <text x="${round(labelPoint.x)}" y="${round(labelPoint.y)}">${xmlEscape(
      `${getRelationshipLabel(edge.edge_type, language)} ${formatConfidence(edge.confidence)}`
    )}</text>
  </g>`;
    })
    .filter(Boolean)
    .join("\n");
  const nodes = graph.nodes
    .map((node) => {
      const position = positions.get(node.id) ?? { x: node.position_x, y: node.position_y };
      const x = position.x - bounds.minX + 40;
      const y = position.y - bounds.minY + 72;
      return `  <g class="node node-${cssSafe(node.node_type)}" transform="translate(${round(x)} ${round(y)})">
    <rect width="180" height="86" rx="8" />
    <text class="kind" x="12" y="22">${xmlEscape(getNodeKindLabel(node.node_type, language))}</text>
    <text class="label" x="12" y="46">${xmlEscape(node.label)}</text>
    <text class="meta" x="12" y="68">${xmlEscape(node.source_ref)}</text>
  </g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}" role="img" aria-label="GraphMind export">
  <defs>
    <marker id="arrow" markerHeight="8" markerWidth="8" orient="auto-start-reverse" refX="8" refY="4" viewBox="0 0 8 8">
      <path d="M 0 0 L 8 4 L 0 8 z" />
    </marker>
  </defs>
  <style>
    .edge path { fill: none; stroke: #74839a; stroke-width: 1.8; }
    .edge text { fill: #607088; font: 11px Inter, Arial, sans-serif; paint-order: stroke; stroke: #ffffff; stroke-width: 3px; }
    .node rect { fill: #10131b; stroke: #2a3447; stroke-width: 1.2; }
    .node-table rect { stroke: #24d3b5; }
    .node-field rect { stroke: #5ba7ff; }
    .node-derived-entity rect { stroke: #f6b95f; }
    .node text { font-family: Inter, Arial, sans-serif; }
    .kind { fill: #8a98ad; font-size: 10px; font-weight: 700; }
    .label { fill: #f5f8ff; font-size: 13px; font-weight: 700; }
    .meta { fill: #8a98ad; font-size: 10px; }
  </style>
${edges}
${nodes}
</svg>
`;
}

export function createExportFileName(extension: string, date = new Date()): string {
  const stamp = date.toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return `graphmind-visible-graph-${stamp}.${extension}`;
}

function getGraphBounds(
  nodes: GraphNode[],
  positions: Map<number, { x: number; y: number }>
): { height: number; minX: number; minY: number; width: number } {
  if (nodes.length === 0) {
    return { height: 320, minX: 0, minY: 0, width: 480 };
  }
  const points = nodes.map((node) => positions.get(node.id) ?? { x: node.position_x, y: node.position_y });
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    height: Math.max(320, Math.ceil(maxY - minY + 220)),
    minX,
    minY,
    width: Math.max(480, Math.ceil(maxX - minX + 260))
  };
}

function cssSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
