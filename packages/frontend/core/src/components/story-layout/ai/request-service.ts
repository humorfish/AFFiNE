// @ts-nocheck
// Custom AIRequestService that uses HTTP/SSE calls to the backend server
// instead of direct LLMClient calls.
//
// Two modes:
//   1. Inline mode (行间补全): action !== 'chat', single request/response, no tool calling
//   2. Agent mode (聊天窗口):  action === 'chat', tool calling with messages history

import { Subject } from 'rxjs';

import type { ActionEventType } from '../../../blocksuite/ai/provider';
import type {
  AIActionId,
  AIActionOptions,
} from '../../../blocksuite/ai/runtime/request/action-definitions';
import type { EditorAPI } from '../story-editor-panel';
import { StoryEdit } from '../story-editor-panel';
import { buildToolEdit } from './editor-tools';

type CreateSessionOptions = BlockSuitePresets.AICreateSessionOptions;

export type AIRequestActionEvent = {
  action: AIActionId;
  options: AIActionOptions;
  event: ActionEventType;
};

const API_BASE = 'http://localhost:3001/api/ai';

/** Check if action is chat/agent mode */
function isAgentMode(id: AIActionId): boolean {
  return id === 'chat';
}

export class StoryAIRequestService {
  private lastActionSessionId = '';
  private readonly actionHistory: {
    action: AIActionId;
    options: AIActionOptions;
  }[] = [];
  readonly actionEvents$ = new Subject<AIRequestActionEvent>();

  // Session storage (memory, mirrored to backend)
  private readonly sessions = new Map<
    string,
    {
      id: string;
      promptName: string;
      messages: { role: string; content: string }[];
    }
  >();

  /** Chapter → Session mapping (in-memory cache of persisted sessions) */
  private readonly chapterSessions = new Map<
    string, // `${novelId}/${chapterId}`
    { sessionId: string; messages: Array<{ role: string; content: string }> }
  >();

  /** Current chapter context — set by layout when active chapter changes */
  private currentChapter: {
    workspacePath: string;
    novelId: string;
    chapterId: string;
  } | null = null;

  /** Getter function — reads ref at call time, not effect time */
  private editorApiGetter: (() => EditorAPI | null) | null = null;

  setEditorApiGetter(getter: (() => EditorAPI | null) | null) {
    this.editorApiGetter = getter;
  }

  /** Set current chapter context — called when active chapter changes */
  async setCurrentChapter(
    workspacePath: string,
    novelId: string,
    chapterId: string
  ): Promise<{
    sessionId: string;
    messages: Array<{ role: string; content: string }>;
  } | null> {
    this.currentChapter = { workspacePath, novelId, chapterId };
    const key = `${novelId}/${chapterId}`;

    // Already cached in memory
    if (this.chapterSessions.has(key)) {
      return this.chapterSessions.get(key) ?? null;
    }

    // Try loading from disk via IPC
    try {
      const { apis } = await import('@affine/electron-api');
      const data = await (apis as any)?.story?.readChapterSession?.(
        workspacePath,
        novelId,
        chapterId
      );
      if (data?.sessionId) {
        this.chapterSessions.set(key, {
          sessionId: data.sessionId,
          messages: data.messages ?? [],
        });
        this.sessions.set(data.sessionId, {
          id: data.sessionId,
          promptName: 'chat',
          messages: data.messages ?? [],
        });
        this.lastActionSessionId = data.sessionId;
        return this.chapterSessions.get(key) ?? null;
      }
    } catch {
      // IPC not available (web mode) or file doesn't exist
    }

    return null;
  }

  /** Clear current chapter context (e.g. when no chapter is active) */
  clearCurrentChapter() {
    this.currentChapter = null;
  }

