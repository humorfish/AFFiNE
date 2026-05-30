import type { EditorHost } from '@blocksuite/affine/std';
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { createRef, ref } from 'lit/directives/ref.js';

export interface StoryAISelectionInfo {
  wordCount: number;
  startIndex: number;
  endIndex: number;
}

const QUICK_ACTIONS = [
  {
    id: 'expand',
    label: '扩展',
    icon: '📖',
    prompt: '请将以下选中的文本内容进行扩展，补充更多细节和描写：\n\n',
  },
  {
    id: 'plot',
    label: '剧情开发',
    icon: '🎬',
    prompt: '请基于以下选中的文本内容继续发展剧情：\n\n',
  },
  {
    id: 'brainstorm',
    label: '脑洞',
    icon: '💡',
    prompt: '请基于以下选中的文本内容，提供一些天马行空的创意发展方向：\n\n',
  },
  {
    id: 'spark',
    label: '火花',
    icon: '✨',
    prompt: '请基于以下选中的文本内容，激发新的创作灵感：\n\n',
  },
] as const;

@customElement('story-ai-popup')
export class StoryAIPopup extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 400px;
      background: var(--affine-background-secondary-color, #1e1e1e);
      border: 1px solid var(--affine-border-color, #333);
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
      overflow: hidden;
      font-family:
        -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .info-bar {
      padding: 8px 14px;
      background: var(--affine-background-primary-color, #16162a);
      border-bottom: 1px solid var(--affine-border-color, #333);
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 12px;
      color: var(--affine-text-secondary-color, #999);
    }

    .info-bar .badge {
      background: var(--affine-primary-color, #1e96fc);
      color: #fff;
      padding: 1px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
    }

    .input-area {
      padding: 10px 14px;
      border-bottom: 1px solid var(--affine-border-color, #333);
    }

    .input-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }

    .input-row textarea {
      flex: 1;
      min-height: 36px;
      max-height: 120px;
      background: var(--affine-background-primary-color, #16162a);
      border: 1px solid var(--affine-border-color, #333);
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--affine-text-primary-color, #fff);
      font-size: 13px;
      line-height: 1.5;
      resize: none;
      outline: none;
      font-family: inherit;
      box-sizing: border-box;
    }

    .input-row textarea::placeholder {
      color: var(--affine-text-secondary-color, #666);
    }

    .input-row textarea:focus {
      border-color: var(--affine-primary-color, #1e96fc);
    }

    .send-btn {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--affine-primary-color, #1e96fc);
      border: none;
      border-radius: 6px;
      color: #fff;
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      transition: opacity 0.15s;
    }

    .send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .send-btn:not(:disabled):hover {
      opacity: 0.85;
    }

    .hint {
      text-align: right;
      font-size: 11px;
      color: var(--affine-text-secondary-color, #555);
      margin-top: 4px;
    }

    .actions {
      padding: 4px 0;
    }

    .action-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      cursor: pointer;
      color: var(--affine-text-primary-color, #eee);
      font-size: 13px;
      transition: background 0.12s;
      border: none;
      background: transparent;
      width: 100%;
      text-align: left;
      font-family: inherit;
    }

    .action-item:hover {
      background: var(--affine-hover-color, rgba(255, 255, 255, 0.06));
    }

    .action-icon {
      font-size: 16px;
      width: 22px;
      text-align: center;
      flex-shrink: 0;
    }

    .action-label {
      flex: 1;
    }

    .action-arrow {
      color: var(--affine-text-secondary-color, #555);
      font-size: 14px;
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor selectedText: string = '';

  @property({ attribute: false })
  accessor selectionInfo: StoryAISelectionInfo | null = null;

  // Direct callback — no DOM event dispatch
  @property({ attribute: false })
  accessor onSendToChat: ((prompt: string) => void) | null = null;

  // Callback to close the popup (aborts the portal's AbortController)
  @property({ attribute: false })
  accessor onClose: (() => void) | null = null;

  private readonly _inputRef = createRef<HTMLTextAreaElement>();

  override firstUpdated() {
    setTimeout(() => {
      this._inputRef.value?.focus();
    }, 50);
  }

  private _getInput(): string {
    return this._inputRef.value?.value?.trim() ?? '';
  }

  private _sendToChat() {
    const input = this._getInput();
    console.log(
      '[story-ai-popup] _sendToChat called, input:',
      JSON.stringify(input)
    );

    const info = this.selectionInfo;
    const indexInfo = info
      ? `\n\n[选中文本位置: ${info.startIndex}-${info.endIndex}]`
      : '';

    // Allow empty input — just send selected text context
    const fullPrompt = input
      ? `${input}\n\n---\n选中文本：\n${this.selectedText}${indexInfo}`
      : `选中文本：\n${this.selectedText}${indexInfo}`;

    console.log(
      '[story-ai-popup] calling onSendToChat, callback exists:',
      !!this.onSendToChat
    );
    this.onSendToChat?.(fullPrompt);
    this.onClose?.();
  }

  private _onInputKeyDown(e: KeyboardEvent) {
    // Stop all keyboard events from bubbling out of popup's shadow DOM
    // to prevent BlockSuite's global handlers from intercepting them
    e.stopPropagation();
    e.stopImmediatePropagation();

    console.log(
      '[story-ai-popup] keydown:',
      e.key,
      'shift:',
      e.shiftKey,
      'meta:',
      e.metaKey,
      'ctrl:',
      e.ctrlKey,
      'composing:',
      e.isComposing
    );

    if (e.key === 'Escape') {
      e.preventDefault();
      this.onClose?.();
      return;
    }

    // Shift+Enter = send, plain Enter = newline
    if (e.key === 'Enter' && e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this._sendToChat();
      return;
    }
  }

  private _onQuickAction(prompt: string) {
    const fullPrompt = prompt + this.selectedText;
    this.onSendToChat?.(fullPrompt);
    this.onClose?.();
  }

  override render() {
    const info = this.selectionInfo;

    return html`
      <div class="info-bar">
        ${info
          ? html`<span class="badge">${info.wordCount} 字</span>
              <span>位置 ${info.startIndex}-${info.endIndex}</span>`
          : html`<span class="badge">${this.selectedText.length} 字</span>`}
      </div>
      <div class="input-area">
        <div class="input-row">
          <textarea
            ${ref(this._inputRef)}
            placeholder="输入 AI 指令..."
            @keydown=${this._onInputKeyDown}
            rows="2"
          ></textarea>
          <button
            class="send-btn"
            title="发送到 AI 聊天"
            @click=${this._sendToChat}
          >
            &#10148;
          </button>
        </div>
        <div class="hint">Shift+Enter 发送 · Enter 换行 · Esc 关闭</div>
      </div>
      <div class="actions">
        ${QUICK_ACTIONS.map(
          action => html`
            <button
              class="action-item"
              @click=${() => this._onQuickAction(action.prompt)}
            >
              <span class="action-icon">${action.icon}</span>
              <span class="action-label">${action.label}</span>
              <span class="action-arrow">›</span>
            </button>
          `
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'story-ai-popup': StoryAIPopup;
  }
}
