# GraphMind Professional Knowledge Graph Upgrade Design

## Summary

GraphMind 的下一阶段目标是把当前 MVP 的关系图升级成更专业的“语义探索台”。这不是重做一个完整本体系统，也不是马上引入图数据库；它是在现有本地优先架构上，补齐图谱语义契约、专业化 React Flow 画布，并把“为什么这条关系成立”变成用户点击边时最先看到的解释。

本次升级沿用用户已确认的方向：

- 方向：语义探索台。
- 范围：小型语义模型增强 + 专业知识图谱 UI。
- 检查器优先级：关系证据解释优先，数据结构解释作为辅助信息。

## Goals

- 让图谱从“节点加连线”变成可读的专业知识图谱视图。
- 用节点类型、边类型、状态、置信度和证据解释表达语义。
- 让用户点击一条关系边时，能快速理解来源字段、关系类型、置信度、证据摘要、证据指标和审核状态。
- 把关系审核动作和图谱检查器打通，减少用户在画布和右侧列表之间来回找关系的成本。
- 用筛选、图例和聚焦能力降低表格较多时的视觉噪音。
- 保持当前 MVP 的本地优先、SQLite + DuckDB、React + FastAPI 架构。

## Non-Goals

- 不引入 Neo4j、RDF、OWL 或完整本体编辑器。
- 不做自动布局算法的大规模重写。
- 不做多人协作、云端项目或权限系统。
- 不把原始表格整表发送给 AI。
- 不承诺自动推断出的关系一定正确；系统要解释证据并让用户审核。
- 不在本阶段做复杂图算法，例如社区发现、最短路径推荐或中心性分析。

## Product Shape

工作台仍保持三栏结构：

- 左侧：导入、数据集和字段概览。
- 中间：专业知识图谱画布。
- 右侧：关系证据检查器、审核入口和 AI 问答。

中间画布升级为“语义探索台”的核心区域。它应当更像数据建模和知识图谱分析工具，而不是通用流程图。用户打开项目后能立刻分辨：

- 哪些节点是表、字段、派生维度。
- 哪些边是结构包含关系、外键关系、派生维度关系。
- 哪些关系已确认、待审核、已编辑或已拒绝。
- 哪些关系置信度较高或需要谨慎处理。

右侧检查器优先解释用户选中的边。没有选中边时，显示关系审核列表和 AI 问答；选中节点时，显示节点详情；选中边时，显示关系证据，并提供接受、编辑、拒绝动作。

## Semantic Model

本阶段只做轻量语义层，不新增复杂本体对象。语义模型基于当前已有的 `GraphNode`、`GraphEdge`、`RelationshipSuggestion` 扩展。

### Node Types

节点类型保持当前三类，并强化 UI 语义：

- `table`：数据表或 Excel sheet。显示表名、行数、字段数。
- `field`：字段。显示字段名、推断类型、主键候选分数。
- `derived_entity`：由字段值派生出的探索维度。显示维度名、唯一值数量或代表性样例。

### Edge Types

边类型分为三组：

- `contains_field`：表包含字段。属于结构边，置信度固定为 1.0，状态为 `auto_trusted`。
- `foreign_key`：字段之间疑似外键或引用关系。属于证据边，需要用户审核。
- `derived_dimension`：字段到派生维度的关系。属于探索边，需要显示该字段为什么适合作为维度。

后续可以增加 `semantic_alias`、`calculated_from`、`same_entity_as` 等类型，但本阶段不实现。

### Edge Status

边状态沿用当前审核结果：

- `auto_trusted`：系统结构边，例如表包含字段。
- `suggested`：系统推断但未审核。
- `accepted`：用户确认。
- `edited`：用户调整后确认。
- `rejected`：用户拒绝。

默认画布展示 `auto_trusted`、`suggested`、`accepted`、`edited`。`rejected` 默认隐藏，但可通过筛选打开，用于回看审核历史。

## Backend Contract

后端以增量方式扩展当前图谱 API，避免破坏现有导入和问答流程。

### Graph Edge Response

`GraphEdgeResponse` 需要增加这些字段：

- `created_from_suggestion_id: int | null`：用于把画布边连接到关系建议和审核接口。
- `metadata: dict`：保存边级语义数据。
- `evidence_summary: string | null`：关系证据的一句话摘要。
- `evidence_payload: dict | null`：结构化证据指标。

