# AI 可解释动作操作台设计规格

日期：2026-05-31
状态：完成

## 背景

GraphMind 已完成 AI 图谱动作闭环 MVP：后端返回 `graph_actions`，前端可以执行高亮路径、聚焦节点、打开证据和查看待审核关系。当前短板是动作仍像普通按钮，用户在点击前不知道会命中哪些对象，点击后也缺少状态、失败解释和恢复入口。

本阶段把 AI 动作升级为轻量“可解释操作台”，让 AI 回答不仅能驱动画布，也能让用户理解、追踪和撤销这些驱动效果。

## 目标

- 在聊天回答中展示每个图谱动作的目标预览：节点数、关系数、建议数和证据引用数。
- 区分动作层级：主动作优先显示，次动作保持紧凑。
- 执行动作后显示状态：已执行、失败或已撤销。
- 当动作无法命中当前图谱对象时，给出中文失败原因，不静默失败。
- 提供清除 AI 高亮/撤销动作效果的入口，恢复到用户继续探索的稳定状态。
- 保持当前工作台布局克制，不能把 AI 面板撑大到挤压图谱画布。

## 非目标

- 不新增后端数据库表。
- 不做跨刷新持久化动作历史。
- 不让模型直接生成可执行命令。
- 不实现多步自动化编排或批量关系修改。
- 不重构聊天会话存储。

## 产品行为

### 动作卡片

每个 AI 动作从普通 pill 按钮升级为紧凑动作卡片：

- 标题：动作 label。
- 描述：动作 description，缺失时不占位。
- 目标预览：例如 `2 节点 · 1 关系 · 1 建议 · 1 证据`。
- 状态标记：未执行、已执行、失败、已撤销。
- 执行按钮：主动作文案为“执行”，次动作仍使用同一执行入口，但视觉权重较低。

主动作类型：

- `highlight_path`
- `open_evidence`

次动作类型：

- `focus_node`
- `filter_pending_reviews`
- 其他未知动作类型默认次动作。

### 执行反馈

`Workspace` 执行动作后返回结果给 `ChatPanel`：

- `executed`：动作已改变图谱状态或面板状态。
- `failed`：动作无法命中目标或动作类型不支持。
- `reverted`：用户清除了该动作带来的 AI 高亮状态。

失败原因示例：

- “当前图谱中找不到动作目标。”
- “暂不支持该图谱动作。”

### 撤销与清除

本阶段实现轻量恢复：

- 对 `highlight_path`、`focus_node`、`open_evidence` 执行后，动作卡片显示“清除高亮”。
- 点击后清空 `aiSelectionPath`，保留用户当前选择和面板布局，避免突然跳走。
- 对 `filter_pending_reviews`，不强制回到之前 tab，只显示已执行状态；用户可继续使用现有导航。

## 前端架构

### 类型

在 `frontend/src/api/types.ts` 新增 UI 层类型：

- `GraphActionExecutionStatus = "idle" | "executed" | "failed" | "reverted"`
- `GraphActionExecutionResult`
- `GraphActionTargetPreview`

这些类型不属于后端 API 合约，只用于前端组件间通信。

### ChatPanel

新增 props：

- `graphActionStates?: Record<string, GraphActionExecutionResult>`
- `onClearGraphAction?: (action: GraphAction) => void`

`ChatPanel` 负责渲染：

- 目标预览。
- 状态标记。
- 执行按钮。
- 清除高亮按钮。
- 失败原因。

### Workspace

`Workspace` 维护动作执行状态：

- `graphActionStates`
- `handleGraphAction(action): GraphActionExecutionResult`
- `clearGraphAction(action): void`

执行动作时先验证目标：

- `highlight_path` 需要命中至少一个现有节点或关系。
- `focus_node` 需要命中一个现有节点。
- `open_evidence` 需要命中一个现有关系或节点。
- `filter_pending_reviews` 只要存在待审核建议，或 action 带有 suggestion id，即可切换审核面板。
- 未知动作类型返回失败。

成功后把结果写入 `graphActionStates` 并继续执行现有图谱状态变更。

## 布局约束

- 动作卡片使用一列紧凑布局，不使用宽大的卡片堆叠。
- 目标预览和状态使用小号文本或 pill，允许换行但不能横向溢出。
- 在 `.pro-workbench` 中保持暗色专业风格，按钮使用图标感/短文案，不增加大段说明。
- 移动端最多一列，按钮区域换行，面板内部滚动承载内容。

## 测试计划

前端测试：

- `ChatPanel` 能渲染动作目标预览和未执行状态。
- 点击动作后调用 `onGraphAction`。
- 当状态为失败时显示失败原因。
- 当状态为已执行时显示“清除高亮”，点击调用 `onClearGraphAction`。
- `Workspace` 执行动作后显示已执行状态。
- `Workspace` 对不存在目标的动作显示失败状态，且不改变证据面板。
- `Workspace` 清除动作后移除 AI 高亮并显示已撤销状态。

验证：

- `cd frontend && npm test -- ChatPanel.test.tsx Workspace.test.tsx --run`
- `cd frontend && npm test -- --run`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- 浏览器检查 1440、1024、390 宽度下 AI 动作区域不横向溢出，不遮挡图谱标题和工具栏。

## 实施进度

- [x] 设计规格创建。
- [x] 实施计划创建。
- [x] 前端动作预览与状态测试。
- [x] 前端动作状态实现。
- [x] 样式与多端布局验证。
- [x] 文档、测试、构建、浏览器验证完成。

## 验收记录

- 2026-05-31 16:00 CST：前端全量测试 21 个文件、157 项通过；TypeScript 检查通过；生产构建通过。
- 2026-05-31 16:05 CST：后端 `pytest -q` 90 项通过；`ruff check graphmind tests` 通过。
- 2026-05-31 16:05 CST：重启本地后端后，真实 `/chat` 响应包含 2 个 `graph_actions` 和 `next_steps`。
- 2026-05-31 16:06 CST：浏览器实测 AI 面板真实渲染 2 张动作卡片，显示 `7 节点 · 0 关系 · 6 建议 · 0 证据` 目标预览；右侧面板 317px 宽度内无横向溢出，图谱标题可见，桌面主画布宽约 878px、高约 806px。
