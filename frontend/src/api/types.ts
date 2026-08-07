export type GraphNodeType =
  | "table"
  | "field"
  | "derived_entity"
  | "document"
  | "entity"
  | "code_symbol";

export type GraphEdgeStatus = "auto_trusted" | "suggested" | "accepted" | "edited" | "rejected";

export type GraphEdgeType = "contains_field" | "foreign_key" | "derived_dimension" | string;

export type GraphNode = {
  id: number;
  node_type: GraphNodeType;
  label: string;
  source_ref: string;
  metadata: Record<string, unknown>;
  position_x: number;
  position_y: number;
};

export type GraphEdge = {
  id: number;
  source_node_id: number;
  target_node_id: number;
  edge_type: GraphEdgeType;
  confidence: number;
  status: GraphEdgeStatus | string;
  evidence_ref: string;
  evidence_refs?: string[];
  created_from_suggestion_id: number | null;
  metadata: Record<string, unknown>;
  evidence_summary: string | null;
  evidence_payload: Record<string, unknown> | null;
};

export type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type RelationshipDecisionStatus = "pending" | "accepted" | "edited" | "rejected";

export type RelationshipSuggestion = {
  id: number;
  source_field_id: number;
  target_field_id: number | null;
  source_label: string;
  target_label: string | null;
  relationship_type: string;
  confidence: number;
  evidence_summary: string;
  evidence_payload: Record<string, unknown>;
  decision_status: RelationshipDecisionStatus;
  reviewed_by?: string | null;
  created_at?: string;
  updated_at?: string;
  quality_label?: "high" | "medium" | "low" | string;
  review_priority?: "high" | "medium" | "low" | string;
  quality_reasons?: string[];
};

export type RelationshipModelingReview = {
  decisionStatus: Exclude<RelationshipDecisionStatus, "pending">;
  evidenceQuality?: string;
  relationshipType?: string;
  reviewedBy?: string;
};

export type DuplicateSuggestionGroup = {
  canonical_suggestion_id: number;
  duplicate_suggestion_ids: number[];
  source_label: string;
  target_label: string | null;
  relationship_type: string;
};

export type RelationshipGovernanceSummary = {
  total_suggestion_count: number;
  visible_suggestion_count: number;
  duplicate_suggestion_count: number;
  duplicate_group_count: number;
  pending_suggestion_count: number;
  accepted_suggestion_count: number;
  rejected_suggestion_count: number;
  edited_suggestion_count: number;
  duplicate_groups: DuplicateSuggestionGroup[];
};

export type ReviewAnalytics = {
  window_days: number;
  generated_at: string;
  sla: {
    pending_sla_days: number;
    pending_total: number;
    overdue_pending_count: number;
    oldest_pending_age_days: number | null;
  };
  aging_buckets: Record<"0_1_days" | "2_3_days" | "4_7_days" | "8_plus_days", number>;
  decision_trend: Record<"accepted" | "edited" | "pending" | "rejected", number>;
  quality_distribution: Record<"high" | "medium" | "low", number>;
  evidence_coverage: {
    with_evidence_count: number;
    without_evidence_count: number;
    coverage_ratio: number;
  };
};

export type ReviewAnalyticsSnapshot = {
  snapshot_date: string;
  analytics: ReviewAnalytics;
};

export type ReviewAnalyticsTrend = {
  window_days: number;
  days: number;
  generated_at: string;
  snapshots: ReviewAnalyticsSnapshot[];
};

export type ReviewAnalyticsTrendDays = 7 | 14 | 30 | 90;

export type ReviewAnalyticsSnapshotSummary = {
  retention_days: number;
  snapshot_count: number;
  expired_snapshot_count: number;
  oldest_snapshot_date: string | null;
  latest_snapshot_date: string | null;
};

export type ReviewAnalyticsSnapshotCleanupResult = {
  retention_days: number;
  cutoff_date: string;
  removed_count: number;
  remaining_count: number;
};

export type ReviewAnalyticsSnapshotCleanupEvent = {
  id: number;
  project_id: number;
  retention_days: number;
  cutoff_date: string;
  removed_count: number;
  remaining_count: number;
  created_at: string;
};

export type RelationshipDuplicateCleanupResult = {
  removed_duplicate_count: number;
  relinked_edge_count: number;
  remaining_duplicate_count: number;
  duplicate_groups: DuplicateSuggestionGroup[];
};

export type Citation = {
  label: string;
  source_ref: string;
  citation_type?: string;
};

export type RetrievedEvidence = {
  label: string;
  kind: string;
  source_ref: string;
  score: number;
  excerpt: string;
};

export type GraphAction = {
  id: string;
  type: "highlight_path" | "focus_node" | "open_evidence" | "filter_pending_reviews" | string;
  label: string;
  description: string | null;
  node_ids: number[];
  edge_ids: number[];
  suggestion_ids: number[];
  evidence_refs: string[];
  metadata: Record<string, unknown>;
};

