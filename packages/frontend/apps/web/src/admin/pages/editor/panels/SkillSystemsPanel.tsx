import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import { generateLLM, parseAIJSON } from './panel-shared';
import { API_BASE, getAuthHeaders } from '../useWorldApi';

// ── Source-derived: 55 功法类型 (Vue line 10561-10640) ──────

/** Vue source: 功法类型字典 line 10561-10640 */
const 功法大类选项 = [
  '功法',
  '武技',
  '炼体术',
  '身法',
  '魔法',
  '咒术',
  '符箓',
  '阵法',
  '火术',
  '水术',
  '雷术',
  '冰术',
  '风术',
  '土术',
  '神通',
  '幻术',
  '神识术',
  '音攻',
  '时间术',
  '空间术',
  '因果术',
  '命运术',
  '变身术',
  '分身术',
  '隐身术',
  '秘术',
  '血脉技',
  '天赋',
  '禁术',
  '鬼道',
  '灵术',
  '阴阳术',
  '契约术',
  '召唤术',
  '傀儡术',
  '器术',
  '丹术',
  '炼器术',
  '毒术',
  '机甲术',
  '基因术',
  '纳米术',
  '能量术',
  '医术',
  '驯兽术',
  '厨艺',
  '农艺',
  '占卜术',
  '风水术',
  '相术',
  '木术',
  '兽化',
  '虫术',
  '神术',
  '佛法',
  '道术',
];

/** Vue source: 功法类型说明字典 line 10561-10640 */
const 功法类型说明: Record<string, string> = {
  功法: '功法类特点：通过修炼内功心法提升修为，强调吐纳、打坐、运气，包含完整的修炼层次，注重内力运转路线。',
  武技: '武技类特点：战斗技巧和招式，强调身法、剑法、拳法等实战能力，讲究招式套路和临敌应变。',
  炼体术:
    '炼体术特点：专注锻炼肉身的修炼方法，通过淬体、炼骨、洗髓等提升身体强度，追求肉身成圣。',
  身法: '身法类特点：移动闪避的轻功技艺，强调速度、灵活性、隐匿性。',
  魔法: '魔法类特点：运用魔力施展法术，强调咒语、法阵、元素掌控，需要消耗魔力。',
  咒术: '咒术类特点：通过念诵特定咒语触发的能力，可诅咒敌人或祝福己方。',
  符箓: '符箓类特点：通过绘制符咒承载法力，可提前制作存储，使用时激活释放。',
  阵法: '阵法类特点：布置法阵产生特定效果，需要阵眼、阵基、阵旗等辅助。',
  火术: '火术类特点：操控火焰元素的功法，可释放火球、火墙、火海等攻击。',
  水术: '水术类特点：操控水元素的功法，可释放水箭、水盾、冰冻等攻防能力。',
  雷术: '雷术类特点：操控雷电元素的功法，以速度和爆发力著称。',
  冰术: '冰术类特点：操控冰霜元素的功法，兼具攻击和控制效果。',
  风术: '风术类特点：操控风元素的功法，强调速度和范围攻击。',
  土术: '土术类特点：操控土石元素的功法，以防御和控制见长。',
  神通: '神通类特点：神灵级别的强大能力，通常只有极高境界才能掌握。',
  幻术: '幻术类特点：制造幻象迷惑敌人的能力，作用于精神层面。',
  神识术: '神识术类特点：运用精神力/神识的功法，可探查、攻击、防御。',
  音攻: '音攻类特点：以声波为武器的功法，可通过乐器或声带释放攻击。',
  时间术: '时间术类特点：涉及时间操控的禁忌功法，可加速、减速、回溯。',
  空间术: '空间术类特点：涉及空间操控的功法，可瞬移、切割空间。',
  因果术: '因果术类特点：涉及因果律的功法，可改变因果链条。',
  命运术: '命运术类特点：涉及命运操控的功法，可预测或改变命运。',
  变身术: '变身术类特点：可改变自身形态的功法，化身各种形态。',
  分身术: '分身术类特点：制造分身的功法，分身可独立战斗。',
  隐身术: '隐身术类特点：可隐藏自身气息和外形的功法。',
  秘术: '秘术类特点：神秘的特殊技艺，通常有独特传承和修炼方式。',
  血脉技: '血脉技类特点：通过血脉觉醒获得的天赋能力，与种族血统相关。',
  天赋: '天赋类特点：与生俱来的特殊能力，无需学习即可使用。',
  禁术: '禁术类特点：被禁止使用的危险能力，威力极大但代价惨重。',
  鬼道: '鬼道类特点：涉及鬼魂、亡灵的功法，可召唤或操控鬼物。',
  灵术: '灵术类特点：涉及灵体、灵魂的功法，可沟通或操控灵体。',
  阴阳术: '阴阳术类特点：操控阴阳之力的功法，平衡生死、光暗。',
  契约术: '契约术类特点：通过签订契约获得能力的功法。',
  召唤术: '召唤术类特点：召唤其他存在的能力，可召唤灵兽、元素生物等。',
  傀儡术: '傀儡术类特点：操控傀儡或人偶的功法，可远程操控战斗。',
  器术: '器术类特点：运用法器/灵器释放能力的功法。',
  丹术: '丹术类特点：炼丹制药的技艺，可炼制各种丹药。',
  炼器术: '炼器术类特点：炼制法器的技艺，可打造各种法器、灵宝。',
  毒术: '毒术类特点：用毒施毒的技艺，可制作各种毒药、毒雾。',
  机甲术: '机甲术类特点：操控机甲/机械的功法，科技侧能力。',
  基因术: '基因术类特点：涉及基因改造的功法，可强化自身基因。',
  纳米术: '纳米术类特点：操控纳米技术的功法，科技侧能力。',
  能量术: '能量术类特点：操控各种能量的功法，可吸收、转化、释放。',
  医术: '医术类特点：治病救人的医疗技艺，包括诊断、用药、针灸。',
  驯兽术: '驯兽术类特点：驯服和控制灵兽/魔兽的功法。',
  厨艺: '厨艺类特点：通过烹饪获得特殊效果的功法，美食修仙。',
  农艺: '农艺类特点：种植灵草、灵药的功法，农业修仙。',
  占卜术: '占卜术类特点：预测未来或探查信息的功法。',
  风水术: '风水术类特点：堪舆地理、调整风水的功法。',
  相术: '相术类特点：通过面相、骨相判断命运的功法。',
  木术: '木术类特点：操控植物/木元素的功法，可催生藤蔓、树墙。',
  兽化: '兽化类特点：可获得野兽特征和能力的功法，部分或完全兽化。',
  虫术: '虫术类特点：操控昆虫/蛊虫的功法，可培养各种蛊虫。',
  神术: '神术类特点：神圣系功法，信仰之力驱动的神术。',
  佛法: '佛法类特点：佛门功法，以禅定、功德为修炼根基。',
  道术: '道术类特点：道门功法，以道法自然、符箓丹道为根基。',
};

