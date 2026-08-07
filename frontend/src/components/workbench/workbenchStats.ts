import type {
  GraphEdge,
  GraphNode,
  GraphResponse,
  GraphSelection,
  EntityMatchReview,
  RelationshipGovernanceSummary,
  RelationshipSuggestion
} from "../../api/types";
import type { Language } from "../../i18n/messages";
import { getNodeKindLabel, getRelationshipLabel } from "../graph/graphSemantics";

export type GraphNodeTypeCounts = {
  tables: number;
  fields: number;
  dimensions: number;
};

export type WorkbenchTreeRow =
  | {
      id: string;
      type: "table";
      label: string;
      meta: string;
      node: GraphNode;
    }
  | {
      id: string;
      type: "field";
      label: string;
      meta: string;
      parentLabel: string;
      node: GraphNode;
    }
  | {
      id: string;
      type: "dimension";
      label: string;
      meta: string;
      node: GraphNode;
    }
  | {
      id: string;
      type: "review";
      label: string;
      meta: string;
      suggestion: RelationshipSuggestion;
    };

export type WorkbenchTree = {
  tables: Extract<WorkbenchTreeRow, { type: "table" }>[];
  fields: Extract<WorkbenchTreeRow, { type: "field" }>[];
  dimensions: Extract<WorkbenchTreeRow, { type: "dimension" }>[];
  reviews: Extract<WorkbenchTreeRow, { type: "review" }>[];
};

export type GraphQualitySummary = {
  duplicateGroups: number;
  entityMatchPreview: GraphQualityReviewPreview[];
  evidenceCoverageRatio: number;
  evidenceCoveredRelationships: number;
  isolatedNodePreview: GraphQualityNodePreview[];
  isolatedNodes: number;
  mappingReviewPreview: GraphQualityReviewPreview[];
  pendingReviews: number;
  relationshipCount: number;
  unresolvedEntityMatches: number;
  unresolvedMappingReviews: number;
  weakEvidenceRelationshipPreview: GraphQualityRelationshipPreview[];
  weakEvidenceRelationships: number;
};

export type GraphQualityNodePreview = {
  id: number;
  label: string;
  nodeType: string;
  sourceRef: string;
};

export type GraphQualityRelationshipPreview = {
  confidence: number;
  id: number;
  label: string;
  relationshipType: string;
};

export type GraphQualityReviewPreview = {
  confidence: number;
  id: number;
  label: string;
  reviewType: string;
  sourceNodeId: number;
  targetNodeId: number;
};

const QUALITY_PREVIEW_LIMIT = 3;

export function countGraphNodeTypes(nodes: GraphNode[]): GraphNodeTypeCounts {
  return nodes.reduce<GraphNodeTypeCounts>(
    (counts, node) => {
      if (node.node_type === "table") {
        counts.tables += 1;
      } else if (node.node_type === "field") {
        counts.fields += 1;
      } else if (node.node_type === "derived_entity") {
        counts.dimensions += 1;
      }
      return counts;
    },
    { tables: 0, fields: 0, dimensions: 0 }
  );
}

export function getPendingSuggestionCount(suggestions: RelationshipSuggestion[]): number {
  return suggestions.filter((suggestion) => suggestion.decision_status === "pending").length;
}

export function buildGraphQualitySummary(
  graph: GraphResponse,
  suggestions: RelationshipSuggestion[],
  governanceSummary: RelationshipGovernanceSummary | null = null,
  entityMatchReviews: EntityMatchReview[] = [],
  mappingReviews: EntityMatchReview[] = []
): GraphQualitySummary {
  const connectedNodeIds = new Set<number>();
  for (const edge of graph.edges) {
    connectedNodeIds.add(edge.source_node_id);
    connectedNodeIds.add(edge.target_node_id);
  }
  const evidenceCoveredRelationships = graph.edges.filter(edgeHasEvidence).length;
  const isolatedNodes = graph.nodes.filter((node) => !connectedNodeIds.has(node.id));
  const weakEvidenceRelationships = graph.edges.filter(edgeHasWeakEvidence);
  const relationshipCount = graph.edges.length;
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  return {
    duplicateGroups: governanceSummary?.duplicate_group_count ?? 0,
    entityMatchPreview: buildReviewPreview(entityMatchReviews),
    evidenceCoverageRatio:
      relationshipCount === 0
        ? 0
        : Math.round((evidenceCoveredRelationships / relationshipCount) * 100) / 100,
    evidenceCoveredRelationships,
    isolatedNodePreview: isolatedNodes.slice(0, QUALITY_PREVIEW_LIMIT).map((node) => ({
      id: node.id,
      label: node.label,
      nodeType: node.node_type,
      sourceRef: node.source_ref
    })),
    isolatedNodes: isolatedNodes.length,
    mappingReviewPreview: buildReviewPreview(mappingReviews),
    pendingReviews:
      governanceSummary?.pending_suggestion_count ?? getPendingSuggestionCount(suggestions),
    relationshipCount,
    unresolvedEntityMatches: countUnresolvedReviews(entityMatchReviews),
    unresolvedMappingReviews: countUnresolvedReviews(mappingReviews),
    weakEvidenceRelationshipPreview: weakEvidenceRelationships
      .slice(0, QUALITY_PREVIEW_LIMIT)
      .map((edge) => ({
        confidence: edge.confidence,
        id: edge.id,
        label: relationshipPreviewLabel(edge, nodesById),
        relationshipType: edge.edge_type
      })),
    weakEvidenceRelationships: weakEvidenceRelationships.length
  };
}

