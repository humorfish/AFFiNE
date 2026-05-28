# Story 产品设计文档

## 概述

将 AFFiNE 改造为一个面向网文作者的创意写作工具（Story）。去掉 Server/Cloud/登录功能，保留 Electron/APP 客户端（Web 端暂不优先），以 Git 作为文档存储和同步方案，集成 LLM 提供续写、火花生成等 AI 能力。

**注意**：本设计仅覆盖第一期（PC 端核心），后续期在第一期完成后另行设计。

## 产品定位

- **目标用户**：有经验的网文作者
- **核心价值**：随时随地记录灵感，PC 端高效创作，AI 辅助提升写作质量
- **平台**：PC（Electron）、移动端（Capacitor Android/iOS）
- **界面语言**：仅中文
- **视觉风格**：简洁暗色系

## 架构决策

### 改造策略：就地改造

在现有 AFFiNE 代码上删减 Cloud 模块，添加小说写作功能。

**理由**：

- BlockSuite 编辑器已完整集成（编辑、快捷键、文件处理），重写工作量巨大
- Cloud 代码边界较清晰（GraphQL 模块、auth 模块、fetch 服务），可逐步剥离
- 构建系统（Electron 打包、Capacitor 移动端）直接复用

### 编辑器：保留 BlockSuite

保留 AFFiNE 现有的 BlockSuite 块级编辑器，复用其富文本编辑能力。

### AI 面板：复用现有 UI，替换底层

复用现有 AI 面板的 UI 组件（约 80-90%），将底层 `CopilotClient` 网络层从 GraphQL 调用替换为直接调用用户提供的 LLM API Key。

### 数据同步：Git 中转

APP 和 PC 通过 Git 远程仓库中转同步。APP 采集的内容 push 到 Git remote，PC 端 pull 拉取。

### LLM 接入：用户自带 API Key

用户自行配置 API Key 和 Endpoint，支持 OpenAI / Claude / DeepSeek 等。Key 本地加密存储。

### 存储：一个项目 = 一个 Git 仓库

每本小说是一个独立的 Git 仓库。

### 文档格式：Markdown + JSON 混合

章节正文用 Markdown 存储（Git 友好），设定/人物/图谱等结构化数据用 JSON。

## 删除模块

| 模块         | 路径                               | 说明                     |
| ------------ | ---------------------------------- | ------------------------ |
| 后端服务     | `packages/backend/`                | 整个目录                 |
| Cloud 服务层 | `core/src/modules/cloud/`          | fetch、server、auth 服务 |
| 登录认证     | `core/src/components/affine/auth/` | 登录/注册/OAuth 组件     |
| GraphQL      | `core/graphql/`                    | GraphQL 客户端和查询     |
| 云端测试     | `tests/affine-cloud*`              | 云端 E2E 测试            |
| Docker       | `.docker/`                         | 容器配置                 |
| 支付订阅     | 分散在 core 中                     | Stripe/订阅相关代码      |

## 保留模块

| 模块       | 路径                                         | 说明                  |
| ---------- | -------------------------------------------- | --------------------- |
| 编辑器引擎 | `blocksuite/`                                | BlockSuite 块级编辑器 |
| 桌面端     | `apps/electron/`                             | Electron 应用         |
| 移动端     | `apps/android/`, `apps/ios/`, `apps/mobile/` | Capacitor 移动应用    |
| 主题       | `packages/common/theme/`                     | 暗色主题              |
| 原生模块   | `packages/frontend/native/`                  | Rust 原生模块         |
| 构建工具   | `tools/cli/`                                 | 构建工具链            |
| UI 组件库  | `packages/frontend/component/`               | 基础组件              |
| AI 面板 UI | `core/src/blocksuite/ai/`                    | AI 聊天面板 UI 组件   |

## 新增模块

### packages/frontend/git/ — Git 存储层

封装系统 git 命令调用，不内置 Git，依赖用户系统已安装的 git。

- `GitService`：核心服务
  - `init(path)` / `clone(url, path)` — 初始化/克隆仓库
  - `pull(path)` / `push(path)` — 同步
  - `add(path, files)` / `commit(path, message)` — 提交
  - `log(path, options)` — 历史记录
  - `status(path)` — 状态检查
  - `branch(path)` — 分支管理
  - `conflictDetect(path)` — 冲突检测与提示
- 通过 `child_process` 调用系统 git 命令
- 流式输出支持（进度、错误）

### packages/frontend/story/ — 小说业务层

小说创作的核心业务模块。

- `ProjectService` — 项目管理（创建/打开/关闭小说项目）
- `ChapterService` — 章节 CRUD
  - 创建/删除/排序章节
  - Markdown 导入导出
  - 字数统计 / 写作目标追踪
- `CharacterService` — 人物管理
  - 人物档案（姓名、性格、外貌、背景）
  - 人物关系图谱数据
  - 主角成长线（男主/女主）
- `WorldbuildingService` — 世界观设定
  - 自由 Markdown 文档管理
  - 设定分类（势力、地理、规则等）
- `RoadmapService` — 路线图/大纲
  - 思维导图模式展示
  - 章节与路线图节点关联
  - 结构化 JSON 数据
- `SparkService` — 火花管理
  - 火花创建/编辑/归档
  - 关联到章节/人物
  - 来源标记（APP语音、手动、AI生成）
