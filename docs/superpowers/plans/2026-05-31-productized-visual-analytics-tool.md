# GraphMind 产品化可视化分析工具升级实施计划

日期：2026-05-31
状态：产品化优化方案已完成并通过最终验证

## 第一阶段任务

- [x] 文档化产品化方案。
- [x] 建立工作台模块状态：图谱、数据、洞察。
- [x] 顶部增加模块导航和高频入口。
- [x] 数据导入入口从左侧列表中解耦，可由顶部直接打开。
- [x] AI 配置入口可从顶部直接打开，移动端不必进入 AI 标签页才能配置。
- [x] 窄屏下按当前模块展示主内容，减少纵向拥挤。
- [x] 更新 i18n 和单元测试。
- [x] 运行测试和构建。
- [x] 本地页面验证。

## 第二阶段任务：专业图谱视图

- [x] 布局预设切换：语义布局、字段优先、紧凑布局。
- [x] 视图快照保存/应用：保存筛选、视图模式、布局和隐藏项。
- [x] 隐藏/恢复选中项：支持隐藏选中节点或关系并恢复全部隐藏项。
- [x] 导出当前图谱 JSON：导出当前可见图谱、筛选和隐藏状态。
- [x] PNG/SVG/GraphML 导出：支持可见图谱 SVG、GraphML 和 PNG 导出，PNG 不可截图时回退 SVG。
- [x] 工具抽屉专业化：新增布局、快照、隐藏状态条，并保持图谱画布优先。
- [x] 节点固定、框选、多选：支持框选模式、多选摘要、固定/取消固定选中节点。
- [x] 3D 实验视图。
- [x] 路径分析能力升级：端到端最短路径、字段血缘路径和关系强度分层视图。
- [x] 大图谱性能保护：聚类、虚拟化列表、Web Worker 布局。

## 第三阶段任务：AI 与建模闭环

- [x] AI 图谱动作活动时间线：记录执行、失败、撤销和动作目标规模。
- [x] AI suggestion-only 动作兼容：只返回 `suggestion_ids/evidence_refs` 时反查图谱边和端点。
- [x] 导入建模向导基础版：上传、字段识别、候选关系、人工确认、生成图谱。
- [x] 导入摘要产品化：显示表、字段、候选关系、待确认和当前图谱规模。
- [x] 字段映射和类型确认基础版：上传后允许人工修正字段类型、主键候选和确认状态。
- [x] 关系建模编辑器基础版：候选关系类型调整、证据质量标注和本地建模确认。
- [x] 关系建模持久化审核提交：确认关系时保存关系类型、证据质量和审核状态，并刷新图谱边状态。
- [x] 关系建模编辑器增强版：候选关系合并和规则配置。
- [x] 导入任务化基础版：导入进度、错误明细、失败重试和最近任务记录。
- [x] 导入任务历史持久化：后端 ImportJob 记录、历史接口、前端启动加载和项目重置清理。
- [x] 导入任务化增强版：后端异步任务、分片/大文件导入进度。

## 第四阶段任务：产品化布局与多端复检

- [x] 修复数据树、移动图谱、移动搜索框的横向溢出回归。
- [x] 复核图谱、数据、洞察三个模块在窄屏下按模块分流显示。
- [x] 复核数据导入抽屉和 AI 设置弹窗的滚动、边界和可见操作区。
- [x] 收敛图谱工具抽屉、搜索浮层和状态栏位置，避免遮挡标题和画布。
- [x] 增加笔记本矮屏 AI 面板样式保护，让对话区优先保留可读高度。
- [x] 完成全量前端测试、TypeScript 检查、生产构建和最终浏览器复检。

## 第五阶段任务：产品化质量护栏

