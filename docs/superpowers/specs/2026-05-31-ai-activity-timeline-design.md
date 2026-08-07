# AI 分析活动时间线设计规格

日期：2026-05-31
状态：已完成

## 背景

GraphMind 已完成 AI 图谱动作操作台：AI 回答可以展示动作目标预览、执行状态、失败原因和清除高亮。下一步需要让这些动作从“单个按钮状态”升级为可回看的分析轨迹。用户在连续探索关系时，需要知道刚才 AI 做了什么、哪些动作成功、哪些失败、哪些高亮被清除。

本阶段实现轻量的前端活动时间线，作为 AI 面板中的产品化辅助层，不新增后端存储。

## 目标

- 在 AI 面板显示“分析活动”时间线，记录最近的 AI 图谱动作执行结果。
- 每条记录包含动作名称、状态、简短说明和目标规模。
- 记录成功、失败、已撤销三类事件。
- 支持一键清空活动记录。
- 保持时间线紧凑，不挤压聊天输入和主图谱画布。

## 非目标

- 不做跨刷新持久化。
- 不保存到后端数据库。
- 不做可编辑审计日志。
- 不记录普通聊天文本，只记录图谱动作相关事件。
- 不新增独立页面或复杂筛选。

## 产品行为

### 时间线位置

时间线放在 `ChatPanel` 中，位于 AI 状态说明之后、当前上下文之前。这样用户进入 AI 面板时能先看到最近动作，再继续提问。

如果没有活动记录，不显示时间线，避免空状态占空间。

### 记录内容

每条活动记录包含：

- 状态：已执行、失败、已撤销。
- 动作名称：例如“高亮图谱路径”。
- 说明：来自动作执行结果 message。
- 目标预览：例如 `7 节点 · 0 关系 · 6 建议 · 0 证据`。

记录按最新在上排序，最多保留 8 条，避免长时间操作后撑大面板。

### 清空记录

时间线右上角提供“清空”按钮。点击后只清除活动记录，不影响当前图谱选择、高亮或聊天消息。

## 前端架构

### 类型

在 `frontend/src/api/types.ts` 新增：

- `GraphActionActivity`

字段：

- `id: string`
- `actionId: string`
- `label: string`
- `status: Exclude<GraphActionExecutionStatus, "idle">`
- `message: string`
- `createdAt: number`
- `targetPreview: GraphActionTargetPreview`

### Workspace

`Workspace` 在 `recordGraphActionState` 更新动作状态时，同步追加活动记录：

- `executed`
- `failed`
- `reverted`

`idle` 不记录。

新增状态：

- `graphActionActivities`

新增处理：

- `clearGraphActionActivities`

### ChatPanel

新增 props：

- `graphActionActivities?: GraphActionActivity[]`
- `onClearGraphActionActivities?: () => void`

新增渲染：

- `AI 分析活动` 区块。
- 最近 8 条活动。
- 清空按钮。

## 布局约束

- 时间线使用小号密集列表，不使用大卡片。
- 每条记录最多两行主要文本，长文本自动换行。
- 在 `.pro-workbench` 中使用现有暗色 token。
- 移动端时间线可纵向滚动，但不能产生横向溢出。

## 测试计划

- `ChatPanel` 测试：
  - 无活动时不显示时间线。
  - 有活动时显示状态、动作名称、目标预览和清空按钮。
  - 点击清空按钮调用回调。
- `Workspace` 测试：
  - 执行动作后记录“已执行”活动。
  - 失败动作记录“失败”活动。
  - 清除高亮后记录“已撤销”活动。
  - 清空按钮只清除活动记录，不删除聊天消息。

验证：

- `cd frontend && npm test -- ChatPanel.test.tsx Workspace.test.tsx --run`
- `cd frontend && npm test -- --run`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- 浏览器检查 AI 面板真实动作执行后出现活动时间线，且右侧面板无横向溢出。

## 实施进度

- [x] 设计规格创建。
- [x] 实施计划创建。
- [x] 前端红灯测试。
- [x] 时间线状态和 UI 实现。
- [x] 文档、测试、构建、浏览器验证完成。

## 实施记录

- 2026-05-31 17:07 CST：`cd frontend && npm test -- ChatPanel.test.tsx Workspace.test.tsx --run` 通过，2 个测试文件、37 个测试全部通过。验证覆盖时间线渲染、空状态隐藏、清空活动、执行/失败/撤销动作记录。
- 2026-05-31 17:18 CST：浏览器实测发现真实 AI 的 `highlight_path` 动作可能只带 `suggestion_ids`，前端原本只解析 `node_ids/edge_ids` 导致误报“当前图谱中找不到动作目标”。已新增 suggestion-only 回归并修复为从 `suggestion_ids/evidence_refs` 反查图谱边及端点；`cd frontend && npm test -- ChatPanel.test.tsx Workspace.test.tsx --run` 通过，2 个测试文件、38 个测试全部通过。
- 2026-05-31 17:19 CST：完整验证通过：`cd frontend && npm test -- --run` 通过，21 个测试文件、161 个测试全部通过；`cd frontend && npm run lint` 通过；`cd frontend && npm run build` 通过。
- 2026-05-31 17:20 CST：浏览器验证 `http://127.0.0.1:5173/`：真实 AI 问答后执行“高亮图谱路径”显示 `AI 分析活动`，活动内容为 `高亮图谱路径 已执行 已执行动作。`，未出现“当前图谱中找不到动作目标”。桌面 1440px 无文档级横向溢出；移动 390px 洞察模块中时间线宽 345px，非画布组件无横向溢出。
