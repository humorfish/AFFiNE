import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { generateLLM } from './panel-shared';
import { saveGeneration, type ModuleName } from '../useWorldApi';
import { useProjectStore } from '../../../hooks/useProjectStore';
import type { 分组地图 } from '../../../hooks/useProjectStore';

// ── Props ──
interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ── Source: 分组地图列表 computed (line 37265-37284) ──
const MAP_TYPE_ORDER = ['世界', '大陆', '区域', '城市', '地点', '路线'];

function compute分组地图(maps: any[]): 分组地图[] {
  const groups: Record<string, any[]> = {};
  for (const m of maps) {
    const t = m.地图类型 || '世界';
    if (!groups[t]) groups[t] = [];
    let 显示名称 = m.地图名称 || '未命名';
    if (m.父地图ID) {
      const parent = maps.find((p: any) => p.id === m.父地图ID);
      if (parent) 显示名称 = parent.地图名称 + ' > ' + 显示名称;
    }
    groups[t].push({ ...m, 显示名称 });
  }
  return MAP_TYPE_ORDER.filter(t => groups[t]?.length > 0)
    .map(t => ({ 类型: t, 列表: groups[t] }))
    .concat(
      Object.keys(groups)
        .filter(t => !MAP_TYPE_ORDER.includes(t) && groups[t]?.length > 0)
        .map(t => ({ 类型: t, 列表: groups[t] }))
    );
}

// ── Source-derived: Xl store data model (lines 36512-36900) ──
interface 势力数据 {
  id: number;
  势力名称: string;
  势力类型: string;
  势力描述: string;
  势力图标: string;
  势力颜色: string;
  实力等级: string;
  立场: string;
  领袖: string;
  总部位置: string;
  成员数量: string;
  关联区域ID: number[];
  关联地图ID: number | null;
  势力目标: string;
  势力特点: string;
  势力历史: string;
  核心成员: string[];
  控制区域: string[];
  重要据点: string[];
}

interface 关系数据 {
  id: number;
  源势力ID: number;
  目标势力ID: number;
  源势力名称: string;
  目标势力名称: string;
  关系类型: string;
  关系描述: string;
  关系强度: number;
  关系颜色: string;
}

interface 生成历史项 {
  id: number;
  时间: string;
  提示词: string;
  生成内容: { 势力列表?: any[]; 势力关系?: any[] } | null;
  已采用: boolean;
  生成类型: string;
}

// ── Source-derived: option arrays (lines 36553-36586) ──
const 势力类型选项 = [
  { value: '门派', icon: 'ri-sword-line', color: '#8b5cf6' },
  { value: '国家', icon: 'ri-government-line', color: '#3b82f6' },
  { value: '组织', icon: 'ri-group-line', color: '#22c55e' },
  { value: '家族', icon: 'ri-home-heart-line', color: '#f97316' },
  { value: '帮派', icon: 'ri-spy-line', color: '#ef4444' },
  { value: '宗教', icon: 'ri-ancient-gate-line', color: '#eab308' },
  { value: '商会', icon: 'ri-store-2-line', color: '#06b6d4' },
  { value: '其他', icon: 'ri-question-line', color: '#6b7280' },
];

const 立场选项 = [
  { value: '正派', color: '#22c55e', icon: 'ri-shield-star-line' },
  { value: '邪派', color: '#ef4444', icon: 'ri-skull-line' },
  { value: '中立', color: '#6b7280', icon: 'ri-scales-3-line' },
  { value: '灰色', color: '#8b5cf6', icon: 'ri-contrast-2-line' },
];

const 实力等级选项 = [
  { value: '顶尖', label: '顶尖势力', color: '#fbbf24' },
  { value: '一流', label: '一流势力', color: '#a855f7' },
  { value: '二流', label: '二流势力', color: '#3b82f6' },
  { value: '三流', label: '三流势力', color: '#22c55e' },
  { value: '末流', label: '末流势力', color: '#6b7280' },
];

const 关系类型选项 = [
  { value: '同盟', color: '#22c55e', strength: 80 },
  { value: '合作', color: '#3b82f6', strength: 65 },
  { value: '友好', color: '#06b6d4', strength: 60 },
  { value: '中立', color: '#6b7280', strength: 50 },
  { value: '竞争', color: '#f97316', strength: 40 },
  { value: '敌对', color: '#ef4444', strength: 20 },
  { value: '战争', color: '#dc2626', strength: 10 },
  { value: '附属', color: '#8b5cf6', strength: 70 },
  { value: '从属', color: '#a855f7', strength: 30 },
];

const 历史筛选列表 = [
  { value: 'all', label: '全部' },
  { value: 'complete', label: '完整' },
  { value: 'faction', label: '势力' },
  { value: 'relation', label: '关系' },
];

type AIMode = 'complete' | 'faction' | 'relation';
type ViewMode = 'list' | 'map' | 'graph' | 'influence';

function getStanceColor(stance: string): string {
  const opt = 立场选项.find(o => o.value === stance);
  return opt?.color || '#6b7280';
}

function getModeLabel(mode: string): string {
  return (
    (
      { complete: '完整', faction: '势力', relation: '关系' } as Record<
        string,
        string
      >
    )[mode] || mode
  );
}

function getModeBadgeClass(mode: string): string {
  return (
    (
      {
        complete: 'bg-purple-500/20 text-purple-400',
        faction: 'bg-blue-500/20 text-blue-400',
        relation: 'bg-orange-500/20 text-orange-400',
      } as Record<string, string>
    )[mode] || 'bg-purple-500/20 text-purple-400'
  );
}

// ── Source-derived: AI prompt builder (lines 36785-36897) ──
// Source config: t = { 势力描述:'5字内', 势力目标:'5字内', 势力特点:'5字内', 关系描述:'5字内', 势力数量:{最小:5,最大:10}, 增量势力数量:{最小:1,最大:3} }
function buildAIPrompt(
  mode: AIMode,
  势力列表: 势力数据[],
  世界观?: any,
  地图信息?: any,
  地图名称?: string
): string {
  let prompt = `你是一位专业的小说势力阵营设计师，擅长构建复杂的势力格局和阵营关系。
请根据用户的需求和提供的世界观、地图信息，生成详细的势力阵营设定。

`;
  if (势力列表.length > 0) {
    const names = 势力列表.map(f => f.势力名称).filter(Boolean);
    prompt += `【重要约束 - 禁止重复势力】
以下势力名称已存在于数据库中，你绝对不可以生成相同名称的势力：
${names.map(n => `- ${n}`).join('\n')}

请确保生成的所有势力名称都与上述列表不同！

`;
  }
  if (世界观 && Object.keys(世界观).length > 0) {
    prompt += `【世界观背景】
世界名称：${世界观.世界名称 || '未设定'}
世界类型：${世界观.世界类型 || '未设定'}
势力格局：${世界观.势力格局 || '未设定'}
社会结构：${世界观.社会结构 || '未设定'}
主要冲突：${世界观.主要冲突 || '未设定'}

`;
  }
  if (
    地图信息 &&
    ((地图信息.区域列表?.length || 0) > 0 ||
      (地图信息.地点列表?.length || 0) > 0)
  ) {
    prompt += `【地理信息】
地图名称：${地图名称 || 地图信息.地图名称 || '未命名'}
地图数量：${地图信息.地图数量 || 1}

`;
    if (地图信息.区域列表?.length > 0) {
      prompt += `主要区域（共${地图信息.区域列表.length}个）：\n`;
      地图信息.区域列表.slice(0, 10).forEach((r: any) => {
        prompt += `- ${r.名称 || '未命名区域'}${r.类型 ? `（${r.类型}）` : ''}${r.描述 ? `：${r.描述.substring(0, 50)}` : ''}\n`;
      });
      prompt += '\n';
    }
    if (地图信息.地点列表?.length > 0) {
      prompt += `重要地点（共${地图信息.地点列表.length}个）：\n`;
      地图信息.地点列表.slice(0, 15).forEach((p: any) => {
        prompt += `- ${p.名称 || '未命名地点'}${p.类型 ? `（${p.类型}）` : ''}${p.所属区域 ? `，位于${p.所属区域}` : ''}\n`;
      });
      prompt += '\n';
    }
  }
  if (mode === 'complete') {
    prompt += `【输出要求】
请生成完整的势力阵营体系，使用紧凑行格式：

F|势力名称|势力类型|实力等级|立场|领袖|总部位置|描述(5字内)|目标(5字内)|特点(5字内)|核心成员(逗号分隔)|控制区域(逗号分隔)
R|源势力名称|目标势力名称|关系类型|关系强度(0-100)|关系描述(5字内)

【标记说明】F=势力,R=势力关系

【字段规则】
- 势力类型：门派/国家/组织/家族/帮派/宗教/商会/其他
- 实力等级：顶尖/一流/二流/三流/末流
- 立场：正派/邪派/中立/灰色
- 关系类型：同盟/敌对/中立/附属/竞争/从属/合作/战争
- 总部位置/控制区域：必须与地图中的区域和地点对应

【数量要求】
- 势力：5-10个
- 关系：建立合理的势力关系网络

示例：
F|青云宗|门派|一流|正派|天玄真人|青云山|修仙正道领袖|维护正道秩序|剑法传承|天玄真人,清云长老,玄机子|青云山,青云城
R|青云宗|血魔宗|敌对|25|正邪对立,千年世仇`;
  } else if (mode === 'faction') {
    prompt += `【输出要求】
请生成新的势力（增量添加），使用紧凑行格式：

F|势力名称|势力类型|实力等级|立场|领袖|总部位置|描述(5字内)|目标(5字内)|特点(5字内)|核心成员(逗号分隔)|控制区域(逗号分隔)

【标记说明】F=势力

【字段规则】
- 势力类型：门派/国家/组织/家族/帮派/宗教/商会/其他
- 实力等级：顶尖/一流/二流/三流/末流
- 立场：正派/邪派/中立/灰色
- 总部位置/控制区域：必须与地图中的区域和地点对应

【数量要求】生成1-3个新势力`;
  } else {
    prompt += `【输出要求】
请生成势力之间的关系（增量添加），使用紧凑行格式：

R|源势力名称|目标势力名称|关系类型|关系强度(0-100)|关系描述(5字内)

【标记说明】R=势力关系

【字段规则】
- 关系类型：同盟/敌对/中立/附属/竞争/从属/合作/战争
- 关系强度：0-100的数值
- 关系要合理，符合势力的立场和目标`;
  }
  return prompt;
}

