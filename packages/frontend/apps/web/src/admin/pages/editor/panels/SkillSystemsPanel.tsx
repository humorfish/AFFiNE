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

// ── Source-derived prompt & pipe parsers (源码 lines 10700-10817) ──────

function buildSkillSystemPrompt(): string {
  return `你是一个专业的小说功法设计师。请根据用户要求生成详细的功法设计。

输出格式要求（管道符分隔，每行一个字段）：
N|功法名称|功法大类|功法品级
D|功法描述
E|效果名称|效果类型|效果描述
C|消耗类型|消耗数值|冷却时间
R|使用限制|副作用

格式说明：
- N 行：功法名称、大类（功法/武技/炼体术/身法/魔法/咒术/符箓/阵法/特殊能力）、品级（入门/初级/中级/高级/精英/传说/神话/禁忌）
- D 行：功法的详细描述
- E 行：可多行，每个效果一行，效果类型为（攻击/防御/治疗/控制/增益/减益/移动/感知/召唤/变化/特殊）
- C 行：消耗类型、消耗数值、冷却时间
- R 行：使用限制和副作用

示例：
N|天罡三十六剑|武技|高级
D|以天罡星为引，凝聚三十六道剑气，可攻可守，变化无穷
E|星罗剑雨|攻击|三十六道剑气齐发，覆盖范围极广
E|北斗护身|防御|剑气形成护盾，抵御同阶攻击
C|灵力|中等|12时辰
R|需天罡体质方可修炼|连续使用超过三招会经脉受损

要求：
1. 功法名称要有创意，符合修仙世界观
2. 效果要有想象力，包含多种效果类型
3. 消耗和限制要平衡，不能过于逆天
4. 描述要生动，有画面感`;
}

interface PipeSkillEffect {
  效果名称: string;
  效果类型: string;
  效果描述: string;
}
interface PipeSkillData {
  功法名称: string;
  功法大类: string;
  功法品级: string;
  功法描述: string;
  效果列表: PipeSkillEffect[];
  消耗类型: string;
  消耗数值: string;
  冷却时间: string;
  使用限制: string;
  副作用: string;
}

function parseSkillPipe(text: string): PipeSkillData[] {
  const results: PipeSkillData[] = [];
  let current: PipeSkillData | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('N|')) {
      const parts = line.split('|');
      current = {
        功法名称: (parts[1] || '').trim(),
        功法大类: (parts[2] || '').trim(),
        功法品级: (parts[3] || '').trim(),
        功法描述: '',
        效果列表: [],
        消耗类型: '',
        消耗数值: '',
        冷却时间: '',
        使用限制: '',
        副作用: '',
      };
      results.push(current);
    } else if (line.startsWith('D|') && current) {
      current.功法描述 = line.slice(2).trim();
    } else if (line.startsWith('E|') && current) {
      const parts = line.split('|');
      current.效果列表.push({
        效果名称: (parts[1] || '').trim(),
        效果类型: (parts[2] || '').trim(),
        效果描述: (parts[3] || '').trim(),
      });
    } else if (line.startsWith('C|') && current) {
      const parts = line.split('|');
      current.消耗类型 = (parts[1] || '').trim();
      current.消耗数值 = (parts[2] || '').trim();
      current.冷却时间 = (parts[3] || '').trim();
    } else if (line.startsWith('R|') && current) {
      const parts = line.split('|');
      current.使用限制 = (parts[1] || '').trim();
      current.副作用 = (parts[2] || '').trim();
    }
  }
  return results;
}

