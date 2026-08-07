import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  DocumentChunk,
  ExtractedEntity,
  ExtractedRelationship,
  GraphResponse,
  RelationshipSuggestion,
  SourceDetail,
  EntityMatchReview
} from "../src/api/types";
import DataExplorerPanel from "../src/components/workbench/DataExplorerPanel";

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
  edges: []
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
    evidence_summary: "Region dimension.",
    evidence_payload: {},
    decision_status: "pending"
  }
];

const sourceDetails: SourceDetail[] = [
  {
    id: 1,
    import_item_id: 9,
    title: "identity-runbook.txt",
    document_type: "document",
    source_ref: "identity-runbook.txt",
    metadata: { path: "identity-runbook.txt" },
    chunk_count: 4,
    entity_count: 2,
    relationship_count: 2,
    created_at: "2026-06-02T00:00:00Z"
  }
];

const sourceChunksBySourceId: Record<number, DocumentChunk[]> = {
  1: [
    {
      id: 2,
      document_id: 1,
      chunk_index: 0,
      heading: "identity-runbook.txt",
      content: "Customer ID maps to customerId.",
      token_count: 240,
      source_ref: "identity-runbook.txt#chunk-1",
      content_hash: "abc",
      metadata: { token_start: 0, token_end: 240 },
      created_at: "2026-06-02T00:00:00Z"
    },
    {
      id: 5,
      document_id: 1,
      chunk_index: 1,
      heading: "identity-runbook.txt",
      content: "The /api/projects endpoint uses customerId.",
      token_count: 240,
      source_ref: "identity-runbook.txt#chunk-2",
      content_hash: "def",
      metadata: { token_start: 240, token_end: 480 },
      created_at: "2026-06-02T00:00:00Z"
    },
    {
      id: 6,
      document_id: 1,
      chunk_index: 2,
      heading: "identity-runbook.txt",
      content: "Order ID maps to orderId.",
      token_count: 240,
      source_ref: "identity-runbook.txt#chunk-3",
      content_hash: "ghi",
      metadata: { token_start: 480, token_end: 720 },
      created_at: "2026-06-02T00:00:00Z"
    },
    {
      id: 8,
      document_id: 1,
      chunk_index: 3,
      heading: "identity-runbook.txt",
      content: "The /api/orders endpoint uses orderId.",
      token_count: 240,
      source_ref: "identity-runbook.txt#chunk-4",
      content_hash: "jkl",
      metadata: { token_start: 720, token_end: 960 },
      created_at: "2026-06-02T00:00:00Z"
    }
  ]
};

const extractedEntities: ExtractedEntity[] = [
  {
    id: 3,
    canonical_name: "Customer ID",
    entity_type: "concept",
    aliases: [],
    confidence: 0.92,
    source_refs: ["identity-runbook.txt#chunk-1"],
    metadata: {},
    created_at: "2026-06-02T00:00:00Z"
  },
  {
    id: 5,
    canonical_name: "customerId",
    entity_type: "concept",
    aliases: [],
    confidence: 0.91,
    source_refs: ["identity-runbook.txt#chunk-1", "identity-runbook.txt#chunk-2"],
    metadata: {},
    created_at: "2026-06-02T00:00:00Z"
  }
];

const extractedRelationships: ExtractedRelationship[] = [
  {
    id: 4,
    source_entity_id: 3,
    target_entity_id: 5,
    source_name: "Customer ID",
    source_type: "concept",
    target_name: "customerId",
    target_type: "concept",
    relationship_type: "maps_to",
    confidence: 0.92,
    status: "suggested",
    evidence_summary: "Field mapping phrase links Customer ID to customerId.",
    evidence_payload: { rule: "field_mapping_phrase" },
    source_refs: ["identity-runbook.txt#chunk-1"],
    created_at: "2026-06-02T00:00:00Z"
  }
];