/** Vue source: je(Ee, Pe, We, tt, nt, $t) line 10545-10745 */
function buildSkillSystemsPrompt(
  世界观: {
    世界名称?: string;
    世界类型?: string;
    势力格局?: string;
    社会结构?: string;
    核心规则?: string;
  } | null,
  力量体系列表:
    | {
        体系名称?: string;
        体系类型?: string;
        体系描述?: string;
      }[]
    | null,
  已有物品:
    | {
        物品名称?: string;
        类别?: string;
        作用?: string;
      }[]
    | null,
  已有功法:
    | {
        功法名称?: string;
        功法大类?: string;
        功法品级?: string;
        功法简介?: string;
      }[]
    | null,
  指定类型: string = '',
  已有功法名: string[] = [],
  生成数量: number = 1
): string {
  let s = `你是一位专业的小说功法设计师，擅长构建完整的功法、魔法、武技等能力系统。\n请根据用户的需求和提供的世界观信息，生成详细的功法设定。\n\n`;

  // 【重要】生成数量 — Vue line 10642-10644
  if (生成数量 > 1) {
    s += `【重要】请生成 ${生成数量} 个不同的功法，每个功法都要有独特的名称、设定和特点，避免雷同。\n\n`;
  }

  // 【指定功法类型】 — Vue line 10561-10640
  if (指定类型) {
    s += `【指定功法类型】\n你必须生成一个「${指定类型}」类型的功法，所有设定都要符合该类型的特征。\n\n`;
    const desc = 功法类型说明[指定类型];
    if (desc) s += `${desc}\n\n`;
  }

  // 【世界观背景】 5 fields — Vue line 10547-10553
  if (世界观 && Object.keys(世界观).some(k => (世界观 as any)[k])) {
    s += `【世界观背景】\n世界名称：${世界观.世界名称 || '未设定'}\n世界类型：${世界观.世界类型 || '未设定'}\n势力格局：${世界观.势力格局 || '未设定'}\n社会结构：${世界观.社会结构 || '未设定'}\n核心规则：${世界观.核心规则 || '未设定'}\n\n`;
  }

  // 【已有力量体系】 max 5 — Vue line 10554-10558
  if (力量体系列表 && 力量体系列表.length > 0) {
    s += `【已有力量体系】\n`;
    力量体系列表.slice(0, 5).forEach(p => {
      s += `- ${p.体系名称}（${p.体系类型}）：${p.体系描述?.substring(0, 50) || '无描述'}\n`;
    });
    s += '\n';
  }

  // 【已有物品】 max 10 — Vue line 10559-10560
  if (已有物品 && 已有物品.length > 0) {
    s += `【已有物品】\n`;
    已有物品.slice(0, 10).forEach(it => {
      s += `- ${it.物品名称}${it.类别 ? `（${it.类别}）` : ''}${it.作用 ? `：${it.作用.substring(0, 30)}` : ''}\n`;
    });
    s += '\n';
  }

  // 【已有功法】 — Vue line 10641
  if (已有功法 && 已有功法.length > 0) {
    s += `【已有功法】（请避免重复，可以参考风格）\n`;
    已有功法.forEach(sk => {
      s += `- ${sk.功法名称}（${sk.功法大类}/${sk.功法品级}）：${sk.功法简介?.substring(0, 30) || '无描述'}\n`;
    });
    s += '\n';
  }

  // 【绝对禁止重复】 box — Vue line 10645-10650
  if (已有功法名.length > 0) {
    s += `\n╔══════════════════════════════════════════════════════════════╗\n║  【绝对禁止重复】以下功法名称已被使用，生成任何重复名称将导致任务失败\n╚════════════════════════════════════════════════════════════════╝\n已存在的功法(${已有功法名.length}个)：${已有功法名.slice(0, 20).join('、')}\n`;
  }

  // Output format — Vue line 10700-10730
  s += `\n【输出格式】（极简格式，节省token）\n`;
  s += `N|功法名称|功法大类|功法品级\n`;
  s += `D|功法描述\n`;
  s += `E|效果名称|效果类型|效果描述\n`;
  s += `C|消耗类型|消耗数值|冷却时间\n`;
  s += `R|使用限制|副作用\n\n`;
  s += `【格式说明】\n`;
  s += `- N: 基本信息（必填，每个功法第1行）\n`;
  s += `  - 功法大类：${功法大类选项.slice(0, 10).join('/')}等\n`;
  s += `  - 功法品级：入门/初级/中级/高级/精英/传说/神话\n`;
  s += `- D: 功法描述（必填，10-50字）\n`;
  s += `- E: 效果（可多行，建议2-4个）— 效果类型：攻击/防御/治疗/控制/增益/减益/移动/感知/召唤/变化/特殊\n`;
  s += `- C: 消耗信息（可选）\n`;
  s += `- R: 限制信息（可选）\n\n`;
  s += `【重要规则】\n`;
  s += `1. 严格按格式输出，每个功法按N→D→E→C→R顺序\n`;
  s += `2. 每个功法的N行必须在该功法的第一行\n`;
  s += `3. 不要输出任何其他内容\n`;
  s += `4. 不要输出JSON，只输出上述管道格式\n`;
  s += `5. ⚠️ 在输出前检查功法名称是否与已有名称重复\n`;

  return s;
}

