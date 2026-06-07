import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  generateLLM,
  generateValidated,
  parseAIJSON,
  useSystemPrompt,
} from './panel-shared';
import { z } from 'zod';
import {
  saveVersion,
  saveGeneration,
  saveData,
  API_BASE,
  getAuthHeaders,
} from '../useWorldApi';

// ── Source-derived data ────────────────────────────────────────

const 状态选项 = ['pending', 'writing', 'complete'] as const;
const 状态标签: Record<string, string> = {
  pending: '待处理',
  writing: '写作中',
  complete: '已完成',
};
const 状态颜色: Record<string, string> = {
  pending: '#9ca3af',
  writing: '#fbbf24',
  complete: '#4ade80',
};

const 情绪选项 = [
  { 值: 'tension', 标签: '紧张' },
  { 值: 'thrill', 标签: '刺激' },
  { 值: 'sadness', 标签: '悲伤' },
  { 值: 'romance', 标签: '浪漫' },
  { 值: 'curiosity', 标签: '好奇' },
];

// ── Source-derived prompt & parsers ────────────────────────────

/** Build system prompt for outline generation with pipe format spec */
function buildOutlineSystemPrompt(existingVolumes: string): string {
  return [
    '你是一位专业的小说大纲设计师。请设计完整的大纲结构。',
    '',
    '请严格按照以下管道格式输出，每行一条记录：',
    'V|第X卷 卷名|本卷概述',
    'C|第X章 章名|章节摘要',
    '',
    '规则：',
    '- V行表示卷，后面紧跟的C行属于该卷',
    '- 只输出V和C行，不要输出其他内容',
    existingVolumes
      ? `- 已有卷（禁止重复）：${existingVolumes}`
      : '- 暂无已有卷',
    '',
    '也可以输出JSON格式作为备选。',
  ].join('\n');
}

/** Parse pipe format for outlines: V|... and C| lines */
function parseOutlinePipe(text: string): 卷大纲[] | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const volumes: 卷大纲[] = [];
  let currentVolume: 卷大纲 | null = null;
  let hasPipe = false;

  for (const line of lines) {
    if (line.startsWith('V|')) {
      hasPipe = true;
      const parts = line.split('|');
      currentVolume = {
        id: Date.now() + Math.random() + volumes.length,
        卷名称: parts[1]?.trim() || '',
        幕名称: '',
        摘要: parts.slice(2).join('|').trim() || '',
        章节: [],
      };
      volumes.push(currentVolume);
    } else if (line.startsWith('C|') && currentVolume) {
      hasPipe = true;
      const parts = line.split('|');
      currentVolume.章节.push({
        id: Date.now() + Math.random() + currentVolume.章节.length,
        标题: parts[1]?.trim() || '',
        描述: '',
        摘要: parts.slice(2).join('|').trim() || '',
        开头承接: '',
        章尾悬念: '',
        出场角色列表: [],
        场景列表: [],
        关键对话: [],
        写作要点: [],
        情绪列表: [],
        伏笔列表: [],
        目标字数: 2000,
        正文字数: 0,
        状态: 'pending',
      });
    }
  }

  return hasPipe && volumes.length > 0 ? volumes : null;
}

/** Parse pipe format for chapter-only output: C| lines */
function parseChapterPipe(text: string): 章节大纲[] | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const chapters: 章节大纲[] = [];
  let hasPipe = false;

  for (const line of lines) {
    if (line.startsWith('C|')) {
      hasPipe = true;
      const parts = line.split('|');
      chapters.push({
        id: Date.now() + Math.random() + chapters.length,
        标题: parts[1]?.trim() || '',
        描述: '',
        摘要: parts.slice(2).join('|').trim() || '',
        开头承接: '',
        章尾悬念: '',
        出场角色列表: [],
        场景列表: [],
        关键对话: [],
        写作要点: [],
        情绪列表: [],
        伏笔列表: [],
        目标字数: 2000,
        正文字数: 0,
        状态: 'pending',
      });
    }
  }

  return hasPipe && chapters.length > 0 ? chapters : null;
}

/** Combined parser: pipe first, then JSON fallback */
function parseOutlineResponse(text: string): 卷大纲[] | null {
  const pipeResult = parseOutlinePipe(text);
  if (pipeResult) return pipeResult;
  const { data, failed } = parseAIJSON<卷大纲[]>(text);
  if (!failed && Array.isArray(data)) return data;
  return null;
}

