import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatSelectionContext, ProjectSettings } from "../src/api/types";
import ChatPanel from "../src/components/ChatPanel";

const defaultSettings: ProjectSettings = {
  ai: {
    chat: {
      provider: "rules",
      model: "graphmind-rules",
      base_url: "",
      api_key: "",
      temperature: 0.1
    },
    vector: {
      provider: "none",
      model: "",
      base_url: "",
      api_key: "",
      dimensions: 0,
      index_status: "not_built",
      document_count: 0,
      last_built_at: null,
      embedding_model: ""
    }
  },
  review_analytics: {
    retention_days: 30,
    auto_cleanup_enabled: false
  }
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChatPanel", () => {
  it("serializes questions while an answer is pending", async () => {
    let resolveQuestion!: () => void;
    const onAsk = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveQuestion = resolve;
        })
    );
    render(<ChatPanel messages={[]} onAsk={onAsk} settings={defaultSettings} />);

    fireEvent.change(screen.getByLabelText("询问数据关系"), {
      target: { value: "First question" }
    });
    fireEvent.click(screen.getByRole("button", { name: "询问 AI" }));

    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "询问 AI" })).toBeDisabled();
    expect(screen.getByLabelText("询问数据关系")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "哪些字段可能有关联？" }));
    expect(onAsk).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveQuestion();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "询问 AI" })).toBeEnabled();
    });
  });

  it("shows selected context and opens retrieved evidence", () => {
    const onEvidenceClick = vi.fn();
    const selectionContext: ChatSelectionContext = { kind: "node", id: 2 };
    render(
      <ChatPanel
        activeSelectionContext={selectionContext}
        activeSelectionLabel="Orders.customer_id"
        messages={[
          {
            role: "assistant",
            content: "Orders.customer_id 可以关联 Customers.id。",
            retrieved_evidence: [
              {
                label: "Orders.customer_id -> Customers.id",
                kind: "graph_edge",
                source_ref: "suggestion:12",
                score: 3.2,
                excerpt: "Customer IDs overlap across all sampled rows."
              }
            ]
          }
        ]}
        onAsk={vi.fn()}
        onEvidenceClick={onEvidenceClick}
        settings={defaultSettings}
      />
    );

    expect(screen.getByText("当前上下文")).toBeInTheDocument();
    expect(screen.getByText("节点 · Orders.customer_id")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "查看证据 Orders.customer_id -> Customers.id" })
    );
    expect(onEvidenceClick).toHaveBeenCalledWith({
      label: "Orders.customer_id -> Customers.id",
      kind: "graph_edge",
      source_ref: "suggestion:12",
      score: 3.2,
      excerpt: "Customer IDs overlap across all sampled rows."
    });
  });

  it("submits a question and renders an answer", () => {
    const onAsk = vi.fn();
    const onCitationClick = vi.fn();
    render(
      <ChatPanel
        settings={defaultSettings}
        messages={[
          {
            role: "assistant",
            content: "Orders contains order_id and amount.",
            citations: [{ label: "Orders.order_id", source_ref: "orders.order_id" }],
            answer_confidence: "high",
            highlighted_graph_path: [100],
            retrieved_evidence: [
              {
                label: "Orders.customer_id -> Customers.id",
                kind: "graph_edge",
                source_ref: "suggestion:12",
                score: 3.2,
                excerpt: "Customer IDs overlap across all sampled rows."
              }
            ]
          }
        ]}
        onCitationClick={onCitationClick}
        onAsk={onAsk}
      />
    );

    expect(screen.getByText("可追溯回答")).toBeInTheDocument();
    expect(screen.getByText("图谱路径：1 个项目")).toBeInTheDocument();
    expect(screen.getByText("检索证据")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看证据 Orders.order_id" })).toBeInTheDocument();
    expect(screen.getByText("Orders.customer_id -> Customers.id")).toBeInTheDocument();
    expect(screen.getByText("graph_edge · suggestion:12 · 3.20")).toBeInTheDocument();
    expect(screen.getByText("Customer IDs overlap across all sampled rows.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("询问数据关系"), {
      target: { value: "What fields are in Orders?" }
    });
    fireEvent.click(screen.getByRole("button", { name: "询问 AI" }));

    expect(onAsk).toHaveBeenCalledWith("What fields are in Orders?");
    expect(screen.getByText("Orders contains order_id and amount.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看引用 Orders.order_id" }));
    expect(onCitationClick).toHaveBeenCalledWith({
      label: "Orders.order_id",
      source_ref: "orders.order_id"
    });
  });

  it("renders repeated citations and next steps without duplicate React keys", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ChatPanel
        settings={defaultSettings}
        messages={[
          {
            role: "assistant",
            content: "Customers.customer_id appears in multiple evidence slices.",
            citations: [
              { label: "Customers.customer_id", source_ref: "Customers.customer_id" },
              { label: "Customers.customer_id", source_ref: "Customers.customer_id" }
            ],
            retrieved_evidence: [
              {
                label: "Customers.customer_id",
                kind: "field",
                source_ref: "Customers.customer_id",
                score: 1,
                excerpt: "First matching evidence."
              },
              {
                label: "Customers.customer_id",
                kind: "field",
                source_ref: "Customers.customer_id",
                score: 0.8,
                excerpt: "Second matching evidence."
              }
            ],
            graph_actions: [
              {
                id: "inspect-duplicates",
                type: "open_evidence",
                label: "检查重复字段",
                description: "Open repeated evidence.",
                node_ids: [],
                edge_ids: [],
                suggestion_ids: [],
                evidence_refs: [],
                metadata: {}
              }
            ],
            next_steps: ["检查重复字段。", "检查重复字段。"]
          }
        ]}
        onAsk={vi.fn()}
      />
    );

    expect(screen.getAllByRole("button", { name: "查看引用 Customers.customer_id" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "查看证据 Customers.customer_id" })).toHaveLength(4);
    expect(screen.getAllByText("检查重复字段。")).toHaveLength(2);
    const duplicateKeyWarning = consoleError.mock.calls.some((call) =>
      call.some((arg) => String(arg).includes("Encountered two children with the same key"))
    );
    expect(duplicateKeyWarning).toBe(false);
  });

  it("renders graph action buttons from assistant answers", () => {
    const onGraphAction = vi.fn();
    const onClearGraphAction = vi.fn();
    const action = {
      id: "highlight-path",
      type: "highlight_path",
      label: "高亮图谱路径",
      description: "在图谱中高亮回答涉及的字段和关系。",
      node_ids: [2, 3],
      edge_ids: [11],
      suggestion_ids: [8],
      evidence_refs: ["suggestion:8"],
      metadata: {}
    };

    render(
      <ChatPanel
        messages={[
          {
            role: "assistant",
            content: "Orders.customer_id 可以关联 Customers.customer_id。",
            graph_actions: [action],
            next_steps: ["打开证据检查器核对引用关系。"]
          }
        ]}
        onAsk={vi.fn()}
        onClearGraphAction={onClearGraphAction}
        onGraphAction={onGraphAction}
        graphActionStates={{
          "missing-target": {
            actionId: "missing-target",
            status: "failed",
            message: "当前图谱中找不到动作目标。"
          },
          "open-evidence": {
            actionId: "open-evidence",
            status: "executed",
            message: "已打开证据。"
          }
        }}
        settings={defaultSettings}
      />
    );

    expect(screen.getByText("图谱动作")).toBeInTheDocument();
    expect(screen.getByText("2 节点 · 1 关系 · 1 建议 · 1 证据")).toBeInTheDocument();
    expect(screen.getByText("未执行")).toBeInTheDocument();
    expect(screen.getByText("打开证据检查器核对引用关系。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "执行图谱动作 高亮图谱路径" }));

    expect(onGraphAction).toHaveBeenCalledWith(action);
    expect(onClearGraphAction).not.toHaveBeenCalled();
  });

  it("renders action execution state, failure reason, and clear highlight controls", () => {
    const onGraphAction = vi.fn();
    const onClearGraphAction = vi.fn();
    const openEvidenceAction = {
      id: "open-evidence",
      type: "open_evidence",
      label: "打开证据",
      description: "打开回答引用的关系证据。",
      node_ids: [2, 3],
      edge_ids: [11],
      suggestion_ids: [8],
      evidence_refs: ["suggestion:8"],
      metadata: {}
    };
    const missingAction = {
      id: "missing-target",
      type: "open_evidence",
      label: "打开缺失证据",
      description: "尝试打开当前图谱中不存在的证据。",
      node_ids: [404],
      edge_ids: [999],
      suggestion_ids: [],
      evidence_refs: [],
      metadata: {}
    };

    render(
      <ChatPanel
        graphActionStates={{
          "open-evidence": {
            actionId: "open-evidence",
            status: "executed",
            message: "已打开证据。"
          },
          "missing-target": {
            actionId: "missing-target",
            status: "failed",
            message: "当前图谱中找不到动作目标。"
          }
        }}
        messages={[
          {
            role: "assistant",
            content: "可以继续检查证据。",
            graph_actions: [openEvidenceAction, missingAction]
          }
        ]}
        onAsk={vi.fn()}
        onClearGraphAction={onClearGraphAction}
        onGraphAction={onGraphAction}
        settings={defaultSettings}
      />
    );

    expect(screen.getByText("已执行")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("当前图谱中找不到动作目标。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清除图谱动作 打开证据" }));

    expect(onClearGraphAction).toHaveBeenCalledWith(openEvidenceAction);
    expect(onGraphAction).not.toHaveBeenCalled();
  });

  it("renders graph action activity timeline and clears it", () => {
    const onClearGraphActionActivities = vi.fn();
    render(
      <ChatPanel
        graphActionActivities={[
          {
            id: "activity-1",
            actionId: "highlight-path",
            label: "高亮图谱路径",
            status: "executed",
            message: "已执行动作。",
            createdAt: 1780217460000,
            targetPreview: {
              nodeCount: 7,
              edgeCount: 0,
              suggestionCount: 6,
              evidenceCount: 0
            }
          },
          {
            id: "activity-2",
            actionId: "missing-target",
            label: "打开缺失证据",
            status: "failed",
            message: "当前图谱中找不到动作目标。",
            createdAt: 1780217461000,
            targetPreview: {
              nodeCount: 1,
              edgeCount: 1,
              suggestionCount: 0,
              evidenceCount: 0
            }
          }
        ]}
        messages={[]}
        onAsk={vi.fn()}
        onClearGraphActionActivities={onClearGraphActionActivities}
        settings={defaultSettings}
      />
    );

    expect(screen.getByText("AI 分析活动")).toBeInTheDocument();
    expect(screen.getByText("高亮图谱路径")).toBeInTheDocument();
    expect(screen.getByText("打开缺失证据")).toBeInTheDocument();
    expect(screen.getByText("已执行")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("7 节点 · 0 关系 · 6 建议 · 0 证据")).toBeInTheDocument();
    expect(screen.getByText("当前图谱中找不到动作目标。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清空 AI 分析活动" }));

    expect(onClearGraphActionActivities).toHaveBeenCalledTimes(1);
  });

  it("does not render graph action activity timeline when it is empty", () => {
    render(
      <ChatPanel
        graphActionActivities={[]}
        messages={[]}
        onAsk={vi.fn()}
        settings={defaultSettings}
      />
    );

    expect(screen.queryByText("AI 分析活动")).not.toBeInTheDocument();
  });

  it("shows guided question suggestions before the first answer", () => {
    const onAsk = vi.fn();
    render(<ChatPanel messages={[]} onAsk={onAsk} settings={defaultSettings} />);

    expect(screen.getByText("从一个关系问题开始")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "哪些字段可能有关联？" }));

    expect(onAsk).toHaveBeenCalledWith("哪些字段可能有关联？");
  });

  it("shows AI and vector status and saves edited settings", () => {
    const onSettingsChange = vi.fn();
    render(
      <ChatPanel
        messages={[]}
        onAsk={vi.fn()}
        onBuildVectorIndex={vi.fn()}
        onSettingsChange={onSettingsChange}
        settings={defaultSettings}
      />
    );

    expect(screen.getByLabelText("AI 和向量状态")).toBeInTheDocument();
    expect(screen.getByLabelText("AI 状态操作")).toBeInTheDocument();
    expect(screen.getByText("规则问答")).toBeInTheDocument();
    expect(screen.getByText("未配置")).toBeInTheDocument();
    expect(screen.getByText("未构建")).toBeInTheDocument();
    expect(
      screen.getByText("当前使用规则问答模式：答案来自已导入图谱、关系建议和证据链。")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI 和向量设置" }));
    fireEvent.change(screen.getByLabelText("对话模型提供方"), {
      target: { value: "ollama" }
    });
    fireEvent.change(screen.getByLabelText("对话模型名称"), {
      target: { value: "llama3.2" }
    });
    fireEvent.change(screen.getByLabelText("向量模型提供方"), {
      target: { value: "ollama" }
    });
    fireEvent.change(screen.getByLabelText("向量模型名称"), {
      target: { value: "nomic-embed-text" }
    });
    fireEvent.change(screen.getByLabelText("向量 API Key"), {
      target: { value: "sk-vector" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    expect(onSettingsChange).toHaveBeenCalledWith({
      ai: {
        chat: {
          provider: "ollama",
          model: "llama3.2",
          base_url: "",
          api_key: "",
          temperature: 0.1
        },
        vector: {
          provider: "ollama",
          model: "nomic-embed-text",
          base_url: "",
          api_key: "sk-vector",
          dimensions: 0,
          index_status: "not_built",
          document_count: 0,
          last_built_at: null,
          embedding_model: ""
        }
      },
      review_analytics: {
        retention_days: 30,
        auto_cleanup_enabled: false
      }
    });
  });

  it("saves review analytics retention settings", () => {
    const onSettingsChange = vi.fn();
    render(
      <ChatPanel
        messages={[]}
        onAsk={vi.fn()}
        onSettingsChange={onSettingsChange}
        settings={defaultSettings}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "AI 和向量设置" }));
    fireEvent.change(screen.getByLabelText("快照默认保留周期"), {
      target: { value: "90" }
    });
    fireEvent.click(screen.getByLabelText("请求时自动清理过期快照"));
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    expect(onSettingsChange).toHaveBeenCalledWith({
      ...defaultSettings,
      review_analytics: {
        retention_days: 90,
        auto_cleanup_enabled: true
      }
    });
  });

  it("opens settings with default retention values for legacy settings", () => {
    const legacySettings = {
      ai: defaultSettings.ai
    } as ProjectSettings;
    render(<ChatPanel messages={[]} onAsk={vi.fn()} settings={legacySettings} />);

    fireEvent.click(screen.getByRole("button", { name: "AI 和向量设置" }));

    expect(screen.getByLabelText("快照默认保留周期")).toHaveValue("30");
    expect(screen.getByLabelText("请求时自动清理过期快照")).not.toBeChecked();
  });

  it("builds the local evidence index from the AI status strip", () => {
    const onBuildVectorIndex = vi.fn();
    render(
      <ChatPanel
        messages={[]}
        onAsk={vi.fn()}
        onBuildVectorIndex={onBuildVectorIndex}
        settings={{
          ai: {
            chat: defaultSettings.ai.chat,
            vector: {
              ...defaultSettings.ai.vector,
              index_status: "ready",
              document_count: 12,
              last_built_at: "2026-05-28T12:00:00Z"
            }
          },
          review_analytics: defaultSettings.review_analytics
        }}
      />
    );

    expect(screen.getByText("12 条证据")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "构建索引" }));

    expect(onBuildVectorIndex).toHaveBeenCalledTimes(1);
  });

  it("explains configured providers attempt model execution with graph fallback", () => {
    render(
      <ChatPanel
        messages={[]}
        onAsk={vi.fn()}
        settings={{
          ai: {
            chat: {
              provider: "openai-compatible",
              model: "gpt-4.1-mini",
              base_url: "https://api.example.com/v1",
              api_key: "",
              temperature: 0.1
            },
            vector: defaultSettings.ai.vector
          },
          review_analytics: defaultSettings.review_analytics
        }}
      />
    );

    expect(
      screen.getByText("已配置模型执行；回答会优先尝试模型增强，失败时回退到可追溯图谱规则。")
    ).toBeInTheDocument();
  });
});
