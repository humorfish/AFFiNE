import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import { useWorldApi, saveVersion } from '../useWorldApi';
import {
  useAIGenerate,
  parseAIJSON,
  useAIFieldGenerate,
  useAIFullGenerate,
  AIGenerationDialog,
  useSystemPrompt,
  AIButton,
  TypeOption,
  QuickTemplate,
  generateValidated,
} from './panel-shared';
import {
  saveGeneration,
  saveData,
  API_BASE,
  getAuthHeaders,
} from '../useWorldApi';

// ── Types ──────────────────────────────────────────────────────────

interface 卷数据 {
  id: number;
  序号: number;
  标题: string;
  章节范围: string;
  起始章: number;
  结束章: number;
  标签?: string;
}

interface 章节关联 {
  章节序号: number;
  章节标题: string;
  要点: string;
}

interface 要素数据 {
  内容: string;
  章节关联: 章节关联[];
}

interface 事件数据 {
  id: number;
  序号: number;
  名称: string;
  卷id: number;
  欲望: 要素数据;
  阻碍: 要素数据;
  行动: 要素数据;
  结果: 要素数据;
  意外: 要素数据;
  转折: 要素数据;
  结局: 要素数据;
  涉及支线?: string;
  暗线伏笔?: string;
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

/* ─── Pipe-format prompt & parser for sidestories ─── */

/** Parse pipe-delimited format like: 支线概述|xxx\n关键转折|xxx\n主线关联|xxx */
function parseSidestoryPipe(text: string): Record<string, string> | null {
  const lines = text.split('\n').filter(l => l.trim());
  const result: Record<string, string> = {};
  const fieldMap: Record<string, string> = {
    支线概述: '支线概述',
    关键转折: '关键转折',
    主线关联: '主线关联',
  };
  for (const line of lines) {
    const t = line.trim();
    const pipeIdx = t.indexOf('|');
    if (pipeIdx > 0) {
      const key = t.substring(0, pipeIdx).trim();
      const val = t.substring(pipeIdx + 1).trim();
      if (fieldMap[key] && val) {
        result[fieldMap[key]] = val;
      }
    }
  }
  return result.支线概述 || result.关键转折 || result.主线关联 ? result : null;
}

/** Combined parser: pipe first, then JSON fallback */
function parseSidestoryResponse(text: string): Record<string, string> | null {
  if (!text) return null;
  const pipe = parseSidestoryPipe(text.trim());
  if (pipe && (pipe.支线概述 || pipe.关键转折 || pipe.主线关联)) return pipe;
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

/** Build system prompt for event-flow generation (七要素 pipe format) */
function buildEventFlowSystemPrompt(): string {
  return `你是一个专业的小说创作助手。请根据给定的信息生成支线故事事件流。

输出格式要求（严格按此格式）：
每个事件用 === 分隔，事件内每行格式为：
名称|事件名称
序号|数字
卷id|数字
欲望|描述
阻碍|描述
行动|描述
结果|描述
意外|描述
转折|描述
结局|描述

不要输出JSON，不要输出markdown代码块标记。`;
}

/** Parse pipe-delimited event-flow format (events separated by ===) */
function parseEventFlowPipe(text: string): Array<Partial<事件数据>> | null {
  const blocks = text
    .split(/===+/)
    .map(b => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return null;
  const events: Array<Partial<事件数据>> = [];
  const fieldMap: Record<string, string> = {
    名称: '名称',
    序号: '序号',
    卷id: '卷id',
    欲望: '欲望',
    阻碍: '阻碍',
    行动: '行动',
    结果: '结果',
    意外: '意外',
    转折: '转折',
    结局: '结局',
    涉及支线: '涉及支线',
    暗线伏笔: '暗线伏笔',
  };
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim());
    const evt: Record<string, any> = {};
    for (const line of lines) {
      const pipeIdx = line.indexOf('|');
      if (pipeIdx > 0) {
        const key = line.substring(0, pipeIdx).trim();
        const val = line.substring(pipeIdx + 1).trim();
        const mapped = fieldMap[key];
        if (mapped && val) {
          evt[mapped] = val;
        }
      }
    }
    if (evt['名称'] || evt['序号']) {
      // Convert numeric fields
      if (evt['序号']) evt['序号'] = Number(evt['序号']) || 0;
      if (evt['卷id']) evt['卷id'] = Number(evt['卷id']) || 0;
      // Wrap 七要素 into {内容, 章节关联: []}
      for (const k of [
        '欲望',
        '阻碍',
        '行动',
        '结果',
        '意外',
        '转折',
        '结局',
      ]) {
        if (typeof evt[k] === 'string') {
          evt[k] = { 内容: evt[k], 章节关联: [] };
        }
      }
      events.push(evt as Partial<事件数据>);
    }
  }
  return events.length > 0 ? events : null;
}

/** Combined parser for event flow: pipe first, then JSON fallback */
function parseEventFlowResponse(text: string): Array<Partial<事件数据>> | null {
  if (!text) return null;
  const pipeResult = parseEventFlowPipe(text.trim());
  if (pipeResult && pipeResult.length > 0) return pipeResult;
  // JSON fallback
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  const codeMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeMatch)
    try {
      const parsed = JSON.parse(codeMatch[1]);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  const bracketMatch = text.match(/\[[\s\S]*\]/);
  if (bracketMatch)
    try {
      const parsed = JSON.parse(bracketMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  return null;
}

/** Build system prompt for chapter-association recommendation */
function buildChapterAssocSystemPrompt(): string {
  return `你是一个专业的小说创作助手。请为事件要素智能推荐关联章节。

输出格式要求（严格按此格式）：
每个关联推荐用 --- 分隔，推荐内容格式：
章节序号|数字
章节标题|标题文字
要点|关联要点描述

不要输出JSON，不要输出markdown代码块标记。`;
}

/** Parse pipe-delimited chapter association format */
function parseChapterAssocPipe(
  text: string
): Array<{ 章节序号: number; 章节标题: string; 要点: string }> | null {
  const blocks = text
    .split(/---+/)
    .map(b => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return null;
  const results: Array<{ 章节序号: number; 章节标题: string; 要点: string }> =
    [];
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim());
    let 章节序号 = 0,
      章节标题 = '',
      要点 = '';
    for (const line of lines) {
      const pipeIdx = line.indexOf('|');
      if (pipeIdx > 0) {
        const key = line.substring(0, pipeIdx).trim();
        const val = line.substring(pipeIdx + 1).trim();
        if (key === '章节序号') 章节序号 = Number(val) || 0;
        else if (key === '章节标题') 章节标题 = val;
        else if (key === '要点') 要点 = val;
      }
    }
    if (章节标题 || 要点) {
      results.push({ 章节序号, 章节标题, 要点 });
    }
  }
  return results.length > 0 ? results : null;
}

/** Combined parser for chapter association: pipe first, then JSON fallback */
function parseChapterAssocResponse(
  text: string
): Array<{ 章节序号: number; 章节标题: string; 要点: string }> | null {
  if (!text) return null;
  const pipeResult = parseChapterAssocPipe(text.trim());
  if (pipeResult && pipeResult.length > 0) return pipeResult;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  const codeMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeMatch)
    try {
      const parsed = JSON.parse(codeMatch[1]);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  const bracketMatch = text.match(/\[[\s\S]*\]/);
  if (bracketMatch)
    try {
      const parsed = JSON.parse(bracketMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  return null;
}

/* ─── AI Generation Config ─── */

const sidestoriesTypeOptions: TypeOption[] = [
  { 名称: '人物外传', 图标: 'ri-user-heart-line', 颜色: '#ec4899' },
  { 名称: '前传故事', 图标: 'ri-rewind-line', 颜色: '#8b5cf6' },
  { 名称: '平行世界', 图标: 'ri-portal-line', 颜色: '#3b82f6' },
  { 名称: '番外篇', 图标: 'ri-gift-line', 颜色: '#f59e0b' },
  { 名称: '隐藏剧情', 图标: 'ri-key-2-line', 颜色: '#22c55e' },
];

const sidestoriesQuickTemplates: QuickTemplate[] = [
  {
    label: '反派起源',
    icon: 'ri-user-heart-line',
    color: '#ec4899',
    type: '人物外传',
    prompt: '生成主要反派的起源故事，展示他从善良到堕落的转变过程',
  },
  {
    label: '世界前史',
    icon: 'ri-rewind-line',
    color: '#8b5cf6',
    type: '前传故事',
    prompt: '生成世界建立之初的故事，解释当前世界格局形成的历史原因',
  },
  {
    label: '隐藏真相',
    icon: 'ri-key-2-line',
    color: '#22c55e',
    type: '隐藏剧情',
    prompt: '生成隐藏在主线背后的秘密剧情，揭示不为人知的真相和阴谋',
  },
];

const SIDESTORIES_SYSTEM_PROMPT = `你是一个专业的小说支线故事设计师。请根据用户要求生成详细的支线故事设计。
输出格式要求：返回JSON对象，包含以下字段（每个字段为描述文本）：
- 支线概述：支线故事的核心内容和主题（200字以上）
- 关键转折：支线中的关键转折点和冲突（200字以上）
- 主线关联：与主线故事的关联和影响（200字以上）

示例：
{"支线概述":"反派柳无邪原为正道天骄，因遭师妹陷害被逐出宗门，在绝境中偶得上古魔功残卷，逐步堕入魔道。他暗中建立暗影阁势力，表面依附世家，实则积蓄力量图谋复仇。其内心仍保留一丝善念，在关键时刻对主角网开一面，暗示未来可能的救赎转折。","关键转折":"第一次转折：柳无邪发现师妹陷害真相并非出于本意，背后另有主使，动摇了他的复仇信念。第二次转折：在追杀主角时意外得知主角也身负相同血脉诅咒，二人命运交织，开始从敌对转向微妙的合作。第三次转折：暗影阁内部叛变，柳无邪被迫在复仇与守护之间做出抉择，最终选择牺牲自我封印上古魔物。","主线关联":"柳无邪的暗影阁为主角提供了关键情报，帮助主角识破世家的阴谋。柳无邪封印魔物的举动直接影响了主线中天道修复的进程，为最终决战创造了条件。其身世的揭露也补全了世界观中关于血脉诅咒的设定。"}`;

// ── Zod schemas for AI generation ──────────────────────────────────────

const sidestorySchema = z.record(z.string());
const chapterAssocSchema = z.array(
  z.object({ 章节序号: z.number(), 章节标题: z.string(), 要点: z.string() })
);
const eventFlowSchema = z.array(
  z
    .object({
      名称: z.string().optional(),
      序号: z.union([z.string(), z.number()]).optional(),
    })
    .passthrough()
);

// ── Constants ──────────────────────────────────────────────────────

const 七要素配置: {
  key: keyof Pick<
    事件数据,
    '欲望' | '阻碍' | '行动' | '结果' | '意外' | '转折' | '结局'
  >;
  label: string;
  icon: string;
  color: string;
  placeholder: string;
}[] = [
  {
    key: '欲望',
    label: '欲望',
    icon: 'ri-heart-line',
    color: '#f43f5e',
    placeholder: '角色的核心欲望/动机',
  },
  {
    key: '阻碍',
    label: '阻碍',
    icon: 'ri-shield-line',
    color: '#f59e0b',
    placeholder: '面临的阻碍和冲突',
  },
  {
    key: '行动',
    label: '行动',
    icon: 'ri-sword-line',
    color: '#3b82f6',
    placeholder: '角色采取的行动',
  },
  {
    key: '结果',
    label: '结果',
    icon: 'ri-flag-line',
    color: '#22c55e',
    placeholder: '行动产生的结果',
  },
  {
    key: '意外',
    label: '意外',
    icon: 'ri-alarm-warning-line',
    color: '#a855f7',
    placeholder: '意外事件/突变',
  },
  {
    key: '转折',
    label: '转折',
    icon: 'ri-corner-down-right-line',
    color: '#ec4899',
    placeholder: '故事转折点',
  },
  {
    key: '结局',
    label: '结局',
    icon: 'ri-bookmark-line',
    color: '#06b6d4',
    placeholder: '事件最终结局',
  },
];

// ── Sub-components ─────────────────────────────────────────────────

/** Single element card with textarea and AI buttons */
const 要素卡片: React.FC<{
  配置: (typeof 七要素配置)[number];
  数据: 要素数据;
  章节范围: string;
  展开关联: boolean;
  on切换关联: () => void;
  onChange: (v: string) => void;
  on关联变更: (idx: number, field: string, val: string) => void;
  on添加关联: () => void;
  on删除关联: (idx: number) => void;
  onAI完善: () => void;
  onAI关联: () => void;
  aiGenerating: boolean;
}> = ({
  配置,
  数据,
  章节范围,
  展开关联,
  on切换关联,
  onChange,
  on关联变更,
  on添加关联,
  on删除关联,
  onAI完善,
  onAI关联,
  aiGenerating,
}) => {
  const 关联数 = 数据.章节关联?.length || 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[13px] tracking-wide flex items-center gap-2">
          <span
            className="flex items-center justify-center w-5 h-5 rounded"
            style={{ background: `${配置.color}18` }}
          >
            <i
              className={`text-xs ${配置.icon}`}
              style={{ color: 配置.color }}
            />
          </span>
          <span className="text-[var(--text)] font-semibold">{配置.label}</span>
        </label>
        <div className="flex items-center gap-1">
          <button
            className="flex items-center justify-center w-6 h-6 transition-colors rounded-md cursor-pointer hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            title="AI完善此要素"
            onClick={onAI完善}
            disabled={aiGenerating}
          >
            <i
              className={`text-xs ri-magic-line text-amber-400 ${aiGenerating ? 'animate-pulse' : ''}`}
            />
          </button>
          <button
            className="flex items-center justify-center w-6 h-6 transition-colors rounded-md cursor-pointer hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            title="AI智能关联章节"
            onClick={onAI关联}
            disabled={aiGenerating}
          >
            <i
              className={`text-xs text-blue-400 ri-links-line ${aiGenerating ? 'animate-pulse' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Textarea with highlight layer */}
      <div className="relative 高亮编辑器容器 bg-[var(--bg-dark)] rounded-xl">
        <div className="高亮层 absolute top-0 left-0 right-0 bottom-0 rounded-xl px-4 py-3 text-[14px] leading-relaxed pointer-events-none overflow-hidden whitespace-pre-wrap break-words border border-transparent">
          {数据.内容}
        </div>
        <textarea
          className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] resize-y focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-[border,box-shadow] leading-relaxed min-h-[56px] relative z-[2] 实体高亮透明"
          rows={2}
          placeholder={配置.placeholder}
          value={数据.内容}
          onChange={e => onChange(e.target.value)}
        />
      </div>

      {/* Chapter association */}
      <div className="要素关联编辑器 mt-2">
        <div className="关联区块 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.03] overflow-hidden">
          <div
            className="flex items-center justify-between px-3 py-2 cursor-pointer select-none hover:bg-cyan-500/[0.05] transition-colors"
            onClick={on切换关联}
          >
            <span className="text-[12px] text-cyan-400/80 flex items-center gap-1.5 font-medium">
              <i className="ri-git-commit-line text-cyan-400" /> 关联章节{' '}
              {关联数 > 0 ? (
                <span className="text-[10px] bg-cyan-500/15 text-cyan-400 px-1.5 py-0.5 rounded-full font-bold">
                  {关联数}
                </span>
              ) : null}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="flex items-center justify-center w-5 h-5 transition-colors rounded cursor-pointer hover:bg-cyan-500/20"
                title="添加章节关联"
                onClick={e => {
                  e.stopPropagation();
                  on添加关联();
                }}
              >
                <i className="text-xs ri-add-line text-cyan-400" />
              </button>
              <i
                className={`text-xs transition-transform duration-200 text-cyan-400/50 ri-arrow-down-s-line ${展开关联 ? 'rotate-180' : ''}`}
              />
            </div>
          </div>

          {展开关联 && (
            <div className="border-t border-cyan-500/10">
              <div className="px-2.5 py-1.5 text-[10px] text-[var(--text-secondary)]/60 flex items-center gap-1 bg-cyan-500/[0.02]">
                <i className="ri-information-line text-cyan-400/40" />{' '}
                当前幕章节范围：第{章节范围}章
              </div>
              {关联数 > 0 ? (
                <div className="p-2 space-y-1.5">
                  {数据.章节关联.map((关联, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-cyan-500/10 bg-[var(--bg-darker)]/60 overflow-hidden group/bind hover:border-cyan-500/25 transition-colors"
                    >
                      <div className="flex items-center gap-2 px-2.5 py-1.5">
                        <div className="flex items-center justify-center w-4 h-4 rounded shrink-0 bg-cyan-500/15">
                          <span className="text-[8px] font-bold text-cyan-400">
                            {关联.章节序号}
                          </span>
                        </div>
                        <span className="text-[12px] font-medium flex-1 truncate text-cyan-300/90">
                          {关联.章节标题}
                        </span>
                        <button
                          className="flex items-center justify-center w-4 h-4 transition-colors rounded opacity-0 cursor-pointer hover:bg-red-500/20 group-hover/bind:opacity-100"
                          title="移除关联"
                          onClick={() => on删除关联(idx)}
                        >
                          <i className="ri-close-line text-[10px] text-red-400" />
                        </button>
                      </div>
                      <div className="px-2.5 pb-2">
                        <div className="relative 关联高亮容器 bg-[var(--bg-darker)] rounded-md">
                          <div className="关联高亮层 absolute top-0 left-0 right-0 bottom-0 rounded-md px-2.5 py-1.5 text-[12px] leading-relaxed pointer-events-none overflow-hidden whitespace-pre-wrap break-words border border-transparent">
                            {关联.要点}
                          </div>
                          <textarea
                            className="w-full bg-[var(--bg-darker)] border border-cyan-500/12 rounded-md px-2.5 py-1.5 text-[12px] resize-y focus:outline-none transition-[border,box-shadow] leading-relaxed min-h-[32px] relative z-[2] 关联实体高亮透明"
                            rows={1}
                            placeholder="该要素在本章的具体实施要点..."
                            value={关联.要点}
                            onChange={e =>
                              on关联变更(idx, '要点', e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-cyan-400/30 text-center py-3">
                  <i className="block mb-1 text-base ri-link-unlink" />{' '}
                  暂无关联章节
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Event detail right-side panel */
const 事件详情面板: React.FC<{
  事件: 事件数据;
  当前卷: 卷数据 | undefined;
  onClose: () => void;
  onSave: (updated: 事件数据) => void;
  onDelete: (id: number) => void;
  projectId: number | null;
}> = ({ 事件, 当前卷, onClose, onSave, onDelete, projectId }) => {
  const [form, setForm] = useState<事件数据>({ ...事件 });
  const [展开关联, set展开关联] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiTarget, setAiTarget] = useState<string | null>(null);

  const { generate: aiGenerate } = useAIGenerate({
    module: 'sidestories',
    projectId,
  });

  const 章节范围 = 当前卷 ? `${当前卷.起始章}-${当前卷.结束章}` : '1-96';

  const handleFieldChange = useCallback(
    (field: keyof 事件数据, value: string) => {
      setForm(prev => ({ ...prev, [field]: value }));
      setSaved(false);
    },
    []
  );

  const handle要素Change = useCallback((key: string, value: string) => {
    setForm(prev => ({
      ...prev,
      [key]: { ...(prev as any)[key], 内容: value },
    }));
    setSaved(false);
  }, []);

  const handle关联变更 = useCallback(
    (要素key: string, idx: number, field: string, val: string) => {
      setForm(prev => {
        const 要素 = { ...(prev as any)[要素key] } as 要素数据;
        const 新关联 = [...要素.章节关联];
        新关联[idx] = { ...新关联[idx], [field]: val };
        return { ...prev, [要素key]: { ...要素, 章节关联: 新关联 } };
      });
      setSaved(false);
    },
    []
  );

  const handle添加关联 = useCallback((要素key: string) => {
    setForm(prev => {
      const 要素 = { ...(prev as any)[要素key] } as 要素数据;
      return {
        ...prev,
        [要素key]: {
          ...要素,
          章节关联: [
            ...(要素.章节关联 || []),
            { 章节序号: 1, 章节标题: '新章节', 要点: '' },
          ],
        },
      };
    });
    setSaved(false);
  }, []);

  const handle删除关联 = useCallback((要素key: string, idx: number) => {
    setForm(prev => {
      const 要素 = { ...(prev as any)[要素key] } as 要素数据;
      const 新关联 = 要素.章节关联.filter((_, i) => i !== idx);
      return { ...prev, [要素key]: { ...要素, 章节关联: 新关联 } };
    });
    setSaved(false);
  }, []);

  const toggle关联 = useCallback((要素key: string) => {
    set展开关联(prev => ({ ...prev, [要素key]: !prev[要素key] }));
  }, []);

  const handleAI完善 = useCallback(
    async (要素key: string) => {
      if (aiGenerating) return;
      setAiGenerating(true);
      setAiTarget(要素key);
      const 要素 = (form as any)[要素key] as 要素数据;
      const 当前内容 = 要素.内容;
      const 要素名 = 七要素配置.find(c => c.key === 要素key)?.label ?? 要素key;
      const prompt = `事件名称：${事件.名称}\n当前${要素名}内容：${当前内容 || '无'}\n\n请完善此事件的${要素名}要素描述，生成更详细的内容。直接输出文本描述，不要JSON格式。`;
      const messages = [
        {
          role: 'system',
          content:
            '你是一个专业的小说创作助手。请完善给定的事件要素描述。直接输出文本即可。',
        },
        { role: 'user', content: prompt },
      ];
      const text = await aiGenerate(messages);
      if (text) {
        setForm(prev => {
          const updated = {
            ...prev,
            [要素key]: { ...(prev as any)[要素key], 内容: text },
          };
          if (projectId) {
            saveVersion('sidestories', projectId, {
              描述: 'AI完善要素',
              内容: updated,
            }).catch(() => {});
          }
          return updated;
        });
        setSaved(false);
      }
      setAiGenerating(false);
      setAiTarget(null);
    },
    [aiGenerating, form, 事件, aiGenerate, projectId]
  );

  const handleAI关联 = useCallback(
    async (要素key: string) => {
      if (aiGenerating) return;
      setAiGenerating(true);
      setAiTarget(要素key);
      const 要素 = (form as any)[要素key] as 要素数据;
      const 要素名 = 七要素配置.find(c => c.key === 要素key)?.label ?? 要素key;
      const prompt = `事件名称：${事件.名称}\n${要素名}内容：${要素.内容 || '无'}\n当前章节范围：第${章节范围}章\n\n请推荐与该要素关联的章节。请用管道格式输出，每个关联用 --- 分隔。每行格式：章节序号|数字\n章节标题|标题\n要点|描述`;
      const messages = [
        {
          role: 'system',
          content: buildChapterAssocSystemPrompt(),
        },
        { role: 'user', content: prompt },
      ];
      const gvResult = await generateValidated({
        schema: chapterAssocSchema,
        generate: async () => aiGenerate(messages),
        parseResponse: text => parseChapterAssocResponse(text),
        maxRetries: 3,
      });
      if (gvResult) {
        const data = gvResult.data as Array<{
          章节序号: number;
          章节标题: string;
          要点: string;
        }>;
        setForm(prev => {
          const 要素 = { ...(prev as any)[要素key] } as 要素数据;
          const updated = {
            ...prev,
            [要素key]: {
              ...要素,
              章节关联: [...(要素.章节关联 || []), ...data],
            },
          };
          if (projectId) {
            saveVersion('sidestories', projectId, {
              描述: 'AI关联章节',
              内容: updated,
            }).catch(() => {});
          }
          return updated;
        });
        set展开关联(prev => ({ ...prev, [要素key]: true }));
        setSaved(false);
      }
      setAiGenerating(false);
      setAiTarget(null);
    },
    [aiGenerating, 事件, 章节范围, aiGenerate, projectId]
  );

  const handleAI批量关联 = useCallback(async () => {
    if (aiGenerating) return;
    setAiGenerating(true);
    setAiTarget('__batch__');
    const prompt = `事件名称：${事件.名称}\n当前章节范围：第${章节范围}章\n\n请为该事件的所有七要素(欲望、阻碍、行动、结果、意外、转折、结局)分别推荐关联章节。输出JSON对象，key为要素名称，value为关联数组：{"欲望":[{"章节序号":1,"章节标题":"标题","要点":"要点"}],...}`;
    const messages = [
      {
        role: 'system',
        content:
          buildChapterAssocSystemPrompt() +
          '\n\n批量模式：输出JSON对象，key为要素名称(欲望/阻碍/行动/结果/意外/转折/结局)，value为关联数组。',
      },
      { role: 'user', content: prompt },
    ];
    const text = await aiGenerate(messages);
    if (text) {
      // Try JSON format first for batch (more structured), then fallback
      const { data } =
        parseAIJSON<
          Record<
            string,
            Array<{ 章节序号: number; 章节标题: string; 要点: string }>
          >
        >(text);
      if (data) {
        setForm(prev => {
          const updated = { ...prev };
          七要素配置.forEach(配置 => {
            const 要素 = { ...(updated as any)[配置.key] } as 要素数据;
            const 关联 = data[配置.key] || data[配置.label];
            if (要素.章节关联.length === 0 && 关联 && Array.isArray(关联)) {
              (updated as any)[配置.key] = { ...要素, 章节关联: 关联 };
            }
          });
          if (projectId) {
            saveVersion('sidestories', projectId, {
              描述: 'AI批量关联',
              内容: updated,
            }).catch(() => {});
          }
          return updated;
        });
        const allExpanded: Record<string, boolean> = {};
        七要素配置.forEach(配置 => {
          allExpanded[配置.key] = true;
        });
        set展开关联(allExpanded);
        setSaved(false);
      }
    }
    setAiGenerating(false);
    setAiTarget(null);
  }, [aiGenerating, 事件, 章节范围, aiGenerate, projectId]);

  const handleSave = () => {
    setSaving(true);
    onSave(form);
    if (projectId) {
      saveVersion('sidestories', projectId, {
        描述: '保存支线',
        内容: form,
      }).catch(() => {});
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div
      className="fixed top-0 bottom-0 bg-[var(--bg-darker)] border-l border-[var(--border)] shadow-2xl flex overflow-hidden z-40"
      style={{ left: '776px', width: '400px' }}
    >
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="shrink-0 px-5 py-3.5 border-b border-[var(--border)] bg-[var(--bg-dark)]">
          <div className="flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2.5 text-[16px]">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/15">
                <i className="text-purple-400 ri-git-branch-line" />
              </div>{' '}
              编辑事件
            </h3>
            <div className="flex items-center gap-3">
              {saved && (
                <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                  <i className="text-green-400 ri-check-line" /> 已保存
                </span>
              )}
              <button
                className="w-8 h-8 flex items-center justify-center hover:bg-[var(--bg-card)] rounded-lg transition-colors cursor-pointer"
                title="关闭"
                onClick={onClose}
              >
                <i className="text-lg ri-close-line" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-5 py-5 space-y-5 overflow-y-auto">
          {/* 事件名称 */}
          <div>
            <label className="text-[13px] text-[var(--text-secondary)] mb-2 block font-semibold tracking-wide">
              事件名称
            </label>
            <input
              className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
              placeholder="事件名称"
              value={form.名称}
              onChange={e => handleFieldChange('名称', e.target.value)}
            />
          </div>

          {/* 七要素 */}
          <div className="space-y-4">
            <h4 className="text-[14px] font-bold text-[var(--text)] flex items-center justify-between">
              <span className="flex items-center gap-2">
                <i className="text-purple-400 ri-list-ordered" /> 事件七要素
              </span>
              <button
                className="px-2.5 py-1 text-[11px] bg-gradient-to-r from-purple-500/15 to-blue-500/15 text-purple-400 rounded-lg hover:from-purple-500/25 hover:to-blue-500/25 transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                title="AI一键关联所有要素到章节"
                onClick={handleAI批量关联}
                disabled={aiGenerating}
              >
                {aiTarget === '__batch__' ? (
                  <i className="ri-loader-4-line animate-spin text-[11px]" />
                ) : (
                  <i className="ri-links-fill text-[11px]" />
                )}{' '}
                批量关联
              </button>
            </h4>
            <div className="space-y-4">
              {七要素配置.map(配置 => {
                const 数据 = (form as any)[配置.key] as 要素数据;
                return (
                  <要素卡片
                    key={配置.key}
                    配置={配置}
                    数据={数据}
                    章节范围={章节范围}
                    展开关联={!!展开关联[配置.key]}
                    on切换关联={() => toggle关联(配置.key)}
                    onChange={v => handle要素Change(配置.key, v)}
                    on关联变更={(idx, field, val) =>
                      handle关联变更(配置.key, idx, field, val)
                    }
                    on添加关联={() => handle添加关联(配置.key)}
                    on删除关联={idx => handle删除关联(配置.key, idx)}
                    onAI完善={() => handleAI完善(配置.key)}
                    onAI关联={() => handleAI关联(配置.key)}
                    aiGenerating={aiGenerating && aiTarget === 配置.key}
                  />
                );
              })}
            </div>
          </div>

          {/* 涉及支线 */}
          <div>
            <label className="text-[13px] text-[var(--text-secondary)] mb-2 block font-semibold tracking-wide">
              涉及支线
            </label>
            <input
              className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
              placeholder="多个支线用逗号分隔"
              value={form.涉及支线 || ''}
              onChange={e => handleFieldChange('涉及支线', e.target.value)}
            />
          </div>

          {/* 暗线伏笔 */}
          <div>
            <label className="text-[13px] text-[var(--text-secondary)] mb-2 block font-semibold tracking-wide">
              暗线伏笔
            </label>
            <div className="relative 高亮编辑器容器 bg-[var(--bg-dark)] rounded-xl">
              <div className="高亮层 absolute top-0 left-0 right-0 bottom-0 rounded-xl px-4 py-3 text-[14px] leading-relaxed pointer-events-none overflow-hidden whitespace-pre-wrap break-words border border-transparent">
                {form.暗线伏笔}
              </div>
              <textarea
                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-4 py-3 text-[14px] resize-y focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-[border,box-shadow] leading-relaxed min-h-[56px] relative z-[2] 实体高亮透明"
                rows={2}
                placeholder="暗线伏笔备注"
                value={form.暗线伏笔 || ''}
                onChange={e => handleFieldChange('暗线伏笔', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[var(--border)] shrink-0 bg-[var(--bg-dark)]/50 flex items-center justify-between">
          <button
            className="px-4 py-2 text-[13px] text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            onClick={() => onDelete(form.id)}
          >
            <i className="ri-delete-bin-line" /> 删除事件
          </button>
          <button
            className="px-6 py-2 bg-purple-500/20 text-purple-400 rounded-lg text-[13px] font-medium hover:bg-purple-500/30 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <i className="ri-loader-4-line animate-spin text-xs" />
            ) : null}
            {saving ? ' 保存中...' : ' 完成'}
          </button>
        </div>
      </div>
      <div
        className="w-2 transition-colors bg-transparent cursor-col-resize hover:bg-purple-500/50 active:bg-purple-500 shrink-0"
        title="拖拽调整宽度"
      />
    </div>
  );
};

/** Volume act card (幕控制卡片) */
const 幕控制卡片: React.FC<{
  卷: 卷数据;
  事件列表: 事件数据[];
  展开的卷: Set<number>;
  选中事件id: number | null;
  onToggle: (卷id: number) => void;
  onSelect: (事件: 事件数据) => void;
  onAdd: (卷id: number) => void;
}> = ({ 卷, 事件列表, 展开的卷, 选中事件id, onToggle, onSelect, onAdd }) => {
  const 已展开 = 展开的卷.has(卷.id);
  const 事件数 = 事件列表.length;
  const 总章数 = 卷.结束章 - 卷.起始章 + 1;
  const 已用章 = 0;

  return (
    <div className="幕控制卡片 mx-4 mt-2 mb-1">
      <div
        className={`bg-[var(--bg-card)] rounded-xl border transition-all cursor-pointer ${已展开 ? 'border-orange-500/30' : 'border-[var(--border)] hover:border-orange-500/30'}`}
      >
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5"
          onClick={() => onToggle(卷.id)}
        >
          <div className="flex items-center justify-center rounded-lg w-7 h-7 bg-gradient-to-br from-orange-500/20 to-amber-500/20 shrink-0">
            <i className="text-sm text-orange-400 ri-route-line" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[13px] truncate">
                {' '}
                第 {卷.序号} 幕：{卷.标题}
              </span>
              {卷.标签 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/10 text-orange-400 shrink-0">
                  {卷.标签}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              {卷.章节范围}
              <span className="ml-2"> · {事件数} 个事件</span>
              <span className="ml-2">
                {' '}
                · 已用 {已用章}/{总章数} 章
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="flex items-center justify-center w-6 h-6 transition-colors rounded-md cursor-pointer hover:bg-orange-500/20"
              title="编辑幕信息"
              onClick={e => {
                e.stopPropagation();
              }}
            >
              <i className="ri-edit-line text-xs text-[var(--text-secondary)] hover:text-orange-400" />
            </button>
            <i
              className={`ri-arrow-down-s-line text-[var(--text-secondary)] text-sm transition-transform ${已展开 ? 'rotate-180' : ''}`}
            />
          </div>
        </div>

        {/* Progress bar */}
        <div
          className="flex gap-[1px] rounded overflow-hidden mx-3.5 mb-2"
          style={{ height: 4 }}
        >
          {Array.from({ length: Math.min(总章数, 96) }, (_, i) => (
            <div key={i} className="flex-1 min-w-[2px] bg-gray-600/30" />
          ))}
        </div>
      </div>
    </div>
  );
};

/** AI generation progress modal */
const AI生成进度弹窗: React.FC<{
  卷列表: 卷数据[];
  onCancel: () => void;
}> = ({ 卷列表, onCancel }) => {
  const [当前幕idx, set当前幕idx] = useState(0);
  const [ai输出, setAi输出] = useState('');
  const 总幕数 = 卷列表.length;
  const 进度 = ((当前幕idx + 1) / 总幕数) * 100;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-[var(--bg-darker)] rounded-xl border border-[var(--border)] p-6 max-w-3xl w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <i className="text-purple-400 ri-loader-4-line animate-spin" />{' '}
            正在生成主线事件流
          </h3>
          {卷列表[当前幕idx] && (
            <span className="px-2 py-1 text-xs text-purple-400 border rounded bg-purple-500/10 border-purple-500/30">
              {卷列表[当前幕idx].标题}
            </span>
          )}
        </div>
        <div className="mb-2 shrink-0">
          <div className="h-2 bg-[var(--bg-card)] rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-500 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
              style={{ width: `${进度}%` }}
            />
          </div>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-1 shrink-0">
          正在为第{当前幕idx + 1}幕「{卷列表[当前幕idx]?.标题}」生成事件流...（
          {当前幕idx + 1}/{总幕数}）
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mb-3 shrink-0">
          {当前幕idx + 1} / {总幕数}幕
        </p>
        <div className="flex-1 min-h-0 border border-[var(--border)] rounded-lg overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 bg-[var(--bg-card)] text-xs text-[var(--text-secondary)] border-b border-[var(--border)] flex items-center gap-1.5 shrink-0">
            <i className="text-purple-400 ri-quill-pen-line" /> AI 实时输出{' '}
            <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
              {ai输出.length} 字符
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap font-mono bg-[var(--bg-card)]/30">
            {ai输出 || '等待AI输出...'}
          </div>
        </div>
        <div className="flex justify-end mt-4 shrink-0">
          <button
            className="px-4 py-2 text-sm text-red-400 border rounded-lg cursor-pointer border-red-500/30 hover:bg-red-500/10"
            onClick={onCancel}
          >
            {' '}
            取消生成
          </button>
        </div>
      </div>
    </div>
  );
};

/** AI generation confirm modal */
const AI生成确认弹窗: React.FC<{
  卷列表: 卷数据[];
  onCancel: () => void;
  onGenerate: () => void;
}> = ({ 卷列表, onCancel, onGenerate }) => (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center">
    <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
    <div className="relative bg-[var(--bg-darker)] rounded-xl border border-[var(--border)] p-6 max-w-3xl w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-full max-w-md mb-6">
          <div className="p-5 border bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border-purple-500/25 rounded-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/25 to-indigo-500/25">
                <i className="text-xl text-purple-400 ri-sparkling-2-line" />
              </div>
              <div>
                <h3 className="text-[14px] font-bold text-[var(--text)]">
                  检测到情节脉络数据
                </h3>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  可自动生成主线事件流
                </p>
              </div>
            </div>
            <p className="text-[13px] text-[var(--text-secondary)] mb-4 leading-relaxed">
              检测到已有情节脉络但尚无事件流数据，是否自动为每幕生成主线事件流？
            </p>
            <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
              {卷列表.map(卷 => (
                <div
                  key={卷.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-dark)] text-[12px]"
                >
                  <span className="text-[var(--text)] font-medium">
                    第{卷.序号}幕：{卷.标题}
                  </span>
                  <span className="text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                    预计2个事件
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-[13px] font-medium hover:from-purple-500 hover:to-indigo-500 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-purple-500/20"
                onClick={onGenerate}
              >
                <i className="ri-sparkling-line" /> 开始生成
              </button>
              <button
                className="px-4 py-2.5 border border-[var(--border)] text-[var(--text-secondary)] rounded-lg text-[13px] hover:bg-[var(--bg-dark)] transition-colors cursor-pointer"
                onClick={onCancel}
              >
                {' '}
                稍后再说
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ── Demo data ──────────────────────────────────────────────────────

const demo卷列表: 卷数据[] = [
  {
    id: 1,
    序号: 1,
    标题: '烬骨邪影',
    章节范围: '1-96',
    起始章: 1,
    结束章: 96,
    标签: '压抑到反抗的觉醒，初露锋芒的决绝',
  },
  {
    id: 2,
    序号: 2,
    标题: '魔渊泣血',
    章节范围: '97-192',
    起始章: 97,
    结束章: 192,
  },
  {
    id: 3,
    序号: 3,
    标题: '八荒烽火',
    章节范围: '193-288',
    起始章: 193,
    结束章: 288,
  },
  {
    id: 4,
    序号: 4,
    标题: '天阙惊雷',
    章节范围: '289-384',
    起始章: 289,
    结束章: 384,
  },
  {
    id: 5,
    序号: 5,
    标题: '伪天血祭',
    章节范围: '385-480',
    起始章: 385,
    结束章: 480,
  },
  {
    id: 6,
    序号: 6,
    标题: '纪元喋血',
    章节范围: '481-576',
    起始章: 481,
    结束章: 576,
  },
  {
    id: 7,
    序号: 7,
    标题: '万古执剑',
    章节范围: '577-672',
    起始章: 577,
    结束章: 672,
  },
];

const demo事件列表: 事件数据[] = [
  {
    id: 1,
    序号: 1,
    名称: '宗门来人了',
    卷id: 1,
    欲望: {
      内容: '霸占',
      章节关联: [
        { 章节序号: 1, 章节标题: '第一章 善良的人', 要点: '杀死守山人' },
      ],
    },
    阻碍: {
      内容: '霸占资源',
      章节关联: [{ 章节序号: 1, 章节标题: '第1章 新章节', 要点: '复仇' }],
    },
    行动: {
      内容: '坏人',
      章节关联: [
        { 章节序号: 1, 章节标题: '第一章 善良的人', 要点: '赶走坏人' },
      ],
    },
    结果: {
      内容: '宗门',
      章节关联: [
        { 章节序号: 1, 章节标题: '第1章 新章节', 要点: '宗门派更厉害的人来了' },
      ],
    },
    意外: { 内容: '', 章节关联: [] },
    转折: { 内容: '', 章节关联: [] },
    结局: { 内容: '', 章节关联: [] },
    涉及支线: '',
    暗线伏笔: '大护法',
  },
];

// ── Main component ─────────────────────────────────────────────────

export const SideStoriesPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  // Panel width state (resize)
  const [panelWidth, setPanelWidth] = useState(480);
  const [dragging, setDragging] = useState(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  // View state
  const [当前卷id, set当前卷id] = useState<number | null>(1); // default to vol 1 per HTML
  const [展开的卷, set展开的卷] = useState<Set<number>>(new Set());
  const [选中事件, set选中事件] = useState<事件数据 | null>(null);
  const [显示AI确认, set显示AI确认] = useState(false);
  const [显示AI进度, set显示AI进度] = useState(false);
  const [batchAiGenerating, setBatchAiGenerating] = useState(false);

  const { generating: aiGenerating, generate: aiGenerate } = useAIGenerate({
    module: 'sidestories',
    projectId,
  });

  /* ─── Flat data for AI field/full generation ─── */
  const [flatData, setFlatData] = useState<Record<string, string>>({});

  const fetchSystemPrompt = useSystemPrompt(
    'AI生成支线故事',
    SIDESTORIES_SYSTEM_PROMPT
  );

  const buildExistingStr = useCallback(
    (_excludeField?: string) => {
      return Object.entries(flatData)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}：${v}`)
        .join('\n');
    },
    [flatData]
  );

   
  const fieldGen = useAIFieldGenerate({
    module: 'sidestories',
    projectId,
    data: flatData,
    setData: setFlatData,
    fetchSystemPrompt,
    buildExistingStr,
    schema: sidestorySchema,
  });

  const fullGen = useAIFullGenerate({
    module: 'sidestories',
    projectId,
    data: flatData,
    setData: setFlatData,
    fetchSystemPrompt,
    parseResponse: (text: string) => {
      const result = parseSidestoryResponse(text);
      if (!result) return null;
      const filtered: Record<string, string> = {};
      for (const [k, v] of Object.entries(result)) {
        if (typeof v === 'string') filtered[k] = v;
      }
      return filtered;
    },
    schema: sidestorySchema,
    buildUserMessage: (type, desc) =>
      `请生成${type}类型的支线故事设计。\n\n${desc ? `用户补充要求：${desc}\n\n` : ''}已有设定：\n${buildExistingStr() || '无'}\n\n请按管道格式输出，每行一个字段：支线概述|<内容>\n关键转折|<内容>\n主线关联|<内容>`,
  });

  // Data (use API when projectId, otherwise demo)
  const 卷列表Url = projectId ? `/api/volume/project/${projectId}/all` : null;
  const 事件列表Url = projectId
    ? `/api/event-flow/project/${projectId}/all`
    : null;
  const { data: 卷列表Raw, loading: loading卷 } =
    useWorldApi<卷数据[]>(卷列表Url);
  const {
    data: 事件列表Raw,
    loading: loading事件,
    setData: set事件列表,
  } = useWorldApi<事件数据[]>(事件列表Url);

  const 卷列表 = 卷列表Raw || demo卷列表;
  const 事件列表 = 事件列表Raw || demo事件列表;

  const 当前卷 = 卷列表.find(v => v.id === 当前卷id);

  // Resize logic
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setPanelWidth(Math.max(360, Math.min(800, e.clientX - leftOffset)));
    };
    const onUp = () => {
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging, leftOffset]);

