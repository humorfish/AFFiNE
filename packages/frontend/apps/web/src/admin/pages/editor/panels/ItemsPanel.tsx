import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import { generateLLM, generateValidated } from './panel-shared';
import { API_BASE, getAuthHeaders } from '../useWorldApi';

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

/* Source-derived: item interface (源码 q() line 7788-7818, 14 fields) */
interface 物品数据 {
  id?: number;
  物品名称: string;
  类别: string;
  获取难度: string;
  作用: string;
  出处: string;
  价值: string;
  威力: string;
  防御力: string;
  保存期限: string;
  用量: string;
  使用人群: string;
  特征: string;
  注意事项: string;
  使用代价: string;
}

/* ── AI prompt (源码 Ze() line 7735-7787) ── */

interface 世界观信息 {
  世界名称?: string;
  世界类型?: string;
  核心规则?: string;
  [key: string]: unknown;
}

function buildItemsPrompt(
  世界观: 世界观信息 | null,
  货币信息: any[] = [],
  势力信息: any[] = [],
  现有物品: any[] = []
): string {
  // Vue source passes all 4 params; 货币信息/势力信息 reserved for prompt enrichment
  void 货币信息;
  void 势力信息;
  let prompt = `你是一位专业的小说物品设计师，擅长构建完整的虚拟世界物品系统。

`;
  const 已有物品名列表 = 现有物品
    .map((it: any) => it.物品名称)
    .filter((n: any): n is string => !!n?.trim());
  let 禁止重复 = '';
  if (已有物品名列表.length > 0) {
    const 显示列表 = 已有物品名列表.slice(0, 30);
    禁止重复 = `
╔══════════════════════════════════════════════════════════════╗
║  【绝对禁止重复】以下物品名称已被使用，生成任何重复名称将导致任务失败
╚══════════════════════════════════════════════════════════════╝
已存在的物品(${已有物品名列表.length}个)：${显示列表.join('、')}${已有物品名列表.length > 30 ? '...' : ''}
`;
  }

  if (世界观 && Object.keys(世界观).length > 0) {
    prompt += `【世界观背景】
世界名称：${世界观.世界名称 || '未设定'}
世界类型：${世界观.世界类型 || '未设定'}
核心规则：${世界观.核心规则 || '未设定'}

`;
  }

  prompt += `${禁止重复}
【输出格式】（极简格式，节省token）
I|物品名称|类别|作用|获取难度

【格式说明】
- I: 物品信息（每个物品一行，生成5-10个）
  - 类别：武器/防具/药品/材料/食物/道具/其他
  - 作用：功能描述（10-30字）
  - 获取难度：容易/一般/困难/极难

【输出示例】
I|青锋剑|武器|锋利无比的精钢长剑，可斩金石|一般
I|玄铁甲|防具|以玄铁打造的重甲，防御极佳|困难
I|回元丹|药品|可恢复三成灵力的疗伤丹药|一般
I|灵石|材料|蕴含灵气的矿石，修炼必备|容易
I|辟谷丹|食物|服用后可七日不食|容易

【核心要求】
1. 物品要符合世界观设定
2. ⚠️ 物品名称必须唯一，不可与已有物品重复
3. 每个物品一行，简洁明了

【重要规则】
1. 严格按格式输出，每行一个物品
2. 不要输出任何其他内容
3. ⚠️ 在输出前检查物品名称是否与已有名称重复`;

  return prompt;
}

