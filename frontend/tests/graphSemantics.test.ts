import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "../src/api/types";
import {
  buildSemanticLayout,
  edgeMatchesFilters,
  evidenceRowsFromPayload,
  formatConfidence,
  formatEvidenceSummary,
  getEdgeClassName,
  getRelationshipChipLabel,
  getRelationshipLabel,
  getSelectionForEdge,
  getSelectionForNode,
  nodeSubtitle
} from "../src/components/graph/graphSemantics";

const tableNode: GraphNode = {
  id: 1,
  node_type: "table",
  label: "Orders",
  source_ref: "orders",
  metadata: { row_count: 3, column_count: 5 },
  position_x: 0,
  position_y: 0
};

const sourceNode: GraphNode = {
  id: 2,
  node_type: "field",
  label: "Orders.customer_id",
  source_ref: "orders.customer_id",
  metadata: { inferred_type: "string", key_candidate_score: 0.91 },
  position_x: 100,
  position_y: 0
};

const targetNode: GraphNode = {
  id: 3,
  node_type: "field",
  label: "Customers.customer_id",
  source_ref: "customers.customer_id",
  metadata: { inferred_type: "string" },
  position_x: 240,
  position_y: 0
};

const edge: GraphEdge = {
  id: 10,
  source_node_id: 2,
  target_node_id: 3,
  edge_type: "foreign_key",
  confidence: 0.94,
  status: "suggested",
  evidence_ref: "suggestion:0",
  created_from_suggestion_id: 7,
  metadata: {},
  evidence_summary: "2 of 2 values overlap.",
  evidence_payload: { overlap_count: 2, source_match_ratio: 1 }
};

const likelyEdge: GraphEdge = {
  ...edge,
  id: 13,
  confidence: 0.84,
  evidence_payload: { relationship_strength: "likely" }
};

const possibleEdge: GraphEdge = {
  ...edge,
  id: 14,
  confidence: 0.74,
  evidence_payload: { relationship_strength: "possible" }
};

const structuralEdge: GraphEdge = {
  ...edge,
  id: 15,
  edge_type: "contains_field",
  confidence: 1,
  status: "auto_trusted",
  evidence_payload: null
};

const dimensionNode: GraphNode = {
  id: 4,
  node_type: "derived_entity",
  label: "customer_id values",
  source_ref: "orders.customer_id",
  metadata: { unique_count: 2 },
  position_x: 620,
  position_y: 0
};

