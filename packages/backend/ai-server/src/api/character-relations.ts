import { parsePipeLine, parseWithFallback } from './index';

function buildSystemPrompt(context: {
  角色列表: Array<{ 姓名: string; 类型: string; 身份: string }>;
  已有关系?: Array<{ 源角色: string; 目标角色: string; 关系类型: string; 关系描述: string }>;
}): string {
  let prompt = `你是一位专业的小说角色关系设计师，擅长构建复杂而有张力的人物关系网络。

## 当前角色列表
${context.角色列表.map(c => `- ${c.姓名}(${c.类型}, ${c.身份})`).join('\n')}

## 输出格式
请按以下紧凑行格式输出，每行一条关系：
L|源角色|目标角色|关系类型|关系描述|颜色

颜色使用十六进制色值（如 #FF6B6B、#4ECDC4、#45B7D1 等），用于可视化展示。

也可以输出 JSON 数组格式：
[{"源角色":"...","目标角色":"...","关系类型":"...","关系描述":"...","颜色":"#hex"}]

## 关系类型参考
亲情/爱情/友情/师徒/同门/主从/敌对/竞争/合作/暗恋/利用/保护/背叛/暗恋/仇敌/盟友/上下级/邻居/同窗

## 设计原则
1. 关系要有多层次，不是简单的好坏
2. 关系网络要形成闭环，互相牵制
3. 关系要有变化空间，为后续剧情留余地
4. 颜色要区分不同关系类型，便于视觉识别`;

  if (context.已有关系?.length) {
    prompt += `\n\n## 已有关系（请勿重复）\n${context.已有关系.map(r => `- ${r.源角色} → ${r.目标角色}: [${r.关系类型}] ${r.关系描述}`).join('\n')}`;
  }
  return prompt;
}

function buildUserMessage(input: string, targetChars?: string[], relationType?: string): string {
  let msg = input;
  if (targetChars?.length) {
    msg = `请为以下角色设计关系：${targetChars.join('、')}\n\n${input}`;
  }
  if (relationType) {
    msg += `\n\n重点关注「${relationType}」类型的关系`;
  }
  return msg;
}

export const characterRelationsPrompts = {
  buildSystem: buildSystemPrompt,
  buildUser: buildUserMessage,
};

function parseRelationsCompact(text: string): Array<{ 源角色: string; 目标角色: string; 关系类型: string; 关系描述: string; 颜色: string }> | null {
  const lines = text.split('\n').filter(l => l.trim());
  const relations: Array<{ 源角色: string; 目标角色: string; 关系类型: string; 关系描述: string; 颜色: string }> = [];

  for (const line of lines) {
    const parts = parsePipeLine(line, 'L|');
    if (parts && parts.length >= 4) {
      relations.push({
        源角色: parts[0],
        目标角色: parts[1],
        关系类型: parts[2],
        关系描述: parts[3],
        颜色: parts[4] || '#999999',
      });
    }
  }

  return relations.length > 0 ? relations : null;
}

export function parseCharacterRelations(text: string): { data: Array<{ 源角色: string; 目标角色: string; 关系类型: string; 关系描述: string; 颜色: string }> | null; failed: boolean; raw?: string } {
  return parseWithFallback(text, parseRelationsCompact);
}
