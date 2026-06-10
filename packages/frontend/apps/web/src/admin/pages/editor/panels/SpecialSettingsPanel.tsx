import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generateLLM, parseAIJSON } from './panel-shared';
import { API_BASE, getAuthHeaders, saveGeneration } from '../useWorldApi';

// ── Source-derived prompt & pipe parsers (Vue source line 42689-42819) ──

/** Vue source: 金手指类型说明字典 line 42697-42716 */
const 金手指类型说明: Record<string, string> = {
  系统流: '主角获得系统，通过系统面板、任务、奖励等方式获得成长',
  血脉流: '主角拥有特殊血脉，血脉觉醒可以获得各种能力',
  技能流: '主角拥有特殊技能，技能升级可以变强',
  道具流: '主角拥有特殊道具/法宝，道具可以成长或解锁新功能',
  宿主流: '主角作为某种高等存在的宿主，与之共生获得能力',
  穿越赠品: '穿越/重生时获得的初始礼包或新手大礼包',
  天命之子: '天选之人，拥有特殊命运或气运加持',
  融合流: '与某种存在融合后获得的能力',
  空间流: '主角拥有独立空间，可以储物、种植、修炼等',
  签到流: '通过签到获得奖励，签到天数越长奖励越丰厚',
  抽奖流: '通过抽奖/转盘获得随机奖励',
  商城流: '拥有系统商城，可以购买各种物品和能力',
  任务流: '通过完成任务获得奖励和成长',
  重生流: '拥有重生或读档能力，可以重来或预知未来',
  剧情流: '可以获取或影响剧情走向，知晓原著信息',
  复制流: '可以复制他人的能力、技能或天赋',
  进化流: '可以进化、变异或吞噬成长',
  气运流: '可以查看或影响气运，掠夺他人气运',
  其他: '不属于以上分类的特殊金手指',
};

/** Vue source: F(xe, ae) line 42689-42819 */
function buildSpecialSettingsPrompt(
  上下文: {
    世界观信息?: {
      世界名称: string;
      世界类型: string;
      势力格局: string;
      核心规则: string;
    };
    力量体系列表?: {
      体系名称: string;
      体系类型: string;
      体系描述: string;
    }[];
    功法列表?: {
      功法名称: string;
      功法品级: string;
    }[];
  } | null,
  指定类型: string = '',
  已有金手指名: string[] = []
): string {
  let s = `你是一位专业的网文金手指/系统设计师，擅长设计各类主角专属能力、系统、金手指。\n\n`;

  // 【指定金手指类型】 Vue line 42697-42716
  if (指定类型) {
    s += `【指定金手指类型】\n用户指定生成"${指定类型}"类型的金手指。\n`;
    const desc = 金手指类型说明[指定类型];
    if (desc) s += `- ${指定类型}：${desc}\n`;
    s += '\n';
  }

  // 【绝对禁止重复】 Vue line 42717-42722
  if (已有金手指名.length > 0) {
    s += `\n╔══════════════════════════════════════════════════════════════╗\n║  【绝对禁止重复】以下金手指名称已被使用，生成任何重复名称将导致任务失败\n╚══════════════════════════════════════════════════════════════╝\n已存在的金手指(${已有金手指名.length}个)：${已有金手指名.join('、')}\n`;
  }

  // Context injections — Vue line 42723-42760
  if (上下文) {
    // 【世界观背景】 4 fields — Vue line 42724-42730
    if (上下文.世界观信息) {
      s += `\n【世界观背景】\n世界名称：${上下文.世界观信息.世界名称 || '未设定'}\n世界类型：${上下文.世界观信息.世界类型 || '未设定'}\n势力格局：${上下文.世界观信息.势力格局 || '未设定'}\n核心规则：${上下文.世界观信息.核心规则 || '未设定'}\n`;
    }

    // 【力量体系】 — Vue line 42731-42740
    if (上下文.力量体系列表 && 上下文.力量体系列表.length > 0) {
      s += `\n【力量体系】\n`;
      上下文.力量体系列表.forEach(p => {
        s += `- ${p.体系名称}(${p.体系类型}): ${p.体系描述?.substring(0, 50) || ''}\n`;
      });
    }

    // 【已有功法】 max 5 — Vue line 42741-42750
    if (上下文.功法列表 && 上下文.功法列表.length > 0) {
      s += `\n【已有功法】\n`;
      上下文.功法列表.slice(0, 5).forEach(sk => {
        s += `- ${sk.功法名称}(${sk.功法品级})\n`;
      });
    }
  }

  // Output format — Vue line 42761-42800
  // CRITICAL: This is the ONLY correct format. ALL field counts must match Vue exactly.
  s += `\n\n【输出格式】（极简格式，节省token）\n`;
  s += `N|金手指名称|金手指类型|系统形态|金手指简介\n`;
  s += `D|金手指描述\n`;
  s += `O|来源背景|绑定条件|绑定时间点\n`;
  s += `I|初始状态|最终形态\n`;
  s += `F|功能名称|功能类型|功能描述|触发方式|解锁条件\n`;
  s += `E|效果名称|效果类型|效果描述|作用目标\n`;
  s += `C|消耗类型|消耗名称|消耗数值|恢复方式\n`;
  s += `L|等级序号|等级名称|等级描述|升级条件\n`;
  s += `R|使用限制|暴露风险|使用代价|副作用\n\n`;

  s += `【格式说明】\n`;
  s += `- N: 基本信息（必填，第1行）\n`;
  s += `  - 金手指类型：${金手指类型选项.slice(0, 8).join('/')}/...共19种\n`;
  s += `  - 系统形态：面板系统/意识空间/契约精灵/无形系统/实体道具/被动能力/智能AI\n`;
  s += `- D: 金手指描述（必填，10-100字）\n`;
  s += `- O: 来源信息（可选）— 3个字段\n`;
  s += `- I: 初始和最终状态（可选）— 2个字段\n`;
  s += `- F: 功能（可多行，至少2-4个）— 5个字段，功能类型：核心功能/辅助功能/被动功能/隐藏功能/觉醒功能\n`;
  s += `- E: 效果（可多行，可选）— 4个字段，效果类型：增益/获取/信息/修改/特殊\n`;
  s += `- C: 消耗信息（可选）— 4个字段\n`;
  s += `- L: 进化等级（可多行，可选）— 4个字段\n`;
  s += `- R: 限制信息（可选）— 4个字段\n\n`;

  s += `【重要规则】\n`;
  s += `1. 严格按格式输出，每行一个项\n`;
  s += `2. N行必须在第一行\n`;
  s += `3. 不要输出任何其他内容\n`;
  s += `4. 不要输出JSON，只输出上述管道格式\n`;
  s += `5. ⚠️ 在输出前检查金手指名称是否与已有名称重复\n`;

  return s;
}

