import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generateLLM, generateValidated, parseAIJSON } from './panel-shared';
import { z } from 'zod';
import { API_BASE, getAuthHeaders } from '../useWorldApi';

// ── Source-derived prompt & pipe parsers (源码 lines 38628+) ──────────

// ── Context types for dynamic prompt ──────────────────────────────

interface 角色生成上下文 {
  世界观?: {
    世界名称?: string;
    世界类型?: string;
    时代背景?: string;
    核心规则?: string;
    社会结构?: string;
    特殊元素?: string;
  };
  力量体系?: Array<{
    id: number;
    名称?: string;
    类型?: string;
    力量来源?: string;
    描述?: string;
  }>;
  力量境界?: Array<{
    体系ID?: number;
    名称?: string;
    战力系数?: number;
    境界等级?: number;
    提升条件?: string;
    能力表现?: string;
    描述?: string;
  }>;
  功法体系?: Array<{
    名称?: string;
    品级?: string;
    大类?: string;
    效果分类?: string;
  }>;
  势力阵营?: Array<{
    势力名称?: string;
    名称?: string;
    势力类型?: string;
    类型?: string;
    立场?: string;
    势力描述?: string;
    描述?: string;
  }>;
  特殊设定?: Array<{
    名称?: string;
    类型?: string;
    描述?: string;
    简介?: string;
  }>;
  故事核心?: {
    核心主题?: string;
    核心冲突?: string;
  };
  现有角色?: Array<{
    姓名?: string;
    类型?: string;
    身份?: string;
    人生经历?: Array<{ 章节?: string }>;
  }>;
  大纲章节?: Array<{
    节点类型?: string;
    标题?: string;
  }>;
  情节脉络?: Array<{
    模式?: string;
    幕序号?: number;
    幕名称?: string;
    章节范围?: string;
    内容概要?: string;
    核心事件?: string;
    角色发展?: string;
    情感基调?: string;
    冲突升级?: string;
  }>;
}

interface 角色生成选项 {
  生成数量?: number;
  势力绑定方式?: '无势力' | '绑定现有势力' | 'AI随机绑定';
  选中势力?: {
    势力名称?: string;
    势力类型?: string;
    立场?: string;
    势力描述?: string;
  };
  力量体系ID?: number;
  章节范围?: {
    开始章节名?: string;
    结束章节名?: string;
    开始章节编号?: number;
    结束章节编号?: number;
  };
  避免章节冲突?: boolean;
  生成关系?: boolean;
}

/**
 * Build dynamic character generation prompt.
 * 1:1 conversion of Vue `et(上下文, 选项)` — line 38621-38935
 */
