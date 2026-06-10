import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import { generateLLM } from './panel-shared';
import { API_BASE, getAuthHeaders } from '../useWorldApi';

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

/* Source-derived: foreshadowing fields (源码 lines 94516-94522) */
interface 伏笔数据 {
  id: number;
  伏笔名称: string;
  重要度: string;
  伏笔类型: string;
  影响范围: string;
  埋设章节名: string;
  预计回收章节: string;
  伏笔描述: string;
}

/* Source-derived: options (源码 lines 8502-8513) */
const 重要度选项 = ['极高', '高', '中', '低'];
const 类型选项 = ['剧情伏笔', '人物伏笔', '物品伏笔', '线索伏笔', '暗示伏笔'];
const 影响范围选项 = ['单线', '多线', '全局'];

const 重要度样式: Record<string, string> = {
  极高: 'bg-red-500/20 text-red-400',
  高: 'bg-orange-500/20 text-orange-400',
  中: 'bg-blue-500/20 text-blue-400',
  低: 'bg-gray-500/20 text-gray-400',
};

/* ── AI prompt & parsers (source-derived pipe format) ── */

/** Vue source: Ee(Lt, Fe, qe, me) line 9021-9180 */
const 伏笔类型说明: Record<string, string> = {
  剧情伏笔: '影响主线或支线剧情发展的关键伏笔',
  人物伏笔: '与角色身份、背景、命运相关的伏笔',
  物品伏笔: '关于重要道具、宝物等物品的伏笔',
  线索伏笔: '指向某个谜团或秘密的线索',
  暗示伏笔: '对未来事件或真相的暗示',
};

