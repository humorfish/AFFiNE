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

/* Source-derived: 7 category types (源码 lines 156435-156477) */
const 类别列表 = [
  '全部',
  '武器',
  '防具',
  '药品',
  '材料',
  '食物',
  '道具',
  '其他',
] as const;

const 类别样式: Record<string, { icon: string; bg: string; text: string }> = {
  武器: { icon: 'ri-sword-line', bg: 'bg-red-500/20', text: 'text-red-400' },
  防具: { icon: 'ri-shield-line', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  药品: {
    icon: 'ri-flask-line',
    bg: 'bg-green-500/20',
    text: 'text-green-400',
  },
  材料: {
    icon: 'ri-box-3-line',
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-400',
  },
  食物: {
    icon: 'ri-restaurant-line',
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
  },
  道具: {
    icon: 'ri-magic-line',
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
  },
  其他: {
    icon: 'ri-question-line',
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
  },
};

/* Source-derived: 4 difficulty levels (源码 lines 156480-156487) */
const 难度样式: Record<string, string> = {
  容易: 'bg-green-500/20 text-green-400',
  一般: 'bg-blue-500/20 text-blue-400',
  困难: 'bg-orange-500/20 text-orange-400',
  极难: 'bg-red-500/20 text-red-400',
};

/* Source-derived: item interface (源码 edit dialog fields) */
interface 物品数据 {
  id: number;
  物品名称: string;
  类别: string;
  获取难度: string;
  作用?: string;
  出处?: string;
  价值?: string;
  威力?: string;
  防御力?: string;
  保存期限?: string;
  用量?: string;
  使用人群?: string;
  特征?: string;
  注意事项?: string;
  使用代价?: string;
}

/* ── AI prompt & parsers (source-derived pipe format) ── */

function buildItemsSystemPrompt(): string {
  return `你是一位专业的小说道具设计师。请根据用户要求生成详细的物品列表。

输出格式要求（严格按管道符|分隔的行格式）：
I|物品名称|类别|作用|获取难度

规则：
1. 每行以I|开头，格式为 I|物品名称|类别（武器/防具/药品/材料/食物/道具/其他）|物品的作用描述|获取难度（容易/一般/困难/极难）
2. 每个物品占一行，不要输出JSON
3. 作用描述应包含物品的核心功能和在故事中的用途
4. 可以在作用描述后用|追加更多字段如出处、特征等

示例：
I|碧落苍穹剑|武器|上古神剑，蕴含剑道真意，可斩断虚空|极难
I|玄铁重甲|防具|以万年玄铁铸造，防御力极强但速度降低|困难
I|九转回生丹|药品|可起死回生，治疗致命伤，需九种天材地宝炼制|极难
I|灵石矿|材料|蕴含灵气的矿石，可用于修炼或交易|一般`;
}

function parseItemsPipe(text: string): 物品数据[] | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const items: 物品数据[] = [];

  for (const line of lines) {
    if (line.startsWith('I|')) {
      const parts = line.slice(2).split('|');
      items.push({
        id: Date.now() + items.length,
        物品名称: (parts[0] || '').trim() || '未命名物品',
        类别: (parts[1] || '其他').trim(),
        作用: (parts[2] || '').trim(),
        获取难度: (parts[3] || '一般').trim(),
        出处: (parts[4] || '').trim() || undefined,
        特征: (parts[5] || '').trim() || undefined,
      });
    }
  }

  return items.length > 0 ? items : null;
}

