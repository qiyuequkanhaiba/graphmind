# GraphMind × Atria · 数据知识图谱智能问答

> 作品名称：GraphMind 数据知识图谱智能问答
> 参赛人 / 团队：qiyue
> 使用模型：Atria-Dawn-Preview（512K 上下文 / 64K 输出）
> GitHub 仓库：见邮件正文（`graphmind` 仓库）

---

## 一、创意介绍

**GraphMind** 是一款本地优先（local-first）的数据知识图谱应用：把 Excel / CSV 表格导入后，
自动分析字段画像、推断实体与关系、生成可编辑可导出的 2D/3D 关系图谱，所有结论都带**证据引用**。

它原本的问答引擎是纯规则实现：能解释 schema、能描述关系路径，但不会「说人话」——
回答干瘪、无法结合上下文做进一步解释。

**Atria-Dawn-Preview** 的 512K 上下文 + 64K 输出正好补齐这一环：把规则引擎产出的
「可信图谱答案 + 证据引用 + 检索证据」一次性交给 Atria，由它生成自然、严谨、带引用的
中文回答——**且严格不编造证据之外的字段与关系**（系统提示词约束）。

本 Demo 展示完整闭环：

```
导入销售订单 CSV → 自动建图谱 → 配置 Atria 作为 AI 引擎 → 提问 → 得到带引用的智能回答
```

## 二、主要功能（Demo 涵盖）

| 环节 | 功能 | 说明 |
| --- | --- | --- |
| 数据导入 | 上传 CSV / Excel / JSON，或一键导入内置示例数据 | 自动字段画像（类型/键候选/类别） |
| 图谱构建 | 实体识别 + 关系推断 | 表→字段→派生维度，节点边都带证据 |
| 可视化 | 2D / 3D 关系图浏览、搜索、高亮 | 支持导出 |
| **AI 智能问答** | 自然语言提问，Atria 生成带引用的答案 | 规则引擎先给出可信答案，Atria 再增强 |
| 证据链 | 每条回答标注引用字段 / 关系建议 | 点击引用可定位到图谱节点 |
| 设置管理 | AI Provider 可在界面内热切换 | 本 Demo 使用 Atria（OpenAI 兼容协议） |

## 三、使用方式

### 环境要求

- Python 3.11+（后端）
- Node.js 16+（前端构建，仅首次）
- Windows / macOS / Linux 均可

### 一键启动

```powershell
# 克隆仓库后，在仓库根目录执行
powershell -ExecutionPolicy Bypass -File demo\start-demo.ps1
```

脚本会自动完成：创建后端 venv → 安装依赖 → 构建前端 → 启动服务 → 打开浏览器。
首次约 3–5 分钟（装依赖），之后秒起。

也可以按 README 分别启动前后端（开发模式）：

```bash
# 后端
cd backend
python -m venv .venv
. .venv\Scripts\activate
pip install -e .
uvicorn graphmind.api.app:app --reload --host 127.0.0.1 --port 8000

# 前端
cd frontend
npm install
npm run dev
# 打开 http://127.0.0.1:5173
```

### 演示流程（对应录屏）

1. **打开应用**：浏览器访问 `http://127.0.0.1:8000`（一键脚本会自动打开）
2. **导入数据**：点击导入 → 选择 `demo/示例数据-销售订单.csv`（30 行销售订单，13 个字段）
   - 也可以点「导入示例数据」使用内置数据集
   - 观察：字段画像、关系建议、2D 图谱（表节点连着 13 个字段节点）
3. **配置 AI**：打开 AI 设置 → 导入 `demo/Atria-AI预设.json`，或手动填写：
   - Chat Provider：`OpenAI Compatible`
   - Base URL：`https://discovery-api.intern-ai.org.cn/v1`
   - Model：`Atria-Dawn-Preview`
   - API Key：（填写你的 key）
4. **智能问答**（示例问题）：
   - 「这个数据集有哪些字段？分别是什么含义？」
   - 「客户和产品类别之间是什么关系？」
   - 观察：答案由规则引擎提供证据 + Atria 润色成自然语言，并标注引用来源

## 四、技术架构

```
用户界面（React + ReactFlow / Three.js）
        │  HTTP /api
        ▼
FastAPI 后端
 ├── 导入服务    Excel/CSV/JSON → DuckDB + 字段画像
 ├── 图谱引擎    实体识别 → 关系推断 → 图节点/边
 ├── 规则问答    分类问题（schema 解释 / 关系路径）→ 可信答案 + 引用
 └── AI 增强     OpenAICompatibleChatProvider
                  ├─ 规则答案 + 引用 + 检索证据 打包成提示词
                  ├─ 调用 Atria-Dawn-Preview（/chat/completions）
                  └─ 失败自动降级回规则答案（answer_mode=rule_fallback）
```

## 五、Atria 接入细节（本次为 Demo 新增/修改的点）

1. **Provider 注册**：GraphMind 的 `openai-compatible` provider 直接支持 Atria，
   无需任何协议适配——在设置里选 OpenAI Compatible + 填 base_url / model / api_key 即用。
2. **超时可配置**（`backend/graphmind/services/ai_provider.py`、`schemas.py`）：
   新增 `ai.chat.timeout`（默认 90 秒）。大上下文模型生成长答案可能超过原来的 20 秒硬编码默认值。
3. **开发环境端点放行**（`backend/graphmind/services/http_json_transport.py`）：
   新增 `GRAPHMIND_AI_DEV_ALLOW_PRIVATE_ENDPOINT=1`，仅在非生产模式生效。
   用于透明代理 / NAT / 沙箱把公网域名解析到内网地址的调试场景；生产环境保持严格 SSRF 校验。
