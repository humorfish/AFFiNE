import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { z } from 'zod';
import {
  useAIFullGenerate,
  AIGenerationDialog,
  useSystemPrompt,
  generateLLM,
} from './panel-shared';
import type { TypeOption, QuickTemplate } from './panel-shared';
import { API_BASE, getAuthHeaders } from '../useWorldApi';

// ── Data interfaces ──────────────────────────────────────────────────────

interface 事件线数据 {
  id: number;
  标题: string;
  描述: string;
  章节号: number;
  章节名?: string;
  卷号: number;
  卷名?: string;
  大纲节点ID?: number;
  已蒸馏?: boolean;
  需重蒸馏?: boolean;
  标签列表?: { 标签名: string; 图标: string; 颜色: string }[];
  // Legacy fields
  章节标题?: string;
  已经历事件线?: string;
  // Additional fields for compress/expand
  心理变化?: string;
  能力变化?: string;
  状态变化?: string;
  重要人物摘要?: string;
  重要备注?: string;
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ── Tag color lookup (static, no dynamic Tailwind) ─────────────────────

const TAG_ICON_MAP: Record<string, { icon: string; bg: string; text: string }> =
  {
    心理: {
      icon: 'ri-mental-health-line',
      bg: 'bg-purple-500/15',
      text: 'text-purple-400',
    },
    能力: {
      icon: 'ri-sword-line',
      bg: 'bg-amber-500/15',
      text: 'text-amber-400',
    },
    状态: {
      icon: 'ri-heart-pulse-line',
      bg: 'bg-red-500/15',
      text: 'text-red-400',
    },
    人物: {
      icon: 'ri-user-star-line',
      bg: 'bg-blue-500/15',
      text: 'text-blue-400',
    },
    备注: {
      icon: 'ri-sticky-note-line',
      bg: 'bg-orange-500/15',
      text: 'text-orange-400',
    },
  };

// ── Section definitions for detail view ─────────────────────────────────

interface DetailSection {
  key: string;
  title: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  defaultOpen: boolean;
}

const DETAIL_SECTIONS: DetailSection[] = [
  {
    key: 'basic',
    title: '基础信息',
    icon: 'ri-information-line',
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-400',
    defaultOpen: true,
  },
  {
    key: 'memory',
    title: '记忆状态',
    icon: 'ri-brain-line',
    iconBg: 'bg-cyan-500/20',
    iconColor: 'text-cyan-400',
    defaultOpen: false,
  },
  {
    key: 'eventLine',
    title: '已经历事件线',
    icon: 'ri-bookmark-line',
    iconBg: 'bg-teal-500/20',
    iconColor: 'text-teal-400',
    defaultOpen: false,
  },
  {
    key: 'changes',
    title: '变化记录',
    icon: 'ri-exchange-line',
    iconBg: 'bg-purple-500/20',
    iconColor: 'text-purple-400',
    defaultOpen: false,
  },
  {
    key: 'characters',
    title: '重要人物摘要',
    icon: 'ri-user-star-line',
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
    defaultOpen: false,
  },
  {
    key: 'notes',
    title: '重要备注',
    icon: 'ri-sticky-note-line',
    iconBg: 'bg-orange-500/20',
    iconColor: 'text-orange-400',
    defaultOpen: false,
  },
];

// ── AI generation config ─────────────────────────────────────────────────

const EVENTLINE_TYPE_OPTIONS: TypeOption[] = [
  { 名称: '主线事件', 图标: 'ri-road-map-line', 颜色: '#22c55e' },
  { 名称: '支线事件', 图标: 'ri-git-branch-line', 颜色: '#3b82f6' },
  { 名称: '转折事件', 图标: 'ri-refresh-line', 颜色: '#f97316' },
  { 名称: '伏笔事件', 图标: 'ri-bookmark-line', 颜色: '#a855f7' },
  { 名称: '高潮事件', 图标: 'ri-fire-line', 颜色: '#ef4444' },
];

const EVENTLINE_QUICK_TEMPLATES: QuickTemplate[] = [
  {
    label: '修炼突破',
    icon: 'ri-sword-line',
    color: '#22c55e',
    type: '主线事件',
    prompt: '主角在修炼中遇到瓶颈，通过特殊机缘实现突破，引发周围势力关注。',
  },
  {
    label: '势力冲突',
    icon: 'ri-group-line',
    color: '#3b82f6',
    type: '支线事件',
    prompt: '两大势力因为资源争夺爆发冲突，主角被卷入其中，面临选择。',
  },
  {
    label: '真相揭露',
    icon: 'ri-eye-line',
    color: '#f97316',
    type: '转折事件',
    prompt: '隐藏多年的真相浮出水面，主角的身份或世界观发生重大转变。',
  },
  {
    label: '宿命对决',
    icon: 'ri-sword-line',
    color: '#ef4444',
    type: '高潮事件',
    prompt: '主角与宿敌展开生死对决，双方底牌尽出，战斗影响整个世界格局。',
  },
];

const EVENTLINE_SYSTEM_PROMPT = `你是一位专业的小说事件线设计师。根据用户提供的设定和要求，生成事件线的详细内容。

输出格式要求（严格按管道符|分隔的行格式）：
E|事件标题|事件类型|事件描述

规则：
1. 每行以E|开头，格式为 E|事件标题|事件类型（主线事件/支线事件/转折事件/伏笔事件/高潮事件）|事件的详细描述
2. 事件描述应包含关键情节、转折和影响
3. 不要输出JSON，只输出上述管道格式

示例：
E|灵气觉醒|主线事件|主角在离厄矿州挖矿时意外跌入偃锋残脉，造化玉录残片入体重塑本源灵枢，觉醒禁忌符文之力
E|矿州暴动|支线事件|主角觉醒之力外泄震杀监工头目，引发矿州暴动，其他矿工趁机逃离
E|身世之谜|伏笔事件|地底深处传来的诡异心跳与嘶吼暗示着主角血脉中沉睡的远古力量`;

const eventLineSchema = z.record(z.string());

// ── Component ────────────────────────────────────────────────────────────

export const EventLinesPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  // List view state
  const [搜索词, set搜索词] = useState('');
  const [事件列表, set事件列表] = useState<事件线数据[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Data fetching ──
  const refreshList = useCallback(() => {
    if (!projectId) return;
    fetch(`${API_BASE}/api/event-lines/project/${projectId}/list`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data))
          set事件列表(result.data);
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/event-lines/project/${projectId}/list`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data))
          set事件列表(result.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // ── getContext for AI generation ──
  const [eventContext, setEventContext] = useState<any>(null);

  const fetchEventContext = useCallback(async () => {
    if (!projectId) return null;
    try {
      const res = await fetch(
        `${API_BASE}/api/event-lines/project/${projectId}/context`,
        { headers: getAuthHeaders() }
      );
      const result = await res.json();
      if (result.success && result.data) {
        setEventContext(result.data);
        return result.data;
      }
    } catch {}
    return null;
  }, [projectId]);

  // AI generation
  const fetchSystemPrompt = useSystemPrompt(
    'AI生成事件线',
    EVENTLINE_SYSTEM_PROMPT
  );
  const fullGen = useAIFullGenerate({
    module: 'eventlines',
    projectId,
    data: 事件列表.reduce(
      (acc, e) => {
        acc[`event_${e.id}`] = e.描述;
        return acc;
      },
      {} as Record<string, string>
    ),
    setData: () => {},
    fetchSystemPrompt,
    parseResponse: text => {
      // Try pipe format first
      const pipeLines = text
        .trim()
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('E|'));
      if (pipeLines.length > 0) {
        const result: Record<string, string> = {};
        pipeLines.forEach((line, i) => {
          const parts = line.slice(2).split('|');
          const title = (parts[0] || '').trim();
          const desc = (parts[2] || '').trim();
          if (title) result[`事件${i + 1}_${title}`] = desc;
        });
        if (Object.keys(result).length > 0) return result;
      }
      try {
        return JSON.parse(text);
      } catch {}
      const codeMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeMatch)
        try {
          return JSON.parse(codeMatch[1]);
        } catch {}
      const m = text.match(/\{[\s\S]*\}/);
      if (m)
        try {
          return JSON.parse(m[0]);
        } catch {}
      return null;
    },
    schema: eventLineSchema,
    defaultType: '主线事件',
    buildUserMessage: (type, desc) => {
      let msg = `请为我生成事件线的详细内容。\n\n事件类型：${type}`;
      if (eventContext) {
        if (eventContext.世界观) {
          msg += `\n\n【世界观背景】\n世界名称：${eventContext.世界观.世界名称 || ''}\n世界类型：${eventContext.世界观.世界类型 || ''}\n核心规则：${eventContext.世界观.核心规则 || ''}`;
        }
        if (eventContext.故事核心) {
          msg += `\n\n【故事核心】\n核心主题：${eventContext.故事核心.核心主题 || ''}\n核心冲突：${eventContext.故事核心.核心冲突 || ''}`;
        }
        if (eventContext.现有角色?.length > 0) {
          msg += `\n\n【现有角色】\n${eventContext.现有角色
            .slice(0, 5)
            .map((c: any) => `- ${c.姓名}（${c.类型}）`)
            .join('\n')}`;
        }
      }
      if (desc) msg += `\n\n${desc}`;
      msg += '\n\n请按管道格式输出。';
      return msg;
    },
  });

  // ── AI compress handler ──
  const [compressing, setCompressing] = useState(false);
  const abortCompressRef = useRef<AbortController | null>(null);

  const handleAICompress = async () => {
    if (compressing || !projectId) return;
    setCompressing(true);
    abortCompressRef.current = new AbortController();
    try {
      // Fetch context first (角色存续状态 etc.)
      const ctx = await fetchEventContext();

      // Build event data for compress prompt — includes 3 injection items from Vue
      // Injection 1: 角色存活状态 (from eventContext.现有角色)
      const 角色存活信息 =
        ctx?.现有角色?.length > 0
          ? ctx.现有角色
              .slice(0, 10)
              .map(
                (c: any) =>
                  `${c.姓名}(${c.类型 || '未知'}): ${c.存续状态 || c.状态 || '活跃'}`
              )
              .join('；')
          : '当前所有角色均为活跃状态。';

      // Injection 2: 写作进度 (from eventContext.写作进度 or derived from 事件列表)
      const 写作进度信息 = ctx?.写作进度
        ? `已写到第${ctx.写作进度.当前章节 || '?'}章，共${ctx.写作进度.总章数 || '?'}章`
        : ctx?.大纲进度
          ? `大纲进度：${ctx.大纲进度}`
          : 事件列表.length > 0
            ? `当前写作进度：共${事件列表.length}章有事件记录。`
            : '无写作进度信息';

      // Injection 3: 用户需求 (custom requirement, if any)
      const 用户需求信息 = ctx?.用户需求 || ctx?.故事核心?.核心主题 || '';

      let K = '';
      for (const F of 事件列表) {
        K += `[大纲节点ID=${F.大纲节点ID}] ${F.标题 || F.章节标题}：\n`;
        K += `  已经历事件线：${F.已经历事件线 || '无'}\n`;
        K += `  心理变化：${F.心理变化 || '无'}\n`;
        K += `  能力变化：${F.能力变化 || '无'}\n`;
        K += `  状态变化：${F.状态变化 || '无'}\n`;
        K += `  重要人物摘要：${F.重要人物摘要 || '无'}\n`;
        K += `  重要备注：${F.重要备注 || '无'}\n\n`;
      }

      const systemPrompt = `你是一个小说事件线分析专家。请逐条分析以下各章节的主角已历事件线数据，判断每条是否需要压缩归档。

${角色存活信息}
${写作进度信息}
${用户需求信息 ? `用户特殊要求：${用户需求信息}` : ''}
判断标准：
- 如果涉及的角色已死亡或已退场（参考角色存续状态），相关事件应压缩归档
- 如果心理状态已被后续章节的新心理变化覆盖（即后面章节有更新的心理描述），应压缩归档
- 如果能力/状态变化已经在后续章节发生了新的变化（后面章节有更新的描述），应压缩归档
- 如果事件涉及的伏笔或悬念已在后续章节中解决，应压缩归档
- 如果信息仍然影响后续剧情发展、角色仍然活跃、状态仍然有效，保留为活跃

对需要压缩的章节，综合所有"有效"字段的核心信息，生成≤80字的压缩摘要，保留关键转折和重要信息。

章节事件线数据：
${K}
## 输出格式（极简行格式，每条事件线输出一行，用|分隔字段）
EC|大纲节点ID|章节标题|压缩动作|原文字数|压缩后字数|压缩摘要|字段状态JSON

### 字段说明
- EC：固定前缀标记
- 大纲节点ID：纯数字
- 章节标题：与输入完全一致的原标题
- 压缩动作：compress（压缩归档）或 keep（保留为活跃）
- 原文字数：该章事件线各字段的原始总字数
- 压缩后字数：压缩摘要的字数（keep时与原文字数相同）
- 压缩摘要：≤80字的核心信息摘要（keep时填写"-"）
- 字段状态JSON：如 {"心理变化":"已完结","能力变化":"有效","状态变化":"有效"}

### 重要规则
1. 每条事件线都必须输出一行，不可遗漏
2. 字段内容中不允许出现|符号
3. 字段状态JSON中的值只能是"有效"或"已完结"
4. 只输出EC行，不要输出其他任何内容`;

      const messages = [
        {
          role: 'system' as const,
          content:
            '你是一个专业的小说事件线分析助手。你需要根据角色存续状态、事件发展脉络和章节间的信息覆盖关系，准确判断每个章节事件线是否需要压缩归档。严格按照EC|...|...|...|...|...|...|{...}格式逐行输出，不要输出任何其他内容。',
        },
        { role: 'user' as const, content: systemPrompt },
      ];

      const fullText = await generateLLM({
        messages,
        max_tokens: 4096,
        onChunk: () => {},
        signal: abortCompressRef.current.signal,
      });

      // Parse EC| lines and apply compress results — Vue writes compressed data back
      const ecResults: {
        大纲节点ID: string;
        章节标题: string;
        压缩动作: string;
        原文字数: number;
        压缩后字数: number;
        压缩摘要: string;
        字段状态: Record<string, string>;
      }[] = [];
      const lines = fullText
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('EC|'));
      for (const line of lines) {
        const parts = line.slice(3).split('|');
        if (parts.length >= 8) {
          try {
            ecResults.push({
              大纲节点ID: (parts[0] || '').trim(),
              章节标题: (parts[1] || '').trim(),
              压缩动作: (parts[2] || '').trim(),
              原文字数: parseInt(parts[3]) || 0,
              压缩后字数: parseInt(parts[4]) || 0,
              压缩摘要: (parts[5] || '').trim(),
              字段状态: (() => {
                try {
                  return JSON.parse(parts.slice(6).join('|'));
                } catch {
                  return {};
                }
              })(),
            });
          } catch {}
        }
      }

      if (ecResults.length > 0) {
        let successCount = 0;
        let failCount = 0;
        for (const ec of ecResults) {
          if (ec.压缩动作 !== 'compress') continue;
          // Match by 大纲节点ID or 章节标题 (same logic as Vue)
          const nodeIdStr = String(ec.大纲节点ID || '').replace(/[^\d]/g, '');
          const chapterTitle = String(ec.章节标题 || '');
          const matchedEvent = 事件列表.find(e => {
            const eId = String(e.大纲节点ID || '');
            return !!(
              (nodeIdStr && eId === nodeIdStr) ||
              (e.章节标题 && e.章节标题 === chapterTitle) ||
              (e.章节标题 &&
                chapterTitle &&
                (chapterTitle.includes(e.章节标题) ||
                  e.章节标题.includes(chapterTitle))) ||
              (e.标题 && e.标题 === chapterTitle) ||
              (e.标题 &&
                chapterTitle &&
                (chapterTitle.includes(e.标题) ||
                  e.标题.includes(chapterTitle)))
            );
          });
          if (matchedEvent) {
            try {
              await fetch(
                `${API_BASE}/api/event-lines/project/${projectId}/event/${matchedEvent.id}`,
                {
                  method: 'PUT',
                  headers: getAuthHeaders(),
                  body: JSON.stringify({
                    ...matchedEvent,
                    需重蒸馏: false,
                    记忆状态: '已压缩',
                    压缩档案: ec.压缩摘要 || '',
                    字段状态: ec.字段状态 || {},
                  }),
                }
              );
              successCount++;
            } catch {
              failCount++;
            }
          } else {
            failCount++;
          }
        }
        console.log(
          `AI压缩完成：成功${successCount}条${failCount > 0 ? `，失败${failCount}条` : ''}`
        );
      }
      refreshList();
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setCompressing(false);
    }
  };

  // Detail view state
  const [展开事件ID, set展开事件ID] = useState<number | null>(null);
  const [折叠sections, set折叠sections] = useState<Record<string, boolean>>(
    () => {
      const init: Record<string, boolean> = {};
      DETAIL_SECTIONS.forEach(s => {
        init[s.key] = !s.defaultOpen;
      });
      return init;
    }
  );

  // Detail form state
  const [编辑大纲节点ID, set编辑大纲节点ID] = useState('');
  const [编辑章节标题, set编辑章节标题] = useState('');

  // ── Derived data ───────────────────────────────────────────────────

  const 过滤后事件 = useMemo(() => {
    if (!搜索词) return 事件列表;
    const keyword = 搜索词.toLowerCase();
    return 事件列表.filter(
      e =>
        e.标题.toLowerCase().includes(keyword) ||
        e.描述.toLowerCase().includes(keyword) ||
        (e.已经历事件线 || '').toLowerCase().includes(keyword)
    );
  }, [事件列表, 搜索词]);

  const 展开事件 = useMemo(
    () => 事件列表.find(e => e.id === 展开事件ID) || null,
    [事件列表, 展开事件ID]
  );

  // ── Helpers ────────────────────────────────────────────────────────

  const toggleSection = useCallback((key: string) => {
    set折叠sections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Populate detail form when event changes
  React.useEffect(() => {
    if (展开事件) {
      set编辑大纲节点ID(展开事件.大纲节点ID?.toString() || '');
      set编辑章节标题(展开事件.标题 || '');
    }
  }, [展开事件]);

  const panelRight = leftOffset + 560 + 2; // sidebar width + resize handle width

  // ── Render: detail view ────────────────────────────────────────────

  if (展开事件) {
    return (
      <div className="v-84fd9838">
        <div
          className="已历事件侧边栏容器 fixed top-0 bottom-0 z-40 flex"
          style={{ left: leftOffset }}
        >
          {/* Main panel */}
          <div
            className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
            style={{ width: 560 }}
          >
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20">
                    <i className="text-lg ri-calendar-check-line text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">已历事件</h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      编辑事件线
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                    title="返回列表"
                    onClick={() => set展开事件ID(null)}
                  >
                    <i className="ri-arrow-left-line" />
                  </button>
                  <button
                    className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    onClick={async () => {
                      if (!展开事件 || !projectId) return;
                      const updated = {
                        ...展开事件,
                        大纲节点ID: 编辑大纲节点ID
                          ? Number(编辑大纲节点ID)
                          : undefined,
                        标题: 编辑章节标题,
                      };
                      try {
                        await fetch(
                          `${API_BASE}/api/event-lines/project/${projectId}/event/${updated.id}`,
                          {
                            method: 'PUT',
                            headers: getAuthHeaders(),
                            body: JSON.stringify(updated),
                          }
                        );
                        set事件列表(prev =>
                          prev.map(e => (e.id === updated.id ? updated : e))
                        );
                      } catch {}
                    }}
                  >
                    <i className="ri-save-line" /> 保存
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
                {DETAIL_SECTIONS.map(section => {
                  const isOpen = !折叠sections[section.key];
                  return (
                    <div
                      key={section.key}
                      className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]"
                    >
                      <div
                        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-dark)] transition-colors"
                        onClick={() => toggleSection(section.key)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex items-center justify-center w-8 h-8 rounded-lg ${section.iconBg}`}
                          >
                            <i
                              className={`${section.icon} ${section.iconColor}`}
                            />
                          </div>
                          <h3 className="text-sm font-medium">
                            {section.title}
                          </h3>
                        </div>
                        <i
                          className={`ri-arrow-${isOpen ? 'up' : 'down'}-s-line text-[var(--text-secondary)]`}
                        />
                      </div>
                      {isOpen && (
                        <div className="px-4 pb-4 space-y-3">
                          {section.key === 'basic' && (
                            <>
                              <div>
                                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                                  大纲节点ID
                                </label>
                                <input
                                  type="number"
                                  placeholder="对应大纲表的节点ID"
                                  className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none"
                                  value={编辑大纲节点ID}
                                  onChange={e =>
                                    set编辑大纲节点ID(e.target.value)
                                  }
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                                  章节标题{' '}
                                  <span className="text-red-400">*</span>
                                </label>
                                <input
                                  type="text"
                                  placeholder="请输入章节标题"
                                  className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none"
                                  value={编辑章节标题}
                                  onChange={e =>
                                    set编辑章节标题(e.target.value)
                                  }
                                />
                              </div>
                            </>
                          )}
                          {section.key === 'memory' && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              记忆状态信息将在此处显示
                            </p>
                          )}
                          {section.key === 'eventLine' && (
                            <textarea
                              className="w-full h-32 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-emerald-500/50 focus:outline-none leading-relaxed"
                              placeholder="已经历事件线内容..."
                              defaultValue={
                                展开事件.已经历事件线 || 展开事件.描述
                              }
                            />
                          )}
                          {section.key === 'changes' && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              变化记录将在此处显示
                            </p>
                          )}
                          {section.key === 'characters' && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              重要人物摘要将在此处显示
                            </p>
                          )}
                          {section.key === 'notes' && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              重要备注将在此处显示
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Resize handle */}
          <div
            className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-emerald-500/50 active:bg-emerald-500 shrink-0"
            title="拖拽调整宽度"
          />