当前 `GraphEdgeData` 已经包含 `metadata`，`RelationshipSuggestion` 已经保存 `evidence_summary` 和 `evidence_payload`，因此实现优先从已有数据拼出响应，不优先新增数据库表。`metadata` 应从构图阶段持久化到 `GraphEdge`，或在响应阶段由 linked suggestion 补齐；实现计划需要选择其中一种，并保持迁移简单。

### Graph Node Response

`GraphNodeResponse` 继续返回 `metadata`。前端依赖它展示：

- 表节点：`row_count`、`column_count`。
- 字段节点：`inferred_type`、`key_candidate_score`。
- 派生维度节点：`unique_count` 等证据摘要字段。

### Relationship Suggestion Response

`RelationshipSuggestionResponse` 需要补充：

- `evidence_payload: dict`：让关系审核列表和边检查器使用同一份证据指标。
- `source_field_id: int` 与 `target_field_id: int | null`：用于更稳定地定位节点。

这些字段属于本阶段范围。画布边主要通过 `created_from_suggestion_id` 连接审核动作；关系审核列表仍应拿到字段 id 和 evidence payload，避免只依赖展示 label 做状态匹配。

## Graph Canvas Design

### Layout

画布仍使用 React Flow，但不再使用默认节点。新增自定义节点渲染：

- Table Node：紧凑矩形，强调表名和行列规模。
- Field Node：较小字段节点，用类型标记和主键候选分数表达字段特征。
- Dimension Node：探索维度节点，使用区别于表和字段的图标与色彩。

节点尺寸需要稳定，避免 label、hover 状态或动态指标导致布局跳动。长字段名采用截断与 tooltip，不让文本溢出节点。

### Edge Styling

边的视觉编码要同时表达类型和状态：

- `contains_field`：细灰线，低视觉权重。
- `foreign_key`：主色实线或虚线，显示置信度。
- `derived_dimension`：次级强调色，连接字段与派生维度。
- `suggested`：虚线。
- `accepted` / `edited`：实线。
- `rejected`：默认隐藏；显示时低透明度。

边 label 优先显示关系类型的可读文本，例如 “foreign key” 或 “dimension”。置信度在 hover、检查器或小型 badge 中展示，避免画布过载。

### Controls

画布顶部提供紧凑工具条：

- 视图模式：Table、Field、Entity。第一阶段可以先作为过滤模式，不必实现全新布局算法。
- 关系状态筛选：Suggested、Accepted、Edited、Rejected。
- 关系类型筛选：Contains、Foreign Key、Dimension。
- 置信度阈值：用于隐藏低置信度建议边。
- Fit graph：回到全图。
- Focus selection：聚焦当前选中节点或边的相邻关系。

画布内提供图例，解释颜色、线型和状态。图例必须短小，不做教学式长文案。

## Evidence Inspector

关系证据检查器是本阶段最重要的体验升级。

### Edge Selection

用户点击边时，右侧优先展示：

- 关系类型。
- 审核状态。
- 置信度。
- 来源字段和目标字段。
- 证据摘要。
- 结构化证据指标。
- 来源引用，例如 `evidence_ref` 和 `created_from_suggestion_id`。
- 审核动作：接受、编辑、拒绝。

`foreign_key` 的证据指标按当前 `evidence_payload` 展示：

- overlap count。
- source distinct count。
- source match ratio。
- source unique ratio。
- target unique ratio。
- source key candidate score。
- target key candidate score。

`derived_dimension` 的证据指标展示：

- unique count。
- 字段类型。

样例值不作为本阶段硬要求；如果后端当前响应没有样例值，检查器不显示样例区，不新增专门的样例查询接口。

`contains_field` 的检查器不展示审核动作，只解释这是结构边，并显示表和字段元数据。

### Node Selection

用户点击节点时，右侧显示：

- 节点类型。
- label。
- source ref。
- metadata。
- 相邻关系摘要。

节点检查器的优先级低于边检查器。若后续右侧空间不足，节点详情可以放在折叠区。

### Review Linkage

边检查器中的接受、编辑、拒绝动作调用当前已有的 `POST /api/relationship-suggestions/{suggestion_id}/review`。成功后：

