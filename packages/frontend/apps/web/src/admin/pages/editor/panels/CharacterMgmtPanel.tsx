import React, { useState, useCallback, useEffect, useRef } from 'react';
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

// ── Source-derived prompt & pipe parsers (源码 lines 38628+) ──────────

function buildCharacterPrompt(): string {
  return `你是一位专业的小说角色设计师。请设计详细的角色档案。

输出格式要求（管道符分隔，每行一个字段）：
R|姓名|类型|性别|年龄
I|身份|境界|武器
A|外貌描述
S|简介
C|性格表层|性格中层|性格内核
E|章节名|经历事件
M|核心意义
F|结局
L|目标角色|关系类型|关系描述

格式说明：
- R 行：姓名、类型（主角/女主/反派/导师/配角）、性别（男/女/其他）、年龄
- I 行：身份/职位、境界/实力、武器/法宝
- A 行：外貌特征描述
- S 行：角色简介（一两句话概括）
- C 行：性格三个层次（表层性格、中层动机、核心价值观）
- E 行：可多行，每段重要经历一行（章节名/阶段名、经历事件）
- M 行：角色在故事中的核心意义
- F 行：预设结局
- L 行：可多行，与其他角色的关系（目标角色、关系类型、关系描述）

示例：
R|林清风|主角|男|18
I|青云门内门弟子|练气七层|碧水剑
A|身形修长，面容清俊，一袭白衣，眉宇间有股书卷气
S|出身寒门却天赋异禀的修仙少年，在逆境中不断成长
C|表面温和有礼|内心坚毅不服输|追求公正与自由
E|入门试炼|在试炼中意外获得上古传承，展露头角
E|宗门大比|击败同门师兄，引起长老注意
M|代表平凡人通过努力可以打破命运枷锁
F|成为一代宗师，开创新的修炼体系
L|苏婉儿|女主|青梅竹马，相互扶持

要求：
1. 角色姓名要有特色，符合世界观
2. 性格要有层次，不能过于平面
3. 经历要有戏剧张力，推动角色成长
4. 关系网络要丰富，有冲突和羁绊`;
}

interface PipeExperience {
  章节名: string;
  经历事件: string;
}
interface PipeRelation {
  目标角色: string;
  关系类型: string;
  关系描述: string;
}
interface PipeCharacterData {
  姓名: string;
  类型: string;
  性别: string;
  年龄: string;
  身份: string;
  境界: string;
  武器: string;
  外貌: string;
  简介: string;
  性格表层: string;
  性格中层: string;
  性格内核: string;
  经历列表: PipeExperience[];
  核心意义: string;
  结局: string;
  关系列表: PipeRelation[];
}

function parseCharacterPipe(text: string): PipeCharacterData[] {
  const results: PipeCharacterData[] = [];
  let current: PipeCharacterData | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('R|')) {
      const parts = line.split('|');
      current = {
        姓名: (parts[1] || '').trim(),
        类型: (parts[2] || '').trim(),
        性别: (parts[3] || '').trim(),
        年龄: (parts[4] || '').trim(),
        身份: '',
        境界: '',
        武器: '',
        外貌: '',
        简介: '',
        性格表层: '',
        性格中层: '',
        性格内核: '',
        经历列表: [],
        核心意义: '',
        结局: '',
        关系列表: [],
      };
      results.push(current);
    } else if (line.startsWith('I|') && current) {
      const parts = line.split('|');
      current.身份 = (parts[1] || '').trim();
      current.境界 = (parts[2] || '').trim();
      current.武器 = (parts[3] || '').trim();
    } else if (line.startsWith('A|') && current) {
      current.外貌 = line.slice(2).trim();
    } else if (line.startsWith('S|') && current) {
      current.简介 = line.slice(2).trim();
    } else if (line.startsWith('C|') && current) {
      const parts = line.split('|');
      current.性格表层 = (parts[1] || '').trim();
      current.性格中层 = (parts[2] || '').trim();
      current.性格内核 = (parts[3] || '').trim();
    } else if (line.startsWith('E|') && current) {
      const parts = line.split('|');
      current.经历列表.push({
        章节名: (parts[1] || '').trim(),
        经历事件: (parts[2] || '').trim(),
      });
    } else if (line.startsWith('M|') && current) {
      current.核心意义 = line.slice(2).trim();
    } else if (line.startsWith('F|') && current) {
      current.结局 = line.slice(2).trim();
    } else if (line.startsWith('L|') && current) {
      const parts = line.split('|');
      current.关系列表.push({
        目标角色: (parts[1] || '').trim(),
        关系类型: (parts[2] || '').trim(),
        关系描述: (parts[3] || '').trim(),
      });
    }
  }
  return results;
}

