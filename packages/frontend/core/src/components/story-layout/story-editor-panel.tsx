// @ts-nocheck
// oxlint-disable-next-line no-restricted-imports
import 'katex/dist/katex.min.css';
import './ai/story-ai-popup';

import { getSelectedTextContent } from '@affine/core/blocksuite/ai/utils/selection-utils';
import type { AffineEditorContainer } from '@affine/core/blocksuite/block-suite-editor';
import { BlockSuiteEditor } from '@affine/core/blocksuite/block-suite-editor';
import { createLitPortal } from '@blocksuite/affine/components/portal';
import { BlockSelection, TextSelection } from '@blocksuite/affine/std';
import type { EditorHost, Store } from '@blocksuite/affine/store';
import { Text } from '@blocksuite/affine/store';
import { flip, offset } from '@floating-ui/dom';
import { html } from 'lit';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useStory } from './story-context';

// ─────────────────────────────────────────────────────────────
// Editor API — VS Code–style external editor interface
//
// Design mirrors VS Code's extension host pattern:
//   - StoryPosition / StoryRange for precise addressing
//   - StoryEdit for batched, transactional writes
//   - applyEdit() to commit, edit() builder for convenience
//   - Read APIs for context extraction
// ─────────────────────────────────────────────────────────────

/** A point inside a block's text, addressed by blockId + character offset */
export interface StoryPosition {
  blockId: string;
  offset: number;
}

/** A range between two positions within the same block */
export interface StoryRange {
  /** Target block */
  blockId: string;
  /** Start character offset (inclusive) */
  startOffset: number;
  /** End character offset (exclusive). Same as startOffset for cursor. */
  endOffset: number;
}

/** Current editor selection state */
export interface StorySelection {
  /** Selected text content */
  text: string;
  /** Range of the selection. Null if no text is selected (cursor only). */
  range: StoryRange | null;
  /** All selected ranges (multi-block selection) */
  ranges: StoryRange[];
}

/** Snapshot of the full document */
export interface StoryDocument {
  title: string;
  content: string;
  wordCount: number;
  blocks: StoryBlock[];
}

/** A single text block in the document */
export interface StoryBlock {
  id: string;
  flavour: string;
  text: string;
  parentId: string | null;
}

/** A single atomic edit operation */
export interface StoryTextEdit {
  range: StoryRange;
  newText: string;
}

/** Batched edit transaction (like VS Code WorkspaceEdit) */
export class StoryEdit {
  private readonly _edits: StoryTextEdit[] = [];
  private readonly _newBlocks: Array<{
    flavour: string;
    text: string;
    afterBlockId?: string;
  }> = [];
  private readonly _removedBlocks: string[] = [];

  /** Replace text in a range with new content */
  replace(range: StoryRange, newText: string): this {
    this._edits.push({ range, newText });
    return this;
  }

  /** Insert text at a position (zero-length range) */
  insert(position: StoryPosition, text: string): this {
    this._edits.push({
      range: {
        blockId: position.blockId,
        startOffset: position.offset,
        endOffset: position.offset,
      },
      newText: text,
    });
    return this;
  }

  /** Delete text in a range */
  delete(range: StoryRange): this {
    this._edits.push({ range, newText: '' });
    return this;
  }

  /** Append a new paragraph block after the specified block (or at end) */
  addBlock(
    text: string,
    options?: { afterBlockId?: string; flavour?: string }
  ): this {
    this._newBlocks.push({
      flavour: options?.flavour ?? 'affine:paragraph',
      text,
      afterBlockId: options?.afterBlockId,
    });
    return this;
  }

  /** Remove a block entirely from the document */
  removeBlock(blockId: string): this {
    this._removedBlocks.push(blockId);
    return this;
  }

  /** @internal */
  get edits(): readonly StoryTextEdit[] {
    return this._edits;
  }

