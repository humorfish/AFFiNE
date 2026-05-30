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

  create(title?: string, id?: string): Session {
    const sessionId = id ?? crypto.randomUUID();
    const session: Session = {
      id: sessionId,
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
    return Array.from(this.sessions.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
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
