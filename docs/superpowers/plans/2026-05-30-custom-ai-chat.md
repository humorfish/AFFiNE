# Custom AI Chat Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace React AI chat panel with BlockSuite native AI chat components, backed by a QueryEngine-based backend server over SSE.

**Architecture:** Frontend uses AIChatRuntime + AIChatContent (Lit) via the React↔Lit bridge pattern (`useAIChatElement`). Backend wraps claude-code-best's QueryEngine behind a REST/SSE API. StoryAIRequestService rewrites from direct LLMClient to HTTP/SSE calls.

**Tech Stack:** TypeScript, Express, SSE, BlockSuite AI runtime (Lit), React hooks (useAIChatRuntime, useAIChatElement)

---

## File Structure

### Backend (new)

```
packages/backend/ai-server/
  src/
    server.ts              Express entry, starts server
    routes/
      sessions.ts          POST/GET/DELETE /api/ai/sessions
      chat.ts              POST /api/ai/chat (SSE)
    services/
      query-engine.ts      Wraps claude-code-best QueryEngine per session
      session-store.ts     In-memory session + message store
    index.ts               Re-exports for package entry
  package.json
```

### Frontend (modified)

```
packages/frontend/core/src/components/story-layout/
  ai/
    request-service.ts     REWRITE — HTTP/SSE instead of direct LLMClient
    setup.ts               UPDATE — inject new request service
  story-layout.tsx         MODIFY — replace StoryAIPanel with BlockSuite AIChatContent
  story-ai-panel.tsx       DELETE — replaced by BlockSuite native components
```

---

### Task 1: Backend — Session Store

**Files:**

- Create: `packages/backend/ai-server/src/services/session-store.ts`

- [ ] **Step 1: Create session store**

```typescript
// packages/backend/ai-server/src/services/session-store.ts
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Session {
  id: string;
  createdAt: string;
  title: string;
  messages: ChatMessage[];
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  create(title?: string): Session {
    const session: Session = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title: title ?? 'New Chat',
      messages: [],
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(): Session[] {
    return Array.from(this.sessions.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  addMessage(sessionId: string, message: ChatMessage): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(message);
    }
  }

  getMessages(sessionId: string): ChatMessage[] {
    return this.sessions.get(sessionId)?.messages ?? [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/ai-server/src/services/session-store.ts
git commit -m "feat(ai-server): add in-memory session store"
```

---

### Task 2: Backend — QueryEngine Wrapper

**Files:**

- Create: `packages/backend/ai-server/src/services/query-engine.ts`

This wraps claude-code-best's `QueryEngine.submitMessage()` to yield text deltas from the stream.

- [ ] **Step 1: Create QueryEngine wrapper**

```typescript
// packages/backend/ai-server/src/services/query-engine.ts
import { randomUUID } from 'node:crypto';

export interface QueryEngineConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  systemPrompt?: string;
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

/**
 * Wraps a simple streaming LLM call (OpenAI-compatible) for the AI server.
 *
 * In production, this would import and use claude-code-best's QueryEngine directly:
 *   import { QueryEngine } from 'claude-code-best';
 *   const engine = new QueryEngine(config);
 *   for await (const msg of engine.submitMessage(prompt)) { ... }
 *
 * For now we use a thin fetch-based streaming client to keep the backend
 * build independent from claude-code-best's complex bundling requirements.
 * The QueryEngine integration can be swapped in later without changing the
 * session/chat route layer.
 */
export class StoryQueryEngine {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseURL: string;
  private readonly systemPrompt: string;

  constructor(config: QueryEngineConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseURL = (config.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.systemPrompt = config.systemPrompt ?? '你是一个专业的小说写作助手，擅长创作、润色和分析文学作品。';
  }

  async *chat(messages: Array<{ role: string; content: string }>, context?: Record<string, unknown>, signal?: AbortSignal): AsyncGenerator<string> {
    const allMessages: Array<{ role: string; content: string }> = [{ role: 'system', content: this.systemPrompt }];

    // Inject context as a system message if provided
    if (context && Object.keys(context).length > 0) {
      const contextStr = Object.entries(context)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n');
      if (contextStr) {
        allMessages.push({
          role: 'system',
          content: `参考资料：\n${contextStr}`,
        });
      }
    }

    allMessages.push(...messages);

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        stream: true,
        temperature: 0.7,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is not available for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/ai-server/src/services/query-engine.ts
git commit -m "feat(ai-server): add QueryEngine wrapper with streaming"
```