  /** @internal */
  get newBlocks(): readonly {
    flavour: string;
    text: string;
    afterBlockId?: string;
  }[] {
    return this._newBlocks;
  }

  /** @internal */
  get removedBlocks(): readonly string[] {
    return this._removedBlocks;
  }

  /** Check if this edit contains any operations */
  get isEmpty(): boolean {
    return (
      this._edits.length === 0 &&
      this._newBlocks.length === 0 &&
      this._removedBlocks.length === 0
    );
  }
}

/** Builder callback for inline edits (like VS Code TextEditor.edit) */
export interface EditBuilder {
  replace(range: StoryRange, newText: string): void;
  insert(position: StoryPosition, text: string): void;
  delete(range: StoryRange): void;
  addBlock(
    text: string,
    options?: { afterBlockId?: string; flavour?: string }
  ): void;
}

/**
 * The main editor API — the only way external code touches the editor.
 *
 * Usage:
 *   // Read
 *   const doc = api.getDocument();
 *   const sel = api.getSelection();
 *   const text = api.getText({ blockId, startOffset: 0, endOffset: 10 });
 *
 *   // Write (transactional)
 *   const edit = new StoryEdit()
 *     .replace(range, newText)
 *     .insert(position, "extra text")
 *     .addBlock("New paragraph");
 *   await api.applyEdit(edit);
 *
 *   // Write (builder shorthand)
 *   await api.edit(b => {
 *     b.replace(range, "replacement");
 *     b.delete(otherRange);
 *   });
 */
export interface EditorAPI {
  // ── Read ───────────────────────────────────────────────────

  /** Get full document snapshot */
  getDocument(): StoryDocument;
  /** Get text within a range (or full block text if endOffset omitted) */
  getText(range: StoryRange): string;
  /** Get current selection */
  getSelection(): StorySelection | null;

  // ── Write (transactional, like VS Code WorkspaceEdit) ──────

  /** Apply a batched edit transaction. Returns true if all ops succeeded. */
  applyEdit(edit: StoryEdit): Promise<boolean>;
  /** Builder shorthand: construct and apply edits in one call */
  edit(callback: (builder: EditBuilder) => void): Promise<boolean>;

  // ── Focus ──────────────────────────────────────────────────

  focus(): void;
}

const EditorAPIContext = createContext<EditorAPI | null>(null);

/** Use the editor API from any descendant component */
export const useEditorAPI = (): EditorAPI | null =>
  useContext(EditorAPIContext);

let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    const { setupStoryAI } = await import('./ai/setup');
    setupStoryAI();
    initialized = true;
  }
}

interface StoryEditorPanelProps {
  focusMode: boolean;
  onFocusToggle: () => void;
  onSendToChat: (prompt: string) => void;
  onDirtyChange?: (dirty: boolean, chapterId: string) => void;
  theme: {
    background: string;
    panel: string;
    active: string;
    text: string;
    textMuted: string;
    border: string;
  };
}

