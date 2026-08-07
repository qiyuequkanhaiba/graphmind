import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ImportHealthPanel from "../src/components/ImportHealthPanel";
import type { ImportHealthOverview, ImportHealthQueueItem } from "../src/components/importHealth";
import { I18nProvider } from "../src/i18n/I18nProvider";

const health: ImportHealthOverview = {
  status: "attention",
  sourceKindCount: 2,
  failedTaskCount: 1,
  pendingReviewCount: 2,
  highPriorityCount: 3,
  duplicateSuggestionCount: 4,
  multiSourceRelationshipCount: 5,
  extractedHighPriorityCount: 6,
  staleImportJobCount: 1,
  ignoredFileCount: 7
};

function renderPanel(overrides: Partial<Parameters<typeof ImportHealthPanel>[0]> = {}) {
  const queue: ImportHealthQueueItem[] = [
    {
      actionLabel: "查看失败导入项",
      countLabel: "1 个失败项",
      key: "failures",
      label: "处理失败导入项",
      onClick: vi.fn(),
      recommended: true
    },
    {
      actionLabel: "查看待确认关系",
      countLabel: "2 条待确认",
      key: "pending",
      label: "待确认关系",
      onClick: vi.fn()
    }
  ];
  const props = {
    health,
    queue,
    canRetryFailure: true,
    canRecoverImportJobs: true,
    onDuplicates: vi.fn(),
    onFailures: vi.fn(),
    onHighPriority: vi.fn(),
    onPending: vi.fn(),
    onRecoverImportJobs: vi.fn(),
    onRetryFailure: vi.fn(),
    ...overrides
  };

  render(
    <I18nProvider>
      <ImportHealthPanel {...props} />
    </I18nProvider>
  );

  return props;
}

describe("ImportHealthPanel", () => {
  it("renders health metrics, retry action, and the recommended queue item", () => {
    renderPanel();

    expect(screen.getByRole("heading", { name: "导入健康度" })).toBeInTheDocument();
    expect(screen.getByText("需处理")).toBeInTheDocument();
    expect(screen.getByText("2 类来源")).toBeInTheDocument();
    expect(screen.getByText("5 条多源证据")).toBeInTheDocument();
    expect(screen.getByText("6 条抽取高优先级")).toBeInTheDocument();
    expect(screen.getByText("7 个忽略文件")).toBeInTheDocument();
    expect(screen.getByText("1 个卡住任务")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看失败导入项" })).toHaveTextContent("1 个失败项");
    expect(screen.getByRole("button", { name: "重试失败导入项" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复卡住任务" })).toBeInTheDocument();

    const queue = screen.getByRole("list", { name: "处理队列" });
    expect(within(queue).getByText("处理失败导入项")).toBeInTheDocument();
    expect(within(queue).getByText("推荐")).toBeInTheDocument();
    expect(within(queue).getByRole("button", { name: "处理失败导入项: 查看失败导入项" })).toBeInTheDocument();
  });

  it("routes metric and queue actions to the supplied callbacks", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "查看失败导入项" }));
    fireEvent.click(screen.getByRole("button", { name: "查看待确认关系" }));
    fireEvent.click(screen.getByRole("button", { name: "查看高优先级关系" }));
    fireEvent.click(screen.getByRole("button", { name: "查看重复关系" }));
    fireEvent.click(screen.getByRole("button", { name: "重试失败导入项" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复卡住任务" }));
    fireEvent.click(screen.getByRole("button", { name: "处理失败导入项: 查看失败导入项" }));

    expect(props.onFailures).toHaveBeenCalledTimes(1);
    expect(props.onPending).toHaveBeenCalledTimes(1);
    expect(props.onHighPriority).toHaveBeenCalledTimes(1);
    expect(props.onDuplicates).toHaveBeenCalledTimes(1);
    expect(props.onRetryFailure).toHaveBeenCalledTimes(1);
    expect(props.onRecoverImportJobs).toHaveBeenCalledTimes(1);
    expect(props.queue[0]?.onClick).toHaveBeenCalledTimes(1);
  });

  it("hides the action queue and disables zero-count metric actions", () => {
    renderPanel({
      canRetryFailure: false,
      canRecoverImportJobs: false,
      health: {
        status: "healthy",
        sourceKindCount: 1,
        failedTaskCount: 0,
        pendingReviewCount: 0,
        highPriorityCount: 0,
        duplicateSuggestionCount: 0,
        multiSourceRelationshipCount: 0,
        extractedHighPriorityCount: 0,
        staleImportJobCount: 0,
        ignoredFileCount: 0
      },
      queue: []
    });

    expect(screen.queryByRole("list", { name: "处理队列" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看失败导入项" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试失败导入项" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "恢复卡住任务" })).not.toBeInTheDocument();
    expect(screen.getByText("0 个失败项")).toBeInTheDocument();
  });
});
