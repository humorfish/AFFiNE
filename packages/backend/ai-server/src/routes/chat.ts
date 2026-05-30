import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { SessionStore } from '../services/session-store';
import type { StoryQueryEngine } from '../services/query-engine';

export function createChatRouter(
  sessionStore: SessionStore,
  queryEngine: StoryQueryEngine
): Hono {
  const router = new Hono();

  router.post('/', async c => {
    const body = (await c.req.json()) as {
      sessionId?: string;
      messages?: Array<{ role: string; content: string }>;
      context?: Record<string, unknown>;
    };

    if (!body.sessionId || !body.messages?.length) {
      return c.json({ error: 'sessionId and messages are required' }, 400);
    }

    const session = sessionStore.get(body.sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Store user messages
    for (const msg of body.messages) {
      sessionStore.addMessage(body.sessionId, msg);
    }

    const abortController = new AbortController();

    return streamSSE(c, async stream => {
      try {
        let fullResponse = '';
        const allMessages = session.messages;

        const chatStream = queryEngine.chat(
          allMessages,
          body.context,
          abortController.signal
        );

        for await (const chunk of chatStream) {
          fullResponse += chunk;
          await stream.writeSSE({
            event: 'message_delta',
            data: JSON.stringify({ text: chunk }),
          });
        }

        // Store assistant response
        sessionStore.addMessage(body.sessionId, {
          role: 'assistant',
          content: fullResponse,
        });

        await stream.writeSSE({ event: 'done', data: '{}' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message }),
        });
      }
    });
  });

  return router;
}
