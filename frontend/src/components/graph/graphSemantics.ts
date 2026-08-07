import type { GraphEdge, GraphFilters, GraphNode, GraphSelection } from "../../api/types";
import type { Language } from "../../i18n/messages";

export const defaultGraphFilters: GraphFilters = {
  statuses: {
    auto_trusted: true,
    suggested: true,
    accepted: true,
    edited: true,
    rejected: false
  },
  types: {
    contains_field: true,
    foreign_key: true,
    derived_dimension: true
  },
  minConfidence: 0
};

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function getRelationshipLabel(edgeType: string, language: Language = "zh-CN"): string {
  const labels: Record<Language, Record<string, string>> = {
    "zh-CN": {
      contains_field: "包含字段",
      foreign_key: "外键",
      derived_dimension: "派生维度",
      same_entity: "同一实体"
    },
    "en-US": {
      contains_field: "Contains field",
      foreign_key: "Foreign key",
      derived_dimension: "Dimension",
      same_entity: "same entity"
    }
  };
  return labels[language][edgeType] ?? edgeType.replace(/_/g, " ");
}

export function getRelationshipChipLabel(edge: GraphEdge, language: Language = "zh-CN"): string {
  const aggregateCount = aggregateCountFromRecord(edge.evidence_payload ?? edge.metadata);
  const aggregateLabel =
    aggregateCount > 1
      ? language === "en-US"
        ? ` · x${aggregateCount}`
        : ` · 聚合 ${aggregateCount}`
      : "";
  return `${getRelationshipLabel(edge.edge_type, language)} · ${formatConfidence(edge.confidence)} · ${formatStatusLabel(edge.status, language)}${aggregateLabel}`;
}

export function getNodeKindLabel(nodeType: string, language: Language = "zh-CN"): string {
  const labels: Record<Language, Record<string, string>> = {
    "zh-CN": {
      table: "表",
      field: "字段",
      derived_entity: "维度",
      document: "文档",
      entity: "实体",
      code_symbol: "代码符号"
    },
    "en-US": {
      table: "Table",
      field: "Field",
      derived_entity: "Dimension",
      document: "Document",
      entity: "Entity",
      code_symbol: "Code symbol"
    }
  };
  return labels[language][nodeType] ?? nodeType;
}

export function formatStatusLabel(status: string, language: Language = "zh-CN"): string {
  const labels: Record<Language, Record<string, string>> = {
    "zh-CN": {
      auto_trusted: "自动可信",
      suggested: "建议",
      accepted: "已接受",
      edited: "已编辑",
      rejected: "已拒绝",
      pending: "待处理"
    },
    "en-US": {
      auto_trusted: "auto_trusted",
      suggested: "suggested",
      accepted: "accepted",
      edited: "edited",
      rejected: "rejected",
      pending: "pending"
    }
  };
  return labels[language][status] ?? status;
}

export type SemanticLayoutPosition = {
  x: number;
  y: number;
};

export function buildSemanticLayout(graph: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}): Map<number, SemanticLayoutPosition> {
  const layout = new Map<number, SemanticLayoutPosition>();
  const columns: Record<GraphNode["node_type"], { x: number; stepY: number }> = {
    table: { x: 80, stepY: 180 },
    field: { x: 340, stepY: 140 },
    derived_entity: { x: 620, stepY: 140 },
    document: { x: 80, stepY: 160 },
    entity: { x: 620, stepY: 140 },
    code_symbol: { x: 620, stepY: 140 }
  };

  (Object.keys(columns) as GraphNode["node_type"][]).forEach((nodeType) => {
    graph.nodes
      .filter((node) => node.node_type === nodeType)
      .forEach((node, index) => {
        layout.set(node.id, { x: columns[nodeType].x, y: 80 + index * columns[nodeType].stepY });
      });
  });

  return layout;
}

