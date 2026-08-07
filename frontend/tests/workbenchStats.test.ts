import { describe, expect, it } from "vitest";
import type {
  EntityMatchReview,
  GraphNode,
  GraphResponse,
  GraphSelection,
  RelationshipSuggestion
} from "../src/api/types";
import {
  buildGraphQualitySummary,
  buildWorkbenchTree,
  countGraphNodeTypes,
  formatGraphSummary,
  getPendingSuggestionCount,
  getSelectionSummary,
  searchGraphNodes
} from "../src/components/workbench/workbenchStats";

const graph: GraphResponse = {
  nodes: [
    {
      id: 1,
      node_type: "table",
      label: "Orders",
      source_ref: "orders",
      metadata: { row_count: 3, column_count: 2 },
      position_x: 0,
      position_y: 0
    },
    {
      id: 2,
      node_type: "field",
      label: "Orders.customer_id",
      source_ref: "orders.customer_id",
      metadata: { inferred_type: "identifier" },
      position_x: 0,
      position_y: 120
    },
    {
      id: 3,
      node_type: "derived_entity",
      label: "region values",
      source_ref: "orders.region",
      metadata: { unique_count: 2 },
      position_x: 160,
      position_y: 120
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
    }
  ]
};

const suggestions: RelationshipSuggestion[] = [
  {
    id: 7,
    source_field_id: 2,
    target_field_id: null,
    source_label: "Orders.region",
    target_label: null,
    relationship_type: "derived_dimension",
    confidence: 0.76,
    evidence_summary: "Region can be explored as a dimension.",
    evidence_payload: { unique_count: 2 },
    decision_status: "pending"
  },
  {
    id: 8,
    source_field_id: 2,
    target_field_id: 3,
    source_label: "Orders.customer_id",
    target_label: "Customers.customer_id",
    relationship_type: "foreign_key",
    confidence: 0.94,
    evidence_summary: "Accepted relationship.",
    evidence_payload: {},
    decision_status: "accepted"
  }
];

