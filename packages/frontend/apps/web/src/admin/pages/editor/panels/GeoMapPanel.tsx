import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
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

const 地图类型选项 = [
  { 值: 'world', 标签: '世界', 等级: 0 },
  { 值: 'continent', 标签: '大陆', 等级: 1 },
  { 值: 'region', 标签: '区域', 等级: 2 },
  { 值: 'city', 标签: '城市', 等级: 3 },
  { 值: 'village', 标签: '村庄', 等级: 3 },
  { 值: 'castle', 标签: '城堡', 等级: 3 },
  { 值: 'forest', 标签: '森林', 等级: 2 },
  { 值: 'mountain', 标签: '山脉', 等级: 2 },
  { 值: 'lake', 标签: '湖泊', 等级: 2 },
  { 值: 'ruins', 标签: '遗迹', 等级: 2 },
  { 值: 'realm', 标签: '秘境', 等级: 2 },
  { 值: 'camp', 标签: '营地', 等级: 3 },
  { 值: 'port', 标签: '港口', 等级: 3 },
  { 值: 'temple', 标签: '神殿', 等级: 2 },
  { 值: 'cave', 标签: '洞窟', 等级: 2 },
  { 值: 'route', 标签: '路线', 等级: 4 },
  { 值: 'location', 标签: '地点', 等级: 4 },
  { 值: 'other', 标签: '其他', 等级: 3 },
];

const 类型颜色: Record<string, string> = {
  world: '#10b981',
  continent: '#3b82f6',
  region: '#8b5cf6',
  city: '#f59e0b',
  village: '#84cc16',
  castle: '#ef4444',
  forest: '#22c55e',
  mountain: '#78716c',
  lake: '#06b6d4',
  ruins: '#a855f7',
  realm: '#c026d3',
  camp: '#d97706',
  port: '#0ea5e9',
  temple: '#eab308',
  cave: '#7c3aed',
  route: '#64748b',
  location: '#14b8a6',
  other: '#94a3b8',
};

const 类型标签 = (值: string) =>
  地图类型选项.find(o => o.值 === 值)?.标签 ?? 值;

// ── Source-derived prompt & parsers ────────────────────────────

/** Build system prompt for geo map generation with pipe format spec */
function buildGeoMapSystemPrompt(existingLocations: string): string {
  return [
    '你是一位专业的小说地图设计师。请设计地理地图结构。',
    '',
    '请严格按照以下管道格式输出，每行一条记录：',
    'L|地图名称|地图类型|地图描述',
    '',
    '地图类型可选值：world/continent/region/city/village/castle/forest/mountain/lake/ruins/realm/cave/temple/port/camp/route/location/other',
    '',
    '规则：',
    '- 只输出L行，不要输出其他内容',
    existingLocations
      ? `- 已有地点（禁止重复）：${existingLocations}`
      : '- 暂无已有地点',
    '',
    '也可以输出JSON格式作为备选。',
  ].join('\n');
}

/** Parse pipe format for geo maps: L|name|type|desc */
function parseGeoMapPipe(
  text: string
): Array<{ 地图名称: string; 地图描述: string; 地图类型: string }> | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const locations: Array<{
    地图名称: string;
    地图描述: string;
    地图类型: string;
  }> = [];
  let hasPipe = false;

  for (const line of lines) {
    if (line.startsWith('L|')) {
      hasPipe = true;
      const parts = line.split('|');
      locations.push({
        地图名称: parts[1]?.trim() || '',
        地图类型: parts[2]?.trim() || 'location',
        地图描述: parts.slice(3).join('|').trim() || '',
      });
    }
  }

  return hasPipe && locations.length > 0 ? locations : null;
}

/** Combined parser: pipe first, then JSON fallback */
function parseGeoMapResponse(
  text: string
): Array<{ 地图名称: string; 地图描述: string; 地图类型: string }> | null {
  const pipeResult = parseGeoMapPipe(text);
  if (pipeResult) return pipeResult;
  const { data, failed } =
    parseAIJSON<
      Array<{ 地图名称: string; 地图描述: string; 地图类型: string }>
    >(text);
  if (!failed && Array.isArray(data)) return data;
  return null;
}

