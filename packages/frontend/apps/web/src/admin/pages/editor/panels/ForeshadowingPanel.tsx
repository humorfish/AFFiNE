import React, { useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import {
  generateLLM,
  generateValidated,
  parseAIJSON,
  useSystemPrompt,
} from './panel-shared';
import { saveVersion } from '../useWorldApi';

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

/* Source-derived: foreshadowing fields (源码 lines 234488-240xxx) */
interface 伏笔数据 {
  id: number;
  伏笔名称: string;
  状态: string;
  重要度: string;
  伏笔类型: string;
  影响范围: string;
  解密程度: number;
  埋设章节名: string;
  埋设位置: string;
  预计回收章节: string;
  伏笔描述: string;
  备注: string;
  章节关联: {
    章节名: string;
    关联类型: string;
    关联描述: string;
    解密程度: number;
  }[];
}

/* Source-derived: options (源码 lines 8502-8513) */
const 状态选项 = ['已埋设', '待呼应', '已回收', '已废弃'];
const 重要度选项 = ['极高', '高', '中', '低'];
const 类型选项 = ['悬念', '暗线', '伏线', '谜题', '预言'];
const 影响范围选项 = ['单线', '多线', '全局'];
const 关联类型选项 = ['埋设', '暗示', '呼应', '回收'];

const 状态样式: Record<string, string> = {
  已埋设: 'bg-blue-500/20 text-blue-400',
  待呼应: 'bg-yellow-500/20 text-yellow-400',
  已回收: 'bg-green-500/20 text-green-400',
  已废弃: 'bg-gray-500/20 text-gray-400',
};

const 重要度样式: Record<string, string> = {
  极高: 'bg-red-500/20 text-red-400',
  高: 'bg-orange-500/20 text-orange-400',
  中: 'bg-blue-500/20 text-blue-400',
  低: 'bg-gray-500/20 text-gray-400',
};

/* ── AI prompt & parsers (source-derived pipe format) ── */

function buildForeshadowingSystemPrompt(): string {
  return `你是一位专业的小说伏笔设计师。请根据用户要求生成详细的伏笔设计。

输出格式要求（严格按管道符|分隔的行格式，每个伏笔由多行组成）：
N|伏笔名称|伏笔类型
D|伏笔描述
B|埋设方式
H|回收方式
S|状态

规则：
1. N行：以N|开头，格式为 N|伏笔名称|伏笔类型（悬念/暗线/伏线/谜题/预言）
2. D行：以D|开头，后面直接写伏笔的详细描述内容
3. B行：以B|开头，后面写伏笔的埋设方式和场景
4. H行：以H|开头，后面写伏笔的回收方式和预期效果
5. S行：以S|开头，状态为（已埋设/待呼应/已回收/已废弃）
6. 每个伏笔按N→D→B→H→S的顺序输出，不同伏笔之间不需要分隔符
7. 不要输出JSON，只输出上述管道格式

示例：
N|神秘黑匣子|悬念
D|主角在废墟中发现一个古老的黑色匣子，匣子表面刻满无法辨识的符文，偶尔发出微弱的脉动光芒
B|第3章主角探索废墟时偶然发现，匣子似乎在呼唤他
H|第25章主角突破后匣子自动开启，揭示其真实身份的关键线索
S|已埋设
N|师父的遗言|暗线
D|师父临终前说了一句含义不明的话，暗示主角的命运远比想象中复杂
B|第7章师父陨落场景中随口说出，当时主角并未在意
H|第30章主角遭遇瓶颈时突然领悟遗言真意，成为突破契机
S|待呼应`;
}

function parseForeshadowingPipe(text: string): 伏笔数据[] | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const items: 伏笔数据[] = [];
  let current: Partial<伏笔数据> | null = null;

  for (const line of lines) {
    if (line.startsWith('N|')) {
      if (current && current.伏笔名称) {
        items.push({
          id: Date.now() + items.length,
          伏笔名称: current.伏笔名称 || '未命名',
          状态: current.状态 || '已埋设',
          重要度: current.重要度 || '中',
          伏笔类型: current.伏笔类型 || '悬念',
          影响范围: current.影响范围 || '单线',
          解密程度: current.解密程度 || 0,
          埋设章节名: current.埋设章节名 || '',
          埋设位置: current.埋设位置 || '',
          预计回收章节: current.预计回收章节 || '',
          伏笔描述: current.伏笔描述 || '',
          备注: current.备注 || '',
          章节关联: current.章节关联 || [],
        } as 伏笔数据);
      }
      const parts = line.slice(2).split('|');
      current = {
        伏笔名称: (parts[0] || '').trim(),
        伏笔类型: (parts[1] || '悬念').trim(),
      };
    } else if (line.startsWith('D|') && current) {
      current.伏笔描述 = line.slice(2).trim();
    } else if (line.startsWith('B|') && current) {
      current.埋设位置 = line.slice(2).trim();
    } else if (line.startsWith('H|') && current) {
      current.预计回收章节 = line.slice(2).trim();
    } else if (line.startsWith('S|') && current) {
      current.状态 = line.slice(2).trim();
    }
  }

  // Push last item
  if (current && current.伏笔名称) {
    items.push({
      id: Date.now() + items.length,
      伏笔名称: current.伏笔名称 || '未命名',
      状态: current.状态 || '已埋设',
      重要度: current.重要度 || '中',
      伏笔类型: current.伏笔类型 || '悬念',
      影响范围: current.影响范围 || '单线',
      解密程度: current.解密程度 || 0,
      埋设章节名: current.埋设章节名 || '',
      埋设位置: current.埋设位置 || '',
      预计回收章节: current.预计回收章节 || '',
      伏笔描述: current.伏笔描述 || '',
      备注: current.备注 || '',
      章节关联: current.章节关联 || [],
    } as 伏笔数据);
  }

  return items.length > 0 ? items : null;
}

