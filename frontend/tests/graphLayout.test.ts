import { describe, expect, it } from "vitest";
import type { GraphResponse } from "../src/api/types";
import {
  buildGraphLayout,
  deserializeGraphLayout,
  serializeGraphLayout
} from "../src/components/graph/graphLayout";

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
      node_type: "derived_entity",
      label: "Customer values",
      source_ref: "orders.customer_id",
      metadata: {},
      position_x: 0,
      position_y: 0
    }
  ],
  edges: []
};

describe("graphLayout", () => {
  it("reuses the semantic layout preset for table-field-dimension layers", () => {
    const layout = buildGraphLayout(graph, "semantic");

    expect(layout.get(1)).toEqual({ x: 80, y: 80 });
    expect(layout.get(2)).toEqual({ x: 340, y: 80 });
    expect(layout.get(3)).toEqual({ x: 620, y: 80 });
  });

  it("builds a field-first layout preset with fields leading the scan path", () => {
    const layout = buildGraphLayout(graph, "field_first");

    expect(layout.get(2)).toEqual({ x: 120, y: 80 });
    expect(layout.get(1)).toEqual({ x: 380, y: 80 });
    expect(layout.get(3)).toEqual({ x: 640, y: 80 });
  });

  it("serializes worker layout positions without losing node ids", () => {
    const serialized = serializeGraphLayout(buildGraphLayout(graph, "compact"));

    expect(deserializeGraphLayout(serialized)).toEqual(new Map(serialized));
    expect(serialized.map(([nodeId]) => nodeId)).toEqual([1, 2, 3]);
  });
});
