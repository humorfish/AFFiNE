import { parsePipeLine, parseWithFallback } from './index';

export const factionsPrompts = {
  buildSystem(
    context?: {
      世界观背景?: Record<string, string>;
      已有势力名称?: string[];
      mode?: 'complete' | 'faction' | 'relation';
    },
  ): string {
    const mode = context?.mode || 'complete';

    let prompt = `你是一位专业的小说势力阵营设计师，擅长为各类虚构世界设计复杂、多层次的势力关系网络。你需要严格按照指定格式输出，不添加任何多余内容。

## 格式规范

### 势力信息
\`F|势力名称|势力类型|实力等级|立场|领袖|总部位置|描述|目标|特点|核心成员(逗号分隔)|控制区域(逗号分隔)\`

势力类型: 门派/国家/组织/家族/帮派/宗教/商会/其他
实力等级: 顶尖/一流/二流/三流/末流
立场: 正派/邪派/中立/灰色

### 势力关系
\`R|源势力名称|目标势力名称|关系类型|关系强度(0-100)|关系描述\`

关系类型: 同盟/敌对/中立/附属/竞争/从属/合作/战争
关系强度: 0-100的整数`;

    if (mode === 'complete') {
      prompt += `

## 输出示例

F|天剑宗|门派|顶尖|正派|剑无痕|剑峰山|以剑道闻名的古老门派，弟子众多，实力强盛|统一修仙界|剑阵传承，弟子善战|李剑心,王剑鸣,赵剑影|剑峰山脉,剑泉城,天剑坊
F|血影门|门派|一流|邪派|血无极|血雾谷|修炼血道功法的邪修门派，行事诡秘|获取远古血神传承|血道功法诡异，擅长暗杀|血影,血煞,血魂|血雾谷周边,地下黑市
R|天剑宗|血影门|敌对|85|百年前因争夺灵脉矿而结仇，双方弟子见面即战
R|天剑宗|万宝商会|合作|60|天剑宗为万宝商会提供护卫，万宝商会提供修炼资源`;
    } else if (mode === 'faction') {
      prompt += `

## 输出示例

F|天剑宗|门派|顶尖|正派|剑无痕|剑峰山|以剑道闻名的古老门派|统一修仙界|剑阵传承|李剑心,王剑鸣|剑峰山脉`;
    } else {
      prompt += `

## 输出示例

R|天剑宗|血影门|敌对|85|百年前因争夺灵脉矿而结仇`;
    }

    prompt += `

## 规则
1. 严格按照格式输出，不要输出任何其他内容
2. ${mode === 'relation' ? '只输出R行' : mode === 'faction' ? '只输出F行' : 'F行在前，R行在后'}
3. 势力名称应简洁有力，体现势力特征
4. 关系强度要符合逻辑，同盟/合作偏高，敌对/战争偏高，中立偏低`;

    if (context?.世界观背景) {
      prompt += '\n\n## 世界观背景';
      for (const [k, v] of Object.entries(context.世界观背景)) {
        prompt += `\n${k}: ${v}`;
      }
    }

    if (context?.已有势力名称?.length) {
      prompt += `\n\n## 绝对禁止重复\n以下势力名称已存在，绝对禁止重复生成:\n${context.已有势力名称.map(n => `- ${n}`).join('\n')}`;
    }

    return prompt;
  },

  buildUser(input: string): string {
    return input || '请根据世界观信息，生成完整的势力阵营设定，包括势力信息和势力之间的关系';
  },
};

function parseFactionsCompact(text: string) {
  const lines = text.split('\n');
  const 势力列表: Array<{
    势力名称: string;
    势力类型: string;
    实力等级: string;
    立场: string;
    领袖: string;
    总部位置: string;
    描述: string;
    目标: string;
    特点: string;
    核心成员: string[];
    控制区域: string[];
  }> = [];
  const 势力关系: Array<{
    源势力名称: string;
    目标势力名称: string;
    关系类型: string;
    关系强度: number;
    关系描述: string;
  }> = [];

  for (const line of lines) {
    const fParts = parsePipeLine(line, 'F|');
    if (fParts && fParts.length >= 3) {
      势力列表.push({
        势力名称: fParts[0] || '',
        势力类型: fParts[1] || '',
        实力等级: fParts[2] || '',
        立场: fParts[3] || '',
        领袖: fParts[4] || '',
        总部位置: fParts[5] || '',
        描述: fParts[6] || '',
        目标: fParts[7] || '',
        特点: fParts[8] || '',
        核心成员: fParts[9] ? fParts[9].split(',').map(s => s.trim()) : [],
        控制区域: fParts[10] ? fParts[10].split(',').map(s => s.trim()) : [],
      });
      continue;
    }

    const rParts = parsePipeLine(line, 'R|');
    if (rParts && rParts.length >= 3) {
      势力关系.push({
        源势力名称: rParts[0] || '',
        目标势力名称: rParts[1] || '',
        关系类型: rParts[2] || '',
        关系强度: rParts[3] ? parseInt(rParts[3], 10) : 0,
        关系描述: rParts[4] || '',
      });
    }
  }

  if (势力列表.length === 0 && 势力关系.length === 0) return null;
  return { 势力列表, 势力关系 };
}

export function parseFactions(text: string) {
  return parseWithFallback(text, parseFactionsCompact);
}
