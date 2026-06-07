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

/* Source-derived: realm/ability structures (源码 lines 161042-162007) */
interface 境界数据 {
  境界名称: string;
  提升条件: string;
  能力表现: string;
  战力系数: string;
  境界描述: string;
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
  id: number;
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

/* ── AI prompt & parsers (source-derived pipe format) ── */

function buildPowerSystemsSystemPrompt(): string {
  return `你是一位专业的小说力量体系设计师。请根据用户要求生成详细的力量体系设计。

输出格式要求（严格按管道符|分隔的行格式）：
N|体系名称|体系类型
D|体系描述
J|境界名称|境界描述
A|能力名称|能力描述

规则：
1. N行：以N|开头，格式为 N|体系名称|体系类型（如修炼类/魔法类/武道类等）
2. D行：以D|开头，后面直接写体系的详细描述，包含力量来源、核心理念
3. J行：以J|开头，格式为 J|境界名称|境界的描述（包含提升条件、能力表现）
4. A行：以A|开头，格式为 A|能力名称|能力的描述（包含类型、学习条件、消耗）
5. 先输出N和D，再输出所有J行（境界），最后输出所有A行（能力）
6. 不要输出JSON，只输出上述管道格式

示例：
N|灵气修炼体系|修炼类
D|以天地灵气为根基的修炼体系，修士通过丹田吸纳灵气，凝聚灵力，逐步提升境界。力量来源为天地间的灵气，核心在于感悟天地法则。
J|炼气期|初入修仙，吸纳灵气入体，强化肉身，可使用简单法术。提升条件：感应灵气并成功引气入体
J|筑基期|灵气凝实为液态，筑就道基，寿元增至两百。提升条件：炼气圆满并服用筑基丹或天地奇物突破
J|金丹期|灵液凝聚为金丹，可御剑飞行，寿元五百。提升条件：筑基大圆满后凝练金丹
A|御剑术|攻击类能力，以灵力驱动飞剑攻击敌人，金丹期以上可修炼，消耗中等灵力
A|灵盾术|防御类能力，凝聚灵气形成护盾，筑基期可学，消耗少量灵力`;
}

function parsePowerSystemsPipe(text: string): 力量体系数据 | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  let 体系名称 = '';
  let 体系类型 = '修炼类';
  let 体系描述 = '';
  const 境界列表: 境界数据[] = [];
  const 能力列表: 能力数据[] = [];

  for (const line of lines) {
    if (line.startsWith('N|')) {
      const parts = line.slice(2).split('|');
      体系名称 = (parts[0] || '').trim();
      体系类型 = (parts[1] || '修炼类').trim();
    } else if (line.startsWith('D|')) {
      体系描述 = line.slice(2).trim();
    } else if (line.startsWith('J|')) {
      const parts = line.slice(2).split('|');
      境界列表.push({
        境界名称: (parts[0] || '').trim(),
        境界描述: (parts[1] || '').trim(),
        提升条件: '',
        能力表现: '',
        战力系数: '0',
      });
    } else if (line.startsWith('A|')) {
      const parts = line.slice(2).split('|');
      能力列表.push({
        能力名称: (parts[0] || '').trim(),
        能力类型: '攻击',
        能力描述: (parts[1] || '').trim(),
        学习条件: '',
        消耗代价: '',
      });
    }
  }

