import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import { generateLLM, generateValidated } from './panel-shared';
import { API_BASE, getAuthHeaders } from '../useWorldApi';

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

/* Source-derived: 3 currency types (源码 lines 154345-156089) */
const 货币类型列表 = ['基础货币', '高级货币', '特殊货币'] as const;

const 货币类型样式: Record<string, string> = {
  基础货币: 'bg-yellow-500/20 text-yellow-400',
  高级货币: 'bg-purple-500/20 text-purple-400',
  特殊货币: 'bg-blue-500/20 text-blue-400',
};

/* Source-derived: currency item interface (源码 j() line 42109-42124, _e() line 42210-42242) */
interface 货币数据 {
  id?: number;
  货币名称: string;
  货币类型: string;
  货币定义: string;
  使用场景: string;
  特点: string;
  参考价值: string;
  获取方式: string;
  来源: string;
  溢价: string;
  兑换比例示例: string;
}

/* ── AI prompt (源码 K() line 42145-42208) ── */

interface 世界观信息 {
  世界名称?: string;
  世界类型?: string;
  势力格局?: string;
  社会结构?: string;
  时代背景?: string;
  [key: string]: unknown;
}

function buildCurrencyPrompt(
  世界观: 世界观信息 | null,
  已有货币名列表: string[] = []
): string {
  let 世界观背景 = '';
  if (世界观 && Object.keys(世界观).length > 0) {
    世界观背景 = `
【世界观背景】
世界名称：${世界观.世界名称 || '未设定'}
世界类型：${世界观.世界类型 || '未设定'}
势力格局：${世界观.势力格局 || '未设定'}
社会结构：${世界观.社会结构 || '未设定'}
时代背景：${世界观.时代背景 || '未设定'}`;
  }

  let 禁止重复 = '';
  if (已有货币名列表.length > 0) {
    const 显示列表 =
      已有货币名列表.length > 50
        ? [...已有货币名列表.slice(0, 50), `...(共${已有货币名列表.length}个)`]
        : 已有货币名列表;
    禁止重复 = `

╔══════════════════════════════════════════════════════════════╗
║  【绝对禁止重复】以下货币名称已被使用，生成任何重复名称将导致任务失败
╚══════════════════════════════════════════════════════════════╝
已存在的货币名称(${已有货币名列表.length}个)：
${显示列表.join('、')}`;
  }

  return `你是一位专业的小说货币体系设计师，擅长构建完整的虚拟世界经济系统。${世界观背景}${禁止重复}

当前任务：生成完整的货币体系设定

【输出格式】（极简格式，节省token）
C|核心理念描述
M|货币名称|货币类型|货币定义
I|其他补充信息

【格式说明】
- C: 核心理念（第1行，必填，10-60字）
- M: 货币（每个货币一行，至少3-5个）
  - 货币类型：基础货币/高级货币/特殊货币
  - 货币定义：简洁描述（10-30字）
- I: 其他信息（可选，如经济规律等）

【输出示例】
C|以灵气为核心的修仙经济体系，灵石作为通用货币蕴含可被吸收的灵气
M|下品灵石|基础货币|含微量灵气的初级货币
M|中品灵石|高级货币|含中等灵气，100下品兑换1中品
M|上品灵石|高级货币|含丰富灵气，100中品兑换1上品
M|极品灵石|特殊货币|稀有高纯度灵石，宗门专用
M|灵晶|特殊货币|灵气结晶，用于大宗交易
I|黑市交易常用极品灵石，溢价10%

【核心要求】
1. 货币体系要符合世界观设定的逻辑
2. 至少生成3-5种不同等级的货币
3. 货币之间要有合理的兑换关系
4. ⚠️ 货币名称绝对不能与已有货币重复

【重要规则】
1. 严格按格式输出，每行一个项
2. C行必须在第一行
3. 不要输出任何其他内容
4. ⚠️ 在输出前，逐个检查每个货币名称是否与已有名称重复，确保不重复后再输出`;
}

interface CurrencyGenResult {
  核心理念?: string;
  其他信息?: string;
  货币列表?: 货币数据[];
}

