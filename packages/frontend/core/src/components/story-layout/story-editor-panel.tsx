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
import { flip, offset } from '@floating-ui/dom';
import { html } from 'lit';
import { useCallback, useEffect, useRef, useState } from 'react';

import { setupStoryAI } from './ai/setup';
import { useStory } from './story-context';

let initialized = false;
function ensureInitialized() {
  if (!initialized) {
    setupStoryAI();
    initialized = true;
  }
}

interface StoryEditorPanelProps {
  focusMode: boolean;
  onFocusToggle: () => void;
  onSendToChat: (prompt: string) => void;
  theme: {
    background: string;
    panel: string;
    active: string;
    text: string;
    textMuted: string;
    border: string;
  };
}

export const StoryEditorPanel = ({
  focusMode,
  onFocusToggle: _onFocusToggle,
  onSendToChat,
  theme,
}: StoryEditorPanelProps) => {
  const {
    project,
    chapters,
    activeChapterIndex,
    updateChapterContent,
    error,
    getChapterStore,
  } = useStory();

  const activeChapter =
    activeChapterIndex !== null
      ? chapters.find(ch => ch.meta.index === activeChapterIndex)
      : null;

  const activeChapterStore =
    activeChapterIndex !== null ? getChapterStore(activeChapterIndex) : null;

  const [editorContent, setEditorContent] = useState('');
  const [saving, setSaving] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (activeChapter) {
      setEditorContent(activeChapter.content);
    } else {
      setEditorContent('');
    }
  }, [activeChapter]);

  const handleContentChange = useCallback(
    (value: string) => {
      setEditorContent(value);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await updateChapterContent(value);
        } finally {
          setSaving(false);
        }
      }, 1000);
    },
    [updateChapterContent]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

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
      {/* Saving/error indicator */}
      <div
        style={{
          padding: '6px 24px',
          borderBottom: focusMode ? 'none' : `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '12px',
          minHeight: focusMode ? 0 : undefined,
        }}
      >
        {saving && (
          <span style={{ color: theme.textMuted, fontSize: '12px' }}>
            保存中...
          </span>
        )}
        {error && (
          <span style={{ color: '#ff6666', fontSize: '12px' }}>保存失败</span>
        )}
      </div>
      <div
        className="affine-page-viewport"
        style={{ flex: 1, overflow: 'auto' }}
      >
        {activeChapterStore ? (
          <AffineEditorWrapper
            store={activeChapterStore}
            onSendToChat={onSendToChat}
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
};

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
}: {
  store: Store;
  onSendToChat: (prompt: string) => void;
}) {
  ensureInitialized();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<EditorHost | null>(null);
  const popupAbortRef = useRef<AbortController | null>(null);
  const popupOpenRef = useRef(false);
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

  // ── Trigger 1: Text selection → popup (debounced) ────────
  // Debounce to avoid popup flickering during drag-selection and
  // to prevent closeOnClickAway from eating the mouseup/click event.

  useEffect(() => {
    let lastSelectedText = '';
    let wasOpen = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSelectionChange = () => {
      const host = hostRef.current;
      if (!host) return;

      // Only respond to selections inside the editor, not sidebar/AI panel/etc.
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const editorRoot = wrapperRef.current;
      if (!editorRoot || !editorRoot.contains(range.commonAncestorContainer))
        return;

      if (wasOpen && !popupOpenRef.current) {
        lastSelectedText = '';
        wasOpen = false;
      }

      const text = sel.toString().trim();

      if (!text) {
        lastSelectedText = '';
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        return;
      }
      if (text === lastSelectedText) return;
      lastSelectedText = text;

      // Cancel previous pending popup
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(async () => {
        debounceTimer = null;

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

        wasOpen = true;
        showPopup(selectedText, wordCount, startIndex, endIndex);
      }, 300);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      if (debounceTimer) clearTimeout(debounceTimer);
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
