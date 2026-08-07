import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GraphNode } from "../src/api/types";
import FieldMappingCard from "../src/components/FieldMappingCard";
import { I18nProvider } from "../src/i18n/I18nProvider";

const fields: GraphNode[] = [
  {
    id: 21,
    node_type: "field",
    label: "Orders.customer_id",
    source_ref: "orders.customer_id",
    metadata: { inferred_type: "identifier", key_candidate_score: 0.91 },
    position_x: 0,
    position_y: 0
  },
  {
    id: 22,
    node_type: "field",
    label: "Orders.amount",
    source_ref: "orders.amount",
    metadata: { inferred_type: "number", key_candidate_score: 0.1 },
    position_x: 0,
    position_y: 120
  }
];

function renderCard(nextFields = fields) {
  render(
    <I18nProvider>
      <FieldMappingCard fields={nextFields} />
    </I18nProvider>
  );
}

describe("FieldMappingCard", () => {
  it("renders field profiles and lets users update local drafts", () => {
    renderCard();

    const mapping = screen.getByRole("region", { name: "字段映射与类型确认" });
    expect(within(mapping).getByText("Orders.customer_id")).toBeInTheDocument();
    expect(within(mapping).getByText("Orders.amount")).toBeInTheDocument();
    expect(within(mapping).getAllByText("Orders").length).toBeGreaterThan(0);
    expect(within(mapping).getAllByText("identifier").length).toBeGreaterThan(0);
    expect(within(mapping).getByText("键候选 91%")).toBeInTheDocument();
    expect(within(mapping).getByText("已确认 0/2 个字段")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("字段 Orders.amount 的业务类型"), {
      target: { value: "metric" }
    });
    fireEvent.click(screen.getByRole("button", { name: "标记 Orders.amount 为主键候选" }));
    fireEvent.click(screen.getByRole("button", { name: "确认字段 Orders.amount" }));

    expect(screen.getByLabelText("字段 Orders.amount 的业务类型")).toHaveValue("metric");
    expect(screen.getByRole("button", { name: "取消 Orders.amount 主键候选" })).toBeInTheDocument();
    expect(within(mapping).getByText("已确认 1/2 个字段")).toBeInTheDocument();
  });

  it("falls back to text type and ungrouped table labels", () => {
    renderCard([
      {
        id: 23,
        node_type: "field",
        label: "loose_field",
        source_ref: "loose_field",
        metadata: { inferred_type: "custom_json", key_candidate_score: 0 },
        position_x: 0,
        position_y: 0
      }
    ]);

    expect(screen.getByText("Ungrouped")).toBeInTheDocument();
    expect(screen.getByLabelText("字段 loose_field 的业务类型")).toHaveValue("text");
    expect(screen.getByText("custom_json")).toBeInTheDocument();
  });

  it("renders nothing when there are no fields", () => {
    renderCard([]);

    expect(screen.queryByRole("region", { name: "字段映射与类型确认" })).not.toBeInTheDocument();
  });
});
