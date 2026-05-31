# Story Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Story layout into a three-column system (chapter tree + editor + AI panel) with a top bar, novel switcher, todo panel, and session persistence.

**Architecture:** Flex-based three-column layout. Each column is a flex child with proper shrink/grow rules. Resize handle between editor and AI panel uses document-level mouse events. State managed via React context with localStorage persistence.

**Tech Stack:** React 19, TypeScript, BlockSuite editor, vanilla CSS-in-JS (inline styles matching existing pattern)

**Spec:** `docs/superpowers/specs/2026-05-31-story-layout-redesign.md`

---

## File Structure

### New files (in `packages/frontend/core/src/components/story-layout/`):

| File                       | Responsibility                                                             |
| -------------------------- | -------------------------------------------------------------------------- |
| `story-top-bar.tsx`        | Top navigation bar with three button groups                                |
| `story-novel-switcher.tsx` | Novel dropdown + create button at top of sidebar                           |
| `story-chapter-tree.tsx`   | Chapter tree (flat or 卷→章) replacing StorySidebar                        |
| `story-ai-panel.tsx`       | AI panel with 5 tabs, toolbar, chat (replaces existing story-ai-panel.tsx) |
| `story-todo-panel.tsx`     | Cross-novel todo popup from top bar                                        |
| `story-resize-handle.tsx`  | Draggable resize handle between editor and AI panel                        |
| `new-novel-dialog.tsx`     | Create novel dialog replacing new-project-dialog.tsx                       |
| `session-storage.ts`       | Session persistence read/write/restore logic                               |

### Modified files:

| File                     | Change                                                               |
| ------------------------ | -------------------------------------------------------------------- |
| `story-layout.tsx`       | Restructure to top bar + three columns, remove old sidebar/AI toggle |
| `story-context.tsx`      | Add Volume, NovelMeta, TodoItem models; multi-novel state            |
| `story-editor-panel.tsx` | Remove old focus mode/sidebar logic, keep editor core                |
| `index.ts`               | Update exports                                                       |

### Deleted files:

| File                     | Reason                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `story-sidebar.tsx`      | Replaced by story-chapter-tree.tsx + story-novel-switcher.tsx |
| `new-project-dialog.tsx` | Replaced by new-novel-dialog.tsx                              |

---

## Task 1: Data Models & Context — Volume, NovelMeta, TodoItem, Session

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/session-storage.ts`
- Modify: `packages/frontend/core/src/components/story-layout/story-context.tsx`

The context is the foundation — everything else depends on these types and hooks. We extend the existing `StoryContext` to support multi-novel, volumes, todos, and session persistence.

- [ ] **Step 1: Add new data model types to story-context.tsx**

At the top of `story-context.tsx`, after the existing imports, add these interfaces:

```typescript
export interface NovelMeta {
  id: string;
  title: string;
  mode: 'long' | 'short';
  targetWordCount?: number;
  targetChapterCount?: number;
  worldview: string;
  motivation?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Volume {
  id: string;
  title: string;
  order: number;
}

export interface ChapterMeta {
  id: string;
  docId: string;
  volumeId?: string;
  title: string;
  wordCount: number;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  novelId?: string;
  chapterId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  novelId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionState {
  activeNovelId: string;
  activeChapterIndex: number;
  aiPanelOpen: boolean;
  aiPanelWidth: number;
  activeAiTab: 'chat' | 'continue' | 'polish' | 'analyze' | 'explain';
  activeChatSessionId: string;
  sidebarCollapsed: boolean;
  chapterTreeExpandedVolumes: string[];
  savedAt: string;
}
```

- [ ] **Step 2: Extend StoryProvider state in story-context.tsx**

Add to the `StoryProvider` component's state and context value:

```typescript
// New state
const [novels, setNovels] = useState<NovelMeta[]>(() => {
  const saved = localStorage.getItem('story-novels');
  return saved ? JSON.parse(saved) : [];
});
const [activeNovelId, setActiveNovelId] = useState<string>(() => {
  const session = localStorage.getItem('story-session');
  return session ? JSON.parse(session).activeNovelId : '';
});
const [volumes, setVolumes] = useState<Volume[]>([]);
const [todos, setTodos] = useState<TodoItem[]>(() => {
  const saved = localStorage.getItem('story-todos');
  return saved ? JSON.parse(saved) : [];
});
const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
  const saved = localStorage.getItem('story-chat-sessions');
  return saved ? JSON.parse(saved) : [];
});
const [activeChatSessionId, setActiveChatSessionId] = useState<string>('');
```

Add CRUD actions for each new entity (novels, volumes, todos, chat sessions) and persist each to localStorage on change. Expose all via context value.

Keep the existing chapter/content logic but migrate `ChapterContent` to use the new `ChapterMeta` type. The existing `chapters` state should use `ChapterMeta[]`.

- [ ] **Step 3: Create session-storage.ts**

```typescript
import type { SessionState } from './story-context';

