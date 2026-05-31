# Story Layout Redesign — Three-Column Layout

Date: 2026-05-31

## Overview

Redesign the Story layout from the current inline-styled flex layout to a proper three-column system modeled on AFFiNE's workbench architecture (ResizePanel + SplitView). The new layout adds a resizable AI chat panel, a tabbed AI toolbar, a top navigation bar, and a chapter tree sidebar.

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ Top Bar                                                             │
│ Story · 第一章   章节管理 人物 世界观 路线图 火花 图谱 │ 同步 统计 版本 导出 ⚙设置 │ 专注 │ AI │
├──────────┬─────────────────────────────┬───┬────────────────────────┤
│ Chapter  │                             │ ≡ │ AI Panel               │
│ Tree     │        Editor               │   │ ┌─ Tabs ─────────────┐ │
│          │                             │   │ │💬 ✏️ ✨ 🔍 🗣️      │ │
│ 📁第一卷 │  (BlockSuite Editor)        │   │ ├─ Toolbar ──────────┤ │
│  第1章   │                             │   │ │➕ 🕐 🧑 💡  ⋯     │ │
│  第2章 ← │                             │   │ ├─ Chat Content ─────┤ │
│  第3章   │                             │   │ │                    │ │
│ 📁第二卷 │                             │   │ │                    │ │
│          │                             │   │ ├─ Input ────────────┤ │
│          │                             │   │ │ [        ] [发送]  │ │
│ 3卷·10章 │                             │   │ └────────────────────┘ │
└──────────┴─────────────────────────────┴───┴────────────────────────┘
```

Three columns managed by flex layout:

| Column             | Width                    | flex behavior          |
| ------------------ | ------------------------ | ---------------------- |
| Left: Chapter Tree | 220px fixed, collapsible | `flexShrink: 0`        |
| Middle: Editor     | remaining space          | `flex: 1; minWidth: 0` |
| Right: AI Panel    | 280–600px, draggable     | `flexShrink: 0`        |

## Components

### 1. Top Bar (`StoryTopBar`)

A single row spanning the full width. Contains three groups:

**Left group:**

- Project name (accent color)
- Current chapter title (muted)

**Center group — navigation items (moved from old left sidebar):**

- 📖 章节管理
- 👤 人物
- 🌍 世界观
- 📈 路线图
- ✨ 火花
- 🕸 图谱

Each item is a button that opens a corresponding panel/dialog. Active item highlighted.

**Right group — global actions:**

- 📋 待办 — cross-novel todo list popup (see §6)
- 🔄 同步 — sync to cloud/Git
- 📊 统计 — word count, chapter progress, writing time, daily stats
- 📁 版本 — version history, diff, rollback
- 📤 导出 — export as TXT/Markdown/EPUB/PDF
- ⚙ 设置
- 专注模式 — hides sidebars for distraction-free writing
- AI — toggle right panel open/close

Groups separated by a thin vertical divider (`1px` border).

### 2. Novel Switcher (`StoryNovelSwitcher`)

Located at the top of the left chapter tree sidebar, above the chapter list.

```
┌──────────────────────────┐
│ 📖 我的小说  ▼  ＋       │  ← ▼ switch novel, ＋ create new
├──────────────────────────┤
│ 📖 章节管理   📁  ＋     │
│ ...chapters...           │
└──────────────────────────┘
```

- **Novel name + ▼ dropdown:** Clicking opens a list of all novels. Selecting one switches the entire context (chapters, volumes, AI sessions, active chapter). Active novel highlighted.
- **＋ button:** Opens the "Create Novel" dialog (see §7).
- Dropdown also has a "管理小说" option at bottom to rename/delete novels.

### 3. Chapter Tree (`StoryChapterTree`)

Replaces the old `StorySidebar`. Only contains chapter management.

**Structure:**

- **Long novel mode (default when volumes exist):** `卷 → 章` two-level tree. Volumes are collapsible groups.
- **Short novel mode (when no volumes):** Flat chapter list. Creating the first volume switches to tree mode automatically.

**Volume node:**

```
▼ 📁 第一卷·初入江湖          5章 · 1.2万字
    第1章 深夜                    89字
  → 第2章 信封                 1.2万字  ← active
    第3章 真相                   8千字
```

**Header:** "📖 章节管理" + 📁 (new volume) + ＋ (new chapter) buttons.

**Footer:** Summary stats — "3 卷 · 10 章 · 4.5 万字".

**Interactions:**

- Click chapter → switch active document in editor
- Click volume → expand/collapse (does not open a document)
- Right-click → context menu (rename, delete, move to volume)
- Drag & drop to reorder chapters across volumes

**Chapter switching flow:**

1. User clicks a chapter in the tree
2. Auto-save current chapter (flush debounce timer)
3. Update `activeChapterIndex`
4. `getChapterStore(newIndex)` — return cached Store or create new one
5. `<BlockSuiteEditor page={store} />` renders the new document

**Data model:**

```typescript
interface Volume {
  id: string; // "vol-1"
  title: string; // "初入江湖"
  order: number;
}