4. **一键预设**（`demo/Atria-AI预设.json`）：界面 AI 设置里「导入预设」，一键填入 Atria 配置
   （不含 api_key，安全）。

## 六、演示数据

`demo/示例数据-销售订单.csv`：30 行销售订单，字段含订单编号、日期、客户、客户等级、
销售渠道、产品类别、产品名称、数量、单价、金额、销售员、省份、回款状态。
导入后产生：13 个字段节点、8 条关系建议（派生维度）、多级引用链。

## 七、录屏脚本建议（1.5–2 分钟）

1. 打开浏览器 `http://127.0.0.1:8000`，展示主界面
2. 导入 `示例数据-销售订单.csv` → 展示生成的 2D 关系图谱（可切 3D）
3. 打开 AI 设置 → 导入 `Atria-AI预设.json` / 填写 key → 保存
4. 提问「这个数据集有哪些字段？分别是什么含义？」→ 展示 Atria 答案 + 引用
5. 提问「客户和产品类别之间是什么关系？」→ 展示答案中的证据链

## 八、环境与依赖

- 后端：Python 3.11+，FastAPI + DuckDB + SQLAlchemy + pandas（`backend/pyproject.toml`）
- 前端：React 18 + TypeScript + Vite + ReactFlow + Three.js（`frontend/package.json`）
- AI：Atria-Dawn-Preview，OpenAI 兼容协议（`POST {base_url}/chat/completions`）
- 数据全部保存在本地 `workspace/` 目录，不上传任何文件

## 九、源码上传 GitHub（提交邮件正文需要仓库链接）

仓库根目录即本目录。本地运行数据已通过 `.gitignore` 排除（`workspace/`、`.venv/`、
`node_modules/`、`dist/`、`*.sqlite3` 等），**API Key 不会被提交**。

**情况 A：已有 graphmind 仓库（推荐）**——一条命令完成 clone + 同步 + 提交 + 推送：

```powershell
powershell -ExecutionPolicy Bypass -File demo\push-to-github.ps1 `
  -RepoUrl "https://github.com/你的用户名/graphmind.git"
```

脚本自动用本机已下载的**便携版 Git 2.55**（`G:\work\Atria\tools\PortableGit`，
含凭据管理器，首次推送时浏览器弹出 GitHub 授权页），会 clone 你的仓库到
`G:\work\Atria\graphmind-repo`（保留原仓库历史），同步本次 Atria 集成的 14 个文件，
提交并推送。

也可以手动分步：

```bash
# 1) clone 你的仓库到本地（如 G:\work\Atria\graphmind-repo）
git clone https://github.com/你的用户名/graphmind.git G:\work\Atria\graphmind-repo

# 2) 用同步脚本精确覆盖 14 个改动文件（不影响仓库其它文件）
powershell -ExecutionPolicy Bypass -File demo\sync-to-repo.ps1 -TargetRepo "G:\work\Atria\graphmind-repo"

# 3) 提交并推送
cd G:\work\Atria\graphmind-repo
git add .
git commit -m "feat: integrate Atria-Dawn-Preview chat provider"
git push
```

**情况 B：全新仓库**——本地初始化后推送：

```bash
cd G:\work\Atria\graphmind-main
git init
git add .
git commit -m "GraphMind × Atria 数据知识图谱智能问答"
# 在 GitHub 网页新建空仓库 graphmind（不要勾选 README/gitignore）
git branch -M main
git remote add origin https://github.com/你的用户名/graphmind.git
git push -u origin main
```

没有 git 也可以：GitHub 网页新建空仓库 → 「uploading an existing file」→
把本地文件夹内容拖进去（多次拖直到传完）。

> 注意：`git` 版本过旧（如 1.9.x）会因 TLS 不兼容而推送失败，
> 请到 https://git-scm.com/download/win 安装新版本。

## 十、本次为接入 Atria 修改的文件清单

| 文件 | 改动 |
| --- | --- |
| `backend/graphmind/services/ai_provider.py` | 聊天超时默认 20s → 90s，支持 `ai.chat.timeout` 覆盖 |
| `backend/graphmind/api/schemas.py` | `AIChatSettings` 新增 `timeout` 字段（默认 90） |
| `backend/graphmind/services/http_json_transport.py` | 新增 `GRAPHMIND_AI_DEV_ALLOW_PRIVATE_ENDPOINT` 开发模式开关 |
| `backend/tests/test_ai_provider.py` | 同步默认超时断言 + 新增 timeout 覆盖测试 |
| `backend/tests/test_http_json_transport.py` | 新增开发放行 / 生产严格两个测试 |
| `backend/tests/test_api.py` | 默认 settings 响应新增 timeout 字段 |
| `docs/api/openapi-contract-summary.json` | AIChatSettings schema 快照同步 |
| `.gitignore` | 忽略本地运行目录 `workspace/` 与 `build/` 构建产物 |
| `demo/`（新增） | 示例数据、Atria 预设、一键启动/打包/仓库同步/一键推送脚本 |

本地仓库已用便携版 Git 2.55 初始化并提交（commit `de6b337`，365 个文件，
`workspace/`、`.venv`、`dist/` 等本地目录均未入库，无 API Key 泄漏）。

后端测试：351 passed / 4 failed（4 个失败为原项目在 Windows + FastAPI 0.142 下的
既有环境问题，与本次改动无关，已用原始压缩包对比验证）。
