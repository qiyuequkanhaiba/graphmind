import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImportTaskListCard from "../src/components/ImportTaskListCard";
import type { ImportTask } from "../src/components/importTasks";
import { I18nProvider } from "../src/i18n/I18nProvider";

const importTasks: ImportTask[] = [
  {
    id: "task-running",
    label: "orders.csv",
    kind: "file",
    status: "running",
    progress: 35,
    summary: "正在解析字段画像。",
    error: null,
    retryable: false,
    jobId: 55,
    createdAt: 1780222800000,
    stages: [
      {
        name: "staged",
        status: "complete",
        progress: 5,
        summary: "Saved upload"
      },
      {
        name: "parsed",
        status: "complete",
        progress: 20,
        summary: "Read 2 sheets"
      }
    ]
  },
  {
    id: "task-failed",
    label: "customers.csv",
    kind: "file",
    status: "failed",
    progress: 100,
    summary: null,
    error: "Import file failed: 500",
    retryable: true,
    createdAt: 1780222860000
  },
  {
    id: "task-partial",
    label: "2 个文件批量导入",
    kind: "batch",
    status: "partial",
    progress: 100,
    summary: "1 个文件完成，1 个文件失败。",
    error: null,
    retryable: false,
    createdAt: 1780222920000,
    stages: [
      {
        name: "failed",
        status: "failed",
        progress: 100,
        summary: "Unexpected token",
        source: "broken.json",
        itemId: 19,
        retryable: true
      }
    ]
  }
];

function renderCard(overrides: Partial<Parameters<typeof ImportTaskListCard>[0]> = {}) {
  const props = {
    importTasks,
    onCancelImportTask: vi.fn(),
    onRefreshImportTask: vi.fn(),
    onRetryImportItem: vi.fn(),
    onRetryImportTask: vi.fn(),
    ...overrides
  };
  render(
    <I18nProvider>
      <ImportTaskListCard {...props} />
    </I18nProvider>
  );
  return props;
}

