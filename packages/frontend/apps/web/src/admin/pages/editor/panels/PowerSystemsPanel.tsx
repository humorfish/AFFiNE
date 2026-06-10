import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import { generateLLM, generateValidated } from './panel-shared';
import { API_BASE, getAuthHeaders } from '../useWorldApi';

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

/* Source-derived: realm/ability structures (源码 X() line 53478-53568) */
interface 境界数据 {
  境界名称: string;
  境界等级: number;
  境界描述: string;
  提升条件: string;
  能力表现: string;
  特殊标志: string;
}

interface 能力数据 {
  能力名称: string;
  能力类型: string;
  学习条件: string;
  消耗代价: string;
  能力描述: string;
}

/* Source-derived: main form data (源码 lines 159389-161084) */
interface 力量体系数据 {
  id?: number;
  体系名称: string;
  体系类型: string;
  体系描述: string;
  力量来源: string;
  境界列表: 境界数据[];
  能力列表: 能力数据[];
  修行路径: {
    修行方法: string;
    修行资源: string;
    修行难点: string;
    突破要点: string;
  };
  限制约束: {
    使用限制: string;
    副作用: string;
    反噬风险: string;
    禁忌条款: string;
  };
}

const 能力类型选项 = ['攻击', '防御', '辅助', '控制', '移动', '感知', '特殊'];

/* Source: dynamic config (line 53246-53247) */
const 数量配置 = {
  境界数量: { 最小: 5, 最大: 10 },
  能力数量: { 最小: 5, 最大: 15 },
};

/* Source: 体系类型选项 (line 53270-53278) */
const 体系类型选项 = [
  '修炼类',
  '觉醒类',
  '血脉类',
  '契约类',
  '科技类',
  '魔法类',
  '武道类',
  '其他',
];

/* ── AI prompt (源码 le() line 53570-53702) ── */

interface 世界观信息 {
  世界名称?: string;
  世界类型?: string;
  势力格局?: string;
  社会结构?: string;
  主要冲突?: string;
  核心规则?: string;
  时代背景?: string;
  历史背景?: string;
  [key: string]: unknown;
}

const 体系类型说明: Record<string, string> = {
  修炼类:
    '修炼类体系特点：通过打坐、吐纳、练气等方式逐步提升境界，强调循序渐进和内在修为的积累。境界划分清晰，如炼气、筑基、金丹、元婴等。',
  觉醒类:
    '觉醒类体系特点：通常在某个契机下突然觉醒超能力，能力与生俱来但需要开发。强调潜能激发和能力进化，如异能觉醒、变异进化等。',
  血脉类:
    '血脉类体系特点：力量源自血脉传承，越纯正的血脉力量越强。强调家族、种族的血脉继承，如龙血、神血、魔血等血脉觉醒。',
  契约类:
    '契约类体系特点：通过与某种存在（魔兽、精灵、恶魔等）签订契约获得力量。强调共生关系、契约条款和召唤能力。',
  科技类:
    '科技类体系特点：依靠科技手段增强人体或获得超能力。强调科技装备、基因改造、机械强化等，如强化外骨骼、纳米机器人等。',
  魔法类:
    '魔法类体系特点：通过咒语、法阵、魔力等施展魔法。强调元素掌控、魔法学派、魔力修炼，如火系魔法、空间魔法等。',
  武道类:
    '武道类体系特点：通过锻炼肉身、磨练武技提升实力。强调肉体强化、武学招式、内力运用，如内功心法、武技招式等。',
  其他: '请根据世界观设定创造一个独特的力量体系。',
};