  // Filtered events
  const filteredEvents = 事件列表.filter(e => {
    if (当前卷id && e.卷id !== 当前卷id) return false;
    return true;
  });

  // Group events by volume
  const 按卷分组 = (
    当前卷id ? [卷列表.find(v => v.id === 当前卷id)!].filter(Boolean) : 卷列表
  ).map(卷 => ({
    卷,
    事件: filteredEvents.filter(e => e.卷id === 卷.id),
  }));

  const 总事件数 = filteredEvents.length;
  const 完成数 = filteredEvents.filter(e => e.结局?.内容).length;

  // Handlers
  const toggle卷展开 = useCallback((卷id: number) => {
    set展开的卷(prev => {
      const next = new Set(prev);
      if (next.has(卷id)) next.delete(卷id);
      else next.add(卷id);
      return next;
    });
  }, []);

  const handle添加事件 = useCallback(() => {
    const 目标卷id = 当前卷id || (卷列表[0]?.id ?? 0);
    const 新事件: 事件数据 = {
      id: Date.now(),
      序号: (事件列表.filter(e => e.卷id === 目标卷id).length || 0) + 1,
      名称: '新节点',
      卷id: 目标卷id,
      欲望: { 内容: '', 章节关联: [] },
      阻碍: { 内容: '', 章节关联: [] },
      行动: { 内容: '', 章节关联: [] },
      结果: { 内容: '', 章节关联: [] },
      意外: { 内容: '', 章节关联: [] },
      转折: { 内容: '', 章节关联: [] },
      结局: { 内容: '', 章节关联: [] },
      涉及支线: '',
      暗线伏笔: '',
    };
    set事件列表([...事件列表, 新事件]);
    if (!展开的卷.has(目标卷id)) {
      set展开的卷(prev => new Set(prev).add(目标卷id));
    }
    set选中事件(新事件);
  }, [当前卷id, 卷列表, 事件列表, 展开的卷, set事件列表]);

