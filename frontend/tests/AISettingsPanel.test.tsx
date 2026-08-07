import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectSettings } from "../src/api/types";
import AISettingsPanel from "../src/components/workbench/AISettingsPanel";

const settings: ProjectSettings = {
  ai: {
    chat: {
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
      base_url: "https://api.example.com/v1",
      api_key: "sk-chat-secret",
      temperature: 0.2
    },
    vector: {
      provider: "ollama",
      model: "nomic-embed-text",
      base_url: "http://localhost:11434",
      api_key: "sk-vector-secret",
      dimensions: 768,
      index_status: "ready",
      document_count: 42,
      last_built_at: "2026-06-10T12:00:00.000Z",
      embedding_model: "nomic-embed-text"
    }
  },
  review_analytics: {
    retention_days: 90,
    auto_cleanup_enabled: true
  }
};

describe("AISettingsPanel", () => {
  it("keeps the dialog open and reports a failed asynchronous save", async () => {
    let rejectSave!: (error: Error) => void;
    const saveRequest = new Promise<void>((_resolve, reject) => {
      rejectSave = reject;
    });
    const onSave = vi.fn(() => saveRequest);
    render(<AISettingsPanel settings={settings} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

    expect(screen.getByRole("button", { name: "正在保存..." })).toBeDisabled();
    expect(
      screen.getByRole("dialog", { name: "AI 和向量设置" }).querySelector("form")
    ).toHaveAttribute("aria-busy", "true");
    await act(async () => {
      rejectSave(new Error("Settings service unavailable"));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Settings service unavailable");
    expect(screen.getByRole("dialog", { name: "AI 和向量设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存设置" })).toBeEnabled();
  });

  it("explains the review analytics cleanup execution mode", () => {
    render(
      <AISettingsPanel
        settings={{
          ...settings,
          review_analytics: {
            retention_days: 90,
            auto_cleanup_enabled: false
          }
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(
      screen.getByText("自动清理关闭：仍可在 SLA 趋势分析中手动清理过期快照。")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("请求时自动清理过期快照"));

    expect(
      screen.getByText("自动清理开启：下次加载或刷新趋势数据时会检查并清理过期快照。")
    ).toBeInTheDocument();
  });

  it("exports a reusable project preset without API keys", async () => {
    let exportedBlob: Blob | null = null;
    const createObjectURL = vi.fn((blob: Blob) => {
      exportedBlob = blob;
      return "blob:graphmind-project-preset";
    });
    const revokeObjectURL = vi.fn();
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<AISettingsPanel settings={settings} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "导出项目预设" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    if (!exportedBlob) {
      throw new Error("Expected project preset export to create a Blob");
    }
    const rawPreset = await readBlobText(exportedBlob);
    const preset = JSON.parse(rawPreset);

    expect(preset.schema).toBe("graphmind.project-preset.v1");
    expect(preset.settings.ai.chat).toEqual({
      baseUrl: "https://api.example.com/v1",
      model: "gpt-4.1-mini",
      provider: "openai-compatible",
      temperature: 0.2
    });
    expect(preset.settings.ai.vector).toEqual({
      baseUrl: "http://localhost:11434",
      dimensions: 768,
      model: "nomic-embed-text",
      provider: "ollama"
    });
    expect(preset.settings.reviewAnalytics).toEqual({
      autoCleanupEnabled: true,
      retentionDays: 90
    });
    expect(rawPreset).not.toContain("sk-chat-secret");
    expect(rawPreset).not.toContain("sk-vector-secret");
    expect(rawPreset).not.toContain("api_key");
    expect(rawPreset).not.toContain("apiKey");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:graphmind-project-preset");
  });

  it("imports a project preset into the settings draft without replacing API keys", async () => {
    const onSave = vi.fn();
    render(<AISettingsPanel settings={settings} onClose={vi.fn()} onSave={onSave} />);
    const preset = {
      schema: "graphmind.project-preset.v1",
      exportedAt: "2026-06-11T12:00:00.000Z",
      settings: {
        ai: {
          chat: {
            baseUrl: "https://preset.example.com/v1",
            model: "gpt-4.1",
            provider: "openrouter",
            temperature: 0.4
          },
          vector: {
            baseUrl: "https://vectors.example.com/v1",
            dimensions: 1536,
            model: "text-embedding-3-small",
            provider: "openai-compatible"
          }
        },
        reviewAnalytics: {
          autoCleanupEnabled: false,
          retentionDays: 180
        }
      }
    };
    const file = new File([JSON.stringify(preset)], "preset.json", {
      type: "application/json"
    });

    fireEvent.change(screen.getByLabelText("导入项目预设"), {
      target: { files: [file] }
    });

    expect(await screen.findByText("预设已读取：OpenRouter · gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("向量：OpenAI Compatible · text-embedding-3-small · 1536 维")).toBeInTheDocument();
    expect(screen.getByText("审核分析：保留 180 天 · 手动清理")).toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toHaveValue("sk-chat-secret");
    expect(screen.getByLabelText("向量 API Key")).toHaveValue("sk-vector-secret");

    fireEvent.click(screen.getByRole("button", { name: "应用预设到草稿" }));

    expect(screen.getByLabelText("对话模型提供方")).toHaveValue("openrouter");
    expect(screen.getByLabelText("对话模型名称")).toHaveValue("gpt-4.1");
    expect(screen.getByLabelText("对话 Base URL")).toHaveValue("https://preset.example.com/v1");
    expect(screen.getByLabelText("向量模型提供方")).toHaveValue("openai-compatible");
    expect(screen.getByLabelText("向量模型名称")).toHaveValue("text-embedding-3-small");
    expect(screen.getByLabelText("向量 Base URL")).toHaveValue("https://vectors.example.com/v1");
    expect(screen.getByLabelText("向量维度")).toHaveValue(1536);
    expect(screen.getByLabelText("快照默认保留周期")).toHaveValue("180");
    expect(screen.getByLabelText("请求时自动清理过期快照")).not.toBeChecked();
    expect(screen.getByLabelText("API Key")).toHaveValue("sk-chat-secret");
    expect(screen.getByLabelText("向量 API Key")).toHaveValue("sk-vector-secret");
    expect(onSave).not.toHaveBeenCalled();
  });
});

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