function buildCharacterPrompt(
  上下文: 角色生成上下文 | null,
  选项?: 角色生成选项
): string {
  const Ue = 选项?.生成数量 || 1;
  const Be = 选项?.势力绑定方式 || '无势力';
  const we = 选项?.选中势力 || null;
  const He = 选项?.章节范围 || null;
  const be = 选项?.避免章节冲突 || false;

  let ce = `你是一位专业的小说角色设计师。请根据以下世界观设定，创建${Ue > 1 ? Ue + '个' : '一个'}符合该世界观的角色。

# 世界观背景
`;

  // 1. 世界观背景 (6 fields)
  if (上下文?.世界观) {
    ce += `世界名称：${上下文.世界观.世界名称 || '未设定'}
世界类型：${上下文.世界观.世界类型 || '未设定'}
时代背景：${上下文.世界观.时代背景 || '未设定'}
核心规则：${上下文.世界观.核心规则 || '未设定'}
社会结构：${上下文.世界观.社会结构 || '未设定'}
特殊元素：${上下文.世界观.特殊元素 || '未设定'}
`;
  } else {
    ce += `（世界观未设定，请创建一个通用的玄幻/修仙角色）
`;
  }

  // 2. 力量体系 (filtered by ID if specified)
  const Je = 选项?.力量体系ID || null;
  const dt = Je
    ? (上下文?.力量体系 || []).filter(Tt => Tt.id === Je)
    : 上下文?.力量体系 || [];
  const At = Je
    ? (上下文?.力量境界 || []).filter(Tt => Tt.体系ID === Je)
    : 上下文?.力量境界 || [];

  if (dt.length > 0) {
    ce += `
# 力量体系
`;
    dt.forEach(Tt => {
      ce += `
## ${Tt.名称}
`;
      ce += `- 体系类型：${Tt.类型 || '未分类'}
`;
      if (Tt.力量来源)
        ce += `- 力量来源：${Tt.力量来源}
`;
      if (Tt.描述)
        ce += `- 体系描述：${Tt.描述}
`;
    });
  }

  // 3. 境界等级 (filtered by system ID)
  if (At.length > 0) {
    ce += `
# 境界等级（从低到高）
`;
    At.forEach(Tt => {
      ce += `- ${Tt.名称}（LV${Tt.战力系数 ?? Tt.境界等级 ?? '1.00'}）`;
      if (Tt.提升条件) ce += `  提升条件：${Tt.提升条件}`;
      if (Tt.能力表现) ce += `  能力表现：${Tt.能力表现}`;
      if (Tt.描述) ce += `  描述：${Tt.描述}`;
      ce += `
`;
    });
    ce += `
注意：角色的「境界」字段必须从上述境界等级中选取，不可自创。
`;
  }

  // 4. 功法体系 (max 5, reference only)
  if ((上下文?.功法体系?.length ?? 0) > 0) {
    ce += `
# 功法体系（供参考）
`;
    上下文!.功法体系!.slice(0, 5).forEach(Tt => {
      ce += `- ${Tt.名称}（${Tt.品级 || ''}/${Tt.大类 || Tt.效果分类 || ''}）
`;
    });
  }

  // 5. 势力阵营 (max 8)
  if ((上下文?.势力阵营?.length ?? 0) > 0) {
    ce += `
# 主要势力
`;
    上下文!.势力阵营!.slice(0, 8).forEach(Tt => {
      ce += `- ${Tt.势力名称 || Tt.名称}（${Tt.势力类型 || Tt.类型 || ''}，${Tt.立场 || ''}）：${Tt.势力描述 || Tt.描述 || ''}
`;
    });
  }

  // 6. 势力归属要求 (3 binding modes)
  if (Be === '绑定现有势力' && we) {
    ce += `
# 势力归属要求
生成的角色必须属于以下势力：
势力名称：${we.势力名称}
势力类型：${we.势力类型 || ''}
势力立场：${we.立场 || ''}
势力描述：${we.势力描述 || ''}
请确保角色的身份、境界、性格等与该势力的特点相符。
`;
  } else if (Be === 'AI随机绑定' && (上下文?.势力阵营?.length ?? 0) > 0) {
    ce += `
# 势力归属要求
请根据角色的特点，从上述势力中为${Ue > 1 ? '每个' : '该'}角色选择一个合适的势力归属。
${Ue > 1 ? '不同角色可以属于不同的势力，以增加多样性。' : ''}
在角色数据中添加"所属势力"字段，填写势力名称。
`;
  }

  // 7. 特殊设定/金手指
  if ((上下文?.特殊设定?.length ?? 0) > 0) {
    ce += `
# 特殊设定（金手指）
`;
    上下文!.特殊设定!.forEach(Tt => {
      ce += `- ${Tt.名称}（${Tt.类型 || ''}）：${Tt.描述 || Tt.简介 || ''}
`;
    });
  }

  // 8. 故事核心
  if (上下文?.故事核心) {
    ce += `
# 故事核心
`;
    if (上下文.故事核心.核心主题)
      ce += `核心主题：${上下文.故事核心.核心主题}
`;
    if (上下文.故事核心.核心冲突)
      ce += `核心冲突：${上下文.故事核心.核心冲突}
`;
  }

  // 9. 现有角色 (严禁同名)
  if ((上下文?.现有角色?.length ?? 0) > 0) {
    ce += `
# 现有角色（严禁创建与以下角色同名的角色！）
`;
    上下文!.现有角色!.forEach(Tt => {
      let Ht = `- ${Tt.姓名}（${Tt.类型}）- ${Tt.身份 || '未知身份'}`;
      if (be && Array.isArray(Tt.人生经历) && Tt.人生经历.length > 0) {
        const es = Tt.人生经历.map(vs => vs.章节).filter(Boolean);
        if (es.length > 0) Ht += ` | 出场章节：${es.join('、')}`;
      }
      ce +=
        Ht +
        `
`;
    });
    ce += `
【重要约束】以上角色已存在于项目中，你生成的新角色姓名不得与上述任何角色相同或高度相似。违反此规则的角色将被系统自动拒绝。
`;

    // 10. 章节出场角色分布 (optional, when 避免章节冲突=true)
    if (be) {
      const Tt = new Map<string, string[]>();
      上下文!.现有角色!.forEach(Ht => {
        if (Array.isArray(Ht.人生经历)) {
          Ht.人生经历.forEach(es => {
            if (es.章节) {
              if (!Tt.has(es.章节)) Tt.set(es.章节, []);
              Tt.get(es.章节)!.push(Ht.姓名!);
            }
          });
        }
      });
      if (Tt.size > 0) {
        ce += `
# 章节出场角色分布（避免冲突）
`;
        ce += `以下章节已有角色出场，请合理安排新角色的出场时机：
`;
        [...Tt.entries()]
          .sort((es, vs) => {
            const Qs = parseInt((es[0].match(/第(\d+)[章节]/) || [])[1]) || 0;
            const Ws = parseInt((vs[0].match(/第(\d+)[章节]/) || [])[1]) || 0;
            return Qs - Ws;
          })
          .forEach(([es, vs]) => {
            ce += `- ${es}：已有 ${vs.join('、')} 出场
`;
          });
        ce += `
【章节冲突约束】
`;
        ce += `1. 新角色的人生经历应优先安排在没有或较少角色出场的章节，使角色分布更均匀
`;
        ce += `2. 同一章节出场角色总数不宜超过3个，除非剧情确实需要多角色交汇
`;
        ce += `3. 如果指定的章节范围内所有章节都有角色出场，可根据剧情需要选择合适位置，但需注明原因
`;
      }
    }
  }

  // 11. 角色关系生成要求 (optional)
  if (选项?.生成关系 !== false && (上下文?.现有角色?.length ?? 0) > 0) {
    ce += `
# 角色关系生成要求
请为新角色设计与现有角色之间的关系。关系类型可以是：师徒、同门、敌对、竞争、暗恋、主仆、朋友、家人、结盟、宿敌、经济、告密等。
要求：
1. 只能与上方「现有角色」列表中的角色建立关系，目标角色名称必须严格匹配
2. 每个新角色至少设计1条关系，最多3条
3. 关系要符合世界观和角色设定，不要强行拼凑
`;
  }

  // 12. 大纲章节结构
  if ((上下文?.大纲章节?.length ?? 0) > 0) {
    ce += `
# 故事章节结构
`;
    上下文!.大纲章节!.forEach(Tt => {
      if (Tt.节点类型 === 'volume') {
        ce += `
【${Tt.标题}】
`;
      } else if (Tt.节点类型 === 'chapter') {
        ce += `- ${Tt.标题}
`;
      }
    });
  }

  // 13. 情节脉络
  if ((上下文?.情节脉络?.length ?? 0) > 0) {
    const Tt = 上下文!.情节脉络![0].模式 || '未知模式';
    ce += `
# 情节脉络（${Tt}，共${上下文!.情节脉络!.length}幕）
`;
    上下文!.情节脉络!.forEach(Ht => {
      ce += `第${Ht.幕序号}幕：${Ht.幕名称 || ''}${Ht.章节范围 ? `（${Ht.章节范围}）` : ''}
`;
      if (Ht.内容概要)
        ce += `  内容概要：${Ht.内容概要}
`;
      if (Ht.核心事件)
        ce += `  核心事件：${Ht.核心事件}
`;
      if (Ht.角色发展)
        ce += `  角色发展：${Ht.角色发展}
`;
      if (Ht.情感基调)
        ce += `  情感基调：${Ht.情感基调}
`;
      if (Ht.冲突升级)
        ce += `  冲突升级：${Ht.冲突升级}
`;
    });
  }

  // 14. 章节范围约束 (optional)
  if (He) {
    ce += `
# 章节范围约束
`;
    ce += `角色的人生经历必须限制在以下章节范围内：
`;
    ce += `- 开始章节：${He.开始章节名}
`;
    ce += `- 结束章节：${He.结束章节名}
`;
    if ((He.开始章节编号 ?? 0) > 0 && (He.结束章节编号 ?? 0) > 0) {
      ce += `- 章节编号范围：第${He.开始章节编号}章 ~ 第${He.结束章节编号}章
`;
    }
    ce += `【重要约束】
`;
    ce += `1. 角色人生经历中的"章节"字段只能填写上述范围内的章节名称，不得超出此范围
`;
    ce += `2. 第一条人生经历必须从"${He.开始章节名}"开始，确保角色从指定的起始章节登场
`;
    ce += `3. 人生经历应按章节顺序排列，从开始章节到结束章节合理安排角色的发展历程
`;
  }

  // 15. Output format
  ce += `
【输出格式】（极简格式，节省token）
R|姓名|类型|性别|年龄
I|身份|境界|武器
A|外貌描述（10-30字）
S|简介（20-50字）
C|性格表层|性格中层|性格内核
E|章节名|经历事件（10-30字）
M|核心意义（20-50字）
F|结局（10-30字）
L|目标角色|关系类型|关系描述

【格式说明】
- R: 基本信息（第1行，必填）
  - 类型：${角色类型选项.join('/')}
  - 性别：男/女
- I: 身份境界武器（必填）
- A: 外貌描述（10-30字）
- S: 简介（20-50字）
- C: 性格三层（用|分隔）
- E: 人生经历（可多行，每行一个经历）
- M: 核心意义（20-50字）
- F: 结局（10-30字）
- L: 角色关系（可多行，可选）

【输出示例】
R|林凡|主角|男|十八岁
I|青云宗外门弟子|炼气三层|青锋剑
A|清秀少年，眉宇间透着坚毅
S|出身贫寒的少年，意外获得神秘传承，踏上修仙之路
C|温和谦逊|坚韧执着|心怀天下
E|第1章 初入宗门|被检测出废灵根，饱受欺凌
E|第5章 奇遇|在山洞中获得上古传承
M|代表平凡少年的逆袭，诠释努力可以改变命运
F|成为一代宗师，开创全新修炼体系
L|苏婉儿|暗恋|心中暗暗倾慕却不敢表白

【核心要求】
1. 角色设定要符合世界观逻辑
2. 性格三层要有递进关系
3. 人生经历要与大纲章节对应
4. ⚠️ 角色姓名绝对不能与已有角色重复

【重要规则】
1. 严格按格式输出，每行一个项
2. R行必须在每个角色开始
3. 不要输出任何其他内容
4. ⚠️ 在输出前检查角色姓名是否与已有名称重复`;

  return ce;
}

