import { Hono } from 'hono';

import type { SessionStore } from '../services/session-store';

export function createSessionRouter(sessionStore: SessionStore): Hono {
  const router = new Hono();

  router.post('/', async c => {
    try {
      const body = (await c.req.json()) as {
        title?: string;
        sessionId?: string;
      };
      const session = sessionStore.create(body?.title, body?.sessionId);
      return c.json(session, 201);
    } catch {
      const session = sessionStore.create();
      return c.json(session, 201);
    }
  });

  router.get('/', c => {
    return c.json(sessionStore.list());
  });

  router.get('/:id', c => {
    const session = sessionStore.get(c.req.param('id'));
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    return c.json(session);
  });

  router.delete('/:id', c => {
    const deleted = sessionStore.delete(c.req.param('id'));
    if (!deleted) {
      return c.json({ error: 'Session not found' }, 404);
    }
    return c.body(null, 204);
  });

  return router;
}