const geoMapSchema = z.array(
  z.object({ 名称: z.string().optional() }).passthrough()
);

// ── Interfaces ─────────────────────────────────────────────────

interface 地图数据 {
  id: number;
  地图名称: string;
  地图描述: string;
  父地图ID: number | null;
  地图类型: string;
  地图等级: number;
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ── Main Component ─────────────────────────────────────────────

export const GeoMapPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  const [地图列表, set地图列表] = useState<地图数据[]>([]);
  const [loading, setLoading] = useState(false);
  const [选中, set选中] = useState<地图数据 | null>(null);
  const [展开集合, set展开集合] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');

  // Edit form
  const [编辑名, set编辑名] = useState('');
  const [编辑类型, set编辑类型] = useState('world');
  const [编辑描述, set编辑描述] = useState('');
  const [编辑父ID, set编辑父ID] = useState<number | null>(null);

  // AI states
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAIDialog, setShowAIDialog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fetchSystemPrompt = useSystemPrompt('AI生成地图', '');

  // ── Data fetching ──
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/geo-maps/project/${projectId}/list`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data)) {
          set地图列表(result.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // Sync form on selection
  useEffect(() => {
    if (选中) {
      set编辑名(选中.地图名称);
      set编辑类型(选中.地图类型);
      set编辑描述(选中.地图描述);
      set编辑父ID(选中.父地图ID);
    }
  }, [选中]);

  // Derived
  const 根地图 = useMemo(() => 地图列表.filter(m => !m.父地图ID), [地图列表]);
  const getChildren = useCallback(
    (id: number) => 地图列表.filter(m => m.父地图ID === id),
    [地图列表]
  );

  const toggleExpand = useCallback((id: number) => {
    set展开集合(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(
    () => set展开集合(new Set(地图列表.map(m => m.id))),
    [地图列表]
  );

  // ── CRUD ──
  const handleAdd = useCallback(
    (parentId: number | null) => {
      const newId = Math.max(0, ...地图列表.map(m => m.id)) + 1;
      const parent = parentId ? 地图列表.find(m => m.id === parentId) : null;
      const newLoc: 地图数据 = {
        id: newId,
        地图名称: `新地点${newId}`,
        地图描述: '',
        父地图ID: parentId,
        地图类型: 'location',
        地图等级: parent ? parent.地图等级 + 1 : 0,
      };
      set地图列表(prev => [...prev, newLoc]);
      set选中(newLoc);
      if (parentId) set展开集合(prev => new Set(prev).add(parentId));
    },
    [地图列表]
  );

  const handleDelete = useCallback(
    (id: number) => {
      const idsToRemove = new Set<number>();
      const collect = (pid: number) => {
        idsToRemove.add(pid);
        地图列表.filter(m => m.父地图ID === pid).forEach(c => collect(c.id));
      };
      collect(id);
      set地图列表(prev => prev.filter(m => !idsToRemove.has(m.id)));
      if (选中?.id === id) set选中(null);
    },
    [地图列表, 选中]
  );

  const handleSave = useCallback(async () => {
    if (!选中) return;
    const updated = 地图列表.map(m =>
      m.id === 选中.id
        ? {
            ...m,
            地图名称: 编辑名,
            地图类型: 编辑类型,
            地图描述: 编辑描述,
            父地图ID: 编辑父ID,
          }
        : m
    );
    set地图列表(updated);
    set选中({
      ...选中,
      地图名称: 编辑名,
      地图类型: 编辑类型,
      地图描述: 编辑描述,
      父地图ID: 编辑父ID,
    });
    if (projectId) {
      try {
        await saveData('geomap', projectId, { items: updated });
      } catch {}
    }
  }, [选中, 地图列表, 编辑名, 编辑类型, 编辑描述, 编辑父ID, projectId]);

  // ── AI generate ──
  const handleAIGenerate = async (parentId: number | null) => {
    if (aiGenerating) return;
    setAiGenerating(true);
    abortRef.current = new AbortController();
    try {
      const parent = parentId ? 地图列表.find(m => m.id === parentId) : null;
      const existing = 地图列表
        .map(m => m.地图名称)
        .filter(Boolean)
        .join('、');
      const sourcePrompt = buildGeoMapSystemPrompt(existing);
      const systemPrompt = await fetchSystemPrompt();
      const messages = [
        { role: 'system' as const, content: systemPrompt || sourcePrompt },
        {
          role: 'user' as const,
          content: `${parent ? `父地点：${parent.地图名称}(${parent.地图描述 || '无描述'}, 类型：${类型标签(parent.地图类型)})\n` : '请生成顶层世界地图\n'}${aiPrompt ? `用户要求：${aiPrompt}\n` : ''}${existing ? `已有地点（禁止重复）：${existing}\n` : ''}请输出L|管道格式，或JSON数组格式。`,
        },
      ];
      const result = await generateValidated({
        schema: geoMapSchema,
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
        parseResponse: text => parseGeoMapResponse(text),
        maxRetries: 3,
      });
      const parsed = (result?.data ?? null) as Array<{
        地图名称: string;
        地图描述: string;
        地图类型: string;
      }> | null;
      if (parsed && Array.isArray(parsed) && projectId) {
        const fullText = result!.rawText;
        const parentLevel = parent?.地图等级 ?? -1;
        const 新地点 = parsed.map((loc, i) => ({
          id: Math.max(0, ...地图列表.map(m => m.id)) + 1 + i,
          地图名称: loc.地图名称,
          地图描述: loc.地图描述 || '',
          父地图ID: parentId,
          地图类型: loc.地图类型 || 'location',
          地图等级: parentLevel + 1,
        }));
        const merged = [...地图列表, ...新地点];
        set地图列表(merged);
        if (parentId) set展开集合(prev => new Set(prev).add(parentId));
        await saveGeneration('geomap', projectId, {
          提示词: aiPrompt,
          生成类型: '地图',
          生成内容: { text: fullText },
        });
        await saveVersion('geomap', projectId, {
          描述: 'AI生成地图',
          内容: merged,
        });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setAiGenerating(false);
    }
  };

  // ── Filter for tree display ──
  useMemo(() => {
    return 地图列表.filter(m => {
      if (
        search &&
        !m.地图名称.includes(search) &&
        !m.地图描述.includes(search)
      )
        return false;
      if (filterType && m.地图类型 !== filterType) return false;
      return true;
    });
  }, [地图列表, search, filterType]);

  // ── Render tree ──
  const renderTree = (items: 地图数据[], level: number) => {
    return items.map(item => {
      const children = getChildren(item.id);
      const hasChildren = children.length > 0;
      const expanded = 展开集合.has(item.id);
      const isSelected = 选中?.id === item.id;
      const color = 类型颜色[item.地图类型] || '#94a3b8';

      return (
        <div key={item.id}>
          <div
            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-teal-500/20' : 'hover:bg-[var(--bg-dark)]'}`}
            style={{ paddingLeft: `${8 + level * 16}px` }}
            onClick={() => set选中(item)}
          >
            {hasChildren ? (
              <button
                className="w-4 h-4 flex items-center justify-center text-xs text-[var(--text-secondary)]"
                onClick={e => {
                  e.stopPropagation();
                  toggleExpand(item.id);
                }}
              >
                <i
                  className={
                    expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'
                  }
                />
              </button>
            ) : (
              <span className="w-4" />
            )}
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: color }}
            />
            <span className="text-sm truncate flex-1">{item.地图名称}</span>
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: color + '33', color }}
            >
              {类型标签(item.地图类型)}
            </span>
            {hasChildren && (
              <span className="text-xs text-[var(--text-secondary)]">
                {children.length}
              </span>
            )}
          </div>
          {hasChildren && expanded && renderTree(children, level + 1)}
        </div>
      );
    });
  };

  return (
    <div className="v-geomap-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width: 560 }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-gradient-to-r from-teal-900/30 to-cyan-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal-500/20">
                  <i className="text-lg text-teal-400 ri-map-2-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">地理地图</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    共 {地图列表.length} 个地点
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-teal-500/20 rounded-lg transition-colors text-teal-400"
                  title="AI生成地图"
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
                  className="px-3 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
                  onClick={() => handleAdd(null)}
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

          {/* Body: split into tree + detail */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left: tree */}
            <div className="flex-1 flex flex-col border-r border-[var(--border)]">
              <div className="p-3 space-y-2 border-b border-[var(--border)]">
                <input
                  type="text"
                  placeholder="搜索地点..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-teal-500/50 focus:outline-none"
                />
                <div className="flex gap-2">
                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-teal-500/50 focus:outline-none"
                  >
                    <option value="">全部类型</option>
                    {地图类型选项.map(o => (
                      <option key={o.值} value={o.值}>
                        {o.标签}
                      </option>
                    ))}
                  </select>
                  <button
                    className="px-2 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm hover:bg-[var(--bg-card)] transition-colors"
                    title="展开全部"
                    onClick={expandAll}
                  >
                    <i className="ri-eye-line" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {loading ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    加载中...
                  </div>
                ) : 根地图.length > 0 ? (
                  renderTree(根地图, 0)
                ) : (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无地图，点击新建或AI生成
                  </div>
                )}
              </div>
            </div>

            {/* Right: detail */}
            <div className="w-64 flex flex-col overflow-y-auto">
              {选中 ? (
                <div className="p-3 space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      地图名称
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-teal-500/50 focus:outline-none"
                      value={编辑名}
                      onChange={e => set编辑名(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      地图类型
                    </label>
                    <select
                      value={编辑类型}
                      onChange={e => set编辑类型(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-teal-500/50 focus:outline-none"
                    >
                      {地图类型选项.map(o => (
                        <option key={o.值} value={o.值}>
                          {o.标签}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      父地点
                    </label>
                    <select
                      value={编辑父ID ?? ''}
                      onChange={e =>
                        set编辑父ID(
                          e.target.value ? Number(e.target.value) : null
                        )
                      }
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-teal-500/50 focus:outline-none"
                    >
                      <option value="">无 (顶级)</option>
                      {地图列表
                        .filter(m => m.id !== 选中?.id)
                        .map(m => (
                          <option key={m.id} value={m.id}>
                            {m.地图名称}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      描述
                    </label>
                    <textarea
                      rows={3}
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-teal-500/50 focus:outline-none"
                      placeholder="地点描述..."
                      value={编辑描述}
                      onChange={e => set编辑描述(e.target.value)}
                    />
                  </div>
                  <button
                    className="w-full px-3 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
                    onClick={handleSave}
                  >
                    <i className="ri-save-line" /> 保存修改
                  </button>
                  <button
                    className="w-full px-3 py-2 border border-dashed border-[var(--border)] rounded-lg text-sm text-[var(--text-secondary)] hover:border-teal-500/50 hover:text-teal-400 transition-colors"
                    onClick={() => handleAdd(选中.id)}
                  >
                    <i className="ri-add-line" /> 添加子地点
                  </button>
                  <button
                    className="w-full px-3 py-2 border border-dashed border-red-500/30 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    onClick={() => handleDelete(选中.id)}
                  >
                    <i className="ri-delete-bin-line" /> 删除
                  </button>
                  <button
                    className="w-full px-3 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
                    disabled={aiGenerating}
                    onClick={() => handleAIGenerate(选中.id)}
                  >
                    <i
                      className={
                        aiGenerating
                          ? 'ri-loader-4-line animate-spin'
                          : 'ri-magic-line'
                      }
                    />{' '}
                    AI生成子地点
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-sm">
                  选择地点查看详情
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resize handle */}
        <div className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-teal-500/50 active:bg-teal-500 shrink-0" />
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
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-500/20">
                  <i className="text-teal-400 ri-magic-line" />
                </div>
                <h3 className="text-sm font-semibold">AI生成地图</h3>
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
                  父地点
                </label>
                <select
                  value={编辑父ID ?? ''}
                  onChange={e =>
                    set编辑父ID(e.target.value ? Number(e.target.value) : null)
                  }
                  className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-teal-500/50 focus:outline-none"
                >
                  <option value="">顶级世界</option>
                  {地图列表.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.地图名称}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  补充要求
                </label>
                <textarea
                  className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-none focus:border-teal-500/50 focus:outline-none"
                  placeholder="描述你对地图的具体要求..."
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
                className="px-4 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                disabled={aiGenerating}
                onClick={() => handleAIGenerate(编辑父ID)}
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

export default GeoMapPanel;
