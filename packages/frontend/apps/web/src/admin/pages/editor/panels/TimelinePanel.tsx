import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import {
  useAIGenerate,
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
  saveVersion,
  saveGeneration,
  saveData,
  API_BASE,
  getAuthHeaders,
} from '../useWorldApi';

/* ─── Pipe-format prompt & parser for timeline ─── */

/** Parse pipe-delimited format like: 核心时间线|xxx\n重要转折点|xxx\n暗线伏笔|xxx */
function parseTimelinePipe(text: string): Record<string, string> | null {
  const lines = text.split('\n').filter(l => l.trim());
  const result: Record<string, string> = {};
  const fieldMap: Record<string, string> = {
    核心时间线: '核心时间线',
    重要转折点: '重要转折点',
    暗线伏笔: '暗线伏笔',
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
  return result.核心时间线 || result.重要转折点 || result.暗线伏笔
    ? result
    : null;
}

/** Combined parser: pipe first, then JSON fallback */
function parseTimelineResponse(text: string): Record<string, string> | null {
  if (!text) return null;
  const pipe = parseTimelinePipe(text.trim());
  if (pipe && (pipe.核心时间线 || pipe.重要转折点 || pipe.暗线伏笔))
    return pipe;
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

// ─── Interfaces ────────────────────────────────────────────────────

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

type 事件类型 =
  | '主线情节'
  | '角色弧线'
  | '闪回'
  | '伏笔呼应'
  | '关键对话'
  | '背景事件'
  | '时间跳跃';

type 重要性 = 'major' | 'minor' | 'trivial';
type 所属轴 = '主线' | '支线';
type 校验状态 = 'ok' | 'warn' | 'error';
type 创建来源 = 'manual' | 'ai' | 'sync';

interface 章节关联数据 {
  id: number;
  标题: string;
  字数: number;
  关联度: number;
  备注: string;
  摘要?: string;
  重要性标签?: string;
}

interface 章节信息 {
  标题: string;
  摘要: string;
  摘要核心: string;
  章节起始显示: string;
  章节结束显示: string;
  出场角色列表: string[];
  场景列表: string[];
  势力阵营: string[];
}

interface 伏笔行 {
  标题: string;
  类型: '伏笔' | '呼应';
  状态: '待回收' | '已回收' | '已失效';
}

interface 时间线事件 {
  id: number;
  标题: string;
  起始日期: string;
  结束日期: string;
  起始显示文本: string;
  结束显示文本: string;
  类型: 事件类型;
  重要性: 重要性;
  轴: 所属轴;
  描述: string;
  章节摘要?: string;
  角色: string[];
  地点: string[];
  势力: string[];
  标签: string[];
  章节关联: 章节关联数据[];
  前置事件?: { id: number; 标题: string; 日期: string; 类型: 事件类型 };
  后续事件?: { id: number; 标题: string; 日期: string; 类型: 事件类型 };
  备注?: string;
  校验状态?: 校验状态;
  创建来源?: 创建来源;
  置信度?: number;
  伏笔行列表?: 伏笔行[];
  章节信息?: 章节信息;
}

// ─── Type config ───────────────────────────────────────────────────

/* ─── AI Generation Config ─── */

const timelineTypeOptions: TypeOption[] = [
  { 名称: '编年史', 图标: 'ri-book-2-line', 颜色: '#e74c3c' },
  { 名称: '大事年表', 图标: 'ri-calendar-line', 颜色: '#3498db' },
  { 名称: '角色年表', 图标: 'ri-user-line', 颜色: '#9b59b6' },
  { 名称: '战争年表', 图标: 'ri-sword-line', 颜色: '#e67e22' },
  { 名称: '文明年表', 图标: 'ri-earth-line', 颜色: '#1abc9c' },
];

const timelineQuickTemplates: QuickTemplate[] = [
  {
    label: '王朝兴衰',
    icon: 'ri-book-2-line',
    color: '#e74c3c',
    type: '编年史',
    prompt:
      '生成一个修仙世界的编年史时间线，从远古纪元到当代，标注重大历史事件和时代变迁',
  },
  {
    label: '主角成长线',
    icon: 'ri-user-line',
    color: '#9b59b6',
    type: '角色年表',
    prompt:
      '生成主角从凡人到至强者的成长时间线，标注每次实力突破的关键节点和转折事件',
  },
  {
    label: '宗门大战',
    icon: 'ri-sword-line',
    color: '#e67e22',
    type: '战争年表',
    prompt:
      '生成正邪势力大战的战争时间线，包含各战役时间、参战方、胜负结果和影响',
  },
];

const TIMELINE_SYSTEM_PROMPT = `你是一个专业的小说时间线设计师。请根据用户要求生成详细的时间线事件设计。
输出格式要求：返回JSON对象，包含以下字段（每个字段为描述文本）：
- 核心时间线：主要历史事件的线性描述（200字以上）
- 重要转折点：改变世界格局的关键转折（200字以上）
- 暗线伏笔：隐藏在时间线背后的暗线伏笔（200字以上）`;

const timelineSchema = z.record(z.string());

const TYPE_CONFIG: Record<
  事件类型,
  { color: string; icon: string; label: string }
> = {
  主线情节: { color: '#e74c3c', icon: 'ri-fire-line', label: '主线情节' },
  角色弧线: { color: '#3498db', icon: 'ri-user-line', label: '角色弧线' },
  闪回: { color: '#9b59b6', icon: 'ri-rewind-line', label: '闪回' },
  伏笔呼应: { color: '#f39c12', icon: 'ri-bookmark-line', label: '伏笔/呼应' },
  关键对话: { color: '#1abc9c', icon: 'ri-chat-quote-line', label: '关键对话' },
  背景事件: { color: '#95a5a6', icon: 'ri-earth-line', label: '背景事件' },
  时间跳跃: {
    color: '#e67e22',
    icon: 'ri-skip-forward-line',
    label: '时间跳跃',
  },
};

const IMPORTANCE_STARS: Record<重要性, number> = {
  major: 3,
  minor: 2,
  trivial: 1,
};

// ─── Demo data ─────────────────────────────────────────────────────

const DEMO_EVENTS: 时间线事件[] = [
  {
    id: 1,
    标题: '第一章 善良的人',
    起始日期: '天元-3-3-3',
    结束日期: '天元-3-4-3',
    起始显示文本: '天元三年三月三天',
    结束显示文本: '天元三年四月三天',
    类型: '主线情节',
    重要性: 'major',
    轴: '主线',
    描述: '村霸出现，沈牧在药铺被欺压，神秘老人出现改变命运。',
    章节摘要: '落霞镇凡人聚居，沈牧过着平凡生活。',
    角色: ['寂无渊', '尘骸子'],
    地点: ['苍云山脉', '落霞镇', '济仁药铺'],
    势力: ['离厄矿州附属帮派'],
    标签: ['#冲突', '#高潮'],
    章节关联: [
      {
        id: 1,
        标题: '第一章 善良的人',
        字数: 3200,
        关联度: 90,
        备注: '',
        摘要: '落霞镇凡人聚居',
      },
    ],
    章节信息: {
      标题: '第一章 善良的人',
      摘要: '沈牧在落霞镇过着平凡生活，因救人而卷入修仙界。',
      摘要核心: '凡人生活 → 命运转折',
      章节起始显示: '天元三年三月三天',
      章节结束显示: '天元三年四月三天',
      出场角色列表: ['沈牧', '寂无渊', '尘骸子', '刘三'],
      场景列表: ['落霞镇', '济仁药铺', '苍云山脚'],
      势力阵营: ['离厄矿州附属帮派'],
    },
    备注: '',
    校验状态: 'ok',
    创建来源: 'manual',
  },
  {
    id: 2,
    标题: '沈牧觉醒',
    起始日期: '天元-3-4-5',
    结束日期: '天元-3-4-8',
    起始显示文本: '天元三年四月五天',
    结束显示文本: '天元三年四月八天',
    类型: '角色弧线',
    重要性: 'major',
    轴: '主线',
    描述: '沈牧体内封印觉醒，获得初步修炼能力。性格从懦弱转向坚韧。',
    角色: ['沈牧', '神秘老人'],
    地点: ['苍云山秘境'],
    势力: [],
    标签: ['#成长', '#觉醒'],
    章节关联: [
      { id: 2, 标题: '第二章 觉醒', 字数: 2800, 关联度: 95, 备注: '' },
    ],
    备注: '',
    校验状态: 'ok',
    创建来源: 'manual',
  },
  {
    id: 3,
    标题: '童年回忆',
    起始日期: '天元-1-1-1',
    结束日期: '天元-1-1-5',
    起始显示文本: '天元元年正月初一',
    结束显示文本: '天元元年正月初五',
    类型: '闪回',
    重要性: 'minor',
    轴: '支线',
    描述: '沈牧回忆童年与父亲在山中的生活，父亲临终前的遗言暗示血脉秘密。',
    角色: ['沈牧', '沈父'],
    地点: ['苍云山深处'],
    势力: [],
    标签: ['#回忆'],
    章节关联: [
      {
        id: 1,
        标题: '第一章 善良的人',
        字数: 3200,
        关联度: 40,
        备注: '闪回片段',
      },
    ],
    备注: '',
    校验状态: 'warn',
    创建来源: 'ai',
    置信度: 0.65,
  },
  {
    id: 4,
    标题: '碧绿玉瓶之谜',
    起始日期: '天元-3-3-3',
    结束日期: '天元-3-6-3',
    起始显示文本: '天元三年三月三天',
    结束显示文本: '天元三年六月三天',
    类型: '伏笔呼应',
    重要性: 'major',
    轴: '主线',
    描述: '神秘老人留下的碧绿玉瓶，内蕴丹药与微光，为日后化解生死之劫埋下关键机缘。',
    角色: ['沈牧', '神秘老人'],
    地点: [],
    势力: [],
    标签: ['#伏笔'],
    章节关联: [],
    伏笔行列表: [
      { 标题: '碧绿玉瓶出现', 类型: '伏笔', 状态: '待回收' },
      { 标题: '丹药救命', 类型: '呼应', 状态: '待回收' },
    ],
    备注: '',
    校验状态: 'ok',
    创建来源: 'ai',
    置信度: 0.88,
  },
  {
    id: 5,
    标题: '师徒深谈',
    起始日期: '天元-3-5-10',
    结束日期: '天元-3-5-10',
    起始显示文本: '天元三年五月十天',
    结束显示文本: '天元三年五月十天',
    类型: '关键对话',
    重要性: 'minor',
    轴: '支线',
    描述: '尘骸子向沈牧透露修仙界的残酷真相，告诫他不可轻信他人。',
    角色: ['沈牧', '尘骸子'],
    地点: ['苍云山秘境'],
    势力: [],
    标签: ['#对话', '#转折'],
    章节关联: [
      { id: 3, 标题: '第三章 初入修仙', 字数: 3500, 关联度: 80, 备注: '' },
    ],
    备注: '',
    校验状态: 'error',
    创建来源: 'sync',
    置信度: 0.42,
  },
  {
    id: 6,
    标题: '落霞镇集市喧嚣',
    起始日期: '天元-3-3-1',
    结束日期: '天元-3-3-1',
    起始显示文本: '天元三年三月一天',
    结束显示文本: '天元三年三月一天',
    类型: '背景事件',
    重要性: 'trivial',
    轴: '主线',
    描述: '落霞镇集市的日常景象，各色人等穿梭其中，暗流涌动。',
    角色: [],
    地点: ['落霞镇'],
    势力: ['离厄矿州附属帮派'],
    标签: ['#背景'],
    章节关联: [],
    备注: '',
    校验状态: 'ok',
    创建来源: 'manual',
  },
  {
    id: 7,
    标题: '三年修炼一瞬',
    起始日期: '天元-3-6-1',
    结束日期: '天元-6-6-1',
    起始显示文本: '天元三年六月一天',
    结束显示文本: '天元六年六月一天',
    类型: '时间跳跃',
    重要性: 'major',
    轴: '主线',
    描述: '沈牧在苍云山秘境闭关修炼三年，修为突飞猛进，已至筑基初期。',
    角色: ['沈牧'],
    地点: ['苍云山秘境'],
    势力: [],
    标签: ['#时间跳跃', '#修炼'],
    章节关联: [
      { id: 4, 标题: '第四章 闭关', 字数: 2000, 关联度: 85, 备注: '' },
    ],
    备注: '',
    校验状态: 'ok',
    创建来源: 'manual',
  },
];

const DEMO_CHAPTERS = [
  { id: 3285121, title: '第1卷 烬骨邪影' },
  { id: 3285791, title: '第一章 善良的人' },
  { id: 3285122, title: '第2卷 魔渊泣血' },
  { id: 3287808, title: '第1章 新章节' },
  { id: 3285123, title: '第3卷 八荒烽火' },
  { id: 3285124, title: '第4卷 天阙惊雷' },
  { id: 3285125, title: '第5卷 伪天血祭' },
  { id: 3285126, title: '第6卷 纪元喋血' },
  { id: 3285127, title: '第7卷 万古执剑' },
];

const DEMO_CHARACTERS = [
  '敖伽',
  '幽泠',
  '寂无渊',
  '尘骸子',
  '梵天漪',
  '沈牧',
  '神秘老人',
  '刘三',
  '赵掌柜',
];

// ─── Helpers ───────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Card title — type-specific */
function getCardTitle(event: 时间线事件): string {
  const { 类型 } = event;
  if (类型 === '伏笔呼应' && event.伏笔行列表 && event.伏笔行列表.length > 0) {
    return event.伏笔行列表[0].标题;
  }
  if (
    类型 === '主线情节' ||
    类型 === '角色弧线' ||
    类型 === '关键对话' ||
    类型 === '闪回' ||
    类型 === '时间跳跃'
  ) {
    if (event.章节关联.length > 0) {
      return event.章节关联[0].标题;
    }
  }
  return event.标题;
}

/** Whether to show tags footer */
function shouldShowFooter(event: 时间线事件): boolean {
  const { 类型 } = event;
  const isNonMainline = 类型 !== '主线情节';
  const hasChapter = event.章节关联.length > 0;
  const hasTags = event.标签.length > 0;
  return (isNonMainline && hasChapter) || hasTags;
}

/** Whether event was AI-generated */
function isAICreated(event: 时间线事件): boolean {
  return event.创建来源 === 'ai' || event.创建来源 === 'sync';
}

/** Whether event has low confidence */
function isLowConfidence(event: 时间线事件): boolean {
  return isAICreated(event) && (event.置信度 ?? 1) < 0.7;
}

// ─── Event Card Content — type-specific rendering ──────────────────

const EventCardContent: React.FC<{ event: 时间线事件 }> = ({ event }) => {
  const { 类型 } = event;

  // 主线情节: chapter block + description + roles + scenes + factions
  if (类型 === '主线情节') {
    return (
      <div className="space-y-1.5">
        {event.章节关联.length > 0 && (
          <div className="chapter-block">
            <div className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] mb-0.5">
              <i className="ri-book-2-line" />
              <span className="font-medium text-[var(--text-primary)] truncate flex-1">
                {event.章节关联[0].标题}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] mb-0.5">
              <i className="ri-calendar-line text-[9px]" />
              <span>
                {event.起始显示文本} ~ {event.结束显示文本}
              </span>
            </div>
            {event.章节摘要 && (
              <p className="text-xs text-[var(--text-secondary)] italic line-clamp-2">
                {event.章节摘要}
              </p>
            )}
          </div>
        )}
        {event.描述 && (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
            {event.描述}
          </p>
        )}
        {event.角色.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.角色.map(r => (
              <span key={r} className="chip-role">
                <i className="ri-user-3-line text-[9px]" />
                {r}
              </span>
            ))}
          </div>
        )}
        {event.地点.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.地点.map(loc => (
              <span key={loc} className="chip-scene">
                <i className="ri-map-pin-2-line text-[9px]" />
                {loc}
              </span>
            ))}
          </div>
        )}
        {event.势力.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.势力.map(f => (
              <span key={f} className="chip-faction">
                <i className="ri-flag-2-line text-[9px]" />
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 角色弧线: roles (user-star) + description + scenes + factions + chapter ref at bottom
  if (类型 === '角色弧线') {
    return (
      <div className="space-y-1.5">
        {event.角色.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.角色.map(r => (
              <span key={r} className="chip-role-lg">
                <i className="ri-user-star-line text-[10px]" />
                {r}
              </span>
            ))}
          </div>
        )}
        {event.描述 && (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
            {event.描述}
          </p>
        )}
        {event.地点.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.地点.map(loc => (
              <span key={loc} className="chip-scene">
                <i className="ri-map-pin-2-line text-[9px]" />
                {loc}
              </span>
            ))}
          </div>
        )}
        {event.势力.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.势力.map(f => (
              <span key={f} className="chip-faction">
                <i className="ri-flag-2-line text-[9px]" />
                {f}
              </span>
            ))}
          </div>
        )}
        {event.章节关联.length > 0 && (
          <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 mt-1">
            <i className="ri-book-2-line text-[9px]" />
            <span className="truncate">{event.章节关联[0].标题}</span>
          </div>
        )}
      </div>
    );
  }

  // 闪回: historical time with rewind icon + description + chapter ref
  if (类型 === '闪回') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1 text-[11px] text-purple-400">
          <i className="ri-rewind-line text-[10px]" />
          <span>
            {event.起始显示文本} ~ {event.结束显示文本}
          </span>
        </div>
        {event.描述 && (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
            {event.描述}
          </p>
        )}
        {event.章节关联.length > 0 && (
          <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 mt-1">
            <i className="ri-book-2-line text-[9px]" />
            <span className="truncate">{event.章节关联[0].标题}</span>
          </div>
        )}
      </div>
    );
  }

  // 伏笔呼应: foreshadowing rows + description
  if (类型 === '伏笔呼应') {
    return (
      <div className="space-y-1.5">
        {event.伏笔行列表 && event.伏笔行列表.length > 0 && (
          <div className="space-y-1">
            {event.伏笔行列表.map((row, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                <i className="ri-bookmark-line text-[10px] text-amber-400" />
                <span className="text-[var(--text-primary)] truncate flex-1">
                  {row.标题}
                </span>
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {row.类型}
                </span>
                <span
                  className={`text-[9px] px-1 py-0.5 rounded ${
                    row.状态 === '已回收'
                      ? 'bg-green-500/20 text-green-400'
                      : row.状态 === '已失效'
                        ? 'bg-gray-500/20 text-gray-400'
                        : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {row.状态}
                </span>
              </div>
            ))}
          </div>
        )}
        {event.描述 && (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
            {event.描述}
          </p>
        )}
      </div>
    );
  }

  // 关键对话: roles with voice icon + description in special div + chapter ref
  if (类型 === '关键对话') {
    return (
      <div className="space-y-1.5">
        {event.角色.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.角色.map(r => (
              <span key={r} className="chip-role">
                <i className="ri-user-voice-line text-[9px]" />
                {r}
              </span>
            ))}
          </div>
        )}
        {event.描述 && (
          <div className="bg-teal-500/10 border border-teal-500/20 rounded-md px-2 py-1">
            <p className="text-xs text-[var(--text-secondary)] line-clamp-3 italic">
              "{event.描述}"
            </p>
          </div>
        )}
        {event.章节关联.length > 0 && (
          <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 mt-1">
            <i className="ri-book-2-line text-[9px]" />
            <span className="truncate">{event.章节关联[0].标题}</span>
          </div>
        )}
      </div>
    );
  }

  // 背景事件: description or summary
  if (类型 === '背景事件') {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
          {event.描述 || event.章节摘要 || ''}
        </p>
      </div>
    );
  }

  // 时间跳跃: time range with skip icon + description + chapter ref
  if (类型 === '时间跳跃') {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1 text-[11px] text-orange-400">
          <i className="ri-skip-forward-line text-[10px]" />
          <span>
            {event.起始显示文本} → {event.结束显示文本}
          </span>
        </div>
        {event.描述 && (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
            {event.描述}
          </p>
        )}
        {event.章节关联.length > 0 && (
          <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 mt-1">
            <i className="ri-book-2-line text-[9px]" />
            <span className="truncate">{event.章节关联[0].标题}</span>
          </div>
        )}
      </div>
    );
  }

  // Default fallback
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
        {event.描述 || event.章节摘要 || ''}
      </p>
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────────

/** Event card -- exact match of HTML .时间线事件卡片 */
const EventCard: React.FC<{
  event: 时间线事件;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReview?: () => void;
}> = ({ event, onClick, onEdit, onDelete, onReview }) => {
  const cfg = TYPE_CONFIG[event.类型] || TYPE_CONFIG['主线情节'];
  const stars = IMPORTANCE_STARS[event.重要性] || 2;
  const cardTitle = getCardTitle(event);
  const showFooter = shouldShowFooter(event);
  const showReview = isAICreated(event);

  // Ring class for validation status
  let ringClass = '';
  if (event.校验状态 === 'error') ringClass = 'ring-1 ring-red-500/50';
  else if (event.校验状态 === 'warn') ringClass = 'ring-1 ring-yellow-500/50';

  return (
    <div className="v-73921766">
      <div
        className={`时间线事件卡片 group relative cursor-pointer ${ringClass}`}
        style={{ '--card-accent': cfg.color } as React.CSSProperties}
        onClick={onClick}
      >
        {/* Header: title + date + actions */}
        <div className="flex items-start gap-2 mb-1.5">
          <h4
            className="flex-1 min-w-0 text-sm font-semibold leading-snug text-[var(--text-primary)] line-clamp-2"
            title={`事件：${event.标题}`}
          >
            {cardTitle}
          </h4>
          <span
            className="chip-date shrink-0"
            title={`${event.起始显示文本 || event.起始日期} ~ ${event.结束显示文本 || event.结束日期}`}
          >
            <i className="ri-calendar-line mr-0.5" />
            {event.起始显示文本 || event.起始日期}
          </span>
          <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="卡片操作按钮 hover:bg-blue-500/20 text-blue-400"
              title="编辑事件"
              onClick={e => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <i className="text-xs ri-edit-line" />
            </button>
            {showReview && (
              <button
                className="卡片操作按钮 hover:bg-yellow-500/20 text-yellow-400"
                title="复核事件"
                onClick={e => {
                  e.stopPropagation();
                  onReview?.();
                }}
              >
                <i className="text-xs ri-shield-check-line" />
              </button>
            )}
            <button
              className="卡片操作按钮 hover:bg-red-500/20 text-red-400"
              title="删除事件"
              onClick={e => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <i className="text-xs ri-delete-bin-line" />
            </button>
          </div>
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <span
            className="chip-type"
            style={{
              backgroundColor: hexToRgba(cfg.color, 0.133),
              color: cfg.color,
              borderColor: hexToRgba(cfg.color, 0.333),
            }}
          >
            <i className={`${cfg.icon} text-[10px]`} /> {cfg.label}
          </span>
          {/* 支线 chip */}
          {event.轴 === '支线' && (
            <span className="chip-type bg-purple-500/15 text-purple-400 border-purple-500/30">
              <i className="ri-git-branch-line text-[10px]" /> 支线
            </span>
          )}
          {/* AI badge */}
          {isAICreated(event) && (
            <span
              className={`chip-type ${
                isLowConfidence(event)
                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                  : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
              }`}
            >
              <i className="ri-robot-2-line text-[10px]" />
              {isLowConfidence(event) ? 'AI·待核' : 'AI'}
            </span>
          )}
          <span
            className="text-[10px] text-yellow-400 tracking-tight"
            title={`重要性：${event.重要性}`}
          >
            {'★'.repeat(stars)}
          </span>
        </div>

        {/* Type-specific content */}
        <EventCardContent event={event} />

        {/* Tags footer — conditional */}
        {showFooter && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--border)]/40 text-[10px] text-[var(--text-secondary)] flex-wrap">
            {/* Chapter reference for non-mainline types */}
            {event.类型 !== '主线情节' && event.章节关联.length > 0 && (
              <span className="flex items-center gap-0.5">
                <i className="ri-book-2-line text-[9px]" />
                <span className="truncate max-w-[120px]">
                  {event.章节关联[0].标题}
                </span>
              </span>
            )}
            {/* Tags — limited to 3 */}
            {event.标签.slice(0, 3).map(t => (
              <span key={t} className="chip-tag">
                {t}
              </span>
            ))}
            {event.标签.length > 3 && (
              <span className="text-[var(--text-secondary)]">
                +{event.标签.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Detail Popover ────────────────────────────────────────────────

const DetailPopover: React.FC<{
  event: 时间线事件;
  onClose: () => void;
  onEdit: () => void;
}> = ({ event, onClose, onEdit }) => {
  const cfg = TYPE_CONFIG[event.类型] || TYPE_CONFIG['主线情节'];

  return createPortal(
    <div className="v-557d8b5a">
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={onClose}
      >
        <div
          className="bg-[var(--bg-darker)] rounded-xl p-5 w-[520px] max-h-[80vh] overflow-y-auto shadow-2xl border border-[var(--border)]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: hexToRgba(cfg.color, 0.2) }}
              >
                <i
                  className={`${cfg.icon} text-sm`}
                  style={{ color: cfg.color }}
                />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  {event.标题}
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  {cfg.label} · {event.起始显示文本}
                </p>
              </div>
            </div>
            <button
              className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
              onClick={onClose}
            >
              <i className="ri-close-line" />
            </button>
          </div>

          {/* Detail content */}
          <div className="space-y-3">
            {event.描述 && (
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  描述
                </label>
                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                  {event.描述}
                </p>
              </div>
            )}

            {event.角色.length > 0 && (
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  角色
                </label>
                <div className="flex flex-wrap gap-1">
                  {event.角色.map(r => (
                    <span key={r} className="chip-role">
                      <i className="ri-user-3-line text-[9px]" />
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {event.地点.length > 0 && (
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  地点
                </label>
                <div className="flex flex-wrap gap-1">
                  {event.地点.map(loc => (
                    <span key={loc} className="chip-scene">
                      <i className="ri-map-pin-2-line text-[9px]" />
                      {loc}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {event.势力.length > 0 && (
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  势力
                </label>
                <div className="flex flex-wrap gap-1">
                  {event.势力.map(f => (
                    <span key={f} className="chip-faction">
                      <i className="ri-flag-2-line text-[9px]" />
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {event.标签.length > 0 && (
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  标签
                </label>
                <div className="flex flex-wrap gap-1">
                  {event.标签.map(t => (
                    <span key={t} className="chip-tag">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
              <span>
                <i className="ri-calendar-line mr-1" />
                {event.起始显示文本} ~ {event.结束显示文本}
              </span>
              <span>
                <i className="ri-map-pin-line mr-1" />
                {event.轴}
              </span>
              <span>
                <i className="ri-star-line mr-1" />
                {event.重要性}
              </span>
            </div>

            {isAICreated(event) && (
              <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                <i className="ri-robot-2-line" />
                <span>
                  AI生成 · 置信度: {((event.置信度 ?? 1) * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 mt-5">
            <button
              className="px-4 py-2 text-sm rounded-lg hover:bg-[var(--bg-card)] transition-colors"
              onClick={onClose}
            >
              关闭
            </button>
            <button
              className="px-4 py-2 text-sm rounded-lg btn-primary"
              onClick={() => {
                onClose();
                onEdit();
              }}
            >
              <i className="ri-edit-line mr-1" />
              编辑
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Edit/Add Event Modal (shared form) ────────────────────────────

const EditEventModal: React.FC<{
  event: 时间线事件 | null; // null = add new, non-null = edit existing
  onSave: (ev: 时间线事件) => void;
  onClose: () => void;
}> = ({ event, onSave, onClose }) => {
  const isEdit = event !== null;
  const [form, setForm] = useState({
    标题: event?.标题 ?? '',
    描述: event?.描述 ?? '',
    起始日期: event?.起始日期 ?? '',
    结束日期: event?.结束日期 ?? '',
    类型: event?.类型 ?? ('主线情节' as 事件类型),
    重要性: event?.重要性 ?? ('major' as 重要性),
    起始显示文本: event?.起始显示文本 ?? '',
    结束显示文本: event?.结束显示文本 ?? '',
    轴: event?.轴 ?? ('主线' as 所属轴),
    关联章节: event?.章节关联?.[0]?.id?.toString() ?? '',
    标签: event?.标签?.join(', ') ?? '',
  });
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>(
    event?.角色 ?? []
  );

  const set = (key: string, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const toggleCharacter = (name: string) => {
    setSelectedCharacters(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  const handleSave = () => {
    if (!form.标题.trim()) return;
    onSave({
      id: event?.id ?? Date.now(),
      标题: form.标题,
      起始日期: form.起始日期,
      结束日期: form.结束日期,
      起始显示文本: form.起始显示文本 || form.起始日期,
      结束显示文本: form.结束显示文本 || form.结束日期,
      类型: form.类型,
      重要性: form.重要性,
      轴: form.轴,
      描述: form.描述,
      角色: selectedCharacters,
      地点: [],
      势力: [],
      标签: form.标签
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => (t.startsWith('#') ? t : `#${t}`)),
      章节关联: [],
      备注: '',
      创建来源: event?.创建来源 ?? 'manual',
      校验状态: event?.校验状态 ?? 'ok',
      置信度: event?.置信度,
    });
  };

  const canSave = form.标题.trim().length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-darker)] rounded-xl p-6 w-[500px] max-h-[80vh] overflow-y-auto shadow-2xl border border-[var(--border)]"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold">
          {isEdit ? '编辑事件' : '新建事件'}
        </h3>
        <div className="space-y-3">
          {/* Title */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              事件标题 *
            </label>
            <input
              type="text"
              className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2"
              placeholder="输入事件标题"
              value={form.标题}
              onChange={e => set('标题', e.target.value)}
            />
          </div>
          {/* Description */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              描述
            </label>
            <textarea
              rows={3}
              className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 resize-none"
              placeholder="事件描述"
              value={form.描述}
              onChange={e => set('描述', e.target.value)}
            />
          </div>
          {/* Start / End date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                起始日期
              </label>
              <input
                type="text"
                className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2"
                placeholder="如: 天元-3-3-8"
                value={form.起始日期}
                onChange={e => set('起始日期', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                结束日期
              </label>
              <input
                type="text"
                className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2"
                placeholder="如: 天元-3-3-9"
                value={form.结束日期}
                onChange={e => set('结束日期', e.target.value)}
              />
            </div>
          </div>
          {/* Type / Importance */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                事件类型
              </label>
              <select
                className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2"
                value={form.类型}
                onChange={e => set('类型', e.target.value)}
              >
                {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                重要性
              </label>
              <select
                className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2"
                value={form.重要性}
                onChange={e => set('重要性', e.target.value)}
              >
                <option value="major">重要</option>
                <option value="minor">一般</option>
                <option value="trivial">次要</option>
              </select>
            </div>
          </div>
          {/* Start/End display text */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                起始显示文本
              </label>
              <input
                type="text"
                className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2"
                placeholder="如: 天元三年三月初八"
                value={form.起始显示文本}
                onChange={e => set('起始显示文本', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                结束显示文本
              </label>
              <input
                type="text"
                className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2"
                placeholder="如: 天元三年三月初九"
                value={form.结束显示文本}
                onChange={e => set('结束显示文本', e.target.value)}
              />
            </div>
          </div>
          {/* Axis */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              所属轴
            </label>
            <select
              className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2"
              value={form.轴}
              onChange={e => set('轴', e.target.value)}
            >
              <option value="主线">主线</option>
              <option value="支线">支线</option>
            </select>
          </div>
          {/* Chapter link */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              关联章节
            </label>
            <select
              className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2"
              value={form.关联章节}
              onChange={e => set('关联章节', e.target.value)}
            >
              <option value="">无</option>
              {DEMO_CHAPTERS.map(ch => (
                <option key={ch.id} value={String(ch.id)}>
                  {ch.title}
                </option>
              ))}
            </select>
          </div>
          {/* Characters */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              关联角色
            </label>
            <div className="flex flex-wrap gap-1">
              {DEMO_CHARACTERS.map(name => {
                const isSelected = selectedCharacters.includes(name);
                return (
                  <label
                    key={name}
                    className={`text-xs px-2 py-1 rounded-full cursor-pointer border transition-colors ${
                      isSelected
                        ? 'bg-teal-500/20 border-teal-500/30 text-teal-400'
                        : 'bg-[var(--bg-card)] border-[var(--border)]'
                    }`}
                    onClick={() => toggleCharacter(name)}
                  >
                    {name}
                  </label>
                );
              })}
            </div>
          </div>
          {/* Foreshadowing */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              关联伏笔
            </label>
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-[var(--text-secondary)]">
                暂无伏笔
              </span>
            </div>
          </div>
          {/* Tags */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              标签
            </label>
            <input
              type="text"
              className="w-full text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2"
              placeholder="用逗号分隔，如: 冲突,高潮"
              value={form.标签}
              onChange={e => set('标签', e.target.value)}
            />
          </div>
        </div>
        {/* Footer buttons */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            className="px-4 py-2 text-sm rounded-lg hover:bg-[var(--bg-card)] transition-colors"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="px-4 py-2 text-sm rounded-lg btn-primary"
            disabled={!canSave}
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Main component ────────────────────────────────────────────────

export const TimelinePanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  // State
  const [typeFilter, setTypeFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [events, setEvents] = useState<时间线事件[]>(DEMO_EVENTS);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<时间线事件 | null>(null);
  const [detailEvent, setDetailEvent] = useState<时间线事件 | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(
    new Set()
  );

  /* ─── Flat data for AI field/full generation ─── */
  const [flatData, setFlatData] = useState<Record<string, string>>({});

  const fetchSystemPrompt = useSystemPrompt(
    'AI生成时间线',
    TIMELINE_SYSTEM_PROMPT
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
    module: 'timeline',
    projectId,
    data: flatData,
    setData: setFlatData,
    fetchSystemPrompt,
    buildExistingStr,
    schema: timelineSchema,
  });

  const fullGen = useAIFullGenerate({
    module: 'timeline',
    projectId,
    data: flatData,
    setData: setFlatData,
    fetchSystemPrompt,
    parseResponse: (text: string) => {
      const result = parseTimelineResponse(text);
      if (!result) return null;
      const filtered: Record<string, string> = {};
      for (const [k, v] of Object.entries(result)) {
        if (typeof v === 'string') filtered[k] = v;
      }
      return filtered;
    },
    schema: timelineSchema,
    buildUserMessage: (type, desc) =>
      `请生成${type}类型的时间线设计。\n\n${desc ? `用户补充要求：${desc}\n\n` : ''}已有设定：\n${buildExistingStr() || '无'}\n\n请按管道格式输出，每行一个字段：核心时间线|<内容>\n重要转折点|<内容>\n暗线伏笔|<内容>`,
  });

  // Filter events
  const filteredEvents = useMemo(() => {
    let result = events;
    if (typeFilter) {
      result = result.filter(e => e.类型 === typeFilter);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(
        e =>
          e.标题.toLowerCase().includes(q) ||
          e.描述.toLowerCase().includes(q) ||
          e.标签.some(t => t.toLowerCase().includes(q)) ||
          e.角色.some(r => r.toLowerCase().includes(q)) ||
          e.地点.some(l => l.toLowerCase().includes(q))
      );
    }
    return result;
  }, [events, typeFilter, searchText]);

  // Cluster events by 起始显示文本
  const clusters = useMemo(() => {
    const groups: { date: string; events: 时间线事件[] }[] = [];
    for (const ev of filteredEvents) {
      const dateKey = ev.起始显示文本 || ev.起始日期;
      const existing = groups.find(g => g.date === dateKey);
      if (existing) {
        existing.events.push(ev);
      } else {
        groups.push({ date: dateKey, events: [ev] });
      }
    }
    return groups;
  }, [filteredEvents]);

  // Conflict count — events with error or warn status
  const conflictCount = useMemo(() => {
    return events.filter(e => e.校验状态 === 'error' || e.校验状态 === 'warn')
      .length;
  }, [events]);

  const toggleCluster = useCallback((idx: number) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handleSaveEvent = useCallback((ev: 时间线事件) => {
    setEvents(prev => {
      const exists = prev.find(e => e.id === ev.id);
      if (exists) {
        return prev.map(e => (e.id === ev.id ? ev : e));
      }
      return [...prev, ev];
    });
    setShowModal(false);
    setEditingEvent(null);
    // Show "已保存" animation
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 1500);
  }, []);

  const handleDeleteEvent = useCallback((id: number) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  const handleOpenAdd = useCallback(() => {
    setEditingEvent(null);
    setShowModal(true);
  }, []);

  const handleOpenEdit = useCallback((ev: 时间线事件) => {
    setEditingEvent(ev);
    setShowModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setEditingEvent(null);
  }, []);

  return createPortal(
    <>
      <div className="v-bf76b7c5">
        <div
          className="时间线侧边栏容器 fixed top-0 bottom-0 z-40 flex"
          style={{ left: leftOffset }}
        >
          {/* Main panel column */}
          <div
            className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
            style={{ width: 520 }}
          >
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center border rounded-lg shadow-inner w-9 h-9 bg-gradient-to-br from-teal-500/30 to-teal-600/10 border-teal-500/20">
                    <i
                      className="text-lg text-teal-400 ri-time-line"
                      style={{
                        filter:
                          'drop-shadow(rgba(20, 184, 166, 0.5) 0px 0px 6px)',
                      }}
                    />
                  </div>
                  <div className="relative">
                    <h2 className="text-base font-semibold">时间线</h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {' '}
                      共 {events.length} 个事件{' '}
                    </p>
                    {/* 已保存 animation */}
                    {savedMessage && (
                      <span
                        className="absolute -top-4 left-0 text-[10px] text-green-400 animate-pulse"
                        style={{
                          animation: 'fadeInOut 1.5s ease-in-out forwards',
                        }}
                      >
                        <i className="ri-check-line mr-0.5" />
                        已保存
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-2.5 py-1 text-xs bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 rounded-lg transition-colors flex items-center gap-1"
                    title="AI完整生成"
                    onClick={fullGen.open}
                  >
                    <i className="ri-sparkles-line" /> AI完整生成
                  </button>
                  <button
                    className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                    title="新建事件"
                    onClick={handleOpenAdd}
                  >
                    <i className="ri-add-line" />
                  </button>
                  <button
                    className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                    title="关闭面板"
                    onClick={onClose}
                  >
                    <i className="ri-close-line" />
                  </button>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="shrink-0 px-4 py-2 border-b border-[var(--border)] flex items-center gap-2 flex-wrap">
              <select
                className="text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1"
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
              >
                <option value="">全部类型</option>
                {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="搜索事件..."
                className="flex-1 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 min-w-[100px]"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
              <button
                className="p-1 hover:bg-[var(--bg-card)] rounded transition-colors"
                title="刷新"
                onClick={() => setEvents(prev => [...prev])}
              >
                <i className="text-sm ri-refresh-line" />
              </button>
            </div>

            {/* Timeline content */}
            <div className="flex-1 p-4 overflow-y-auto">
              {filteredEvents.length === 0 ? (
                /* Empty state */
                <div className="py-12 text-center">
                  <div className="空态图状 mx-auto mb-4">
                    <i
                      className="text-5xl text-teal-400 ri-time-line"
                      style={{
                        filter:
                          'drop-shadow(rgba(20, 184, 166, 0.5) 0px 0px 12px)',
                      }}
                    />
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mb-4">
                    {events.length === 0 ? '尚未建立时间线' : '没有匹配的事件'}
                  </p>
                  <button
                    className="px-4 py-2 text-sm rounded-lg btn-primary"
                    onClick={handleOpenAdd}
                  >
                    <i className="mr-1 ri-add-line" />
                    {events.length === 0 ? '添加第一个事件' : '添加事件'}
                  </button>
                </div>
              ) : (
                /* Timeline with clustered events */
                <div className="relative">
                  {/* 时间轴竖线 */}
                  <div className="时间轴竖线 absolute top-0 bottom-0" />
                  <div className="space-y-3">
                    {clusters.map((cluster, clusterIdx) => {
                      const isCluster = cluster.events.length > 1;
                      const isExpanded = expandedClusters.has(clusterIdx);
                      const firstEvent = cluster.events[0];
                      const firstCfg =
                        TYPE_CONFIG[firstEvent.类型] || TYPE_CONFIG['主线情节'];

                      // Span description between date groups
                      const spanEl =
                        clusterIdx > 0 ? (
                          <div className="flex items-center gap-2 pl-10 py-1 text-[10px] text-[var(--text-secondary)]">
                            <div className="h-px flex-1 bg-[var(--border)]/40" />
                            <span>间隔 {clusterIdx + 1}</span>
                            <div className="h-px flex-1 bg-[var(--border)]/40" />
                          </div>
                        ) : null;

                      return (
                        <React.Fragment key={`cluster-${clusterIdx}`}>
                          {spanEl}
                          <div className="relative pl-10 group">
                            {/* Cluster/node dot */}
                            <div
                              className={`节点圆点 absolute left-0 rounded-full flex items-center justify-center cursor-pointer ${
                                isCluster
                                  ? 'w-[30px] h-[30px] is-cluster'
                                  : 'w-[26px] h-[26px]'
                              }`}
                              title={`${cluster.date} — ${cluster.events.length} 个事件`}
                              style={{
                                backgroundColor: isCluster
                                  ? '#6366f1'
                                  : firstCfg.color,
                                boxShadow: isCluster
                                  ? `0 0 0 3px rgba(99, 102, 241, 0.2), 0 0 0 1px var(--bg-darker), 0 0 12px rgba(99, 102, 241, 0.26)`
                                  : `0 0 0 3px ${hexToRgba(firstCfg.color, 0.2)}, 0 0 0 1px var(--bg-darker), 0 0 12px ${hexToRgba(firstCfg.color, 0.26)}`,
                              }}
                              onClick={() =>
                                isCluster && toggleCluster(clusterIdx)
                              }
                            >
                              {isCluster ? (
                                <span className="text-[11px] text-white font-bold">
                                  {cluster.events.length}
                                </span>
                              ) : (
                                <i
                                  className={`${firstCfg.icon} text-[11px] text-white`}
                                />
                              )}
                            </div>

                            {/* 时间戳徽章 */}
                            <div className="时间戳徽章 mb-1.5">
                              <i className="ri-calendar-line text-[10px]" />
                              <span>{cluster.date}</span>
                              {isCluster && (
                                <span className="ml-1 text-[10px] text-[var(--text-secondary)]">
                                  ({cluster.events.length} 个事件)
                                </span>
                              )}
                            </div>

                            {/* Event cards */}
                            <div className="space-y-2">
                              {isCluster && !isExpanded ? (
                                /* Collapsed cluster: show summary line */
                                <div
                                  className="text-xs text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors py-1"
                                  onClick={() => toggleCluster(clusterIdx)}
                                >
                                  <i className="ri-arrow-right-s-line mr-1" />
                                  点击展开 {cluster.events.length} 个事件...
                                </div>
                              ) : (
                                cluster.events.map(ev => (
                                  <EventCard
                                    key={ev.id}
                                    event={ev}
                                    onClick={() => setDetailEvent(ev)}
                                    onEdit={() => handleOpenEdit(ev)}
                                    onDelete={() => handleDeleteEvent(ev.id)}
                                    onReview={() => {
                                      // Mark as reviewed (manual)
                                      setEvents(prev =>
                                        prev.map(e =>
                                          e.id === ev.id
                                            ? {
                                                ...e,
                                                创建来源: 'manual' as 创建来源,
                                                校验状态: 'ok' as 校验状态,
                                              }
                                            : e
                                        )
                                      );
                                    }}
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-4 py-2 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
              <span>{events.length} 个事件</span>
              {conflictCount > 0 && (
                <span className="flex items-center gap-1 text-red-400">
                  <i className="ri-alert-line" />
                  {conflictCount} 个冲突
                </span>
              )}
            </div>
          </div>

          {/* Resize handle */}
          <div className="w-1 cursor-col-resize hover:bg-[var(--primary)]/30 transition-colors" />
        </div>
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <EditEventModal
          event={editingEvent}
          onSave={handleSaveEvent}
          onClose={handleCloseModal}
        />
      )}

      {/* Detail popover */}
      {detailEvent && (
        <DetailPopover
          event={detailEvent}
          onClose={() => setDetailEvent(null)}
          onEdit={() => {
            const ev = detailEvent;
            setDetailEvent(null);
            handleOpenEdit(ev);
          }}
        />
      )}

      {/* AI Full Generation Dialog */}
      <AIGenerationDialog
        title="AI生成时间线"
        subtitle="选择类型或描述你的构想，AI将为你构建完整的时间线设计"
        phase={fullGen.phase}
        genType={fullGen.genType}
        setGenType={fullGen.setGenType}
        genDesc={fullGen.genDesc}
        setGenDesc={fullGen.setGenDesc}
        streamText={fullGen.streamText}
        parsed={fullGen.parsed}
        typeOptions={timelineTypeOptions}
        quickTemplates={timelineQuickTemplates}
        onStart={fullGen.start}
        onAdopt={fullGen.adopt}
        onClose={fullGen.close}
      />
    </>,
    document.body
  );
};

export default TimelinePanel;