/** Vue-format pipe data — ALL field counts match Vue line 42822+ parser exactly */
interface VuePipeFunction {
  功能名称: string;
  功能类型: string;
  功能描述: string;
  触发方式: string;
  解锁条件: string;
}

interface VuePipeEffect {
  效果名称: string;
  效果类型: string;
  效果描述: string;
  作用目标: string;
}

interface VuePipeCost {
  消耗类型: string;
  消耗名称: string;
  消耗数值: string;
  恢复方式: string;
}

interface VuePipeLevel {
  等级序号: string;
  等级名称: string;
  等级描述: string;
  升级条件: string;
}

interface VuePipeRisk {
  使用限制: string;
  暴露风险: string;
  使用代价: string;
  副作用: string;
}

interface VuePipeSpecialData {
  金手指名称: string;
  金手指类型: string;
  系统形态: string;
  金手指简介: string;
  金手指描述: string;
  来源背景: string;
  绑定条件: string;
  绑定时间点: string;
  初始状态: string;
  最终形态: string;
  功能列表: VuePipeFunction[];
  效果列表: VuePipeEffect[];
  消耗信息: VuePipeCost | null;
  进化列表: VuePipeLevel[];
  限制信息: VuePipeRisk | null;
}

/** Parse Vue-format pipe: N(4) D(1) O(3) I(2) F(5) E(4) C(4) L(4) R(4) */
function parseVueSpecialPipe(text: string): VuePipeSpecialData[] {
  const results: VuePipeSpecialData[] = [];
  let current: Partial<VuePipeSpecialData> | null = null;
  let hasC = false;
  let hasR = false;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('N|')) {
      // N|金手指名称|金手指类型|系统形态|金手指简介 (4 fields)
      if (current) results.push(current as VuePipeSpecialData);
      const p = line.slice(2).split('|');
      current = {
        金手指名称: (p[0] || '').trim(),
        金手指类型: (p[1] || '系统流').trim(),
        系统形态: (p[2] || '面板系统').trim(),
        金手指简介: (p[3] || '').trim(),
        金手指描述: '',
        来源背景: '',
        绑定条件: '',
        绑定时间点: '',
        初始状态: '',
        最终形态: '',
        功能列表: [],
        效果列表: [],
        消耗信息: null,
        进化列表: [],
        限制信息: null,
      };
      hasC = false;
      hasR = false;
    } else if (line.startsWith('D|') && current) {
      // D|金手指描述 (1 field)
      current.金手指描述 = line.slice(2).trim();
    } else if (line.startsWith('O|') && current) {
      // O|来源背景|绑定条件|绑定时间点 (3 fields)
      const p = line.slice(2).split('|');
      current.来源背景 = (p[0] || '').trim();
      current.绑定条件 = (p[1] || '').trim();
      current.绑定时间点 = (p[2] || '').trim();
    } else if (line.startsWith('I|') && current) {
      // I|初始状态|最终形态 (2 fields)
      const p = line.slice(2).split('|');
      current.初始状态 = (p[0] || '').trim();
      current.最终形态 = (p[1] || '').trim();
    } else if (line.startsWith('F|') && current) {
      // F|功能名称|功能类型|功能描述|触发方式|解锁条件 (5 fields)
      const p = line.slice(2).split('|');
      current.功能列表!.push({
        功能名称: (p[0] || '').trim(),
        功能类型: (p[1] || '核心功能').trim(),
        功能描述: (p[2] || '').trim(),
        触发方式: (p[3] || '手动触发').trim(),
        解锁条件: (p[4] || '').trim(),
      });
    } else if (line.startsWith('E|') && current) {
      // E|效果名称|效果类型|效果描述|作用目标 (4 fields)
      const p = line.slice(2).split('|');
      current.效果列表!.push({
        效果名称: (p[0] || '').trim(),
        效果类型: (p[1] || '增益').trim(),
        效果描述: (p[2] || '').trim(),
        作用目标: (p[3] || '').trim(),
      });
    } else if (line.startsWith('C|') && current) {
      // C|消耗类型|消耗名称|消耗数值|恢复方式 (4 fields)
      const p = line.slice(2).split('|');
      if (!hasC) {
        current.消耗信息 = {
          消耗类型: (p[0] || '').trim(),
          消耗名称: (p[1] || '').trim(),
          消耗数值: (p[2] || '').trim(),
          恢复方式: (p[3] || '').trim(),
        };
        hasC = true;
      }
    } else if (line.startsWith('L|') && current) {
      // L|等级序号|等级名称|等级描述|升级条件 (4 fields)
      const p = line.slice(2).split('|');
      current.进化列表!.push({
        等级序号: (p[0] || '').trim(),
        等级名称: (p[1] || '').trim(),
        等级描述: (p[2] || '').trim(),
        升级条件: (p[3] || '').trim(),
      });
    } else if (line.startsWith('R|') && current) {
      // R|使用限制|暴露风险|使用代价|副作用 (4 fields)
      const p = line.slice(2).split('|');
      if (!hasR) {
        current.限制信息 = {
          使用限制: (p[0] || '').trim(),
          暴露风险: (p[1] || '').trim(),
          使用代价: (p[2] || '').trim(),
          副作用: (p[3] || '').trim(),
        };
        hasR = true;
      }
    }
  }

  if (current) results.push(current as VuePipeSpecialData);
  return results;
}

