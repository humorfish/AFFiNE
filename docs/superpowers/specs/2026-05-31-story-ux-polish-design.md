# Story UX Polish — 5 Features

Date: 2026-05-31

## Feature 1: Unsaved Status Indicator

### Problem

The 20px status bar in `StoryEditorPanel` shows "保存中..." during save, but the `saving` state is only set by `handleContentChange` (textarea fallback path). When the BlockSuite editor is active (`AffineEditorWrapper`), content edits are invisible to the status bar — no dirty tracking, no save indication.

### Design

- Add `onContentChange` callback prop to `AffineEditorWrapper`
- Listen to BlockSuite store update events (via `store.slots.update` or similar) to detect edits
- In `StoryEditorPanel`, track a `dirty` boolean:
  - Set `dirty = true` when content changes (from either textarea or BlockSuite path)
  - Set `dirty = false` after `updateChapterContent` completes
- Status bar right side shows:
  - `dirty && !saving` → "未保存" (orange/yellow text)
  - `saving` → "保存中..." (current behavior)
  - `!dirty && !saving` → nothing

### Files

- `story-editor-panel.tsx` — add `dirty` state, pass callback to `AffineEditorWrapper`, update status bar rendering
- `story-context.tsx` — no changes needed (save action already exists)

---

## Feature 2: AI Popup Closes Immediately on Long Selection

### Problem

When the user selects long text by dragging, the AI popup opens after the 300ms debounce, but `closeOnClickAway: true` in `createLitPortal` treats the final `mouseup` as a click-away event, closing the popup immediately.

### Design

Replace `closeOnClickAway: true` with a manual dismiss mechanism:

- Track a `popupJustOpened` timestamp when `showPopup` is called
- In the portal's abort signal handler, add a guard: ignore click-away events that occur within 500ms of popup open
- Implementation: use `closeOnClickAway: true` but wrap the popup in a container that captures and stops propagation of `mouseup`/`click` events during the first 500ms
- Alternative (simpler): remove `closeOnClickAway`, add a `mousedown` listener on `document` that checks if the click target is outside the popup element, with the 500ms guard

Recommended approach: keep `closeOnClickAway` but add a timestamp guard in the `abort` event listener. Before the `createLitPortal` call, record `Date.now()`. In the abort handler, check if `Date.now() - openTime < 500` and if so, re-open the popup with the same data.

Actually, the simplest fix: **increase debounce to 500ms** and **set `closeOnClickAway` with a delay**. The real issue is that the debounce fires _after_ mouseup but the portal's click-away logic fires _on_ the same mouseup. A 500ms debounce ensures the popup only opens after the user has fully finished selecting.

### Files

- `story-editor-panel.tsx` — modify `AffineEditorWrapper`'s selection change handler debounce and click-away logic

---

## Feature 3: Title & Word Count Sync Between Editor and Chapter Tree

### Problem

When editing in the BlockSuite editor, chapter title and word count in the chapter tree sidebar are never updated. The `updateChapterContent` action only receives a raw string (textarea path), and the BlockSuite path doesn't call it at all.

### Design

- In `AffineEditorWrapper`, on store update events, extract:
  - **Title**: first text block's content (the `affine:page` root block's `title` field)
  - **Word count**: count Chinese characters + English words across all paragraph blocks
- Pass both to parent via new `onContentSave` callback: `(data: { title: string; wordCount: number; content: string }) => void`
- In `StoryEditorPanel`, wire this to `updateChapterContent` and also update chapter meta
- In `story-context.tsx`, extend `updateChapterContent` to accept optional `title` and `wordCount`:
  ```
  updateChapterContent(content: string, meta?: { title?: string; wordCount?: number })
  ```
- When meta is provided, update `chapters[].meta.title` and `chapters[].meta.wordCount`
- The chapter tree re-renders automatically via React state

### Files

- `story-editor-panel.tsx` — extract title/wordCount from BlockSuite store, pass to save handler
- `story-context.tsx` — extend `updateChapterContent` signature and implementation
- `story-chapter-tree.tsx` — no changes (already reads title/wordCount from data)

---

## Feature 4: Novel Switcher → Edit/Create Dialog

### Current Behavior

Clicking "切换小说" opens `NewNovelDialog` which only supports creating a new novel.

### New Behavior

Redesign the dialog into a split-panel layout:

**Left panel**: Novel form (title, mode, target counts, worldview, motivation)
**Right panel**: Scrollable list of existing novels

States:

1. **Create mode** (default when no novels exist or when "创建新小说" button clicked):
   - Title: "创建新小说"
   - Form is empty
   - Right panel shows existing novels (grayed out / not selected)
2. **Edit mode** (when user clicks a novel in the right panel):
   - Title: "编辑小说信息"
   - Form pre-filled with selected novel's data
   - Right panel highlights the selected novel
   - Title area shows "创建新小说" button to switch back to create mode

Actions:

- **Create**: `createNovel(data)` — same as current
- **Update**: new `updateNovel(id, data)` action in context
- **Delete**: existing `deleteNovel(id)` action, with confirmation

### Files

- `new-novel-dialog.tsx` — redesign to split-panel with create/edit modes (rename to `novel-dialog.tsx`)
- `story-context.tsx` — add `updateNovel(id, data)` action
- `story-layout.tsx` — update dialog props
- `story-top-bar.tsx` — no changes (button already calls `onNovelAction`)

---

## Feature 5: Chapter Creation Improvements

### Current Behavior

`addChapter('新章节', '')` uses hardcoded "新章节" as title and immediately selects the new chapter via `setActiveChapterIndex`.

### New Behavior

1. **Auto-generate chapter name**: Use "章节{N}" where N = `chapters.length + 1`
2. **Rename on first edit**: When the user edits the chapter and the first save fires, if the chapter title is still the auto-generated "章节{N}", rename it to the editor's first heading text. If no heading, keep "章节{N}"
3. **No auto-select**: After creating a chapter, do NOT switch to it, UNLESS it's the only chapter (i.e., `chapters.length === 0` before creation, meaning this is the first chapter)

### Implementation

- `story-context.tsx` — modify `addChapter`:
  - Generate title as `章节${chapters.length + 1}`
  - Only call `setActiveChapterIndex` if `chapters.length === 0` (was empty before add)
- `story-editor-panel.tsx` — in the save handler, check if chapter title matches auto-generated pattern and rename

### Files

- `story-context.tsx` — update `addChapter` logic
- `story-editor-panel.tsx` — add rename-on-first-edit logic (leverages Feature 3's title extraction)
