# AI 图谱动作闭环 MVP 设计规格

## 背景

GraphMind 现在已经具备专业图谱工作台、证据检查器、关系审核、AI 问答、引用点击选中图谱对象和 AI 路径高亮。当前缺口是：AI 回答仍主要是文本、引用和 `highlighted_graph_path`，用户需要手动理解“下一步该点哪里”。第三阶段要把 AI 回答升级为可执行的图谱动作，让回答直接驱动画布、证据面板和审核面板。

## 目标

本阶段实现一个稳定的 AI 图谱动作闭环：

- 后端 `/chat` 返回结构化 `graph_actions` 和 `next_steps`。
- 前端聊天消息显示动作按钮。
- 点击动作可以高亮路径、聚焦节点、打开证据、筛选待审核关系。
- 规则模式和模型增强模式都返回同一动作结构。
- 保留现有 `content`、`answer_confidence`、`highlighted_graph_path` 字段，避免破坏已有前端和测试。

## 非目标

- 不新增真正的向量数据库。
- 不要求模型直接生成动作 JSON。模型增强内容仍以规则答案为可信底座，动作由后端规则层生成。
- 不做自动审核或批量修改关系。
- 不重构整个聊天会话存储。

## 后端动作协议

`ChatAnswerResponse` 在现有字段基础上新增：

- `answer: string`：`content` 的兼容别名，方便后续接近产品化 API。
- `confidence: string`：`answer_confidence` 的兼容别名。
- `graph_actions: GraphActionResponse[]`
- `next_steps: string[]`

`GraphActionResponse` 字段：

- `id: string`：稳定动作 id，例如 `highlight-path`、`focus-node-2`。
- `type: string`：动作类型。
- `label: string`：按钮文案，默认中文。
- `description: string | null`：短说明。
- `node_ids: number[]`
- `edge_ids: number[]`
- `suggestion_ids: number[]`
- `evidence_refs: string[]`
- `metadata: object`

MVP 动作类型：

- `highlight_path`：把 `node_ids` 和 `edge_ids` 合并到图谱高亮路径。
- `focus_node`：聚焦第一个 `node_ids`。
- `open_evidence`：优先打开第一个 `edge_ids`，其次按 `evidence_refs` 或 `suggestion_ids` 匹配已有边或节点。
- `filter_pending_reviews`：切换到审核面板，并把待审核关系作为当前工作上下文。

## 后端生成规则

`ChatService` 在规则答案生成后统一附加动作，模型增强只替换文本内容，不替换动作。

- 关系审核答案：返回 `filter_pending_reviews`、`highlight_path`。
- 选中节点答案：返回 `focus_node`、`highlight_path`、`open_evidence`。
- 选中关系答案：返回 `open_evidence`、`highlight_path`。
- 如果检索证据中能匹配到图谱边，返回 `highlight_path` 和 `open_evidence` 作为引用证据动作。
- 低置信或 unsupported 答案：不返回图谱动作。

## 前端交互

`ChatPanel`：

- assistant 消息中如果存在 `graph_actions`，显示“图谱动作”区域。
- 每个动作渲染为紧凑按钮。
- 点击按钮调用 `onGraphAction(action)`。

`Workspace`：

- 接收 `GraphAction`。
- `highlight_path`：设置 AI 选择路径，并保持现有全局 `highlightedGraphPath`。
- `focus_node`：设置 `focusRequest`，选择对应节点，进入图谱模块。
- `open_evidence`：选择对应边或节点，切到证据 tab，进入图谱模块。
- `filter_pending_reviews`：切到洞察模块和审核 tab。

`App`：

- 把后端 `graph_actions` 和 `next_steps` 存入 assistant message。
- 继续用 `highlighted_graph_path` 更新全局图谱高亮。

## UI 约束

- 动作按钮必须紧凑，不能让 AI 面板横向溢出。
- 中文为默认显示语言。
- 动作区域不替代引用和检索证据，而是放在回答正文与证据链之间。
- 移动端按钮允许换行，但不能撑破右侧面板。

## 错误处理

- 前端遇到无法匹配的 action target 时不报错，不改变现有选择。
- `filter_pending_reviews` 即使没有 suggestion id，也可以切到审核 tab。
- 后端检索失败时仍返回规则动作和 `next_steps`。

## 测试计划

- 后端 `ChatService` 测试：
  - 待审核关系答案返回 `filter_pending_reviews` 和 `highlight_path`。
  - 选中节点答案返回 `focus_node` 和 `open_evidence`。
  - API 响应包含 `answer`、`confidence`、`graph_actions`、`next_steps`。
- 前端测试：
  - `ChatPanel` 渲染图谱动作按钮并触发回调。
  - `Workspace` 执行动作后切换 tab、选中证据、更新 AI 路径。
  - `App` 把 chat response 的动作保存到消息。
- 回归验证：
  - 后端 pytest。
  - 前端 `npm test -- --run`、`npm run lint`、`npm run build`。
  - 浏览器验证桌面和移动端无横向溢出，动作按钮可见可点击。

## 实施进度

- [x] 后端动作协议
- [x] 后端规则动作生成
- [x] 前端类型和聊天动作按钮
- [x] Workspace 图谱动作执行
- [x] 文档、测试、构建、浏览器验证