function parseCharacterResponse(text: string): 角色数据 | null {
  // Try pipe format first
  const pipeResults = parseCharacterPipe(text);
  if (pipeResults.length > 0) {
    const s = pipeResults[0];
    const 性格 = [s.性格表层, s.性格中层, s.性格内核]
      .filter(Boolean)
      .join('；');
    return {
      id: Date.now(),
      姓名: s.姓名 || '',
      角色类型: s.类型 || '配角',
      性别: s.性别 || '男',
      年龄: s.年龄 || '',
      性格,
      身份: s.身份 || '',
      简介: s.简介 || '',
      外貌: s.外貌 || '',
      境界: s.境界 || '',
      武器: s.武器 || '',
      核心意义: s.核心意义 || '',
      存续状态: '活跃',
    };
  }
  // JSON fallback
  const { data: parsed } = parseAIJSON<Record<string, any>>(text);
  if (!parsed) return null;
  const merged = empty角色();
  if (parsed.姓名) merged.姓名 = parsed.姓名;
  if (parsed.角色类型) merged.角色类型 = parsed.角色类型;
  if (parsed.性别) merged.性别 = parsed.性别;
  if (parsed.年龄) merged.年龄 = parsed.年龄;
  if (parsed.性格) merged.性格 = parsed.性格;
  if (parsed.身份) merged.身份 = parsed.身份;
  if (parsed.简介) merged.简介 = parsed.简介;
  if (parsed.外貌) merged.外貌 = parsed.外貌;
  if (parsed.境界) merged.境界 = parsed.境界;
  if (parsed.武器) merged.武器 = parsed.武器;
  if (parsed.核心意义) merged.核心意义 = parsed.核心意义;
  if (parsed.存续状态) merged.存续状态 = parsed.存续状态;
  return merged;
}

// ── Source-derived data ────────────────────────────────────────

const characterMgmtSchema = z.record(z.any());

const 角色类型选项 = ['主角', '女主', '反派', '导师', '配角'];

const 类型样式: Record<string, string> = {
  主角: 'bg-blue-500/20 text-blue-400',
  女主: 'bg-pink-500/20 text-pink-400',
  反派: 'bg-red-500/20 text-red-400',
  导师: 'bg-green-500/20 text-green-400',
  配角: 'bg-gray-500/20 text-gray-400',
};

const 性别选项 = ['男', '女', '其他'];

// ── Interfaces ─────────────────────────────────────────────────

