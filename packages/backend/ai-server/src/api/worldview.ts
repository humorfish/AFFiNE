import { parsePipeLine, parseWithFallback } from './index';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `你是一位专业的小说世界观设定师，擅长创造丰富、有深度的虚构世界。

【输出格式】（极简格式，节省token）
W|世界名称|世界类型
T|时代背景
R|核心规则
G|地理环境
S|社会结构
H|历史背景
E|特殊元素
C|主要冲突
F|势力格局
CAL|历法名称|故事起点日期|每年月数|每月天数|每日时辰数|显示格式
CAL_ERA|纪年名称1,纪年名称2,...
CAL_TIME|时辰名称1,时辰名称2,...
CAL_TPL|时长类型1:默认天数1,时长类型2:默认天数2,...

【格式说明】
- W: 基本信息（必填，第1行）
  - 世界类型：仙侠世界/玄幻大陆/现代都市/科幻未来/武侠江湖等
- T: 时代背景（10-50字）
- R: 核心规则（10-50字，世界的基本运行法则）
- G: 地理环境（10-50字，主要地形、气候、地点）
- S: 社会结构（10-50字，阶层、势力、组织）
- H: 历史背景（10-50字，重要历史事件和传说）
- E: 特殊元素（10-50字，灵气/魔法/科技等）
- C: 主要冲突（10-50字，核心矛盾）
- F: 势力格局（10-50字，主要势力分布）
- CAL: 世界历法基本设定（必填）
- CAL_ERA: 纪年体系（必填，至少1个纪年）
- CAL_TIME: 时辰名称（必填）
- CAL_TPL: 时长模板（必填，至少3-5个）

【输出示例】
W|玄灵大陆|仙侠世界
T|修仙盛世，宗门林立，凡人与修士两极分化
R|以灵气为根基，修士通过修炼可逆天改命，因果循环不爽
G|五洲四海，中州灵气最盛，北荒苦寒，南疆多异族
S|修士为尊，凡人如蚁。宗门掌控资源，皇权依附宗门
H|三万年前天魔入侵，众仙联手封印，从此仙踪难觅
E|天地灵气充沛，可炼丹铸器，有灵兽妖族共存
C|正邪对立，资源争夺，凡人与修士的鸿沟日益加深
F|五大宗门主导正道，魔门暗中蛰伏，皇室在夹缝中求存
CAL|玄灵历|天元-3-3-8|12|30|12|中式
CAL_ERA|混沌,天元,大启
CAL_TIME|子,丑,寅,卯,辰,巳,午,未,申,酉,戌,亥
CAL_TPL|闭关:30,赶路:3,历练:7,突破:1,疗伤:5,炼丹:2,传功:1

【核心要求】
1. 设定要有内在逻辑和一致性
2. 要有独特性和创意性
3. 便于展开故事情节
4. 历法设计要贴合世界观
5. 纪年体系要反映世界历史的时代划分
6. 时辰名称要贴合世界观风格
7. 时长模板要涵盖该世界常见活动类型

【重要规则】
1. 严格按格式输出，每行一个项
2. W行必须在第一行，CAL系列行必须在最后
3. 不要输出任何其他内容`;

export function worldviewSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

// ---------------------------------------------------------------------------
// User prompts
// ---------------------------------------------------------------------------

export function worldviewUserPrompt(input: string): string {
  return `请为我生成一个完整的世界观设定。\n\n用户需求：${input || '创建一个有趣且独特的小说世界'}`;
}

export function worldviewSectionPrompt(
  fieldName: string,
  existingData: Record<string, string>,
  userInput?: string,
): { system: string; user: string } {
  const existingFields = Object.entries(existingData)
    .map(([k, v]) => `${k}：${v}`)
    .join('\n');

  const user = `基于以下已有世界观设定，请生成"${fieldName}"部分的详细内容。\n\n已有设定：\n${existingFields}\n\n用户补充要求：${userInput || '请根据已有设定生成合适的内容'}\n\n只需要返回一个JSON对象，只包含"${fieldName}"字段及其内容。`;

  return { system: SYSTEM_PROMPT, user };
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

// Mapping of compact-line prefixes to output field names (for single-value lines)
const SINGLE_FIELDS: [string, string][] = [
  ['T|', '时代背景'],
  ['R|', '核心规则'],
  ['G|', '地理环境'],
  ['S|', '社会结构'],
  ['H|', '历史背景'],
  ['E|', '特殊元素'],
  ['C|', '主要冲突'],
  ['F|', '势力格局'],
];

function parseWorldviewCompact(text: string): Record<string, any> | null {
  const lines = text.split('\n');
  const data: Record<string, any> = {};
  let foundAny = false;

  for (const line of lines) {
    // W|世界名称|世界类型
    const wParts = parsePipeLine(line, 'W|');
    if (wParts) {
      if (wParts.length >= 1) data['世界名称'] = wParts[0];
      if (wParts.length >= 2) data['世界类型'] = wParts[1];
      foundAny = true;
      continue;
    }

    // CAL|历法名称|故事起点日期|每年月数|每月天数|每日时辰数|显示格式
    const calParts = parsePipeLine(line, 'CAL|');
    if (calParts) {
      data['历法'] = {
        历法名称: calParts[0] || '',
        故事起点日期: calParts[1] || '',
        每年月数: Number(calParts[2]) || 12,
        每月天数: Number(calParts[3]) || 30,
        每日时辰数: Number(calParts[4]) || 12,
        显示格式: calParts[5] || '中式',
      };
      foundAny = true;
      continue;
    }

    // CAL_ERA|纪年名称1,纪年名称2,...
    const eraParts = parsePipeLine(line, 'CAL_ERA|');
    if (eraParts) {
      const eras = (eraParts[0] || '').split(',').map(s => s.trim()).filter(Boolean);
      if (data['历法']) (data['历法'] as any).纪年体系 = eras;
      foundAny = true;
      continue;
    }

    // CAL_TIME|时辰名称1,时辰名称2,...
    const timeParts = parsePipeLine(line, 'CAL_TIME|');
    if (timeParts) {
      const times = (timeParts[0] || '').split(',').map(s => s.trim()).filter(Boolean);
      if (data['历法']) (data['历法'] as any).时辰名称 = times;
      foundAny = true;
      continue;
    }

    // CAL_TPL|时长类型1:默认天数1,时长类型2:默认天数2,...
    const tplParts = parsePipeLine(line, 'CAL_TPL|');
    if (tplParts) {
      const templates = (tplParts[0] || '').split(',').map(s => {
        const [name, days] = s.trim().split(':');
        return { 时长类型: name?.trim() || '', 默认天数: Number(days) || 1 };
      });
      if (data['历法']) (data['历法'] as any).时长模板 = templates;
      foundAny = true;
      continue;
    }

    // Single-value fields (T, R, G, S, H, E, C, F)
    for (const [prefix, field] of SINGLE_FIELDS) {
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

export function parseWorldview(
  text: string,
): { data: Record<string, any> | null; failed: boolean; raw?: string } {
  return parseWithFallback(text, parseWorldviewCompact);
}

export function parseWorldviewSection(
  text: string,
  _fieldName: string,
): { data: Record<string, string> | null; failed: boolean; raw?: string } {
  // Section generation returns JSON, so we only need JSON fallback
  return parseWithFallback<Record<string, string>>(text, () => null);
}

// Re-export as scenario object for registry convenience
export const worldviewPrompts = {
  buildSystemPrompt: () => SYSTEM_PROMPT,
  buildUserMessage: (input: string) => worldviewUserPrompt(input),
};
