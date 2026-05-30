# Story App 重构设计

日期: 2026-05-29

## 目标

重构 Story 桌面应用，将当前的纯 textarea 原型升级为使用 AFFiNE 原生编辑器和 AI 的正式写作工具。

## 核心需求

1. **工作区管理**：首次启动强制选择工作区目录，缓存路径，可在设置中修改
2. **项目存储**：新建项目自动创建 `{工作区}/projects/{项目ID}/`，无需手动选路径
3. **新建项目**：弹窗模式
4. **左侧导航**：所有菜单项点击后均使用弹窗模式（章节+设置为真实内容，其余占位）
5. **编辑区**：使用 BlockSuite 编辑器替代 textarea
6. **AI 面板**：使用 @affine/ai LLMClient 替代占位面板

## 架构概览

```
┌──────────────────────────────────────────────────┐
│ Shell (标题栏 "Story")                            │
├──────────┬────────────────────────┬──────────────┤
│ Sidebar  │  BlockSuite Editor     │  AI Chat     │
│ (导航)    │  (中间编辑区)           │  Panel       │
│          │                        │  (右侧)      │
│ 点击 →   │                        │              │
│ 弹窗     │                        │              │
└──────────┴────────────────────────┴──────────────┘
```

## 模块设计

### 1. WorkspaceProvider — 工作区上下文

新增 React Context，管理：

- **状态**：`workspacePath: string | null`（工作区目录绝对路径）
- **持久化**：localStorage key `story-workspace-path`
- **行为**：
  - 应用启动时检查 localStorage
  - 无工作区 → 弹出强制弹窗（不可关闭），让用户选择目录
  - 选择后写入 localStorage 并验证目录可写
  - 提供 `setWorkspacePath()` 方法供设置页使用

```
WorkspaceProvider
├── workspacePath: string | null
├── setWorkspacePath(path: string): void
└── isReady: boolean  // 工作区已配置且可用
```

**首次启动流程**：
1. `WorkspaceProvider` 挂载
2. 读 localStorage → null
3. 渲染 `<WorkspacePickerModal>`（全屏遮罩，不可关闭）
4. 用户选择目录 → 验证 → 写入 localStorage → `setWorkspacePath`
5. 弹窗关闭，进入正常布局

### 2. 项目存储改造

**路径规则**：
- 工作区：用户选择的目录（如 `/Users/me/story-workspace`）
- 项目：`{工作区}/projects/{projectId}/`
- 章节文件：`{项目目录}/chapters/{chapterIndex}.ydoc`（BlockSuite 文档格式）

**新建项目弹窗**：
- 输入：标题、作者、简介、目标字数
- 自动生成 `projectId = nanoid()`
- 在 `StoryProvider.createProject` 中：
  1. 创建 `{工作区}/projects/{projectId}/` 目录
  2. 写入 `project.json`（项目元信息）
  3. 初始化 Git 仓库（如可用）

**取消**：原来的 `path` 输入框和"打开已有"按钮移除，新建项目不再需要选路径。

### 3. 弹窗系统

新增 `<Modal>` 组件（基于 React Portal）：

```tsx
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;  // 默认 560px
  children: ReactNode;
}
```

**特性**：
- Portal 渲染到 `document.body`
- 半透明黑色遮罩
- 居中白色面板（暗色主题下为深色面板）
- 点击遮罩关闭（工作区选择弹窗除外）
- ESC 关闭
- 过渡动画

**各导航项弹窗内容**：

| 导航项 | 弹窗标题 | 内容 |
|--------|---------|------|
| 章节管理 | 章节管理 | 章节列表 + 新建/删除/重命名 |
| 人物 | 人物管理 | 占位："开发中" |
| 世界观 | 世界观 | 占位："开发中" |
| 路线图 | 路线图 | 占位："开发中" |
| 火花 | 火花 | 占位："开发中" |
| 图谱 | 图谱 | 占位："开发中" |
| 设置 | 设置 | LLM API 配置 + Git 配置 + 工作区路径修改 |