interface PipeExperience {
  章节名: string;
  经历事件: string;
}
interface PipeRelation {
  目标角色: string;
  关系类型: string;
  关系描述: string;
}
interface PipeCharacterData {
  姓名: string;
  类型: string;
  性别: string;
  年龄: string;
  身份: string;
  境界: string;
  武器: string;
  外貌: string;
  简介: string;
  性格表层: string;
  性格中层: string;
  性格内核: string;
  经历列表: PipeExperience[];
  核心意义: string;
  结局: string;
  关系列表: PipeRelation[];
}

function parseCharacterPipe(text: string): PipeCharacterData[] {
  const results: PipeCharacterData[] = [];
  let current: PipeCharacterData | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('R|')) {
      const parts = line.split('|');
      current = {
        姓名: (parts[1] || '').trim(),
        类型: (parts[2] || '').trim(),
        性别: (parts[3] || '').trim(),
        年龄: (parts[4] || '').trim(),
        身份: '',
        境界: '',
        武器: '',
        外貌: '',
        简介: '',
        性格表层: '',
        性格中层: '',
        性格内核: '',
        经历列表: [],
        核心意义: '',
        结局: '',
        关系列表: [],
      };
      results.push(current);
    } else if (line.startsWith('I|') && current) {
      const parts = line.split('|');
      current.身份 = (parts[1] || '').trim();
      current.境界 = (parts[2] || '').trim();
      current.武器 = (parts[3] || '').trim();
    } else if (line.startsWith('A|') && current) {
      current.外貌 = line.slice(2).trim();
    } else if (line.startsWith('S|') && current) {
      current.简介 = line.slice(2).trim();
    } else if (line.startsWith('C|') && current) {
      const parts = line.split('|');
      current.性格表层 = (parts[1] || '').trim();
      current.性格中层 = (parts[2] || '').trim();
      current.性格内核 = (parts[3] || '').trim();
    } else if (line.startsWith('E|') && current) {
      const parts = line.split('|');
      current.经历列表.push({
        章节名: (parts[1] || '').trim(),
        经历事件: (parts[2] || '').trim(),
      });
    } else if (line.startsWith('M|') && current) {
      current.核心意义 = line.slice(2).trim();
    } else if (line.startsWith('F|') && current) {
      current.结局 = line.slice(2).trim();
    } else if (line.startsWith('L|') && current) {
      const parts = line.split('|');
      current.关系列表.push({
        目标角色: (parts[1] || '').trim(),
        关系类型: (parts[2] || '').trim(),
        关系描述: (parts[3] || '').trim(),
      });
    }
  }
  return results;
}

