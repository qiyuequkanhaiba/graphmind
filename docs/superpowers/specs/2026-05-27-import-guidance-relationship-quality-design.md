# 导入引导与关系发现质量升级设计规格

## 背景

GraphMind 已具备本地表格导入、图谱展示、关系审核、证据检查器和默认中文界面。下一阶段的目标不是继续做纯视觉打磨，而是让用户在空项目或新导入后更快形成可演示闭环，并让系统发现更可信的数据关系。

当前关系推断主要依赖相同规范化字段名和基础取值重合，容易漏掉 `Orders.customer_id` 到 `Customers.id`、`sales_product_code` 到 `products.product_code` 这类真实业务表关系。当前空项目状态也缺少一键示例数据，用户需要自己准备多表数据才能体验知识图谱价值。

## 目标

1. 空项目可通过“导入示例数据”快速生成多表知识图谱。
2. 导入后左侧面板能用中文给出数据集摘要和下一步提示。
3. 关系推断支持异名字段，只要值重合、类型兼容、键候选方向合理即可提出关系建议。
4. 证据 payload 更专业，包含匹配样例、匹配率、行覆盖率、唯一率、空值率、字段名相似度和关系强度。
5. 前端证据检查器和关系审核卡片能读懂这些新证据，并以中文优先展示。

## 非目标

1. 本轮不接入真实 LLM provider。
2. 本轮不做项目列表、项目切换或历史快照管理。
3. 本轮不重构整套图谱布局引擎。
4. 本轮不上传完整原始数据给外部 AI 服务。

## 用户体验

空项目时，导入面板显示：

- 文件上传入口。
- “导入示例数据”按钮。
- 简短中文说明：示例数据会在本地生成客户、订单、产品等表，用于体验关系图谱。

用户点击“导入示例数据”后：

- 后端为当前项目创建一个内置 Excel 工作簿或等价多表数据集。
- 前端用现有导入结果刷新图谱、数据树、审核列表和证据面板。
- 导入状态显示表数量、字段数量、关系建议数量和可继续操作提示。

用户查看关系建议时：

- 强关系显示较高置信度，证据中包含匹配值样例和原因。
- 异名字段关系不再被漏掉，例如 `Orders.customer_id -> Customers.id`。
- 证据面板用中文标签展示结构化指标。

## 后端设计

### 示例数据导入

新增 `POST /api/projects/{project_id}/sample-import`。

该接口复用 `ImportService.import_file` 的存储、画像、关系推断和图谱构建流程，避免独立写一套数据持久化逻辑。服务层新增 `import_sample_dataset(project_id)`，在工作区临时生成内置 Excel 文件，包含：

- `Customers`: `id`, `customer_name`, `region`, `segment`
- `Products`: `product_code`, `product_name`, `category`
- `Orders`: `order_id`, `customer_id`, `product_code`, `order_date`, `amount`

这样可以同时覆盖：

- 异名字段关系：`Orders.customer_id -> Customers.id`
- 同名字段关系：`Orders.product_code -> Products.product_code`
- 维度关系：`region`, `segment`, `category`

### 关系推断

`infer_relationships` 保留现有 `derived_dimension` 逻辑，升级 `foreign_key` 候选发现：

- 不再要求字段规范化名称完全一致。
- 跳过同一表字段对。
- 值集合需存在足够重合。
- 源字段匹配率达到阈值时，可形成候选。
- 目标字段唯一率或键候选分越高，方向越倾向于“源字段引用目标字段”。
- 字段名相似度、类型兼容、键候选分会影响置信度，但不单独决定关系。

新增证据字段：

- `overlap_count`
- `source_distinct_count`
- `target_distinct_count`
- `source_match_ratio`
- `matched_row_count`
- `source_non_null_count`
- `source_unique_ratio`
- `target_unique_ratio`
- `source_null_ratio`
- `target_null_ratio`
- `source_key_candidate_score`
- `target_key_candidate_score`
- `field_name_similarity`
- `field_type_compatible`
- `sample_matches`
- `relationship_strength`

关系强度分层：

- `strong`: 置信度大于等于 `0.9`
- `likely`: 置信度大于等于 `0.8`
- `possible`: 其余保留候选

## 前端设计

### API 与状态

新增 `importSampleDataset(projectId)` API client 方法，返回结构沿用 `ImportResult`。`App` 增加 `handleImportSample`，和普通文件导入一样刷新 `graph`、`suggestions`、`highlightedGraphPath` 与 `importStatus`。

### 导入面板

`ImportPanel` 新增：

- `onImportSample` prop。
- “导入示例数据”按钮。
- 空项目引导文案。
- 有图谱时显示摘要：表数量、字段数量、建议数量。

摘要可由 `DataExplorerPanel` 基于 `graph.nodes` 和 `suggestions` 计算后传入，避免新增后端 summary endpoint。

### 证据呈现

`graphSemantics.ts` 扩展证据标签与格式化：

- 新增中文标签。
- `sample_matches` 以逗号分隔展示。
- boolean 显示为“是/否”。
- `relationship_strength` 显示为“强 / 较可能 / 可能”。
- 中文摘要优先使用新 payload 生成完整句子。

`RelationshipReview` 和 `EvidenceInspector` 继续复用 `formatEvidenceSummary` 与 `evidenceRowsFromPayload`，减少组件分叉。

## 测试策略

后端：

- 先写关系推断失败测试，覆盖异名字段 `Orders.customer_id -> Customers.id`。
- 断言新证据 payload 包含匹配样例、字段名相似度、空值率和关系强度。
- 写示例导入 API 测试，断言返回多表图谱、外键建议和中文证据。

前端：

- 先写 API client / App 行为测试，覆盖点击“导入示例数据”后请求新 endpoint 并刷新工作台。
- 写导入面板测试，覆盖按钮、空状态和摘要。
- 写证据格式测试，覆盖新 payload 的中文展示。

## 验收标准

1. 新项目无需手工准备文件，点击“导入示例数据”即可看到多表图谱。
2. 后端能识别 `Orders.customer_id -> Customers.id` 这类异名字段外键。
3. 关系证据中出现匹配样例、匹配率、空值率、唯一率和关系强度。
4. 前端默认中文展示新增入口、状态、摘要和证据标签。
5. 后端测试、前端测试、前端构建全部通过。
