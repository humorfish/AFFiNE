// @ts-nocheck
// Custom AIRequestService that uses LLMClient directly instead of AFFiNE's CopilotClient/GraphQL

import { Subject } from 'rxjs';

import { LLMClient, APIKeyStore } from '@affine/ai';

import type {
  AIActionId,
  AIActionOptions,
} from '../../../blocksuite/ai/runtime/request/action-definitions';
import {
  getActionDefinition,
  resolveDefinitionValue,
} from '../../../blocksuite/ai/runtime/request/action-definitions';
import type { ActionEventType } from '../../../blocksuite/ai/provider';

type CreateSessionOptions = BlockSuitePresets.AICreateSessionOptions;

export type AIRequestActionEvent = {
  action: AIActionId;
  options: AIActionOptions;
  event: ActionEventType;
};

// Prompt templates for known actions
const actionPrompts: Record<string, string> = {
  chat: 'You are a helpful AI writing assistant.',
  summary: 'Summarize the following text concisely:',
  translate: 'Translate the following text:',
  changeTone: 'Rewrite the following text with a different tone:',
  improveWriting: 'Improve the writing quality of the following text:',
  improveGrammar: 'Fix grammar errors in the following text:',
  fixSpelling: 'Fix spelling errors in the following text:',
  createHeadings: 'Create headings for the following text:',
  makeLonger: 'Expand and elaborate on the following text:',
  makeShorter: 'Condense the following text while keeping key information:',
  explain: 'Explain the following text clearly:',
  explainCode: 'Explain this code:',
  checkCodeErrors: 'Check for errors in this code and suggest fixes:',
  writeArticle: 'Write an article based on the following:',
  writeTwitterPost: 'Write a Twitter post based on the following:',
  writePoem: 'Write a poem based on the following:',
  writeOutline: 'Write an outline based on the following:',
  writeBlogPost: 'Write a blog post based on the following:',
  brainstorm: 'Brainstorm ideas based on the following:',
  findActions: 'Extract action items from the following:',
  continueWriting: 'Continue writing from where the following text ends:',
  generateCaption: 'Generate a caption for the following:',
};

function getLLMClient(): LLMClient | null {
  const configs = APIKeyStore.list();
  if (configs.length === 0) return null;
  const config = configs[0];
  return new LLMClient({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
  });
}

export class StoryAIRequestService {
  private lastActionSessionId = '';
  private readonly actionHistory: {
    action: AIActionId;
    options: AIActionOptions;
  }[] = [];
  readonly actionEvents$ = new Subject<AIRequestActionEvent>();

  // Session storage (memory placeholder, will be persisted later)
  private readonly sessions = new Map<
    string,
    {
      id: string;
      promptName: string;
      messages: { role: string; content: string }[];
    }
  >();

  isReady() {
    return APIKeyStore.list().length > 0;
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

  getSessions(_workspaceId: string, _docId?: string) {
    return Promise.resolve([]);
  }

  getRecentSessions(_workspaceId: string, _limit?: number, _offset?: number) {
    return Promise.resolve([]);
  }

  updateSession(_options: any) {
    return Promise.resolve();
  }

  cleanupSessions(_input: {
    workspaceId: string;
    docId: string | undefined;
    sessionIds: string[];
  }) {
    for (const id of _input.sessionIds) {
      this.sessions.delete(id);
    }
    return Promise.resolve();
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

    const client = getLLMClient();
    if (!client) {
      throw new Error('LLM API not configured. Please configure in Settings.');
    }

    const definition = getActionDefinition(id);
    const content = definition.buildContent?.(options) ?? options.input ?? '';

    // Build system prompt
    const promptName = resolveDefinitionValue(definition.promptName, options);
    const systemPrompt =
      actionPrompts[id] ?? `You are an AI assistant. Action: ${promptName}`;

    // Add language/tone params if applicable
    const params = definition.buildParams?.(options);
    let finalContent = content;
    if (params) {
      if (params.language) {
        finalContent = `Target language: ${params.language}\n\n${finalContent}`;
      }
      if (params.tone) {
        finalContent = `Target tone: ${params.tone}\n\n${finalContent}`;
      }
    }

    const sessionId = await this.createSession({
      promptName,
      ...options,
    } as CreateSessionOptions);
    this.lastActionSessionId = sessionId;

    // Store user message in session
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push({ role: 'user', content: finalContent });
    }

    // Create the stream using LLMClient
    const stream = client.stream(finalContent, {
      systemPrompt,
      temperature: 0.7,
    });

    // Wrap stream to track events
    const actionEvents$ = this.actionEvents$;
    const sessions = this.sessions;
    const sid = sessionId;

    return {
      async *[Symbol.asyncIterator]() {
        let fullResponse = '';
        try {
          for await (const chunk of stream) {
            fullResponse += chunk;
            yield chunk;
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
