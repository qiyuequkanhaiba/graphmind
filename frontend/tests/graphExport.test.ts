import { describe, expect, it } from "vitest";
import type { GraphFilters, GraphResponse } from "../src/api/types";
import {
  createExportFileName,
  createGraphJsonExportPayload,
  createGraphMlExport,
  createSvgGraphExport
} from "../src/components/graph/graphExport";

const graph: GraphResponse = {
  nodes: [
    {
      id: 1,
      node_type: "table",
      label: "Orders",
      source_ref: "orders",
      metadata: {},
      position_x: 80,
      position_y: 120
    },
    {
      id: 2,
      node_type: "field",
      label: "Orders.customer_id <id>",
      source_ref: "orders.customer_id",
      metadata: {},
      position_x: 340,
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

const filters: GraphFilters = {
  minConfidence: 0.8,
  statuses: {
    accepted: true,
    auto_trusted: true,
    edited: true,
    rejected: false,
    suggested: true
  },
  types: {
    contains_field: true,
    derived_dimension: true,
    foreign_key: true
  }
};

describe("graph export helpers", () => {
  it("creates a visible graph JSON payload with view state", () => {
    const payload = createGraphJsonExportPayload(
      graph,
      {
        filters,
        hiddenEdgeIds: [99],
        hiddenNodeIds: [42],
        layoutPreset: "semantic",
        viewMode: "analysis"
      },
      "2026-05-31T00:00:00.000Z"
    );

    expect(payload).toMatchObject({
      exported_at: "2026-05-31T00:00:00.000Z",
      filters,
      hidden_edge_ids: [99],
      hidden_node_ids: [42],
      layout_preset: "semantic",
      view_mode: "analysis"
    });
    expect(payload.nodes).toHaveLength(2);
    expect(payload.edges).toHaveLength(1);
  });

  it("creates GraphML with escaped labels and relationship metadata", () => {
    const graphMl = createGraphMlExport(graph);

    expect(graphMl).toContain("<graphml");
    expect(graphMl).toContain('<node id="2">');
    expect(graphMl).toContain("Orders.customer_id &lt;id&gt;");
    expect(graphMl).toContain('<edge id="10" source="1" target="2">');
    expect(graphMl).toContain("<data key=\"edge_type\">contains_field</data>");
    expect(graphMl).toContain("<data key=\"confidence\">1</data>");
  });

  it("creates an SVG graph export from explicit layout positions", () => {
    const svg = createSvgGraphExport(
      graph,
      new Map([
        [1, { x: 120, y: 90 }],
        [2, { x: 420, y: 90 }]
      ]),
      "zh-CN"
    );

    expect(svg).toContain("<svg");
    expect(svg).toContain('role="img"');
    expect(svg).toContain("Orders");
    expect(svg).toContain("Orders.customer_id &lt;id&gt;");
    expect(svg).toContain("包含字段 100%");
    expect(svg).toContain("node-field");
  });

  it("creates timestamped export file names", () => {
    expect(createExportFileName("graphml", new Date("2026-05-31T07:30:45.000Z"))).toBe(
      "graphmind-visible-graph-20260531073045.graphml"
    );
  });
});
