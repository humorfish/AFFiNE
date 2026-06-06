import React, { useState, useCallback } from 'react';
import { useAIGenerate, parseAIJSON } from './panel-shared';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface 情节幕数据 {
  id: number;
  幕序号: number;
  幕名称: string;
  章节范围: string;
  描述: string;
  故事起点: string;
  故事终点: string;
  内容概要: string;
  核心事件: string;
  角色发展: string;
  冲突升级: string;
  情感基调: string;
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const 结构模式列表 = ['五幕式', '三幕式', '英雄之旅', '起承转合', '序破急'];

/** RGBA color per act number — matches HTML inline styles exactly */
const 幕颜色: Record<number, { bg: string; text: string }> = {
  1: { bg: 'rgba(249, 115, 22, 0.125)', text: 'rgb(249, 115, 22)' }, // orange
  2: { bg: 'rgba(234, 179, 8, 0.125)', text: 'rgb(234, 179, 8)' }, // yellow
  3: { bg: 'rgba(34, 197, 94, 0.125)', text: 'rgb(34, 197, 94)' }, // green
  4: { bg: 'rgba(59, 130, 246, 0.125)', text: 'rgb(59, 130, 246)' }, // blue
  5: { bg: 'rgba(168, 85, 247, 0.125)', text: 'rgb(168, 85, 247)' }, // purple
  6: { bg: 'rgba(236, 72, 153, 0.125)', text: 'rgb(236, 72, 153)' }, // pink
  7: { bg: 'rgba(6, 182, 212, 0.125)', text: 'rgb(6, 182, 212)' }, // cyan
  8: { bg: 'rgba(239, 68, 68, 0.125)', text: 'rgb(239, 68, 68)' }, // red
};

// ─── Demo data ───────────────────────────────────────────────────────────────

const 演示幕列表: 情节幕数据[] = [
  {
    id: 1,
    幕序号: 1,
    幕名称: '烬骨邪影',
    章节范围: '1-96',
    描述: '压抑到反抗的觉醒，初露锋芒的决绝',
    故事起点: '顾尘于黑矿坑底意外觉醒神符，斩杀监工逃出生天',
    故事终点: '顾尘激活古老传送阵，被卷入危机四伏的荒古秘境',
    内容概要:
      '凡人矿奴顾尘觉醒禁忌本源符文，拜入没落宗门，在宗门大比中力压天才，初窥修仙界残酷阶级法则。',
    核心事件: '黑矿坑暴动，宗门大比夺魁，荒古秘境降临',
    角色发展: '顾尘觉醒本源灵枢，修为精进，斩杀旧敌',
    冲突升级: '底层生存危机升级为宗门阶级倾轧，初探天道腐朽',
    情感基调: '',
  },
  {
    id: 2,
    幕序号: 2,
    幕名称: '魔渊泣血',
    章节范围: '97-196',
    描述: '绝望与愤怒交织，复仇之火熊熊燃烧',
    故事起点: '顾尘于秘境深处遭遇重重杀阵，结识下界散修反抗军',
    故事终点: '顾尘融合上古大妖精血，强行撕裂伪天劫杀出绝地',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
  {
    id: 3,
    幕序号: 3,
    幕名称: '八荒烽火',
    章节范围: '197-296',
    描述: '悲壮激昂，众生皆苦的悲悯与抗争',
    故事起点: '顾尘重返修仙界，发现宗门已被世家鹰犬血洗化为废墟',
    故事终点: '顾尘统御八荒散修，阵斩世家老祖，自立逆天盟',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
  {
    id: 4,
    幕序号: 4,
    幕名称: '天阙惊雷',
    章节范围: '297-396',
    描述: '热血沸腾，打破命运枷锁的畅快与沉重',
    故事起点: '顾尘率逆天盟强登天路，于星空古道伏击天阙先遣军',
    故事终点: '顾尘重创天阙掌印官，吞噬星渊本源半步入圣',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
  {
    id: 5,
    幕序号: 5,
    幕名称: '伪天血祭',
    章节范围: '397-496',
    描述: '极致的惨烈与悲壮，向死而生的决绝',
    故事起点: '顾尘杀入天阙中层，惊觉诸神正血祭万灵以修补天道',
    故事终点: '顾尘孤身断后，引爆神帝陵寝掩护众生撤退，身陷绝境',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
  {
    id: 6,
    幕序号: 6,
    幕名称: '纪元喋血',
    章节范围: '497-596',
    描述: '肃杀与悲凉并存，黎明前最暗的挣扎',
    故事起点: '顾尘于生死边缘重塑破灭道基，统率残兵反攻下界神族',
    故事终点: '顾尘强开万界本源，将复苏的古老神魔尽数镇杀镇压',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
  {
    id: 7,
    幕序号: 7,
    幕名称: '万古执剑',
    章节范围: '597-667',
    描述: '壮阔超脱，历经沧桑后的极致平静与宏大',
    故事起点: '顾尘杀入三十三天至高处，直面腐朽伪天道意志化身',
    故事终点: '顾尘斩灭伪天道，重塑灵渊秩序，隐于幕后庇护众生',
    内容概要: '',
    核心事件: '',
    角色发展: '',
    冲突升级: '',
    情感基调: '',
  },
];

// ─── Main component ──────────────────────────────────────────────────────────

export const PlotStructurePanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  const [当前模式, set当前模式] = useState<string>('五幕式');
  const [展开的幕, set展开的幕] = useState<Set<number>>(new Set([1]));
  const [幕列表, set幕列表] = useState<情节幕数据[]>(演示幕列表);
  const [新增幕数据, set新增幕数据] = useState<Partial<情节幕数据>>({});
  const [显示新增, set显示新增] = useState(false);

  const {
    generating: aiGenerating,
    generate: aiGenerate,
    parsedRef: aiParsedRef,
  } = useAIGenerate();

  const on切换展开 = useCallback((幕序号: number) => {
    set展开的幕(prev => {
      const next = new Set(prev);
      if (next.has(幕序号)) next.delete(幕序号);
      else next.add(幕序号);
      return next;
    });
  }, []);

  const onAI完善 = useCallback(
    async (幕: 情节幕数据) => {
      const prompt = `当前幕信息：\n幕序号：${幕.幕序号}\n幕名称：${幕.幕名称}\n章节范围：${幕.章节范围}\n描述：${幕.描述}\n故事起点：${幕.故事起点 || '无'}\n故事终点：${幕.故事终点 || '无'}\n\n请完善此幕的详细内容，补充缺失字段。输出JSON：{"幕名称":"名称","描述":"描述","故事起点":"起点","故事终点":"终点","内容概要":"概要","核心事件":"事件","角色发展":"发展","冲突升级":"冲突","情感基调":"基调"}`;
      const messages = [{ role: 'user', content: prompt }];
      const text = await aiGenerate(messages, {
        scenario: 'AI生成情节脉络',
        context: { mode: 'section' },
      });
      if (!text) return;
      const { data } = parseAIJSON<{
        幕名称: string;
        描述: string;
        故事起点: string;
        故事终点: string;
        内容概要: string;
        核心事件: string;
        角色发展: string;
        冲突升级: string;
        情感基调: string;
      }>(text);
      if (data) {
        set幕列表(prev =>
          prev.map(m =>
            m.id === 幕.id ? ({ ...m, ...data } as 情节幕数据) : m
          )
        );
      }
    },
    [aiGenerate]
  );

  const on删除幕 = useCallback((幕: 情节幕数据) => {
    set幕列表(prev => prev.filter(m => m.id !== 幕.id));
  }, []);

  const on手动添加 = useCallback(() => {
    const 新序号 = 幕列表.length + 1;
    const 新幕: 情节幕数据 = {
      id: Date.now(),
      幕序号: 新序号,
      幕名称: `第${新序号}幕`,
      章节范围: '',
      描述: '',
      故事起点: '',
      故事终点: '',
      内容概要: '',
      核心事件: '',
      角色发展: '',
      冲突升级: '',
      情感基调: '',
    };
    set幕列表(prev => [...prev, 新幕]);
    set显示新增(true);
    set展开的幕(prev => new Set([...prev, 新序号]));
    set新增幕数据({ ...新幕 });
  }, [幕列表]);

  const on保存新增 = useCallback(() => {
    if (!新增幕数据.id) return;
    set幕列表(prev =>
      prev.map(m =>
        m.id === 新增幕数据.id ? ({ ...m, ...新增幕数据 } as 情节幕数据) : m
      )
    );
    set显示新增(false);
    set新增幕数据({});
  }, [新增幕数据]);

  const on取消新增 = useCallback(() => {
    if (新增幕数据.id) {
      set幕列表(prev => prev.filter(m => m.id !== 新增幕数据.id));
    }
    set显示新增(false);
    set新增幕数据({});
  }, [新增幕数据]);

  const on新增字段变更 = useCallback((field: string, value: string) => {
    set新增幕数据(prev => ({ ...prev, [field]: value }));
  }, []);

  const 总数 = 幕列表.length;

  return (
    <div className="v-064a3e2c">
      <div
        className="情节脉络侧边栏容器 fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        {/* ── Sidebar panel ── */}
        <aside
          className="情节脉络内容 bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col h-full shadow-lg"
          style={{ width: 480 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)]">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-lg w-9 h-9 bg-gradient-to-br from-orange-500/20 to-amber-500/20">
                <i className="text-lg text-orange-400 ri-route-line" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">情节脉络</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  故事情节结构与发展脉络
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs cursor-pointer text-[var(--text-secondary)] disabled:opacity-50"
                title="AI生成情节"
                onClick={async () => {
                  const prompt = `当前结构模式：${当前模式}\n已有幕数据：\n${幕列表.map(m => `第${m.幕序号}幕 ${m.幕名称}(${m.章节范围}): ${m.描述}`).join('\n')}\n\n请基于${当前模式}结构生成完整的情节幕列表。`;
                  const messages = [{ role: 'user', content: prompt }];
                  const text = await aiGenerate(messages, {
                    scenario: 'AI生成情节脉络',
                    context: {
                      情节模式: 当前模式,
                      已有情节列表: 幕列表.map(m => m.幕名称),
                    },
                  });
                  if (!text) return;
                  const parsed = aiParsedRef.current;
                  let actData: Array<Partial<情节幕数据>> | null = null;
                  if (parsed?.情节列表 && Array.isArray(parsed.情节列表)) {
                    actData = parsed.情节列表.map((m: any) => ({
                      幕序号: Number(m.幕序号) || 0,
                      幕名称: m.幕名称 || '',
                      章节范围: m.章节范围 || '',
                      描述: m.内容概要 || m.描述 || '',
                      故事起点: m.故事起点 || '',
                      故事终点: m.故事终点 || '',
                      内容概要: m.内容概要 || '',
                      核心事件: m.核心事件 || '',
                      角色发展: m.角色发展 || '',
                      冲突升级: m.冲突升级 || '',
                      情感基调: m.情感基调 || '',
                    }));
                  } else {
                    const { data } =
                      parseAIJSON<Array<Partial<情节幕数据>>>(text);
                    actData = data;
                  }
                  if (actData && Array.isArray(actData)) {
                    set幕列表(
                      actData.map((m, i) => ({
                        id: Date.now() + i,
                        幕序号: m.幕序号 || i + 1,
                        幕名称: m.幕名称 || `第${i + 1}幕`,
                        章节范围: m.章节范围 || '',
                        描述: m.描述 || '',
                        故事起点: m.故事起点 || '',
                        故事终点: m.故事终点 || '',
                        内容概要: m.内容概要 || '',
                        核心事件: m.核心事件 || '',
                        角色发展: m.角色发展 || '',
                        冲突升级: m.冲突升级 || '',
                        情感基调: m.情感基调 || '',
                      }))
                    );
                  }
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
                type="button"
                className="p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs text-[var(--text-secondary)] cursor-pointer"
                title="手动添加情节"
                onClick={on手动添加}
              >
                <i className="ri-add-line" />
              </button>
              <button
                type="button"
                className="p-1.5 hover:bg-[var(--bg-dark)] rounded transition-colors text-xs text-[var(--text-secondary)] cursor-pointer"
                onClick={onClose}
              >
                <i className="text-base ri-close-line" />
              </button>
            </div>
          </div>

          {/* Toolbar — structure mode selector */}
          <div className="px-4 py-2.5 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)]/50">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] shrink-0">
                结构模式
              </span>
              <div className="flex items-center flex-1 gap-1 overflow-x-auto">
                {结构模式列表.map(模式 => (
                  <button
                    key={模式}
                    className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-all cursor-pointer ${
                      当前模式 === 模式
                        ? 'bg-orange-500/20 text-orange-400 font-medium'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-dark)] hover:text-[var(--text)]'
                    }`}
                    onClick={() => set当前模式(模式)}
                  >
                    {模式}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Act list */}
          <div className="flex-1 px-3 py-3 overflow-y-auto">
            <div className="space-y-2.5">
              {幕列表.map(幕 => {
                const 是否展开 = 展开的幕.has(幕.幕序号);
                const 颜色 = 幕颜色[幕.幕序号] || 幕颜色[1];
                const 是新增 = 显示新增 && 新增幕数据.id === 幕.id;

                return (
                  <div key={幕.id} className="relative group">
                    {幕.幕序号 > 1 && (
                      <div className="absolute -top-2.5 left-5 w-px h-2.5 bg-[var(--border)]" />
                    )}
                    <div
                      className={`bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden transition-all hover:border-orange-500/30 hover:shadow-md hover:shadow-orange-500/5 ${
                        是否展开
                          ? 'border-orange-500/50 shadow-md shadow-orange-500/10'
                          : ''
                      }`}
                    >
                      {/* Card header */}
                      <div
                        className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer"
                        onClick={() => on切换展开(幕.幕序号)}
                      >
                        <div
                          className="flex items-center justify-center w-8 h-8 text-sm font-bold rounded-lg shrink-0"
                          style={{ backgroundColor: 颜色.bg, color: 颜色.text }}
                        >
                          {幕.幕序号}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {幕.幕名称}
                            </span>
                            {幕.描述 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-dark)] text-[var(--text-secondary)]">
                                {幕.描述}
                              </span>
                            )}
                          </div>
                          {幕.章节范围 && (
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                              {幕.章节范围}
                            </p>
                          )}
                          {幕.故事起点 && 幕.故事终点 && (
                            <p className="text-[10px] text-amber-400/80 mt-0.5">
                              <span>开：{幕.故事起点}</span>
                              <span> → </span>
                              <span>结：{幕.故事终点}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 transition-opacity opacity-0 group-hover:opacity-100">
                          <button
                            className="p-1 hover:bg-orange-500/20 rounded text-[var(--text-secondary)] hover:text-orange-400 transition-colors cursor-pointer"
                            title="AI完善"
                            onClick={e => {
                              e.stopPropagation();
                              onAI完善(幕);
                            }}
                          >
                            <i className="text-xs ri-sparkling-line" />
                          </button>
                          <button
                            className="p-1 hover:bg-red-500/20 rounded text-[var(--text-secondary)] hover:text-red-400 transition-colors cursor-pointer"
                            title="删除"
                            onClick={e => {
                              e.stopPropagation();
                              on删除幕(幕);
                            }}
                          >
                            <i className="text-xs ri-delete-bin-line" />
                          </button>
                        </div>
                        <i
                          className={`ri-arrow-down-s-line text-[var(--text-secondary)] transition-transform text-sm ${是否展开 ? 'rotate-180' : ''}`}
                        />
                      </div>

                      {/* Expanded body */}
                      {是否展开 && !是新增 && 幕.内容概要 && (
                        <div className="border-t border-[var(--border)]">
                          <div className="p-3.5">
                            <div className="space-y-2.5">
                              {幕.故事起点 && 幕.故事终点 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <i className="text-xs ri-movie-2-line text-amber-400" />
                                    <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                                      故事起止
                                    </span>
                                  </div>
                                  <div className="text-xs text-[var(--text)] leading-relaxed pl-4 space-y-1">
                                    <p>
                                      <span className="text-amber-400/80">
                                        开场：
                                      </span>
                                      {幕.故事起点}
                                    </p>
                                    <p>
                                      <span className="text-amber-400/80">
                                        结局：
                                      </span>
                                      {幕.故事终点}
                                    </p>
                                  </div>
                                </div>
                              )}
                              {幕.内容概要 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <i className="text-xs ri-file-text-line text-orange-400" />
                                    <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                                      内容概要
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--text)] leading-relaxed pl-4">
                                    {幕.内容概要}
                                  </p>
                                </div>
                              )}
                              {幕.核心事件 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <i className="text-xs ri-flashlight-line text-yellow-400" />
                                    <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                                      核心事件
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--text)] leading-relaxed pl-4">
                                    {幕.核心事件}
                                  </p>
                                </div>
                              )}
                              {幕.角色发展 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <i className="text-xs ri-user-heart-line text-blue-400" />
                                    <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                                      角色发展
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--text)] leading-relaxed pl-4">
                                    {幕.角色发展}
                                  </p>
                                </div>
                              )}
                              {幕.冲突升级 && (
                                <div>
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <i className="text-xs ri-sword-line text-red-400" />
                                    <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">
                                      冲突升级
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--text)] leading-relaxed pl-4">
                                    {幕.冲突升级}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-[var(--border)]/50">
                              <button
                                className="px-2.5 py-1 bg-[var(--bg-dark)] text-[var(--text-secondary)] rounded-md text-xs hover:bg-[var(--border)] hover:text-[var(--text)] transition-colors cursor-pointer"
                                onClick={() => on切换展开(幕.幕序号)}
                              >
                                <i className="mr-1 ri-edit-line" />
                                编辑
                              </button>
                              <button
                                className="px-2.5 py-1 bg-[var(--bg-dark)] text-[var(--text-secondary)] rounded-md text-xs hover:bg-orange-500/20 hover:text-orange-400 transition-colors cursor-pointer"
                                onClick={() => onAI完善(幕)}
                              >
                                <i className="mr-1 ri-sparkling-line" /> AI完善
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Inline add/edit form for new acts */}
                      {是否展开 && 是新增 && (
                        <div className="border-t border-[var(--border)]">
                          <div className="p-3.5 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                  幕名称
                                </label>
                                <input
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-500/50"
                                  placeholder="幕名称"
                                  value={新增幕数据.幕名称 || ''}
                                  onChange={e =>
                                    on新增字段变更('幕名称', e.target.value)
                                  }
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                  章节范围
                                </label>
                                <input
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-500/50"
                                  placeholder="如：第1-30章"
                                  value={新增幕数据.章节范围 || ''}
                                  onChange={e =>
                                    on新增字段变更('章节范围', e.target.value)
                                  }
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] text-amber-400/80 uppercase tracking-wider mb-1 block">
                                  开场故事
                                </label>
                                <textarea
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-amber-500/50"
                                  rows={2}
                                  placeholder="本卷第一章的核心场景/事件"
                                  value={新增幕数据.故事起点 || ''}
                                  onChange={e =>
                                    on新增字段变更('故事起点', e.target.value)
                                  }
                                />
                                <span className="text-[9px] text-[var(--text-secondary)] mt-0.5 block">
                                  如：主角被逐出宗门，流落市井
                                </span>
                              </div>
                              <div>
                                <label className="text-[10px] text-amber-400/80 uppercase tracking-wider mb-1 block">
                                  结局故事
                                </label>
                                <textarea
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-amber-500/50"
                                  rows={2}
                                  placeholder="本卷最后一章的核心场景/事件"
                                  value={新增幕数据.故事终点 || ''}
                                  onChange={e =>
                                    on新增字段变更('故事终点', e.target.value)
                                  }
                                />
                                <span className="text-[9px] text-[var(--text-secondary)] mt-0.5 block">
                                  如：击败强敌，获得秘境传承
                                </span>
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                内容概要
                              </label>
                              <textarea
                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-orange-500/50"
                                rows={3}
                                placeholder="该阶段的主要情节概述"
                                value={新增幕数据.内容概要 || ''}
                                onChange={e =>
                                  on新增字段变更('内容概要', e.target.value)
                                }
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                核心事件
                              </label>
                              <textarea
                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-orange-500/50"
                                rows={2}
                                placeholder="该阶段最关键的事件"
                                value={新增幕数据.核心事件 || ''}
                                onChange={e =>
                                  on新增字段变更('核心事件', e.target.value)
                                }
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                  角色发展
                                </label>
                                <textarea
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-orange-500/50"
                                  rows={2}
                                  placeholder="角色的成长变化"
                                  value={新增幕数据.角色发展 || ''}
                                  onChange={e =>
                                    on新增字段变更('角色发展', e.target.value)
                                  }
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                  冲突升级
                                </label>
                                <textarea
                                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-orange-500/50"
                                  rows={2}
                                  placeholder="冲突的升级方向"
                                  value={新增幕数据.冲突升级 || ''}
                                  onChange={e =>
                                    on新增字段变更('冲突升级', e.target.value)
                                  }
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider mb-1 block">
                                情感基调
                              </label>
                              <input
                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-orange-500/50"
                                placeholder="如：紧张刺激 / 温馨治愈 / 沉重压抑"
                                value={新增幕数据.情感基调 || ''}
                                onChange={e =>
                                  on新增字段变更('情感基调', e.target.value)
                                }
                              />
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                className="flex-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors cursor-pointer"
                                onClick={on保存新增}
                              >
                                <i className="mr-1 ri-check-line" />
                                保存
                              </button>
                              <button
                                className="px-3 py-1.5 bg-[var(--bg-dark)] text-[var(--text-secondary)] rounded-lg text-xs hover:bg-[var(--border)] transition-colors cursor-pointer"
                                onClick={on取消新增}
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-[var(--border)] shrink-0 bg-[var(--bg-card)]/50">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>
                <i className="mr-1 ri-route-line" /> {当前模式} · 共 {总数} 幕
              </span>
            </div>
          </div>
        </aside>

        {/* Resize handle */}
        <div
          className="w-2 cursor-col-resize hover:bg-[var(--primary)]/50 active:bg-[var(--primary)] transition-colors shrink-0 relative z-10 bg-transparent"
          title="拖拽调整宽度"
        />

        {/* Backdrop */}
        <div
          className="fixed top-0 bottom-0 right-0 transition-colors bg-black/0 hover:bg-black/5"
          style={{ left: leftOffset + 492 }}
        />
      </div>
    </div>
  );
};

export default PlotStructurePanel;