function parseItemsResponse(text: string): 物品数据[] | null {
  if (!text) return null;
  const pipe = parseItemsPipe(text.trim());
  if (pipe && pipe.length > 0) return pipe;
  try {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : parsed.物品列表 || [];
    if (arr.length > 0) return arr;
  } catch {}
  const codeMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeMatch)
    try {
      const parsed = JSON.parse(codeMatch[1]);
      const arr = Array.isArray(parsed) ? parsed : parsed.物品列表 || [];
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

const ItemsSchema = z.array(z.any()).min(1);

export const ItemsPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const [物品列表, set物品列表] = useState<物品数据[]>([]);
  const [搜索词, set搜索词] = useState('');
  const [类别过滤, set类别过滤] = useState('全部');
  const [width, setWidth] = useState(520);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* Edit dialog state (源码 edit item dialog) */
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<物品数据 | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);

  /* AI Generation state (源码 lines 156697-158873) */
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [genResult, setGenResult] = useState<物品数据[] | null>(null);
  const [genError, setGenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fetchSystemPrompt = useSystemPrompt(
    'AI生成物品',
    buildItemsSystemPrompt()
  );

  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveVersion('items', projectId, {
        描述: '保存物品',
        内容: 物品列表,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectId, 物品列表]);

  /* CRUD (源码: 保存编辑物品, 删除物品) */
  const openNewItem = useCallback(() => {
    setEditingItem({
      id: Date.now(),
      物品名称: '',
      类别: '武器',
      获取难度: '一般',
    });
    setIsNewItem(true);
    setShowEditDialog(true);
  }, []);

  const openEditItem = useCallback((item: 物品数据) => {
    setEditingItem({ ...item });
    setIsNewItem(false);
    setShowEditDialog(true);
  }, []);

  const saveEditItem = useCallback(() => {
    if (!editingItem || !editingItem.物品名称) return;
    if (isNewItem) {
      set物品列表(prev => [...prev, editingItem]);
    } else {
      set物品列表(prev =>
        prev.map(it => (it.id === editingItem.id ? editingItem : it))
      );
    }
    setShowEditDialog(false);
    setEditingItem(null);
  }, [editingItem, isNewItem]);

  const deleteItem = useCallback((id: number) => {
    set物品列表(prev => prev.filter(it => it.id !== id));
  }, []);

  /* AI generation (源码: function N opens dialog, function j confirms) */
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
      const existingStr = 物品列表
        .map(it => `${it.物品名称}(${it.类别}): ${it.作用 || '无描述'}`)
        .join('\n');
      const systemPrompt = await fetchSystemPrompt();
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: `${aiPrompt ? aiPrompt + '\n\n' : ''}${existingStr ? '已有物品：\n' + existingStr + '\n\n' : ''}请生成3-5个新的物品。按管道格式输出。`,
        },
      ];

      const validated = await generateValidated({
        schema: ItemsSchema,
        generate: attempt =>
          generateLLM({
            messages,
            temperature: Math.min(1.0, 0.85 + attempt * 0.05),
            max_tokens: 4096,
            onChunk: setStreamText,
            signal: ac.signal,
          }),
        parseResponse: parseItemsResponse,
        maxRetries: 3,
      });
      if (!validated) {
        setGenError('AI返回格式解析失败');
        return;
      }

      const parsedItems = validated.data as any;
      const items: 物品数据[] = (
        Array.isArray(parsedItems) ? parsedItems : [parsedItems]
      ).map((it: any, i: number) => ({
        id: Date.now() + i,
        物品名称: it.物品名称 || '未命名物品',
        类别: it.类别 || '其他',
        获取难度: it.获取难度 || '一般',
        作用: it.作用,
        出处: it.出处,
        价值: it.价值,
        威力: it.威力,
        防御力: it.防御力,
        保存期限: it.保存期限,
        用量: it.用量,
        使用人群: it.使用人群,
        特征: it.特征,
        注意事项: it.注意事项,
        使用代价: it.使用代价,
      }));
      setGenResult(items);
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, 物品列表, fetchSystemPrompt]);

  const adoptResult = useCallback(() => {
    if (!genResult) return;
    set物品列表(prev => [...prev, ...genResult]);
    setShowAIDialog(false);
    setGenResult(null);
    if (projectId) {
      saveVersion('items', projectId, {
        描述: 'AI生成物品',
        内容: [...物品列表, ...genResult],
      }).catch(() => {});
    }
  }, [genResult, 物品列表, projectId]);

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

  /* Filter */
  const 过滤后列表 = useMemo(() => {
    return 物品列表.filter(item => {
      const 匹配类别 = 类别过滤 === '全部' || item.类别 === 类别过滤;
      const 匹配搜索 =
        !搜索词 ||
        item.物品名称?.includes(搜索词) ||
        item.作用?.includes(搜索词);
      return 匹配类别 && 匹配搜索;
    });
  }, [物品列表, 类别过滤, 搜索词]);

  const 总字数 = useMemo(
    () =>
      物品列表.reduce(
        (s, it) =>
          s +
          (it.作用?.length || 0) +
          (it.特征?.length || 0) +
          (it.注意事项?.length || 0) +
          (it.使用代价?.length || 0),
        0
      ),
    [物品列表]
  );

  return createPortal(
    <div className="v-976288a5">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width }}
        >
          {/* Header (源码 lines 156641-156680) */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20">
                  <i className="text-lg text-emerald-400 ri-archive-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">物品列表</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    共 {物品列表.length} 个物品
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-emerald-500/20 rounded-lg transition-colors text-emerald-400"
                  title="AI生成物品"
                  onClick={openAIDialog}
                  disabled={generating}
                >
                  <i
                    className={`ri-${generating ? 'loader-4-line animate-spin' : 'magic-line'}`}
                  />
                </button>
                <button
                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
                  onClick={openNewItem}
                >
                  <i className="ri-add-line" /> 添加
                </button>
                <button
                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm transition-colors disabled:opacity-50"
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

            {/* Search & Filter (源码 lines 156754-158824) */}
            <div className="flex gap-2 mt-3">
              <div className="relative flex-1">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  placeholder="搜索物品..."
                  value={搜索词}
                  onChange={e => set搜索词(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-emerald-500/50"
                />
              </div>
              <select
                value={类别过滤}
                onChange={e => set类别过滤(e.target.value)}
                className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-emerald-500/50"
              >
                {类别列表.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Item list (源码 lines 157021-158426) */}
          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            {过滤后列表.map(item => {
              const cat = 类别样式[item.类别] || 类别样式['其他'];
              return (
                <div
                  key={item.id}
                  className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)] hover:border-emerald-500/30 transition-colors"
                >
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${cat.bg}`}
                    >
                      <i className={`${cat.text} ${cat.icon}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium truncate">
                          {item.物品名称}
                        </h3>
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full shrink-0 ${cat.bg} ${cat.text}`}
                        >
                          {item.类别}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full shrink-0 ${难度样式[item.获取难度] || 'bg-blue-500/20 text-blue-400'}`}
                        >
                          {item.获取难度}
                        </span>
                      </div>
                      {item.作用 && (
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                          {item.作用}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-[var(--text-secondary)] hover:text-emerald-400"
                        title="编辑"
                        onClick={() => openEditItem(item)}
                      >
                        <i className="ri-edit-line" />
                      </button>
                      <button
                        className="p-1.5 hover:bg-red-500/20 rounded transition-colors text-[var(--text-secondary)] hover:text-red-400"
                        title="删除"
                        onClick={() => deleteItem(item.id)}
                      >
                        <i className="ri-delete-bin-line" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {过滤后列表.length === 0 && (
              <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                暂无物品
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-darker)] flex justify-end">
            <span className="text-xs text-[var(--text-secondary)]">
              总计 {总字数} 字
            </span>
          </div>
        </div>

        <div
          className="relative z-10 w-2 bg-transparent cursor-col-resize hover:bg-emerald-500/50 active:bg-emerald-500 shrink-0"
          title="拖拽调整宽度"
          onMouseDown={handleMouseDown}
        />
        <div
          className="fixed top-0 bottom-0 right-0 bg-black/0 hover:bg-black/5"
          style={{ left: (leftOffset || 0) + width + 2 }}
          onClick={onClose}
        />
      </div>

      {/* Edit Item Dialog (源码 edit dialog) */}
      {showEditDialog &&
        editingItem &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ri-archive-line text-emerald-400" />
                  <h3 className="font-semibold">
                    {isNewItem ? '添加物品' : '编辑物品'}
                  </h3>
                </div>
                <button
                  className="p-1.5 hover:bg-[var(--bg-dark)] rounded-lg"
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingItem(null);
                  }}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    物品名称 *
                  </label>
                  <input
                    type="text"
                    className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-emerald-500/50"
                    placeholder="输入物品名称"
                    value={editingItem.物品名称}
                    onChange={e =>
                      setEditingItem({
                        ...editingItem,
                        物品名称: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      类别
                    </label>
                    <select
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-emerald-500/50"
                      value={editingItem.类别}
                      onChange={e =>
                        setEditingItem({ ...editingItem, 类别: e.target.value })
                      }
                    >
                      {类别列表
                        .filter(c => c !== '全部')
                        .map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      获取难度
                    </label>
                    <select
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-emerald-500/50"
                      value={editingItem.获取难度}
                      onChange={e =>
                        setEditingItem({
                          ...editingItem,
                          获取难度: e.target.value,
                        })
                      }
                    >
                      <option value="容易">容易</option>
                      <option value="一般">一般</option>
                      <option value="困难">困难</option>
                      <option value="极难">极难</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    作用
                  </label>
                  <textarea
                    className="w-full p-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-emerald-500/50 min-h-[60px]"
                    placeholder="描述物品的功能和作用"
                    value={editingItem.作用 || ''}
                    onChange={e =>
                      setEditingItem({ ...editingItem, 作用: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      出处
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-emerald-500/50"
                      placeholder="来源说明"
                      value={editingItem.出处 || ''}
                      onChange={e =>
                        setEditingItem({ ...editingItem, 出处: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      价值
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-emerald-500/50"
                      placeholder="价格或价值评估"
                      value={editingItem.价值 || ''}
                      onChange={e =>
                        setEditingItem({ ...editingItem, 价值: e.target.value })
                      }
                    />
                  </div>
                </div>
                {/* Conditional fields (源码: conditionally shown based on category) */}
                {(editingItem.类别 === '武器' ||
                  editingItem.类别 === '药品') && (
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      威力
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-emerald-500/50"
                      placeholder="攻击力或效果强度"
                      value={editingItem.威力 || ''}
                      onChange={e =>
                        setEditingItem({ ...editingItem, 威力: e.target.value })
                      }
                    />
                  </div>
                )}
                {editingItem.类别 === '防具' && (
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      防御力
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-emerald-500/50"
                      placeholder="防御力数值"
                      value={editingItem.防御力 || ''}
                      onChange={e =>
                        setEditingItem({
                          ...editingItem,
                          防御力: e.target.value,
                        })
                      }
                    />
                  </div>
                )}
                {editingItem.类别 === '食物' && (
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      保存期限
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-emerald-500/50"
                      placeholder="保存期限"
                      value={editingItem.保存期限 || ''}
                      onChange={e =>
                        setEditingItem({
                          ...editingItem,
                          保存期限: e.target.value,
                        })
                      }
                    />
                  </div>
                )}
                {(editingItem.类别 === '药品' ||
                  editingItem.类别 === '材料') && (
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      用量
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-emerald-500/50"
                      placeholder="使用剂量或用量"
                      value={editingItem.用量 || ''}
                      onChange={e =>
                        setEditingItem({ ...editingItem, 用量: e.target.value })
                      }
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    使用人群
                  </label>
                  <input
                    type="text"
                    className="w-full h-9 px-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-emerald-500/50"
                    placeholder="适用对象"
                    value={editingItem.使用人群 || ''}
                    onChange={e =>
                      setEditingItem({
                        ...editingItem,
                        使用人群: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    特征
                  </label>
                  <textarea
                    className="w-full p-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-emerald-500/50 min-h-[60px]"
                    placeholder="独特属性描述"
                    value={editingItem.特征 || ''}
                    onChange={e =>
                      setEditingItem({ ...editingItem, 特征: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    注意事项
                  </label>
                  <textarea
                    className="w-full p-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-emerald-500/50 min-h-[60px]"
                    placeholder="使用限制或警告"
                    value={editingItem.注意事项 || ''}
                    onChange={e =>
                      setEditingItem({
                        ...editingItem,
                        注意事项: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1">
                    使用代价
                  </label>
                  <textarea
                    className="w-full p-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-emerald-500/50 min-h-[60px]"
                    placeholder="副作用或消耗"
                    value={editingItem.使用代价 || ''}
                    onChange={e =>
                      setEditingItem({
                        ...editingItem,
                        使用代价: e.target.value,
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
                    setEditingItem(null);
                  }}
                >
                  取消
                </button>
                <button
                  className="px-4 py-2 btn-primary rounded-lg text-sm flex items-center gap-1"
                  onClick={saveEditItem}
                >
                  <i className="ri-check-line" /> 保存
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* AI Generation Dialog (源码 lines 158446-158826) */}
      {showAIDialog &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ri-magic-line text-emerald-400" />
                  <h3 className="font-semibold">AI生成物品</h3>
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
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:border-emerald-500 transition-colors"
                    placeholder="描述你想要生成的物品类型，如：生成一些仙侠世界的武器和丹药..."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    disabled={generating}
                  />
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  AI会根据当前世界观信息生成物品
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
                    <h4 className="text-sm font-semibold">
                      生成结果预览（{genResult.length}个物品）
                    </h4>
                    {genResult.map((it, i) => {
                      const cat = 类别样式[it.类别] || 类别样式['其他'];
                      return (
                        <div
                          key={i}
                          className="bg-[var(--bg-dark)] rounded-xl p-3"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <i className={`${cat.text} ${cat.icon}`} />
                            <span className="text-sm font-medium">
                              {it.物品名称}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${cat.bg} ${cat.text}`}
                            >
                              {it.类别}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${难度样式[it.获取难度] || 'bg-blue-500/20 text-blue-400'}`}
                            >
                              {it.获取难度}
                            </span>
                          </div>
                          {it.作用 && (
                            <p className="text-xs text-[var(--text-secondary)] mt-1">
                              {it.作用}
                            </p>
                          )}
                        </div>
                      );
                    })}
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

export default ItemsPanel;