  const handleSave事件 = useCallback(
    (updated: 事件数据) => {
      set事件列表(prev =>
        (prev || []).map(e => (e.id === updated.id ? updated : e))
      );
    },
    [set事件列表]
  );

  const handleDelete事件 = useCallback(
    (id: number) => {
      set事件列表(prev => (prev || []).filter(e => e.id !== id));
      set选中事件(null);
    },
    [set事件列表]
  );

  const handleStartGenerate = useCallback(async () => {
    set显示AI确认(false);
    set显示AI进度(true);
    for (const 卷 of 卷列表) {
      const prompt = `为第${卷.序号}幕「${卷.标题}」(章节范围：${卷.章节范围})生成2个主线事件流。每个事件包含七要素：欲望、阻碍、行动、结果、意外、转折、结局。请用管道格式输出，事件之间用 === 分隔。每行格式：字段名|内容。例如：\n名称|事件名\n序号|1\n卷id|${卷.id}\n欲望|描述\n阻碍|描述\n行动|描述\n结果|描述\n意外|描述\n转折|描述\n结局|描述\n===\n名称|事件名2\n...`;
      const messages = [
        {
          role: 'system',
          content: buildEventFlowSystemPrompt(),
        },
        { role: 'user', content: prompt },
      ];
      const gvResult = await generateValidated({
        schema: eventFlowSchema,
        generate: async () => aiGenerate(messages),
        parseResponse: text => parseEventFlowResponse(text),
        maxRetries: 3,
      });
      if (!gvResult) continue;
      const parsed = gvResult.data as any[];
      if (parsed && Array.isArray(parsed)) {
        const 新事件 = parsed.map((evt, i) => ({
          id: Date.now() + i + Math.random(),
          序号: evt.序号 || i + 1,
          名称: evt.名称 || `新事件${i + 1}`,
          卷id: 卷.id,
          欲望: evt.欲望 || { 内容: '', 章节关联: [] },
          阻碍: evt.阻碍 || { 内容: '', 章节关联: [] },
          行动: evt.行动 || { 内容: '', 章节关联: [] },
          结果: evt.结果 || { 内容: '', 章节关联: [] },
          意外: evt.意外 || { 内容: '', 章节关联: [] },
          转折: evt.转折 || { 内容: '', 章节关联: [] },
          结局: evt.结局 || { 内容: '', 章节关联: [] },
          涉及支线: evt.涉及支线 || '',
          暗线伏笔: evt.暗线伏笔 || '',
        }));
        set事件列表(prev => [...(prev || []), ...新事件]);
      }
    }
    set显示AI进度(false);
    if (projectId) {
      saveVersion('sidestories', projectId, {
        描述: 'AI生成事件流',
        内容: 事件列表,
      }).catch(() => {});
    }
  }, [aiGenerate, 卷列表, set事件列表, projectId, 事件列表]);

