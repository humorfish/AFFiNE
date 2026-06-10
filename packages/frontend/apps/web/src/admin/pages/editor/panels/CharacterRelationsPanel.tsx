import React, { useState, useEffect, useRef, useCallback } from 'react';
import { z } from 'zod';
import { generateLLM, parseAIJSON, generateValidated } from './panel-shared';
import { API_BASE, getAuthHeaders } from '../useWorldApi';

// ── Source-derived data ────────────────────────────────────────

const 关系类型选项 = [
  '师徒',
  '朋友',
  '同门',
  '敌对',
  '仇敌',
  '追求',
  '竞争',
  '从属',
  '暧昧',
  '盟友',
  '合作',
  '利用',
  '亲属',
  '其他',
];

// ── Source-derived prompt & parsers ────────────────────────────

/** Build system prompt matching source code (lines 38440-38456) — JSON array output */
function buildCharacterRelationsSystemPrompt(
  角色列表: string,
  已有关系: string
): string {
  return `你是一位专业的小说角色关系设计师。请根据用户的要求生成角色关系。

当前角色列表：
${角色列表}

${已有关系 ? `已有关系：\n${已有关系}` : '暂无已有关系'}

请以JSON数组格式返回结果：
[{"源角色":"角色姓名","目标角色":"角色姓名","关系类型":"类型","关系描述":"描述","颜色":"#hex颜色"}]

要求：只输出JSON数组，关系类型准确，颜色根据关系性质选择（友好绿/蓝，敌对红/橙，暗昧粉/紫）。`;
}

/** Parse the AI response — JSON array only (source uses JSON, not pipe) */
function parseCharacterRelationsResponse(text: string): 关系数据[] | null {
  const { data, failed } = parseAIJSON<any[]>(text);
  if (!failed && Array.isArray(data)) return data;
  return null;
}

// ── Zod Schema ─────────────────────────────────────────────────

const CharacterRelationSchema = z.object({
  源角色: z.string().min(1),
  目标角色: z.string().min(1),
  关系类型: z.string(),
  关系描述: z.string(),
  颜色: z.string().optional().default(''),
});

// ── Interfaces ─────────────────────────────────────────────────

