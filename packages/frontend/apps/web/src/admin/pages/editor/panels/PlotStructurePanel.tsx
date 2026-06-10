import React, { useState, useCallback, useEffect } from 'react';
import {
  useAIGenerate,
  parseAIJSON,
  useAIFullGenerate,
  AIGenerationDialog,
  useSystemPrompt,
  generateValidated,
  type TypeOption,
  type QuickTemplate,
} from './panel-shared';
import { API_BASE, getAuthHeaders } from '../useWorldApi';
import { z } from 'zod';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface 情节幕数据 {
  id: number;
  幕序号: number;
  幕名称: string;
  章节范围: string;
  描述: string;
  故事起点: string;
  故事终点: string;
  内容概要: string;
  核心事件: string;
  角色发展: string;
  冲突升级: string;
  情感基调: string;
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

/* ─── Pipe-format prompt & parser for plot structure ─── */

/** Build optimize-mode system prompt — matches Vue line 54195-54234 */
function buildPlotActSystemPrompt(context: {
  项目?: { 名称?: string; 类型?: string; 篇幅字数?: string };
  世界观?: string;
  故事核心?: string;
  角色列表?: Array<{
    姓名: string;
    类型?: string;
    身份?: string;
    简介?: string;
  }>;
}): string {
  const je = context.项目 || {};
  const parts: string[] = [];

  parts.push(`你是一位专业的小说情节优化师，擅长完善和丰富已有的情节设计。`);

  parts.push(`【小说基本信息】
小说名称：${je.名称 || '未命名'}
小说类型：${je.类型 || '未知'}`);

  if (context.世界观) {
    parts.push(`【世界观设定】\n${context.世界观}`);
  }
  if (context.故事核心) {
    parts.push(`【故事核心】\n${context.故事核心}`);
  }
  if (context.角色列表 && context.角色列表.length > 0) {
    parts.push(
      `【主要角色】\n${context.角色列表.map(Y => `${Y.姓名}(${Y.类型 || ''})：${Y.身份 || ''}${Y.简介 ? '，' + Y.简介 : ''}`).join('\n')}`
    );
  }

  parts.push(`【输出要求】
返回JSON格式，与输入保持相同字段结构：
{
  "幕名称": "...",
  "章节范围": "...",
  "开场故事": "本卷第一章的核心场景/事件（15-150字，只写发生了什么，禁止包含日期）",
  "结局故事": "本卷最后一章的核心场景/事件（15-150字，只写发生了什么，禁止包含日期）",
  "内容概要": "完善后的概要（50-100字）",
  "核心事件": "完善后的核心事件（30-60字）",
  "角色发展": "完善后的角色发展（30-60字）",
  "情感基调": "...",
  "冲突升级": "完善后的冲突升级（30-60字）"
}

重要：只返回纯JSON，不要有任何代码块标记或其他文字。`);

  return parts.join('\n\n');
}

/** Parse pipe-delimited format for a single plot act */
function parsePlotActPipe(text: string): Record<string, string> | null {
  const lines = text.split('\n').filter(l => l.trim());
  const result: Record<string, string> = {};
  const fieldMap: Record<string, string> = {
    幕名称: '幕名称',
    描述: '描述',
    故事起点: '故事起点',
    故事终点: '故事终点',
    内容概要: '内容概要',
    核心事件: '核心事件',
    角色发展: '角色发展',
    冲突升级: '冲突升级',
    情感基调: '情感基调',
  };
  for (const line of lines) {
    const t = line.trim();
    const pipeIdx = t.indexOf('|');
    if (pipeIdx > 0) {
      const key = t.substring(0, pipeIdx).trim();
      const val = t.substring(pipeIdx + 1).trim();
      if (fieldMap[key] && val) {
        result[fieldMap[key]] = val;
      }
    }
  }
  return result.幕名称 || result.内容概要 || result.核心事件 ? result : null;
}

/** Combined parser for single plot act: pipe first, then JSON fallback */
function parsePlotActResponse(text: string): Record<string, string> | null {
  if (!text) return null;
  const pipe = parsePlotActPipe(text.trim());
  if (pipe && (pipe.幕名称 || pipe.内容概要 || pipe.核心事件)) return pipe;
  try {
    return JSON.parse(text);
  } catch {}
  const codeMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeMatch)
    try {
      return JSON.parse(codeMatch[1]);
    } catch {}
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch)
    try {
      return JSON.parse(braceMatch[0]);
    } catch {}
  return null;
}

