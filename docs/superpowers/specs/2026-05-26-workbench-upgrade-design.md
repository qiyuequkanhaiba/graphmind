# GraphMind Workbench Upgrade Design

## Summary

GraphMind 下一步把当前三栏 MVP 升级成更接近 GitNexus Web UI 的专业工作台。参考方向是 GitNexus 的探索态结构：顶部全局 header、左侧资源导航、中间知识图谱画布、右侧上下文和 AI 面板、底部状态栏。GraphMind 不照搬 GitNexus 的暗色代码 IDE 风格，而是保留清爽的数据分析产品气质，围绕数据表、字段关系、证据审核和 AI 问答组织界面。

本次已确认的方向：

- 布局：A. Balanced Analyst Workbench，均衡分析工作台。
- 实现深度：B. 交互一起升级。
- 范围：Workbench 壳层、全局搜索、面板折叠、节点聚焦、状态栏联动。

## Goals

- 让 GraphMind 从“三栏页面”升级为有明确工作台层级的分析界面。
- 借鉴 GitNexus 的工作台骨架，让用户清楚知道项目状态、资源入口、图谱主区域和右侧智能上下文。
- 支持全局搜索表、字段和派生维度，并能聚焦和选中图谱节点。
- 支持左侧资源面板折叠，给图谱让出更大的分析空间。
- 用底部状态栏持续反馈节点数、边数、待审核建议、当前选择和 AI 高亮路径。
- 保持现有图谱、证据检查器、关系审核和 AI 问答能力，不重写后端。

## Non-Goals

- 不复刻 GitNexus 的代码仓库文件树、代码引用面板或代码阅读体验。
- 不引入复杂多窗口布局、拖拽式面板调整或持久化 layout 设置。
- 不做完整暗色 IDE 主题迁移。
- 不在本阶段新增后端 API。
- 不实现浮动 AI 入口、证据 overlay 或复杂动画状态；这些属于后续增强。
- 不改变现有导入、审核和问答 API 契约。

## Product Shape

新工作台由五个区域组成：

- 顶部：`WorkbenchHeader`，负责品牌、项目/数据状态、全局搜索和主要动作。
- 左侧：`DataExplorerPanel`，负责数据导入、表/字段摘要、建议入口和折叠状态。
- 中央：`GraphCanvas`，继续作为主图谱画布，接收聚焦节点和选中状态。
- 右侧：`InsightPanel`，组织证据检查器、关系审核和 AI Q&A。
- 底部：`WorkbenchStatusBar`，显示工作台实时状态。

整体结构仍保留单页工作区，不新增路由。导入前和导入后都使用同一个工作台外壳，导入前中央图谱显示空状态，左侧突出导入入口，右侧显示空的证据和问答上下文。

## Reference From GitNexus

GitNexus 的 Web UI 在探索态中使用：

- `Header`：项目名、仓库切换、全局搜索、设置和状态。
- `FileTreePanel`：资源导航、筛选、折叠。
- `GraphCanvas`：主图谱画布。
- `RightPanel`：AI chat 和流程 tab。
- `StatusBar`：工作台底部状态。

GraphMind 采用这些结构原则，但重新映射为表格数据关系场景：

- 仓库切换变成当前数据集状态。
- 文件树变成数据表/字段/关系建议摘要。
- 代码搜索变成表、字段、派生维度节点搜索。
- 代码引用 panel 不进入本阶段。
- AI chat 与证据检查器共存，不把右侧只做聊天。

## Components

### WorkbenchHeader

顶部 header 替代当前简单 `topbar`。它应该包含：

- GraphMind 品牌和短副标题。
- 数据状态摘要，例如 `7 nodes · 6 edges · 1 pending review`。
- 全局搜索框，支持搜索 `graph.nodes` 的 `label`、`source_ref` 和节点类型。
- 搜索结果下拉，展示节点类型、label 和简短 source。
- 选择搜索结果后：
  - 更新当前 `GraphSelection` 为该节点。
  - 通知 `GraphCanvas` 聚焦该节点。
  - 清空搜索框或关闭结果浮层。

第一阶段不实现命令面板快捷键，搜索只做 header 内联控件。搜索结果限制为 8 到 10 条，避免下拉过长。

### DataExplorerPanel

左侧 panel 承担 GitNexus `FileTreePanel` 在 GraphMind 中的角色。它包含：

- 现有 `ImportPanel`。
- 图谱资源摘要：
  - 表节点数量。
  - 字段节点数量。
  - 派生维度数量。
  - 待审核建议数量。
- 可折叠控制：
  - 展开时显示导入、摘要和简短字段统计。
  - 折叠时保留窄栏图标或竖向 label，并保留展开按钮。

第一阶段不实现真正的字段树展开和复杂过滤，因为当前后端和前端还没有明确的表字段层级 UI 数据结构。若需要字段树，后续基于 `GraphNode.source_ref` 派生。

### GraphCanvas Integration

现有 `GraphCanvas` 已经有视图模式、筛选、图例、选择和高亮路径能力。本阶段只做必要接口增强：

