import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { SCENARIOS } from '../api/index';
import type { Scenario, StoryQueryEngine } from '../services/query-engine';

export function createAskRouter(queryEngine: StoryQueryEngine): Hono {
  const router = new Hono();

  router.post('/', async c => {
    const body = (await c.req.json()) as {
      messages?: Array<{ role: string; content: string }>;
      context?: Record<string, unknown>;
      scenario?: Scenario;
    };

    const messages = body.messages?.length
      ? body.messages
      : null;

    if (!messages) {
      return c.json({ error: 'messages is required' }, 400);
    }

    // If scenario is registered, enhance the last user message with the scenario's user prompt builder
    const scenarioConfig = body.scenario ? SCENARIOS[body.scenario] : undefined;
    let finalMessages = messages;
    if (scenarioConfig) {
      const lastUserIdx = messages.findLastIndex(m => m.role === 'user');
      if (lastUserIdx >= 0) {
        const originalInput = messages[lastUserIdx].content;
        const enhancedInput = scenarioConfig.buildUserMessage(originalInput, body.context);
        finalMessages = [...messages];
        finalMessages[lastUserIdx] = { ...finalMessages[lastUserIdx], content: enhancedInput };
      }
    }

    return streamSSE(c, async stream => {
      let fullText = '';
      try {
        const chatStream = queryEngine.chat(
          finalMessages as Array<{ role: string; content: string }>,
          body.context,
          c.req.raw.signal,
          false,
          body.scenario ?? 'assistant',
        );

        for await (const event of chatStream) {
          if (event.type === 'text') {
            fullText += event.data.text;
            await stream.writeSSE({
              event: 'message_delta',
              data: JSON.stringify(event.data),
            });
          }
        }

        // If scenario has a parser, send parsed result
        if (scenarioConfig) {
          const parsed = scenarioConfig.parse(fullText);
          await stream.writeSSE({
            event: 'parsed',
            data: JSON.stringify(parsed),
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