- 前端刷新图谱和关系建议。
- 选中边保持选中状态，如果该边仍可见。
- 边状态立即反映审核结果。
- AI 问答引用关系时，应更偏向 `accepted` 和 `edited` 关系。

## AI Q&A Linkage

本阶段不重写 AI 问答，但要让问答和图谱选择互相理解。

当 AI 回答返回 `highlighted_graph_path` 时：

- 画布高亮路径中的节点和边。
- 检查器显示 “AI answer path” 的简短上下文。
- 引用列表仍展示字段或图谱路径来源。

当用户选中一条关系边后问问题，前端可以把当前选中对象作为 UI 上下文提示，但第一阶段不要求把它传给后端。后续如果要实现上下文问答，再新增 `selected_graph_context` 到 chat request。

## Data Flow

导入流程保持当前主线：

1. 用户上传 CSV 或 Excel。
2. 后端解析表格并生成字段 profile。
3. 关系推断生成 `RelationshipSuggestion`，保存 `evidence_summary` 和 `evidence_payload`。
4. 图构建生成节点和边，并把建议边连接到 `created_from_suggestion_id`。
5. 前端获取图谱和关系建议。
6. Graph Canvas 根据节点、边、筛选条件渲染。
7. 用户点击边，Evidence Inspector 展示证据。
8. 用户审核关系，后端同步更新 suggestion 和 linked edge 状态。
9. 前端刷新后继续展示更新后的专业图谱。

## Error Handling

- 如果边没有 `created_from_suggestion_id`，检查器仍显示只读证据，不展示审核动作。
- 如果 `evidence_payload` 缺失或格式不完整，检查器显示证据摘要和可用字段，不阻断画布渲染。
- 如果审核 API 失败，前端保留当前选择并显示明确失败状态。
- 如果筛选条件隐藏了当前选中边，前端清空选择或提示当前选择已被筛选隐藏。
- 如果没有图谱数据，画布显示导入引导，不显示空白 React Flow。

## Testing

### Backend Tests

- `GET /api/projects/{project_id}/graph` 返回 edge evidence metadata、`created_from_suggestion_id`、`evidence_summary`、`evidence_payload`。
- 审核 relationship suggestion 后，linked graph edge 状态同步更新。
- 缺失 suggestion linkage 的结构边仍能正常序列化。

### Frontend Tests

- GraphCanvas 渲染不同 node type 的自定义节点。
- GraphCanvas 根据 edge type 和 status 应用不同 class 或样式。
- 筛选控件能隐藏和显示对应状态、类型和置信度范围的边。
- 点击边后 Evidence Inspector 展示关系类型、置信度、证据摘要和指标。
- 对可审核建议边执行接受或拒绝动作后调用正确 API handler。
- 当 chat response 的 `highlighted_graph_path` 非空时，画布能高亮对应节点或边；当前后端经常返回空路径时，测试应覆盖前端组件的非空 mock 数据。

### Browser Verification

实现完成后需要用浏览器验证：

- 导入示例文件后，画布不是空白。
- 节点文本在桌面和较窄 viewport 下不溢出。
- 筛选、选中、检查器和审核动作可用。
- 控制台没有 React 或 API 错误。

## Rollout

第一阶段只在当前默认工作台中替换 graph canvas 和右侧检查器体验，不新增独立路由。实现应保持 API 向后兼容：新增字段可选，旧字段不删除。

推荐分三步落地：

1. 扩展后端 graph response，让边证据和 suggestion linkage 进入 API。
2. 改造前端图谱数据模型和 React Flow 自定义节点/边样式。
3. 增加 Evidence Inspector、筛选控件和审核联动。

每一步都要有测试，避免 UI 升级破坏导入、审核和问答的 MVP 主链路。

## Open Product Decisions

以下决策在本规格中已默认选择，后续只有用户明确提出时再调整：

- 画布继续使用 React Flow，不切换 Cytoscape.js。
- `rejected` 关系默认隐藏，不从数据库删除。
- 第一阶段不新增 chat request 的选中上下文参数。
- 专业感优先来自信息架构、语义编码和检查器，不来自大面积视觉装饰。
- 本阶段只做轻量语义模型，不做完整本体编辑器。
