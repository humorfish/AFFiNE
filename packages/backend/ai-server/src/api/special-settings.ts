import { parsePipeLine, parseWithFallback } from './index';

const SPECIAL_TYPES = [
  '系统流', '血脉流', '技能流', '道具流', '宿主流', '穿越赠品', '天命之子',
  '融合流', '空间流', '签到流', '抽奖流', '商城流', '任务流', '重生流',
  '剧情流', '复制流', '进化流', '气运流', '其他',
] as const;

const SYSTEM_FORMS = [
  '面板系统', '意识空间', '契约精灵', '无形系统', '实体道具', '被动能力', '智能AI',
] as const;

function buildSystemPrompt(context?: {
  世界观背景?: Record<string, string>;
  已有金手指名称?: string[];
  类型?: string;
}): string {
  let prompt = `你是一位专业的网文金手指/系统设计师，擅长设计有创意、平衡且引人入胜的金手指/系统设定。

## 输出格式
请严格按照以下紧凑行格式输出，每行以标识符开头，字段用 | 分隔：
N|金手指名称|金手指类型|系统形态|金手指简介
D|金手指描述
O|来源背景|绑定条件|绑定时间点
I|初始状态|最终形态
F|功能名称|功能类型|功能描述|触发方式|解锁条件
E|效果名称|效果类型|效果描述|作用目标
C|消耗类型|消耗名称|消耗数值|恢复方式
L|等级序号|等级名称|等级描述|升级条件
R|使用限制|暴露风险|使用代价

## 金手指类型
${SPECIAL_TYPES.join('/')}

## 系统形态
${SYSTEM_FORMS.join('/')}

## 设计原则
1. 金手指要有明确的规则和限制，不能过于逆天
2. 功能体系要层次分明，有成长性
3. 与世界观背景自然融合
4. 使用代价要合理，制造故事张力
5. 等级体系要有清晰的进阶路径`;

  if (context?.世界观背景) {
    prompt += `\n\n## 世界观背景\n${Object.entries(context.世界观背景).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;
  }
  if (context?.已有金手指名称?.length) {
    prompt += `\n\n## 已有金手指（请勿重复）\n${context.已有金手指名称.join('、')}`;
  }
  if (context?.类型) {
    prompt += `\n\n## 指定类型\n请设计「${context.类型}」类型的金手指`;
  }
  return prompt;
}

function buildUserMessage(input: string, type?: string): string {
  let msg = input;
  if (type) {
    msg = `请设计一个「${type}」类型的金手指/系统。\n\n${input}`;
  }
  return msg;
}

export const specialSettingsPrompts = {
  buildSystem: buildSystemPrompt,
  buildUser: buildUserMessage,
};

function parseSpecialSettingCompact(text: string): Record<string, any> | null {
  const lines = text.split('\n').filter(l => l.trim());
  const result: Record<string, any> = { 功能列表: [], 效果列表: [], 消耗列表: [], 等级列表: [] };

  for (const line of lines) {
    let parts: string[] | null;

    parts = parsePipeLine(line, 'N|');
    if (parts && parts.length >= 5) {
      result.金手指名称 = parts[0];
      result.金手指类型 = parts[1];
      result.系统形态 = parts[2];
      result.金手指简介 = parts[3];
      continue;
    }
    parts = parsePipeLine(line, 'D|');
    if (parts && parts.length >= 1) {
      result.金手指描述 = parts[0];
      continue;
    }
    parts = parsePipeLine(line, 'O|');
    if (parts && parts.length >= 3) {
      result.来源背景 = parts[0];
      result.绑定条件 = parts[1];
      result.绑定时间点 = parts[2];
      continue;
    }
    parts = parsePipeLine(line, 'I|');
    if (parts && parts.length >= 2) {
      result.初始状态 = parts[0];
      result.最终形态 = parts[1];
      continue;
    }
    parts = parsePipeLine(line, 'F|');
    if (parts && parts.length >= 5) {
      result.功能列表.push({
        功能名称: parts[0], 功能类型: parts[1], 功能描述: parts[2],
        触发方式: parts[3], 解锁条件: parts[4],
      });
      continue;
    }
    parts = parsePipeLine(line, 'E|');
    if (parts && parts.length >= 4) {
      result.效果列表.push({
        效果名称: parts[0], 效果类型: parts[1], 效果描述: parts[2], 作用目标: parts[3],
      });
      continue;
    }
    parts = parsePipeLine(line, 'C|');
    if (parts && parts.length >= 4) {
      result.消耗列表.push({
        消耗类型: parts[0], 消耗名称: parts[1], 消耗数值: parts[2], 恢复方式: parts[3],
      });
      continue;
    }
    parts = parsePipeLine(line, 'L|');
    if (parts && parts.length >= 4) {
      result.等级列表.push({
        等级序号: parts[0], 等级名称: parts[1], 等级描述: parts[2], 升级条件: parts[3],
      });
      continue;
    }
    parts = parsePipeLine(line, 'R|');
    if (parts && parts.length >= 3) {
      result.使用限制 = parts[0];
      result.暴露风险 = parts[1];
      result.使用代价 = parts[2];
      continue;
    }
  }

  return result.金手指名称 ? result : null;
}

export function parseSpecialSetting(text: string): { data: Record<string, any> | null; failed: boolean; raw?: string } {
  return parseWithFallback(text, parseSpecialSettingCompact);
}
