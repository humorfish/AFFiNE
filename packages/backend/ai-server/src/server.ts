import 'dotenv/config';

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { createChatRouter } from './routes/chat';
import { createSessionRouter } from './routes/sessions';
import { StoryQueryEngine } from './services/query-engine';
import { SessionStore } from './services/session-store';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function main() {
  const sessionStore = new SessionStore();
  const queryEngine = new StoryQueryEngine({
    customSystemPrompt: process.env.SYSTEM_PROMPT,
    userSpecifiedModel: process.env.LLM_MODEL,
  });

  console.log('Initializing QueryEngine...');
  await queryEngine.initialize();
  console.log('QueryEngine ready');

  const app = new Hono();

  app.use('*', cors());
  app.use('*', logger());

  app.route('/api/ai/sessions', createSessionRouter(sessionStore));
  app.route('/api/ai/chat', createChatRouter(sessionStore, queryEngine));

  app.get('/health', c => c.json({ status: 'ok' }));

  console.log(`AI Server running on http://localhost:${PORT}`);

  // Use Bun.serve or Node http
  const { serve } = await import('@hono/node-server');
  serve({ fetch: app.fetch, port: PORT });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