function parseSkillResponse(text: string): 功法数据[] {
  // Try pipe format first
  const pipeResults = parseSkillPipe(text);
  if (pipeResults.length > 0) {
    return pipeResults.map((s, i) => ({
      id: Date.now() + i,
      功法名称: s.功法名称 || '未命名',
      功法大类: s.功法大类 || '功法',
      效果分类: '攻击',
      功法品级: s.功法品级 || '入门',
      稀有度: '普通',
      功法描述: s.功法描述 || '',
      功法简介: s.功法描述 ? s.功法描述.slice(0, 50) : '',
      功法来源: '传承',
      创造者: '',
      流派归属: '',
      效果列表: s.效果列表.map(e => ({ ...e, 消耗类型: '', 消耗数值: '' })),
      修炼信息: { 修炼难度: '', 境界要求: '', 修炼方法: '', 所需资源: '' },
      限制信息: {
        使用限制: s.使用限制,
        副作用: s.副作用,
        反噬风险: '',
        禁忌事项: '',
      },
    }));
  }
  // JSON fallback
  const { data, failed } = parseAIJSON<any>(text);
  if (failed || !data) return [];
  const items: any[] = Array.isArray(data) ? data : data.功法列表 || [];
  return items.map((s: any, i: number) => ({
    id: Date.now() + i,
    功法名称: s.功法名称 || '未命名',
    功法大类: s.功法大类 || '功法',
    效果分类: s.效果分类 || '攻击',
    功法品级: s.功法品级 || '入门',
    稀有度: s.稀有度 || '普通',
    功法描述: s.功法描述 || '',
    功法简介: s.功法简介 || '',
    功法来源: s.功法来源 || '传承',
    创造者: s.创造者 || '',
    流派归属: s.流派归属 || '',
    效果列表: s.效果列表 || [],
    修炼信息: s.修炼信息 || {
      修炼难度: '',
      境界要求: '',
      修炼方法: '',
      所需资源: '',
    },
    限制信息: s.限制信息 || {
      使用限制: '',
      副作用: '',
      反噬风险: '',
      禁忌事项: '',
    },
  }));
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

/* Source-derived: skill fields (源码 lines 164142-170xxx) */
interface 功法数据 {
  id: number;
  功法名称: string;
  功法大类: string;
  效果分类: string;
  功法品级: string;
  稀有度: string;
  功法描述: string;
  功法简介: string;
  功法来源: string;
  创造者: string;
  流派归属: string;
  效果列表: {
    效果名称: string;
    效果类型: string;
    效果描述: string;
    消耗类型: string;
    消耗数值: string;
  }[];
  修炼信息: {
    修炼难度: string;
    境界要求: string;
    修炼方法: string;
    所需资源: string;
  };
  限制信息: {
    使用限制: string;
    副作用: string;
    反噬风险: string;
    禁忌事项: string;
  };
}

/* Source-derived: options */
const 功法大类选项 = [
  '功法',
  '武技',
  '炼体术',
  '身法',
  '魔法',
  '咒术',
  '符箓',
  '阵法',
  '特殊能力',
];
const 效果分类选项 = [
  '攻击',
  '防御',
  '治疗',
  '控制',
  '增益',
  '减益',
  '移动',
  '感知',
  '召唤',
  '变化',
  '特殊',
];
const 品级选项 = [
  '入门',
  '初级',
  '中级',
  '高级',
  '精英',
  '传说',
  '神话',
  '禁忌',
];
const 稀有度选项 = ['普通', '稀有', '史诗', '传说', '绝版', '独一无二'];
const 来源选项 = [
  '传承',
  '顿悟',
  '学习',
  '奖励',
  '购买',
  '天赋',
  '契约',
  '觉醒',
  '其他',
];

const SkillSystemsSchema = z.array(z.any()).min(1);

export const SkillSystemsPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const [功法列表, set功法列表] = useState<功法数据[]>([]);
  const [当前ID, set当前ID] = useState<number | null>(null);
  const [搜索词, set搜索词] = useState('');
  const [类别过滤, set类别过滤] = useState('');
  const [width, setWidth] = useState(520);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* AI Generation state (源码 line 164593) */
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [genResult, setGenResult] = useState<功法数据[] | null>(null);
  const [genError, setGenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fetchSystemPrompt = useSystemPrompt(
    'AI生成功法',
    buildSkillSystemPrompt()
  );

  const 当前功法 = 功法列表.find(s => s.id === 当前ID) || null;

  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveVersion('skills', projectId, {
        描述: '保存功法',
        内容: 功法列表,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectId, 功法列表]);

  const addSkill = useCallback(() => {
    const id = Date.now();
    set功法列表(prev => [
      ...prev,
      {
        id,
        功法名称: '新功法',
        功法大类: '功法',
        效果分类: '攻击',
        功法品级: '入门',
        稀有度: '普通',
        功法描述: '',
        功法简介: '',
        功法来源: '传承',
        创造者: '',
        流派归属: '',
        效果列表: [],
        修炼信息: { 修炼难度: '', 境界要求: '', 修炼方法: '', 所需资源: '' },
        限制信息: { 使用限制: '', 副作用: '', 反噬风险: '', 禁忌事项: '' },
      },
    ]);
    set当前ID(id);
  }, []);

  const updateSkill = useCallback((id: number, updates: Partial<功法数据>) => {
    set功法列表(prev =>
      prev.map(s => (s.id === id ? { ...s, ...updates } : s))
    );
  }, []);

  const deleteSkill = useCallback(
    (id: number) => {
      set功法列表(prev => prev.filter(s => s.id !== id));
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
      const systemPrompt = await fetchSystemPrompt();
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: aiPrompt || '请根据世界观信息，生成完整的功法设定',
        },
      ];
      const validated = await generateValidated({
        schema: SkillSystemsSchema,
        generate: attempt =>
          generateLLM({
            messages,
            temperature: Math.min(1.0, 0.85 + attempt * 0.05),
            max_tokens: 4096,
            onChunk: setStreamText,
            signal: ac.signal,
          }),
        parseResponse: parseSkillResponse,
        maxRetries: 3,
      });
      if (!validated) {
        setGenError('AI返回格式解析失败');
        return;
      }
      const items = (Array.isArray(validated.data)
        ? validated.data
        : [validated.data]) as unknown as 功法数据[];
      setGenResult(items);
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, fetchSystemPrompt]);

  const adoptResult = useCallback(() => {
    if (!genResult) return;
    set功法列表(prev => [...prev, ...genResult]);
    setShowAIDialog(false);
    setGenResult(null);
    if (projectId)
      saveVersion('skills', projectId, {
        描述: 'AI生成功法',
        内容: [...功法列表, ...genResult],
      }).catch(() => {});
  }, [genResult, 功法列表, projectId]);

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

  const 过滤后列表 = useMemo(
    () =>
      功法列表.filter(s => {
        const 匹配搜索 =
          !搜索词 || s.功法名称.includes(搜索词) || s.功法简介.includes(搜索词);
        const 匹配类别 = !类别过滤 || s.功法大类 === 类别过滤;
        return 匹配搜索 && 匹配类别;
      }),
    [功法列表, 搜索词, 类别过滤]
  );

  return createPortal(
    <div className="v-skill-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-500/20">
                  <i className="text-lg text-purple-400 ri-book-2-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">功法体系</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    共 {功法列表.length} 个功法
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-purple-500/20 rounded-lg transition-colors text-purple-400"
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
            {/* Left: List */}
            <div className="w-56 flex flex-col border-r border-[var(--border)]">
              <div className="shrink-0 p-3 border-b border-[var(--border)] space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">功法列表</h3>
                  <button
                    className="p-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded text-xs flex items-center gap-1"
                    onClick={addSkill}
                  >
                    <i className="ri-add-line" /> 新建
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="搜索功法..."
                  value={搜索词}
                  onChange={e => set搜索词(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:outline-none"
                />
                <select
                  value={类别过滤}
                  onChange={e => set类别过滤(e.target.value)}
                  className="w-full px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs"
                >
                  <option value="">全部类别</option>
                  {功法大类选项.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto">
                {过滤后列表.map(s => (
                  <div
                    key={s.id}
                    className={`p-3 border-b border-[var(--border)] hover:bg-[var(--bg-dark)] cursor-pointer transition-colors ${当前ID === s.id ? 'bg-purple-500/10' : ''}`}
                    onClick={() => set当前ID(s.id)}
                  >
                    <span className="text-sm font-medium">{s.功法名称}</span>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {s.功法大类} · {s.功法品级}
                    </p>
                  </div>
                ))}
                {过滤后列表.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无功法
                  </div>
                )}
              </div>
            </div>

            {/* Right: Detail */}
            <div className="flex-1 overflow-y-auto">
              {当前功法 ? (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">功法详情</h3>
                    <button
                      className="p-1 hover:bg-red-500/20 rounded text-xs text-[var(--text-secondary)] hover:text-red-400"
                      onClick={() => deleteSkill(当前功法.id)}
                    >
                      <i className="ri-delete-bin-line" />
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      功法名称 *
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                      placeholder="输入功法名称"
                      value={当前功法.功法名称}
                      onChange={e =>
                        updateSkill(当前功法.id, { 功法名称: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        大类
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前功法.功法大类}
                        onChange={e =>
                          updateSkill(当前功法.id, { 功法大类: e.target.value })
                        }
                      >
                        {功法大类选项.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        品级
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前功法.功法品级}
                        onChange={e =>
                          updateSkill(当前功法.id, { 功法品级: e.target.value })
                        }
                      >
                        {品级选项.map(g => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        稀有度
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前功法.稀有度}
                        onChange={e =>
                          updateSkill(当前功法.id, { 稀有度: e.target.value })
                        }
                      >
                        {稀有度选项.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      简介
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                      placeholder="一句话简介"
                      value={当前功法.功法简介}
                      onChange={e =>
                        updateSkill(当前功法.id, { 功法简介: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      详细描述
                    </label>
                    <textarea
                      className="w-full p-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg resize-y min-h-[80px]"
                      placeholder="功法的详细描述..."
                      value={当前功法.功法描述}
                      onChange={e =>
                        updateSkill(当前功法.id, { 功法描述: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        来源
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前功法.功法来源}
                        onChange={e =>
                          updateSkill(当前功法.id, { 功法来源: e.target.value })
                        }
                      >
                        {来源选项.map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        创造者
                      </label>
                      <input
                        type="text"
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        placeholder="创造者"
                        value={当前功法.创造者}
                        onChange={e =>
                          updateSkill(当前功法.id, { 创造者: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        流派归属
                      </label>
                      <input
                        type="text"
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        placeholder="流派归属"
                        value={当前功法.流派归属}
                        onChange={e =>
                          updateSkill(当前功法.id, { 流派归属: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  {/* Effects */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold">效果列表</h4>
                      <button
                        className="text-xs text-purple-400"
                        onClick={() =>
                          updateSkill(当前功法.id, {
                            效果列表: [
                              ...当前功法.效果列表,
                              {
                                效果名称: '',
                                效果类型: '攻击',
                                效果描述: '',
                                消耗类型: '',
                                消耗数值: '',
                              },
                            ],
                          })
                        }
                      >
                        <i className="ri-add-line" /> 添加
                      </button>
                    </div>
                    {当前功法.效果列表.map((ef, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          className="flex-1 h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                          placeholder="效果名称"
                          value={ef.效果名称}
                          onChange={e => {
                            const list = 当前功法.效果列表.map((item, idx) =>
                              idx === i
                                ? { ...item, 效果名称: e.target.value }
                                : item
                            );
                            updateSkill(当前功法.id, { 效果列表: list });
                          }}
                        />
                        <select
                          className="w-16 h-8 px-1 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                          value={ef.效果类型}
                          onChange={e => {
                            const list = 当前功法.效果列表.map((item, idx) =>
                              idx === i
                                ? { ...item, 效果类型: e.target.value }
                                : item
                            );
                            updateSkill(当前功法.id, { 效果列表: list });
                          }}
                        >
                          {效果分类选项.map(t => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <button
                          className="p-1 hover:bg-red-500/20 rounded text-[var(--text-secondary)] hover:text-red-400"
                          onClick={() =>
                            updateSkill(当前功法.id, {
                              效果列表: 当前功法.效果列表.filter(
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
                  {/* 修炼信息 */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <h4 className="text-xs font-semibold mb-2">修炼信息</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="修炼难度"
                        value={当前功法.修炼信息.修炼难度}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            修炼信息: {
                              ...当前功法.修炼信息,
                              修炼难度: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="境界要求"
                        value={当前功法.修炼信息.境界要求}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            修炼信息: {
                              ...当前功法.修炼信息,
                              境界要求: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="修炼方法"
                        value={当前功法.修炼信息.修炼方法}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            修炼信息: {
                              ...当前功法.修炼信息,
                              修炼方法: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="所需资源"
                        value={当前功法.修炼信息.所需资源}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            修炼信息: {
                              ...当前功法.修炼信息,
                              所需资源: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  {/* 限制信息 */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <h4 className="text-xs font-semibold mb-2">限制信息</h4>
                    <div className="space-y-2">
                      {(
                        ['使用限制', '副作用', '反噬风险', '禁忌事项'] as const
                      ).map(field => (
                        <input
                          key={field}
                          type="text"
                          className="w-full h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                          placeholder={field}
                          value={当前功法.限制信息[field]}
                          onChange={e =>
                            updateSkill(当前功法.id, {
                              限制信息: {
                                ...当前功法.限制信息,
                                [field]: e.target.value,
                              },
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
                  选择或创建一个功法
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-darker)]">
            <span className="text-xs text-[var(--text-secondary)]">
              {功法列表.length} 个功法
            </span>
          </div>
        </div>
        <div
          className="relative z-10 w-2 bg-transparent cursor-col-resize hover:bg-purple-500/50 active:bg-purple-500 shrink-0"
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
                  <i className="ri-magic-line text-purple-400" />
                  <h3 className="font-semibold">AI生成功法</h3>
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
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:border-purple-500"
                    placeholder="描述你想要的功法特点..."
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
                    {genResult.map((s, i) => (
                      <div
                        key={i}
                        className="bg-[var(--bg-dark)] rounded-xl p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {s.功法名称}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">
                            {s.功法大类}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400">
                            {s.功法品级}
                          </span>
                        </div>
                        {s.功法简介 && (
                          <p className="text-xs text-[var(--text-secondary)] mt-1">
                            {s.功法简介}
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

export default SkillSystemsPanel;
