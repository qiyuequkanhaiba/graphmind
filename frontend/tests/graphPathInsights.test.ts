import { describe, expect, it } from "vitest";
import type { GraphResponse, GraphSelection } from "../src/api/types";
import {
  getFieldLineagePath,
  getNodeNeighborhood,
  getRelationshipStrengthLayers,
  getRelationshipPathSummary,
  getShortestRelationshipPath,
  mergeHighlightedPaths
} from "../src/components/graph/graphPathInsights";

const graph: GraphResponse = {
  nodes: [
    {
      id: 1,
      node_type: "table",
      label: "Orders",
      source_ref: "orders",
      metadata: {},
      position_x: 0,
      position_y: 0
    },
    {
      id: 2,
      node_type: "field",
      label: "Orders.customer_id",
      source_ref: "orders.customer_id",
      metadata: {},
      position_x: 0,
      position_y: 0
    },
    {
      id: 3,
      node_type: "field",
      label: "Customers.customer_id",
      source_ref: "customers.customer_id",
      metadata: {},
      position_x: 0,
      position_y: 0
    },
    {
      id: 4,
      node_type: "table",
      label: "Customers",
      source_ref: "customers",
      metadata: {},
      position_x: 0,
      position_y: 0
    }
  ],
  edges: [
    {
      id: 10,
      source_node_id: 1,
      target_node_id: 2,
      edge_type: "contains_field",
      confidence: 1,
      status: "auto_trusted",
      evidence_ref: "field:orders.customer_id",
      created_from_suggestion_id: null,
      metadata: {},
      evidence_summary: null,
      evidence_payload: null
    },
    {
      id: 11,
      source_node_id: 2,
      target_node_id: 3,
      edge_type: "foreign_key",
      confidence: 0.94,
      status: "suggested",
      evidence_ref: "suggestion:7",
      created_from_suggestion_id: 7,
      metadata: {},
      evidence_summary: "overlap",
      evidence_payload: null
    },
    {
      id: 12,
      source_node_id: 4,
      target_node_id: 3,
      edge_type: "contains_field",
      confidence: 1,
      status: "auto_trusted",
      evidence_ref: "field:customers.customer_id",
      created_from_suggestion_id: null,
      metadata: {},
      evidence_summary: null,
      evidence_payload: null
    }
  ]
};

describe("graphPathInsights", () => {
  it("finds one-hop node neighborhoods", () => {
    expect(getNodeNeighborhood(graph, 2, 1)).toEqual({
      edgeIds: [10, 11],
      nodeIds: [2, 1, 3]
    });
  });

  it("finds two-hop node neighborhoods without duplicates", () => {
    expect(getNodeNeighborhood(graph, 2, 2)).toEqual({
      edgeIds: [10, 11, 12],
      nodeIds: [2, 1, 3, 4]
    });
  });

  it("summarizes selected node relationships", () => {
    const selection: GraphSelection = {
      kind: "node",
      node: graph.nodes[1],
      adjacentEdges: [graph.edges[0], graph.edges[1]]
    };

    expect(getRelationshipPathSummary(graph, selection, 1)).toEqual({
      actionHints: ["review_pending", "validate_foreign_key"],
      confidence: null,
      downstreamCount: 1,
      edgeStatus: null,
      evidenceRefs: ["field:orders.customer_id", "suggestion:7"],
      impactLabels: ["Orders", "Customers.customer_id"],
      pendingCount: 1,
      pathNodeLabels: ["Orders.customer_id", "Orders", "Customers.customer_id"],
      relationshipTypes: ["contains_field", "foreign_key"],
      sourceLabel: null,
      targetLabel: null,
      upstreamCount: 1
    });
  });

  it("summarizes selected edge relationships", () => {
    const selection: GraphSelection = {
      kind: "edge",
      edge: graph.edges[1],
      sourceNode: graph.nodes[1],
      targetNode: graph.nodes[2]
    };

    expect(getRelationshipPathSummary(graph, selection, 1)).toEqual({
      actionHints: ["review_pending", "validate_foreign_key"],
      confidence: 0.94,
      downstreamCount: 0,
      edgeStatus: "suggested",
      evidenceRefs: ["suggestion:7"],
      impactLabels: ["Orders.customer_id", "Customers.customer_id"],
      pendingCount: 1,
      pathNodeLabels: ["Orders.customer_id", "Customers.customer_id"],
      relationshipTypes: ["foreign_key"],
      sourceLabel: "Orders.customer_id",
      targetLabel: "Customers.customer_id",
      upstreamCount: 0
    });
  });

  it("merges highlighted paths with exploration priority and stable order", () => {
    expect(mergeHighlightedPaths([4, 2], [2, 1, 3])).toEqual([2, 1, 3, 4]);
  });

  it("finds the shortest relationship path between two graph nodes", () => {
    expect(getShortestRelationshipPath(graph, 1, 4)).toEqual({
      edgeIds: [10, 11, 12],
      nodeIds: [1, 2, 3, 4]
    });
  });

  it("builds a field lineage path through table ownership and analytical relationships", () => {
    expect(getFieldLineagePath(graph, 2, 3)).toEqual({
      edgeIds: [10, 11, 12],
      nodeIds: [1, 2, 3, 4]
    });
  });

  it("summarizes relationship strength layers for the visible graph", () => {
    expect(getRelationshipStrengthLayers(graph.edges)).toEqual([
      { key: "strong", count: 3, percentage: 1, edgeIds: [10, 11, 12] },
      { key: "likely", count: 0, percentage: 0, edgeIds: [] },
      { key: "possible", count: 0, percentage: 0, edgeIds: [] }
    ]);
  });
});
