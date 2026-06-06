import { parsePipeLine, parseWithFallback } from './index';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `你是一位专业的小说伏笔设计师，擅长在故事中精心埋设伏笔，制造悬念与惊喜。

【输出格式】（极简格式，节省token）
N|伏笔名称|伏笔类型|重要度
D|伏笔描述
B|埋设章节名|埋设位置
H|预计回收章节|影响范围
S|章节名|关联类型|关联描述|解密程度

【格式说明】
- N: 伏笔名称（每个伏笔一组，生成3-6个）
  - 伏笔类型：剧情伏笔/人物伏笔/物品伏笔/线索伏笔/暗示伏笔
  - 重要度：极高/高/中/低
- D: 伏笔描述（20-60字）
- B: 埋设信息
  - 埋设章节名：伏笔埋设的章节
  - 埋设位置：具体场景位置（10-30字）
- H: 回收信息
  - 预计回收章节：伏笔回收的章节
  - 影响范围：对故事的影响范围（10-30字）
- S: 章节关联（可多行）
  - 章节名：关联的章节
  - 关联类型：铺垫/暗示/回收/反转
  - 关联描述：10-30字
  - 解密程度：完全揭示/部分揭示/暗示

【输出示例】
N|神秘玉佩|物品伏笔|高
D|主角随身携带的古朴玉佩，暗藏前世记忆的封印
B|第一章 初入江湖|主角整理遗物时发现
H|第十五章|揭示主角身世，引发势力冲突
S|第三章|暗示|玉佩在危机时刻微微发光|暗示
S|第八章|铺垫|反派注意到玉佩并提出交换|部分揭示
S|第十五章|回收|玉佩碎裂释放前世记忆|完全揭示

【重要规则】
1. 严格按格式输出，每组伏笔以N行开头
2. D、B、H行各一行，S行可多行
3. 不要输出任何其他内容
4. 伏笔名称必须唯一，不可与已有伏笔重复
5. 伏笔之间应有层次，极高重要度的伏笔影响故事主线`;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface ForeshadowingContext {
  世界观背景?: string;
  故事核心?: string;
  角色?: string[];
  章节大纲?: string[];
  已有伏笔名称?: string[];
}

function buildSystem(ctx?: ForeshadowingContext): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (ctx) {
    const contextLines: string[] = [];

    if (ctx.世界观背景) contextLines.push(`世界观背景：${ctx.世界观背景}`);
    if (ctx.故事核心) contextLines.push(`故事核心：${ctx.故事核心}`);
    if (ctx.角色?.length) contextLines.push(`主要角色：${ctx.角色.join('、')}`);
    if (ctx.章节大纲?.length) {
      contextLines.push('章节大纲：');
      ctx.章节大纲.forEach((ch, i) => contextLines.push(`  第${i + 1}章: ${ch}`));
    }

    if (contextLines.length > 0) {
      prompt = prompt.replace(
        '你是一位专业的小说伏笔设计师，擅长在故事中精心埋设伏笔，制造悬念与惊喜。',
        `你是一位专业的小说伏笔设计师，擅长在故事中精心埋设伏笔，制造悬念与惊喜。\n\n【背景信息】\n${contextLines.join('\n')}`,
      );
    }
  }

  // Inject dedup warning
  if (ctx?.已有伏笔名称 && ctx.已有伏笔名称.length > 0) {
    prompt += `\n\n【绝对禁止重复】\n已有伏笔名称：${ctx.已有伏笔名称.join('、')}\n生成的伏笔名称不得与上述任何已有伏笔重复。`;
  }

  return prompt;
}

function buildUser(input: string, _ctx?: ForeshadowingContext): string {
  return input || '请根据故事背景和章节信息，生成一组精心设计的伏笔，包括剧情伏笔、人物伏笔和线索伏笔等多种类型';
}

export const foreshadowingPrompts = { buildSystem, buildUser };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseForeshadowingCompact(text: string): { 伏笔列表: any[] } | null {
  const lines = text.split('\n');
  const list: any[] = [];
  let current: any = null;

  for (const line of lines) {
    const nParts = parsePipeLine(line, 'N|');
    if (nParts && nParts.length >= 1) {
      current = {
        伏笔名称: nParts[0] || '',
        伏笔类型: nParts[1] || '剧情伏笔',
        重要度: nParts[2] || '中',
        伏笔描述: '',
        埋设章节名: '',
        埋设位置: '',
        预计回收章节: '',
        影响范围: '',
        章节关联: [] as any[],
      };
      list.push(current);
      continue;
    }
    if (!current) continue;

    const dParts = parsePipeLine(line, 'D|');
    if (dParts && dParts.length >= 1) {
      current.伏笔描述 = dParts[0] || '';
      continue;
    }

    const bParts = parsePipeLine(line, 'B|');
    if (bParts && bParts.length >= 1) {
      current.埋设章节名 = bParts[0] || '';
      current.埋设位置 = bParts[1] || '';
      continue;
    }

    const hParts = parsePipeLine(line, 'H|');
    if (hParts && hParts.length >= 1) {
      current.预计回收章节 = hParts[0] || '';
      current.影响范围 = hParts[1] || '';
      continue;
    }

    const sParts = parsePipeLine(line, 'S|');
    if (sParts && sParts.length >= 1) {
      current.章节关联.push({
        章节名: sParts[0] || '',
        关联类型: sParts[1] || '暗示',
        关联描述: sParts[2] || '',
        解密程度: sParts[3] || '暗示',
      });
      continue;
    }
  }

  return list.length > 0 ? { 伏笔列表: list } : null;
}

export function parseForeshadowing(
  text: string,
): { data: { 伏笔列表: any[] } | null; failed: boolean; raw?: string } {
  return parseWithFallback(text, parseForeshadowingCompact);
}