function parseCharacterResponse(text: string): 角色数据 | null {
  // Try pipe format first
  const pipeResults = parseCharacterPipe(text);
  if (pipeResults.length > 0) {
    const s = pipeResults[0];
    return {
      id: Date.now(),
      姓名: s.姓名 || '',
      角色类型: s.类型 || '配角',
      性别: s.性别 || '男',
      年龄: s.年龄 || '',
      身份: s.身份 || '',
      简介: s.简介 || '',
      外貌: s.外貌 || '',
      境界: s.境界 || '',
      武器: s.武器 || '',
      表层性格: s.性格表层 || '',
      中层性格: s.性格中层 || '',
      内核性格: s.性格内核 || '',
      核心意义: s.核心意义 || '',
      结局: s.结局 || '',
      存续状态: '活跃',
    };
  }
  // JSON fallback
  const { data: parsed } = parseAIJSON<Record<string, any>>(text);
  if (!parsed) return null;
  const merged = empty角色();
  if (parsed.姓名) merged.姓名 = parsed.姓名;
  if (parsed.角色类型) merged.角色类型 = parsed.角色类型;
  if (parsed.性别) merged.性别 = parsed.性别;
  if (parsed.年龄) merged.年龄 = parsed.年龄;
  if (parsed.性格) {
    merged.表层性格 = parsed.性格;
  }
  if (parsed.表层性格) merged.表层性格 = parsed.表层性格;
  if (parsed.中层性格) merged.中层性格 = parsed.中层性格;
  if (parsed.内核性格) merged.内核性格 = parsed.内核性格;
  if (parsed.身份) merged.身份 = parsed.身份;
  if (parsed.简介) merged.简介 = parsed.简介;
  if (parsed.外貌) merged.外貌 = parsed.外貌;
  if (parsed.境界) merged.境界 = parsed.境界;
  if (parsed.武器) merged.武器 = parsed.武器;
  if (parsed.核心意义) merged.核心意义 = parsed.核心意义;
  if (parsed.结局) merged.结局 = parsed.结局;
  if (parsed.存续状态) merged.存续状态 = parsed.存续状态;
  return merged;
}

