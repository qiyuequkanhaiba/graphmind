import { ChevronsLeft, Database, TableProperties } from "lucide-react";
import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  DocumentChunk,
  EntityMatchDecisionStatus,
  EntityMatchReview,
  ExtractedEntity,
  ExtractedRelationship,
  GraphNode,
  GraphResponse,
  RelationshipSuggestion,
  SourceDetail
} from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { usePanelEntranceMotion } from "../../motion/useWorkbenchMotion";
import { buildWorkbenchTree, type WorkbenchTreeRow } from "./workbenchStats";

type Props = {
  graph: GraphResponse;
  suggestions: RelationshipSuggestion[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onActionsOpenChange?: (open: boolean) => void;
  onSelectNode?: (node: GraphNode) => void;
  focusedEvidenceRef?: string | null;
  focusedSourceRef?: string | null;
  sourceDetails?: SourceDetail[];
  sourceChunksBySourceId?: Record<number, DocumentChunk[]>;
  extractedEntities?: ExtractedEntity[];
  extractedRelationships?: ExtractedRelationship[];
  entityMatchReviews?: EntityMatchReview[];
  mappingReviews?: EntityMatchReview[];
  onReviewEntityMatch?: (
    edgeId: number,
    decisionStatus: EntityMatchDecisionStatus
  ) => void;
  onReviewMappingEdge?: (
    edgeId: number,
    decisionStatus: EntityMatchDecisionStatus
  ) => void;
  onOpenGraphEvidenceRef?: (reference: string) => void;
  onLoadSourceChunks?: (sourceId: number) => Promise<DocumentChunk[]>;
};

export default function DataExplorerPanel({
  graph,
  suggestions,
  collapsed,
  onToggleCollapsed,
  onActionsOpenChange = () => undefined,
  onSelectNode = () => undefined,
  focusedEvidenceRef = null,
  focusedSourceRef = null,
  sourceDetails = [],
  sourceChunksBySourceId = {},
  extractedEntities = [],
  extractedRelationships = [],
  entityMatchReviews = [],
  mappingReviews = [],
  onReviewEntityMatch = () => undefined,
  onReviewMappingEdge = () => undefined,
  onOpenGraphEvidenceRef = () => undefined,
  onLoadSourceChunks = async () => []
}: Props) {
  const { language, t } = useI18n();
  const panelRef = useRef<HTMLElement>(null);
  const tree = buildWorkbenchTree(graph, suggestions, language);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(() =>
    sourceDetails[0]?.id ?? null
  );
  const [lazySourceChunks, setLazySourceChunks] = useState<Record<number, DocumentChunk[]>>({});
  const [loadingSourceId, setLoadingSourceId] = useState<number | null>(null);
  const [failedSourceId, setFailedSourceId] = useState<number | null>(null);
  const loadingSourceIdsRef = useRef<Set<number>>(new Set());
  const selectedSource =
    sourceDetails.find((source) => source.id === selectedSourceId) ?? sourceDetails[0] ?? null;
  const selectedSourceChunks = selectedSource
    ? sourceChunksBySourceId[selectedSource.id] ?? lazySourceChunks[selectedSource.id] ?? []
    : [];
  const selectedSourceChunksLoaded = selectedSource
    ? Object.prototype.hasOwnProperty.call(sourceChunksBySourceId, selectedSource.id) ||
      Object.prototype.hasOwnProperty.call(lazySourceChunks, selectedSource.id)
    : true;
  const isSelectedSourceLoading =
    selectedSource !== null && loadingSourceId === selectedSource.id;
  const selectedSourceLoadFailed =
    selectedSource !== null && failedSourceId === selectedSource.id;
  const selectedSourceEntities = useMemo(
    () =>
      selectedSource
        ? extractedEntities.filter((entity) =>
            sourceRefsIncludeSource(entity.source_refs, selectedSource.source_ref)
          )
        : [],
    [extractedEntities, selectedSource]
  );
  const selectedSourceRelationships = useMemo(
    () =>
      selectedSource
        ? extractedRelationships.filter((relationship) =>
            sourceRefsIncludeSource(relationship.source_refs, selectedSource.source_ref)
          )
        : [],
    [extractedRelationships, selectedSource]
  );
  const selectedSourceMatches = useMemo(
    () =>
      selectedSource
        ? entityMatchReviews.filter((match) =>
            sourceRefsIncludeSource(match.source_refs, selectedSource.source_ref)
          )
        : [],
    [entityMatchReviews, selectedSource]
  );
  const selectedSourceMappings = useMemo(
    () =>
      selectedSource
        ? mappingReviews.filter((mapping) =>
            sourceRefsIncludeSource(mapping.source_refs, selectedSource.source_ref)
          )
        : [],
    [mappingReviews, selectedSource]
  );

  useEffect(() => {
    if (sourceDetails.length === 0) {
      setSelectedSourceId(null);
      return;
    }
    setSelectedSourceId((current) =>
      current !== null && sourceDetails.some((source) => source.id === current)
        ? current
        : sourceDetails[0].id
    );
  }, [sourceDetails]);

  useEffect(() => {
    if (!focusedSourceRef) {
      return;
    }
    const matchedSource = sourceDetails.find((source) =>
      evidenceRefMatchesSource(focusedSourceRef, source.source_ref)
    );
    if (matchedSource) {
      setSelectedSourceId(matchedSource.id);
    }
  }, [focusedSourceRef, sourceDetails]);
  useEffect(() => {
    if (
      !selectedSource ||
      selectedSource.chunk_count <= 0 ||
      selectedSourceChunksLoaded ||
      loadingSourceIdsRef.current.has(selectedSource.id)
    ) {
      return;
    }

    let canceled = false;
    loadingSourceIdsRef.current.add(selectedSource.id);
    setLoadingSourceId(selectedSource.id);
    setFailedSourceId((current) => (current === selectedSource.id ? null : current));
    onLoadSourceChunks(selectedSource.id)
      .then((chunks) => {
        if (canceled) {
          return;
        }
        setLazySourceChunks((current) => ({ ...current, [selectedSource.id]: chunks }));
      })
      .catch(() => {
        if (!canceled) {
          setFailedSourceId(selectedSource.id);
        }
      })
      .finally(() => {
        loadingSourceIdsRef.current.delete(selectedSource.id);
        if (!canceled) {
          setLoadingSourceId((current) =>
            current === selectedSource.id ? null : current
          );
        }
      });

    return () => {
      canceled = true;
    };
  }, [
    onLoadSourceChunks,
    selectedSource,
    selectedSourceChunksLoaded
  ]);
  usePanelEntranceMotion(panelRef, collapsed);

  if (collapsed) {
    return (
      <aside className="data-explorer-panel pro-tree-panel is-collapsed" aria-label={t("data.heading")}>
        <button aria-label={t("data.expandTree")} onClick={onToggleCollapsed} title={t("data.expandTree")} type="button">
          <TableProperties aria-hidden="true" size={16} />
          <span>{t("data.railLabel")}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="data-explorer-panel pro-tree-panel" aria-label={t("data.heading")} ref={panelRef}>
      <div className="panel-heading compact">
        <h2>{t("data.heading")}</h2>
        <div className="panel-heading-actions">
          <button
            aria-label={t("data.openActions")}
            className="panel-icon-button"
            onClick={() => onActionsOpenChange(true)}
            title={t("data.openActions")}
            type="button"
          >
            <Database aria-hidden="true" size={15} />
            <span>{t("data.openActions")}</span>
          </button>
          <button
            aria-label={t("data.collapseExplorer")}
            className="panel-icon-button"
            onClick={onToggleCollapsed}
            title={t("data.collapseExplorer")}
            type="button"
          >
            <ChevronsLeft aria-hidden="true" size={15} />
            <span>{t("data.collapse")}</span>
          </button>
        </div>
      </div>
      <div className="resource-tree" aria-label={t("data.resourceTree")}>
        <SourceSection
          rows={sourceDetails}
          selectedSourceId={selectedSource?.id ?? null}
          onSelectSource={setSelectedSourceId}
        />
        <SourceInspector
          chunks={selectedSourceChunks}
          entities={selectedSourceEntities}
          entityMatches={selectedSourceMatches}
          focusedEvidenceRef={focusedEvidenceRef}
          isLoadingChunks={isSelectedSourceLoading}
          loadFailed={selectedSourceLoadFailed}
          mappings={selectedSourceMappings}
          onOpenGraphEvidenceRef={onOpenGraphEvidenceRef}
          onReviewEntityMatch={onReviewEntityMatch}
          onReviewMappingEdge={onReviewMappingEdge}
          relationships={selectedSourceRelationships}
          source={selectedSource}
        />
        <TreeSection title={t("data.section.tables")} rows={tree.tables} onSelectNode={onSelectNode} />
        <TreeSection title={t("data.section.fields")} rows={tree.fields} onSelectNode={onSelectNode} />
        <TreeSection title={t("data.section.dimensions")} rows={tree.dimensions} onSelectNode={onSelectNode} />
        <TreeSection title={t("data.section.reviews")} rows={tree.reviews} onSelectNode={onSelectNode} />
      </div>
    </aside>
  );
}

function SourceSection({
  rows,
  selectedSourceId,
  onSelectSource
}: {
  rows: SourceDetail[];
  selectedSourceId: number | null;
  onSelectSource: (sourceId: number) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="tree-section" aria-label={t("data.section.sources")}>
      <h3>{t("data.section.sources")}</h3>
      <div className="tree-row-list">
        {rows.length > 0 ? (
          rows.map((source) => (
            <SourceRow
              key={source.id}
              onSelectSource={onSelectSource}
              selected={source.id === selectedSourceId}
              source={source}
            />
          ))
        ) : (
          <p className="tree-empty">{t("data.empty")}</p>
        )}
      </div>
    </section>
  );
}

function SourceRow({
  source,
  selected,
  onSelectSource
}: {
  source: SourceDetail;
  selected: boolean;
  onSelectSource: (sourceId: number) => void;
}) {
  const { language, t } = useI18n();
  return (
    <button
      aria-label={t("data.source.select", { label: source.title })}
      className={`tree-row tree-row-source${selected ? " is-selected" : ""}`}
      onClick={() => onSelectSource(source.id)}
      type="button"
    >
      <span className="tree-row-type">{formatSourceType(source.document_type, language)}</span>
      <span className="tree-row-label">{source.title}</span>
      <span className="tree-row-meta">
        {t("data.source.meta", {
          chunks: source.chunk_count,
          entities: source.entity_count,
          relationships: source.relationship_count
        })}
      </span>
    </button>
  );
}

function SourceInspector({
  source,
  chunks,
  entities,
  relationships,
  entityMatches,
  focusedEvidenceRef,
  isLoadingChunks,
  loadFailed,
  mappings,
  onOpenGraphEvidenceRef,
  onReviewEntityMatch,
  onReviewMappingEdge
}: {
  source: SourceDetail | null;
  chunks: DocumentChunk[];
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  entityMatches: EntityMatchReview[];
  focusedEvidenceRef: string | null;
  isLoadingChunks: boolean;
  loadFailed: boolean;
  mappings: EntityMatchReview[];
  onOpenGraphEvidenceRef: (reference: string) => void;
  onReviewEntityMatch: (
    edgeId: number,
    decisionStatus: EntityMatchDecisionStatus
  ) => void;
  onReviewMappingEdge: (
    edgeId: number,
    decisionStatus: EntityMatchDecisionStatus
  ) => void;
}) {
  const { t } = useI18n();
  if (!source) {
    return null;
  }
  const visibleChunks = visibleFocusedChunks(chunks, focusedEvidenceRef);

  return (
    <section className="source-inspector" aria-label={t("data.source.inspector")}>
      <div className="source-inspector-heading">
        <h3>{t("data.source.inspector")}</h3>
        <span>{source.document_type}</span>
      </div>
      <p className="source-inspector-ref">{source.source_ref}</p>
      {focusedEvidenceRef ? (
        <button
          className="source-inspector-graph-action"
          onClick={() => onOpenGraphEvidenceRef(focusedEvidenceRef)}
          type="button"
        >
          {t("data.source.openGraphEvidence", { ref: focusedEvidenceRef })}
        </button>
      ) : null}
      <div className="source-inspector-metrics" aria-label={t("data.source.metrics")}>
        <span>{t("data.source.chunkCount", { count: chunks.length })}</span>
        <span>{t("data.source.entityCount", { count: entities.length })}</span>
        <span>{t("data.source.relationshipCount", { count: relationships.length })}</span>
      </div>
      <InspectionList title={t("data.source.chunks")}>
        {isLoadingChunks ? (
          <li className="inspection-status">{t("data.source.loadingChunks")}</li>
        ) : null}
        {loadFailed ? (
          <li className="inspection-status is-error">{t("data.source.loadChunksFailed")}</li>
        ) : null}
        {visibleChunks.map((chunk) => (
          <li className={chunkMatchesEvidenceRef(chunk, focusedEvidenceRef) ? "is-focused" : ""} key={chunk.id}>
            <strong>{chunk.heading ?? t("data.source.chunk", { index: chunk.chunk_index + 1 })}</strong>
            <span className="inspection-meta">
              {t("data.source.chunkSource", { sourceRef: chunk.source_ref })}
            </span>
            {formatChunkTokenRange(chunk, t) ? (
              <span className="inspection-meta">{formatChunkTokenRange(chunk, t)}</span>
            ) : null}
            <p>{chunk.content}</p>
          </li>
        ))}
      </InspectionList>
      <InspectionList title={t("data.source.entities")}>
        {entities.slice(0, 6).map((entity) => (
          <li key={entity.id}>
            <strong>{entity.canonical_name}</strong>
            <span>{formatConfidence(entity.entity_type, entity.confidence)}</span>
          </li>
        ))}
      </InspectionList>
      <InspectionList title={t("data.source.relationships")}>
        {relationships.slice(0, 6).map((relationship) => (
          <li key={relationship.id}>
            <strong>{`${relationship.source_name} -> ${relationship.target_name}`}</strong>
            <span>{formatConfidence(relationship.relationship_type, relationship.confidence)}</span>
            {relationship.evidence_summary ? <p>{relationship.evidence_summary}</p> : null}
            {relationship.source_refs[0] ? (
              <span className="inspection-meta">
                {t("data.source.relationshipSource", {
                  sourceRef: relationship.source_refs[0]
                })}
              </span>
            ) : null}
            {stringMetadata(relationship.evidence_payload.rule) ? (
              <span className="inspection-meta">
                {t("data.source.relationshipRule", {
                  rule: stringMetadata(relationship.evidence_payload.rule) ?? ""
                })}
              </span>
            ) : null}
          </li>
        ))}
      </InspectionList>
      <InspectionList title={t("data.source.mappingReviews")}>
        {mappings.slice(0, 6).map((mapping) => (
          <li className="entity-match-row" key={mapping.id}>
            <strong>{`${mapping.source_label} -> ${mapping.target_label}`}</strong>
            <span>{formatEntityMatchMeta(mapping)}</span>
            {mapping.evidence_summary ? <p>{mapping.evidence_summary}</p> : null}
            {stringMetadata(mapping.metadata.rule) ? (
              <span className="inspection-meta">
                {t("data.source.relationshipRule", {
                  rule: stringMetadata(mapping.metadata.rule) ?? ""
                })}
              </span>
            ) : null}
            {mapping.status === "suggested" ? (
              <div className="entity-match-actions">
                <button
                  aria-label={t("data.source.acceptMappingReview", {
                    source: mapping.source_label,
                    target: mapping.target_label
                  })}
                  onClick={() => onReviewMappingEdge(mapping.id, "accepted")}
                  type="button"
                >
                  {t("data.source.accept")}
                </button>
                <button
                  aria-label={t("data.source.rejectMappingReview", {
                    source: mapping.source_label,
                    target: mapping.target_label
                  })}
                  onClick={() => onReviewMappingEdge(mapping.id, "rejected")}
                  type="button"
                >
                  {t("data.source.reject")}
                </button>
              </div>
            ) : (
              <span className="entity-match-status">{formatEntityMatchStatus(mapping.status, t)}</span>
            )}
          </li>
        ))}
      </InspectionList>
      <InspectionList title={t("data.source.entityMatches")}>
        {entityMatches.slice(0, 6).map((match) => (
          <li className="entity-match-row" key={match.id}>
            <strong>{`${match.source_label} -> ${match.target_label}`}</strong>
            <span>{formatEntityMatchMeta(match)}</span>
            {match.evidence_summary ? <p>{match.evidence_summary}</p> : null}
            {match.status === "suggested" ? (
              <div className="entity-match-actions">
                <button
                  aria-label={t("data.source.acceptEntityMatch", {
                    source: match.source_label,
                    target: match.target_label
                  })}
                  onClick={() => onReviewEntityMatch(match.id, "accepted")}
                  type="button"
                >
                  {t("data.source.accept")}
                </button>
                <button
                  aria-label={t("data.source.rejectEntityMatch", {
                    source: match.source_label,
                    target: match.target_label
                  })}
                  onClick={() => onReviewEntityMatch(match.id, "rejected")}
                  type="button"
                >
                  {t("data.source.reject")}
                </button>
              </div>
            ) : (
              <span className="entity-match-status">{formatEntityMatchStatus(match.status, t)}</span>
            )}
          </li>
        ))}
      </InspectionList>
    </section>
  );
}

function InspectionList({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const childArray = useMemo(() => Children.toArray(children), [children]);
  return (
    <div className="inspection-list">
      <h4>{title}</h4>
      {childArray.length > 0 ? <ul>{children}</ul> : <p>{t("data.empty")}</p>}
    </div>
  );
}

function TreeSection({
  title,
  rows,
  onSelectNode
}: {
  title: string;
  rows: WorkbenchTreeRow[];
  onSelectNode: (node: GraphNode) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="tree-section" aria-label={title}>
      <h3>{title}</h3>
      <div className="tree-row-list">
        {rows.length > 0 ? (
          rows.map((row) => <TreeRow key={row.id} onSelectNode={onSelectNode} row={row} />)
        ) : (
          <p className="tree-empty">{t("data.empty")}</p>
        )}
      </div>
    </section>
  );
}

function TreeRow({
  row,
  onSelectNode
}: {
  row: WorkbenchTreeRow;
  onSelectNode: (node: GraphNode) => void;
}) {
  const { language, t } = useI18n();
  if (row.type === "review") {
    return (
      <div className="tree-row tree-row-review" role="listitem">
        <span className="tree-row-type">{t("data.section.reviews")}</span>
        <span className="tree-row-label">{row.label}</span>
        <span className="tree-row-meta">{row.meta}</span>
      </div>
    );
  }

  return (
    <button
      aria-label={t("search.select", { label: row.label })}
      className={`tree-row tree-row-${row.type}`}
      onClick={() => onSelectNode(row.node)}
      type="button"
    >
      <span className="tree-row-type">{formatTreeRowType(row.type, language)}</span>
      <span className="tree-row-label">{row.label}</span>
      {row.type === "field" ? <span className="tree-row-parent">{row.parentLabel}</span> : null}
      <span className="tree-row-meta">{row.meta}</span>
    </button>
  );
}

function formatTreeRowType(type: "table" | "field" | "dimension", language: string): string {
  const labels = {
    "zh-CN": {
      table: "表",
      field: "字段",
      dimension: "维度"
    },
    "en-US": {
      table: "TABLE",
      field: "FIELD",
      dimension: "DIMENSION"
    }
  };
  return labels[language === "en-US" ? "en-US" : "zh-CN"][type];
}

function sourceRefsIncludeSource(sourceRefs: string[], sourceRef: string): boolean {
  return sourceRefs.some((ref) => evidenceRefMatchesSource(ref, sourceRef));
}

function evidenceRefMatchesSource(reference: string, sourceRef: string): boolean {
  const normalizedReference = reference.trim().toLowerCase();
  const normalizedSourceRef = sourceRef.trim().toLowerCase();
  return (
    normalizedReference === normalizedSourceRef ||
    normalizedReference.startsWith(`${normalizedSourceRef}#`) ||
    normalizedReference.startsWith(`${normalizedSourceRef}:`)
  );
}

function chunkMatchesEvidenceRef(chunk: DocumentChunk, reference: string | null): boolean {
  return reference !== null && chunk.source_ref.trim().toLowerCase() === reference.trim().toLowerCase();
}

function visibleFocusedChunks(chunks: DocumentChunk[], focusedEvidenceRef: string | null): DocumentChunk[] {
  const visibleChunks = chunks.slice(0, 6);
  const focusedChunk = chunks.find((chunk) => chunkMatchesEvidenceRef(chunk, focusedEvidenceRef));
  if (focusedChunk && !visibleChunks.some((chunk) => chunk.id === focusedChunk.id)) {
    return [...visibleChunks, focusedChunk];
  }
  return visibleChunks;
}

function formatSourceType(type: string, language: string): string {
  const normalized = type.toLowerCase();
  if (language === "en-US") {
    return normalized.toUpperCase();
  }
  if (normalized.includes("code")) {
    return "代码";
  }
  if (normalized.includes("log")) {
    return "日志";
  }
  if (normalized.includes("markdown")) {
    return "文档";
  }
  if (normalized.includes("word")) {
    return "文档";
  }
  if (normalized.includes("pdf")) {
    return "PDF";
  }
  return "来源";
}

function formatConfidence(label: string, confidence: number): string {
  return `${label} · ${Math.round(confidence * 100)}%`;
}

function formatChunkTokenRange(
  chunk: DocumentChunk,
  t: ReturnType<typeof useI18n>["t"]
): string | null {
  const tokenStart = numericMetadata(chunk.metadata.token_start);
  const tokenEnd = numericMetadata(chunk.metadata.token_end);
  if (tokenStart === null || tokenEnd === null) {
    return null;
  }
  return t("data.source.chunkTokens", { start: tokenStart, end: tokenEnd });
}

function formatEntityMatchMeta(match: EntityMatchReview): string {
  const keys = match.matched_keys.length > 0 ? ` · ${match.matched_keys.join(", ")}` : "";
  return `${match.relationship_type} · ${Math.round(match.confidence * 100)}%${keys}`;
}

function formatEntityMatchStatus(
  status: string,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (status === "accepted") {
    return t("data.source.status.accepted");
  }
  if (status === "rejected") {
    return t("data.source.status.rejected");
  }
  return status;
}

function numericMetadata(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringMetadata(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
