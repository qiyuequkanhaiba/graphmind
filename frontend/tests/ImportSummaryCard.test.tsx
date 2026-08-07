import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ImportSummaryCard, { type ImportSummaryStats } from "../src/components/ImportSummaryCard";
import { I18nProvider } from "../src/i18n/I18nProvider";

const dataStats: ImportSummaryStats = {
  tableCount: 2,
  fieldCount: 8,
  suggestionCount: 3,
  pendingSuggestionCount: 2,
  graphNodeCount: 12,
  graphEdgeCount: 10
};

function renderCard(props: Partial<Parameters<typeof ImportSummaryCard>[0]> = {}) {
  render(
    <I18nProvider>
      <ImportSummaryCard dataStats={dataStats} {...props} />
    </I18nProvider>
  );
}

describe("ImportSummaryCard", () => {
  it("renders detected table metrics and graph footprint", () => {
    renderCard({ dataSummary: "已导入 2 张表" });

    const summary = screen.getByRole("region", { name: "导入结果摘要" });
    expect(within(summary).getByRole("heading", { name: "已检测表" })).toBeInTheDocument();
    expect(within(summary).getByText("2 张表")).toBeInTheDocument();
    expect(within(summary).getByText("8 个字段")).toBeInTheDocument();
    expect(within(summary).getByText("3 条候选关系")).toBeInTheDocument();
    expect(within(summary).getByText("2 条待确认")).toBeInTheDocument();
    expect(within(summary).getByText("已导入 2 张表")).toBeInTheDocument();
    expect(within(summary).getByText("图谱 12 节点 · 10 关系")).toBeInTheDocument();
  });

  it("shows import status first and keeps data summary as supporting copy", () => {
    renderCard({
      dataSummary: "已导入 2 张表",
      importStatus: "正在处理文件"
    });

    const summary = screen.getByRole("region", { name: "导入结果摘要" });
    expect(within(summary).getByText("正在处理文件")).toBeInTheDocument();
    expect(within(summary).getByText("已导入 2 张表")).toBeInTheDocument();
  });

  it("falls back to the empty profile message", () => {
    renderCard({ dataStats: { ...dataStats, tableCount: 0, fieldCount: 0 } });

    expect(screen.getByText("上传后的工作表和字段画像会显示在这里。")).toBeInTheDocument();
  });
});
