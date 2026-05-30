# Custom AI Chat Integration Design

## Goal

Replace the React-based AI chat panel with BlockSuite's native AI chat components (AIChatRuntime, AIChatMessages, AIChatInput), backed by a custom AI server built on QueryEngine from claude-code-best.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (Story App)                                │
│  ┌───────────────┐  ┌──────────────────────────────┐ │
│  │  BlockSuite   │  │  StoryAIRequestService       │ │
│  │  AIChatRuntime│──│  implements CopilotClientType │ │
│  │  AIChatMessages│  │  fetch/SSE → backend API    │ │
│  │  AIChatInput  │  └──────────────────────────────┘ │
│  └───────────────┘                                   │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP/SSE
┌─────────────────────▼───────────────────────────────┐
│  Backend (AI Server)                                 │
│  ┌───────────────┐  ┌──────────────────────────────┐ │
│  │  REST Routes  │  │  QueryEngine                 │ │
│  │  sessions     │──│  query() orchestration        │ │
│  │  chat (SSE)   │  │  multi-provider support       │ │
│  └───────────────┘  │  auto context handling        │ │
│                      └──────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Backend API

All context (text, file paths, structured data) is passed through the chat request. No separate context management API.

```
POST   /api/ai/sessions              Create session
GET    /api/ai/sessions              List sessions
GET    /api/ai/sessions/:id          Get session with messages
DELETE /api/ai/sessions/:id          Delete session

POST   /api/ai/chat                  Send message (SSE stream)
  Request: {
    sessionId: string,
    messages: { role: 'user' | 'assistant', content: string }[],
    context?: {
      text?: string,                // selected text, chapter content
      filePaths?: string[],         // file attachments
      [key: string]: unknown        // structured data
    },
    model?: string,
    stream: true
  }
  Response: SSE stream
    event: message_delta    data: { text: string }
    event: done             data: {}
    event: error            data: { message: string }
```

## Backend Structure

```
packages/backend/ai-server/
  src/
    server.ts              Entry point (Express/Fastify)
    routes/
      sessions.ts          Session CRUD
      chat.ts              Chat + SSE streaming
    services/
      query-engine.ts      QueryEngine wrapper
      session-store.ts     In-memory session + message store
    index.ts
  package.json
```

### QueryEngine Wrapper

Wraps claude-code-best's `QueryEngine` to:

- Initialize with configured provider (Anthropic/OpenAI/etc)
- Accept messages + context, inject context into conversation
- Yield streaming text deltas via SSE
- Manage conversation state per session

### Session Store

- In-memory first, optional SQLite later
- Stores: sessionId, createdAt, title, messages array
- Each session is one QueryEngine conversation

## Frontend Changes

### 1. Rewrite StoryAIRequestService

File: `packages/frontend/core/src/components/story-layout/ai/request-service.ts`

Implements `CopilotClientType` interface with HTTP/SSE calls:

- `createSession()` → POST /api/ai/sessions
- `getSessions()` → GET /api/ai/sessions
- `getSession()` → GET /api/ai/sessions/:id
- `executeAction('chat', ...)` → POST /api/ai/chat, convert SSE to AsyncIterable<string>
- Context methods simplified: pass editor content as `context` in chat request

### 2. Replace AI Panel

- Delete `story-ai-panel.tsx` (React component)
- In `story-layout.tsx`, render BlockSuite AI chat components:
  - Initialize `AIChatRuntime` with `StoryAIRequestService`
  - Render `AIChatContent` (Lit) in the right panel
- Wire up editor context: selected text / current chapter content passed as context

### 3. Update setup.ts

- Inject rewritten `StoryAIRequestService`
- Configure scope, user info

### 4. Keep

- `story-ai-popup.ts` — text selection popup (already Lit)
- `story-editor-panel.tsx` — editor integration, only change AI panel mount point

### 5. Remove

- `LLMClient` and `api-key-store.ts` — API key management moves to backend
- `story-ai-panel.tsx` — replaced by BlockSuite native components

## Data Flow (Single Chat Turn)

```
1. User opens AI panel
   AIChatRuntime.loadInitialSession()
   → StoryAIRequestService.getSessions() → GET /api/ai/sessions
   → if none, createSession() → POST /api/ai/sessions

2. User types message and sends
   AIChatRuntime.send({ input: "帮我续写..." })
   → StoryAIRequestService.executeAction('chat', {
       input,
       sessionId,
       context: { text: selectedText },
       stream: true
     })
   → POST /api/ai/chat (SSE)

3. Backend processes
   → Load session's QueryEngine state
   → Inject context into conversation
   → QueryEngine.query({ messages, context })
   → Stream text deltas back via SSE

4. Frontend renders
   → SSE stream → AsyncIterable<string>
   → AIChatRuntime.appendAssistantContent()
   → AIChatMessages renders streaming text
```

## Scope

Phase 1 (this implementation):

- Backend: session CRUD + chat SSE with QueryEngine
- Frontend: BlockSuite native chat components + StoryAIRequestService rewrite
- Text context support (selected text, chapter content passed in chat request)

Future (not in scope):

- File attachment support
- Tool system exposure
- Multi-model switching UI
- Session persistence (SQLite)
