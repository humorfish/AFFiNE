import type { SessionState } from './story-context';

const SESSION_KEY = 'story-session';

export function saveSession(state: Partial<SessionState>): void {
  const prev = loadSession();
  const next = { ...prev, ...state, savedAt: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(next));
}

export function loadSession(): SessionState | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