/** Convert Vue pipe data to 金手指数据 for UI */
function vuePipeTo金手指(pipe: VuePipeSpecialData): 金手指数据 {
  return {
    id: null,
    项目ID: null,
    金手指名称: pipe.金手指名称 || '',
    金手指类型: pipe.金手指类型 || '系统流',
    系统形态: pipe.系统形态 || '面板系统',
    金手指描述: pipe.金手指描述 || '',
    金手指简介: pipe.金手指简介 || pipe.金手指描述?.slice(0, 50) || '',
    来源背景: pipe.来源背景 || '',
    绑定条件: pipe.绑定条件 || '',
    绑定时间点: pipe.绑定时间点 || '',
    初始状态: pipe.初始状态 || '',
    最终形态: pipe.最终形态 || '',
    是否唯一: true,
    是否可转让: false,
    是否隐秘: true,
    功能列表:
      pipe.功能列表.length > 0
        ? pipe.功能列表.map(f => ({
            功能名称: f.功能名称,
            功能类型: f.功能类型,
            功能描述: f.功能描述,
            触发方式: f.触发方式,
            解锁条件: f.解锁条件,
          }))
        : [empty功能()],
    效果列表:
      pipe.效果列表.length > 0
        ? pipe.效果列表.map(e => ({
            效果名称: e.效果名称,
            效果类型: e.效果类型,
            效果描述: e.效果描述,
            作用目标: e.作用目标,
            效果数值: '',
            持续时间: '',
          }))
        : [empty效果()],
    消耗信息: pipe.消耗信息
      ? {
          消耗类型: pipe.消耗信息.消耗类型,
          消耗名称: pipe.消耗信息.消耗名称,
          消耗数值: pipe.消耗信息.消耗数值,
          恢复方式: pipe.消耗信息.恢复方式,
          透支后果: '',
        }
      : null,
    进化列表:
      pipe.进化列表.length > 0
        ? pipe.进化列表.map((lv, i) => ({
            等级序号: lv.等级序号 || String(i + 1),
            等级名称: lv.等级名称,
            等级描述: lv.等级描述,
            升级条件: lv.升级条件,
            属性提升: '',
            新增功能: '',
          }))
        : [empty进化()],
    限制信息: pipe.限制信息
      ? {
          使用限制: pipe.限制信息.使用限制,
          暴露风险: pipe.限制信息.暴露风险,
          副作用: pipe.限制信息.副作用 || '',
          禁忌事项: '',
          天敌克星: '',
          反噬条件: '',
          反噬后果: pipe.限制信息.使用代价,
          失控风险: '',
          场景限制: '',
        }
      : null,
  };
}

/** Legacy pipe format parser for backward compatibility */
interface LegacyPipeData {
  金手指名称: string;
  金手指类型: string;
  金手指描述: string;
  核心功能描述: string;
  功能列表: { 功能名称: string; 功能描述: string }[];
  进化列表: { 进化名称: string; 进化描述: string }[];
  消耗类型: string;
  消耗描述: string;
  限制类型: string;
  限制描述: string;
  天敌名称: string;
  天敌描述: string;
  反噬描述: string;
}

function parseLegacySpecialPipe(text: string): LegacyPipeData[] {
  const results: LegacyPipeData[] = [];
  let current: LegacyPipeData | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('N|')) {
      const parts = line.split('|');
      current = {
        金手指名称: (parts[1] || '').trim(),
        金手指类型: (parts[2] || '').trim(),
        金手指描述: '',
        核心功能描述: '',
        功能列表: [],
        进化列表: [],
        消耗类型: '',
        消耗描述: '',
        限制类型: '',
        限制描述: '',
        天敌名称: '',
        天敌描述: '',
        反噬描述: '',
      };
      results.push(current);
    } else if (line.startsWith('D|') && current) {
      current.金手指描述 = line.slice(2).trim();
    } else if (line.startsWith('O|') && current) {
      current.核心功能描述 = line.slice(2).trim();
    } else if (line.startsWith('I|') && current) {
      const parts = line.split('|');
      current.功能列表.push({
        功能名称: (parts[1] || '').trim(),
        功能描述: (parts[2] || '').trim(),
      });
    } else if (line.startsWith('F|') && current) {
      const parts = line.split('|');
      current.进化列表.push({
        进化名称: (parts[1] || '').trim(),
        进化描述: (parts[2] || '').trim(),
      });
    } else if (line.startsWith('E|') && current) {
      const parts = line.split('|');
      current.消耗类型 = (parts[1] || '').trim();
      current.消耗描述 = (parts[2] || '').trim();
    } else if (line.startsWith('C|') && current) {
      const parts = line.split('|');
      current.限制类型 = (parts[1] || '').trim();
      current.限制描述 = (parts[2] || '').trim();
    } else if (line.startsWith('L|') && current) {
      const parts = line.split('|');
      current.天敌名称 = (parts[1] || '').trim();
      current.天敌描述 = (parts[2] || '').trim();
    } else if (line.startsWith('R|') && current) {
      current.反噬描述 = line.slice(2).trim();
    }
  }
  return results;
}

function parseSpecialResponse(text: string): 金手指数据 | null {
  // Try Vue-format pipe first (N/D/O/I/F/E/C/L/R with correct field counts)
  const pipeResults = parseVueSpecialPipe(text.trim());
  if (pipeResults.length > 0) {
    return vuePipeTo金手指(pipeResults[0]);
  }

  // Legacy pipe format fallback (old React format with wrong field counts)
  const legacyResults = parseLegacySpecialPipe(text.trim());
  if (legacyResults.length > 0) {
    const s = legacyResults[0];
    return {
      id: null,
      项目ID: null,
      金手指名称: s.金手指名称 || '',
      金手指类型: s.金手指类型 || '系统流',
      系统形态: '面板系统',
      金手指描述: s.金手指描述 || '',
      金手指简介: s.核心功能描述 || s.金手指描述?.slice(0, 50) || '',
      来源背景: '',
      绑定条件: '',
      绑定时间点: '',
      初始状态: '',
      最终形态: '',
      是否唯一: true,
      是否可转让: false,
      是否隐秘: true,
      功能列表: s.功能列表.map(f => ({
        功能名称: f.功能名称,
        功能类型: '核心功能',
        功能描述: f.功能描述,
        触发方式: '手动触发',
        解锁条件: '',
      })),
      效果列表: [empty效果()],
      消耗信息: s.消耗类型
        ? {
            消耗类型: s.消耗类型,
            消耗名称: '',
            消耗数值: '',
            恢复方式: '',
            透支后果: s.反噬描述,
          }
        : null,
      进化列表: s.进化列表.map((e, i) => ({
        等级序号: String(i + 1),
        等级名称: e.进化名称,
        等级描述: e.进化描述,
        升级条件: '',
        属性提升: '',
        新增功能: '',
      })),
      限制信息:
        s.限制描述 || s.天敌描述 || s.反噬描述
          ? {
              使用限制: s.限制描述,
              暴露风险: '',
              副作用: '',
              禁忌事项: '',
              天敌克星: s.天敌名称 + (s.天敌描述 ? '：' + s.天敌描述 : ''),
              反噬条件: '',
              反噬后果: s.反噬描述,
              失控风险: '',
              场景限制: '',
            }
          : null,
    };
  }

  // JSON fallback
  const { data: parsed } = parseAIJSON<Record<string, any>>(text);
  if (!parsed) return null;
  const merged = default金手指();
  if (parsed.金手指名称) merged.金手指名称 = parsed.金手指名称;
  if (parsed.金手指类型) merged.金手指类型 = parsed.金手指类型;
  if (parsed.系统形态) merged.系统形态 = parsed.系统形态;
  if (parsed.金手指简介) merged.金手指简介 = parsed.金手指简介;
  if (parsed.金手指描述) merged.金手指描述 = parsed.金手指描述;
  if (parsed.来源背景) merged.来源背景 = parsed.来源背景;
  if (parsed.绑定条件) merged.绑定条件 = parsed.绑定条件;
  if (parsed.绑定时间点) merged.绑定时间点 = parsed.绑定时间点;
  if (parsed.初始状态) merged.初始状态 = parsed.初始状态;
  if (parsed.最终形态) merged.最终形态 = parsed.最终形态;
  if (Array.isArray(parsed.功能列表)) merged.功能列表 = parsed.功能列表;
  if (Array.isArray(parsed.效果列表)) merged.效果列表 = parsed.效果列表;
  if (parsed.消耗信息) merged.消耗信息 = parsed.消耗信息;
  if (Array.isArray(parsed.进化列表)) merged.进化列表 = parsed.进化列表;
  if (parsed.限制信息) merged.限制信息 = parsed.限制信息;
  return merged;
}

