import React, { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useWorldApi } from '../useWorldApi';
import { useAIGenerate, parseAIJSON } from './panel-shared';

// ─── Interfaces ────────────────────────────────────────────────────

interface 章节 {
  id: number;
  名称: string;
  摘要?: string;
  状态: '未开始' | '进行中' | '已完成';
  蒸馏状态?: '已蒸馏' | '需重蒸馏' | null;
  需重蒸馏?: boolean;
}

interface 卷 {
  id: number;
  名称: string;
  摘要?: string;
  状态: '未开始' | '进行中' | '已完成';
  图标颜色?: string;
  章节: 章节[];
}

interface 大纲节点 {
  id: number;
  名称: string;
  层级: number;
  章节范围?: string;
  子节点?: 大纲节点[];
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ─── Status helpers ─────────────────────────────────────────────────

const 状态颜色: Record<string, string> = {
  已完成: '#4ade80',
  进行中: '#fbbf24',
  未开始: '#9ca3af',
};

// ─── Highlight marker data ──────────────────────────────────────────

const 实体标记: { label: string; color: string }[] = [
  { label: '【角色】', color: 'rgb(34, 211, 238)' },
  { label: '【势力】', color: 'rgb(251, 191, 36)' },
  { label: '【场景】', color: 'rgb(74, 222, 128)' },
  { label: '【伏笔】', color: 'rgb(192, 132, 252)' },
  { label: '【物品】', color: 'rgb(251, 113, 133)' },
  { label: '【章首衔接】', color: 'rgb(96, 165, 250)' },
  { label: '【章尾悬念】', color: 'rgb(249, 115, 22)' },
  { label: '【关键台词】', color: 'rgb(167, 139, 250)' },
];

const 情绪状态标记: { label: string; color: string }[] = [
  { label: '【紧张感】', color: 'rgb(239, 68, 68)' },
  { label: '【爽点】', color: 'rgb(249, 115, 22)' },
  { label: '【震撼】', color: 'rgb(220, 38, 38)' },
  { label: '【失落感】', color: 'rgb(99, 102, 241)' },
  { label: '【浪漫】', color: 'rgb(236, 72, 153)' },
  { label: '【温情】', color: 'rgb(251, 146, 60)' },
  { label: '【感动】', color: 'rgb(139, 92, 246)' },
  { label: '【恐惧】', color: 'rgb(100, 116, 139)' },
  { label: '【愤怒】', color: 'rgb(220, 38, 38)' },
  { label: '【好奇】', color: 'rgb(14, 165, 233)' },
  { label: '【期待】', color: 'rgb(234, 179, 8)' },
  { label: '【轻松】', color: 'rgb(34, 197, 94)' },
];

const 叙事技巧标记: { label: string; color: string }[] = [
  { label: '【悬念】', color: 'rgb(124, 58, 237)' },
  { label: '【谜团】', color: 'rgb(79, 70, 229)' },
  { label: '【反转】', color: 'rgb(245, 158, 11)' },
  { label: '【转折】', color: 'rgb(234, 88, 12)' },
  { label: '【信息不对称】', color: 'rgb(99, 102, 241)' },
  { label: '【阴谋】', color: 'rgb(148, 163, 184)' },
  { label: '【反差】', color: 'rgb(100, 116, 139)' },
  { label: '【误导】', color: 'rgb(168, 85, 247)' },
  { label: '【铺垫】', color: 'rgb(8, 145, 178)' },
  { label: '【呼应】', color: 'rgb(16, 185, 129)' },
  { label: '【留白】', color: 'rgb(148, 163, 184)' },
];

const 节奏控制标记: { label: string; color: string }[] = [
  { label: '【大高潮】', color: 'rgb(220, 38, 38)' },
  { label: '【小高潮】', color: 'rgb(249, 115, 22)' },
  { label: '【危机】', color: 'rgb(239, 68, 68)' },
  { label: '【大低谷】', color: 'rgb(59, 130, 246)' },
  { label: '【小低谷】', color: 'rgb(59, 130, 246)' },
  { label: '【拉锯】', color: 'rgb(139, 92, 246)' },
  { label: '【过渡】', color: 'rgb(100, 116, 139)' },
  { label: '【日常】', color: 'rgb(132, 204, 22)' },
  { label: '【成长】', color: 'rgb(34, 197, 94)' },
  { label: '【蓄势】', color: 'rgb(234, 179, 8)' },
  { label: '【爆发】', color: 'rgb(239, 68, 68)' },
];

const 冲突类型标记: { label: string; color: string }[] = [
  { label: '【正面冲突】', color: 'rgb(239, 68, 68)' },
  { label: '【激烈对抗】', color: 'rgb(220, 38, 38)' },
  { label: '【暗流涌动】', color: 'rgb(100, 116, 139)' },
  { label: '【内心挣扎】', color: 'rgb(124, 58, 237)' },
  { label: '【误会冲突】', color: 'rgb(245, 158, 11)' },
  { label: '【立场对抗】', color: 'rgb(99, 102, 241)' },
];

const 快速标注列表: { label: string; color: string; tag: string }[] = [
  { label: '角色', color: 'rgb(34, 211, 238)', tag: '角色' },
  { label: '势力', color: 'rgb(251, 191, 36)', tag: '势力' },
  { label: '场景', color: 'rgb(74, 222, 128)', tag: '场景' },
  { label: '伏笔', color: 'rgb(192, 132, 252)', tag: '伏笔' },
  { label: '物品', color: 'rgb(251, 113, 133)', tag: '物品' },
  { label: '章首衔接', color: 'rgb(96, 165, 250)', tag: '章首衔接' },
  { label: '章尾悬念', color: 'rgb(249, 115, 22)', tag: '章尾悬念' },
  { label: '关键台词', color: 'rgb(167, 139, 250)', tag: '关键台词' },
];

// ─── Main Component ────────────────────────────────────────────────

export const OutlineSettingsPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const url = projectId ? `/api/outlines/project/${projectId}` : null;
  const { data, loading } = useWorldApi<大纲节点[]>(url);

  const 卷列表: 卷[] = useMemo(
    () => [
      {
        id: 1,
        名称: '第1卷 烬骨邪影',
        状态: '未开始',
        摘要: '凡人矿奴顾尘觉醒禁忌本源符文，拜入没落宗门，在宗门大比中力压天才，初窥修仙界残酷阶级法则。',
        图标颜色: '#9ca3af',
        章节: [
          {
            id: 1,
            名称: '第一章 善良的人',
            状态: '已完成',
            摘要: '- **【章首衔接】**：苍云山脚下的**【场景】落霞镇**凡人聚居，**【角色】沈牧**在此过着平凡的药铺杂役生活，靠微薄工钱度日。',
            蒸馏状态: '已蒸馏',
            需重蒸馏: true,
          },
        ],
      },
      {
        id: 2,
        名称: '第2卷 魔渊泣血',
        状态: '未开始',
        摘要: '顾尘在秘境中与下界散修结盟，共探本源遗迹，却遭上界仙使屠戮，愤而融合禁忌血脉，逆斩天骄。',
        图标颜色: '#9ca3af',
        章节: [{ id: 2, 名称: '第1章 新章节', 状态: '未开始' }],
      },
      {
        id: 3,
        名称: '第3卷 八荒烽火',
        状态: '未开始',
        摘要: '顾尘踏平仇敌宗门，整合八荒荒古势力，成立逆天盟，打破资源垄断，向高高在上的三十三重天阙宣战。',
        图标颜色: '#9ca3af',
        章节: [],
      },
      {
        id: 4,
        名称: '第4卷 天阙惊雷',
        状态: '未开始',
        摘要: '逆天盟强登天路，杀入三十三重天外围，打破凡人不可飞天的神话，在星渊深处获取天道崩塌的惊人隐秘。',
        图标颜色: '#9ca3af',
        章节: [],
      },
      {
        id: 5,
        名称: '第5卷 伪天血祭',
        状态: '未开始',
        摘要: '顾尘杀入九重天域，惊觉高高在上的神明竟是将万灵当作牲口血祭，他拼死击碎血祭大阵，引爆神帝陵寝。',
        图标颜色: '#9ca3af',
        章节: [],
      },
      {
        id: 6,
        名称: '第6卷 纪元喋血',
        状态: '未开始',
        摘要: '顾尘于绝境中重塑道基，率领残部反攻神族，镇压诸神黎明，彻底肃清旧天道在世间的爪牙与秩序。',
        图标颜色: '#9ca3af',
        章节: [],
      },
      {
        id: 7,
        名称: '第7卷 万古执剑',
        状态: '未开始',
        摘要: '最终决战打响，顾尘凭借万民意志斩碎伪天道，重塑宇宙修仙法则，建立新纪元，自己则隐于幕后默默守护。',
        图标颜色: '#9ca3af',
        章节: [],
      },
    ],
    []
  );