**Sidebar 改造**：
- 移除底部子面板区域（当前内嵌的表单/列表）
- 导航项点击 → 调用 `openModal(itemId)`
- Sidebar 只保留：项目名称 + 导航图标按钮 + 折叠按钮

### 4. BlockSuite 编辑器集成

使用轻量方式创建 BlockSuite 文档：

```typescript
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { AffineSchemas } from '@blocksuite/affine/schemas';
```

**每个章节对应一个 BlockSuite 文档**：

```typescript
// 创建 workspace（应用级单例）
const bsWorkspace = new TestWorkspace({
  id: 'story-editor',
  idGenerator: nanoid,
  docSources: { main: new NoopDocSource() },
  blobSources: { main: new MemoryBlobSource() },
});

// 为章节创建文档
function createChapterDoc(chapterId: string): Store {
  const doc = bsWorkspace.createDoc(`chapter:${chapterId}`);
  const store = doc.getStore();
  doc.load(() => {
    const pageId = store.addBlock('affine:page', { title: new Text() });
    const noteId = store.addBlock('affine:note', {}, pageId);
    store.addBlock('affine:paragraph', {}, noteId);
  });
  return store;
}
```

**StoryEditorPanel 改造**：
- 当前章节的 `Store` 通过 `StoryContext` 获取
- `<textarea>` 替换为 `<BlockSuiteEditor>` 组件
- 编辑器内容变更时自动保存到文件（复用现有 debounce 逻辑）

**内容持久化**：
- 使用 `doc.exportYDoc()` 导出为 Yjs 二进制格式
- 保存为 `{项目}/chapters/{index}.ydoc`
- 打开项目时从文件加载：`doc.importYDoc(bytes)`

### 5. AI 面板改造

使用 `@affine/ai` 的 `LLMClient`：

```typescript
import { LLMClient } from '@affine/ai';
```

**AI 面板功能**：
- 聊天对话界面（消息列表 + 输入框）
- 调用 `LLMClient.chat()` 进行流式对话
- 上下文：当前选中章节的纯文本内容作为 system context
- 预设操作按钮：续写、润色、分析（调用 LLM 并将结果展示在聊天中）

**模型选择**：
- 读取 `APIKeyStore.list()` 的配置
- 默认使用第一个已配置的模型
- 面板顶部显示当前使用的模型名称

### 6. 设置页改造

从独立页面改为弹窗模式，增加工作区路径配置：

- LLM API 配置（保留现有逻辑）
- Git 配置（保留现有逻辑）
- **新增**：工作区路径
  - 显示当前工作区路径
  - "更改"按钮 → 选择新目录
  - 更改后刷新 `WorkspaceProvider`

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `story-layout/story-layout.tsx` | 改造：加入弹窗状态、WorkspaceProvider |
| `story-layout/story-context.tsx` | 改造：移除 path 参数，增加 BlockSuite doc 管理 |
| `story-layout/story-sidebar.tsx` | 改造：移除内嵌面板，点击导航开弹窗 |
| `story-layout/story-editor-panel.tsx` | 改造：textarea → BlockSuite Editor |
| `story-layout/story-ai-panel.tsx` | 改造：占位 → LLMClient 聊天 |
| `story-layout/modal.tsx` | 新增：通用弹窗组件 |
| `story-layout/workspace-provider.tsx` | 新增：工作区上下文 + 首次启动弹窗 |
| `story-layout/chapters-dialog.tsx` | 新增：章节管理弹窗 |
| `story-layout/settings-dialog.tsx` | 新增：设置弹窗（从 settings-page.tsx 迁移） |
| `story-layout/placeholder-dialog.tsx` | 新增：占位弹窗模板 |
| `story-layout/new-project-dialog.tsx` | 新增：新建项目弹窗 |

## 实现顺序

1. 弹窗系统 (`modal.tsx`)
2. 工作区管理 (`workspace-provider.tsx` + 首次启动弹窗)
3. Sidebar 改造（移除内嵌面板，接入弹窗）
4. 项目存储改造（新路径规则 + 新建项目弹窗）
5. BlockSuite 编辑器集成
6. AI 面板改造
7. 设置弹窗