function buildForeshadowingPrompt(
  上下文: {
    项目信息?: { 项目名称: string; 项目类型: string };
    世界观信息?: { 世界名称: string; 核心规则: string };
    故事核心?: { 核心主题: string; 核心冲突: string };
    角色列表?: { 角色姓名: string; 角色类型: string }[];
    已有大纲?: { 标题: string; 节点类型: string }[];
  } | null,
  已有伏笔名: string[],
  伏笔类型: string = '',
  章节范围: {
    开始章节名: string;
    结束章节名: string;
  } | null = null
): string {
  let s = `你是一位专业的小说伏笔设计师，擅长设计各类伏笔、线索和悬念。\n\n`;

  // 【指定伏笔类型】 Vue line 9027-9031
  if (伏笔类型) {
    s += `【指定伏笔类型】\n用户指定生成"${伏笔类型}"类型的伏笔，请严格按照该类型进行设计。\n各类型说明：\n`;
    for (const [k, v] of Object.entries(伏笔类型说明)) {
      s += `- ${k}：${v}\n`;
    }
    s += '\n';
  }

  // Context injections — Vue line 9032-9075
  if (上下文) {
    // 【项目信息】 Vue line 9033-9035
    if (上下文.项目信息) {
      s += `【项目信息】\n项目名称：${上下文.项目信息.项目名称 || '未设定'}\n项目类型：${上下文.项目信息.项目类型 || '未设定'}\n\n`;
    }
    // 【世界观背景】 Vue line 9036-9038
    if (上下文.世界观信息) {
      s += `【世界观背景】\n世界名称：${上下文.世界观信息.世界名称 || '未设定'}\n核心规则：${上下文.世界观信息.核心规则 || '未设定'}\n\n`;
    }
    // 【故事核心】 Vue line 9039-9041
    if (上下文.故事核心) {
      s += `【故事核心】\n核心主题：${上下文.故事核心.核心主题 || '未设定'}\n核心冲突：${上下文.故事核心.核心冲突 || '未设定'}\n\n`;
    }
    // 【主要角色】 max 5 — Vue line 9042-9048
    if (上下文.角色列表 && 上下文.角色列表.length > 0) {
      s += `【主要角色】\n`;
      上下文.角色列表.slice(0, 5).forEach(r => {
        s += `- ${r.角色姓名}(${r.角色类型})\n`;
      });
      s += '\n';
    }
    // 【章节大纲】 filtered, max 30 — Vue line 9049-9060
    if (上下文.已有大纲 && 上下文.已有大纲.length > 0) {
      const chapters = 上下文.已有大纲.filter(n => n.节点类型 === '章');
      const list = chapters.length > 0 ? chapters : 上下文.已有大纲;
      s += `【章节大纲（用于关联，共${list.length}章）】\n`;
      list.slice(0, 30).forEach(n => {
        s += `${n.标题}\n`;
      });
      s += '\n';
    }
  }

  // 【绝对禁止重复】 Vue line 9061-9065
  if (已有伏笔名.length > 0) {
    s += `\n╔══════════════════════════════════════════════════════════════╗\n║  【绝对禁止重复】以下伏笔名称已被使用，生成任何重复名称将导致任务失败\n╚══════════════════════════════════════════════════════════════════════════╝\n已存在的伏笔(${已有伏笔名.length}个)：${已有伏笔名.slice(0, 20).join('、')}\n`;
  }

  // 【强制章节边界约束】 8 sub-constraints — Vue line 9066-9075
  if (章节范围 && (章节范围.开始章节名 || 章节范围.结束章节名)) {
    const start = 章节范围.开始章节名 || '第1章';
    const end = 章节范围.结束章节名 || '最后一章';
    s += `\n【强制章节边界约束】\n`;
    s += `1. 埋设章节名必须固定为"${start}"，不可偏离\n`;
    s += `2. 预计回收章节必须固定为"${end}"，不可偏离\n`;
    s += `3. 埋设位置必须合理自然，融入剧情\n`;
    s += `4. 回收时机必须与情节发展匹配\n`;
    s += `5. 埋设到回收之间必须有足够的伏笔发酵期\n`;
    s += `6. 不可在埋设后立即回收\n`;
    s += `7. 回收效果必须与埋设时的铺垫呼应\n`;
    s += `8. 章节名必须与大纲中的章节名完全一致\n`;
    s += '\n';
  }

  // 【输出格式】— Vue line 9109-9114
  s += `【输出格式】（极简格式，节省token）
N|伏笔名称|伏笔类型|重要度
D|伏笔描述
B|埋设章节名|埋设位置
H|预计回收章节|影响范围
S|章节名|关联类型|关联描述|解密程度

`;

  // 【格式说明】— Vue line 9116-9129
  s += `【格式说明】
- N: 基本信息（必填，第1行）
  - 伏笔类型：剧情伏笔/人物伏笔/物品伏笔/线索伏笔/暗示伏笔
  - 重要度：极高/高/中/低
- D: 伏笔描述（必填，10-50字）
- B: 埋设信息（必填）
  - 埋设章节名：必须包含章节编号，如"第10章 初见苏晚"
  - 埋设位置：具体的埋设方式（10-30字）
- H: 回收信息（必填）
  - 预计回收章节：必须包含章节编号
  - 影响范围：单线/多线/全局
- S: 章节关联（可多行，建议2-5个）
  - 关联类型：埋设/暗示/呼应/回收
  - 解密程度：0-100的整数

`;

  // 【输出示例】— Vue line 9131-9139
  s += `【输出示例】
N|神秘玉佩|物品伏笔|高
D|主角捡到的古玉佩，暗藏惊天的传承秘密
B|第5章 古洞奇遇|在古洞石台上发现玉佩
H|第50章 玉佩觉醒|全局
S|第5章 古洞奇遇|埋设|发现神秘玉佩，隐隐有光芒|0
S|第15章 玉佩异动|暗示|玉佩在危险时发出微光|20
S|第30章 传承显现|呼应|玉佩投影出神秘功法|60
S|第50章 玉佩觉醒|回收|玉佩完全觉醒，传承现世|100

`;

  // 【核心要求】— Vue line 9141-9144
  s += `【核心要求】
1. 章节关联应按故事时间顺序排列
2. 章节名必须从【章节大纲】中选取
3. ⚠️ 伏笔名称必须唯一
`;

  // 【重要规则】— Vue line 9172-9177
  s += `【重要规则】
1. 严格按格式输出，每行一个项
2. N行必须在第一行
3. 不要输出任何其他内容
4. ⚠️ 在输出前检查伏笔名称是否与已有名称重复`;

  return s;
}

/** Parse Vue-format pipe: N|伏笔名称|伏笔类型|重要度, D|描述, B|埋设章节名|埋设位置, H|预计回收章节|影响范围, S|章节名|关联类型|关联描述|解密程度 */
interface PipeForeshadowChapter {
  章节名: string;
  关联类型: string;
  关联描述: string;
  解密程度: string;
}

