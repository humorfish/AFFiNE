import React, { useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import {
  generateLLM,
  generateValidated,
  useSystemPrompt,
} from './panel-shared';
import { saveVersion } from '../useWorldApi';

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

/* Source-derived: faction fields (源码 lines 148230-151600) */
interface 势力数据 {
  id: number;
  势力名称: string;
  势力类型: string;
  实力等级: string;
  立场: string;
  势力描述: string;
  势力颜色: string;
  势力图标: string;
}

/* Source-derived: relation fields (源码 lines 151400-151600) */
interface 关系数据 {
  id: number;
  源势力ID: number;
  目标势力ID: number;
  源势力名称: string;
  目标势力名称: string;
  关系类型: string;
  关系描述: string;
  关系颜色: string;
}

/* Source-derived: type/stance/level options */
const 势力类型选项 = ['门派', '家族', '组织', '宗教', '商会', '帮派'];
const 实力等级选项 = ['顶尖', '一流', '二流', '三流', '末流'];
const 立场选项 = ['正派', '邪派', '中立', '灰色'];
const 关系类型选项 = ['敌对', '战争', '同盟', '合作', '从属', '中立'];

const 立场样式: Record<string, string> = {
  正派: 'bg-green-500/20 text-green-400',
  邪派: 'bg-red-500/20 text-red-400',
  中立: 'bg-gray-500/20 text-gray-400',
  灰色: 'bg-orange-500/20 text-orange-400',
};

const 关系样式: Record<string, string> = {
  敌对: 'bg-red-500/20 text-red-400',
  战争: 'bg-red-500/20 text-red-400',
  同盟: 'bg-green-500/20 text-green-400',
  合作: 'bg-blue-500/20 text-blue-400',
  从属: 'bg-purple-500/20 text-purple-400',
  中立: 'bg-gray-500/20 text-gray-400',
};

/* Source-derived: AI generation modes (源码 lines 150590-151387) */
type AIMode = 'complete' | 'faction' | 'relation';

const AI模式列表 = [
  {
    value: 'complete' as const,
    label: '完整生成',
    icon: 'ri-apps-line',
    badge: 'bg-purple-500/20 text-purple-400',
  },
  {
    value: 'faction' as const,
    label: '增量势力',
    icon: 'ri-team-line',
    badge: 'bg-blue-500/20 text-blue-400',
  },
  {
    value: 'relation' as const,
    label: '增量关系',
    icon: 'ri-links-line',
    badge: 'bg-orange-500/20 text-orange-400',
  },
];

/* ── AI prompt & parsers (source-derived pipe format) ── */

function buildFactionsSystemPrompt(): string {
  return `你是一位专业的小说势力设计师。请根据用户要求生成详细的势力阵营设计。

输出格式要求（严格按管道符|分隔的行格式）：
F|势力名称|势力类型|势力描述
R|源势力|目标势力|关系类型|关系描述

规则：
1. F行：以F|开头，格式为 F|势力名称|势力类型（门派/家族/组织/宗教/商会/帮派）|势力的详细描述
2. R行：以R|开头，格式为 R|源势力名称|目标势力名称|关系类型（敌对/战争/同盟/合作/从属/中立）|关系描述
3. 先输出所有势力F行，再输出关系R行
4. 不要输出JSON，只输出上述管道格式
5. 势力描述中可包含立场（正派/邪派/中立/灰色）和实力等级（顶尖/一流/二流/三流/末流）

示例：
F|天剑宗|门派|正派顶尖势力，以剑道传承闻名，宗主为渡劫期剑修
F|血魔殿|门派|邪派一流势力，修炼血道功法，与天剑宗世代为敌
F|万宝阁|商会|中立势力，掌控修仙界七成以上商贸流通
R|天剑宗|血魔殿|敌对|千年前的正邪大战结下血仇，至今势不两立
R|万宝阁|天剑宗|合作|万宝阁为天剑宗提供炼器材料，换取剑法典籍`;
}

interface FactionsGenResult {
  势力列表?: any[];
  关系列表?: any[];
}

function parseFactionsPipe(text: string): FactionsGenResult | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const 势力列表: any[] = [];
  const 关系列表: any[] = [];

  for (const line of lines) {
    if (line.startsWith('F|')) {
      const parts = line.slice(2).split('|');
      势力列表.push({
        势力名称: (parts[0] || '').trim(),
        势力类型: (parts[1] || '门派').trim(),
        势力描述: (parts[2] || '').trim(),
        立场: '中立',
        实力等级: '三流',
        势力颜色: 'rgb(139, 92, 246)',
        势力图标: 'ri-group-line',
      });
    } else if (line.startsWith('R|')) {
      const parts = line.slice(2).split('|');
      关系列表.push({
        源势力名称: (parts[0] || '').trim(),
        目标势力名称: (parts[1] || '').trim(),
        关系类型: (parts[2] || '中立').trim(),
        关系描述: (parts[3] || '').trim(),
      });
    }
  }

  if (势力列表.length === 0 && 关系列表.length === 0) return null;
  const result: FactionsGenResult = {};
  if (势力列表.length > 0) result.势力列表 = 势力列表;
  if (关系列表.length > 0) result.关系列表 = 关系列表;
  return result;
}

