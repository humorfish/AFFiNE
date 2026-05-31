# Story UX Polish — 5 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 UX polish features for the Story app: unsaved indicator, AI popup fix, title/word-count sync, novel switcher redesign, and chapter creation improvements.

**Architecture:** All changes are in `packages/frontend/core/src/components/story-layout/`. Features are ordered by dependency — Feature 1 and 3 both need BlockSuite store integration and share a `dirty` + content extraction mechanism. Feature 2 is independent. Features 4 and 5 are independent of each other but Feature 5 depends on Feature 3's title extraction.

**Tech Stack:** React 19, TypeScript, BlockSuite Store API (rxjs Subjects), Lit portal

---

## File Structure

| File                     | Responsibility                                                                           | Change Type |
| ------------------------ | ---------------------------------------------------------------------------------------- | ----------- |
| `story-context.tsx`      | State management — add `updateNovel`, modify `addChapter`, extend `updateChapterContent` | Modify      |
| `story-editor-panel.tsx` | BlockSuite store listener, dirty tracking, title/wordCount extraction                    | Modify      |
| `story-layout.tsx`       | Wire new novel dialog props, update `addChapter` call                                    | Modify      |
| `new-novel-dialog.tsx`   | Redesign to split-panel create/edit dialog                                               | Rewrite     |
| `story-chapter-tree.tsx` | No changes                                                                               | —           |
| `story-top-bar.tsx`      | No changes                                                                               | —           |

---

