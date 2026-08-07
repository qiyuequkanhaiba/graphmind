import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  GraphNode,
  RelationshipGovernanceSummary,
  RelationshipSuggestion
} from "../src/api/types";
import ImportPanel from "../src/components/ImportPanel";
import { I18nProvider } from "../src/i18n/I18nProvider";

const fieldProfiles: GraphNode[] = [
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

const highPriorityRelationshipCandidates: RelationshipSuggestion[] = [
  {
    ...relationshipCandidates[0],
    review_priority: "high",
    quality_label: "high",
    quality_reasons: ["confidence:high"]
  }
];

const multiSourceRelationshipCandidates: RelationshipSuggestion[] = [
  {
    ...relationshipCandidates[0],
    review_priority: "high",
    quality_label: "high",
    quality_reasons: ["source:extracted_relationship", "evidence:multi_source"],
    evidence_payload: {
      source_kind: "extracted_relationship",
      evidence_refs: ["architecture.md#overview", "service.ts#CustomerService"]
    }
  },
  {
    ...relationshipCandidates[0],
    id: 10,
    review_priority: "medium",
    evidence_payload: {
      evidence_refs: ["orders.csv#customer_id", "runbook.md#chunk-1"]
    }
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

const relationshipGovernance: RelationshipGovernanceSummary = {
  total_suggestion_count: 3,
  visible_suggestion_count: 2,
  duplicate_suggestion_count: 1,
  duplicate_group_count: 1,
  pending_suggestion_count: 2,
  accepted_suggestion_count: 1,
  rejected_suggestion_count: 0,
  edited_suggestion_count: 0,
  duplicate_groups: [
    {
      canonical_suggestion_id: 7,
      duplicate_suggestion_ids: [8],
      source_label: "Orders.customer_id",
      target_label: "Customers.id",
      relationship_type: "foreign_key"
    }
  ]
};

describe("ImportPanel", () => {
  it("shows import health metrics that need attention", () => {
    render(
      <ImportPanel
        dataStats={{
          tableCount: 2,
          fieldCount: 8,
          suggestionCount: 3,
          pendingSuggestionCount: 2,
          graphNodeCount: 12,
          graphEdgeCount: 10
        }}
        importTasks={[
          {
            id: "task-partial",
            label: "3 个文件批量导入",
            kind: "batch",
            status: "partial",
            progress: 100,
            summary: "2 个文件完成，1 个文件失败。",
            error: null,
            retryable: false,
            createdAt: 1780222920000,
            diagnostics: { ignored_file_count: 3 }
          }
        ]}
        relationshipCandidates={multiSourceRelationshipCandidates}
        relationshipGovernance={relationshipGovernance}
        sourceSummaries={[
          { source_kind: "table", count: 2 },
          { source_kind: "document", count: 1 }
        ]}
      />
    );

    const health = screen.getByRole("region", { name: "导入健康度" });

    expect(within(health).getByText("需处理")).toBeInTheDocument();
    const metrics = health.querySelector(".import-health-metrics") as HTMLElement;
    expect(within(metrics).getByText("2 类来源")).toBeInTheDocument();
    expect(within(metrics).getByText("2 条多源证据")).toBeInTheDocument();
    expect(within(metrics).getByText("1 条抽取高优先级")).toBeInTheDocument();
    expect(within(metrics).getByText("3 个忽略文件")).toBeInTheDocument();
    expect(within(metrics).getByText("1 个失败项")).toBeInTheDocument();
    expect(within(metrics).getByText("2 条待确认")).toBeInTheDocument();
    expect(within(metrics).getByText("1 条高优先级")).toBeInTheDocument();
    expect(within(metrics).getByText("1 条重复")).toBeInTheDocument();

    const queue = within(health).getByRole("list", { name: "处理队列" });
    const queueItems = within(queue).getAllByRole("listitem");
    expect(queueItems).toHaveLength(4);
    expect(queueItems.map((item) => item.querySelector("span")?.childNodes[0].textContent)).toEqual([
      "处理失败导入项",
      "待确认关系",
      "高优先级关系",
      "重复关系"
    ]);
    expect(queueItems.map((item) => item.querySelector("small")?.textContent)).toEqual([
      "1 个失败项",
      "2 条待确认",
      "1 条高优先级",
      "1 条重复"
    ]);
    expect(within(queueItems[0]).getByText("推荐")).toBeInTheDocument();
    expect(queueItems.slice(1).every((item) => within(item).queryByText("推荐") === null)).toBe(true);
  });

  it("triggers a failed import health shortcut when failures are present", () => {
    const onOpenFailedImports = vi.fn();
    render(
      <ImportPanel
        dataStats={{
          tableCount: 1,
          fieldCount: 4,
          suggestionCount: 0,
          pendingSuggestionCount: 0,
          graphNodeCount: 5,
          graphEdgeCount: 4
        }}
        importTasks={[
          {
            id: "task-failed",
            label: "customers.csv",
            kind: "file",
            status: "failed",
            progress: 100,
            summary: null,
            error: "Import failed",
            retryable: true,
            createdAt: 1780222920000
          }
        ]}
        onOpenFailedImports={onOpenFailedImports}
        sourceSummaries={[{ source_kind: "table", count: 1 }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "查看失败导入项" }));

    expect(onOpenFailedImports).toHaveBeenCalledWith({
      failedTaskCount: 1,
      taskLabel: "customers.csv"
    });
    expect(screen.getByText("customers.csv").closest(".import-task-row")).toHaveClass(
      "is-shortcut-focused"
    );
  });

  it("focuses the first failed batch stage when a partial import is the failed shortcut target", () => {
    const onOpenFailedImports = vi.fn();
    render(
      <ImportPanel
        importTasks={[
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
        ]}
        onOpenFailedImports={onOpenFailedImports}
        sourceSummaries={[{ source_kind: "document", count: 1 }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "查看失败导入项" }));

    expect(onOpenFailedImports).toHaveBeenCalledWith({
      failedTaskCount: 1,
      stageLabel: "broken.json · 失败",
      taskLabel: "2 个文件批量导入"
    });
    expect(screen.getByText("2 个文件批量导入").closest(".import-task-row")).toHaveClass(
      "is-shortcut-focused"
    );
    expect(screen.getByText("broken.json · 失败").closest(".import-task-stage")).toHaveClass(
      "is-shortcut-focused"
    );
  });

  it("clears failed shortcut focus when the failed stage is no longer failed", () => {
    const failedTask = {
      id: "task-partial",
      label: "2 个文件批量导入",
      kind: "batch" as const,
      status: "partial" as const,
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
    };
    const { rerender } = render(
      <ImportPanel
        importTasks={[failedTask]}
        sourceSummaries={[{ source_kind: "document", count: 1 }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "查看失败导入项" }));

    expect(screen.getByText("broken.json · 失败").closest(".import-task-stage")).toHaveClass(
      "is-shortcut-focused"
    );

    rerender(
      <ImportPanel
        importTasks={[
          {
            ...failedTask,
            status: "succeeded",
            stages: [
              {
                ...failedTask.stages[0],
                status: "complete"
              }
            ]
          }
        ]}
        sourceSummaries={[{ source_kind: "document", count: 1 }]}
      />
    );

    expect(screen.getByText("broken.json · 失败").closest(".import-task-stage")).not.toHaveClass(
      "is-shortcut-focused"
    );
    expect(screen.getByText("2 个文件批量导入").closest(".import-task-row")).not.toHaveClass(
      "is-shortcut-focused"
    );
  });

  it("retries the first retryable failed task from import health", () => {
    const onRetryImportTask = vi.fn();
    render(
      <ImportPanel
        importTasks={[
          {
            id: "task-failed",
            label: "customers.csv",
            kind: "file",
            status: "failed",
            progress: 100,
            summary: null,
            error: "Import failed",
            retryable: true,
            createdAt: 1780222920000
          }
        ]}
        onRetryImportTask={onRetryImportTask}
        sourceSummaries={[{ source_kind: "table", count: 1 }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "重试失败导入项" }));

    expect(onRetryImportTask).toHaveBeenCalledWith("task-failed");
    expect(screen.getByText("customers.csv").closest(".import-task-row")).toHaveClass(
      "is-shortcut-focused"
    );
  });

  it("retries the first retryable failed batch stage from import health", () => {
    const onRetryImportItem = vi.fn();
    render(
      <ImportPanel
        importTasks={[
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
        ]}
        onRetryImportItem={onRetryImportItem}
        sourceSummaries={[{ source_kind: "document", count: 1 }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "重试失败导入项" }));

    expect(onRetryImportItem).toHaveBeenCalledWith("task-partial", 19);
    expect(screen.getByText("broken.json · 失败").closest(".import-task-stage")).toHaveClass(
      "is-shortcut-focused"
    );
  });

  it("routes the recover action when persisted import jobs are queued or running", () => {
    const onRecoverImportJobs = vi.fn();
    render(
      <ImportPanel
        importTasks={[
          {
            id: "job-78",
            label: "stuck.csv",
            kind: "file",
            status: "queued",
            progress: 0,
            summary: null,
            error: null,
            retryable: false,
            createdAt: 1780222920000,
            jobId: 78
          }
        ]}
        onRecoverImportJobs={onRecoverImportJobs}
        sourceSummaries={[{ source_kind: "table", count: 1 }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "恢复卡住任务" }));

    expect(onRecoverImportJobs).toHaveBeenCalledTimes(1);
  });

  it("recommends recovering active persisted import jobs in the health queue", () => {
    const onRecoverImportJobs = vi.fn();
    render(
      <ImportPanel
        importTasks={[
          {
            id: "job-78",
            label: "stuck.csv",
            kind: "file",
            status: "running",
            progress: 40,
            summary: "处理中",
            error: null,
            retryable: false,
            createdAt: 1780222920000,
            jobId: 78
          },
          {
            id: "job-79",
            label: "queued.csv",
            kind: "file",
            status: "queued",
            progress: 0,
            summary: null,
            error: null,
            retryable: false,
            createdAt: 1780222921000,
            jobId: 79
          }
        ]}
        onRecoverImportJobs={onRecoverImportJobs}
        sourceSummaries={[{ source_kind: "table", count: 1 }]}
      />
    );

    const queue = screen.getByRole("list", { name: "处理队列" });
    const queueItems = within(queue).getAllByRole("listitem");
    expect(queueItems[0]).toHaveTextContent("恢复导入任务");
    expect(queueItems[0]).toHaveTextContent("2 个可恢复任务");
    expect(within(queueItems[0]).getByText("推荐")).toBeInTheDocument();

    fireEvent.click(within(queue).getByRole("button", { name: "恢复导入任务: 恢复卡住任务" }));

    expect(onRecoverImportJobs).toHaveBeenCalledTimes(1);
  });

  it("disables recover actions while import job recovery is running", () => {
    render(
      <ImportPanel
        importTasks={[
          {
            id: "job-78",
            label: "stuck.csv",
            kind: "file",
            status: "running",
            progress: 40,
            summary: "处理中",
            error: null,
            retryable: false,
            createdAt: 1780222920000,
            jobId: 78
          }
        ]}
        isRecoveringImportJobs
        sourceSummaries={[{ source_kind: "table", count: 1 }]}
      />
    );

    expect(screen.getByRole("button", { name: "恢复卡住任务" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "恢复导入任务: 恢复卡住任务" })
    ).toBeDisabled();
  });

  it("hides the recover action when import jobs are already terminal", () => {
    render(
      <ImportPanel
        importTasks={[
          {
            id: "job-91",
            label: "done.csv",
            kind: "file",
            status: "succeeded",
            progress: 100,
            summary: "导入完成。",
            error: null,
            retryable: false,
            createdAt: 1780222920000,
            jobId: 91
          }
        ]}
        sourceSummaries={[{ source_kind: "table", count: 1 }]}
      />
    );

    expect(screen.queryByRole("button", { name: "恢复卡住任务" })).not.toBeInTheDocument();
  });

  it("shows a healthy import state when imported data has no attention items", () => {
    render(
      <ImportPanel
        dataStats={{
          tableCount: 1,
          fieldCount: 4,
          suggestionCount: 0,
          pendingSuggestionCount: 0,
          graphNodeCount: 5,
          graphEdgeCount: 4
        }}
        importTasks={[
          {
            id: "task-succeeded",
            label: "customers.csv",
            kind: "file",
            status: "succeeded",
            progress: 100,
            summary: "导入完成。",
            error: null,
            retryable: false,
            createdAt: 1780222920000
          }
        ]}
        sourceSummaries={[{ source_kind: "table", count: 1 }]}
      />
    );

    const health = screen.getByRole("region", { name: "导入健康度" });

    expect(within(health).getByText("健康")).toBeInTheDocument();
    expect(within(health).getByText("1 类来源")).toBeInTheDocument();
    expect(within(health).getByText("0 个失败项")).toBeInTheDocument();
  });

  it("shows import completion guidance for the next product workflow step", () => {
    render(
      <ImportPanel
        dataStats={{
          tableCount: 2,
          fieldCount: 8,
          suggestionCount: 3,
          pendingSuggestionCount: 2,
          graphNodeCount: 12,
          graphEdgeCount: 10
        }}
        importTasks={[
          {
            id: "task-succeeded",
            label: "orders.csv",
            kind: "file",
            status: "succeeded",
            progress: 100,
            summary: "导入完成。",
            error: null,
            retryable: false,
            createdAt: 1780222920000
          }
        ]}
        relationshipCandidates={relationshipCandidates}
        sourceSummaries={[{ source_kind: "table", count: 2 }]}
      />
    );

    const guidance = screen.getByRole("region", { name: "导入完成指引" });

    expect(within(guidance).getByText("导入完成，下一步确认 2 条关系")).toBeInTheDocument();
    expect(within(guidance).getByRole("button", { name: "查看待确认关系" })).toBeInTheDocument();
  });

  it("shows a waiting health state before import signals exist", () => {
    render(<ImportPanel />);

    const health = screen.getByRole("region", { name: "导入健康度" });

    expect(within(health).getByText("等待导入")).toBeInTheDocument();
    expect(within(health).getByText("0 类来源")).toBeInTheDocument();
  });

  it("renders a compact modeling wizard with current import progress", () => {
    render(
      <ImportPanel
        dataStats={{
          tableCount: 1,
          fieldCount: 2,
          suggestionCount: 3,
          pendingSuggestionCount: 2,
          graphNodeCount: 5,
          graphEdgeCount: 4
        }}
        dataSummary="1 张表 · 2 个字段 · 3 条建议"
        importStatus="导入完成：1 个工作表，2 个字段，3 条建议。"
      />
    );

    expect(screen.getByRole("heading", { name: "数据导入" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "导入建模向导" })).toBeInTheDocument();
    expect(screen.getByText("上传数据")).toBeInTheDocument();
    expect(screen.getByText("字段识别")).toBeInTheDocument();
    expect(screen.getByText("候选关系")).toBeInTheDocument();
    expect(screen.getByText("人工确认")).toBeInTheDocument();
    expect(screen.getByText("生成图谱")).toBeInTheDocument();

    const metrics = screen.getByRole("region", { name: "导入结果摘要" });
    expect(within(metrics).getByText("1 张表")).toBeInTheDocument();
    expect(within(metrics).getByText("2 个字段")).toBeInTheDocument();
    expect(within(metrics).getByText("3 条候选关系")).toBeInTheDocument();
    expect(within(metrics).getByText("2 条待确认")).toBeInTheDocument();
    expect(screen.getByText("导入完成：1 个工作表，2 个字段，3 条建议。")).toBeInTheDocument();
    expect(screen.getByText("1 张表 · 2 个字段 · 3 条建议")).toBeInTheDocument();
  });

  it("keeps upload, sample, and reset actions available inside the wizard", () => {
    const onImport = vi.fn();
    const onImportSample = vi.fn();
    const onResetData = vi.fn();
    render(
      <ImportPanel
        onImport={onImport}
        onImportSample={onImportSample}
        onResetData={onResetData}
      />
    );

    const file = new File(["id,name\n1,Alice"], "customers.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志"), {
      target: { files: [file] }
    });
    fireEvent.click(screen.getByRole("button", { name: "导入示例数据" }));
    fireEvent.click(screen.getByRole("button", { name: "重置当前项目数据" }));

    expect(onImport).toHaveBeenCalledWith(file);
    expect(onImportSample).toHaveBeenCalledTimes(1);
    expect(onResetData).toHaveBeenCalledTimes(1);
  });

  it("accepts multiple structured files for batch import", () => {
    const onImportBatch = vi.fn();
    render(<ImportPanel onImportBatch={onImportBatch} />);

    const files = [
      new File(["id,name\nc1,Acme"], "customers.csv", { type: "text/csv" }),
      new File(['[{"order_id":"o1"}]'], "orders.json", { type: "application/json" })
    ];

    fireEvent.change(screen.getByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志"), {
      target: { files }
    });

    expect(onImportBatch).toHaveBeenCalledWith(files);
  });

  it("accepts zipped code repositories", () => {
    render(<ImportPanel />);

    expect(screen.getByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志")).toHaveAttribute(
      "accept",
      expect.stringContaining(".zip")
    );
  });

  it("routes a single zipped repository through batch import", () => {
    const onImport = vi.fn();
    const onImportBatch = vi.fn();
    render(<ImportPanel onImport={onImport} onImportBatch={onImportBatch} />);

    const file = new File(["zip-bytes"], "repo.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("拖入 CSV、Excel、JSON、文档、代码或日志"), {
      target: { files: [file] }
    });

    expect(onImport).not.toHaveBeenCalled();
    expect(onImportBatch).toHaveBeenCalledWith([file]);
  });

  it("shows source summary counts", () => {
    render(
      <ImportPanel
        sourceSummaries={[
          { source_kind: "table", count: 2 },
          { source_kind: "json", count: 1 }
        ]}
      />
    );

    expect(screen.getByText("来源概览")).toBeInTheDocument();
    expect(screen.getByText("table · 2")).toBeInTheDocument();
    expect(screen.getByText("json · 1")).toBeInTheDocument();
  });

  it("lets users confirm field profiles and adjust inferred types locally", () => {
    render(
      <ImportPanel
        dataStats={{
          tableCount: 1,
          fieldCount: 2,
          suggestionCount: 1,
          pendingSuggestionCount: 1,
          graphNodeCount: 3,
          graphEdgeCount: 2
        }}
        fieldProfiles={fieldProfiles}
      />
    );

    const mapping = screen.getByRole("region", { name: "字段映射与类型确认" });
    expect(within(mapping).getByText("Orders.customer_id")).toBeInTheDocument();
    expect(within(mapping).getByText("Orders.amount")).toBeInTheDocument();
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

  it("lets users tune relationship candidates before review", () => {
    const onConfirmRelationship = vi.fn();
    render(
      <ImportPanel
        dataStats={{
          tableCount: 2,
          fieldCount: 4,
          suggestionCount: 1,
          pendingSuggestionCount: 1,
          graphNodeCount: 6,
          graphEdgeCount: 5
        }}
        onConfirmRelationship={onConfirmRelationship}
        relationshipCandidates={relationshipCandidates}
      />
    );

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
    const onConfirmRelationship = vi.fn();
    render(
      <ImportPanel
        dataStats={{
          tableCount: 2,
          fieldCount: 4,
          suggestionCount: 3,
          pendingSuggestionCount: 3,
          graphNodeCount: 6,
          graphEdgeCount: 5
        }}
        onConfirmRelationship={onConfirmRelationship}
        relationshipCandidates={mergeableRelationshipCandidates}
      />
    );

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

  it("shows import task progress, errors, and retry actions", () => {
    const onRetryImportTask = vi.fn();
    const onRetryImportItem = vi.fn();
    render(
      <ImportPanel
        importTasks={[
          {
            id: "task-running",
            label: "orders.csv",
            kind: "file",
            status: "running",
            progress: 35,
            summary: "正在解析字段画像。",
            error: null,
            retryable: false,
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
              },
              {
                name: "indexed",
                status: "complete",
                progress: 100,
                summary: "Indexed evidence"
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
        ]}
        onRetryImportItem={onRetryImportItem}
        onRetryImportTask={onRetryImportTask}
      />
    );

    const tasks = screen.getByRole("region", { name: "导入任务" });
    expect(within(tasks).getByText("orders.csv")).toBeInTheDocument();
    expect(within(tasks).getByText("处理中")).toBeInTheDocument();
    expect(within(tasks).getByText("35%")).toBeInTheDocument();
    expect(within(tasks).getByText("正在解析字段画像。")).toBeInTheDocument();
    expect(within(tasks).getByText("已暂存")).toBeInTheDocument();
    expect(within(tasks).getByText("Saved upload")).toBeInTheDocument();
    expect(within(tasks).getByText("已解析")).toBeInTheDocument();
    expect(within(tasks).getByText("Read 2 sheets")).toBeInTheDocument();
    expect(within(tasks).getByText("已索引")).toBeInTheDocument();
    expect(within(tasks).getByText("Indexed evidence")).toBeInTheDocument();
    expect(within(tasks).getByText("customers.csv")).toBeInTheDocument();
    expect(within(tasks).getByText("失败")).toBeInTheDocument();
    expect(within(tasks).getByText("错误明细")).toBeInTheDocument();
    expect(within(tasks).getByText("Import file failed: 500")).toBeInTheDocument();
    expect(within(tasks).getByText("2 个文件批量导入")).toBeInTheDocument();
    expect(within(tasks).getByText("部分完成")).toBeInTheDocument();
    expect(within(tasks).getByText("1 个文件完成，1 个文件失败。")).toBeInTheDocument();
    expect(within(tasks).getByText("broken.json · 失败")).toBeInTheDocument();
    expect(within(tasks).getByText("Unexpected token")).toBeInTheDocument();

    fireEvent.click(within(tasks).getByRole("button", { name: "重试任务 customers.csv" }));
    fireEvent.click(within(tasks).getByRole("button", { name: "重试文件 broken.json" }));

    expect(onRetryImportTask).toHaveBeenCalledWith("task-failed");
    expect(onRetryImportItem).toHaveBeenCalledWith("task-partial", 19);
  });

  it("shows actionable recovery playbooks for failed imports and URL safety rejection", () => {
    render(
      <ImportPanel
        importTasks={[
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
            id: "task-url",
            label: "URL 来源：https://internal.example/docs",
            kind: "url",
            status: "failed",
            progress: 100,
            summary: null,
            error: "URL safety rejected host",
            retryable: false,
            createdAt: 1780222920000,
            diagnostics: {
              safety_reason: "host_not_allowlisted",
              requested_host: "internal.example"
            }
          }
        ]}
      />
    );

    const tasks = screen.getByRole("region", { name: "导入任务" });
    expect(within(tasks).getAllByText("恢复建议")).toHaveLength(2);
    expect(within(tasks).getByText("检查文件格式和表头，再重试该导入项。")).toBeInTheDocument();
    expect(within(tasks).getByText("如果是临时服务错误，刷新任务或重新上传。")).toBeInTheDocument();
    expect(within(tasks).getByText("URL 被安全策略拦截。")).toBeInTheDocument();
    expect(within(tasks).getByText("确认域名已加入 URL 导入允许列表。")).toBeInTheDocument();
    expect(within(tasks).getByText("避免内网地址、凭据 URL 或非 HTTP(S) 协议。")).toBeInTheDocument();
  });

  it("surfaces searchable guided repair help for import and quality workflows", () => {
    render(
      <ImportPanel
        dataStats={{
          tableCount: 1,
          fieldCount: 4,
          suggestionCount: 2,
          pendingSuggestionCount: 1,
          graphNodeCount: 5,
          graphEdgeCount: 3
        }}
        importTasks={[
          {
            id: "task-failed-url",
            label: "docs.example.com",
            kind: "url",
            status: "failed",
            progress: 100,
            summary: null,
            error: "URL port is not allowed",
            retryable: true,
            createdAt: 1780222920000,
            errorCode: "URL_IMPORT_FAILED",
            recoveryAction: "Use a public HTTP or HTTPS URL.",
            diagnostics: { safety_reason: "port_not_allowed" }
          }
        ]}
        relationshipCandidates={highPriorityRelationshipCandidates}
        relationshipGovernance={relationshipGovernance}
      />
    );

    const help = screen.getByRole("region", { name: "帮助与修复" });
    expect(within(help).getByText("失败导入")).toBeInTheDocument();
    expect(within(help).getByText("URL 安全校验")).toBeInTheDocument();
    expect(within(help).getByText("质量治理")).toBeInTheDocument();

    fireEvent.change(within(help).getByRole("searchbox", { name: "搜索帮助主题" }), {
      target: { value: "allowlist" }
    });

    expect(within(help).getByText("URL 安全校验")).toBeInTheDocument();
    expect(within(help).getByText("确认允许域名已加入 GRAPHMIND_URL_IMPORT_ALLOWLIST。")).toBeInTheDocument();
    expect(within(help).queryByText("质量治理")).not.toBeInTheDocument();
  });

  it("routes guided repair help actions into existing safe workflows", () => {
    const onOpenFailedImports = vi.fn();
    const onOpenPendingReview = vi.fn();
    render(
      <ImportPanel
        dataStats={{
          tableCount: 1,
          fieldCount: 4,
          suggestionCount: 2,
          pendingSuggestionCount: 1,
          graphNodeCount: 5,
          graphEdgeCount: 3
        }}
        importTasks={[
          {
            id: "task-failed",
            label: "customers.csv",
            kind: "file",
            status: "failed",
            progress: 100,
            summary: null,
            error: "Import file failed",
            retryable: true,
            createdAt: 1780222920000
          }
        ]}
        onOpenFailedImports={onOpenFailedImports}
        onOpenPendingReview={onOpenPendingReview}
        relationshipCandidates={highPriorityRelationshipCandidates}
        relationshipGovernance={relationshipGovernance}
      />
    );

    const help = screen.getByRole("region", { name: "帮助与修复" });

    fireEvent.click(within(help).getByRole("button", { name: "帮助：查看失败导入项" }));
    expect(onOpenFailedImports).toHaveBeenCalledWith({
      failedTaskCount: 1,
      taskLabel: "customers.csv"
    });

    fireEvent.click(within(help).getByRole("button", { name: "帮助：打开待审核队列" }));
    expect(onOpenPendingReview).toHaveBeenCalledTimes(1);
  });

  it("focuses the URL field from guided URL safety help", () => {
    render(
      <ImportPanel
        importTasks={[
          {
            id: "task-failed-url",
            label: "docs.example.com",
            kind: "url",
            status: "failed",
            progress: 100,
            summary: null,
            error: "URL host is not in the configured allowlist",
            retryable: true,
            createdAt: 1780222920000,
            diagnostics: { safety_reason: "host_not_allowlisted" }
          }
        ]}
      />
    );

    const help = screen.getByRole("region", { name: "帮助与修复" });
    fireEvent.click(within(help).getByRole("button", { name: "帮助：填写 URL" }));

    expect(screen.getByRole("textbox", { name: "URL 来源" })).toHaveFocus();
  });

  it("routes first-graph preset help to AI settings without mutating import flows", () => {
    const onImport = vi.fn();
    const onImportSample = vi.fn();
    const onOpenAISettings = vi.fn();
    render(
      <ImportPanel
        onImport={onImport}
        onImportSample={onImportSample}
        onOpenAISettings={onOpenAISettings}
      />
    );

    const help = screen.getByRole("region", { name: "帮助与修复" });
    fireEvent.click(within(help).getByRole("button", { name: "帮助：打开 AI 和向量设置" }));

    expect(onOpenAISettings).toHaveBeenCalledTimes(1);
    expect(onImport).not.toHaveBeenCalled();
    expect(onImportSample).not.toHaveBeenCalled();
  });

  it("localizes the wizard in English when requested", () => {
    render(
      <I18nProvider initialLanguage="en-US">
        <ImportPanel
          dataStats={{
            tableCount: 2,
            fieldCount: 8,
            suggestionCount: 4,
            pendingSuggestionCount: 1,
            graphNodeCount: 10,
            graphEdgeCount: 12
          }}
        />
      </I18nProvider>
    );

    expect(screen.getByRole("list", { name: "Import modeling wizard" })).toBeInTheDocument();
    expect(screen.getByText("Upload data")).toBeInTheDocument();
    expect(screen.getByText("Field profiling")).toBeInTheDocument();
    expect(screen.getByText("Relationship candidates")).toBeInTheDocument();
    expect(screen.getByText("Human confirmation")).toBeInTheDocument();
    expect(screen.getByText("Generate graph")).toBeInTheDocument();
    expect(screen.getByText("4 candidates")).toBeInTheDocument();
  });
});