function buildPowerSystemsPrompt(
  世界观: 世界观信息 | null,
  势力列表:
    | { 势力名称?: string; 势力类型?: string; 势力描述?: string }[]
    | null,
  物品列表: { 物品名称?: string; 类别?: string; 作用?: string }[] | null,
  已有体系:
    | { 体系名称?: string; 体系类型?: string; 体系描述?: string }[]
    | null,
  指定类型: string = '',
  已有体系名列表: string[] = []
): string {
  let prompt = `你是一位专业的小说力量体系设计师，擅长构建完整的修炼、魔法或超能力体系。

`;

  let 禁止重复 = '';
  if (已有体系名列表.length > 0) {
    禁止重复 = `
╔══════════════════════════════════════════════════════════════╗
║  【绝对禁止重复】以下力量体系名称已被使用，生成任何重复名称将导致任务失败
╚══════════════════════════════════════════════════════════════╝
已存在的力量体系(${已有体系名列表.length}个)：${已有体系名列表.join('、')}
`;
  }

  if (指定类型) {
    prompt += `【指定体系类型】
你必须生成一个「${指定类型}」类型的力量体系，所有设定都要符合该类型的特征。

`;
    const desc = 体系类型说明[指定类型];
    if (desc) prompt += `${desc}\n\n`;
  }

  if (世界观 && Object.keys(世界观).length > 0) {
    prompt += `【世界观背景】
世界名称：${世界观.世界名称 || '未设定'}
世界类型：${世界观.世界类型 || '未设定'}
势力格局：${世界观.势力格局 || '未设定'}
社会结构：${世界观.社会结构 || '未设定'}
主要冲突：${世界观.主要冲突 || '未设定'}
核心规则：${世界观.核心规则 || '未设定'}
时代背景：${世界观.时代背景 || '未设定'}
历史背景：${世界观.历史背景 || '未设定'}

`;
  }

  if (势力列表 && 势力列表.length > 0) {
    prompt += `【已有势力】\n`;
    势力列表.slice(0, 10).forEach(f => {
      prompt += `- ${f.势力名称}${f.势力类型 ? `（${f.势力类型}）` : ''}${f.势力描述 ? `：${f.势力描述.substring(0, 50)}` : ''}\n`;
    });
    prompt += '\n';
  }

  if (物品列表 && 物品列表.length > 0) {
    prompt += `【已有物品】\n`;
    物品列表.slice(0, 10).forEach(it => {
      prompt += `- ${it.物品名称}${it.类别 ? `（${it.类别}）` : ''}${it.作用 ? `：${it.作用.substring(0, 30)}` : ''}\n`;
    });
    prompt += '\n';
  }

  if (已有体系 && 已有体系.length > 0) {
    prompt += `【已有力量体系】（请避免重复，可以参考风格）\n`;
    已有体系.forEach(s => {
      prompt += `- ${s.体系名称}（${s.体系类型}）：${s.体系描述?.substring(0, 50) || '无描述'}\n`;
    });
    prompt += '\n';
  }

  prompt += `${禁止重复}
【输出格式】（极简格式，节省token）
N|体系名称|体系类型|力量来源
D|体系描述
J|境界名称|境界等级|境界描述|提升条件
A|能力名称|能力类型|能力描述|学习条件
P|修行方法|修行资源|修行难点|突破要点
R|使用限制|副作用|反噬风险

【格式说明】
- N: 基本信息行（必填，第1行）
  - 体系类型：修炼类/觉醒类/血脉类/契约类/科技类/魔法类/武道类/其他
- D: 体系描述（必填，20-100字）
- J: 境界（可多行，建议${数量配置.境界数量.最小}-${数量配置.境界数量.最大}个）
  - 境界等级：数字（1开始递增）
  - 境界描述：10-30字
- A: 能力（可多行，建议${数量配置.能力数量.最小}-${数量配置.能力数量.最大}个）
  - 能力类型：攻击/防御/辅助/控制/移动/感知/特殊
- P: 修行路径（可选）
- R: 限制约束（可选）

【输出示例】
N|修仙之道|修炼类|天地灵气
D|通过吸收天地灵气修炼元神，逐步提升境界，最终追求长生大道
J|炼气期|1|初入修仙，可操控灵气|感应灵气并引入体内
J|筑基期|2|灵气液化，寿命延长|炼气圆满，筑基丹辅助
J|金丹期|3|凝结金丹，法力大增|筑基圆满，凝结金丹
J|元婴期|4|元婴初成，可瞬移|金丹破碎成元婴
A|御剑术|攻击|以灵力操控飞剑攻击|炼气期即可学习
A|护体罡气|防御|灵气外放形成护盾|筑基期可学
P|打坐吐纳|灵石、丹药|灵气稀薄处修炼困难|心境突破
R|消耗灵力|灵力枯竭会虚弱|走火入魔风险

【核心要求】
1. 境界数量建议${数量配置.境界数量.最小}-${数量配置.境界数量.最大}个，形成完整晋升体系
2. 能力数量建议${数量配置.能力数量.最小}-${数量配置.能力数量.最大}个，涵盖不同类型
3. 设定要有内在逻辑，符合世界观
4. ⚠️ 体系名称绝对不能与已有体系重复

【重要规则】
1. 严格按格式输出，每行一个项
2. N行必须在第一行
3. 不要输出任何其他内容
4. ⚠️ 在输出前检查体系名称是否与已有名称重复`;

  return prompt;
}

/* 源码 X() line 53478-53568: parse 6 line types */
function parsePowerSystemsPipe(text: string): 力量体系数据 | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  let 基本信息时间: {
    体系名称: string;
    体系类型: string;
    力量来源: string;
  } | null = null;
  let 体系描述 = '';
  const 境界列表: 境界数据[] = [];
  const 能力列表: 能力数据[] = [];
  let 修行路径 = { 修行方法: '', 修行资源: '', 修行难点: '', 突破要点: '' };
  let 限制约束 = { 使用限制: '', 副作用: '', 反噬风险: '', 禁忌条款: '' };

  for (const line of lines) {
    if (line.startsWith('N|')) {
      const parts = line.slice(2).split('|');
      if (parts.length >= 3) {
        基本信息时间 = {
          体系名称: (parts[0] || '').trim(),
          体系类型: (parts[1] || '其他').trim(),
          力量来源: (parts[2] || '').trim(),
        };
      }
    } else if (line.startsWith('D|')) {
      体系描述 = line.slice(2).trim();
    } else if (line.startsWith('J|')) {
      const parts = line.slice(2).split('|');
      if (parts.length >= 3) {
        境界列表.push({
          境界名称: (parts[0] || '').trim(),
          境界等级: parseInt(parts[1]) || 境界列表.length + 1,
          境界描述: (parts[2] || '').trim(),
          提升条件: (parts[3] || '').trim(),
          能力表现: '',
          特殊标志: '',
        });
      }
    } else if (line.startsWith('A|')) {
      const parts = line.slice(2).split('|');
      if (parts.length >= 3) {
        能力列表.push({
          能力名称: (parts[0] || '').trim(),
          能力类型: (parts[1] || '攻击').trim(),
          能力描述: (parts[2] || '').trim(),
          学习条件: (parts[3] || '').trim(),
          消耗代价: '',
        });
      }
    } else if (line.startsWith('P|')) {
      const parts = line.slice(2).split('|');
      修行路径 = {
        修行方法: (parts[0] || '').trim(),
        修行资源: (parts[1] || '').trim(),
        修行难点: (parts[2] || '').trim(),
        突破要点: (parts[3] || '').trim(),
      };
    } else if (line.startsWith('R|')) {
      const parts = line.slice(2).split('|');
      限制约束 = {
        使用限制: (parts[0] || '').trim(),
        副作用: (parts[1] || '').trim(),
        反噬风险: (parts[2] || '').trim(),
        禁忌条款: (parts[3] || '').trim(),
      };
    }
  }

  if (!基本信息时间 || !基本信息时间.体系名称) return null;
  return {
    体系名称: 基本信息时间.体系名称,
    体系类型: 基本信息时间.体系类型,
    力量来源: 基本信息时间.力量来源,
    体系描述,
    境界列表,
    能力列表,
    修行路径,
    限制约束,
  };
}