/** Build generate-mode system prompt — matches Vue line 54140-54194 */
function buildPlotStructureSystemPrompt(context: {
  项目?: { 名称?: string; 类型?: string; 篇幅字数?: string };
  世界观?: string;
  故事核心?: string;
  角色列表?: Array<{
    姓名: string;
    类型?: string;
    身份?: string;
    简介?: string;
  }>;
  情节模式?: { 标签: string; 幕数: number; 幕名称: string[] };
}): string {
  const je = context.项目 || {};
  const ae = context.情节模式 || {
    标签: '五幕式',
    幕数: 5,
    幕名称: ['开端', '发展', '转折', '高潮', '结局'],
  };
  const parts: string[] = [];

  parts.push(`你是一位专业的小说情节架构师，擅长设计完整的故事情节脉络。`);

  parts.push(`【小说基本信息】
小说名称：${je.名称 || '未命名'}
小说类型：${je.类型 || '未知'}
预计篇幅：${je.篇幅字数 || '未定'}`);

  if (context.世界观) {
    parts.push(`【世界观设定】\n${context.世界观}`);
  }
  if (context.故事核心) {
    parts.push(`【故事核心】\n${context.故事核心}`);
  }
  if (context.角色列表 && context.角色列表.length > 0) {
    parts.push(
      `【主要角色】\n${context.角色列表.map(Y => `${Y.姓名}(${Y.类型 || ''})：${Y.身份 || ''}${Y.简介 ? '，' + Y.简介 : ''}`).join('\n')}`
    );
  }

  parts.push(`【情节结构模式】
当前使用「${ae.标签}」模式，共${ae.幕数}幕：${ae.幕名称.join('、')}

【输出格式】（极简格式，节省token）
M|幕序号|幕名称|章节范围|内容概要

【格式说明】
- M: 情节幕（每幕一行，共${ae.幕数}幕）
  - 幕序号：数字1开始递增
  - 章节范围：如"第1-20章"
  - 内容概要：该阶段的主要情节概述（10-30字）

【输出示例】
M|1|开端|第1-15章|主角登场，意外获得神秘传承
M|2|发展|第16-40章|初入修仙界，遭遇危机与机遇
M|3|高潮|第41-60章|揭露惊天秘密，决战强敌
M|4|结局|第61-80章|证道成功，开启新篇章

【核心要求】
1. 每幕内容要前后连贯，逻辑自洽
2. 情节安排要符合小说类型的读者期待
3. 章节范围要合理分配，与篇幅相匹配

【重要规则】
1. 严格按格式输出，每行一个幕
2. 按幕序号顺序输出
3. 不要输出任何其他内容`);

  return parts.join('\n\n');
}

/** Parse M| pipe format for generate mode — M|幕序号|幕名称|章节范围|内容概要 */
function parseMLinePipe(text: string): Array<Partial<情节幕数据>> | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('M|'));

  if (lines.length === 0) return null;

  const acts: Array<Partial<情节幕数据>> = [];
  for (const line of lines) {
    const fields = line.split('|');
    if (fields.length < 5) continue;
    acts.push({
      幕序号: Number(fields[1]) || acts.length + 1,
      幕名称: (fields[2] || '').trim(),
      章节范围: (fields[3] || '').trim(),
      内容概要: (fields[4] || '').trim(),
    });
  }

  return acts.length > 0 ? acts : null;
}

/** Parse pipe-delimited format for multiple plot acts (separated by ===) */
function parsePlotStructurePipe(
  text: string
): Array<Partial<情节幕数据>> | null {
  const blocks = text
    .split(/===+/)
    .map(b => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return null;
  const acts: Array<Partial<情节幕数据>> = [];
  const fieldMap: Record<string, string> = {
    幕序号: '幕序号',
    幕名称: '幕名称',
    章节范围: '章节范围',
    描述: '描述',
    故事起点: '故事起点',
    故事终点: '故事终点',
    内容概要: '内容概要',
    核心事件: '核心事件',
    角色发展: '角色发展',
    冲突升级: '冲突升级',
    情感基调: '情感基调',
  };
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim());
    const act: Record<string, any> = {};
    for (const line of lines) {
      const pipeIdx = line.indexOf('|');
      if (pipeIdx > 0) {
        const key = line.substring(0, pipeIdx).trim();
        const val = line.substring(pipeIdx + 1).trim();
        const mapped = fieldMap[key];
        if (mapped && val) {
          act[mapped] = val;
        }
      }
    }
    if (act['幕序号']) act['幕序号'] = Number(act['幕序号']) || 0;
    if (act['幕名称'] || act['内容概要']) {
      acts.push(act as Partial<情节幕数据>);
    }
  }
  return acts.length > 0 ? acts : null;
}

/** Combined parser for full plot structure: M| pipe first, then === pipe, then JSON fallback */
function parsePlotStructureResponse(
  text: string
): Array<Partial<情节幕数据>> | null {
  if (!text) return null;

  // Try M| pipe format first (generate mode output)
  const mLineResult = parseMLinePipe(text.trim());
  if (mLineResult && mLineResult.length > 0) return mLineResult;

  // Try === separated format (legacy/alternative format)
  const pipeResult = parsePlotStructurePipe(text.trim());
  if (pipeResult && pipeResult.length > 0) return pipeResult;

  // JSON fallback — could be array directly or {情节列表: [...]}
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.情节列表 && Array.isArray(parsed.情节列表))
      return parsed.情节列表;
  } catch {}
  const codeMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeMatch)
    try {
      const parsed = JSON.parse(codeMatch[1]);
      if (Array.isArray(parsed)) return parsed;
      if (parsed?.情节列表 && Array.isArray(parsed.情节列表))
        return parsed.情节列表;
    } catch {}
  const bracketMatch = text.match(/\[[\s\S]*\]/);
  if (bracketMatch)
    try {
      const parsed = JSON.parse(bracketMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch)
    try {
      const parsed = JSON.parse(braceMatch[0]);
      if (parsed?.情节列表 && Array.isArray(parsed.情节列表))
        return parsed.情节列表;
    } catch {}
  return null;
}

// ─── Zod schemas ──────────────────────────────────────────────────

const PlotActSchema = z
  .object({
    幕名称: z.string().optional(),
    描述: z.string().optional(),
    故事起点: z.string().optional(),
    故事终点: z.string().optional(),
    内容概要: z.string().optional(),
    核心事件: z.string().optional(),
    角色发展: z.string().optional(),
    冲突升级: z.string().optional(),
    情感基调: z.string().optional(),
  })
  .passthrough();

const PlotActArraySchema = z.array(PlotActSchema).min(1);

// ─── AI generation config ──────────────────────────────────────────────────