  if (!体系名称 && 境界列表.length === 0 && 能力列表.length === 0) return null;
  return {
    id: Date.now(),
    体系名称: 体系名称 || '新体系',
    体系类型: 体系类型,
    体系描述: 体系描述,
    力量来源: '',
    境界列表,
    能力列表,
    修行路径: { 修行方法: '', 修行资源: '', 修行难点: '', 突破要点: '' },
    限制约束: { 使用限制: '', 副作用: '', 反噬风险: '', 禁忌条款: '' },
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

  const [width, setWidth] = useState(520);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* AI Generation state (源码 lines 162221-162793) */
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [genResult, setGenResult] = useState<力量体系数据 | null>(null);
  const [genError, setGenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fetchSystemPrompt = useSystemPrompt(
    'AI生成力量体系',
    buildPowerSystemsSystemPrompt()
  );

  const 当前体系 = 体系列表.find(s => s.id === 当前ID) || null;

  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveVersion('power-systems', projectId, {
        描述: '保存力量体系',
        内容: 体系列表,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectId, 体系列表]);

  /* CRUD */
  const addSystem = useCallback(() => {
    const id = Date.now();
    set体系列表(prev => [
      ...prev,
      {
        id,
        体系名称: '新体系',
        体系类型: '修炼类',
        体系描述: '',
        力量来源: '',
        境界列表: [],
        能力列表: [],
        修行路径: { 修行方法: '', 修行资源: '', 修行难点: '', 突破要点: '' },
        限制约束: { 使用限制: '', 副作用: '', 反噬风险: '', 禁忌条款: '' },
      },
    ]);
    set当前ID(id);
  }, []);

  const updateSystem = useCallback(
    (id: number, updates: Partial<力量体系数据>) => {
      set体系列表(prev =>
        prev.map(s => (s.id === id ? { ...s, ...updates } : s))
      );
    },
    []
  );

  const deleteSystem = useCallback(
    (id: number) => {
      set体系列表(prev => prev.filter(s => s.id !== id));
      if (当前ID === id) set当前ID(null);
    },
    [当前ID]
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
          提升条件: '',
          能力表现: '',
          战力系数: '0',
          境界描述: '',
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

  /* AI generation (源码 function H opens, function generates) */
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
      const existingStr = 体系列表
        .map(s => `${s.体系名称}(${s.体系类型}): ${s.体系描述 || '无描述'}`)
        .join('\n');
      const systemPrompt = await fetchSystemPrompt();
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: `${aiPrompt ? aiPrompt + '\n\n' : ''}${existingStr ? '已有设定：\n' + existingStr + '\n\n' : ''}请生成一个力量体系，包括境界列表和能力列表。按管道格式输出。`,
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
      const data = validated.data as any;
      const result: 力量体系数据 = {
        id: Date.now(),
        体系名称: data.体系名称 || '新体系',
        体系类型: data.体系类型 || '修炼类',
        体系描述: data.体系描述 || '',
        力量来源: data.力量来源 || '',
        境界列表: Array.isArray(data.境界列表)
          ? data.境界列表.map((r: any) => ({
              境界名称: r.境界名称 || '',
              提升条件: r.提升条件 || '',
              能力表现: r.能力表现 || '',
              战力系数: String(r.战力系数 || 0),
              境界描述: r.境界描述 || '',
            }))
          : [],
        能力列表: Array.isArray(data.能力列表)
          ? data.能力列表.map((a: any) => ({
              能力名称: a.能力名称 || '',
              能力类型: a.能力类型 || '攻击',
              学习条件: a.学习条件 || '',
              消耗代价: a.消耗代价 || '',
              能力描述: a.能力描述 || '',
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
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, 体系列表, fetchSystemPrompt]);

  const adoptResult = useCallback(() => {
    if (!genResult) return;
    set体系列表(prev => [...prev, genResult]);
    setShowAIDialog(false);
    setGenResult(null);
    if (projectId) {
      saveVersion('power-systems', projectId, {
        描述: 'AI生成力量体系',
        内容: [...体系列表, genResult],
      }).catch(() => {});
    }
  }, [genResult, 体系列表, projectId]);

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
            {/* Left: System List */}
            <div className="w-56 flex flex-col border-r border-[var(--border)]">
              <div className="shrink-0 p-3 border-b border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">体系列表</h3>
                  <button
                    className="p-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs flex items-center gap-1"
                    onClick={addSystem}
                  >
                    <i className="ri-add-line" /> 新建
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {体系列表.map(s => (
                  <div
                    key={s.id}
                    className={`p-3 border-b border-[var(--border)] hover:bg-[var(--bg-dark)] cursor-pointer transition-colors ${当前ID === s.id ? 'bg-red-500/10' : ''}`}
                    onClick={() => set当前ID(s.id)}
                  >
                    <span className="text-sm font-medium">{s.体系名称}</span>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {s.体系类型} · {s.境界列表.length}境 · {s.能力列表.length}
                      技能
                    </p>
                  </div>
                ))}
                {体系列表.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无体系
                  </div>
                )}
              </div>
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
                      <input
                        type="text"
                        className="w-full h-9 px-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-red-500/50"
                        placeholder="如：修炼类"
                        value={当前体系.体系类型}
                        onChange={e =>
                          updateSystem(当前体系.id, {
                            体系类型: e.target.value,
                          })
                        }
                      />
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
                              type="text"
                              className="w-20 h-8 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded focus:outline-none focus:border-red-500/50"
                              placeholder="战力指数"
                              value={r.战力系数}
                              onChange={e =>
                                updateRealm(i, { 战力系数: e.target.value })
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
    </div>,
    document.body
  );
};

export default PowerSystemsPanel;