const SESSION_KEY = 'story-session';

export function saveSession(state: Partial<SessionState>): void {
  const prev = loadSession();
  const next = { ...prev, ...state, savedAt: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
}

export function loadSession(): SessionState | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
```

- [ ] **Step 4: Add session restore logic to StoryProvider**

At the top of `StoryProvider`, after state initialization, add a `useEffect` that loads the session on mount:

```typescript
useEffect(() => {
  const session = loadSession();
  if (!session) return;
  if (session.activeNovelId) setActiveNovelId(session.activeNovelId);
  if (session.activeChapterIndex !== undefined) selectChapter(session.activeChapterIndex);
  // Other state restored by the components themselves via context
}, []);
```

Add `useEffect` hooks that call `saveSession()` whenever `activeNovelId`, `activeChapterIndex`, or layout state changes. Debounce with 500ms.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-context.tsx
git add packages/frontend/core/src/components/story-layout/session-storage.ts
git commit -m "feat(story): add data models, multi-novel context, and session persistence"
```

---

## Task 2: Top Bar Component

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/story-top-bar.tsx`

The top bar is a single row with three groups: project info (left), navigation items (center), actions (right).

- [ ] **Step 1: Create story-top-bar.tsx**

```typescript
import { useCallback } from 'react';
import type { NovelMeta } from './story-context';

const NAV_ITEMS = [
  { id: 'chapters', label: '📖 章节管理' },
  { id: 'characters', label: '👤 人物' },
  { id: 'worldview', label: '🌍 世界观' },
  { id: 'roadmap', label: '📈 路线图' },
  { id: 'sparks', label: '✨ 火花' },
  { id: 'graph', label: '🕸 图谱' },
] as const;

const ACTION_ITEMS = [
  { id: 'todo', label: '📋 待办' },
  { id: 'sync', label: '🔄 同步' },
  { id: 'stats', label: '📊 统计' },
  { id: 'versions', label: '📁 版本' },
  { id: 'export', label: '📤 导出' },
  { id: 'settings', label: '⚙ 设置' },
] as const;

interface StoryTopBarProps {
  activeNovel: NovelMeta | null;
  activeChapterTitle: string;
  activeNavId: string | null;
  onNavClick: (id: string) => void;
  focusMode: boolean;
  onFocusToggle: () => void;
  aiPanelOpen: boolean;
  onAiPanelToggle: () => void;
}

export const StoryTopBar = ({
  activeNovel,
  activeChapterTitle,
  activeNavId,
  onNavClick,
  focusMode,
  onFocusToggle,
  aiPanelOpen,
  onAiPanelToggle,
}: StoryTopBarProps) => {
  return (
    <div style={styles.root}>
      {/* Left: project info */}
      <div style={styles.leftGroup}>
        <span style={styles.projectName}>Story</span>
        {activeNovel && (
          <span style={styles.chapterTitle}>{activeChapterTitle}</span>
        )}
      </div>

      {/* Center: nav items */}
      <div style={styles.centerGroup}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavClick(item.id)}
            style={{
              ...styles.navButton,
              ...(activeNavId === item.id ? styles.navButtonActive : {}),
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Right: actions */}
      <div style={styles.rightGroup}>
        {ACTION_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavClick(item.id)}
            style={styles.actionButton}
          >
            {item.label}
          </button>
        ))}
        <div style={styles.divider} />
        <button
          onClick={onFocusToggle}
          style={{
            ...styles.actionButton,
            ...(focusMode ? styles.actionButtonActive : {}),
          }}
        >
          专注模式
        </button>
        <button
          onClick={onAiPanelToggle}
          style={{
            ...styles.actionButton,
            ...(aiPanelOpen ? styles.aiButtonActive : {}),
          }}
        >
          AI
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px',
    background: 'var(--affine-background-secondary-color, #16162a)',
    borderBottom: '1px solid var(--affine-border-color)',
    fontSize: '13px',
    height: 38,
    boxSizing: 'border-box',
    flexShrink: 0,
  },
  leftGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  projectName: {
    color: 'var(--affine-primary-color, #6c5ce7)',
    fontWeight: 600,
    flexShrink: 0,
  },
  chapterTitle: {
    color: 'var(--affine-text-secondary-color)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  centerGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  navButton: {
    padding: '4px 10px',
    border: '1px solid transparent',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--affine-text-secondary-color)',
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap',
    transition: 'background 0.15s, color 0.15s',
  } as React.CSSProperties,
  navButtonActive: {
    background: 'var(--affine-primary-color, #6c5ce7)',
    color: '#fff',
    border: '1px solid var(--affine-primary-color, #6c5ce7)',
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  actionButton: {
    padding: '4px 10px',
    border: '1px solid var(--affine-border-color)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--affine-text-secondary-color)',
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap',
    transition: 'background 0.15s, color 0.15s',
  } as React.CSSProperties,
  actionButtonActive: {
    background: 'var(--affine-primary-color, #6c5ce7)',
    color: '#fff',
    border: '1px solid var(--affine-primary-color, #6c5ce7)',
  },
  aiButtonActive: {
    background: 'var(--affine-primary-color, #6c5ce7)',
    color: '#fff',
    border: '1px solid var(--affine-primary-color, #6c5ce7)',
  },
  divider: {
    width: 1,
    height: 16,
    background: 'var(--affine-border-color)',
    margin: '0 4px',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-top-bar.tsx
git commit -m "feat(story): add top bar component with nav items and actions"
```

---

## Task 3: Novel Switcher Component

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/story-novel-switcher.tsx`

The novel switcher sits at the top of the left sidebar. It shows the current novel name, a dropdown to switch, and a + button to create.

- [ ] **Step 1: Create story-novel-switcher.tsx**

```typescript
import { useCallback, useRef, useState, useEffect } from 'react';
import type { NovelMeta } from './story-context';

interface StoryNovelSwitcherProps {
  novels: NovelMeta[];
  activeNovelId: string;
  onSwitchNovel: (id: string) => void;
  onCreateNovel: () => void;
  theme: {
    panel: string;
    text: string;
    textMuted: string;
    border: string;
    active: string;
  };
}

export const StoryNovelSwitcher = ({
  novels,
  activeNovelId,
  onSwitchNovel,
  onCreateNovel,
  theme,
}: StoryNovelSwitcherProps) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeNovel = novels.find(n => n.id === activeNovelId);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <div style={styles.header(theme)}>
        <span style={{ fontSize: 16 }}>📖</span>
        <span style={styles.title(theme)}>{activeNovel?.title ?? '未选择小说'}</span>
        <button
          onClick={() => setOpen(prev => !prev)}
          style={styles.dropdownButton(theme)}
        >
          {open ? '▲' : '▼'}
        </button>
        <button onClick={onCreateNovel} style={styles.addButton(theme)}>
          ＋
        </button>
      </div>

      {open && (
        <div style={styles.dropdown(theme)}>
          {novels.map(novel => (
            <button
              key={novel.id}
              onClick={() => { onSwitchNovel(novel.id); setOpen(false); }}
              style={{
                ...styles.dropdownItem(theme),
                ...(novel.id === activeNovelId ? styles.dropdownItemActive : {}),
              }}
            >
              {novel.title}
              <span style={styles.modeBadge(theme)}>{novel.mode === 'long' ? '长篇' : '短篇'}</span>
            </button>
          ))}
          {novels.length === 0 && (
            <div style={{ ...styles.dropdownItem(theme), color: theme.textMuted, cursor: 'default' }}>
              还没有小说，点击 ＋ 创建
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Styles omitted for brevity — follow the same pattern as other components:
// inline styles object, theme colors, consistent padding/borders/radius.
// Full styles to be written during implementation matching the visual mockup.
```

Note: The full styles object will be written during implementation. The structure follows the v5 mockup — novel name, dropdown arrow, and + button on a single row.

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-novel-switcher.tsx
git commit -m "feat(story): add novel switcher component"
```

---

## Task 4: Chapter Tree Component

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/story-chapter-tree.tsx`

Replaces `story-sidebar.tsx`. Shows a two-level tree (卷 → 章) or flat list depending on whether volumes exist.

- [ ] **Step 1: Create story-chapter-tree.tsx**

Key implementation points:

- Accept `volumes: Volume[]`, `chapters: ChapterMeta[]`, `activeChapterIndex: number` as props
- If `volumes.length > 0`, group chapters by `volumeId` and render as collapsible tree nodes
- If `volumes.length === 0`, render flat chapter list
- Each volume node has a ▶/▼ toggle and shows "N章 · X万字"
- Each chapter node shows title and word count, active one highlighted
- Header: "📖 章节管理" + 📁 (new volume) + ＋ (new chapter) buttons
- Footer: "N 卷 · M 章 · X 万字" summary
- Click chapter calls `onSelectChapter(index)`
- Store expanded volumes in state, initialize from session

```typescript
import { useState, useCallback } from 'react';
import type { Volume, ChapterMeta } from './story-context';

interface StoryChapterTreeProps {
  volumes: Volume[];
  chapters: ChapterMeta[];
  activeChapterIndex: number;
  expandedVolumes: string[];
  onExpandedVolumesChange: (ids: string[]) => void;
  onSelectChapter: (index: number) => void;
  onAddChapter: () => void;
  onAddVolume: () => void;
  theme: { panel: string; text: string; textMuted: string; border: string; active: string };
}

export const StoryChapterTree = ({
  volumes,
  chapters,
  activeChapterIndex,
  expandedVolumes,
  onExpandedVolumesChange,
  onSelectChapter,
  onAddChapter,
  onAddVolume,
  theme,
}: StoryChapterTreeProps) => {
  const toggleVolume = useCallback((volId: string) => {
    onExpandedVolumesChange(
      expandedVolumes.includes(volId)
        ? expandedVolumes.filter(id => id !== volId)
        : [...expandedVolumes, volId]
    );
  }, [expandedVolumes, onExpandedVolumesChange]);

  const isTree = volumes.length > 0;
  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

  return (
    <div style={styles.container(theme)}>
      {/* Header */}
      <div style={styles.header(theme)}>
        <span style={styles.headerTitle(theme)}>📖 章节管理</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {isTree && (
            <button onClick={onAddVolume} style={styles.headerButton(theme)} title="新增卷">📁</button>
          )}
          <button onClick={onAddChapter} style={styles.headerButton(theme)} title="新增章节">＋</button>
        </div>
      </div>

      {/* Tree or flat list */}
      <div style={styles.list}>
        {isTree ? (
          volumes.map(vol => {
            const volChapters = chapters.filter(ch => ch.volumeId === vol.id);
            const isExpanded = expandedVolumes.includes(vol.id);
            return (
              <div key={vol.id}>
                <div
                  onClick={() => toggleVolume(vol.id)}
                  style={styles.volumeNode(theme)}
                >
                  <span style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
                  <span>📁 {vol.title}</span>
                  <span style={styles.volumeStats(theme)}>
                    {volChapters.length}章
                  </span>
                </div>
                {isExpanded && volChapters.map(ch => {
                  const idx = chapters.indexOf(ch);
                  return (
                    <div
                      key={ch.id}
                      onClick={() => onSelectChapter(idx)}
                      style={styles.chapterNode(theme, idx === activeChapterIndex)}
                    >
                      <span>{ch.title}</span>
                      <span style={styles.chapterWordCount(theme)}>
                        {formatWordCount(ch.wordCount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })
        ) : (
          chapters.map((ch, idx) => (
            <div
              key={ch.id}
              onClick={() => onSelectChapter(idx)}
              style={styles.chapterNode(theme, idx === activeChapterIndex)}
            >
              <span>{ch.title}</span>
              <span style={styles.chapterWordCount(theme)}>
                {formatWordCount(ch.wordCount)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer(theme)}>
        <span>{isTree ? `${volumes.length} 卷 · ` : ''}{chapters.length} 章</span>
        <span>{formatWordCount(totalWords)}</span>
      </div>
    </div>
  );
};

function formatWordCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万字`;
  if (count >= 1000) return `${Math.round(count / 1000)}千字`;
  return `${count}字`;
}

// Inline styles object to be completed during implementation
// Follows the v3/v5 mockup visual design exactly
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-chapter-tree.tsx
git commit -m "feat(story): add chapter tree component with volume/chapter tree"
```

---

## Task 5: Resize Handle Component

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/story-resize-handle.tsx`

A 6px drag handle following AFFiNE's ResizePanel pattern. Uses document-level mouse events for smooth dragging.

- [ ] **Step 1: Create story-resize-handle.tsx**

```typescript
import { useCallback, useRef } from 'react';

interface StoryResizeHandleProps {
  onWidthChange: (width: number) => void;
  onWidthChanged: (width: number) => void;
  onResizingChange: (resizing: boolean) => void;
  minWidth: number;
  maxWidth: number;
  side: 'left'; // resize handle is always on the left side of AI panel
}

export const StoryResizeHandle = ({
  onWidthChange,
  onWidthChanged,
  onResizingChange,
  minWidth,
  maxWidth,
}: StoryResizeHandleProps) => {
  const anchorRef = useRef<number>(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      anchorRef.current = e.clientX;

      // Get the right edge of the panel container's parent
      const container = (e.target as HTMLElement).parentElement;
      if (!container) return;
      const { right: anchorRight } = container.getBoundingClientRect();

      document.body.style.cursor = 'col-resize';
      onResizingChange(true);

      let lastWidth = 0;

      const onMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        const newWidth = Math.min(
          maxWidth,
          Math.max(minWidth, anchorRight - moveEvent.clientX)
        );
        lastWidth = newWidth;
        onWidthChange(newWidth);
      };

      const onMouseUp = () => {
        document.body.style.cursor = '';
        onResizingChange(false);
        if (lastWidth > 0) onWidthChanged(lastWidth);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp, { once: true });
    },
    [minWidth, maxWidth, onWidthChange, onWidthChanged, onResizingChange]
  );

  return (
    <div onMouseDown={onMouseDown} style={styles.handle}>
      <div style={styles.bar} />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  handle: {
    width: 6,
    cursor: 'col-resize',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--affine-border-color, #2a2a4a)',
    flexShrink: 0,
    transition: 'background 0.15s',
  },
  bar: {
    width: 3,
    height: 40,
    background: 'var(--affine-primary-color, #6c5ce7)',
    borderRadius: 4,
    opacity: 0.4,
    transition: 'opacity 0.15s',
  },
};
```

Note: Hover state opacity change handled via CSS :hover or an onMouseEnter/onMouseLeave pair during implementation.

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-resize-handle.tsx
git commit -m "feat(story): add resize handle component for AI panel"
```

---

## Task 6: AI Panel Component (rewrite)

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-ai-panel.tsx`

Rewrite the existing `story-ai-panel.tsx` to include:

- 5-tab bar (💬 聊天 | ✏️ 续写 | ✨ 润色 | 🔍 分析 | 🗣️ 说人话)
- Always-visible toolbar (➕ 新对话 | 🕐 历史 | 🧑 人设卡 | 💡 灵感 | ⋯)
- Content area that switches between chat and action panels based on active tab
- Persistent input area at bottom

- [ ] **Step 1: Rewrite story-ai-panel.tsx**

The component structure:

```typescript
type AiTab = 'chat' | 'continue' | 'polish' | 'analyze' | 'explain';

const TABS: { id: AiTab; icon: string; label: string }[] = [
  { id: 'chat', icon: '💬', label: '聊天' },
  { id: 'continue', icon: '✏️', label: '续写' },
  { id: 'polish', icon: '✨', label: '润色' },
  { id: 'analyze', icon: '🔍', label: '分析' },
  { id: 'explain', icon: '🗣️', label: '说人话' },
];

interface StoryAIPanelProps {
  width: number;
  activeTab: AiTab;
  onActiveTabChange: (tab: AiTab) => void;
  // Pass through existing AI runtime/session props
  chatContainerRef: React.RefObject<HTMLDivElement>;
  // ... other AI-related props
}

export const StoryAIPanel = ({ width, activeTab, onActiveTabChange, chatContainerRef }: StoryAIPanelProps) => {
  return (
    <div style={{ ...styles.root, width, minWidth: width, maxWidth: width }}>
      {/* Tab bar */}
      <div style={styles.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onActiveTabChange(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
            title={tab.label}
          >
            {tab.icon}
          </button>
        ))}
      </div>
      {/* Tab labels */}
      <div style={styles.tabLabels}>
        {TABS.map(tab => (
          <span
            key={tab.id}
            style={{
              ...styles.tabLabel,
              color: activeTab === tab.id ? 'var(--affine-primary-color)' : 'var(--affine-text-secondary-color)',
            }}
          >
            {tab.label}
          </span>
        ))}
      </div>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <button style={styles.toolButton}>➕ 新对话</button>
        <button style={styles.toolButton}>🕐 历史</button>
        <button style={styles.toolButton}>🧑 人设卡</button>
        <button style={styles.toolButton}>💡 灵感</button>
        <button style={styles.toolButton}>⋯</button>
      </div>
      {/* Content area */}
      <div ref={chatContainerRef} style={styles.content}>
        {activeTab === 'chat' ? (
          <div style={styles.chatPlaceholder}>聊天内容区域 — 由 ai-chat-content Web Component 填充</div>
        ) : (
          <ActionPanel mode={activeTab} />
        )}
      </div>
      {/* Input area */}
      <div style={styles.inputArea}>
        <input style={styles.input} placeholder="输入消息..." />
        <button style={styles.sendButton}>发送</button>
      </div>
    </div>
  );
};
```

The `ActionPanel` component renders a stub UI for 续写/润色/分析/说人话 tabs. It shows the action name, a description, and a "对当前选区执行" button. Actual AI integration comes later.

The chat tab content area is still filled by the `ai-chat-content` Web Component via the existing `useAIChatElement` hook in `story-layout.tsx`.

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-ai-panel.tsx
git commit -m "feat(story): rewrite AI panel with 5 tabs and toolbar"
```

---

## Task 7: New Novel Dialog

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/new-novel-dialog.tsx`

Replaces `new-project-dialog.tsx`. Adds mode selection, word count target, worldview, and motivation fields.

- [ ] **Step 1: Create new-novel-dialog.tsx**

```typescript
import { useState, useCallback } from 'react';
import type { NovelMeta } from './story-context';
import { Modal } from './modal';

interface NewNovelDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (novel: Omit<NovelMeta, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export const NewNovelDialog = ({ open, onClose, onCreate }: NewNovelDialogProps) => {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'long' | 'short'>('long');
  const [targetWordCount, setTargetWordCount] = useState('');
  const [targetChapterCount, setTargetChapterCount] = useState('');
  const [worldview, setWorldview] = useState('');
  const [motivation, setMotivation] = useState('');

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !worldview.trim()) return;
    onCreate({
      title: title.trim(),
      mode,
      targetWordCount: targetWordCount ? Number(targetWordCount) : undefined,
      targetChapterCount: targetChapterCount ? Number(targetChapterCount) : undefined,
      worldview: worldview.trim(),
      motivation: motivation.trim() || undefined,
    });
    // Reset form
    setTitle(''); setMode('long'); setTargetWordCount('');
    setTargetChapterCount(''); setWorldview(''); setMotivation('');
    onClose();
  }, [title, mode, targetWordCount, targetChapterCount, worldview, motivation, onCreate, onClose]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="创建新小说">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
        {/* Title — required */}
        <label style={styles.label}>
          小说名称 <span style={{ color: '#ff6666' }}>*</span>
          <input value={title} onChange={e => setTitle(e.target.value)} style={styles.input} placeholder="输入小说名称" />
        </label>
        {/* Mode — required */}
        <label style={styles.label}>
          模式 <span style={{ color: '#ff6666' }}>*</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setMode('long')} style={mode === 'long' ? styles.modeActive : styles.modeButton}>长篇</button>
            <button onClick={() => setMode('short')} style={mode === 'short' ? styles.modeActive : styles.modeButton}>短篇</button>
          </div>
        </label>
        {/* Target word count — optional */}
        <label style={styles.label}>
          预计字数
          <input value={targetWordCount} onChange={e => setTargetWordCount(e.target.value)} style={styles.input} placeholder="例: 200000" type="number" />
        </label>
        {/* Target chapter count — optional */}
        <label style={styles.label}>
          预计章节数
          <input value={targetChapterCount} onChange={e => setTargetChapterCount(e.target.value)} style={styles.input} placeholder="例: 100" type="number" />
        </label>
        {/* Worldview — required */}
        <label style={styles.label}>
          世界观 <span style={{ color: '#ff6666' }}>*</span>
          <textarea value={worldview} onChange={e => setWorldview(e.target.value)} style={{ ...styles.input, minHeight: 80, resize: 'vertical' }} placeholder="描述小说的世界设定、时代背景、核心规则..." />
        </label>
        {/* Motivation — optional */}
        <label style={styles.label}>
          写作初衷
          <textarea value={motivation} onChange={e => setMotivation(e.target.value)} style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} placeholder="为什么写这个故事..." />
        </label>
        <button onClick={handleSubmit} disabled={!title.trim() || !worldview.trim()} style={styles.submitButton}>
          创建
        </button>
      </div>
    </Modal>
  );
};

// Inline styles object following existing modal/form patterns
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/new-novel-dialog.tsx
git commit -m "feat(story): add new novel dialog with mode, worldview, motivation"
```

---

## Task 8: Todo Panel Component

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/story-todo-panel.tsx`

A popup panel anchored below the "📋 待办" button in the top bar. Cross-novel todo list.

- [ ] **Step 1: Create story-todo-panel.tsx**

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import type { TodoItem } from './story-context';

interface StoryTodoPanelProps {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  todos: TodoItem[];
  onAddTodo: (text: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
}

export const StoryTodoPanel = ({
  open,
  onClose,
  anchorEl,
  todos,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
}: StoryTodoPanelProps) => {
  const [input, setInput] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  // Position below anchor button
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left });
  }, [open, anchorEl]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const pending = todos.filter(t => !t.done);
  const done = todos.filter(t => t.done);

  return (
    <div ref={panelRef} style={{ ...styles.panel, top: position.top, left: position.left }}>
      <div style={styles.header}>
        <span style={{ fontWeight: 600 }}>📋 待办事项</span>
        <span style={styles.count}>{pending.length}</span>
      </div>
      {/* Quick add */}
      <div style={styles.inputRow}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onAddTodo(input.trim()); setInput(''); } }}
          style={styles.input}
          placeholder="快速记录..."
          autoFocus
        />
        <button onClick={() => { if (input.trim()) { onAddTodo(input.trim()); setInput(''); } }} style={styles.addButton}>
          添加
        </button>
      </div>
      {/* Pending items */}
      {pending.map(todo => (
        <div key={todo.id} style={styles.todoItem}>
          <input type="checkbox" checked={false} onChange={() => onToggleTodo(todo.id)} style={styles.checkbox} />
          <span style={{ flex: 1 }}>{todo.text}</span>
          <button onClick={() => onDeleteTodo(todo.id)} style={styles.deleteButton}>×</button>
        </div>
      ))}
      {/* Done items */}
      {done.length > 0 && (
        <>
          <div style={styles.doneHeader}>已完成 ({done.length})</div>
          {done.map(todo => (
            <div key={todo.id} style={styles.todoItem}>
              <input type="checkbox" checked onChange={() => onToggleTodo(todo.id)} style={styles.checkbox} />
              <span style={{ flex: 1, textDecoration: 'line-through', opacity: 0.5 }}>{todo.text}</span>
              <button onClick={() => onDeleteTodo(todo.id)} style={styles.deleteButton}>×</button>
            </div>
          ))}
        </>
      )}
      {todos.length === 0 && (
        <div style={styles.empty}>还没有待办事项</div>
      )}
    </div>
  );
};

// Inline styles for popover panel, matching the dark theme
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-todo-panel.tsx
git commit -m "feat(story): add cross-novel todo panel component"
```

---

## Task 9: Restructure story-layout.tsx — Wire Everything Together

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-layout.tsx`

This is the main integration task. Replace the old three-inline-columns layout with the new component hierarchy.

- [ ] **Step 1: Rewrite story-layout.tsx render method**

The new JSX structure:

```tsx
return (
  <StoryFrameworkRoot>
    <WorkspaceProvider>
      <StoryProvider>
        <div style={styles.root}>
          {/* Top bar — full width */}
          <StoryTopBar activeNovel={activeNovel} activeChapterTitle={activeChapterTitle} activeNavId={activeNavId} onNavClick={handleNavClick} focusMode={focusMode} onFocusToggle={handleFocusToggle} aiPanelOpen={aiPanelOpen} onAiPanelToggle={() => setAiPanelOpen(prev => !prev)} />

          {/* Three columns */}
          <div style={styles.columns}>
            {/* Left: Novel Switcher + Chapter Tree */}
            {!focusMode && (
              <div style={styles.sidebar}>
                <StoryNovelSwitcher novels={novels} activeNovelId={activeNovelId} onSwitchNovel={handleSwitchNovel} onCreateNovel={() => setShowNewNovelDialog(true)} theme={THEME} />
                <StoryChapterTree volumes={volumes} chapters={chapters} activeChapterIndex={activeChapterIndex} expandedVolumes={expandedVolumes} onExpandedVolumesChange={setExpandedVolumes} onSelectChapter={selectChapter} onAddChapter={addChapter} onAddVolume={addVolume} theme={THEME} />
              </div>
            )}

            {/* Middle: Editor */}
            <StoryEditorPanel focusMode={focusMode} onFocusToggle={handleFocusToggle} onSendToChat={openChatWithPrompt} theme={THEME} />

            {/* Right: Resize Handle + AI Panel */}
            {aiPanelOpen && !focusMode && (
              <>
                <StoryResizeHandle onWidthChange={setAiPanelWidth} onWidthChanged={handleAiWidthFinalized} onResizingChange={setAiPanelResizing} minWidth={280} maxWidth={600} />
                <StoryAIPanel width={aiPanelWidth} activeTab={activeAiTab} onActiveTabChange={setActiveAiTab} chatContainerRef={chatContainerRef} />
              </>
            )}
          </div>
        </div>

        {/* Dialogs */}
        <NewNovelDialog open={showNewNovelDialog} onClose={() => setShowNewNovelDialog(false)} onCreate={handleCreateNovel} />
        <SettingsDialog open={activeNavId === 'settings'} onClose={() => setActiveNavId(null)} />
        <PlaceholderDialog open={activeNavId != null && !['chapters', 'settings'].includes(activeNavId ?? '')} title={activeNavId ?? ''} onClose={() => setActiveNavId(null)} />
        <StoryTodoPanel open={showTodoPanel} onClose={() => setShowTodoPanel(false)} anchorEl={todoAnchorEl} todos={todos} onAddTodo={addTodo} onToggleTodo={toggleTodo} onDeleteTodo={deleteTodo} />
      </StoryProvider>
    </WorkspaceProvider>
  </StoryFrameworkRoot>
);
```

Root styles:

```typescript
const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    background: 'var(--affine-background-primary-color)',
    overflow: 'hidden',
  },
  columns: {
    display: 'flex',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  sidebar: {
    width: 220,
    minWidth: 220,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--affine-background-secondary-color, #16162a)',
    borderRight: '1px solid var(--affine-border-color)',
    overflow: 'hidden',
  },
};
```

- [ ] **Step 2: Move AI setup logic (useAIChatElement, runtime, etc.) into the layout or keep it in layout**

The existing AI runtime setup (`AIChatRuntime`, `useAIChatElement`, etc.) stays in `story-layout.tsx`. The `chatContainerRef` is passed to `StoryAIPanel` which attaches the ref to the content area div.

- [ ] **Step 3: Update story-editor-panel.tsx**

Remove the old `focusButtonStyle` and focus mode button from the editor panel's internal header — focus mode is now controlled by the top bar. Keep the editor core, BlockSuite integration, and AI popup logic unchanged.

- [ ] **Step 4: Delete story-sidebar.tsx and new-project-dialog.tsx**

Remove these files. Update `index.ts` to export new components instead.

- [ ] **Step 5: Update index.ts**

```typescript
export { StoryLayout } from './story-layout';
export { StoryTopBar } from './story-top-bar';
export { StoryNovelSwitcher } from './story-novel-switcher';
export { StoryChapterTree } from './story-chapter-tree';
export { StoryAIPanel } from './story-ai-panel';
export { StoryResizeHandle } from './story-resize-handle';
export { StoryTodoPanel } from './story-todo-panel';
export { NewNovelDialog } from './new-novel-dialog';
```

- [ ] **Step 6: Commit**

```bash
git add -A packages/frontend/core/src/components/story-layout/
git commit -m "feat(story): restructure layout to three-column with top bar, chapter tree, AI panel"
```

---

## Task 10: Session Persistence — Final Wiring

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-layout.tsx`
- Modify: `packages/frontend/core/src/components/story-layout/story-context.tsx`