describe("ImportTaskListCard", () => {
  it("renders task progress, stages, errors, and retry actions", () => {
    const props = renderCard();

    const tasks = screen.getByRole("region", { name: "导入任务" });
    expect(within(tasks).getByText("最近 3 个任务")).toBeInTheDocument();
    expect(within(tasks).getByText("orders.csv")).toBeInTheDocument();
    expect(within(tasks).getByText("处理中")).toBeInTheDocument();
    expect(within(tasks).getByText("35%")).toBeInTheDocument();
    expect(within(tasks).getByText("正在解析字段画像。")).toBeInTheDocument();
    expect(within(tasks).getByText("已暂存")).toBeInTheDocument();
    expect(within(tasks).getByText("Saved upload")).toBeInTheDocument();
    expect(within(tasks).getByText("已解析")).toBeInTheDocument();
    expect(within(tasks).getByText("Read 2 sheets")).toBeInTheDocument();
    expect(within(tasks).getByText("customers.csv")).toBeInTheDocument();
    expect(within(tasks).getByText("错误明细")).toBeInTheDocument();
    expect(within(tasks).getByText("Import file failed: 500")).toBeInTheDocument();
    expect(within(tasks).getByText("2 个文件批量导入")).toBeInTheDocument();
    expect(within(tasks).getByText("部分完成")).toBeInTheDocument();
    expect(within(tasks).getByText("broken.json · 失败")).toBeInTheDocument();
    expect(within(tasks).getByText("Unexpected token")).toBeInTheDocument();

    fireEvent.click(within(tasks).getByRole("button", { name: "刷新任务 orders.csv" }));
    fireEvent.click(within(tasks).getByRole("button", { name: "取消任务 orders.csv" }));
    fireEvent.click(within(tasks).getByRole("button", { name: "重试任务 customers.csv" }));
    fireEvent.click(within(tasks).getByRole("button", { name: "重试文件 broken.json" }));

    expect(props.onRefreshImportTask).toHaveBeenCalledWith("task-running");
    expect(props.onCancelImportTask).toHaveBeenCalledWith("task-running");
    expect(props.onRetryImportTask).toHaveBeenCalledWith("task-failed");
    expect(props.onRetryImportItem).toHaveBeenCalledWith("task-partial", 19);
  });

  it("renders compact import diagnostics for tasks and stages", () => {
    renderCard({
      importTasks: [
        {
          id: "task-document",
          label: "Document diagnostics batch",
          kind: "batch",
          status: "succeeded",
          progress: 100,
          summary: "已生成知识图谱。",
          error: null,
          retryable: false,
          createdAt: 1780222920000,
          diagnostics: {
            document_count: 2,
            chunk_count: 8,
            entity_count: 5,
            relationship_count: 3,
            graph_node_count: 7,
            graph_edge_count: 4,
            ignored_file_count: 1,
            source_kind_counts: { code: 1, document: 1 }
          },
          stages: [
            {
              name: "extracted",
              status: "complete",
              progress: 80,
              summary: "Extracted relationships",
              source: "architecture.md",
              diagnostics: {
                document_count: 1,
                chunk_count: 3,
                entity_count: 2,
                relationship_count: 1,
                ignored_file_count: 0
              }
            }
          ]
        }
      ]
    });

    const tasks = screen.getByRole("region", { name: "导入任务" });
    expect(within(tasks).getByText("2 文档")).toBeInTheDocument();
    expect(within(tasks).getByText("8 分块")).toBeInTheDocument();
    expect(within(tasks).getByText("5 实体")).toBeInTheDocument();
    expect(within(tasks).getByText("3 关系")).toBeInTheDocument();
    expect(within(tasks).getByText("7 节点")).toBeInTheDocument();
    expect(within(tasks).getByText("4 边")).toBeInTheDocument();
    expect(within(tasks).getByText("1 忽略")).toBeInTheDocument();
    expect(within(tasks).getByText("代码 1")).toBeInTheDocument();
    expect(within(tasks).getByText("文档 1")).toBeInTheDocument();
    expect(within(tasks).getByText("1 文档")).toBeInTheDocument();
    expect(within(tasks).getByText("3 分块")).toBeInTheDocument();
    expect(within(tasks).getByText("2 实体")).toBeInTheDocument();
    expect(within(tasks).getByText("1 关系")).toBeInTheDocument();
  });

  it("renders structured recovery action and field errors from API failures", () => {
    renderCard({
      importTasks: [
        {
          id: "task-unsupported",
          label: "notes.exe",
          kind: "file",
          status: "failed",
          progress: 100,
          summary: null,
          error: "Unsupported import file type",
          errorCode: "UNSUPPORTED_IMPORT_FILE_TYPE",
          recoveryAction: "Upload a supported file type: CSV, XLSX, JSON, document, code, log, or archive.",
          fieldErrors: { file: "Unsupported import file type" },
          retryable: true,
          createdAt: 1780222860000
        }
      ]
    });

    const tasks = screen.getByRole("region", { name: "导入任务" });
    expect(within(tasks).getByText("修复动作")).toBeInTheDocument();
    expect(
      within(tasks).getByText("Upload a supported file type: CSV, XLSX, JSON, document, code, log, or archive.")
    ).toBeInTheDocument();
    expect(within(tasks).getByText("字段问题")).toBeInTheDocument();
    expect(within(tasks).getByText("file: Unsupported import file type")).toBeInTheDocument();
  });

  it("marks focused failed task and stage", () => {
    renderCard({
      focusedFailedStageKey: "broken.json-failed-0",
      focusedFailedTaskId: "task-partial"
    });

    expect(screen.getByText("2 个文件批量导入").closest(".import-task-row")).toHaveClass(
      "is-shortcut-focused"
    );
    expect(screen.getByText("broken.json · 失败").closest(".import-task-stage")).toHaveClass(
      "is-shortcut-focused"
    );
  });

  it("renders nothing when there are no import tasks", () => {
    renderCard({ importTasks: [] });

    expect(screen.queryByRole("region", { name: "导入任务" })).not.toBeInTheDocument();
  });
});
