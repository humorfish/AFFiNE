import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAIGenerate, generateLLM, generateValidated } from './panel-shared';
import { z } from 'zod';
import { createPortal } from 'react-dom';
import {
  saveVersion,
  saveGeneration,
  saveData,
  adoptGeneration,
  API_BASE,
  getAuthHeaders,
} from '../useWorldApi';
import { WORLDVIEW_SYSTEM_PROMPT } from './worldview-prompt';

/** Zod schema for validating a single worldview field output from LLM */
const worldviewFieldSchema = (field: string) =>
  z
    .object({
      [field]: z.string(),
    })
    .passthrough();

/** Structured calendar data matching Vue N() function */
interface CalendarData {
  历法名称: string;
  故事起点日期: string;
  每年月数: number;
  每月天数: number;
  每日时辰数: number;
  显示格式: string;
  纪年体系: { 名称: string; 序号: number; 描述: string }[];
  时辰名称: string[];
  时长模板: { 类型: string; 默认天数: number }[];
}

/** Parse CAL-prefixed lines into structured CalendarData (Vue N() lines 41281-41319) */
function parseCalendarLines(calLines: string[]): CalendarData | null {
  let result: CalendarData | null = null;
  for (const line of calLines) {
    const J = line.trim();
    if (J.startsWith('CAL|')) {
      const pe = J.substring(4).split('|');
      if (pe.length >= 3) {
        result = {
          历法名称: pe[0]?.trim() || '默认历法',
          故事起点日期: pe[1]?.trim() || '',
          每年月数: parseInt(pe[2]) || 12,
          每月天数: parseInt(pe[3]) || 30,
          每日时辰数: parseInt(pe[4]) || 12,
          显示格式: pe[5]?.trim() || '中式',
          纪年体系: [],
          时辰名称: [],
          时长模板: [],
        };
      }
    } else if (J.startsWith('CAL_ERA|')) {
      const pe = J.substring(8)
        .split(',')
        .map((ge, Ve) => ({ 名称: ge.trim(), 序号: Ve + 1, 描述: '' }))
        .filter(ge => ge.名称);
      if (result) result.纪年体系 = pe;
      else
        result = {
          历法名称: '',
          故事起点日期: '',
          每年月数: 12,
          每月天数: 30,
          每日时辰数: 12,
          显示格式: '中式',
          纪年体系: pe,
          时辰名称: [],
          时长模板: [],
        };
    } else if (J.startsWith('CAL_TIME|')) {
      const pe = J.substring(9)
        .split(',')
        .map(ge => ge.trim())
        .filter(ge => ge);
      if (result) result.时辰名称 = pe;
      else
        result = {
          历法名称: '',
          故事起点日期: '',
          每年月数: 12,
          每月天数: 30,
          每日时辰数: 12,
          显示格式: '中式',
          纪年体系: [],
          时辰名称: pe,
          时长模板: [],
        };
    } else if (J.startsWith('CAL_TPL|')) {
      const pe = J.substring(8)
        .split(',')
        .map(ge => {
          const [Ve, Ne] = ge.split(':');
          return { 类型: Ve?.trim() || '', 默认天数: parseInt(Ne) || 1 };
        })
        .filter(ge => ge.类型);
      if (result) result.时长模板 = pe;
      else
        result = {
          历法名称: '',
          故事起点日期: '',
          每年月数: 12,
          每月天数: 30,
          每日时辰数: 12,
          显示格式: '中式',
          纪年体系: [],
          时辰名称: [],
          时长模板: pe,
        };
    }
  }
  return result;
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

interface VersionEntry {
  id: string;
  时间: string;
  描述: string;
  内容: Record<string, any>;
}

interface GenEntry {
  id: string;
  时间: string;
  提示词: string;
  生成类型: string;
  生成内容: Record<string, any>;
  已采用: boolean;
}

/* ====================== Demo Data ====================== */

// Parse W|T|R|G pipe-delimited format from LLM (matching original site's N() function)
function parseWorldviewPipe(text: string): Record<string, string> | null {
  const lines = text.split('\n').filter(l => l.trim());
  let basic: { 世界名称: string; 世界类型: string } | null = null;
  let 时代背景 = '',
    核心规则 = '',
    地理环境 = '',
    社会结构 = '',
    历史背景 = '',
    特殊元素 = '',
    主要冲突 = '',
    势力格局 = '';
  const calLines: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('W|')) {
      const parts = t.substring(2).split('|');
      if (parts.length >= 2)
        basic = {
          世界名称: (parts[0] || '').trim(),
          世界类型: (parts[1] || '').trim(),
        };
    } else if (t.startsWith('T|')) 时代背景 = t.substring(2).trim();
    else if (t.startsWith('R|')) 核心规则 = t.substring(2).trim();
    else if (t.startsWith('G|')) 地理环境 = t.substring(2).trim();
    else if (t.startsWith('S|')) 社会结构 = t.substring(2).trim();
    else if (t.startsWith('H|')) 历史背景 = t.substring(2).trim();
    else if (t.startsWith('E|')) 特殊元素 = t.substring(2).trim();
    else if (t.startsWith('C|')) 主要冲突 = t.substring(2).trim();
    else if (t.startsWith('F|')) 势力格局 = t.substring(2).trim();
    else if (t.startsWith('CAL')) calLines.push(t);
  }

  if (basic && basic.世界名称) {
    const result: Record<string, string> = {
      世界名称: basic.世界名称,
      世界类型: basic.世界类型,
      时代背景,
      核心规则,
      地理环境,
      社会结构,
      历史背景,
      特殊元素,
      主要冲突,
      势力格局,
    };
    if (calLines.length > 0) {
      result.世界历法 = calLines.join('\n');
      const calData = parseCalendarLines(calLines);
      if (calData) {
        result._历法数据 = JSON.stringify(calData);
      }
    }
    return result;
  }
  return null;
}

