import { parsePipeLine, parseWithFallback } from './index';

export const skillSystemsPrompts = {
  buildSystem(
    context?: {
      世界观背景?: Record<string, string>;
      力量体系?: any[];
      已有功法名称?: string[];
      功法类型?: string;
      生成数量?: number;
    },
  ): string {
    const count = context?.生成数量 || 3;

    let prompt = `你是一位专业的小说功法设计师，擅长为各类虚构世界设计丰富、多样的功法技能体系。你需要严格按照指定格式输出，不添加任何多余内容。

## 格式规范

\`N|功法名称|功法大类|功法品级\` — 功法基本信息
  - 功法大类: 功法/武技/身法/魔法/咒术/符箓/阵法等
  - 功法品级: 入门/初级/中级/高级/精英/传说/神话
\`D|功法描述\` — 功法的整体描述
\`E|效果名称|效果类型|效果描述\` — 功法效果，2-4个
  - 效果类型: 攻击/防御/增益/减益/治疗/控制/位移/特殊
\`C|消耗类型|消耗数值|冷却时间\` — 使用消耗
\`R|使用限制|副作用\` — 限制与副作用

## 功法类型参考
功法, 武技, 炼体术, 身法, 魔法, 咒术, 符箓, 阵法, 火术, 水术, 雷术, 冰术, 风术, 土术, 神通, 幻术

## 输出示例

N|烈焰掌|武技|中级
D|以灵力凝聚火焰于掌心，近身攻击时附加灼烧效果
E|火焰掌击|攻击|以火焰包裹双掌进行攻击，附带灼烧
E|烈焰爆发|攻击|蓄力后释放大范围火焰冲击
E|灼烧之触|减益|被击中者持续受到灼烧伤害
C|灵力|中等|3秒
R|需火属性灵根|过度使用可能灼伤自身经脉

## 规则
1. 严格按照格式输出，不要输出任何其他内容
2. 每个功法以N行开始，D行紧随，然后是E、C、R行
3. 不同功法之间用空行分隔
4. 生成${count}个功法
5. 功法之间应有差异化，避免同质化`;

    if (context?.世界观背景) {
      prompt += '\n\n## 世界观背景';
      for (const [k, v] of Object.entries(context.世界观背景)) {
        prompt += `\n${k}: ${v}`;
      }
    }

    if (context?.力量体系?.length) {
      prompt += '\n\n## 关联力量体系';
      for (const sys of context.力量体系) {
        const name = typeof sys === 'string' ? sys : (sys as any).体系名称 || JSON.stringify(sys);
        prompt += `\n- ${name}`;
      }
    }

    if (context?.功法类型) {
      prompt += `\n\n## 指定功法类型\n请生成「${context.功法类型}」类型的功法`;
    }

    if (context?.已有功法名称?.length) {
      prompt += `\n\n## 绝对禁止重复\n以下功法名称已存在，绝对禁止重复生成:\n${context.已有功法名称.map(n => `- ${n}`).join('\n')}`;
    }

    return prompt;
  },

  buildUser(input: string, type?: string, count?: number): string {
    if (input) return input;
    const parts: string[] = ['请生成功法设定'];
    if (type) parts.push(`，类型为「${type}」`);
    if (count) parts.push(`，共${count}个`);
    parts.push('，包括功法效果、消耗和限制');
    return parts.join('');
  },
};

interface SkillData {
  功法名称: string;
  功法大类: string;
  功法品级: string;
  功法描述: string;
  效果列表: Array<{
    效果名称: string;
    效果类型: string;
    效果描述: string;
  }>;
  消耗: {
    消耗类型: string;
    消耗数值: string;
    冷却时间: string;
  };
  使用限制: string;
  副作用: string;
}

function parseSkillCompact(text: string) {
  const lines = text.split('\n');
  const skills: SkillData[] = [];
  let current: Partial<SkillData> | null = null;

  function pushCurrent() {
    if (current?.功法名称) {
      skills.push({
        功法名称: current.功法名称,
        功法大类: current.功法大类 || '',
        功法品级: current.功法品级 || '',
        功法描述: current.功法描述 || '',
        效果列表: current.效果列表 || [],
        消耗: current.消耗 || { 消耗类型: '', 消耗数值: '', 冷却时间: '' },
        使用限制: current.使用限制 || '',
        副作用: current.副作用 || '',
      });
    }
  }

  for (const line of lines) {
    const nParts = parsePipeLine(line, 'N|');
    if (nParts) {
      pushCurrent();
      current = {
        功法名称: nParts[0] || '',
        功法大类: nParts[1] || '',
        功法品级: nParts[2] || '',
        效果列表: [],
      };
      continue;
    }

    if (!current) continue;

    const dParts = parsePipeLine(line, 'D|');
    if (dParts) {
      current.功法描述 = dParts[0] || '';
      continue;
    }

    const eParts = parsePipeLine(line, 'E|');
    if (eParts) {
      current.效果列表!.push({
        效果名称: eParts[0] || '',
        效果类型: eParts[1] || '',
        效果描述: eParts[2] || '',
      });
      continue;
    }

    const cParts = parsePipeLine(line, 'C|');
    if (cParts) {
      current.消耗 = {
        消耗类型: cParts[0] || '',
        消耗数值: cParts[1] || '',
        冷却时间: cParts[2] || '',
      };
      continue;
    }

    const rParts = parsePipeLine(line, 'R|');
    if (rParts) {
      current.使用限制 = rParts[0] || '';
      current.副作用 = rParts[1] || '';
    }
  }

  pushCurrent();

  if (skills.length === 0) return null;
  return { 功法列表: skills, 总数: skills.length };
}

export function parseSkill(text: string) {
  return parseWithFallback(text, parseSkillCompact);
}