describe("graphSemantics", () => {
  it("formats graph labels and classes", () => {
    expect(formatConfidence(0.944)).toBe("94%");
    expect(getRelationshipLabel("foreign_key")).toBe("外键");
    expect(getRelationshipChipLabel(edge)).toBe("外键 · 94% · 建议");
    expect(getEdgeClassName(edge, [10])).toContain("semantic-edge-foreign-key");
    expect(getEdgeClassName(edge, [10])).toContain("edge-strength-strong");
    expect(getEdgeClassName(edge, [10])).toContain("is-highlighted");
    expect(getEdgeClassName(likelyEdge)).toContain("edge-strength-likely");
    expect(getEdgeClassName(possibleEdge)).toContain("edge-strength-possible");
    expect(getEdgeClassName(structuralEdge)).toContain("edge-structural");
  });

  it("creates subtitles from node metadata", () => {
    expect(nodeSubtitle(tableNode)).toBe("3 行 · 5 个字段");
    expect(nodeSubtitle(sourceNode)).toBe("string · 键候选 91%");
    expect(nodeSubtitle(tableNode, "en-US")).toBe("3 rows · 5 fields");
    expect(nodeSubtitle(sourceNode, "en-US")).toBe("string · key 91%");
  });

  it("filters edges by status, type, confidence, and rejected default", () => {
    expect(
      edgeMatchesFilters(edge, {
        statuses: {
          auto_trusted: true,
          suggested: true,
          accepted: true,
          edited: true,
          rejected: false
        },
        types: { contains_field: true, foreign_key: true, derived_dimension: true },
        minConfidence: 0.9
      })
    ).toBe(true);
    expect(
      edgeMatchesFilters(edge, {
        statuses: {
          auto_trusted: true,
          suggested: false,
          accepted: true,
          edited: true,
          rejected: false
        },
        types: { contains_field: true, foreign_key: true, derived_dimension: true },
        minConfidence: 0.9
      })
    ).toBe(false);
    expect(
      edgeMatchesFilters(edge, {
        statuses: {
          auto_trusted: true,
          suggested: true,
          accepted: true,
          edited: true,
          rejected: false
        },
        types: { contains_field: true, foreign_key: false, derived_dimension: true },
        minConfidence: 0.9
      })
    ).toBe(false);
    expect(
      edgeMatchesFilters(edge, {
        statuses: {
          auto_trusted: true,
          suggested: true,
          accepted: true,
          edited: true,
          rejected: false
        },
        types: { contains_field: true, foreign_key: true, derived_dimension: true },
        minConfidence: 0.95
      })
    ).toBe(false);
  });

  it("builds selections with source and target lookup", () => {
    expect(getSelectionForNode("1", [tableNode], [edge])).toEqual({
      kind: "node",
      node: tableNode,
      adjacentEdges: []
    });
    expect(getSelectionForEdge("10", [sourceNode, targetNode], [edge])).toEqual({
      kind: "edge",
      edge,
      sourceNode,
      targetNode
    });
  });

  it("turns evidence payloads into Chinese readable rows by default", () => {
    expect(
      evidenceRowsFromPayload({
        overlap_count: 2,
        source_match_ratio: 1,
        matched_row_count: 3,
        source_null_ratio: 0,
        field_name_similarity: 0.71,
        field_type_compatible: true,
        sample_matches: ["c1", "c2"],
        relationship_strength: "strong"
      })
    ).toEqual([
      { label: "重合取值数", value: "2" },
      { label: "源字段匹配率", value: "100%" },
      { label: "匹配行数", value: "3" },
      { label: "源字段空值率", value: "0%" },
      { label: "字段名相似度", value: "71%" },
      { label: "字段类型兼容", value: "是" },
      { label: "匹配样例", value: "c1, c2" },
      { label: "关系强度", value: "强" }
    ]);
  });

  it("keeps evidence payload rows readable in English mode", () => {
    expect(evidenceRowsFromPayload({ overlap_count: 2, source_match_ratio: 1 }, "en-US")).toEqual([
      { label: "Overlap count", value: "2" },
      { label: "Source match ratio", value: "100%" }
    ]);
  });

  it("formats known evidence payloads as Chinese summaries by default", () => {
    expect(
      formatEvidenceSummary(
        "Orders.customer_id",
        "Customers.customer_id",
        {
          overlap_count: 2,
          source_distinct_count: 2,
          source_match_ratio: 1,
          matched_row_count: 3,
          source_non_null_count: 3,
          field_name_similarity: 0.71,
          relationship_strength: "strong"
        },
        "2 of 2 distinct source values overlap."
      )
    ).toBe(
      "2 个源字段不同取值中有 2 个与目标字段重合；源字段匹配率 100%；3 行非空源数据中有 3 行可匹配目标取值；字段名相似度 71%；关系强度：强。"
    );

    expect(
      formatEvidenceSummary(
        "Products.category",
        null,
        { unique_count: 2 },
        "Products.category has 2 distinct category values."
      )
    ).toBe("Products.category 有 2 个不同类别值，可作为维度进行分析。");
  });

  it("keeps evidence summaries unchanged in English mode", () => {
    expect(
      formatEvidenceSummary(
        "Orders.customer_id",
        "Customers.customer_id",
        { overlap_count: 2, source_match_ratio: 1 },
        "2 of 2 distinct source values overlap.",
        "en-US"
      )
    ).toBe("2 of 2 distinct source values overlap.");
  });

  it("builds a semantic table layout with tables before fields and dimensions", () => {
    const layout = buildSemanticLayout({
      nodes: [sourceNode, dimensionNode, tableNode, targetNode],
      edges: [edge]
    });

    expect(layout.get(1)).toEqual({ x: 80, y: 80 });
    expect(layout.get(2)).toEqual({ x: 340, y: 80 });
    expect(layout.get(3)).toEqual({ x: 340, y: 220 });
    expect(layout.get(4)).toEqual({ x: 620, y: 80 });
  });
});