// Try pipe first, then JSON fallback (matching original site's ee() function)
function parseWorldviewResponse(text: string): Record<string, string> | null {
  if (!text) return null;
  const pipeResult = parseWorldviewPipe(text.trim());
  if (pipeResult && pipeResult.世界名称) return pipeResult;
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

// Quick templates (from original site)
const 快捷模板 = [
  {
    label: '东方仙侠',
    icon: 'ri-sword-line',
    color: '#a855f7',
    类型: '仙侠世界',
    prompt:
      '一个以修真修仙为核心的东方玄幻世界，有完整的修炼体系和宗门势力，充满仙侠色彩。修士通过吸收天地灵气提升境界，追求长生大道。',
  },
  {
    label: '玄幻大陆',
    icon: 'ri-magic-line',
    color: '#3b82f6',
    类型: '玄幻大陆',
    prompt:
      '一个充满神秘力量和古老传承的大陆，有各种强大的魔兽和珍稀资源，武者和法师并存，势力纷争不断。',
  },
  {
    label: '现代都市',
    icon: 'ri-building-line',
    color: '#22c55e',
    类型: '现代都市',
    prompt:
      '一个灵气复苏或超能力觉醒的现代都市世界，普通人的日常生活与超凡力量交织，隐藏着不为人知的另一面。',
  },
  {
    label: '科幻未来',
    icon: 'ri-rocket-line',
    color: '#06b6d4',
    类型: '科幻未来',
    prompt:
      '一个高度发达的科技文明世界，星际航行、人工智能、基因改造等元素，人类文明向宇宙深处扩张。',
  },
  {
    label: '西方奇幻',
    icon: 'ri-shield-star-line',
    color: '#f97316',
    类型: '西方奇幻',
    prompt:
      '一个有魔法、精灵、龙族等元素的西方奇幻世界，中世纪风格，骑士与法师并肩作战，龙与地下城的冒险传说。',
  },
  {
    label: '末世废土',
    icon: 'ri-skull-line',
    color: '#ef4444',
    类型: '末世废土',
    prompt:
      '一个经历过巨大灾难后的末世世界，文明崩塌，幸存者在废墟中挣扎求生，变异生物和资源匮乏是主要威胁。',
  },
  {
    label: '历史架空',
    icon: 'ri-ancient-pavilion-line',
    color: '#eab308',
    类型: '历史架空',
    prompt:
      '一个架空的历史世界，以某个朝代为背景但有虚构的元素和人物，权谋争斗与江湖恩怨交织。',
  },
  {
    label: '游戏世界',
    icon: 'ri-gamepad-line',
    color: '#ec4899',
    类型: '游戏世界',
    prompt:
      '一个类似游戏的世界，有等级、技能、装备、任务等游戏元素，主角可能是玩家或NPC觉醒者。',
  },
];

const 世界类型选项 = [
  { 名称: '仙侠世界', 图标: 'ri-sword-line', 颜色: '#a855f7' },
  { 名称: '玄幻大陆', 图标: 'ri-magic-line', 颜色: '#3b82f6' },
  { 名称: '现代都市', 图标: 'ri-building-line', 颜色: '#22c55e' },
  { 名称: '科幻未来', 图标: 'ri-rocket-line', 颜色: '#06b6d4' },
  { 名称: '西方奇幻', 图标: 'ri-shield-star-line', 颜色: '#f97316' },
  { 名称: '末世废土', 图标: 'ri-skull-line', 颜色: '#ef4444' },
  { 名称: '历史架空', 图标: 'ri-ancient-pavilion-line', 颜色: '#eab308' },
  { 名称: '游戏世界', 图标: 'ri-gamepad-line', 颜色: '#ec4899' },
];

const 编辑面板标签页 = [
  { key: 'basic', 标题: '基础设定' },
  { key: 'geography', 标题: '地理环境' },
  { key: 'society', 标题: '社会结构' },
  { key: 'history', 标题: '历史事件' },
  { key: 'extra', 标题: '补充设定' },
];

export const WorldviewPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  const [折叠, set折叠] = useState<Record<string, boolean>>({
    basic: true,
    env: true,
    conflict: true,
    notes: true,
    calendar: true,
  });
  const [显示编辑面板, set显示编辑面板] = useState(false);
  const [编辑标签页, set编辑标签页] = useState('basic');
  const [字体大小, set字体大小] = useState<Record<string, number>>({});

  // Handler-related state
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Record<string, string>[]>([]);
  const [redoStack, setRedoStack] = useState<Record<string, string>[]>([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showGenHistory, setShowGenHistory] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [版本历史, set版本历史] = useState<VersionEntry[]>([]);
  const [当前版本索引, set当前版本索引] = useState<number>(-1);
  const [生成历史, set生成历史] = useState<GenEntry[]>([]);
  const {
    generating: aiGenerating,
    streamText: aiStreamText,
    parsedData: aiParsedData,
    generate: aiGenerate,
    abort: aiAbort,
    setStreamText: setAiStreamText,
  } = useAIGenerate<string>({ module: 'worldview', projectId });
  const [aiGeneratingField, setAiGeneratingField] = useState<string | null>(
    null
  );
  const abortCtrlRef = useRef<AbortController | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(520);
  const [resizing, setResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // World data — fetched from original API
  const [data, setData] = useState<Record<string, string>>({});
  const [dataLoading, setDataLoading] = useState(false);

  // Fetch worldview data from original API (/full endpoint)
  useEffect(() => {
    if (!projectId) return;
    setDataLoading(true);
    fetch(`${API_BASE}/api/worldviews/project/${projectId}/full`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data) {
          const E = result.data;
          // 1. World content
          if (E.世界观内容) {
            const F = E.世界观内容;
            const fields: Record<string, string> = {};
            for (const k of [
              '世界名称',
              '世界类型',
              '时代背景',
              '核心规则',
              '地理环境',
              '社会结构',
              '历史背景',
              '特殊元素',
              '主要冲突',
              '势力格局',
              '备注',
            ]) {
              if (typeof F[k] === 'string') fields[k] = F[k];
            }
            setData(fields);
          }
          // 2. Version history
          if (E.版本历史 && Array.isArray(E.版本历史)) {
            set版本历史(
              E.版本历史.map((F: any) => ({
                id: F.id,
                时间: new Date(F.时间).toLocaleString('zh-CN'),
                描述: F.描述,
                内容: F.内容,
              }))
            );
            set当前版本索引(E.版本历史.length - 1);
          }
          // 3. Generation history
          if (E.生成历史 && Array.isArray(E.生成历史)) {
            set生成历史(
              E.生成历史.map((F: any) => ({
                id: F.id,
                时间: new Date(F.时间).toLocaleString('zh-CN'),
                提示词: F.提示词,
                生成类型: F.生成类型,
                生成内容: F.生成内容,
                已采用: F.已采用,
              }))
            );
          }
        }
      })
      .catch(() => {
        // Vue: _e() — restore from localStorage
        try {
          const cached = localStorage.getItem('worldview_data');
          if (cached) {
            const te = JSON.parse(cached);
            if (te.世界观内容) setData(te.世界观内容);
            if (te.版本历史) set版本历史(te.版本历史);
            if (te.当前版本索引 != null) set当前版本索引(te.当前版本索引);
            if (te.生成历史) set生成历史(te.生成历史);
          }
        } catch {}
      })
      .finally(() => setDataLoading(false));
  }, [projectId]);

  // Fetch system prompt from rules API — append custom rules, never replace (Vue: z() base + Lu() append)
  const fetchSystemPrompt = useCallback(async (): Promise<string> => {
    let basePrompt = WORLDVIEW_SYSTEM_PROMPT;
    try {
      const res = await fetch(
        `${API_BASE}/api/rules/scene/${encodeURIComponent('AI生成世界观')}`,
        { headers: getAuthHeaders() }
      );
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        const rules =
          typeof d === 'string'
            ? d
            : d.systemPrompt || d.prompt || d.content || '';
        if (rules && rules !== basePrompt) {
          // Vue: append custom rules, don't replace
          basePrompt += '\n\n【用户自定义规则】\n' + rules;
        }
      }
    } catch {}
    return basePrompt;
  }, []);

  // Calendar state
  const [parsedCalendar, setParsedCalendar] = useState<CalendarData | null>(
    null
  );
  const [历法, set历法] = useState({
    名称: '天元纪年',
    纪年体系: [
      { 名称: '远古纪元', 描述: '三帝并立，大道昌盛' },
      { 名称: '末法纪元', 描述: '天道重组后至今' },
      { 名称: '', 描述: '' },
    ],
    故事起点: '末法-1327-3-15',
    每年月数: 12,
    每月天数: 30,
    每日时辰: 12,
    显示格式: '中式',
    重要年份: [
      { 年份: '远古-0', 事件: '三帝之战爆发' },
      { 年份: '末法-1', 事件: '神族降临，重组天道' },
      { 年份: '末法-1327', 事件: '故事开始，天道裂痕初现' },
    ],
    时长模板: [
      { 类型: '闭关修炼', 天数: 30 },
      { 类型: '宗门任务', 天数: 7 },
      { 类型: '秘境探索', 天数: 15 },
      { 类型: '境界突破', 天数: 3 },
      { 类型: '疗伤恢复', 天数: 5 },
      { 类型: '赶路旅行', 天数: 2 },
      { 类型: '大战', 天数: 1 },
      { 类型: '情报交易', 天数: 1 },
    ],
  });

  const update = (field: string, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const toggleSection = (key: string) => {
    set折叠(prev => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key],
    }));
  };

  const adjustFontSize = (field: string, delta: number) => {
    set字体大小(prev => ({
      ...prev,
      [field]: Math.max(12, Math.min(20, (prev[field] || 14) + delta)),
    }));
  };

  // Save worldview data — POST to real API + version snapshot
  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await saveData('worldview', projectId, { ...data });
      saveVersion('worldview', projectId, {
        描述: '保存世界观设定',
        内容: { ...data },
      }).catch(() => {});
      setLastSavedAt(new Date().toLocaleTimeString());
    } catch {
    } finally {
      setSaving(false);
    }
  }, [projectId, data]);

  // Save version snapshot
  const handleSaveVersion = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await saveData('worldview', projectId, { ...data });
      saveVersion('worldview', projectId, {
        描述: '手动保存版本',
        内容: { ...data },
      }).catch(() => {});
      setLastSavedAt(new Date().toLocaleTimeString());
    } catch {
    } finally {
      setSaving(false);
    }
  }, [projectId, data]);

  // Auto-save with 2s debounce (Vue: watch(t, B, { deep: true }))
  useEffect(() => {
    if (!projectId || Object.keys(data).length === 0) return;
    const timer = setTimeout(() => {
      saveData('worldview', projectId, { ...data })
        .then(() => {
          setLastSavedAt(new Date().toLocaleTimeString());
          // Cache to localStorage (Vue: K() function)
          try {
            localStorage.setItem(
              'worldview_data',
              JSON.stringify({
                世界观内容: data,
                版本历史,
                当前版本索引,
                生成历史,
              })
            );
          } catch {}
        })
        .catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [projectId, data, 版本历史, 当前版本索引, 生成历史]);

  // Undo
  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setData(current => {
        setRedoStack(r => [...r, current as unknown as Record<string, string>]);
        return last as unknown as typeof data;
      });
      return prev.slice(0, -1);
    });
  }, []);

  // Redo
  const handleRedo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setData(current => {
        setUndoStack(u => [...u, current as unknown as Record<string, string>]);
        return last as unknown as typeof data;
      });
      return prev.slice(0, -1);
    });
  }, []);

  // Push to undo stack before a data change
  const pushUndo = useCallback(() => {
    setData(current => {
      setUndoStack(u => [...u, current as unknown as Record<string, string>]);
      setRedoStack([]);
      return current;
    });
  }, []);

  // Helper: build existing-data string from current data, optionally excluding a field
  const buildExistingStr = useCallback(
    (excludeField?: string) => {
      return Object.entries(data)
        .filter(([k, v]) => v && k !== excludeField)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
    },
    [data]
  );

  // AI generate entire worldview (full mode)
  const [fullGenPhase, setFullGenPhase] = useState<
    'select' | 'streaming' | 'preview' | null
  >(null);
  const [fullGenType, setFullGenType] = useState(data.世界类型 || '仙侠世界');
  const [fullGenDesc, setFullGenDesc] = useState('');
  const [fullGenParsed, setFullGenParsed] = useState<Record<
    string,
    string
  > | null>(null);

  const handleAIGenerateWorldview = useCallback(() => {
    setFullGenType(data.世界类型 || '仙侠世界');
    setFullGenDesc('');
    setFullGenParsed(null);
    setAiStreamText('');
    setFullGenPhase('select');
  }, [data.世界类型]);

  const handleStartFullGen = useCallback(async () => {
    setFullGenPhase('streaming');
    abortCtrlRef.current?.abort();
    const ac = new AbortController();
    abortCtrlRef.current = ac;

    const systemPrompt = await fetchSystemPrompt();
    const userInput = `世界类型：${fullGenType}${fullGenDesc ? '\n\n' + fullGenDesc : ''}`;
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `请为我生成一个完整的世界观设定。\n\n用户需求：${userInput}\n\n创建一个有趣且独特的小说世界。`,
      },
    ];

    try {
      const fullText = await generateLLM({
        messages,
        max_tokens: 8192,
        onChunk: t => setAiStreamText(t),
        signal: ac.signal,
      });

      const parsed = parseWorldviewResponse(fullText);
      setFullGenParsed(parsed);
      setFullGenPhase('preview');
    } catch (err: any) {
      if (err.name !== 'AbortError')
        console.error('AI generation failed:', err);
      setFullGenPhase(null);
    }
  }, [fullGenType, fullGenDesc, fetchSystemPrompt]);

  // AI generate individual field (section mode) — button spins, result applied directly, no dialog
  const handleAIGenerateField = useCallback(
    async (field: string) => {
      setAiGeneratingField(field);
      abortCtrlRef.current?.abort();
      const ac = new AbortController();
      abortCtrlRef.current = ac;

      // Use JSON-focused prompt for field generation (100% success rate vs 80% with pipe prompt)
      const systemPrompt = WORLDVIEW_SYSTEM_PROMPT;
      const existing = buildExistingStr(field);
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: `基于以下已有世界观设定，请生成"${field}"部分的详细内容。\n\n已有设定：\n${existing || '暂无'}\n\n用户补充要求：请根据已有设定生成合适的内容\n\n只需要返回一个JSON对象，只包含"${field}"字段及其内容。`,
        },
      ];

      try {
        const result = await generateValidated({
          schema: worldviewFieldSchema(field),
          generate: attempt =>
            generateLLM({
              messages,
              temperature: Math.min(1.0, 0.85 + attempt * 0.05),
              max_tokens: 1024,
              onChunk: () => {}, // no streaming display for field generation
              signal: ac.signal,
            }),
          parseResponse: parseWorldviewResponse,
          maxRetries: 3,
        });

        if (result) {
          const content = result.data[field] || result.rawText;
          // Apply to form directly
          update(field, content);

          // Auto-save flow (matching original site)
          if (projectId) {
            // 1. saveGeneration and get id
            const genResult = await saveGeneration('worldview', projectId, {
              提示词: '',
              生成类型: 'section',
              生成内容: { [field]: content },
            });

            // 2. adoptGeneration — mark as adopted
            if (genResult?.success && genResult?.data?.id) {
              await adoptGeneration(
                'worldview',
                projectId,
                genResult.data.id
              ).catch(() => {});
            }

            // 3. saveVersion
            const merged = { ...data, [field]: content };
            saveVersion('worldview', projectId, {
              描述: `AI生成${field}`,
              内容: merged,
            }).catch(() => {});

            // 4. saveData (PUT)
            saveData('worldview', projectId, merged).catch(() => {});
          }
        }
        // If result is null (all retries failed), do nothing — leave field unchanged
      } catch (err: any) {
        if (err.name !== 'AbortError')
          console.error('AI generation failed:', err);
      } finally {
        setAiGeneratingField(null);
      }
    },
    [data, projectId, buildExistingStr]
  );

  // Adopt full generation result
  const handleAdoptFullGen = useCallback(async () => {
    if (!fullGenParsed) return;
    pushUndo();
    const genContent = fullGenParsed;
    const merged = { ...data, ...genContent };
    setData(merged);

    // Populate structured calendar state from CAL lines (using parseCalendarLines)
    if (genContent.世界历法) {
      const calText = genContent.世界历法 as string;
      const calLines = calText
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      const calData = parseCalendarLines(calLines);
      if (calData) {
        setParsedCalendar(calData);
        // Sync to calendar UI state
        set历法(prev => ({
          ...prev,
          名称: calData.历法名称 || prev.名称,
          故事起点: calData.故事起点日期 || prev.故事起点,
          每年月数: calData.每年月数 || prev.每年月数,
          每月天数: calData.每月天数 || prev.每月天数,
          每日时辰: calData.每日时辰数 || prev.每日时辰,
          显示格式: calData.显示格式 || prev.显示格式,
          纪年体系: calData.纪年体系.map(e => ({ 名称: e.名称, 描述: e.描述 })),
          时长模板: calData.时长模板.map(e => ({
            类型: e.类型,
            天数: e.默认天数,
          })),
        }));
      }
    }

    // Save flow (matching original site)
    if (projectId) {
      const genResult = await saveGeneration('worldview', projectId, {
        提示词: `世界类型：${fullGenType}${fullGenDesc ? '\n\n' + fullGenDesc : ''}`,
        生成类型: 'full',
        生成内容: genContent,
      });

      // adoptGeneration
      if (genResult?.success && genResult?.data?.id) {
        await adoptGeneration('worldviews', projectId, genResult.data.id).catch(
          () => {}
        );
      }

      saveVersion('worldview', projectId, {
        描述: 'AI生成世界观',
        内容: merged,
      }).catch(() => {});
      saveData('worldviews', projectId, merged).catch(() => {});
    }

    setFullGenPhase(null);
    setAiStreamText('');
    setFullGenParsed(null);
  }, [fullGenParsed, fullGenType, fullGenDesc, pushUndo, projectId, data]);

  // Dismiss AI dialog
  const handleDismissAI = useCallback(() => {
    abortCtrlRef.current?.abort();
    aiAbort();
    setAiStreamText('');
    setFullGenPhase(null);
    setFullGenParsed(null);
  }, []);

  // Resize handlers
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = sidebarWidth;

      const handleResizeMove = (ev: MouseEvent) => {
        const delta = ev.clientX - resizeStartX.current;
        setSidebarWidth(
          Math.max(360, Math.min(800, resizeStartWidth.current + delta))
        );
      };

      const handleResizeEnd = () => {
        setResizing(false);
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };

      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
    },
    [sidebarWidth]
  );

  if (显示编辑面板) {
    return createPortal(
      <EditDetailPanel
        data={data}
        update={update}
        字体大小={字体大小}
        adjustFontSize={adjustFontSize}
        activeTab={编辑标签页}
        setActiveTab={set编辑标签页}
        onClose={() => set显示编辑面板(false)}
        leftOffset={leftOffset}
        outerOnClose={onClose}
        onSave={handleSave}
        onAIGenerateField={handleAIGenerateField}
      />,
      document.body
    );
  }

  return createPortal(
    <>
      <div className="v-ecdc0f6c">
        {/* Outer container */}
        <div
          className="世界观侧边栏容器 fixed top-0 bottom-0 z-40 flex"
          style={{ left: leftOffset }}
        >
          {/* Backdrop */}
          <div className="fixed inset-0 z-[-1]" />

          {/* Content panel */}
          <aside
            className="世界观设定内容 bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col h-full shadow-2xl"
            style={{ width: sidebarWidth }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)]">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center rounded-lg w-9 h-9 bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                  <i className="text-lg text-purple-400 ri-global-line" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">世界观设定</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    构建你的世界
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Undo/Redo */}
                <div className="flex items-center gap-0.5 bg-[var(--bg-dark)] rounded p-0.5 mr-1">
                  <button
                    className={`p-1.5 rounded transition-colors text-xs ${undoStack.length > 0 ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-darker)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
                    disabled={undoStack.length === 0}
                    title="撤销"
                    onClick={handleUndo}
                  >
                    <i className="ri-arrow-go-back-line" />
                  </button>
                  <button
                    className={`p-1.5 rounded transition-colors text-xs ${redoStack.length > 0 ? 'text-[var(--text-secondary)] hover:bg-[var(--bg-darker)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
                    disabled={redoStack.length === 0}
                    title="重做"
                    onClick={handleRedo}
                  >
                    <i className="ri-arrow-go-forward-line" />
                  </button>
                </div>
                <button
                  className="p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs"
                  title="版本历史"
                  onClick={() => setShowVersionHistory(v => !v)}
                >
                  <i className="ri-history-line" />
                  <span className="ml-0.5">({版本历史.length})</span>
                </button>
                <button
                  className="p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs"
                  title="生成历史"
                  onClick={() => setShowGenHistory(v => !v)}
                >
                  <i className="ri-time-line" />
                  <span className="ml-0.5">({生成历史.length})</span>
                </button>
                <button
                  className={`p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors ${saving ? 'text-yellow-400 animate-pulse' : ''}`}
                  title="保存版本"
                  onClick={handleSaveVersion}
                >
                  <i
                    className={
                      saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'
                    }
                  />
                </button>
                <button
                  className={`p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors ${showPreview ? 'text-purple-400' : ''}`}
                  title="预览世界观内容"
                  onClick={() => setShowPreview(v => !v)}
                >
                  <i className="ri-eye-line" />
                </button>
                <button
                  className="p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-purple-400"
                  title="AI生成"
                  onClick={handleAIGenerateWorldview}
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
                {/* Close button */}
                <button
                  className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded transition-colors"
                  title="关闭"
                  onClick={onClose}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 p-4 overflow-y-auto">
                <div className="v-6182d768">
                  {/* 基础信息 */}
                  <CollapsibleSection
                    sectionKey="basic"
                    title="基础信息"
                    icon="ri-information-line"
                    iconColor="text-[var(--primary)]"
                    折叠={折叠}
                    toggleSection={toggleSection}
                  >
                    {/* 世界名称 */}
                    <div className="设置项 mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm text-[var(--text-secondary)]">
                          世界名称
                        </label>
                        <AIButton
                          onGenerate={() => handleAIGenerateField('世界名称')}
                          loading={aiGeneratingField === '世界名称'}
                        />
                      </div>
                      <input
                        type="text"
                        className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:border-[var(--primary)] transition-colors"
                        placeholder="如：九州大陆、星际联邦..."
                        value={data.世界名称 ?? ''}
                        onChange={e => update('世界名称', e.target.value)}
                      />
                    </div>

                    {/* 世界类型 */}
                    <div className="设置项 mb-4">
                      <label className="text-sm text-[var(--text-secondary)] mb-1.5 block">
                        世界类型
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {世界类型选项.map(opt => (
                          <button
                            key={opt.名称}
                            className={`flex flex-col items-center gap-1 p-2 rounded border cursor-pointer hover:border-[var(--primary)] transition-all text-sm ${
                              data.世界类型 === opt.名称
                                ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                                : 'border-[var(--border)]'
                            }`}
                            onClick={() => update('世界类型', opt.名称)}
                          >
                            <i
                              className={opt.图标}
                              style={{ color: opt.颜色 }}
                            />
                            <span>{opt.名称}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 时代背景 */}
                    <div className="设置项 mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm text-[var(--text-secondary)]">
                          时代背景
                        </label>
                        <AIButton
                          onGenerate={() => handleAIGenerateField('时代背景')}
                          loading={aiGeneratingField === '时代背景'}
                        />
                      </div>
                      <div className="relative">
                        <textarea
                          className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-3 py-2 text-sm min-h-[120px] max-h-[250px] overflow-y-auto resize-y focus:border-[var(--primary)] transition-colors pr-16"
                          placeholder="如：灵气复苏三千年后，人类文明进入新的纪元..."
                          value={data.时代背景 ?? ''}
                          onChange={e => update('时代背景', e.target.value)}
                          style={{ fontSize: 字体大小['时代背景'] || 14 }}
                        />
                        <FontSizeControls
                          field="时代背景"
                          onAdjust={adjustFontSize}
                        />
                      </div>
                    </div>

                    {/* 核心法则 */}
                    <div className="设置项">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm text-[var(--text-secondary)]">
                          核心法则
                        </label>
                        <AIButton
                          onGenerate={() => handleAIGenerateField('核心规则')}
                          loading={aiGeneratingField === '核心规则'}
                        />
                      </div>
                      <div className="relative">
                        <textarea
                          className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-3 py-2 text-sm min-h-[100px] max-h-[250px] overflow-y-auto resize-y focus:border-[var(--primary)] transition-colors pr-16"
                          placeholder="这个世界的基本运行法则..."
                          value={data.核心规则 ?? ''}
                          onChange={e => update('核心规则', e.target.value)}
                          style={{ fontSize: 字体大小['核心规则'] || 14 }}
                        />
                        <FontSizeControls
                          field="核心规则"
                          onAdjust={adjustFontSize}
                        />
                      </div>
                    </div>

                    {/* 特殊元素 */}
                    <div className="设置项 mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm text-[var(--text-secondary)]">
                          特殊元素
                        </label>
                        <AIButton
                          onGenerate={() => handleAIGenerateField('特殊元素')}
                          loading={aiGeneratingField === '特殊元素'}
                        />
                      </div>
                      <div className="relative">
                        <textarea
                          className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-3 py-2 text-sm min-h-[100px] max-h-[250px] overflow-y-auto resize-y focus:border-[var(--primary)] transition-colors pr-16"
                          placeholder="独特的世界元素..."
                          value={data.特殊元素 ?? ''}
                          onChange={e => update('特殊元素', e.target.value)}
                          style={{ fontSize: 字体大小['特殊元素'] || 14 }}
                        />
                        <FontSizeControls
                          field="特殊元素"
                          onAdjust={adjustFontSize}
                        />
                      </div>
                    </div>
                  </CollapsibleSection>

                  {/* 世界环境 */}
                  <CollapsibleSection
                    sectionKey="env"
                    title="世界环境"
                    icon="ri-earth-line"
                    iconColor="text-green-400"
                    折叠={折叠}
                    toggleSection={toggleSection}
                  >
                    <div className="space-y-3">
                      <TextareaWithAI
                        label="地理概述"
                        placeholder="主要地形、气候特征、重要地点..."
                        value={data.地理环境 ?? ''}
                        onChange={v => update('地理环境', v)}
                        minH={180}
                        maxH={350}
                        字体大小={字体大小}
                        adjustFontSize={adjustFontSize}
                        onAIGenerate={() => handleAIGenerateField('地理环境')}
                        aiLoading={aiGeneratingField === '地理环境'}
                      />
                      <TextareaWithAI
                        label="社会结构"
                        placeholder="社会阶层、势力组织、权力结构..."
                        value={data.社会结构 ?? ''}
                        onChange={v => update('社会结构', v)}
                        minH={160}
                        maxH={300}
                        字体大小={字体大小}
                        adjustFontSize={adjustFontSize}
                        onAIGenerate={() => handleAIGenerateField('社会结构')}
                        aiLoading={aiGeneratingField === '社会结构'}
                      />
                      <TextareaWithAI
                        label="历史背景"
                        placeholder="重要历史事件、传说故事..."
                        value={data.历史背景 ?? ''}
                        onChange={v => update('历史背景', v)}
                        minH={160}
                        maxH={300}
                        字体大小={字体大小}
                        adjustFontSize={adjustFontSize}
                        onAIGenerate={() => handleAIGenerateField('历史背景')}
                        aiLoading={aiGeneratingField === '历史背景'}
                      />
                    </div>
                  </CollapsibleSection>

                  {/* 主要冲突 */}
                  <CollapsibleSection
                    sectionKey="conflict"
                    title="主要冲突"
                    icon="ri-sword-line"
                    iconColor="text-red-400"
                    折叠={折叠}
                    toggleSection={toggleSection}
                  >
                    <div className="space-y-3">
                      <TextareaWithAI
                        label="主要冲突"
                        placeholder="世界的主要矛盾与冲突..."
                        value={data.主要冲突 ?? ''}
                        onChange={v => update('主要冲突', v)}
                        minH={140}
                        maxH={300}
                        字体大小={字体大小}
                        adjustFontSize={adjustFontSize}
                        onAIGenerate={() => handleAIGenerateField('主要冲突')}
                        aiLoading={aiGeneratingField === '主要冲突'}
                      />
                      <TextareaWithAI
                        label="势力格局"
                        placeholder="主要势力分布、相互关系..."
                        value={data.势力格局 ?? ''}
                        onChange={v => update('势力格局', v)}
                        minH={130}
                        maxH={300}
                        字体大小={字体大小}
                        adjustFontSize={adjustFontSize}
                        onAIGenerate={() => handleAIGenerateField('势力格局')}
                        aiLoading={aiGeneratingField === '势力格局'}
                      />
                    </div>
                  </CollapsibleSection>

                  {/* 补充备注 */}
                  <CollapsibleSection
                    sectionKey="notes"
                    title="补充备注"
                    icon="ri-file-text-line"
                    iconColor="text-yellow-400"
                    折叠={折叠}
                    toggleSection={toggleSection}
                  >
                    <div className="relative">
                      <textarea
                        className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-3 py-2 text-sm min-h-[150px] max-h-[300px] overflow-y-auto resize-y focus:border-[var(--primary)] transition-colors pr-16"
                        placeholder="其他需要记录的世界观设定..."
                        value={data.备注 ?? ''}
                        onChange={e => update('备注', e.target.value)}
                        style={{ fontSize: 字体大小['备注'] || 14 }}
                      />
                      <FontSizeControls
                        field="备注"
                        onAdjust={adjustFontSize}
                      />
                    </div>
                  </CollapsibleSection>

                  {/* 世界历法 */}
                  <CollapsibleSectionWithSubtitle
                    sectionKey="calendar"
                    title="世界历法"
                    subtitle="时间体系设定"
                    icon="ri-calendar-line"
                    iconColor="text-cyan-400"
                    折叠={折叠}
                    toggleSection={toggleSection}
                  >
                    <CalendarSection
                      历法={历法}
                      set历法={set历法}
                      onSave={handleSave}
                    />
                  </CollapsibleSectionWithSubtitle>

                  {/* Spacer for edit button */}
                  <div>{/* <!-- --> */}</div>
                </div>
              </div>
            </div>
          </aside>

          {/* Resize handle */}
          <div
            className={`w-1 cursor-col-resize hover:bg-[var(--primary)] transition-colors shrink-0 ${resizing ? 'bg-[var(--primary)]' : 'bg-transparent'} select-none`}
            title="拖拽调整宽度"
            onMouseDown={handleResizeStart}
          />
        </div>
      </div>

      {/* Version history overlay */}
      {showVersionHistory &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowVersionHistory(false)}
          >
            <div
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-[480px] max-h-[400px] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <i className="ri-history-line text-purple-400" /> 版本历史
                </h3>
                <button
                  className="p-1 hover:bg-[var(--bg-dark)] rounded"
                  onClick={() => setShowVersionHistory(false)}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="p-4 space-y-2 max-h-[300px] overflow-y-auto">
                {版本历史.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)] text-center py-4">
                    暂无版本历史
                  </p>
                )}
                {版本历史.map((ver, idx) => (
                  <div
                    key={ver.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-dark)] hover:bg-[var(--bg-darker)] cursor-pointer border border-[var(--border)]"
                  >
                    <div>
                      <p className="text-sm">{ver.描述 || `版本 ${idx + 1}`}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {ver.时间}
                      </p>
                    </div>
                    {idx === 当前版本索引 ? (
                      <span className="text-xs text-purple-400">当前</span>
                    ) : (
                      <button
                        className="text-xs text-[var(--text-secondary)] hover:text-purple-400"
                        onClick={() => {
                          if (ver.内容) {
                            pushUndo();
                            const fields: Record<string, string> = {};
                            for (const [k, v] of Object.entries(ver.内容)) {
                              if (typeof v === 'string') fields[k] = v;
                            }
                            setData(fields);
                            set当前版本索引(idx);
                            if (projectId) {
                              fetch(
                                `${API_BASE}/api/worldviews/project/${projectId}/versions/${ver.id}/rollback`,
                                {
                                  method: 'POST',
                                  headers: getAuthHeaders(),
                                }
                              ).catch(() => {});
                            }
                          }
                        }}
                      >
                        恢复
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Generation history overlay */}
      {showGenHistory &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowGenHistory(false)}
          >
            <div
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-[480px] max-h-[400px] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <i className="ri-time-line text-purple-400" /> 生成历史
                </h3>
                <button
                  className="p-1 hover:bg-[var(--bg-dark)] rounded"
                  onClick={() => setShowGenHistory(false)}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="p-4 space-y-2 max-h-[300px] overflow-y-auto">
                {生成历史.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)] text-center py-4">
                    暂无生成历史
                  </p>
                )}
                {生成历史.map(gen => (
                  <div
                    key={gen.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-dark)] border border-[var(--border)]"
                  >
                    <div>
                      <p className="text-sm">
                        {gen.生成类型 === 'full'
                          ? '全量生成'
                          : `字段生成: ${Object.keys(gen.生成内容 || {}).join(', ')}`}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {gen.时间}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {gen.已采用 && (
                        <span className="text-xs text-green-400">已采用</span>
                      )}
                      <button
                        className="text-xs text-[var(--text-secondary)] hover:text-purple-400"
                        onClick={async () => {
                          pushUndo();
                          const merged = { ...data };
                          Object.keys(gen.生成内容 || {}).forEach(k => {
                            if (k !== '_历法数据') merged[k] = gen.生成内容[k];
                          });
                          setData(merged);
                          if (projectId) {
                            await adoptGeneration(
                              'worldviews',
                              projectId,
                              gen.id
                            ).catch(() => {});
                            saveData('worldviews', projectId, merged).catch(
                              () => {}
                            );
                          }
                          set生成历史(prev =>
                            prev.map(g =>
                              g.id === gen.id ? { ...g, 已采用: true } : g
                            )
                          );
                          setShowGenHistory(false);
                        }}
                      >
                        {gen.已采用 ? '重新采用' : '采用'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Preview overlay */}
      {showPreview &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={() => setShowPreview(false)}
          >
            <div
              className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-[640px] max-h-[80vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <i className="ri-eye-line text-purple-400" /> 世界观预览
                </h3>
                <button
                  className="p-1 hover:bg-[var(--bg-dark)] rounded"
                  onClick={() => setShowPreview(false)}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto max-h-[calc(80vh-52px)] prose prose-sm prose-invert max-w-none">
                <h3>
                  {data.世界名称}{' '}
                  <span className="text-xs text-[var(--text-muted)] font-normal">
                    ({data.世界类型})
                  </span>
                </h3>
                <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                  {data.时代背景}
                </p>
                <h4 className="text-sm font-medium mt-3">核心规则</h4>
                <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                  {data.核心规则}
                </p>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* AI生成世界观 — full generation dialog */}
      {fullGenPhase &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={handleDismissAI}
          >
            <div
              className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-2xl w-full max-w-3xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-5 border-b border-[var(--border)] bg-gradient-to-r from-purple-500/10 to-pink-500/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 shadow-lg rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
                      <i className="text-2xl text-white ri-magic-line" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">AI生成世界观</h3>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {fullGenPhase === 'select'
                          ? '选择类型或描述你的构想，AI将为你构建完整的世界观'
                          : fullGenPhase === 'streaming'
                            ? '正在生成...'
                            : '生成完成，预览内容'}
                      </p>
                    </div>
                  </div>
                  <button
                    className="p-2 rounded-lg hover:bg-[var(--bg-dark)] transition-colors"
                    onClick={handleDismissAI}
                  >
                    <i className="text-xl ri-close-line" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-5 max-h-[70vh] overflow-y-auto">
                {fullGenPhase === 'select' && (
                  <>
                    {/* World type grid */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <i className="ri-global-line text-[var(--primary)]" />{' '}
                          选择世界类型
                        </label>
                        <span className="text-xs text-[var(--text-muted)]">
                          点击选择
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {世界类型选项.map(opt => (
                          <button
                            key={opt.名称}
                            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all group ${fullGenType === opt.名称 ? 'border-[var(--primary)] bg-[var(--primary)]/10 shadow-md' : 'border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--bg-dark)]'}`}
                            onClick={() => setFullGenType(opt.名称)}
                          >
                            <div
                              className="flex items-center justify-center w-10 h-10 transition-transform rounded-lg group-hover:scale-110"
                              style={{ backgroundColor: opt.颜色 + '20' }}
                            >
                              <i
                                className={`text-xl ${opt.图标}`}
                                style={{ color: opt.颜色 }}
                              />
                            </div>
                            <span className="text-xs font-medium">
                              {opt.名称}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick templates */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <i className="ri-bookmark-line text-[var(--secondary)]" />{' '}
                          快捷模板
                        </label>
                        <span className="text-xs text-[var(--text-muted)]">
                          一键应用预设构想
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {快捷模板.map(tpl => (
                          <button
                            key={tpl.label}
                            className="p-4 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-xl text-left transition-all group border border-transparent hover:border-[var(--primary)]/30"
                            onClick={() => {
                              setFullGenType(tpl.类型);
                              setFullGenDesc(tpl.prompt);
                            }}
                          >
                            <div className="flex items-center gap-3 mb-2">
                              <div
                                className="flex items-center justify-center w-8 h-8 rounded-lg"
                                style={{ backgroundColor: tpl.color + '20' }}
                              >
                                <i
                                  className={`text-lg ${tpl.icon}`}
                                  style={{ color: tpl.color }}
                                />
                              </div>
                              <span className="font-medium text-sm group-hover:text-[var(--primary)] transition-colors">
                                {tpl.label}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                              {tpl.prompt}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom description */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <i className="text-green-400 ri-edit-line" />{' '}
                          描述你的世界观构想
                        </label>
                        <span className="text-xs text-[var(--text-muted)]">
                          可选，补充详细需求
                        </span>
                      </div>
                      <textarea
                        className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm resize-none focus:border-[var(--primary)] transition-colors"
                        rows={4}
                        placeholder="例如：一个灵气复苏后的现代社会，普通人可以修炼成为强者..."
                        value={fullGenDesc}
                        onChange={e => setFullGenDesc(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {fullGenPhase === 'streaming' && (
                  <div className="流式内容区域">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
                          <i className="text-lg text-white ri-loader-4-line animate-spin" />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-[var(--primary)]">
                            世界观正在生成... ({aiStreamText.length} 字符)
                          </span>
                          <div className="text-xs text-[var(--text-muted)]">
                            已接收 {aiStreamText.length} 字符
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 bg-[var(--bg-dark)] rounded-full overflow-hidden">
                          <div
                            className="h-full transition-all duration-300 bg-gradient-to-r from-purple-500 to-pink-500"
                            style={{
                              width: `${Math.min(100, aiStreamText.length / 20)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="流式内容预览 min-h-[200px]">
                      <pre className="text-sm leading-relaxed whitespace-pre-wrap">
                        {aiStreamText}
                      </pre>
                    </div>
                  </div>
                )}

                {fullGenPhase === 'preview' && fullGenParsed && (
                  <div className="space-y-4">
                    {Object.entries(fullGenParsed).map(([key, value]) => (
                      <div key={key} className="mb-4 last:mb-0">
                        <h4 className="mb-2 text-sm font-medium text-purple-400">
                          {key}
                        </h4>
                        <p className="text-sm text-[var(--text-secondary)] bg-[var(--bg-dark)] rounded-lg p-3 whitespace-pre-wrap">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-[var(--border)] flex justify-between items-center bg-[var(--bg-darker)]">
                {fullGenPhase === 'select' && (
                  <>
                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                      <i className="text-green-400 ri-check-line" /> 已选择:{' '}
                      <span className="text-[var(--primary)] font-medium">
                        {fullGenType}
                      </span>
                    </span>
                    <div className="flex gap-3">
                      <button
                        className="px-5 py-2.5 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-xl transition-colors"
                        onClick={handleDismissAI}
                      >
                        关闭
                      </button>
                      <button
                        className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg hover:shadow-xl"
                        onClick={handleStartFullGen}
                      >
                        <i className="ri-sparkles-line" /> 开始生成
                      </button>
                    </div>
                  </>
                )}
                {fullGenPhase === 'streaming' && (
                  <div className="flex justify-end gap-3 w-full">
                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                      <i className="ri-loader-4-line animate-spin" />{' '}
                      生成中，请稍候...
                    </span>
                    <button
                      className="px-4 py-2.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors flex items-center gap-1"
                      onClick={handleDismissAI}
                    >
                      <i className="ri-stop-line" /> 取消生成
                    </button>
                  </div>
                )}
                {fullGenPhase === 'preview' && (
                  <div className="flex justify-end gap-3 w-full">
                    <button
                      className="px-4 py-2.5 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg transition-colors"
                      onClick={handleDismissAI}
                    >
                      关闭
                    </button>
                    <button
                      className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg"
                      onClick={handleAdoptFullGen}
                    >
                      <i className="ri-check-line" /> 采用此内容
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>,
    document.body
  );
};

/* ====================== Sub-components ====================== */

/** AI generate mini button */
function AIButton({
  onGenerate,
  loading,
}: {
  onGenerate?: () => void;
  loading?: boolean;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      className="AI生成小按钮"
      style={{
        background: hover ? '#a855f74d' : '#a855f733',
        color: 'rgb(192 132 252)',
        fontSize: '0.75rem',
        borderRadius: '0.25rem',
        padding: '0.25rem 0.5rem',
        border: 'none',
        cursor: loading ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.125rem',
        opacity: loading ? 0.7 : 1,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={loading ? undefined : onGenerate}
      disabled={loading}
    >
      <i
        className={loading ? 'ri-loader-4-line animate-spin' : 'ri-magic-line'}
      />{' '}
      {loading ? '生成中' : 'AI生成'}
    </button>
  );
}

/** Font size zoom in/out controls */
function FontSizeControls({
  field,
  onAdjust,
}: {
  field: string;
  onAdjust: (f: string, d: number) => void;
}) {
  return (
    <div className="absolute top-1 right-1 flex gap-0.5">
      <button
        className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
        title="增大字体"
        onClick={() => onAdjust(field, 1)}
      >
        <i className="text-xs ri-zoom-in-line" />
      </button>
      <button
        className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
        title="减小字体"
        onClick={() => onAdjust(field, -1)}
      >
        <i className="text-xs ri-zoom-out-line" />
      </button>
    </div>
  );
}

/** Collapsible section */
function CollapsibleSection({
  sectionKey,
  title,
  icon,
  iconColor,
  折叠,
  toggleSection,
  children,
}: {
  sectionKey: string;
  title: string;
  icon: string;
  iconColor: string;
  折叠: Record<string, boolean>;
  toggleSection: (key: string) => void;
  onAIGenerate?: () => void;
  children: React.ReactNode;
}) {
  const open = 折叠[sectionKey] !== false;
  return (
    <div className="bg-[var(--bg-card)] rounded-lg mb-4 overflow-hidden">
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-dark)]/50 transition-colors"
        onClick={() => toggleSection(sectionKey)}
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <i className={`${icon} ${iconColor}`} /> {title}
        </h3>
        <div className="flex items-center gap-2">
          <i
            className={`ri-arrow-${open ? 'up' : 'down'}-s-line text-[var(--text-muted)] transition-transform`}
          />
        </div>
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/** Collapsible section with subtitle */
function CollapsibleSectionWithSubtitle({
  sectionKey,
  title,
  subtitle,
  icon,
  iconColor,
  折叠,
  toggleSection,
  onAIGenerate,
  children,
}: {
  sectionKey: string;
  title: string;
  subtitle: string;
  icon: string;
  iconColor: string;
  折叠: Record<string, boolean>;
  toggleSection: (key: string) => void;
  onAIGenerate?: () => void;
  children: React.ReactNode;
}) {
  const open = 折叠[sectionKey] !== false;
  return (
    <div className="bg-[var(--bg-card)] rounded-lg mb-4 overflow-hidden">
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-dark)]/50 transition-colors"
        onClick={() => toggleSection(sectionKey)}
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <i className={`${icon} ${iconColor}`} /> {title}{' '}
          <span className="text-xs text-[var(--text-muted)] font-normal">
            {subtitle}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <i
            className={`ri-arrow-${open ? 'up' : 'down'}-s-line text-[var(--text-muted)] transition-transform`}
          />
        </div>
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/** Textarea with AI button and font controls */
function TextareaWithAI({
  label,
  placeholder,
  value,
  onChange,
  minH,
  maxH,
  字体大小,
  adjustFontSize,
  onAIGenerate,
  aiLoading,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  minH: number;
  maxH: number;
  字体大小: Record<string, number>;
  adjustFontSize: (field: string, delta: number) => void;
  onAIGenerate?: () => void;
  aiLoading?: boolean;
}) {
  return (
    <div className="设置项">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm text-[var(--text-secondary)] block">
          {label}
        </label>
        <AIButton onGenerate={onAIGenerate} loading={aiLoading} />
      </div>
      <div className="relative">
        <textarea
          className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-3 py-2 text-sm overflow-y-auto resize-y focus:border-[var(--primary)] transition-colors pr-16"
          style={{
            minHeight: `${minH}px`,
            maxHeight: `${maxH}px`,
            fontSize: 字体大小[label] || 14,
          }}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <FontSizeControls field={label} onAdjust={adjustFontSize} />
      </div>
    </div>
  );
}

/** Calendar section */
function CalendarSection({
  历法,
  set历法,
  onSave,
}: {
  历法: {
    名称: string;
    纪年体系: { 名称: string; 描述: string }[];
    故事起点: string;
    每年月数: number;
    每月天数: number;
    每日时辰: number;
    显示格式: string;
    重要年份: { 年份: string; 事件: string }[];
    时长模板: { 类型: string; 天数: number }[];
  };
  set历法: React.Dispatch<React.SetStateAction<typeof 历法>>;
  onSave?: () => void;
}) {
  const [calendarSaving, setCalendarSaving] = React.useState(false);

  const handleSaveCalendar = async () => {
    setCalendarSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      onSave?.();
    } finally {
      setCalendarSaving(false);
    }
  };
  const inputClass =
    'w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-3 py-1.5 text-sm focus:border-cyan-500/50 transition-colors';
  const smallInputClass =
    'flex-1 bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-cyan-500/50 transition-colors';
  const numberInputClass =
    'w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-center focus:border-cyan-500/50 transition-colors';

  const add纪年 = () => {
    set历法(prev => ({
      ...prev,
      纪年体系: [...prev.纪年体系, { 名称: '', 描述: '' }],
    }));
  };
  const remove纪年 = (idx: number) => {
    set历法(prev => ({
      ...prev,
      纪年体系: prev.纪年体系.filter((_, i) => i !== idx),
    }));
  };
  const update纪年 = (idx: number, field: '名称' | '描述', value: string) => {
    set历法(prev => ({
      ...prev,
      纪年体系: prev.纪年体系.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      ),
    }));
  };

  const add重要年份 = () => {
    set历法(prev => ({
      ...prev,
      重要年份: [...prev.重要年份, { 年份: '', 事件: '' }],
    }));
  };
  const remove重要年份 = (idx: number) => {
    set历法(prev => ({
      ...prev,
      重要年份: prev.重要年份.filter((_, i) => i !== idx),
    }));
  };
  const update重要年份 = (
    idx: number,
    field: '年份' | '事件',
    value: string
  ) => {
    set历法(prev => ({
      ...prev,
      重要年份: prev.重要年份.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      ),
    }));
  };

  const add时长模板 = () => {
    set历法(prev => ({
      ...prev,
      时长模板: [...prev.时长模板, { 类型: '', 天数: 1 }],
    }));
  };
  const remove时长模板 = (idx: number) => {
    set历法(prev => ({
      ...prev,
      时长模板: prev.时长模板.filter((_, i) => i !== idx),
    }));
  };
  const update时长模板 = (
    idx: number,
    field: '类型' | '天数',
    value: string | number
  ) => {
    set历法(prev => ({
      ...prev,
      时长模板: prev.时长模板.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      ),
    }));
  };

  return (
    <div className="space-y-3">
      {/* 历法名称 */}
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          历法名称
        </label>
        <input
          type="text"
          className={inputClass}
          placeholder="如：天元历、星历、皇历..."
          value={历法.名称}
          onChange={e => set历法(prev => ({ ...prev, 名称: e.target.value }))}
        />
      </div>

      {/* 纪年体系 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-[var(--text-secondary)]">
            纪年体系
          </label>
          <button
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
            onClick={add纪年}
          >
            <i className="ri-add-line" />
            添加
          </button>
        </div>
        <div className="space-y-1.5">
          {历法.纪年体系.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--text-muted)] w-5 shrink-0">
                {idx + 1}
              </span>
              <input
                type="text"
                className={smallInputClass}
                placeholder="纪年名称"
                value={item.名称}
                onChange={e => update纪年(idx, '名称', e.target.value)}
              />
              <input
                type="text"
                className={smallInputClass}
                placeholder="描述（可选）"
                value={item.描述}
                onChange={e => update纪年(idx, '描述', e.target.value)}
              />
              <button
                className="text-red-400 hover:text-red-300 p-0.5"
                onClick={() => remove纪年(idx)}
              >
                <i className="text-sm ri-close-line" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 故事起点日期 */}
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          故事起点日期
        </label>
        <input
          type="text"
          className={inputClass}
          placeholder="格式：纪年名-年-月-日，如 天元-3-3-8"
          value={历法.故事起点}
          onChange={e =>
            set历法(prev => ({ ...prev, 故事起点: e.target.value }))
          }
        />
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
          格式示例：末法-1327-3-15 表示末法纪元一千三百二十七年三月十五
        </p>
      </div>

      {/* 时间参数 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            每年月数
          </label>
          <input
            type="number"
            className={numberInputClass}
            min={1}
            max={99}
            value={历法.每年月数}
            onChange={e =>
              set历法(prev => ({ ...prev, 每年月数: Number(e.target.value) }))
            }
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            每月天数
          </label>
          <input
            type="number"
            className={numberInputClass}
            min={1}
            max={99}
            value={历法.每月天数}
            onChange={e =>
              set历法(prev => ({ ...prev, 每月天数: Number(e.target.value) }))
            }
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            每日时辰
          </label>
          <input
            type="number"
            className={numberInputClass}
            min={1}
            max={24}
            value={历法.每日时辰}
            onChange={e =>
              set历法(prev => ({ ...prev, 每日时辰: Number(e.target.value) }))
            }
          />
        </div>
      </div>

      {/* 显示格式 */}
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          显示格式
        </label>
        <div className="flex gap-2">
          <button
            className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
              历法.显示格式 === '中式'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                : 'bg-[var(--bg-dark)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-cyan-500/30'
            }`}
            onClick={() => set历法(prev => ({ ...prev, 显示格式: '中式' }))}
          >
            中式（末法一千三百二十七年三月十五）
          </button>
          <button
            className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
              历法.显示格式 === '西式'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                : 'bg-[var(--bg-dark)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-cyan-500/30'
            }`}
            onClick={() => set历法(prev => ({ ...prev, 显示格式: '西式' }))}
          >
            西式（末法1327年3月15日）
          </button>
        </div>
      </div>

      {/* 重要年份标记 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-[var(--text-secondary)]">
            重要年份标记
          </label>
          <button
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
            onClick={add重要年份}
          >
            <i className="ri-add-line" />
            添加
          </button>
        </div>
        <div className="space-y-1.5">
          {历法.重要年份.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="text-xs text-cyan-400 w-2 shrink-0">
                <i className="ri-bookmark-line" />
              </span>
              <input
                type="text"
                className="w-32 bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-cyan-500/50 transition-colors"
                placeholder="年份"
                value={item.年份}
                onChange={e => update重要年份(idx, '年份', e.target.value)}
              />
              <input
                type="text"
                className="flex-1 bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-cyan-500/50 transition-colors"
                placeholder="事件描述"
                value={item.事件}
                onChange={e => update重要年份(idx, '事件', e.target.value)}
              />
              <button
                className="text-red-400 hover:text-red-300 p-0.5"
                onClick={() => remove重要年份(idx)}
              >
                <i className="text-sm ri-close-line" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 时长模板 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-[var(--text-secondary)]">
            时长模板
          </label>
          <button
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
            onClick={add时长模板}
          >
            <i className="ri-add-line" />
            添加
          </button>
        </div>
        <div className="space-y-1.5">
          {历法.时长模板.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <input
                type="text"
                className={smallInputClass}
                placeholder="事件类型"
                value={item.类型}
                onChange={e => update时长模板(idx, '类型', e.target.value)}
              />
              <input
                type="number"
                className="w-16 bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1 text-xs text-center focus:border-cyan-500/50 transition-colors"
                placeholder="天数"
                min={1}
                value={item.天数}
                onChange={e =>
                  update时长模板(idx, '天数', Number(e.target.value))
                }
              />
              <span className="text-xs text-[var(--text-muted)]">天</span>
              <button
                className="text-red-400 hover:text-red-300 p-0.5"
                onClick={() => remove时长模板(idx)}
              >
                <i className="text-sm ri-close-line" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
        <span className="text-xs text-[var(--text-muted)]">
          修改后请点击保存
        </span>
        <button
          className={`px-4 py-1.5 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 rounded text-xs font-medium transition-colors flex items-center gap-1 ${calendarSaving ? 'opacity-70' : ''}`}
          onClick={handleSaveCalendar}
          disabled={calendarSaving}
        >
          <i
            className={
              calendarSaving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'
            }
          />{' '}
          {calendarSaving ? '保存中...' : '保存历法'}
        </button>
      </div>
    </div>
  );
}

/** Sliding edit detail panel with tabs */
function EditDetailPanel({
  data,
  update,
  字体大小,
  adjustFontSize,
  activeTab,
  setActiveTab,
  onClose,
  leftOffset,
  outerOnClose,
  onSave,
  onAIGenerateField,
}: {
  data: Record<string, string>;
  update: (field: string, value: string) => void;
  字体大小: Record<string, number>;
  adjustFontSize: (field: string, delta: number) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onClose: () => void;
  leftOffset: number;
  outerOnClose: () => void;
  onSave?: () => void;
  onAIGenerateField?: (field: string) => void;
}) {
  const [editSaving, setEditSaving] = React.useState(false);

  const handleEditSave = async () => {
    setEditSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      onSave?.();
    } finally {
      setEditSaving(false);
    }
  };
  return createPortal(
    <div className="v-ecdc0f6c">
      <div
        className="世界观侧边栏容器 fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <aside
          className="世界观设定内容 bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col h-full shadow-2xl"
          style={{ width: 720 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)]">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-lg w-9 h-9 bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                <i className="text-lg text-purple-400 ri-global-line" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">
                  {data.世界名称 || '世界观'} - 编辑模式
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  详细编辑世界观设定
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                className={`p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs ${editSaving ? 'text-yellow-400 animate-pulse' : ''}`}
                title="保存"
                onClick={handleEditSave}
                disabled={editSaving}
              >
                <i
                  className={
                    editSaving
                      ? 'ri-loader-4-line animate-spin'
                      : 'ri-save-line'
                  }
                />
              </button>
              <button
                className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded transition-colors"
                title="关闭编辑"
                onClick={onClose}
              >
                <i className="ri-close-line" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--border)] bg-[var(--bg-card)] shrink-0">
            {编辑面板标签页.map(tab => (
              <button
                key={tab.key}
                className={`flex-1 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-purple-400'
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.标题}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 p-5 overflow-y-auto">
            <div className="space-y-5">
              {activeTab === 'basic' && (
                <EditCard
                  title="世界基本信息"
                  icon="ri-information-line"
                  iconColor="text-purple-400"
                >
                  <EditField
                    label="世界名称"
                    field="世界名称"
                    data={data}
                    update={update}
                    字体大小={字体大小}
                    adjustFontSize={adjustFontSize}
                    type="input"
                    onAIGenerate={() => onAIGenerateField?.('世界名称')}
                  />
                  <div>
                    <label className="text-sm text-[var(--text-secondary)] block mb-1.5">
                      世界类型
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {世界类型选项.map(opt => (
                        <button
                          key={opt.名称}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
                            data.世界类型 === opt.名称
                              ? 'border-purple-500 bg-purple-500/20 text-purple-400'
                              : 'border-[var(--border)] bg-[var(--bg-dark)] text-[var(--text-secondary)] hover:border-purple-500/50'
                          }`}
                          onClick={() => update('世界类型', opt.名称)}
                        >
                          <i
                            className={`text-lg ${opt.图标}`}
                            style={{ color: opt.颜色 }}
                          />
                          <span className="text-xs">{opt.名称}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <EditField
                    label="时代背景"
                    field="时代背景"
                    data={data}
                    update={update}
                    字体大小={字体大小}
                    adjustFontSize={adjustFontSize}
                    rows={5}
                    onAIGenerate={() => onAIGenerateField?.('时代背景')}
                  />
                  <EditField
                    label="核心法则"
                    field="核心规则"
                    data={data}
                    update={update}
                    字体大小={字体大小}
                    adjustFontSize={adjustFontSize}
                    rows={4}
                    onAIGenerate={() => onAIGenerateField?.('核心规则')}
                  />
                  <EditField
                    label="特殊元素"
                    field="特殊元素"
                    data={data}
                    update={update}
                    字体大小={字体大小}
                    adjustFontSize={adjustFontSize}
                    rows={4}
                    onAIGenerate={() => onAIGenerateField?.('特殊元素')}
                  />
                </EditCard>
              )}

              {activeTab === 'geography' && (
                <EditCard
                  title="地理环境"
                  icon="ri-earth-line"
                  iconColor="text-green-400"
                >
                  <EditField
                    label="地理概述"
                    field="地理环境"
                    data={data}
                    update={update}
                    字体大小={字体大小}
                    adjustFontSize={adjustFontSize}
                    rows={6}
                    onAIGenerate={() => onAIGenerateField?.('地理环境')}
                  />
                  <EditField
                    label="特殊地点"
                    field="特殊元素"
                    data={data}
                    update={update}
                    字体大小={字体大小}
                    adjustFontSize={adjustFontSize}
                    rows={4}
                    onAIGenerate={() => onAIGenerateField?.('特殊元素')}
                  />
                </EditCard>
              )}

              {activeTab === 'society' && (
                <EditCard
                  title="社会结构"
                  icon="ri-team-line"
                  iconColor="text-blue-400"
                >
                  <EditField
                    label="社会阶层"
                    field="社会结构"
                    data={data}
                    update={update}
                    字体大小={字体大小}
                    adjustFontSize={adjustFontSize}
                    rows={6}
                    onAIGenerate={() => onAIGenerateField?.('社会结构')}
                  />
                  <EditField
                    label="势力格局"
                    field="势力格局"
                    data={data}
                    update={update}
                    字体大小={字体大小}
                    adjustFontSize={adjustFontSize}
                    rows={5}
                    onAIGenerate={() => onAIGenerateField?.('势力格局')}
                  />
                </EditCard>
              )}

              {activeTab === 'history' && (
                <EditCard
                  title="历史事件"
                  icon="ri-history-line"
                  iconColor="text-yellow-400"
                >
                  <EditField
                    label="历史背景"
                    field="历史背景"
                    data={data}
                    update={update}
                    字体大小={字体大小}
                    adjustFontSize={adjustFontSize}
                    rows={8}
                    onAIGenerate={() => onAIGenerateField?.('历史背景')}
                  />
                  <EditField
                    label="主要冲突"
                    field="主要冲突"
                    data={data}
                    update={update}
                    字体大小={字体大小}
                    adjustFontSize={adjustFontSize}
                    rows={5}
                    onAIGenerate={() => onAIGenerateField?.('主要冲突')}
                  />
                </EditCard>
              )}

              {activeTab === 'extra' && (
                <EditCard
                  title="补充设定"
                  icon="ri-settings-3-line"
                  iconColor="text-gray-400"
                >
                  <EditField
                    label="备注"
                    field="备注"
                    data={data}
                    update={update}
                    字体大小={字体大小}
                    adjustFontSize={adjustFontSize}
                    rows={8}
                    onAIGenerate={() => onAIGenerateField?.('备注')}
                  />
                </EditCard>
              )}
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-2 pt-3 shrink-0 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-card)]">
            <button
              className="px-4 py-2 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg hover:bg-[var(--bg-card)] transition-colors"
              onClick={onClose}
            >
              返回概览
            </button>
            <button
              className={`px-6 py-2 text-sm text-white transition-colors rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 ${editSaving ? 'opacity-70' : ''}`}
              onClick={handleEditSave}
              disabled={editSaving}
            >
              <i
                className={`mr-1 ${editSaving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'}`}
              />{' '}
              {editSaving ? '保存中...' : '保存修改'}
            </button>
          </div>
        </aside>

        {/* Resize handle */}
        <div
          className="w-1 cursor-col-resize hover:bg-[var(--primary)] transition-colors shrink-0 bg-transparent"
          title="拖拽调整宽度"
        />
      </div>
    </div>,
    document.body
  );
}

/** Card wrapper for edit panel sections */
function EditCard({
  title,
  icon,
  iconColor,
  children,
}: {
  title: string;
  icon: string;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-5">
      <h3 className="flex items-center gap-2 mb-4 text-sm font-medium">
        <i className={`${icon} ${iconColor}`} /> {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** Single edit field with label, AI button, font controls */
function EditField({
  label,
  field,
  data,
  update,
  字体大小,
  adjustFontSize,
  type = 'textarea',
  rows = 4,
  onAIGenerate,
}: {
  label: string;
  field: string;
  data: Record<string, string>;
  update: (field: string, value: string) => void;
  字体大小: Record<string, number>;
  adjustFontSize: (field: string, delta: number) => void;
  type?: 'input' | 'textarea';
  rows?: number;
  onAIGenerate?: () => void;
}) {
  const commonClass =
    'w-full px-4 py-3 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-purple-500/50 resize-none';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm text-[var(--text-secondary)]">{label}</label>
        <div className="flex items-center gap-1">
          {type === 'textarea' && (
            <div className="flex gap-0.5">
              <button
                className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
                title="增大字体"
                onClick={() => adjustFontSize(field, 1)}
              >
                <i className="text-xs ri-zoom-in-line" />
              </button>
              <button
                className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
                title="减小字体"
                onClick={() => adjustFontSize(field, -1)}
              >
                <i className="text-xs ri-zoom-out-line" />
              </button>
            </div>
          )}
          <button
            className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
            onClick={onAIGenerate}
          >
            <i className="ri-magic-line" /> AI生成
          </button>
        </div>
      </div>
      {type === 'input' ? (
        <input
          type="text"
          className="w-full h-10 px-4 text-sm bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-purple-500/50"
          placeholder={`输入${label}`}
          value={data[field] || ''}
          onChange={e => update(field, e.target.value)}
        />
      ) : (
        <textarea
          rows={rows}
          className={commonClass}
          placeholder={`描述${label}...`}
          value={data[field] || ''}
          onChange={e => update(field, e.target.value)}
          style={{ fontSize: 字体大小[field] || 14 }}
        />
      )}
    </div>
  );
}

export default WorldviewPanel;
