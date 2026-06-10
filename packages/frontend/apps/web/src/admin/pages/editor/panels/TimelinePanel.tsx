import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE, getAuthHeaders } from '../useWorldApi';

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

/** Calendar config — matches Vue历法数据 */
interface 纪年条目 {
  名称: string;
  序号: number;
  描述: string;
}

interface 时长模板条目 {
  类型: string;
  默认天数: number;
}

interface 历法数据 {
  历法名称: string;
  纪年体系: 纪年条目[];
  故事起点日期: string;
  每年月数: number;
  每月天数: number;
  每日时辰数: number;
  时辰名称: string[];
  时长模板: 时长模板条目[];
  显示格式: '中式' | '西式';
}

/** Date parsed from format like 天元-3-3-3 */
interface 解析日期 {
  纪年: string;
  年: number;
  月: number;
  日: number;
}

// ─── Date utilities ────────────────────────────────────────────────

/** Parse date string like 天元-3-3-3 into structured parts */
function 解析日期字符串(dateStr: string): 解析日期 | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length < 4) return null;
  return {
    纪年: parts[0],
    年: parseInt(parts[1], 10) || 0,
    月: parseInt(parts[2], 10) || 0,
    日: parseInt(parts[3], 10) || 0,
  };
}

/** Compute sort value from parsed date — matches Vue 日期转排序值.
 *  Sort chain: 纪年序号 (major) -> 年 -> 月 -> 日
 *  Formula: (纪年序号 * 1e8 + 年 * 1e4 + 月 * 100 + 日) * 100
 */
export function 计算排序值(
  dateStr: string,
  历法配置: 历法数据 | null = null
): number {
  const parsed = 解析日期字符串(dateStr);
  if (!parsed) return 0;
  // Look up 纪年序号 from calendar config's 纪年体系 list — matches Vue Z()
  const eraEntry = (历法配置?.纪年体系 || []).find(e => e.名称 === parsed.纪年);
  const eraIndex = eraEntry?.序号 || 1;
  // Matches Vue oe(): (纪年序号 * 1e8 + 年 * 1e4 + 月 * 100 + 日) * 100
  return (eraIndex * 1e8 + parsed.年 * 1e4 + parsed.月 * 100 + parsed.日) * 100;
}

/** Chinese number conversion for year/month — matches Vue j() */
function toChineseNum(n: number): string {
  const digits = [
    '',
    '一',
    '二',
    '三',
    '四',
    '五',
    '六',
    '七',
    '八',
    '九',
    '十',
  ];
  if (n <= 10) return digits[n];
  if (n < 20) return `十${digits[n - 10]}`;
  if (n < 100)
    return `${digits[Math.floor(n / 10)]}十${n % 10 ? digits[n % 10] : ''}`;
  return String(n);
}

/** Chinese day format — matches Vue j() 日 function */
function toChineseDay(n: number): string {
  const digits = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (n <= 10) return `初${digits[n - 1] || ''}`;
  if (n < 20) return `十${digits[n - 11] || ''}`;
  if (n === 20) return '二十';
  if (n < 30) return `廿${digits[n - 21] || ''}`;
  if (n === 30) return '三十';
  return String(n);
}

/** Format display text from date string using calendar config — matches Vue j() */
function 格式化日期显示(dateStr: string, 历法配置: 历法数据 | null): string {
  const parsed = 解析日期字符串(dateStr);
  if (!parsed) return dateStr;
  const format = 历法配置?.显示格式 || '中式';
  if (format === '西式') {
    return `${parsed.纪年}${parsed.年}年${parsed.月}月${parsed.日}日`;
  }
  // 中式 format — matches Vue j()
  return `${parsed.纪年}${toChineseNum(parsed.年)}年${toChineseNum(parsed.月)}月${toChineseDay(parsed.日)}`;
}

// ─── Type config ───────────────────────────────────────────────────

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