// ── Source-derived: parse pipe format (lines 36918-36980) ──
// Source color map: { 门派:'#8b5cf6', 国家:'#3b82f6', ... }
const 势力类型颜色表: Record<string, string> = {
  门派: '#8b5cf6',
  国家: '#3b82f6',
  组织: '#22c55e',
  家族: '#f97316',
  帮派: '#ef4444',
  宗教: '#eab308',
  商会: '#06b6d4',
  其他: '#6b7280',
};

function parseFactionsPipe(text: string) {
  const 势力列表: any[] = [];
  const 势力关系: any[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const tt = line.trim();
    if (!tt) continue;
    if (tt.startsWith('F|')) {
      const parts = tt.slice(2).split('|');
      if (parts.length < 7) continue; // Source: nt.length >= 7
      势力列表.push({
        势力名称: parts[0] || '',
        势力类型: parts[1] || '组织',
        实力等级: parts[2] || '中等',
        立场: parts[3] || '中立',
        领袖: parts[4] || '',
        总部位置: parts[5] || '',
        势力描述: parts[6] || '',
        势力目标: parts[7] || '',
        势力特点: parts[8] || '',
        核心成员: parts[9]
          ? parts[9]
              .split(/[,，]/)
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [],
        控制区域: parts[10]
          ? parts[10]
              .split(/[,，]/)
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [],
        势力颜色: 势力类型颜色表[parts[1]] || '#8b5cf6',
      });
    }
    if (tt.startsWith('R|')) {
      const parts = tt.slice(2).split('|');
      if (parts.length < 3) continue; // Source: nt.length >= 3
      势力关系.push({
        源势力: parts[0] || '',
        目标势力: parts[1] || '',
        关系类型: parts[2] || '中立',
        关系强度: parseInt(parts[3]) || 50,
        关系描述: parts[4] || '',
      });
    }
  }
  if (势力列表.length > 0 || 势力关系.length > 0) {
    return { 势力列表, 势力关系 };
  }
  return null;
}

// Source: X() function (lines 36898-36917)
function parseFactionsResponse(text: string) {
  if (!text) return { 解析失败: true, 原始内容: '' };
  const pipeResult = parseFactionsPipe(text);
  if (pipeResult) return { 数据: pipeResult, 解析失败: false };
  try {
    return { 数据: JSON.parse(text), 解析失败: false };
  } catch {}
  const cm = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (cm)
    try {
      return { 数据: JSON.parse(cm[1]), 解析失败: false };
    } catch {}
  const bm = text.match(/\{[\s\S]*\}/);
  if (bm)
    try {
      return { 数据: JSON.parse(bm[0]), 解析失败: false };
    } catch {}
  return { 解析失败: true, 原始内容: text };
}

