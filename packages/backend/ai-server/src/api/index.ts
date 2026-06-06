// AI generation prompt templates and parsers extracted from aixiaoshuojia.cn
// Each scenario has: system prompt builder, user message builder, compact-line parser

import { worldviewPrompts, worldviewSectionPrompt, parseWorldview, parseWorldviewSection } from './worldview';
import { storyCorePrompts, parseStoryCore } from './story-core';
import { itemsPrompts, parseItems } from './items';
import { currencyPrompts, parseCurrency } from './currency';
import { factionsPrompts, parseFactions } from './factions';
import { powerSystemsPrompts, parsePowerSystem } from './power-systems';
import { skillSystemsPrompts, parseSkill } from './skill-systems';
import { specialSettingsPrompts, parseSpecialSetting } from './special-settings';
import { charactersPrompts, parseCharacter } from './characters';
import { characterRelationsPrompts, parseCharacterRelations } from './character-relations';
import { geoMapsPrompts, parseGeoMap } from './geo-maps';
import { foreshadowingPrompts, parseForeshadowing } from './foreshadowing';
import { plotStructuresPrompts, parsePlotStructures } from './plot-structures';
import { eventLinesPrompts, parseEventLines } from './event-lines';
import { outlinesPrompts, parseOutlines } from './outlines';
import { timelinePrompts, parseTimeline } from './timeline';

export {
  worldviewPrompts, worldviewSectionPrompt, parseWorldview, parseWorldviewSection,
  storyCorePrompts, parseStoryCore,
  itemsPrompts, parseItems,
  currencyPrompts, parseCurrency,
  factionsPrompts, parseFactions,
  powerSystemsPrompts, parsePowerSystem,
  skillSystemsPrompts, parseSkill,
  specialSettingsPrompts, parseSpecialSetting,
  charactersPrompts, parseCharacter,
  characterRelationsPrompts, parseCharacterRelations,
  geoMapsPrompts, parseGeoMap,
  foreshadowingPrompts, parseForeshadowing,
  plotStructuresPrompts, parsePlotStructures,
  eventLinesPrompts, parseEventLines,
  outlinesPrompts, parseOutlines,
  timelinePrompts, parseTimeline,
};

// Common LLM parameters used across all scenarios
export const LLM_PARAMS = {
  temperature: 0.85,
  max_tokens_full: 8192,
  max_tokens_section: 1024,
  stream: true,
  frequency_penalty: 0.5,
  presence_penalty: 0.4,
  thinking: { type: 'disabled' as const },
};

// Common helper: parse compact pipe-delimited lines
export function parsePipeLine(line: string, prefix: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(prefix)) return null;
  return trimmed.substring(prefix.length).split('|').map(s => s.trim());
}

// Common helper: compact-line parse with JSON fallback
export function parseWithFallback<T>(
  text: string,
  compactParser: (text: string) => T | null,
): { data: T | null; failed: boolean; raw?: string } {
  if (!text) return { data: null, failed: true };
  const compact = compactParser(text.trim());
  if (compact) return { data: compact, failed: false };
  // JSON fallback
  try { return { data: JSON.parse(text), failed: false }; } catch {}
  const codeMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeMatch) try { return { data: JSON.parse(codeMatch[1]), failed: false }; } catch {}
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) try { return { data: JSON.parse(braceMatch[0]), failed: false }; } catch {}
  const bracketMatch = text.match(/\[[\s\S]*\]/);
  if (bracketMatch) try { return { data: JSON.parse(bracketMatch[0]), failed: false }; } catch {}
  return { data: null, failed: true, raw: text };
}

export interface ScenarioConfig {
  buildSystemPrompt: (context?: Record<string, unknown>) => string;
  buildUserMessage: (userInput: string, context?: Record<string, unknown>) => string;
  parse: (text: string) => { data: unknown; failed: boolean; raw?: string };
  maxTokens: number;
}

// Registry of all scenarios
export const SCENARIOS: Record<string, ScenarioConfig> = {};

SCENARIOS['AI生成世界观'] = {
  buildSystemPrompt: (_ctx) => worldviewPrompts.buildSystemPrompt(),
  buildUserMessage: (input, _ctx) => worldviewPrompts.buildUserMessage(input),
  parse: (text) => parseWorldview(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成故事核心'] = {
  buildSystemPrompt: (ctx) => storyCorePrompts.buildSystem(ctx as any),
  buildUserMessage: (input, ctx) => storyCorePrompts.buildUser(input, ctx as any),
  parse: (text) => parseStoryCore(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成物品'] = {
  buildSystemPrompt: (ctx) => itemsPrompts.buildSystem(ctx as any, (ctx as any)?.已有物品名称),
  buildUserMessage: (input, ctx) => itemsPrompts.buildUser(input, ctx as any),
  parse: (text) => parseItems(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成货币体系'] = {
  buildSystemPrompt: (ctx) => currencyPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => currencyPrompts.buildUser(input),
  parse: (text) => parseCurrency(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成势力阵营'] = {
  buildSystemPrompt: (ctx) => factionsPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => factionsPrompts.buildUser(input),
  parse: (text) => parseFactions(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成力量体系'] = {
  buildSystemPrompt: (ctx) => powerSystemsPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => powerSystemsPrompts.buildUser(input),
  parse: (text) => parsePowerSystem(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成功法'] = {
  buildSystemPrompt: (ctx) => skillSystemsPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => skillSystemsPrompts.buildUser(input),
  parse: (text) => parseSkill(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成金手指'] = {
  buildSystemPrompt: (ctx) => specialSettingsPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => specialSettingsPrompts.buildUser(input),
  parse: (text) => parseSpecialSetting(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成角色'] = {
  buildSystemPrompt: (ctx) => charactersPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => charactersPrompts.buildUser(input),
  parse: (text) => parseCharacter(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成人物关系'] = {
  buildSystemPrompt: (ctx) => characterRelationsPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => characterRelationsPrompts.buildUser(input),
  parse: (text) => parseCharacterRelations(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成地图'] = {
  buildSystemPrompt: (ctx) => geoMapsPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => geoMapsPrompts.buildUser(input),
  parse: (text) => parseGeoMap(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成伏笔'] = {
  buildSystemPrompt: (ctx) => foreshadowingPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => foreshadowingPrompts.buildUser(input),
  parse: (text) => parseForeshadowing(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成情节脉络'] = {
  buildSystemPrompt: (ctx) => plotStructuresPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => plotStructuresPrompts.buildUser(input),
  parse: (text) => parsePlotStructures(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成事件流'] = {
  buildSystemPrompt: (ctx) => eventLinesPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => eventLinesPrompts.buildUser(input),
  parse: (text) => parseEventLines(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成大纲'] = {
  buildSystemPrompt: (ctx) => outlinesPrompts.buildSystem(ctx as any),
  buildUserMessage: (input, _ctx) => outlinesPrompts.buildUser(input),
  parse: (text) => parseOutlines(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};

SCENARIOS['AI生成时间线'] = {
  buildSystemPrompt: (_ctx) => timelinePrompts.buildSystem(),
  buildUserMessage: (input, _ctx) => timelinePrompts.buildUser(input),
  parse: (text) => parseTimeline(text),
  maxTokens: LLM_PARAMS.max_tokens_full,
};