function parsePowerSystemsResponse(text: string): 力量体系数据 | null {
  if (!text) return null;
  const pipe = parsePowerSystemsPipe(text.trim());
  if (
    pipe &&
    (pipe.体系名称 || pipe.境界列表.length > 0 || pipe.能力列表.length > 0)
  )
    return pipe;
  try {
    const parsed = JSON.parse(text);
    if (parsed && (parsed.体系名称 || parsed.境界列表 || parsed.能力列表))
      return parsed;
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

const PowerSystemsSchema = z
  .object({
    体系名称: z.string().optional(),
    体系描述: z.string().optional(),
  })
  .passthrough();

export const PowerSystemsPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const [体系列表, set体系列表] = useState<力量体系数据[]>([]);
  const [当前ID, set当前ID] = useState<number | null>(null);
  const [分页信息, set分页信息] = useState({
    当前页: 1,
    每页数量: 20,
    总数: 0,
    总页数: 0,
  });
  const [搜索关键词, set搜索关键词] = useState('');
  const [类型筛选, set类型筛选] = useState('');
  const [选中的IDs, set选中的IDs] = useState<number[]>([]);
  const [批量模式, set批量模式] = useState(false);

  const [width, setWidth] = useState(520);

  // Load power systems data
  useEffect(() => {
    if (!projectId) return;
    const params = new URLSearchParams({
      page: String(分页信息.当前页),
      limit: String(分页信息.每页数量),
      keyword: 搜索关键词,
      type: 类型筛选,
    });
    fetch(`${API_BASE}/api/power-systems/project/${projectId}/list?${params}`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data))
          set体系列表(result.data);
        if (result.pagination) {
          set分页信息({
            当前页: result.pagination.page,
            每页数量: result.pagination.limit,
            总数: result.pagination.total,
            总页数: result.pagination.totalPages,
          });
        }
      })
      .catch(() => {});
  }, [projectId, 分页信息.当前页, 搜索关键词, 类型筛选]);

  /* AI Generation state (源码 lines 162221-162793) */
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [genResult, setGenResult] = useState<力量体系数据 | null>(null);
  const [genError, setGenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [genHistory, setGenHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const 当前体系 = 体系列表.find(s => s.id === 当前ID) || null;

  /* CRUD */
  const refreshList = useCallback(async () => {
    if (!projectId) return;
    const params = new URLSearchParams({
      page: String(分页信息.当前页),
      limit: String(分页信息.每页数量),
      keyword: 搜索关键词,
      type: 类型筛选,
    });
    const res = await fetch(
      `${API_BASE}/api/power-systems/project/${projectId}/list?${params}`,
      {
        headers: getAuthHeaders(),
      }
    );
    const result = await res.json();
    if (result.success && Array.isArray(result.data)) set体系列表(result.data);
    if (result.pagination) {
      set分页信息({
        当前页: result.pagination.page,
        每页数量: result.pagination.limit,
        总数: result.pagination.total,
        总页数: result.pagination.totalPages,
      });
    }
  }, [projectId, 分页信息.当前页, 搜索关键词, 类型筛选]);

  // 源码: POST /power-systems/project/{id}/system
  const addSystem = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/power-systems/project/${projectId}/system`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            体系名称: '新体系',
            体系类型: '修炼类',
            体系描述: '',
            力量来源: '',
            排序顺序: 体系列表.length,
            境界列表: [],
            能力列表: [],
            修行路径: null,
            限制约束: null,
          }),
        }
      );
      const result = await res.json();
      if (result.success) {
        await refreshList();
        if (result.data?.id) set当前ID(result.data.id);
      }
    } catch {
      alert('创建失败');
    }
  }, [projectId, refreshList]);

  // 源码: PUT /power-systems/project/{id}/system/{sid}
  const updateSystem = useCallback(
    async (id: number | undefined, updates: Partial<力量体系数据>) => {
      if (!id || !projectId) return;
      const sys = 体系列表.find(s => s.id === id);
      if (!sys) return;
      set体系列表(prev =>
        prev.map(s => (s.id === id ? { ...s, ...updates } : s))
      );
      try {
        await fetch(
          `${API_BASE}/api/power-systems/project/${projectId}/system/${id}`,
          {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ ...sys, ...updates }),
          }
        );
      } catch {}
    },
    [projectId, 体系列表]
  );

  // 源码: DELETE /power-systems/project/{id}/system/{sid}
  const deleteSystem = useCallback(
    async (id: number | undefined) => {
      if (!id || !projectId) return;
      try {
        const res = await fetch(
          `${API_BASE}/api/power-systems/project/${projectId}/system/${id}`,
          {
            method: 'DELETE',
            headers: getAuthHeaders(),
          }
        );
        const result = await res.json();
        if (result.success) {
          set体系列表(prev => prev.filter(s => s.id !== id));
          if (当前ID === id) set当前ID(null);
        }
      } catch {
        alert('删除失败');
      }
    },
    [当前ID, projectId]
  );

  // 源码: POST /power-systems/project/{id}/batch-delete
  const batchDelete = useCallback(async () => {
    if (!projectId || 选中的IDs.length === 0) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/power-systems/project/${projectId}/batch-delete`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ids: 选中的IDs }),
        }
      );
      const result = await res.json();
      if (result.success) {
        const delSet = new Set(选中的IDs);
        set体系列表(prev => prev.filter(s => !delSet.has(s.id!)));
        if (选中的IDs.includes(当前ID!)) set当前ID(null);
        set选中的IDs([]);
        set批量模式(false);
        set分页信息(prev => ({
          ...prev,
          总数: Math.max(0, prev.总数 - delSet.size),
        }));
      }
    } catch {
      alert('批量删除失败');
    }
  }, [projectId, 选中的IDs, 当前ID]);

  // 源码: PUT /power-systems/project/{id}/sort
  // @ts-expect-error -- API ready for future drag-and-drop sort UI
  const updateSort = useCallback(
    async (items: { id: number; 排序顺序: number }[]) => {
      if (!projectId || items.length === 0) return;
      try {
        await fetch(`${API_BASE}/api/power-systems/project/${projectId}/sort`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ items }),
        });
      } catch {}
    },
    [projectId]
  );

  /* Realm/Ability CRUD */
  const addRealm = useCallback(() => {
    if (!当前ID) return;
    const sys = 体系列表.find(s => s.id === 当前ID);
    if (!sys) return;
    updateSystem(当前ID, {
      境界列表: [
        ...sys.境界列表,
        {
          境界名称: '',
          境界等级: sys.境界列表.length + 1,
          境界描述: '',
          提升条件: '',
          能力表现: '',
          特殊标志: '',
        },
      ],
    });
  }, [当前ID, 体系列表, updateSystem]);

  const removeRealm = useCallback(
    (idx: number) => {
      if (!当前ID) return;
      const sys = 体系列表.find(s => s.id === 当前ID);
      if (!sys) return;
      updateSystem(当前ID, {
        境界列表: sys.境界列表.filter((_, i) => i !== idx),
      });
    },
    [当前ID, 体系列表, updateSystem]
  );

  const updateRealm = useCallback(
    (idx: number, updates: Partial<境界数据>) => {
      if (!当前ID) return;
      const sys = 体系列表.find(s => s.id === 当前ID);
      if (!sys) return;
      const newList = sys.境界列表.map((r, i) =>
        i === idx ? { ...r, ...updates } : r
      );
      updateSystem(当前ID, { 境界列表: newList });
    },
    [当前ID, 体系列表, updateSystem]
  );

  const addAbility = useCallback(() => {
    if (!当前ID) return;
    const sys = 体系列表.find(s => s.id === 当前ID);
    if (!sys) return;
    updateSystem(当前ID, {
      能力列表: [
        ...sys.能力列表,
        {
          能力名称: '',
          能力类型: '攻击',
          学习条件: '',
          消耗代价: '',
          能力描述: '',
        },
      ],
    });
  }, [当前ID, 体系列表, updateSystem]);

  const removeAbility = useCallback(
    (idx: number) => {
      if (!当前ID) return;
      const sys = 体系列表.find(s => s.id === 当前ID);
      if (!sys) return;
      updateSystem(当前ID, {
        能力列表: sys.能力列表.filter((_, i) => i !== idx),
      });
    },
    [当前ID, 体系列表, updateSystem]
  );

  const updateAbility = useCallback(
    (idx: number, updates: Partial<能力数据>) => {
      if (!当前ID) return;
      const sys = 体系列表.find(s => s.id === 当前ID);
      if (!sys) return;
      const newList = sys.能力列表.map((a, i) =>
        i === idx ? { ...a, ...updates } : a
      );
      updateSystem(当前ID, { 能力列表: newList });
    },
    [当前ID, 体系列表, updateSystem]
  );

  /* AI generation (源码 I() line 53704-53749) */
  const openAIDialog = useCallback(() => {
    setAiPrompt('');
    setStreamText('');
    setGenResult(null);
    setGenError('');
    setShowAIDialog(true);
  }, []);

  const startGeneration = useCallback(async () => {
    if (!projectId) return;
    setGenerating(true);
    setStreamText('');
    setGenResult(null);
    setGenError('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      // 源码 line 53718: getContext → 世界观+势力+物品+已有体系
      let 世界观: 世界观信息 | null = null;
      let 势力列表: any[] = [];
      let 物品列表: any[] = [];
      let 已有体系: any[] = [];
      try {
        const ctxRes = await fetch(
          `${API_BASE}/api/power-systems/project/${projectId}/context`,
          { headers: getAuthHeaders() }
        );
        const ctxResult = await ctxRes.json();
        if (ctxResult.success && ctxResult.data) {
          世界观 = ctxResult.data.世界观信息 || null;
          势力列表 = ctxResult.data.势力列表 || [];
          物品列表 = ctxResult.data.物品列表 || [];
          已有体系 = ctxResult.data.已有体系 || [];
        }
      } catch {}

      // 源码 line 53575-53583: 已有体系名列表
      const 已有体系名 = 体系列表
        .map(s => s.体系名称)
        .filter((n): n is string => !!n?.trim());

      // 源码 line 53727: le(世界观, 势力, 物品, 已有体系, 指定类型)
      const systemPrompt = buildPowerSystemsPrompt(
        世界观,
        势力列表,
        物品列表,
        已有体系,
        '',
        已有体系名
      );

      // 源码 line 53728-53737: user message
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content:
            aiPrompt || '请根据世界观背景，生成一个完整且有特色的力量体系。',
        },
      ];
      const validated = await generateValidated({
        schema: PowerSystemsSchema,
        generate: attempt =>
          generateLLM({
            messages,
            temperature: Math.min(1.0, 0.85 + attempt * 0.05),
            max_tokens: 4096,
            onChunk: setStreamText,
            signal: ac.signal,
          }),
        parseResponse: parsePowerSystemsResponse,
        maxRetries: 3,
      });
      if (!validated) {
        setGenError('AI返回格式解析失败');
        return;
      }
      const data = validated.data as any as 力量体系数据;
      const result: 力量体系数据 = {
        体系名称: data.体系名称 || '新体系',
        体系类型: data.体系类型 || '修炼类',
        体系描述: data.体系描述 || '',
        力量来源: data.力量来源 || '',
        境界列表: Array.isArray(data.境界列表)
          ? data.境界列表.map((r: any, i: number) => ({
              境界名称: r.境界名称 || '',
              境界等级: r.境界等级 || i + 1,
              境界描述: r.境界描述 || '',
              提升条件: r.提升条件 || '',
              能力表现: r.能力表现 || '',
              特殊标志: r.特殊标志 || '',
            }))
          : [],
        能力列表: Array.isArray(data.能力列表)
          ? data.能力列表.map((a: any) => ({
              能力名称: a.能力名称 || '',
              能力类型: a.能力类型 || '攻击',
              能力描述: a.能力描述 || '',
              学习条件: a.学习条件 || '',
              消耗代价: a.消耗代价 || '',
            }))
          : [],
        修行路径: data.修行路径 || {
          修行方法: '',
          修行资源: '',
          修行难点: '',
          突破要点: '',
        },
        限制约束: data.限制约束 || {
          使用限制: '',
          副作用: '',
          反噬风险: '',
          禁忌条款: '',
        },
      };
      setGenResult(result);
      // Vue source: saveGeneration (line 53786-53792)
      try {
        await fetch(
          `${API_BASE}/api/power-systems/project/${projectId}/generations`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              用户提示词:
                aiPrompt ||
                '请根据世界观背景，生成一个完整且有特色的力量体系。',
              生成内容: result,
              世界观信息: 世界观,
            }),
          }
        );
      } catch {}
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, 体系列表, projectId]);

  // 源码: POST each generated system + refresh
  const adoptResult = useCallback(async () => {
    if (!genResult || !projectId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/power-systems/project/${projectId}/system`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(genResult),
        }
      );
      const result = await res.json();
      if (result.success) {
        await refreshList();
        if (result.data?.id) set当前ID(result.data.id);
      }
    } catch {
      alert('采用失败');
    }
    setShowAIDialog(false);
    setGenResult(null);
  }, [genResult, projectId, refreshList]);

  // 源码: GET /generations?limit=20
  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/power-systems/project/${projectId}/generations?limit=20`,
        {
          headers: getAuthHeaders(),
        }
      );
      const result = await res.json();
      if (result.success) {
        setGenHistory(result.data || []);
        setShowHistory(true);
      }
    } catch {}
  }, [projectId]);

  // 源码: DELETE /generations/{id}
  const deleteGeneration = useCallback(
    async (genId: number) => {
      if (!projectId) return;
      try {
        const res = await fetch(
          `${API_BASE}/api/power-systems/project/${projectId}/generations/${genId}`,
          {
            method: 'DELETE',
            headers: getAuthHeaders(),
          }
        );
        const result = await res.json();
        if (result.success) {
          setGenHistory(prev => prev.filter(g => g.id !== genId));
        }
      } catch {}
    },
    [projectId]
  );

  // 源码: adopt from history (line 53837-53841)
  const adoptFromHistory = useCallback(
    async (item: any) => {
      if (!item?.生成内容) return;
      try {
        const res = await fetch(
          `${API_BASE}/api/power-systems/project/${projectId}/system`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(item.生成内容),
          }
        );
        const result = await res.json();
        if (result.success) {
          await refreshList();
          if (result.data?.id) set当前ID(result.data.id);
        }
      } catch {
        alert('采用历史记录失败');
      }
      setShowHistory(false);
    },
    [projectId, refreshList]
  );

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    if (!generating) setShowAIDialog(false);
  }, [generating]);

  /* Resize */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      const onMove = (ev: MouseEvent) =>
        setWidth(
          Math.max(360, Math.min(800, startWidth + (startX - ev.clientX)))
        );
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [width]
  );

  return createPortal(
    <div className="v-powersystems-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width }}
        >
          {/* Header (源码 lines 159610-159871) */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20">
                  <i className="text-lg text-red-400 ri-fire-line" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">力量体系</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    构建你的修炼体系
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-red-500/20 rounded transition-colors text-red-400 cursor-pointer"
                  title="AI生成"
                  onClick={openAIDialog}
                  disabled={generating}
                >
                  <i
                    className={`ri-${generating ? 'loader-4-line animate-spin' : 'magic-line'}`}
                  />
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

          <div className="flex flex-1 overflow-hidden">
            {/* Left: System List */}
            <div className="w-56 flex flex-col border-r border-[var(--border)]">
              <div className="shrink-0 p-3 border-b border-[var(--border)] space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">体系列表</h3>
                  <div className="flex items-center gap-1">
                    <button
                      className="p-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs flex items-center gap-1 cursor-pointer"
                      onClick={addSystem}
                    >
                      <i className="ri-add-line" /> 新建
                    </button>
                    <button
                      className={`p-1 ${批量模式 ? 'bg-red-500/30' : 'bg-[var(--bg-card)]'} hover:bg-red-500/30 text-[var(--text-secondary)] hover:text-red-400 rounded text-xs flex items-center gap-1 cursor-pointer`}
                      onClick={() => {
                        set批量模式(!批量模式);
                        set选中的IDs([]);
                      }}
                      title={批量模式 ? '取消批量' : '批量操作'}
                    >
                      <i className="ri-checkbox-multiple-line" />
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  className="w-full h-7 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded focus:outline-none focus:border-red-500/50"
                  placeholder="搜索体系名称..."
                  value={搜索关键词}
                  onChange={e => {
                    set搜索关键词(e.target.value);
                    set分页信息(prev => ({ ...prev, 当前页: 1 }));
                  }}
                />
                <select
                  className="w-full h-7 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded focus:outline-none"
                  value={类型筛选}
                  onChange={e => {
                    set类型筛选(e.target.value);
                    set分页信息(prev => ({ ...prev, 当前页: 1 }));
                  }}
                >
                  <option value="">全部类型</option>
                  {体系类型选项.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto">
                {体系列表.map(s => (
                  <div
                    key={s.id}
                    className={`p-3 border-b border-[var(--border)] hover:bg-[var(--bg-dark)] cursor-pointer transition-colors ${当前ID === s.id ? 'bg-red-500/10' : ''}`}
                    onClick={() => {
                      if (批量模式) {
                        set选中的IDs(prev =>
                          prev.includes(s.id!)
                            ? prev.filter(id => id !== s.id)
                            : [...prev, s.id!]
                        );
                      } else {
                        s.id != null && set当前ID(s.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {批量模式 && (
                        <input
                          type="checkbox"
                          checked={选中的IDs.includes(s.id!)}
                          onChange={() => {
                            set选中的IDs(prev =>
                              prev.includes(s.id!)
                                ? prev.filter(id => id !== s.id)
                                : [...prev, s.id!]
                            );
                          }}
                          className="accent-red-500"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">
                          {s.体系名称}
                        </span>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {s.体系类型} · {s.境界列表.length}境 ·{' '}
                          {s.能力列表.length}技能
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {体系列表.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无体系
                  </div>
                )}
              </div>
              {批量模式 && 选中的IDs.length > 0 && (
                <div className="shrink-0 p-2 border-t border-[var(--border)] bg-[var(--bg-dark)] flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">
                    已选 {选中的IDs.length} 项
                  </span>
                  <button
                    className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 cursor-pointer"
                    onClick={batchDelete}
                  >
                    批量删除
                  </button>
                </div>
              )}
            </div>

            {/* Right: Detail/Edit */}
            <div className="flex-1 overflow-y-auto">
              {当前体系 ? (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">体系详情</h3>
                    <button
                      className="p-1 hover:bg-red-500/20 rounded text-xs text-[var(--text-secondary)] hover:text-red-400"
                      onClick={() => deleteSystem(当前体系.id)}
                    >
                      <i className="ri-delete-bin-line" />
                    </button>
                  </div>

                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        体系名称
                      </label>
                      <input
                        type="text"
                        className="w-full h-9 px-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-red-500/50"
                        placeholder="输入体系名称"
                        value={当前体系.体系名称}
                        onChange={e =>
                          updateSystem(当前体系.id, {
                            体系名称: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        体系类型
                      </label>
                      <select
                        className="w-full h-9 px-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-red-500/50"
                        value={当前体系.体系类型}
                        onChange={e =>
                          updateSystem(当前体系.id, {
                            体系类型: e.target.value,
                          })
                        }
                      >
                        {体系类型选项.map(t => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      力量来源
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-red-500/50"
                      placeholder="如：灵气、魔力、斗气"
                      value={当前体系.力量来源}
                      onChange={e =>
                        updateSystem(当前体系.id, { 力量来源: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      体系描述
                    </label>
                    <textarea
                      className="w-full p-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-red-500/50 min-h-[60px]"
                      placeholder="描述该力量体系的核心理念和运作原理"
                      value={当前体系.体系描述}
                      onChange={e =>
                        updateSystem(当前体系.id, { 体系描述: e.target.value })
                      }
                    />
                  </div>

                  {/* Realms (源码 lines 161042-161399) */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <i className="ri-bar-chart-grouped-line text-red-400" />{' '}
                        境界列表
                      </h4>
                      <button
                        className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 flex items-center gap-1"
                        onClick={addRealm}
                      >
                        <i className="ri-add-line" /> 添加
                      </button>
                    </div>
                    <div className="space-y-2">
                      {当前体系.境界列表.map((r, i) => (
                        <div
                          key={i}
                          className="bg-[var(--bg-dark)] rounded-lg p-3 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              className="flex-1 h-8 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded focus:outline-none focus:border-red-500/50"
                              placeholder="境界名称"
                              value={r.境界名称}
                              onChange={e =>
                                updateRealm(i, { 境界名称: e.target.value })
                              }
                            />
                            <input
                              type="number"
                              className="w-16 h-8 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded focus:outline-none focus:border-red-500/50"
                              placeholder="等级"
                              value={r.境界等级}
                              onChange={e =>
                                updateRealm(i, {
                                  境界等级: parseInt(e.target.value) || 0,
                                })
                              }
                            />
                            <button
                              className="p-1 hover:bg-red-500/20 rounded text-[var(--text-secondary)] hover:text-red-400"
                              onClick={() => removeRealm(i)}
                            >
                              <i className="ri-close-line text-xs" />
                            </button>
                          </div>
                          <input
                            type="text"
                            className="w-full h-8 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded focus:outline-none focus:border-red-500/50"
                            placeholder="提升条件"
                            value={r.提升条件}
                            onChange={e =>
                              updateRealm(i, { 提升条件: e.target.value })
                            }
                          />
                          <input
                            type="text"
                            className="w-full h-8 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded focus:outline-none focus:border-red-500/50"
                            placeholder="能力表现"
                            value={r.能力表现}
                            onChange={e =>
                              updateRealm(i, { 能力表现: e.target.value })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Abilities (源码 lines 161400-161600) */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <i className="ri-flashlight-line text-orange-400" />{' '}
                        能力列表
                      </h4>
                      <button
                        className="px-2 py-1 text-xs bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 flex items-center gap-1"
                        onClick={addAbility}
                      >
                        <i className="ri-add-line" /> 添加
                      </button>
                    </div>
                    <div className="space-y-2">
                      {当前体系.能力列表.map((a, i) => (
                        <div
                          key={i}
                          className="bg-[var(--bg-dark)] rounded-lg p-3 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              className="flex-1 h-8 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded focus:outline-none focus:border-red-500/50"
                              placeholder="能力名称"
                              value={a.能力名称}
                              onChange={e =>
                                updateAbility(i, { 能力名称: e.target.value })
                              }
                            />
                            <select
                              className="w-20 h-8 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded focus:outline-none"
                              value={a.能力类型}
                              onChange={e =>
                                updateAbility(i, { 能力类型: e.target.value })
                              }
                            >
                              {能力类型选项.map(t => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                            <button
                              className="p-1 hover:bg-red-500/20 rounded text-[var(--text-secondary)] hover:text-red-400"
                              onClick={() => removeAbility(i)}
                            >
                              <i className="ri-close-line text-xs" />
                            </button>
                          </div>
                          <input
                            type="text"
                            className="w-full h-8 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded focus:outline-none focus:border-red-500/50"
                            placeholder="学习条件"
                            value={a.学习条件}
                            onChange={e =>
                              updateAbility(i, { 学习条件: e.target.value })
                            }
                          />
                          <input
                            type="text"
                            className="w-full h-8 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded focus:outline-none focus:border-red-500/50"
                            placeholder="消耗代价"
                            value={a.消耗代价}
                            onChange={e =>
                              updateAbility(i, { 消耗代价: e.target.value })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cultivation Path (源码 修行路径) */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <i className="ri-route-line text-blue-400" /> 修行路径
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] block mb-1">
                          修行方法
                        </label>
                        <textarea
                          className="w-full p-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y min-h-[40px]"
                          placeholder="描述修炼的基本方法和步骤"
                          value={当前体系.修行路径.修行方法}
                          onChange={e =>
                            updateSystem(当前体系.id, {
                              修行路径: {
                                ...当前体系.修行路径,
                                修行方法: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] block mb-1">
                          修行资源
                        </label>
                        <input
                          type="text"
                          className="w-full h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg"
                          placeholder="如：灵石、丹药"
                          value={当前体系.修行路径.修行资源}
                          onChange={e =>
                            updateSystem(当前体系.id, {
                              修行路径: {
                                ...当前体系.修行路径,
                                修行资源: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] block mb-1">
                          修行难点
                        </label>
                        <textarea
                          className="w-full p-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y min-h-[40px]"
                          placeholder="修炼过程中的难点"
                          value={当前体系.修行路径.修行难点}
                          onChange={e =>
                            updateSystem(当前体系.id, {
                              修行路径: {
                                ...当前体系.修行路径,
                                修行难点: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] block mb-1">
                          突破要点
                        </label>
                        <textarea
                          className="w-full p-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y min-h-[40px]"
                          placeholder="境界突破的关键要点"
                          value={当前体系.修行路径.突破要点}
                          onChange={e =>
                            updateSystem(当前体系.id, {
                              修行路径: {
                                ...当前体系.修行路径,
                                突破要点: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* Limitations (源码 限制约束) */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                      <i className="ri-forbid-line text-yellow-400" /> 限制约束
                    </h4>
                    <div className="space-y-2">
                      {(
                        ['使用限制', '副作用', '反噬风险', '禁忌条款'] as const
                      ).map(field => (
                        <div key={field}>
                          <label className="text-xs text-[var(--text-secondary)] block mb-1">
                            {field}
                          </label>
                          <textarea
                            className="w-full p-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y min-h-[40px]"
                            placeholder={`力量体系的${field}`}
                            value={当前体系.限制约束[field]}
                            onChange={e =>
                              updateSystem(当前体系.id, {
                                限制约束: {
                                  ...当前体系.限制约束,
                                  [field]: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
                  选择或创建一个力量体系
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-darker)] flex justify-between">
            <span className="text-xs text-[var(--text-secondary)]">
              {体系列表.length} 个体系
            </span>
          </div>
        </div>

        <div
          className="relative z-10 w-2 bg-transparent cursor-col-resize hover:bg-red-500/50 active:bg-red-500 shrink-0"
          title="拖拽调整宽度"
          onMouseDown={handleMouseDown}
        />
        <div
          className="fixed top-0 bottom-0 right-0 bg-black/0 hover:bg-black/5"
          style={{ left: (leftOffset || 0) + width + 2 }}
          onClick={onClose}
        />
      </div>

      {/* AI Generation Dialog (源码 lines 162221-162793) */}
      {showAIDialog &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ri-magic-line text-red-400" />
                  <h3 className="font-semibold">AI生成力量体系</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-2 py-1 text-xs bg-[var(--bg-card)] hover:bg-[var(--border)] rounded text-[var(--text-secondary)] flex items-center gap-1 cursor-pointer"
                    onClick={loadHistory}
                    title="生成历史"
                  >
                    <i className="ri-history-line" /> 历史
                  </button>
                  <button
                    className="p-1.5 hover:bg-[var(--bg-dark)] rounded-lg"
                    onClick={cancelGeneration}
                  >
                    <i className="ri-close-line" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1.5">
                    生成提示词（可选）
                  </label>
                  <textarea
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:border-red-500 transition-colors"
                    placeholder="描述你想要的力量体系特点，例如：一个以剑道为核心的修炼体系，境界划分清晰..."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    disabled={generating}
                  />
                </div>
                {generating && streamText && (
                  <div className="bg-[var(--bg-dark)] rounded-xl p-4">
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      生成预览
                    </label>
                    <pre className="text-xs whitespace-pre-wrap max-h-[200px] overflow-y-auto text-[var(--text-primary)]">
                      {streamText}
                    </pre>
                  </div>
                )}
                {genError && <p className="text-sm text-red-400">{genError}</p>}
                {genResult && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">生成结果预览</h4>
                    <div className="bg-[var(--bg-dark)] rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <i className="ri-fire-line text-red-400" />
                        <span className="text-sm font-medium">
                          {genResult.体系名称}
                        </span>
                        <span className="px-2 py-0.5 text-xs rounded bg-red-500/20 text-red-400">
                          {genResult.体系类型}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">
                        {genResult.体系描述}
                      </p>
                      <div className="mt-2 flex gap-3 text-xs text-[var(--text-secondary)]">
                        <span>{genResult.境界列表.length} 个境界</span>
                        <span>{genResult.能力列表.length} 个能力</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
                {genResult ? (
                  <>
                    <button
                      className="px-4 py-2 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg text-sm"
                      onClick={() => {
                        setGenResult(null);
                        setStreamText('');
                      }}
                    >
                      重新生成
                    </button>
                    <button
                      className="px-4 py-2 btn-primary rounded-lg text-sm flex items-center gap-1"
                      onClick={adoptResult}
                    >
                      <i className="ri-check-line" /> 采用结果
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="px-4 py-2 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg text-sm"
                      onClick={cancelGeneration}
                    >
                      {generating ? '取消生成' : '取消'}
                    </button>
                    <button
                      className="px-4 py-2 btn-primary rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
                      onClick={startGeneration}
                      disabled={generating}
                    >
                      <i
                        className={`ri-${generating ? 'loader-4-line animate-spin' : 'magic-line'}`}
                      />
                      {generating ? '生成中...' : '开始生成'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Generation History Dialog */}
      {showHistory &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="font-semibold">生成历史</h3>
                <button
                  className="p-1.5 hover:bg-[var(--bg-dark)] rounded-lg"
                  onClick={() => setShowHistory(false)}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {genHistory.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无生成历史
                  </div>
                )}
                {genHistory.map(g => (
                  <div
                    key={g.id}
                    className="p-3 border-b border-[var(--border)] hover:bg-[var(--bg-dark)]"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {g.生成内容?.体系名称 || '未命名体系'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 cursor-pointer"
                          onClick={() => adoptFromHistory(g)}
                        >
                          采用
                        </button>
                        <button
                          className="px-2 py-0.5 text-xs bg-[var(--bg-card)] text-[var(--text-secondary)] rounded hover:bg-[var(--border)] cursor-pointer"
                          onClick={() => deleteGeneration(g.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                      {g.生成内容?.体系描述 || '无描述'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>,
    document.body
  );
};

export default PowerSystemsPanel;
