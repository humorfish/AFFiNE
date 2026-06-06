import { parsePipeLine, parseWithFallback } from './index';

export const currencyPrompts = {
  buildSystem(
    context?: {
      世界名称?: string;
      世界类型?: string;
      现有货币名称?: string[];
    },
  ): string {
    let prompt = `你是一位专业的小说货币体系设计师，擅长为各类虚构世界设计完整、自洽且富有特色的货币系统。你需要严格按照指定格式输出，不添加任何多余内容。

## 格式规范

每行以一种前缀开头，不同类型的信息分行输出：

\`C|核心理念描述\` — 货币体系的核心理念，10-60字
\`M|货币名称|货币类型|货币定义\` — 货币列表，至少3-5种货币
  - 货币类型: 基础货币/高级货币/特殊货币
  - 货币定义: 简要说明货币的外观、材质、价值来源
\`I|其他补充信息\` — 可选，货币体系的其他补充说明

## 输出示例

C|以天地灵气凝聚的灵石为根基，构建层次分明的修仙货币体系
M|下品灵石|基础货币|灰白色半透明晶体，含有微量灵气，凡人亦可使用
M|中品灵石|基础货币|淡蓝色晶体，灵气充沛，修士日常交易常用
M|上品灵石|高级货币|深蓝色晶体，灵气浓郁，高阶修士间流通
M|极品灵石|高级货币|紫色晶体，灵气近乎液态，极为稀有，大宗交易使用
M|仙晶|特殊货币|金色透明晶体，蕴含仙道法则，传说中仙界货币
I|100下品灵石=1中品灵石，100中品灵石=1上品灵石，货币可在灵气浓郁之地自行凝聚

## 规则
1. 严格按照格式输出，不要输出任何其他内容
2. C行必须在最前面
3. M行至少3-5条
4. 货币之间应有清晰的层级或兑换关系`;

    if (context?.世界名称 || context?.世界类型) {
      prompt += `\n\n## 世界观背景`;
      if (context.世界名称) prompt += `\n世界名称: ${context.世界名称}`;
      if (context.世界类型) prompt += `\n世界类型: ${context.世界类型}`;
    }

    if (context?.现有货币名称?.length) {
      prompt += `\n\n## 绝对禁止重复\n以下货币名称已存在，绝对禁止重复生成:\n${context.现有货币名称.map(n => `- ${n}`).join('\n')}`;
    }

    return prompt;
  },

  buildUser(input: string): string {
    return input || '请根据世界观信息，生成完整的货币体系设定，包括多种不同等级的货币';
  },
};

function parseCurrencyCompact(text: string) {
  const lines = text.split('\n');
  let 核心理念 = '';
  const 货币列表: Array<{
    货币名称: string;
    货币类型: string;
    货币定义: string;
  }> = [];
  let 其他信息 = '';

  for (const line of lines) {
    const cParts = parsePipeLine(line, 'C|');
    if (cParts) {
      核心理念 = cParts[0] || '';
      continue;
    }

    const mParts = parsePipeLine(line, 'M|');
    if (mParts) {
      货币列表.push({
        货币名称: mParts[0] || '',
        货币类型: mParts[1] || '',
        货币定义: mParts[2] || '',
      });
      continue;
    }

    const iParts = parsePipeLine(line, 'I|');
    if (iParts) {
      其他信息 = iParts[0] || '';
      continue;
    }
  }

  if (!核心理念 && 货币列表.length === 0) return null;
  return { 核心理念, 货币列表, 其他信息 };
}

export function parseCurrency(text: string) {
  return parseWithFallback(text, parseCurrencyCompact);
}