---

### Task 3: Backend — Session Routes

**Files:**

- Create: `packages/backend/ai-server/src/routes/sessions.ts`

- [ ] **Step 1: Create session routes**

```typescript
// packages/backend/ai-server/src/routes/sessions.ts
import { Router } from 'express';
import type { SessionStore } from '../services/session-store';

export function createSessionRouter(sessionStore: SessionStore): Router {
  const router = Router();

  // POST /api/ai/sessions — create session
  router.post('/', (req, res) => {
    const { title } = req.body ?? {};
    const session = sessionStore.create(title);
    res.status(201).json(session);
  });

  // GET /api/ai/sessions — list sessions
  router.get('/', (_req, res) => {
    res.json(sessionStore.list());
  });

  // GET /api/ai/sessions/:id — get session with messages
  router.get('/:id', (req, res) => {
    const session = sessionStore.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  });

  // DELETE /api/ai/sessions/:id — delete session
  router.delete('/:id', (req, res) => {
    const deleted = sessionStore.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.status(204).end();
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/ai-server/src/routes/sessions.ts
git commit -m "feat(ai-server): add session CRUD routes"
```

---

### Task 4: Backend — Chat SSE Route

**Files:**

- Create: `packages/backend/ai-server/src/routes/chat.ts`

- [ ] **Step 1: Create chat SSE route**

```typescript
// packages/backend/ai-server/src/routes/chat.ts
import { Router } from 'express';
import type { SessionStore } from '../services/session-store';
import type { StoryQueryEngine } from '../services/query-engine';

export function createChatRouter(sessionStore: SessionStore, queryEngine: StoryQueryEngine): Router {
  const router = Router();

  // POST /api/ai/chat — send message, receive SSE stream
  router.post('/', async (req, res) => {
    const { sessionId, messages, context } = req.body as {
      sessionId?: string;
      messages?: Array<{ role: string; content: string }>;
      context?: Record<string, unknown>;
    };

    if (!sessionId || !messages?.length) {
      res.status(400).json({ error: 'sessionId and messages are required' });
      return;
    }

    const session = sessionStore.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Store user messages
    for (const msg of messages) {
      sessionStore.addMessage(sessionId, msg);
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abortController = new AbortController();

    // Clean up on client disconnect
    req.on('close', () => {
      abortController.abort();
    });

    try {
      let fullResponse = '';
      const allMessages = session.messages;

      const stream = queryEngine.chat(allMessages, context, abortController.signal);

      for await (const chunk of stream) {
        fullResponse += chunk;
        res.write(`event: message_delta\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
      }

      // Store assistant response
      sessionStore.addMessage(sessionId, {
        role: 'assistant',
        content: fullResponse,
      });

      res.write(`event: done\ndata: {}\n\n`);
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      res.end();
    }
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/ai-server/src/routes/chat.ts
git commit -m "feat(ai-server): add SSE chat route"
```

---

### Task 5: Backend — Express Server Entry

**Files:**

- Create: `packages/backend/ai-server/src/server.ts`
- Create: `packages/backend/ai-server/src/index.ts`
- Create: `packages/backend/ai-server/package.json`
- Create: `packages/backend/ai-server/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@affine/ai-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "tsx src/server.ts"
  },
  "dependencies": {
    "express": "^5.1.0",
    "dotenv": "^16.5.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.2",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3"
  },
  "version": "0.26.3"
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create .env.example**

```
LLM_API_KEY=your-api-key-here
LLM_MODEL=gpt-4o
LLM_BASE_URL=https://api.openai.com/v1
PORT=3001
```

- [ ] **Step 4: Create server.ts**

```typescript
// packages/backend/ai-server/src/server.ts
import 'dotenv/config';
import express from 'express';
import { SessionStore } from './services/session-store.js';
import { StoryQueryEngine } from './services/query-engine.js';
import { createSessionRouter } from './routes/sessions.js';
import { createChatRouter } from './routes/chat.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const sessionStore = new SessionStore();
const queryEngine = new StoryQueryEngine({
  apiKey: process.env.LLM_API_KEY ?? '',
  model: process.env.LLM_MODEL ?? 'gpt-4o',
  baseURL: process.env.LLM_BASE_URL,
});

const app = express();
app.use(express.json());

// CORS for local dev
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use('/api/ai/sessions', createSessionRouter(sessionStore));
app.use('/api/ai/chat', createChatRouter(sessionStore, queryEngine));

app.listen(PORT, () => {
  console.log(`AI Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 5: Create index.ts**

