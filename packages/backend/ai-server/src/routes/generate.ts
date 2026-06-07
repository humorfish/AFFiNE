import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { SCENARIOS } from '../api/index';

const BIGMODEL_API_KEY =
  process.env.BIGMODEL_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const BIGMODEL_BASE_URL =
  process.env.BIGMODEL_BASE_URL ||
  'https://open.bigmodel.cn/api/coding/paas/v4';

export function createGenerateRouter(): Hono {
  const router = new Hono();

  router.post('/', async c => {
    const body = await c.req.json();
    const {
      model = 'glm-5.1',
      messages,
      temperature = 0.85,
      max_tokens = 1024,
      stream = true,
      frequency_penalty = 0.5,
      presence_penalty = 0.4,
      thinking = { type: 'disabled' },
      parseScenario,
    } = body;

    if (!messages?.length) {
      return c.json({ error: 'messages is required' }, 400);
    }

    const llmBody = {
      model,
      messages,
      temperature,
      max_tokens,
      stream,
      frequency_penalty,
      presence_penalty,
      thinking,
    };

    const res = await fetch(`${BIGMODEL_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BIGMODEL_API_KEY}`,
      },
      body: JSON.stringify(llmBody),
      signal: c.req.raw.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      return c.json(
        { error: `Bigmodel API error: ${res.status}`, detail: errText },
        res.status as 400
      );
    }

    return streamSSE(c, async stream => {
      let fullText = '';

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          const payload = trimmed.slice(6);
          try {
            const evt = JSON.parse(payload);
            const text = evt.choices?.[0]?.delta?.content || '';
            if (text) {
              fullText += text;
              await stream.writeSSE({
                event: 'message_delta',
                data: JSON.stringify({ text }),
              });
            }
          } catch {}
        }
      }

      // If a parseScenario is specified, parse the result and emit parsed event
      if (parseScenario) {
        const scenarioConfig = SCENARIOS[parseScenario];
        if (scenarioConfig) {
          const parsed = scenarioConfig.parse(fullText, body.context);
          await stream.writeSSE({
            event: 'parsed',
            data: JSON.stringify(parsed),
          });
        }
      }

      await stream.writeSSE({ event: 'done', data: '{}' });
    });
  });

  return router;
}
