import { parsePipeLine, parseWithFallback } from './index';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `你是一位专业的小说物品设计师，擅长构建完整的虚拟世界物品系统。

【输出格式】（极简格式，节省token）
I|物品名称|类别|作用|获取难度

【格式说明】
- I: 物品信息（每个物品一行，生成3-8个）
  - 类别：武器/防具/药品/材料/食物/道具/其他
  - 作用：功能描述（10-30字）
  - 获取难度：容易/一般/困难/极难

【输出示例】
I|青锋剑|武器|锋利无比的精钢长剑，可斩金石|一般
I|玄铁甲|防具|以玄铁打造的重甲，防御极佳|困难
I|回元丹|药品|可恢复三成灵力的疗伤丹药|一般
I|灵石|材料|蕴含灵气的矿石，修炼必备|容易

【重要规则】
1. 严格按格式输出，每行一个物品
2. 不要输出任何其他内容
3. 物品名称必须唯一，不可与已有物品重复`;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface WorldviewContext {
  世界名称?: string;
  世界类型?: string;
  核心规则?: string;
  特殊元素?: string;
}

function buildSystem(
  ctx?: WorldviewContext,
  existingNames?: string[],
): string {
  let prompt = BASE_SYSTEM_PROMPT;

  // Inject worldview context
  if (ctx && (ctx.世界名称 || ctx.世界类型)) {
    const contextBlock = [
      '',
      '【世界观背景】',
      ctx.世界名称 ? `世界名称：${ctx.世界名称}` : null,
      ctx.世界类型 ? `世界类型：${ctx.世界类型}` : null,
      ctx.核心规则 ? `核心规则：${ctx.核心规则}` : null,
      ctx.特殊元素 ? `特殊元素：${ctx.特殊元素}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    prompt = prompt.replace(
      '你是一位专业的小说物品设计师，擅长构建完整的虚拟世界物品系统。',
      `你是一位专业的小说物品设计师，擅长构建完整的虚拟世界物品系统。${contextBlock}`,
    );
  }

  // Inject dedup warning
  if (existingNames && existingNames.length > 0) {
    prompt += `\n\n【绝对禁止重复】\n已有物品名称：${existingNames.join('、')}\n生成的物品名称不得与上述任何已有物品重复。`;
  }

  return prompt;
}

function buildUser(input: string, _ctx?: WorldviewContext): string {
  return input || '请根据世界观信息，生成符合设定的物品列表，包括武器、防具、药品、材料等多种类别';
}

export const itemsPrompts = { buildSystem, buildUser };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseItemsCompact(text: string): { 物品列表: any[] } | null {
  const lines = text.split('\n');
  const items: any[] = [];

  for (const line of lines) {
    const parts = parsePipeLine(line, 'I|');
    if (parts && parts.length >= 1) {
      items.push({
        物品名称: parts[0] || '',
        类别: parts[1] || '其他',
        作用: parts[2] || '',
        出处: '',
        获取难度: parts[3] || '一般',
      });
    }
  }

  return items.length > 0 ? { 物品列表: items } : null;
}

export function parseItems(
  text: string,
): { data: { 物品列表: any[] } | null; failed: boolean; raw?: string } {
  return parseWithFallback(text, parseItemsCompact);
}