  const [展开卷, set展开卷] = useState<Record<number, boolean>>({
    1: true,
    2: true,
  });
  const [搜索词, set搜索词] = useState('');
  const [选中章节, set选中章节] = useState<章节 | null>(null);
  const [选中卷, set选中卷] = useState<卷 | null>(null);
  const [卷列表Data, set卷列表Data] = useState<卷[]>(卷列表);
  const [saving, setSaving] = useState(false);
  const [showLogicEval, setShowLogicEval] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const {
    generating: aiGenerating,
    generate: aiGenerate,
    parsedRef: aiParsedRef,
  } = useAIGenerate();

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2000);
  }, []);

  const 总章数 = 卷列表Data.reduce((s, v) => s + v.章节.length, 0);
  const 完成章数 = 卷列表Data.reduce(
    (s, v) => s + v.章节.filter(c => c.状态 === '已完成').length,
    0
  );
  const 完成率 = 总章数 > 0 ? Math.round((完成章数 / 总章数) * 100) : 0;

  const 过滤卷列表 = useMemo(() => {
    if (!搜索词.trim()) return 卷列表Data;
    const kw = 搜索词.trim().toLowerCase();
    return 卷列表Data
      .map(v => ({
        ...v,
        章节: v.章节.filter(
          c =>
            c.名称.toLowerCase().includes(kw) ||
            (c.摘要 && c.摘要.toLowerCase().includes(kw))
        ),
      }))
      .filter(
        v =>
          v.名称.toLowerCase().includes(kw) ||
          v.摘要?.toLowerCase().includes(kw) ||
          v.章节.length > 0
      );
  }, [卷列表Data, 搜索词]);

  const toggleAll = (展开: boolean) => {
    const s: Record<number, boolean> = {};
    卷列表Data.forEach(v => {
      s[v.id] = 展开;
    });
    set展开卷(s);
  };

  const handle点击章节 = (chapter: 章节, volume: 卷) => {
    set选中章节(chapter);
    set选中卷(volume);
  };

  const handleAddChapter = (volumeId: number) => {
    const volume = 卷列表Data.find(v => v.id === volumeId);
    if (!volume) return;
    const newChapterId =
      Math.max(0, ...卷列表Data.flatMap(v => v.章节.map(c => c.id))) + 1;
    const chapterCount = volume.章节.length + 1;
    const newChapter: 章节 = {
      id: newChapterId,
      名称: `第${chapterCount}章 新章节`,
      状态: '未开始',
    };
    set卷列表Data(prev =>
      prev.map(v =>
        v.id === volumeId ? { ...v, 章节: [...v.章节, newChapter] } : v
      )
    );
    set展开卷(prev => ({ ...prev, [volumeId]: true }));
    showFeedback('已添加新章节');
  };

  const handleEditVolume = (volume: 卷) => {
    set选中卷(volume);
    set选中章节(null);
    showFeedback('正在编辑卷：' + volume.名称);
  };

  const handleDeleteVolume = (volumeId: number) => {
    if (deleteConfirmId === volumeId) {
      set卷列表Data(prev => prev.filter(v => v.id !== volumeId));
      setDeleteConfirmId(null);
      showFeedback('卷已删除');
      if (选中卷?.id === volumeId) {
        set选中卷(null);
        set选中章节(null);
      }
    } else {
      setDeleteConfirmId(volumeId);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  const handleDeleteChapter = (chapterId: number, volumeId: number) => {
    if (deleteConfirmId === chapterId) {
      set卷列表Data(prev =>
        prev.map(v =>
          v.id === volumeId
            ? { ...v, 章节: v.章节.filter(c => c.id !== chapterId) }
            : v
        )
      );
      setDeleteConfirmId(null);
      showFeedback('章节已删除');
      if (选中章节?.id === chapterId) {
        set选中章节(null);
      }
    } else {
      setDeleteConfirmId(chapterId);
      setTimeout(() => setDeleteConfirmId(null), 3000);
    }
  };

  const handlePreviewChapter = (chapter: 章节) => {
    showFeedback('预览：' + chapter.名称);
  };

  const handleReDistill = (chapterId: number) => {
    set卷列表Data(prev =>
      prev.map(v => ({
        ...v,
        章节: v.章节.map(c =>
          c.id === chapterId
            ? { ...c, 蒸馏状态: '已蒸馏' as const, 需重蒸馏: false }
            : c
        ),
      }))
    );
    showFeedback('重新蒸馏完成');
  };

  const panelWidth = 520;
  const resizeHandleWidth = 8;
  const backdropLeft = (leftOffset || 288) + panelWidth;

  return createPortal(
    <>
      <div className="v-65171980">
        {/* ── Outer container matching HTML: 大纲设定侧边栏容器 ── */}
        <div
          className="大纲设定侧边栏容器 fixed top-0 bottom-0 z-40 flex"
          style={{ left: leftOffset }}
        >
          {/* ── Main panel body ── */}
          <div
            className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
            style={{ width: panelWidth }}
          >
            {/* ── Header ── */}
            <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/20">
                    <i className="text-lg text-blue-400 ri-file-list-3-line" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">大纲设定</h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {总章数} 章节 · {完成率}% 完成{' '}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="p-1.5 hover:bg-blue-500/20 rounded-lg transition-colors text-blue-400 disabled:opacity-50"
                    title="AI生成大纲"
                    data-tour="ai-generate-outline"
                    disabled={aiGenerating}
                    onClick={async () => {
                      const 现有卷 = 卷列表Data
                        .map(
                          v =>
                            `${v.名称}(${v.章节.length}章): ${v.摘要 || '无摘要'}`
                        )
                        .join('\n');
                      const prompt = `当前大纲结构：\n${现有卷 || '无'}\n\n请生成完整的大纲结构，包含卷和章节。`;
                      const messages = [{ role: 'user', content: prompt }];
                      const text = await aiGenerate(messages, {
                        scenario: 'AI生成大纲',
                        context: { mode: 'volume', 已有大纲: 现有卷 },
                      });
                      if (!text) return;
                      const parsed = aiParsedRef.current;
                      let outlineData: Array<{
                        名称: string;
                        摘要: string;
                        章节: Array<{
                          名称: string;
                          摘要: string;
                          状态: string;
                        }>;
                      }> | null = null;
                      if (parsed?.卷列表 && Array.isArray(parsed.卷列表)) {
                        outlineData = parsed.卷列表.map((v: any) => ({
                          名称: v.卷名称 || v.名称 || '',
                          摘要: v.卷概要 || v.摘要 || '',
                          章节: (v.章节 || []).map((ch: any) => ({
                            名称: ch.章节名称 || ch.名称 || '',
                            摘要: ch.章节概要 || ch.摘要 || '',
                            状态: '未开始',
                          })),
                        }));
                      } else if (
                        parsed?.章节列表 &&
                        Array.isArray(parsed.章节列表)
                      ) {
                        outlineData = [
                          {
                            名称: '第1卷',
                            摘要: '',
                            章节: parsed.章节列表.map((ch: any) => ({
                              名称: ch.章节名称 || ch.名称 || '',
                              摘要: ch.章节概要 || ch.摘要 || '',
                              状态: '未开始',
                            })),
                          },
                        ];
                      } else {
                        const { data } = parseAIJSON<
                          Array<{
                            名称: string;
                            摘要: string;
                            章节: Array<{
                              名称: string;
                              摘要: string;
                              状态: string;
                            }>;
                          }>
                        >(text);
                        outlineData = data;
                      }
                      if (outlineData && Array.isArray(outlineData)) {
                        let volId =
                          Math.max(0, ...卷列表Data.map(v => v.id)) + 1;
                        let chId =
                          Math.max(
                            0,
                            ...卷列表Data.flatMap(v => v.章节.map(c => c.id))
                          ) + 1;
                        const 新卷列表 = outlineData.map(vol => ({
                          id: volId++,
                          名称: vol.名称,
                          摘要: vol.摘要,
                          状态: '未开始' as const,
                          图标颜色: '#9ca3af',
                          章节: (vol.章节 || []).map(ch => ({
                            id: chId++,
                            名称: ch.名称,
                            摘要: ch.摘要,
                            状态: (ch.状态 === '已完成'
                              ? '已完成'
                              : ch.状态 === '进行中'
                                ? '进行中'
                                : '未开始') as '未开始' | '进行中' | '已完成',
                          })),
                        }));
                        set卷列表Data(新卷列表);
                        showFeedback('大纲生成完成');
                      }
                    }}
                  >
                    <i
                      className={`ri-magic-line ${aiGenerating ? 'animate-spin' : ''}`}
                    />
                  </button>
                  <button
                    className="p-1.5 hover:bg-green-500/20 rounded-lg transition-colors text-green-400 disabled:opacity-50"
                    title="AI批量完善"
                    data-tour="ai-improve-outline"
                    disabled={aiGenerating}
                    onClick={async () => {
                      const 现有卷 = 卷列表Data
                        .map(v => `${v.名称}: ${v.摘要 || '无摘要'}`)
                        .join('\n');
                      const prompt = `当前大纲：\n${现有卷}\n\n请为每个缺少摘要的卷和章节补充完善摘要。`;
                      const messages = [{ role: 'user', content: prompt }];
                      const text = await aiGenerate(messages, {
                        scenario: 'AI生成大纲',
                        context: { mode: 'enhance', 已有大纲: 现有卷 },
                      });
                      if (!text) return;
                      const { data } = parseAIJSON<
                        Array<{
                          名称: string;
                          摘要: string;
                          章节: Array<{ 名称: string; 摘要: string }>;
                        }>
                      >(text);
                      if (data && Array.isArray(data)) {
                        set卷列表Data(prev =>
                          prev.map(vol => {
                            const matched = data.find(d => d.名称 === vol.名称);
                            if (!matched) return vol;
                            return {
                              ...vol,
                              摘要: matched.摘要 || vol.摘要,
                              章节: vol.章节.map(ch => {
                                const matchedCh = (matched.章节 || []).find(
                                  c => c.名称 === ch.名称
                                );
                                if (!matchedCh) return ch;
                                return {
                                  ...ch,
                                  摘要: matchedCh.摘要 || ch.摘要,
                                };
                              }),
                            };
                          })
                        );
                        showFeedback('批量完善完成');
                      }
                    }}
                  >
                    <i
                      className={`ri-brush-2-line ${aiGenerating ? 'animate-spin' : ''}`}
                    />
                  </button>
                  <button
                    className="p-1.5 hover:bg-cyan-500/20 rounded-lg transition-colors text-cyan-400"
                    title="逻辑评估"
                    onClick={() => setShowLogicEval(prev => !prev)}
                  >
                    <i className="ri-pulse-line" />
                  </button>
                  <button
                    className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    disabled={saving}
                    onClick={() => {
                      setSaving(true);
                      setTimeout(() => {
                        setSaving(false);
                        showFeedback('大纲已保存');
                      }, 800);
                    }}
                  >
                    <i
                      className={`ri-save-line ${saving ? 'animate-pulse' : ''}`}
                    />{' '}
                    保存{' '}
                  </button>
                  <button
                    className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                    title="关闭"
                    onClick={onClose}
                  >
                    <i className="text-lg ri-close-line" />
                  </button>
                </div>
              </div>
              {/* Feedback toast */}
              {feedback && (
                <div className="px-4 py-1.5 text-xs text-green-400 bg-green-500/10 border-t border-green-500/20">
                  {feedback}
                </div>
              )}
              {/* Logic evaluation result */}
              {showLogicEval && (
                <div className="px-4 py-2 text-xs text-cyan-400 bg-cyan-500/10 border-b border-cyan-500/20">
                  <div className="flex items-center justify-between">
                    <span>
                      <i className="ri-pulse-line mr-1" />
                      逻辑评估：大纲结构完整，卷间衔接良好，建议补充第3卷与第4卷之间的过渡章节。
                    </span>
                    <button
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                      onClick={() => setShowLogicEval(false)}
                    >
                      <i className="ri-close-line" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Toolbar row ── */}
            <div className="shrink-0 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-dark)]/50 flex items-center gap-2 flex-wrap">
              <button
                className="px-2.5 py-1.5 bg-[var(--bg-card)] hover:bg-[var(--border)] rounded-lg text-xs flex items-center gap-1.5 transition-colors"
                onClick={() => {
                  const newId = Math.max(0, ...卷列表Data.map(v => v.id)) + 1;
                  set卷列表Data(prev => [
                    ...prev,
                    {
                      id: newId,
                      名称: `第${prev.length + 1}卷 新卷`,
                      状态: '未开始' as const,
                      图标颜色: '#9ca3af',
                      章节: [],
                    },
                  ]);
                  set展开卷(prev => ({ ...prev, [newId]: true }));
                  showFeedback('已添加新卷');
                }}
              >
                <i className="text-purple-400 ri-book-2-line" /> 添加卷
              </button>
              <div className="w-px h-4 bg-[var(--border)]" />
              <button
                className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                title="展开全部"
                onClick={() => toggleAll(true)}
              >
                <i className="ri-arrow-down-s-line" />
              </button>
              <button
                className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                title="收起全部"
                onClick={() => toggleAll(false)}
              >
                <i className="ri-arrow-up-s-line" />
              </button>
              <div className="w-px h-4 bg-[var(--border)]" />
              <button
                className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors disabled:opacity-30"
                title="撤销"
                disabled
              >
                <i className="ri-arrow-go-back-line" />
              </button>
              <button
                className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors disabled:opacity-30"
                title="重做"
                disabled
              >
                <i className="ri-arrow-go-forward-line" />
              </button>
              <div className="flex-1" />
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索..."
                  value={搜索词}
                  onChange={e => set搜索词(e.target.value)}
                  className="w-32 px-2.5 py-1.5 pl-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-xs focus:outline-none focus:border-blue-500/50"
                />
                <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] text-xs" />
              </div>
            </div>

            {/* ── Scrollable tree ── */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <i className="ri-loader-4-line animate-spin text-xl text-[var(--text-secondary)]" />
              </div>
            ) : (
              <div className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-3">
                  {过滤卷列表.map(卷节点 => (
                    <VolumeNode
                      key={卷节点.id}
                      volume={卷节点}
                      展开={!!展开卷[卷节点.id]}
                      onToggle={() =>
                        set展开卷(prev => ({
                          ...prev,
                          [卷节点.id]: !prev[卷节点.id],
                        }))
                      }
                      选中章节={选中章节}
                      on点击章节={handle点击章节}
                      onAddChapter={handleAddChapter}
                      onEditVolume={handleEditVolume}
                      onDeleteVolume={handleDeleteVolume}
                      onDeleteChapter={handleDeleteChapter}
                      onPreviewChapter={handlePreviewChapter}
                      onReDistill={handleReDistill}
                      deleteConfirmId={deleteConfirmId}
                      setDeleteConfirmId={setDeleteConfirmId}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Footer progress ── */}
            <div className="shrink-0 px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-dark)]">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
                <span>写作进度</span>
                <span>
                  {完成章数}/{总章数}
                </span>
              </div>
              <div className="h-1.5 bg-[var(--bg-card)] rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500 rounded-full bg-gradient-to-r from-blue-500 to-green-500"
                  style={{ width: `${完成率}%` }}
                />
              </div>
            </div>
          </div>

          {/* ── Resize handle ── */}
          <div
            className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 shrink-0"
            title="拖拽调整宽度"
          />

          {/* ── Backdrop ── */}
          <div
            className="fixed top-0 bottom-0 right-0 transition-colors bg-black/0 hover:bg-black/5"
            style={{ left: backdropLeft }}
          />
        </div>
      </div>

      {/* ── Chapter Detail Panel (sliding right) ── */}
      {选中章节 &&
        选中卷 &&
        createPortal(
          <ChapterDetailPanel
            chapter={选中章节}
            volume={选中卷}
            onClose={() => {
              set选中章节(null);
              set选中卷(null);
            }}
            leftOffset={leftOffset}
          />,
          document.body
        )}
    </>,
    document.body
  );
};

// ─── Volume Node ───────────────────────────────────────────────────

interface VolumeNodeProps {
  volume: 卷;
  展开: boolean;
  onToggle: () => void;
  选中章节: 章节 | null;
  on点击章节: (chapter: 章节, volume: 卷) => void;
  onAddChapter: (volumeId: number) => void;
  onEditVolume: (volume: 卷) => void;
  onDeleteVolume: (volumeId: number) => void;
  onDeleteChapter: (chapterId: number, volumeId: number) => void;
  onPreviewChapter: (chapter: 章节) => void;
  onReDistill: (chapterId: number) => void;
  deleteConfirmId: number | null;
  setDeleteConfirmId: (id: number | null) => void;
}

function VolumeNode({
  volume,
  展开,
  onToggle,
  选中章节,
  on点击章节,
  onAddChapter,
  onEditVolume,
  onDeleteVolume,
  onDeleteChapter,
  onPreviewChapter,
  onReDistill,
  deleteConfirmId,
  setDeleteConfirmId,
}: VolumeNodeProps) {
  const color = 状态颜色[volume.状态] || '#9ca3af';

  return (
    <div className="卷节点" draggable>
      <div className="卷头部 bg-gradient-to-r from-[var(--bg-card)] to-[var(--bg-dark)] rounded-xl border border-[var(--border)] overflow-hidden">
        {/* Volume header */}
        <div
          className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--border)]/30 transition-colors group"
          onClick={onToggle}
        >
          <i
            className="ri-arrow-down-s-line text-lg text-[var(--text-secondary)] shrink-0 transition-transform"
            style={{ transform: 展开 ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
          <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
            <i
              className="ri-book-2-line"
              style={{ color: volume.图标颜色 || color }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{volume.名称}</span>
              <span
                className="px-1.5 py-0.5 rounded text-xs shrink-0"
                style={{ color }}
              >
                {volume.状态}
              </span>
            </div>
            {volume.摘要 && (
              <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                {volume.摘要}
              </p>
            )}
          </div>
          <span className="text-xs text-[var(--text-secondary)] shrink-0">
            {volume.章节.length} 章{' '}
          </span>
          <div className="flex items-center gap-1 transition-opacity opacity-0 group-hover:opacity-100 shrink-0">
            <button
              className="p-1 text-green-400 rounded hover:bg-green-500/20"
              title="添加章节"
              onClick={e => {
                e.stopPropagation();
                onAddChapter(volume.id);
              }}
            >
              <i className="ri-add-line" />
            </button>
            <button
              className="p-1 text-blue-400 rounded hover:bg-blue-500/20"
              title="编辑"
              onClick={e => {
                e.stopPropagation();
                onEditVolume(volume);
              }}
            >
              <i className="ri-edit-line" />
            </button>
            <button
              className="p-1 text-red-400 rounded hover:bg-red-500/20"
              title="删除"
              onClick={e => {
                e.stopPropagation();
                onDeleteVolume(volume.id);
              }}
            >
              <i className="ri-delete-bin-line" />
            </button>
          </div>
        </div>

        {/* Chapters list */}
        {展开 && (
          <div className="border-t border-[var(--border)]">
            {volume.章节.length > 0 ? (
              <div className="divide-y divide-[var(--border)]/50">
                {volume.章节.map(ch => {
                  const 选中 = 选中章节?.id === ch.id;
                  return (
                    <div
                      key={ch.id}
                      className={`章节项 px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--border)]/30 transition-colors cursor-pointer group ${选中 ? 'bg-blue-500/10' : ''}`}
                      draggable
                      onClick={() => on点击章节(ch, volume)}
                    >
                      <i className="ri-draggable text-[var(--text-secondary)]/50 cursor-move shrink-0" />
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: 状态颜色[ch.状态] || '#9ca3af',
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm truncate">
                          {ch.名称}
                        </span>
                        {ch.摘要 && (
                          <p className="text-xs text-[var(--text-secondary)] truncate">
                            {ch.摘要}
                          </p>
                        )}
                      </div>
                      <span
                        className="px-1.5 py-0.5 rounded text-xs shrink-0"
                        style={{ color: 状态颜色[ch.状态] || '#9ca3af' }}
                      >
                        {ch.状态}
                      </span>
                      <div className="inline-flex items-center gap-1 shrink-0">
                        {ch.蒸馏状态 === '已蒸馏' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-400">
                            已蒸馏 ✓
                          </span>
                        )}
                        {ch.需重蒸馏 && (
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
                              onClick={e => {
                                e.stopPropagation();
                                onReDistill(ch.id);
                              }}
                            >
                              <i className="text-xs ri-refresh-line" />
                            </button>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          className="p-1 text-purple-400 rounded hover:bg-purple-500/20"
                          title="预览"
                          onClick={e => {
                            e.stopPropagation();
                            onPreviewChapter(ch);
                          }}
                        >
                          <i className="text-sm ri-eye-line" />
                        </button>
                        <button
                          className="p-1 text-blue-400 rounded hover:bg-blue-500/20"
                          title="编辑"
                          onClick={e => {
                            e.stopPropagation();
                            on点击章节(ch, volume);
                          }}
                        >
                          <i className="text-sm ri-edit-line" />
                        </button>
                        <button
                          className="p-1 text-red-400 rounded hover:bg-red-500/20"
                          title="删除"
                          onClick={e => {
                            e.stopPropagation();
                            onDeleteChapter(ch.id, volume.id);
                          }}
                        >
                          <i className="text-sm ri-delete-bin-line" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-3 text-center text-xs text-[var(--text-secondary)]">
                {' '}
                暂无章节，点击{' '}
                <button
                  className="text-blue-400 hover:underline"
                  onClick={() => onAddChapter(volume.id)}
                >
                  添加章节
                </button>
              </div>
            )}
            <div className="px-4 py-2 border-t border-[var(--border)]/50">
              <button
                className="w-full py-1.5 text-xs text-[var(--text-secondary)] hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors flex items-center justify-center gap-1"
                onClick={() => onAddChapter(volume.id)}
              >
                <i className="ri-add-line" /> 添加章节
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chapter Detail Panel ──────────────────────────────────────────

type 详情Tab =
  | '基础信息'
  | '角色与场景'
  | '内容细节'
  | '情绪节奏'
  | '事件流'
  | '关联数据';

interface ChapterDetailPanelProps {
  chapter: 章节;
  volume: 卷;
  onClose: () => void;
  leftOffset?: number;
}

function ChapterDetailPanel({
  chapter,
  volume,
  onClose,
  leftOffset = 288,
}: ChapterDetailPanelProps) {
  const [当前Tab, set当前Tab] = useState<详情Tab>('基础信息');
  const [字体大小, set字体大小] = useState(14);
  const [锁定蓝本, set锁定蓝本] = useState(false);
  const [显示高亮面板, set显示高亮面板] = useState(false);
  const [显示快速标注, set显示快速标注] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiCardOpen, setAiCardOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [chapterFeedback, setChapterFeedback] = useState<string | null>(null);

  const showChapterFeedback = (msg: string) => {
    setChapterFeedback(msg);
    setTimeout(() => setChapterFeedback(null), 2000);
  };

  const tabs: { key: 详情Tab; icon: string }[] = [
    { key: '基础信息', icon: 'ri-file-text-line' },
    { key: '角色与场景', icon: 'ri-group-line' },
    { key: '内容细节', icon: 'ri-article-line' },
    { key: '情绪节奏', icon: 'ri-heart-pulse-line' },
    { key: '事件流', icon: 'ri-git-branch-line' },
    { key: '关联数据', icon: 'ri-links-line' },
  ];

  // leftOffset (288) + panel width (520) + resize handle (8) = 816
  const panelLeft = (leftOffset || 288) + 528;

  return (
    <div
      className="fixed bg-[var(--bg-darker)] border-l border-[var(--border)] shadow-2xl flex overflow-hidden top-0 bottom-0"
      style={{ left: panelLeft, width: 520, zIndex: 50 }}
    >
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)] cursor-move select-none">
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-2 font-medium">
              <i
                className="ri-drag-move-2-line text-[var(--text-secondary)] text-xs mr-0.5"
                title="拖动面板"
              />
              <i className="text-blue-400 ri-file-text-line" /> 编辑章
            </h3>
            <div className="flex items-center gap-2">
              {/* Font size controls */}
              <div className="flex items-center gap-1 bg-[var(--bg-card)] rounded-lg px-1.5 py-0.5">
                <button
                  className="p-1 hover:bg-[var(--border)] rounded text-xs disabled:opacity-30"
                  title="减小字体"
                  onClick={() => set字体大小(s => Math.max(10, s - 1))}
                >
                  <i className="ri-subtract-line" />
                </button>
                <span className="text-xs text-[var(--text-secondary)] w-6 text-center">
                  {字体大小}
                </span>
                <button
                  className="p-1 hover:bg-[var(--border)] rounded text-xs disabled:opacity-30"
                  title="增大字体"
                  onClick={() => set字体大小(s => Math.min(20, s + 1))}
                >
                  <i className="ri-add-line" />
                </button>
              </div>
              <button
                className={`p-1.5 hover:bg-purple-500/20 rounded-lg transition-colors text-purple-400 disabled:opacity-50 flex items-center justify-center ${aiPanelOpen ? 'bg-purple-500/20' : ''}`}
                title="AI完善面板（批量字段完善）"
                onClick={() => setAiPanelOpen(prev => !prev)}
              >
                <i className="ri-magic-line" />
              </button>
              <button
                className={`p-1.5 hover:bg-violet-500/20 rounded-lg transition-colors text-violet-400 disabled:opacity-50 flex items-center justify-center ${aiCardOpen ? 'bg-violet-500/20' : ''}`}
                title="AI完善抽卡（一次出3个方案）"
                onClick={() => {
                  setAiCardOpen(prev => !prev);
                  if (!aiCardOpen) showChapterFeedback('正在生成3个方案...');
                }}
              >
                <i className="ri-shuffle-line" />
              </button>
              <button
                className={`p-1.5 hover:bg-cyan-500/20 rounded-lg transition-colors text-cyan-400 disabled:opacity-50 flex items-center justify-center ${aiChatOpen ? 'bg-cyan-500/20' : ''}`}
                title="AI完善对话模式（多轮对话探讨章节）"
                onClick={() => setAiChatOpen(prev => !prev)}
              >
                <i className="ri-chat-smile-3-line" />
              </button>
              <button
                className="p-1.5 hover:bg-blue-500/20 rounded-lg transition-colors text-blue-400 disabled:opacity-50"
                title="重新加载当前节点数据"
                disabled={reloading}
                onClick={() => {
                  setReloading(true);
                  setTimeout(() => {
                    setReloading(false);
                    showChapterFeedback('数据已重新加载');
                  }, 600);
                }}
              >
                <i
                  className={`ri-refresh-line ${reloading ? 'animate-spin' : ''}`}
                />
              </button>
              <button
                className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                onClick={onClose}
              >
                <i className="ri-close-line" />
              </button>
            </div>
          </div>

          {/* Tab nav */}
          <div className="grid grid-cols-6 gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`px-2 py-1.5 rounded-lg text-xs transition-colors text-center ${当前Tab === tab.key ? 'bg-blue-500/20 text-blue-400' : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                title={tab.key}
                onClick={() => set当前Tab(tab.key)}
              >
                <i className={`text-sm ${tab.icon}`} />
                <div className="text-[10px] mt-0.5 truncate">{tab.key}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 p-4 overflow-y-auto">
          {当前Tab === '基础信息' && (
            <Tab基础信息
              chapter={chapter}
              字体大小={字体大小}
              set字体大小={set字体大小}
              锁定蓝本={锁定蓝本}
              set锁定蓝本={set锁定蓝本}
              显示高亮面板={显示高亮面板}
              set显示高亮面板={set显示高亮面板}
              显示快速标注={显示快速标注}
              set显示快速标注={set显示快速标注}
            />
          )}
          {当前Tab === '角色与场景' && <Tab角色与场景 />}
          {当前Tab === '内容细节' && <Tab内容细节 字体大小={字体大小} />}
          {当前Tab === '情绪节奏' && <Tab情绪节奏 />}
          {当前Tab === '事件流' && <Tab事件流 />}
          {当前Tab === '关联数据' && <Tab关联数据 />}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-dark)] flex justify-between items-center gap-2">
          <button
            className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            disabled={saving}
            onClick={() => {
              setSaving(true);
              setTimeout(() => {
                setSaving(false);
                showChapterFeedback('章节已保存');
              }, 800);
            }}
          >
            <i className="ri-save-line" /> 保存
          </button>
          <button
            className="px-4 py-2 bg-[var(--bg-card)] hover:bg-[var(--border)] rounded-lg text-sm transition-colors"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="w-2 transition-colors bg-transparent cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 shrink-0"
        title="拖拽调整宽度"
      />
    </div>
  );
}

// ─── Highlight Marker Popup ─────────────────────────────────────────

function HighlightMarkerPopup() {
  const renderSection = (
    title: string,
    icon: string,
    items: { label: string; color: string }[]
  ) => (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-xs font-medium text-[var(--text-primary)]">
        <i className={`text-sm ${icon} opacity-60`} />
        <span>{title}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-4">
        {items.map(item => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-[var(--bg-main)]"
          >
            <span
              className="flex-shrink-0 w-2 h-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span style={{ color: item.color }}>{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="absolute right-0 top-full mt-1 z-50 w-[360px] p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl">
      <div className="text-xs text-[var(--text-secondary)] mb-2">
        使用{' '}
        <code className="px-1 py-0.5 bg-[var(--bg-main)] rounded text-[var(--text-primary)]">
          **【类型】名称**
        </code>{' '}
        格式标记实体，可自动高亮显示
      </div>
      <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
        {renderSection('实体标记', 'ri-bookmark-line', 实体标记)}
        {renderSection('情绪状态', 'ri-emotion-line', 情绪状态标记)}
        {renderSection('叙事技巧', 'ri-quill-pen-line', 叙事技巧标记)}
        {renderSection('节奏控制', 'ri-rhythm-line', 节奏控制标记)}
        {renderSection('冲突类型', 'ri-sword-line', 冲突类型标记)}
      </div>
    </div>
  );
}

// ─── Quick Annotation Toolbar ───────────────────────────────────────

function QuickAnnotationToolbar({
  onInsert,
}: {
  onInsert: (tag: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 mb-1.5 px-0.5">
      <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">
        快速标注：
      </span>
      {快速标注列表.map(item => (
        <button
          key={item.tag}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-[var(--bg-main)] border transition-colors hover:opacity-90"
          style={{
            color: item.color,
            borderColor: item.color
              .replace('rgb', 'rgba')
              .replace(')', ', 0.25)'),
            backgroundColor: item.color
              .replace('rgb', 'rgba')
              .replace(')', ', 0.063)'),
          }}
          title={`点击插入【${item.tag}】标注（先选中文字可自动包裹）`}
          onClick={() => onInsert(item.tag)}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ─── Tab: 基础信息 ─────────────────────────────────────────────────

function Tab基础信息({
  chapter,
  字体大小,
  set字体大小,
  锁定蓝本,
  set锁定蓝本,
  显示高亮面板,
  set显示高亮面板,
  显示快速标注,
  set显示快速标注,
}: {
  chapter: 章节;
  字体大小: number;
  set字体大小: React.Dispatch<React.SetStateAction<number>>;
  锁定蓝本: boolean;
  set锁定蓝本: (v: boolean) => void;
  显示高亮面板: boolean;
  set显示高亮面板: (v: boolean) => void;
  显示快速标注: boolean;
  set显示快速标注: (v: boolean) => void;
}) {
  const [标题, set标题] = useState(chapter.名称);
  const [摘要核心, set摘要核心] = useState('');
  const [摘要内容, set摘要内容] = useState(chapter.摘要 || '');
  const [aiModifying, setAiModifying] = useState(false);

  const handleInsertAnnotation = (tag: string) => {
    const marker = `**【${tag}】**`;
    set摘要内容(prev => prev + marker);
  };

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
          标题
        </label>
        <input
          type="text"
          value={标题}
          className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-blue-500/50"
          onChange={e => set标题(e.target.value)}
        />
      </div>

      {/* 摘要核心 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs text-[var(--text-secondary)]">
            {' '}
            摘要核心{' '}
            <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-400 font-medium">
              故事蓝本
            </span>
            <span className="text-[var(--text-tertiary)] text-[10px] ml-1">
              (填写后AI完善将基于此内容生成，写正文不根据此内容写，只根据摘要写)
            </span>
          </label>
          <div className="flex items-center gap-1">
            <button
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-dark)]"
              title={
                锁定蓝本
                  ? '蓝本已锁定'
                  : '蓝本未锁定：点击锁定后摘要核心只读，后续AI完善均以此为据'
              }
              onClick={() => set锁定蓝本(!锁定蓝本)}
            >
              <i
                className={`text-xs ${锁定蓝本 ? 'ri-lock-line' : 'ri-lock-unlock-line'}`}
              />
              <span>{锁定蓝本 ? '已锁定' : '未锁定'}</span>
            </button>
          </div>
        </div>
        <textarea
          rows={2}
          readOnly={锁定蓝本}
          value={摘要核心}
          className="w-full px-3 py-2 border rounded-lg text-sm transition-colors resize-y bg-[var(--bg-dark)] border-[var(--border)] focus:border-[var(--primary)]"
          placeholder="简要概括本章核心内容，AI完善时将基于此内容生成详细摘要..."
          onChange={e => set摘要核心(e.target.value)}
        />
      </div>

      {/* 摘要 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs text-[var(--text-secondary)]">
            摘要
          </label>
          <div className="flex items-center gap-1">
            <button
              className="flex items-center px-1.5 py-0.5 text-xs rounded transition-colors text-[var(--text-tertiary)] hover:text-cyan-400 hover:bg-cyan-500/10"
              title="展开/收起快速标注工具栏"
              onClick={() => set显示快速标注(!显示快速标注)}
            >
              <i className="text-sm ri-price-tag-3-line" />
            </button>
            <button
              className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-purple-400/70 hover:text-purple-400 hover:bg-purple-500/10 rounded transition-colors disabled:opacity-50"
              title="选中文本后点击，AI帮你修改"
              disabled={aiModifying}
              onClick={() => {
                setAiModifying(true);
                setTimeout(() => setAiModifying(false), 1500);
              }}
            >
              <i
                className={`text-sm ri-quill-pen-line ${aiModifying ? 'animate-spin' : ''}`}
              />
              <span>AI修改</span>
            </button>
            <div className="relative">
              <button
                className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded transition-colors"
                onClick={() => set显示高亮面板(!显示高亮面板)}
              >
                <i className="text-sm ri-palette-line" />
                <span>高亮标记</span>
              </button>
              {显示高亮面板 && <HighlightMarkerPopup />}
            </div>
          </div>
        </div>

        {/* Quick annotation toolbar */}
        {显示快速标注 && (
          <QuickAnnotationToolbar onInsert={handleInsertAnnotation} />
        )}

        {/* Syntax-highlighted editor area */}
        <div className="v-08edd9bd">
          <div
            className="语法高亮编辑器"
            style={{
              position: 'relative',
              width: '100%',
              minHeight: 600,
              maxHeight: 'none',
            }}
          >
            <div
              className="高亮层"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                padding: '0.5rem 0.75rem',
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                overflowY: 'auto',
                overflowX: 'hidden',
                pointerEvents: 'none',
                backgroundColor: 'transparent',
                lineHeight: 1.6,
                fontFamily:
                  'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
                fontSize: 字体大小,
              }}
            >
              <span
                style={{
                  color: '#60a5fa',
                  background: 'rgba(96,165,250,0.10)',
                }}
              >
                - **【章首衔接】**：苍云山脚下的
                <span
                  style={{
                    color: '#4ade80',
                    background: 'rgba(74,222,128,0.10)',
                  }}
                >
                  **【场景】落霞镇**
                </span>
                凡人聚居，
                <span
                  style={{
                    color: '#22d3ee',
                    background: 'rgba(34,211,238,0.10)',
                  }}
                >
                  **【角色】沈牧**
                </span>
                在此过着平凡的药铺杂役生活，靠微薄工钱度日。
              </span>
              <br />- <span style={{ color: '#2dd4bf' }}>**【情绪类型】**</span>
              ：从平淡温馨的凡人日常，转入因救人而生的紧张与悬疑，最终落脚于神秘印记烙下时的空灵与震撼。
              <br />-{' '}
              <span
                style={{
                  color: '#a78bfa',
                  background: 'rgba(167,139,250,0.10)',
                }}
              >
                **【关键台词】**
              </span>
              ："救了不该救的人，会惹来杀身之祸。"
              <br />-{' '}
              <span
                style={{
                  color: '#c084fc',
                  background: 'rgba(192,132,252,0.10)',
                }}
              >
                **【伏笔】**
              </span>
              ：老人留下的碧绿玉瓶内蕴丹药与微光，为沈牧日后化解生死之劫埋下关键的机缘。
              <br />-{' '}
              <span
                style={{
                  color: '#c084fc',
                  background: 'rgba(192,132,252,0.10)',
                }}
              >
                **【伏笔】**
              </span>
              ：老人临别前强行灌入沈牧眉心的无形温热力量，悄然改变了他的命格，推开了通往修仙界的大门。
              <br />-{' '}
              <span
                style={{
                  color: '#c084fc',
                  background: 'rgba(192,132,252,0.10)',
                }}
              >
                **【伏笔】**
              </span>
              ：苍云山脉深处划过夜空的隐形流光与传说中的仙人修行传闻，暗示着这个看似宁静的小镇即将被修真界的风云波及。
              <br />
              <span
                style={{
                  color: '#f97316',
                  background: 'rgba(249,115,22,0.10)',
                }}
              >
                -
                **【章尾悬念】**：苍云山脉深处划过夜空的隐形流光与传说中的仙人修行传闻，暗示着这个看似宁静的小镇即将被修真界的风云波及。
              </span>
            </div>
            <textarea
              className="编辑框"
              placeholder="简要描述本节内容... 支持 **【类型】名称** 高亮标记"
              value={摘要内容}
              onChange={e => set摘要内容(e.target.value)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                padding: '0.5rem 0.75rem',
                backgroundColor: 'transparent',
                color: 'transparent',
                caretColor: 'var(--text-primary)',
                resize: 'none',
                border: 'none',
                outline: 'none',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                overflowY: 'auto',
                overflowX: 'hidden',
                margin: 0,
                lineHeight: 1.6,
                fontFamily:
                  'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
                fontSize: 字体大小,
              }}
            />
          </div>
        </div>

        {/* Font size controls under textarea */}
        <div className="flex items-center justify-end gap-1 mt-1.5">
          <button
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-main)] transition-colors"
            title="缩小字体"
            onClick={() => set字体大小(s => Math.max(10, s - 1))}
          >
            <i className="text-sm ri-subtract-line" />
          </button>
          <span className="text-[11px] text-[var(--text-tertiary)] min-w-[32px] text-center">
            {字体大小}px
          </span>
          <button
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-main)] transition-colors"
            title="放大字体"
            onClick={() => set字体大小(s => Math.min(20, s + 1))}
          >
            <i className="text-sm ri-add-line" />
          </button>
          <button
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-main)] transition-colors ml-0.5"
            title="重置字体大小"
            onClick={() => set字体大小(14)}
          >
            <i className="text-sm ri-restart-line" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: 角色与场景 ───────────────────────────────────────────────

function Tab角色与场景() {
  const [characters, setCharacters] = useState([
    { 名字: '沈牧', 代号: '沈', 描述: '药铺杂役' },
    { 名字: '神秘老人', 代号: '神', 描述: '重伤的神秘修仙者' },
    { 名字: '刘三', 代号: '刘', 描述: '屠户' },
    { 名字: '赵掌柜', 代号: '赵', 描述: '济仁药铺掌柜' },
  ]);
  const [locations, setLocations] = useState([
    '苍云山脉',
    '落霞镇',
    '济仁药铺',
  ]);
  const [factions, setFactions] = useState(['离厄矿州附属帮派']);
  const [身份关系变化, set身份关系变化] = useState('');

  return (
    <div className="space-y-4">
      {/* 出场角色 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[var(--text-secondary)]">
            出场角色
          </label>
          <button
            className="px-2 py-1 text-xs text-green-400 rounded bg-green-500/20 hover:bg-green-500/30"
            onClick={() => {
              const newName = '新角色';
              setCharacters(prev => [
                ...prev,
                { 名字: newName, 代号: newName[0], 描述: '待补充' },
              ]);
            }}
          >
            <i className="mr-1 ri-add-line" />
            添加{' '}
          </button>
        </div>
        <div className="space-y-2">
          {characters.map(c => (
            <div
              key={c.名字}
              className="flex items-center justify-between p-2 bg-[var(--bg-card)] rounded-lg"
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 text-xs text-blue-400 rounded-full bg-blue-500/20">
                  {c.代号}
                </div>
                <div>
                  <div className="flex items-center text-sm">{c.名字}</div>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {c.描述}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="p-1 hover:bg-blue-500/20 rounded text-[var(--text-secondary)] hover:text-blue-400"
                  title="查看详情"
                  onClick={() => {
                    /* navigate to character detail */
                  }}
                >
                  <i className="ri-eye-line" />
                </button>
                <button
                  className="p-1 text-red-400 rounded hover:bg-red-500/20"
                  title="删除"
                  onClick={() =>
                    setCharacters(prev => prev.filter(ch => ch.名字 !== c.名字))
                  }
                >
                  <i className="ri-close-line" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 场景地点 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[var(--text-secondary)]">
            场景地点
          </label>
          <button
            className="px-2 py-1 text-xs text-green-400 rounded bg-green-500/20 hover:bg-green-500/30"
            onClick={() => setLocations(prev => [...prev, '新场景'])}
          >
            <i className="mr-1 ri-add-line" />
            添加{' '}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {locations.map(loc => (
            <span
              key={loc}
              className="flex items-center gap-1 px-2 py-1 text-xs text-purple-400 rounded bg-purple-500/20"
            >
              <i className="ri-map-pin-line" /> {loc}
              <button
                className="hover:text-red-400"
                onClick={() =>
                  setLocations(prev => prev.filter(l => l !== loc))
                }
              >
                <i className="ri-close-line" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* 涉及势力 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[var(--text-secondary)]">
            涉及势力
          </label>
          <button
            className="px-2 py-1 text-xs text-green-400 rounded bg-green-500/20 hover:bg-green-500/30"
            onClick={() => setFactions(prev => [...prev, '新势力'])}
          >
            <i className="mr-1 ri-add-line" />
            添加{' '}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {factions.map(f => (
            <span
              key={f}
              className="flex items-center gap-1 px-2 py-1 text-xs text-orange-400 rounded bg-orange-500/20"
            >
              <i className="ri-team-line" /> {f}
              <button
                className="hover:text-red-400"
                onClick={() => setFactions(prev => prev.filter(fa => fa !== f))}
              >
                <i className="ri-close-line" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* 身份关系变化 */}
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
          身份关系变化
        </label>
        <textarea
          rows={3}
          placeholder="描述本章角色身份关系的变化..."
          className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm resize-y focus:outline-none focus:border-blue-500/50"
          value={身份关系变化}
          onChange={e => set身份关系变化(e.target.value)}
        />
      </div>
    </div>
  );
}

// ─── Tab: 内容细节 ─────────────────────────────────────────────────

function Tab内容细节({ 字体大小 }: { 字体大小: number }) {
  const [目标字数, set目标字数] = useState('');
  const [实际字数, set实际字数] = useState('');
  const [状态, set状态] = useState('pending');
  const [优先级, set优先级] = useState('normal');
  const [起始日期, set起始日期] = useState('');
  const [结束日期, set结束日期] = useState('');
  const [文本字段, set文本字段] = useState<Record<string, string>>({
    开头承接: '',
    关键对话: '',
    人性细化: '',
    钩子设计: '',
    写作要点: '',
  });

  return (
    <div className="space-y-4">
      {/* 字数 grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
            目标字数
          </label>
          <input
            type="number"
            min={0}
            value={目标字数}
            className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-blue-500/50"
            onChange={e => set目标字数(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
            实际字数
          </label>
          <input
            type="number"
            min={0}
            value={实际字数}
            className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-blue-500/50"
            onChange={e => set实际字数(e.target.value)}
          />
        </div>
      </div>

      {/* 状态 / 优先级 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
            状态
          </label>
          <select
            value={状态}
            className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-blue-500/50"
            onChange={e => set状态(e.target.value)}
          >
            <option value="pending">待写</option>
            <option value="writing">写作中</option>
            <option value="complete">已完成</option>
            <option value="revised">已修订</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
            优先级
          </label>
          <select
            value={优先级}
            className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-blue-500/50"
            onChange={e => set优先级(e.target.value)}
          >
            <option value="low">低</option>
            <option value="normal">普通</option>
            <option value="high">高</option>
            <option value="urgent">紧急</option>
          </select>
        </div>
      </div>

      {/* 日期范围 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
            起始日期
          </label>
          <input
            type="text"
            placeholder="纪年-年-月-日，如：天元-3-3-8"
            value={起始日期}
            className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-blue-500/50"
            onChange={e => set起始日期(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
            结束日期
          </label>
          <input
            type="text"
            placeholder="纪年-年-月-日，如：天元-3-3-9"
            value={结束日期}
            className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-blue-500/50"
            onChange={e => set结束日期(e.target.value)}
          />
        </div>
        <p className="col-span-2 mt-1 text-xs text-gray-400">
          {' '}
          AI
          完善大纲后将基于章节剧情自动填充；手工编辑后失焦自动保存到《章节时序》表{' '}
        </p>
      </div>

      {/* Textareas */}
      {[
        { label: '开头承接', placeholder: '如何承接上一章的结尾...', rows: 2 },
        { label: '关键对话', placeholder: '本章重要对话摘要...', rows: 3 },
        {
          label: '人性细化',
          placeholder: '角色性格和行为的细化描述...',
          rows: 3,
        },
        { label: '钩子设计', placeholder: '章末钩子设计...', rows: 2 },
        { label: '写作要点', placeholder: '写作时需要注意的事项...', rows: 3 },
      ].map(item => (
        <div key={item.label}>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
            {item.label}
          </label>
          <textarea
            rows={item.rows}
            placeholder={item.placeholder}
            style={{ fontSize: 字体大小 }}
            value={文本字段[item.label] || ''}
            className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-blue-500/50"
            onChange={e =>
              set文本字段(prev => ({ ...prev, [item.label]: e.target.value }))
            }
          />
        </div>
      ))}
    </div>
  );
}

// ─── Tab: 情绪节奏 ─────────────────────────────────────────────────

function Tab情绪节奏() {
  const [情绪点, set情绪点] = useState<
    { 类型: string; 颜色: string; 强度: number }[]
  >([{ 类型: '悬疑与震撼', 颜色: '#6366f1', 强度: 8 }]);

  const 添加按钮列表: { label: string; icon: string; color: string }[] = [
    { label: '紧张感', icon: 'ri-alarm-warning-line', color: '#ef4444' },
    { label: '悬念', icon: 'ri-question-mark', color: '#7c3aed' },
    { label: '伏笔', icon: 'ri-seedling-line', color: '#059669' },
    { label: '反转', icon: 'ri-refresh-line', color: '#f59e0b' },
    { label: '拉锯感', icon: 'ri-arrow-left-right-line', color: '#8b5cf6' },
    { label: '信息不对称', icon: 'ri-scales-line', color: '#6366f1' },
    { label: '阴谋', icon: 'ri-spy-line', color: '#334155' },
    { label: '反差感', icon: 'ri-contrast-2-line', color: '#64748b' },
    { label: '大高潮', icon: 'ri-flashlight-line', color: '#dc2626' },
    { label: '小高潮', icon: 'ri-arrow-up-line', color: '#f97316' },
    { label: '小低谷', icon: 'ri-arrow-down-line', color: '#3b82f6' },
    { label: '大低谷', icon: 'ri-arrow-down-double-line', color: '#1e40af' },
    { label: '失落感', icon: 'ri-emotion-sad-line', color: '#6366f1' },
    { label: '爽点', icon: 'ri-fire-line', color: '#f97316' },
    { label: '浪漫', icon: 'ri-heart-line', color: '#ec4899' },
  ];

  const 添加情绪 = (label: string, color: string) => {
    set情绪点(prev => [...prev, { 类型: label, 颜色: color, 强度: 5 }]);
  };

  const 删除情绪 = (index: number) => {
    set情绪点(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[var(--text-secondary)]">
            情绪控制点
          </label>
          <span className="text-xs text-[var(--text-secondary)]">
            {情绪点.length} 个
          </span>
        </div>

        <div className="mb-3 space-y-2">
          {情绪点.map((点, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2 rounded-lg"
              style={{ backgroundColor: `${点.颜色}14` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-xs flex items-center gap-1"
                  style={{ backgroundColor: `${点.颜色}30`, color: 点.颜色 }}
                >
                  <i className="ri-emotion-line" /> {点.类型}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[var(--text-secondary)]">
                    强度:
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    className="w-16 h-1"
                    value={点.强度}
                    onChange={e =>
                      set情绪点(prev =>
                        prev.map((p, j) =>
                          j === i ? { ...p, 强度: Number(e.target.value) } : p
                        )
                      )
                    }
                  />
                  <span className="w-4 text-xs">{点.强度}</span>
                </div>
              </div>
              <button
                className="p-1 text-red-400 rounded hover:bg-red-500/20"
                onClick={() => 删除情绪(i)}
              >
                <i className="ri-close-line" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 bg-[var(--bg-card)] rounded-lg">
          <div className="text-xs text-[var(--text-secondary)] mb-2">
            点击添加情绪控制点
          </div>
          <div className="flex flex-wrap gap-1.5">
            {添加按钮列表.map(btn => (
              <button
                key={btn.label}
                className="px-2 py-1 text-xs transition-colors rounded hover:opacity-80"
                style={{ backgroundColor: `${btn.color}20`, color: btn.color }}
                onClick={() => 添加情绪(btn.label, btn.color)}
              >
                <i className={`mr-1 ${btn.icon}`} /> {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: 事件流 ───────────────────────────────────────────────────

function Tab事件流() {
  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center justify-center py-8">
        <div className="flex items-center justify-center w-12 h-12 mb-3 rounded-full bg-purple-500/10">
          <i className="text-xl text-gray-500 ri-calendar-event-line" />
        </div>
        <p className="mb-1 text-xs text-gray-500">本章暂无关联事件</p>
        <p className="text-[10px] text-gray-500/60 mb-3">
          可在支线故事面板中为事件绑定章节
        </p>
        <button
          className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs hover:bg-purple-500/30 transition-colors cursor-pointer"
          onClick={() => {
            /* TODO: open side stories panel */
          }}
        >
          <i className="mr-1 ri-external-link-line" />
          打开支线故事面板
        </button>
      </div>
    </div>
  );
}

// ─── Tab: 关联数据 ─────────────────────────────────────────────────

function Tab关联数据() {
  const [伏笔列表, set伏笔列表] = useState([
    {
      名称: '神秘印记之谜',
      状态: '伏笔',
      阶段: '埋设',
      进度: 10,
      描述: '老人强行灌入沈牧眉心的无形力量',
    },
    {
      名称: '苍云山上的流光',
      状态: '伏笔',
      阶段: '埋设',
      进度: 10,
      描述: '夜空划过没入云层的无形流光',
    },
  ]);
  const [物品列表, set物品列表] = useState(['玉瓶', '金疮药']);
  const [时间线, set时间线] = useState('');

  return (
    <div className="space-y-4">
      {/* 关联伏笔 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-[var(--text-secondary)]">
            关联伏笔
          </label>
          <button
            className="px-2 py-1 text-xs text-green-400 rounded bg-green-500/20 hover:bg-green-500/30"
            onClick={() =>
              set伏笔列表(prev => [
                ...prev,
                {
                  名称: '新伏笔',
                  状态: '伏笔',
                  阶段: '埋设',
                  进度: 0,
                  描述: '待补充',
                },
              ])
            }
          >
            <i className="mr-1 ri-add-line" />
            添加{' '}
          </button>
        </div>
        <div className="space-y-1">
          {伏笔列表.map(f => (
            <div key={f.名称} className="p-2 bg-[var(--bg-card)] rounded">
              <div className="flex items-center justify-between">
                <div className="flex items-center flex-1 min-w-0 gap-2">
                  <i className="flex-shrink-0 text-green-400 ri-seedling-line" />
                  <span className="text-sm truncate">{f.名称}</span>
                  <span className="px-1.5 py-0.5 rounded text-xs flex-shrink-0 bg-blue-500/15 text-blue-400">
                    {f.状态}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-xs flex-shrink-0 bg-yellow-500/20 text-yellow-400">
                    {f.阶段}
                  </span>
                </div>
                <div className="flex items-center flex-shrink-0 gap-1">
                  <button
                    className="p-1 text-blue-400 rounded hover:bg-blue-500/20"
                    title="查看伏笔详情"
                    onClick={() => {
                      /* TODO: show foreshadowing detail */
                    }}
                  >
                    <i className="ri-eye-line" />
                  </button>
                  <button
                    className="p-1 text-red-400 rounded hover:bg-red-500/20"
                    onClick={() =>
                      set伏笔列表(prev =>
                        prev.filter(item => item.名称 !== f.名称)
                      )
                    }
                  >
                    <i className="ri-close-line" />
                  </button>
                </div>
              </div>
              <div className="mt-1.5 ml-6">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-300 bg-blue-500 rounded-full"
                      style={{ width: `${f.进度}%` }}
                    />
                  </div>
                  <span className="w-8 text-xs text-right text-blue-400">
                    {f.进度}%{' '}
                  </span>
                </div>
              </div>
              <div className="mt-1 ml-6 text-xs text-[var(--text-secondary)] truncate">
                {f.描述}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 出现的道具物品 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs text-[var(--text-secondary)]">
            出现的道具物品
          </label>
          <button
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-cyan-400/70 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
            onClick={() => set物品列表(prev => [...prev, '新物品'])}
          >
            <i className="ri-add-line" />
            <span>添加</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {物品列表.map(item => (
            <span
              key={item}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-cyan-500/20 text-cyan-400"
            >
              <i className="ri-box-3-line" /> {item}
              <button
                className="hover:text-red-400"
                onClick={() =>
                  set物品列表(prev => prev.filter(i => i !== item))
                }
              >
                <i className="ri-close-line" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* 时间线 */}
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
          时间线
        </label>
        <textarea
          rows={3}
          placeholder="故事发生的时间节点，每行格式：时间 - 事件..."
          style={{ fontSize: 14 }}
          value={时间线}
          className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-blue-500/50 text-sm"
          onChange={e => set时间线(e.target.value)}
        />
      </div>
    </div>
  );
}

export default OutlineSettingsPanel;