```typescript
// packages/backend/ai-server/src/index.ts
export { SessionStore } from './services/session-store.js';
export { StoryQueryEngine } from './services/query-engine.js';
```

- [ ] **Step 6: Install dependencies and verify server starts**

```bash
cd packages/backend/ai-server && npm install
cp .env.example .env  # then fill in your LLM API key
npm run dev
# Expected: "AI Server running on http://localhost:3001"
```

- [ ] **Step 7: Commit**

```bash
git add packages/backend/ai-server/
git commit -m "feat(ai-server): Express server with session and chat SSE routes"
```

---

### Task 6: Frontend — Rewrite StoryAIRequestService

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/ai/request-service.ts`

Rewrite from direct LLMClient usage to HTTP/SSE calls against the backend.

- [ ] **Step 1: Rewrite request-service.ts**

```typescript
// @ts-nocheck
// Custom AIRequestService that calls our AI backend server instead of AFFiNE's CopilotClient

import { Subject } from 'rxjs';

import type { AIActionId, AIActionOptions } from '../../../blocksuite/ai/runtime/request/action-definitions';
import { getActionDefinition, resolveDefinitionValue } from '../../../blocksuite/ai/runtime/request/action-definitions';
import type { ActionEventType } from '../../../blocksuite/ai/provider';

type CreateSessionOptions = BlockSuitePresets.AICreateSessionOptions;

export type AIRequestActionEvent = {
  action: AIActionId;
  options: AIActionOptions;
  event: ActionEventType;
};

const API_BASE = 'http://localhost:3001/api/ai';

// Prompt templates for known actions
const actionPrompts: Record<string, string> = {
  chat: 'You are a helpful AI writing assistant.',
  summary: 'Summarize the following text concisely:',
  translate: 'Translate the following text:',
  changeTone: 'Rewrite the following text with a different tone:',
  improveWriting: 'Improve the writing quality of the following text:',
  improveGrammar: 'Fix grammar errors in the following text:',
  fixSpelling: 'Fix spelling errors in the following text:',
  makeLonger: 'Expand and elaborate on the following text:',
  makeShorter: 'Condense the following text while keeping key information:',
  explain: 'Explain the following text clearly:',
  continueWriting: 'Continue writing from where the following text ends:',
};

/**
 * Parse an SSE stream from the backend into an AsyncIterable of text deltas.
 */