export const StoryEditorPanel = /* @__PURE__ */ Object.assign(
  forwardRef<EditorAPI, StoryEditorPanelProps>(
    (
      {
        focusMode: _focusMode,
        onFocusToggle: _onFocusToggle,
        onSendToChat,
        onDirtyChange,
        theme,
      },
      ref
    ) => {
      const {
        project,
        chapters,
        activeChapterId,
        activeNovelId,
        novels,
        volumes: _volumes,
        updateChapterContent,
        error,
        getChapterStore,
      } = useStory();

      const activeChapter = activeChapterId
        ? (chapters.find(ch => ch.meta.id === activeChapterId) ?? null)
        : null;

      const activeChapterStore = activeChapterId
        ? getChapterStore(activeChapterId)
        : null;

      const [editorContent, setEditorContent] = useState('');
      const [saving, setSaving] = useState(false);
      const [dirty, setDirty] = useState(false);
      // Trigger re-render when editor API becomes available
      const [apiVersion, setApiVersion] = useState(0);

      // Local ref that AffineEditorWrapper writes to
      const editorApiRef = useRef<EditorAPI | null>(null);

      // Sync to parent ref whenever apiVersion changes
      useEffect(() => {
        if (typeof ref === 'function') {
          ref(editorApiRef.current);
        } else if (ref) {
          (ref as React.MutableRefObject<EditorAPI | null>).current =
            editorApiRef.current;
        }
      }, [apiVersion, ref]);

      useEffect(() => {
        if (activeChapter) {
          setEditorContent(activeChapter.content);
        } else {
          setEditorContent('');
        }
      }, [activeChapter]);

      const handleSave = useCallback(
        async (
          content: string,
          meta?: { title?: string; wordCount?: number }
        ) => {
          setSaving(true);
          try {
            await updateChapterContent(content, meta);
            setDirty(false);
            if (activeChapterId) {
              onDirtyChange?.(false, activeChapterId);
            }
          } finally {
            setSaving(false);
          }
        },
        [updateChapterContent, activeChapterId, onDirtyChange]
      );

      const handleContentChange = useCallback(
        (value: string) => {
          setEditorContent(value);
          setDirty(true);
          if (activeChapterId) onDirtyChange?.(true, activeChapterId);
        },
        [activeChapterId, onDirtyChange]
      );

      const handleBlockSuiteContentChange = useCallback(
        (_data: { content: string; title: string; wordCount: number }) => {
          setDirty(true);
          if (activeChapterId) onDirtyChange?.(true, activeChapterId);
        },
        [activeChapterId, onDirtyChange]
      );

      // Cmd+S / Ctrl+S to save
      useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            if (!dirty) return;
            if (activeChapterStore) {
              // Extract content from BlockSuite store
              const store = activeChapterStore;
              const root = store.root;
              if (!root) return;
              const titleText = (root as any).title?.toString?.() ?? '';
              let wordCount = 0;
              const parts: string[] = [];
              for (const model of store.getAllModels()) {
                if ((model as any).text) {
                  const text = (model as any).text.toString();
                  const chineseChars = (text.match(/[一-鿿㐀-䶿]/g) || [])
                    .length;
                  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
                  wordCount += chineseChars + englishWords;
                  parts.push(text);
                }
              }
              const content = parts.join('\n');
              handleSave(content, { title: titleText, wordCount }).catch(
                () => {}
              );
            } else {
              handleSave(editorContent).catch(() => {});
            }
          }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
      }, [dirty, activeChapterStore, editorContent, handleSave]);

      if (!project) {
        return (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              background: theme.background,
            }}
          >
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
              }}
            >
              <div
                style={{
                  color: theme.textMuted,
                  fontSize: '18px',
                  opacity: 0.6,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                  &#128214;
                </div>
                <div>请先在左侧创建或打开一个项目</div>
                <div style={{ fontSize: '14px', marginTop: '8px' }}>
                  项目数据将保存在本地，由 Git 进行版本管理
                </div>
              </div>
            </div>
          </div>
        );
      }

      if (!activeChapter) {
        return (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              background: theme.background,
            }}
          >
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
              }}
            >
              <div
                style={{
                  color: theme.textMuted,
                  fontSize: '18px',
                  opacity: 0.6,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                  &#9997;
                </div>
                <div>请在左侧选择一个章节开始写作</div>
                {chapters.length === 0 && (
                  <div style={{ fontSize: '14px', marginTop: '8px' }}>
                    还没有章节，点击左侧章节管理中的 + 创建第一章
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }

      return (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            background: theme.background,
          }}
        >
          {/* Status bar (20px) — chapter path, name, word count */}
          <div
            style={{
              height: 20,
              minHeight: 20,
              padding: '0 16px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: theme.panel,
              fontSize: 10,
              color: theme.textMuted,
              userSelect: 'none',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {(() => {
                  const novel = novels.find(n => n.id === activeNovelId);
                  const parts = [novel?.title ?? ''];
                  // Find parent chapter for breadcrumb (long novel: parent is volume-like)
                  if (activeChapter?.meta?.parentId) {
                    const parent = chapters.find(
                      ch => ch.meta.id === activeChapter.meta.parentId
                    );
                    if (parent) parts.push(parent.meta.title || '章节');
                  }
                  parts.push(activeChapter?.meta?.title || '章节');
                  return parts.filter(Boolean).join(' / ');
                })()}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
              }}
            >
              {dirty && !saving && (
                <span style={{ color: '#f0a030' }}>未保存</span>
              )}
              {saving && (
                <span style={{ color: theme.textMuted }}>保存中...</span>
              )}
              {error && <span style={{ color: '#ff6666' }}>保存失败</span>}
              {activeChapter?.meta?.wordCount !== undefined && (
                <span>{activeChapter.meta.wordCount} 字</span>
              )}
            </div>
          </div>
          <div
            className="affine-page-viewport"
            style={{ flex: 1, overflow: 'auto' }}
          >
            {activeChapterStore ? (
              <AffineEditorWrapper
                store={activeChapterStore}
                onSendToChat={onSendToChat}
                onContentChange={handleBlockSuiteContentChange}
                apiRef={editorApiRef}
                onApiReady={() => setApiVersion(v => v + 1)}
              />
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  padding: '24px',
                  overflow: 'auto',
                }}
              >
                <textarea
                  value={editorContent}
                  onChange={e => handleContentChange(e.target.value)}
                  placeholder="开始写作..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: theme.text,
                    fontSize: '16px',
                    lineHeight: 1.8,
                    resize: 'none',
                    fontFamily:
                      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    padding: 0,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      );
    }
  ),
  { displayName: 'StoryEditorPanel' }
);