function buildReviewPreview(reviews: EntityMatchReview[]): GraphQualityReviewPreview[] {
  return reviews
    .filter((review) => review.status === "suggested")
    .slice(0, QUALITY_PREVIEW_LIMIT)
    .map((review) => ({
      confidence: review.confidence,
      id: review.id,
      label: `${review.source_label} → ${review.target_label}`,
      reviewType: review.relationship_type,
      sourceNodeId: review.source_node_id,
      targetNodeId: review.target_node_id
    }));
}

function relationshipPreviewLabel(edge: GraphEdge, nodesById: Map<number, GraphNode>): string {
  const source = nodesById.get(edge.source_node_id)?.label ?? String(edge.source_node_id);
  const target = nodesById.get(edge.target_node_id)?.label ?? String(edge.target_node_id);
  return `${source} → ${target}`;
}

function countUnresolvedReviews(reviews: EntityMatchReview[]): number {
  return reviews.filter((review) => review.status === "suggested").length;
}

export function buildWorkbenchTree(
  graph: GraphResponse,
  suggestions: RelationshipSuggestion[],
  language: Language = "zh-CN"
): WorkbenchTree {
  const tables = graph.nodes
    .filter((node) => node.node_type === "table" && !isInternalAnchorNode(node))
    .map((node) => ({
      id: `table-${node.id}`,
      type: "table" as const,
      label: node.label,
      meta: `${Number(node.metadata.row_count ?? 0)} 行 · ${Number(
        node.metadata.column_count ?? 0
      )} 个字段`,
      node
    }));

  const fields = graph.nodes
    .filter((node) => node.node_type === "field" && !isInternalAnchorNode(node))
    .map((node) => ({
      id: `field-${node.id}`,
      type: "field" as const,
      label: node.label,
      meta: String(node.metadata.inferred_type ?? "field"),
      parentLabel: inferParentLabel(node.label, node.source_ref),
      node
    }));

  const dimensions = graph.nodes
    .filter((node) => node.node_type === "derived_entity")
    .map((node) => ({
      id: `dimension-${node.id}`,
      type: "dimension" as const,
      label: node.label,
      meta: `${Number(node.metadata.unique_count ?? 0)} 个值`,
      node
    }));

  const reviews = suggestions
    .filter((suggestion) => suggestion.decision_status === "pending")
    .map((suggestion) => ({
      id: `review-${suggestion.id}`,
      type: "review" as const,
      label: suggestion.source_label,
      meta:
        language === "en-US"
          ? `Pending · ${Math.round(suggestion.confidence * 100)}%`
          : `待确认 · ${Math.round(suggestion.confidence * 100)}%`,
      suggestion
    }));

  return { tables, fields, dimensions, reviews };
}

export function formatGraphSummary(
  graph: GraphResponse,
  suggestions: RelationshipSuggestion[],
  language: Language = "zh-CN"
): string {
  const pending = getPendingSuggestionCount(suggestions);
  if (language === "en-US") {
    return `${graph.nodes.length} ${pluralize("node", graph.nodes.length)} · ${graph.edges.length} ${pluralize(
      "edge",
      graph.edges.length
    )} · ${pending} pending ${pending === 1 ? "review" : "reviews"}`;
  }
  return `${graph.nodes.length} 个节点 · ${graph.edges.length} 条边 · ${pending} 条待审核`;
}

export function searchGraphNodes(
  nodes: GraphNode[],
  query: string,
  limit = 8,
  language: Language = "zh-CN"
): GraphNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return nodes
    .filter((node) => {
      const haystack = [node.label, node.source_ref, node.node_type, getNodeKindLabel(node.node_type, language)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    })
    .slice(0, limit);
}

export function getSelectionSummary(selection: GraphSelection | null, language: Language = "zh-CN"): string {
  if (!selection) {
    return language === "en-US" ? "No selection" : "未选择";
  }
  if (selection.kind === "node") {
    return language === "en-US" ? `Node: ${selection.node.label}` : `节点：${selection.node.label}`;
  }
  return language === "en-US"
    ? `Relationship: ${getRelationshipLabel(selection.edge.edge_type, language)}`
    : `关系：${getRelationshipLabel(selection.edge.edge_type, language)}`;
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}

function edgeHasEvidence(edge: GraphEdge): boolean {
  if (edge.evidence_ref.trim().length > 0) {
    return true;
  }
  if ((edge.evidence_refs ?? []).some((reference) => reference.trim().length > 0)) {
    return true;
  }
  if (edge.evidence_summary?.trim()) {
    return true;
  }
  return edge.evidence_payload !== null && Object.keys(edge.evidence_payload).length > 0;
}

function edgeHasWeakEvidence(edge: GraphEdge): boolean {
  const isSuggested = String(edge.status).toLowerCase() === "suggested";
  return edge.confidence < 0.6 || (isSuggested && !edgeHasEvidence(edge));
}

function inferParentLabel(label: string, sourceRef: string): string {
  const labelParent = label.includes(".") ? label.split(".")[0] : "";
  if (labelParent) {
    return labelParent;
  }
  return sourceRef.includes(".") ? sourceRef.split(".")[0] : "Ungrouped";
}

function isInternalAnchorNode(node: GraphNode): boolean {
  if (
    node.metadata.import_status === "internal" ||
    node.metadata.source_kind === "extracted_relationship_anchor"
  ) {
    return true;
  }
  const normalizedLabel = node.label.toLowerCase();
  const normalizedSourceRef = node.source_ref.toLowerCase();
  return (
    normalizedLabel === "extracted entities" ||
    normalizedLabel.startsWith("extracted entities.") ||
    normalizedSourceRef.startsWith("extracted_entities_")
  );
}