function parseFactionsResponse(text: string): FactionsGenResult | null {
  if (!text) return null;
  const pipe = parseFactionsPipe(text.trim());
  if (pipe && (pipe.势力列表?.length || pipe.关系列表?.length)) return pipe;
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

const FactionsSchema = z.record(z.any());

export const FactionsPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const [势力列表, set势力列表] = useState<势力数据[]>([]);
  const [关系列表, set关系列表] = useState<关系数据[]>([]);
  const [当前势力ID, set当前势力ID] = useState<number | null>(null);
  const [搜索词, set搜索词] = useState('');
  const [立场过滤, set立场过滤] = useState('');

  const [width, setWidth] = useState(520);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* Relation dialog */
  const [showRelationDialog, setShowRelationDialog] = useState(false);
  const [relationForm, setRelationForm] = useState({
    源势力ID: 0,
    目标势力ID: 0,
    关系类型: '中立',
    关系描述: '',
  });

  /* AI Generation state (源码 lines 148240-148261, 150590-151387) */
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiMode, setAiMode] = useState<AIMode>('complete');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [genResult, setGenResult] = useState<any>(null);
  const [genError, setGenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fetchSystemPrompt = useSystemPrompt(
    'AI生成势力阵营',
    buildFactionsSystemPrompt()
  );

  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveVersion('factions', projectId, {
        描述: '保存势力阵营',
        内容: { 势力列表, 关系列表 },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectId, 势力列表, 关系列表]);

  /* CRUD: factions */
  const addFaction = useCallback(() => {
    const id = Date.now();
    const colors = [
      'rgb(139, 92, 246)',
      'rgb(34, 197, 94)',
      'rgb(249, 115, 22)',
      'rgb(239, 68, 68)',
      'rgb(59, 130, 246)',
      'rgb(234, 179, 8)',
    ];
    set势力列表(prev => [
      ...prev,
      {
        id,
        势力名称: '新势力',
        势力类型: '门派',
        实力等级: '三流',
        立场: '中立',
        势力描述: '',
        势力颜色: colors[Math.floor(Math.random() * colors.length)],
        势力图标: 'ri-group-line',
      },
    ]);
    set当前势力ID(id);
  }, []);

  const updateFaction = useCallback(
    (id: number, updates: Partial<势力数据>) => {
      set势力列表(prev =>
        prev.map(f => (f.id === id ? { ...f, ...updates } : f))
      );
    },
    []
  );

  const deleteFaction = useCallback(
    (id: number) => {
      set势力列表(prev => prev.filter(f => f.id !== id));
      set关系列表(prev =>
        prev.filter(r => r.源势力ID !== id && r.目标势力ID !== id)
      );
      if (当前势力ID === id) set当前势力ID(null);
    },
    [当前势力ID]
  );

  /* CRUD: relations */
  const addRelation = useCallback(() => {
    if (
      !relationForm.源势力ID ||
      !relationForm.目标势力ID ||
      relationForm.源势力ID === relationForm.目标势力ID
    )
      return;
    const src = 势力列表.find(f => f.id === relationForm.源势力ID);
    const tgt = 势力列表.find(f => f.id === relationForm.目标势力ID);
    if (!src || !tgt) return;
    set关系列表(prev => [
      ...prev,
      {
        id: Date.now(),
        源势力ID: relationForm.源势力ID,
        目标势力ID: relationForm.目标势力ID,
        源势力名称: src.势力名称,
        目标势力名称: tgt.势力名称,
        关系类型: relationForm.关系类型,
        关系描述: relationForm.关系描述,
        关系颜色: '#8b5cf6',
      },
    ]);
    setShowRelationDialog(false);
    setRelationForm({
      源势力ID: 0,
      目标势力ID: 0,
      关系类型: '中立',
      关系描述: '',
    });
  }, [relationForm, 势力列表]);

  const deleteRelation = useCallback((id: number) => {
    set关系列表(prev => prev.filter(r => r.id !== id));
  }, []);

  /* AI generation (源码 function Q opens, function C generates) */
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
      const existingStr = [
        ...势力列表.map(
          f =>
            `${f.势力名称}(${f.势力类型}/${f.立场}): ${f.势力描述 || '无描述'}`
        ),
        ...关系列表.map(
          r => `${r.源势力名称} → ${r.目标势力名称}(${r.关系类型})`
        ),
      ]
        .filter(Boolean)
        .join('\n');

      const systemPrompt = await fetchSystemPrompt();
      let userContent = '';
      if (aiMode === 'complete') {
        userContent = `${aiPrompt ? aiPrompt + '\n\n' : ''}${existingStr ? '已有设定：\n' + existingStr + '\n\n' : ''}请生成完整的势力阵营，包括势力列表和关系。按管道格式输出。`;
      } else if (aiMode === 'faction') {
        userContent = `${aiPrompt ? aiPrompt + '\n\n' : ''}${existingStr ? '已有设定：\n' + existingStr + '\n\n' : ''}请增量生成新的势力。按管道格式输出F行。`;
      } else {
        userContent = `${aiPrompt ? aiPrompt + '\n\n' : ''}${existingStr ? '已有设定：\n' + existingStr + '\n\n' : ''}请增量生成势力之间的关系。按管道格式输出R行。`;
      }

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userContent },
      ];

      const validated = await generateValidated({
        schema: FactionsSchema,
        generate: attempt =>
          generateLLM({
            messages,
            temperature: Math.min(1.0, 0.85 + attempt * 0.05),
            max_tokens: 4096,
            onChunk: setStreamText,
            signal: ac.signal,
          }),
        parseResponse: parseFactionsResponse,
        maxRetries: 3,
      });
      if (!validated) {
        setGenError('AI返回格式解析失败');
        return;
      }
      setGenResult(validated.data);
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [aiMode, aiPrompt, 势力列表, 关系列表, fetchSystemPrompt]);

  const adoptResult = useCallback(() => {
    if (!genResult) return;
    if (Array.isArray(genResult.势力列表)) {
      const newFactions = genResult.势力列表.map((f: any, i: number) => ({
        id: Date.now() + i,
        势力名称: f.势力名称 || f.名称 || '未命名',
        势力类型: f.势力类型 || f.类型 || '门派',
        实力等级: f.实力等级 || f.实力 || '三流',
        立场: f.立场 || '中立',
        势力描述: f.势力描述 || f.描述 || '',
        势力颜色: f.势力颜色 || 'rgb(139, 92, 246)',
        势力图标: f.势力图标 || 'ri-group-line',
      }));
      set势力列表(prev => [...prev, ...newFactions]);
    }
    if (Array.isArray(genResult.关系列表)) {
      const newRelations = genResult.关系列表.map((r: any, i: number) => ({
        id: Date.now() + 100 + i,
        源势力ID: r.源势力ID || 0,
        目标势力ID: r.目标势力ID || 0,
        源势力名称: r.源势力名称 || '',
        目标势力名称: r.目标势力名称 || '',
        关系类型: r.关系类型 || '中立',
        关系描述: r.关系描述 || '',
        关系颜色: r.关系颜色 || '#8b5cf6',
      }));
      set关系列表(prev => [...prev, ...newRelations]);
    }
    setShowAIDialog(false);
    setGenResult(null);
    if (projectId) {
      saveVersion('factions', projectId, {
        描述: 'AI生成势力阵营',
        内容: { 势力列表, 关系列表 },
      }).catch(() => {});
    }
  }, [genResult, 势力列表, 关系列表, projectId]);

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

  const 过滤后列表 = useMemo(() => {
    return 势力列表.filter(f => {
      const 匹配搜索 =
        !搜索词 ||
        f.势力名称.toLowerCase().includes(搜索词.toLowerCase()) ||
        f.势力描述.toLowerCase().includes(搜索词.toLowerCase());
      const 匹配立场 = !立场过滤 || f.立场 === 立场过滤;
      return 匹配搜索 && 匹配立场;
    });
  }, [势力列表, 搜索词, 立场过滤]);

  const 当前势力 = 势力列表.find(f => f.id === 当前势力ID) || null;

  return createPortal(
    <div className="v-factions-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width }}
        >
          {/* Header (源码 lines 148450-148762) */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-violet-500/20">
                  <i className="text-lg text-purple-400 ri-group-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">势力阵营</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    构建你的势力格局
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-purple-500/20 rounded transition-colors text-purple-400 cursor-pointer"
                  title="AI生成"
                  onClick={openAIDialog}
                  disabled={generating}
                >
                  <i
                    className={`ri-${generating ? 'loader-4-line animate-spin' : 'magic-line'}`}
                  />
                </button>
                <button
                  className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors disabled:opacity-50"
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
            {/* Left: Faction List (源码 lines 148766-148898) */}
            <div className="w-60 flex flex-col border-r border-[var(--border)]">
              <div className="shrink-0 p-3 border-b border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">势力列表</h3>
                  <button
                    className="p-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded text-xs flex items-center gap-1 transition-colors"
                    onClick={addFaction}
                  >
                    <i className="ri-add-line" /> 新建
                  </button>
                </div>
                <div className="relative mb-2">
                  <i className="ri-search-line absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] text-xs" />
                  <input
                    type="text"
                    placeholder="搜索势力..."
                    value={搜索词}
                    onChange={e => set搜索词(e.target.value)}
                    className="w-full pl-7 pr-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:outline-none focus:border-purple-500/50"
                  />
                </div>
                <select
                  value={立场过滤}
                  onChange={e => set立场过滤(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:outline-none focus:border-purple-500/50"
                >
                  <option value="">全部立场</option>
                  {立场选项.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto">
                {过滤后列表.map(f => (
                  <div
                    key={f.id}
                    className={`p-3 border-b border-[var(--border)] hover:bg-[var(--bg-dark)] cursor-pointer transition-colors ${当前势力ID === f.id ? 'bg-purple-500/10' : ''}`}
                    onClick={() => set当前势力ID(f.id)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: f.势力颜色
                            ? f.势力颜色
                                .replace('rgb', 'rgba')
                                .replace(')', ',0.2)')
                            : 'rgba(139,92,246,0.2)',
                        }}
                      >
                        <i
                          className={`${f.势力图标 || 'ri-group-line'} text-xs`}
                          style={{ color: f.势力颜色 || '#8b5cf6' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium truncate">
                            {f.势力名称}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-xs rounded shrink-0 ${立场样式[f.立场] || 'bg-gray-500/20 text-gray-400'}`}
                          >
                            {f.立场}
                          </span>
                        </div>
                        <span className="text-xs text-[var(--text-secondary)]">
                          {f.势力类型} · {f.实力等级}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {过滤后列表.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无势力
                  </div>
                )}
              </div>
            </div>

            {/* Right: Detail (源码 lines 149045-149300) */}
            <div className="flex-1 flex flex-col overflow-y-auto">
              {当前势力 ? (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">势力详情</h3>
                    <button
                      className="p-1 hover:bg-red-500/20 rounded text-xs text-[var(--text-secondary)] hover:text-red-400"
                      onClick={() => deleteFaction(当前势力.id)}
                    >
                      <i className="ri-delete-bin-line" />
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      势力名称
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-purple-500/50"
                      value={当前势力.势力名称}
                      onChange={e =>
                        updateFaction(当前势力.id, { 势力名称: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        类型
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-purple-500/50"
                        value={当前势力.势力类型}
                        onChange={e =>
                          updateFaction(当前势力.id, {
                            势力类型: e.target.value,
                          })
                        }
                      >
                        {势力类型选项.map(t => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        实力
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-purple-500/50"
                        value={当前势力.实力等级}
                        onChange={e =>
                          updateFaction(当前势力.id, {
                            实力等级: e.target.value,
                          })
                        }
                      >
                        {实力等级选项.map(l => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        立场
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-purple-500/50"
                        value={当前势力.立场}
                        onChange={e =>
                          updateFaction(当前势力.id, { 立场: e.target.value })
                        }
                      >
                        {立场选项.map(s => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      描述
                    </label>
                    <textarea
                      className="w-full p-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-purple-500/50 min-h-[80px]"
                      placeholder="描述势力的背景和特点"
                      value={当前势力.势力描述}
                      onChange={e =>
                        updateFaction(当前势力.id, { 势力描述: e.target.value })
                      }
                    />
                  </div>

                  {/* Relations */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-[var(--text-secondary)]">
                        势力关系
                      </h4>
                      <button
                        className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 flex items-center gap-1"
                        onClick={() => setShowRelationDialog(true)}
                      >
                        <i className="ri-add-line" /> 添加关系
                      </button>
                    </div>
                    <div className="space-y-2">
                      {关系列表
                        .filter(
                          r =>
                            r.源势力ID === 当前势力.id ||
                            r.目标势力ID === 当前势力.id
                        )
                        .map(r => (
                          <div
                            key={r.id}
                            className="flex items-center gap-2 p-2 bg-[var(--bg-card)] rounded-lg text-xs"
                          >
                            <span className="font-medium">{r.源势力名称}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded ${关系样式[r.关系类型] || 'bg-gray-500/20 text-gray-400'}`}
                            >
                              {r.关系类型}
                            </span>
                            <span className="font-medium">
                              {r.目标势力名称}
                            </span>
                            {r.关系描述 && (
                              <span className="text-[var(--text-secondary)] ml-auto">
                                {r.关系描述}
                              </span>
                            )}
                            <button
                              className="p-0.5 hover:bg-red-500/20 rounded text-[var(--text-secondary)] hover:text-red-400 shrink-0"
                              onClick={() => deleteRelation(r.id)}
                            >
                              <i className="ri-close-line text-xs" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
                  选择或创建一个势力
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-darker)] flex justify-between">
            <span className="text-xs text-[var(--text-secondary)]">
              {势力列表.length} 个势力 · {关系列表.length} 个关系
            </span>
          </div>
        </div>

        <div
          className="relative z-10 w-2 bg-transparent cursor-col-resize hover:bg-purple-500/50 active:bg-purple-500 shrink-0"
          title="拖拽调整宽度"
          onMouseDown={handleMouseDown}
        />
        <div
          className="fixed top-0 bottom-0 right-0 bg-black/0 hover:bg-black/5"
          style={{ left: (leftOffset || 0) + width + 2 }}
          onClick={onClose}
        />
      </div>

      {/* Relation Dialog (源码 lines 151400-151600) */}
      {showRelationDialog &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-md flex flex-col shadow-2xl">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="font-semibold">添加势力关系</h3>
                <button
                  className="p-1.5 hover:bg-[var(--bg-dark)] rounded-lg"
                  onClick={() => setShowRelationDialog(false)}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    源势力
                  </label>
                  <select
                    className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg"
                    value={relationForm.源势力ID}
                    onChange={e =>
                      setRelationForm({
                        ...relationForm,
                        源势力ID: Number(e.target.value),
                      })
                    }
                  >
                    <option value={0}>选择势力</option>
                    {势力列表.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.势力名称}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    关系类型
                  </label>
                  <select
                    className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg"
                    value={relationForm.关系类型}
                    onChange={e =>
                      setRelationForm({
                        ...relationForm,
                        关系类型: e.target.value,
                      })
                    }
                  >
                    {关系类型选项.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    目标势力
                  </label>
                  <select
                    className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg"
                    value={relationForm.目标势力ID}
                    onChange={e =>
                      setRelationForm({
                        ...relationForm,
                        目标势力ID: Number(e.target.value),
                      })
                    }
                  >
                    <option value={0}>选择势力</option>
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
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    关系描述
                  </label>
                  <input
                    type="text"
                    className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg"
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
              <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
                <button
                  className="px-4 py-2 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg text-sm"
                  onClick={() => setShowRelationDialog(false)}
                >
                  取消
                </button>
                <button
                  className="px-4 py-2 btn-primary rounded-lg text-sm flex items-center gap-1"
                  onClick={addRelation}
                >
                  <i className="ri-check-line" /> 确定
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* AI Generation Dialog (源码 lines 150590-151387) */}
      {showAIDialog &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ri-magic-line text-purple-400" />
                  <h3 className="font-semibold">
                    {aiMode === 'complete'
                      ? 'AI生成势力阵营'
                      : aiMode === 'faction'
                        ? 'AI增量生成势力'
                        : 'AI增量生成关系'}
                  </h3>
                </div>
                <button
                  className="p-1.5 hover:bg-[var(--bg-dark)] rounded-lg"
                  onClick={cancelGeneration}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Mode selection */}
                <div className="flex gap-2">
                  {AI模式列表.map(mode => (
                    <button
                      key={mode.value}
                      className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${aiMode === mode.value ? mode.badge + ' font-medium' : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                      onClick={() => setAiMode(mode.value)}
                    >
                      <i className={mode.icon} /> {mode.label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1.5">
                    生成提示词（可选）
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
                    {genResult.势力列表 && (
                      <div className="bg-[var(--bg-dark)] rounded-xl p-3">
                        <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                          <i className="ri-team-line text-purple-400" /> 势力（
                          {genResult.势力列表.length}个）
                        </label>
                        {genResult.势力列表
                          .slice(0, 6)
                          .map((f: any, i: number) => (
                            <div key={i} className="mt-1 text-xs">
                              {f.势力名称 || f.名称} ({f.势力类型 || f.类型}) -{' '}
                              {f.立场}
                            </div>
                          ))}
                        {genResult.势力列表.length > 6 && (
                          <div className="text-xs text-[var(--text-secondary)] mt-1">
                            ...还有 {genResult.势力列表.length - 6} 个
                          </div>
                        )}
                      </div>
                    )}
                    {genResult.关系列表 && (
                      <div className="bg-[var(--bg-dark)] rounded-xl p-3">
                        <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                          <i className="ri-links-line text-orange-400" /> 关系（
                          {genResult.关系列表.length}个）
                        </label>
                        {genResult.关系列表
                          .slice(0, 6)
                          .map((r: any, i: number) => (
                            <div key={i} className="mt-1 text-xs">
                              {r.源势力名称} → {r.目标势力名称} ({r.关系类型})
                            </div>
                          ))}
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

export default FactionsPanel;