function parseForeshadowingResponse(text: string): any[] | null {
  if (!text) return null;
  const pipe = parseForeshadowingPipe(text.trim());
  if (pipe && pipe.length > 0) return pipe;
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
  const bracketMatch = text.match(/\[[\s\S]*\]/);
  if (bracketMatch)
    try {
      const arr = JSON.parse(bracketMatch[0]);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {}
  return null;
}

const ForeshadowingSchema = z.array(
  z
    .object({
      伏笔名称: z.string(),
      伏笔描述: z.string().optional(),
    })
    .passthrough()
);

export const ForeshadowingPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const [伏笔列表, set伏笔列表] = useState<伏笔数据[]>([]);
  const [当前ID, set当前ID] = useState<number | null>(null);
  const [搜索词, set搜索词] = useState('');
  const [状态过滤, set状态过滤] = useState('');
  const [重要度过滤, set重要度过滤] = useState('');

  const [width, setWidth] = useState(520);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* AI Generation state (源码 line 234606) */
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [genResult, setGenResult] = useState<伏笔数据[] | null>(null);
  const [genError, setGenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fetchSystemPrompt = useSystemPrompt(
    'AI生成伏笔',
    buildForeshadowingSystemPrompt()
  );

  const 当前伏笔 = 伏笔列表.find(f => f.id === 当前ID) || null;

  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveVersion('foreshadowing', projectId, {
        描述: '保存伏笔',
        内容: 伏笔列表,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectId, 伏笔列表]);

  const addF = useCallback(() => {
    const id = Date.now();
    set伏笔列表(prev => [
      ...prev,
      {
        id,
        伏笔名称: '新伏笔',
        状态: '已埋设',
        重要度: '中',
        伏笔类型: '悬念',
        影响范围: '单线',
        解密程度: 0,
        埋设章节名: '',
        埋设位置: '',
        预计回收章节: '',
        伏笔描述: '',
        备注: '',
        章节关联: [],
      },
    ]);
    set当前ID(id);
  }, []);

  const updateF = useCallback((id: number, updates: Partial<伏笔数据>) => {
    set伏笔列表(prev =>
      prev.map(f => (f.id === id ? { ...f, ...updates } : f))
    );
  }, []);

  const deleteF = useCallback(
    (id: number) => {
      set伏笔列表(prev => prev.filter(f => f.id !== id));
      if (当前ID === id) set当前ID(null);
    },
    [当前ID]
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
      const existingStr = 伏笔列表
        .map(
          f => `${f.伏笔名称}(${f.状态}/${f.重要度}): ${f.伏笔描述 || '无描述'}`
        )
        .join('\n');
      const systemPrompt = await fetchSystemPrompt();
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: `${aiPrompt ? aiPrompt + '\n\n' : ''}${existingStr ? '已有伏笔：\n' + existingStr + '\n\n' : ''}请生成3-5个伏笔。按管道格式输出。`,
        },
      ];
      const validated = await generateValidated({
        schema: ForeshadowingSchema,
        generate: attempt =>
          generateLLM({
            messages,
            temperature: Math.min(1.0, 0.85 + attempt * 0.05),
            max_tokens: 4096,
            onChunk: setStreamText,
            signal: ac.signal,
          }),
        parseResponse: text => {
          const { data } = parseAIJSON(text);
          return data;
        },
        maxRetries: 3,
      });
      if (!validated) {
        setGenError('AI返回格式解析失败');
        return;
      }
      const parsedData = validated.data;
      if (!parsedData) {
        setGenError('AI返回格式解析失败');
        return;
      }
      const items: 伏笔数据[] = parsedData.map((f: any, i: number) => ({
        id: Date.now() + i,
        伏笔名称: f.伏笔名称 || '未命名',
        状态: f.状态 || '已埋设',
        重要度: f.重要度 || '中',
        伏笔类型: f.伏笔类型 || '悬念',
        影响范围: f.影响范围 || '单线',
        解密程度: f.解密程度 || 0,
        埋设章节名: f.埋设章节名 || '',
        埋设位置: f.埋设位置 || '',
        预计回收章节: f.预计回收章节 || '',
        伏笔描述: f.伏笔描述 || f.描述 || '',
        备注: f.备注 || '',
        章节关联: f.章节关联 || [],
      }));
      setGenResult(items);
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, 伏笔列表, fetchSystemPrompt]);

  const adoptResult = useCallback(() => {
    if (!genResult) return;
    set伏笔列表(prev => [...prev, ...genResult]);
    setShowAIDialog(false);
    setGenResult(null);
    if (projectId)
      saveVersion('foreshadowing', projectId, {
        描述: 'AI生成伏笔',
        内容: [...伏笔列表, ...genResult],
      }).catch(() => {});
  }, [genResult, 伏笔列表, projectId]);

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
      const 匹配状态 = !状态过滤 || f.状态 === 状态过滤;
      const 匹配重要度 = !重要度过滤 || f.重要度 === 重要度过滤;
      return 匹配搜索 && 匹配状态 && 匹配重要度;
    });
  }, [伏笔列表, 搜索词, 状态过滤, 重要度过滤]);

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
                    value={状态过滤}
                    onChange={e => set状态过滤(e.target.value)}
                    className="flex-1 px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs"
                  >
                    <option value="">全部状态</option>
                    {状态选项.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
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
                      <span
                        className={`px-1.5 py-0.5 text-xs rounded shrink-0 ${状态样式[f.状态] || 'bg-gray-500/20 text-gray-400'}`}
                      >
                        {f.状态}
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
                        状态
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前伏笔.状态}
                        onChange={e =>
                          updateF(当前伏笔.id, { 状态: e.target.value })
                        }
                      >
                        {状态选项.map(s => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
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
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        埋设章节
                      </label>
                      <input
                        type="text"
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        placeholder="章节名"
                        value={当前伏笔.埋设章节名}
                        onChange={e =>
                          updateF(当前伏笔.id, { 埋设章节名: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        埋设位置
                      </label>
                      <input
                        type="text"
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        placeholder="位置"
                        value={当前伏笔.埋设位置}
                        onChange={e =>
                          updateF(当前伏笔.id, { 埋设位置: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        预计回收
                      </label>
                      <input
                        type="text"
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        placeholder="回收章节"
                        value={当前伏笔.预计回收章节}
                        onChange={e =>
                          updateF(当前伏笔.id, { 预计回收章节: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      解密程度: {当前伏笔.解密程度}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={25}
                      value={当前伏笔.解密程度}
                      onChange={e =>
                        updateF(当前伏笔.id, {
                          解密程度: Number(e.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </div>
                  {/* 章节关联 */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold">章节关联</h4>
                      <button
                        className="text-xs text-red-400"
                        onClick={() =>
                          updateF(当前伏笔.id, {
                            章节关联: [
                              ...当前伏笔.章节关联,
                              {
                                章节名: '',
                                关联类型: '埋设',
                                关联描述: '',
                                解密程度: 0,
                              },
                            ],
                          })
                        }
                      >
                        <i className="ri-add-line" /> 添加
                      </button>
                    </div>
                    {当前伏笔.章节关联.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          className="flex-1 h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                          placeholder="章节名"
                          value={c.章节名}
                          onChange={e => {
                            const 关联 = 当前伏笔.章节关联.map((item, idx) =>
                              idx === i
                                ? { ...item, 章节名: e.target.value }
                                : item
                            );
                            updateF(当前伏笔.id, { 章节关联: 关联 });
                          }}
                        />
                        <select
                          className="w-20 h-8 px-1 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                          value={c.关联类型}
                          onChange={e => {
                            const 关联 = 当前伏笔.章节关联.map((item, idx) =>
                              idx === i
                                ? { ...item, 关联类型: e.target.value }
                                : item
                            );
                            updateF(当前伏笔.id, { 章节关联: 关联 });
                          }}
                        >
                          {关联类型选项.map(t => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <button
                          className="p-1 hover:bg-red-500/20 rounded text-[var(--text-secondary)] hover:text-red-400"
                          onClick={() =>
                            updateF(当前伏笔.id, {
                              章节关联: 当前伏笔.章节关联.filter(
                                (_, idx) => idx !== i
                              ),
                            })
                          }
                        >
                          <i className="ri-close-line text-xs" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      备注
                    </label>
                    <textarea
                      className="w-full p-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg resize-y min-h-[60px]"
                      placeholder="备注信息"
                      value={当前伏笔.备注}
                      onChange={e =>
                        updateF(当前伏笔.id, { 备注: e.target.value })
                      }
                    />
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
                            className={`px-2 py-0.5 text-xs rounded ${状态样式[f.状态] || ''}`}
                          >
                            {f.状态}
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