// ─────────────────────────────────────────────────────────────
// Shadow-DOM-aware DOM helpers
// ─────────────────────────────────────────────────────────────

function findInShadowDOM(
  root: Element | null,
  selector: string
): Element | null {
  if (!root) return null;
  const queue: Element[] = [root];
  while (queue.length > 0) {
    const el = queue.shift() as Element;
    if (el.matches?.(selector)) return el;
    if (el.shadowRoot) {
      const found = el.shadowRoot.querySelector(selector);
      if (found) return found;
      queue.push(...Array.from(el.shadowRoot.children));
    }
    queue.push(...Array.from(el.children));
  }
  return null;
}

function hideToolbarWidgets(root: Element | null) {
  if (!root) return;
  const queue: Element[] = [root];
  while (queue.length > 0) {
    const el = queue.shift() as Element;
    if (el.tagName?.toLowerCase() === 'affine-toolbar-widget') {
      (el as HTMLElement).style.display = 'none';
    }
    if (el.shadowRoot) {
      queue.push(...Array.from(el.shadowRoot.children));
      const toolbar = el.shadowRoot.querySelector('affine-toolbar-widget');
      if (toolbar) (toolbar as HTMLElement).style.display = 'none';
    }
    queue.push(...Array.from(el.children));
  }
}

// ─────────────────────────────────────────────────────────────
// AffineEditorWrapper — manages AI popup lifecycle
// ─────────────────────────────────────────────────────────────