export type GraphActionExecutionStatus = "idle" | "executed" | "failed" | "reverted";

export type GraphActionExecutionResult = {
  actionId: string;
  status: GraphActionExecutionStatus;
  message?: string;
  affectedNodeIds?: number[];
  affectedEdgeIds?: number[];
};

export type GraphActionTargetPreview = {
  nodeCount: number;
  edgeCount: number;
  suggestionCount: number;
  evidenceCount: number;
};

export type GraphActionActivity = {
  id: string;
  actionId: string;
  label: string;
  status: Exclude<GraphActionExecutionStatus, "idle">;
  message: string;
  createdAt: number;
  targetPreview: GraphActionTargetPreview;
};

export type ChatSelectionContext =
  | {
      kind: "node";
      id: number;
    }
  | {
      kind: "edge";
      id: number;
    };

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  answer_confidence?: string;
  highlighted_graph_path?: number[];
  retrieved_evidence?: RetrievedEvidence[];
  graph_actions?: GraphAction[];
  next_steps?: string[];
};

export type ChatAnswer = {
  answer?: string;
  content: string;
  query_plan: Record<string, unknown>;
  confidence?: string;
  answer_confidence: string;
  citations: Citation[];
  highlighted_graph_path: number[];
  retrieved_evidence: RetrievedEvidence[];
  graph_actions: GraphAction[];
  next_steps: string[];
};

export type AIChatProvider =
  | "rules"
  | "openai-compatible"
  | "ollama"
  | "deepseek"
  | "openrouter";

export type VectorProvider = "none" | "openai-compatible" | "ollama";

export type VectorIndexStatus =
  | "not_built"
  | "pending"
  | "building"
  | "ready"
  | "failed";

export type AIChatSettings = {
  provider: AIChatProvider;
  model: string;
  base_url: string;
  api_key: string;
  temperature: number;
};

export type AIVectorSettings = {
  provider: VectorProvider;
  model: string;
  base_url: string;
  api_key: string;
  dimensions: number;
  index_status: VectorIndexStatus;
  document_count: number;
  last_built_at: string | null;
  embedding_model: string;
};

export type ProjectSettings = {
  ai: {
    chat: AIChatSettings;
    vector: AIVectorSettings;
  };
  review_analytics: {
    retention_days: 30 | 90 | 180 | 365 | number;
    auto_cleanup_enabled: boolean;
  };
};

export type ProjectSummary = {
  id: number;
  name: string;
};

export type ProjectShareRole = "viewer" | "editor";