// ── Source-derived data ────────────────────────────────────────

const 金手指类型选项 = [
  '系统流',
  '血脉流',
  '技能流',
  '道具流',
  '宿主流',
  '穿越赠品',
  '天命之子',
  '融合流',
  '空间流',
  '签到流',
  '抽奖流',
  '商城流',
  '任务流',
  '重生流',
  '剧情流',
  '复制流',
  '进化流',
  '气运流',
  '其他',
];

const 系统形态选项 = [
  '面板系统',
  '意识空间',
  '契约精灵',
  '无形系统',
  '实体道具',
  '被动能力',
  '智能AI',
];

const 功能分类选项 = [
  '核心功能',
  '辅助功能',
  '被动功能',
  '隐藏功能',
  '觉醒功能',
];
const 触发方式选项 = ['手动触发', '自动触发', '条件触发'];
const 效果类型选项 = ['增益', '获取', '信息', '修改', '特殊'];

// ── Interfaces ─────────────────────────────────────────────────

interface 功能项 {
  功能名称: string;
  功能类型: string;
  功能描述: string;
  触发方式: string;
  解锁条件: string;
}

interface 效果项 {
  效果名称: string;
  效果类型: string;
  效果描述: string;
  作用目标: string;
  效果数值: string;
  持续时间: string;
}

interface 消耗信息型 {
  消耗类型: string;
  消耗名称: string;
  消耗数值: string;
  恢复方式: string;
  透支后果: string;
}

interface 进化项 {
  等级序号: string;
  等级名称: string;
  等级描述: string;
  升级条件: string;
  属性提升: string;
  新增功能: string;
}

interface 限制信息型 {
  使用限制: string;
  暴露风险: string;
  副作用: string;
  禁忌事项: string;
  天敌克星: string;
  反噬条件: string;
  反噬后果: string;
  失控风险: string;
  场景限制: string;
}