describe("workbenchStats", () => {
  it("counts graph node types and formats graph summary", () => {
    expect(countGraphNodeTypes(graph.nodes)).toEqual({
      tables: 1,
      fields: 1,
      dimensions: 1
    });
    expect(formatGraphSummary(graph, suggestions)).toBe("3 个节点 · 1 条边 · 1 条待审核");
  });

  it("filters graph nodes by label, source ref, and type", () => {
    expect(searchGraphNodes(graph.nodes, "customer")).toEqual([graph.nodes[1]]);
    expect(searchGraphNodes(graph.nodes, "orders.region")).toEqual([graph.nodes[2]]);
    expect(searchGraphNodes(graph.nodes, "表")).toEqual([graph.nodes[0]]);
    expect(searchGraphNodes(graph.nodes, "missing")).toEqual([]);
  });

  it("limits graph node search results", () => {
    const manyNodes: GraphNode[] = Array.from({ length: 12 }, (_, index) => ({
      id: index + 10,
      node_type: "field",
      label: `字段 ${index}`,
      source_ref: `orders.field_${index}`,
      metadata: {},
      position_x: 0,
      position_y: index * 80
    }));

    expect(searchGraphNodes(manyNodes, "字段", 5)).toHaveLength(5);
  });

  it("summarizes 待处理 suggestions and current selection", () => {
    expect(getPendingSuggestionCount(suggestions)).toBe(1);
    expect(getSelectionSummary(null)).toBe("未选择");

    const nodeSelection: GraphSelection = {
      kind: "node",
      node: graph.nodes[1],
      adjacentEdges: graph.edges
    };
    expect(getSelectionSummary(nodeSelection)).toBe("节点：Orders.customer_id");

    const edgeSelection: GraphSelection = {
      kind: "edge",
      edge: graph.edges[0],
      sourceNode: graph.nodes[0],
      targetNode: graph.nodes[1]
    };
    expect(getSelectionSummary(edgeSelection)).toBe("关系：包含字段");
  });

  it("builds a GitNexus-style resource tree from graph nodes and suggestions", () => {
    const tree = buildWorkbenchTree(graph, suggestions);

    expect(tree.tables).toEqual([
      {
        id: "table-1",
        label: "Orders",
        meta: "3 行 · 2 个字段",
        node: graph.nodes[0],
        type: "table"
      }
    ]);
    expect(tree.fields).toEqual([
      {
        id: "field-2",
        label: "Orders.customer_id",
        meta: "identifier",
        node: graph.nodes[1],
        parentLabel: "Orders",
        type: "field"
      }
    ]);
    expect(tree.dimensions).toEqual([
      {
        id: "dimension-3",
        label: "region values",
        meta: "2 个值",
        node: graph.nodes[2],
        type: "dimension"
      }
    ]);
    expect(tree.reviews).toEqual([
      {
        id: "review-7",
        label: "Orders.region",
        meta: "待确认 · 76%",
        suggestion: suggestions[0],
        type: "review"
      }
    ]);
  });

  it("hides internal extracted relationship anchor resources from the regular tree", () => {
    const internalTable: GraphNode = {
      id: 20,
      node_type: "table",
      label: "Extracted entities",
      source_ref: "extracted_entities_42",
      metadata: { row_count: 0, column_count: 0 },
      position_x: 0,
      position_y: 0
    };
    const internalField: GraphNode = {
      id: 21,
      node_type: "field",
      label: "Extracted entities.entity_3",
      source_ref: "extracted_entities_42.entity_3",
      metadata: { inferred_type: "concept" },
      position_x: 0,
      position_y: 0
    };
    const extractedSuggestion: RelationshipSuggestion = {
      id: 9,
      source_field_id: 21,
      target_field_id: null,
      source_label: "Customer ID",
      target_label: "customerId",
      relationship_type: "maps_to",
      confidence: 0.91,
      evidence_summary: "Document evidence maps Customer ID to customerId.",
      evidence_payload: { source_kind: "extracted_relationship" },
      decision_status: "pending"
    };

    const tree = buildWorkbenchTree(
      { ...graph, nodes: [...graph.nodes, internalTable, internalField] },
      [...suggestions, extractedSuggestion]
    );

    expect(tree.tables.map((row) => row.label)).toEqual(["Orders"]);
    expect(tree.fields.map((row) => row.label)).toEqual(["Orders.customer_id"]);
    expect(tree.reviews.map((row) => row.label)).toContain("Customer ID");
  });

  it("builds graph quality operations metrics", () => {
    const qualityGraph: GraphResponse = {
      nodes: [
        ...graph.nodes,
        {
          id: 4,
          node_type: "field",
          label: "Products.sku",
          source_ref: "products.sku",
          metadata: {},
          position_x: 0,
          position_y: 0
        }
      ],
      edges: [
        ...graph.edges,
        {
          id: 11,
          source_node_id: 2,
          target_node_id: 3,
          edge_type: "foreign_key",
          confidence: 0.52,
          status: "suggested",
          evidence_ref: "",
          created_from_suggestion_id: 7,
          metadata: {},
          evidence_summary: null,
          evidence_payload: null
        },
        {
          id: 12,
          source_node_id: 1,
          target_node_id: 3,
          edge_type: "derived_dimension",
          confidence: 0.9,
          status: "accepted",
          evidence_ref: "doc:regions",
          created_from_suggestion_id: null,
          metadata: {},
          evidence_summary: "Document evidence.",
          evidence_payload: null
        }
      ]
    };

    expect(
      buildGraphQualitySummary(qualityGraph, suggestions, {
        total_suggestion_count: 3,
        visible_suggestion_count: 2,
        duplicate_suggestion_count: 1,
        duplicate_group_count: 1,
        pending_suggestion_count: 1,
        accepted_suggestion_count: 1,
        rejected_suggestion_count: 0,
        edited_suggestion_count: 0,
        duplicate_groups: [
          {
            canonical_suggestion_id: 7,
            duplicate_suggestion_ids: [8],
            relationship_type: "foreign_key",
            source_label: "Orders.customer_id",
            target_label: "Customers.customer_id"
          }
        ]
      }, [
        {
          id: 30,
          project_id: 42,
          source_node_id: 21,
          target_node_id: 31,
          source_label: "Orders.customer_id",
          source_type: "field",
          target_label: "Customer",
          target_type: "entity",
          relationship_type: "matches_entity",
          confidence: 0.81,
          status: "suggested",
          evidence_ref: "entity_resolution:21:31",
          evidence_summary: "Name evidence",
          matched_keys: ["customerid"],
          source_refs: ["orders.csv#customer_id"],
          metadata: {}
        },
        {
          id: 31,
          project_id: 42,
          source_node_id: 22,
          target_node_id: 32,
          source_label: "Orders.region",
          source_type: "field",
          target_label: "Region",
          target_type: "entity",
          relationship_type: "matches_entity",
          confidence: 0.9,
          status: "accepted",
          evidence_ref: "entity_resolution:22:32",
          evidence_summary: "Accepted match",
          matched_keys: ["region"],
          source_refs: ["orders.csv#region"],
          metadata: {}
        }
      ] satisfies EntityMatchReview[], [
        {
          id: 40,
          project_id: 42,
          source_node_id: 23,
          target_node_id: 33,
          source_label: "Customer ID",
          source_type: "field",
          target_label: "customerId",
          target_type: "field",
          relationship_type: "documented_mapping",
          confidence: 0.84,
          status: "suggested",
          evidence_ref: "runbook.md#identity",
          evidence_summary: "Mapping evidence",
          matched_keys: [],
          source_refs: ["runbook.md#identity"],
          metadata: {}
        }
      ] satisfies EntityMatchReview[])
    ).toEqual({
      duplicateGroups: 1,
      evidenceCoverageRatio: 0.67,
      evidenceCoveredRelationships: 2,
      isolatedNodes: 1,
      isolatedNodePreview: [
        {
          id: 4,
          label: "Products.sku",
          nodeType: "field",
          sourceRef: "products.sku"
        }
      ],
      unresolvedEntityMatches: 1,
      unresolvedMappingReviews: 1,
      pendingReviews: 1,
      relationshipCount: 3,
      weakEvidenceRelationshipPreview: [
        {
          confidence: 0.52,
          id: 11,
          label: "Orders.customer_id → region values",
          relationshipType: "foreign_key"
        }
      ],
      weakEvidenceRelationships: 1,
      entityMatchPreview: [
        {
          confidence: 0.81,
          id: 30,
          label: "Orders.customer_id → Customer",
          reviewType: "matches_entity",
          sourceNodeId: 21,
          targetNodeId: 31
        }
      ],
      mappingReviewPreview: [
        {
          confidence: 0.84,
          id: 40,
          label: "Customer ID → customerId",
          reviewType: "documented_mapping",
          sourceNodeId: 23,
          targetNodeId: 33
        }
      ]
    });
  });
});