  /** Persist current chapter session to disk */
  private async saveCurrentChapterSession(): Promise<void> {
    if (!this.currentChapter) return;
    const { workspacePath, novelId, chapterId } = this.currentChapter;
    const key = `${novelId}/${chapterId}`;
    const session = this.chapterSessions.get(key);
    if (!session) return;

    try {
      const { apis } = await import('@affine/electron-api');
      await (apis as any)?.story?.writeChapterSession?.(
        workspacePath,
        novelId,
        chapterId,
        { sessionId: session.sessionId, messages: session.messages }
      );
    } catch {
      // IPC not available — skip persistence
    }
  }

  private getEditorApi(): EditorAPI | null {
    return this.editorApiGetter?.() ?? null;
  }

  /**
   * Read editor context — different content for inline vs agent mode.
   *
   * Inline mode: needs range info (cursor position, surrounding lines)
   * Agent mode: needs full document overview (all paragraphs numbered)
   */
  private readEditorContext(mode: 'inline' | 'agent'): Record<string, unknown> {
    const api = this.getEditorApi();
    if (!api) {
      console.warn('[StoryAI] readEditorContext: EditorAPI not available');
      return {};
    }
    try {
      const doc = api.getDocument();
      const sel = api.getSelection();
      const ctx: Record<string, unknown> = {};
      const paragraphs = doc.blocks.filter(
        b => b.flavour === 'affine:paragraph'
      );

      if (mode === 'inline') {
        // Inline mode: range + surrounding context
        if (sel?.text) {
          ctx['选中文本'] = sel.text;
          if (sel.range) {
            // Find which paragraph (line number) the selection is in
            const blockId = sel.range.blockId;
            const lineIdx = paragraphs.findIndex(b => b.id === blockId);
            ctx['选区范围'] = JSON.stringify({
              startLine: lineIdx + 1,
              startCol: sel.range.startOffset,
              endLine: lineIdx + 1,
              endCol: sel.range.endOffset,
            });
          }
        }
        // Always include surrounding lines for inline context
        if (paragraphs.length > 0) {
          const cursorBlockId = sel?.range?.blockId ?? paragraphs[0].id;
          const cursorIdx = Math.max(
            0,
            paragraphs.findIndex(b => b.id === cursorBlockId)
          );
          const start = Math.max(0, cursorIdx - 3);
          const end = Math.min(paragraphs.length, cursorIdx + 4);
          const nearby = [];
          for (let i = start; i < end; i++) {
            nearby.push(`[${i + 1}] ${paragraphs[i].text}`);
          }
          ctx['当前编辑器上下文'] = `标题：${doc.title}\n${nearby.join('\n')}`;
          ctx['光标所在行'] = cursorIdx + 1;
        }
      } else {
        // Agent mode: full document numbered
        if (doc && (doc.title || doc.content)) {
          const lines = paragraphs.map((b, i) => `[${i + 1}] ${b.text}`);
          ctx['当前编辑器文档'] = `标题：${doc.title}\n${lines.join('\n')}`;
        }
      }

      console.log(
        '[StoryAI] readEditorContext:',
        mode,
        Object.keys(ctx).length > 0 ? 'has context' : 'empty',
        Object.keys(ctx)
      );
      return ctx;
    } catch (e) {
      console.error('[StoryAI] readEditorContext error:', e);
      return {};
    }
  }

  isReady() {
    return true;
  }

  async createSession(options: CreateSessionOptions): Promise<string> {
    if (options.sessionId) {
      this.lastActionSessionId = options.sessionId;
      if (!this.sessions.has(options.sessionId)) {
        this.sessions.set(options.sessionId, {
          id: options.sessionId,
          promptName: options.promptName ?? '',
          messages: [],
        });
      }
      return options.sessionId;
    }

    if (options.retry) return this.lastActionSessionId;

    const sessionId = crypto.randomUUID();
    this.lastActionSessionId = sessionId;
    this.sessions.set(sessionId, {
      id: sessionId,
      promptName: options.promptName ?? '',
      messages: [],
    });

    return sessionId;
  }