- `GraphService` — 图谱数据
  - 人物关系图谱
  - 亮点/伏笔图谱
  - 情节线追踪

### packages/frontend/ai/ — LLM 集成层

替换现有 CopilotClient 的直接 LLM 调用层。

- `LLMClient` — 通用 LLM 调用客户端
  - 支持 OpenAI / Claude / DeepSeek API 格式
  - 流式响应处理（SSE）
  - 错误处理与重试
  - Token 用量追踪
- `APIKeyManager` — API Key 管理
  - 本地加密存储（通过 Electron safeStorage）
  - 多 Key 配置（不同模型用不同 Key）
  - 连接测试
- `PromptTemplateService` — Prompt 模板管理
  - 续写模板（带字数控制参数）
  - 火花生成模板
  - 润色/改写模板
  - 人物分析模板
  - 伏笔检查模板
  - 用户自定义模板
- `SparkGenerator` — 火花生成器
  - 基于上下文（章节内容、人物、世界观）生成创意点
  - 可指定方向（悬念、转折、冲突等）
- `ContinuationWriter` — 续写引擎
  - 基于前文内容续写
  - 字数控制参数
  - 风格一致性
- `VoiceTranscriber` — 语音转文字（APP 端）
  - 调用 Whisper API
  - LLM 整理为结构化笔记

## Git 仓库数据结构

```
my-novel/
├── book.json              # 元数据：书名、简介、作者、字数目标、创建时间
├── chapters/
│   ├── 001-开端.md        # 章节正文（Markdown + YAML frontmatter）
│   ├── 002-相遇.md
│   └── ...
├── characters/
│   ├── protagonist.json   # 人物设定（姓名/性格/外貌/关系/成长线）
│   └── ...
├── worldbuilding/
│   ├── 世界观.md
│   ├── 势力.md
│   └── ...
├── roadmap/
│   └── 路线图.json        # 思维导图/大纲结构化数据
├── sparks/
│   ├── spark-001.json     # 火花（内容/来源/关联/时间）
│   └── ...
└── graphs/
    ├── 人物关系.json
    └── 亮点图谱.json
```

## PC 端界面设计

### 三栏布局

**左栏（导航区，可折叠）**：

- 项目列表（切换不同小说）
- 模块导航：章节、人物、世界观、路线图、火花、图谱、设置
- 章节列表（当前选中模块的快捷导航）

**中栏（编辑器区）**：

- BlockSuite 富文本编辑器
- 章节正文编写
- 字数统计 / 写作目标进度条
- Markdown 导入导出
- 专注模式（隐藏两侧栏）

**右栏（AI 助手面板，可折叠）**：

- 复用现有 AI 面板 UI
- 功能入口：火花生成、续写（控字数）、润色、章节摘要、人物分析、伏笔检查、自由对话
- 上下文感知：根据当前编辑内容自动提供相关建议

### 模块视图

各导航模块在左栏展开时切换中栏内容：

- **章节管理**：中栏显示 BlockSuite 编辑器
- **人物管理**：中栏显示人物卡片列表 + 编辑面板
- **世界观**：中栏显示 Markdown 编辑器（设定文档列表）
- **路线图**：中栏显示思维导图视图
- **火花墙**：中栏显示瀑布流式火花卡片
- **图谱**：中栏显示力导向图（人物关系/亮点图谱）

## APP 端设计

### 三个核心功能

**语音采集**：

- 一键录音按钮
- 录音完成后调用 Whisper API 转文字
- LLM 整理成结构化笔记
- 标记所属项目和章节
- 保存为火花

**火花管理**：

- 查看所有火花（按项目/时间分类）
- 一键生成新火花（LLM 基于上下文）
- 关联到章节/人物
- 推送到 Git 仓库

**同步**：

- Git pull/push 操作
- 冲突提示
- 离线本地缓存
- 网络状态指示器

## AI 面板改造方案

### 复用部分

- `AIChatContent` — 聊天内容区 UI
- `AIChatMessages` — 消息列表渲染
- `AIChatComposer` — 输入区域
- Inline AI Panel — 选中文本的 AI 操作面板
- AI Action 体系 — 摘要、翻译、改写等 Action 定义

### 替换部分

- `CopilotClient` → 新的 `LLMClient`（直接调用用户 API Key）
- Session 管理 → 本地 IndexedDB 存储
- GraphQL 查询 → 直接 HTTP 请求到 LLM API
- 认证检查 → 移除
- Feature Flag → 本地配置

### 改造方式

实现 `LLMClientAdapter`，提供与现有 `CopilotClient` 相同的接口（流式响应、Session 管理），内部改为直接调用 LLM API。UI 层无需改动。

## 分期规划概览

本设计文档聚焦第一期实施。后续期在第一期完成后另行设计。

### 第一期：PC 端核心（本文档范围）

1. 删除 backend/cloud/auth 代码
2. 新增 Git 存储层
3. 新增小说业务层（章节管理优先）
4. 改造 AI 面板底层（LLMClient 替换 CopilotClient）
5. 实现三栏布局 UI

### 后续期（概要，待细化）

- **第二期**：人物管理、世界观设定、路线图（思维导图）、火花管理、图谱可视化
- **第三期**：APP 端（语音采集、火花管理、Git 同步）
- **第四期**：AI 增强（续写引擎、火花生成器、人物分析/成长线、伏笔检查、一键上传）