function numberMetadata(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function nodeSubtitle(node: GraphNode, language: Language = "zh-CN"): string {
  if (node.node_type === "table") {
    const rows = numberMetadata(node.metadata, "row_count");
    const columns = numberMetadata(node.metadata, "column_count");
    if (rows !== null && columns !== null) {
      return language === "en-US"
        ? `${rows} rows · ${columns} fields`
        : `${rows} 行 · ${columns} 个字段`;
    }
  }

  if (node.node_type === "field") {
    const inferredType = String(node.metadata.inferred_type ?? "unknown");
    const keyScore = numberMetadata(node.metadata, "key_candidate_score");
    if (keyScore === null) {
      return inferredType;
    }
    return language === "en-US"
      ? `${inferredType} · key ${formatConfidence(keyScore)}`
      : `${inferredType} · 键候选 ${formatConfidence(keyScore)}`;
  }

  const uniqueCount = numberMetadata(node.metadata, "unique_count");
  if (language === "en-US") {
    if (node.node_type === "document") {
      return String(node.metadata.document_type ?? "document");
    }
    if (node.node_type === "code_symbol") {
      return String(node.metadata.entity_type ?? "code symbol");
    }
    if (node.node_type === "entity") {
      return String(node.metadata.entity_type ?? "entity");
    }
    return uniqueCount === null ? "derived dimension" : `${uniqueCount} values`;
  }
  if (node.node_type === "document") {
    return String(node.metadata.document_type ?? "文档");
  }
  if (node.node_type === "code_symbol") {
    return String(node.metadata.entity_type ?? "代码符号");
  }
  if (node.node_type === "entity") {
    return String(node.metadata.entity_type ?? "实体");
  }
  return uniqueCount === null ? "派生维度" : `${uniqueCount} 个值`;
}

export function getEdgeClassName(edge: GraphEdge, highlightedGraphPath: number[] = []): string {
  const typeClass = edge.edge_type.replace(/_/g, "-");
  const statusClass = String(edge.status).replace(/_/g, "-");
  const highlighted = highlightedGraphPath.includes(edge.id) ? " is-highlighted" : "";
  const structural = edge.edge_type === "contains_field" ? " edge-structural" : "";
  return `semantic-edge semantic-edge-${typeClass} edge-status-${statusClass} edge-strength-${getRelationshipStrength(edge)}${structural}${highlighted}`;
}

export function getRelationshipStrength(edge: GraphEdge): "strong" | "likely" | "possible" {
  const payloadStrength = edge.evidence_payload?.relationship_strength;
  if (payloadStrength === "strong" || payloadStrength === "likely" || payloadStrength === "possible") {
    return payloadStrength;
  }
  if (edge.confidence >= 0.9) {
    return "strong";
  }
  if (edge.confidence >= 0.8) {
    return "likely";
  }
  return "possible";
}

export function edgeMatchesFilters(edge: GraphEdge, filters: GraphFilters): boolean {
  const status = edge.status as keyof GraphFilters["statuses"];
  const type = edge.edge_type as keyof GraphFilters["types"];
  const statusVisible = filters.statuses[status] ?? true;
  const typeVisible = filters.types[type] ?? true;
  return statusVisible && typeVisible && edge.confidence >= filters.minConfidence;
}

export function graphNodeIsVisibleForMode(
  node: GraphNode,
  viewMode: "analysis" | "table" | "field" | "entity"
): boolean {
  if (viewMode === "analysis") {
    return true;
  }
  if (viewMode === "table") {
    return node.node_type === "table" || node.node_type === "field";
  }
  if (viewMode === "entity") {
    return (
      node.node_type === "field" ||
      node.node_type === "derived_entity" ||
      node.node_type === "document" ||
      node.node_type === "entity" ||
      node.node_type === "code_symbol"
    );
  }
  return true;
}

export function edgeIsVisibleForMode(
  edge: GraphEdge,
  viewMode: "analysis" | "table" | "field" | "entity"
): boolean {
  if (viewMode === "analysis") {
    return true;
  }
  if (viewMode === "table") {
    return edge.edge_type === "contains_field";
  }
  if (viewMode === "entity") {
    return edge.edge_type === "derived_dimension";
  }
  return edge.edge_type !== "derived_dimension";
}

export function getSelectionForNode(
  nodeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): GraphSelection | null {
  const id = Number(nodeId);
  const node = nodes.find((candidate) => candidate.id === id);
  if (!node) {
    return null;
  }
  return {
    kind: "node",
    node,
    adjacentEdges: edges.filter((edge) => edge.source_node_id === id || edge.target_node_id === id)
  };
}

export function getSelectionForEdge(
  edgeId: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): GraphSelection | null {
  const id = Number(edgeId);
  const edge = edges.find((candidate) => candidate.id === id);
  if (!edge) {
    return null;
  }
  return {
    kind: "edge",
    edge,
    sourceNode: nodes.find((node) => node.id === edge.source_node_id),
    targetNode: nodes.find((node) => node.id === edge.target_node_id)
  };
}

export function evidenceRowsFromPayload(
  payload: Record<string, unknown> | null | undefined,
  language: Language = "zh-CN"
): { label: string; value: string }[] {
  if (!payload) {
    return [];
  }

  return Object.entries(payload).map(([key, rawValue]) => ({
    label: formatEvidencePayloadLabel(key, language),
    value: formatEvidenceValue(rawValue)
  }));
}

export function aggregateCountFromRecord(record: Record<string, unknown> | null | undefined): number {
  const aggregateCount = record?.aggregate_count;
  return typeof aggregateCount === "number" && Number.isFinite(aggregateCount)
    ? aggregateCount
    : 1;
}

export function formatEvidenceSummary(
  sourceLabel: string,
  targetLabel: string | null | undefined,
  payload: Record<string, unknown> | null | undefined,
  fallbackSummary: string | null | undefined,
  language: Language = "zh-CN"
): string {
  if (language === "en-US") {
    return fallbackSummary ?? "";
  }

  const uniqueCount = numberPayloadValue(payload, "unique_count");
  if (uniqueCount !== null && targetLabel === null) {
    return `${sourceLabel} 有 ${uniqueCount} 个不同类别值，可作为维度进行分析。`;
  }

  const overlapCount = numberPayloadValue(payload, "overlap_count");
  const sourceDistinctCount = numberPayloadValue(payload, "source_distinct_count");
  const sourceMatchRatio = numberPayloadValue(payload, "source_match_ratio");
  if (overlapCount !== null && sourceDistinctCount !== null) {
    const parts = [`${sourceDistinctCount} 个源字段不同取值中有 ${overlapCount} 个与目标字段重合`];
    const matchedRowCount = numberPayloadValue(payload, "matched_row_count");
    const sourceNonNullCount = numberPayloadValue(payload, "source_non_null_count");
    const fieldNameSimilarity = numberPayloadValue(payload, "field_name_similarity");
    const relationshipStrength = stringPayloadValue(payload, "relationship_strength");

    if (sourceMatchRatio !== null) {
      parts.push(`源字段匹配率 ${formatConfidence(sourceMatchRatio)}`);
    }
    if (matchedRowCount !== null && sourceNonNullCount !== null) {
      parts.push(`${sourceNonNullCount} 行非空源数据中有 ${matchedRowCount} 行可匹配目标取值`);
    }
    if (fieldNameSimilarity !== null) {
      parts.push(`字段名相似度 ${formatConfidence(fieldNameSimilarity)}`);
    }
    if (relationshipStrength !== null) {
      parts.push(`关系强度：${formatRelationshipStrength(relationshipStrength, language)}`);
    }
    return `${parts.join("；")}。`;
  }

  return fallbackSummary ?? "";
}

function formatEvidencePayloadLabel(key: string, language: Language): string {
  const labels: Record<Language, Record<string, string>> = {
    "zh-CN": {
      overlap_count: "重合取值数",
      source_distinct_count: "源字段不同取值数",
      target_distinct_count: "目标字段不同取值数",
      source_match_ratio: "源字段匹配率",
      matched_row_count: "匹配行数",
      source_non_null_count: "源字段非空行数",
      source_unique_ratio: "源字段唯一率",
      target_unique_ratio: "目标字段唯一率",
      source_null_ratio: "源字段空值率",
      target_null_ratio: "目标字段空值率",
      source_key_candidate_score: "源字段键候选分",
      target_key_candidate_score: "目标字段键候选分",
      field_name_similarity: "字段名相似度",
      field_type_compatible: "字段类型兼容",
      sample_matches: "匹配样例",
      relationship_strength: "关系强度",
      aggregate_count: "聚合关系数",
      unique_count: "不同取值数"
    },
    "en-US": {}
  };

  return labels[language][key] ?? humanizeEvidencePayloadKey(key);
}

function numberPayloadValue(
  payload: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringPayloadValue(
  payload: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = payload?.[key];
  return typeof value === "string" ? value : null;
}

function humanizeEvidencePayloadKey(key: string): string {
  return key
    .split("_")
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function formatEvidenceValue(value: unknown): string {
  if (typeof value === "number") {
    if (value >= 0 && value <= 1) {
      return formatConfidence(value);
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (value === null || value === undefined) {
    return "empty";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "string" && ["strong", "likely", "possible"].includes(value)) {
    return formatRelationshipStrength(value, "zh-CN");
  }
  return String(value);
}

function formatRelationshipStrength(strength: string, language: Language): string {
  const labels: Record<Language, Record<string, string>> = {
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
  return labels[language][strength] ?? strength;
}