function parseCurrencyPipe(text: string): CurrencyGenResult | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  let 核心理念 = '';
  let 其他信息 = '';
  const 货币列表: 货币数据[] = [];

  for (const line of lines) {
    if (line.startsWith('C|')) {
      核心理念 = line.slice(2).trim();
    } else if (line.startsWith('M|')) {
      const parts = line.slice(2).split('|');
      if (parts.length >= 3) {
        货币列表.push({
          货币名称: (parts[0] || '').trim(),
          货币类型: (parts[1] || '基础货币').trim(),
          货币定义: parts.slice(2).join('|').trim(),
          使用场景: '',
          特点: '',
          参考价值: '',
          获取方式: '',
          来源: '',
          溢价: '',
          兑换比例示例: '',
        });
      }
    } else if (line.startsWith('I|')) {
      其他信息 = line.slice(2).trim();
    }
  }

  if (!核心理念 && !其他信息 && 货币列表.length === 0) return null;
  return {
    核心理念: 核心理念 || undefined,
    其他信息: 其他信息 || undefined,
    货币列表: 货币列表.length > 0 ? 货币列表 : undefined,
  };
}

function parseCurrencyResponse(text: string): CurrencyGenResult | null {
  if (!text) return null;
  const pipe = parseCurrencyPipe(text.trim());
  if (pipe && (pipe.核心理念 || pipe.货币列表?.length)) return pipe;
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

const CurrencyItemSchema = z.object({
  货币名称: z.string(),
  货币类型: z.string(),
  货币定义: z.string(),
  使用场景: z.string().optional().default(''),
  特点: z.string().optional().default(''),
  参考价值: z.string().optional().default(''),
  获取方式: z.string().optional().default(''),
  来源: z.string().optional().default(''),
  溢价: z.string().optional().default(''),
  兑换比例示例: z.string().optional().default(''),
});

const CurrencySchema = z.object({
  核心理念: z.string().optional(),
  其他信息: z.string().optional(),
  货币列表: z.array(CurrencyItemSchema).optional(),
});

/**
 * Fetch user custom rules with id list (Vue source qn+Lu lines 2280-2302, 2250-2258)
 * POST /rules/scene/{scene}/prompt with { 规则ID列表: ids }
 */
async function fetchRulesWithIds(
  scene: string,
  ids: (string | number)[]
): Promise<string | null> {
  if (!ids || ids.length === 0) return null;
  try {
    const res = await fetch(
      `${API_BASE}/api/rules/scene/${encodeURIComponent(scene)}/prompt`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 规则ID列表: ids }),
      }
    );
    const result = await res.json();
    if (result.success && result.data && result.data.prompt) {
      return result.data.prompt;
    }
  } catch {}
  return null;
}

/**
 * Inject custom rules into messages (Vue source qn lines 2280-2302)
 */
function injectRulesIntoMessages(
  messages: { role: string; content: string }[],
  rulesText: string | null
): { role: string; content: string }[] {
  if (!rulesText) return messages;
  const cloned = JSON.parse(JSON.stringify(messages));
  const systemIdx = cloned.findIndex((m: any) => m.role === 'system');
  const rulesBlock = `\n\n【用户自定义规则（优先级最高）】\n${rulesText}`;
  if (systemIdx !== -1) {
    cloned[systemIdx].content += rulesBlock;
  } else {
    cloned.unshift({
      role: 'system',
      content: `【用户自定义规则（优先级最高）】\n${rulesText}`,
    });
  }
  return cloned;
}