  const handle一键关联所有事件 = useCallback(async () => {
    if (batchAiGenerating) return;
    setBatchAiGenerating(true);
    const 有内容的事件 = 事件列表.filter(e => e.欲望?.内容 || e.行动?.内容);
    if (有内容的事件.length === 0) {
      setBatchAiGenerating(false);
      return;
    }
    const prompt = `以下是需要关联章节的事件列表：\n${有内容的事件.map(e => `事件「${e.名称}」(卷id:${e.卷id}): 欲望=${e.欲望?.内容 || ''}, 行动=${e.行动?.内容 || ''}`).join('\n')}\n\n请为每个有内容但无章节关联的要素推荐关联章节。输出JSON数组，每个元素：{"事件名称":"名称","要素key":"欲望/阻碍/行动/结果/意外/转折/结局","章节关联":[{"章节序号":1,"章节标题":"标题","要点":"要点描述"}]}`;
    const messages = [
      {
        role: 'system',
        content:
          buildChapterAssocSystemPrompt() +
          '\n\n批量关联模式：输出JSON数组，每个元素包含事件名称、要素key和章节关联数组。',
      },
      { role: 'user', content: prompt },
    ];
    const gvResult = await generateValidated({
      schema: z.array(
        z.object({
          事件名称: z.string(),
          要素key: z.string(),
          章节关联: z.array(
            z.object({
              章节序号: z.number(),
              章节标题: z.string(),
              要点: z.string(),
            })
          ),
        })
      ),
      generate: async () => aiGenerate(messages),
      parseResponse: text => {
        const { data } = parseAIJSON<
          Array<{
            事件名称: string;
            要素key: string;
            章节关联: Array<{
              章节序号: number;
              章节标题: string;
              要点: string;
            }>;
          }>
        >(text);
        return data ?? null;
      },
      maxRetries: 3,
    });
    if (gvResult) {
      const data = gvResult.data;
      set事件列表(prev =>
        (prev || []).map(事件 => {
          const updated = { ...事件 };
          for (const assoc of data) {
            if (
              assoc.事件名称 === 事件.名称 &&
              七要素配置.some(c => c.key === assoc.要素key)
            ) {
              const 要素 = { ...(updated as any)[assoc.要素key] } as 要素数据;
              if (要素.章节关联.length === 0) {
                (updated as any)[assoc.要素key] = {
                  ...要素,
                  章节关联: assoc.章节关联,
                };
              }
            }
          }
          return updated;
        })
      );
    }
    setBatchAiGenerating(false);
    if (projectId) {
      saveVersion('sidestories', projectId, {
        描述: 'AI一键关联所有事件',
        内容: 事件列表,
      }).catch(() => {});
    }
  }, [batchAiGenerating, 事件列表, aiGenerate, set事件列表, projectId]);