/** Combined parser for chapters: pipe first, then JSON fallback */
function parseChapterResponse(text: string): 章节大纲[] | null {
  const pipeResult = parseChapterPipe(text);
  if (pipeResult) return pipeResult;
  const { data, failed } = parseAIJSON<章节大纲[]>(text);
  if (!failed && Array.isArray(data)) return data;
  return null;
}

// ── Interfaces ─────────────────────────────────────────────────

const outlineSchema = z.array(z.any()).min(1);

interface 章节大纲 {
  id: number;
  标题: string;
  描述: string;
  摘要: string;
  开头承接: string;
  章尾悬念: string;
  出场角色列表: string[];
  场景列表: string[];
  关键对话: string[];
  写作要点: string[];
  情绪列表: string[];
  伏笔列表: string[];
  目标字数: number;
  正文字数: number;
  状态: string;
}

interface 卷大纲 {
  id: number;
  卷名称: string;
  幕名称: string;
  摘要: string;
  章节: 章节大纲[];
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ── Helpers ────────────────────────────────────────────────────

const empty章节 = (): 章节大纲 => ({
  id: Date.now() + Math.random(),
  标题: '',
  描述: '',
  摘要: '',
  开头承接: '',
  章尾悬念: '',
  出场角色列表: [],
  场景列表: [],
  关键对话: [],
  写作要点: [],
  情绪列表: [],
  伏笔列表: [],
  目标字数: 2000,
  正文字数: 0,
  状态: 'pending',
});

const empty卷 = (): 卷大纲 => ({
  id: Date.now(),
  卷名称: '',
  幕名称: '',
  摘要: '',
  章节: [],
});

// ── Main Component ─────────────────────────────────────────────

export const OutlineSettingsPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const [卷列表, set卷列表] = useState<卷大纲[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Selection
  const [展开卷集合, set展开卷集合] = useState<Set<number>>(new Set());
  const [选中卷, set选中卷] = useState<卷大纲 | null>(null);
  const [选中章节, set选中章节] = useState<章节大纲 | null>(null);
  const [view, setView] = useState<'list' | 'volume' | 'chapter'>('list');

  // AI states
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAIDialog, setShowAIDialog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fetchSystemPrompt = useSystemPrompt('AI生成大纲', '');

  // ── Data fetching ──
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/outlines/project/${projectId}`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data)) {
          set卷列表(result.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // ── Stats ──
  const 总章数 = 卷列表.reduce((s, v) => s + v.章节.length, 0);
  const 完成章数 = 卷列表.reduce(
    (s, v) => s + v.章节.filter(c => c.状态 === 'complete').length,
    0
  );
  const 完成率 = 总章数 > 0 ? Math.round((完成章数 / 总章数) * 100) : 0;

  // ── CRUD ──
  const addVolume = () => {
    const vol = empty卷();
    vol.卷名称 = `第${卷列表.length + 1}卷`;
    set卷列表(prev => [...prev, vol]);
    set选中卷(vol);
    setView('volume');
  };

  const addChapter = (volumeId: number) => {
    set卷列表(prev =>
      prev.map(v => {
        if (v.id !== volumeId) return v;
        const ch = empty章节();
        ch.标题 = `第${v.章节.length + 1}章`;
        return { ...v, 章节: [...v.章节, ch] };
      })
    );
    set展开卷集合(prev => new Set(prev).add(volumeId));
  };

  const updateVolume = (id: number, updates: Partial<卷大纲>) => {
    set卷列表(prev => prev.map(v => (v.id === id ? { ...v, ...updates } : v)));
    if (选中卷?.id === id)
      set选中卷(prev => (prev ? { ...prev, ...updates } : prev));
  };

  const updateChapter = (
    volumeId: number,
    chapterId: number,
    updates: Partial<章节大纲>
  ) => {
    set卷列表(prev =>
      prev.map(v => {
        if (v.id !== volumeId) return v;
        return {
          ...v,
          章节: v.章节.map(c =>
            c.id === chapterId ? { ...c, ...updates } : c
          ),
        };
      })
    );
    if (选中章节?.id === chapterId)
      set选中章节(prev => (prev ? { ...prev, ...updates } : prev));
  };

  const deleteVolume = (id: number) => {
    set卷列表(prev => prev.filter(v => v.id !== id));
    if (选中卷?.id === id) {
      set选中卷(null);
      setView('list');
    }
  };

  const deleteChapter = (volumeId: number, chapterId: number) => {
    set卷列表(prev =>
      prev.map(v => {
        if (v.id !== volumeId) return v;
        return { ...v, 章节: v.章节.filter(c => c.id !== chapterId) };
      })
    );
    if (选中章节?.id === chapterId) {
      set选中章节(null);
      setView('volume');
    }
  };

  const handleSave = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await saveData('outlines', projectId, { volumes: 卷列表 });
      await saveVersion('outlines', projectId, {
        描述: '保存大纲',
        内容: 卷列表,
      });
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id: number) => {
    set展开卷集合(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── AI generate ──
  const handleAIGenerate = async () => {
    if (aiGenerating) return;
    setAiGenerating(true);
    abortRef.current = new AbortController();
    try {
      const existing = 卷列表
        .map(v => v.卷名称)
        .filter(Boolean)
        .join('、');
      const sourcePrompt = buildOutlineSystemPrompt(existing);
      const systemPrompt = await fetchSystemPrompt();
      const messages = [
        { role: 'system' as const, content: systemPrompt || sourcePrompt },
        {
          role: 'user' as const,
          content: `请生成完整的大纲结构。\n\n${aiPrompt ? `用户要求：${aiPrompt}\n\n` : ''}${existing ? `已有卷（禁止重复）：${existing}\n\n` : ''}请输出V|和C|管道格式，或JSON数组格式。`,
        },
      ];
      const result = await generateValidated({
        schema: outlineSchema,
        generate: attempt =>
          generateLLM({
            messages,
            temperature: Math.min(1.0, 0.85 + attempt * 0.05),
            max_tokens: 8192,
            frequency_penalty: 0.5,
            presence_penalty: 0.4,
            onChunk: () => {},
            signal: abortRef.current!.signal,
          }),
        parseResponse: text => parseOutlineResponse(text),
        maxRetries: 3,
      });
      const parsed = (result?.data ?? null) as unknown as 卷大纲[] | null;
      if (parsed && Array.isArray(parsed) && projectId) {
        const fullText = result!.rawText;
        // Ensure IDs
        const withIds = parsed.map(v => ({
          ...v,
          id: v.id || Date.now() + Math.random(),
          章节: (v.章节 || []).map((c, i) => ({
            ...c,
            id: c.id || Date.now() + i + Math.random(),
            出场角色列表: c.出场角色列表 || [],
            场景列表: c.场景列表 || [],
            关键对话: c.关键对话 || [],
            写作要点: c.写作要点 || [],
            情绪列表: c.情绪列表 || [],
            伏笔列表: c.伏笔列表 || [],
            状态: c.状态 || 'pending',
          })),
        }));
        set卷列表(withIds);
        await saveGeneration('outlines', projectId, {
          提示词: aiPrompt,
          生成类型: '大纲',
          生成内容: { text: fullText },
        });
        await saveVersion('outlines', projectId, {
          描述: 'AI生成大纲',
          内容: withIds,
        });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setAiGenerating(false);
    }
  };

  // ── AI generate single chapter ──
  const handleAIGenerateChapter = async (volumeId: number) => {
    if (aiGenerating) return;
    setAiGenerating(true);
    abortRef.current = new AbortController();
    try {
      const vol = 卷列表.find(v => v.id === volumeId);
      const existingChapters = vol?.章节.map(c => c.标题).join('、') || '';
      const existing = 卷列表
        .map(v => v.卷名称)
        .filter(Boolean)
        .join('、');
      const sourcePrompt = buildOutlineSystemPrompt(existing);
      const systemPrompt = await fetchSystemPrompt();
      const messages = [
        { role: 'system' as const, content: systemPrompt || sourcePrompt },
        {
          role: 'user' as const,
          content: `请为卷"${vol?.卷名称 || ''}"生成章节大纲。\n\n${aiPrompt ? `用户要求：${aiPrompt}\n\n` : ''}${existingChapters ? `已有章节（禁止重复）：${existingChapters}\n\n` : ''}请输出C|管道格式，或JSON数组格式。`,
        },
      ];
      const result = await generateValidated({
        schema: outlineSchema,
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
        parseResponse: text => parseChapterResponse(text),
        maxRetries: 3,
      });
      const parsed = (result?.data ?? null) as unknown as 章节大纲[] | null;
      if (parsed && Array.isArray(parsed)) {
        const newChapters = parsed.map((c, i) => ({
          ...c,
          id: Date.now() + i + Math.random(),
          出场角色列表: c.出场角色列表 || [],
          场景列表: c.场景列表 || [],
          关键对话: c.关键对话 || [],
          写作要点: c.写作要点 || [],
          情绪列表: c.情绪列表 || [],
          伏笔列表: c.伏笔列表 || [],
          状态: c.状态 || 'pending',
        }));
        set卷列表(prev =>
          prev.map(v => {
            if (v.id !== volumeId) return v;
            return { ...v, 章节: [...v.章节, ...newChapters] };
          })
        );
        set展开卷集合(prev => new Set(prev).add(volumeId));
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setAiGenerating(false);
    }
  };

  // ── Filter ──
  const filtered = useMemo(() => {
    if (!search.trim()) return 卷列表;
    const kw = search.trim().toLowerCase();
    return 卷列表
      .map(v => ({
        ...v,
        章节: v.章节.filter(
          c =>
            c.标题.toLowerCase().includes(kw) ||
            c.摘要.toLowerCase().includes(kw)
        ),
      }))
      .filter(
        v =>
          v.卷名称.toLowerCase().includes(kw) ||
          v.摘要.toLowerCase().includes(kw) ||
          v.章节.length > 0
      );
  }, [卷列表, search]);

  // ── Chapter detail view ──
  const ChapterDetail = ({
    chapter,
    volumeId,
  }: {
    chapter: 章节大纲;
    volumeId: number;
  }) => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <button
          className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
          onClick={() => {
            set选中章节(null);
            setView('volume');
          }}
        >
          <i className="ri-arrow-left-line" />
        </button>
        <div className="flex items-center gap-2">
          <select
            value={chapter.状态}
            onChange={e =>
              updateChapter(volumeId, chapter.id, { 状态: e.target.value })
            }
            className="px-2 py-1 bg-[var(--bg-dark)] border border-[var(--border)] rounded text-xs"
          >
            {状态选项.map(s => (
              <option key={s} value={s}>
                {状态标签[s]}
              </option>
            ))}
          </select>
          <button
            className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors text-red-400"
            onClick={() => deleteChapter(volumeId, chapter.id)}
          >
            <i className="ri-delete-bin-line" />
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          章节标题
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.标题}
          onChange={e =>
            updateChapter(volumeId, chapter.id, { 标题: e.target.value })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          摘要
        </label>
        <textarea
          className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-blue-500/50 focus:outline-none"
          value={chapter.摘要}
          onChange={e =>
            updateChapter(volumeId, chapter.id, { 摘要: e.target.value })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          章节描述
        </label>
        <textarea
          className="w-full h-24 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-blue-500/50 focus:outline-none"
          value={chapter.描述}
          onChange={e =>
            updateChapter(volumeId, chapter.id, { 描述: e.target.value })
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            开头承接
          </label>
          <textarea
            className="w-full h-16 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-none focus:border-blue-500/50 focus:outline-none"
            value={chapter.开头承接}
            onChange={e =>
              updateChapter(volumeId, chapter.id, { 开头承接: e.target.value })
            }
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            章尾悬念
          </label>
          <textarea
            className="w-full h-16 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-none focus:border-blue-500/50 focus:outline-none"
            value={chapter.章尾悬念}
            onChange={e =>
              updateChapter(volumeId, chapter.id, { 章尾悬念: e.target.value })
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            目标字数
          </label>
          <input
            type="number"
            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
            value={chapter.目标字数}
            onChange={e =>
              updateChapter(volumeId, chapter.id, {
                目标字数: Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            正文字数
          </label>
          <input
            type="number"
            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
            value={chapter.正文字数}
            onChange={e =>
              updateChapter(volumeId, chapter.id, {
                正文字数: Number(e.target.value),
              })
            }
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          出场角色（逗号分隔）
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.出场角色列表.join('、')}
          onChange={e =>
            updateChapter(volumeId, chapter.id, {
              出场角色列表: e.target.value
                .split(/[、,，]/)
                .map(s => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          场景列表（顿号分隔）
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.场景列表.join('、')}
          onChange={e =>
            updateChapter(volumeId, chapter.id, {
              场景列表: e.target.value
                .split(/[、,，]/)
                .map(s => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          写作要点（顿号分隔）
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.写作要点.join('、')}
          onChange={e =>
            updateChapter(volumeId, chapter.id, {
              写作要点: e.target.value
                .split(/[、,，]/)
                .map(s => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          关键对话（顿号分隔）
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.关键对话.join('、')}
          onChange={e =>
            updateChapter(volumeId, chapter.id, {
              关键对话: e.target.value
                .split(/[、,，]/)
                .map(s => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          伏笔列表（顿号分隔）
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.伏笔列表.join('、')}
          onChange={e =>
            updateChapter(volumeId, chapter.id, {
              伏笔列表: e.target.value
                .split(/[、,，]/)
                .map(s => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          情绪基调
        </label>
        <div className="flex flex-wrap gap-1.5">
          {情绪选项.map(em => (
            <button
              key={em.值}
              type="button"
              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${chapter.情绪列表.includes(em.值) ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-[var(--bg-dark)] border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-500/30'}`}
              onClick={() => {
                const next = chapter.情绪列表.includes(em.值)
                  ? chapter.情绪列表.filter(v => v !== em.值)
                  : [...chapter.情绪列表, em.值];
                updateChapter(volumeId, chapter.id, { 情绪列表: next });
              }}
            >
              {em.标签}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="v-outline-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width: 560 }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-gradient-to-r from-blue-900/30 to-indigo-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/20">
                  <i className="text-lg text-blue-400 ri-file-list-3-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">大纲设定</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {卷列表.length} 卷 / {总章数} 章 / 完成率 {完成率}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-blue-500/20 rounded-lg transition-colors text-blue-400"
                  title="AI生成大纲"
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
                  className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
                  onClick={addVolume}
                >
                  <i className="ri-add-line" /> 新建卷
                </button>
                <button
                  className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  disabled={saving}
                  onClick={handleSave}
                >
                  <i
                    className={
                      saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'
                    }
                  />{' '}
                  保存
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
            {view === 'chapter' && 选中章节 && 选中卷 ? (
              <ChapterDetail chapter={选中章节} volumeId={选中卷.id} />
            ) : (
              <div className="p-4 space-y-3">
                {/* Search */}
                <input
                  type="text"
                  placeholder="搜索大纲..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
                />

                {/* Volume detail view */}
                {view === 'volume' && 选中卷 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                        onClick={() => {
                          set选中卷(null);
                          setView('list');
                        }}
                      >
                        <i className="ri-arrow-left-line" />
                      </button>
                      <span className="text-sm font-medium flex-1">
                        {选中卷.卷名称}
                      </span>
                      <button
                        className="p-1.5 hover:bg-blue-500/20 rounded-lg transition-colors text-blue-400"
                        title="AI生成章节"
                        disabled={aiGenerating}
                        onClick={() => {
                          setAiPrompt('');
                          setShowAIDialog(true);
                        }}
                      >
                        <i
                          className={
                            aiGenerating
                              ? 'ri-loader-4-line animate-spin'
                              : 'ri-magic-line'
                          }
                        />
                      </button>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        卷名称
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
                        value={选中卷.卷名称}
                        onChange={e =>
                          updateVolume(选中卷.id, { 卷名称: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        幕名称
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
                        value={选中卷.幕名称}
                        onChange={e =>
                          updateVolume(选中卷.id, { 幕名称: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        卷摘要
                      </label>
                      <textarea
                        className="w-full h-24 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-blue-500/50 focus:outline-none"
                        value={选中卷.摘要}
                        onChange={e =>
                          updateVolume(选中卷.id, { 摘要: e.target.value })
                        }
                      />
                    </div>

                    {/* Chapter list */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-secondary)]">
                          章节列表 ({选中卷.章节.length})
                        </span>
                        <button
                          className="text-xs text-blue-400 hover:text-blue-300"
                          onClick={() => addChapter(选中卷.id)}
                        >
                          <i className="ri-add-line" /> 添加章节
                        </button>
                      </div>
                      {选中卷.章节.map(ch => (
                        <div
                          key={ch.id}
                          className="p-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg hover:border-blue-500/50 cursor-pointer transition-colors flex items-center gap-2"
                          onClick={() => {
                            set选中章节(ch);
                            setView('chapter');
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              background: 状态颜色[ch.状态] || '#9ca3af',
                            }}
                          />
                          <span className="text-sm flex-1 truncate">
                            {ch.标题 || '未命名'}
                          </span>
                          <span className="text-xs text-[var(--text-secondary)]">
                            {ch.目标字数}字
                          </span>
                          <button
                            className="p-1 text-red-400 hover:bg-red-500/20 rounded opacity-0 group-hover:opacity-100"
                            onClick={e => {
                              e.stopPropagation();
                              deleteChapter(选中卷.id, ch.id);
                            }}
                          >
                            <i className="text-xs ri-close-line" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      className="w-full p-2 border border-dashed border-red-500/30 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      onClick={() => deleteVolume(选中卷.id)}
                    >
                      <i className="ri-delete-bin-line" /> 删除此卷
                    </button>
                  </div>
                ) : /* List view */
                loading ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    加载中...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无大纲，点击新建卷或AI生成
                  </div>
                ) : (
                  filtered.map(vol => {
                    const expanded = 展开卷集合.has(vol.id);
                    const chapterDone = vol.章节.filter(
                      c => c.状态 === 'complete'
                    ).length;
                    return (
                      <div
                        key={vol.id}
                        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden"
                      >
                        <div
                          className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-dark)] transition-colors"
                          onClick={() => toggleExpand(vol.id)}
                        >
                          <button className="w-4 h-4 flex items-center justify-center text-xs text-[var(--text-secondary)]">
                            <i
                              className={
                                expanded
                                  ? 'ri-arrow-down-s-line'
                                  : 'ri-arrow-right-s-line'
                              }
                            />
                          </button>
                          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/20">
                            <i className="ri-book-2-line text-blue-400 text-sm" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium truncate">
                              {vol.卷名称 || '未命名'}
                            </h4>
                            {vol.摘要 && (
                              <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                                {vol.摘要}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-[var(--text-secondary)]">
                              {chapterDone}/{vol.章节.length}
                            </span>
                            <button
                              className="p-1 text-[var(--text-secondary)] hover:text-blue-400 transition-colors"
                              title="编辑"
                              onClick={e => {
                                e.stopPropagation();
                                set选中卷(vol);
                                setView('volume');
                              }}
                            >
                              <i className="ri-edit-line text-sm" />
                            </button>
                          </div>
                        </div>
                        {expanded && vol.章节.length > 0 && (
                          <div className="px-4 pb-3 space-y-1">
                            {vol.章节.map(ch => (
                              <div
                                key={ch.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-dark)] cursor-pointer transition-colors"
                                onClick={() => {
                                  set选中卷(vol);
                                  set选中章节(ch);
                                  setView('chapter');
                                }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{
                                    background: 状态颜色[ch.状态] || '#9ca3af',
                                  }}
                                />
                                <span className="text-xs flex-1 truncate">
                                  {ch.标题 || '未命名'}
                                </span>
                                <span className="text-xs text-[var(--text-secondary)]">
                                  {状态标签[ch.状态] || ch.状态}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Resize handle */}
        <div className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 shrink-0" />
        {/* Backdrop */}
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
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/20">
                  <i className="text-blue-400 ri-magic-line" />
                </div>
                <h3 className="text-sm font-semibold">AI生成大纲</h3>
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
              <div>
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  生成范围
                </label>
                <div className="flex gap-2">
                  <button
                    className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${选中卷 ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-blue-500/20 border-blue-500/50 text-blue-400'}`}
                    onClick={() => {}}
                  >
                    {选中卷 ? `为"${选中卷.卷名称}"生成章节` : '生成完整大纲'}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  补充要求
                </label>
                <textarea
                  className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-none focus:border-blue-500/50 focus:outline-none"
                  placeholder="描述你对大纲的具体要求..."
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
                className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                disabled={aiGenerating}
                onClick={() =>
                  选中卷
                    ? handleAIGenerateChapter(选中卷.id)
                    : handleAIGenerate()
                }
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

export default OutlineSettingsPanel;
