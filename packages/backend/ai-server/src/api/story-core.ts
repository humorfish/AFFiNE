import { parsePipeLine, parseWithFallback } from './index';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `你是一位专业的小说故事核心设计师，擅长构建引人入胜的故事核心要素。

【输出格式】（极简格式，节省token）
T|核心主题
C|核心冲突
S|重大赌注
H|预期悬念
D|结局方向
E|结局走向

【格式说明】
- T: 核心主题（10-50字）
- C: 核心冲突（10-50字）
- S: 重大赌注（10-50字）
- H: 预期悬念（10-50字）
- D: 结局方向（5-20字）
- E: 结局走向（10-50字）

【输出示例】
T|一个普通少年在残酷的修仙世界中坚守本心，最终证道长生
C|主角与命运的抗争，以及修仙界弱肉强食规则与人性良知的冲突
S|失败意味着永远失去挚爱，并成为强者的傀儡或牺牲品
H|神秘的身世之谜、隐藏在暗处的幕后黑手、主角真正的命运
D|圆满中带着遗憾
E|主角证道成功，拯救了挚爱，但牺牲了部分修为，踏上新的旅程

【重要规则】
1. 严格按格式输出，每行一个项
2. T行必须在第一行
3. 不要输出任何其他内容`;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface WorldviewContext {
  世界名称?: string;
  世界类型?: string;
  势力格局?: string;
  核心规则?: string;
}

function buildSystem(ctx?: WorldviewContext): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (ctx && (ctx.世界名称 || ctx.世界类型)) {
    const contextBlock = [
      '',
      '【世界观背景】',
      ctx.世界名称 ? `世界名称：${ctx.世界名称}` : null,
      ctx.世界类型 ? `世界类型：${ctx.世界类型}` : null,
      ctx.势力格局 ? `势力格局：${ctx.势力格局}` : null,
      ctx.核心规则 ? `核心规则：${ctx.核心规则}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    // Insert context block after the first line of the prompt
    prompt = prompt.replace(
      '你是一位专业的小说故事核心设计师，擅长构建引人入胜的故事核心要素。',
      `你是一位专业的小说故事核心设计师，擅长构建引人入胜的故事核心要素。${contextBlock}`,
    );
  }

  return prompt;
}

function buildUser(input: string, ctx?: WorldviewContext): string {
  return input || '请根据世界观信息，生成完整的故事核心设定';
}

export const storyCorePrompts = { buildSystem, buildUser };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const FIELD_MAP: [string, string][] = [
  ['T|', '核心主题'],
  ['C|', '核心冲突'],
  ['S|', '重大赌注'],
  ['H|', '预期悬念'],
  ['D|', '结局方向'],
  ['E|', '结局走向'],
];

function parseStoryCoreCompact(text: string): Record<string, string> | null {
  const lines = text.split('\n');
  const data: Record<string, string> = {};
  let foundAny = false;

  for (const line of lines) {
    for (const [prefix, field] of FIELD_MAP) {
      const parts = parsePipeLine(line, prefix);
      if (parts) {
        data[field] = parts[0] || '';
        foundAny = true;
        break;
      }
    }
  }

  return foundAny ? data : null;
}

export function parseStoryCore(
  text: string,
): { data: Record<string, string> | null; failed: boolean; raw?: string } {
  return parseWithFallback(text, parseStoryCoreCompact);
}