interface ChapterMeta {
  id: string; // "ch-1"
  docId: string; // "chapter:ch-1" — BlockSuite doc ID
  volumeId?: string; // optional, absent = ungrouped
  title: string;
  wordCount: number;
  order: number;
  createdAt: string;
  updatedAt: string;
}
```

### 4. Editor Panel (`StoryEditorPanel`)

Largely unchanged from current implementation. `flex: 1; minWidth: 0` so it absorbs remaining space and shrinks when side panels need room.

Shows the `BlockSuiteEditor` for the active chapter's Store. Falls back to a plain textarea if Store creation fails.

Bottom status bar: current chapter word count + total stats.

### 5. Resize Handle

A 6px-wide drag handle between editor and AI panel, following AFFiNE's `ResizePanel` pattern:

- **Cursor:** `col-resize`
- **Visual:** 3px-wide accent-colored bar, centered in the 6px handle area. Visible on hover, semi-transparent by default.
- **Drag behavior:**
  - `mousedown` → record anchor position, attach `mousemove`/`mouseup` to `document`
  - `mousemove` → calculate new width: `anchorRight - e.clientX`, clamped to `[280, 600]`
  - `mouseup` → finalize width, remove listeners
  - During drag: disable CSS transition on the panel for instant feedback
- **Double-click:** toggle panel between last width and collapsed
- **Constraint:** `minWidth: 280, maxWidth: 600`

### 6. AI Panel (`StoryAIPanel`)

Fixed-width right panel with `flexShrink: 0`. Controlled by top bar "AI" button.

**Structure (top to bottom):**

**a) Tab bar — 5 tabs:**
| # | Icon | Label | Behavior |
|---|------|-------|----------|
| 1 | 💬 | 聊天 | Show chat interface (default) |
| 2 | ✏️ | 续写 | Cover chat with "continue writing" action panel |
| 3 | ✨ | 润色 | Cover chat with "polish" action panel |
| 4 | 🔍 | 分析 | Cover chat with "analyze" action panel |
| 5 | 🗣️ | 说人话 | Cover chat with "explain plainly" action panel |

Tabs 2–5 replace the chat content area with their respective action panels. Clicking tab 1 returns to the chat view. The active tab is highlighted with accent color and a bottom border.

**b) Toolbar (always visible regardless of active tab):**

- ➕ 新对话 — start new chat session
- 🕐 历史 — browse chat history
- 🧑 人设卡 — manage character profiles, AI writes based on personas
- 💡 灵感 — generate random plot/scene ideas
- ⋯ 更多 — extensible entry point for future features

**c) Content area:**

- Chat tab: message list (user + AI bubbles) + streaming responses
- Action tabs (续写/润色/分析/说人话): action-specific UI that sends the selected/current text to AI with the corresponding prompt

**d) Input area:**

- Text input + send button
- Persistent at bottom regardless of active tab

**AI Panel toggle:**

- Default: collapsed (not rendered)
- Top bar "AI" button toggles open/close
- Focus mode hides the panel

### 7. Todo List (`StoryTodoPanel`)

A popup panel triggered by the "📋 待办" button in the top bar. Cross-novel — not tied to any specific project.

**Behavior:**

- Click "📋 待办" → panel drops down from the button (like a popover, anchored below the button)
- Click outside or press Escape → close panel
- Panel is a simple list with inline add/edit/delete

**Data model:**

```typescript
interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  // Optional: link to a novel/chapter for context
  novelId?: string;
  chapterId?: string;
}
```

**UI:**

- Top: input field + "添加" button (quick capture)
- List: checkbox + text, click to toggle done, hover for delete
- Done items shown with strikethrough, sorted below pending items
- Persisted to localStorage under a global key (not per-novel)

**Why top bar:** Needs to be accessible from any novel context. Popover doesn't consume layout space. Fast one-click access for capturing ideas while writing.

### 8. Create Novel Dialog (`NewNovelDialog`)

Replaces the old `NewProjectDialog`. Adds structured fields to set up the novel from the start.

**Fields:**

| Field      | Required | Type             | Description                                                                                     |
| ---------- | -------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| 小说名称   | Yes      | text             | Title of the novel                                                                              |
| 模式       | Yes      | radio: 长篇/短篇 | Determines chapter tree structure and pacing suggestions                                        |
| 预计字数   | No       | number           | Target word count (e.g. 200000). Used for progress tracking and AI pacing hints.                |
| 预计章节数 | No       | number           | Target chapter count. Used to suggest per-chapter word targets.                                 |
| 世界观     | Yes      | textarea         | Core world setting (genre, era, magic system, etc.). Fed to AI as context for all interactions. |
| 写作初衷   | No       | textarea         | Why you're writing this. Helps AI understand tone and intent.                                   |

**Mode-specific behavior:**

- **长篇 selected:** Enable "卷" creation in chapter tree. AI suggests ~2000-5000 words/chapter. Progress bar tracks against total target.
- **短篇 selected:** Chapter tree is flat. AI suggests ~500-2000 words/chapter. Tighter pacing focus.

**Worldview field** is critical — it's injected into AI prompts as system context, affecting chat, 续写, 润色, and all AI interactions across the novel.

## State Management

```typescript
// Layout state (StoryLayout component)
sidebarCollapsed: boolean      // chapter tree visibility
aiPanelOpen: boolean           // AI panel visibility
aiPanelWidth: number           // current width (280-600), persisted
aiPanelResizing: boolean       // drag in progress
activeTab: 'chat' | 'continue' | 'polish' | 'analyze' | 'explain'
focusMode: boolean             // hides all sidebars

