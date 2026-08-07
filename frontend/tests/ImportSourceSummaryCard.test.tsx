import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ImportSourceSummaryCard from "../src/components/ImportSourceSummaryCard";
import { I18nProvider } from "../src/i18n/I18nProvider";

function renderCard(sourceSummaries = [
  { source_kind: "table", count: 2 },
  { source_kind: "document", count: 1 }
]) {
  render(
    <I18nProvider>
      <ImportSourceSummaryCard sourceSummaries={sourceSummaries} />
    </I18nProvider>
  );
}

describe("ImportSourceSummaryCard", () => {
  it("renders source summary metrics", () => {
    renderCard();

    const summary = screen.getByRole("region", { name: "来源概览" });
    expect(within(summary).getByRole("heading", { name: "来源概览" })).toBeInTheDocument();
    expect(within(summary).getByText("table · 2")).toBeInTheDocument();
    expect(within(summary).getByText("document · 1")).toBeInTheDocument();
  });

  it("renders nothing when there are no source summaries", () => {
    renderCard([]);

    expect(screen.queryByRole("region", { name: "来源概览" })).not.toBeInTheDocument();
  });
});