export type ProjectShareToken = {
  id: number;
  project_id: number;
  role: ProjectShareRole | string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type CreatedProjectShareToken = ProjectShareToken & {
  token: string;
};

export type ProjectShareTokenRevocation = {
  id: number;
  project_id: number;
  revoked: boolean;
};

export type ApiErrorDetail = {
  code: string;
  message: string;
  user_action: string;
  retryable: boolean;
  field_errors: Record<string, string>;
};

export type SessionLoginResponse = {
  username: string;
  auth_mode: "session" | string;
  csrf_token: string;
  expires_at: string;
};

export type ImportResult = {
  import_job_id: number;
  dataset_id: number;
  sheet_count: number;
  field_count: number;
  suggestion_count: number;
  graph_node_count: number;
  graph_edge_count: number;
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
};

export type ImportJobSummary = {
  sheet_count: number;
  field_count: number;
  suggestion_count: number;
  graph_node_count: number;
  graph_edge_count: number;
};

export type ImportJob = {
  id: number;
  project_id: number;
  label: string;
  kind: "file" | "sample" | "batch" | string;
  status: "staging" | "queued" | "running" | "succeeded" | "failed" | "canceled" | string;
  progress: number;
  summary: ImportJobSummary | null;
  error: string | null;
  retryable: boolean;
  dataset_id: number | null;
  created_at: string;
  updated_at: string;
};

export type ImportJobRecoveryResult = {
  recovered_count: number;
  submitted_count: number;
};

export type ImportEvent = {
  type: "import_job_snapshot" | string;
  jobs: ImportJob[];
};

export type ImportStageStatus = "pending" | "running" | "complete" | "failed" | string;

export type ImportStage = {
  name: string;
  status: ImportStageStatus;
  progress: number;
  summary: string | null;
  source?: string;
  itemId?: number;
  retryable?: boolean;
  diagnostics?: ImportDiagnostics;
};

export type ImportDiagnostics = Record<string, unknown> & {
  document_count?: number;
  repository_file_count?: number;
  ignored_file_count?: number;
  chunk_count?: number;
  entity_count?: number;
  relationship_count?: number;
  graph_node_count?: number;
  graph_edge_count?: number;
  source_kind_counts?: Record<string, number>;
  http_status?: number;
  byte_count?: number;
  content_type?: string;
};

export type ImportItem = {
  id: number;
  batch_id: number;
  project_id: number;
  filename: string;
  file_type: string;
  source_kind: "table" | "json" | "document" | "code" | "log" | string;
  status: "staged" | "profiled" | "succeeded" | "failed" | string;
  raw_data_ref: string;
  artifact_ref: string | null;
  error: string | null;
  summary: (Record<string, unknown> & { diagnostics?: ImportDiagnostics; stages?: ImportStage[] }) | null;
  created_at: string;
  updated_at: string;
};

export type ImportBatch = {
  id: number;
  project_id: number;
  label: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled" | string;
  progress: number;
  summary: (Record<string, unknown> & { diagnostics?: ImportDiagnostics }) | null;
  error: string | null;
  items: ImportItem[];
  created_at: string;
  updated_at: string;
};

export type SourceSummary = {
  source_kind: string;
  count: number;
};

export type SourceDetail = {
  id: number;
  import_item_id: number;
  title: string;
  document_type: string;
  source_ref: string;
  metadata: Record<string, unknown>;
  chunk_count: number;
  entity_count: number;
  relationship_count: number;
  created_at: string;
};

export type DocumentChunk = {
  id: number;
  document_id: number;
  chunk_index: number;
  heading: string | null;
  content: string;
  token_count: number;
  source_ref: string;
  content_hash: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type SourceChunkPage = {
  items: DocumentChunk[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type ExtractedEntity = {
  id: number;
  canonical_name: string;
  entity_type: string;
  aliases: string[];
  confidence: number;
  source_refs: string[];
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ExtractedRelationship = {
  id: number;
  source_entity_id: number;
  target_entity_id: number;
  source_name: string;
  source_type: string;
  target_name: string;
  target_type: string;
  relationship_type: string;
  confidence: number;
  status: string;
  evidence_summary: string;
  evidence_payload: Record<string, unknown>;
  source_refs: string[];
  created_at: string;
};

export type EntityMatchDecisionStatus = "suggested" | "accepted" | "rejected";

export type EntityMatchReview = {
  id: number;
  project_id: number;
  source_node_id: number;
  target_node_id: number;
  source_label: string;
  source_type: string;
  target_label: string;
  target_type: string;
  relationship_type: "matches_entity" | string;
  confidence: number;
  status: EntityMatchDecisionStatus | string;
  evidence_ref: string;
  evidence_summary: string;
  matched_keys: string[];
  source_refs: string[];
  metadata: Record<string, unknown>;
};

export type WorkspaceSnapshot = {
  workspace_version: string;
  project: ProjectSummary;
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
  relationship_governance: RelationshipGovernanceSummary | null;
  review_analytics?: ReviewAnalytics | null;
  review_analytics_trend?: ReviewAnalyticsTrend | null;
  review_analytics_snapshot_summary?: ReviewAnalyticsSnapshotSummary | null;
  review_analytics_snapshot_cleanup_events?: ReviewAnalyticsSnapshotCleanupEvent[] | null;
  settings: ProjectSettings;
  import_jobs: ImportJob[];
  source_summaries: SourceSummary[];
  source_details: SourceDetail[];
  source_chunks_by_source_id: Record<number, DocumentChunk[]>;
  extracted_entities: ExtractedEntity[];
  extracted_relationships: ExtractedRelationship[];
  entity_match_reviews: EntityMatchReview[];
  mapping_reviews: EntityMatchReview[];
};

export type WorkspaceDelta = {
  status: "changed" | "not_modified" | string;
  workspace_version: string;
  graph: GraphResponse | null;
  suggestions: RelationshipSuggestion[] | null;
  relationship_governance: RelationshipGovernanceSummary | null;
  review_analytics?: ReviewAnalytics | null;
  review_analytics_trend?: ReviewAnalyticsTrend | null;
  review_analytics_snapshot_summary?: ReviewAnalyticsSnapshotSummary | null;
  review_analytics_snapshot_cleanup_events?: ReviewAnalyticsSnapshotCleanupEvent[] | null;
  import_jobs: ImportJob[] | null;
  source_summaries: SourceSummary[] | null;
  source_details: SourceDetail[] | null;
  extracted_entities: ExtractedEntity[] | null;
  extracted_relationships: ExtractedRelationship[] | null;
  entity_match_reviews: EntityMatchReview[] | null;
  mapping_reviews: EntityMatchReview[] | null;
};

export type ResetProjectDataResult = {
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
};

export type GraphSelection =
  | {
      kind: "node";
      node: GraphNode;
      adjacentEdges: GraphEdge[];
    }
  | {
      kind: "edge";
      edge: GraphEdge;
      sourceNode?: GraphNode;
      targetNode?: GraphNode;
    };

export type GraphFilters = {
  statuses: Record<GraphEdgeStatus, boolean>;
  types: Record<"contains_field" | "foreign_key" | "derived_dimension", boolean>;
  minConfidence: number;
};