// Novel state (StoryContext)
novels: NovelMeta[]            // all novels
activeNovelId: string          // currently active novel
volumes: Volume[]              // volume list (active novel)
chapters: ChapterMeta[]        // all chapters (active novel, with volumeId reference)
activeChapterIndex: number     // currently edited chapter
chapterStores: Map<number, Store>  // lazy-loaded BlockSuite stores

// Novel metadata
interface NovelMeta {
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

// Global state (cross-novel)
todos: TodoItem[]               // persisted globally in localStorage
```

## File Changes

### New files:

- `story-chapter-tree.tsx` — chapter tree component
- `story-top-bar.tsx` — top navigation bar
- `story-ai-panel.tsx` — AI panel with tabs and toolbar
- `story-novel-switcher.tsx` — novel dropdown switcher
- `story-todo-panel.tsx` — cross-novel todo popup
- `new-novel-dialog.tsx` — replaces `new-project-dialog.tsx`

### Modified files:

- `story-layout.tsx` — restructure to three-column with top bar
- `story-sidebar.tsx` — removed (replaced by `story-chapter-tree.tsx` + `story-novel-switcher.tsx`)
- `story-editor-panel.tsx` — minor: remove old sidebar/focus mode logic
- `story-context.tsx` — add Volume, NovelMeta, TodoItem models; multi-novel state

## Design Principles

1. **Flex-based layout** — no absolute positioning for panels; all three columns are flex children with proper shrink/grow rules
2. **AFFiNE patterns** — resize handle drag logic mirrors `ResizePanel`; panel open/close with CSS transitions
3. **One doc per chapter** — each chapter is an independent BlockSuite Store, lazily created and cached
4. **Implicit mode** — no explicit "long/short novel" toggle; the presence of volumes determines the tree structure
5. **Stub first, implement later** — top bar buttons (同步/统计/版本/导出) and AI tabs (续写/润色/分析/说人话) render as UI shells; actual functionality filled in incrementally

## Session Persistence

On every meaningful state change, persist a snapshot to localStorage. On app launch, restore from that snapshot so the user continues exactly where they left off.

**Persisted state (single localStorage key `story-session`):**

```typescript
interface SessionState {
  // Which novel and chapter were active
  activeNovelId: string;
  activeChapterIndex: number;

  // AI panel state
  aiPanelOpen: boolean;
  aiPanelWidth: number; // 280-600, user's last drag position
  activeAiTab: 'chat' | 'continue' | 'polish' | 'analyze' | 'explain';

  // Chat session
  activeChatSessionId: string; // resume existing conversation context

  // Layout preferences
  sidebarCollapsed: boolean;
  chapterTreeExpandedVolumes: string[]; // which volumes were expanded

  // Timestamp for debugging
  savedAt: string;
}
```

**When to save:**

- Active novel changes (novel switcher)
- Active chapter changes (click in tree)
- AI panel open/close or width change
- AI tab change
- Chat session change (new chat, switch history)
- Sidebar collapse/expand
- Volume expand/collapse in chapter tree

Debounced 500ms — batch rapid changes (e.g. dragging resize handle) into a single write.

**On launch:**

1. Read `story-session` from localStorage
2. If present: restore all fields, load the active novel's chapters, switch to the saved chapter
3. If the saved novelId no longer exists (deleted): fall back to first novel, or empty state
4. If the saved chapterIndex is out of range: fall back to first chapter
5. Restore AI chat session — reload messages from chat history by `activeChatSessionId`

**Chat session persistence (separate key `story-chat-sessions`):**

```typescript
interface ChatSession {
  id: string;
  novelId: string;
  title: string; // auto-generated from first message
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
```

All chat sessions stored as an array keyed by novel. Switching novels loads that novel's chat sessions. The `activeChatSessionId` in session state determines which conversation to display.