function AffineEditorWrapper({
  store,
  onSendToChat,
  onContentChange,
  apiRef,
  onApiReady,
}: {
  store: Store;
  onSendToChat: (prompt: string) => void;
  onContentChange: (data: {
    content: string;
    title: string;
    wordCount: number;
  }) => void;
  apiRef: React.MutableRefObject<EditorAPI | null>;
  onApiReady?: () => void;
}) {
  ensureInitialized();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<EditorHost | null>(null);
  const popupAbortRef = useRef<AbortController | null>(null);
  const popupOpenRef = useRef(false);
  const popupOpenTimeRef = useRef(0);
  const slashTriggeredRef = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);

  // Diagnostic: confirm component mounts
  useEffect(() => {
    console.log(
      '[StoryAI] AffineEditorWrapper mounted, store id:',
      store.id,
      'hasRoot:',
      !!store.root
    );
  }, [store]);

  // Stable refs for callbacks used inside Lit templates
  const onSendToChatRef = useRef(onSendToChat);
  onSendToChatRef.current = onSendToChat;

  // ── Acquire EditorHost ───────────────────────────────────
  // Primary: onEditorReady callback. Fallback: DOM polling.

  const trySetHost = useCallback(() => {
    if (hostRef.current) return true;
    const host = findInShadowDOM(
      wrapperRef.current,
      'editor-host'
    ) as EditorHost | null;
    if (host) {
      hostRef.current = host;
      console.log('[StoryAI] EditorHost acquired via DOM');
      return true;
    }
    return false;
  }, []);

  const handleEditorReady = useCallback((editor: AffineEditorContainer) => {
    const host = editor.host;
    console.log('[StoryAI] onEditorReady fired, host:', !!host);
    if (host) {
      hostRef.current = host;
    }
  }, []);

  // Poll for EditorHost as fallback (in case onEditorReady never fires)
  useEffect(() => {
    if (hostRef.current) return;
    let attempts = 0;
    const maxAttempts = 20;
    const interval = setInterval(() => {
      attempts++;
      if (trySetHost() || attempts >= maxAttempts) {
        clearInterval(interval);
        if (!hostRef.current) {
          console.warn(
            '[StoryAI] failed to acquire EditorHost after',
            maxAttempts,
            'attempts'
          );
        }
      }
    }, 300);
    return () => clearInterval(interval);
  }, [trySetHost]);

  // Hide BlockSuite's format toolbar (it lives inside shadow DOM, CSS can't reach it)
  useEffect(() => {
    const interval = setInterval(() => {
      hideToolbarWidgets(wrapperRef.current);
    }, 1000);
    // Also try immediately and after short delay
    hideToolbarWidgets(wrapperRef.current);
    setTimeout(() => hideToolbarWidgets(wrapperRef.current), 500);
    return () => clearInterval(interval);
  }, []);

  // ── Build and expose EditorAPI ──────────────────────────
  useEffect(() => {
    const countWords = (text: string) => {
      const chineseChars = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
      const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
      return chineseChars + englishWords;
    };

    const getModelText = (model: any): string => model.text?.toString?.() ?? '';

    const api: EditorAPI = {
      // ── Read ───────────────────────────────────────────────

      getDocument() {
        const root = store.root;
        if (!root) return { title: '', content: '', wordCount: 0, blocks: [] };
        const titleText = (root as any).title?.toString?.() ?? '';
        let wordCount = 0;
        const parts: string[] = [];
        const blocks: StoryBlock[] = [];
        for (const model of store.getAllModels()) {
          const text = getModelText(model);
          if (text || (model as any).text) {
            wordCount += countWords(text);
            parts.push(text);
            blocks.push({
              id: model.id,
              flavour: model.flavour,
              text,
              parentId: model.parent?.id ?? null,
            });
          }
        }
        return {
          title: titleText,
          content: parts.join('\n'),
          wordCount,
          blocks,
        };
      },

      getText(range) {
        const block = store.getBlock(range.blockId)?.model;
        if (!block) return '';
        const full = getModelText(block);
        if (range.endOffset === undefined) return full;
        return full.slice(range.startOffset, range.endOffset);
      },

      getSelection() {
        const host = hostRef.current;
        const domSel = window.getSelection();
        const hasDomSelection =
          domSel && domSel.rangeCount > 0 && !domSel.getRangeAt(0).collapsed;

        if (!host) {
          if (!hasDomSelection) return null;
          return {
            text: domSel?.toString() ?? '',
            range: null,
            ranges: [],
          };
        }

        const textSel = host.selection.find(TextSelection);
        const blockSels = host.selection.filter(BlockSelection);

        // Text selection
        if (textSel) {
          const block = host.view.getBlock(textSel.blockId);
          const text = block?.model?.text?.toString() ?? '';
          const from = textSel.from?.index ?? 0;
          const to = textSel.to;
          const endOffset = to
            ? (to.index ?? 0) + (to.length ?? 0)
            : from + (textSel.from?.length ?? 0);
          const selectedText = text.slice(from, endOffset);
          const range: StoryRange = {
            blockId: textSel.blockId,
            startOffset: from,
            endOffset,
          };
          return { text: selectedText, range, ranges: [range] };
        }

        // Block selection
        if (blockSels.length > 0) {
          const ranges: StoryRange[] = blockSels.map(bs => ({
            blockId: bs.blockId,
            startOffset: 0,
            endOffset: host.view.getBlock(bs.blockId)?.model?.text?.length ?? 0,
          }));
          return {
            text: ranges
              .map(r => api.getText(r))
              .filter(Boolean)
              .join('\n'),
            range: ranges[0] ?? null,
            ranges,
          };
        }

        // DOM-level selection fallback
        if (hasDomSelection) {
          return {
            text: domSel?.toString() ?? '',
            range: null,
            ranges: [],
          };
        }

        return null;
      },

      // ── Write ──────────────────────────────────────────────

      async applyEdit(storyEdit) {
        if (storyEdit.isEmpty) return true;

        try {
          // 1. Apply text edits — process from end to start to preserve offsets
          const sorted = [...storyEdit.edits].sort(
            (a, b) => b.range.startOffset - a.range.startOffset
          );

          for (const { range, newText } of sorted) {
            const block = store.getBlock(range.blockId)?.model;
            if (!block || !(block as any).text) continue;
            const len = range.endOffset - range.startOffset;
            if (len > 0) {
              (block as any).text.replace(range.startOffset, len, newText);
            } else {
              (block as any).text.insert(newText, range.startOffset);
            }
          }

          // 2. Remove blocks
          for (const blockId of storyEdit.removedBlocks) {
            const block = store.getBlock(blockId)?.model;
            if (block) store.deleteBlock(block);
          }

          // 3. Add new blocks — track insertedCount for correct sequential ordering
          // BlockSuite structure: affine:page → affine:note → affine:paragraph
          const root = store.root;
          if (root && storyEdit.newBlocks.length > 0) {
            const note = root.children?.find(
              (c: any) => c.flavour === 'affine:note'
            );
            if (note) {
              let insertedCount = 0;
              for (const nb of storyEdit.newBlocks) {
                let insertIndex: number | undefined;
                if (nb.afterBlockId) {
                  const afterBlock = store.getBlock(nb.afterBlockId)?.model;
                  if (afterBlock) {
                    const siblings =
                      afterBlock.parent?.children ?? note.children;
                    const afterIdx = siblings.indexOf(afterBlock as any);
                    if (afterIdx >= 0)
                      insertIndex = afterIdx + 1 + insertedCount;
                  }
                }
                if (insertIndex === undefined) {
                  insertIndex = note.children?.length ?? 0;
                }
                store.addBlock(
                  nb.flavour as any,
                  { text: new Text(nb.text) },
                  note,
                  insertIndex
                );
                insertedCount++;
              }
            }
          }

          return true;
        } catch (e) {
          console.error('[EditorAPI] applyEdit failed:', e);
          return false;
        }
      },

      async edit(callback) {
        const storyEdit = new StoryEdit();
        const builder: EditBuilder = {
          replace: (range, newText) => storyEdit.replace(range, newText),
          insert: (position, text) => storyEdit.insert(position, text),
          delete: range => storyEdit.delete(range),
          addBlock: (text, options) => storyEdit.addBlock(text, options),
        };
        callback(builder);
        return api.applyEdit(storyEdit);
      },

      // ── Focus ──────────────────────────────────────────────

      focus() {
        wrapperRef.current?.focus();
      },
    };

    apiRef.current = api;
    onApiReady?.();
    return () => {
      apiRef.current = null;
      onApiReady?.();
    };
  }, [store, apiRef, onApiReady]);

  // Debounced content extraction on BlockSuite store changes
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let initialized = false;

    // Skip events from the initial block creation (page, surface, note, paragraph)
    const initTimer = setTimeout(() => {
      initialized = true;
    }, 1500);

    const extractAndNotify = () => {
      if (disposed) return;
      try {
        const root = store.root;
        if (!root) return;

        const titleText = (root as any).title?.toString?.() ?? '';

        let wordCount = 0;
        const parts: string[] = [];
        const allModels = store.getAllModels();
        for (const model of allModels) {
          if ((model as any).text) {
            const text = (model as any).text.toString();
            const chineseChars = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
            const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
            wordCount += chineseChars + englishWords;
            parts.push(text);
          }
        }
        const content = parts.join('\n');

        onContentChange({ content, title: titleText, wordCount });
      } catch (e) {
        console.warn('[StoryAI] content extraction failed:', e);
      }
    };

    const sub = store.slots.blockUpdated.subscribe(() => {
      if (!initialized) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(extractAndNotify, 800);
    });

    return () => {
      disposed = true;
      clearTimeout(initTimer);
      sub.unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [store, onContentChange]);

  // ── Popup lifecycle ──────────────────────────────────────

  // Restore focus by replaying the saved DOM selection range.
  // For text selections, collapse to end to avoid re-triggering popup.
  const restoreEditorFocus = useCallback(() => {
    const range = savedRangeRef.current;
    if (!range) {
      console.warn('[StoryAI] no saved range');
      return;
    }

    try {
      // Collapse selection to end to prevent selectionchange loop
      if (!range.collapsed) {
        range.collapse(false); // false = collapse to end
      }

      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);

      // Also focus the container element
      const container = range.commonAncestorContainer;
      const el =
        container instanceof HTMLElement ? container : container.parentElement;
      if (el) el.focus();
      console.log('[StoryAI] focus restored via DOM range');
    } catch (e) {
      console.warn('[StoryAI] failed to restore range:', e);
    }
  }, []);

  const closePopup = useCallback(() => {
    popupAbortRef.current?.abort();
    popupAbortRef.current = null;
    popupOpenRef.current = false;
  }, []);

  const removeSlashChar = useCallback(() => {
    if (!slashTriggeredRef.current) return;
    slashTriggeredRef.current = false;
    const host = hostRef.current;
    if (!host) return;
    try {
      const textSelection = host.selection.find(TextSelection);
      if (!textSelection) return;
      const block = host.view.getBlock(textSelection.blockId);
      if (!block?.model?.text) return;
      const idx = textSelection.from?.index ?? 0;
      if (idx > 0 && block.model.text.toString().slice(idx - 1, idx) === '/') {
        block.model.text.delete(idx - 1, 1);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handlePopupSend = useCallback(
    (prompt: string) => {
      removeSlashChar();
      onSendToChatRef.current(prompt);
      closePopup();
    },
    [closePopup, removeSlashChar]
  );

  const handlePopupClose = useCallback(() => {
    slashTriggeredRef.current = false;
    restoreEditorFocus();
    closePopup();
  }, [closePopup, restoreEditorFocus]);

  const showPopup = useCallback(
    (
      selectedText: string,
      wordCount: number,
      startIndex: number,
      endIndex: number
    ) => {
      const host = hostRef.current;
      const el = wrapperRef.current;
      if (!host || !el) return;

      // Save the DOM selection range before popup steals focus
      try {
        const domSel = window.getSelection();
        savedRangeRef.current = domSel?.rangeCount
          ? domSel.getRangeAt(0).cloneRange()
          : null;
        console.log(
          '[StoryAI] saved DOM range, collapsed:',
          savedRangeRef.current?.collapsed,
          'startOffset:',
          savedRangeRef.current?.startOffset
        );
      } catch {
        /* ignore */
      }

      closePopup();
      popupOpenRef.current = true;
      popupOpenTimeRef.current = Date.now();

      const textSelection = host.selection.find(TextSelection);
      const blockSelections = host.selection.filter(BlockSelection);
      const lastBlockId = textSelection
        ? (textSelection.to?.blockId ?? textSelection.blockId)
        : blockSelections.length
          ? blockSelections[blockSelections.length - 1].blockId
          : undefined;
      const block = lastBlockId ? host.view.getBlock(lastBlockId) : null;

      const abortController = new AbortController();
      popupAbortRef.current = abortController;

      // Clean up popup state when portal is aborted (closeOnClickAway, etc.)
      abortController.signal.addEventListener('abort', () => {
        popupOpenRef.current = false;
        slashTriggeredRef.current = false;
      });

      createLitPortal({
        template: html`<story-ai-popup
          .host=${host}
          .selectedText=${selectedText}
          .selectionInfo=${{ wordCount, startIndex, endIndex }}
          .onSendToChat=${handlePopupSend}
          .onClose=${handlePopupClose}
        ></story-ai-popup>`,
        computePosition: {
          referenceElement: block ?? el,
          placement: 'bottom-start',
          middleware: [flip(), offset({ mainAxis: 4 })],
          autoUpdate: true,
        },
        abortController,
        closeOnClickAway: true,
      });
    },
    [handlePopupSend, handlePopupClose, closePopup]
  );

  // ── Trigger 1: mouseup with selected text → popup ────────
  // Listen for left mouseup, then check if text is selected.

  useEffect(() => {
    const handleMouseUp = async (e: MouseEvent) => {
      // Only left button
      if (e.button !== 0) return;
      // Don't trigger if popup is already open
      if (popupOpenRef.current) return;

      const host = hostRef.current;
      if (!host) return;

      // Small delay to let the browser finalize the selection
      await new Promise(r => setTimeout(r, 50));

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;

      // Only respond to selections inside the editor
      const editorRoot = wrapperRef.current;
      if (!editorRoot || !editorRoot.contains(range.commonAncestorContainer))
        return;

      const text = sel.toString().trim();
      if (!text) return;

      let selectedText = text;
      try {
        const bsText = await getSelectedTextContent(host, 'plain-text');
        if (bsText) selectedText = bsText;
      } catch {
        /* fallback */
      }

      const chineseChars = (selectedText.match(/[一-鿿㐀-䶿]/g) || []).length;
      const englishWords = (selectedText.match(/[a-zA-Z]+/g) || []).length;
      const wordCount = chineseChars + englishWords;

      const textSelection = host.selection.find(TextSelection);
      const startIndex = textSelection?.from?.index ?? 0;
      const endIndex =
        textSelection?.to?.index ?? startIndex + selectedText.length;

      showPopup(selectedText, wordCount, startIndex, endIndex);
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [showPopup]);

  // ── Trigger 2: `/` key → popup ───────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      if (e.defaultPrevented || e.isComposing) return;
      if (popupOpenRef.current) return;

      const host = hostRef.current;
      if (!host) return;

      const el = wrapperRef.current;
      if (!el) return;
      if (!e.composedPath().includes(el)) return;

      slashTriggeredRef.current = true;
      setTimeout(() => showPopup('', 0, 0, 0), 0);
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [showPopup]);

  useEffect(() => closePopup, [closePopup]);

  return (
    <div ref={wrapperRef}>
      <BlockSuiteEditor
        mode="page"
        page={store}
        onEditorReady={handleEditorReady}
      />
    </div>
  );
}