- [ ] **Step 1: Add session save calls to story-layout.tsx**

After every state change that should be persisted, call `saveSession()`:

```typescript
useEffect(() => {
  saveSession({
    activeNovelId,
    activeChapterIndex,
    aiPanelOpen,
    aiPanelWidth,
    activeAiTab,
    activeChatSessionId,
    sidebarCollapsed,
    chapterTreeExpandedVolumes: expandedVolumes,
  });
}, [activeNovelId, activeChapterIndex, aiPanelOpen, aiPanelWidth, activeAiTab, activeChatSessionId, sidebarCollapsed, expandedVolumes]);
```

Debounce with 500ms timer.

- [ ] **Step 2: Add session restore on mount**

In `StoryProvider`, read session on mount and restore state. Handle missing novels/chapters gracefully.

- [ ] **Step 3: Verify persistence works**

- Open the app, create a novel, select a chapter, open AI panel, resize it
- Reload the page
- Confirm: same novel selected, same chapter, AI panel open at same width, same tab

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/
git commit -m "feat(story): wire session persistence for novel, chapter, AI panel state"
```

---

## Task 11: Visual Verification & Cleanup

- [ ] **Step 1: Run the dev server and verify the layout**

```bash
yarn dev
```

Check:

- Top bar renders with all buttons
- Left sidebar shows novel switcher + chapter tree
- Editor fills remaining space
- AI panel toggles open/close from top bar
- Resize handle drags smoothly, editor width adjusts
- Tab switching in AI panel works
- Todo panel opens as popover from top bar
- Create novel dialog shows all fields
- Session restores on page reload

- [ ] **Step 2: Fix any layout issues**

Common issues to check:

- AI panel overlapping editor (ensure `flexShrink: 0` on AI panel)
- Resize handle not working (check document event listeners)
- Chapter tree not scrolling (check `overflow-y: auto`)
- Top bar items overflowing on narrow screens (consider truncation)

- [ ] **Step 3: Final commit**

```bash
git add -A packages/frontend/core/src/components/story-layout/
git commit -m "fix(story): layout polish and visual fixes"
```