interface 角色数据 {
  id: number;
  姓名: string;
  角色类型: string;
  性别: string;
  年龄: string;
  性格: string;
  身份: string;
  简介: string;
  外貌: string;
  境界: string;
  武器: string;
  核心意义: string;
  存续状态: string;
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ── Helpers ────────────────────────────────────────────────────

const empty角色 = (): 角色数据 => ({
  id: Date.now(),
  姓名: '',
  角色类型: '配角',
  性别: '男',
  年龄: '',
  性格: '',
  身份: '',
  简介: '',
  外貌: '',
  境界: '',
  武器: '',
  核心意义: '',
  存续状态: '活跃',
});

// ── Main Component ─────────────────────────────────────────────

export const CharacterMgmtPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  const [角色列表, set角色列表] = useState<角色数据[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [formData, setFormData] = useState<角色数据>(empty角色());
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // AI states
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAIDialog, setShowAIDialog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fetchSystemPrompt = useSystemPrompt(
    'AI生成角色',
    buildCharacterPrompt()
  );

  // ── Data fetching ──
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/characters/project/${projectId}`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data))
          set角色列表(result.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // ── CRUD helpers ──
  const updateField = useCallback(
    <K extends keyof 角色数据>(key: K, value: 角色数据[K]) => {
      setFormData(prev => ({ ...prev, [key]: value }));
    },
    []
  );

  const startEdit = (item: 角色数据) => {
    setFormData({ ...item });
    setView('detail');
  };

  const startCreate = () => {
    setFormData(empty角色());
    setView('detail');
  };

  const handleSave = async () => {
    if (!projectId || !formData.姓名.trim()) return;
    setSaving(true);
    try {
      await saveData('characters', projectId, formData);
      if (formData.id && 角色列表.some(d => d.id === formData.id)) {
        set角色列表(prev =>
          prev.map(d => (d.id === formData.id ? formData : d))
        );
      } else {
        const saved = { ...formData, id: formData.id || Date.now() };
        set角色列表(prev => [...prev, saved]);
        setFormData(saved);
      }
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      return;
    }
    setDeleteConfirm(null);
    try {
      await fetch(`${API_BASE}/api/characters/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      set角色列表(prev => prev.filter(d => d.id !== id));
    } catch {}
  };

  // ── AI generate ──
  const handleAIGenerate = async () => {
    if (aiGenerating) return;
    setAiGenerating(true);
    abortRef.current = new AbortController();
    try {
      const systemPrompt = await fetchSystemPrompt();
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: aiPrompt || '请根据世界观信息，生成完整的角色设定',
        },
      ];
      const result = await generateValidated({
        schema: characterMgmtSchema,
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
        parseResponse: text => parseCharacterResponse(text),
        maxRetries: 3,
      });
      const parsed = (result?.data ?? null) as unknown as 角色数据 | null;
      if (parsed) {
        const fullText = result!.rawText;
        setFormData(parsed);
        if (projectId) {
          await saveGeneration('characters', projectId, {
            提示词: aiPrompt,
            生成类型: '角色',
            生成内容: { text: fullText },
          });
          await saveVersion('characters', projectId, {
            描述: 'AI生成角色',
            内容: parsed,
          });
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setAiGenerating(false);
    }
  };

  // ── Filtered list ──
  const filtered = 角色列表.filter(d => {
    if (search && !d.姓名.includes(search) && !d.简介.includes(search))
      return false;
    if (filterType && d.角色类型 !== filterType) return false;
    return true;
  });

  // ── List View ────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="v-character-panel">
        <div
          className="fixed top-0 bottom-0 z-40 flex"
          style={{ left: leftOffset }}
        >
          <div
            className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
            style={{ width: 560 }}
          >
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-gradient-to-r from-purple-900/30 to-violet-900/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/20">
                    <i className="text-lg text-purple-400 ri-user-settings-line" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">角色管理</h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      共 {角色列表.length} 个角色
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="p-1.5 hover:bg-purple-500/20 rounded-lg transition-colors text-purple-400"
                    title="AI生成角色"
                    onClick={() => {
                      setFormData(empty角色());
                      setShowAIDialog(true);
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
                    className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
                    onClick={startCreate}
                  >
                    <i className="ri-add-line" /> 新建
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
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="搜索角色..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                  />
                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                  >
                    <option value="">全部类型</option>
                    {角色类型选项.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                {loading ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    加载中...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无角色，点击新建或AI生成
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map(item => (
                      <div
                        key={item.id}
                        className="p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg hover:border-purple-500/50 cursor-pointer transition-colors group"
                        onClick={() => startEdit(item)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-500/20 shrink-0 text-purple-400 font-bold">
                            {item.姓名.charAt(0) || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium truncate">
                              {item.姓名 || '未命名'}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${类型样式[item.角色类型] || 'bg-gray-500/20 text-gray-400'}`}
                              >
                                {item.角色类型}
                              </span>
                              {item.身份 && (
                                <span className="text-xs text-[var(--text-secondary)]">
                                  {item.身份}
                                </span>
                              )}
                            </div>
                            {item.简介 && (
                              <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-2">
                                {item.简介}
                              </p>
                            )}
                          </div>
                          <button
                            className="p-1 text-red-400 transition-all rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20"
                            title={
                              deleteConfirm === item.id
                                ? '再次点击确认删除'
                                : '删除'
                            }
                            onClick={e => {
                              e.stopPropagation();
                              handleDelete(item.id);
                            }}
                          >
                            <i
                              className={`text-sm ${deleteConfirm === item.id ? 'ri-check-line text-red-300' : 'ri-delete-bin-line'}`}
                            />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-purple-500/50 active:bg-purple-500 shrink-0" />
          <div
            className="fixed top-0 bottom-0 right-0 transition-colors bg-black/0 hover:bg-black/5"
            style={{ left: (leftOffset || 288) + 562 }}
            onClick={onClose}
          />
        </div>
      </div>
    );
  }

  // ── Detail View ──────────────────────────────────────────────
  const d = formData;

  return (
    <div className="v-character-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width: 560 }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-gradient-to-r from-purple-900/30 to-violet-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/20">
                  <i className="text-lg text-purple-400 ri-user-settings-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">角色管理</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {d.id ? '编辑角色' : '新建角色'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                  title="返回列表"
                  onClick={() => setView('list')}
                >
                  <i className="ri-arrow-left-line" />
                </button>
                <button
                  className="p-1.5 hover:bg-purple-500/20 rounded-lg transition-colors text-purple-400"
                  title="AI生成角色"
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
                  className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  disabled={saving || !d.姓名.trim()}
                  onClick={handleSave}
                >
                  <i
                    className={
                      saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'
                    }
                  />{' '}
                  {saving ? '保存中...' : '保存'}
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
            <div className="p-4 space-y-4">
              {/* Basic info */}
              <div className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-500/20">
                      <i className="ri-user-3-line text-purple-400 text-sm" />
                    </div>
                    <h3 className="text-sm font-medium">基本信息</h3>
                  </div>
                </div>
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      姓名
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      placeholder="角色姓名"
                      value={d.姓名}
                      onChange={e => updateField('姓名', e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        角色类型
                      </label>
                      <select
                        value={d.角色类型}
                        onChange={e => updateField('角色类型', e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      >
                        {角色类型选项.map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        性别
                      </label>
                      <select
                        value={d.性别}
                        onChange={e => updateField('性别', e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      >
                        {性别选项.map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        年龄
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                        placeholder="年龄描述"
                        value={d.年龄}
                        onChange={e => updateField('年龄', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        身份
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                        placeholder="身份/职位"
                        value={d.身份}
                        onChange={e => updateField('身份', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-500/20">
                      <i className="ri-emotion-line text-purple-400 text-sm" />
                    </div>
                    <h3 className="text-sm font-medium">描述信息</h3>
                  </div>
                </div>
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      简介
                    </label>
                    <textarea
                      className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-purple-500/50 focus:outline-none"
                      placeholder="角色简介..."
                      value={d.简介}
                      onChange={e => updateField('简介', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      外貌
                    </label>
                    <textarea
                      className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-purple-500/50 focus:outline-none"
                      placeholder="外貌描述..."
                      value={d.外貌}
                      onChange={e => updateField('外貌', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      性格
                    </label>
                    <textarea
                      className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-purple-500/50 focus:outline-none"
                      placeholder="性格特征..."
                      value={d.性格}
                      onChange={e => updateField('性格', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Other info */}
              <div className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-500/20">
                      <i className="ri-more-line text-purple-400 text-sm" />
                    </div>
                    <h3 className="text-sm font-medium">其他信息</h3>
                  </div>
                </div>
                <div className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        境界
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                        placeholder="修为境界"
                        value={d.境界}
                        onChange={e => updateField('境界', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        武器
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                        placeholder="武器/法宝"
                        value={d.武器}
                        onChange={e => updateField('武器', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      核心意义
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      placeholder="角色在故事中的作用"
                      value={d.核心意义}
                      onChange={e => updateField('核心意义', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      存续状态
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                      placeholder="活跃/死亡/未知"
                      value={d.存续状态}
                      onChange={e => updateField('存续状态', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-purple-500/50 active:bg-purple-500 shrink-0" />
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
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-purple-500/20">
                  <i className="text-purple-400 ri-magic-line" />
                </div>
                <h3 className="text-sm font-semibold">AI生成角色</h3>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    角色类型
                  </label>
                  <select
                    value={formData.角色类型}
                    onChange={e => updateField('角色类型', e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                  >
                    {角色类型选项.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    性别
                  </label>
                  <select
                    value={formData.性别}
                    onChange={e => updateField('性别', e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-purple-500/50 focus:outline-none"
                  >
                    {性别选项.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  补充要求
                </label>
                <textarea
                  className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-none focus:border-purple-500/50 focus:outline-none"
                  placeholder="描述你对角色的具体要求..."
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
                className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                disabled={aiGenerating}
                onClick={handleAIGenerate}
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

export default CharacterMgmtPanel;