const entityMatchReviews: EntityMatchReview[] = [
  {
    id: 7,
    project_id: 42,
    source_node_id: 30,
    target_node_id: 31,
    source_label: "customers.customer_id",
    source_type: "field",
    target_label: "Customer ID",
    target_type: "entity",
    relationship_type: "matches_entity",
    confidence: 0.78,
    status: "suggested",
    evidence_ref: "entity_resolution:30:31",
    evidence_summary: "customers.customer_id matches Customer ID by normalized name.",
    matched_keys: ["customerid"],
    source_refs: ["identity-runbook.txt#chunk-1"],
    metadata: { rule: "normalized_name_match" }
  }
];

const mappingReviews: EntityMatchReview[] = [
  {
    id: 9,
    project_id: 42,
    source_node_id: 40,
    target_node_id: 41,
    source_label: "customers.customer_id",
    source_type: "field",
    target_label: "orders.customer_id",
    target_type: "field",
    relationship_type: "documented_mapping",
    confidence: 0.92,
    status: "suggested",
    evidence_ref: "identity-runbook.txt#chunk-1",
    evidence_summary: "Customer ID maps to customerId.",
    matched_keys: [],
    source_refs: ["identity-runbook.txt#chunk-1"],
    metadata: { rule: "documented_field_mapping" }
  }
];

