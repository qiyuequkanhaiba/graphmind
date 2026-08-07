import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImportIntakeControls from "../src/components/ImportIntakeControls";
import type { ImportDataStats } from "../src/components/ImportPanel";
import { I18nProvider } from "../src/i18n/I18nProvider";

const emptyStats: ImportDataStats = {
  tableCount: 0,
  fieldCount: 0,
  suggestionCount: 0,
  pendingSuggestionCount: 0,
  graphNodeCount: 0,
  graphEdgeCount: 0
};

function renderControls({
  dataStats = emptyStats,
  initialLanguage
}: {
  dataStats?: ImportDataStats;
  initialLanguage?: "en-US" | "zh-CN";
} = {}) {
  const props = {
    dataStats,
    onImport: vi.fn(),
    onImportBatch: vi.fn(),
    onImportSample: vi.fn(),
    onImportUrl: vi.fn(),
    onResetData: vi.fn()
  };
  render(
    <I18nProvider initialLanguage={initialLanguage}>
      <ImportIntakeControls {...props} />
    </I18nProvider>
  );
  return props;
}

describe("ImportIntakeControls", () => {
  it("routes single table files to normal import and exposes sample/reset actions", () => {
    const props = renderControls();
    const file = new File(["id,name\n1,Alice"], "customers.csv", { type: "text/csv" });

    fireEvent.change(screen.getByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志"), {
      target: { files: [file] }
    });
    fireEvent.click(screen.getByRole("button", { name: "导入示例数据" }));
    fireEvent.click(screen.getByRole("button", { name: "重置当前项目数据" }));

    expect(props.onImport).toHaveBeenCalledWith(file);
    expect(props.onImportBatch).not.toHaveBeenCalled();
    expect(props.onImportSample).toHaveBeenCalledTimes(1);
    expect(props.onResetData).toHaveBeenCalledTimes(1);
  });

  it("routes multiple files and batch-only extensions through batch import", () => {
    const props = renderControls();
    const files = [
      new File(["id,name\nc1,Acme"], "customers.csv", { type: "text/csv" }),
      new File(['[{"order_id":"o1"}]'], "orders.json", { type: "application/json" })
    ];

    fireEvent.change(screen.getByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志"), {
      target: { files }
    });

    expect(props.onImportBatch).toHaveBeenCalledWith(files);

    const zipFile = new File(["zip-bytes"], "repo.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志"), {
      target: { files: [zipFile] }
    });

    expect(props.onImport).not.toHaveBeenCalled();
    expect(props.onImportBatch).toHaveBeenCalledWith([zipFile]);
  });

  it("renders wizard progress from data stats", () => {
    renderControls({
      dataStats: {
        tableCount: 1,
        fieldCount: 2,
        suggestionCount: 3,
        pendingSuggestionCount: 2,
        graphNodeCount: 5,
        graphEdgeCount: 4
      }
    });

    expect(screen.getByRole("list", { name: "导入建模向导" })).toBeInTheDocument();
    expect(screen.getByText("上传数据")).toBeInTheDocument();
    expect(screen.getByText("字段识别")).toBeInTheDocument();
    expect(screen.getByText("候选关系")).toBeInTheDocument();
    expect(screen.getByText("人工确认")).toBeInTheDocument();
    expect(screen.getByText("生成图谱")).toBeInTheDocument();
    expect(screen.getByText("已生成 3 条关系候选。")).toBeInTheDocument();
    expect(screen.getByText("2 条关系等待人工确认。")).toBeInTheDocument();
  });

  it("submits URL imports from the URL source control", () => {
    const props = renderControls();

    fireEvent.change(screen.getByLabelText("URL 来源"), {
      target: { value: "https://example.com/docs" }
    });
    fireEvent.click(screen.getByRole("button", { name: "导入 URL" }));

    expect(props.onImportUrl).toHaveBeenCalledWith("https://example.com/docs");
    expect(screen.getByLabelText("URL 来源")).toHaveValue("");
  });

  it("localizes the wizard in English when requested", () => {
    renderControls({
      dataStats: {
        tableCount: 2,
        fieldCount: 8,
        suggestionCount: 4,
        pendingSuggestionCount: 1,
        graphNodeCount: 10,
        graphEdgeCount: 12
      },
      initialLanguage: "en-US"
    });

    expect(screen.getByRole("list", { name: "Import modeling wizard" })).toBeInTheDocument();
    expect(screen.getByText("Upload data")).toBeInTheDocument();
    expect(screen.getByText("Field profiling")).toBeInTheDocument();
    expect(screen.getByText("Relationship candidates")).toBeInTheDocument();
    expect(screen.getByText("Human confirmation")).toBeInTheDocument();
    expect(screen.getByText("Generate graph")).toBeInTheDocument();
    expect(screen.getByText("Generated 4 relationship candidates.")).toBeInTheDocument();
  });

  it("accepts zipped code repositories", () => {
    renderControls();

    expect(screen.getByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志")).toHaveAttribute(
      "accept",
      expect.stringContaining(".zip")
    );
  });

  it("shows first-graph templates for spreadsheet, document, code repository, and URL use cases", () => {
    const props = renderControls();

    const templates = screen.getByRole("list", { name: "首图模板" });
    expect(screen.getByText("从表格关系开始")).toBeInTheDocument();
    expect(screen.getByText("从文档知识开始")).toBeInTheDocument();
    expect(screen.getByText("从代码仓库开始")).toBeInTheDocument();
    expect(screen.getByText("从 URL 开始")).toBeInTheDocument();
    expect(screen.getByText("CSV / Excel")).toBeInTheDocument();
    expect(screen.getByText("DOCX / PDF / Markdown")).toBeInTheDocument();
    expect(screen.getByText("ZIP / TS / Python")).toBeInTheDocument();
    expect(screen.getByText("Docs / Runbook / Wiki")).toBeInTheDocument();

    fireEvent.click(within(templates).getByRole("button", { name: "使用模板 从表格关系开始" }));
    fireEvent.click(within(templates).getByRole("button", { name: "使用模板 从 URL 开始" }));

    expect(props.onImportSample).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("URL 来源")).toHaveAttribute(
      "placeholder",
      "https://example.com/docs"
    );
  });

  it("surfaces scenario-specific next steps when a first-graph template is selected", () => {
    const props = renderControls();
    const templates = screen.getByRole("list", { name: "首图模板" });

    fireEvent.click(within(templates).getByRole("button", { name: "使用模板 从文档知识开始" }));

    const guidance = screen.getByRole("region", { name: "模板下一步" });
    expect(within(guidance).getByText("从文档知识开始")).toBeInTheDocument();
    expect(within(guidance).getByText("上传 PRD、Runbook、PDF 或 Markdown，GraphMind 会抽取实体、关系和证据片段。")).toBeInTheDocument();
    expect(within(guidance).getByRole("button", { name: "打开文件选择器" })).toBeInTheDocument();

    fireEvent.click(within(templates).getByRole("button", { name: "使用模板 从 URL 开始" }));

    expect(within(guidance).getByText("粘贴公开文档、Wiki 或 Runbook 链接，导入前会执行 URL 安全校验。")).toBeInTheDocument();
    expect(within(guidance).getByRole("button", { name: "填写 URL" })).toBeInTheDocument();

    fireEvent.click(within(templates).getByRole("button", { name: "使用模板 从表格关系开始" }));

    expect(props.onImportSample).toHaveBeenCalledTimes(1);
    expect(within(guidance).getByText("用示例表格快速生成第一张关系图，或上传 CSV / Excel 替换为真实数据。")).toBeInTheDocument();
  });

  it("shows template-level project preset recommendations without adding an apply action", () => {
    renderControls();
    const templates = screen.getByRole("list", { name: "首图模板" });

    fireEvent.click(within(templates).getByRole("button", { name: "使用模板 从文档知识开始" }));

    const guidance = screen.getByRole("region", { name: "模板下一步" });
    expect(within(guidance).getByText("推荐项目预设")).toBeInTheDocument();
    expect(
      within(guidance).getByText("OpenAI Compatible 对话 · OpenAI Compatible 向量 · 快照保留 90 天")
    ).toBeInTheDocument();
    expect(within(guidance).getByText("仅提示推荐，不会自动修改 AI 或向量设置。")).toBeInTheDocument();
    expect(within(guidance).queryByRole("button", { name: "应用预设到草稿" })).not.toBeInTheDocument();

    fireEvent.click(within(templates).getByRole("button", { name: "使用模板 从代码仓库开始" }));
    expect(
      within(guidance).getByText("OpenAI Compatible 对话 · OpenAI Compatible 向量 · 快照保留 90 天")
    ).toBeInTheDocument();

    fireEvent.click(within(templates).getByRole("button", { name: "使用模板 从表格关系开始" }));
    expect(within(guidance).getByText("规则问答 · 未配置向量 · 快照保留 30 天")).toBeInTheDocument();

    fireEvent.click(within(templates).getByRole("button", { name: "使用模板 从 URL 开始" }));
    expect(within(guidance).getByText("规则问答 · 未配置向量 · 快照保留 30 天")).toBeInTheDocument();
  });
});