const 类型选项: TypeOption[] = [
  { 名称: '三幕式', 图标: 'ri-layout-top-line', 颜色: '#ef4444' },
  { 名称: '五幕式', 图标: 'ri-layout-grid-line', 颜色: '#f97316' },
  { 名称: '英雄之旅', 图标: 'ri-shield-star-line', 颜色: '#eab308' },
  { 名称: '多线并行', 图标: 'ri-git-branch-line', 颜色: '#3b82f6' },
  { 名称: '悬疑解谜', 图标: 'ri-search-eye-line', 颜色: '#a855f7' },
];

const 快捷模板: QuickTemplate[] = [
  {
    label: '经典修仙崛起',
    icon: 'ri-sword-line',
    color: '#ef4444',
    type: '五幕式',
    prompt: '凡人崛起逆天改命的修仙故事，从底层矿奴到灭天斩道，五幕完整结构',
  },
  {
    label: '英雄觉醒之路',
    icon: 'ri-shield-star-line',
    color: '#eab308',
    type: '英雄之旅',
    prompt: '经典英雄之旅结构：平凡世界→冒险召唤→跨过边界→考验→获得宝物→回归',
  },
  {
    label: '悬疑层层揭秘',
    icon: 'ri-search-eye-line',
    color: '#a855f7',
    type: '悬疑解谜',
    prompt: '悬疑推理结构，每幕一个谜团，层层递进，最终揭示惊天真相',
  },
  {
    label: '双线交织叙事',
    icon: 'ri-git-branch-line',
    color: '#3b82f6',
    type: '多线并行',
    prompt: '两条故事线平行推进，在不同时空展开，最终交汇于高潮',
  },
];

// ─── Constants ───────────────────────────────────────────────────────────────

const 结构模式列表 = ['五幕式', '三幕式', '英雄之旅', '起承转合', '序破急'];

/** RGBA color per act number — matches HTML inline styles exactly */
const 幕颜色: Record<number, { bg: string; text: string }> = {
  1: { bg: 'rgba(249, 115, 22, 0.125)', text: 'rgb(249, 115, 22)' }, // orange
  2: { bg: 'rgba(234, 179, 8, 0.125)', text: 'rgb(234, 179, 8)' }, // yellow
  3: { bg: 'rgba(34, 197, 94, 0.125)', text: 'rgb(34, 197, 94)' }, // green
  4: { bg: 'rgba(59, 130, 246, 0.125)', text: 'rgb(59, 130, 246)' }, // blue
  5: { bg: 'rgba(168, 85, 247, 0.125)', text: 'rgb(168, 85, 247)' }, // purple
  6: { bg: 'rgba(236, 72, 153, 0.125)', text: 'rgb(236, 72, 153)' }, // pink
  7: { bg: 'rgba(6, 182, 212, 0.125)', text: 'rgb(6, 182, 212)' }, // cyan
  8: { bg: 'rgba(239, 68, 68, 0.125)', text: 'rgb(239, 68, 68)' }, // red
};

// ─── Demo data ───────────────────────────────────────────────────────────────

