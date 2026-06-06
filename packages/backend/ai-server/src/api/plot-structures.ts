import { parseWithFallback } from './index';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const FULL_SYSTEM_PROMPT = `你是一位专业的小说情节结构设计师，擅长构建层次分明、节奏精准的故事框架。

【输出格式】（极简格式，节省token）
M|幕序号|幕名称|章节范围|内容概要

【格式说明】
- M: 幕信息（每幕一行，按情节模式生成对应幕数）
  - 幕序号：数字序号
  - 幕名称：幕的名称（5-15字）
  - 章节范围：起始章-结束章（如：第1章-第12章）
  - 内容概要：该幕的核心内容概要（30-80字）

【输出示例】
M|1|起势篇|第1章-第12章|主角从平凡少年踏上修炼之路，经历初次考验，展现天赋与决心，结识重要伙伴
M|2|风云篇|第13章-第25章|主角深入修仙界，卷入势力纷争，面临重大抉择，实力快速提升同时遭遇背叛
M|3|涅槃篇|第26章-第40章|主角跌入低谷后浴火重生，揭开身世之谜，与宿敌展开生死对决
M|4|问鼎篇|第41章-第55章|主角登上巅峰，统领势力，面对更大阴谋，为最终决战做准备
M|5|终章|第56章-第65章|最终决战，所有伏笔回收，主角完成蜕变，故事走向结局

【重要规则】
1. 严格按格式输出，每行一幕
2. 不要输出任何其他内容
3. 幕序号按顺序递增
4. 章节范围要连续且无重叠`;

const SECTION_SYSTEM_PROMPT = `你是一位专业的小说情节结构设计师，擅长构建层次分明、节奏精准的故事框架。

【输出格式】
请以JSON格式输出，包含以下字段：
{
  "幕名称": "幕的名称（5-15字）",
  "章节范围": "起始章-结束章",
  "开场故事": "该幕开场的故事场景描述（50-100字）",
  "结局故事": "该幕结局的故事场景描述（50-100字）",
  "内容概要": "该幕核心内容概要（50-100字）",
  "核心事件": ["该幕的核心事件列表，2-4个"],
  "角色发展": ["关键角色在该幕的发展变化，2-4个"],
  "情感基调": "该幕的总体情感基调（如：紧张激烈/温馨感人/沉重压抑）",
  "冲突升级": "该幕的冲突如何升级的描述（30-60字）"
}

【重要规则】
1. 严格按照JSON格式输出
2. 不要输出任何其他内容
3. 内容要具体，避免空泛描述`;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface PlotStructuresContext {
  世界观?: string;
  故事核心?: string;
  角色?: string[];
  情节模式?: string;
  已有情节列表?: string[];
  mode?: 'full' | 'section';
}

function buildSystem(ctx?: PlotStructuresContext): string {
  const mode = ctx?.mode === 'section' ? 'section' : 'full';
  let prompt = mode === 'section' ? SECTION_SYSTEM_PROMPT : FULL_SYSTEM_PROMPT;

  if (ctx) {
    const contextLines: string[] = [];

    if (ctx.世界观) contextLines.push(`世界观：${ctx.世界观}`);
    if (ctx.故事核心) contextLines.push(`故事核心：${ctx.故事核心}`);
    if (ctx.角色?.length) contextLines.push(`主要角色：${ctx.角色.join('、')}`);
    if (ctx.情节模式) contextLines.push(`情节模式：${ctx.情节模式}`);

    if (contextLines.length > 0) {
      const introLine = mode === 'section'
        ? '你是一位专业的小说情节结构设计师，擅长构建层次分明、节奏精准的故事框架。'
        : '你是一位专业的小说情节结构设计师，擅长构建层次分明、节奏精准的故事框架。';
      prompt = prompt.replace(
        introLine,
        `${introLine}\n\n【背景信息】\n${contextLines.join('\n')}`,
      );
    }

    if (ctx.已有情节列表?.length) {
      prompt += `\n\n【已有情节结构（请勿重复）】\n${ctx.已有情节列表.join('、')}`;
    }
  }

  return prompt;
}

function buildUser(input: string, _ctx?: PlotStructuresContext): string {
  return input || '请根据故事背景，设计完整的情节脉络结构';
}

export const plotStructuresPrompts = { buildSystem, buildUser };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parsePlotStructuresCompact(text: string): { 情节列表: any[] } | null {
  const lines = text.split('\n');
  const list: any[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('M|')) continue;
    const parts = trimmed.substring(2).split('|').map(s => s.trim());
    if (parts.length >= 1) {
      list.push({
        幕序号: parts[0] || '',
        幕名称: parts[1] || '',
        章节范围: parts[2] || '',
        内容概要: parts[3] || '',
      });
    }
  }

  return list.length > 0 ? { 情节列表: list } : null;
}

export function parsePlotStructures(
  text: string,
): { data: any; failed: boolean; raw?: string } {
  return parseWithFallback(text, parsePlotStructuresCompact);
}
