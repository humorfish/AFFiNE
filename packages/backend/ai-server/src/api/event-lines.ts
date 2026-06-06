import { parsePipeLine, parseWithFallback } from './index';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `你是一位专业的小说事件流设计师，擅长构建层层递进、环环相扣的故事事件链。

【输出格式】（极简格式，节省token）
EV|所属卷序号|事件名称|欲望|阻碍|行动|结果|意外|转折|结局|涉及角色|涉及支线

【格式说明】
- EV: 事件信息（每个事件一行，生成5-10个）
  - 所属卷序号：数字
  - 事件名称：事件名称（5-15字）
  - 欲望：主角/关键角色在该事件中的核心欲望（200-400字叙事描述）
  - 阻碍：实现欲望面临的主要阻碍（200-400字叙事描述）
  - 行动：角色为克服阻碍采取的行动（200-400字叙事描述）
  - 结果：行动带来的直接结果（200-400字叙事描述）
  - 意外：出乎意料的变化或发现（200-400字叙事描述）
  - 转折：事件的关键转折点（200-400字叙事描述）
  - 结局：事件的最终走向（200-400字叙事描述）
  - 涉及角色：逗号分隔的角色名称（必填）
  - 涉及支线：逗号分隔的支线名称（可选）

【输出示例】
EV|1|初入江湖|少年李云风怀揣成为至强剑客的梦想，拜入天剑宗门下...|天剑宗每年只收十名弟子，竞争极其激烈，且李云风毫无修炼基础...|李云风凭借过人毅力日夜苦修，在入门考核中展现出惊人的剑道天赋...|成功拜入天剑宗，成为内门弟子，获得剑道传承资格...|入门仪式上，一枚古朴玉佩突然共鸣发光，引起长老注意...|长老发现玉佩与宗门秘辛有关，破例将李云风收入亲传弟子...|李云风正式踏上修炼之路，但玉佩的秘密也埋下了隐患|李云风,剑无痕,赵长老|身世之谜

【重要规则】
1. 严格按格式输出，每行一个事件
2. 不要输出任何其他内容
3. 欲望到结局每个字段200-400字，内容丰富具体
4. 涉及角色必填，用逗号分隔
5. 事件之间应有因果关系和递进节奏`;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface EventLinesContext {
  世界观?: string;
  故事核心?: string;
  角色?: string[];
  情节脉络列表?: string[];
  卷范围?: string;
  指定出场角色?: string[];
}

function buildSystem(ctx?: EventLinesContext): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (ctx) {
    const contextLines: string[] = [];

    if (ctx.世界观) contextLines.push(`世界观：${ctx.世界观}`);
    if (ctx.故事核心) contextLines.push(`故事核心：${ctx.故事核心}`);
    if (ctx.角色?.length) contextLines.push(`主要角色：${ctx.角色.join('、')}`);
    if (ctx.情节脉络列表?.length) {
      contextLines.push('情节脉络：');
      ctx.情节脉络列表.forEach(p => contextLines.push(`  - ${p}`));
    }
    if (ctx.卷范围) contextLines.push(`卷范围：${ctx.卷范围}`);
    if (ctx.指定出场角色?.length) contextLines.push(`指定出场角色：${ctx.指定出场角色.join('、')}`);

    if (contextLines.length > 0) {
      prompt = prompt.replace(
        '你是一位专业的小说事件流设计师，擅长构建层层递进、环环相扣的故事事件链。',
        `你是一位专业的小说事件流设计师，擅长构建层层递进、环环相扣的故事事件链。\n\n【背景信息】\n${contextLines.join('\n')}`,
      );
    }
  }

  return prompt;
}

function buildUser(input: string, _ctx?: EventLinesContext): string {
  return input || '请根据故事背景和情节脉络，生成一组环环相扣的故事事件流';
}

export const eventLinesPrompts = { buildSystem, buildUser };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseEventLinesCompact(text: string): { 事件列表: any[] } | null {
  const lines = text.split('\n');
  const list: any[] = [];

  for (const line of lines) {
    const parts = parsePipeLine(line, 'EV|');
    if (parts && parts.length >= 10) {
      list.push({
        所属卷序号: parts[0] || '',
        事件名称: parts[1] || '',
        欲望: parts[2] || '',
        阻碍: parts[3] || '',
        行动: parts[4] || '',
        结果: parts[5] || '',
        意外: parts[6] || '',
        转折: parts[7] || '',
        结局: parts[8] || '',
        涉及角色: parts[9] ? parts[9].split(',').map(s => s.trim()) : [],
        涉及支线: parts[10] ? parts[10].split(',').map(s => s.trim()) : [],
      });
    }
  }

  return list.length > 0 ? { 事件列表: list } : null;
}

export function parseEventLines(
  text: string,
): { data: { 事件列表: any[] } | null; failed: boolean; raw?: string } {
  return parseWithFallback(text, parseEventLinesCompact);
}