const 演示幕列表: 情节幕数据[] = [
  {
    id: 1,
    幕序号: 1,
    幕名称: '烬骨邪影',
    章节范围: '1-96',
    描述: '压抑到反抗的觉醒，初露锋芒的决绝',
    故事起点: '顾尘于黑矿坑底意外觉醒神符，斩杀监工逃出生天',
    故事终点: '顾尘激活古老传送阵，被卷入危机四伏的荒古秘境',
    内容概要:
      '凡人矿奴顾尘觉醒禁忌本源符文，拜入没落宗门，在宗门大比中力压天才，初窥修仙界残酷阶级法则。',
    核心事件: '黑矿坑暴动，宗门大比夺魁，荒古秘境降临',
    角色发展: '顾尘觉醒本源灵枢，修为精进，斩杀旧敌',
    冲突升级: '底层生存危机升级为宗门阶级倾轧，初探天道腐朽',
    情感基调: '',
  },
  {
    id: 2,
    幕序号: 2,
    幕名称: '魔渊泣血',
    章节范围: '97-196',
    描述: '绝望与愤怒交织，复仇之火熊熊燃烧',
    故事起点: '顾尘于秘境深处遭遇重重杀阵，结识下界散修反抗军',
    故事终点: '顾尘融合上古大妖精血，强行撕裂伪天劫杀出绝地',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
  {
    id: 3,
    幕序号: 3,
    幕名称: '八荒烽火',
    章节范围: '197-296',
    描述: '悲壮激昂，众生皆苦的悲悯与抗争',
    故事起点: '顾尘重返修仙界，发现宗门已被世家鹰犬血洗化为废墟',
    故事终点: '顾尘统御八荒散修，阵斩世家老祖，自立逆天盟',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
  {
    id: 4,
    幕序号: 4,
    幕名称: '天阙惊雷',
    章节范围: '297-396',
    描述: '热血沸腾，打破命运枷锁的畅快与沉重',
    故事起点: '顾尘率逆天盟强登天路，于星空古道伏击天阙先遣军',
    故事终点: '顾尘重创天阙掌印官，吞噬星渊本源半步入圣',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
  {
    id: 5,
    幕序号: 5,
    幕名称: '伪天血祭',
    章节范围: '397-496',
    描述: '极致的惨烈与悲壮，向死而生的决绝',
    故事起点: '顾尘杀入天阙中层，惊觉诸神正血祭万灵以修补天道',
    故事终点: '顾尘孤身断后，引爆神帝陵寝掩护众生撤退，身陷绝境',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
  {
    id: 6,
    幕序号: 6,
    幕名称: '纪元喋血',
    章节范围: '497-596',
    描述: '肃杀与悲凉并存，黎明前最暗的挣扎',
    故事起点: '顾尘于生死边缘重塑破灭道基，统率残兵反攻下界神族',
    故事终点: '顾尘强开万界本源，将复苏的古老神魔尽数镇杀镇压',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
  {
    id: 7,
    幕序号: 7,
    幕名称: '万古执剑',
    章节范围: '597-667',
    描述: '壮阔超脱，历经沧桑后的极致平静与宏大',
    故事起点: '顾尘杀入三十三天至高处，直面腐朽伪天道意志化身',
    故事终点: '顾尘斩灭伪天道，重塑灵渊秩序，隐于幕后庇护众生',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
];

/** Fetch plot-structure context — matches Vue API index line 13953 */
async function fetchPlotContext(projectId: number): Promise<{
  项目?: { 名称?: string; 类型?: string; 篇幅字数?: string };
  世界观?: string;
  故事核心?: string;
  角色列表?: Array<{
    姓名: string;
    类型?: string;
    身份?: string;
    简介?: string;
  }>;
} | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/plot-structures/project/${projectId}/context`,
      { headers: getAuthHeaders() }
    );
    const result = await res.json();
    if (result.success && result.data) return result.data;
  } catch {}
  return null;
}

/** Adopt plot acts to server — per-item POST matching Vue behavior */
async function adoptPlotActs(
  projectId: number,
  acts: Array<Partial<情节幕数据>>
): Promise<情节幕数据[]> {
  const saved: 情节幕数据[] = [];

  for (let i = 0; i < acts.length; i++) {
    const m = acts[i];
    const payload = {
      幕序号: m.幕序号 || i + 1,
      幕名称: m.幕名称 || `第${i + 1}幕`,
      章节范围: m.章节范围 || '',
      描述: m.描述 || '',
      故事起点: m.故事起点 || '',
      故事终点: m.故事终点 || '',
      内容概要: m.内容概要 || '',
      核心事件: m.核心事件 || '',
      角色发展: m.角色发展 || '',
      冲突升级: m.冲突升级 || '',
      情感基调: m.情感基调 || '',
    };

    try {
      const res = await fetch(
        `${API_BASE}/api/plot-structures/project/${projectId}/plot`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        }
      );
      const result = await res.json();
      if (result.success && result.data) {
        saved.push(result.data as 情节幕数据);
      }
    } catch {}
  }

  return saved;
}

/** Refresh plot list from server */
async function refreshPlotList(
  projectId: number
): Promise<情节幕数据[] | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/plot-structures/project/${projectId}/list-with-stats`,
      { headers: getAuthHeaders() }
    );
    const result = await res.json();
    if (result.success && Array.isArray(result.data)) {
      return result.data;
    }
  } catch {}
  return null;
}

// ─── Main component ──────────────────────────────────────────────────────────

export const PlotStructurePanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  const [当前模式, set当前模式] = useState<string>('五幕式');
  const [展开的幕, set展开的幕] = useState<Set<number>>(new Set([1]));
  const [幕列表, set幕列表] = useState<情节幕数据[]>(演示幕列表);
  const [新增幕数据, set新增幕数据] = useState<Partial<情节幕数据>>({});
  const [显示新增, set显示新增] = useState(false);

  const { generating: aiGenerating, generate: aiGenerate } = useAIGenerate({
    module: 'plotstructure',
    projectId,
  });

  // ── Data fetching ──
  const [data, setData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!projectId) return;
    fetch(
      `${API_BASE}/api/plot-structures/project/${projectId}/list-with-stats`,
      {
        headers: getAuthHeaders(),
      }
    )
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data) {
          // If data is an array of acts, set 幕列表
          if (Array.isArray(result.data)) {
            set幕列表(result.data);
          }
          // Also extract string fields for fullGen compatibility
          const fields: Record<string, string> = {};
          for (const [k, v] of Object.entries(result.data)) {
            if (typeof v === 'string') fields[k] = v;
          }
          setData(fields);
        }
      })
      .catch(() => {});
  }, [projectId]);

  // ── AI hooks ──
  const fetchSystemPrompt = useSystemPrompt(
    'AI生成情节结构',
    '你是一位专业的小说情节设计师。请设计引人入胜的情节结构，确保起承转合自然流畅。输出JSON格式。'
  );

  const fullGen = useAIFullGenerate({
    module: 'plotstructure',
    projectId,
    data,
    setData,
    fetchSystemPrompt,
    defaultType: '五幕式',
    maxTokens: 8192,
    parseResponse: useCallback((text: string) => {
      // Try M| pipe format first
      const mResult = parseMLinePipe(text.trim());
      if (mResult && mResult.length > 0) {
        // Convert array to Record<string, string> for fullGen compatibility
        const record: Record<string, string> = {};
        mResult.forEach((act, i) => {
          record[`幕${i + 1}_${act.幕名称 || ''}`] =
            act.内容概要 || act.描述 || '';
        });
        return record;
      }
      // Fallback to JSON
      const { data: parsed } = parseAIJSON<Record<string, string>>(text);
      return parsed;
    }, []),
    buildUserMessage: useCallback((type: string, desc: string) => {
      return `请为我生成一套完整的情节结构。\n\n结构类型：${type}${desc ? '\n\n用户需求：' + desc : ''}\n\n请设计完整的情节幕列表。输出JSON数组，每个元素包含以下字段：\n{"幕序号":1,"幕名称":"名称","章节范围":"1-96","描述":"概述","故事起点":"起点","故事终点":"终点","内容概要":"概要","核心事件":"事件","角色发展":"发展","冲突升级":"冲突","情感基调":"基调"}\n\n请输出JSON数组。`;
    }, []),
  });

  const handleAIAdopt = useCallback(async () => {
    if (!projectId || !fullGen.parsed) return;

    const parsedData = fullGen.parsed;
    let actData: any[] = [];

    if (Array.isArray(parsedData)) {
      actData = parsedData;
    } else {
      // parsed is Record<string, string>, try to extract array
      try {
        const str = Object.values(parsedData).find(
          v => typeof v === 'string' && v.startsWith('[')
        );
        if (str) {
          const arr = JSON.parse(str);
          if (Array.isArray(arr)) actData = arr;
        }
      } catch {}
    }

    if (actData.length === 0) return;

    // Adopt: per-item POST matching Vue behavior
    const saved = await adoptPlotActs(
      projectId,
      actData.map((m, i) => ({
        幕序号: m.幕序号 || i + 1,
        幕名称: m.幕名称 || `第${i + 1}幕`,
        章节范围: m.章节范围 || '',
        描述: m.描述 || '',
        故事起点: m.开场故事 || m.故事起点 || '',
        故事终点: m.结局故事 || m.故事终点 || '',
        内容概要: m.内容概要 || '',
        核心事件: m.核心事件 || '',
        角色发展: m.角色发展 || '',
        冲突升级: m.冲突升级 || '',
        情感基调: m.情感基调 || '',
      }))
    );

    // Refresh from server
    const refreshed = await refreshPlotList(projectId);
    set幕列表(refreshed || saved);

    fullGen.close();
  }, [projectId, fullGen]);

  const on切换展开 = useCallback((幕序号: number) => {
    set展开的幕(prev => {
      const next = new Set(prev);
      if (next.has(幕序号)) next.delete(幕序号);
      else next.add(幕序号);
      return next;
    });
  }, []);

  const onAI完善 = useCallback(
    async (幕: 情节幕数据) => {
      if (!projectId) return;
      const 上下文 = await fetchPlotContext(projectId);
      const systemPrompt = buildPlotActSystemPrompt(上下文 || {});
      const 已有情节 = `幕序号：${幕.幕序号}\n幕名称：${幕.幕名称}\n章节范围：${幕.章节范围}\n描述：${幕.描述}\n故事起点：${幕.故事起点 || '无'}\n故事终点：${幕.故事终点 || '无'}\n内容概要：${幕.内容概要 || '无'}\n核心事件：${幕.核心事件 || '无'}\n角色发展：${幕.角色发展 || '无'}\n冲突升级：${幕.冲突升级 || '无'}\n情感基调：${幕.情感基调 || '无'}`;
      const userPrompt = `请优化以下情节幕：\n\n${已有情节}`;
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      const result = await generateValidated({
        schema: PlotActSchema,
        generate: () =>
          aiGenerate(messages, {
            scenario: 'AI生成情节脉络',
            context: { mode: 'optimize', 幕id: 幕.id },
          }),
        parseResponse: parsePlotActResponse,
        maxRetries: 3,
      });
      if (result) {
        set幕列表(prev => {
          return prev.map(m =>
            m.id === 幕.id ? ({ ...m, ...result.data } as 情节幕数据) : m
          );
        });
      }
    },
    [aiGenerate, projectId]
  );

  const on删除幕 = useCallback(
    async (幕: 情节幕数据) => {
      if (!projectId) return;
      try {
        await fetch(
          `${API_BASE}/api/plot-structures/project/${projectId}/plot/${幕.id}`,
          {
            method: 'DELETE',
            headers: getAuthHeaders(),
          }
        );
      } catch {}
      set幕列表(prev => prev.filter(m => m.id !== 幕.id));
    },
    [projectId]
  );

  const on手动添加 = useCallback(async () => {
    if (!projectId) return;
    const 新序号 = 幕列表.length + 1;
    const 幕数配置 = (() => {
      const map: Record<string, string[]> = {
        三幕式: ['开端', '发展', '结局'],
        五幕式: ['开端', '发展', '转折', '高潮', '结局'],
        英雄之旅: ['平凡世界', '冒险召唤', '考验', '获得宝物', '回归'],
        起承转合: ['起', '承', '转', '合'],
        序破急: ['序', '破', '急'],
      };
      return map[当前模式] || map['五幕式'];
    })();
    const 默认名称 = 幕数配置[新序号 - 1] || `第${新序号}幕`;
    const payload = {
      幕序号: 新序号,
      幕名称: 默认名称,
      章节范围: '',
      描述: '',
      故事起点: '',
      故事终点: '',
      内容概要: '',
      核心事件: '',
      角色发展: '',
      冲突升级: '',
      情感基调: '',
    };
    try {
      const res = await fetch(
        `${API_BASE}/api/plot-structures/project/${projectId}/plot`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        }
      );
      const result = await res.json();
      if (result.success && result.data) {
        const 新幕 = result.data as 情节幕数据;
        set幕列表(prev => [...prev, 新幕]);
        set显示新增(true);
        set展开的幕(prev => new Set([...prev, 新幕.幕序号]));
        set新增幕数据({ ...新幕 });
      }
    } catch {
      // Fallback: local only
      const 新幕: 情节幕数据 = {
        id: Date.now(),
        幕序号: 新序号,
        幕名称: 默认名称,
        章节范围: '',
        描述: '',
        故事起点: '',
        故事终点: '',
        内容概要: '',
        核心事件: '',
        角色发展: '',
        冲突升级: '',
        情感基调: '',
      };
      set幕列表(prev => [...prev, 新幕]);
      set显示新增(true);
      set展开的幕(prev => new Set([...prev, 新序号]));
      set新增幕数据({ ...新幕 });
    }
  }, [projectId, 幕列表, 当前模式]);

  const on保存新增 = useCallback(async () => {
    if (!新增幕数据.id || !projectId) return;
    try {
      await fetch(
        `${API_BASE}/api/plot-structures/project/${projectId}/plot/${新增幕数据.id}`,
        {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(新增幕数据),
        }
      );
    } catch {}
    set幕列表(prev =>
      prev.map(m =>
        m.id === 新增幕数据.id ? ({ ...m, ...新增幕数据 } as 情节幕数据) : m
      )
    );
    set显示新增(false);
    set新增幕数据({});
  }, [新增幕数据, projectId]);

  const on取消新增 = useCallback(() => {
    if (新增幕数据.id) {
      set幕列表(prev => prev.filter(m => m.id !== 新增幕数据.id));
    }
    set显示新增(false);
    set新增幕数据({});
  }, [新增幕数据]);

  const on新增字段变更 = useCallback((field: string, value: string) => {
    set新增幕数据(prev => ({ ...prev, [field]: value }));
  }, []);

  const 总数 = 幕列表.length;

  return (
    <div className="v-064a3e2c">
      <div
        className="情节脉络侧边栏容器 fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        {/* ── Sidebar panel ── */}
        <aside
          className="情节脉络内容 bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col h-full shadow-lg"
          style={{ width: 480 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)]">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-lg w-9 h-9 bg-gradient-to-br from-orange-500/20 to-amber-500/20">
                <i className="text-lg text-orange-400 ri-route-line" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">情节脉络</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  故事情节结构与发展脉络
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs cursor-pointer text-purple-400"
                title="AI批量生成"
                onClick={fullGen.open}
              >
                <i className="ri-sparkling-line" />
              </button>
              <button
                type="button"
                className="p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs cursor-pointer text-[var(--text-secondary)] disabled:opacity-50"
                title="AI生成情节"
                onClick={async () => {
                  if (!projectId) return;
                  const 上下文 = await fetchPlotContext(projectId);
                  const 幕数配置 = (() => {
                    const map: Record<
                      string,
                      { 标签: string; 幕数: number; 幕名称: string[] }
                    > = {
                      三幕式: {
                        标签: '三幕式',
                        幕数: 3,
                        幕名称: ['开端', '发展', '结局'],
                      },
                      五幕式: {
                        标签: '五幕式',
                        幕数: 5,
                        幕名称: ['开端', '发展', '转折', '高潮', '结局'],
                      },
                      英雄之旅: {
                        标签: '英雄之旅',
                        幕数: 5,
                        幕名称: [
                          '平凡世界',
                          '冒险召唤',
                          '考验',
                          '获得宝物',
                          '回归',
                        ],
                      },
                      起承转合: {
                        标签: '起承转合',
                        幕数: 4,
                        幕名称: ['起', '承', '转', '合'],
                      },
                      序破急: {
                        标签: '序破急',
                        幕数: 3,
                        幕名称: ['序', '破', '急'],
                      },
                    };
                    return map[当前模式] || map['五幕式'];
                  })();
                  const systemPrompt = buildPlotStructureSystemPrompt({
                    ...上下文,
                    情节模式: 幕数配置,
                  });
                  const 已有幕提示 =
                    幕列表.length > 0
                      ? `\n\n已有情节脉络：\n${幕列表.map(m => `第${m.幕序号}幕 ${m.幕名称}(${m.章节范围}): ${m.描述 || m.内容概要 || ''}`).join('\n')}`
                      : '';
                  const userPrompt = `请为我设计完整的情节脉络。${已有幕提示}`;
                  const messages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                  ];
                  const gvResult = await generateValidated({
                    schema: PlotActArraySchema,
                    generate: () =>
                      aiGenerate(messages, {
                        scenario: 'AI生成情节脉络',
                        context: {
                          情节模式: 当前模式,
                          已有情节列表: 幕列表.map(m => m.幕名称),
                        },
                      }),
                    parseResponse: parsePlotStructureResponse,
                    maxRetries: 3,
                  });
                  if (gvResult) {
                    const actData = gvResult.data as any[];
                    if (Array.isArray(actData)) {
                      const newList = actData.map((m, i) => ({
                        id: Date.now() + i,
                        幕序号: m.幕序号 || i + 1,
                        幕名称: m.幕名称 || `第${i + 1}幕`,
                        章节范围: m.章节范围 || '',
                        描述: m.描述 || '',
                        故事起点: m.开场故事 || m.故事起点 || '',
                        故事终点: m.结局故事 || m.故事终点 || '',
                        内容概要: m.内容概要 || '',
                        核心事件: m.核心事件 || '',
                        角色发展: m.角色发展 || '',
                        冲突升级: m.冲突升级 || '',
                        情感基调: m.情感基调 || '',
                      }));
                      // Adopt: per-item POST matching Vue behavior
                      const saved = await adoptPlotActs(projectId, newList);
                      // Refresh from server
                      const refreshed = await refreshPlotList(projectId);
                      set幕列表(
                        refreshed || (saved.length > 0 ? saved : newList)
                      );
                    }
                  }
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
                type="button"
                className="p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs text-[var(--text-secondary)] cursor-pointer"
                title="手动添加情节"
                onClick={on手动添加}
              >
                <i className="ri-add-line" />
              </button>
              <button
                type="button"
                className="p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs text-[var(--text-secondary)] cursor-pointer"
                onClick={onClose}
              >
                <i className="text-base ri-close-line" />
              </button>
            </div>
          </div>

          {/* Toolbar — structure mode selector */}
          <div className="px-4 py-2.5 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)]/50">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] shrink-0">
                结构模式
              </span>
              <div className="flex items-center flex-1 gap-1 overflow-x-auto">
                {结构模式列表.map(模式 => (
                  <button
                    key={模式}
                    className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-all cursor-pointer ${
                      当前模式 === 模式
                        ? 'bg-orange-500/20 text-orange-400 font-medium'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-dark)] hover:text-[var(--text)]'
                    }`}
                    onClick={() => set当前模式(模式)}
                  >
                    {模式}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Act list */}
          <div className="flex-1 px-3 py-3 overflow-y-auto">
            <div className="space-y-2.5">
              {幕列表.map(幕 => {
                const 是否展开 = 展开的幕.has(幕.幕序号);
                const 颜色 = 幕颜色[幕.幕序号] || 幕颜色[1];
                const 是新增 = 显示新增 && 新增幕数据.id === 幕.id;

                return (
                  <div key={幕.id} className="relative group">
                    {幕.幕序号 > 1 && (
                      <div className="absolute -top-2.5 left-5 w-px h-2.5 bg-[var(--border)]" />
                    )}
                    <div
                      className={`bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden transition-all hover:border-orange-500/30 hover:shadow-md hover:shadow-orange-500/5 ${
                        是否展开
                          ? 'border-orange-500/50 shadow-md shadow-orange-500/10'
                          : ''
                      }`}
                    >
                      {/* Card header */}
                      <div
                        className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer"
                        onClick={() => on切换展开(幕.幕序号)}
                      >
                        <div
                          className="flex items-center justify-center w-8 h-8 text-sm font-bold rounded-lg shrink-0"
                          style={{ backgroundColor: 颜色.bg, color: 颜色.text }}
                        >
                          {幕.幕序号}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {幕.幕名称}
                            </span>
                            {幕.描述 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-dark)] text-[var(--text-secondary)]">
                                {幕.描述}
                              </span>
                            )}
                          </div>
                          {幕.章节范围 && (
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                              {幕.章节范围}
                            </p>
                          )}
                          {幕.故事起点 && 幕.故事终点 && (
                            <p className="text-[10px] text-amber-400/80 mt-0.5">
                              <span>开：{幕.故事起点}</span>
                              <span> → </span>
                              <span>结：{幕.故事终点}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 transition-opacity opacity-0 group-hover:opacity-100">
                          <button
                            className="p-1 hover:bg-orange-500/20 rounded text-[var(--text-secondary)] hover:text-orange-400 transition-colors cursor-pointer"
                            title="AI完善"
                            onClick={e => {
                              e.stopPropagation();
                              onAI完善(幕);
                            }}
                          >
                            <i className="text-xs ri-sparkling-line" />
                          </button>
                          <button
                            className="p-1 hover:bg-red-500/20 rounded text-[var(--text-secondary)] hover:text-red-400 transition-colors cursor-pointer"
                            title="删除"
                            onClick={e => {
                              e.stopPropagation();
                              on删除幕(幕);
                            }}
                          >
                            <i className="text-xs ri-delete-bin-line" />
                          </button>
                        </div>
                        <i
                          className={`ri-arrow-down-s-line text-[var(--text-secondary)] transition-transform text-sm ${是否展开 ? 'rotate-180' : ''}`}
                        />
                      </div>

                      {/* Expanded body */}
                      {是否展开 && !是新增 && 幕.内容概要 && (
                        <div className="border-t border-[var(--border)]">
                          <div className="p-3.5">
                            <div className="space-y-2.5">
                              {幕.故事起点 && 幕.故事终点 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <i className="text-xs ri-movie-2-line text-amber-400" />
                                    <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                                      故事起止
                                    </span>
                                  </div>
                                  <div className="text-xs text-[var(--text)] leading-relaxed pl-4 space-y-1">
                                    <p>
                                      <span className="text-amber-400/80">
                                        开场：
                                      </span>
                                      {幕.故事起点}
                                    </p>
                                    <p>
                                      <span className="text-amber-400/80">
                                        结局：
                                      </span>
                                      {幕.故事终点}
                                    </p>
                                  </div>
                                </div>
                              )}
                              {幕.内容概要 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <i className="text-xs ri-file-text-line text-orange-400" />
                                    <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                                      内容概要
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--text)] leading-relaxed pl-4">
                                    {幕.内容概要}
                                  </p>
                                </div>
                              )}
                              {幕.核心事件 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <i className="text-xs ri-flashlight-line text-yellow-400" />
                                    <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                                      核心事件
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--text)] leading-relaxed pl-4">
                                    {幕.核心事件}
                                  </p>
                                </div>
                              )}
                              {幕.角色发展 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <i className="text-xs ri-user-heart-line text-blue-400" />
                                    <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                                      角色发展
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--text)] leading-relaxed pl-4">
                                    {幕.角色发展}
                                  </p>
                                </div>
                              )}
                              {幕.冲突升级 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <i className="text-xs ri-sword-line text-red-400" />
                                    <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                                      冲突升级
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--text)] leading-relaxed pl-4">
                                    {幕.冲突升级}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-[var(--border)]/50">
                              <button
                                className="px-2.5 py-1 bg-[var(--bg-dark)] text-[var(--text-secondary)] rounded-md text-xs hover:bg-[var(--border)] hover:text-[var(--text)] transition-colors cursor-pointer"
                                onClick={() => on切换展开(幕.幕序号)}
                              >
                                <i className="mr-1 ri-edit-line" />
                                编辑
                              </button>
                              <button
                                className="px-2.5 py-1 bg-[var(--bg-dark)] text-[var(--text-secondary)] rounded-md text-xs hover:bg-orange-500/20 hover:text-orange-400 transition-colors cursor-pointer"
                                onClick={() => onAI完善(幕)}
                              >
                                <i className="mr-1 ri-sparkling-line" /> AI完善
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Inline add/edit form for new acts */}
                      {是否展开 && 是新增 && (
                        <div className="border-t border-[var(--border)]">
                          <div className="p-3.5 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                  幕名称
                                </label>
                                <input
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-500/50"
                                  placeholder="幕名称"
                                  value={新增幕数据.幕名称 || ''}
                                  onChange={e =>
                                    on新增字段变更('幕名称', e.target.value)
                                  }
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                  章节范围
                                </label>
                                <input
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-500/50"
                                  placeholder="如：第1-30章"
                                  value={新增幕数据.章节范围 || ''}
                                  onChange={e =>
                                    on新增字段变更('章节范围', e.target.value)
                                  }
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] text-amber-400/80 uppercase tracking-wider mb-1 block">
                                  开场故事
                                </label>
                                <textarea
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-amber-500/50"
                                  rows={2}
                                  placeholder="本卷第一章的核心场景/事件"
                                  value={新增幕数据.故事起点 || ''}
                                  onChange={e =>
                                    on新增字段变更('故事起点', e.target.value)
                                  }
                                />
                                <span className="text-[9px] text-[var(--text-secondary)] mt-0.5 block">
                                  如：主角被逐出宗门，流落市井
                                </span>
                              </div>
                              <div>
                                <label className="text-[10px] text-amber-400/80 uppercase tracking-wider mb-1 block">
                                  结局故事
                                </label>
                                <textarea
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-amber-500/50"
                                  rows={2}
                                  placeholder="本卷最后一章的核心场景/事件"
                                  value={新增幕数据.故事终点 || ''}
                                  onChange={e =>
                                    on新增字段变更('故事终点', e.target.value)
                                  }
                                />
                                <span className="text-[9px] text-[var(--text-secondary)] mt-0.5 block">
                                  如：击败强敌，获得秘境传承
                                </span>
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                内容概要
                              </label>
                              <textarea
                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-orange-500/50"
                                rows={3}
                                placeholder="该阶段的主要情节概述"
                                value={新增幕数据.内容概要 || ''}
                                onChange={e =>
                                  on新增字段变更('内容概要', e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                核心事件
                              </label>
                              <textarea
                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-orange-500/50"
                                rows={2}
                                placeholder="该阶段最关键的事件"
                                value={新增幕数据.核心事件 || ''}
                                onChange={e =>
                                  on新增字段变更('核心事件', e.target.value)
                                }
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                  角色发展
                                </label>
                                <textarea
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-orange-500/50"
                                  rows={2}
                                  placeholder="角色的成长变化"
                                  value={新增幕数据.角色发展 || ''}
                                  onChange={e =>
                                    on新增字段变更('角色发展', e.target.value)
                                  }
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                  冲突升级
                                </label>
                                <textarea
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-orange-500/50"
                                  rows={2}
                                  placeholder="冲突的升级方向"
                                  value={新增幕数据.冲突升级 || ''}
                                  onChange={e =>
                                    on新增字段变更('冲突升级', e.target.value)
                                  }
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                情感基调
                              </label>
                              <input
                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-500/50"
                                placeholder="如：紧张刺激 / 温馨治愈 / 沉重压抑"
                                value={新增幕数据.情感基调 || ''}
                                onChange={e =>
                                  on新增字段变更('情感基调', e.target.value)
                                }
                              />
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                className="flex-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors cursor-pointer"
                                onClick={on保存新增}
                              >
                                <i className="mr-1 ri-check-line" />
                                保存
                              </button>
                              <button
                                className="px-3 py-1.5 bg-[var(--bg-dark)] text-[var(--text-secondary)] rounded-lg text-xs hover:bg-[var(--border)] transition-colors cursor-pointer"
                                onClick={on取消新增}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-[var(--border)] shrink-0 bg-[var(--bg-card)]/50">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>
                <i className="mr-1 ri-route-line" /> {当前模式} · 共 {总数} 幕
              </span>
            </div>
          </div>
        </aside>

        {/* Resize handle */}
        <div
          className="w-2 cursor-col-resize hover:bg-[var(--primary)]/50 active:bg-[var(--primary)] transition-colors shrink-0 relative z-10 bg-transparent"
          title="拖拽调整宽度"
        />

        {/* Backdrop */}
        <div
          className="fixed top-0 bottom-0 right-0 transition-colors bg-black/0 hover:bg-black/5"
          style={{ left: leftOffset + 492 }}
        />
      </div>

      {/* AI generation dialog */}
      <AIGenerationDialog
        title="AI生成情节结构"
        subtitle="选择情节类型或描述你的构想，AI将为你构建完整的情节结构"
        phase={fullGen.phase}
        genType={fullGen.genType}
        setGenType={fullGen.setGenType}
        genDesc={fullGen.genDesc}
        setGenDesc={fullGen.setGenDesc}
        streamText={fullGen.streamText}
        parsed={fullGen.parsed}
        typeOptions={类型选项}
        quickTemplates={快捷模板}
        onStart={fullGen.start}
        onAdopt={handleAIAdopt}
        onClose={fullGen.close}
      />
    </div>
  );
};

export default PlotStructurePanel;