/* 源码 q() line 7788-7818: parse pipe format, 14 fields per item */
function parseItemsPipe(text: string): 物品数据[] | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const items: 物品数据[] = [];

  for (const line of lines) {
    if (line.startsWith('I|')) {
      const parts = line.slice(2).split('|');
      if (parts.length >= 3) {
        items.push({
          物品名称: (parts[0] || '').trim(),
          类别: (parts[1] || '其他').trim(),
          作用: (parts[2] || '').trim(),
          出处: '',
          获取难度: (parts[3] || '一般').trim(),
          威力: '',
          价值: '',
          特征: '',
          使用人群: '',
          注意事项: '',
          保存期限: '',
          用量: '',
          使用代价: '',
          防御力: '',
        });
      }
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

  /* Selection & batch delete state (源码 lines 156489-156536, 156831-156920) */
  const [选中IDs, set选中IDs] = useState<number[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<物品数据 | null>(null);
  const [isBatchDelete, setIsBatchDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* Pagination state (Vue source line 7444: l = w({ 当前页: 1, 每页数量: 20, 总数: 0, 总页数: 0 })) */
  const [分页, set分页] = useState({
    当前页: 1,
    每页数量: 20,
    总数: 0,
    总页数: 0,
  });
  const [loading, setLoading] = useState(false);

  /* Load list with server-side pagination and filtering (Vue source lines 7523-7551) */
  const loadList = useCallback(
    async (resetPage = false) => {
      if (!projectId) return;
      const page = resetPage ? 1 : 分页.当前页;
      if (resetPage) set分页(prev => ({ ...prev, 当前页: 1 }));
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(分页.每页数量),
        });
        if (类别过滤 && 类别过滤 !== '全部') params.set('类别', 类别过滤);
        if (搜索词) params.set('搜索关键词', 搜索词);

        const res = await fetch(
          `${API_BASE}/api/items/project/${projectId}/list?${params.toString()}`,
          { headers: getAuthHeaders() }
        );
        const result = await res.json();
        if (result.success) {
          set物品列表(Array.isArray(result.data) ? result.data : []);
          if (result.pagination) {
            set分页({
              当前页: result.pagination.page || 1,
              每页数量: result.pagination.limit || 20,
              总数: result.pagination.total || 0,
              总页数: result.pagination.totalPages || 0,
            });
          }
        }
      } catch {
      } finally {
        setLoading(false);
      }
    },
    [projectId, 分页.当前页, 分页.每页数量, 类别过滤, 搜索词]
  );

  // Load on mount
  useEffect(() => {
    loadList();
    loadGenerations();
  }, [projectId]);

  // Reload when filter/sort changes (Vue source line 7673: K(!0) on filter change)
  useEffect(() => {
    if (projectId) loadList(true);
  }, [类别过滤, 搜索词]);

  // Reload when page changes
  useEffect(() => {
    if (projectId && 分页.当前页 > 1) loadList();
  }, [分页.当前页]);

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

  /* Generations history (Vue source lines 7995-8030, API index lines 13759-13764) */
  const [generations, setGenerations] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  /* CRUD (源码: 保存编辑物品, 删除物品) */
  const openNewItem = useCallback(() => {
    setEditingItem({
      物品名称: '',
      类别: '武器',
      获取难度: '一般',
      作用: '',
      出处: '',
      价值: '',
      威力: '',
      防御力: '',
      保存期限: '',
      用量: '',
      使用人群: '',
      特征: '',
      注意事项: '',
      使用代价: '',
    });
    setIsNewItem(true);
    setShowEditDialog(true);
  }, []);

  const openEditItem = useCallback((item: 物品数据) => {
    setEditingItem({ ...item });
    setIsNewItem(false);
    setShowEditDialog(true);
  }, []);

  /* 源码: new→POST /items/project/{id}, edit→PUT /items/{id} */
  const saveEditItem = useCallback(async () => {
    if (!editingItem || !editingItem.物品名称?.trim() || !projectId) return;
    try {
      if (isNewItem) {
        // POST /items/project/{id}
        const res = await fetch(`${API_BASE}/api/items/project/${projectId}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(editingItem),
        });
        const result = await res.json();
        if (result.success) {
          const listRes = await fetch(
            `${API_BASE}/api/items/project/${projectId}/list`,
            { headers: getAuthHeaders() }
          );
          const listResult = await listRes.json();
          if (listResult.success && Array.isArray(listResult.data)) {
            set物品列表(listResult.data);
          }
        }
      } else if (editingItem.id) {
        // PUT /items/{id}
        const res = await fetch(`${API_BASE}/api/items/${editingItem.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(editingItem),
        });
        const result = await res.json();
        if (result.success) {
          set物品列表(prev =>
            prev.map(it =>
              it.id === editingItem.id ? { ...it, ...editingItem } : it
            )
          );
        }
      }
      setShowEditDialog(false);
      setEditingItem(null);
    } catch {
      alert('保存失败');
    }
  }, [editingItem, isNewItem, projectId]);

  const deleteItem = useCallback((item: 物品数据) => {
    // delegates to triggerDeleteItem defined after 过滤后列表
    setDeleteTarget(item);
    setIsBatchDelete(false);
    setShowDeleteDialog(true);
  }, []);

  /* AI generation (源码 pe() line 7841-7919) */
  const openAIDialog = useCallback(() => {
    setAiPrompt('');
    setStreamText('');
    setGenResult(null);
    setGenError('');
    setShowAIDialog(true);
  }, []);

  const startGeneration = useCallback(async () => {
    if (!projectId) return;
    setGenerating(true);
    setStreamText('');
    setGenResult(null);
    setGenError('');
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      // Vue source line 7854-7868: getContext → 4 fields
      let 世界观: 世界观信息 | null = null;
      let 货币信息: any[] = [];
      let 势力信息: any[] = [];
      let 现有物品: any[] = [];
      if (projectId) {
        try {
          const ctxRes = await fetch(
            `${API_BASE}/api/items/project/${projectId}/context`,
            { headers: getAuthHeaders() }
          );
          const ctxResult = await ctxRes.json();
          if (ctxResult.success && ctxResult.data) {
            世界观 = ctxResult.data.世界观信息 || null;
            货币信息 = ctxResult.data.货币信息 || [];
            势力信息 = ctxResult.data.势力信息 || [];
            现有物品 = ctxResult.data.现有物品 || [];
          }
        } catch {}
      }

      // Vue source line 7872: Ze(We, tt, nt, $t) — pass all 4 params
      const systemPrompt = buildItemsPrompt(
        世界观,
        货币信息,
        势力信息,
        现有物品
      );

      // 源码 line 7873-7878: messages
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content:
            aiPrompt ||
            '请根据世界观信息，生成符合设定的物品列表，包括武器、防具、药品、材料等多种类别',
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

      const parsed = validated.data as any;
      const items: 物品数据[] = (
        Array.isArray(parsed)
          ? parsed
          : parsed.物品列表
            ? parsed.物品列表
            : [parsed]
      ).map((it: any) => ({
        物品名称: it.物品名称 || '未命名物品',
        类别: it.类别 || '其他',
        作用: it.作用 || '',
        出处: it.出处 || '',
        获取难度: it.获取难度 || '一般',
        威力: it.威力 || '',
        价值: it.价值 || '',
        特征: it.特征 || '',
        使用人群: it.使用人群 || '',
        注意事项: it.注意事项 || '',
        保存期限: it.保存期限 || '',
        用量: it.用量 || '',
        使用代价: it.使用代价 || '',
        防御力: it.防御力 || '',
      }));
      setGenResult(items);

      // Vue source lines 7916-7924: save generation to history
      if (projectId) {
        try {
          await fetch(
            `${API_BASE}/api/items/project/${projectId}/generations`,
            {
              method: 'POST',
              headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                提示词: aiPrompt || '',
                世界观信息: 世界观,
                货币信息,
                势力信息,
                生成内容: items,
              }),
            }
          );
        } catch {}
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, 物品列表, projectId]);

  /* 源码: adopt → POST /items/project/{id} each → GET /list refresh */
  const adoptResult = useCallback(async () => {
    if (!genResult || !projectId) return;
    try {
      // Vue source line 7948: new Set of existing names for dedup
      const existingNames = new Set(
        物品列表.map(it => it.物品名称).filter((n): n is string => !!n?.trim())
      );
      const skipped: string[] = [];
      const adopted: string[] = [];

      for (const item of genResult) {
        const name = item.物品名称;
        if (name && existingNames.has(name)) {
          skipped.push(name);
          continue;
        }
        await fetch(`${API_BASE}/api/items/project/${projectId}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(item),
        });
        adopted.push(name || '未命名物品');
        if (name) existingNames.add(name);
      }

      // Reload list
      const listRes = await fetch(
        `${API_BASE}/api/items/project/${projectId}/list`,
        { headers: getAuthHeaders() }
      );
      const listResult = await listRes.json();
      if (listResult.success && Array.isArray(listResult.data)) {
        set物品列表(listResult.data);
      }
      setShowAIDialog(false);
      setGenResult(null);

      // Vue source lines 7961-7967: report adopted/skipped counts
      let msg = '';
      if (adopted.length > 0) msg += `成功新增 ${adopted.length} 个物品`;
      if (skipped.length > 0) {
        msg += msg ? '，' : '';
        msg += `跳过 ${skipped.length} 个重复物品（${skipped.join('、')}）`;
      }
      if (msg) alert(msg);
    } catch {
      alert('采用生成结果失败');
    }
  }, [genResult, 物品列表, projectId]);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    if (!generating) setShowAIDialog(false);
  }, [generating]);

  const loadGenerations = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/items/project/${projectId}/generations`,
        {
          headers: getAuthHeaders(),
        }
      );
      const result = await res.json();
      if (result.success) {
        setGenerations(result.data || []);
      }
    } catch {}
  }, [projectId]);

  const adoptGeneration = useCallback(
    async (generationId: number) => {
      if (!projectId) return;
      try {
        const res = await fetch(
          `${API_BASE}/api/items/project/${projectId}/generations/${generationId}/adopt`,
          { method: 'PUT', headers: getAuthHeaders() }
        );
        const result = await res.json();
        if (result.success) {
          // Reload both list and generations
          const listRes = await fetch(
            `${API_BASE}/api/items/project/${projectId}/list`,
            { headers: getAuthHeaders() }
          );
          const listResult = await listRes.json();
          if (listResult.success && Array.isArray(listResult.data)) {
            set物品列表(listResult.data);
          }
          await loadGenerations();
          alert(result.message || '采用成功');
        } else {
          alert(result.message || '采用失败');
        }
      } catch {
        alert('采用历史记录失败');
      }
    },
    [projectId, loadGenerations]
  );

  const deleteGeneration = useCallback(
    async (generationId: number) => {
      if (!projectId) return;
      try {
        const res = await fetch(
          `${API_BASE}/api/items/project/${projectId}/generations/${generationId}`,
          { method: 'DELETE', headers: getAuthHeaders() }
        );
        const result = await res.json();
        if (result.success) {
          setGenerations(prev => prev.filter(g => g.id !== generationId));
        } else {
          alert(result.message || '删除失败');
        }
      } catch {
        alert('删除历史记录失败');
      }
    },
    [projectId]
  );

  /* Sort (Vue source lines 7651-7659, API index line 13757) */
  const updateSort = useCallback(
    async (排序列表: number[]) => {
      if (!projectId) return;
      try {
        await fetch(`${API_BASE}/api/items/project/${projectId}/sort`, {
          method: 'PUT',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ 排序列表 }),
        });
      } catch {}
    },
    [projectId]
  );

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

  /* Filter — now server-side (Vue source line 7523-7551) */
  const 过滤后列表 = 物品列表;

  /* ── Selection & delete methods (源码 lines 156489-156536) ── */

  // V(B): toggle item selection (源码 line 156489)
  const toggleSelect = useCallback((id: number | undefined) => {
    if (id == null) return;
    set选中IDs(prev => {
      const idx = prev.indexOf(id);
      return idx === -1 ? [...prev, id] : prev.filter(x => x !== idx);
    });
  }, []);

  // 是否全选 (源码 line 156841)
  const 是否全选 =
    过滤后列表.length > 0 &&
    过滤后列表.every(it => it.id != null && 选中IDs.includes(it.id));

  // 切换全选 (源码 line 156845)
  const toggle全选 = useCallback(() => {
    if (是否全选) {
      set选中IDs([]);
    } else {
      set选中IDs(
        过滤后列表.map(it => it.id).filter((id): id is number => id != null)
      );
    }
  }, [是否全选, 过滤后列表]);

  // 清空选择 (源码 line 156910)
  const clearSelection = useCallback(() => set选中IDs([]), []);

  // L(): batch delete trigger (源码 line 156509)
  const triggerBatchDelete = useCallback(() => {
    if (deleting || !选中IDs.length) return;
    setDeleteTarget(null);
    setIsBatchDelete(true);
    setShowDeleteDialog(true);
  }, [deleting, 选中IDs]);

  // T(): cancel delete dialog (源码 line 156516)
  const cancelDelete = useCallback(() => {
    if (deleting) return;
    setShowDeleteDialog(false);
    setIsBatchDelete(false);
    setDeleteTarget(null);
  }, [deleting]);

  // z(): confirm delete (源码 line 156521)
  const confirmDelete = useCallback(async () => {
    if (isBatchDelete) {
      setDeleting(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/items/project/${projectId}/batch`,
          {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ ids: 选中IDs }),
          }
        );
        const result = await res.json();
        if (result.success) {
          set物品列表(prev =>
            prev.filter(it => !it.id || !选中IDs.includes(it.id))
          );
          set选中IDs([]);
          setShowDeleteDialog(false);
        } else {
          alert('批量删除失败：' + (result.message || '未知错误'));
        }
      } catch {
        alert('批量删除失败');
      } finally {
        setDeleting(false);
      }
      return;
    }
    if (deleteTarget?.id != null) {
      const id = deleteTarget.id;
      setDeleting(true);
      try {
        const res = await fetch(`${API_BASE}/api/items/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
        const result = await res.json();
        if (result.success) {
          set物品列表(prev => prev.filter(it => it.id !== id));
          setShowDeleteDialog(false);
          setDeleteTarget(null);
        } else {
          alert('删除失败：' + (result.message || '未知错误'));
        }
      } catch {
        alert('删除失败');
      } finally {
        setDeleting(false);
      }
    }
  }, [isBatchDelete, deleteTarget, 选中IDs, projectId]);

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
                  className="p-1.5 hover:bg-emerald-500/20 rounded-lg transition-colors text-emerald-400"
                  title="生成历史"
                  onClick={() => {
                    loadGenerations();
                    setShowHistory(true);
                  }}
                >
                  <i className="ri-history-line" />
                </button>
                <button
                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
                  onClick={openNewItem}
                >
                  <i className="ri-add-line" /> 添加
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

          {/* Selection bar (源码 lines 156831-156920) */}
          {选中IDs.length > 0 && (
            <div className="shrink-0 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-card)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={是否全选}
                      onChange={toggle全选}
                      className="w-4 h-4 rounded border-[var(--border)] text-emerald-500 focus:ring-emerald-500/50"
                    />
                    <span className="text-sm">全选</span>
                  </label>
                  <span className="text-sm text-[var(--text-secondary)]">
                    已选 {选中IDs.length} 项
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={triggerBatchDelete}
                    disabled={deleting}
                    className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-sm transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <i
                      className={
                        deleting
                          ? 'ri-loader-4-line animate-spin'
                          : 'ri-delete-bin-line'
                      }
                    />
                    删除
                  </button>
                  <button
                    onClick={clearSelection}
                    className="px-3 py-1 bg-[var(--bg-card)] hover:bg-[var(--border)] rounded text-sm transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Item list (源码 lines 157021-158426) */}
          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            {loading && (
              <div className="text-center py-4 text-[var(--text-secondary)] text-sm">
                <i className="ri-loader-4-line animate-spin mr-1" /> 加载中...
              </div>
            )}
            {!loading &&
              过滤后列表.map(item => {
                const cat = 类别样式[item.类别] || 类别样式['其他'];
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', String(item.id));
                    }}
                    onDragOver={e => {
                      e.preventDefault();
                      e.currentTarget.style.borderTopColor = 'rgb(16 185 129)';
                    }}
                    onDragLeave={e => {
                      e.currentTarget.style.borderTopColor = '';
                    }}
                    onDrop={async e => {
                      e.preventDefault();
                      e.currentTarget.style.borderTopColor = '';
                      const draggedId = Number(
                        e.dataTransfer.getData('text/plain')
                      );
                      const targetId = item.id;
                      if (draggedId === targetId || !draggedId || !targetId)
                        return;
                      // Reorder
                      const newOrder = [...物品列表];
                      const fromIdx = newOrder.findIndex(
                        it => it.id === draggedId
                      );
                      const toIdx = newOrder.findIndex(
                        it => it.id === targetId
                      );
                      if (fromIdx === -1 || toIdx === -1) return;
                      const [moved] = newOrder.splice(fromIdx, 1);
                      newOrder.splice(toIdx, 0, moved);
                      set物品列表(newOrder);
                      await updateSort(
                        newOrder.map(it => it.id!).filter(Boolean)
                      );
                    }}
                    className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)] hover:border-emerald-500/30 transition-colors"
                  >
                    <div
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-dark)] transition-colors"
                      onClick={() => toggleSelect(item.id)}
                    >
                      <input
                        type="checkbox"
                        checked={item.id != null && 选中IDs.includes(item.id)}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleSelect(item.id)}
                        className="w-4 h-4 rounded border-[var(--border)] text-emerald-500 focus:ring-emerald-500/50 shrink-0"
                      />
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
                          onClick={e => {
                            e.stopPropagation();
                            openEditItem(item);
                          }}
                        >
                          <i className="ri-edit-line" />
                        </button>
                        <button
                          className="p-1.5 hover:bg-red-500/20 rounded transition-colors text-[var(--text-secondary)] hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="删除"
                          disabled={deleting}
                          onClick={e => {
                            e.stopPropagation();
                            deleteItem(item);
                          }}
                        >
                          <i
                            className={
                              deleting
                                ? 'ri-loader-4-line animate-spin'
                                : 'ri-delete-bin-line'
                            }
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            {!loading && 过滤后列表.length === 0 && (
              <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                暂无物品
              </div>
            )}
          </div>

          {/* Footer with pagination (Vue source lines 7535-7541) */}
          <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-darker)] flex items-center justify-between">
            <span className="text-xs text-[var(--text-secondary)]">
              共 {分页.总数} 个物品
            </span>
            {分页.总页数 > 1 && (
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 text-xs bg-[var(--bg-card)] rounded hover:bg-[var(--border)] disabled:opacity-50"
                  disabled={分页.当前页 <= 1}
                  onClick={() => {
                    set分页(prev => ({ ...prev, 当前页: prev.当前页 - 1 }));
                  }}
                >
                  上一页
                </button>
                <span className="text-xs text-[var(--text-secondary)]">
                  {分页.当前页} / {分页.总页数}
                </span>
                <button
                  className="px-2 py-1 text-xs bg-[var(--bg-card)] rounded hover:bg-[var(--border)] disabled:opacity-50"
                  disabled={分页.当前页 >= 分页.总页数}
                  onClick={() => {
                    set分页(prev => ({ ...prev, 当前页: prev.当前页 + 1 }));
                  }}
                >
                  下一页
                </button>
              </div>
            )}
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
                    placeholder="输入名称"
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
                {/* Source: line 158106 — 威力 (武器/药品) */}
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
                {/* Source: line 158145 — 防御力 (防具) */}
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
                {/* Source: line 158183 — 保存期限 (食物) */}
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
                {/* Source: line 158221 — 用量 (药品/材料) */}
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
                {/* Source: line 158349 — 使用代价 */}
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

      {/* Generations History Dialog (Vue source lines 7995-8030) */}
      {showHistory &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ri-history-line text-emerald-400" />
                  <h3 className="font-semibold">生成历史</h3>
                </div>
                <button
                  className="p-1.5 hover:bg-[var(--bg-dark)] rounded-lg"
                  onClick={() => setShowHistory(false)}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {generations.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无生成历史
                  </div>
                )}
                {generations.map((gen: any) => (
                  <div
                    key={gen.id}
                    className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-[var(--text-secondary)]">
                        {gen.创建时间 || `#${gen.id}`}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded text-xs transition-colors"
                          onClick={() => adoptGeneration(gen.id)}
                        >
                          采用
                        </button>
                        <button
                          className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs transition-colors"
                          onClick={() => deleteGeneration(gen.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    {gen.提示词 && (
                      <p className="text-xs text-[var(--text-secondary)] mb-1">
                        提示词：{gen.提示词}
                      </p>
                    )}
                    {gen.生成内容 && Array.isArray(gen.生成内容) && (
                      <div className="text-xs text-[var(--text-secondary)]">
                        共 {gen.生成内容.length} 个物品
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Delete Confirmation Dialog (源码 lines 158911-159062) */}
      {showDeleteDialog &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={e => {
              if (e.target === e.currentTarget) cancelDelete();
            }}
          >
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/30 to-orange-500/30 flex items-center justify-center">
                  <i className="ri-error-warning-line text-red-400 text-2xl" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">
                    {isBatchDelete ? '批量删除' : '删除物品'}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    此操作无法撤销
                  </p>
                </div>
              </div>
              {isBatchDelete ? (
                <p className="text-sm mb-6">
                  确定要删除选中的{' '}
                  <span className="text-red-400 font-medium">
                    {选中IDs.length}
                  </span>{' '}
                  个物品吗？
                </p>
              ) : (
                <p className="text-sm mb-6">
                  确定要删除"
                  <span className="text-red-400 font-medium">
                    {deleteTarget?.物品名称 || '该物品'}
                  </span>
                  "吗？
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={cancelDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-[var(--bg-dark)] hover:bg-[var(--border)] text-[var(--text-secondary)] rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white rounded-xl transition-all font-medium shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {deleting && <i className="ri-loader-4-line animate-spin" />}
                  确认删除
                </button>
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