- 接收 `focusedNodeId` 或 `focusRequest`，在用户通过 header 搜索选择节点时聚焦该节点。
- 继续通过 `onSelectionChange` 向工作台上报节点和边选择。
- 选择状态来源仍由 `Workspace` 统一管理。

如果 React Flow instance 的聚焦能力已有内部方法，本阶段可以在 `GraphCanvas` 内部用 `useEffect` 监听 focus request；不需要引入全局 store。

### InsightPanel

右侧 panel 继续承载现有能力，但命名和结构升级为工作台上下文区：

- 顶部显示简短区域标题，例如 `Insights`。
- 第一块始终是 `EvidenceInspector`。
- 第二块是 `RelationshipReview`。
- 第三块是 `ChatPanel`。

第一阶段不强制改为 tabs。原因是证据、审核和 AI 在 GraphMind 里经常需要同时可见；GitNexus 的 tabbed RightPanel 更适合代码问答和流程切换。若空间不足，后续可以把 Review 和 AI 做成 tabs。

### WorkbenchStatusBar

底部状态栏展示：

- 节点数量。
- 边数量。
- 待审核建议数量。
- 当前选中对象：无选择、节点 label、或关系类型。
- AI 高亮路径数量。
- 左侧面板折叠状态可以用一个短状态或按钮反馈。

状态栏不承担主要操作，只做轻量反馈。它应固定在底部工作台区域，不遮挡图谱。

## State And Data Flow

`Workspace` 继续作为工作台状态汇聚点。新增状态：

- `leftPanelCollapsed: boolean`
- `focusNodeRequest: { nodeId: number; nonce: number } | null`

已有状态继续使用：

- `selection: GraphSelection | null`
- `highlightedGraphPath: number[]`
- `graph`
- `suggestions`
- `messages`
- `importStatus`

搜索结果由 `WorkbenchHeader` 根据 `graph.nodes` 本地计算，不访问后端。搜索选择通过回调交给 `Workspace`：

1. `WorkbenchHeader` 选中节点。
2. `Workspace` 用已有 helper 构造 node selection。
3. `Workspace` 更新 `selection`。
4. `Workspace` 更新 `focusNodeRequest`。
5. `GraphCanvas` 监听并调用 React Flow 聚焦。
6. `EvidenceInspector` 随 selection 更新。
7. `WorkbenchStatusBar` 随 selection 和图谱统计更新。

## Error And Empty States

- 后端不可用仍由 `App` 显示 `Backend unavailable`，不进入工作台。
- 空工作台显示完整外壳，但中央图谱为空状态。
- 搜索无结果时，下拉显示 `No matching graph items`。
- 选择的节点或边在导入刷新后不存在时，沿用当前 `Workspace` 清空 selection 的行为。
- 左侧折叠后仍必须能恢复展开，不隐藏导入功能入口到不可发现的位置。

## Visual Direction

视觉原则：

- 保持数据分析产品的浅色、清爽、可扫描风格。
- 使用 GitNexus 的工作台密度和层级，而不是暗色、发光、代码 IDE 质感。
- Header 更紧凑，减少营销式空间。
- 左侧和右侧 panel 边界清楚，但不做卡片套卡片。
- 图谱画布仍是视觉重心，左侧折叠后图谱应明显获得更多空间。
- 状态栏高度低，文本短，适合长期显示。

## Testing Strategy

新增和更新前端测试：

- `Workspace.test.tsx`
  - 渲染 WorkbenchHeader、DataExplorerPanel、GraphCanvas、InsightPanel、WorkbenchStatusBar。
  - 点击左侧折叠按钮后，工作区出现 collapsed class 或对应状态文本。
  - 搜索一个字段节点，选择结果后触发 selection，并在证据面板或状态栏显示该节点。

- 新增 `WorkbenchHeader.test.tsx`
  - 搜索节点 label。
  - 展示节点类型和 source。
  - 无结果状态。
  - 选择结果回调。

- 新增 `WorkbenchStatusBar.test.tsx`
  - 展示 nodes、edges、pending suggestions。
  - 展示当前 selection。
  - 展示 AI highlighted path 数量。

- 现有 `GraphCanvas.test.tsx`
  - 若新增 focus request 行为，需要加聚焦请求不会破坏渲染和选择的测试。

最终验证：

- `npm test`
- `npm run lint`
- `npm run build`
- 浏览器冒烟检查：
  - 空工作台 header、左侧 explorer、图谱、右侧 insights、底部 status bar 都可见。
  - 导入样例后 status bar 数字更新。
  - 搜索字段后图谱选择和右侧证据联动。
  - 左侧折叠和展开可用。
  - 控制台无 error。

## Implementation Notes

- 优先新建小组件，避免继续让 `Workspace.tsx` 变成过大的布局文件。
- 组件命名使用 GraphMind 语义，不使用 GitNexus 的 `FileTreePanel` 或 `RightPanel` 命名。
- 不增加新依赖。
- 不新增后端改动。
- 所有样式继续放在 `frontend/src/styles/app.css`，但用清楚的 selector 分区，避免互相覆盖。
- 当前 workspace 不是 git 仓库；规格和后续实现 checkpoint 需要运行 `git rev-parse --is-inside-work-tree`，若返回 `fatal: not a git repository`，跳过 commit。