interface PipeSkillEffect {
  效果名称: string;
  效果类型: string;
  效果描述: string;
}
interface PipeSkillData {
  功法名称: string;
  功法大类: string;
  功法品级: string;
  功法描述: string;
  效果列表: PipeSkillEffect[];
  消耗类型: string;
  消耗数值: string;
  冷却时间: string;
  使用限制: string;
  副作用: string;
}

function parseSkillPipe(text: string): PipeSkillData[] {
  const results: PipeSkillData[] = [];
  let current: PipeSkillData | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('N|')) {
      const parts = line.split('|');
      current = {
        功法名称: (parts[1] || '').trim(),
        功法大类: (parts[2] || '').trim(),
        功法品级: (parts[3] || '').trim(),
        功法描述: '',
        效果列表: [],
        消耗类型: '',
        消耗数值: '',
        冷却时间: '',
        使用限制: '',
        副作用: '',
      };
      results.push(current);
    } else if (line.startsWith('D|') && current) {
      current.功法描述 = line.slice(2).trim();
    } else if (line.startsWith('E|') && current) {
      const parts = line.split('|');
      current.效果列表.push({
        效果名称: (parts[1] || '').trim(),
        效果类型: (parts[2] || '').trim(),
        效果描述: (parts[3] || '').trim(),
      });
    } else if (line.startsWith('C|') && current) {
      const parts = line.split('|');
      current.消耗类型 = (parts[1] || '').trim();
      current.消耗数值 = (parts[2] || '').trim();
      current.冷却时间 = (parts[3] || '').trim();
    } else if (line.startsWith('R|') && current) {
      const parts = line.split('|');
      current.使用限制 = (parts[1] || '').trim();
      current.副作用 = (parts[2] || '').trim();
    }
  }
  return results;
}

