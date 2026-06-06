import { parseWithFallback } from './index';

// ---------------------------------------------------------------------------
// Timeline — minimal placeholder (no LLM generation, purely CRUD)
// ---------------------------------------------------------------------------

function buildSystem(): string {
  return '你是一位小说写作助手。';
}

function buildUser(input: string): string {
  return input || '';
}

export const timelinePrompts = { buildSystem, buildUser };

// ---------------------------------------------------------------------------
// Parser — JSON fallback only (timeline generation is handled client-side)
// ---------------------------------------------------------------------------

export function parseTimeline(
  text: string,
): { data: any; failed: boolean; raw?: string } {
  return parseWithFallback(text, () => null);
}