  return createPortal(
    <>
      <div className="v-1a4883b8">
        {/* ── Own shell: matches HTML exactly ── */}
        <div
          className="支线故事侧边栏容器 fixed top-0 bottom-0 z-40 flex"
          style={{ left: leftOffset }}
        >
          <aside
            className="支线故事内容 bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col h-full shadow-lg"
            style={{ width: panelWidth }}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)]">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20">
                  <i className="text-xl text-purple-400 ri-git-branch-line" />
                </div>
                <div>
                  <h2 className="font-bold text-[15px] tracking-wide">
                    支线故事
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    事件流管理与支线编排
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="px-2.5 py-1 text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  title="AI完整生成"
                  onClick={fullGen.open}
                >
                  <i className="ri-sparkles-line" /> AI完整生成
                </button>
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center hover:bg-purple-500/20 rounded-lg transition-colors cursor-pointer text-[var(--text-secondary)]"
                  title="AI生成事件流"
                  onClick={() => set显示AI确认(true)}
                >
                  <i className="text-base ri-magic-line" />
                </button>
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center hover:bg-[var(--bg-dark)] rounded-lg transition-colors text-[var(--text-secondary)] cursor-pointer"
                  title="添加事件"
                  onClick={handle添加事件}
                >
                  <i className="text-base ri-add-line" />
                </button>
                <button
                  type="button"
                  className="w-8 h-8 flex items-center justify-center hover:bg-[var(--bg-dark)] rounded-lg transition-colors text-[var(--text-secondary)] cursor-pointer"
                  onClick={onClose}
                >
                  <i className="text-lg ri-close-line" />
                </button>
              </div>
            </div>

            {/* ── Volume filter bar ── */}
            <div className="px-5 py-2.5 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)]/50">
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-[var(--text-secondary)] shrink-0 font-medium">
                  当前卷
                </span>
                <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
                  <button
                    className={`px-3 py-1.5 rounded-lg text-[13px] whitespace-nowrap transition-all cursor-pointer ${当前卷id === null ? 'bg-purple-500/20 text-purple-400 font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-dark)] hover:text-[var(--text)]'}`}
                    onClick={() => set当前卷id(null)}
                  >
                    {' '}
                    全部{' '}
                  </button>
                  {卷列表.map(卷 => (
                    <button
                      key={卷.id}
                      className={`px-3 py-1.5 rounded-lg text-[13px] whitespace-nowrap transition-all cursor-pointer ${当前卷id === 卷.id ? 'bg-purple-500/20 text-purple-400 font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-dark)] hover:text-[var(--text)]'}`}
                      title={`第${卷.序号}卷 ${卷.标题}`}
                      onClick={() => set当前卷id(卷.id)}
                    >
                      {' '}
                      第{卷.序号}卷{' '}
                    </button>
                  ))}
                </div>
                {当前卷 && (
                  <span
                    className="text-[12px] text-purple-400/80 shrink-0 truncate max-w-[180px]"
                    title={`第${当前卷.序号}卷 ${当前卷.标题}`}
                  >
                    第{当前卷.序号}卷 {当前卷.标题}
                  </span>
                )}
              </div>
            </div>

            {/* ── Volume act cards (幕控制卡片) ── */}
            {卷列表.length > 0 && (
              <div className="shrink-0">
                {卷列表
                  .filter(v => !当前卷id || v.id === 当前卷id)
                  .map(卷 => (
                    <幕控制卡片
                      key={卷.id}
                      卷={卷}
                      事件列表={filteredEvents.filter(e => e.卷id === 卷.id)}
                      展开的卷={展开的卷}
                      选中事件id={选中事件?.id ?? null}
                      onToggle={toggle卷展开}
                      onSelect={set选中事件}
                      onAdd={() => {
                        set当前卷id(卷.id);
                        handle添加事件();
                      }}
                    />
                  ))}
              </div>
            )}

            {/* ── Toolbar ── */}
            <div className="flex items-center gap-2 px-5 py-2 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)]/30">
              <button
                className="一键关联按钮 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] border border-[var(--border)] bg-[var(--bg-dark)] text-[var(--text-secondary)] hover:bg-purple-500/15 hover:border-purple-500/30 hover:text-purple-400 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[var(--bg-dark)] disabled:hover:border-[var(--border)] disabled:hover:text-[var(--text-secondary)]"
                onClick={handle一键关联所有事件}
                disabled={batchAiGenerating}
              >
                {batchAiGenerating ? (
                  <i className="ri-loader-4-line animate-spin" />
                ) : (
                  <i className="ri-magic-line" />
                )}
                <span>
                  {batchAiGenerating ? 'AI关联中...' : '一键关联所有事件'}
                </span>
              </button>
            </div>

            {/* ── Main content area ── */}
            {loading卷 || loading事件 ? (
              <div className="flex-1 px-4 py-4 overflow-y-auto">
                <div className="flex items-center justify-center py-12">
                  <i className="ri-loader-4-line animate-spin text-xl text-[var(--text-secondary)]" />
                </div>
              </div>
            ) : 总事件数 === 0 && 卷列表.length > 0 ? (
              /* Empty state with AI generation prompt */
              <div className="flex-1 px-4 py-4 overflow-y-auto">
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-full max-w-md mb-6">
                    <div className="p-5 border bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border-purple-500/25 rounded-xl">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/25 to-indigo-500/25">
                          <i className="text-xl text-purple-400 ri-sparkling-2-line" />
                        </div>
                        <div>
                          <h3 className="text-[14px] font-bold text-[var(--text)]">
                            检测到情节脉络数据
                          </h3>
                          <p className="text-[12px] text-[var(--text-secondary)]">
                            可自动生成主线事件流
                          </p>
                        </div>
                      </div>
                      <p className="text-[13px] text-[var(--text-secondary)] mb-4 leading-relaxed">
                        检测到已有情节脉络但尚无事件流数据，是否自动为每幕生成主线事件流？
                      </p>
                      <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
                        {卷列表.map(卷 => (
                          <div
                            key={卷.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-dark)] text-[12px]"
                          >
                            <span className="text-[var(--text)] font-medium">
                              第{卷.序号}幕：{卷.标题}
                            </span>
                            <span className="text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                              预计2个事件
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-[13px] font-medium hover:from-purple-500 hover:to-indigo-500 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-purple-500/20"
                          onClick={handleStartGenerate}
                        >
                          <i className="ri-sparkling-line" /> 开始生成
                        </button>
                        <button
                          className="px-4 py-2.5 border border-[var(--border)] text-[var(--text-secondary)] rounded-lg text-[13px] hover:bg-[var(--bg-dark)] transition-colors cursor-pointer"
                          onClick={onClose}
                        >
                          {' '}
                          稍后再说
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Event list grouped by volume */
              <div className="flex-1 px-4 py-4 overflow-y-auto">
                <div className="space-y-3">
                  {按卷分组.map(({ 卷, 事件: 卷事件 }) => (
                    <div key={卷.id} className="space-y-2">
                      {/* Volume header */}
                      <div className="flex items-center gap-2.5 px-2 py-2">
                        <div
                          className="flex items-center justify-center text-xs font-bold text-white rounded-lg shadow-sm w-7 h-7"
                          style={{ background: 'rgb(168, 85, 247)' }}
                        >
                          {卷.序号}
                        </div>
                        <span className="text-[14px] font-semibold">
                          第{卷.序号}卷 {卷.标题}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-dark)] px-1.5 py-0.5 rounded">
                          {卷事件.length}个事件
                        </span>
                      </div>

                      {/* Event tree nodes */}
                      <div className="ml-4 space-y-1.5">
                        {/* Tree node line */}
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <i className="text-sm ri-node-tree text-purple-400/60" />
                          <span className="text-[13px] text-[var(--text-secondary)] font-medium">
                            新节点
                          </span>
                        </div>

                        {/* Event cards */}
                        {卷事件.map(事件 => {
                          const 是否选中 = 选中事件?.id === 事件.id;
                          const 有要素 = 事件.欲望?.内容 || 事件.行动?.内容;
                          return (
                            <div key={事件.id} className="ml-4 group">
                              <div
                                className={`bg-[var(--bg-card)] rounded-lg border overflow-hidden transition-all hover:border-purple-500/30 hover:shadow-md hover:shadow-purple-500/5 cursor-pointer ${是否选中 ? 'border-purple-500/50 shadow-md shadow-purple-500/10' : 'border-[var(--border)]'}`}
                                onClick={() => set选中事件(事件)}
                              >
                                <div className="flex items-center gap-2.5 px-3 py-2.5">
                                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/20 shrink-0">
                                    <span className="text-[10px] text-purple-400 font-bold">
                                      {事件.序号}
                                    </span>
                                  </div>
                                  <span className="text-[14px] font-medium flex-1 truncate">
                                    {事件.名称}
                                  </span>
                                  <button
                                    className="p-1 transition-colors rounded opacity-0 hover:bg-blue-500/20 group-hover:opacity-100"
                                    title="预览"
                                    onClick={e => {
                                      e.stopPropagation();
                                      set选中事件(事件);
                                    }}
                                  >
                                    <i className="text-xs text-blue-400 ri-eye-line" />
                                  </button>
                                  <button
                                    className="p-1 transition-colors rounded opacity-0 hover:bg-red-500/20 group-hover:opacity-100"
                                    title="删除"
                                    onClick={e => {
                                      e.stopPropagation();
                                      handleDelete事件(事件.id);
                                    }}
                                  >
                                    <i className="text-xs text-red-400 ri-delete-bin-line" />
                                  </button>
                                  <div
                                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all bg-[var(--bg-dark)]"
                                    title={
                                      有要素
                                        ? '已关联'
                                        : '待绑定（无要素关联章节）'
                                    }
                                  >
                                    <i className="ri-link-unlink text-[var(--text-secondary)]/40 text-[9px]" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div className="px-5 py-2.5 border-t border-[var(--border)] shrink-0 bg-[var(--bg-card)]/50">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span>共 {总事件数} 个事件</span>
                {完成数 > 0 && (
                  <span className="text-green-400">{完成数} 已完成</span>
                )}
              </div>
            </div>
          </aside>

          {/* ── Resize handle ── */}
          <div
            ref={resizeRef}
            className="w-2 cursor-col-resize hover:bg-[var(--primary)]/50 active:bg-[var(--primary)] transition-colors shrink-0 relative z-10 bg-transparent"
            title="拖拽调整宽度"
            onMouseDown={() => {
              setDragging(true);
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
          />

          {/* ── Backdrop ── */}
          <div
            className="fixed top-0 bottom-0 right-0 z-30 transition-colors bg-black/0 hover:bg-black/5"
            style={{ left: leftOffset + panelWidth + 8 }}
            onClick={onClose}
          />
        </div>
      </div>

      {/* ── Event detail panel (slides in from right) ── */}
      {选中事件 &&
        createPortal(
          <事件详情面板
            事件={选中事件}
            当前卷={当前卷}
            onClose={() => set选中事件(null)}
            onSave={handleSave事件}
            onDelete={handleDelete事件}
            projectId={projectId}
          />,
          document.body
        )}

      {/* ── AI generation confirm modal ── */}
      {显示AI确认 &&
        createPortal(
          <AI生成确认弹窗
            卷列表={卷列表}
            onCancel={() => set显示AI确认(false)}
            onGenerate={handleStartGenerate}
          />,
          document.body
        )}

      {/* ── AI generation progress modal ── */}
      {显示AI进度 &&
        createPortal(
          <AI生成进度弹窗
            卷列表={卷列表}
            onCancel={() => set显示AI进度(false)}
          />,
          document.body
        )}

      {/* AI Full Generation Dialog */}
      <AIGenerationDialog
        title="AI生成支线故事"
        subtitle="选择类型或描述你的构想，AI将为你构建完整的支线故事设计"
        phase={fullGen.phase}
        genType={fullGen.genType}
        setGenType={fullGen.setGenType}
        genDesc={fullGen.genDesc}
        setGenDesc={fullGen.setGenDesc}
        streamText={fullGen.streamText}
        parsed={fullGen.parsed}
        typeOptions={sidestoriesTypeOptions}
        quickTemplates={sidestoriesQuickTemplates}
        onStart={fullGen.start}
        onAdopt={fullGen.adopt}
        onClose={fullGen.close}
      />
    </>,
    document.body
  );
};

export default SideStoriesPanel;