// ── Panel component ──
export const FactionsPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  // ── Shared store ──
  const { 通知数据变更 } = useProjectStore();

  // ── Local map list (source: je() lines 37240-37264) ──
  const [分组地图列表, set分组地图列表] = useState<分组地图[]>([]);

  // ── State (source lines 148240-148261) ──
  const [showHistory, setShowHistory] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [stanceFilter, setStanceFilter] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [aiMode, setAiMode] = useState<AIMode>('complete');
  const [showRelationDialog, setShowRelationDialog] = useState(false);
  // ── Data state ──
  const [势力列表, set势力列表] = useState<势力数据[]>([]);
  const [当前势力ID, set当前势力ID] = useState<number | null>(null);
  const [关系列表, set关系列表] = useState<关系数据[]>([]);
  const [生成历史, set生成历史] = useState<生成历史项[]>([]);
  const [历史筛选, set历史筛选] = useState('all');
  const [选中地图ID, set选中地图ID] = useState<number | null>(null);

  // ── Save state ──
  const [保存中, set保存中] = useState(false);
  const [保存成功提示, set保存成功提示] = useState(false);
  const [同步错误, set同步错误] = useState('');

  // ── AI generation state ──
  const [正在生成, set正在生成] = useState(false);
  const [生成进度, set生成进度] = useState('');
  const [生成错误, set生成错误] = useState('');
  const [流式内容, set流式内容] = useState('');
  const [最近生成结果, set最近生成结果] = useState<any>(null);
  const [等待用户确认, set等待用户确认] = useState(false);
  const [生成成功消息, set生成成功消息] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // ── Relation form ──
  const [relationForm, setRelationForm] = useState({
    源势力ID: null as number | null,
    目标势力ID: null as number | null,
    关系类型: '中立',
    关系描述: '',
  });

  // ── Resize (source lines 148374-148411) ──
  const [width, setWidth] = useState(520);
  const resizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWRef = useRef(0);

  // ── Computed ──
  const 当前势力 = useMemo(
    () => 势力列表.find(f => f.id === 当前势力ID) || null,
    [势力列表, 当前势力ID]
  );

  const 过滤后列表 = useMemo(() => {
    let list = 势力列表;
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(
        f =>
          f.势力名称?.toLowerCase().includes(q) ||
          f.势力描述?.toLowerCase().includes(q)
      );
    }
    if (stanceFilter) list = list.filter(f => f.立场 === stanceFilter);
    return list;
  }, [势力列表, searchText, stanceFilter]);

  const 筛选后的生成历史 = useMemo(
    () =>
      历史筛选 === 'all'
        ? 生成历史
        : 生成历史.filter(h => h.生成类型 === 历史筛选),
    [生成历史, 历史筛选]
  );

  const 势力总字符数 = useMemo(() => {
    let count = 0;
    for (const f of 势力列表) {
      count += (f.势力名称 || '').length;
      count += (f.势力描述 || '').length;
      count += (f.势力目标 || '').length;
      count += (f.势力特点 || '').length;
      count += (f.势力历史 || '').length;
      count += (f.领袖 || '').length;
      count += (f.总部位置 || '').length;
      count += (f.成员数量 || '').length;
    }
    return count;
  }, [势力列表]);

  // ── API calls ──
  const API_BASE =
    localStorage.getItem('api_base') || 'http://localhost:3001/api/proxy';
  const getHeaders = useCallback(() => {
    const t = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };
  }, []);

  const loadFromDB = useCallback(async () => {
    if (!projectId) return;
    try {
      // Source: ae() lines 37221-37227 — load factions and relations separately
      const [factionsRes, relationsRes] = await Promise.all([
        fetch(`${API_BASE}/api/factions/project/${projectId}/list`, {
          headers: getHeaders(),
        }),
        fetch(`${API_BASE}/api/factions/project/${projectId}/relations`, {
          headers: getHeaders(),
        }),
      ]);
      const factionsData = await factionsRes.json();
      if (factionsData.success && Array.isArray(factionsData.data)) {
        set势力列表(factionsData.data);
      } else if (factionsData.success && factionsData.data) {
        set势力列表(factionsData.data.势力列表 || factionsData.data || []);
      }
      const relationsData = await relationsRes.json();
      if (relationsData.success && Array.isArray(relationsData.data)) {
        set关系列表(relationsData.data);
      }
    } catch {}
  }, [projectId, API_BASE, getHeaders]);

  // Source: je() lines 37240-37264 — load map list for dropdown
  const load地图列表 = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/geo-maps/project/${projectId}/list`,
        { headers: getHeaders() }
      );
      const data = await res.json();
      const mapList = data.success && Array.isArray(data.data) ? data.data : [];
      if (mapList.length > 0) {
        set分组地图列表(compute分组地图(mapList));
      }
    } catch {}
  }, [projectId, API_BASE, getHeaders]);

  const loadGenerations = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/factions/project/${projectId}/generations`,
        { headers: getHeaders() }
      );
      const data = await res.json();
      if (data.success && data.data) set生成历史(data.data.slice(0, 20));
    } catch {}
  }, [projectId, API_BASE, getHeaders]);

  const saveToDB = useCallback(async () => {
    if (!projectId) return;
    set保存中(true);
    set同步错误('');
    try {
      // Save each faction individually (real API: create/update per faction)
      await Promise.allSettled(
        势力列表.map(f => {
          if (!f.id || f.id > 1000000000000) {
            // New faction: POST /api/factions/project/:id/faction
            return fetch(
              `${API_BASE}/api/factions/project/${projectId}/faction`,
              {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(f),
              }
            );
          }
          // Existing: PUT /api/factions/project/:id/faction/:fid
          return fetch(
            `${API_BASE}/api/factions/project/${projectId}/faction/${f.id}`,
            {
              method: 'PUT',
              headers: getHeaders(),
              body: JSON.stringify(f),
            }
          );
        })
      );
      // Save relations
      await Promise.allSettled(
        关系列表.map(r => {
          if (!r.id || r.id > 1000000000000) {
            return fetch(
              `${API_BASE}/api/factions/project/${projectId}/relations`,
              {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(r),
              }
            );
          }
          return fetch(
            `${API_BASE}/api/factions/project/${projectId}/relations/${r.id}`,
            {
              method: 'PUT',
              headers: getHeaders(),
              body: JSON.stringify(r),
            }
          );
        })
      );
      // Reload to get real IDs
      await loadFromDB();
      set保存成功提示(true);
      setTimeout(() => set保存成功提示(false), 2000);
      通知数据变更('势力');
    } catch (e: any) {
      set同步错误(e.message || '保存失败');
    } finally {
      set保存中(false);
    }
  }, [
    projectId,
    势力列表,
    关系列表,
    API_BASE,
    getHeaders,
    通知数据变更,
    loadFromDB,
  ]);

  // ── CRUD: factions ──
  const addFaction = useCallback(async () => {
    if (!projectId) return;
    const newF: 势力数据 = {
      id: Date.now(),
      势力名称: '新势力',
      势力类型: '组织',
      势力描述: '',
      势力图标: 'ri-group-line',
      势力颜色: '#8b5cf6',
      实力等级: '中等',
      立场: '中立',
      领袖: '',
      总部位置: '',
      成员数量: '',
      关联区域ID: [],
      关联地图ID: null,
      势力目标: '',
      势力特点: '',
      势力历史: '',
      核心成员: [],
      控制区域: [],
      重要据点: [],
    };
    set势力列表(prev => [...prev, newF]);
    set当前势力ID(newF.id);
    // POST to API immediately
    try {
      await fetch(`${API_BASE}/api/factions/project/${projectId}/faction`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(newF),
      });
      await loadFromDB();
    } catch {}
  }, [projectId, API_BASE, getHeaders, loadFromDB]);

  const updateFaction = useCallback(
    (id: number, updates: Partial<势力数据>) => {
      set势力列表(prev =>
        prev.map(f => (f.id === id ? { ...f, ...updates } : f))
      );
    },
    []
  );

  const deleteFaction = useCallback(
    async (id: number) => {
      if (!confirm('确定要删除当前势力吗？')) return;
      // DELETE from API if real ID
      if (projectId && id < 1000000000000) {
        try {
          await fetch(
            `${API_BASE}/api/factions/project/${projectId}/faction/${id}`,
            {
              method: 'DELETE',
              headers: getHeaders(),
            }
          );
        } catch {}
      }
      set势力列表(prev => prev.filter(f => f.id !== id));
      set关系列表(prev =>
        prev.filter(r => r.源势力ID !== id && r.目标势力ID !== id)
      );
      if (当前势力ID === id)
        set当前势力ID(势力列表.find(f => f.id !== id)?.id || null);
    },
    [当前势力ID, 势力列表, projectId, API_BASE, getHeaders]
  );

  const switchFaction = useCallback((id: number) => {
    setViewMode('list');
    set当前势力ID(id);
  }, []);

  // ── CRUD: relations ──
  const addRelation = useCallback(async () => {
    if (!relationForm.源势力ID || !relationForm.目标势力ID) return;
    const src = 势力列表.find(f => f.id === relationForm.源势力ID);
    const tgt = 势力列表.find(f => f.id === relationForm.目标势力ID);
    if (!src || !tgt) return;
    const color =
      关系类型选项.find(o => o.value === relationForm.关系类型)?.color ||
      '#8b5cf6';
    const strength =
      关系类型选项.find(o => o.value === relationForm.关系类型)?.strength || 50;
    const newR: 关系数据 = {
      id: Date.now(),
      源势力ID: relationForm.源势力ID,
      目标势力ID: relationForm.目标势力ID,
      源势力名称: src.势力名称,
      目标势力名称: tgt.势力名称,
      关系类型: relationForm.关系类型,
      关系描述: relationForm.关系描述,
      关系强度: strength,
      关系颜色: color,
    };
    set关系列表(prev => [...prev, newR]);
    setShowRelationDialog(false);
    setRelationForm({
      源势力ID: null,
      目标势力ID: null,
      关系类型: '中立',
      关系描述: '',
    });
    // POST to API immediately
    if (projectId) {
      try {
        await fetch(`${API_BASE}/api/factions/project/${projectId}/relations`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(newR),
        });
        await loadFromDB();
      } catch {}
    }
  }, [relationForm, 势力列表, projectId, API_BASE, getHeaders, loadFromDB]);

  const deleteRelation = useCallback(
    async (id: number) => {
      if (!confirm('确定要删除这条关系吗？')) return;
      // DELETE from API if real ID
      if (projectId && id < 1000000000000) {
        try {
          await fetch(
            `${API_BASE}/api/factions/project/${projectId}/relations/${id}`,
            {
              method: 'DELETE',
              headers: getHeaders(),
            }
          );
        } catch {}
      }
      set关系列表(prev => prev.filter(r => r.id !== id));
    },
    [projectId, API_BASE, getHeaders]
  );

  // ── Auto-save on blur (source: onBlur: T at line 149121 etc.) ──
  const onBlur = useCallback(() => {
    saveToDB();
  }, [saveToDB]);

  // ── AI generation (source lines 150590-151387) ──
  const openAIDialog = useCallback(() => {
    if (正在生成) return;
    setAiPrompt('');
    set流式内容('');
    set最近生成结果(null);
    set生成错误('');
    set生成成功消息('');
    setShowAIDialog(true);
    loadGenerations();
    load地图列表();
  }, [正在生成, loadGenerations, load地图列表]);

  const closeAIDialog = useCallback(() => {
    if (!正在生成) setShowAIDialog(false);
  }, [正在生成]);

  const startGeneration = useCallback(async () => {
    set正在生成(true);
    set生成进度('正在连接AI服务...');
    set生成错误('');
    set流式内容('');
    set最近生成结果(null);
    set等待用户确认(false);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      // Source: getContext (line 37002-37019) — GET /factions/project/{id}/context
      let 世界观: any = {};
      let 地图信息: any = {};
      let 地图详情: any = null;
      if (projectId) {
        try {
          const ctxRes = await fetch(
            `${API_BASE}/api/factions/project/${projectId}/context`,
            { headers: getHeaders() }
          );
          const ctxResult = await ctxRes.json();
          if (ctxResult.success && ctxResult.data) {
            // Source: lines 37006-37008
            世界观 = ctxResult.data.世界观信息 || {};
            地图信息 = ctxResult.data.地图信息 || {};
            ctxResult.data.地图列表 &&
              set分组地图列表(compute分组地图(ctxResult.data.地图列表));
            // Source: lines 37009-37018 — if specific map selected, override 地图信息
            if (选中地图ID && ctxResult.data.地图列表) {
              const sel = ctxResult.data.地图列表.find(
                (m: any) => m.id === 选中地图ID
              );
              if (sel) {
                地图详情 = sel;
                地图信息 = {
                  地图名称: sel.地图名称,
                  地图数量: 1,
                  区域列表: sel.区域列表 || [],
                  地点列表: sel.地点列表 || [],
                };
              }
            }
          }
        } catch {}
      }
      set生成进度('正在生成势力阵营...');
      const systemPrompt = buildAIPrompt(
        aiMode,
        势力列表,
        世界观,
        地图信息,
        地图详情?.地图名称
      );
      let userContent = aiPrompt || '';
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content:
            userContent || '请根据世界观和地图信息，生成完整的势力阵营体系',
        },
      ];
      set流式内容('');
      const rawText = await generateLLM({
        messages,
        temperature: 0.85,
        max_tokens: 4096,
        onChunk: t => {
          set流式内容(t);
          set生成进度('正在接收内容...');
        },
        signal: ac.signal,
      });
      set生成进度('');
      if (!rawText) {
        set生成错误('AI返回为空');
        return;
      }
      // Source: X() parse (line 37048)
      const parsed = parseFactionsResponse(rawText);
      if (parsed.解析失败) {
        set生成错误('解析AI响应失败');
        set最近生成结果({
          解析失败: true,
          原始内容: rawText,
          生成类型: aiMode,
        });
        set等待用户确认(true);
        return;
      }
      const parsedData = parsed.数据 || parsed;
      // Source: line 37057-37061 — set 关联地图ID on generated factions
      if (选中地图ID && parsedData.势力列表) {
        parsedData.势力列表.forEach((f: any) => {
          f.关联地图ID = 选中地图ID;
        });
      }
      const result = {
        id: Date.now(),
        时间: new Date().toLocaleString('zh-CN'),
        势力列表: parsedData.势力列表 || [],
        势力关系: parsedData.势力关系 || [],
        解析失败: false,
      };
      set最近生成结果(result);
      set等待用户确认(true);
      // Source: lines 37065-37069 — success message per mode
      let successMsg = '';
      if (aiMode === 'faction') {
        successMsg = `增量生成完成！新增 ${result.势力列表.length} 个势力`;
      } else if (aiMode === 'relation') {
        successMsg = `增量生成完成！新增 ${result.势力关系.length} 条关系`;
      } else {
        successMsg = `生成完成！共 ${result.势力列表.length} 个势力，${result.势力关系.length} 条关系`;
      }
      set生成成功消息(successMsg);
      // Source: C() save generation (lines 36746-36770) — includes 世界观信息, 地图信息
      if (projectId) {
        saveGeneration('factions' as ModuleName, projectId, {
          提示词: aiPrompt,
          世界观信息: 世界观,
          地图信息: 地图信息,
          生成内容: { 势力列表: result.势力列表, 势力关系: result.势力关系 },
          生成类型: aiMode,
        }).catch(() => {});
      }
      set生成历史(prev =>
        [
          {
            id: result.id,
            时间: result.时间,
            提示词: aiPrompt,
            生成内容: { 势力列表: result.势力列表, 势力关系: result.势力关系 },
            已采用: false,
            生成类型: aiMode,
          },
          ...prev,
        ].slice(0, 20)
      );
    } catch (e: any) {
      if (e.name !== 'AbortError') set生成错误(e.message || '生成失败');
    } finally {
      set正在生成(false);
      set生成进度('');
    }
  }, [aiMode, aiPrompt, 势力列表, projectId, 选中地图ID, API_BASE, getHeaders]);

  const retryGeneration = useCallback(async () => {
    set最近生成结果(null);
    set等待用户确认(false);
    set生成错误('');
    set生成成功消息('');
    await startGeneration();
  }, [startGeneration]);

  const adoptResult = useCallback(async () => {
    if (!最近生成结果 || 最近生成结果.解析失败 || !projectId) return;
    set保存中(true);
    try {
      // Source: ke() lines 37092-37151 — POST each faction, check duplicates
      const duplicateNames: string[] = [];
      const adoptedNames: string[] = [];
      if (最近生成结果.势力列表?.length) {
        const existingNames = new Set(势力列表.map(f => f.势力名称));
        for (const f of 最近生成结果.势力列表) {
          const name = f.势力名称 || f.名称 || '未命名';
          if (name && existingNames.has(name)) {
            duplicateNames.push(name);
            continue; // Skip duplicate
          }
          // Source: R() lines 36587-36611 — create faction payload
          const payload = {
            势力名称: name,
            势力类型: f.势力类型 || f.类型 || '组织',
            势力描述: f.势力描述 || f.描述 || '',
            势力图标: f.势力图标 || 'ri-group-line',
            势力颜色: f.势力颜色 || '#8b5cf6',
            实力等级: f.实力等级 || f.实力 || '中等',
            立场: f.立场 || '中立',
            领袖: f.领袖 || '',
            总部位置: f.总部位置 || '',
            成员数量: f.成员数量 || '',
            关联区域ID: f.关联区域ID || [],
            关联地图ID: 选中地图ID || null,
            势力目标: f.势力目标 || f.目标 || '',
            势力特点: f.势力特点 || f.特点 || '',
            势力历史: f.势力历史 || '',
            核心成员: f.核心成员 || [],
            控制区域: f.控制区域 || [],
            重要据点: f.重要据点 || [],
          };
          try {
            const res = await fetch(
              `${API_BASE}/api/factions/project/${projectId}/faction`,
              {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(payload),
              }
            );
            const result = await res.json();
            if (result.success && result.data) {
              adoptedNames.push(name);
              existingNames.add(name);
            }
          } catch {}
        }
        // Reload to get real IDs from server
        await loadFromDB();
      }
      // POST each relation (source: lines 37111-37130)
      if (最近生成结果.势力关系?.length) {
        // Re-read 势力列表 after reload to have correct name→id mapping
        const currentFactions = await (async () => {
          try {
            const res = await fetch(
              `${API_BASE}/api/factions/project/${projectId}/list`,
              { headers: getHeaders() }
            );
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) return data.data;
          } catch {}
          return 势力列表;
        })();
        // Source: lines 37113-37114 — uses We.源势力 / We.目标势力 (not 源势力名称/目标势力名称)
        const nameToId = new Map<string, number>();
        currentFactions.forEach((f: 势力数据) =>
          nameToId.set(f.势力名称, f.id)
        );
        for (const r of 最近生成结果.势力关系) {
          // Support both 源势力 (pipe format) and 源势力名称 (JSON format)
          const srcName = r.源势力 || r.源势力名称 || '';
          const tgtName = r.目标势力 || r.目标势力名称 || '';
          const src = currentFactions.find(
            (f: 势力数据) => f.势力名称 === srcName
          );
          const tgt = currentFactions.find(
            (f: 势力数据) => f.势力名称 === tgtName
          );
          if (!src || !tgt) continue; // Skip if can't resolve names
          // Source: lines 37117-37129 — P() creates relation
          const relPayload = {
            源势力ID: src.id,
            目标势力ID: tgt.id,
            源势力名称: src.势力名称,
            目标势力名称: tgt.势力名称,
            关系类型: r.关系类型 || '中立',
            关系描述: r.关系描述 || '',
            关系强度: r.关系强度 || 50,
            关系颜色:
              关系类型选项.find(o => o.value === (r.关系类型 || '中立'))
                ?.color || '#8b5cf6',
          };
          try {
            await fetch(
              `${API_BASE}/api/factions/project/${projectId}/relations`,
              {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(relPayload),
              }
            );
          } catch {}
        }
        // Reload to include new relations
        await loadFromDB();
      }
      // Source: lines 37131-37138 — build success message
      let adoptMsg = '';
      if (adoptedNames.length > 0)
        adoptMsg += `成功新增 ${adoptedNames.length} 个势力`;
      if (duplicateNames.length > 0) {
        adoptMsg += adoptMsg ? '，' : '';
        adoptMsg += `跳过 ${duplicateNames.length} 个重复势力（${duplicateNames.join('、')}）`;
      }
      adoptMsg || (adoptMsg = '已成功采用生成结果');
      set生成成功消息(adoptMsg);
      setShowAIDialog(false);
      set最近生成结果(null);
      set等待用户确认(false);
      通知数据变更('势力');
    } catch (e: any) {
      set同步错误(e.message || '采用失败');
    } finally {
      set保存中(false);
    }
  }, [
    最近生成结果,
    势力列表,
    选中地图ID,
    projectId,
    API_BASE,
    getHeaders,
    loadFromDB,
    通知数据变更,
  ]);

  const discardResult = useCallback(() => {
    set最近生成结果(null);
    set等待用户确认(false);
  }, []);

  const adoptHistoryItem = useCallback(
    async (item: 生成历史项) => {
      if (!item.生成内容) return;
      // Source: he() lines 37155-37206 — adopt via API with duplicate checking
      const duplicateNames: string[] = [];
      const adoptedNames: string[] = [];
      set保存中(true);
      try {
        if (item.生成内容.势力列表?.length && projectId) {
          const existingNames = new Set(势力列表.map(f => f.势力名称));
          for (const f of item.生成内容.势力列表) {
            const name = f.势力名称;
            if (name && existingNames.has(name)) {
              duplicateNames.push(name);
              continue;
            }
            const payload = {
              势力名称: name || '未命名',
              势力类型: f.势力类型 || '组织',
              势力描述: f.势力描述 || '',
              势力图标: f.势力图标 || 'ri-group-line',
              势力颜色: f.势力颜色 || '#8b5cf6',
              实力等级: f.实力等级 || '中等',
              立场: f.立场 || '中立',
              领袖: f.领袖 || '',
              总部位置: f.总部位置 || '',
              成员数量: f.成员数量 || '',
              关联区域ID: f.关联区域ID || [],
              关联地图ID: f.关联地图ID || null,
              势力目标: f.势力目标 || '',
              势力特点: f.势力特点 || '',
              势力历史: f.势力历史 || '',
              核心成员: f.核心成员 || [],
              控制区域: f.控制区域 || [],
              重要据点: f.重要据点 || [],
            };
            try {
              const res = await fetch(
                `${API_BASE}/api/factions/project/${projectId}/faction`,
                {
                  method: 'POST',
                  headers: getHeaders(),
                  body: JSON.stringify(payload),
                }
              );
              const result = await res.json();
              if (result.success) {
                adoptedNames.push(name);
                existingNames.add(name);
              }
            } catch {}
          }
          await loadFromDB();
        }
        if (item.生成内容.势力关系?.length && projectId) {
          const currentFactions = await (async () => {
            try {
              const res = await fetch(
                `${API_BASE}/api/factions/project/${projectId}/list`,
                { headers: getHeaders() }
              );
              const data = await res.json();
              if (data.success && Array.isArray(data.data)) return data.data;
            } catch {}
            return 势力列表;
          })();
          for (const r of item.生成内容.势力关系) {
            const srcName = r.源势力 || r.源势力名称 || '';
            const tgtName = r.目标势力 || r.目标势力名称 || '';
            const src = currentFactions.find(
              (f: 势力数据) => f.势力名称 === srcName
            );
            const tgt = currentFactions.find(
              (f: 势力数据) => f.势力名称 === tgtName
            );
            if (!src || !tgt) continue;
            const relPayload = {
              源势力ID: src.id,
              目标势力ID: tgt.id,
              源势力名称: src.势力名称,
              目标势力名称: tgt.势力名称,
              关系类型: r.关系类型 || '中立',
              关系描述: r.关系描述 || '',
              关系强度: r.关系强度 || 50,
              关系颜色:
                关系类型选项.find(o => o.value === (r.关系类型 || '中立'))
                  ?.color || '#8b5cf6',
            };
            try {
              await fetch(
                `${API_BASE}/api/factions/project/${projectId}/relations`,
                {
                  method: 'POST',
                  headers: getHeaders(),
                  body: JSON.stringify(relPayload),
                }
              );
            } catch {}
          }
          await loadFromDB();
        }
        set生成历史(prev =>
          prev.map(h => (h.id === item.id ? { ...h, 已采用: true } : h))
        );
      } catch {
      } finally {
        set保存中(false);
      }
    },
    [saveToDB, projectId, 势力列表, API_BASE, getHeaders, loadFromDB]
  );

  const deleteHistoryItem = useCallback((id: number) => {
    set生成历史(prev => prev.filter(h => h.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    if (confirm('确定要清空所有生成历史吗？')) set生成历史([]);
  }, []);

  // ── Resize handlers (source lines 148374-148411) ──
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      resizeStartXRef.current = e.clientX;
      resizeStartWRef.current = width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [width]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      setWidth(
        Math.max(
          360,
          Math.min(
            800,
            resizeStartWRef.current + (e.clientX - resizeStartXRef.current)
          )
        )
      );
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── Init ──
  useEffect(() => {
    loadFromDB();
    load地图列表();
    通知数据变更('地图');
  }, [loadFromDB, load地图列表, 通知数据变更]);

  // ── Render ──
  return createPortal(
    <div className="v-59d1f01b">
      <div
        className="势力阵营侧边栏容器 fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        {/* Main aside */}
        <aside
          className="势力阵营内容 bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col h-full shadow-lg"
          style={{ width }}
        >
          {/* Header (source lines 148450-148764) */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center rounded-lg w-9 h-9 bg-gradient-to-br from-purple-500/20 to-violet-500/20">
                  <i className="text-lg text-purple-400 ri-group-line" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">势力阵营</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    构建你的势力格局
                  </p>
                </div>
              </div>
              <div
                className="flex items-center gap-1"
                onClick={e => e.stopPropagation()}
              >
                {/* View mode buttons (source lines 148501-148638) */}
                <div className="flex items-center gap-0.5 bg-[var(--bg-card)] rounded p-0.5">
                  <button
                    type="button"
                    className={`p-1.5 rounded transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-purple-500/30 text-purple-400' : 'text-[var(--text-secondary)] hover:text-purple-400'}`}
                    onClick={() => setViewMode('list')}
                    title="列表视图"
                  >
                    <i className="ri-list-unordered" />
                  </button>
                  <button
                    type="button"
                    className={`p-1.5 rounded transition-colors cursor-pointer ${viewMode === 'map' ? 'bg-purple-500/30 text-purple-400' : 'text-[var(--text-secondary)] hover:text-purple-400'}`}
                    onClick={() => setViewMode('map')}
                    title="地图分布"
                  >
                    <i className="ri-map-pin-line" />
                  </button>
                  <button
                    type="button"
                    className={`p-1.5 rounded transition-colors cursor-pointer ${viewMode === 'graph' ? 'bg-purple-500/30 text-purple-400' : 'text-[var(--text-secondary)] hover:text-purple-400'}`}
                    onClick={() => setViewMode('graph')}
                    title="关系图谱"
                  >
                    <i className="ri-mind-map" />
                  </button>
                  <button
                    type="button"
                    className={`p-1.5 rounded transition-colors cursor-pointer ${viewMode === 'influence' ? 'bg-purple-500/30 text-purple-400' : 'text-[var(--text-secondary)] hover:text-purple-400'}`}
                    onClick={() => setViewMode('influence')}
                    title="影响力分析"
                  >
                    <i className="ri-bar-chart-grouped-line" />
                  </button>
                </div>
                {/* Action buttons (source lines 148639-148762) */}
                <button
                  type="button"
                  className={`p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs cursor-pointer ${保存中 ? 'text-orange-400' : 'text-[var(--text-secondary)]'}`}
                  onClick={saveToDB}
                  disabled={保存中}
                  title="保存数据"
                >
                  <i
                    className={
                      保存中 ? 'ri-loader-4-line animate-spin' : 'ri-save-line'
                    }
                  />
                </button>
                <button
                  type="button"
                  className={`p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs cursor-pointer ${showHistory ? 'text-purple-400' : ''}`}
                  onClick={() => setShowHistory(v => !v)}
                  title="生成历史"
                >
                  <i className="ri-time-line" />
                  {生成历史.length ? (
                    <span className="ml-0.5 text-xs">({生成历史.length})</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="p-1.5 hover:bg-purple-500/20 rounded transition-colors text-purple-400 cursor-pointer"
                  onClick={openAIDialog}
                  disabled={正在生成}
                  title="AI生成"
                >
                  <i
                    className={
                      正在生成
                        ? 'ri-loader-4-line animate-spin'
                        : 'ri-magic-line'
                    }
                  />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded transition-colors cursor-pointer"
                  title="关闭"
                >
                  <i className="ri-close-line" />
                </button>
              </div>
            </div>
          </div>

          {/* Body (source lines 148765-149988) */}
          <div className="flex flex-1 overflow-hidden">
            {viewMode === 'list' ? (
              <div
                className={`flex-1 overflow-y-auto p-4 ${showHistory ? 'pr-0' : ''}`}
              >
                {/* Faction list section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <i className="text-purple-400 ri-team-line" /> 势力列表{' '}
                        <span className="text-xs text-[var(--text-secondary)]">
                          ({势力列表.length})
                        </span>
                      </h3>
                    </div>
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2 py-1 text-xs text-purple-400 transition-colors rounded cursor-pointer bg-purple-500/20 hover:bg-purple-500/30"
                      onClick={addFaction}
                    >
                      <i className="ri-add-line" /> 新建
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm"
                      placeholder="搜索势力..."
                      value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                    />
                    <select
                      className="bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm cursor-pointer"
                      value={stanceFilter}
                      onChange={e => setStanceFilter(e.target.value)}
                    >
                      <option value="">全部立场</option>
                      {立场选项.map(o => (
                        <option key={o.value} value={o.value}>
                          {o.value}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* List items */}
                  <div className="space-y-0">
                    {过滤后列表.map(f => (
                      <div
                        key={f.id}
                        className={`p-3 border-b border-[var(--border)] hover:bg-[var(--bg-dark)] cursor-pointer transition-colors ${当前势力ID === f.id ? 'bg-purple-500/10' : ''}`}
                        onClick={() => switchFaction(f.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="flex items-center justify-center w-8 h-8 text-sm text-white rounded-lg"
                            style={{ backgroundColor: f.势力颜色 || '#8b5cf6' }}
                          >
                            <i className={f.势力图标 || 'ri-group-line'} />
                          </div>
                          <div>
                            <div className="text-sm font-medium">
                              {f.势力名称}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                              <span>{f.势力类型}</span>
                              <span
                                className="px-1.5 py-0.5 rounded text-xs"
                                style={{
                                  backgroundColor:
                                    getStanceColor(f.立场) + '20',
                                  color: getStanceColor(f.立场),
                                }}
                              >
                                {f.立场}
                              </span>
                            </div>
                          </div>
                          <div className="ml-auto text-xs text-[var(--text-secondary)]">
                            {f.实力等级}
                          </div>
                        </div>
                      </div>
                    ))}
                    {过滤后列表.length === 0 && (
                      <div className="text-center py-4 text-sm text-[var(--text-secondary)]">
                        暂无势力，点击上方"新建"按钮创建
                      </div>
                    )}
                  </div>
                </div>

                {/* Detail section (source lines 149045-149802) */}
                {当前势力 && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <i className="text-purple-400 ri-edit-line" /> 势力详情
                      </h3>
                      <button
                        type="button"
                        className="p-1 text-red-400 transition-colors rounded cursor-pointer hover:bg-red-500/20"
                        onClick={() => deleteFaction(当前势力.id)}
                        title="删除势力"
                      >
                        <i className="text-sm ri-delete-bin-line" />
                      </button>
                    </div>
                    <div className="space-y-3">
                      {/* Name + Type row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            势力名称
                          </label>
                          <input
                            type="text"
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm"
                            value={当前势力.势力名称}
                            onChange={e =>
                              updateFaction(当前势力.id, {
                                势力名称: e.target.value,
                              })
                            }
                            onBlur={onBlur}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            势力类型
                          </label>
                          <select
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm cursor-pointer"
                            value={当前势力.势力类型}
                            onChange={e =>
                              updateFaction(当前势力.id, {
                                势力类型: e.target.value,
                              })
                            }
                            onBlur={onBlur}
                          >
                            {势力类型选项.map(o => (
                              <option key={o.value} value={o.value}>
                                {o.value}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {/* Level + Stance row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            实力等级
                          </label>
                          <select
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm cursor-pointer"
                            value={当前势力.实力等级}
                            onChange={e =>
                              updateFaction(当前势力.id, {
                                实力等级: e.target.value,
                              })
                            }
                            onBlur={onBlur}
                          >
                            {实力等级选项.map(o => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            立场
                          </label>
                          <select
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm cursor-pointer"
                            value={当前势力.立场}
                            onChange={e =>
                              updateFaction(当前势力.id, {
                                立场: e.target.value,
                              })
                            }
                            onBlur={onBlur}
                          >
                            {立场选项.map(o => (
                              <option key={o.value} value={o.value}>
                                {o.value}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {/* Leader + HQ row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            领袖
                          </label>
                          <input
                            type="text"
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm"
                            placeholder="势力领袖名称"
                            value={当前势力.领袖 || ''}
                            onChange={e =>
                              updateFaction(当前势力.id, {
                                领袖: e.target.value,
                              })
                            }
                            onBlur={onBlur}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            总部位置
                          </label>
                          <input
                            type="text"
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm"
                            placeholder="总部所在地"
                            value={当前势力.总部位置 || ''}
                            onChange={e =>
                              updateFaction(当前势力.id, {
                                总部位置: e.target.value,
                              })
                            }
                            onBlur={onBlur}
                          />
                        </div>
                      </div>
                      {/* Map + Members row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            关联地图
                          </label>
                          <select
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm cursor-pointer"
                            value={当前势力.关联地图ID ?? ''}
                            onChange={e =>
                              updateFaction(当前势力.id, {
                                关联地图ID: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              })
                            }
                            onBlur={onBlur}
                          >
                            <option value="">未关联地图</option>
                            {分组地图列表.map(g => (
                              <optgroup key={g.类型} label={g.类型}>
                                {g.列表.map(m => (
                                  <option key={m.id} value={m.id}>
                                    {m.显示名称}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            成员数量
                          </label>
                          <input
                            type="text"
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm"
                            placeholder="如：数百人、上万人等"
                            value={当前势力.成员数量 || ''}
                            onChange={e =>
                              updateFaction(当前势力.id, {
                                成员数量: e.target.value,
                              })
                            }
                            onBlur={onBlur}
                          />
                        </div>
                      </div>
                      {/* Color picker */}
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                          代表颜色
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            className="w-8 h-8 rounded cursor-pointer"
                            value={当前势力.势力颜色 || '#8b5cf6'}
                            onChange={e =>
                              updateFaction(当前势力.id, {
                                势力颜色: e.target.value,
                              })
                            }
                            onBlur={onBlur}
                          />
                          <input
                            type="text"
                            className="flex-1 bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm"
                            value={当前势力.势力颜色 || ''}
                            onChange={e =>
                              updateFaction(当前势力.id, {
                                势力颜色: e.target.value,
                              })
                            }
                            onBlur={onBlur}
                          />
                        </div>
                      </div>
                      {/* Description */}
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                          势力描述
                        </label>
                        <textarea
                          className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm resize-none"
                          rows={3}
                          placeholder="势力的详细描述..."
                          value={当前势力.势力描述 || ''}
                          onChange={e =>
                            updateFaction(当前势力.id, {
                              势力描述: e.target.value,
                            })
                          }
                          onBlur={onBlur}
                        />
                      </div>
                      {/* Goal */}
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                          势力目标
                        </label>
                        <textarea
                          className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm resize-none"
                          rows={2}
                          placeholder="势力的主要目标和野心..."
                          value={当前势力.势力目标 || ''}
                          onChange={e =>
                            updateFaction(当前势力.id, {
                              势力目标: e.target.value,
                            })
                          }
                          onBlur={onBlur}
                        />
                      </div>
                      {/* Features */}
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                          势力特点
                        </label>
                        <textarea
                          className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm resize-none"
                          rows={2}
                          placeholder="势力的特色和优势..."
                          value={当前势力.势力特点 || ''}
                          onChange={e =>
                            updateFaction(当前势力.id, {
                              势力特点: e.target.value,
                            })
                          }
                          onBlur={onBlur}
                        />
                      </div>
                      {/* History */}
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                          势力历史
                        </label>
                        <textarea
                          className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm resize-none"
                          rows={2}
                          placeholder="势力的历史背景..."
                          value={当前势力.势力历史 || ''}
                          onChange={e =>
                            updateFaction(当前势力.id, {
                              势力历史: e.target.value,
                            })
                          }
                          onBlur={onBlur}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Relations section (source lines 149804-149988) */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <i className="text-purple-400 ri-links-line" /> 势力关系{' '}
                      <span className="text-xs text-[var(--text-secondary)]">
                        ({关系列表.length})
                      </span>
                    </h3>
                    {势力列表.length >= 2 && (
                      <button
                        type="button"
                        className="flex items-center gap-1 px-2 py-1 text-xs text-purple-400 transition-colors rounded cursor-pointer bg-purple-500/20 hover:bg-purple-500/30"
                        onClick={() => setShowRelationDialog(true)}
                      >
                        <i className="ri-add-line" /> 添加关系
                      </button>
                    )}
                  </div>
                  <div>
                    {关系列表.map(r => (
                      <div
                        key={r.id}
                        className="p-3 border-b border-[var(--border)] hover:bg-[var(--bg-dark)] transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {r.源势力名称}
                            </span>
                            <span
                              className="px-2 py-0.5 rounded text-xs"
                              style={{
                                backgroundColor: r.关系颜色 + '20',
                                color: r.关系颜色,
                              }}
                            >
                              {r.关系类型}
                            </span>
                            <span className="text-sm font-medium">
                              {r.目标势力名称}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="p-1 text-red-400 transition-colors rounded cursor-pointer hover:bg-red-500/20"
                            onClick={() => deleteRelation(r.id)}
                          >
                            <i className="text-xs ri-delete-bin-line" />
                          </button>
                        </div>
                        {r.关系描述 && (
                          <p className="text-xs text-[var(--text-secondary)] mt-1">
                            {r.关系描述}
                          </p>
                        )}
                      </div>
                    ))}
                    {关系列表.length === 0 && (
                      <div className="text-center py-4 text-sm text-[var(--text-secondary)]">
                        暂无势力关系
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : viewMode === 'map' ? (
              <div className="flex items-center justify-center flex-1 p-4">
                <div className="text-center text-[var(--text-secondary)]">
                  <i className="block mb-2 text-3xl opacity-50 ri-map-pin-line" />
                  <p className="text-sm">地图分布视图</p>
                  <p className="mt-1 text-xs">需要势力关联地图数据后显示</p>
                </div>
              </div>
            ) : viewMode === 'graph' ? (
              <div className="flex items-center justify-center flex-1 p-4">
                <div className="text-center text-[var(--text-secondary)]">
                  <i className="block mb-2 text-3xl opacity-50 ri-mind-map" />
                  <p className="text-sm">关系图谱视图</p>
                  <p className="mt-1 text-xs">显示势力之间的关系网络</p>
                </div>
              </div>
            ) : viewMode === 'influence' ? (
              <div className="flex items-center justify-center flex-1 p-4">
                <div className="text-center text-[var(--text-secondary)]">
                  <i className="block mb-2 text-3xl opacity-50 ri-bar-chart-grouped-line" />
                  <p className="text-sm">影响力分析视图</p>
                  <p className="mt-1 text-xs">分析各势力的实力和影响力分布</p>
                </div>
              </div>
            ) : null}

            {/* History panel (source lines 150008-150406) */}
            {showHistory && (
              <div className="w-72 border-l border-[var(--border)] bg-[var(--bg-darker)] flex flex-col overflow-hidden">
                <div className="p-3 border-b border-[var(--border)] flex items-center justify-between">
                  <h4 className="flex items-center gap-1 text-sm font-medium">
                    <i className="text-purple-400 ri-time-line" /> 生成历史
                    {生成历史.length ? <span>({生成历史.length})</span> : null}
                  </h4>
                  {生成历史.length > 0 && (
                    <button
                      className="text-xs text-red-400 transition-colors cursor-pointer hover:text-red-500"
                      onClick={clearHistory}
                    >
                      清空
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 p-2">
                  {历史筛选列表.map(f => (
                    <button
                      key={f.value}
                      type="button"
                      className={`px-2 py-1 rounded text-xs transition-colors cursor-pointer ${历史筛选 === f.value ? 'bg-purple-500 text-white' : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] hover:bg-[var(--border)]'}`}
                      onClick={() => set历史筛选(f.value)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                  {筛选后的生成历史.length === 0 ? (
                    <div className="text-center py-6 text-[var(--text-secondary)]">
                      <i className="block mb-2 text-2xl opacity-50 ri-magic-line" />
                      <p className="text-xs">暂无生成记录</p>
                    </div>
                  ) : (
                    筛选后的生成历史.map(item => (
                      <div
                        key={item.id}
                        className={`p-3 bg-[var(--bg-card)] rounded-lg text-sm border border-transparent hover:border-[var(--border)] transition-colors ${item.已采用 ? 'border-purple-500/30 bg-purple-500/5' : ''}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-[var(--text-secondary)]">
                              {item.时间}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs ${getModeBadgeClass(item.生成类型)}`}
                            >
                              {getModeLabel(item.生成类型)}
                            </span>
                          </div>
                          <div className="text-xs">
                            {item.已采用 ? (
                              <span className="text-green-400 flex items-center gap-0.5">
                                <i className="ri-check-line" />
                                已采用
                              </span>
                            ) : (
                              <span className="text-[var(--text-secondary)] flex items-center gap-0.5">
                                <i className="ri-time-line" />
                                待处理
                              </span>
                            )}
                          </div>
                        </div>
                        <p
                          className="text-xs text-[var(--text-secondary)] truncate mb-2"
                          title={item.提示词}
                        >
                          {item.提示词 || '无提示词'}
                        </p>
                        {item.生成内容 && (
                          <div className="flex gap-2 text-xs text-[var(--text-secondary)] mb-2">
                            {item.生成内容.势力列表 && (
                              <span>
                                势力: {item.生成内容.势力列表.length}个
                              </span>
                            )}
                            {item.生成内容.势力关系 && (
                              <span>
                                关系: {item.生成内容.势力关系.length}条
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex gap-1">
                          {!item.已采用 && (
                            <button
                              type="button"
                              className="flex-1 px-2 py-1 text-xs text-purple-400 transition-colors rounded cursor-pointer bg-purple-500/20 hover:bg-purple-500/30"
                              onClick={() => adoptHistoryItem(item)}
                              disabled={保存中}
                            >
                              <i className="ri-check-line mr-0.5" />
                              采用
                            </button>
                          )}
                          <button
                            type="button"
                            className="px-2 py-1 bg-[var(--bg-dark)] hover:bg-red-500/20 hover:text-red-400 rounded text-xs transition-colors cursor-pointer"
                            onClick={() => deleteHistoryItem(item.id)}
                            title="删除此记录"
                          >
                            <i className="ri-delete-bin-line" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer status bar (source lines 150413-150519) */}
          <div className="shrink-0 px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-3">
                {保存成功提示 ? (
                  <span className="flex items-center gap-1 text-green-400">
                    <i className="ri-check-line" /> 保存成功
                  </span>
                ) : (
                  <span>
                    <i
                      className={`ri-save-line mr-1 ${保存中 ? 'animate-spin' : ''}`}
                    />{' '}
                    {保存中 ? '保存中...' : '已自动保存'}
                  </span>
                )}
                <span>
                  <i className="ri-team-line" /> {势力列表.length} 个势力
                </span>
                <span>
                  <i className="ri-links-line" /> {关系列表.length} 条关系
                </span>
                <span>
                  <i className="ri-file-text-line" /> {势力总字符数} 字符
                </span>
              </div>
              {同步错误 && (
                <span className="text-red-400">
                  <i className="mr-1 ri-error-warning-line" /> {同步错误}
                </span>
              )}
            </div>
          </div>
        </aside>

        {/* Resize handle */}
        <div
          className={`w-2 cursor-col-resize hover:bg-purple-500/50 active:bg-purple-500 transition-colors shrink-0 relative z-10 ${resizingRef.current ? 'bg-purple-500' : 'bg-transparent'}`}
          onMouseDown={startResize}
          title="拖拽调整宽度"
        />

        {/* Backdrop */}
        <div
          className="fixed top-0 bottom-0 right-0 transition-colors bg-black/0 hover:bg-black/5"
          style={{ left: (leftOffset || 0) + width + 4 }}
          onClick={onClose}
        />
      </div>

      {/* AI Generation Dialog (source lines 150565-151396) */}
      {showAIDialog &&
        createPortal(
          <div
            className="势力阵营侧边栏容器 fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={e => {
              if (e.target === e.currentTarget) closeAIDialog();
            }}
          >
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                <h3 className="flex items-center gap-2 font-semibold">
                  <i
                    className={
                      aiMode !== 'complete'
                        ? 'ri-add-circle-line text-blue-400'
                        : 'ri-magic-line text-purple-400'
                    }
                  />
                  {aiMode === 'complete'
                    ? 'AI生成势力阵营'
                    : aiMode === 'faction'
                      ? 'AI增量生成势力'
                      : 'AI增量生成关系'}
                </h3>
                <button
                  type="button"
                  onClick={closeAIDialog}
                  className="p-1 hover:bg-[var(--border)] rounded transition-colors cursor-pointer"
                  disabled={正在生成}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              {/* Body */}
              <div className="flex-1 p-4 overflow-y-auto">
                {/* Mode selector */}
                <div className="mb-4">
                  <label className="text-sm text-[var(--text-secondary)] mb-2 block">
                    生成模式
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['complete', 'faction', 'relation'] as AIMode[]).map(
                      mode => (
                        <button
                          key={mode}
                          type="button"
                          className={`p-3 rounded-lg text-sm transition-colors cursor-pointer border ${aiMode === mode ? 'bg-purple-500/30 text-purple-300 border-purple-500' : 'bg-[var(--bg-dark)] border-[var(--border)] hover:border-purple-500/50'}`}
                          onClick={() => setAiMode(mode)}
                        >
                          <i
                            className={`block text-xl mb-1 ${{ complete: 'ri-apps-line', faction: 'ri-team-line', relation: 'ri-links-line' }[mode]}`}
                          />
                          {
                            {
                              complete: '完整生成',
                              faction: '增量势力',
                              relation: '增量关系',
                            }[mode]
                          }
                        </button>
                      )
                    )}
                  </div>
                </div>
                {/* Incremental info */}
                {aiMode !== 'complete' && (
                  <div className="mb-4 p-3 bg-[var(--bg-dark)] rounded-lg">
                    <div className="flex items-start gap-2 text-sm">
                      <i className="ri-information-line mt-0.5" />
                      <div>
                        <p className="font-medium">增量生成模式</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          AI将生成新的{aiMode === 'faction' ? '势力' : '关系'}
                          并合并到当前数据，不会覆盖已有内容。
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {/* Map selector (source lines 150785-150890) */}
                <div className="mb-4">
                  <label className="text-sm text-[var(--text-secondary)] mb-2 block">
                    <i className="mr-1 text-green-400 ri-map-2-line" /> 关联地图
                  </label>
                  <select
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm cursor-pointer"
                    value={选中地图ID ?? ''}
                    onChange={e =>
                      set选中地图ID(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    disabled={正在生成}
                  >
                    <option value="">使用所有地图信息</option>
                    {分组地图列表.map(g => (
                      <optgroup key={g.类型} label={g.类型}>
                        {g.列表.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.显示名称}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    <i className="mr-1 ri-information-line" />
                    选择特定地图后，AI将基于该地图的区域和地点生成势力，并自动关联到该地图
                  </p>
                </div>
                {/* Prompt */}
                <div className="mb-4">
                  <label className="text-sm text-[var(--text-secondary)] mb-2 block">
                    {aiMode !== 'complete'
                      ? '生成提示词（可选）'
                      : '生成提示词'}
                  </label>
                  <textarea
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:border-purple-500 transition-colors"
                    placeholder={
                      aiMode === 'complete'
                        ? '描述你想要的势力阵营，如：创建一个仙侠世界的势力格局，包含正邪两道的门派...'
                        : aiMode === 'faction'
                          ? '描述你想要新增的势力特点，如：生成一个神秘的隐世门派...'
                          : '描述你想要新增的关系特点，如：生成各大门派之间的对立关系...'
                    }
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    disabled={正在生成}
                  />
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    <i className="mr-1 ri-information-line" />{' '}
                    {aiMode === 'complete'
                      ? 'AI会根据当前世界观信息生成势力阵营，包括势力和关系'
                      : `AI会根据当前世界观和已有内容生成新的${aiMode === 'faction' ? '势力' : '关系'}`}
                  </p>
                </div>
                {/* Progress */}
                {(正在生成 || 生成进度) && (
                  <div className="p-3 mb-4 rounded-lg bg-purple-500/10">
                    <div className="flex items-center gap-2 text-sm">
                      <i
                        className={
                          正在生成
                            ? 'ri-loader-4-line animate-spin text-purple-400'
                            : 'ri-check-line text-green-400'
                        }
                      />
                      <span>{生成进度}</span>
                    </div>
                  </div>
                )}
                {/* Success message */}
                {生成成功消息 && (
                  <div className="p-3 mb-4 border rounded-lg bg-green-500/10 border-green-500/30">
                    <div className="flex items-center gap-2 text-sm font-medium text-green-400">
                      <i className="ri-check-circle-line" /> {生成成功消息}
                    </div>
                  </div>
                )}
                {/* Error */}
                {生成错误 && (
                  <div className="p-3 mb-4 text-sm text-red-400 border rounded-lg bg-red-500/10 border-red-500/30">
                    <div className="flex items-start gap-2">
                      <i className="ri-error-warning-line mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">解析失败</p>
                        <p className="text-xs text-red-300/80">{生成错误}</p>
                      </div>
                    </div>
                  </div>
                )}
                {/* Result preview (source lines 151031-151210) */}
                {最近生成结果 && !正在生成 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="flex items-center gap-2 text-sm font-medium">
                        <i className="text-purple-400 ri-eye-line" />{' '}
                        生成结果预览
                      </h4>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {最近生成结果.时间}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {最近生成结果.势力列表?.length > 0 && (
                        <div className="bg-[var(--bg-dark)] rounded-lg p-3">
                          <h6 className="mb-1 text-sm">
                            <i className="mr-1 text-purple-400 ri-team-line" />{' '}
                            势力 ({最近生成结果.势力列表.length})
                          </h6>
                          <div className="flex flex-wrap gap-1">
                            {最近生成结果.势力列表
                              .slice(0, 5)
                              .map((f: any, i: number) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 bg-[var(--bg-card)] rounded text-xs"
                                >
                                  {f.势力名称 || `势力${i + 1}`}
                                </span>
                              ))}
                            {最近生成结果.势力列表.length > 5 && (
                              <span className="text-xs text-[var(--text-secondary)]">
                                +{最近生成结果.势力列表.length - 5} 更多
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {最近生成结果.势力关系?.length > 0 && (
                        <div className="bg-[var(--bg-dark)] rounded-lg p-3">
                          <h6 className="mb-1 text-sm">
                            <i className="mr-1 text-blue-400 ri-links-line" />{' '}
                            关系 ({最近生成结果.势力关系.length})
                          </h6>
                          <div className="flex flex-wrap gap-1">
                            {最近生成结果.势力关系
                              .slice(0, 3)
                              .map((r: any, i: number) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 bg-[var(--bg-card)] rounded text-xs"
                                >
                                  {r.源势力名称} → {r.目标势力名称}
                                </span>
                              ))}
                            {最近生成结果.势力关系.length > 3 && (
                              <span className="text-xs text-[var(--text-secondary)]">
                                +{最近生成结果.势力关系.length - 3} 更多
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Streaming preview */}
                {流式内容 && 正在生成 && (
                  <div className="mb-4">
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      生成预览
                    </label>
                    <div className="bg-[var(--bg-dark)] rounded-lg p-3 text-xs max-h-40 overflow-y-auto whitespace-pre-wrap font-mono">
                      {流式内容.slice(-500)}
                    </div>
                  </div>
                )}
              </div>
              {/* Footer buttons (source lines 151233-151387) */}
              <div className="p-4 border-t border-[var(--border)]">
                {等待用户确认 && 最近生成结果 ? (
                  <div className="flex gap-2">
                    {!最近生成结果.解析失败 && (
                      <button
                        type="button"
                        className="flex items-center justify-center flex-1 gap-1 py-2 text-sm rounded-lg cursor-pointer btn-primary"
                        onClick={adoptResult}
                        disabled={保存中}
                      >
                        <i
                          className={
                            保存中
                              ? 'ri-loader-4-line animate-spin'
                              : 'ri-check-line'
                          }
                        />{' '}
                        {保存中 ? '保存中...' : '采用结果'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="flex items-center justify-center flex-1 gap-1 px-4 py-2 text-sm text-orange-400 transition-colors rounded-lg cursor-pointer bg-orange-500/20 hover:bg-orange-500/30"
                      onClick={retryGeneration}
                      disabled={正在生成}
                    >
                      <i className="ri-refresh-line" /> 重新生成
                    </button>
                    <button
                      type="button"
                      className="flex-1 px-4 py-2 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg text-sm flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      onClick={discardResult}
                      disabled={保存中}
                    >
                      <i className="ri-delete-bin-line" /> 丢弃
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 px-4 py-2 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg text-sm transition-colors cursor-pointer"
                      onClick={closeAIDialog}
                      disabled={正在生成}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="flex items-center justify-center flex-1 gap-1 py-2 text-sm rounded-lg cursor-pointer btn-primary"
                      onClick={startGeneration}
                      disabled={正在生成}
                    >
                      <i
                        className={
                          正在生成
                            ? 'ri-loader-4-line animate-spin'
                            : 'ri-magic-line'
                        }
                      />{' '}
                      {正在生成
                        ? '生成中...'
                        : aiMode !== 'complete'
                          ? '开始增量生成'
                          : '开始生成'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Relation Dialog (source lines 151397-151680) */}
      {showRelationDialog &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={e => {
              if (e.target === e.currentTarget) setShowRelationDialog(false);
            }}
          >
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                <h3 className="font-semibold">添加势力关系</h3>
                <button
                  type="button"
                  onClick={() => setShowRelationDialog(false)}
                  className="p-1 hover:bg-[var(--bg-dark)] rounded cursor-pointer"
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    源势力
                  </label>
                  <select
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm cursor-pointer"
                    value={relationForm.源势力ID ?? ''}
                    onChange={e =>
                      setRelationForm({
                        ...relationForm,
                        源势力ID: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  >
                    <option value="">选择势力</option>
                    {势力列表.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.势力名称}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    关系类型
                  </label>
                  <select
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm cursor-pointer"
                    value={relationForm.关系类型}
                    onChange={e =>
                      setRelationForm({
                        ...relationForm,
                        关系类型: e.target.value,
                      })
                    }
                  >
                    {关系类型选项.map(o => (
                      <option key={o.value} value={o.value}>
                        {o.value}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    目标势力
                  </label>
                  <select
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm cursor-pointer"
                    value={relationForm.目标势力ID ?? ''}
                    onChange={e =>
                      setRelationForm({
                        ...relationForm,
                        目标势力ID: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  >
                    <option value="">选择势力</option>
                    {势力列表
                      .filter(f => f.id !== relationForm.源势力ID)
                      .map(f => (
                        <option key={f.id} value={f.id}>
                          {f.势力名称}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    关系描述
                  </label>
                  <textarea
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm resize-none"
                    rows={2}
                    placeholder="描述两个势力之间的关系..."
                    value={relationForm.关系描述}
                    onChange={e =>
                      setRelationForm({
                        ...relationForm,
                        关系描述: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded text-sm bg-[var(--bg-dark)] hover:bg-[var(--border)] cursor-pointer transition-colors"
                  onClick={() => setShowRelationDialog(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm text-purple-300 transition-colors rounded cursor-pointer bg-purple-500/30 hover:bg-purple-500/40"
                  onClick={addRelation}
                  disabled={!relationForm.源势力ID || !relationForm.目标势力ID}
                >
                  确认
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Scoped CSS */}
      <style>{`
        .势力阵营侧边栏容器[data-v-59d1f01b], .v-59d1f01b .势力阵营侧边栏容器 { transform-origin: left center; }
        .v-59d1f01b .btn-primary {
          background: linear-gradient(135deg, #8b5cf64d, #a855f74d);
          border: 1px solid rgba(139, 92, 246, 0.5);
          color: #c4b5fd;
        }
        .v-59d1f01b .btn-primary:hover:not(:disabled) { background: linear-gradient(135deg, #8b5cf666, #a855f766); }
        .v-59d1f01b .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>,
    document.body
  );
};

export default FactionsPanel;