interface 关系数据 {
  id: number;
  源角色: string;
  目标角色: string;
  关系类型: string;
  关系描述: string;
  颜色: string;
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ── Helpers ────────────────────────────────────────────────────

const empty关系 = (): 关系数据 => ({
  id: Date.now(),
  源角色: '',
  目标角色: '',
  关系类型: '朋友',
  关系描述: '',
  颜色: '',
});

// ── Main Component ─────────────────────────────────────────────

export const CharacterRelationsPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  const [关系列表, set关系列表] = useState<关系数据[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [editing, setEditing] = useState<关系数据 | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // AI states
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAIDialog, setShowAIDialog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Data fetching ──
  const fetchRelations = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/characters/project/${projectId}/relations`,
        {
          headers: getAuthHeaders(),
        }
      );
      const result = await res.json();
      if (result.success && Array.isArray(result.data))
        set关系列表(result.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRelations();
  }, [fetchRelations]);

  // ── Fetch character context for AI ──
  const fetchCharacterContext = useCallback(async () => {
    if (!projectId) return [];
    try {
      const res = await fetch(
        `${API_BASE}/api/characters/project/${projectId}/context`,
        {
          headers: getAuthHeaders(),
        }
      );
      const result = await res.json();
      if (result.success && Array.isArray(result.data)) {
        return result.data;
      }
    } catch {}
    return [];
  }, [projectId]);

  // ── CRUD ──
  const startCreate = () => setEditing(empty关系());

  const handleSave = async () => {
    if (!projectId || !editing) return;
    if (!editing.源角色.trim() || !editing.目标角色.trim()) return;
    setSaving(true);
    try {
      let res: Response;
      if (editing.id) {
        // Update: PUT /api/characters/relations/:id
        res = await fetch(
          `${API_BASE}/api/characters/relations/${editing.id}`,
          {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(editing),
          }
        );
      } else {
        // Create: POST /api/characters/project/:id/relations
        res = await fetch(
          `${API_BASE}/api/characters/project/${projectId}/relations`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(editing),
          }
        );
      }
      const result = await res.json();
      const saved =
        result.success && result.data
          ? result.data
          : { ...editing, id: editing.id || Date.now() };
      if (关系列表.some(r => r.id === editing.id)) {
        set关系列表(prev => prev.map(r => (r.id === editing.id ? saved : r)));
      } else {
        set关系列表(prev => [...prev, saved]);
      }
      setEditing(null);
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
      await fetch(`${API_BASE}/api/characters/relations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      set关系列表(prev => prev.filter(r => r.id !== id));
    } catch {}
  };

  // ── AI generate ──
  const handleAIGenerate = async () => {
    if (aiGenerating || !projectId) return;
    setAiGenerating(true);
    abortRef.current = new AbortController();
    try {
      // Fetch real character context
      const characters = await fetchCharacterContext();
      const 角色列表Str =
        characters.length > 0
          ? characters
              .map(
                (c: any) =>
                  `${c.姓名 || c.name || ''}（${c.类型 || c.type || ''}，${c.身份 || c.identity || ''}）`
              )
              .join('\n')
          : '';

      // Format existing relations (Vue source line 38433-38437)
      const 已有关系Str = 关系列表
        .map(
          r =>
            `${r.源角色} → ${r.目标角色}：${r.关系类型}（${r.关系描述 || ''}）`
        )
        .join('\n');

      const sourcePrompt = buildCharacterRelationsSystemPrompt(
        角色列表Str,
        已有关系Str
      );
      const messages = [
        { role: 'system' as const, content: sourcePrompt },
        {
          role: 'user' as const,
          content: aiPrompt || '',
        },
      ];
      const result = await generateValidated({
        schema: z.array(CharacterRelationSchema),
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
        parseResponse: parseCharacterRelationsResponse,
        maxRetries: 3,
      });

      // Adopt: POST each relation to API, then refresh
      if (result && projectId) {
        for (const r of result.data) {
          try {
            await fetch(
              `${API_BASE}/api/characters/project/${projectId}/relations`,
              {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                  源角色: r.源角色 || '',
                  目标角色: r.目标角色 || '',
                  关系类型: r.关系类型 || '',
                  关系描述: r.关系描述 || '',
                  颜色: r.颜色 || '',
                }),
              }
            );
          } catch {
            // Continue posting remaining relations even if one fails
          }
        }
        // Refresh full list from server
        await fetchRelations();
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setAiGenerating(false);
    }
  };

  // ── Filtered ──
  const filtered = 关系列表.filter(r => {
    if (
      search &&
      !r.源角色.includes(search) &&
      !r.目标角色.includes(search) &&
      !r.关系描述.includes(search)
    )
      return false;
    if (filterType && r.关系类型 !== filterType) return false;
    return true;
  });

  // ── Color for relation type ──
  const getColor = (type: string) => {
    if (['师徒', '朋友', '同门', '盟友', '合作', '亲属'].includes(type))
      return '#22c55e';
    if (['敌对', '仇敌', '竞争', '利用'].includes(type)) return '#ef4444';
    if (['追求', '暧昧'].includes(type)) return '#ec4899';
    return '#64748b';
  };

  return (
    <div className="v-character-relations-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width: 560 }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-gradient-to-r from-violet-900/30 to-purple-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/20">
                  <i className="text-lg text-violet-400 ri-mind-map" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">角色关系</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    共 {关系列表.length} 条关系
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-violet-500/20 rounded-lg transition-colors text-violet-400"
                  title="AI生成关系"
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
                  className="px-3 py-1.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
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
              {/* Search */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="搜索角色/关系..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-violet-500/50 focus:outline-none"
                />
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-violet-500/50 focus:outline-none"
                >
                  <option value="">全部关系</option>
                  {关系类型选项.map(o => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>

              {/* Edit form */}
              {editing && (
                <div className="p-4 bg-[var(--bg-card)] border border-violet-500/30 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">编辑关系</h3>
                    <button
                      className="p-1 hover:bg-[var(--bg-dark)] rounded-lg"
                      onClick={() => setEditing(null)}
                    >
                      <i className="ri-close-line" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        源角色
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-violet-500/50 focus:outline-none"
                        placeholder="角色名"
                        value={editing.源角色}
                        onChange={e =>
                          setEditing({ ...editing, 源角色: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        目标角色
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-violet-500/50 focus:outline-none"
                        placeholder="角色名"
                        value={editing.目标角色}
                        onChange={e =>
                          setEditing({ ...editing, 目标角色: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      关系类型
                    </label>
                    <select
                      value={editing.关系类型}
                      onChange={e =>
                        setEditing({ ...editing, 关系类型: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-violet-500/50 focus:outline-none"
                    >
                      {关系类型选项.map(o => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      关系描述
                    </label>
                    <textarea
                      className="w-full h-16 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-violet-500/50 focus:outline-none"
                      placeholder="描述这段关系..."
                      value={editing.关系描述}
                      onChange={e =>
                        setEditing({ ...editing, 关系描述: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      颜色
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="w-8 h-8 rounded border border-[var(--border)] cursor-pointer bg-transparent"
                        value={editing.颜色 || getColor(editing.关系类型)}
                        onChange={e =>
                          setEditing({ ...editing, 颜色: e.target.value })
                        }
                      />
                      <input
                        type="text"
                        className="flex-1 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-violet-500/50 focus:outline-none"
                        placeholder="#hex颜色"
                        value={editing.颜色}
                        onChange={e =>
                          setEditing({ ...editing, 颜色: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <button
                    className="w-full px-3 py-2 bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    disabled={
                      saving ||
                      !editing.源角色.trim() ||
                      !editing.目标角色.trim()
                    }
                    onClick={handleSave}
                  >
                    <i
                      className={
                        saving
                          ? 'ri-loader-4-line animate-spin'
                          : 'ri-save-line'
                      }
                    />{' '}
                    保存
                  </button>
                </div>
              )}

              {/* List */}
              {loading ? (
                <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                  加载中...
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                  暂无关系，点击新建或AI生成
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(item => {
                    const color = item.颜色 || getColor(item.关系类型);
                    return (
                      <div
                        key={item.id}
                        className="p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg hover:border-violet-500/50 cursor-pointer transition-colors group"
                        onClick={() => setEditing({ ...item })}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="text-sm font-medium">
                              {item.源角色 || '?'}
                            </span>
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ background: color + '33', color }}
                            >
                              {item.关系类型}
                            </span>
                            <span className="text-sm font-medium">
                              {item.目标角色 || '?'}
                            </span>
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
                        {item.关系描述 && (
                          <p className="text-xs text-[var(--text-secondary)] mt-1.5 truncate">
                            {item.关系描述}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-violet-500/50 active:bg-violet-500 shrink-0" />
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
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/20">
                  <i className="text-violet-400 ri-magic-line" />
                </div>
                <h3 className="text-sm font-semibold">AI生成角色关系</h3>
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
                  补充要求
                </label>
                <textarea
                  className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-none focus:border-violet-500/50 focus:outline-none"
                  placeholder="描述你对角色关系的要求..."
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
                className="px-4 py-2 bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
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

export default CharacterRelationsPanel;