  /**
   * createSessionWithHistory — called by AIChatRuntime.
   * For chat mode, check if chapter has a persisted session to reuse.
   */
  async createSessionWithHistory(options: CreateSessionOptions) {
    // For chat mode, try loading chapter session first
    if (this.currentChapter) {
      const key = `${this.currentChapter.novelId}/${this.currentChapter.chapterId}`;
      const chapterSession = this.chapterSessions.get(key);
      if (chapterSession) {
        // Reuse existing chapter session
        const sessionId = chapterSession.sessionId;
        this.lastActionSessionId = sessionId;
        if (!this.sessions.has(sessionId)) {
          this.sessions.set(sessionId, {
            id: sessionId,
            promptName: options.promptName ?? 'chat',
            messages: [...chapterSession.messages],
          });
        }
        return this.getSession(options.workspaceId, sessionId);
      }
    }

    // No chapter session — create new
    const sessionId = await this.createSession(options);
    return this.getSession(options.workspaceId, sessionId);
  }

  getSession(_workspaceId: string, sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      id: session.id,
      promptName: session.promptName,
      messages: session.messages.map(m => ({
        role: m.role,
        content: m.content,
        createdAt: new Date().toISOString(),
      })),
    };
  }

  async getSessions(_workspaceId: string, _docId?: string) {
    try {
      const params = new URLSearchParams();
      if (_workspaceId) params.set('workspaceId', _workspaceId);
      if (_docId) params.set('docId', _docId);
      const res = await fetch(`${API_BASE}/sessions?${params.toString()}`);
      if (res.ok) {
        return (await res.json()) as BlockSuitePresets.AISession[];
      }
    } catch {
      // fallback to empty
    }
    return [];
  }

  getRecentSessions(_workspaceId: string, _limit?: number, _offset?: number) {
    return Promise.resolve([]);
  }

  updateSession(_options: any) {
    return Promise.resolve();
  }

  async cleanupSessions(input: {
    workspaceId: string;
    docId: string | undefined;
    sessionIds: string[];
  }) {
    for (const id of input.sessionIds) {
      this.sessions.delete(id);
      try {
        await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
      } catch {
        // ignore
      }
    }
  }

  histories = {
    actions: async () => [] as BlockSuitePresets.AIHistory[],
    chats: async () => [] as BlockSuitePresets.AIHistory[],
    cleanup: async (
      _workspaceId: string,
      _docId: string | undefined,
      sessionIds: string[]
    ) => {
      for (const id of sessionIds) {
        this.sessions.delete(id);
      }
    },
    ids: async () => [] as BlockSuitePresets.AIHistoryIds[],
  };

  context = {
    createContext: async (_workspaceId: string, _sessionId: string) =>
      crypto.randomUUID(),
    getContextId: async (_workspaceId: string, _sessionId: string) =>
      null as string | null,
    addContextDoc: async (_options: { contextId: string; docId: string }) => {},
    removeContextDoc: async (_options: {
      contextId: string;
      docId: string;
    }) => {},
    addContextFile: async (_file: File, _options: any) => {},
    removeContextFile: async (_options: {
      contextId: string;
      fileId: string;
    }) => {},
    addContextTag: async (_options: {
      contextId: string;
      tagId: string;
      docIds: string[];
    }) => {},
    removeContextTag: async (_options: {
      contextId: string;
      tagId: string;
    }) => {},
    addContextCollection: async (_options: {
      contextId: string;
      collectionId: string;
      docIds: string[];
    }) => {},
    removeContextCollection: async (_options: {
      contextId: string;
      collectionId: string;
    }) => {},
    getContextDocsAndFiles: async () => null,
    matchContext: async () => [],
    addContextBlob: async (_options: {
      blobId: string;
      contextId: string;
    }) => {},
    removeContextBlob: async (_options: {
      blobId: string;
      contextId: string;
    }) => {},
    pollContextDocsAndFiles: async () => {},
    pollEmbeddingStatus: async () => {},
  };

  forkChat(_options: BlockSuitePresets.AIForkChatSessionOptions) {
    return Promise.resolve(undefined);
  }

  reportLastAction(event: ActionEventType, host?: unknown) {
    const lastAction = host
      ? this.actionHistory.findLast(item => item.options.host === host)
      : this.actionHistory.at(-1);
    if (!lastAction) return;
    this.actionEvents$.next({
      action: lastAction.action,
      options: lastAction.options,
      event,
    });
  }

  async executeAction(
    id: AIActionId,
    options: AIActionOptions
  ): Promise<AsyncIterable<string>> {
    this.actionHistory.push({ action: id, options });
    if (this.actionHistory.length > 10) {
      this.actionHistory.shift();
    }
    this.actionEvents$.next({ action: id, options, event: 'started' });

    const agent = isAgentMode(id);
    const input = options.input ?? '';

    // ── Session & history ──────────────────────────────────────
    const chapterKey = this.currentChapter
      ? `${this.currentChapter.novelId}/${this.currentChapter.chapterId}`
      : null;
    const chapterSession = chapterKey
      ? this.chapterSessions.get(chapterKey)
      : null;

    let sessionId: string;
    if (chapterSession) {
      sessionId = chapterSession.sessionId;
      this.lastActionSessionId = sessionId;
    } else {
      const existingId = (options as any).sessionId as string | undefined;
      if (existingId) {
        sessionId = existingId;
        this.lastActionSessionId = sessionId;
        if (!this.sessions.has(sessionId)) {
          this.sessions.set(sessionId, {
            id: sessionId,
            promptName: id,
            messages: [],
          });
        }
      } else {
        sessionId = await this.createSession({
          promptName: id,
          ...options,
        } as CreateSessionOptions);
      }
    }

    // Build message history
    let messageHistory: Array<{ role: string; content: string }>;
    if (agent && chapterSession) {
      messageHistory = [
        ...chapterSession.messages,
        { role: 'user', content: input },
      ];
    } else {
      messageHistory = [{ role: 'user', content: input }];

      // For agent mode, register in chapterSessions for reuse
      if (agent && chapterKey) {
        this.chapterSessions.set(chapterKey, {
          sessionId,
          messages: [],
        });
      }
    }

    // ── Context ────────────────────────────────────────────────
    const editorContext = this.readEditorContext(agent ? 'agent' : 'inline');

    const actionEvents$ = this.actionEvents$;
    const sessions = this.sessions;
    const sid = sessionId;
    const chapterSessions = this.chapterSessions;
    const saveSession = () => this.saveCurrentChapterSession();
    const getEditorApi = () => this.getEditorApi();

    console.log('[StoryAI] executeAction:', {
      mode: agent ? 'agent' : 'inline',
      action: id,
      sessionId,
      chapterKey,
      hasChapterSession: !!chapterSession,
      hasEditorContext: Object.keys(editorContext).length > 0,
      editorContextKeys: Object.keys(editorContext),
    });

    // POST to backend chat endpoint with SSE streaming
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        action: id,
        sessionId,
        workspaceId: options.workspaceId ?? 'story-workspace',
        docId: options.docId,
        input,
        messages: messageHistory,
        stream: true,
        agent,
        scenario: agent ? 'chat' : 'assistant',
        context:
          Object.keys(editorContext).length > 0 ? editorContext : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      actionEvents$.next({ action: id, options, event: 'error' });
      throw new Error(`AI request failed (${response.status}): ${errorText}`);
    }

    const body = response.body;
    if (!body) {
      actionEvents$.next({ action: id, options, event: 'error' });
      throw new Error('No response body for SSE stream');
    }

    return {
      async *[Symbol.asyncIterator]() {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';
        let currentEvent = '';
        const toolHistory: string[] = [];
        let lastToolCallKey = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (currentEvent === 'done') {
                  break;
                } else if (currentEvent === 'error') {
                  let errorMessage = 'Unknown SSE error';
                  try {
                    const parsed = JSON.parse(dataStr);
                    errorMessage = parsed.message ?? errorMessage;
                  } catch {
                    // use default
                  }
                  throw new Error(errorMessage);
                } else if (currentEvent === 'message_delta') {
                  try {
                    const parsed = JSON.parse(dataStr);
                    const rawText = parsed.text ?? '';
                    if (rawText) {
                      fullResponse += rawText;
                      yield rawText;
                    }
                  } catch {
                    // skip malformed data
                  }
                } else if (currentEvent === 'tool_use') {
                  // Structured tool call from LLM — execute on frontend
                  try {
                    const toolData = JSON.parse(dataStr);
                    const toolKey = `${toolData.name}:${toolData.input?.text ?? JSON.stringify(toolData.input?.range ?? '')}`;

                    if (toolKey === lastToolCallKey) {
                      console.log(
                        '[EditorTool] skipping duplicate:',
                        toolData.name
                      );
                    } else {
                      lastToolCallKey = toolKey;
                      toolHistory.push(
                        `[${toolData.name}] ${JSON.stringify(toolData.input)}`
                      );
                      const currentApi = getEditorApi();
                      if (currentApi) {
                        const paragraphs = currentApi
                          .getDocument()
                          .blocks.filter(
                            (b: any) => b.flavour === 'affine:paragraph'
                          );
                        const batchEdit = new StoryEdit();
                        const result = buildToolEdit(
                          { name: toolData.name, input: toolData.input },
                          paragraphs,
                          batchEdit
                        );
                        if (!batchEdit.isEmpty) {
                          currentApi.applyEdit(batchEdit);
                        }
                        console.log(
                          `[EditorTool] ${toolData.name}: ${result.success ? 'OK' : 'FAIL'} — ${result.message}`
                        );
                        toolHistory[toolHistory.length - 1] +=
                          ` → ${result.success ? '✓' : '✗'} ${result.message}`;
                      }
                    }
                  } catch (e) {
                    console.error('[EditorTool] execution error:', e);
                  }
                } else if (currentEvent === 'tool_result') {
                  // Tool result from backend (LLM received confirmation)
                  try {
                    const resultData = JSON.parse(dataStr);
                    console.log('[EditorTool] result:', resultData);
                  } catch {
                    // skip
                  }
                }
                currentEvent = '';
              } else if (line.trim() === '') {
                currentEvent = '';
              }
            }
          }

          // Process remaining buffer
          if (buffer.trim()) {
            const remainingLines = buffer.split('\n');
            for (const line of remainingLines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (currentEvent === 'message_delta') {
                  try {
                    const parsed = JSON.parse(dataStr);
                    const rawText = parsed.text ?? '';
                    if (rawText) {
                      fullResponse += rawText;
                      yield rawText;
                    }
                  } catch {
                    // skip
                  }
                }
              }
            }
          }

          // Persist session (agent mode only)
          if (agent) {
            const assistantContent =
              toolHistory.length > 0
                ? fullResponse + '\n\n' + toolHistory.join('\n')
                : fullResponse;

            if (chapterKey && chapterSessions.has(chapterKey)) {
              const ch = chapterSessions.get(chapterKey);
              if (!ch) return;
              ch.messages = [
                ...messageHistory,
                { role: 'assistant', content: assistantContent },
              ];
              await saveSession();
            } else {
              const s = sessions.get(sid);
              if (s) {
                s.messages.push({
                  role: 'assistant',
                  content: assistantContent,
                });
              }
            }
          }

          actionEvents$.next({ action: id, options, event: 'finished' });
        } catch (error) {
          actionEvents$.next({ action: id, options, event: 'error' });
          throw error;
        }
      },
    };
  }
}