export const CurrencyPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  /* Source-derived: 3 collapsible sections (源码 lines 154096-154110) */
  const [核心理念, set核心理念] = useState('');
  const [其他信息, set其他信息] = useState('');
  const [核心记录id, set核心记录id] = useState<number | null>(null);
  const [核心记录项目ID, set核心记录项目ID] = useState<number | null>(null);
  // Suppress TS6133: values used by future CRUD operations matching Vue source
  void 核心记录id;
  void 核心记录项目ID;
  const [货币列表, set货币列表] = useState<货币数据[]>([]);
  const [折叠, set折叠] = useState<Record<string, boolean>>({
    核心理念: false,
    货币列表: false,
    其他信息: false,
  });

  // Loading states (Vue source lines 42001-42018: u.value, d.value, g.value)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  const [width, setWidth] = useState(520);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load currency data (Vue source line 42004: Promise.all for parallel load)
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    Promise.all([
      // GET /currencies/project/{id} — 核心理念 + 其他信息 (Vue source Mr.get)
      fetch(`${API_BASE}/api/currencies/project/${projectId}`, {
        headers: getAuthHeaders(),
      }).then(res => res.json()),
      // GET /currencies/project/{id}/list — 货币列表 (Vue source Mr.getList)
      fetch(`${API_BASE}/api/currencies/project/${projectId}/list`, {
        headers: getAuthHeaders(),
      }).then(res => res.json()),
    ])
      .then(([coreResult, listResult]) => {
        // Vue source lines 42004-42013: extract id, 项目ID, 核心理念, 其他信息
        if (coreResult.success && coreResult.data) {
          const d = coreResult.data;
          if (d.id != null) set核心记录id(d.id);
          if (d.项目ID != null) set核心记录项目ID(d.项目ID);
          if (d.核心理念) set核心理念(d.核心理念);
          if (d.其他信息) set其他信息(d.其他信息);
        }
        // Vue source line 42006-42010: load currency list
        if (listResult.success && Array.isArray(listResult.data)) {
          set货币列表(listResult.data);
        }
        // Vue source line 42014: g.value = !0
        setInitialized(true);
      })
      .catch((err: any) => {
        // Vue source lines 42015-42016: d.value = le.message || '加载货币体系失败'
        setError(err.message || '加载货币体系失败');
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  /* Edit dialog state (源码 edit currency dialog) */
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<货币数据 | null>(null);
  const [isNewCurrency, setIsNewCurrency] = useState(false);

  /* AI Generation state (源码 lines 154xxx-156089) */
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [genResult, setGenResult] = useState<{
    核心理念?: string;
    其他信息?: string;
    货币列表?: 货币数据[];
  } | null>(null);
  const [genError, setGenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  /* 源码 T() line 42022-42047: save only 核心理念 + 其他信息 */
  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API_BASE}/api/currencies/project/${projectId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 核心理念, 其他信息 }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectId, 核心理念, 其他信息]);

  /* CRUD: new/edit/delete currency (源码 j() line 42109-42124) */
  const openNewCurrency = useCallback(() => {
    setEditingCurrency({
      货币名称: '',
      货币定义: '',
      货币类型: '基础货币',
      使用场景: '',
      特点: '',
      参考价值: '',
      获取方式: '',
      来源: '',
      溢价: '',
      兑换比例示例: '',
    });
    setIsNewCurrency(true);
    setShowEditDialog(true);
  }, []);

  const openEditCurrency = useCallback((c: 货币数据) => {
    setEditingCurrency({ ...c });
    setIsNewCurrency(false);
    setShowEditDialog(true);
  }, []);

  /* 源码 H() line 42129-42140: save edit (new→z() POST, edit→W() PUT) */
  const saveEditCurrency = useCallback(async () => {
    if (!editingCurrency || !editingCurrency.货币名称?.trim() || !projectId)
      return;
    try {
      if (isNewCurrency) {
        // 源码 z() line 42049-42069: POST /currencies/project/{id}/item
        const res = await fetch(
          `${API_BASE}/api/currencies/project/${projectId}/item`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(editingCurrency),
          }
        );
        const result = await res.json();
        if (result.success) {
          // refresh list (源码 z: getList after addItem)
          const listRes = await fetch(
            `${API_BASE}/api/currencies/project/${projectId}/list`,
            { headers: getAuthHeaders() }
          );
          const listResult = await listRes.json();
          if (listResult.success && Array.isArray(listResult.data)) {
            set货币列表(listResult.data);
          }
        }
      } else if (editingCurrency.id) {
        // 源码 W() line 42071-42084: PUT /currencies/item/{id}
        const res = await fetch(
          `${API_BASE}/api/currencies/item/${editingCurrency.id}`,
          {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(editingCurrency),
          }
        );
        const result = await res.json();
        if (result.success) {
          set货币列表(prev =>
            prev.map(c =>
              c.id === editingCurrency.id ? { ...c, ...editingCurrency } : c
            )
          );
        }
      }
      setShowEditDialog(false);
      setEditingCurrency(null);
    } catch {
      alert('保存失败');
    }
  }, [editingCurrency, isNewCurrency, projectId]);

  /* 源码 Q() line 42086-42095: DELETE /currencies/item/{id} */
  const deleteCurrency = useCallback(
    async (id: number | undefined) => {
      if (!id || !projectId) return;
      if (!projectId) return;
      try {
        const res = await fetch(`${API_BASE}/api/currencies/item/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
        const result = await res.json();
        if (result.success) {
          set货币列表(prev => prev.filter(c => c.id !== id));
        }
      } catch {
        alert('删除失败');
      }
    },
    [projectId]
  );

  /* AI generation: open dialog (源码 function W) */
  const openAIDialog = useCallback(() => {
    setAiPrompt('');
    setStreamText('');
    setGenResult(null);
    setGenError('');
    setShowAIDialog(true);
  }, []);

  /* AI generation: start (源码 fe() line 42265-42347) */
  const startGeneration = useCallback(async () => {
    if (!projectId) return;
    setGenerating(true);
    setStreamText('');
    setGenResult(null);
    setGenError('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      // 源码 line 42278-42283: getContext → 世界观信息
      let 世界观: 世界观信息 | null = null;
      try {
        const ctxRes = await fetch(
          `${API_BASE}/api/currencies/project/${projectId}/context`,
          { headers: getAuthHeaders() }
        );
        const ctxResult = await ctxRes.json();
        if (ctxResult.success && ctxResult.data) {
          世界观 = ctxResult.data.世界观信息 || null;
        }
      } catch {}

      // 源码 line 42284: B() → 已有货币名列表
      const 已有货币名 = 货币列表
        .map(c => c.货币名称)
        .filter((n): n is string => !!n?.trim());

      // 源码 line 42288: K(worldview, names)
      const systemPrompt = buildCurrencyPrompt(世界观, 已有货币名);

      // 源码 line 42287-42294: messages
      let messages: { role: string; content: string }[] = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            aiPrompt ||
            '请根据世界观信息，生成完整的货币体系设定，包括多种不同等级的货币',
        },
      ];

      // Vue source lines 42303-42306: qn() — fetch user custom rules with id-based filtering
      const currencyIds = 货币列表
        .filter(c => c && c.id != null)
        .map(c => c.id!);
      if (currencyIds.length > 0) {
        const rulesText = await fetchRulesWithIds(
          'AI生成货币体系',
          currencyIds
        );
        messages = injectRulesIntoMessages(messages, rulesText);
      }

      const validated = await generateValidated({
        schema: CurrencySchema,
        generate: attempt =>
          generateLLM({
            messages,
            temperature: Math.min(1.0, 0.85 + attempt * 0.05),
            max_tokens: 4096,
            onChunk: setStreamText,
            signal: ac.signal,
          }),
        parseResponse: parseCurrencyResponse,
        maxRetries: 3,
      });
      if (!validated) {
        setGenError('AI返回格式解析失败');
        return;
      }
      const data = validated.data as CurrencyGenResult;
      setGenResult({
        核心理念: data.核心理念 || '',
        其他信息: data.其他信息 || '',
        货币列表: data.货币列表 || [],
      });
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, 货币列表, projectId]);

  /* AI generation: adopt result (源码 te() line 42352-42378) */
  const adoptResult = useCallback(async () => {
    if (!genResult || !projectId) return;
    setSaving(true);
    try {
      // 源码 line 42357-42359: 设核心理念+其他信息 → T() PUT
      const new核心理念 = genResult.核心理念 || 核心理念;
      const new其他信息 = genResult.其他信息 || 其他信息;
      set核心理念(new核心理念);
      set其他信息(new其他信息);
      await fetch(`${API_BASE}/api/currencies/project/${projectId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 核心理念: new核心理念, 其他信息: new其他信息 }),
      });

      // 源码 line 42360-42361: 逐个 POST 每个货币
      const 货币 = genResult.货币列表 || [];
      for (const item of 货币) {
        await fetch(`${API_BASE}/api/currencies/project/${projectId}/item`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(item),
        });
      }

      // 源码 line 42362-42364: getList 刷新列表
      const listRes = await fetch(
        `${API_BASE}/api/currencies/project/${projectId}/list`,
        { headers: getAuthHeaders() }
      );
      const listResult = await listRes.json();
      if (listResult.success && Array.isArray(listResult.data)) {
        set货币列表(listResult.data);
      }

      setShowAIDialog(false);
      setGenResult(null);
    } catch {
      alert('采用生成结果失败');
    } finally {
      setSaving(false);
    }
  }, [genResult, projectId, 核心理念, 其他信息]);

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

  const 总字数 = useMemo(() => {
    let count = 核心理念.length + 其他信息.length;
    货币列表.forEach(c => {
      count +=
        (c.货币名称?.length || 0) +
        (c.货币定义?.length || 0) +
        (c.参考价值?.length || 0);
    });
    return count;
  }, [核心理念, 其他信息, 货币列表]);

  return createPortal(
    <div className="v-37d2441a">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width }}
        >
          {/* Header (源码 lines 154253-154403) */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-yellow-500/20">
                  <i className="text-lg text-yellow-400 ri-coins-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">货币体系</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    定义世界的货币系统与价值体系
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-secondary)] px-2 py-1 bg-[var(--bg-card)] rounded">
                  {货币列表.length} 种货币
                </span>
                <button
                  className="p-1.5 hover:bg-yellow-500/20 rounded-lg transition-colors text-yellow-400"
                  title="AI生成货币体系"
                  onClick={openAIDialog}
                  disabled={generating}
                >
                  <i
                    className={`ri-${generating ? 'loader-4-line animate-spin' : 'magic-line'}`}
                  />
                </button>
                <button
                  className="px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-sm transition-colors disabled:opacity-50"
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

          {/* Section cards (源码 lines 154404-155xxx) */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {/* Loading state */}
            {loading && !initialized && (
              <div className="flex items-center justify-center py-12 text-[var(--text-secondary)]">
                <i className="ri-loader-4-line animate-spin mr-2" />
                加载中...
              </div>
            )}
            {/* Error state */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                <i className="ri-error-warning-line mr-1" />
                {error}
                <button
                  className="ml-2 underline text-red-300 hover:text-red-200"
                  onClick={() => setError('')}
                >
                  关闭
                </button>
              </div>
            )}
            {/* Content — only show after initialized or when data exists */}
            {!loading || initialized ? (
              <>
                {/* 核心理念 */}
                <div className="bg-[var(--bg-dark)] rounded-xl p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() =>
                      set折叠(prev => ({ ...prev, 核心理念: !prev.核心理念 }))
                    }
                  >
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <i className="ri-lightbulb-flash-line text-yellow-400" />{' '}
                      核心理念
                      <span className="text-xs text-[var(--text-muted)] font-normal">
                        货币体系的设计理念和经济逻辑
                      </span>
                    </h3>
                    <i
                      className={`ri-arrow-${折叠.核心理念 ? 'down' : 'up'}-s-line text-[var(--text-muted)]`}
                    />
                  </div>
                  {!折叠.核心理念 && (
                    <textarea
                      className="mt-3 w-full h-32 p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm resize-y focus:outline-none focus:border-yellow-500/50"
                      placeholder="描述货币体系的核心设计理念，如：以灵气为基础的修仙经济体系，灵石作为通用货币，蕴含可被修士吸收的灵气..."
                      value={核心理念}
                      onChange={e => set核心理念(e.target.value)}
                    />
                  )}
                </div>

                {/* 货币列表 */}
                <div className="bg-[var(--bg-dark)] rounded-xl p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() =>
                      set折叠(prev => ({ ...prev, 货币列表: !prev.货币列表 }))
                    }
                  >
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <i className="ri-exchange-dollar-line text-green-400" />{' '}
                      货币列表
                      <span className="text-xs text-[var(--text-muted)] font-normal">
                        已定义 {货币列表.length} 种货币
                      </span>
                    </h3>
                    <div
                      className="flex items-center gap-2"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        className="px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded text-xs flex items-center gap-1 transition-colors"
                        onClick={openNewCurrency}
                      >
                        <i className="ri-add-line" /> 添加货币
                      </button>
                      <i
                        className={`ri-arrow-${折叠.货币列表 ? 'down' : 'up'}-s-line text-[var(--text-muted)]`}
                      />
                    </div>
                  </div>
                  {!折叠.货币列表 && (
                    <div className="mt-3 space-y-3">
                      {货币列表.map(c => (
                        <div
                          key={c.id}
                          className="bg-[var(--bg-card)] rounded-lg p-3 hover:bg-[var(--border)]/50 transition-colors group"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {c.货币名称}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-xs ${货币类型样式[c.货币类型] || 'bg-gray-500/20 text-gray-400'}`}
                              >
                                {c.货币类型}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                className="p-1 hover:bg-[var(--bg-dark)] rounded text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                onClick={() => openEditCurrency(c)}
                              >
                                <i className="ri-edit-line" />
                              </button>
                              <button
                                className="p-1 hover:bg-red-500/20 rounded text-xs text-[var(--text-secondary)] hover:text-red-400"
                                onClick={() => deleteCurrency(c.id)}
                              >
                                <i className="ri-delete-bin-line" />
                              </button>
                            </div>
                          </div>
                          {c.货币定义 && (
                            <p className="text-xs text-[var(--text-secondary)] mb-2 line-clamp-2">
                              {c.货币定义}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                            {c.参考价值 && (
                              <span className="flex items-center gap-1">
                                <i className="text-yellow-400 ri-price-tag-3-line" />{' '}
                                {c.参考价值}
                              </span>
                            )}
                            {c.兑换比例示例 && (
                              <span className="flex items-center gap-1">
                                <i className="text-blue-400 ri-exchange-line" />{' '}
                                {c.兑换比例示例}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {货币列表.length === 0 && (
                        <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                          暂无货币
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 其他信息 */}
                <div className="bg-[var(--bg-dark)] rounded-xl p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() =>
                      set折叠(prev => ({ ...prev, 其他信息: !prev.其他信息 }))
                    }
                  >
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <i className="ri-file-info-line text-purple-400" />{' '}
                      其他信息
                      <span className="text-xs text-[var(--text-muted)] font-normal">
                        经济规律、黑市交易等补充信息
                      </span>
                    </h3>
                    <i
                      className={`ri-arrow-${折叠.其他信息 ? 'down' : 'up'}-s-line text-[var(--text-muted)]`}
                    />
                  </div>
                  {!折叠.其他信息 && (
                    <textarea
                      className="mt-3 w-full h-32 p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm resize-y focus:outline-none focus:border-yellow-500/50"
                      placeholder="其他补充信息，如：经济规律、黑市交易规则、特殊货币流通方式等..."
                      value={其他信息}
                      onChange={e => set其他信息(e.target.value)}
                    />
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-darker)] flex justify-end">
            <span className="text-xs text-[var(--text-secondary)]">
              总计 {总字数} 字
            </span>
          </div>
        </div>

        <div
          className="relative z-10 w-2 bg-transparent cursor-col-resize hover:bg-yellow-500/50 active:bg-yellow-500 shrink-0"
          title="拖拽调整宽度"
          onMouseDown={handleMouseDown}
        />
        <div
          className="fixed top-0 bottom-0 right-0 bg-black/0 hover:bg-black/5"
          style={{ left: (leftOffset || 0) + width + 2 }}
          onClick={onClose}
        />
      </div>

      {/* Edit Currency Dialog (源码 edit dialog) */}
      {showEditDialog &&
        editingCurrency &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ri-coin-line text-yellow-400" />
                  <h3 className="font-semibold">
                    {isNewCurrency ? '添加货币' : '编辑货币'}
                  </h3>
                </div>
                <button
                  className="p-1.5 hover:bg-[var(--bg-dark)] rounded-lg"
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingCurrency(null);
                  }}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    货币名称 *
                  </label>
                  <input
                    type="text"
                    className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-yellow-500/50"
                    placeholder="如：灵石、金币"
                    value={editingCurrency.货币名称}
                    onChange={e =>
                      setEditingCurrency({
                        ...editingCurrency,
                        货币名称: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    货币类型
                  </label>
                  <select
                    className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-yellow-500/50"
                    value={editingCurrency.货币类型}
                    onChange={e =>
                      setEditingCurrency({
                        ...editingCurrency,
                        货币类型: e.target.value,
                      })
                    }
                  >
                    {货币类型列表.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    货币定义
                  </label>
                  <textarea
                    className="w-full p-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-yellow-500/50 min-h-[60px]"
                    placeholder="货币的定义和本质说明"
                    value={editingCurrency.货币定义 || ''}
                    onChange={e =>
                      setEditingCurrency({
                        ...editingCurrency,
                        货币定义: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    使用场景
                  </label>
                  <textarea
                    className="w-full p-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-yellow-500/50 min-h-[60px]"
                    placeholder="货币的主要使用场景"
                    value={editingCurrency.使用场景 || ''}
                    onChange={e =>
                      setEditingCurrency({
                        ...editingCurrency,
                        使用场景: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    特点
                  </label>
                  <textarea
                    className="w-full p-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-yellow-500/50 min-h-[60px]"
                    placeholder="货币的独特特点"
                    value={editingCurrency.特点 || ''}
                    onChange={e =>
                      setEditingCurrency({
                        ...editingCurrency,
                        特点: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      参考价值
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-yellow-500/50"
                      placeholder="如：1灵石≈100元人民币"
                      value={editingCurrency.参考价值 || ''}
                      onChange={e =>
                        setEditingCurrency({
                          ...editingCurrency,
                          参考价值: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      兑换比例示例
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-yellow-500/50"
                      placeholder="如：100下品=1中品"
                      value={editingCurrency.兑换比例示例 || ''}
                      onChange={e =>
                        setEditingCurrency({
                          ...editingCurrency,
                          兑换比例示例: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    获取方式
                  </label>
                  <textarea
                    className="w-full p-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-yellow-500/50 min-h-[60px]"
                    placeholder="获取该货币的主要方式"
                    value={editingCurrency.获取方式 || ''}
                    onChange={e =>
                      setEditingCurrency({
                        ...editingCurrency,
                        获取方式: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    来源
                  </label>
                  <textarea
                    className="w-full p-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-yellow-500/50 min-h-[60px]"
                    placeholder="货币的来源和发行机制"
                    value={editingCurrency.来源 || ''}
                    onChange={e =>
                      setEditingCurrency({
                        ...editingCurrency,
                        来源: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    溢价
                  </label>
                  <textarea
                    className="w-full p-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-yellow-500/50 min-h-[60px]"
                    placeholder="货币在不同场景的溢价情况（可选）"
                    value={editingCurrency.溢价 || ''}
                    onChange={e =>
                      setEditingCurrency({
                        ...editingCurrency,
                        溢价: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
                <button
                  className="px-4 py-2 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg text-sm"
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingCurrency(null);
                  }}
                >
                  取消
                </button>
                <button
                  className="px-4 py-2 btn-primary rounded-lg text-sm flex items-center gap-1"
                  onClick={saveEditCurrency}
                >
                  <i className="ri-check-line" /> 保存
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* AI Generation Dialog (源码 lines 154xxx-156089) */}
      {showAIDialog &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ri-magic-line text-yellow-400" />
                  <h3 className="font-semibold">AI生成货币体系</h3>
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
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:border-yellow-500 transition-colors"
                    placeholder="描述你想要的货币体系，如：一个修仙世界的灵石货币体系，需要有多种等级的灵石..."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    disabled={generating}
                  />
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  AI会根据当前世界观信息生成完整的货币体系，包括核心理念和多种货币
                </p>
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
                    {genResult.核心理念 && (
                      <div className="bg-[var(--bg-dark)] rounded-xl p-3">
                        <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                          <i className="ri-lightbulb-flash-line text-yellow-400" />{' '}
                          核心理念
                        </label>
                        <p className="text-sm whitespace-pre-wrap">
                          {genResult.核心理念}
                        </p>
                      </div>
                    )}
                    {genResult.货币列表 && genResult.货币列表.length > 0 && (
                      <div className="bg-[var(--bg-dark)] rounded-xl p-3">
                        <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                          <i className="ri-exchange-dollar-line text-green-400" />{' '}
                          货币列表（{genResult.货币列表.length}种）
                        </label>
                        {genResult.货币列表.map((c, i) => (
                          <div
                            key={i}
                            className="mt-2 pt-2 border-t border-[var(--border)] first:border-0 first:mt-0 first:pt-0"
                          >
                            <span className="text-sm font-medium">
                              {c.货币名称}
                            </span>
                            <span
                              className={`ml-2 px-2 py-0.5 rounded text-xs ${货币类型样式[c.货币类型] || 'bg-gray-500/20 text-gray-400'}`}
                            >
                              {c.货币类型}
                            </span>
                            {c.货币定义 && (
                              <p className="text-xs text-[var(--text-secondary)] mt-1">
                                {c.货币定义}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {genResult.其他信息 && (
                      <div className="bg-[var(--bg-dark)] rounded-xl p-3">
                        <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                          <i className="ri-file-info-line text-purple-400" />{' '}
                          其他信息
                        </label>
                        <p className="text-sm whitespace-pre-wrap">
                          {genResult.其他信息}
                        </p>
                      </div>
                    )}
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

export default CurrencyPanel;
