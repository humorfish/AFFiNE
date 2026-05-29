# Story App 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 Story 桌面应用，集成 BlockSuite 编辑器、LLMClient AI 面板、工作区管理和弹窗导航系统。

**Architecture:** 轻量级集成方案。保留现有 StoryProvider 架构，用 TestWorkspace 创建 BlockSuite 文档替代 textarea，用 @affine/ai LLMClient 替代 AI 占位面板。新增 WorkspaceProvider 管理工作区目录，所有导航改为弹窗模式。

**Tech Stack:** React 19, TypeScript, BlockSuite (TestWorkspace + Store), @affine/ai (LLMClient + APIKeyStore), Electron (dialog.showOpenDialog via IPC)

---

## File Structure

```
packages/frontend/core/src/components/story-layout/
├── modal.tsx                 # Task 1: 通用弹窗组件
├── workspace-provider.tsx    # Task 2: 工作区上下文 + 首次启动弹窗
├── story-context.tsx         # Task 3: 改造 — 移除 path, 新增 BlockSuite doc 管理
├── story-layout.tsx          # Task 4: 改造 — 接入 WorkspaceProvider + 弹窗状态
├── story-sidebar.tsx         # Task 5: 改造 — 移除内嵌面板, 点击开弹窗
├── story-editor-panel.tsx    # Task 6: 改造 — textarea → BlockSuite Editor
├── story-ai-panel.tsx        # Task 7: 改造 — 占位 → LLMClient 聊天
├── chapters-dialog.tsx       # Task 8: 章节管理弹窗
├── new-project-dialog.tsx    # Task 9: 新建项目弹窗
├── settings-dialog.tsx       # Task 10: 设置弹窗 (从 settings-page.tsx 迁移)
├── placeholder-dialog.tsx    # Task 11: 占位弹窗模板
└── story-layout.css          # 已有, 可能需要补充弹窗动画样式
```

---

### Task 1: 通用弹窗组件

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/modal.tsx`

- [ ] **Step 1: 创建 Modal 组件**

```tsx
// packages/frontend/core/src/components/story-layout/modal.tsx
import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const THEME = {
  overlay: 'rgba(0, 0, 0, 0.5)',
  panel: '#16162a',
  panelBorder: '#2a2a4a',
  text: '#e0e0e0',
  textMuted: '#8888aa',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  dismissible?: boolean; // default true; false = 不可关闭（工作区选择用）
  children: ReactNode;
}