          {/* Backdrop */}
          <div
            className="fixed top-0 bottom-0 right-0 transition-colors bg-black/0 hover:bg-black/5"
            style={{ left: panelRight }}
          />
        </div>
      </div>
    );
  }

  // ── Render: list view ─────────────────────────────────────────────

  return (
    <div className="v-84fd9838">
      <div
        className="已历事件侧边栏容器 fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        {/* Main panel */}
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width: 560 }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20">
                  <i className="text-lg ri-calendar-check-line text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">已历事件</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    共 {事件列表.length} 条事件线
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
                  title="AI生成事件"
                  onClick={async () => {
                    await fetchEventContext();
                    fullGen.open();
                  }}
                >
                  <i className="ri-sparkles-line" /> AI生成
                </button>
                <button
                  className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  title="AI压缩事件"
                  onClick={handleAICompress}
                  disabled={compressing}
                >
                  <i
                    className={
                      compressing
                        ? 'ri-loader-4-line animate-spin'
                        : 'ri-compress-line'
                    }
                  />{' '}
                  {compressing ? '压缩中...' : 'AI压缩'}
                </button>
                <button
                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
                  title="新建事件"
                  onClick={async () => {
                    if (!projectId) return;
                    try {
                      const res = await fetch(
                        `${API_BASE}/api/event-lines/project/${projectId}/event`,
                        {
                          method: 'POST',
                          headers: getAuthHeaders(),
                          body: JSON.stringify({
                            标题: '新事件线',
                            描述: '',
                            章节号: 0,
                            卷号: 0,
                          }),
                        }
                      );
                      const result = await res.json();
                      if (result.success && result.data) {
                        set事件列表(prev => [...prev, result.data]);
                      }
                    } catch {}
                  }}
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
                  placeholder="搜索章节标题、事件线..."
                  value={搜索词}
                  onChange={e => set搜索词(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-emerald-500/50 focus:outline-none"
                />
              </div>

              {/* Event cards */}
              <div className="space-y-2">
                {loading ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    加载中...
                  </div>
                ) : 过滤后事件.length > 0 ? (
                  过滤后事件.map(事件 => {
                    const defaultTags =
                      事件.标签列表 && 事件.标签列表.length > 0
                        ? []
                        : ['心理', '能力', '状态', '人物', '备注'];

                    return (
                      <div
                        key={事件.id}
                        className="p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg hover:border-emerald-500/50 cursor-pointer transition-colors group relative overflow-hidden"
                        onClick={() => set展开事件ID(事件.id)}
                      >
                        {/* Left gradient bar */}
                        <div className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-emerald-500 to-teal-500" />

                        <div className="pl-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              {/* Title row */}
                              <div className="flex items-center gap-2 mb-1.5">
                                <h4 className="text-sm font-medium truncate">
                                  {事件.标题}
                                </h4>
                                <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded shrink-0">
                                  {' #' + 事件.id}
                                </span>

                                {/* Distillation badges */}
                                <div className="inline-flex items-center gap-1 shrink-0">
                                  {事件.已蒸馏 && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400">
                                      已蒸馏 ✓
                                    </span>
                                  )}
                                  {事件.需重蒸馏 && (
                                    <>
                                      <span
                                        className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/15 text-orange-400"
                                        title="内容大幅变更，强烈建议重蒸馏"
                                      >
                                        <i className="ri-alert-line mr-0.5" />
                                        需重蒸馏
                                      </span>
                                      <button
                                        className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 transition-colors disabled:opacity-50"
                                        title="重新蒸馏"
                                        onClick={async e => {
                                          e.stopPropagation();
                                          if (!projectId) return;
                                          try {
                                            await fetch(
                                              `${API_BASE}/api/event-lines/project/${projectId}/event/${事件.id}`,
                                              {
                                                method: 'PUT',
                                                headers: getAuthHeaders(),
                                                body: JSON.stringify({
                                                  ...事件,
                                                  需重蒸馏: false,
                                                }),
                                              }
                                            );
                                            refreshList();
                                          } catch {}
                                        }}
                                      >
                                        <i className="text-xs ri-refresh-line" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Description */}
                              <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-1.5">
                                <i className="mr-1 ri-bookmark-line text-emerald-400" />
                                {事件.描述 || 事件.已经历事件线}
                              </p>

                              {/* Tags */}
                              <div className="flex flex-wrap gap-1.5">
                                {事件.标签列表 &&
                                  事件.标签列表.map((tag, i) => {
                                    const tagInfo = TAG_ICON_MAP[tag.标签名];
                                    if (!tagInfo) return null;
                                    return (
                                      <span
                                        key={i}
                                        className={`text-xs px-1.5 py-0.5 ${tagInfo.bg} ${tagInfo.text} rounded flex items-center gap-0.5`}
                                      >
                                        <i
                                          className={`${tagInfo.icon} text-[10px]`}
                                        />
                                        {tag.标签名}
                                      </span>
                                    );
                                  })}
                                {defaultTags.map(tagName => {
                                  const info = TAG_ICON_MAP[tagName];
                                  if (!info) return null;
                                  return (
                                    <span
                                      key={tagName}
                                      className={`text-xs px-1.5 py-0.5 ${info.bg} ${info.text} rounded flex items-center gap-0.5`}
                                    >
                                      <i
                                        className={`${info.icon} text-[10px]`}
                                      />
                                      {tagName}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-1 ml-2 shrink-0">
                              <button
                                className="p-1 transition-all rounded opacity-0 group-hover:opacity-100 hover:bg-cyan-500/20 text-cyan-400"
                                title="预览"
                                onClick={e => {
                                  e.stopPropagation();
                                  set展开事件ID(事件.id);
                                }}
                              >
                                <i className="text-sm ri-eye-line" />
                              </button>
                              <button
                                className="p-1 text-blue-400 transition-all rounded opacity-0 group-hover:opacity-100 hover:bg-blue-500/20"
                                title="归档"
                                onClick={async e => {
                                  e.stopPropagation();
                                  if (!projectId) return;
                                  try {
                                    await fetch(
                                      `${API_BASE}/api/event-lines/project/${projectId}/${事件.id}/status`,
                                      {
                                        method: 'PUT',
                                        headers: getAuthHeaders(),
                                        body: JSON.stringify({
                                          状态: 'archived',
                                        }),
                                      }
                                    );
                                    refreshList();
                                  } catch {}
                                }}
                              >
                                <i className="text-sm ri-archive-line" />
                              </button>
                              <button
                                className="p-1 text-red-400 transition-all rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20"
                                title="删除事件线"
                                onClick={async e => {
                                  e.stopPropagation();
                                  if (!projectId) return;
                                  try {
                                    await fetch(
                                      `${API_BASE}/api/event-lines/project/${projectId}/event/${事件.id}`,
                                      {
                                        method: 'DELETE',
                                        headers: getAuthHeaders(),
                                      }
                                    );
                                    set事件列表(prev =>
                                      prev.filter(e => e.id !== 事件.id)
                                    );
                                  } catch {}
                                }}
                              >
                                <i className="text-sm ri-delete-bin-line" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-[var(--text-secondary)]">
                    <i className="ri-calendar-check-line text-4xl opacity-30 mb-3 block" />
                    <p className="text-sm">暂无事件记录</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Resize handle */}
        <div
          className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-emerald-500/50 active:bg-emerald-500 shrink-0"
          title="拖拽调整宽度"
        />

        {/* Backdrop */}
        <div
          className="fixed top-0 bottom-0 right-0 transition-colors bg-black/0 hover:bg-black/5"
          style={{ left: panelRight }}
        />

        {/* AI full generation dialog */}
        <AIGenerationDialog
          title="AI生成事件线"
          subtitle="选择事件类型或描述你的构想，AI将为你生成事件线内容"
          phase={fullGen.phase}
          genType={fullGen.genType}
          setGenType={fullGen.setGenType}
          genDesc={fullGen.genDesc}
          setGenDesc={fullGen.setGenDesc}
          streamText={fullGen.streamText}
          parsed={fullGen.parsed}
          typeOptions={EVENTLINE_TYPE_OPTIONS}
          quickTemplates={EVENTLINE_QUICK_TEMPLATES}
          onStart={fullGen.start}
          onAdopt={async () => {
            if (!fullGen.parsed || !projectId) return;
            const entries = Object.entries(fullGen.parsed);
            for (const [key, value] of entries) {
              try {
                const title = key.replace(/^事件\d+_/, '');
                await fetch(
                  `${API_BASE}/api/event-lines/project/${projectId}/upsert`,
                  {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                      标题: title,
                      描述: value,
                    }),
                  }
                );
              } catch {}
            }
            refreshList();
            fullGen.close();
          }}
          onClose={fullGen.close}
        />
      </div>
    </div>
  );
};

export default EventLinesPanel;
