// @ts-nocheck
// Custom AIRequestService that uses HTTP/SSE calls to the backend server
// instead of direct LLMClient calls.

import { Subject } from 'rxjs';

import type {
  AIActionId,
  AIActionOptions,
} from '../../../blocksuite/ai/runtime/request/action-definitions';
import type { ActionEventType } from '../../../blocksuite/ai/provider';

type CreateSessionOptions = BlockSuitePresets.AICreateSessionOptions;

export type AIRequestActionEvent = {
  action: AIActionId;
  options: AIActionOptions;
  event: ActionEventType;
};

const API_BASE = 'http://localhost:3001/api/ai';

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

  isReady() {
    // Backend handles API keys, so always ready
    return true;
  }

  async createSession(options: CreateSessionOptions): Promise<string> {
    if (options.sessionId) return options.sessionId;
    if (options.retry) return this.lastActionSessionId;

    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, {
      id: sessionId,
      promptName: options.promptName ?? '',
      messages: [],
    });

    // Persist to backend
    try {
      await fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          workspaceId: options.workspaceId ?? 'story-workspace',
          docId: options.docId,
          promptName: options.promptName ?? '',
        }),
      });
    } catch {
      // Backend unreachable — session stays in memory
    }

    return sessionId;
  }

  async createSessionWithHistory(options: CreateSessionOptions) {
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

    const sessionId = await this.createSession({
      promptName: id,
      ...options,
    } as CreateSessionOptions);
    this.lastActionSessionId = sessionId;

    // Store user message in session
    const session = this.sessions.get(sessionId);
    const input = options.input ?? '';
    if (session) {
      session.messages.push({ role: 'user', content: input });
    }

    const actionEvents$ = this.actionEvents$;
    const sessions = this.sessions;
    const sid = sessionId;

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
        stream: true,
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

    // Parse SSE stream and yield text deltas
    return {
      async *[Symbol.asyncIterator]() {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullResponse = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // Keep the last potentially incomplete line in buffer
            buffer = lines.pop() ?? '';

            let currentEvent = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (currentEvent === 'done') {
                  // Stream complete
                  break;
                } else if (currentEvent === 'error') {
                  let errorMessage = 'Unknown SSE error';
                  try {
                    const parsed = JSON.parse(dataStr);
                    errorMessage = parsed.message ?? errorMessage;
                  } catch {
                    // use default message
                  }
                  throw new Error(errorMessage);
                } else if (currentEvent === 'message_delta') {
                  try {
                    const parsed = JSON.parse(dataStr);
                    const text = parsed.text ?? '';
                    if (text) {
                      fullResponse += text;
                      yield text;
                    }
                  } catch {
                    // skip malformed data
                  }
                }
                // Reset event for next SSE message
                currentEvent = '';
              } else if (line.trim() === '') {
                // Blank line = end of SSE message, reset event
                currentEvent = '';
              }
            }
          }

          // Process any remaining buffer
          if (buffer.trim()) {
            const remainingLines = buffer.split('\n');
            let currentEvent = '';
            for (const line of remainingLines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (currentEvent === 'message_delta') {
                  try {
                    const parsed = JSON.parse(dataStr);
                    const text = parsed.text ?? '';
                    if (text) {
                      fullResponse += text;
                      yield text;
                    }
                  } catch {
                    // skip
                  }
                }
              }
            }
          }

          // Store assistant response in session
          const s = sessions.get(sid);
          if (s) {
            s.messages.push({ role: 'assistant', content: fullResponse });
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