describe("DataExplorerPanel", () => {
  it("renders a pro resource tree and selects graph nodes", () => {
    const onSelectNode = vi.fn();
    const onActionsOpenChange = vi.fn();
    render(
      <DataExplorerPanel
        collapsed={false}
        graph={graph}
        onActionsOpenChange={onActionsOpenChange}
        onSelectNode={onSelectNode}
        onToggleCollapsed={vi.fn()}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("heading", { name: "数据树" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "表" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "字段" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "维度" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "待审核" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "数据操作" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "数据导入" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("工作台资源树")).toHaveClass("resource-tree");
    expect(screen.getByText("待确认 · 76%")).toBeInTheDocument();
    expect(screen.queryByText("派生维度")).not.toBeInTheDocument();
    expect(screen.queryByText("外键")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "选择 Orders.customer_id" }));
    expect(onSelectNode).toHaveBeenCalledWith(graph.nodes[1]);
    fireEvent.click(screen.getByRole("button", { name: "数据操作" }));
    expect(onActionsOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("heading", { name: "数据导入" })).not.toBeInTheDocument();
  });

  it("renders a slim collapsed rail", () => {
    render(
      <DataExplorerPanel
        collapsed
        graph={graph}
        onToggleCollapsed={vi.fn()}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("button", { name: "展开数据树" })).toBeInTheDocument();
    expect(screen.getByText("数据")).toBeInTheDocument();
  });

  it("renders source documents and selected source inspection details", () => {
    const onReviewEntityMatch = vi.fn();
    const onReviewMappingEdge = vi.fn();
    render(
      <DataExplorerPanel
        collapsed={false}
        entityMatchReviews={entityMatchReviews}
        extractedEntities={extractedEntities}
        extractedRelationships={extractedRelationships}
        graph={graph}
        mappingReviews={mappingReviews}
        onReviewEntityMatch={onReviewEntityMatch}
        onReviewMappingEdge={onReviewMappingEdge}
        onToggleCollapsed={vi.fn()}
        sourceChunksBySourceId={sourceChunksBySourceId}
        sourceDetails={sourceDetails}
        suggestions={suggestions}
      />
    );

    expect(screen.getByRole("heading", { name: "来源" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择来源 identity-runbook.txt" })).toBeInTheDocument();
    expect(screen.getByText("4 个片段 · 2 个实体 · 2 条关系")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "选择来源 identity-runbook.txt" }));

    expect(screen.getByRole("heading", { name: "来源检查" })).toBeInTheDocument();
    expect(screen.getByText("identity-runbook.txt", { selector: ".source-inspector-ref" })).toBeInTheDocument();
    expect(screen.getByText("Field mapping phrase links Customer ID to customerId.")).toBeInTheDocument();
    expect(screen.getByText("The /api/orders endpoint uses orderId.")).toBeInTheDocument();
    expect(screen.getByText("identity-runbook.txt#chunk-4")).toBeInTheDocument();
    expect(screen.getByText("令牌 720-960")).toBeInTheDocument();
    expect(screen.getByText("Customer ID")).toBeInTheDocument();
    expect(screen.getByText("Customer ID -> customerId")).toBeInTheDocument();
    expect(screen.getByText("maps_to · 92%")).toBeInTheDocument();
    expect(screen.getAllByText("Customer ID maps to customerId.")).toHaveLength(2);
    expect(screen.getByText("field_mapping_phrase")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "文档映射" })).toBeInTheDocument();
    expect(screen.getByText("customers.customer_id -> orders.customer_id")).toBeInTheDocument();
    expect(screen.getByText("documented_mapping · 92%")).toBeInTheDocument();
    expect(screen.getByText("documented_field_mapping")).toBeInTheDocument();
    expect(screen.getByText("customers.customer_id -> Customer ID")).toBeInTheDocument();
    expect(screen.getByText("matches_entity · 78% · customerid")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "接受文档映射 customers.customer_id 到 orders.customer_id"
      })
    );

    expect(onReviewMappingEdge).toHaveBeenCalledWith(9, "accepted");

    fireEvent.click(
      screen.getByRole("button", {
        name: "接受实体匹配 customers.customer_id 到 Customer ID"
      })
    );

    expect(onReviewEntityMatch).toHaveBeenCalledWith(7, "accepted");
  });

  it("lazy-loads selected source chunks when the cache is empty", async () => {
    const onLoadSourceChunks = vi.fn().mockResolvedValue([
      {
        id: 22,
        document_id: 1,
        chunk_index: 0,
        heading: "identity-runbook.txt",
        content: "Lazy-loaded evidence chunk.",
        token_count: 120,
        source_ref: "identity-runbook.txt#chunk-1",
        content_hash: "lazy",
        metadata: {},
        created_at: "2026-06-02T00:00:00Z"
      }
    ]);

    render(
      <DataExplorerPanel
        collapsed={false}
        graph={graph}
        onLoadSourceChunks={onLoadSourceChunks}
        onToggleCollapsed={vi.fn()}
        sourceChunksBySourceId={{}}
        sourceDetails={sourceDetails}
        suggestions={suggestions}
      />
    );

    expect(onLoadSourceChunks).toHaveBeenCalledWith(1);
    expect(screen.getByText("正在加载片段...")).toBeInTheDocument();
    expect(await screen.findByText("Lazy-loaded evidence chunk.")).toBeInTheDocument();
  });

  it("highlights the focused source chunk", () => {
    render(
      <DataExplorerPanel
        collapsed={false}
        focusedEvidenceRef="identity-runbook.txt#chunk-4"
        graph={graph}
        onToggleCollapsed={vi.fn()}
        sourceChunksBySourceId={sourceChunksBySourceId}
        sourceDetails={sourceDetails}
        suggestions={suggestions}
      />
    );

    expect(screen.getByText("The /api/orders endpoint uses orderId.").closest("li")).toHaveClass(
      "is-focused"
    );
    expect(screen.getByText("Customer ID maps to customerId.").closest("li")).not.toHaveClass(
      "is-focused"
    );
  });

  it("keeps an off-screen focused source chunk visible", () => {
    const longSourceDetails = [{ ...sourceDetails[0], chunk_count: 7 }];
    const longSourceChunksBySourceId = {
      1: Array.from({ length: 7 }, (_, index): DocumentChunk => ({
        id: index + 100,
        document_id: 1,
        chunk_index: index,
        heading: `identity-runbook.txt part ${index + 1}`,
        content: `Source chunk ${index + 1} content.`,
        token_count: 120,
        source_ref: `identity-runbook.txt#chunk-${index + 1}`,
        content_hash: `chunk-${index + 1}`,
        metadata: {},
        created_at: "2026-06-02T00:00:00Z"
      }))
    };

    render(
      <DataExplorerPanel
        collapsed={false}
        focusedEvidenceRef="identity-runbook.txt#chunk-7"
        graph={graph}
        onToggleCollapsed={vi.fn()}
        sourceChunksBySourceId={longSourceChunksBySourceId}
        sourceDetails={longSourceDetails}
        suggestions={suggestions}
      />
    );

    expect(screen.getByText("Source chunk 7 content.")).toBeInTheDocument();
    expect(screen.getByText("Source chunk 7 content.").closest("li")).toHaveClass(
      "is-focused"
    );
  });
});
