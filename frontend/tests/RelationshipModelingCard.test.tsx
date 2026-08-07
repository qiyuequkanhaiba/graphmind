import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RelationshipModelingReview, RelationshipSuggestion } from "../src/api/types";
import RelationshipModelingCard from "../src/components/RelationshipModelingCard";
import { I18nProvider } from "../src/i18n/I18nProvider";

const relationshipCandidates: RelationshipSuggestion[] = [
  {
    id: 7,
    source_field_id: 21,
    target_field_id: 31,
    source_label: "Orders.customer_id",
    target_label: "Customers.id",
    relationship_type: "foreign_key",
    confidence: 0.94,
    evidence_summary: "Customer IDs overlap strongly.",
    evidence_payload: { overlap_count: 8, source_match_ratio: 0.92 },
    decision_status: "pending"
  }
];

const mergeableRelationshipCandidates: RelationshipSuggestion[] = [
  relationshipCandidates[0],
  {
    id: 8,
    source_field_id: 21,
    target_field_id: 31,
    source_label: "Orders.customer_id",
    target_label: "Customers.id",
    relationship_type: "same_entity",
    confidence: 0.72,
    evidence_summary: "Names and sampled values point to the same entity.",
    evidence_payload: { overlap_count: 6, source_match_ratio: 0.72 },
    decision_status: "pending"
  },
  {
    id: 9,
    source_field_id: 22,
    target_field_id: null,
    source_label: "Orders.amount",
    target_label: null,
    relationship_type: "derived_dimension",
    confidence: 0.58,
    evidence_summary: "Amount can be grouped into bands.",
    evidence_payload: { bucket_count: 3 },
    decision_status: "pending"
  }
];

function renderCard({
  candidates = relationshipCandidates,
  onConfirmRelationship = vi.fn<ConfirmRelationshipHandler>()
}: {
  candidates?: RelationshipSuggestion[];
  onConfirmRelationship?: ReturnType<typeof vi.fn<ConfirmRelationshipHandler>>;
} = {}) {
  render(
    <I18nProvider>
      <RelationshipModelingCard
        candidates={candidates}
        onConfirmRelationship={onConfirmRelationship}
      />
    </I18nProvider>
  );
  return { onConfirmRelationship };
}

type ConfirmRelationshipHandler = (
  suggestionId: number,
  review: RelationshipModelingReview
) => void;

describe("RelationshipModelingCard", () => {
  it("lets users tune relationship candidates before review", () => {
    const { onConfirmRelationship } = renderCard();

    const modeling = screen.getByRole("region", { name: "关系建模编辑器" });
    expect(within(modeling).getByText("Orders.customer_id")).toBeInTheDocument();
    expect(within(modeling).getByText("Customers.id")).toBeInTheDocument();
    expect(within(modeling).getByText("置信度 94%")).toBeInTheDocument();
    expect(within(modeling).getByText("已建模 0/1 条关系")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("关系 Orders.customer_id 到 Customers.id 的类型"), {
      target: { value: "same_entity" }
    });
    fireEvent.change(screen.getByLabelText("关系 Orders.customer_id 到 Customers.id 的证据质量"), {
      target: { value: "high" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认关系 Orders.customer_id 到 Customers.id" }));

    expect(screen.getByLabelText("关系 Orders.customer_id 到 Customers.id 的类型")).toHaveValue("same_entity");
    expect(screen.getByLabelText("关系 Orders.customer_id 到 Customers.id 的证据质量")).toHaveValue("high");
    expect(within(modeling).getByText("已建模 1/1 条关系")).toBeInTheDocument();
    expect(onConfirmRelationship).toHaveBeenCalledWith(7, {
      decisionStatus: "edited",
      evidenceQuality: "high",
      relationshipType: "same_entity"
    });
  });

  it("groups mergeable relationship candidates and applies modeling rules", () => {
    const { onConfirmRelationship } = renderCard({ candidates: mergeableRelationshipCandidates });

    const modeling = screen.getByRole("region", { name: "关系建模编辑器" });
    expect(within(modeling).getByText("可合并 2 条候选")).toBeInTheDocument();
    expect(within(modeling).getByText("规则匹配 3/3 条")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("关系置信度阈值"), {
      target: { value: "80" }
    });
    expect(within(modeling).getByText("规则匹配 1/3 条")).toBeInTheDocument();
    expect(within(modeling).queryByText("Orders.amount")).not.toBeInTheDocument();

    fireEvent.click(
      within(modeling).getByRole("button", {
        name: "合并确认 Orders.customer_id 到 Customers.id 的 2 条候选"
      })
    );

    expect(onConfirmRelationship).toHaveBeenCalledTimes(2);
    expect(onConfirmRelationship).toHaveBeenNthCalledWith(1, 7, {
      decisionStatus: "accepted",
      evidenceQuality: "high",
      relationshipType: "foreign_key"
    });
    expect(onConfirmRelationship).toHaveBeenNthCalledWith(2, 8, {
      decisionStatus: "edited",
      evidenceQuality: "medium",
      relationshipType: "foreign_key"
    });
    expect(within(modeling).getByText("已建模 2/3 条关系")).toBeInTheDocument();
  });

  it("renders nothing when there are no relationship candidates", () => {
    renderCard({ candidates: [] });

    expect(screen.queryByRole("region", { name: "关系建模编辑器" })).not.toBeInTheDocument();
  });
});