export function Modal({ open, onClose, title, width = 560, dismissible = true, children }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        onClose();
      }
    },
    [onClose, dismissible]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  const handleOverlayClick = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: THEME.overlay,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width,
          maxWidth: '90vw',
          maxHeight: '85vh',
          background: THEME.panel,
          border: `1px solid ${THEME.panelBorder}`,
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${THEME.panelBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              color: THEME.text,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {title}
          </span>
          {dismissible && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: THEME.textMuted,
                cursor: 'pointer',
                fontSize: 18,
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px',
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd /Users/youqw/github/story && npx tsc --noEmit packages/frontend/core/src/components/story-layout/modal.tsx 2>&1 | head -20`

Expected: 无类型错误（或仅有 import 路径相关可忽略的警告）

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/core/src/components/story-layout/modal.tsx
git commit -m "feat(story): add generic Modal component with portal rendering"
```

---

### Task 2: 工作区上下文 + 首次启动弹窗

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/workspace-provider.tsx`

这个任务创建 WorkspaceProvider 上下文和首次启动时的工作区选择弹窗。

- [ ] **Step 1: 创建 WorkspaceProvider**

```tsx
// packages/frontend/core/src/components/story-layout/workspace-provider.tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { Modal } from './modal';

const STORAGE_KEY = 'story-workspace-path';

interface WorkspaceContextValue {
  workspacePath: string | null;
  setWorkspacePath: (path: string) => void;
  isReady: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspacePath, setWorkspacePathState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  const setWorkspacePath = useCallback((path: string) => {
    localStorage.setItem(STORAGE_KEY, path);
    setWorkspacePathState(path);
  }, []);

  const isReady = workspacePath !== null;

  const value = useMemo(() => ({ workspacePath, setWorkspacePath, isReady }), [workspacePath, setWorkspacePath, isReady]);

  if (!isReady) {
    return (
      <WorkspaceContext.Provider value={value}>
        <WorkspacePickerModal onSelect={setWorkspacePath} />
      </WorkspaceContext.Provider>
    );
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

// --- Workspace Picker Modal (首次启动) ---

function WorkspacePickerModal({ onSelect }: { onSelect: (path: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [customPath, setCustomPath] = useState('');

  const handleBrowse = useCallback(async () => {
    setError(null);
    try {
      // Electron IPC: 打开目录选择对话框
      const { apis } = await import('@affine/electron-api');
      const result = await apis?.dialog?.openDialog?.({
        type: 'folder',
        title: '选择工作区目录',
      });
      if (result && typeof result === 'string') {
        onSelect(result);
      } else if (result && Array.isArray(result) && result.length > 0) {
        onSelect(result[0]);
      }
    } catch {
      // 非 Electron 环境或 IPC 不可用，使用手动输入
      setError('无法打开文件选择器，请手动输入路径');
    }
  }, [onSelect]);

  const handleManualSet = useCallback(() => {
    if (!customPath.trim()) {
      setError('请输入目录路径');
      return;
    }
    onSelect(customPath.trim());
  }, [customPath, onSelect]);

  return (
    <Modal open={true} onClose={() => {}} title="选择工作区" dismissible={false}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ color: '#8888aa', fontSize: 14 }}>欢迎使用 Story！请选择一个目录作为你的工作区，所有项目数据将保存在此目录中。</div>

        <button
          onClick={handleBrowse}
          style={{
            padding: '12px 20px',
            background: '#6c5ce7',
            border: 'none',
            borderRadius: 8,
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          选择目录...
        </button>

        <div style={{ color: '#8888aa', fontSize: 12, textAlign: 'center' }}>或者手动输入路径：</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={customPath}
            onChange={e => setCustomPath(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleManualSet();
            }}
            placeholder="/Users/me/story-workspace"
            style={{
              flex: 1,
              padding: '8px 12px',
              background: '#0f0f23',
              border: '1px solid #333366',
              borderRadius: 6,
              color: '#e0e0e0',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={handleManualSet}
            style={{
              padding: '8px 16px',
              background: '#6c5ce7',
              border: 'none',
              borderRadius: 6,
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            确认
          </button>
        </div>

        {error && <div style={{ color: '#e74c3c', fontSize: 13 }}>{error}</div>}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit packages/frontend/core/src/components/story-layout/workspace-provider.tsx 2>&1 | head -20`

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/core/src/components/story-layout/workspace-provider.tsx
git commit -m "feat(story): add WorkspaceProvider with first-launch directory picker"
```

---

### Task 3: StoryContext 改造

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-context.tsx`

移除 `createProject` 的 `path` 参数，改为接收 `workspacePath` 自动生成项目路径。

- [ ] **Step 1: 改造 StoryContext**

核心改动：

1. `createProject` 签名改为 `(input: { title, author, description, wordCountTarget }, workspacePath: string) => Promise<void>`
2. 项目路径自动生成为 `{workspacePath}/projects/{id}/`
3. 新增 `createChapterDoc` 逻辑（后续 Task 6 替换为 BlockSuite，此处先用空内容）
4. 移除 `openProject` 的 path 参数，改为从 workspace 扫描已有项目

修改 `story-context.tsx` 中 `NovelProject` 接口：

```tsx
export interface NovelProject {
  id: string;
  path: string; // {workspacePath}/projects/{id}/
  meta: {
    title: string;
    author: string;
    description: string;
    wordCountTarget: number;
    createdAt: string;
    updatedAt: string;
  };
}
```

修改 `createProject` 方法：

```tsx
const createProject = useCallback(async (input: { title: string; author: string; description: string; wordCountTarget: number }, workspacePath: string) => {
  setLoading(true);
  setError(null);
  try {
    const id = crypto.randomUUID();
    const projectPath = `${workspacePath}/projects/${id}`;
    const newProject: NovelProject = {
      id,
      path: projectPath,
      meta: {
        title: input.title,
        author: input.author,
        description: input.description,
        wordCountTarget: input.wordCountTarget,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    setProject(newProject);
    setChapters([]);
    setActiveChapterIndex(null);
    // TODO(story): write project.json to projectPath via Electron IPC
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    setLoading(false);
  }
}, []);
```

修改 `StoryContextValue` 接口的 `createProject` 签名，移除 `openProject`（后续通过项目列表恢复），其余保持不变。

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit packages/frontend/core/src/components/story-layout/story-context.tsx 2>&1 | head -20`

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/core/src/components/story-layout/story-context.tsx
git commit -m "refactor(story): remove path param from createProject, auto-generate project path"
```

---

### Task 4: StoryLayout 改造

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-layout.tsx`

接入 WorkspaceProvider，管理弹窗状态。

- [ ] **Step 1: 改造 StoryLayout**

核心改动：

1. 顶层包裹 `WorkspaceProvider`
2. 管理当前打开的弹窗 ID (`activeModal: string | null`)
3. 根据弹窗 ID 渲染对应的 Dialog 组件
4. 无工作区时只显示 WorkspacePickerModal

```tsx
// story-layout.tsx 关键结构
import { WorkspaceProvider } from './workspace-provider';
import { Modal } from './modal';
// ... 其他 import

type ModalId = 'chapters' | 'characters' | 'worldview' | 'roadmap' | 'sparks' | 'graph' | 'settings' | 'new-project' | null;

export const StoryLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalId>(null);

  // ... handlers

  return (
    <WorkspaceProvider>
      <StoryProvider>
        <div style={styles.root}>
          {showSidebar && (
            <StorySidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(p => !p)}
              onNavClick={(id) => setActiveModal(id as ModalId)}
              onNewProject={() => setActiveModal('new-project')}
              theme={THEME}
            />
          )}
          <StoryEditorPanel
            focusMode={focusMode}
            onFocusToggle={() => setFocusMode(p => !p)}
            theme={THEME}
          />
          {showAIPanel && <StoryAIPanel ... />}
          {/* AI toggle button */}
        </div>

        {/* Modal rendering */}
        {activeModal === 'chapters' && (
          <ChaptersDialog open onClose={() => setActiveModal(null)} />
        )}
        {activeModal === 'new-project' && (
          <NewProjectDialog open onClose={() => setActiveModal(null)} />
        )}
        {activeModal === 'settings' && (
          <SettingsDialog open onClose={() => setActiveModal(null)} />
        )}
        {activeModal && !['chapters', 'new-project', 'settings'].includes(activeModal) && (
          <PlaceholderDialog
            open
            title={NAV_LABELS[activeModal]}
            onClose={() => setActiveModal(null)}
          />
        )}
      </StoryProvider>
    </WorkspaceProvider>
  );
};
```

Sidebar 的 `onNavClick` 回调替代原来的 `setActiveModule`。

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit packages/frontend/core/src/components/story-layout/story-layout.tsx 2>&1 | head -20`

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/core/src/components/story-layout/story-layout.tsx
git commit -m "refactor(story): integrate WorkspaceProvider and modal state into StoryLayout"
```

---

### Task 5: Sidebar 改造

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-sidebar.tsx`

移除底部内嵌面板，改为纯导航 + 回调。

- [ ] **Step 1: 简化 Sidebar**

核心改动：

1. 移除 `NewProjectForm` 组件和所有内嵌表单/列表
2. Sidebar Props 改为: `{ collapsed, onToggleCollapse, onNavClick, onNewProject, theme }`
3. 只保留：项目名称区 + 导航图标列表 + 折叠按钮
4. 导航项点击 → `onNavClick(id)`
5. 项目名称区点击或无项目时 → `onNewProject()`

```tsx
interface StorySidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavClick: (id: string) => void;
  onNewProject: () => void;
  theme: ThemeColors;
}

const NAV_ITEMS = [
  { id: 'chapters', label: '章节管理', icon: '📖' },
  { id: 'characters', label: '人物', icon: '👤' },
  { id: 'worldview', label: '世界观', icon: '🌍' },
  { id: 'roadmap', label: '路线图', icon: '📈' },
  { id: 'sparks', label: '火花', icon: '✨' },
  { id: 'graph', label: '图谱', icon: '🕸' },
  { id: 'settings', label: '设置', icon: '⚙' },
] as const;
```

移除：`directoryInputRef`, `showNewProjectForm`, `showNewChapterForm`, `NewProjectForm` 组件，所有内嵌章节列表/人物/设置面板代码。

保留：项目名称展示区（从 `useStory()` 读 `project`），导航按钮渲染。

- [ ] **Step 2: 验证编译**

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/core/src/components/story-layout/story-sidebar.tsx
git commit -m "refactor(story): simplify sidebar to nav-only, remove inline panels"
```

---

### Task 6: 新建项目弹窗

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/new-project-dialog.tsx`

- [ ] **Step 1: 创建 NewProjectDialog**

```tsx
// packages/frontend/core/src/components/story-layout/new-project-dialog.tsx
import { useCallback, useState } from 'react';

import { Modal } from './modal';
import { useStory } from './story-context';
import { useWorkspace } from './workspace-provider';

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewProjectDialog({ open, onClose }: NewProjectDialogProps) {
  const { createProject } = useStory();
  const { workspacePath } = useWorkspace();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || !workspacePath) return;
    setSaving(true);
    setError(null);
    try {
      await createProject(
        {
          title: title.trim(),
          author: author.trim() || 'Unknown',
          description: description.trim(),
          wordCountTarget: 100000,
        },
        workspacePath
      );
      onClose();
      setTitle('');
      setAuthor('');
      setDescription('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [title, author, description, workspacePath, createProject, onClose]);

  const canCreate = title.trim() && workspacePath;

  return (
    <Modal open={open} onClose={onClose} title="新建项目">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={styles.formGroup}>
          <label style={styles.label}>小说标题 *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
            }}
            placeholder="输入标题"
            style={styles.input}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>作者</label>
          <input type="text" value={author} onChange={e => setAuthor(e.target.value)} placeholder="作者名" style={styles.input} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>简介</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="简述你的故事..." rows={3} style={{ ...styles.input, resize: 'vertical' }} />
        </div>
        <div style={{ color: '#8888aa', fontSize: 12 }}>项目将保存至: {workspacePath}/projects/...</div>
        {error && <div style={{ color: '#e74c3c', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={styles.btnSecondary}>
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || saving}
            style={{
              ...styles.btnPrimary,
              opacity: canCreate && !saving ? 1 : 0.5,
            }}
          >
            {saving ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

const styles = {
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  label: { color: '#8888aa', fontSize: 12, fontWeight: 600 },
  input: {
    padding: '8px 12px',
    background: '#0f0f23',
    border: '1px solid #333366',
    borderRadius: 6,
    color: '#e0e0e0',
    fontSize: 13,
    outline: 'none',
  },
  btnPrimary: {
    padding: '8px 16px',
    background: '#6c5ce7',
    border: 'none',
    borderRadius: 6,
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  btnSecondary: {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid #2a2a4a',
    borderRadius: 6,
    color: '#8888aa',
    cursor: 'pointer',
    fontSize: 13,
  },
};
```

- [ ] **Step 2: 验证编译**

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/core/src/components/story-layout/new-project-dialog.tsx
git commit -m "feat(story): add NewProjectDialog with auto project path"
```

---

### Task 7: 章节管理弹窗

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/chapters-dialog.tsx`

- [ ] **Step 1: 创建 ChaptersDialog**

将原来 Sidebar 中的章节列表逻辑抽取为独立弹窗组件。

功能：

- 显示章节列表（可点击选中）
- 新建章节（标题输入 + 添加按钮）
- 删除章节（带确认）
- 关闭按钮

```tsx
// packages/frontend/core/src/components/story-layout/chapters-dialog.tsx
import { useCallback, useState } from 'react';

import { Modal } from './modal';
import { useStory } from './story-context';

interface ChaptersDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ChaptersDialog({ open, onClose }: ChaptersDialogProps) {
  const { project, chapters, activeChapterIndex, addChapter, selectChapter, deleteChapter, loading, error } = useStory();

  const [newTitle, setNewTitle] = useState('');
  const [showInput, setShowInput] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!newTitle.trim()) return;
    await addChapter(newTitle.trim(), '');
    setNewTitle('');
    setShowInput(false);
  }, [newTitle, addChapter]);

  const handleSelect = useCallback(
    async (index: number) => {
      await selectChapter(index);
      onClose(); // 选完章节后关闭弹窗
    },
    [selectChapter, onClose]
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      if (confirm('确定要删除这个章节吗？')) {
        await deleteChapter(index);
      }
    },
    [deleteChapter]
  );

  return (
    <Modal open={open} onClose={onClose} title="章节管理" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div style={{ padding: 8, background: 'rgba(231,76,60,0.15)', borderRadius: 4, color: '#e74c3c', fontSize: 12 }}>{error}</div>}

        {!project ? (
          <div style={{ color: '#8888aa', textAlign: 'center', padding: 20 }}>请先创建或打开一个项目</div>
        ) : (
          <>
            {/* New chapter input */}
            <div style={{ display: 'flex', gap: 8 }}>
              {showInput ? (
                <>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAdd();
                      if (e.key === 'Escape') {
                        setShowInput(false);
                        setNewTitle('');
                      }
                    }}
                    placeholder="章节标题"
                    autoFocus
                    style={{ flex: 1, ...inputStyle }}
                  />
                  <button onClick={handleAdd} disabled={!newTitle.trim()} style={btnPrimary}>
                    添加
                  </button>
                  <button
                    onClick={() => {
                      setShowInput(false);
                      setNewTitle('');
                    }}
                    style={btnSecondary}
                  >
                    取消
                  </button>
                </>
              ) : (
                <button onClick={() => setShowInput(true)} style={{ ...btnPrimary, width: '100%' }}>
                  + 新建章节
                </button>
              )}
            </div>

            {loading && <div style={{ color: '#8888aa', textAlign: 'center', fontSize: 12 }}>加载中...</div>}

            {/* Chapter list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {chapters.length === 0 ? (
                <div style={{ color: '#8888aa', fontSize: 13, textAlign: 'center', padding: 16 }}>暂无章节</div>
              ) : (
                chapters.map(ch => (
                  <div
                    key={ch.meta.index}
                    onClick={() => handleSelect(ch.meta.index)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      color: activeChapterIndex === ch.meta.index ? '#e0e0e0' : '#8888aa',
                      background: activeChapterIndex === ch.meta.index ? 'rgba(108, 92, 231, 0.15)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (activeChapterIndex !== ch.meta.index) e.currentTarget.style.background = 'rgba(108, 92, 231, 0.08)';
                    }}
                    onMouseLeave={e => {
                      if (activeChapterIndex !== ch.meta.index) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ch.meta.title}</span>
                    <button
                      onClick={e => handleDelete(e, ch.meta.index)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#8888aa',
                        cursor: 'pointer',
                        fontSize: 12,
                        opacity: 0.5,
                        flexShrink: 0,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#e74c3c';
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = '#8888aa';
                        e.currentTarget.style.opacity = '0.5';
                      }}
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: '#0f0f23',
  border: '1px solid #333366',
  borderRadius: 6,
  color: '#e0e0e0',
  fontSize: 13,
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  background: '#6c5ce7',
  border: 'none',
  borderRadius: 6,
  color: '#ffffff',
  cursor: 'pointer',
  fontSize: 13,
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  border: '1px solid #2a2a4a',
  borderRadius: 6,
  color: '#8888aa',
  cursor: 'pointer',
  fontSize: 13,
};
```

- [ ] **Step 2: 验证编译**

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/core/src/components/story-layout/chapters-dialog.tsx
git commit -m "feat(story): add ChaptersDialog with list, add, and delete"
```

---

### Task 8: 占位弹窗模板

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/placeholder-dialog.tsx`

- [ ] **Step 1: 创建 PlaceholderDialog**

```tsx
// packages/frontend/core/src/components/story-layout/placeholder-dialog.tsx
import { Modal } from './modal';

interface PlaceholderDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
}

export function PlaceholderDialog({ open, title, onClose }: PlaceholderDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={400}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 16px',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 36, opacity: 0.5 }}>🚧</span>
        <span style={{ color: '#8888aa', fontSize: 14 }}>{title}功能开发中</span>
        <span style={{ color: '#666688', fontSize: 12 }}>敬请期待</span>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add packages/frontend/core/src/components/story-layout/placeholder-dialog.tsx
git commit -m "feat(story): add PlaceholderDialog for unimplemented nav items"
```

---

### Task 9: 设置弹窗

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/settings-dialog.tsx`
- Modify: `packages/frontend/core/src/components/story-layout/settings-page.tsx` → 不再作为页面使用

将 `settings-page.tsx` 中的 LLM 配置和 Git 配置迁移到弹窗组件，新增工作区路径配置。

- [ ] **Step 1: 创建 SettingsDialog**

将 `settings-page.tsx` 的两个 Section 组件（`LLMSettingsSection`, `GitSettingsSection`）复用，包裹在 Modal 中，新增工作区路径 Section。

```tsx
// packages/frontend/core/src/components/story-layout/settings-dialog.tsx
import { Modal } from './modal';
import { useWorkspace } from './workspace-provider';
import { LLMSettingsSection } from './settings-page';
import { GitSettingsSection } from './settings-page';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { workspacePath, setWorkspacePath } = useWorkspace();

  return (
    <Modal open={open} onClose={onClose} title="设置" width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <WorkspaceSection workspacePath={workspacePath} onWorkspaceChange={setWorkspacePath} />
        <LLMSettingsSection />
        <GitSettingsSection />
      </div>
    </Modal>
  );
}

// --- 工作区路径配置 ---
function WorkspaceSection({ workspacePath, onWorkspaceChange }: { workspacePath: string | null; onWorkspaceChange: (path: string) => void }) {
  const handleBrowse = async () => {
    try {
      const { apis } = await import('@affine/electron-api');
      const result = await apis?.dialog?.openDialog?.({
        type: 'folder',
        title: '更改工作区目录',
      });
      if (result && typeof result === 'string') {
        onWorkspaceChange(result);
      } else if (Array.isArray(result) && result.length > 0) {
        onWorkspaceChange(result[0]);
      }
    } catch {
      // fallback: 忽略
    }
  };

  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>工作区</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            flex: 1,
            padding: '10px 14px',
            background: '#0f0f23',
            borderRadius: 8,
            border: '1px solid #333366',
            color: '#e0e0e0',
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {workspacePath ?? '未设置'}
        </div>
        <button
          onClick={handleBrowse}
          style={{
            padding: '10px 16px',
            background: '#6c5ce7',
            border: 'none',
            borderRadius: 8,
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          更改
        </button>
      </div>
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  background: '#16162a',
  borderRadius: 12,
  padding: 20,
  border: '1px solid #2a2a4a',
};

const sectionTitleStyle: React.CSSProperties = {
  color: '#e0e0e0',
  fontSize: 16,
  fontWeight: 600,
  margin: '0 0 16px 0',
  paddingBottom: 12,
  borderBottom: '1px solid #2a2a4a',
};
```

- [ ] **Step 2: 修改 settings-page.tsx 导出 Sections**

将 `LLMSettingsSection` 和 `GitSettingsSection` 改为具名导出，供 `settings-dialog.tsx` 引用。

在 `settings-page.tsx` 中：

- 将 `const LLMSettingsSection = () => {` 改为 `export const LLMSettingsSection = () => {`
- 将 `const GitSettingsSection = () => {` 改为 `export const GitSettingsSection = () => {`
- 保留 `export const SettingsPage` 不变（向后兼容）

- [ ] **Step 3: 验证编译**

- [ ] **Step 4: 提交**

```bash
git add packages/frontend/core/src/components/story-layout/settings-dialog.tsx
git add packages/frontend/core/src/components/story-layout/settings-page.tsx
git commit -m "feat(story): add SettingsDialog with workspace path config, export settings sections"
```

---

### Task 10: BlockSuite 编辑器集成

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-context.tsx` — 新增 BlockSuite doc 管理
- Modify: `packages/frontend/core/src/components/story-layout/story-editor-panel.tsx` — textarea → BlockSuite

这是最复杂的任务。需要先确认 BlockSuite 的 TestWorkspace 在当前项目构建中可用。

- [ ] **Step 1: 验证 BlockSuite 导入可用**

Run: `node -e "try { require('@blocksuite/affine/store/test'); console.log('OK'); } catch(e) { console.log('FAIL:', e.message); }"`

如果失败，尝试：
Run: `grep -r "TestWorkspace" blocksuite/affine/ --include="*.ts" -l | head -5`

确认导入路径后继续。

- [ ] **Step 2: 在 story-context.tsx 中新增 BlockSuite 文档管理**

在 `StoryProvider` 中添加 BlockSuite workspace 单例和章节文档管理：

```typescript
// 新增 imports
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { AffineSchemas } from '@blocksuite/affine/schemas';
import { Schema, Store, Text } from '@blocksuite/store';
import { NoopDocSource } from '@blocksuite/sync';
import { MemoryBlobSource } from '@blocksuite/sync';
import { nanoid } from 'nanoid';
```

在模块顶层创建 workspace 单例：

```typescript
// BlockSuite workspace 单例
const bsSchema = new Schema();
bsSchema.register(AffineSchemas);

const bsWorkspace = new TestWorkspace({
  id: 'story-editor',
  idGenerator: nanoid,
  docSources: { main: new NoopDocSource() },
  blobSources: { main: new MemoryBlobSource() },
});

function createChapterStore(chapterId: string): Store {
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

在 `StoryContextValue` 中新增：

```typescript
getChapterStore: (chapterIndex: number) => Store | null;
```

在 `StoryProvider` 中新增：

```typescript
const chapterStores = useMemo(() => new Map<number, Store>(), []);

const getChapterStore = useCallback(
  (chapterIndex: number): Store | null => {
    const existing = chapterStores.get(chapterIndex);
    if (existing) return existing;
    // 为章节创建 BlockSuite doc
    const store = createChapterStore(`ch-${chapterIndex}`);
    chapterStores.set(chapterIndex, store);
    return store;
  },
  [chapterStores]
);
```

在 `addChapter` 成功后自动创建 store：

```typescript
// 在 addChapter 的 try 块中，setChapters 之后：
const store = createChapterStore(`ch-${index}`);
chapterStores.set(index, store);
```

在 `deleteChapter` 时清理 store：

```typescript
// 在 deleteChapter 的 try 块中：
chapterStores.delete(index);
```

- [ ] **Step 3: 改造 StoryEditorPanel**

将 `<textarea>` 替换为 BlockSuite editor web component。

```tsx
// story-editor-panel.tsx 关键改动

import { useEffect, useRef } from 'react';
import { useStory } from './story-context';
import type { Store } from '@blocksuite/store';
import { EditorHost } from '@blocksuite/std';

// 在编辑器渲染部分，替换 textarea：
function BlockSuiteEditor({ store }: { store: Store }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !store) return;

    // 清空容器
    container.innerHTML = '';

    // 创建 EditorHost
    const editorHost = new EditorHost();
    editorHost.store = store;
    container.appendChild(editorHost);

    return () => {
      container.innerHTML = '';
    };
  }, [store]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px',
      }}
    />
  );
}
```

在 `StoryEditorPanel` 的编辑视图中，将：

```tsx
<textarea ... />
```

替换为：

```tsx
{
  activeChapterStore ? <BlockSuiteEditor store={activeChapterStore} /> : <div>加载编辑器失败</div>;
}
```

其中 `activeChapterStore` 通过：

```tsx
const activeChapterStore = activeChapterIndex !== null ? getChapterStore(activeChapterIndex) : null;
```

注意：如果 BlockSuite 的 `EditorHost` web component 渲染有问题（需要额外扩展注册），回退方案是保留 textarea 但加上富文本格式支持。

- [ ] **Step 4: 验证编译 + 运行测试**

Run: `./scripts/build-desktop.sh --skip-native --skip-install`

- [ ] **Step 5: 提交**

```bash
git add packages/frontend/core/src/components/story-layout/story-context.tsx
git add packages/frontend/core/src/components/story-layout/story-editor-panel.tsx
git commit -m "feat(story): integrate BlockSuite editor via TestWorkspace, replace textarea"
```

---

### Task 11: AI 面板改造

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-ai-panel.tsx`

用 `@affine/ai` 的 LLMClient 替代占位面板。

- [ ] **Step 1: 改造 StoryAIPanel**

核心改动：

1. 读取 APIKeyStore 获取已配置的模型
2. 用 LLMClient.stream() 实现流式聊天
3. 消息列表（用户消息 + AI 回复）
4. 预设操作按钮（续写、润色、分析）发送预定义 prompt

```tsx
// story-ai-panel.tsx 关键结构
import { useCallback, useEffect, useRef, useState } from 'react';
import { APIKeyStore, LLMClient } from '@affine/ai';
import { useStory } from './story-context';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface StoryAIPanelProps {
  onToggleCollapse: () => void;
  theme: ThemeColors;
}

export const StoryAIPanel = ({ onToggleCollapse, theme }: StoryAIPanelProps) => {
  const { chapters, activeChapterIndex } = useStory();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 获取当前配置的模型
  const config = APIKeyStore.list()[0]; // 使用第一个已配置的模型

  const getChapterContext = useCallback((): string => {
    if (activeChapterIndex === null) return '';
    const ch = chapters.find(c => c.meta.index === activeChapterIndex);
    return ch?.content ?? '';
  }, [chapters, activeChapterIndex]);

  const sendMessage = useCallback(async (userMessage: string, systemPrompt?: string) => {
    if (!config || streaming) return;

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setStreaming(true);

    try {
      const client = new LLMClient({
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        model: config.model,
      });

      const chapterCtx = getChapterContext();
      const fullSystemPrompt = systemPrompt ?? '你是一个专业的小说写作助手。';
      if (chapterCtx) {
        // 将当前章节内容作为上下文（截取最后 2000 字）
        const ctx = chapterCtx.slice(-2000);
        // 在第一条消息中附加上下文
      }

      let assistantContent = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const stream = client.stream(userMessage, {
        systemPrompt: fullSystemPrompt,
        temperature: 0.7,
      });

      for await (const chunk of stream) {
        assistantContent += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
          return updated;
        });
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `[错误] ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setStreaming(false);
    }
  }, [config, streaming, getChapterContext]);

  // 预设操作
  const actions = [
    { id: 'continue', label: '续写', prompt: '请根据以下内容续写故事，保持风格一致：' },
    { id: 'polish', label: '润色', prompt: '请润色以下段落，改善文字表达：' },
    { id: 'analyze', label: '分析', prompt: '请分析以下文本的写作技巧、人物塑造和情节发展：' },
  ] as const;

  const handleAction = useCallback((action: typeof actions[number]) => {
    const ctx = getChapterContext();
    if (!ctx) return;
    sendMessage(ctx, action.prompt);
  }, [getChapterContext, sendMessage]);

  // 自动滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!config) {
    return (
      // 未配置 API Key 的提示
      <div style={{ width: 320, ... }}>
        <div style={{ padding: 16, ... }}>
          <span>AI 助手</span>
          <button onClick={onToggleCollapse}>✕</button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ textAlign: 'center', color: theme.textMuted }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
            <div>请先在设置中配置 LLM API</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: 320, minWidth: 320, maxWidth: 320, background: theme.panel, borderLeft: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>AI 助手</span>
        <span style={{ color: theme.textMuted, fontSize: 11 }}>{config.model}</span>
        <button onClick={onToggleCollapse} style={{ background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
      </div>

      {/* Action buttons */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${theme.border}`, display: 'flex', gap: 6 }}>
        {actions.map(action => (
          <button
            key={action.id}
            onClick={() => handleAction(action)}
            disabled={streaming || activeChapterIndex === null}
            style={{
              flex: 1,
              padding: '6px 4px',
              border: `1px solid ${theme.border}`,
              borderRadius: 4,
              background: 'transparent',
              color: theme.textMuted,
              cursor: streaming ? 'default' : 'pointer',
              fontSize: 12,
              opacity: streaming ? 0.5 : 1,
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, fontSize: 13, opacity: 0.6, textAlign: 'center' }}>
            开始对话...
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: msg.role === 'user' ? theme.active : theme.background,
              color: msg.role === 'user' ? '#ffffff' : theme.text,
              fontSize: 13,
              lineHeight: 1.5,
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
              whiteSpace: 'pre-wrap',
            }}
          >
            {msg.content || (streaming && msg.role === 'assistant' ? '...' : '')}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: `1px solid ${theme.border}`, padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', background: theme.background, borderRadius: 6, padding: '8px 12px', border: `1px solid ${theme.border}` }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && input.trim()) sendMessage(input.trim()); }}
            placeholder="输入消息..."
            disabled={streaming}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: theme.text, fontSize: 13 }}
          />
          <button
            onClick={() => { if (input.trim()) sendMessage(input.trim()); }}
            disabled={streaming || !input.trim()}
            style={{ background: theme.active, border: 'none', borderRadius: 4, color: '#ffffff', cursor: 'pointer', padding: '4px 8px', fontSize: 12, opacity: streaming ? 0.5 : 1 }}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: 验证编译**

- [ ] **Step 3: 提交**

```bash
git add packages/frontend/core/src/components/story-layout/story-ai-panel.tsx
git commit -m "feat(story): replace AI placeholder with LLMClient streaming chat"
```

---

### Task 12: 整体联调 + 打包验证

**Files:**

- 所有 `story-layout/` 文件

- [ ] **Step 1: 全量编译检查**

Run: `npx tsc --noEmit --project packages/frontend/core/tsconfig.json 2>&1 | grep "story-layout" | head -20`

修复任何类型错误。

- [ ] **Step 2: 打包测试**

Run: `./scripts/build-desktop.sh --skip-native --skip-install`

- [ ] **Step 3: 运行应用验证**

打开打包后的 app，验证：

1. 首次启动弹出工作区选择弹窗
2. 选择目录后进入主界面
3. 左侧导航点击弹出对应弹窗
4. 新建项目弹窗正常工作
5. 章节管理弹窗可增删章节
6. 选中章节后编辑区加载 BlockSuite 编辑器
7. AI 面板可流式对话
8. 设置弹窗可修改工作区路径

- [ ] **Step 4: 最终提交**

```bash
git add -A packages/frontend/core/src/components/story-layout/
git commit -m "feat(story): complete Story app redesign with BlockSuite editor, AI chat, workspace management, and modal navigation"
```

---

## Spec Coverage Check

| 需求                       | 对应 Task          |
| -------------------------- | ------------------ |
| 工作区管理（首次启动弹窗） | Task 2             |
| 项目存储（自动路径）       | Task 3, 6          |
| 新建项目弹窗               | Task 6             |
| 左侧导航全部弹窗化         | Task 4, 5, 7, 8, 9 |
| BlockSuite 编辑器          | Task 10            |
| AI 面板 LLMClient          | Task 11            |
| 设置弹窗（含工作区路径）   | Task 9             |
