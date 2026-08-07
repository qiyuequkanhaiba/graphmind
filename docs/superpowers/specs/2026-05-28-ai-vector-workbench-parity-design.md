# AI And Vector Workbench Parity Design

## Context

GraphMind is evolving from a spreadsheet-to-graph prototype into a professional relationship analysis workbench inspired by GitNexus. The current UI has three visible gaps:

- The left resource list can grow the whole page instead of scrolling inside the workbench.
- The AI chat has no model configuration, provider status, or vector model settings.
- Compared with GitNexus workbench, GraphMind lacks a settings surface, AI readiness states, and embedding/index status.

## Goals

- Keep the workbench bounded to the viewport: header, center area, and status bar stay fixed; each panel owns its own scroll.
- Add an AI and vector settings surface that is honest about the current implementation.
- Persist project-level AI and vector settings through the backend using the existing `Project.settings` JSON field.
- Show AI mode and vector index readiness in the chat panel so users know whether they are using rule-based answers or a configured model.
- Match GitNexus workbench patterns where they fit GraphMind: fixed panels, settings modal, provider readiness, and embedding status.

## Non-Goals

- This phase does not implement full LLM streaming, tool calling, or Graph RAG.
- This phase does not build a real vector index or embedding storage table.
- This phase does not transmit API keys to a third-party provider.

## GitNexus Gap Summary

GitNexus uses a fixed-height workbench with panel-local scrolling. Its left file explorer is a full-height flex column: header and search stay fixed while the tree uses `flex-1 overflow-y-auto`. GraphMind currently lets the resource tree contribute to page height.

GitNexus has a settings panel for multiple LLM providers, provider validation helpers, and visible chat readiness states. GraphMind currently has rule-based backend answers only.

GitNexus exposes embedding generation and index states in the workbench header. GraphMind needs a comparable vector status shell before full vector search is implemented.

## User Experience

### Left Panel

The left panel becomes a bounded workbench panel:

- Header is fixed inside the panel.
- Import controls remain visible at the top.
- Resource tree fills the remaining height and scrolls independently.
- Tree section headers remain compact; long row labels truncate.
- On narrow screens, the layout still stacks as today, but panel sections stay bounded.

### AI Settings

The AI tab includes a compact status strip and a settings button. Opening settings shows a modal with:

- Chat mode: `规则问答`, `OpenAI Compatible`, `Ollama`, `DeepSeek`, `OpenRouter`.
- Chat model fields: base URL, model name, API key, temperature.
- Vector model fields: provider, model name, base URL, dimensions.
- Vector index status: `未构建`, `待构建`, `构建中`, `已就绪`, `失败`.

Defaults:

- Chat provider defaults to `规则问答`.
- Vector provider defaults to `未配置`.
- UI language remains Chinese by default.

### Honest Status

When the provider is `规则问答`, the chat panel says the answer is generated from trusted graph rules. When another provider is configured, the panel says model configuration is saved, but full model execution is still pending until the future LLM integration phase. Vector status similarly shows configuration and index readiness separately.

## Backend Design

Add project settings schemas and routes:

- `GET /api/projects/{project_id}/settings`
- `PUT /api/projects/{project_id}/settings`

Settings are stored in `Project.settings`:

```json
{
  "ai": {
    "chat": {
      "provider": "rules",
      "model": "graphmind-rules",
      "base_url": "",
      "api_key": "",
      "temperature": 0.1
    },
    "vector": {
      "provider": "none",
      "model": "",
      "base_url": "",
      "dimensions": 0,
      "index_status": "not_built"
    }
  }
}
```

The route returns defaults merged with saved settings. It rejects missing projects with `404`.

## Frontend Design

Add frontend types and client functions:

- `ProjectSettings`
- `getProjectSettings(projectId)`
- `updateProjectSettings(projectId, settings)`

Update `App` to load settings with graph and relationship suggestions. Pass settings into `Workspace` and save updates from the settings modal.

Add focused components:

- `AISettingsPanel.tsx`: modal for AI and vector settings.
- `AIStatusStrip.tsx`: compact chat/provider/vector status inside the AI tab.

Update `ChatPanel` to accept `settings` and `onSettingsChange`, render the status strip, and open the settings modal.

## Layout Design

CSS changes:

- `.app-shell` uses `height: 100vh` and `overflow: hidden`.
- `.workbench-shell.pro-workbench` uses `height: 100vh`, `min-height: 0`, and `overflow: hidden`.
- `.workbench-main` uses `minmax(0, 1fr)` and `overflow: hidden`.
- `.data-explorer-panel` becomes a grid/flex column with `overflow: hidden`.
- `.resource-tree` becomes the only scrolling resource area.
- `.insight-panel` uses panel-local scrolling without growing the page.

## Testing

Frontend:

- CSS test asserts viewport-bounded workbench and resource-tree scroll rules.
- `DataExplorerPanel` test asserts a dedicated resource-tree scroll region.
- `ChatPanel` test asserts default rule mode status and settings modal fields.
- `App` test asserts project settings are loaded and saved through the API.

Backend:

- API tests cover default settings, saving settings, persistence, and missing project behavior.

Browser verification:

- Confirm body height is close to viewport height.
- Confirm left resource tree has `scrollHeight > clientHeight` with `overflow-y: auto` when data is large.
- Confirm AI tab shows rule mode, vector status, and settings modal.

## Follow-Up Phases

- Implement provider adapters for OpenAI-compatible chat and Ollama.
- Add embedding storage and vector index lifecycle.
- Use configured vector model in hybrid graph retrieval.
- Add tool-call style answer traces similar to GitNexus.