interface 金手指数据 {
  id: number | null;
  项目ID: number | null;
  金手指名称: string;
  金手指类型: string;
  系统形态: string;
  金手指描述: string;
  金手指简介: string;
  来源背景: string;
  绑定条件: string;
  绑定时间点: string;
  初始状态: string;
  最终形态: string;
  是否唯一: boolean;
  是否可转让: boolean;
  是否隐秘: boolean;
  功能列表: 功能项[];
  效果列表: 效果项[];
  消耗信息: 消耗信息型 | null;
  进化列表: 进化项[];
  限制信息: 限制信息型 | null;
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ── Helpers ────────────────────────────────────────────────────

const empty功能 = (): 功能项 => ({
  功能名称: '',
  功能类型: '核心功能',
  功能描述: '',
  触发方式: '手动触发',
  解锁条件: '',
});

const empty效果 = (): 效果项 => ({
  效果名称: '',
  效果类型: '增益',
  效果描述: '',
  作用目标: '',
  效果数值: '',
  持续时间: '',
});

const empty消耗 = (): 消耗信息型 => ({
  消耗类型: '',
  消耗名称: '',
  消耗数值: '',
  恢复方式: '',
  透支后果: '',
});

const empty进化 = (): 进化项 => ({
  等级序号: '',
  等级名称: '',
  等级描述: '',
  升级条件: '',
  属性提升: '',
  新增功能: '',
});

const empty限制 = (): 限制信息型 => ({
  使用限制: '',
  暴露风险: '',
  副作用: '',
  禁忌事项: '',
  天敌克星: '',
  反噬条件: '',
  反噬后果: '',
  失控风险: '',
  场景限制: '',
});

const default金手指 = (): 金手指数据 => ({
  id: null,
  项目ID: null,
  金手指名称: '',
  金手指类型: '系统流',
  系统形态: '面板系统',
  金手指描述: '',
  金手指简介: '',
  来源背景: '',
  绑定条件: '',
  绑定时间点: '',
  初始状态: '',
  最终形态: '',
  是否唯一: true,
  是否可转让: false,
  是否隐秘: true,
  功能列表: [empty功能()],
  效果列表: [empty效果()],
  消耗信息: null,
  进化列表: [empty进化()],
  限制信息: null,
});

// ── Main Component ─────────────────────────────────────────────

export const SpecialSettingsPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [listData, setListData] = useState<金手指数据[]>([]);
  const [formData, setFormData] = useState<金手指数据>(default金手指());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // AI states
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiStreamText, setAiStreamText] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAIDialog, setShowAIDialog] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Section collapse states
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const toggleSection = (key: string) =>
    setCollapsedSections(p => ({ ...p, [key]: !p[key] }));

  // ── Data fetching ──
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(
      `${API_BASE}/api/special-settings/project/${projectId}/list?page=1&limit=100`,
      {
        headers: getAuthHeaders(),
      }
    )
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data)) {
          setListData(result.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // ── CRUD helpers ──
  const updateField = useCallback(
    <K extends keyof 金手指数据>(key: K, value: 金手指数据[K]) => {
      setFormData(prev => ({ ...prev, [key]: value }));
    },
    []
  );

  const startEdit = (item: 金手指数据) => {
    setFormData({ ...item });
    setView('detail');
  };

  const startCreate = () => {
    setFormData(default金手指());
    setView('detail');
  };

  // ── Save ──
  const handleSave = async () => {
    if (!projectId || !formData.金手指名称.trim()) return;
    setSaving(true);
    try {
      let res: Response;
      if (formData.id) {
        // Update: PUT /api/special-settings/project/:id/setting/:sid
        res = await fetch(
          `${API_BASE}/api/special-settings/project/${projectId}/setting/${formData.id}`,
          {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(formData),
          }
        );
      } else {
        // Create: POST /api/special-settings/project/:id/setting
        res = await fetch(
          `${API_BASE}/api/special-settings/project/${projectId}/setting`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(formData),
          }
        );
      }
      const result = await res.json();
      const saved =
        result.success && result.data
          ? result.data
          : { ...formData, id: formData.id || Date.now(), 项目ID: projectId };
      if (formData.id) {
        setListData(prev => prev.map(d => (d.id === formData.id ? saved : d)));
      } else {
        setListData(prev => [...prev, saved]);
        setFormData(saved);
      }
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      return;
    }
    setDeleteConfirm(null);
    try {
      await fetch(
        `${API_BASE}/api/special-settings/project/${projectId}/setting/${id}`,
        {
          method: 'DELETE',
          headers: getAuthHeaders(),
        }
      );
      setListData(prev => prev.filter(d => d.id !== id));
    } catch {}
  };

  // ── AI generate ──
  const handleAIGenerate = async () => {
    if (aiGenerating) return;
    setAiGenerating(true);
    setAiStreamText('');
    abortRef.current = new AbortController();
    try {
      // ── getContext — Vue: GET /special-settings/project/{id}/context (API index line 13837)
      let 上下文: {
        世界观信息?: {
          世界名称: string;
          世界类型: string;
          势力格局: string;
          核心规则: string;
        };
        力量体系列表?: {
          体系名称: string;
          体系类型: string;
          体系描述: string;
        }[];
        功法列表?: {
          功法名称: string;
          功法品级: string;
        }[];
      } | null = null;
      if (projectId) {
        try {
          const ctxRes = await fetch(
            `${API_BASE}/api/special-settings/project/${projectId}/context`,
            { headers: getAuthHeaders() }
          );
          const ctxData = await ctxRes.json();
          if (ctxData.success && ctxData.data) 上下文 = ctxData.data;
        } catch {}
      }

      const 已有金手指名 = listData
        .map(s => s.金手指名称)
        .filter(n => !!n?.trim());
      const systemPrompt = buildSpecialSettingsPrompt(
        上下文,
        formData.金手指类型,
        已有金手指名
      );

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: aiPrompt || '请生成一个金手指设定。按管道格式输出。',
        },
      ];

      const fullText = await generateLLM({
        messages,
        temperature: 0.85,
        max_tokens: 8192,
        frequency_penalty: 0.5,
        presence_penalty: 0.4,
        onChunk: text => setAiStreamText(prev => prev + text),
        signal: abortRef.current!.signal,
      });

      const parsed = parseSpecialResponse(fullText);
      if (parsed) {
        setFormData(parsed);
        // ── saveGeneration — Vue: POST /special-settings/project/{id}/generations (API index line 13845)
        if (projectId) {
          try {
            await saveGeneration('specialsettings', projectId, {
              提示词: aiPrompt || 'AI生成金手指',
              生成类型: parsed.金手指类型 || '系统流',
              生成内容: parsed as unknown as Record<string, any>,
            });
          } catch {}
        }
      } else {
        // Failed to parse — keep stream text visible for manual review
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setAiGenerating(false);
    }
  };

  // ── Filtered list ──
  const filtered = listData.filter(d => {
    if (
      search &&
      !d.金手指名称.includes(search) &&
      !d.金手指简介.includes(search)
    )
      return false;
    if (filterType && d.金手指类型 !== filterType) return false;
    return true;
  });

  // ── Section toggle helper ──
  const Section = ({
    icon,
    title,
    sectionKey,
    children,
  }: {
    icon: string;
    title: string;
    sectionKey: string;
    children: React.ReactNode;
  }) => (
    <div className="bg-[var(--bg-card)] rounded-xl overflow-hidden border border-[var(--border)]">
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-dark)] transition-colors"
        onClick={() => toggleSection(sectionKey)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-pink-500/20">
            <i className={`${icon} text-pink-400`} />
          </div>
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        <i
          className={`ri-arrow-${collapsedSections[sectionKey] ? 'down' : 'up'}-s-line text-lg text-[var(--text-secondary)]`}
        />
      </div>
      {!collapsedSections[sectionKey] && children}
    </div>
  );

  // ── List View ────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="v-specialsettings-panel">
        <div
          className="fixed top-0 bottom-0 z-40 flex"
          style={{ left: leftOffset }}
        >
          <div
            className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
            style={{ width: 560 }}
          >
            {/* Header */}
            <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-gradient-to-r from-pink-900/30 to-purple-900/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-pink-500/20">
                    <i className="text-lg text-pink-400 ri-vip-diamond-line" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">金手指</h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      共 {listData.length} 个
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="p-1.5 hover:bg-pink-500/20 rounded-lg transition-colors text-pink-400"
                    title="AI生成金手指"
                    onClick={() => {
                      setFormData(default金手指());
                      setShowAIDialog(true);
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
                    className="px-3 py-1.5 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
                    onClick={startCreate}
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="搜索金手指..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                  />
                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                  >
                    <option value="">全部类型</option>
                    {金手指类型选项.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>

                {loading ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    加载中...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无金手指，点击新建或AI生成
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map(item => (
                      <div
                        key={item.id}
                        className="p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg hover:border-pink-500/50 cursor-pointer transition-colors group"
                        onClick={() => startEdit(item)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-pink-500/20 shrink-0">
                            <i className="text-pink-400 ri-vip-diamond-line" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium truncate">
                              {item.金手指名称 || '未命名'}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs px-1.5 py-0.5 bg-pink-500/20 text-pink-400 rounded">
                                {item.金手指类型}
                              </span>
                              <span className="text-xs text-[var(--text-secondary)]">
                                {item.系统形态}
                              </span>
                              {item.是否唯一 && (
                                <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
                                  唯一
                                </span>
                              )}
                              {item.是否隐秘 && (
                                <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                  隐秘
                                </span>
                              )}
                            </div>
                            {item.金手指简介 && (
                              <p className="text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-2">
                                {item.金手指简介}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              className="p-1 text-red-400 transition-all rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20"
                              title={
                                deleteConfirm === item.id
                                  ? '再次点击确认删除'
                                  : '删除'
                              }
                              onClick={e => {
                                e.stopPropagation();
                                handleDelete(item.id!);
                              }}
                            >
                              <i
                                className={`text-sm ${deleteConfirm === item.id ? 'ri-check-line text-red-300' : 'ri-delete-bin-line text-red-400'}`}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-pink-500/50 active:bg-pink-500 shrink-0" />
          <div
            className="fixed top-0 bottom-0 right-0 transition-colors bg-black/0 hover:bg-black/5"
            style={{ left: (leftOffset || 288) + 562 }}
            onClick={onClose}
          />
        </div>
      </div>
    );
  }

  // ── Detail View ──────────────────────────────────────────────
  const d = formData;

  return (
    <div className="v-specialsettings-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width: 560 }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-gradient-to-r from-pink-900/30 to-purple-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-pink-500/20">
                  <i className="text-lg text-pink-400 ri-vip-diamond-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">金手指</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {d.id ? '编辑金手指' : '新建金手指'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                  title="返回列表"
                  onClick={() => setView('list')}
                >
                  <i className="ri-arrow-left-line" />
                </button>
                <button
                  className="p-1.5 hover:bg-pink-500/20 rounded-lg transition-colors text-pink-400"
                  title="AI生成金手指"
                  onClick={() => setShowAIDialog(true)}
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
                  className="px-3 py-1.5 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  disabled={saving || !d.金手指名称.trim()}
                  onClick={handleSave}
                >
                  <i
                    className={
                      saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'
                    }
                  />{' '}
                  {saving ? '保存中...' : '保存'}
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
              {/* ── 基础信息 ── */}
              <Section
                icon="ri-information-line"
                title="基础信息"
                sectionKey="basic"
              >
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      金手指名称
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                      placeholder="输入金手指名称"
                      value={d.金手指名称}
                      onChange={e => updateField('金手指名称', e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        金手指类型
                      </label>
                      <select
                        value={d.金手指类型}
                        onChange={e =>
                          updateField('金手指类型', e.target.value)
                        }
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                      >
                        {金手指类型选项.map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        系统形态
                      </label>
                      <select
                        value={d.系统形态}
                        onChange={e => updateField('系统形态', e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                      >
                        {系统形态选项.map(o => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      金手指简介
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                      placeholder="一句话简介"
                      value={d.金手指简介}
                      onChange={e => updateField('金手指简介', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      详细描述
                    </label>
                    <textarea
                      className="w-full h-24 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-pink-500/50 focus:outline-none"
                      placeholder="金手指的详细描述..."
                      value={d.金手指描述}
                      onChange={e => updateField('金手指描述', e.target.value)}
                    />
                  </div>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-pink-500"
                        checked={d.是否唯一}
                        onChange={e =>
                          updateField('是否唯一', e.target.checked)
                        }
                      />
                      <span className="text-[var(--text-secondary)]">
                        是否唯一
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-pink-500"
                        checked={d.是否隐秘}
                        onChange={e =>
                          updateField('是否隐秘', e.target.checked)
                        }
                      />
                      <span className="text-[var(--text-secondary)]">
                        是否隐秘
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-pink-500"
                        checked={d.是否可转让}
                        onChange={e =>
                          updateField('是否可转让', e.target.checked)
                        }
                      />
                      <span className="text-[var(--text-secondary)]">
                        可转让
                      </span>
                    </label>
                  </div>
                </div>
              </Section>

              {/* ── 来源信息 ── */}
              <Section
                icon="ri-links-line"
                title="来源信息"
                sectionKey="source"
              >
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                      来源背景
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                      placeholder="如何获得"
                      value={d.来源背景}
                      onChange={e => updateField('来源背景', e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        绑定条件
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                        placeholder="绑定/激活条件"
                        value={d.绑定条件}
                        onChange={e => updateField('绑定条件', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        绑定时间点
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                        placeholder="何时获得"
                        value={d.绑定时间点}
                        onChange={e =>
                          updateField('绑定时间点', e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        初始状态
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                        placeholder="初始功能状态"
                        value={d.初始状态}
                        onChange={e => updateField('初始状态', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        最终形态
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                        placeholder="完全体能力上限"
                        value={d.最终形态}
                        onChange={e => updateField('最终形态', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </Section>

              {/* ── 功能列表 ── */}
              <Section
                icon="ri-function-line"
                title={`功能列表 (${d.功能列表.length})`}
                sectionKey="functions"
              >
                <div className="px-4 pb-4 space-y-2">
                  {d.功能列表.map((fn, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[var(--bg-dark)] rounded-lg space-y-2 relative group"
                    >
                      <button
                        className="absolute p-1 text-red-400 transition-all rounded opacity-0 top-2 right-2 group-hover:opacity-100 hover:bg-red-500/20"
                        onClick={() =>
                          updateField(
                            '功能列表',
                            d.功能列表.filter((_, i) => i !== idx)
                          )
                        }
                      >
                        <i className="text-xs ri-close-line" />
                      </button>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:border-pink-500/50 focus:outline-none"
                          placeholder="功能名称"
                          value={fn.功能名称}
                          onChange={e => {
                            const next = [...d.功能列表];
                            next[idx] = {
                              ...next[idx],
                              功能名称: e.target.value,
                            };
                            updateField('功能列表', next);
                          }}
                        />
                        <select
                          value={fn.功能类型}
                          onChange={e => {
                            const next = [...d.功能列表];
                            next[idx] = {
                              ...next[idx],
                              功能类型: e.target.value,
                            };
                            updateField('功能列表', next);
                          }}
                          className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:border-pink-500/50 focus:outline-none"
                        >
                          {功能分类选项.map(o => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                        <select
                          value={fn.触发方式}
                          onChange={e => {
                            const next = [...d.功能列表];
                            next[idx] = {
                              ...next[idx],
                              触发方式: e.target.value,
                            };
                            updateField('功能列表', next);
                          }}
                          className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:border-pink-500/50 focus:outline-none"
                        >
                          {触发方式选项.map(o => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        className="w-full h-16 px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs resize-none focus:border-pink-500/50 focus:outline-none"
                        placeholder="功能描述"
                        value={fn.功能描述}
                        onChange={e => {
                          const next = [...d.功能列表];
                          next[idx] = {
                            ...next[idx],
                            功能描述: e.target.value,
                          };
                          updateField('功能列表', next);
                        }}
                      />
                      <input
                        type="text"
                        className="w-full px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:border-pink-500/50 focus:outline-none"
                        placeholder="解锁条件"
                        value={fn.解锁条件}
                        onChange={e => {
                          const next = [...d.功能列表];
                          next[idx] = {
                            ...next[idx],
                            解锁条件: e.target.value,
                          };
                          updateField('功能列表', next);
                        }}
                      />
                    </div>
                  ))}
                  <button
                    className="w-full p-2 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] hover:border-pink-500/50 hover:text-pink-400 transition-colors"
                    onClick={() =>
                      updateField('功能列表', [...d.功能列表, empty功能()])
                    }
                  >
                    <i className="mr-1 ri-add-line" />
                    添加功能
                  </button>
                </div>
              </Section>

              {/* ── 效果列表 ── */}
              <Section
                icon="ri-flashlight-line"
                title={`效果列表 (${d.效果列表.length})`}
                sectionKey="effects"
              >
                <div className="px-4 pb-4 space-y-2">
                  {d.效果列表.map((ef, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[var(--bg-dark)] rounded-lg space-y-2 relative group"
                    >
                      <button
                        className="absolute p-1 text-red-400 transition-all rounded opacity-0 top-2 right-2 group-hover:opacity-100 hover:bg-red-500/20"
                        onClick={() =>
                          updateField(
                            '效果列表',
                            d.效果列表.filter((_, i) => i !== idx)
                          )
                        }
                      >
                        <i className="text-xs ri-close-line" />
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:border-pink-500/50 focus:outline-none"
                          placeholder="效果名称"
                          value={ef.效果名称}
                          onChange={e => {
                            const next = [...d.效果列表];
                            next[idx] = {
                              ...next[idx],
                              效果名称: e.target.value,
                            };
                            updateField('效果列表', next);
                          }}
                        />
                        <select
                          value={ef.效果类型}
                          onChange={e => {
                            const next = [...d.效果列表];
                            next[idx] = {
                              ...next[idx],
                              效果类型: e.target.value,
                            };
                            updateField('效果列表', next);
                          }}
                          className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:border-pink-500/50 focus:outline-none"
                        >
                          {效果类型选项.map(o => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        className="w-full h-12 px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs resize-none focus:border-pink-500/50 focus:outline-none"
                        placeholder="效果描述"
                        value={ef.效果描述}
                        onChange={e => {
                          const next = [...d.效果列表];
                          next[idx] = {
                            ...next[idx],
                            效果描述: e.target.value,
                          };
                          updateField('效果列表', next);
                        }}
                      />
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <input
                          type="text"
                          className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded focus:border-pink-500/50 focus:outline-none"
                          placeholder="效果数值"
                          value={ef.效果数值}
                          onChange={e => {
                            const next = [...d.效果列表];
                            next[idx] = {
                              ...next[idx],
                              效果数值: e.target.value,
                            };
                            updateField('效果列表', next);
                          }}
                        />
                        <input
                          type="text"
                          className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded focus:border-pink-500/50 focus:outline-none"
                          placeholder="作用目标"
                          value={ef.作用目标}
                          onChange={e => {
                            const next = [...d.效果列表];
                            next[idx] = {
                              ...next[idx],
                              作用目标: e.target.value,
                            };
                            updateField('效果列表', next);
                          }}
                        />
                        <input
                          type="text"
                          className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded focus:border-pink-500/50 focus:outline-none"
                          placeholder="持续时间"
                          value={ef.持续时间}
                          onChange={e => {
                            const next = [...d.效果列表];
                            next[idx] = {
                              ...next[idx],
                              持续时间: e.target.value,
                            };
                            updateField('效果列表', next);
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    className="w-full p-2 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] hover:border-pink-500/50 hover:text-pink-400 transition-colors"
                    onClick={() =>
                      updateField('效果列表', [...d.效果列表, empty效果()])
                    }
                  >
                    <i className="mr-1 ri-add-line" />
                    添加效果
                  </button>
                </div>
              </Section>

              {/* ── 消耗信息 ── */}
              <Section
                icon="ri-fire-line"
                title="消耗信息"
                sectionKey="consume"
              >
                <div className="px-4 pb-4 space-y-3">
                  {d.消耗信息 ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            消耗类型
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                            placeholder="消耗类型"
                            value={d.消耗信息.消耗类型}
                            onChange={e =>
                              updateField('消耗信息', {
                                ...d.消耗信息!,
                                消耗类型: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            消耗名称
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                            placeholder="资源名称"
                            value={d.消耗信息.消耗名称}
                            onChange={e =>
                              updateField('消耗信息', {
                                ...d.消耗信息!,
                                消耗名称: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            消耗数值
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                            placeholder="基础消耗量"
                            value={d.消耗信息.消耗数值}
                            onChange={e =>
                              updateField('消耗信息', {
                                ...d.消耗信息!,
                                消耗数值: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            恢复方式
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                            placeholder="如何恢复"
                            value={d.消耗信息.恢复方式}
                            onChange={e =>
                              updateField('消耗信息', {
                                ...d.消耗信息!,
                                恢复方式: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                          透支后果
                        </label>
                        <textarea
                          className="w-full h-16 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-pink-500/50 focus:outline-none"
                          placeholder="超额消耗的后果"
                          value={d.消耗信息.透支后果}
                          onChange={e =>
                            updateField('消耗信息', {
                              ...d.消耗信息!,
                              透支后果: e.target.value,
                            })
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <button
                      className="w-full p-2 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] hover:border-pink-500/50 hover:text-pink-400 transition-colors"
                      onClick={() => updateField('消耗信息', empty消耗())}
                    >
                      <i className="mr-1 ri-add-line" />
                      添加消耗信息
                    </button>
                  )}
                </div>
              </Section>

              {/* ── 进化列表 ── */}
              <Section
                icon="ri-line-chart-line"
                title={`成长进化 (${d.进化列表.length})`}
                sectionKey="evolution"
              >
                <div className="px-4 pb-4 space-y-2">
                  {d.进化列表.map((lv, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[var(--bg-dark)] rounded-lg space-y-2 relative group"
                    >
                      <button
                        className="absolute p-1 text-red-400 transition-all rounded opacity-0 top-2 right-2 group-hover:opacity-100 hover:bg-red-500/20"
                        onClick={() =>
                          updateField(
                            '进化列表',
                            d.进化列表.filter((_, i) => i !== idx)
                          )
                        }
                      >
                        <i className="text-xs ri-close-line" />
                      </button>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:border-pink-500/50 focus:outline-none"
                          placeholder="序号"
                          value={lv.等级序号}
                          onChange={e => {
                            const next = [...d.进化列表];
                            next[idx] = {
                              ...next[idx],
                              等级序号: e.target.value,
                            };
                            updateField('进化列表', next);
                          }}
                        />
                        <input
                          type="text"
                          className="col-span-2 px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs focus:border-pink-500/50 focus:outline-none"
                          placeholder="等级名称"
                          value={lv.等级名称}
                          onChange={e => {
                            const next = [...d.进化列表];
                            next[idx] = {
                              ...next[idx],
                              等级名称: e.target.value,
                            };
                            updateField('进化列表', next);
                          }}
                        />
                      </div>
                      <textarea
                        className="w-full h-12 px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs resize-none focus:border-pink-500/50 focus:outline-none"
                        placeholder="等级描述"
                        value={lv.等级描述}
                        onChange={e => {
                          const next = [...d.进化列表];
                          next[idx] = {
                            ...next[idx],
                            等级描述: e.target.value,
                          };
                          updateField('进化列表', next);
                        }}
                      />
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <input
                          type="text"
                          className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded focus:border-pink-500/50 focus:outline-none"
                          placeholder="升级条件"
                          value={lv.升级条件}
                          onChange={e => {
                            const next = [...d.进化列表];
                            next[idx] = {
                              ...next[idx],
                              升级条件: e.target.value,
                            };
                            updateField('进化列表', next);
                          }}
                        />
                        <input
                          type="text"
                          className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded focus:border-pink-500/50 focus:outline-none"
                          placeholder="属性提升"
                          value={lv.属性提升}
                          onChange={e => {
                            const next = [...d.进化列表];
                            next[idx] = {
                              ...next[idx],
                              属性提升: e.target.value,
                            };
                            updateField('进化列表', next);
                          }}
                        />
                        <input
                          type="text"
                          className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded focus:border-pink-500/50 focus:outline-none"
                          placeholder="新增功能"
                          value={lv.新增功能}
                          onChange={e => {
                            const next = [...d.进化列表];
                            next[idx] = {
                              ...next[idx],
                              新增功能: e.target.value,
                            };
                            updateField('进化列表', next);
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    className="w-full p-2 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] hover:border-pink-500/50 hover:text-pink-400 transition-colors"
                    onClick={() =>
                      updateField('进化列表', [...d.进化列表, empty进化()])
                    }
                  >
                    <i className="mr-1 ri-add-line" />
                    添加等级
                  </button>
                </div>
              </Section>

              {/* ── 限制信息 ── */}
              <Section
                icon="ri-shield-line"
                title="限制信息"
                sectionKey="limits"
              >
                <div className="px-4 pb-4 space-y-3">
                  {d.限制信息 ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            使用限制
                          </label>
                          <textarea
                            className="w-full h-16 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-pink-500/50 focus:outline-none"
                            placeholder="使用条件限制"
                            value={d.限制信息.使用限制}
                            onChange={e =>
                              updateField('限制信息', {
                                ...d.限制信息!,
                                使用限制: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            暴露风险
                          </label>
                          <textarea
                            className="w-full h-16 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-pink-500/50 focus:outline-none"
                            placeholder="暴露的风险"
                            value={d.限制信息.暴露风险}
                            onChange={e =>
                              updateField('限制信息', {
                                ...d.限制信息!,
                                暴露风险: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            副作用
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                            placeholder="可能的副作用"
                            value={d.限制信息.副作用}
                            onChange={e =>
                              updateField('限制信息', {
                                ...d.限制信息!,
                                副作用: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            禁忌事项
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                            placeholder="绝对禁忌"
                            value={d.限制信息.禁忌事项}
                            onChange={e =>
                              updateField('限制信息', {
                                ...d.限制信息!,
                                禁忌事项: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            天敌克星
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                            placeholder="克制因素"
                            value={d.限制信息.天敌克星}
                            onChange={e =>
                              updateField('限制信息', {
                                ...d.限制信息!,
                                天敌克星: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            场景限制
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                            placeholder="场景使用限制"
                            value={d.限制信息.场景限制}
                            onChange={e =>
                              updateField('限制信息', {
                                ...d.限制信息!,
                                场景限制: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            反噬条件
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                            placeholder="触发反噬的条件"
                            value={d.限制信息.反噬条件}
                            onChange={e =>
                              updateField('限制信息', {
                                ...d.限制信息!,
                                反噬条件: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                            反噬后果
                          </label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                            placeholder="反噬的后果"
                            value={d.限制信息.反噬后果}
                            onChange={e =>
                              updateField('限制信息', {
                                ...d.限制信息!,
                                反噬后果: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                          失控风险
                        </label>
                        <textarea
                          className="w-full h-16 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-pink-500/50 focus:outline-none"
                          placeholder="失控的风险和后果"
                          value={d.限制信息.失控风险}
                          onChange={e =>
                            updateField('限制信息', {
                              ...d.限制信息!,
                              失控风险: e.target.value,
                            })
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <button
                      className="w-full p-2 border border-dashed border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)] hover:border-pink-500/50 hover:text-pink-400 transition-colors"
                      onClick={() => updateField('限制信息', empty限制())}
                    >
                      <i className="mr-1 ri-add-line" />
                      添加限制信息
                    </button>
                  )}
                </div>
              </Section>
            </div>
          </div>
        </div>

        {/* Resize handle */}
        <div className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-pink-500/50 active:bg-pink-500 shrink-0" />
        {/* Backdrop */}
        <div
          className="fixed top-0 bottom-0 right-0 transition-colors bg-black/0 hover:bg-black/5"
          style={{ left: (leftOffset || 288) + 562 }}
          onClick={onClose}
        />
      </div>

      {/* AI Dialog */}
      {showAIDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-[480px] max-h-[80vh] flex flex-col shadow-2xl">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-pink-500/20">
                  <i className="text-pink-400 ri-magic-line" />
                </div>
                <h3 className="text-sm font-semibold">AI生成金手指</h3>
              </div>
              <button
                className="p-1 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                onClick={() => {
                  setShowAIDialog(false);
                  abortRef.current?.abort();
                }}
              >
                <i className="ri-close-line" />
              </button>
            </div>
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    金手指类型
                  </label>
                  <select
                    value={formData.金手指类型}
                    onChange={e => updateField('金手指类型', e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                  >
                    {金手指类型选项.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                    系统形态
                  </label>
                  <select
                    value={formData.系统形态}
                    onChange={e => updateField('系统形态', e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-pink-500/50 focus:outline-none"
                  >
                    {系统形态选项.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  补充要求
                </label>
                <textarea
                  className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-none focus:border-pink-500/50 focus:outline-none"
                  placeholder="描述你对金手指的具体要求..."
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                />
              </div>
              {aiStreamText && (
                <div className="p-3 bg-[var(--bg-dark)] rounded-lg border border-[var(--border)]">
                  <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                    {aiStreamText}
                  </pre>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
              <button
                className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                onClick={() => {
                  setShowAIDialog(false);
                  abortRef.current?.abort();
                }}
              >
                取消
              </button>
              <button
                className="px-4 py-2 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                disabled={aiGenerating}
                onClick={handleAIGenerate}
              >
                <i
                  className={
                    aiGenerating
                      ? 'ri-loader-4-line animate-spin'
                      : 'ri-magic-line'
                  }
                />
                {aiGenerating ? '生成中...' : '开始生成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpecialSettingsPanel;
