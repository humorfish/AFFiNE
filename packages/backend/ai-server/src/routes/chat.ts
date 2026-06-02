import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import type { Scenario, StoryQueryEngine } from '../services/query-engine';
import type { SessionStore } from '../services/session-store';

export function createChatRouter(
  sessionStore: SessionStore,
  queryEngine: StoryQueryEngine
): Hono {
  const router = new Hono();

  router.post('/', async c => {
    const body = (await c.req.json()) as {
      sessionId?: string;
      input?: string;
      messages?: Array<{ role: string; content: string }>;
      context?: Record<string, unknown>;
      agent?: boolean;
      scenario?: Scenario;
    };

    if (!body.sessionId) {
      return c.json({ error: 'sessionId is required' }, 400);
    }

    const useFrontendHistory = !!body.messages?.length;

    const messages = useFrontendHistory
      ? (body.messages ?? [])
      : body.input
        ? [{ role: 'user', content: body.input }]
        : null;

    if (!messages) {
      return c.json({ error: 'messages or input is required' }, 400);
    }

    let session = sessionStore.get(body.sessionId);
    if (!session) {
      session = sessionStore.create(undefined, body.sessionId);
    }

    if (!useFrontendHistory) {
      for (const msg of messages) {
        sessionStore.addMessage(body.sessionId, msg);
      }
    }

    return streamSSE(c, async stream => {
      try {
        let fullResponse = '';
        const allMessages = useFrontendHistory ? messages : session.messages;

        const chatStream = queryEngine.chat(
          allMessages as Array<{ role: string; content: string }>,
          body.context,
          c.req.raw.signal,
          body.agent,
          body.scenario ?? 'chat'
        );

        for await (const event of chatStream) {
          if (event.type === 'text') {
            fullResponse += event.data.text;
            await stream.writeSSE({
              event: 'message_delta',
              data: JSON.stringify(event.data),
            });
          } else if (event.type === 'tool_use') {
            await stream.writeSSE({
              event: 'tool_use',
              data: JSON.stringify(event.data),
            });
          } else if (event.type === 'tool_result') {
            await stream.writeSSE({
              event: 'tool_result',
              data: JSON.stringify(event.data),
            });
          }
        }

        if (!useFrontendHistory) {
          sessionStore.addMessage(body.sessionId, {
            role: 'assistant',
            content: fullResponse,
          });
        }

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
