import { Handle, Position, type NodeProps } from "reactflow";
import type { GraphNode } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { aggregateCountFromRecord, getNodeKindLabel, nodeSubtitle } from "./graphSemantics";

export type SemanticNodeData = {
  graphNode: GraphNode;
  highlighted: boolean;
  keyFieldCount?: number;
  relationshipCount?: number;
};

export default function SemanticNode({ data }: NodeProps<SemanticNodeData>) {
  const { language } = useI18n();
  const { graphNode, highlighted, keyFieldCount, relationshipCount } = data;
  const nodeTypeClass = graphNode.node_type.replace(/_/g, "-");
  const showTableMetrics = graphNode.node_type === "table";
  const aggregateCount = aggregateCountFromRecord(graphNode.metadata);
  return (
    <div
      className={`semantic-node semantic-node-${nodeTypeClass}${
        highlighted ? " is-highlighted" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="semantic-node-kind">{getNodeKindLabel(graphNode.node_type, language)}</div>
      <strong title={graphNode.label}>{graphNode.label}</strong>
      <small>{nodeSubtitle(graphNode, language)}</small>
      {showTableMetrics ? (
        <div className="semantic-node-metrics">
          <span className="semantic-node-metric">
            {language === "en-US" ? `Links ${relationshipCount ?? 0}` : `关联 ${relationshipCount ?? 0}`}
          </span>
          <span className="semantic-node-metric">
            {language === "en-US" ? `Key fields ${keyFieldCount ?? 0}` : `关键字段 ${keyFieldCount ?? 0}`}
          </span>
        </div>
      ) : null}
      {aggregateCount > 1 ? (
        <span className="semantic-node-aggregate">
          {language === "en-US" ? `x${aggregateCount}` : `聚合 ${aggregateCount}`}
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