- [x] 将人工多端布局复检沉淀为可重复运行的 `npm run audit:layout`。
- [x] 审计脚本自动启动 Vite、Chrome Headless，并注入本地 API mock，避免依赖外部后端状态。
- [x] 审计覆盖桌面、笔记本、平板、手机和低矮手机 5 个断点。
- [x] 审计覆盖图谱默认、图谱工具、图谱分析抽屉、搜索、全局命令面板、数据模块、洞察证据、洞察审核、洞察 AI、数据导入弹窗和 AI 设置弹窗 11 个状态。
- [x] 审计输出 JSON 报告和截图，检查横向溢出、关键组件出界、图谱/聊天可用区域过小、搜索/抽屉过高、标题/状态栏遮挡、AI 设置可访问性语义和弹窗 Escape 关闭能力。
- [x] 增加 `layoutAuditScript` 回归测试，锁定审计命令和关键覆盖范围。
- [x] 增加通用弹窗焦点管理：打开后焦点进入弹窗、Tab/Shift+Tab 在弹窗内循环、Escape 关闭、关闭后焦点回到触发入口。
- [x] 增加 tablist 键盘导航：顶部模块 tabs 与右侧洞察 tabs 支持方向键、Home 和 End 切换。
- [x] 增加搜索浮层命令面板式键盘操作：方向键进入/切换结果，Enter/Space 选择，Escape 关闭并恢复焦点。
- [x] 扩展 `audit:layout` 搜索状态键盘审计：真实浏览器校验结果项 option 语义、方向键选中、Escape 关闭和焦点恢复。
- [x] 增加全局命令面板：顶部图标入口与 Ctrl/Cmd+K 快捷键打开，支持命令搜索、模块跳转、导入、AI 配置和恢复布局。
- [x] 命令面板专业化：展示命令说明、快捷键提示和过滤结果数量，提升快速操作中心的信息密度。
- [x] 扩展 `audit:layout` 命令面板状态审计：真实浏览器校验搜索框初始焦点、方向键导航、Escape 关闭、焦点恢复和移动端边界。
- [x] 左侧资源树职责收敛：待审核资源不再常驻展示“外键 / 派生维度”等关系类型，关系类型交给图谱图例、关系摘要和右侧审核区承载。
- [x] 图谱分析抽屉化：可见关系、邻域摘要、AI 证据路径和路径分析结果从画布常驻卡片收敛为按需右侧抽屉，默认释放主图谱视图。
- [x] UI/UX Pro Max 工作台精修：图谱标题压缩为标题+指标轨，图例改为紧凑图标计数区，AI 对话标题区压缩，进一步释放图谱画布和对话消息区。

## 实施记录