// ── Source-derived data ────────────────────────────────────────

const characterMgmtSchema = z.union([z.record(z.any()), z.array(z.any())]);

const 角色类型选项 = [
  '主角',
  '女主',
  '双男主',
  '反派',
  '女反派',
  '宿敌',
  '隐藏BOSS',
  '导师',
  '配角',
  '挚友',
  '知己',
  '对手',
  '盟友',
  '神秘人',
  '穿越者',
  '重生者',
  '灵兽',
  '神兽',
  'NPC',
  '系统',
  '旁白',
  '群像',
  '龙套',
  '路人',
];

const 类型样式: Record<string, string> = {
  主角: 'bg-blue-500/20 text-blue-400',
  女主: 'bg-pink-500/20 text-pink-400',
  双男主: 'bg-indigo-500/20 text-indigo-400',
  反派: 'bg-orange-500/20 text-orange-400',
  女反派: 'bg-rose-500/20 text-rose-400',
  宿敌: 'bg-red-800/20 text-red-300',
  隐藏BOSS: 'bg-purple-800/20 text-purple-300',
  导师: 'bg-green-500/20 text-green-400',
  配角: 'bg-gray-500/20 text-gray-400',
  挚友: 'bg-amber-500/20 text-amber-400',
  知己: 'bg-orange-400/20 text-orange-300',
  对手: 'bg-violet-500/20 text-violet-400',
  盟友: 'bg-teal-500/20 text-teal-400',
  神秘人: 'bg-indigo-500/20 text-indigo-300',
  穿越者: 'bg-fuchsia-500/20 text-fuchsia-400',
  重生者: 'bg-emerald-500/20 text-emerald-400',
  灵兽: 'bg-lime-500/20 text-lime-400',
  神兽: 'bg-yellow-400/20 text-yellow-400',
  NPC: 'bg-sky-500/20 text-sky-400',
  系统: 'bg-cyan-400/20 text-cyan-400',
  旁白: 'bg-slate-400/20 text-slate-400',
  群像: 'bg-indigo-400/20 text-purple-400',
  龙套: 'bg-stone-500/20 text-stone-400',
  路人: 'bg-zinc-500/20 text-zinc-400',
};

const 性别选项 = ['男', '女', '其他'];

// ── Interfaces ─────────────────────────────────────────────────

interface 人生经历项 {
  章节?: string;
  事件?: string;
}

interface 角色关系项 {
  目标角色?: string;
  关系类型?: string;
  关系描述?: string;
}