interface PipeForeshadowData {
  伏笔名称: string;
  伏笔类型: string;
  重要度: string;
  伏笔描述: string;
  埋设章节名: string;
  埋设位置: string;
  预计回收章节: string;
  影响范围: string;
  章节关联: PipeForeshadowChapter[];
}

function parseForeshadowingPipe(text: string): PipeForeshadowData[] {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const items: PipeForeshadowData[] = [];
  let current:
    | (Partial<PipeForeshadowData> & { 章节关联: PipeForeshadowChapter[] })
    | null = null;

  const pushItem = (
    c: Partial<PipeForeshadowData> & { 章节关联: PipeForeshadowChapter[] }
  ) => {
    items.push({
      伏笔名称: c.伏笔名称 || '未命名',
      伏笔类型: c.伏笔类型 || '剧情伏笔',
      重要度: c.重要度 || '中',
      伏笔描述: c.伏笔描述 || '',
      埋设章节名: c.埋设章节名 || '',
      埋设位置: c.埋设位置 || '',
      预计回收章节: c.预计回收章节 || '',
      影响范围: c.影响范围 || '单线',
      章节关联: c.章节关联 || [],
    });
  };

  for (const line of lines) {
    if (line.startsWith('N|')) {
      if (current && current.伏笔名称) pushItem(current);
      const parts = line.slice(2).split('|');
      current = {
        伏笔名称: (parts[0] || '').trim(),
        伏笔类型: (parts[1] || '剧情伏笔').trim(),
        重要度: (parts[2] || '中').trim(),
        章节关联: [],
      };
    } else if (line.startsWith('D|') && current) {
      current.伏笔描述 = line.slice(2).trim();
    } else if (line.startsWith('B|') && current) {
      const parts = line.slice(2).split('|');
      current.埋设章节名 = (parts[0] || '').trim();
      current.埋设位置 = (parts[1] || '').trim();
    } else if (line.startsWith('H|') && current) {
      const parts = line.slice(2).split('|');
      current.预计回收章节 = (parts[0] || '').trim();
      current.影响范围 = (parts[1] || '单线').trim();
    } else if (line.startsWith('S|') && current) {
      const parts = line.slice(2).split('|');
      current.章节关联.push({
        章节名: (parts[0] || '').trim(),
        关联类型: (parts[1] || '').trim(),
        关联描述: (parts[2] || '').trim(),
        解密程度: (parts[3] || '').trim(),
      });
    }
  }

  if (current && current.伏笔名称) pushItem(current);
  return items;
}

/** Convert pipe data to 伏笔数据 for UI */
function pipeTo伏笔数据(pipeItems: PipeForeshadowData[]): 伏笔数据[] {
  return pipeItems.map((p, i) => ({
    id: Date.now() + i,
    伏笔名称: p.伏笔名称,
    重要度: p.重要度,
    伏笔类型: p.伏笔类型,
    影响范围: p.影响范围,
    埋设章节名: p.埋设章节名,
    预计回收章节: p.预计回收章节,
    伏笔描述: p.伏笔描述,
  }));
}

function parseForeshadowingResponse(text: string): 伏笔数据[] | null {
  if (!text) return null;
  // Try pipe format first (Vue format)
  const pipeResults = parseForeshadowingPipe(text.trim());
  if (pipeResults.length > 0) return pipeTo伏笔数据(pipeResults);
  // JSON fallback
  try {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : parsed.伏笔列表 || [];
    if (arr.length > 0) return arr;
  } catch {}
  const codeMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeMatch)
    try {
      const parsed = JSON.parse(codeMatch[1]);
      const arr = Array.isArray(parsed) ? parsed : parsed.伏笔列表 || [];
      if (arr.length > 0) return arr;
    } catch {}
  return null;
}