- 2026-05-31：已创建计划，准备进入模块导航和多端布局实施。
- 2026-05-31：已完成第一阶段产品壳最小闭环：模块导航、顶部数据导入、顶部 AI 配置、窄屏模块分流；Workspace/WorkbenchHeader 局部测试和 TypeScript 检查通过。
- 2026-05-31：全量前端测试 126 项通过；`npm run lint` 通过；`npm run build` 通过。
- 2026-05-31：修复产品头部模块导航后的遮挡回归：桌面头部固定为单行 60px；1080px 以下改为自动计高双行头部；1280px 断点显式定位顶部操作区，避免隐式列挤压画布。
- 2026-05-31：完成本地页面多断点验证：1440x900、1024x768、390x844 下均无横向溢出和头部遮挡；平板和手机模块切换仅显示当前模块，桌面保留三栏工作台。
- 2026-05-31：遮挡修复后再次完成全量工程验证：`npm test -- --run` 通过 19 个测试文件、126 项测试；`npm run lint` 通过；`npm run build` 通过。
- 2026-05-31 07:24 CST：进入第二阶段专业图谱视图子集：已实现布局预设、视图快照、隐藏/恢复选中项、当前可见图谱 JSON 导出；已补充 `GraphCanvas` 行为测试和 `graphStyles` 样式回归测试。
- 2026-05-31 07:24 CST：针对新增图谱工具抽屉做样式收敛：布局预设改为图标矩阵，动作区改为紧凑图标按钮，快照列表横向滚动，工作流状态条以三段信息承载，不扩大主画布占用；局部样式测试 `npm test -- --run tests/graphStyles.test.js` 通过 3 项。
- 2026-05-31 07:34 CST：完成第二阶段子集的完整工程验证：`npm test -- --run` 通过 19 个测试文件、130 项测试；`npm run lint` 通过；`npm run build` 通过。
- 2026-05-31 07:34 CST：完成 in-app browser 多端几何验证：1440x900、1024x768、390x844 下无横向溢出，关系图谱标题未被遮挡，图谱画布宽高均保持可用；工具抽屉展开后桌面/平板无内部溢出，手机端使用抽屉内部纵向滚动收纳 9 个工具卡片。
- 2026-05-31 07:40 CST：补齐专业图谱导出：新增纯函数 `graphExport.ts`，支持 JSON payload、GraphML、SVG 和时间戳文件名；`GraphCanvas` 工具区新增 JSON/SVG/PNG/GraphML 图标导出按钮，PNG 截图不可用时自动回退到 SVG。验证：`npm test -- --run tests/graphExport.test.ts tests/GraphCanvas.test.tsx` 通过 40 项；`npm run lint` 通过。
- 2026-05-31 07:49 CST：补齐图谱选择与固定：使用 ReactFlow 框选/多选能力，新增开启框选、固定选中节点、取消固定选中节点；固定节点会禁用拖拽并忽略位置变更。补充选择回调去重保护，避免空选择反复 setState 导致测试环境循环渲染。验证：`npm test -- --run tests/GraphCanvas.test.tsx tests/GraphCanvasDrag.test.tsx tests/i18n.test.tsx tests/graphStyles.test.js` 通过 46 项；`npm run lint` 通过。
- 2026-05-31 08:00 CST：补齐路径分析与强度分层：`graphPathInsights.ts` 新增最短路径、字段血缘路径和关系强度层纯函数；`GraphCanvas` 新增路径端点记忆、最短路径/字段血缘路径高亮、路径结果浮层、强/较可能/可能分层摘要，工作流状态条增加路径状态。验证：`npm test -- --run tests/graphPathInsights.test.ts tests/GraphCanvas.test.tsx` 通过 47 项；后续全量测试、构建和浏览器多端验证已在 08:34 CST 完成。
- 2026-05-31 08:10 CST：新增 3D 实验图谱视图：安装 `three`/`@types/three`，新增 `GraphCanvas3D`，工具区提供 2D/3D 切换，默认仍保持 2D 专业工作台；3D 视图在 WebGL 不可用环境中不崩溃。同步新增大图谱性能保护第一步：超过阈值时展示大图谱保护浮层和表/字段/维度聚类摘要。验证：`npm test -- --run tests/GraphCanvas.test.tsx` 通过 41 项；后续全量测试、构建和浏览器多端验证已在 08:34 CST 完成。
- 2026-05-31 08:12 CST：完成当前批次工程验证：`npm test -- --run` 通过 20 个测试文件、146 项测试；`npm run lint` 通过；`npm run build` 通过。构建提示主 JS chunk 超过 500 kB，原因是 3D/Three.js 纳入主包，后续性能工程应将 3D 视图改为动态 import/code split。
- 2026-05-31 08:14 CST：完成浏览器布局回归：默认图谱视图在 1440x900、1024x768、390x844 无横向溢出、标题不遮挡、画布可用；工具抽屉展开后新增图谱维度、路径分析、关系强度分层卡片均可见，桌面/平板/手机无横向溢出，手机端使用抽屉内部滚动。
- 2026-05-31 08:32 CST：完成第二阶段剩余性能工程：3D 图谱改为 `React.lazy` 动态加载并提供加载状态；`graphLayout.worker.ts` 独立执行大图谱布局，主线程保留同步回退；关系摘要分组采用 12 条一页的窗口化渲染和“显示更多”渐进加载；新增 `graphLayout.ts` 共享布局算法与序列化。验证：`npm test -- --run tests/GraphCanvas.test.tsx tests/graphLayout.test.ts` 通过 46 项；`npm run lint` 通过；`npm run build` 通过，主工作台包为 425.35 kB，3D 视图作为按需 chunk 输出，布局 Worker 独立输出 0.95 kB。
- 2026-05-31 08:34 CST：完成第二阶段最终回归：`npm test -- --run` 通过 21 个测试文件、151 项测试；`npm run lint` 通过；`npm run build` 通过。浏览器断点 1440x900、1024x768、390x844 均无横向溢出，关系图谱标题位于 heading 内未被遮挡，图谱画布保持可用；工具抽屉展开后尺寸正常；3D 图谱在桌面/平板/手机均可切换并显示画布，桌面首次懒加载后 1.5 秒内完成渲染。
- 2026-05-31 17:20 CST：完成第三阶段 AI 图谱动作基础能力：新增 AI 分析活动时间线；修复真实 AI `highlight_path` 只带 `suggestion_ids` 时无法执行的问题；全量测试 21 个文件、161 项通过，lint/build 通过，浏览器桌面和移动验证通过。
- 2026-05-31 17:39 CST：完成第三阶段导入建模向导基础版：`ImportPanel` 升级为五步紧凑向导，`DataExplorerPanel` 透传真实数据统计，CSS 增加抽屉内向导和移动断点保护；定向验证 `npm test -- --run tests/ImportPanel.test.tsx tests/DataExplorerPanel.test.tsx tests/Workspace.test.tsx tests/graphStyles.test.js` 通过 4 个测试文件、36 项测试。
- 2026-05-31 17:53 CST：修复导入抽屉响应式挂载层级：浏览器验证发现顶部导入入口在窄屏图谱模块下只聚焦按钮但不显示弹窗，根因是弹窗作为 `.data-explorer-panel` 后代被模块 CSS `display:none` 隐藏。新增回归断言 `dialog.closest(".data-explorer-panel") === null`，将抽屉渲染提升到 `Workspace` 根层。验证：`npm test -- --run` 通过 22 个测试文件、164 项测试；`npm run lint` 通过；`npm run build` 通过；浏览器 1440x900 和 390x844 下导入抽屉正常显示且横向溢出为 0。
- 2026-05-31 18:05 CST：完成字段映射和类型确认基础版：`ImportPanel` 接收 field 节点画像，支持业务类型下拉修正、主键候选标记/取消、字段确认和已确认进度；`Workspace` 将当前图谱节点透传给导入抽屉。验证：`npm test -- --run` 通过 22 个测试文件、165 项测试；`npm run lint` 通过；`npm run build` 通过；浏览器 390x844 下导入抽屉宽 372px，字段列表宽 348px，高度 220px 内部滚动，横向溢出为 0。
- 2026-05-31 18:16 CST：完成关系建模编辑器基础版：`ImportPanel` 接收当前关系候选，支持候选关系类型修正、证据质量标注和本地建模确认进度；`Workspace` 将真实 `suggestions` 透传到数据导入抽屉。当前为前端局部草稿闭环，尚未持久化到后端审核 API。验证：`npm test -- --run tests/ImportPanel.test.tsx tests/Workspace.test.tsx tests/graphStyles.test.js` 通过 3 个测试文件、36 项测试。
- 2026-05-31 18:30 CST：完成导入任务化基础版：App 维护最近导入任务，文件导入和示例导入会显示处理中、完成或失败状态；失败任务展示错误明细并可重试原文件/示例导入。当前基于现有同步导入 API 做前端任务层，后端异步任务和历史持久化保留为增强版。验证：`npm test -- --run tests/graphStyles.test.js tests/App.test.tsx tests/ImportPanel.test.tsx` 通过 3 个测试文件、20 项测试。
- 2026-05-31 18:46 CST：完成关系建模持久化审核提交：导入抽屉的“确认关系”会调用后端审核接口，提交关系类型、证据质量和 `accepted/edited` 状态；后端同步更新 `relationship_suggestions` 与关联 `graph_edges` 的类型、审核状态和证据质量元数据。定向验证：后端 `uv run pytest tests/test_graph_service.py tests/test_api.py` 通过 39 项；前端 `npm test -- --run tests/ImportPanel.test.tsx tests/Workspace.test.tsx tests/App.test.tsx` 通过 46 项。
- 2026-05-31 18:54 CST：补充导入抽屉滚动修复：提高 `.data-actions-dialog` 内 `intake-panel` 的样式优先级，确保长内容在桌面/移动端纵向滚动收纳，关系建模区域不被裁切；新增样式回归断言。浏览器验证 794x793 与 390x844 下 body、抽屉和关系候选列表横向溢出均为 0。
- 2026-05-31 19:20 CST：完成导入任务历史持久化基础：新增后端 `import_jobs` 记录成功/失败导入任务、`GET /api/projects/{project_id}/import-jobs` 历史接口、导入响应 `import_job_id`、前端启动加载历史任务；项目数据重置同步清理任务历史，避免任务表外键阻塞数据删除。定向验证：后端导入任务/API/重置测试通过，前端 `App` 任务历史测试通过。
- 2026-05-31 19:35 CST：完成关系建模编辑器增强版：导入抽屉新增规则配置条，支持按置信度阈值和关系类型过滤候选；对相同源/目标的重复候选生成可合并分组，可一键按最高置信候选类型批量确认并标记被合并候选为编辑状态。定向验证：`ImportPanel`、`Workspace`、i18n 和样式回归测试通过，TypeScript 检查通过。
- 2026-05-31 19:47 CST：完成导入任务化增强版：新增 `POST /api/projects/{project_id}/import-jobs` 异步任务接口，上传文件按 1MB 分块写入任务暂存目录并返回 202；后台任务更新 queued/running/succeeded/failed 进度，`GET /api/projects/{project_id}/import-jobs/{job_id}` 支持单任务轮询。前端文件导入改为创建任务、轮询进度、完成后刷新图谱和关系建议；失败重试继续复用原文件。定向后端/API、前端 App/ImportPanel/Workspace 和 TypeScript 验证通过。
- 2026-05-31 21:24 CST：完成产品化布局复检第一轮收口：新增笔记本矮屏 AI 面板样式护栏，`1366x768` 级别桌面三栏会给右侧洞察列保留更合理宽度，并压缩 AI 状态条、模式提示、建议按钮和输入区，避免 AI 对话区域被表单挤压到不可用。定向验证：`graphStyles`、`ChatPanel`、`Workspace` 测试通过；浏览器复检当前窄屏图谱、数据、洞察、导入抽屉、AI 设置弹窗、图谱工具抽屉和搜索浮层均无页面级横向溢出。
- 2026-05-31 21:28 CST：完成第四阶段当前批次验证：`npm test -- --run` 通过 22 个测试文件、171 项测试；`npm run lint` 通过；`npm run build` 通过。最终浏览器状态确认：当前图谱模块无打开弹窗/搜索/工具抽屉，页面级横向溢出为 0，关系图谱标题和画布区域保持可见。
- 2026-05-31 21:53 CST：继续完成移动端产品化细节收口：640px 以下顶部数据导入、AI 配置、搜索入口稳定为右上角 3 个 34px 图标按钮；导入弹窗关闭按钮统一为暗色工具按钮；移动端洞察 AI 状态区改为“状态卡一行、操作按钮独立一行”；低矮手机 `375x667` 下隐藏非必要空状态提示，保证输入框和“询问 AI”按钮完整可见。定向验证：`npm test -- --run tests/graphStyles.test.js tests/WorkbenchHeader.test.tsx tests/Workspace.test.tsx` 通过 33 项；浏览器复检 `390x844` 导入弹窗和 AI 面板、`375x667` AI 面板页面级横向溢出均为 0，低矮手机 AI 表单与状态栏保留 17px 间距。
- 2026-05-31 22:08 CST：继续收口底部状态栏产品化观感：`WorkbenchStatusBar` 拆分为图谱指标、工作台状态和恢复布局动作；桌面保留完整状态文本，移动端改为节点/边/审核/路径四个等宽指标槽位和单个恢复布局图标按钮，避免底部信息被省略成碎片。定向验证：`npm test -- --run tests/WorkbenchStatusBar.test.tsx tests/graphStyles.test.js tests/Workspace.test.tsx` 通过 33 项；浏览器复检 `1440x900`、`390x844`、`375x667` 下状态栏页面级横向溢出均为 0，移动端指标槽位稳定。
- 2026-05-31 22:46 CST：继续收口移动端图谱关系摘要浮层：640px 以下将关系摘要从多行卡片浮层改为 74px 低占用横向摘要条，关系组和关系卡片均横向滚动收纳，工具抽屉打开时继续隐藏摘要，避免与画布工具区争夺空间。定向验证：`npm test -- --run tests/graphStyles.test.js tests/GraphCanvas.test.tsx tests/Workspace.test.tsx` 通过 74 项；浏览器复检 `390x844`、`375x667` 下页面级横向溢出为 0，关系摘要高度 74px，和图例保持 70px 间距，打开工具抽屉时摘要隐藏且抽屉在画布内。
- 2026-05-31 22:55 CST：继续修复移动端图谱底部视觉堆叠：跨断点审计发现 640px 以下 MiniMap 与关系摘要局部重叠，已在手机端隐藏 MiniMap，桌面和平板仍保留 MiniMap。定向验证：`npm test -- --run tests/graphStyles.test.js tests/GraphCanvas.test.tsx` 通过 46 项；浏览器复检 `1440x900`、`1024x768`、`390x844`、`375x667` 下页面级横向溢出为 0，手机端 MiniMap 显示为 `none`，摘要与图例重叠面积为 0。
- 2026-05-31 23:10 CST：继续进行页面/弹窗/抽屉跨状态审计，发现移动端搜索浮层在输入后会占用 362-402px 高度并覆盖过多图谱视图；已将 640px 以下搜索面板改为紧凑网格，限制整体高度和结果列表高度，低矮手机 `375x667` 进一步压缩到 184px。定向验证：`npm test -- --run tests/graphStyles.test.js tests/WorkbenchHeader.test.tsx` 通过 5 项；浏览器复检 `390x844` 搜索高度 227px、`375x667` 搜索高度 184px，页面级横向溢出为 0。
- 2026-05-31 23:21 CST：修复低矮手机图谱工具抽屉断点优先级：在 `max-width: 640px` 且 `max-height: 720px` 下将抽屉限制为 `max-height: min(48vh, 300px)`，覆盖前序手机通用规则，避免工具面板在 `375x667` 视口过度占用画布。定向验证：`npm test -- --run tests/graphStyles.test.js tests/GraphCanvas.test.tsx` 通过 46 项；浏览器复检 `375x667` 下页面级横向溢出为 0，抽屉计算 `max-height` 为 300px，实际盒子约 302px，位于图谱卡片内且不遮挡状态栏。
- 2026-05-31 23:37 CST：继续跨状态审计移动洞察模块，发现低矮手机 `375x667` 的“洞察 / AI”对话消息区只剩约 37px。已压缩低矮手机下 AI 状态条和对话表单，表单改为“标签一行、输入框和提交按钮同一行”，并为消息区增加 `112px` 最低可读高度；同时将 AI 设置面板补齐 `role="dialog"`、`aria-modal` 和标题关联。定向验证：`npm test -- --run tests/graphStyles.test.js tests/ChatPanel.test.tsx tests/Workspace.test.tsx` 通过 41 项；浏览器复检 `375x667` 下 AI 消息区约 182px，输入框与提交按钮同高同排，页面级横向溢出为 0，表单不遮挡底部状态栏。
- 2026-05-31 23:43 CST：完成修复后总布局审计：覆盖 `1440x900`、`1024x768`、`390x844`、`375x667` 的图谱默认、工具抽屉、搜索、数据导入、AI 设置，以及平板/手机的数据模块、洞察模块、洞察 AI 标签页共 29 个状态组合。审计结果 `problems=[]`：页面级横向溢出为 0，无关键组件出界，无图谱/聊天可用区域过小，无搜索、抽屉、摘要、表单和状态栏互相遮挡；AI 设置弹窗保留 `role="dialog"`、`aria-modal="true"` 和标题关联。完整验证：`npm test -- --run` 通过 22 个测试文件、171 项测试；`npm run lint` 通过；`npm run build` 通过。
- 2026-06-01 00:08 CST：完成第五阶段产品化质量护栏：新增 `frontend/scripts/audit-layout.mjs` 和 `npm run audit:layout`，使用无新增依赖的 Chrome DevTools 协议自动审计 5 个断点 x 9 个状态，共 45 个组合；脚本自动注入示例图谱 API mock，输出 `tmp-layout-audit-auto/layout-audit.json`、`layout-audit-summary.json` 和截图。首次真实审计结果 `problemCount=0`、`resultCount=45`。同步新增 `tests/layoutAuditScript.test.js` 锁定命令和审计覆盖范围。
- 2026-06-01 00:11 CST：完成第五阶段最终验证：`npm test -- --run` 通过 23 个测试文件、173 项测试；`npm run lint` 通过；`npm run build` 通过；`npm run audit:layout` 再次通过 45 个断点/状态组合，报告 `problemCount=0`、`resultCount=45`。
- 2026-06-01 00:43 CST：继续补齐弹窗键盘可访问性：新增 `useDialogFocusTrap`，接入 AI 设置弹窗和数据导入弹窗；两个弹窗打开后自动聚焦关闭按钮，Tab/Shift+Tab 在弹窗内循环，Escape 关闭并恢复焦点到原入口按钮。`audit:layout` 同步增加真实浏览器 Escape 关闭和初始焦点检查。定向验证：`npm test -- --run tests/layoutAuditScript.test.js tests/Workspace.test.tsx` 通过 2 个测试文件、32 项测试。
- 2026-06-01 00:48 CST：修正自动审计脚本的用户点击模拟：打开弹窗前先聚焦触发按钮，再执行 click，确保焦点恢复检查与真实键盘/鼠标使用一致。`npm run audit:layout` 通过 45 个断点/状态组合，报告 `problemCount=0`、`resultCount=45`。
- 2026-06-01 11:20 CST：继续补齐 tablist 键盘导航：新增 `useRovingTabNavigation`，顶部工作台模块 tabs 与右侧洞察 tabs 支持 ArrowLeft/ArrowRight/ArrowUp/ArrowDown、Home、End 切换并聚焦目标 tab。定向验证：`npm test -- --run tests/WorkbenchHeader.test.tsx tests/InsightPanel.test.tsx` 通过 2 个测试文件、6 项测试。
- 2026-06-01 11:22 CST：完成 tablist 键盘导航最终验证：`npm test -- --run` 通过 23 个测试文件、177 项测试；`npm run lint` 通过；`npm run build` 通过；`npm run audit:layout` 通过 45 个断点/状态组合，报告 `problemCount=0`、`resultCount=45`。
- 2026-06-01 11:47 CST：继续补齐搜索浮层键盘可访问性：`WorkbenchHeader` 搜索结果升级为 `listbox/option` 语义，输入框支持 ArrowDown/ArrowUp 进入结果，结果项支持 ArrowUp/ArrowDown/Home/End 切换，Enter/Space 选择节点，Escape 关闭搜索并恢复焦点到搜索入口。同步扩展 `audit:layout`，真实浏览器会在 5 个断点的搜索状态校验方向键导航、选中状态、Escape 关闭和焦点恢复；同时修正审计脚本对 React 受控输入的输入模拟。验证：`npm test -- --run` 通过 23 个测试文件、179 项测试；`npm run lint` 通过；`npm run build` 通过；`npm run audit:layout` 通过 45 个断点/状态组合，报告 `problemCount=0`、`resultCount=45`。
- 2026-06-01 12:09 CST：继续收敛专业工作台顶部入口：新增全局命令面板，顶部以命令图标按钮打开，`Ctrl/Cmd+K` 可快速唤起；面板支持命令过滤、方向键移动、Enter/Space 执行、Escape 关闭并恢复焦点，可直达图谱/数据/洞察模块、数据导入、AI 配置和恢复布局。同步将审计脚本从 header 按钮序号选择器改为稳定 aria 选择器，避免新增入口后误点弹窗；`audit:layout` 新增命令面板状态和键盘审计，覆盖 5 个断点 x 10 个状态共 50 个组合。真实审计发现移动端命令面板因 padding 计入宽度导致右侧出界，已通过 `box-sizing: border-box` 修复。阶段验证：`npm test -- --run tests/layoutAuditScript.test.js tests/Workspace.test.tsx tests/graphStyles.test.js` 通过 37 项；`npm run audit:layout` 通过 50 个断点/状态组合，报告 `problemCount=0`、`resultCount=50`。
- 2026-06-01 13:18 CST：继续专业化全局命令面板：每条命令增加操作说明和可见快捷键提示，面板头部显示当前过滤结果数量；搜索时数量实时收敛，帮助用户判断当前命令范围。样式上改为分类、命令文案、快捷键三列布局，并为移动端保留收窄列宽。验证：`npm test -- --run tests/Workspace.test.tsx tests/i18n.test.tsx tests/graphStyles.test.js` 通过 38 项；`npm run audit:layout` 通过 50 个断点/状态组合，报告 `problemCount=0`、`resultCount=50`。
- 2026-06-01 13:35 CST：继续收敛左侧资源树职责：移除待审核行中常驻的关系类型文案，将 `76% · 派生维度` 这类展示改为 `待确认 · 76%`，避免左侧承担关系图例/关系类型分析职责；关系类型仍保留在图谱图例、关系摘要、证据和右侧审核建模流程中。同步调整命令面板“数据”说明，避免暗示左侧是关系类型资源树。验证：`npm test -- --run tests/workbenchStats.test.ts tests/DataExplorerPanel.test.tsx tests/Workspace.test.tsx tests/graphStyles.test.js tests/i18n.test.tsx` 通过 45 项；`npm run audit:layout` 通过 50 个断点/状态组合，报告 `problemCount=0`、`resultCount=50`。
- 2026-06-01 14:38 CST：继续专业化图谱视图承载方式：新增标题栏“图谱分析抽屉”入口，将可见关系、邻域摘要、AI 证据路径和路径分析结果迁移到右侧按需抽屉，默认画布只保留图例、性能保护和详情等操作态元素；`audit:layout` 新增 `graph-analysis-drawer` 状态覆盖。定向验证：`npm test -- --run tests/GraphCanvas.test.tsx tests/GraphCanvasPreview.test.tsx tests/Workspace.test.tsx tests/graphStyles.test.js tests/layoutAuditScript.test.js` 通过 85 项；`npm run lint` 通过；`npm run build` 通过。
- 2026-06-01 14:39 CST：完成产品化优化方案最终门禁：`npm test -- --run` 通过 23 个测试文件、181 项测试；`npm run lint` 通过；`npm run build` 通过；`GRAPHMIND_AUDIT_SCREENSHOTS=0 npm run audit:layout` 通过 55 个断点/状态组合，报告 `problemCount=0`、`resultCount=55`。当前计划所有显式任务均为完成状态。
- 2026-06-02 00:24 CST：继续完善亮暗主题产品化体验：主题切换现在同步到 `html`、`body` 和根工作台，覆盖浏览器 `color-scheme`、文本选区、表单 accent、占位文字、命令面板计数/快捷键、数据导入抽屉错误态和 AI 活动条亮色表面；命令面板支持“主题”搜索并执行亮暗切换。验证：定向 `Workspace`/`graphStyles` 37 项通过；全量 `npm test -- --run` 24 个测试文件、188 项通过；`npm run lint`、`npm run build` 通过；`GRAPHMIND_AUDIT_SCREENSHOTS=0 npm run audit:layout` 通过 60 个断点/状态组合，报告 `problemCount=0`。真实浏览器复检亮色主题、命令面板、数据导入抽屉和 AI 配置弹窗均无页面级横向溢出。
- 2026-06-02 01:05 CST：完成 UI/UX Pro Max 全面精修当前批次：`GraphCanvas` 标题区新增可见节点/关系/置信度指标轨，图谱图例改为紧凑 4 列图标计数区；`ChatPanel` 将标题和模型模式说明合并为紧凑头部，AI 标签以小型状态胶囊承载，减少右侧洞察区域压迫。同步补齐 `graph.visibleSummary` 中英文 i18n。验证：定向 `Workspace`/`graphStyles`/`GraphCanvas`/`ChatPanel` 4 个文件 90 项通过；全量 `npm test -- --run` 24 个测试文件、188 项通过；`npm run lint` 通过；`npm run build` 通过；`GRAPHMIND_AUDIT_SCREENSHOTS=0 npm run audit:layout` 通过 60 个视口/状态组合。真实浏览器复检默认图谱、亮色主题、命令面板、数据导入弹窗、AI 和向量设置弹窗、洞察 AI 标签页均无页面级横向溢出，图谱标题不遮挡，AI 消息区保留可读高度。