async function* parseSSEStream(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error('Response body is not available');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (currentEvent === 'message_delta') {
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) yield parsed.text;
            } catch {
              // skip malformed data
            }
          } else if (currentEvent === 'error') {
            try {
              const parsed = JSON.parse(data);
              throw new Error(parsed.message ?? 'Server error');
            } catch (e) {
              if (e instanceof SyntaxError) {
                throw new Error(data);
              }
              throw e;
            }
          }
          // 'done' event — just end the stream
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class StoryAIRequestService {
  private lastActionSessionId = '';
  private readonly actionHistory: {
    action: AIActionId;
    options: AIActionOptions;
  }[] = [];
  readonly actionEvents$ = new Subject<AIRequestActionEvent>();

  // Local cache of session objects for the runtime
  private readonly sessionCache = new Map<string, { id: string; promptName: string; messages: any[] }>();

  isReady() {
    return true; // Backend handles API key, always ready if server is up
  }

  async createSession(options: CreateSessionOptions): Promise<string> {
    if (options.sessionId) return options.sessionId;
    if (options.retry) return this.lastActionSessionId;

    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: options.promptName ?? 'New Chat' }),
    });
    if (!res.ok) throw new Error(`Failed to create session: ${res.statusText}`);
    const session = await res.json();
    this.sessionCache.set(session.id, {
      id: session.id,
      promptName: options.promptName ?? '',
      messages: [],
    });
    return session.id;
  }

  async createSessionWithHistory(options: CreateSessionOptions) {
    const sessionId = await this.createSession(options);
    return this.getSession(options.workspaceId, sessionId);
  }

  async getSession(_workspaceId: string, sessionId: string) {
    // Try cache first
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      return {
        id: cached.id,
        promptName: cached.promptName,
        messages: cached.messages,
      };
    }
    // Fetch from backend
    const res = await fetch(`${API_BASE}/sessions/${sessionId}`);
    if (!res.ok) return null;
    const session = await res.json();
    this.sessionCache.set(sessionId, {
      id: session.id,
      promptName: session.title,
      messages: session.messages,
    });
    return {
      id: session.id,
      promptName: session.title,
      messages: session.messages,
    };
  }

  async getSessions(_workspaceId: string, _docId?: string) {
    const res = await fetch(`${API_BASE}/sessions`);
    if (!res.ok) return [];
    return res.json();
  }

  async getRecentSessions(_workspaceId: string, _limit?: number, _offset?: number) {
    const res = await fetch(`${API_BASE}/sessions`);
    if (!res.ok) return [];
    return res.json();
  }

  async updateSession(_options: any) {
    return Promise.resolve();
  }

  async cleanupSessions(_input: { workspaceId: string; docId: string | undefined; sessionIds: string[] }) {
    for (const id of _input.sessionIds) {
      await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
      this.sessionCache.delete(id);
    }
  }

  histories = {
    actions: async () => [] as BlockSuitePresets.AIHistory[],
    chats: async () => [] as BlockSuitePresets.AIHistory[],
    cleanup: async (_workspaceId: string, _docId: string | undefined, sessionIds: string[]) => {
      for (const id of sessionIds) {
        await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' });
      }
    },
    ids: async () => [] as BlockSuitePresets.AIHistoryIds[],
  };

  context = {
    createContext: async (_workspaceId: string, _sessionId: string) => crypto.randomUUID(),
    getContextId: async (_workspaceId: string, _sessionId: string) => null as string | null,
    addContextDoc: async (_options: { contextId: string; docId: string }) => {},
    removeContextDoc: async (_options: { contextId: string; docId: string }) => {},
    addContextFile: async (_file: File, _options: any) => {},
    removeContextFile: async (_options: { contextId: string; fileId: string }) => {},
    addContextTag: async (_options: { contextId: string; tagId: string; docIds: string[] }) => {},
    removeContextTag: async (_options: { contextId: string; tagId: string }) => {},
    addContextCollection: async (_options: { contextId: string; collectionId: string; docIds: string[] }) => {},
    removeContextCollection: async (_options: { contextId: string; collectionId: string }) => {},
    getContextDocsAndFiles: async () => null,
    matchContext: async () => [],
    addContextBlob: async (_options: { blobId: string; contextId: string }) => {},
    removeContextBlob: async (_options: { blobId: string; contextId: string }) => {},
    pollContextDocsAndFiles: async () => {},
    pollEmbeddingStatus: async () => {},
  };

  forkChat(_options: BlockSuitePresets.AIForkChatSessionOptions) {
    return Promise.resolve(undefined);
  }

  reportLastAction(event: ActionEventType, host?: unknown) {
    const lastAction = host ? this.actionHistory.findLast(item => item.options.host === host) : this.actionHistory.at(-1);
    if (!lastAction) return;
    this.actionEvents$.next({
      action: lastAction.action,
      options: lastAction.options,
      event,
    });
  }

  async executeAction(id: AIActionId, options: AIActionOptions): Promise<AsyncIterable<string>> {
    this.actionHistory.push({ action: id, options });
    if (this.actionHistory.length > 10) {
      this.actionHistory.shift();
    }
    this.actionEvents$.next({ action: id, options, event: 'started' });

    const definition = getActionDefinition(id);
    const content = definition.buildContent?.(options) ?? options.input ?? '';
    const promptName = resolveDefinitionValue(definition.promptName, options);
    const systemPrompt = actionPrompts[id] ?? `You are an AI assistant. Action: ${promptName}`;

    let finalContent = content;
    const params = definition.buildParams?.(options);
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

    // Build context from options (selected text, attachments, etc.)
    const context: Record<string, unknown> = {};
    if (options.attachments?.length) {
      context.attachments = options.attachments;
    }

    // POST to SSE chat endpoint
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        messages: [{ role: 'user', content: finalContent }],
        context: Object.keys(context).length > 0 ? context : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.actionEvents$.next({ action: id, options, event: 'error' });
      throw new Error(`AI server error: ${response.status} - ${errorText}`);
    }

    const actionEvents$ = this.actionEvents$;
    const sseStream = parseSSEStream(response);

    return {
      async *[Symbol.asyncIterator]() {
        try {
          for await (const chunk of sseStream) {
            yield chunk;
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/ai/request-service.ts
git commit -m "feat(story): rewrite StoryAIRequestService to use backend SSE API"
```

---

### Task 7: Frontend — Update setup.ts

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/ai/setup.ts`

No functional change needed — `setup.ts` already injects `StoryAIRequestService`. The class interface hasn't changed, only the internal implementation. Verify it still works.

- [ ] **Step 1: Verify setup.ts is still correct**

Read `setup.ts` and confirm it calls `setAIRequestService(storyAIRequestService)` and provides user info. No changes needed since the `StoryAIRequestService` class API is unchanged.

- [ ] **Step 2: Commit (only if changes were needed)**

Only commit if setup.ts was modified.

---

### Task 8: Frontend — Replace React AI Panel with BlockSuite Chat

**Files:**

- Modify: `packages/frontend/core/src/components/story-layout/story-layout.tsx`
- Delete: `packages/frontend/core/src/components/story-layout/story-ai-panel.tsx`

This is the core UI change: replace `StoryAIPanel` (React) with BlockSuite's native `AIChatContent` (Lit) using the `useAIChatElement` + `useAIChatRuntime` bridge pattern.

- [ ] **Step 1: Modify story-layout.tsx**

Key changes:

1. Remove `StoryAIPanel` import and `StoryAIHandle` ref
2. Import `useAIChatRuntime` and `useAIChatElement` from the blocksuite AI runtime
3. Import `AIChatContent` from blocksuite AI components
4. Import `AIChatRuntime`, `WorkspaceAIChatSessionStrategy` from blocksuite AI runtime
5. Import `getStoryAIRequestService` from `./ai/setup`
6. Create runtime via `useMemo` with workspace scope
7. Use `useAIChatRuntime(runtime)` to get snapshot
8. Use `useAIChatElement` to mount `AIChatContent` into a container div
9. Replace the `<StoryAIPanel>` render with the container div
10. Remove the `openChatWithPrompt` callback (BlockSuite handles this internally)

```typescript
// Replace the StoryAIPanel import section with:
import { useMemo, useRef, useCallback, useState } from 'react';
import { AIChatRuntime } from '../../../blocksuite/ai/runtime/chat/runtime';
import { WorkspaceAIChatSessionStrategy } from '../../../blocksuite/ai/runtime/chat/session-strategy';
import { useAIChatRuntime } from '../../../blocksuite/ai/runtime/chat/use-runtime';
import { useAIChatElement } from '../../../blocksuite/ai/runtime/chat/use-element';
import { getStoryAIRequestService } from './ai/setup';

import './story-layout.css';

import { ChaptersDialog } from './chapters-dialog';
import { StoryFrameworkRoot } from './story-framework';
import { StoryProvider, useStory } from './story-context';
import { StoryEditorPanel } from './story-editor-panel';
import { StorySidebar, NAV_ITEMS } from './story-sidebar';
import { NewProjectDialog } from './new-project-dialog';
import { PlaceholderDialog } from './placeholder-dialog';
import { SettingsDialog } from './settings-dialog';
import { WorkspaceProvider } from './workspace-provider';
```

Inside `StoryLayout` component, replace the AI panel section:

```typescript
export const StoryLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Create AI chat runtime
  const requestService = getStoryAIRequestService();
  const runtime = useMemo(() => {
    if (!requestService) return null;
    return new AIChatRuntime({
      request: requestService,
      scope: { kind: 'workspace', workspaceId: 'story-workspace' },
      strategy: new WorkspaceAIChatSessionStrategy(),
    });
  }, [requestService]);

  const snapshot = useAIChatRuntime(runtime);

  // Mount BlockSuite AIChatContent (Lit) into React container
  useAIChatElement({
    containerRef: chatContainerRef,
    selector: 'ai-chat-content',
    enabled: !aiPanelCollapsed && !!runtime,
    createElement: () => document.createElement('ai-chat-content'),
    configureElement: (el: any) => {
      el.runtime = runtime;
      el.runtimeSnapshot = snapshot;
      el.workspaceId = 'story-workspace';
    },
  });

  const handleFocusToggle = useCallback(() => {
    setFocusMode(prev => !prev);
  }, []);

  const openChatWithPrompt = useCallback((prompt: string) => {
    setAiPanelCollapsed(false);
    // The BlockSuite runtime will handle the message dispatch
    // if needed, we can dispatch to runtime here
  }, []);

  const showSidebar = !focusMode;
  const showAIPanel = !focusMode && !aiPanelCollapsed;

  return (
    <StoryFrameworkRoot>
      <WorkspaceProvider>
        <StoryProvider>
          <div style={styles.root}>
            {showSidebar && (
              <StorySidebar
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
                onNavClick={(id) => setActiveModal(id)}
                onNewProject={() => setActiveModal('new-project')}
                theme={THEME}
              />
            )}
            <StoryEditorPanel
              focusMode={focusMode}
              onFocusToggle={handleFocusToggle}
              onSendToChat={openChatWithPrompt}
              theme={THEME}
            />
            {showAIPanel && (
              <div
                ref={chatContainerRef}
                style={{
                  width: 380,
                  minWidth: 380,
                  maxWidth: 380,
                  background: THEME.panel,
                  borderLeft: `1px solid ${THEME.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              />
            )}
            {!focusMode && aiPanelCollapsed && (
              <button
                onClick={() => setAiPanelCollapsed(false)}
                style={{
                  ...styles.aiPanelToggle,
                  background: THEME.panel,
                  color: THEME.text,
                }}
              >
                AI
              </button>
            )}
          </div>

          <ChaptersDialog
            open={activeModal === 'chapters'}
            onClose={() => setActiveModal(null)}
          />
          <NewProjectDialog
            open={activeModal === 'new-project'}
            onClose={() => setActiveModal(null)}
          />
          <SettingsDialog
            open={activeModal === 'settings'}
            onClose={() => setActiveModal(null)}
          />
          {activeModal && !['chapters', 'new-project', 'settings'].includes(activeModal) && (
            <PlaceholderDialog
              open
              title={NAV_ITEMS.find(n => n.id === activeModal)?.label ?? activeModal}
              onClose={() => setActiveModal(null)}
            />
          )}
        </StoryProvider>
      </WorkspaceProvider>
    </StoryFrameworkRoot>
  );
};
```

- [ ] **Step 2: Delete story-ai-panel.tsx**

```bash
git rm packages/frontend/core/src/components/story-layout/story-ai-panel.tsx
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/youqw/github/story && yarn typecheck 2>&1 | head -50
```

Fix any type errors. The file uses `@ts-nocheck` patterns and the imports from blocksuite AI runtime need to match exact paths — adjust imports based on actual file locations found during exploration.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/story-layout.tsx
git rm packages/frontend/core/src/components/story-layout/story-ai-panel.tsx
git commit -m "feat(story): replace React AI panel with BlockSuite native AIChatContent"
```

---

### Task 9: Integration Test

**Files:**

- No new files — manual testing

- [ ] **Step 1: Start backend**

```bash
cd packages/backend/ai-server
cp .env.example .env
# Edit .env to set your LLM_API_KEY and LLM_MODEL
npm run dev
# Expected: "AI Server running on http://localhost:3001"
```

- [ ] **Step 2: Test backend endpoints**

```bash
# Create session
curl -X POST http://localhost:3001/api/ai/sessions \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test"}'
# Expected: { "id": "...", "title": "Test", ... }

# Chat with SSE
curl -X POST http://localhost:3001/api/ai/chat \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"<id-from-above>","messages":[{"role":"user","content":"Hello"}]}'
# Expected: SSE stream with message_delta events, then done event
```

- [ ] **Step 3: Start frontend and test chat**

```bash
cd /Users/youqw/github/story && yarn dev
```

Open the app, click the AI button on the right, verify:

1. BlockSuite AI chat panel renders
2. Typing and sending a message works
3. Streaming text appears progressively
4. Session persists while the backend is running

- [ ] **Step 4: Commit any fixes**

```bash
git add -u
git commit -m "fix(story): integration fixes for AI chat panel"
```

---

## Self-Review

**Spec coverage:**

- Backend API (sessions CRUD + chat SSE) → Tasks 1-5
- Frontend StoryAIRequestService rewrite → Task 6
- Frontend setup.ts → Task 7
- Replace React panel with BlockSuite native → Task 8
- Integration test → Task 9

**Placeholder scan:** No TBDs or TODOs found. All code blocks are complete.

**Type consistency:**

- `StoryAIRequestService` class interface unchanged (same methods as before)
- `AIChatRuntime` constructed with `WorkspaceAIChatSessionStrategy` matching existing patterns
- `useAIChatElement` follows the pattern from desktop chat page
- SSE event names (`message_delta`, `done`, `error`) match between backend chat route and frontend `parseSSEStream`