const EventCardContent: React.FC<{
  event: 时间线事件;
  历法: 历法数据 | null;
}> = ({ event, 历法 }) => {
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
                {event.起始显示文本 || 格式化日期显示(event.起始日期, 历法)} ~{' '}
                {event.结束显示文本 || 格式化日期显示(event.结束日期, 历法)}
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
            {event.起始显示文本 || 格式化日期显示(event.起始日期, 历法)} ~{' '}
            {event.结束显示文本 || 格式化日期显示(event.结束日期, 历法)}
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
            {event.起始显示文本 || 格式化日期显示(event.起始日期, 历法)} →{' '}
            {event.结束显示文本 || 格式化日期显示(event.结束日期, 历法)}
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
  历法: 历法数据 | null;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReview?: () => void;
}> = ({ event, 历法, onClick, onEdit, onDelete, onReview }) => {
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
            title={`${event.起始显示文本 || 格式化日期显示(event.起始日期, 历法)} ~ ${event.结束显示文本 || 格式化日期显示(event.结束日期, 历法)}`}
          >
            <i className="ri-calendar-line mr-0.5" />
            {event.起始显示文本 || 格式化日期显示(event.起始日期, 历法)}
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
        <EventCardContent event={event} 历法={历法} />

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
  历法: 历法数据 | null;
  onClose: () => void;
  onEdit: () => void;
}> = ({ event, 历法, onClose, onEdit }) => {
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
                  {cfg.label} ·{' '}
                  {event.起始显示文本 || 格式化日期显示(event.起始日期, 历法)}
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
                {event.起始显示文本 ||
                  格式化日期显示(event.起始日期, 历法)} ~{' '}
                {event.结束显示文本 || 格式化日期显示(event.结束日期, 历法)}
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

// ─── Calendar Config Modal ─────────────────────────────────────────

const CalendarConfigModal: React.FC<{
  历法: 历法数据 | null;
  onSave: (data: 历法数据) => Promise<boolean>;
  onClose: () => void;
}> = ({ 历法, onSave, onClose }) => {
  const [form, setForm] = useState<历法数据>({
    历法名称: 历法?.历法名称 ?? '',
    纪年体系: Array.isArray(历法?.纪年体系)
      ? [...历法.纪年体系]
      : [{ 名称: '天元', 序号: 1, 描述: '' }],
    故事起点日期: 历法?.故事起点日期 ?? '',
    每年月数: 历法?.每年月数 ?? 12,
    每月天数: 历法?.每月天数 ?? 30,
    每日时辰数: 历法?.每日时辰数 ?? 12,
    时辰名称: Array.isArray(历法?.时辰名称) ? [...历法.时辰名称] : [],
    时长模板: Array.isArray(历法?.时长模板) ? [...历法.时长模板] : [],
    显示格式: 历法?.显示格式 ?? '中式',
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof 历法数据>(key: K, value: 历法数据[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const addEra = () => {
    setForm(prev => ({
      ...prev,
      纪年体系: [
        ...prev.纪年体系,
        { 名称: '', 序号: prev.纪年体系.length + 1, 描述: '' },
      ],
    }));
  };

  const removeEra = (idx: number) => {
    setForm(prev => {
      const list = prev.纪年体系.filter((_, i) => i !== idx);
      // Re-index
      return { ...prev, 纪年体系: list.map((e, i) => ({ ...e, 序号: i + 1 })) };
    });
  };

  const updateEra = (
    idx: number,
    field: keyof 纪年条目,
    value: string | number
  ) => {
    setForm(prev => {
      const list = [...prev.纪年体系];
      list[idx] = { ...list[idx], [field]: value };
      return { ...prev, 纪年体系: list };
    });
  };

  const addTemplate = () => {
    setForm(prev => ({
      ...prev,
      时长模板: [...(prev.时长模板 || []), { 类型: '', 默认天数: 1 }],
    }));
  };

  const removeTemplate = (idx: number) => {
    setForm(prev => ({
      ...prev,
      时长模板: prev.时长模板.filter((_, i) => i !== idx),
    }));
  };

  const updateTemplate = (
    idx: number,
    field: keyof 时长模板条目,
    value: string | number
  ) => {
    setForm(prev => {
      const list = [...prev.时长模板];
      list[idx] = { ...list[idx], [field]: value };
      return { ...prev, 时长模板: list };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-darker)] rounded-xl p-6 w-[500px] max-h-[80vh] overflow-y-auto shadow-2xl border border-[var(--border)]"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold">历法配置</h3>
        <div className="space-y-3">
          {/* 历法名称 */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              历法名称
            </label>
            <input
              type="text"
              className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-3 py-1.5 text-sm focus:border-cyan-500/50 transition-colors"
              placeholder="如：天元历、星历、皇历..."
              value={form.历法名称}
              onChange={e => set('历法名称', e.target.value)}
            />
          </div>
          {/* 纪年体系 — dynamic list matching Vue */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[var(--text-secondary)]">
                纪年体系
              </label>
              <button
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                onClick={addEra}
              >
                <i className="ri-add-line" />
                添加
              </button>
            </div>
            {form.纪年体系.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] py-1">
                暂无纪年，点击添加
              </div>
            ) : (
              <div className="space-y-1.5">
                {form.纪年体系.map((era, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="text-xs text-[var(--text-muted)] w-4 text-center">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      className="flex-1 bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-cyan-500/50 transition-colors"
                      placeholder="纪年名称"
                      value={era.名称}
                      onChange={e => updateEra(idx, '名称', e.target.value)}
                    />
                    <input
                      type="text"
                      className="flex-1 bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-cyan-500/50 transition-colors"
                      placeholder="描述（可选）"
                      value={era.描述}
                      onChange={e => updateEra(idx, '描述', e.target.value)}
                    />
                    <button
                      className="text-red-400 hover:text-red-300 p-0.5"
                      onClick={() => removeEra(idx)}
                    >
                      <i className="ri-close-line text-sm" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* 故事起点日期 */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              故事起点日期
            </label>
            <input
              type="text"
              className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-3 py-1.5 text-sm focus:border-cyan-500/50 transition-colors"
              placeholder="格式：纪年名-年-月-日，如 天元-3-3-8"
              value={form.故事起点日期}
              onChange={e => set('故事起点日期', e.target.value)}
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              格式示例：天元-3-3-8 表示天元三年三月初八
            </p>
          </div>
          {/* 每年月数 / 每月天数 / 每日时辰数 — 3 columns */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                每年月数
              </label>
              <input
                type="number"
                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-center focus:border-cyan-500/50 transition-colors"
                min={1}
                max={99}
                value={form.每年月数}
                onChange={e => set('每年月数', parseInt(e.target.value) || 12)}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                每月天数
              </label>
              <input
                type="number"
                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-center focus:border-cyan-500/50 transition-colors"
                min={1}
                max={99}
                value={form.每月天数}
                onChange={e => set('每月天数', parseInt(e.target.value) || 30)}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                每日时辰
              </label>
              <input
                type="number"
                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-center focus:border-cyan-500/50 transition-colors"
                min={1}
                max={24}
                value={form.每日时辰数}
                onChange={e =>
                  set('每日时辰数', parseInt(e.target.value) || 12)
                }
              />
            </div>
          </div>
          {/* 显示格式 — two buttons matching Vue */}
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              显示格式
            </label>
            <div className="flex gap-2">
              <button
                className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                  form.显示格式 === '中式'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'bg-[var(--bg-dark)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-cyan-500/30'
                }`}
                onClick={() => set('显示格式', '中式')}
              >
                中式（天元三年三月初八）
              </button>
              <button
                className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                  form.显示格式 === '西式'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'bg-[var(--bg-dark)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-cyan-500/30'
                }`}
                onClick={() => set('显示格式', '西式')}
              >
                西式（天元3年3月8日）
              </button>
            </div>
          </div>
          {/* 时长模板 — dynamic list matching Vue */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-[var(--text-secondary)]">
                时长模板
              </label>
              <button
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5"
                onClick={addTemplate}
              >
                <i className="ri-add-line" />
                添加
              </button>
            </div>
            {!form.时长模板 || form.时长模板.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] py-1">
                暂无模板，可添加常用时长（如赶路、1天）
              </div>
            ) : (
              <div className="space-y-1.5">
                {form.时长模板.map((tpl, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      className="flex-1 bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1 text-xs focus:border-cyan-500/50 transition-colors"
                      placeholder="事件类型"
                      value={tpl.类型}
                      onChange={e =>
                        updateTemplate(idx, '类型', e.target.value)
                      }
                    />
                    <input
                      type="number"
                      className="w-16 bg-[var(--bg-dark)] border border-[var(--border)] rounded px-2 py-1 text-xs text-center focus:border-cyan-500/50 transition-colors"
                      placeholder="天数"
                      min={1}
                      value={tpl.默认天数}
                      onChange={e =>
                        updateTemplate(
                          idx,
                          '默认天数',
                          parseInt(e.target.value) || 1
                        )
                      }
                    />
                    <span className="text-xs text-[var(--text-muted)]">天</span>
                    <button
                      className="text-red-400 hover:text-red-300 p-0.5"
                      onClick={() => removeTemplate(idx)}
                    >
                      <i className="ri-close-line text-sm" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? '保存中...' : '保存'}
          </button>
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

// ─── Timeline context fetch ────────────────────────────────────────

async function fetchTimelineContext(
  projectId: number,
  eventType: string
): Promise<any | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/timeline/context/${projectId}/${eventType}`,
      { headers: getAuthHeaders() }
    );
    const result = await res.json();
    if (result.success && result.data) return result.data;
  } catch {}
  return null;
}

// ─── Main component ────────────────────────────────────────────────

export const TimelinePanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  // State
  const [typeFilter, setTypeFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [events, setEvents] = useState<时间线事件[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<时间线事件 | null>(null);
  const [detailEvent, setDetailEvent] = useState<时间线事件 | null>(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const [expandedClusters, setExpandedClusters] = useState<Set<number>>(
    new Set()
  );

  // Calendar state
  const [历法, set历法] = useState<历法数据 | null>(null);
  const [loading历法, setLoading历法] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  // Load calendar + events on mount
  useEffect(() => {
    if (!projectId) return;

    // Load calendar
    setLoading历法(true);
    fetch(`${API_BASE}/api/timeline/calendar/${projectId}`, {
      headers: getAuthHeaders(),
    })
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data) set历法(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading历法(false));

    // Load events
    fetch(`${API_BASE}/api/timeline/events/${projectId}`, {
      headers: getAuthHeaders(),
    })
      .then(r => r.json())
      .then(res => {
        if (res.success && Array.isArray(res.data)) setEvents(res.data);
      })
      .catch(() => {});
  }, [projectId]);

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

  // Cluster events by 起始显示文本, sort within cluster by sort value
  const clusters = useMemo(() => {
    const groups: { date: string; events: 时间线事件[] }[] = [];
    for (const ev of filteredEvents) {
      const dateKey = ev.起始显示文本 || 格式化日期显示(ev.起始日期, 历法);
      const existing = groups.find(g => g.date === dateKey);
      if (existing) {
        existing.events.push(ev);
      } else {
        groups.push({ date: dateKey, events: [ev] });
      }
    }
    // Sort events within each cluster by 计算排序值 (era-aware)
    for (const group of groups) {
      group.events.sort(
        (a, b) => 计算排序值(a.起始日期, 历法) - 计算排序值(b.起始日期, 历法)
      );
    }
    // Sort clusters by their earliest event's sort value — matches Vue 聚簇事件列表
    groups.sort((a, b) => {
      const aMin = Math.min(...a.events.map(e => 计算排序值(e.起始日期, 历法)));
      const bMin = Math.min(...b.events.map(e => 计算排序值(e.起始日期, 历法)));
      return aMin - bMin;
    });
    return groups;
  }, [filteredEvents, 历法]);

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

  const handleSaveEvent = useCallback(
    async (ev: 时间线事件) => {
      if (!projectId) return;
      try {
        const exists = events.find(e => e.id === ev.id);
        if (exists) {
          // Update
          await fetch(`${API_BASE}/api/timeline/events/${projectId}/${ev.id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(ev),
          });
        } else {
          // Create
          const res = await fetch(
            `${API_BASE}/api/timeline/events/${projectId}`,
            {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify(ev),
            }
          );
          const result = await res.json();
          if (result.success && result.data) {
            ev = result.data;
          }
        }
        setEvents(prev => {
          const idx = prev.findIndex(e => e.id === ev.id);
          return idx >= 0
            ? prev.map(e => (e.id === ev.id ? ev : e))
            : [...prev, ev];
        });
      } catch {
        // Fallback: update local state anyway
        setEvents(prev => {
          const idx = prev.findIndex(e => e.id === ev.id);
          return idx >= 0
            ? prev.map(e => (e.id === ev.id ? ev : e))
            : [...prev, ev];
        });
      }
      setShowModal(false);
      setEditingEvent(null);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 1500);
    },
    [projectId, events]
  );

  const handleDeleteEvent = useCallback(
    async (id: number) => {
      if (!projectId) return;
      try {
        await fetch(`${API_BASE}/api/timeline/events/${projectId}/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
      } catch {}
      setEvents(prev => prev.filter(e => e.id !== id));
    },
    [projectId]
  );

  const handleSave历法 = useCallback(
    async (data: 历法数据) => {
      if (!projectId) return false;
      setSaving(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/timeline/calendar/${projectId}`,
          {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(data),
          }
        );
        const result = await res.json();
        if (result.success && result.data) {
          set历法(result.data);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
    [projectId]
  );

  const validateTimeline = useCallback(async () => {
    if (!projectId) return [];
    try {
      const res = await fetch(
        `${API_BASE}/api/timeline/validate/${projectId}`,
        {
          headers: getAuthHeaders(),
        }
      );
      const result = await res.json();
      if (result.success && Array.isArray(result.data)) return result.data;
    } catch {}
    return [];
  }, [projectId]);

  const handleDistillTimeline = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      // Optionally fetch context for all event types before distilling
      const allTypes = Object.keys(TYPE_CONFIG);
      const contextPromises = allTypes.map(t =>
        fetchTimelineContext(projectId, t)
      );
      await Promise.allSettled(contextPromises);

      await fetch(`${API_BASE}/api/distill/timeline/${projectId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      // Refresh events after distill completes
      const res = await fetch(`${API_BASE}/api/timeline/events/${projectId}`, {
        headers: getAuthHeaders(),
      });
      const result = await res.json();
      if (result.success && Array.isArray(result.data)) {
        setEvents(result.data);
      }
    } catch {
      alert('时间线蒸馏失败');
    } finally {
      setSaving(false);
    }
  }, [projectId]);

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
                    title="AI从章节内容提取时间线事件"
                    onClick={handleDistillTimeline}
                    disabled={saving}
                  >
                    {saving ? (
                      <i className="ri-loader-4-line animate-spin" />
                    ) : (
                      <i className="ri-sparkles-line" />
                    )}
                    {saving ? '提取中...' : 'AI提取时间线'}
                  </button>
                  <button
                    className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                    title={loading历法 ? '加载历法中...' : '历法配置'}
                    onClick={() => setShowCalendarModal(true)}
                    disabled={loading历法}
                  >
                    <i
                      className={`ri-calendar-settings-line ${loading历法 ? 'animate-spin' : ''}`}
                    />
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
                title="校验时间线"
                onClick={() => validateTimeline()}
              >
                <i className="text-sm ri-shield-check-line" />
              </button>
              <button
                className="p-1 hover:bg-[var(--bg-card)] rounded transition-colors"
                title="刷新"
                onClick={() => {
                  // Reload events from API
                  if (!projectId) return;
                  fetch(`${API_BASE}/api/timeline/events/${projectId}`, {
                    headers: getAuthHeaders(),
                  })
                    .then(r => r.json())
                    .then(res => {
                      if (res.success && Array.isArray(res.data))
                        setEvents(res.data);
                    })
                    .catch(() => {});
                }}
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
                                    历法={历法}
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
          历法={历法}
          onClose={() => setDetailEvent(null)}
          onEdit={() => {
            const ev = detailEvent;
            setDetailEvent(null);
            handleOpenEdit(ev);
          }}
        />
      )}

      {/* Calendar config modal */}
      {showCalendarModal && (
        <CalendarConfigModal
          历法={历法}
          onSave={handleSave历法}
          onClose={() => setShowCalendarModal(false)}
        />
      )}
    </>,
    document.body
  );
};

export default TimelinePanel;