export const ForeshadowingPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const [伏笔列表, set伏笔列表] = useState<伏笔数据[]>([]);
  const [当前ID, set当前ID] = useState<number | null>(null);
  const [搜索词, set搜索词] = useState('');
  const [重要度过滤, set重要度过滤] = useState('');

  const [width, setWidth] = useState(520);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load foreshadow data
  useEffect(() => {
    if (!projectId) return;
    fetch(`${API_BASE}/api/foreshadows/project/${projectId}/list`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data))
          set伏笔列表(result.data);
      })
      .catch(() => {});
  }, [projectId]);

  /* AI Generation state (源码 line 234606) */
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [genResult, setGenResult] = useState<伏笔数据[] | null>(null);
  const [genError, setGenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const 当前伏笔 = 伏笔列表.find(f => f.id === 当前ID) || null;

  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    setSaved(false);
    try {
      // Sync each foreshadow to server
      await Promise.allSettled(
        伏笔列表.map(f => {
          if (!f.id || f.id > 1000000000000) {
            // New item (temp ID): POST
            return fetch(
              `${API_BASE}/api/foreshadows/project/${projectId}/foreshadow`,
              {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(f),
              }
            );
          }
          // Existing item: PUT
          return fetch(
            `${API_BASE}/api/foreshadows/project/${projectId}/foreshadow/${f.id}`,
            {
              method: 'PUT',
              headers: getAuthHeaders(),
              body: JSON.stringify(f),
            }
          );
        })
      );
      // Reload from server to get real IDs
      const res = await fetch(
        `${API_BASE}/api/foreshadows/project/${projectId}/list`,
        {
          headers: getAuthHeaders(),
        }
      );
      const result = await res.json();
      if (result.success && Array.isArray(result.data))
        set伏笔列表(result.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectId, 伏笔列表]);

  const addF = useCallback(async () => {
    if (!projectId) return;
    const newItem: Omit<伏笔数据, 'id'> = {
      伏笔名称: '新伏笔',
      重要度: '中',
      伏笔类型: '剧情伏笔',
      影响范围: '单线',
      埋设章节名: '',
      预计回收章节: '',
      伏笔描述: '',
    };
    try {
      const res = await fetch(
        `${API_BASE}/api/foreshadows/project/${projectId}/foreshadow`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(newItem),
        }
      );
      const result = await res.json();
      if (result.success && result.data) {
        set伏笔列表(prev => [...prev, result.data]);
        set当前ID(result.data.id);
      }
    } catch {
      // Fallback to local state
      const id = Date.now();
      set伏笔列表(prev => [...prev, { ...newItem, id }]);
      set当前ID(id);
    }
  }, [projectId]);

  const updateF = useCallback((id: number, updates: Partial<伏笔数据>) => {
    set伏笔列表(prev =>
      prev.map(f => (f.id === id ? { ...f, ...updates } : f))
    );
  }, []);

  const deleteF = useCallback(
    async (id: number) => {
      if (!projectId) return;
      const isLocal = id > 1000000000000;
      if (!isLocal) {
        try {
          await fetch(
            `${API_BASE}/api/foreshadows/project/${projectId}/foreshadow/${id}`,
            { method: 'DELETE', headers: getAuthHeaders() }
          );
        } catch {}
      }
      set伏笔列表(prev => prev.filter(f => f.id !== id));
      if (当前ID === id) set当前ID(null);
    },
    [projectId, 当前ID]
  );

  const openAIDialog = useCallback(() => {
    setAiPrompt('');
    setStreamText('');
    setGenResult(null);
    setGenError('');
    setShowAIDialog(true);
  }, []);

  const startGeneration = useCallback(async () => {
    setGenerating(true);
    setStreamText('');
    setGenResult(null);
    setGenError('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      // ── getContext — Vue: GET /foreshadows/project/{id}/context (API index line 13918)
      let 上下文: {
        项目信息?: { 项目名称: string; 项目类型: string };
        世界观信息?: { 世界名称: string; 核心规则: string };
        故事核心?: { 核心主题: string; 核心冲突: string };
        角色列表?: { 角色姓名: string; 角色类型: string }[];
        已有大纲?: { 标题: string; 节点类型: string }[];
      } | null = null;
      try {
        const ctxRes = await fetch(
          `${API_BASE}/api/foreshadows/project/${projectId}/context`,
          { headers: getAuthHeaders() }
        );
        const ctxData = await ctxRes.json();
        if (ctxData.success && ctxData.data) 上下文 = ctxData.data;
      } catch {}

      const 已有伏笔名 = 伏笔列表.map(f => f.伏笔名称).filter(n => !!n?.trim());
      const systemPrompt = buildForeshadowingPrompt(上下文, 已有伏笔名);

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: aiPrompt || '请生成3-5个伏笔。按管道格式输出。',
        },
      ];

      const fullText = await generateLLM({
        messages,
        temperature: 0.85,
        max_tokens: 4096,
        onChunk: setStreamText,
        signal: ac.signal,
      });
      const parsed = parseForeshadowingResponse(fullText);
      if (!parsed || parsed.length === 0) {
        setGenError('AI返回格式解析失败');
        return;
      }
      // Save generation to server — Vue: Bl.saveGeneration(Oe, {...})
      try {
        await fetch(
          `${API_BASE}/api/foreshadows/project/${projectId}/generations`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              用户提示词: aiPrompt || '',
              生成内容: { 原始内容: fullText, 解析结果: parsed },
              上下文信息: 上下文,
            }),
          }
        );
      } catch {
        // Non-critical: generation is saved locally already
      }

      setGenResult(parsed);
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, 伏笔列表, projectId]);

  const adoptResult = useCallback(async () => {
    if (!genResult || !projectId) return;
    setShowAIDialog(false);
    setGenResult(null);
    // POST each foreshadow to server — Vue: POST /foreshadows/project/{id}/foreshadow
    for (const item of genResult) {
      try {
        await fetch(
          `${API_BASE}/api/foreshadows/project/${projectId}/foreshadow`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              伏笔名称: item.伏笔名称,
              重要度: item.重要度,
              伏笔类型: item.伏笔类型,
              影响范围: item.影响范围,
              埋设章节名: item.埋设章节名,
              预计回收章节: item.预计回收章节,
              伏笔描述: item.伏笔描述,
            }),
          }
        );
      } catch {}
    }
    // Refresh list from server
    try {
      const res = await fetch(
        `${API_BASE}/api/foreshadows/project/${projectId}/list`,
        { headers: getAuthHeaders() }
      );
      const result = await res.json();
      if (result.success && Array.isArray(result.data))
        set伏笔列表(result.data);
    } catch {}
  }, [genResult, projectId]);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    if (!generating) setShowAIDialog(false);
  }, [generating]);

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

  const 过滤后列表 = useMemo(() => {
    return 伏笔列表.filter(f => {
      const 匹配搜索 =
        !搜索词 || f.伏笔名称.includes(搜索词) || f.伏笔描述.includes(搜索词);
      const 匹配重要度 = !重要度过滤 || f.重要度 === 重要度过滤;
      return 匹配搜索 && 匹配重要度;
    });
  }, [伏笔列表, 搜索词, 重要度过滤]);

  return createPortal(
    <div className="v-foreshadowing-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width }}
        >
          {/* Header (源码 lines 234488-234530) */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/20">
                  <i className="text-lg text-red-400 ri-lightbulb-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">伏笔管理</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    共 {伏笔列表.length} 个伏笔
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors text-red-400"
                  title="AI生成"
                  onClick={openAIDialog}
                  disabled={generating}
                >
                  <i
                    className={`ri-${generating ? 'loader-4-line animate-spin' : 'magic-line'}`}
                  />
                </button>
                <button
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors disabled:opacity-50"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <i className="ri-save-line mr-1" />
                  {saved ? '已保存' : saving ? '保存中...' : '保存'}
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
            {/* Left: List */}
            <div className="w-64 flex flex-col border-r border-[var(--border)]">
              <div className="shrink-0 p-3 border-b border-[var(--border)] space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">伏笔列表</h3>
                  <button
                    className="p-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs flex items-center gap-1"
                    onClick={addF}
                  >
                    <i className="ri-add-line" /> 新建
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="搜索伏笔..."
                  value={搜索词}
                  onChange={e => set搜索词(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:outline-none"
                />
                <div className="flex gap-1">
                  <select
                    value={重要度过滤}
                    onChange={e => set重要度过滤(e.target.value)}
                    className="flex-1 px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs"
                  >
                    <option value="">全部重要度</option>
                    {重要度选项.map(l => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {过滤后列表.map(f => (
                  <div
                    key={f.id}
                    className={`p-3 border-b border-[var(--border)] hover:bg-[var(--bg-dark)] cursor-pointer transition-colors ${当前ID === f.id ? 'bg-red-500/10' : ''}`}
                    onClick={() => set当前ID(f.id)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium truncate">
                        {f.伏笔名称}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 text-xs rounded ${重要度样式[f.重要度] || ''}`}
                      >
                        {f.重要度}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {f.伏笔类型}
                      </span>
                    </div>
                  </div>
                ))}
                {过滤后列表.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无伏笔
                  </div>
                )}
              </div>
            </div>

            {/* Right: Detail */}
            <div className="flex-1 overflow-y-auto">
              {当前伏笔 ? (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">编辑伏笔</h3>
                    <button
                      className="p-1 hover:bg-red-500/20 rounded text-xs text-[var(--text-secondary)] hover:text-red-400"
                      onClick={() => deleteF(当前伏笔.id)}
                    >
                      <i className="ri-delete-bin-line" />
                    </button>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      伏笔名称 *
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg focus:outline-none"
                      placeholder="输入伏笔名称"
                      value={当前伏笔.伏笔名称}
                      onChange={e =>
                        updateF(当前伏笔.id, { 伏笔名称: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        重要度
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前伏笔.重要度}
                        onChange={e =>
                          updateF(当前伏笔.id, { 重要度: e.target.value })
                        }
                      >
                        {重要度选项.map(l => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        类型
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前伏笔.伏笔类型}
                        onChange={e =>
                          updateF(当前伏笔.id, { 伏笔类型: e.target.value })
                        }
                      >
                        {类型选项.map(t => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        影响范围
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前伏笔.影响范围}
                        onChange={e =>
                          updateF(当前伏笔.id, { 影响范围: e.target.value })
                        }
                      >
                        {影响范围选项.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      伏笔描述
                    </label>
                    <textarea
                      className="w-full p-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg resize-y min-h-[80px]"
                      placeholder="描述伏笔的内容和作用"
                      value={当前伏笔.伏笔描述}
                      onChange={e =>
                        updateF(当前伏笔.id, { 伏笔描述: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        埋设章节名
                      </label>
                      <input
                        type="text"
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        placeholder="埋设的章节名"
                        value={当前伏笔.埋设章节名}
                        onChange={e =>
                          updateF(当前伏笔.id, { 埋设章节名: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        预计回收章节
                      </label>
                      <input
                        type="text"
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        placeholder="预计回收的章节"
                        value={当前伏笔.预计回收章节}
                        onChange={e =>
                          updateF(当前伏笔.id, { 预计回收章节: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
                  选择或创建一个伏笔
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-darker)] flex justify-between">
            <span className="text-xs text-[var(--text-secondary)]">
              {伏笔列表.length} 个伏笔
            </span>
          </div>
        </div>
        <div
          className="relative z-10 w-2 bg-transparent cursor-col-resize hover:bg-red-500/50 active:bg-red-500 shrink-0"
          onMouseDown={handleMouseDown}
        />
        <div
          className="fixed top-0 bottom-0 right-0 bg-black/0 hover:bg-black/5"
          style={{ left: (leftOffset || 0) + width + 2 }}
          onClick={onClose}
        />
      </div>

      {/* AI Dialog */}
      {showAIDialog &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ri-magic-line text-red-400" />
                  <h3 className="font-semibold">AI生成伏笔</h3>
                </div>
                <button
                  className="p-1.5 hover:bg-[var(--bg-dark)] rounded-lg"
                  onClick={cancelGeneration}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1.5">
                    生成提示词（可选）
                  </label>
                  <textarea
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:border-red-500"
                    placeholder="描述你想要的伏笔特点..."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    disabled={generating}
                  />
                </div>
                {generating && streamText && (
                  <div className="bg-[var(--bg-dark)] rounded-xl p-4">
                    <pre className="text-xs whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                      {streamText}
                    </pre>
                  </div>
                )}
                {genError && <p className="text-sm text-red-400">{genError}</p>}
                {genResult && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">
                      生成结果（{genResult.length}个）
                    </h4>
                    {genResult.map((f, i) => (
                      <div
                        key={i}
                        className="bg-[var(--bg-dark)] rounded-xl p-3"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">
                            {f.伏笔名称}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-xs rounded ${重要度样式[f.重要度] || ''}`}
                          >
                            {f.重要度}
                          </span>
                        </div>
                        {f.伏笔描述 && (
                          <p className="text-xs text-[var(--text-secondary)]">
                            {f.伏笔描述}
                          </p>
                        )}
                      </div>
                    ))}
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
    </div>,
    document.body
  );
};

export default ForeshadowingPanel;