### Task 1: Extend `story-context.tsx` — updateChapterContent, updateNovel, addChapter changes

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-context.tsx`

- [ ] **Step 1: Extend `updateChapterContent` to accept optional title and wordCount**

In `story-context.tsx`, locate the `updateChapterContent` callback (~line 440). Change its signature and implementation:

```typescript
const updateChapterContent = useCallback(
  async (content: string, meta?: { title?: string; wordCount?: number }) => {
    if (activeChapterIndex === null) return;
    setError(null);
    try {
      setChapters(prev =>
        prev.map(ch =>
          ch.meta.index === activeChapterIndex
            ? {
                ...ch,
                content,
                meta: {
                  ...ch.meta,
                  ...(meta?.title !== undefined ? { title: meta.title } : {}),
                  ...(meta?.wordCount !== undefined ? { wordCount: meta.wordCount } : {}),
                  updatedAt: new Date().toISOString(),
                },
              }
            : ch
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  },
  [activeChapterIndex]
);
```

- [ ] **Step 2: Add `updateNovel` action**

After `createNovel` (~line 503), add:

```typescript
const updateNovel = useCallback((id: string, data: Omit<NovelMeta, 'id' | 'createdAt' | 'updatedAt'>) => {
  setNovels(prev => prev.map(n => (n.id === id ? { ...n, ...data, updatedAt: new Date().toISOString() } : n)));
}, []);
```

- [ ] **Step 3: Modify `addChapter` — auto name, conditional auto-select**

Replace the `addChapter` callback (~line 405):

```typescript
const addChapter = useCallback(
  async (title: string, content: string) => {
    if (!project) return;
    setLoading(true);
    setError(null);
    try {
      const index = chapters.length + 1;
      const now = new Date().toISOString();
      const newChapter: ChapterContent = {
        meta: {
          index,
          title,
          wordCount: content.length,
          createdAt: now,
          updatedAt: now,
        },
        content,
      };
      setChapters(prev => [...prev, newChapter]);
      // Only auto-select if this is the first chapter
      if (chapters.length === 0) {
        setActiveChapterIndex(index);
        saveToStorage(STORAGE_KEYS.activeChapterIndex, index);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  },
  [project, chapters.length]
);
```

- [ ] **Step 4: Export `updateNovel` in the context value**

In the `StoryActions` interface (~line 149), add:

```typescript
updateNovel: (
  id: string,
  data: Omit<NovelMeta, 'id' | 'createdAt' | 'updatedAt'>
) => void;
```

In the `value` useMemo (~line 589), add `updateNovel` to the object and its dependency array.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-context.tsx
git commit -m "feat(story): extend context with updateNovel, updateChapterContent meta, and conditional auto-select"
```

---

### Task 2: Unsaved status indicator + BlockSuite store listener in `story-editor-panel.tsx`

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-editor-panel.tsx`

- [ ] **Step 1: Add `dirty` state and update status bar in `StoryEditorPanel`**

In `StoryEditorPanel`, after the existing `useState` hooks (~line 68-69), add:

```typescript
const [dirty, setDirty] = useState(false);
```

Add a new callback that sets dirty and delegates to the context's update:

```typescript
const handleSave = useCallback(
  async (content: string, meta?: { title?: string; wordCount?: number }) => {
    setSaving(true);
    try {
      await updateChapterContent(content, meta);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  },
  [updateChapterContent]
);
```

Update the textarea's `handleContentChange` to use `handleSave` and set dirty:

```typescript
const handleContentChange = useCallback(
  (value: string) => {
    setEditorContent(value);
    setDirty(true);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(async () => {
      await handleSave(value);
    }, 1000);
  },
  [handleSave]
);
```

Update the status bar rendering (~line 253) to show the unsaved indicator:

```tsx
{
  dirty && !saving && <span style={{ color: '#f0a030' }}>未保存</span>;
}
{
  saving && <span style={{ color: theme.textMuted }}>保存中...</span>;
}
{
  error && <span style={{ color: '#ff6666' }}>保存失败</span>;
}
```

- [ ] **Step 2: Add `onContentChange` and `onDirty` props to `AffineEditorWrapper`**

Add new props to `AffineEditorWrapper`:

```typescript
function AffineEditorWrapper({
  store,
  onSendToChat,
  onContentChange,
}: {
  store: Store;
  onSendToChat: (prompt: string) => void;
  onContentChange: (data: {
    content: string;
    title: string;
    wordCount: number;
  }) => void;
}) {
```

- [ ] **Step 3: Add BlockSuite store update listener with debounce**

Inside `AffineEditorWrapper`, after the host acquisition effects, add a new effect to listen for store changes:

```typescript
// Debounced content extraction on store changes
useEffect(() => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const extractAndNotify = () => {
    if (disposed) return;
    try {
      const root = store.root;
      if (!root) return;

      // Extract title from root block's title prop
      const titleText = (root as any).title?.toString?.() ?? '';

      // Extract word count from all paragraph blocks
      let wordCount = 0;
      const allModels = store.getAllModels();
      for (const model of allModels) {
        if ((model as any).text) {
          const text = (model as any).text.toString();
          const chineseChars = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
          const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
          wordCount += chineseChars + englishWords;
        }
      }

      // Build content string
      const parts: string[] = [];
      for (const model of allModels) {
        if ((model as any).text) {
          parts.push((model as any).text.toString());
        }
      }
      const content = parts.join('\n');

      onContentChange({ content, title: titleText, wordCount });
    } catch (e) {
      console.warn('[StoryAI] content extraction failed:', e);
    }
  };

  const sub = store.slots.blockUpdated.subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(extractAndNotify, 800);
  });

  return () => {
    disposed = true;
    sub.unsubscribe();
    if (timer) clearTimeout(timer);
  };
}, [store, onContentChange]);
```

- [ ] **Step 4: Wire `AffineEditorWrapper` to the dirty/save flow**

In `StoryEditorPanel`, create the content change handler and pass it to `AffineEditorWrapper`:

```typescript
const handleBlockSuiteContentChange = useCallback(
  (data: { content: string; title: string; wordCount: number }) => {
    setDirty(true);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(async () => {
      await handleSave(data.content, {
        title: data.title,
        wordCount: data.wordCount,
      });
    }, 1000);
  },
  [handleSave]
);
```

Update the `AffineEditorWrapper` usage:

```tsx
{activeChapterStore ? (
  <AffineEditorWrapper
    store={activeChapterStore}
    onSendToChat={onSendToChat}
    onContentChange={handleBlockSuiteContentChange}
  />
) : (
```

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-editor-panel.tsx
git commit -m "feat(story): add unsaved indicator and BlockSuite store content listener"
```

---

### Task 3: Fix AI popup closing immediately on long text selection

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-editor-panel.tsx`

- [ ] **Step 1: Add open-timestamp tracking to the selection change handler**

In the `selectionchange` effect (~line 579), add a timestamp ref and guard:

Before the effect, add a ref to track when the popup was opened:

```typescript
const popupOpenTimeRef = useRef(0);
```

In the `showPopup` callback, record the open time:

```typescript
const showPopup = useCallback(
  (selectedText: string, wordCount: number, startIndex: number, endIndex: number) => {
    // ... existing code ...
    closePopup();
    popupOpenRef.current = true;
    popupOpenTimeRef.current = Date.now(); // <-- add this line
    // ... rest of existing code ...
  },
  [handlePopupSend, handlePopupClose, closePopup]
);
```

- [ ] **Step 2: Increase debounce to 500ms and suppress selection events right after popup open**

In the `selectionchange` effect, increase the debounce from 300ms to 500ms, and add a guard that ignores selection changes that happen within 600ms of the popup opening (the mouse is likely still releasing):

```typescript
useEffect(() => {
  let lastSelectedText = '';
  let wasOpen = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handleSelectionChange = () => {
    const host = hostRef.current;
    if (!host) return;

    // Guard: ignore selection changes right after popup opened (mouseup completing)
    if (popupOpenRef.current && Date.now() - popupOpenTimeRef.current < 600) {
      return;
    }

    // ... rest of existing handler unchanged ...
  };

  // ... rest of effect unchanged, but change debounce timeout from 300 to 500:
  debounceTimer = setTimeout(async () => {
    // ... existing code ...
  }, 500);
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-editor-panel.tsx
git commit -m "fix(story): prevent AI popup from closing on long text selection"
```

---

### Task 4: Redesign novel dialog with create/edit split panel

**Files:**

- Rewrite: `packages/frontend/core/src/components/story-layout/new-novel-dialog.tsx`
- Modify: `packages/frontend/core/src/components/story-layout/story-layout.tsx`

- [ ] **Step 1: Rewrite `new-novel-dialog.tsx` as split-panel create/edit dialog**

Replace the entire file with:

```tsx
import { useCallback, useState } from 'react';

import type { NovelMeta } from './story-context';
import { Modal } from './modal';

interface NovelDialogProps {
  open: boolean;
  onClose: () => void;
  novels: NovelMeta[];
  activeNovelId: string;
  onCreate: (novel: { title: string; mode: 'long' | 'short'; targetWordCount?: number; targetChapterCount?: number; worldview: string; motivation?: string }) => void;
  onUpdate: (
    id: string,
    novel: {
      title: string;
      mode: 'long' | 'short';
      targetWordCount?: number;
      targetChapterCount?: number;
      worldview: string;
      motivation?: string;
    }
  ) => void;
  onDelete: (id: string) => void;
}

type DialogMode = 'create' | 'edit';

export function NovelDialog({ open, onClose, novels, activeNovelId, onCreate, onUpdate, onDelete }: NovelDialogProps) {
  const [mode, setMode] = useState<DialogMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [novelMode, setNovelMode] = useState<'long' | 'short'>('long');
  const [targetWordCount, setTargetWordCount] = useState<number | string>('');
  const [targetChapterCount, setTargetChapterCount] = useState<number | string>('');
  const [worldview, setWorldview] = useState('');
  const [motivation, setMotivation] = useState('');

  const resetForm = useCallback(() => {
    setTitle('');
    setNovelMode('long');
    setTargetWordCount('');
    setTargetChapterCount('');
    setWorldview('');
    setMotivation('');
  }, []);

  const switchToCreate = useCallback(() => {
    setMode('create');
    setEditingId(null);
    resetForm();
  }, [resetForm]);

  const switchToEdit = useCallback((novel: NovelMeta) => {
    setMode('edit');
    setEditingId(novel.id);
    setTitle(novel.title);
    setNovelMode(novel.mode);
    setTargetWordCount(novel.targetWordCount ?? '');
    setTargetChapterCount(novel.targetChapterCount ?? '');
    setWorldview(novel.worldview);
    setMotivation(novel.motivation ?? '');
  }, []);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose();
        // Reset after close animation
        setTimeout(() => {
          setMode('create');
          setEditingId(null);
          resetForm();
        }, 200);
      }
    },
    [onClose, resetForm]
  );

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !worldview.trim()) return;

    const data = {
      title: title.trim(),
      mode: novelMode,
      targetWordCount: typeof targetWordCount === 'number' ? targetWordCount : undefined,
      targetChapterCount: typeof targetChapterCount === 'number' ? targetChapterCount : undefined,
      worldview: worldview.trim(),
      motivation: motivation.trim() || undefined,
    };

    if (mode === 'edit' && editingId) {
      onUpdate(editingId, data);
    } else {
      onCreate(data);
    }
    onClose();
    setTimeout(() => {
      setMode('create');
      setEditingId(null);
      resetForm();
    }, 200);
  }, [title, novelMode, targetWordCount, targetChapterCount, worldview, motivation, mode, editingId, onCreate, onUpdate, onClose, resetForm]);

  const canSubmit = title.trim() && worldview.trim();

  const sortedNovels = [...novels].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <Modal
      open={open}
      onClose={() => handleOpenChange(false)}
      title={mode === 'edit' ? '编辑小说信息' : '创建新小说'}
      titleExtra={
        mode === 'edit' ? (
          <button onClick={switchToCreate} style={createBtnStyle}>
            创建新小说
          </button>
        ) : null
      }
    >
      <div style={{ display: 'flex', gap: 16, minHeight: 400 }}>
        {/* Left: form */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minWidth: 0,
          }}
        >
          <FormField label="小说名称" required value={title} onChange={setTitle} placeholder="输入小说名称" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#8888aa', fontSize: 12, fontWeight: 600 }}>
              模式 <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <ModeButton active={novelMode === 'long'} onClick={() => setNovelMode('long')}>
                长篇
              </ModeButton>
              <ModeButton active={novelMode === 'short'} onClick={() => setNovelMode('short')}>
                短篇
              </ModeButton>
            </div>
          </div>
          <FormField label="预计字数" value={targetWordCount} onChange={setTargetWordCount} placeholder="例: 200000" type="number" />
          <FormField label="预计章节数" value={targetChapterCount} onChange={setTargetChapterCount} placeholder="例: 100" type="number" />
          <FormField label="世界观" required value={worldview} onChange={setWorldview} placeholder="描述小说的世界设定、时代背景、核心规则..." multiline />
          <FormField label="写作初衷" value={motivation} onChange={setMotivation} placeholder="为什么写这个故事..." multiline />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => handleOpenChange(false)} style={btnSecondary}>
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                ...btnPrimary,
                opacity: canSubmit ? 1 : 0.5,
              }}
            >
              {mode === 'edit' ? '保存' : '创建'}
            </button>
          </div>
        </div>

        {/* Right: novel list */}
        <div
          style={{
            width: 180,
            flexShrink: 0,
            borderLeft: '1px solid #333366',
            paddingLeft: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflowY: 'auto',
            maxHeight: 500,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#8888aa',
              marginBottom: 4,
            }}
          >
            已有小说
          </div>
          {sortedNovels.length === 0 && <div style={{ color: '#666', fontSize: 12 }}>暂无小说</div>}
          {sortedNovels.map(novel => {
            const isSelected = editingId === novel.id;
            const isActive = novel.id === activeNovelId;
            return (
              <div
                key={novel.id}
                onClick={() => switchToEdit(novel)}
                style={{
                  padding: '6px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: '18px',
                  background: isSelected ? 'rgba(108, 92, 231, 0.2)' : 'transparent',
                  borderLeft: isActive ? '2px solid #6c5ce7' : '2px solid transparent',
                  color: isSelected ? '#e0e0e0' : '#aaa',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => {
                  if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={e => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isActive && '● '}
                  {novel.title}
                </div>
                <div style={{ fontSize: 10, color: '#666' }}>{novel.mode === 'long' ? '长篇' : '短篇'}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// --- Sub-components ---

function FormField({ label, required, value, onChange, placeholder, type = 'text', multiline = false }: { label: string; required?: boolean; value: string | number; onChange: (v: string | number) => void; placeholder?: string; type?: 'text' | 'number'; multiline?: boolean }) {
  const InputTag = multiline ? 'textarea' : 'input';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ color: '#8888aa', fontSize: 12, fontWeight: 600 }}>
        {label} {required && <span style={{ color: '#e74c3c' }}>*</span>}
      </label>
      <InputTag
        type={type}
        value={value}
        onChange={e => onChange(type === 'number' ? (e.target.value ? parseInt(e.target.value) : '') : e.target.value)}
        placeholder={placeholder}
        style={{
          ...inputStyle,
          ...(multiline ? { resize: 'vertical' as const, minHeight: 60 } : {}),
        }}
      />
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        border: '1px solid #333366',
        borderRadius: 6,
        color: '#e0e0e0',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        background: active ? '#6c5ce7' : 'transparent',
      }}
    >
      {children}
    </button>
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
  width: '100%',
  boxSizing: 'border-box',
};

const createBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: '#6c5ce7',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  background: '#6c5ce7',
  border: 'none',
  borderRadius: 6,
  color: '#ffffff',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
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

- [ ] **Step 2: Update `Modal` to accept `titleExtra` prop**

In `modal.tsx`, update the Modal props to accept an optional `titleExtra` React node rendered next to the title. Find the Modal interface and add `titleExtra?: React.ReactNode`, then render it:

```tsx
{
  title && (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#e0e0e0' }}>{title}</div>
      {titleExtra}
    </div>
  );
}
```

- [ ] **Step 3: Update `story-layout.tsx` to wire the new dialog**

Replace the `NewNovelDialog` import with `NovelDialog`:

```typescript
import { NovelDialog } from './novel-dialog';
```

In `StoryLayoutInner`, get `updateNovel` and `deleteNovel` from `useStory()`:

```typescript
const {
  // ...existing...
  updateNovel,
  deleteNovel,
} = useStory();
```

Replace the `handleCreateNovel` with:

```typescript
const handleUpdateNovel = useCallback(
  (
    id: string,
    data: {
      title: string;
      mode: 'long' | 'short';
      targetWordCount?: number;
      targetChapterCount?: number;
      worldview: string;
      motivation?: string;
    }
  ) => {
    updateNovel(id, data);
  },
  [updateNovel]
);
```

Replace the `<NewNovelDialog>` JSX with:

```tsx
<NovelDialog open={showNewNovelDialog} onClose={() => setShowNewNovelDialog(false)} novels={novels} activeNovelId={activeNovelId} onCreate={handleCreateNovel} onUpdate={handleUpdateNovel} onDelete={deleteNovel} />
```

- [ ] **Step 4: Delete old `new-novel-dialog.tsx` and rename**

```bash
rm packages/frontend/core/src/components/story-layout/new-novel-dialog.tsx
```

The new file is created as `novel-dialog.tsx` in Step 1. Make sure `story-layout.tsx` imports from `./novel-dialog`.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/
git commit -m "feat(story): redesign novel dialog with create/edit split panel"
```

---

### Task 5: Update `story-layout.tsx` — chapter creation with auto-name

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-layout.tsx`

- [ ] **Step 1: Update the `onAddChapter` call to use auto-generated name**

In `story-layout.tsx`, locate the `StoryChapterTree` usage (~line 472). Change:

```tsx
onAddChapter={() => addChapter('新章节', '')}
```

to:

```tsx
onAddChapter={() => addChapter(`章节${chapters.length + 1}`, '')}
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-layout.tsx
git commit -m "feat(story): auto-generate chapter names and skip auto-select for non-first chapters"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Run the dev server**

```bash
yarn dev
```

Select `@affine/electron-renderer`, then start a second dev session and select `@affine/electron`.

- [ ] **Step 2: Verify Feature 1 — unsaved indicator**

1. Create a novel project and a chapter
2. Type in the BlockSuite editor
3. Observe "未保存" appearing in the status bar
4. Wait 1-2 seconds for auto-save
5. Confirm "未保存" disappears after save completes

- [ ] **Step 3: Verify Feature 2 — AI popup on long selection**

1. Create a chapter with several paragraphs of text
2. Click and drag to select 2+ paragraphs
3. Release the mouse
4. Confirm the AI popup stays open and doesn't flash/close

- [ ] **Step 4: Verify Feature 3 — title and word count sync**

1. Edit the chapter title in the editor (first line/heading)
2. Wait for auto-save
3. Check that the chapter tree sidebar updates with the new title
4. Check that word count in both the status bar and chapter tree are consistent

- [ ] **Step 5: Verify Feature 4 — novel switcher dialog**

1. Click "切换小说" in the top bar
2. Confirm dialog shows split panel: form on left, novel list on right
3. Click an existing novel in the list — confirm form fills with its data
4. Confirm title changes to "编辑小说信息" and "创建新小说" button appears
5. Click "创建新小说" — confirm form resets
6. Create a new novel and confirm it appears in the list

- [ ] **Step 6: Verify Feature 5 — chapter creation**

1. Click + in the chapter tree
2. Confirm a new chapter named "章节{N}" appears
3. Confirm you are NOT switched to the new chapter (unless it was the first chapter)
4. Click the new chapter, edit its title
5. Wait for save — confirm the chapter tree title updates
