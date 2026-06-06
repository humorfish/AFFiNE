import { parsePipeLine, parseWithFallback } from './index';

export const powerSystemsPrompts = {
  buildSystem(
    context?: {
      世界观背景?: Record<string, string>;
      已有体系名称?: string[];
      体系类型?: string;
    },
  ): string {
    let prompt = `你是一位专业的小说力量体系设计师，擅长为各类虚构世界设计完整、严谨且富有创意的力量体系。你需要严格按照指定格式输出，不添加任何多余内容。

## 格式规范

\`N|体系名称|体系类型|力量来源\` — 体系基本信息
  - 体系类型: 修炼类/觉醒类/血脉类/契约类/科技类/魔法类/武道类/其他
\`D|体系描述\` — 体系的整体描述
\`J|境界名称|境界等级|境界描述|提升条件\` — 境界划分，5-8个
  - 境界等级: 用数字1-8表示从低到高
\`A|能力名称|能力类型|能力描述|学习条件\` — 特殊能力，3-6个
  - 能力类型: 攻击/防御/辅助/移动/感知/特殊
\`P|修行方法|修行资源|修行难点|突破要点\` — 修行体系
\`R|使用限制|副作用|反噬风险\` — 限制与风险

## 输出示例

N|灵气修炼体系|修炼类|天地灵气
D|以吸收天地灵气为核心，通过修炼功法凝聚灵力，逐步提升境界的修炼体系
J|炼气期|1|初入修仙，感知灵气，凝聚第一缕灵力于丹田|引导灵气入体，需安静环境
J|筑基期|2|灵力凝实，筑建修炼根基|炼气期圆满，服用筑基丹
J|金丹期|3|灵力凝聚成丹，实力大幅提升|筑基期圆满，经历金丹雷劫
J|元婴期|4|金丹化婴，神识大增|金丹期圆满，碎丹成婴
J|化神期|5|元婴与天地合一，初步掌控天地法则|元婴期圆满，感悟天地法则
A|御剑术|攻击|以灵力驱使飞剑远程攻击|筑基期以上，需有本命飞剑
A|灵盾术|防御|凝聚灵力形成防护屏障|炼气期后期
A|神识探查|感知|以神识感知周围环境和生物|金丹期以上
P|打坐吸纳灵气|灵石、灵脉、丹药|灵根资质决定修炼速度|心境与灵力并重，需顿悟
R|灵力耗尽后虚弱|强行突破可能经脉寸断|逆行功法可能导致走火入魔

## 规则
1. 严格按照格式输出，不要输出任何其他内容
2. N行必须在最前面，D行紧随其后
3. 境界数量5-8个，由低到高排列
4. 能力数量3-6个
5. 体系应有自洽的内在逻辑`;

    if (context?.世界观背景) {
      prompt += '\n\n## 世界观背景';
      for (const [k, v] of Object.entries(context.世界观背景)) {
        prompt += `\n${k}: ${v}`;
      }
    }

    if (context?.体系类型) {
      prompt += `\n\n## 指定体系类型\n请生成「${context.体系类型}」类型的体系`;
    }

    if (context?.已有体系名称?.length) {
      prompt += `\n\n## 绝对禁止重复\n以下体系名称已存在，绝对禁止重复生成:\n${context.已有体系名称.map(n => `- ${n}`).join('\n')}`;
    }

    return prompt;
  },

  buildUser(input: string, type?: string): string {
    if (input) return input;
    const typeHint = type ? `，类型为「${type}」` : '';
    return `请根据世界观信息，生成完整的力量体系设定${typeHint}，包括境界划分、特殊能力、修行方法和限制`;
  },
};

function parsePowerSystemCompact(text: string) {
  const lines = text.split('\n');
  let 体系名称 = '';
  let 体系类型 = '';
  let 力量来源 = '';
  let 体系描述 = '';
  const 境界列表: Array<{
    境界名称: string;
    境界等级: number;
    境界描述: string;
    提升条件: string;
  }> = [];
  const 能力列表: Array<{
    能力名称: string;
    能力类型: string;
    能力描述: string;
    学习条件: string;
  }> = [];
  let 修行方法 = '';
  let 修行资源 = '';
  let 修行难点 = '';
  let 突破要点 = '';
  let 使用限制 = '';
  let 副作用 = '';
  let 反噬风险 = '';

  for (const line of lines) {
    const nParts = parsePipeLine(line, 'N|');
    if (nParts) {
      体系名称 = nParts[0] || '';
      体系类型 = nParts[1] || '';
      力量来源 = nParts[2] || '';
      continue;
    }

    const dParts = parsePipeLine(line, 'D|');
    if (dParts) {
      体系描述 = dParts[0] || '';
      continue;
    }

    const jParts = parsePipeLine(line, 'J|');
    if (jParts) {
      境界列表.push({
        境界名称: jParts[0] || '',
        境界等级: jParts[1] ? parseInt(jParts[1], 10) : 0,
        境界描述: jParts[2] || '',
        提升条件: jParts[3] || '',
      });
      continue;
    }

    const aParts = parsePipeLine(line, 'A|');
    if (aParts) {
      能力列表.push({
        能力名称: aParts[0] || '',
        能力类型: aParts[1] || '',
        能力描述: aParts[2] || '',
        学习条件: aParts[3] || '',
      });
      continue;
    }

    const pParts = parsePipeLine(line, 'P|');
    if (pParts) {
      修行方法 = pParts[0] || '';
      修行资源 = pParts[1] || '';
      修行难点 = pParts[2] || '';
      突破要点 = pParts[3] || '';
      continue;
    }

    const rParts = parsePipeLine(line, 'R|');
    if (rParts) {
      使用限制 = rParts[0] || '';
      副作用 = rParts[1] || '';
      反噬风险 = rParts[2] || '';
    }
  }

  if (!体系名称 && 境界列表.length === 0) return null;
  return {
    体系名称,
    体系类型,
    力量来源,
    体系描述,
    境界列表,
    能力列表,
    修行: { 修行方法, 修行资源, 修行难点, 突破要点 },
    限制: { 使用限制, 副作用, 反噬风险 },
  };
}

export function parsePowerSystem(text: string) {
  return parseWithFallback(text, parsePowerSystemCompact);
}