interface 角色数据 {
  id: number;
  姓名: string;
  角色类型: string;
  性别: string;
  年龄: string;
  身份: string;
  简介: string;
  外貌: string;
  境界: string;
  武器: string;
  表层性格: string;
  中层性格: string;
  内核性格: string;
  核心意义: string;
  结局: string;
  存续状态: string;
  // Vue detail API additional fields
  人生经历?: 人生经历项[];
  角色关系?: 角色关系项[];
  所属势力?: string;
  其他信息?: string;
  力量体系ID?: number | null;
  初始境界ID?: number | null;
  当前境界ID?: number | null;
  初始战力系数?: number | null;
  当前战力系数?: number | null;
  头像颜色?: string;
  颜色?: string;
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ── Helpers ────────────────────────────────────────────────────

const empty角色 = (): 角色数据 => ({
  id: Date.now(),
  姓名: '',
  角色类型: '配角',
  性别: '男',
  年龄: '',
  身份: '',
  简介: '',
  外貌: '',
  境界: '',
  武器: '',
  表层性格: '',
  中层性格: '',
  内核性格: '',
  核心意义: '',
  结局: '',
  存续状态: '活跃',
  人生经历: [],
  角色关系: [],
  所属势力: '',
  其他信息: '',
  力量体系ID: null,
  初始境界ID: null,
  当前境界ID: null,
  初始战力系数: null,
  当前战力系数: null,
});

// ── Main Component ─────────────────────────────────────────────

export const CharacterMgmtPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  const [角色列表, set角色列表] = useState<角色数据[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [formData, setFormData] = useState<角色数据>(empty角色());
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // AI states
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAIDialog, setShowAIDialog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Data fetching ──
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/characters/project/${projectId}`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data))
          set角色列表(result.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // ── CRUD helpers ──
  const updateField = useCallback(
    <K extends keyof 角色数据>(key: K, value: 角色数据[K]) => {
      setFormData(prev => ({ ...prev, [key]: value }));
    },
    []
  );

  const startEdit = async (item: 角色数据) => {
    setFormData({ ...item });
    setView('detail');
    // Fetch full detail from API — Vue uses GET /characters/{id}
    if (item.id) {
      try {
        const res = await fetch(`${API_BASE}/api/characters/${item.id}`, {
          headers: getAuthHeaders(),
        });
        const result = await res.json();
        if (result.success && result.data) {
          setFormData(prev => ({ ...prev, ...result.data }));
        }
      } catch {}
    }
  };

  const startCreate = () => {
    setFormData(empty角色());
    setView('detail');
  };

  const handleSave = async () => {
    if (!projectId || !formData.姓名.trim()) return;
    setSaving(true);
    try {
      let res: Response;
      if (formData.id) {
        // Update existing: PUT /api/characters/:id
        res = await fetch(`${API_BASE}/api/characters/${formData.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(formData),
        });
      } else {
        // Create new: POST /api/characters/project/:projectId
        res = await fetch(`${API_BASE}/api/characters/project/${projectId}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(formData),
        });
      }
      const result = await res.json();
      const saved =
        result.success && result.data
          ? result.data
          : { ...formData, id: formData.id || Date.now() };
      if (formData.id && 角色列表.some(d => d.id === formData.id)) {
        set角色列表(prev => prev.map(d => (d.id === formData.id ? saved : d)));
      } else {
        set角色列表(prev => [...prev, saved]);
        setFormData(saved);
      }
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      return;
    }
    setDeleteConfirm(null);
    try {
      await fetch(`${API_BASE}/api/characters/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      set角色列表(prev => prev.filter(d => d.id !== id));
    } catch {}
  };

  // ── AI generate ──
  const handleAIGenerate = async () => {
    if (aiGenerating) return;
    setAiGenerating(true);
    abortRef.current = new AbortController();
    try {
      // Fetch context from API — Vue calls GET /characters/project/{id}/context
      let 上下文: 角色生成上下文 | null = null;
      try {
        const ctxRes = await fetch(
          `${API_BASE}/api/characters/project/${projectId}/context`,
          { headers: getAuthHeaders() }
        );
        const ctxData = await ctxRes.json();
        if (ctxData.success && ctxData.data) 上下文 = ctxData.data;
      } catch {}

      const systemPrompt = buildCharacterPrompt(上下文, {
        生成数量: 1,
        势力绑定方式: '无势力',
        避免章节冲突: false,
        生成关系: true,
      });
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: aiPrompt || '请根据世界观信息，生成完整的角色设定',
        },
      ];
      const result = await generateValidated({
        schema: characterMgmtSchema,
        generate: attempt =>
          generateLLM({
            messages,
            temperature: Math.min(1.0, 0.85 + attempt * 0.05),
            max_tokens: 4096,
            frequency_penalty: 0.5,
            presence_penalty: 0.4,
            onChunk: () => {},
            signal: abortRef.current!.signal,
          }),
        parseResponse: text => {
          // Parse all characters from pipe output (supports multi-character)
          const pipeResults = parseCharacterPipe(text);
          if (pipeResults.length > 0) {
            return pipeResults.map(s => {
              return {
                id: Date.now() + Math.random(),
                姓名: s.姓名 || '',
                角色类型: s.类型 || '配角',
                性别: s.性别 || '男',
                年龄: s.年龄 || '',
                身份: s.身份 || '',
                简介: s.简介 || '',
                外貌: s.外貌 || '',
                境界: s.境界 || '',
                武器: s.武器 || '',
                表层性格: s.性格表层 || '',
                中层性格: s.性格中层 || '',
                内核性格: s.性格内核 || '',
                核心意义: s.核心意义 || '',
                结局: s.结局 || '',
                存续状态: '活跃',
              };
            });
          }
          // Fallback: single character
          const single = parseCharacterResponse(text);
          return single ? [single] : null;
        },
        maxRetries: 3,
      });

      const parsed = (result?.data ?? null) as unknown as
        | 角色数据[]
        | 角色数据
        | null;
      if (parsed) {
        // Handle both single character and multi-character results
        const characters = Array.isArray(parsed) ? parsed : [parsed];
        // POST each character to API (matching Vue adopt flow)
        if (projectId) {
          for (const char of characters) {
            try {
              const res = await fetch(
                `${API_BASE}/api/characters/project/${projectId}`,
                {
                  method: 'POST',
                  headers: getAuthHeaders(),
                  body: JSON.stringify(char),
                }
              );
              const saved = await res.json();
              if (saved.success && saved.data) {
                set角色列表(prev => [...prev, saved.data]);
              }
            } catch {}
          }
        }
        // Set first character to form for editing
        if (characters.length > 0) {
          setFormData(characters[0]);
          setView('detail');
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setAiGenerating(false);
    }
  };

  // ── Filtered list ──
  const filtered = 角色列表.filter(d => {
    if (search && !d.姓名.includes(search) && !d.简介.includes(search))
      return false;
    if (filterType && d.角色类型 !== filterType) return false;
    return true;
  });

  // ── List View ────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="v-character-panel">
        <div
          className="fixed top-0 bottom-0 z-40 flex"
          style={{ left: leftOffset }}
        >
          <div
            className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
            style={{ width: 560 }}
          >
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-gradient-to-r from-purple-900/30 to-violet-900/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/20">
                    <i className="text-lg text-purple-400 ri-user-settings-line" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">角色管理</h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      共 {角色列表.length} 个角色
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="p-1.5 hover:bg-purple-500/20 rounded-lg transition-colors text-purple-400"
                    title="AI生成角色"
                    onClick={() => {
                      setFormData(empty角色());
                      setShowAIDialog(true);
                    }}
                    disabled={aiGenerating}
                  >
                    <i
                      className={
                        aiGenerating
                          ? 'ri-loader-4-line animate-spin'
                          : 'ri-magic-line'
                      }
                    />
                  </button>
                  <button
                    className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
                    onClick={startCreate}
                  >
                    <i className="ri-add-line" /> 新建
                  </button>
                  <button
                    className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                    onClick={onClose}
                  >
                    <i className="text-lg ri-close-line" />
                  </button>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="搜索角色..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                  />
                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                  >
                    <option value="">全部类型</option>
                    {角色类型选项.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                {loading ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    加载中...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无角色，点击新建或AI生成
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map(item => (
                      <div
                        key={item.id}
                        className="p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg hover:border-purple-500/50 cursor-pointer transition-colors group"
                        onClick={() => startEdit(item)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-500/20 shrink-0 text-purple-400 font-bold">
                            {item.姓名.charAt(0) || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium truncate">
                              {item.姓名 || '未命名'}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${类型样式[item.角色类型] || 'bg-gray-500/20 text-gray-400'}`}
                              >
                                {item.角色类型}
                              </span>
                              {item.身份 && (
                                <span className="text-xs text-[var(--text-secondary)]">
                                  {item.身份}
                                </span>
                              )}
                            </div>
                            {item.简介 && (
                              <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-2">
                                {item.简介}
                              </p>
                            )}
                          </div>
                          <button
                            className="p-1 text-red-400 transition-all rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20"
                            title={
                              deleteConfirm === item.id
                                ? '再次点击确认删除'
                                : '删除'
                            }
                            onClick={e => {
                              e.stopPropagation();
                              handleDelete(item.id);
                            }}
                          >
                            <i
                              className={`text-sm ${deleteConfirm === item.id ? 'ri-check-line text-red-300' : 'ri-delete-bin-line'}`}
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-purple-500/50 active:bg-purple-500 shrink-0" />
          <div
            className="fixed top-0 bottom-0 right-0 transition-colors bg-black/0 hover:bg-black/5"
            style={{ left: (leftOffset || 288) + 562 }}
            onClick={onClose}
          />
        </div>
      </div>
    );
  }

  // ── Detail View ──────────────────────────────────────────────
  const d = formData;

  return (
    <div className="v-character-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width: 560 }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-gradient-to-r from-purple-900/30 to-violet-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/20">
                  <i className="text-lg text-purple-400 ri-user-settings-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">角色管理</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {d.id ? '编辑角色' : '新建角色'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                  title="返回列表"
                  onClick={() => setView('list')}
                >
                  <i className="ri-arrow-left-line" />
                </button>
                <button
                  className="p-1.5 hover:bg-purple-500/20 rounded-lg transition-colors text-purple-400"
                  title="AI生成角色"
                  onClick={() => setShowAIDialog(true)}
                  disabled={aiGenerating}
                >
                  <i
                    className={
                      aiGenerating
                        ? 'ri-loader-4-line animate-spin'
                        : 'ri-magic-line'
                    }
                  />
                </button>
                <button
                  className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  disabled={saving || !d.姓名.trim()}
                  onClick={handleSave}
                >
                  <i
                    className={
                      saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'
                    }
                  />{' '}
                  {saving ? '保存中...' : '保存'}
                </button>
                <button
                  className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                  onClick={onClose}
                >
                  <i className="text-lg ri-close-line" />
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Basic info */}
              <div className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-500/20">
                      <i className="ri-user-3-line text-purple-400 text-sm" />
                    </div>
                    <h3 className="text-sm font-medium">基本信息</h3>
                  </div>
                </div>
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      姓名
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      placeholder="角色姓名"
                      value={d.姓名}
                      onChange={e => updateField('姓名', e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        角色类型
                      </label>
                      <select
                        value={d.角色类型}
                        onChange={e => updateField('角色类型', e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      >
                        {角色类型选项.map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        性别
                      </label>
                      <select
                        value={d.性别}
                        onChange={e => updateField('性别', e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      >
                        {性别选项.map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        年龄
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                        placeholder="年龄描述"
                        value={d.年龄}
                        onChange={e => updateField('年龄', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        身份
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                        placeholder="身份/职位"
                        value={d.身份}
                        onChange={e => updateField('身份', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-500/20">
                      <i className="ri-emotion-line text-purple-400 text-sm" />
                    </div>
                    <h3 className="text-sm font-medium">描述信息</h3>
                  </div>
                </div>
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      简介
                    </label>
                    <textarea
                      className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-purple-500/50 focus:outline-none"
                      placeholder="角色简介..."
                      value={d.简介}
                      onChange={e => updateField('简介', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      外貌
                    </label>
                    <textarea
                      className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-purple-500/50 focus:outline-none"
                      placeholder="外貌描述..."
                      value={d.外貌}
                      onChange={e => updateField('外貌', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      表层性格
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      placeholder="表面表现的性格特征"
                      value={d.表层性格}
                      onChange={e => updateField('表层性格', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      中层性格
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      placeholder="内在动机和性格"
                      value={d.中层性格}
                      onChange={e => updateField('中层性格', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      内核性格
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      placeholder="核心价值观和深层性格"
                      value={d.内核性格}
                      onChange={e => updateField('内核性格', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Other info */}
              <div className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-500/20">
                      <i className="ri-more-line text-purple-400 text-sm" />
                    </div>
                    <h3 className="text-sm font-medium">其他信息</h3>
                  </div>
                </div>
                <div className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        境界
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                        placeholder="修为境界"
                        value={d.境界}
                        onChange={e => updateField('境界', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        武器
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                        placeholder="武器/法宝"
                        value={d.武器}
                        onChange={e => updateField('武器', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      核心意义
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      placeholder="角色在故事中的作用"
                      value={d.核心意义}
                      onChange={e => updateField('核心意义', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      结局
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      placeholder="预设结局"
                      value={d.结局}
                      onChange={e => updateField('结局', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      存续状态
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      placeholder="活跃/死亡/未知"
                      value={d.存续状态}
                      onChange={e => updateField('存续状态', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-purple-500/50 active:bg-purple-500 shrink-0" />
        <div
          className="fixed top-0 bottom-0 right-0 transition-colors bg-black/0 hover:bg-black/5"
          style={{ left: (leftOffset || 288) + 562 }}
          onClick={onClose}
        />
      </div>

      {/* AI Dialog */}
      {showAIDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-[480px] max-h-[80vh] flex flex-col shadow-2xl">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-500/20">
                  <i className="text-purple-400 ri-magic-line" />
                </div>
                <h3 className="text-sm font-semibold">AI生成角色</h3>
              </div>
              <button
                className="p-1 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                onClick={() => {
                  setShowAIDialog(false);
                  abortRef.current?.abort();
                }}
              >
                <i className="ri-close-line" />
              </button>
            </div>
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    角色类型
                  </label>
                  <select
                    value={formData.角色类型}
                    onChange={e => updateField('角色类型', e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                  >
                    {角色类型选项.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    性别
                  </label>
                  <select
                    value={formData.性别}
                    onChange={e => updateField('性别', e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                  >
                    {性别选项.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  补充要求
                </label>
                <textarea
                  className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-none focus:border-purple-500/50 focus:outline-none"
                  placeholder="描述你对角色的具体要求..."
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
              <button
                className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                onClick={() => {
                  setShowAIDialog(false);
                  abortRef.current?.abort();
                }}
              >
                取消
              </button>
              <button
                className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                disabled={aiGenerating}
                onClick={handleAIGenerate}
              >
                <i
                  className={
                    aiGenerating
                      ? 'ri-loader-4-line animate-spin'
                      : 'ri-magic-line'
                  }
                />
                {aiGenerating ? '生成中...' : '开始生成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterMgmtPanel;