function parseSkillResponse(text: string): 功法数据[] {
  // Try pipe format first
  const pipeResults = parseSkillPipe(text);
  if (pipeResults.length > 0) {
    return pipeResults.map((s, i) => ({
      id: Date.now() + i,
      功法名称: s.功法名称 || '未命名',
      功法大类: s.功法大类 || '功法',
      效果分类: '特殊',
      功法品级: s.功法品级 || '入门',
      稀有度: '普通',
      功法描述: s.功法描述 || '',
      功法简介: s.功法描述 ? s.功法描述.slice(0, 50) : '',
      功法来源: '传承',
      创造者: '',
      流派归属: '',
      效果列表: s.效果列表.map(e => ({
        ...e,
        效果数值: '',
        持续时间: '',
        作用目标: '',
      })),
      消耗信息: {
        消耗类型: s.消耗类型 || '',
        消耗数值: s.消耗数值 || '',
        冷却时间: s.冷却时间 || '',
      },
      修炼信息: {
        修炼难度: '',
        境界要求: '',
        修炼方法: '',
        所需资源: '',
        关键心得: '',
      },
      进阶列表: [],
      限制信息: {
        使用限制: s.使用限制,
        副作用: s.副作用,
        反噬风险: '',
        禁忌事项: '',
      },
    }));
  }
  // JSON fallback
  const { data, failed } = parseAIJSON<any>(text);
  if (failed || !data) return [];
  const items: any[] = Array.isArray(data) ? data : data.功法列表 || [];
  return items.map((s: any, i: number) => ({
    id: Date.now() + i,
    功法名称: s.功法名称 || '未命名',
    功法大类: s.功法大类 || '功法',
    效果分类: s.效果分类 || '特殊',
    功法品级: s.功法品级 || '入门',
    稀有度: s.稀有度 || '普通',
    功法描述: s.功法描述 || '',
    功法简介: s.功法简介 || '',
    功法来源: s.功法来源 || '传承',
    创造者: s.创造者 || '',
    流派归属: s.流派归属 || '',
    效果列表: s.效果列表 || [],
    消耗信息: s.消耗信息 || {
      消耗类型: '',
      消耗数值: '',
      冷却时间: '',
    },
    修炼信息: s.修炼信息 || {
      修炼难度: '',
      境界要求: '',
      修炼方法: '',
      所需资源: '',
      关键心得: '',
    },
    进阶列表: s.进阶列表 || [],
    限制信息: s.限制信息 || {
      使用限制: '',
      副作用: '',
      反噬风险: '',
      禁忌事项: '',
    },
  }));
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

/* Source-derived: skill fields (源码 lines 164142-170xxx) */
interface 功法数据 {
  id: number;
  功法名称: string;
  功法大类: string;
  效果分类: string;
  功法品级: string;
  稀有度: string;
  功法描述: string;
  功法简介: string;
  功法来源: string;
  创造者: string;
  流派归属: string;
  效果列表: {
    效果名称: string;
    效果类型: string;
    效果描述: string;
    效果数值: string;
    持续时间: string;
    作用目标: string;
  }[];
  消耗信息: {
    消耗类型: string;
    消耗数值: string;
    冷却时间: string;
  };
  修炼信息: {
    修炼难度: string;
    境界要求: string;
    修炼方法: string;
    所需资源: string;
    关键心得: string;
  };
  进阶列表: {
    阶段名称: string;
    阶段描述: string;
    所需条件: string;
  }[];
  限制信息: {
    使用限制: string;
    副作用: string;
    反噬风险: string;
    禁忌事项: string;
  };
}

const 效果分类选项 = [
  '攻击',
  '防御',
  '治疗',
  '控制',
  '增益',
  '减益',
  '移动',
  '感知',
  '召唤',
  '变化',
  '特殊',
];
const 品级选项 = [
  '入门',
  '初级',
  '中级',
  '高级',
  '精英',
  '传说',
  '神话',
  '禁忌',
];
const 稀有度选项 = ['普通', '稀有', '史诗', '传说', '绝版', '独一无二'];
const 来源选项 = [
  '传承',
  '顿悟',
  '学习',
  '奖励',
  '购买',
  '天赋',
  '契约',
  '觉醒',
  '其他',
];

export const SkillSystemsPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const [功法列表, set功法列表] = useState<功法数据[]>([]);
  const [当前ID, set当前ID] = useState<number | null>(null);
  const [搜索词, set搜索词] = useState('');
  const [类别过滤, set类别过滤] = useState('');
  const [width, setWidth] = useState(520);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load skill systems data
  useEffect(() => {
    if (!projectId) return;
    fetch(`${API_BASE}/api/skill-systems/project/${projectId}/list`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data))
          set功法列表(result.data);
      })
      .catch(() => {});
  }, [projectId]);

  /* AI Generation state (源码 line 164593) */
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [genResult, setGenResult] = useState<功法数据[] | null>(null);
  const [genError, setGenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const 当前功法 = 功法列表.find(s => s.id === 当前ID) || null;

  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    setSaved(false);
    try {
      await Promise.allSettled(
        功法列表.map(s => {
          if (!s.id || s.id > 1000000000000) {
            return fetch(
              `${API_BASE}/api/skill-systems/project/${projectId}/skill`,
              {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(s),
              }
            );
          }
          return fetch(
            `${API_BASE}/api/skill-systems/project/${projectId}/skill/${s.id}`,
            {
              method: 'PUT',
              headers: getAuthHeaders(),
              body: JSON.stringify(s),
            }
          );
        })
      );
      const res = await fetch(
        `${API_BASE}/api/skill-systems/project/${projectId}/list`,
        {
          headers: getAuthHeaders(),
        }
      );
      const result = await res.json();
      if (result.success && Array.isArray(result.data))
        set功法列表(result.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectId, 功法列表]);

  const addSkill = useCallback(() => {
    const id = Date.now();
    set功法列表(prev => [
      ...prev,
      {
        id,
        功法名称: '新功法',
        功法大类: '功法',
        效果分类: '特殊',
        功法品级: '入门',
        稀有度: '普通',
        功法描述: '',
        功法简介: '',
        功法来源: '传承',
        创造者: '',
        流派归属: '',
        效果列表: [],
        消耗信息: { 消耗类型: '', 消耗数值: '', 冷却时间: '' },
        修炼信息: {
          修炼难度: '',
          境界要求: '',
          修炼方法: '',
          所需资源: '',
          关键心得: '',
        },
        进阶列表: [],
        限制信息: { 使用限制: '', 副作用: '', 反噬风险: '', 禁忌事项: '' },
      },
    ]);
    set当前ID(id);
  }, []);

  const updateSkill = useCallback((id: number, updates: Partial<功法数据>) => {
    set功法列表(prev =>
      prev.map(s => (s.id === id ? { ...s, ...updates } : s))
    );
  }, []);

  const deleteSkill = useCallback(
    async (id: number) => {
      if (!projectId) return;
      const isLocal = id > 1000000000000;
      if (!isLocal) {
        try {
          await fetch(
            `${API_BASE}/api/skill-systems/project/${projectId}/skill/${id}`,
            { method: 'DELETE', headers: getAuthHeaders() }
          );
        } catch {}
      }
      set功法列表(prev => prev.filter(s => s.id !== id));
      if (当前ID === id) set当前ID(null);
    },
    [projectId, 当前ID]
  );

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
      // ── getContext — Vue: GET /skill-systems/project/{id}/context
      let 世界观: any = null;
      let 力量体系列表: any[] = [];
      let 已有物品: any[] = [];
      let 已有功法ctx: any[] = [];
      try {
        const ctxRes = await fetch(
          `${API_BASE}/api/skill-systems/project/${projectId}/context`,
          { headers: getAuthHeaders() }
        );
        const ctxData = await ctxRes.json();
        if (ctxData.success && ctxData.data) {
          世界观 = ctxData.data.世界观信息 || null;
          力量体系列表 = ctxData.data.力量体系列表 || [];
          已有物品 = ctxData.data.物品列表 || [];
          已有功法ctx = ctxData.data.已有功法 || ctxData.data.功法列表 || [];
        }
      } catch {}

      const 已有功法名 = 功法列表.map(s => s.功法名称).filter(n => !!n?.trim());
      const systemPrompt = buildSkillSystemsPrompt(
        世界观,
        力量体系列表,
        已有物品,
        已有功法ctx,
        '',
        已有功法名
      );
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: aiPrompt || '请生成1个功法。按管道格式输出。',
        },
      ];

      const fullText = await generateLLM({
        messages,
        temperature: 0.85,
        max_tokens: 4096,
        onChunk: setStreamText,
        signal: ac.signal,
      });

      const parsed = parseSkillResponse(fullText);
      if (!parsed || parsed.length === 0) {
        setGenError('AI返回格式解析失败');
        return;
      }
      setGenResult(parsed);
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, 功法列表, projectId]);

  const adoptResult = useCallback(async () => {
    if (!genResult || !projectId) return;
    setShowAIDialog(false);
    setGenResult(null);
    // POST each skill to server — Vue: POST /skill-systems/project/{id}/skill
    for (const item of genResult) {
      try {
        await fetch(
          `${API_BASE}/api/skill-systems/project/${projectId}/skill`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(item),
          }
        );
      } catch {}
    }
    // Refresh list from server
    try {
      const res = await fetch(
        `${API_BASE}/api/skill-systems/project/${projectId}/list`,
        { headers: getAuthHeaders() }
      );
      const result = await res.json();
      if (result.success && Array.isArray(result.data))
        set功法列表(result.data);
    } catch {}
  }, [genResult, projectId]);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    if (!generating) setShowAIDialog(false);
  }, [generating]);

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

  const 过滤后列表 = useMemo(
    () =>
      功法列表.filter(s => {
        const 匹配搜索 =
          !搜索词 || s.功法名称.includes(搜索词) || s.功法简介.includes(搜索词);
        const 匹配类别 = !类别过滤 || s.功法大类 === 类别过滤;
        return 匹配搜索 && 匹配类别;
      }),
    [功法列表, 搜索词, 类别过滤]
  );

  return createPortal(
    <div className="v-skill-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-500/20">
                  <i className="text-lg text-purple-400 ri-book-2-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">功法体系</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    共 {功法列表.length} 个功法
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-purple-500/20 rounded-lg transition-colors text-purple-400"
                  title="AI生成"
                  onClick={openAIDialog}
                  disabled={generating}
                >
                  <i
                    className={`ri-${generating ? 'loader-4-line animate-spin' : 'magic-line'}`}
                  />
                </button>
                <button
                  className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors disabled:opacity-50"
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
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left: List */}
            <div className="w-56 flex flex-col border-r border-[var(--border)]">
              <div className="shrink-0 p-3 border-b border-[var(--border)] space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">功法列表</h3>
                  <button
                    className="p-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded text-xs flex items-center gap-1"
                    onClick={addSkill}
                  >
                    <i className="ri-add-line" /> 新建
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="搜索功法..."
                  value={搜索词}
                  onChange={e => set搜索词(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:outline-none"
                />
                <select
                  value={类别过滤}
                  onChange={e => set类别过滤(e.target.value)}
                  className="w-full px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs"
                >
                  <option value="">全部类别</option>
                  {功法大类选项.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto">
                {过滤后列表.map(s => (
                  <div
                    key={s.id}
                    className={`p-3 border-b border-[var(--border)] hover:bg-[var(--bg-dark)] cursor-pointer transition-colors ${当前ID === s.id ? 'bg-purple-500/10' : ''}`}
                    onClick={() => set当前ID(s.id)}
                  >
                    <span className="text-sm font-medium">{s.功法名称}</span>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {s.功法大类} · {s.功法品级}
                    </p>
                  </div>
                ))}
                {过滤后列表.length === 0 && (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无功法
                  </div>
                )}
              </div>
            </div>

            {/* Right: Detail */}
            <div className="flex-1 overflow-y-auto">
              {当前功法 ? (
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">功法详情</h3>
                    <button
                      className="p-1 hover:bg-red-500/20 rounded text-xs text-[var(--text-secondary)] hover:text-red-400"
                      onClick={() => deleteSkill(当前功法.id)}
                    >
                      <i className="ri-delete-bin-line" />
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      功法名称 *
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                      placeholder="输入功法名称"
                      value={当前功法.功法名称}
                      onChange={e =>
                        updateSkill(当前功法.id, { 功法名称: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        大类
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前功法.功法大类}
                        onChange={e =>
                          updateSkill(当前功法.id, { 功法大类: e.target.value })
                        }
                      >
                        {功法大类选项.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        品级
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前功法.功法品级}
                        onChange={e =>
                          updateSkill(当前功法.id, { 功法品级: e.target.value })
                        }
                      >
                        {品级选项.map(g => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        稀有度
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前功法.稀有度}
                        onChange={e =>
                          updateSkill(当前功法.id, { 稀有度: e.target.value })
                        }
                      >
                        {稀有度选项.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      简介
                    </label>
                    <input
                      type="text"
                      className="w-full h-9 px-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                      placeholder="一句话简介"
                      value={当前功法.功法简介}
                      onChange={e =>
                        updateSkill(当前功法.id, { 功法简介: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] block mb-1">
                      详细描述
                    </label>
                    <textarea
                      className="w-full p-3 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg resize-y min-h-[80px]"
                      placeholder="功法的详细描述..."
                      value={当前功法.功法描述}
                      onChange={e =>
                        updateSkill(当前功法.id, { 功法描述: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        来源
                      </label>
                      <select
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        value={当前功法.功法来源}
                        onChange={e =>
                          updateSkill(当前功法.id, { 功法来源: e.target.value })
                        }
                      >
                        {来源选项.map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        创造者
                      </label>
                      <input
                        type="text"
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        placeholder="创造者"
                        value={当前功法.创造者}
                        onChange={e =>
                          updateSkill(当前功法.id, { 创造者: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] block mb-1">
                        流派归属
                      </label>
                      <input
                        type="text"
                        className="w-full h-9 px-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg"
                        placeholder="流派归属"
                        value={当前功法.流派归属}
                        onChange={e =>
                          updateSkill(当前功法.id, { 流派归属: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  {/* Effects */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold">效果列表</h4>
                      <button
                        className="text-xs text-purple-400"
                        onClick={() =>
                          updateSkill(当前功法.id, {
                            效果列表: [
                              ...当前功法.效果列表,
                              {
                                效果名称: '',
                                效果类型: '特殊',
                                效果描述: '',
                                效果数值: '',
                                持续时间: '',
                                作用目标: '',
                              },
                            ],
                          })
                        }
                      >
                        <i className="ri-add-line" /> 添加
                      </button>
                    </div>
                    {当前功法.效果列表.map((ef, i) => (
                      <div
                        key={i}
                        className="p-2 bg-[var(--bg-dark)] rounded-lg space-y-2 mb-2 relative group"
                      >
                        <button
                          className="absolute p-1 text-red-400 transition-all rounded opacity-0 top-1 right-1 group-hover:opacity-100 hover:bg-red-500/20"
                          onClick={() =>
                            updateSkill(当前功法.id, {
                              效果列表: 当前功法.效果列表.filter(
                                (_, idx) => idx !== i
                              ),
                            })
                          }
                        >
                          <i className="ri-close-line text-xs" />
                        </button>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            className="flex-1 h-8 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded"
                            placeholder="效果名称"
                            value={ef.效果名称}
                            onChange={e => {
                              const list = 当前功法.效果列表.map((item, idx) =>
                                idx === i
                                  ? { ...item, 效果名称: e.target.value }
                                  : item
                              );
                              updateSkill(当前功法.id, { 效果列表: list });
                            }}
                          />
                          <select
                            className="w-16 h-8 px-1 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded"
                            value={ef.效果类型}
                            onChange={e => {
                              const list = 当前功法.效果列表.map((item, idx) =>
                                idx === i
                                  ? { ...item, 效果类型: e.target.value }
                                  : item
                              );
                              updateSkill(当前功法.id, { 效果列表: list });
                            }}
                          >
                            {效果分类选项.map(t => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="text"
                          className="w-full h-8 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded"
                          placeholder="效果描述"
                          value={ef.效果描述}
                          onChange={e => {
                            const list = 当前功法.效果列表.map((item, idx) =>
                              idx === i
                                ? { ...item, 效果描述: e.target.value }
                                : item
                            );
                            updateSkill(当前功法.id, { 效果列表: list });
                          }}
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="text"
                            className="h-7 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded"
                            placeholder="效果数值"
                            value={ef.效果数值}
                            onChange={e => {
                              const list = 当前功法.效果列表.map((item, idx) =>
                                idx === i
                                  ? { ...item, 效果数值: e.target.value }
                                  : item
                              );
                              updateSkill(当前功法.id, { 效果列表: list });
                            }}
                          />
                          <input
                            type="text"
                            className="h-7 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded"
                            placeholder="持续时间"
                            value={ef.持续时间}
                            onChange={e => {
                              const list = 当前功法.效果列表.map((item, idx) =>
                                idx === i
                                  ? { ...item, 持续时间: e.target.value }
                                  : item
                              );
                              updateSkill(当前功法.id, { 效果列表: list });
                            }}
                          />
                          <input
                            type="text"
                            className="h-7 px-2 text-xs bg-[var(--bg-card)] border border-[var(--border)] rounded"
                            placeholder="作用目标"
                            value={ef.作用目标}
                            onChange={e => {
                              const list = 当前功法.效果列表.map((item, idx) =>
                                idx === i
                                  ? { ...item, 作用目标: e.target.value }
                                  : item
                              );
                              updateSkill(当前功法.id, { 效果列表: list });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* 消耗信息 */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <h4 className="text-xs font-semibold mb-2">消耗信息</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="消耗类型"
                        value={当前功法.消耗信息.消耗类型}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            消耗信息: {
                              ...当前功法.消耗信息,
                              消耗类型: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="消耗数值"
                        value={当前功法.消耗信息.消耗数值}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            消耗信息: {
                              ...当前功法.消耗信息,
                              消耗数值: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="冷却时间"
                        value={当前功法.消耗信息.冷却时间}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            消耗信息: {
                              ...当前功法.消耗信息,
                              冷却时间: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  {/* 进阶列表 */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold">进阶列表</h4>
                      <button
                        className="text-xs text-purple-400"
                        onClick={() =>
                          updateSkill(当前功法.id, {
                            进阶列表: [
                              ...当前功法.进阶列表,
                              { 阶段名称: '', 阶段描述: '', 所需条件: '' },
                            ],
                          })
                        }
                      >
                        <i className="ri-add-line" /> 添加
                      </button>
                    </div>
                    {当前功法.进阶列表.map((lv, i) => (
                      <div key={i} className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          className="flex-1 h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                          placeholder="阶段名称"
                          value={lv.阶段名称}
                          onChange={e => {
                            const list = 当前功法.进阶列表.map((item, idx) =>
                              idx === i
                                ? { ...item, 阶段名称: e.target.value }
                                : item
                            );
                            updateSkill(当前功法.id, { 进阶列表: list });
                          }}
                        />
                        <input
                          type="text"
                          className="flex-1 h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                          placeholder="阶段描述"
                          value={lv.阶段描述}
                          onChange={e => {
                            const list = 当前功法.进阶列表.map((item, idx) =>
                              idx === i
                                ? { ...item, 阶段描述: e.target.value }
                                : item
                            );
                            updateSkill(当前功法.id, { 进阶列表: list });
                          }}
                        />
                        <input
                          type="text"
                          className="flex-1 h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                          placeholder="所需条件"
                          value={lv.所需条件}
                          onChange={e => {
                            const list = 当前功法.进阶列表.map((item, idx) =>
                              idx === i
                                ? { ...item, 所需条件: e.target.value }
                                : item
                            );
                            updateSkill(当前功法.id, { 进阶列表: list });
                          }}
                        />
                        <button
                          className="p-1 hover:bg-red-500/20 rounded text-[var(--text-secondary)] hover:text-red-400"
                          onClick={() =>
                            updateSkill(当前功法.id, {
                              进阶列表: 当前功法.进阶列表.filter(
                                (_, idx) => idx !== i
                              ),
                            })
                          }
                        >
                          <i className="ri-close-line text-xs" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {/* 修炼信息 */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <h4 className="text-xs font-semibold mb-2">修炼信息</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="修炼难度"
                        value={当前功法.修炼信息.修炼难度}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            修炼信息: {
                              ...当前功法.修炼信息,
                              修炼难度: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="境界要求"
                        value={当前功法.修炼信息.境界要求}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            修炼信息: {
                              ...当前功法.修炼信息,
                              境界要求: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="修炼方法"
                        value={当前功法.修炼信息.修炼方法}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            修炼信息: {
                              ...当前功法.修炼信息,
                              修炼方法: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="所需资源"
                        value={当前功法.修炼信息.所需资源}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            修炼信息: {
                              ...当前功法.修炼信息,
                              所需资源: e.target.value,
                            },
                          })
                        }
                      />
                      <input
                        type="text"
                        className="h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                        placeholder="关键心得"
                        value={当前功法.修炼信息.关键心得}
                        onChange={e =>
                          updateSkill(当前功法.id, {
                            修炼信息: {
                              ...当前功法.修炼信息,
                              关键心得: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  {/* 限制信息 */}
                  <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <h4 className="text-xs font-semibold mb-2">限制信息</h4>
                    <div className="space-y-2">
                      {(
                        ['使用限制', '副作用', '反噬风险', '禁忌事项'] as const
                      ).map(field => (
                        <input
                          key={field}
                          type="text"
                          className="w-full h-8 px-2 text-xs bg-[var(--bg-dark)] border border-[var(--border)] rounded"
                          placeholder={field}
                          value={当前功法.限制信息[field]}
                          onChange={e =>
                            updateSkill(当前功法.id, {
                              限制信息: {
                                ...当前功法.限制信息,
                                [field]: e.target.value,
                              },
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
                  选择或创建一个功法
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-darker)]">
            <span className="text-xs text-[var(--text-secondary)]">
              {功法列表.length} 个功法
            </span>
          </div>
        </div>
        <div
          className="relative z-10 w-2 bg-transparent cursor-col-resize hover:bg-purple-500/50 active:bg-purple-500 shrink-0"
          onMouseDown={handleMouseDown}
        />
        <div
          className="fixed top-0 bottom-0 right-0 bg-black/0 hover:bg-black/5"
          style={{ left: (leftOffset || 0) + width + 2 }}
          onClick={onClose}
        />
      </div>

      {/* AI Dialog */}
      {showAIDialog &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ri-magic-line text-purple-400" />
                  <h3 className="font-semibold">AI生成功法</h3>
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
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:border-purple-500"
                    placeholder="描述你想要的功法特点..."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    disabled={generating}
                  />
                </div>
                {generating && streamText && (
                  <div className="bg-[var(--bg-dark)] rounded-xl p-4">
                    <pre className="text-xs whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                      {streamText}
                    </pre>
                  </div>
                )}
                {genError && <p className="text-sm text-red-400">{genError}</p>}
                {genResult && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">
                      生成结果（{genResult.length}个）
                    </h4>
                    {genResult.map((s, i) => (
                      <div
                        key={i}
                        className="bg-[var(--bg-dark)] rounded-xl p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {s.功法名称}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">
                            {s.功法大类}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400">
                            {s.功法品级}
                          </span>
                        </div>
                        {s.功法简介 && (
                          <p className="text-xs text-[var(--text-secondary)] mt-1">
                            {s.功法简介}
                          </p>
                        )}
                      </div>
                    ))}
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

export default SkillSystemsPanel;
