import React, { useState } from 'react';
import { useAIGenerate, parseAIJSON } from './panel-shared';

// ── Interfaces ──

interface 伏笔数据 {
  id: number;
  名称: string;
  状态: string;
  重要度: string;
  类型?: string;
  描述: string;
  埋设章节?: string;
  回收章节?: string;
  埋设位置描述?: string;
  影响范围?: string;
  解密程度?: number;
  备注?: string;
  关联章节?: 关联章节[];
  呼应记录?: 呼应记录[];
}

interface 关联章节 {
  章节名称: string;
  类型: string;
  关联度: number;
  描述: string;
}

interface 呼应记录 {
  章节: string;
  方式: string;
  效果: string;
  状态: string;
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ── Demo Data ──

const DEMO_FORESHADOWINGS: 伏笔数据[] = [
  {
    id: 1,
    名称: '苍云山上的流光',
    状态: '已埋设',
    重要度: '中',
    描述: '夜空划过没入云层的无形流光',
    类型: '伏笔',
  },
  {
    id: 2,
    名称: '神秘印记之谜',
    状态: '已埋设',
    重要度: '高',
    描述: '老人强行灌入沈牧眉心的无形力量',
    类型: '伏笔',
  },
  {
    id: 3,
    名称: '顾尘尘缘未尽的凡人旧物',
    状态: '已埋设',
    重要度: '低',
    描述: '第15章主角矿奴时期的粗糙木雕，第360章领悟凡人逆天执念借此斩道',
    类型: '物品伏笔',
    埋设章节: '第1-100章',
    回收章节: '第300-400章',
  },
  {
    id: 4,
    名称: '偃师魔渊的深处叹息声',
    状态: '已埋设',
    重要度: '低',
    描述: '第110章探秘境时听见微弱叹息，第280章破阵惊醒被囚天魔获取关键情报',
    类型: '线索伏笔',
    埋设章节: '第101-233章',
    回收章节: '第234-300章',
  },
  {
    id: 5,
    名称: '梵天漪袖中的黄泉玉佩',
    状态: '已埋设',
    重要度: '中',
    描述: '第200章反派女角把玩玉佩暗语，第340章天阙决战揭示其为魔道潜伏底牌',
    类型: '线索伏笔',
    埋设章节: '第197-296章',
    回收章节: '第300-400章',
  },
  {
    id: 6,
    名称: '离厄矿州底层的阵法枢核',
    状态: '已埋设',
    重要度: '中',
    描述: '第30章挖矿时遇诡异共鸣黑石，第250章率军重返摧毁资源垄断核心节点',
    类型: '物品伏笔',
    埋设章节: '第1-100章',
    回收章节: '第234-300章',
  },
  {
    id: 7,
    名称: '晷司神殿的倒悬虚影',
    状态: '已埋设',
    重要度: '中',
    描述: '第150章地图残片显现逆转阵纹，第280章破阵发现血祭苍生的逆转通道',
    类型: '线索伏笔',
    埋设章节: '第101-233章',
    回收章节: '第234-300章',
  },
  {
    id: 8,
    名称: '禁忌血晶中的残破神魂',
    状态: '已埋设',
    重要度: '高',
    描述: '第120章秘境捡拾残破挂坠，第330章天路血战唤醒其中上古典狱神魂助力',
    类型: '物品伏笔',
    埋设章节: '第101-233章',
    回收章节: '第300-400章',
  },
  {
    id: 9,
    名称: '尘骸子陨落的真实病因',
    状态: '已埋设',
    重要度: '高',
    描述: '第60章导师咳出黑血并隐藏旧伤，第260章揭示为上界神罚印记最终引爆',
    类型: '人物伏笔',
    埋设章节: '第1-100章',
    回收章节: '第234-300章',
  },
  {
    id: 10,
    名称: '幽泠背负的星渊血脉',
    状态: '已埋设',
    重要度: '高',
    描述: '第45章女主为救主角泄露星辰异象，第380章星渊深处唤醒血脉镇压神族',
    类型: '人物伏笔',
    埋设章节: '第1-100章',
    回收章节: '第300-400章',
  },
  {
    id: 11,
    名称: '伪天道意识与终极BOSS',
    状态: '已埋设',
    重要度: '极高',
    描述: '第80章残卷记载天道已死，第400章神殿惊觉天道被窃取化身为终极BOSS',
    类型: '剧情伏笔',
    埋设章节: '第1-100章',
    回收章节: '第400-500章',
  },
  {
    id: 12,
    名称: '主角禁忌本源符文之谜',
    状态: '已埋设',
    重要度: '极高',
    描述: '第10章矿底骨链初次异变，回收于第550章觉醒神帝逆鳞重塑道基',
    类型: '人物伏笔',
    埋设章节: '第1-100章',
    回收章节: '第500-600章',
    关联章节: [{ 章节名称: '第10章', 类型: '埋设', 关联度: 10, 描述: '' }],
  },
];

// ── Helpers ──

const 重要度样式: Record<string, string> = {
  极高: 'bg-red-500/20 text-red-400',
  高: 'bg-orange-500/20 text-orange-400',
  中: 'bg-blue-500/20 text-blue-400',
  低: 'bg-gray-500/20 text-gray-400',
};

const 重要度颜色: Record<string, string> = {
  极高: 'red',
  高: 'orange',
  中: 'blue',
  低: 'gray',
};

function getStatusBadge(status: string) {
  const map: Record<string, { bg: string; text: string }> = {
    已埋设: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    待呼应: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
    已回收: { bg: 'bg-green-500/20', text: 'text-green-400' },
    已废弃: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  };
  return map[status] || map['已埋设'];
}

// ── Component ──

export const ForeshadowingPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  const [foreshadowings, setForeshadowings] =
    useState<伏笔数据[]>(DEMO_FORESHADOWINGS);
  const [选中, set选中] = useState<伏笔数据 | null>(null);
  const [搜索词, set搜索词] = useState('');
  const [状态筛选, set状态筛选] = useState('');
  const [重要度筛选, set重要度筛选] = useState('');
  const [editForm, setEditForm] = useState<Partial<伏笔数据>>({});
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({ 备注: true });
  const [edit关联章节, setEdit关联章节] = useState<关联章节[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const ai = useAIGenerate();

  // Stats
  const 已埋设数 = foreshadowings.filter(f => f.状态 === '已埋设').length;
  const 待呼应数 = foreshadowings.filter(f => f.状态 === '待呼应').length;
  const 已回收数 = foreshadowings.filter(f => f.状态 === '已回收').length;

  // Sync form when selection changes
  React.useEffect(() => {
    if (选中) {
      setEditForm({ ...选中 });
      setEdit关联章节(选中.关联章节 ? [...选中.关联章节] : []);
    }
  }, [选中?.id]);

  // Filtered list
  const filteredList = foreshadowings.filter(f => {
    if (状态筛选 && f.状态 !== 状态筛选) return false;
    if (重要度筛选 && f.重要度 !== 重要度筛选) return false;
    if (搜索词 && !f.名称.includes(搜索词) && !(f.描述 || '').includes(搜索词))
      return false;
    return true;
  });

  const totalCount = foreshadowings.length;

  // Handlers
  const handle新建 = () => {
    const newId = Math.max(...foreshadowings.map(f => f.id), 0) + 1;
    const newItem: 伏笔数据 = {
      id: newId,
      名称: '',
      状态: '已埋设',
      重要度: '中',
      类型: '剧情伏笔',
      描述: '',
      解密程度: 0,
    };
    setForeshadowings(prev => [newItem, ...prev]);
    set选中(newItem);
  };

  const handle删除 = (id: number) => {
    setForeshadowings(prev => prev.filter(f => f.id !== id));
    if (选中?.id === id) set选中(null);
  };

  const handle保存 = () => {
    if (!选中) return;
    setSaving(true);
    const updated = { ...editForm, 关联章节: edit关联章节 } as 伏笔数据;
    setForeshadowings(prev => prev.map(f => (f.id === 选中.id ? updated : f)));
    set选中(updated);
    // Simulate async save
    setTimeout(() => setSaving(false), 600);
  };

  const handleAI生成 = async () => {
    setAiGenerating(true);
    const messages = [
      {
        role: 'user',
        content: `已有${foreshadowings.length}个伏笔，请再生成3-5个新的伏笔，注意不要与已有伏笔重复。`,
      },
    ];
    const text = await ai.generate(messages, {
      scenario: 'AI生成伏笔',
      context: { 已有伏笔名称: foreshadowings.map(f => f.名称) },
    });
    if (text) {
      const parsed = ai.parsedRef.current;
      let newItems: 伏笔数据[] = [];
      if (parsed?.伏笔列表 && Array.isArray(parsed.伏笔列表)) {
        newItems = parsed.伏笔列表.map((f: any, i: number) => ({
          id: Date.now() + i,
          名称: f.伏笔名称 || f.名称 || 'AI生成伏笔',
          状态: '已埋设' as string,
          重要度: f.重要度 || '中',
          类型: f.伏笔类型 || f.类型 || '剧情伏笔',
          描述: f.伏笔描述 || f.描述 || '',
          埋设章节: f.埋设章节名 || f.埋设章节,
          回收章节: f.预计回收章节 || f.回收章节,
          解密程度: 0,
        }));
      } else {
        const { data: jsonParsed } = parseAIJSON<Partial<伏笔数据>[]>(text);
        if (Array.isArray(jsonParsed)) {
          newItems = jsonParsed.map((f, i) => ({
            id: Date.now() + i,
            名称: f.名称 || 'AI生成伏笔',
            状态: f.状态 || '已埋设',
            重要度: f.重要度 || '中',
            类型: f.类型 || '剧情伏笔',
            描述: f.描述 || '',
            埋设章节: f.埋设章节,
            回收章节: f.回收章节,
            解密程度: f.解密程度 || 0,
          }));
        }
      }
      if (newItems.length > 0) {
        setForeshadowings(prev => [...newItems, ...prev]);
        set选中(newItems[0]);
      }
    }
    setAiGenerating(false);
  };

  const handleAI完善 = async () => {
    if (!选中) return;
    setAiGenerating(true);
    const messages = [
      {
        role: 'system',
        content:
          '你是一位专业的小说伏笔设计师。请完善给定的伏笔信息，输出JSON格式。',
      },
      {
        role: 'user',
        content: `伏笔名称：${选中.名称}\n当前描述：${选中.描述 || '无'}\n类型：${选中.类型}\n重要度：${选中.重要度}\n\n请完善该伏笔的描述和建议。输出JSON：{"描述":"完善后的描述","埋设位置描述":"建议的埋设位置","影响范围":"影响范围描述"}`,
      },
    ];
    const text = await ai.generate(messages);
    if (text) {
      const { data: parsed } = parseAIJSON<Partial<伏笔数据>>(text);
      if (parsed) {
        setEditForm(prev => ({
          ...prev,
          描述: parsed.描述 || prev.描述,
          埋设位置描述: parsed.埋设位置描述 || prev.埋设位置描述,
          影响范围: parsed.影响范围 || prev.影响范围,
        }));
      }
    }
    setAiGenerating(false);
  };

  const handle删除呼应记录 = (index: number) => {
    if (!选中?.呼应记录) return;
    const updated记录 = [...选中.呼应记录];
    updated记录.splice(index, 1);
    const updated伏笔 = { ...选中, 呼应记录: updated记录 };
    set选中(updated伏笔);
    setEditForm(prev => ({ ...prev, 呼应记录: updated记录 }));
    setForeshadowings(prev =>
      prev.map(f => (f.id === updated伏笔.id ? updated伏笔 : f))
    );
  };

  const handle添加呼应记录 = () => {
    if (!选中) return;
    const newRecord: 呼应记录 = {
      章节: '',
      方式: '',
      效果: '',
      状态: '待呼应',
    };
    const updated记录 = [...(选中.呼应记录 || []), newRecord];
    const updated伏笔 = { ...选中, 呼应记录: updated记录 };
    set选中(updated伏笔);
    setEditForm(prev => ({ ...prev, 呼应记录: updated记录 }));
    setForeshadowings(prev =>
      prev.map(f => (f.id === updated伏笔.id ? updated伏笔 : f))
    );
  };

  const handle添加章节关联 = () => {
    setEdit关联章节(prev => [
      ...prev,
      { 章节名称: '', 类型: '埋设', 关联度: 0, 描述: '' },
    ]);
  };

  const handle删除章节关联 = (index: number) => {
    setEdit关联章节(prev => prev.filter((_, i) => i !== index));
  };

  const handle更新关联章节 = (
    index: number,
    field: keyof 关联章节,
    value: string | number
  ) => {
    setEdit关联章节(prev =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const 解密程度标签 = (val: number) => {
    if (val === 0) return '未解密';
    if (val < 30) return '初步线索';
    if (val < 60) return '半解密';
    if (val < 100) return '即将揭示';
    return '完全解密';
  };

  // ── RENDER: Detail view ──
  if (选中) {
    return (
      <div className="v-1c48fc04">
        <div
          className="伏笔管理侧边栏容器 fixed top-0 bottom-0 z-40 flex"
          style={{ left: leftOffset }}
        >
          <div
            className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
            style={{ width: 560 }}
          >
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/20">
                    <i className="text-lg text-red-400 ri-lightbulb-line" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">伏笔管理</h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      编辑伏笔
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                    title="返回列表"
                    onClick={() => set选中(null)}
                  >
                    <i className="ri-arrow-left-line" />
                  </button>
                  <button
                    className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors text-red-400 disabled:opacity-50"
                    title="AI生成伏笔"
                    disabled={aiGenerating}
                    onClick={handleAI生成}
                  >
                    <i
                      className={`ri-magic-line${aiGenerating ? ' animate-spin' : ''}`}
                    />
                  </button>
                  <button
                    className="p-1.5 rounded-lg transition-colors hover:bg-amber-500/20 text-amber-400 disabled:opacity-50"
                    title="AI完善伏笔"
                    disabled={aiGenerating}
                    onClick={handleAI完善}
                  >
                    <i className="ri-sparkling-line" />
                  </button>
                  <button
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    disabled={saving}
                    onClick={handle保存}
                  >
                    <i
                      className={`ri-save-line${saving ? ' animate-pulse' : ''}`}
                    />{' '}
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button
                    className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                    onClick={() => set选中(null)}
                  >
                    <i className="text-lg ri-close-line" />
                  </button>
                </div>
              </div>
            </div>

            {/* Detail body */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-4">
                {/* ── 基础信息 section ── */}
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                  <div
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-dark)] transition-colors"
                    onClick={() => toggleSection('基础信息')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/20">
                        <i className="text-purple-400 ri-information-line" />
                      </div>
                      <h3 className="text-sm font-medium">基础信息</h3>
                    </div>
                    <i
                      className={`ri-arrow-up-s-line text-lg text-[var(--text-secondary)] transition-transform duration-200 ${collapsedSections['基础信息'] ? 'rotate-180' : ''}`}
                    />
                  </div>
                  {!collapsedSections['基础信息'] && (
                    <div className="px-4 pb-4">
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            伏笔名称 *
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-red-500/50 focus:outline-none"
                            placeholder="输入伏笔名称"
                            value={editForm.名称 || ''}
                            onChange={e =>
                              setEditForm(prev => ({
                                ...prev,
                                名称: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                              状态
                            </label>
                            <select
                              className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-red-500/50 focus:outline-none"
                              value={editForm.状态 || '已埋设'}
                              onChange={e =>
                                setEditForm(prev => ({
                                  ...prev,
                                  状态: e.target.value,
                                }))
                              }
                            >
                              <option value="已埋设">已埋设</option>
                              <option value="待呼应">待呼应</option>
                              <option value="已回收">已回收</option>
                              <option value="已废弃">已废弃</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                              解密程度
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                className="flex-1 h-2 bg-[var(--bg-card)] rounded-lg appearance-none cursor-pointer accent-red-500"
                                value={editForm.解密程度 || 0}
                                onChange={e =>
                                  setEditForm(prev => ({
                                    ...prev,
                                    解密程度: Number(e.target.value),
                                  }))
                                }
                              />
                              <span className="w-16 text-xs text-right">
                                {editForm.解密程度 || 0}%{' '}
                              </span>
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                              {解密程度标签(editForm.解密程度 || 0)}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                              重要度
                            </label>
                            <select
                              className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-red-500/50 focus:outline-none"
                              value={editForm.重要度 || '中'}
                              onChange={e =>
                                setEditForm(prev => ({
                                  ...prev,
                                  重要度: e.target.value,
                                }))
                              }
                            >
                              <option value="极高">极高</option>
                              <option value="高">高</option>
                              <option value="中">中</option>
                              <option value="低">低</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                              类型
                            </label>
                            <select
                              className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-red-500/50 focus:outline-none"
                              value={editForm.类型 || '剧情伏笔'}
                              onChange={e =>
                                setEditForm(prev => ({
                                  ...prev,
                                  类型: e.target.value,
                                }))
                              }
                            >
                              <option value="剧情伏笔">剧情伏笔</option>
                              <option value="人物伏笔">人物伏笔</option>
                              <option value="物品伏笔">物品伏笔</option>
                              <option value="线索伏笔">线索伏笔</option>
                              <option value="暗示伏笔">暗示伏笔</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            伏笔描述
                          </label>
                          <textarea
                            className="w-full h-24 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-red-500/50 focus:outline-none"
                            placeholder="伏笔的详细描述..."
                            value={editForm.描述 || ''}
                            onChange={e =>
                              setEditForm(prev => ({
                                ...prev,
                                描述: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 埋设信息 section ── */}
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                  <div
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-dark)] transition-colors"
                    onClick={() => toggleSection('埋设信息')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/20">
                        <i className="text-blue-400 ri-seedling-line" />
                      </div>
                      <h3 className="text-sm font-medium">埋设信息</h3>
                    </div>
                    <i
                      className={`ri-arrow-up-s-line text-lg text-[var(--text-secondary)] transition-transform duration-200 ${collapsedSections['埋设信息'] ? 'rotate-180' : ''}`}
                    />
                  </div>
                  {!collapsedSections['埋设信息'] && (
                    <div className="px-4 pb-4">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                              埋设章节
                            </label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-red-500/50 focus:outline-none"
                              placeholder="如：第三章"
                              value={editForm.埋设章节 || ''}
                              onChange={e =>
                                setEditForm(prev => ({
                                  ...prev,
                                  埋设章节: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div>
                            <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                              预计回收
                            </label>
                            <input
                              type="text"
                              className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-red-500/50 focus:outline-none"
                              placeholder="如：第一百章"
                              value={editForm.回收章节 || ''}
                              onChange={e =>
                                setEditForm(prev => ({
                                  ...prev,
                                  回收章节: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            埋设位置描述
                          </label>
                          <textarea
                            className="w-full h-16 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-red-500/50 focus:outline-none"
                            placeholder="描述伏笔具体在什么情节中埋设..."
                            value={editForm.埋设位置描述 || ''}
                            onChange={e =>
                              setEditForm(prev => ({
                                ...prev,
                                埋设位置描述: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            影响范围
                          </label>
                          <select
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-red-500/50 focus:outline-none"
                            value={editForm.影响范围 || '单线'}
                            onChange={e =>
                              setEditForm(prev => ({
                                ...prev,
                                影响范围: e.target.value,
                              }))
                            }
                          >
                            <option value="单线">单线</option>
                            <option value="多线">多线</option>
                            <option value="全局">全局</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 呼应记录 section ── */}
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                  <div
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-dark)] transition-colors"
                    onClick={() => toggleSection('呼应记录')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/20">
                        <i className="text-green-400 ri-links-line" />
                      </div>
                      <h3 className="text-sm font-medium">
                        呼应记录 ({选中.呼应记录?.length || 0})
                      </h3>
                    </div>
                    <i
                      className={`ri-arrow-up-s-line text-lg text-[var(--text-secondary)] transition-transform duration-200 ${collapsedSections['呼应记录'] ? 'rotate-180' : ''}`}
                    />
                  </div>
                  {!collapsedSections['呼应记录'] && (
                    <div className="px-4 pb-4">
                      <div className="space-y-2">
                        {(选中.呼应记录 || []).map((rec, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-[var(--bg-dark)] rounded-lg space-y-2 relative group"
                          >
                            <button
                              className="absolute p-1 text-red-400 transition-all rounded opacity-0 top-2 right-2 group-hover:opacity-100 hover:bg-red-500/20"
                              onClick={() => handle删除呼应记录(idx)}
                            >
                              <i className="text-xs ri-close-line" />
                            </button>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                                {rec.状态}
                              </span>
                              <span className="text-sm font-medium">
                                {rec.章节}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {rec.方式} - {rec.效果}
                            </p>
                          </div>
                        ))}
                        <button
                          className="w-full py-2 border border-dashed border-[var(--border)] rounded-lg text-sm text-[var(--text-secondary)] hover:border-green-500/50 hover:text-green-400 transition-colors"
                          onClick={handle添加呼应记录}
                        >
                          <i className="mr-1 ri-add-line" /> 添加呼应记录
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 章节关联 section ── */}
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                  <div
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-dark)] transition-colors"
                    onClick={() => toggleSection('章节关联')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/20">
                        <i className="text-indigo-400 ri-book-open-line" />
                      </div>
                      <h3 className="text-sm font-medium">
                        章节关联 ({edit关联章节.length})
                      </h3>
                    </div>
                    <i
                      className={`ri-arrow-up-s-line text-lg text-[var(--text-secondary)] transition-transform duration-200 ${collapsedSections['章节关联'] ? 'rotate-180' : ''}`}
                    />
                  </div>
                  {!collapsedSections['章节关联'] && (
                    <div className="px-4 pb-4">
                      <div className="space-y-2">
                        {edit关联章节.map((ch, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-[var(--bg-dark)] rounded-lg space-y-2 relative group"
                          >
                            <button
                              className="absolute p-1 text-red-400 transition-all rounded opacity-0 top-2 right-2 group-hover:opacity-100 hover:bg-red-500/20"
                              onClick={() => handle删除章节关联(idx)}
                            >
                              <i className="text-xs ri-close-line" />
                            </button>
                            <div className="grid grid-cols-3 gap-2">
                              <input
                                type="text"
                                className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:border-red-500/50 focus:outline-none"
                                placeholder="章节名称"
                                value={ch.章节名称}
                                onChange={e =>
                                  handle更新关联章节(
                                    idx,
                                    '章节名称',
                                    e.target.value
                                  )
                                }
                              />
                              <select
                                className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:border-red-500/50 focus:outline-none"
                                value={ch.类型}
                                onChange={e =>
                                  handle更新关联章节(
                                    idx,
                                    '类型',
                                    e.target.value
                                  )
                                }
                              >
                                <option value="埋设">埋设</option>
                                <option value="暗示">暗示</option>
                                <option value="呼应">呼应</option>
                                <option value="回收">回收</option>
                              </select>
                              <div className="flex items-center gap-1">
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  step="5"
                                  className="flex-1 h-1.5 bg-[var(--bg-dark)] rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                  value={ch.关联度}
                                  onChange={e =>
                                    handle更新关联章节(
                                      idx,
                                      '关联度',
                                      Number(e.target.value)
                                    )
                                  }
                                />
                                <span className="w-10 text-xs text-right">
                                  {ch.关联度}%
                                </span>
                              </div>
                            </div>
                            <div>
                              <textarea
                                className="w-full h-12 px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs resize-y focus:border-red-500/50 focus:outline-none"
                                placeholder="描述该章节中伏笔的具体表现..."
                                value={ch.描述}
                                onChange={e =>
                                  handle更新关联章节(
                                    idx,
                                    '描述',
                                    e.target.value
                                  )
                                }
                              />
                            </div>
                          </div>
                        ))}
                        <button
                          className="w-full py-2 border border-dashed border-[var(--border)] rounded-lg text-sm text-[var(--text-secondary)] hover:border-indigo-500/50 hover:text-indigo-400 transition-colors"
                          onClick={handle添加章节关联}
                        >
                          <i className="mr-1 ri-add-line" /> 添加章节关联
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 备注 section ── */}
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                  <div
                    className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-dark)] transition-colors"
                    onClick={() => toggleSection('备注')}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-yellow-500/20">
                        <i className="text-yellow-400 ri-sticky-note-line" />
                      </div>
                      <h3 className="text-sm font-medium">备注</h3>
                    </div>
                    <i
                      className={`ri-arrow-down-s-line text-lg text-[var(--text-secondary)] transition-transform duration-200 ${!collapsedSections['备注'] ? 'rotate-180' : ''}`}
                    />
                  </div>
                  {!collapsedSections['备注'] && (
                    <div className="px-4 pb-4">
                      <textarea
                        className="w-full h-24 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-red-500/50 focus:outline-none"
                        placeholder="其他备注信息..."
                        value={editForm.备注 || ''}
                        onChange={e =>
                          setEditForm(prev => ({
                            ...prev,
                            备注: e.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Resize handle */}
          <div className="w-1 h-full transition-colors bg-transparent hover:bg-red-500/30 cursor-col-resize" />
        </div>
      </div>
    );
  }

  // ── RENDER: List view ──
  return (
    <div className="v-1c48fc04">
      <div
        className="伏笔管理侧边栏容器 fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width: 560 }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/20">
                  <i className="text-lg text-red-400 ri-lightbulb-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">伏笔管理</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    共 {totalCount} 个伏笔
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors text-red-400 disabled:opacity-50"
                  title="AI生成伏笔"
                  disabled={aiGenerating}
                  onClick={handleAI生成}
                >
                  <i
                    className={`ri-magic-line${aiGenerating ? ' animate-spin' : ''}`}
                  />
                </button>
                <button
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
                  onClick={handle新建}
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
            <div className="flex gap-3 mt-3 text-xs">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 text-blue-400 rounded">
                <i className="ri-seedling-line" />
                <span>已埋设 {已埋设数}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 text-yellow-400 rounded">
                <i className="ri-time-line" />
                <span>待呼应 {待呼应数}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 text-green-400 rounded">
                <i className="ri-check-double-line" />
                <span>已回收 {已回收数}</span>
              </div>
            </div>
          </div>

          {/* List body */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-3">
              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="搜索伏笔..."
                  className="flex-1 min-w-[150px] px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-red-500/50 focus:outline-none"
                  value={搜索词}
                  onChange={e => set搜索词(e.target.value)}
                />
                <select
                  className="px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-red-500/50 focus:outline-none"
                  value={状态筛选}
                  onChange={e => set状态筛选(e.target.value)}
                >
                  <option value="">全部状态</option>
                  <option value="已埋设">已埋设</option>
                  <option value="待呼应">待呼应</option>
                  <option value="已回收">已回收</option>
                  <option value="已废弃">已废弃</option>
                </select>
                <select
                  className="px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-red-500/50 focus:outline-none"
                  value={重要度筛选}
                  onChange={e => set重要度筛选(e.target.value)}
                >
                  <option value="">全部重要度</option>
                  <option value="极高">极高</option>
                  <option value="高">高</option>
                  <option value="中">中</option>
                  <option value="低">低</option>
                </select>
              </div>

              {/* Card list */}
              <div className="space-y-2">
                {filteredList.map(f => {
                  const statusBadge = getStatusBadge(f.状态);
                  return (
                    <div
                      key={f.id}
                      className="p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg hover:border-red-500/50 cursor-pointer transition-colors group"
                      onClick={() => set选中(f)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-500/20 shrink-0">
                          <i className="text-red-400 ri-lightbulb-line" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium truncate">
                              {f.名称}
                            </h4>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${statusBadge.bg} ${statusBadge.text}`}
                            >
                              {f.状态}
                            </span>
                            {f.重要度 && (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${重要度样式[f.重要度] || 重要度样式['低']}`}
                              >
                                {f.重要度}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-[var(--text-secondary)]">
                            <span>{f.类型 || '伏笔'}</span>
                            {f.埋设章节 && <span>· {f.埋设章节}</span>}
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-2">
                            {f.描述}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            className="p-1 text-blue-400 transition-all rounded opacity-0 group-hover:opacity-100 hover:bg-blue-500/20"
                            title="预览伏笔"
                            onClick={e => {
                              e.stopPropagation();
                              set选中(f);
                            }}
                          >
                            <i className="text-sm ri-eye-line" />
                          </button>
                          <button
                            className="p-1 text-red-400 transition-all rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20"
                            title="删除伏笔"
                            onClick={e => {
                              e.stopPropagation();
                              handle删除(f.id);
                            }}
                          >
                            <i className="text-sm ri-delete-bin-line" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredList.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    {搜索词 || 状态筛选 || 重要度筛选
                      ? '没有匹配的伏笔'
                      : '暂无伏笔'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Resize handle */}
        <div className="w-1 h-full transition-colors bg-transparent hover:bg-red-500/30 cursor-col-resize" />
      </div>
    </div>
  );
};

export default ForeshadowingPanel;
