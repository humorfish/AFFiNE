import React, { useState, useMemo, useEffect, useRef } from 'react';
import { generateLLM, generateValidated, parseAIJSON } from './panel-shared';
import { z } from 'zod';
import { API_BASE, getAuthHeaders } from '../useWorldApi';

// ── Source-derived data ────────────────────────────────────────

const 状态选项 = ['pending', 'writing', 'complete'] as const;
const 状态标签: Record<string, string> = {
  pending: '待处理',
  writing: '写作中',
  complete: '已完成',
};
const 状态颜色: Record<string, string> = {
  pending: '#9ca3af',
  writing: '#fbbf24',
  complete: '#4ade80',
};

const 情绪选项 = [
  { 值: 'tension', 标签: '紧张' },
  { 值: 'thrill', 标签: '刺激' },
  { 值: 'sadness', 标签: '悲伤' },
  { 值: 'romance', 标签: '浪漫' },
  { 值: 'curiosity', 标签: '好奇' },
];

// ── Interfaces ─────────────────────────────────────────────────

const outlineSchema = z.array(z.any()).min(1);

interface 章节大纲 {
  id: number;
  标题: string;
  描述: string;
  摘要: string;
  开头承接: string;
  章尾悬念: string;
  出场角色列表: string[];
  场景列表: string[];
  关键对话: string[];
  写作要点: string[];
  情绪列表: string[];
  伏笔列表: string[];
  目标字数: number;
  正文字数: number;
  状态: string;
}

interface 卷大纲 {
  id: number;
  卷名称: string;
  幕名称: string;
  摘要: string;
  章节: 章节大纲[];
}

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ── Context types for outline generation ──────────────────────

interface 大纲生成上下文 {
  项目信息?: {
    项目名称?: string;
    项目类型?: string;
    项目状态?: string;
    项目描述?: string;
    受众定位?: string;
    风格偏好?: string | string[];
    核心设定?: string | string[];
    情节模式?: string;
    主要冲突?: string;
  };
  世界观?: Record<string, string>;
  故事核心?: Record<string, string>;
  力量体系?: any[];
  功法体系?: any[];
  重要物品?: any[];
  货币体系?: any[];
  主要势力?: any[];
  主要角色?: any[];
  地理地图?: any[];
  特殊设定?: any[];
  已设定伏笔?: any[];
  情节脉络?: any[];
  事件流?: any[];
}

// ── Source-derived prompt & parsers ────────────────────────────

/** Helper to format array-like fields from the project info */
function formatArrayField(value: string | string[] | undefined): string {
  if (!value) return '未设定';
  if (Array.isArray(value)) return value.join('、');
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.join('、') : String(value);
  } catch {
    return String(value);
  }
}

/**
 * Build dynamic outline generation prompt.
 * 1:1 conversion of Vue source line 31998-32987.
 * Injects 15+ context sections based on project data.
 *
 * @param 上下文 - Context data from GET /outlines/project/{id}/context
 * @param 已有卷列表 - Comma-separated existing volume names
 * @param 详细模式 - If true, use detail mode (V/F/E/C/CF/R/L/G/P/M/X/XE)
 * @param 编码字典 - Entity encoding dictionary (for outline mode with encoding)
 * @param 字数配置 - Word count configuration for each field
 */
function buildOutlineSystemPrompt(
  上下文: 大纲生成上下文 | null,
  已有卷列表: string,
  详细模式: boolean = false,
  编码字典?: string,
  字数配置?: {
    卷摘要?: string;
    章摘要?: string;
    卷伏笔描述?: string;
    场景描述?: string;
    道具用途?: string;
    情绪描述?: string;
    势力类型?: string;
  }
): string {
  const ee = 字数配置 || {
    卷摘要: '10字以内',
    章摘要: '30字以内',
    卷伏笔描述: '10字以内',
    场景描述: '10字以内',
    道具用途: '10字以内',
    情绪描述: '10字以内',
  };

  const oe = 上下文?.项目信息;
  const k = 上下文?.世界观;
  const O = 上下文?.故事核心;
  const _ = 上下文?.力量体系;
  const M = 上下文?.功法体系;
  const R = 上下文?.重要物品;
  const V = 上下文?.货币体系;
  const D = 上下文?.主要势力;
  const P = 上下文?.主要角色;
  const L = 上下文?.地理地图;
  const T = 上下文?.特殊设定;
  const z = 上下文?.已设定伏笔;
  const W = 上下文?.情节脉络;
  const Q = 上下文?.事件流;

  let C = `你是一位专业的小说大纲编写专家，擅长根据世界观设定创作精彩的故事大纲。

## 项目基本信息
- 项目名称：${oe?.项目名称 || '未设定'}
- 项目类型：${oe?.项目类型 || '未设定'}
- 项目状态：${oe?.项目状态 || '未设定'}
- 项目描述：${oe?.项目描述 || '未设定'}
- 受众定位：${oe?.受众定位 || '未设定'}
- 风格偏好：${formatArrayField(oe?.风格偏好)}
- 核心设定：${formatArrayField(oe?.核心设定)}
- 情节模式：${oe?.情节模式 || '未设定'}
- 主要冲突：${oe?.主要冲突 || '未设定'}

## 当前世界观设定
- 世界名称：${k?.世界名称 || '未设定'}
- 世界类型：${k?.世界类型 || '未设定'}
- 时代背景：${k?.时代背景 || '未设定'}
- 核心规则：${k?.核心规则 || '未设定'}
- 地理环境：${k?.地理环境 || '未设定'}
- 社会结构：${k?.社会结构 || '未设定'}
- 历史背景：${k?.历史背景 || '未设定'}
- 特殊元素：${k?.特殊元素 || '未设定'}
- 主要冲突：${k?.主要冲突 || '未设定'}
- 势力格局：${k?.势力格局 || '未设定'}
`;

  // Section 3: 故事核心
  if (O?.核心主题 || O?.核心冲突) {
    C += `
## 故事核心
- 核心主题：${O.核心主题 || '未设定'}
- 故事类型：${O.故事类型 || '未设定'}
- 主线剧情：${O.主线剧情 || '未设定'}
- 核心冲突：${O.核心冲突 || '未设定'}
- 故事基调：${O.故事基调 || '未设定'}
- 重大赌注：${O.重大赌注 || '未设定'}
- 预期悬念：${O.预期悬念 || '未设定'}
- 结局走向：${O.结局走向 || '未设定'}
- 结局方向：${O.结局方向 || '未设定'}
`;
  }

  // Section 4: 力量体系
  if (_ && _.length > 0) {
    C += `
## 力量体系（完整设定）
`;
    _.forEach((B: any) => {
      C += `
### ${B.体系名称}（${B.体系类型 || '修炼类'}）
`;
      if (B.体系描述) C += `- 体系描述：${B.体系描述}\n`;
      if (B.力量来源) C += `- 力量来源：${B.力量来源}\n`;
      if (B.修炼方式) C += `- 修炼方式：${B.修炼方式}\n`;
      if (B.力量表现) C += `- 力量表现：${B.力量表现}\n`;

      if (B.境界列表?.length > 0) {
        C += `\n**境界体系**（从低到高）：\n`;
        B.境界列表.forEach((K: any, _e: number) => {
          C += `  ${_e + 1}. **${K.境界名称}**（等级${K.境界等级 || _e + 1}）\n`;
          if (K.境界描述) C += `     描述：${K.境界描述}\n`;
          if (K.提升条件) C += `     提升条件：${K.提升条件}\n`;
          if (K.能力表现) C += `     能力表现：${K.能力表现}\n`;
          if (K.特殊标志) C += `     特殊标志：${K.特殊标志}\n`;
        });
      }

      if (B.能力列表?.length > 0) {
        C += `\n**可习得能力**：\n`;
        B.能力列表.forEach((K: any) => {
          C += `  - **${K.能力名称}**（${K.能力类型 || '通用'}）\n`;
          if (K.能力描述) C += `    描述：${K.能力描述}\n`;
          if (K.学习条件) C += `    学习条件：${K.学习条件}\n`;
          if (K.消耗代价) C += `    消耗代价：${K.消耗代价}\n`;
        });
      }

      if (B.修行路径) {
        C += `\n**修行路径**：\n`;
        if (B.修行路径.修行方法) C += `  - 修行方法：${B.修行路径.修行方法}\n`;
        if (B.修行路径.修行资源) C += `  - 修行资源：${B.修行路径.修行资源}\n`;
        if (B.修行路径.修行难点) C += `  - 修行难点：${B.修行路径.修行难点}\n`;
        if (B.修行路径.突破要点) C += `  - 突破要点：${B.修行路径.突破要点}\n`;
      }

      if (B.限制约束) {
        C += `\n**限制与约束**：\n`;
        if (B.限制约束.使用限制) C += `  - 使用限制：${B.限制约束.使用限制}\n`;
        if (B.限制约束.副作用) C += `  - 副作用：${B.限制约束.副作用}\n`;
        if (B.限制约束.反噬风险) C += `  - 反噬风险：${B.限制约束.反噬风险}\n`;
        if (B.限制约束.禁忌条款) C += `  - 禁忌条款：${B.限制约束.禁忌条款}\n`;
      }
    });
  }

  // Section 5: 功法体系
  if (M && M.length > 0) {
    C += `
## 功法体系（完整设定）
`;
    M.forEach((B: any) => {
      C += `
### ${B.功法名称}（${B.功法大类 || '功法'}·${B.功法品级 || '未知品级'}）
`;
      if (B.功法简介) C += `- 简介：${B.功法简介}\n`;
      if (B.功法描述 && typeof B.功法描述 === 'string') {
        C += `- 描述：${B.功法描述.substring(0, 150)}${B.功法描述.length > 150 ? '...' : ''}\n`;
      }
      if (B.适用境界) C += `- 适用境界：${B.适用境界}\n`;
      if (B.创造者) C += `- 创造者：${B.创造者}\n`;
      if (B.所属体系) C += `- 所属体系：${B.所属体系}\n`;

      if (B.效果列表?.length > 0) {
        C += `\n**功法效果**：\n`;
        B.效果列表.forEach((K: any) => {
          C += `  - **${K.效果名称}**（${K.效果类型 || '通用'}）：${K.效果描述 || ''}\n`;
        });
      }

      if (B.消耗信息) {
        C += `\n**施展消耗**：\n`;
        if (B.消耗信息.消耗类型) C += `  - 消耗类型：${B.消耗信息.消耗类型}\n`;
        if (B.消耗信息.消耗数值) C += `  - 消耗数值：${B.消耗信息.消耗数值}\n`;
        if (B.消耗信息.冷却时间) C += `  - 冷却时间：${B.消耗信息.冷却时间}\n`;
      }

      if (B.修炼信息) {
        C += `\n**修炼要求**：\n`;
        if (B.修炼信息.修炼难度) C += `  - 修炼难度：${B.修炼信息.修炼难度}\n`;
        if (B.修炼信息.境界要求) C += `  - 境界要求：${B.修炼信息.境界要求}\n`;
        if (B.修炼信息.修炼方法) C += `  - 修炼方法：${B.修炼信息.修炼方法}\n`;
        if (B.修炼信息.修炼周期) C += `  - 修炼周期：${B.修炼信息.修炼周期}\n`;
      }

      if (B.进阶列表?.length > 0) {
        C += `\n**功法层次**（从低到高）：\n`;
        B.进阶列表.forEach((K: any, _e: number) => {
          C += `  ${_e + 1}. **${K.层次名称}**：${K.效果提升 || ''}\n`;
          if (K.进阶条件) C += `     进阶条件：${K.进阶条件}\n`;
        });
      }

      if (B.限制信息) {
        C += `\n**使用限制**：\n`;
        if (B.限制信息.使用限制) C += `  - 使用限制：${B.限制信息.使用限制}\n`;
        if (B.限制信息.副作用) C += `  - 副作用：${B.限制信息.副作用}\n`;
        if (B.限制信息.反噬风险) C += `  - 反噬风险：${B.限制信息.反噬风险}\n`;
      }
    });
  }

  // Section 6: 重要物品
  if (R && R.length > 0) {
    C += `
## 重要物品
`;
    R.forEach((B: any) => {
      C += `- **${B.物品名称}**（${B.类别 || '未知类别'}·${B.获取难度 || '一般'}）\n`;
      if (B.作用) C += `  作用：${B.作用}\n`;
      if (B.特征) C += `  特征：${B.特征}\n`;
      if (B.出处) C += `  来源：${B.出处}\n`;
    });
  }

  // Section 7: 货币体系
  if (V && V.length > 0) {
    C += `
## 货币体系
`;
    V.forEach((B: any) => {
      C += `- **${B.货币名称}**（${B.货币类型 || '未知类型'}）：${B.货币定义 || ''}\n`;
    });
  }

  // Section 8: 主要势力 (with "优先使用" constraint)
  if (D && D.length > 0) {
    C += `
## 主要势力（已存在，优先使用）
`;
    C += `**【重要约束】**：以下势力是已设定的势力，AI生成时必须优先使用这些势力，不得随意创建新势力。

`;
    D.forEach((B: any) => {
      C += `### ${B.势力名称}（${B.势力类型 || '未知类型'}）
`;
      if (B.势力描述) C += `- 描述：${B.势力描述}\n`;
      if (B.实力等级) C += `- 实力等级：${B.实力等级}\n`;
      if (B.领袖) C += `- 领袖：${B.领袖}\n`;
      if (B.总部位置) C += `- 总部：${B.总部位置}\n`;
      if (B.核心成员) C += `- 核心成员：${B.核心成员}\n`;
      if (B.控制区域) C += `- 控制区域：${B.控制区域}\n`;
      if (B.势力目标) C += `- 势力目标：${B.势力目标}\n`;
      if (B.关系列表?.length > 0) {
        C += `\n**势力关系**：\n`;
        B.关系列表.forEach((K: any) => {
          C += `  - 与【${K.目标势力名称}】：${K.关系类型}（${K.关系描述 || ''}）\n`;
        });
      }
      C += `\n`;
    });
  }

  // Section 9: 主要角色 (split by 主角/女主/其他, with "严禁替换主角姓名" constraint)
  if (P && P.length > 0) {
    const protagonists = P.filter(
      (E: any) =>
        (E.角色类型 || '').includes('主角') &&
        !(E.角色类型 || '').includes('女主')
    );
    const heroines = P.filter((E: any) => (E.角色类型 || '').includes('女主'));
    const others = P.filter(
      (E: any) =>
        !(E.角色类型 || '').includes('主角') &&
        !(E.角色类型 || '').includes('女主')
    );

    let fe = `
## 主要角色（已存在，必须优先使用）
`;
    fe += `**【重要约束】**：以下角色是已设定的角色，AI生成时必须优先使用这些角色，不得随意创建新角色。
`;

    const ue: string[] = [];
    const formatCharacter = (E: any, F: string) => {
      let le = `
### ${E.角色姓名 || E.姓名}（${F}，必须使用此姓名）
`;
      le += `- 身份：${E.身份 || E.角色身份 || '未设定'}\n`;
      if (E.性别) le += `- 性别：${E.性别}\n`;
      if (E.年龄) le += `- 年龄：${E.年龄}\n`;
      if (E.境界) le += `- 境界：${E.境界}\n`;
      if (E.武器) le += `- 武器：${E.武器}\n`;
      if (E.外貌) le += `- 外貌：${E.外貌}\n`;
      const intro = E.简介 || E.角色简介;
      if (intro && typeof intro === 'string')
        le += `- 简介：${intro.substring(0, 150)}\n`;
      if (
        E.性格 &&
        typeof E.性格 === 'object' &&
        (E.性格.表层 || E.性格.中层 || E.性格.内核)
      ) {
        const parts: string[] = [];
        if (E.性格.表层) parts.push(`表层-${E.性格.表层}`);
        if (E.性格.中层) parts.push(`中层-${E.性格.中层}`);
        if (E.性格.内核) parts.push(`内核-${E.性格.内核}`);
        le += `- 性格：${parts.join('；')}\n`;
      }
      if (F !== '主角' && E.人生经历) {
        if (Array.isArray(E.人生经历) && E.人生经历.length > 0) {
          le += `\n**人生经历**：\n`;
          E.人生经历.forEach((he: any) => {
            const ch = he.章节 || he.chapter || '';
            const ev = he.事件 || he.event || he.描述 || '';
            if (ch || ev) le += `  - ${ch ? `[${ch}] ` : ''}${ev}\n`;
          });
        } else if (typeof E.人生经历 === 'string') {
          le += `- 人生经历：${E.人生经历.substring(0, 150)}...\n`;
        }
      }
      if (E.核心意义) le += `- 核心意义：${E.核心意义}\n`;
      if (E.其他信息) le += `- 其他信息：${E.其他信息}\n`;
      if (E.结局) le += `- 预设结局：${E.结局}\n`;
      if (E.出场时间) le += `- 出场时间：${E.出场时间}\n`;
      if (E.所属势力) le += `- 所属势力：${E.所属势力}\n`;
      const rel = E.关系列表 || E.角色关系;
      if (rel?.length > 0) {
        le += `\n**人物关系**：\n`;
        rel.forEach((Re: any) => {
          const he = Re.目标角色名称 || Re.目标角色 || '';
          le += `  - 与【${he}】：${Re.关系类型}（${Re.关系描述 || ''}）\n`;
        });
      }
      return le;
    };

    if (protagonists.length > 0) {
      protagonists.forEach((F: any) =>
        ue.push(`主角：${F.角色姓名 || F.姓名}`)
      );
      fe += `\n---\n**【主角】**（必须使用此姓名，严禁替换）\n`;
      protagonists.forEach((F: any) => {
        fe += formatCharacter(F, '主角');
      });
    }
    if (heroines.length > 0) {
      heroines.forEach((F: any) => ue.push(`女主：${F.角色姓名 || F.姓名}`));
      fe += `\n---\n**【女主/重要女性角色】**（必须使用此姓名，严禁替换）\n`;
      heroines.forEach((F: any) => {
        fe += formatCharacter(F, '女主');
      });
    }
    if (others.length > 0) {
      fe += `\n---\n**【其他重要角色】**\n`;
      others.forEach((E: any) => {
        fe += formatCharacter(E, E.角色类型 || '配角');
      });
    }
    if (ue.length > 0) {
      fe += `\n### 【核心角色姓名强制约束】\n`;
      fe += `以下角色姓名是强制性的，在生成的大纲中必须严格使用，不得使用任何其他名字：\n`;
      fe += ue.map(E => `- ${E}`).join('\n');
      fe += `\n**警告：如果在大纲中出现与上述不同的主角或女主姓名，将被视为严重错误。**\n`;
    }
    C += fe;
  }

  // Section 10: 地理地图 (hierarchical by level)
  if (L && L.length > 0) {
    C += `
## 地理地图（层级结构，已存在，优先使用）
`;
    C += `**【重要约束】**：以下地图是已设定的地理位置，AI生成时必须优先使用这些地图，主角移动路线必须合理。

`;
    const levelNames: Record<number, string> = {
      0: '世界级',
      1: '大陆级',
      2: '区域级',
      3: '城市级',
      4: '地点级',
      5: '路线级',
    };
    const levelGroups: Record<number, any[]> = {
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
    };
    const childMap: Record<number, any[]> = {};
    L.forEach((map: any) => {
      const level = map.地图等级 ?? 2;
      if (levelGroups[level]) levelGroups[level].push(map);
      const parentId = map.父地图ID || map.parent_id;
      if (parentId) {
        if (!childMap[parentId]) childMap[parentId] = [];
        childMap[parentId].push(map);
      }
    });

    const renderLevel = (level: number) => {
      const maps = levelGroups[level];
      if (!maps || maps.length === 0) return;
      C += `\n### ${levelNames[level]}地图\n`;
      maps.forEach((map: any) => {
        const name = map.地图名称 || map.名称;
        const type = map.地图类型 || levelNames[level];
        const desc = map.地图描述 || map.描述 || '';
        C += `- **${name}**（${type}）`;
        if (desc) C += `：${desc}`;
        C += `\n`;
        const children = childMap[map.id] || [];
        if (children.length > 0) {
          C += `  包含子区域：${children.map((I: any) => I.地图名称 || I.名称).join('、')}\n`;
        }
        if (map.地图内容) {
          try {
            const content =
              typeof map.地图内容 === 'string'
                ? JSON.parse(map.地图内容)
                : map.地图内容;
            if (content.区域列表?.length > 0) {
              C += `  包含区域：${content.区域列表.map((A: any) => A.名称 || A.区域名称).join('、')}\n`;
            }
            if (content.地点列表?.length > 0) {
              C += `  重要地点：${content.地点列表
                .slice(0, 5)
                .map((A: any) => A.名称 || A.地点名称)
                .join('、')}\n`;
            }
            if (content.路线列表?.length > 0) {
              C += `  主要路线：${content.路线列表
                .slice(0, 3)
                .map((A: any) => `${A.起点}→${A.终点}`)
                .join('、')}\n`;
            }
          } catch {}
        }
      });
    };
    for (let i = 0; i <= 5; i++) renderLevel(i);
    C += `
**地图层级说明**：
- 世界级(0)：最大的地理单位，包含多个大陆
- 大陆级(1)：如"云山大陆"，包含多个国家/区域
- 区域级(2)：如"火国""天山境"，包含多个城市
- 城市级(3)：如"天山城""史莱克学院"，包含多个地点
- 地点级(4)：如"大师办公室""学院广场"，具体的地理位置
- 路线级(5)：如"丝绸之路""传送阵网络"，连接地点的路径
`;
  }

  // Section 11: 金手指/特殊设定
  if (T && T.length > 0) {
    C += `
## 金手指/特殊设定（完整信息）
`;
    T.forEach((B: any) => {
      const name = B.金手指名称 || B.设定名称 || B.名称;
      const type = B.金手指类型 || '';
      const form = B.系统形态 || '';
      C += `
### ${name}（${type}${form ? '·' + form : ''}）
`;
      if (B.金手指简介 || B.设定描述)
        C += `- 简介：${B.金手指简介 || B.设定描述}\n`;
      if (B.金手指描述 || B.设定详情) {
        const desc = B.金手指描述 || B.设定详情;
        if (typeof desc === 'string')
          C += `- 详细描述：${desc.substring(0, 300)}${desc.length > 300 ? '...' : ''}\n`;
      }
      if (B.来源背景) C += `- 来源背景：${B.来源背景}\n`;
      if (B.绑定条件) C += `- 绑定条件：${B.绑定条件}\n`;
      if (B.绑定时间点) C += `- 获取时间：${B.绑定时间点}\n`;
      if (B.初始状态) C += `- 初始状态：${B.初始状态}\n`;
      if (B.最终形态) C += `- 最终形态：${B.最终形态}\n`;

      // 特性标签: 是否唯一/是否隐秘/是否可转让
      const 特性: string[] = [];
      if (B.是否唯一) 特性.push('世界唯一');
      if (B.是否隐秘) 特性.push('隐秘');
      if (B.是否可转让) 特性.push('可转让');
      if (特性.length > 0) C += `- 特性：${特性.join('、')}\n`;

      if (B.功能列表?.length > 0) {
        C += `\n**功能列表**：\n`;
        B.功能列表.forEach((ue: any) => {
          C += `  - **${ue.功能名称}**（${ue.功能类型 || '核心功能'}）：${ue.功能描述 || ''}\n`;
          if (ue.触发方式)
            C += `    触发方式：${ue.触发方式}${ue.触发条件 ? '，条件：' + ue.触发条件 : ''}\n`;
          if (ue.冷却时间) C += `    冷却：${ue.冷却时间}\n`;
          if (ue.使用次数) C += `    次数限制：${ue.使用次数}\n`;
          if (ue.解锁条件) C += `    解锁条件：${ue.解锁条件}\n`;
        });
      }

      if (B.效果列表?.length > 0) {
        C += `\n**效果列表**：\n`;
        B.效果列表.forEach((ue: any) => {
          C += `  - **${ue.效果名称}**（${ue.效果类型 || '增益'}）：${ue.效果描述 || ''}\n`;
          if (ue.效果数值)
            C += `    数值：${ue.效果数值}${ue.数值成长 ? '，成长规则：' + ue.数值成长 : ''}\n`;
          if (ue.作用目标 || ue.作用范围)
            C += `    作用：${ue.作用目标 || '自身'}${ue.作用范围 ? '，范围：' + ue.作用范围 : ''}\n`;
          if (ue.持续时间) C += `    持续时间：${ue.持续时间}\n`;
        });
      }

      if (B.消耗信息) {
        C += `\n**消耗信息**：\n`;
        const info = B.消耗信息;
        C += `  - 消耗类型：${info.消耗类型 || '无消耗'}${info.消耗名称 ? '（' + info.消耗名称 + '）' : ''}\n`;
        if (info.消耗数值)
          C += `  - 消耗数值：${info.消耗数值}${info.消耗公式 ? '，公式：' + info.消耗公式 : ''}\n`;
        if (info.恢复方式)
          C += `  - 恢复方式：${info.恢复方式}${info.恢复速度 ? '，速度：' + info.恢复速度 : ''}\n`;
        if (info.透支后果) C += `  - 透支后果：${info.透支后果}\n`;
      }

      if (B.进化列表?.length > 0) {
        C += `\n**进化路线**（从低到高）：\n`;
        B.进化列表.forEach((ue: any) => {
          C += `  ${ue.等级序号 || '?'}. **${ue.等级名称}**：${ue.等级描述 || ''}\n`;
          if (ue.升级条件) C += `     升级条件：${ue.升级条件}\n`;
          if (ue.新增功能) C += `     新增功能：${ue.新增功能}\n`;
          if (ue.属性提升) C += `     属性提升：${ue.属性提升}\n`;
        });
      }

      if (B.限制信息) {
        C += `\n**限制与风险**：\n`;
        const info = B.限制信息;
        if (info.使用限制) C += `  - 使用限制：${info.使用限制}\n`;
        if (info.场景限制) C += `  - 场景限制：${info.场景限制}\n`;
        if (info.暴露风险) C += `  - 暴露风险：${info.暴露风险}\n`;
        if (info.检测规避) C += `  - 检测规避：${info.检测规避}\n`;
        if (info.使用代价) C += `  - 使用代价：${info.使用代价}\n`;
        if (info.副作用) C += `  - 副作用：${info.副作用}\n`;
        if (info.失控风险) C += `  - 失控风险：${info.失控风险}\n`;
        if (info.反噬条件)
          C += `  - 反噬条件：${info.反噬条件}${info.反噬后果 ? '，后果：' + info.反噬后果 : ''}\n`;
        if (info.禁忌事项) C += `  - 禁忌事项：${info.禁忌事项}\n`;
        if (info.天敌克星) C += `  - 天敌克星：${info.天敌克星}\n`;
      }
      C += `\n`;
    });
  }

  // Section 12: 已设定伏笔 (must be placed in corresponding chapters)
  if (z && z.length > 0) {
    C += `
## 已设定伏笔（必须主动埋入对应章节！）
`;
    C += `**【强制约束】**：以下伏笔是已设定的伏笔，AI生成大纲时**必须**将每个伏笔通过CF标记主动安排到合适的章节中：
`;
    C += `- 根据伏笔的"埋设章节"和"预计揭示章节"，安排到对应章节
`;
    C += `- 未指定章节的伏笔，根据剧情需要安排到最合适的位置
`;
    C += `- 禁止遗漏任何已设定伏笔，禁止创建与已有伏笔重复的新伏笔

`;
    z.forEach((B: any) => {
      C += `### ${B.伏笔名称}（${B.伏笔类型 || '普通伏笔'}·${B.伏笔状态 || '未揭示'}）\n`;
      if (B.伏笔描述) C += `- 描述：${B.伏笔描述}\n`;
      if (B.埋设章节) C += `- 埋设于：第${B.埋设章节}章\n`;
      if (B.预计揭示章节) C += `- 预计揭示：第${B.预计揭示章节}章\n`;
      if (B.重要程度) C += `- 重要程度：${B.重要程度}\n`;
      if (B.呼应列表?.length > 0) {
        C += `\n**已有呼应**：\n`;
        B.呼应列表.forEach((K: any) => {
          C += `  - 第${K.呼应章节}章：${K.呼应方式}（${K.呼应描述 || ''}）\n`;
        });
      }
      C += `\n`;
    });
  }

  // Section 13: 情节脉络规划 (must follow strictly)
  if (W && W.length > 0) {
    C += `
## 情节脉络规划（必须严格遵循，确保大纲与既定情节结构一致）
`;
    C += `**【重要约束】**：以下情节脉络是已规划好的故事结构，AI生成大纲时必须严格按照此结构安排情节发展，每一幕的内容、情感基调、核心事件都必须与规划保持一致。

`;
    const modes = [...new Set(W.map((K: any) => K.模式 || '五幕式'))];
    modes.forEach(mode => {
      const acts = W.filter((ie: any) => (ie.模式 || '五幕式') === mode);
      C += `### 情节结构模式：${mode}\n\n`;
      acts.forEach((ie: any, fe: number) => {
        C += `**第${ie.幕序号 || fe + 1}幕：${ie.幕名称 || '未命名'}**\n`;
        if (ie.章节范围) C += `- 章节范围：${ie.章节范围}\n`;
        if (ie.内容概要) C += `- 内容概要：${ie.内容概要}\n`;
        if (ie.核心事件) C += `- 核心事件：${ie.核心事件}\n`;
        if (ie.角色发展) C += `- 角色发展：${ie.角色发展}\n`;
        if (ie.情感基调) C += `- 情感基调：${ie.情感基调}\n`;
        if (ie.冲突升级) C += `- 冲突升级：${ie.冲突升级}\n`;
        C += `\n`;
      });
    });
    C += `**情节脉络遵循规则**：
1. 每一幕对应的章节范围内的大纲内容必须围绕该幕的核心事件展开
2. 情感基调必须与规划一致，确保读者情绪体验的连贯性
3. 角色发展必须按照规划的方向推进
4. 冲突升级的节奏必须符合整体情节结构
`;
  }

  // Section 14: 事件流 (must be reflected in corresponding chapters)
  if (Q && Q.length > 0) {
    C += `
## 已规划的事件流（必须在对应章节中严格体现）
`;
    C += `**【强制约束】**：以下是已规划的故事节拍，生成大纲时必须：
1. 在对应卷的章节中融入这些事件
2. 事件的七要素需在不同章节中逐步展开
3. 涉及支线的事件应融入对应支线章节

`;
    const volGroups: Record<number, any[]> = {};
    Q.forEach((K: any) => {
      const vol = K.所属卷序号;
      if (!volGroups[vol]) volGroups[vol] = [];
      volGroups[vol].push(K);
    });
    Object.entries(volGroups).forEach(([vol, events]) => {
      C += `### 第${vol}卷事件（共${events.length}个）\n`;
      events.forEach((ie: any, fe: number) => {
        C += `**${fe + 1}. ${ie.事件名称}**`;
        if (ie.涉及角色?.length) {
          const chars = Array.isArray(ie.涉及角色)
            ? ie.涉及角色
            : [ie.涉及角色];
          C += `（涉及：${chars.join('、')}）`;
        }
        C += `\n`;
        if (ie.欲望) C += `   欲望：${ie.欲望}\n`;
        if (ie.阻碍) C += `   阻碍：${ie.阻碍}\n`;
        if (ie.行动) C += `   行动：${ie.行动}\n`;
        if (ie.结果) C += `   结果：${ie.结果}\n`;
        if (ie.意外) C += `   意外：${ie.意外}\n`;
        if (ie.转折) C += `   转折：${ie.转折}\n`;
        if (ie.结局) C += `   结局：${ie.结局}\n`;
        if (ie.涉及支线?.length) {
          const sublines = Array.isArray(ie.涉及支线)
            ? ie.涉及支线
            : [ie.涉及支线];
          C += `   涉及支线：${sublines.join('、')}\n`;
        }
        if (ie.暗线伏笔) C += `   暗线伏笔：${ie.暗线伏笔}\n`;
        C += `\n`;
      });
    });
  }

  // Section 15: Output format (two modes)
  const j = `
【核心规则】
1. 章节编号连续，卷号正确，情节连贯
2. 标题符合小说风格
3. 必须使用已设定的主角/女主姓名，不得自创
4. 禁用——符号`;

  if (已有卷列表) {
    C += `\n已有卷（禁止重复）：${已有卷列表}\n`;
  }

  if (!详细模式) {
    if (编码字典) {
      C += `
## 输出格式【当前模式：大纲模式（编码）】
【输出格式】严格按以下格式输出，不要输出任何多余内容：
V|第X卷 卷名|卷摘要(≤${ee.卷摘要})
C|第X章 章名|章摘要(≤${ee.章摘要})|R:编码1,编码2|L:编码|G:编码|P:编码|CF:编码|EL:编码1,编码2

【标记说明】V=卷, C=章
【内联实体标记说明】
- R:出场角色（必填，每章至少1个）
- L:主要场景（选填）
- G:涉及势力（选填）
- P:涉及道具（选填）
- CF:关联伏笔（选填）
- EL:主要情绪（选填）
- 多个同类编码用逗号分隔，如 R:R1,R2,R3
- 摘要文本中的实体名也必须使用编码替代

【新实体处理】若需要引入编码字典中不存在的新实体，直接使用中文名

${编码字典}

【关键要求汇总】
1. 每个V行后必须包含该卷的所有C行，章节编号连续不遗漏
2. 卷摘要应概括本卷的主要剧情走向和核心冲突
3. 章摘要应具体描述本章的关键事件、角色行动和剧情推进${j}`;
    } else {
      C += `
## 输出格式【当前模式：大纲模式】
仅输出卷和章节的标题与摘要：
V|第X卷 卷名|卷摘要(≤${ee.卷摘要})
C|第X章 章名|章摘要(≤${ee.章摘要})
【标记说明】V=卷,C=章
【标签描述规则】章节摘要中禁止输出【成长】【日常】【战斗】【故事】【冒险】等内容标签描述，将内容直接融入摘要正文

【关键要求汇总】
1. 每个V行后必须包含该卷的所有C行，章节编号连续不遗漏
2. 卷摘要应概括本卷的主要剧情走向和核心冲突
3. 章摘要应具体描述本章的关键事件、角色行动和剧情推进${j}`;
    }
  } else {
    C += `
## 输出格式【当前模式：细纲模式】
输出完整详细信息，包括角色、场景、势力、道具、伏笔等：
V|第X卷 卷名|卷概述(≤${ee.卷摘要}字)
F|伏笔名|类型|描述(≤${ee.卷伏笔描述}字)|状态
E|本卷大事件
C|第X章 章名|章概述(≤${ee.章摘要}字)|关键对话|写作要点|钩子设计|开头承接|字数
CF|伏笔名|类型|描述|状态|解密程度(0-100)
R|角色名|身份|主角/配角/反派
L|场景名|场景描述(≤${ee.场景描述}字)
G|势力名|势力类型(≤${ee.势力类型 || '10字以内'}字)
P|道具名|类别|用途(≤${ee.道具用途}字)
M|叙事元素名|强度1-10|描述(≤${ee.情绪描述}字)
【标记说明】V=卷,C=章,F=卷级伏笔,CF=章节伏笔,E=事件,R=角色,L=场景,G=势力,P=道具,M=叙事元素(用于引导读者情绪),X=新实体,XE=新角色事件线
【标签描述规则】章节摘要中禁止输出【成长】【日常】【战斗】【故事】【冒险】等内容标签描述，将内容直接融入摘要正文
【X新实体格式】（非常重要：当剧情需要创建上文不存在的全新实体时，必须按以下格式在末尾输出）
- X|角色|姓名|角色类型(主角/女主/配角/反派/导师)|性别(男/女)|身份|简介(尽量包含年龄、外貌特征、境界等级、武器装备、核心意义等信息)
- X|地图|名称|描述
- X|势力|名称|势力类型|描述
- X|物品|名称|类别|描述
- X|功法|名称|品级|描述
- X|伏笔|名称|伏笔类型(剧情伏笔/人物伏笔/物品伏笔/线索伏笔/暗示伏笔)|重要度(极高/高/中/低)|描述|埋设章节名|预计回收章节|影响范围(单线/多线/全局)
【X新实体命名规则】（必须严格遵守！）
1. 同一角色/地点/物品只允许出现一个X标记，禁止重复创建
2. 名称必须使用最简洁的正式名称，禁止在名称中添加括号说明
3. 化名、别称、暗线等补充信息必须放在描述字段中
4. 错误示例：X|角色|苏清影（化名"影"）|... ← 禁止！
5. 正确示例：X|角色|苏清影|女主|女|暗影使徒|化名"影"，身负幽冥灵猫变异武魂
【何时使用X标记】只有当实体 truly 不存在于上文【主要角色】【主要势力】【地理地图】【重要物品】【功法体系】中时，才使用X标记创建。R/L/G/P标记只是引用，X标记才是创建新实体到数据库。
【伏笔规则】F标记用于本卷贯穿的主要伏笔（跟在V后），CF标记用于章节内埋设或呼应的伏笔（跟在C后）。类型包括：剧情伏笔/人物伏笔/物品伏笔/线索伏笔/暗示伏笔。状态包括：埋设/暗示/呼应/回收。优先使用上文【已设定伏笔】中的伏笔！
【伏笔关联规则】（极其重要！）当使用X|伏笔创建新伏笔时，必须同时在对应章节的C行后使用CF标记标注该伏笔在该章节的具体表现。
- CF格式：CF|伏笔名|类型|描述|状态|解密程度
- 解密程度：0-100的整数（埋设≈0-10，暗示≈15-35，呼应≈40-75，回收≈80-100）
- 描述必须具体：写明该伏笔在该章节的具体表现、线索细节、角色行为，不能为空
- **每个新伏笔必须有完整的章节关联链**：从埋设到回收，所有涉及该伏笔的章节都必须有CF标记，解密程度呈递增趋势
【M标记规则】M的"叙事元素名"必须且只能从"叙事节奏与情绪控制要求"中的"需要运用的叙事元素"列表中选择，禁止自创！这是控制读者情绪的技法，不是描述角色情绪。
【XE角色事件线格式】（当有新角色X标记时，必须为每个新角色补充事件线）
- XE|角色名|第X章 章名|事件描述（该角色在此章的关键行动/遭遇/转折，≤30字）
- 每个新角色在每个出场章节输出一条XE，用于记录角色的人生经历
- XE必须紧跟在所有X标记之后输出
- 示例：XE|苏清影|第5章 暗影初现|潜入敌营窃取情报，与守卫激战后成功脱身
【子项规则】F/E在V后,CF/R/L/G/P/M在C后,X/XE在末尾
【字数限制】卷摘要≤${ee.卷摘要},章摘要≤${ee.章摘要},场景≤${ee.场景描述},道具≤${ee.道具用途},情绪≤${ee.情绪描述}${j}
5. 每章必填R/L/G/P五项
6. 新实体用X标记，新角色事件线用XE标记`;
  }

  C += `

## AI创建逻辑约束（必须严格遵守）

### 数据复用优先原则（极其重要）
在生成大纲时，必须遵循以下优先级规则：

1. **角色**：必须优先使用上文【主要角色】中已设定的角色，只有当剧情确实需要且已有角色无法满足时，才能创建新角色
2. **势力**：必须优先使用上文【主要势力】中已设定的势力，只有当剧情确实需要且已有势力无法满足时，才能创建新势力
3. **地图**：必须优先使用上文【地理地图】中已设定的地点，主角移动必须合理（不能跨大陆瞬移），只有确实需要时才创建新地点
4. **功法**：必须优先使用上文【功法体系】中已设定的功法，只有当已有功法不满足需求时才创建新功法
5. **物品**：必须优先分配上文【重要物品】中已存在的物品，只有确实不足时才创建新物品
6. **伏笔**：必须优先使用和呼应上文【已设定伏笔】中的伏笔，避免重复创建相似伏笔

### 数据创建规范
- 新建任何实体前，必须先检查上文是否已存在同名或同类实体
- 如果已存在，优先引用已有实体，而非创建新实体
- 新势力只能绑定到已存在的地图，不得擅自创建新地图来安置势力
- 新角色必须设计合理的出场方式和身份背景
- 新伏笔必须关联具体章节并考虑后续呼应

### 地图层级约束（极其重要）
地图分为5个层级：世界级(0) > 大陆级(1) > 区域级(2) > 城市级(3) > 地点级(4)

**层级判断规则**：
- 地点级(4)：包含"办公室、室、大厅、房、店、铺、山洞、洞府、寺、庙、塔、楼、广场"等关键词
- 城市级(3)：包含"城、镇、市、都、县、宗门、学院、家族、部落"等关键词
- 区域级(2)：包含"国、山、河、湖、林、川、海、平原、草原、沙漠、岛、境、域"等关键词
- 大陆级(1)：包含"大陆、洲、界、天下、神州、世界"等关键词

**创建规则**：
1. 优先使用上文已存在的地图，避免重复创建
2. 创建新地图时，必须正确判断其层级，不能把"大师办公室"设为大陆级
3. 主角移动必须遍循地理逻辑：不能前一章在云山大陆，后一章就跳到黑暗大陆
4. 场景切换要有合理的过渡和旅途描写
5. 新地图必须与现有地图体系保持一致性
`;

  return C;
}

// ── Detail-mode interfaces ──────────────────────────────────────

interface 细纲角色 {
  名称: string;
  身份: string;
  角色分类: string;
}
interface 细纲场景 {
  名称: string;
  描述: string;
}
interface 细纲道具 {
  名称: string;
  类别: string;
  用途: string;
}
interface 细纲情绪 {
  名称: string;
  强度: number;
  描述: string;
}

/** Parse pipe format for outlines: V|... and C| lines */
function parseOutlinePipe(text: string): 卷大纲[] | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const volumes: 卷大纲[] = [];
  let currentVolume: 卷大纲 | null = null;
  let hasPipe = false;

  for (const line of lines) {
    if (line.startsWith('V|')) {
      hasPipe = true;
      const parts = line.split('|');
      currentVolume = {
        id: Date.now() + Math.random() + volumes.length,
        卷名称: parts[1]?.trim() || '',
        幕名称: '',
        摘要: parts.slice(2).join('|').trim() || '',
        章节: [],
      };
      volumes.push(currentVolume);
    } else if (line.startsWith('C|') && currentVolume) {
      hasPipe = true;
      const parts = line.split('|');
      currentVolume.章节.push({
        id: Date.now() + Math.random() + currentVolume.章节.length,
        标题: parts[1]?.trim() || '',
        描述: '',
        摘要: parts.slice(2).join('|').trim() || '',
        开头承接: '',
        章尾悬念: '',
        出场角色列表: [],
        场景列表: [],
        关键对话: [],
        写作要点: [],
        情绪列表: [],
        伏笔列表: [],
        目标字数: 2000,
        正文字数: 0,
        状态: 'pending',
      });
    }
  }

  return hasPipe && volumes.length > 0 ? volumes : null;
}

/** Parse pipe format for chapter-only output: C| lines */
function parseChapterPipe(text: string): 章节大纲[] | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const chapters: 章节大纲[] = [];
  let hasPipe = false;

  for (const line of lines) {
    if (line.startsWith('C|')) {
      hasPipe = true;
      const parts = line.split('|');
      chapters.push({
        id: Date.now() + Math.random() + chapters.length,
        标题: parts[1]?.trim() || '',
        描述: '',
        摘要: parts.slice(2).join('|').trim() || '',
        开头承接: '',
        章尾悬念: '',
        出场角色列表: [],
        场景列表: [],
        关键对话: [],
        写作要点: [],
        情绪列表: [],
        伏笔列表: [],
        目标字数: 2000,
        正文字数: 0,
        状态: 'pending',
      });
    }
  }

  return hasPipe && chapters.length > 0 ? chapters : null;
}

/** Parse detail-mode pipe output: V/F/E/C/CF/R/L/G/P/M/X/XE */
function parseDetailOutlinePipe(text: string): 卷大纲[] | null {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const volumes: 卷大纲[] = [];
  let currentVolume: 卷大纲 | null = null;
  let currentChapter: 章节大纲 | null = null;
  let hasPipe = false;

  // Temporary detail-mode collections per chapter
  let currentChapterRoles: 细纲角色[] = [];
  let currentChapterScenes: 细纲场景[] = [];
  let currentChapterProps: 细纲道具[] = [];
  let currentChapterMoods: 细纲情绪[] = [];

  const flushChapterDetail = () => {
    if (!currentChapter) return;
    // Merge detail-mode parsed data into chapter fields
    if (currentChapterRoles.length > 0) {
      currentChapter.出场角色列表 = currentChapterRoles.map(r => r.名称);
    }
    if (currentChapterScenes.length > 0) {
      currentChapter.场景列表 = currentChapterScenes.map(
        s => `${s.名称}${s.描述 ? ':' + s.描述 : ''}`
      );
    }
    if (currentChapterProps.length > 0) {
      currentChapter.写作要点.push(
        ...currentChapterProps.map(p => `${p.名称}(${p.类别}):${p.用途}`)
      );
    }
    if (currentChapterMoods.length > 0) {
      currentChapter.情绪列表 = currentChapterMoods.map(
        m => `${m.名称}(${m.强度})`
      );
    }
    // Reset per-chapter collectors
    currentChapterRoles = [];
    currentChapterScenes = [];
    currentChapterProps = [];
    currentChapterMoods = [];
  };

  for (const line of lines) {
    if (line.startsWith('XE|')) {
      // New character event line — must check before X| since XE starts with X
      hasPipe = true;
      if (currentChapter) {
        currentChapter.写作要点.push(`[XE] ${line.slice(3).trim()}`);
      }
    } else if (line.startsWith('X|')) {
      // New entity: X|type|fields...
      hasPipe = true;
      if (currentChapter) {
        currentChapter.写作要点.push(`[X] ${line.slice(2).trim()}`);
      }
    } else if (line.startsWith('V|')) {
      hasPipe = true;
      flushChapterDetail();
      const parts = line.split('|');
      currentVolume = {
        id: Date.now() + Math.random() + volumes.length,
        卷名称: parts[1]?.trim() || '',
        幕名称: '',
        摘要: parts.slice(2).join('|').trim() || '',
        章节: [],
      };
      volumes.push(currentVolume);
      currentChapter = null;
    } else if (line.startsWith('F|') && currentVolume) {
      // Volume-level foreshadowing: F|name|type|desc|status
      hasPipe = true;
      const parts = line.split('|');
      currentVolume.摘要 += `\n[伏笔] ${parts[1] || ''}(${parts[2] || ''}): ${parts[3] || ''} [${parts[4] || ''}]`;
    } else if (line.startsWith('E|') && currentVolume) {
      // Volume-level event
      hasPipe = true;
      const eventText = line.slice(2).trim();
      currentVolume.摘要 += `\n[事件] ${eventText}`;
    } else if (line.startsWith('C|') && currentVolume) {
      hasPipe = true;
      flushChapterDetail();
      const parts = line.split('|');
      currentChapter = {
        id: Date.now() + Math.random() + currentVolume.章节.length,
        标题: parts[1]?.trim() || '',
        描述: '',
        摘要: parts[2]?.trim() || '',
        开头承接: parts[5]?.trim() || '',
        章尾悬念: '',
        出场角色列表: [],
        场景列表: [],
        关键对话: parts[3] ? [parts[3].trim()] : [],
        写作要点: parts[4] ? [parts[4].trim()] : [],
        情绪列表: [],
        伏笔列表: [],
        目标字数: parseInt(parts[6]) || 2000,
        正文字数: 0,
        状态: 'pending',
      };
      currentVolume.章节.push(currentChapter);
    } else if (line.startsWith('CF|') && currentChapter) {
      // Chapter foreshadowing: CF|name|type|desc|status|decrypt%
      hasPipe = true;
      const parts = line.split('|');
      currentChapter.伏笔列表.push(parts[1]?.trim() || '');
    } else if (line.startsWith('R|') && currentChapter) {
      // Chapter character: R|name|identity|category
      hasPipe = true;
      const parts = line.split('|');
      currentChapterRoles.push({
        名称: parts[1]?.trim() || '',
        身份: parts[2]?.trim() || '',
        角色分类: parts[3]?.trim() || '',
      });
    } else if (line.startsWith('L|') && currentChapter) {
      // Chapter scene: L|name|desc
      hasPipe = true;
      const parts = line.split('|');
      currentChapterScenes.push({
        名称: parts[1]?.trim() || '',
        描述: parts[2]?.trim() || '',
      });
    } else if (line.startsWith('G|') && currentChapter) {
      // Chapter faction: G|name|type
      hasPipe = true;
      const parts = line.split('|');
      // Store faction in writing points
      currentChapter.写作要点.push(
        `[势力] ${parts[1]?.trim() || ''}(${parts[2]?.trim() || ''})`
      );
    } else if (line.startsWith('P|') && currentChapter) {
      // Chapter prop: P|name|category|usage
      hasPipe = true;
      const parts = line.split('|');
      currentChapterProps.push({
        名称: parts[1]?.trim() || '',
        类别: parts[2]?.trim() || '',
        用途: parts[3]?.trim() || '',
      });
    } else if (line.startsWith('M|') && currentChapter) {
      // Chapter mood/narrative element: M|name|intensity(1-10)|desc
      hasPipe = true;
      const parts = line.split('|');
      currentChapterMoods.push({
        名称: parts[1]?.trim() || '',
        强度: parseInt(parts[2]) || 5,
        描述: parts[3]?.trim() || '',
      });
    }
  }
  flushChapterDetail();

  return hasPipe && volumes.length > 0 ? volumes : null;
}

/** Combined parser: pipe first, then JSON fallback */
function parseOutlineResponse(
  text: string,
  detailMode: boolean = false
): 卷大纲[] | null {
  // Try detail-mode parser first if flag is set
  if (detailMode) {
    const detailResult = parseDetailOutlinePipe(text);
    if (detailResult) return detailResult;
  }
  // Outline mode: V|/C| only
  const pipeResult = parseOutlinePipe(text);
  if (pipeResult) return pipeResult;
  // JSON fallback
  const { data, failed } = parseAIJSON<卷大纲[]>(text);
  if (!failed && Array.isArray(data)) return data;
  return null;
}

/** Combined parser for chapters: pipe first, then JSON fallback */
function parseChapterResponse(
  text: string,
  detailMode: boolean = false
): 章节大纲[] | null {
  if (detailMode) {
    // Use detail parser, extract chapters from result
    const detailResult = parseDetailOutlinePipe(text);
    if (detailResult) {
      const chapters: 章节大纲[] = [];
      for (const vol of detailResult) chapters.push(...vol.章节);
      return chapters.length > 0 ? chapters : null;
    }
  }
  const pipeResult = parseChapterPipe(text);
  if (pipeResult) return pipeResult;
  const { data, failed } = parseAIJSON<章节大纲[]>(text);
  if (!failed && Array.isArray(data)) return data;
  return null;
}

// ── Main Component ─────────────────────────────────────────────

export const OutlineSettingsPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const [卷列表, set卷列表] = useState<卷大纲[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // Selection
  const [展开卷集合, set展开卷集合] = useState<Set<number>>(new Set());
  const [选中卷, set选中卷] = useState<卷大纲 | null>(null);
  const [选中章节, set选中章节] = useState<章节大纲 | null>(null);
  const [view, setView] = useState<'list' | 'volume' | 'chapter'>('list');

  // AI states
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [detailMode, setDetailMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Data fetching ──
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/outlines/project/${projectId}`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data)) {
          set卷列表(result.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // ── Stats ──
  const 总章数 = 卷列表.reduce((s, v) => s + v.章节.length, 0);
  const 完成章数 = 卷列表.reduce(
    (s, v) => s + v.章节.filter(c => c.状态 === 'complete').length,
    0
  );
  const 完成率 = 总章数 > 0 ? Math.round((完成章数 / 总章数) * 100) : 0;

  // ── CRUD ──
  const addVolume = async () => {
    if (!projectId) return;
    const name = `第${卷列表.length + 1}卷`;
    try {
      const res = await fetch(`${API_BASE}/api/outlines/project/${projectId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          标题: name,
          节点类型: 'volume',
          摘要: '',
        }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        set卷列表(prev => [...prev, result.data]);
        set选中卷(result.data);
        setView('volume');
      }
    } catch {}
  };

  const addChapter = async (volumeId: number) => {
    if (!projectId) return;
    const vol = 卷列表.find(v => v.id === volumeId);
    if (!vol) return;
    const title = `第${vol.章节.length + 1}章`;
    try {
      const res = await fetch(`${API_BASE}/api/outlines/project/${projectId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          标题: title,
          节点类型: 'chapter',
          父节点ID: volumeId,
          摘要: '',
        }),
      });
      const result = await res.json();
      if (result.success && result.data) {
        set卷列表(prev =>
          prev.map(v => {
            if (v.id !== volumeId) return v;
            return { ...v, 章节: [...v.章节, result.data] };
          })
        );
        set展开卷集合(prev => new Set(prev).add(volumeId));
      }
    } catch {}
  };

  const updateVolume = (id: number, updates: Partial<卷大纲>) => {
    set卷列表(prev => prev.map(v => (v.id === id ? { ...v, ...updates } : v)));
    if (选中卷?.id === id)
      set选中卷(prev => (prev ? { ...prev, ...updates } : prev));
    // Persist to API — Vue uses PUT /outlines/{id}
    fetch(`${API_BASE}/api/outlines/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    }).catch(() => {});
  };

  const updateChapter = (
    volumeId: number,
    chapterId: number,
    updates: Partial<章节大纲>
  ) => {
    set卷列表(prev =>
      prev.map(v => {
        if (v.id !== volumeId) return v;
        return {
          ...v,
          章节: v.章节.map(c =>
            c.id === chapterId ? { ...c, ...updates } : c
          ),
        };
      })
    );
    if (选中章节?.id === chapterId)
      set选中章节(prev => (prev ? { ...prev, ...updates } : prev));
    // Persist to API — Vue uses PUT /outlines/{id}
    fetch(`${API_BASE}/api/outlines/${chapterId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    }).catch(() => {});
  };

  const deleteVolume = async (id: number) => {
    try {
      await fetch(`${API_BASE}/api/outlines/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    } catch {}
    set卷列表(prev => prev.filter(v => v.id !== id));
    if (选中卷?.id === id) {
      set选中卷(null);
      setView('list');
    }
  };

  const deleteChapter = async (volumeId: number, chapterId: number) => {
    try {
      await fetch(`${API_BASE}/api/outlines/${chapterId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    } catch {}
    set卷列表(prev =>
      prev.map(v => {
        if (v.id !== volumeId) return v;
        return { ...v, 章节: v.章节.filter(c => c.id !== chapterId) };
      })
    );
    if (选中章节?.id === chapterId) {
      set选中章节(null);
      setView('volume');
    }
  };

  const handleSave = async () => {
    if (!projectId) return;
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/outlines/project/${projectId}/batch`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ outlines: 卷列表 }),
      });
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id: number) => {
    set展开卷集合(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── AI generate (full outline) ──
  const handleAIGenerate = async () => {
    if (aiGenerating) return;
    setAiGenerating(true);
    abortRef.current = new AbortController();
    try {
      // Fetch context from API — Vue calls GET /outlines/project/{id}/context
      let 上下文: 大纲生成上下文 | null = null;
      try {
        const ctxRes = await fetch(
          `${API_BASE}/api/outlines/project/${projectId}/context`,
          { headers: getAuthHeaders() }
        );
        const ctxData = await ctxRes.json();
        if (ctxData.success && ctxData.data) 上下文 = ctxData.data;
      } catch {}

      const existing = 卷列表
        .map(v => v.卷名称)
        .filter(Boolean)
        .join('、');
      const systemPrompt = buildOutlineSystemPrompt(
        上下文,
        existing,
        detailMode
      );
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: `请生成完整的大纲结构。\n\n${aiPrompt ? `用户要求：${aiPrompt}\n\n` : ''}${existing ? `已有卷（禁止重复）：${existing}\n\n` : ''}${detailMode ? '请使用细纲模式输出，包含V/F/E/C/CF/R/L/G/P/M/X/XE所有标记类型。' : '请输出V|和C|管道格式，或JSON数组格式。'}`,
        },
      ];
      const result = await generateValidated({
        schema: outlineSchema,
        generate: attempt =>
          generateLLM({
            messages,
            temperature: Math.min(1.0, 0.85 + attempt * 0.05),
            max_tokens: 8192,
            frequency_penalty: 0.5,
            presence_penalty: 0.4,
            onChunk: () => {},
            signal: abortRef.current!.signal,
          }),
        parseResponse: text => parseOutlineResponse(text, detailMode),
        maxRetries: 3,
      });
      const parsed = (result?.data ?? null) as unknown as 卷大纲[] | null;
      if (parsed && Array.isArray(parsed) && projectId) {
        const fullText = result!.rawText;
        // Ensure IDs
        const withIds = parsed.map(v => ({
          ...v,
          id: v.id || Date.now() + Math.random(),
          章节: (v.章节 || []).map((c, i) => ({
            ...c,
            id: c.id || Date.now() + i + Math.random(),
            出场角色列表: c.出场角色列表 || [],
            场景列表: c.场景列表 || [],
            关键对话: c.关键对话 || [],
            写作要点: c.写作要点 || [],
            情绪列表: c.情绪列表 || [],
            伏笔列表: c.伏笔列表 || [],
            状态: c.状态 || 'pending',
          })),
        }));

        // Step 1: Save generation record — POST /outlines/project/{id}/generations
        let generationId: string | null = null;
        try {
          const genRes = await fetch(
            `${API_BASE}/api/outlines/project/${projectId}/generations`,
            {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                提示词: aiPrompt || '',
                生成类型: 'full',
                生成内容: fullText,
              }),
            }
          );
          const genResult = await genRes.json();
          if (genResult.success && genResult.data?.id) {
            generationId = genResult.data.id;
          }
        } catch {}

        // Step 2: Adopt generation — PUT /outlines/project/{id}/generations/{gid}/adopt
        if (generationId) {
          try {
            await fetch(
              `${API_BASE}/api/outlines/project/${projectId}/generations/${generationId}/adopt`,
              {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ data: withIds }),
              }
            );
          } catch {}
        }

        // Step 3: Auto-link entities — POST /outlines/project/{id}/auto-link with 新实体列表
        // Extract new entities from detail mode parsed data
        const 新实体列表: any[] = [];
        if (detailMode) {
          for (const vol of withIds) {
            for (const ch of vol.章节) {
              for (const wp of ch.写作要点) {
                if (typeof wp === 'string' && wp.startsWith('[X] ')) {
                  // Parse X|type|fields from writing point
                  const xContent = wp.slice(4);
                  const parts = xContent.split('|');
                  新实体列表.push({ 实体类型: parts[0], 字段: parts.slice(1) });
                }
              }
            }
          }
        }
        try {
          await fetch(
            `${API_BASE}/api/outlines/project/${projectId}/auto-link`,
            {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({ 新实体列表 }),
            }
          );
        } catch {}

        // Step 4: Refresh from API to get server-assigned IDs
        try {
          const refreshRes = await fetch(
            `${API_BASE}/api/outlines/project/${projectId}`,
            { headers: getAuthHeaders() }
          );
          const refreshResult = await refreshRes.json();
          if (refreshResult.success && Array.isArray(refreshResult.data)) {
            set卷列表(refreshResult.data);
          } else {
            set卷列表(withIds);
          }
        } catch {
          set卷列表(withIds);
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setAiGenerating(false);
    }
  };

  // ── AI generate single chapter ──
  const handleAIGenerateChapter = async (volumeId: number) => {
    if (aiGenerating) return;
    setAiGenerating(true);
    abortRef.current = new AbortController();
    try {
      // Fetch context from API
      let 上下文: 大纲生成上下文 | null = null;
      try {
        const ctxRes = await fetch(
          `${API_BASE}/api/outlines/project/${projectId}/context`,
          { headers: getAuthHeaders() }
        );
        const ctxData = await ctxRes.json();
        if (ctxData.success && ctxData.data) 上下文 = ctxData.data;
      } catch {}

      const vol = 卷列表.find(v => v.id === volumeId);
      const existingChapters = vol?.章节.map(c => c.标题).join('、') || '';
      const existing = 卷列表
        .map(v => v.卷名称)
        .filter(Boolean)
        .join('、');
      const systemPrompt = buildOutlineSystemPrompt(
        上下文,
        existing,
        detailMode
      );
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: `请为卷"${vol?.卷名称 || ''}"生成章节大纲。\n\n${aiPrompt ? `用户要求：${aiPrompt}\n\n` : ''}${existingChapters ? `已有章节（禁止重复）：${existingChapters}\n\n` : ''}${detailMode ? '请使用细纲模式输出，包含C/CF/R/L/G/P/M/X/XE所有标记类型。' : '请输出C|管道格式，或JSON数组格式。'}`,
        },
      ];
      const result = await generateValidated({
        schema: outlineSchema,
        generate: attempt =>
          generateLLM({
            messages,
            temperature: Math.min(1.0, 0.85 + attempt * 0.05),
            max_tokens: 4096,
            frequency_penalty: 0.5,
            presence_penalty: 0.4,
            onChunk: () => {},
            signal: abortRef.current!.signal,
          }),
        parseResponse: text => parseChapterResponse(text, detailMode),
        maxRetries: 3,
      });
      const parsed = (result?.data ?? null) as unknown as 章节大纲[] | null;
      if (parsed && Array.isArray(parsed)) {
        const fullText = result!.rawText;
        const newChapters = parsed.map((c, i) => ({
          ...c,
          id: c.id || Date.now() + i + Math.random(),
          出场角色列表: c.出场角色列表 || [],
          场景列表: c.场景列表 || [],
          关键对话: c.关键对话 || [],
          写作要点: c.写作要点 || [],
          情绪列表: c.情绪列表 || [],
          伏笔列表: c.伏笔列表 || [],
          状态: c.状态 || 'pending',
        }));

        // Save generation record
        let generationId: string | null = null;
        try {
          const genRes = await fetch(
            `${API_BASE}/api/outlines/project/${projectId}/generations`,
            {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                提示词: aiPrompt || '',
                生成类型: 'chapter',
                生成内容: fullText,
              }),
            }
          );
          const genResult = await genRes.json();
          if (genResult.success && genResult.data?.id) {
            generationId = genResult.data.id;
          }
        } catch {}

        // Adopt generation
        if (generationId) {
          try {
            await fetch(
              `${API_BASE}/api/outlines/project/${projectId}/generations/${generationId}/adopt`,
              {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ data: newChapters, volumeId }),
              }
            );
          } catch {}
        }

        // POST each chapter to API
        for (const ch of newChapters) {
          try {
            await fetch(`${API_BASE}/api/outlines/project/${projectId}`, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                ...ch,
                父节点ID: volumeId,
                节点类型: 'chapter',
              }),
            });
          } catch {}
        }

        // Auto-link + refresh from API
        try {
          await fetch(
            `${API_BASE}/api/outlines/project/${projectId}/auto-link`,
            {
              method: 'POST',
              headers: getAuthHeaders(),
            }
          );
        } catch {}

        try {
          const refreshRes = await fetch(
            `${API_BASE}/api/outlines/project/${projectId}`,
            { headers: getAuthHeaders() }
          );
          const refreshResult = await refreshRes.json();
          if (refreshResult.success && Array.isArray(refreshResult.data)) {
            set卷列表(refreshResult.data);
          } else {
            set卷列表(prev =>
              prev.map(v => {
                if (v.id !== volumeId) return v;
                return { ...v, 章节: [...v.章节, ...newChapters] };
              })
            );
          }
        } catch {
          set卷列表(prev =>
            prev.map(v => {
              if (v.id !== volumeId) return v;
              return { ...v, 章节: [...v.章节, ...newChapters] };
            })
          );
        }
        set展开卷集合(prev => new Set(prev).add(volumeId));
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error(e);
    } finally {
      setAiGenerating(false);
    }
  };

  // ── Filter ──
  const filtered = useMemo(() => {
    if (!search.trim()) return 卷列表;
    const kw = search.trim().toLowerCase();
    return 卷列表
      .map(v => ({
        ...v,
        章节: v.章节.filter(
          c =>
            c.标题.toLowerCase().includes(kw) ||
            c.摘要.toLowerCase().includes(kw)
        ),
      }))
      .filter(
        v =>
          v.卷名称.toLowerCase().includes(kw) ||
          v.摘要.toLowerCase().includes(kw) ||
          v.章节.length > 0
      );
  }, [卷列表, search]);

  // ── Chapter detail view ──
  const ChapterDetail = ({
    chapter,
    volumeId,
  }: {
    chapter: 章节大纲;
    volumeId: number;
  }) => (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <button
          className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
          onClick={() => {
            set选中章节(null);
            setView('volume');
          }}
        >
          <i className="ri-arrow-left-line" />
        </button>
        <div className="flex items-center gap-2">
          <select
            value={chapter.状态}
            onChange={e =>
              updateChapter(volumeId, chapter.id, { 状态: e.target.value })
            }
            className="px-2 py-1 bg-[var(--bg-dark)] border border-[var(--border)] rounded text-xs"
          >
            {状态选项.map(s => (
              <option key={s} value={s}>
                {状态标签[s]}
              </option>
            ))}
          </select>
          <button
            className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors text-red-400"
            onClick={() => deleteChapter(volumeId, chapter.id)}
          >
            <i className="ri-delete-bin-line" />
          </button>
        </div>
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          章节标题
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.标题}
          onChange={e =>
            updateChapter(volumeId, chapter.id, { 标题: e.target.value })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          摘要
        </label>
        <textarea
          className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-blue-500/50 focus:outline-none"
          value={chapter.摘要}
          onChange={e =>
            updateChapter(volumeId, chapter.id, { 摘要: e.target.value })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          章节描述
        </label>
        <textarea
          className="w-full h-24 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-blue-500/50 focus:outline-none"
          value={chapter.描述}
          onChange={e =>
            updateChapter(volumeId, chapter.id, { 描述: e.target.value })
          }
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            开头承接
          </label>
          <textarea
            className="w-full h-16 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-none focus:border-blue-500/50 focus:outline-none"
            value={chapter.开头承接}
            onChange={e =>
              updateChapter(volumeId, chapter.id, { 开头承接: e.target.value })
            }
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            章尾悬念
          </label>
          <textarea
            className="w-full h-16 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-none focus:border-blue-500/50 focus:outline-none"
            value={chapter.章尾悬念}
            onChange={e =>
              updateChapter(volumeId, chapter.id, { 章尾悬念: e.target.value })
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            目标字数
          </label>
          <input
            type="number"
            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
            value={chapter.目标字数}
            onChange={e =>
              updateChapter(volumeId, chapter.id, {
                目标字数: Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)] mb-1 block">
            正文字数
          </label>
          <input
            type="number"
            className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
            value={chapter.正文字数}
            onChange={e =>
              updateChapter(volumeId, chapter.id, {
                正文字数: Number(e.target.value),
              })
            }
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          出场角色（逗号分隔）
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.出场角色列表.join('、')}
          onChange={e =>
            updateChapter(volumeId, chapter.id, {
              出场角色列表: e.target.value
                .split(/[、,，]/)
                .map(s => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          场景列表（顿号分隔）
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.场景列表.join('、')}
          onChange={e =>
            updateChapter(volumeId, chapter.id, {
              场景列表: e.target.value
                .split(/[、,，]/)
                .map(s => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          写作要点（顿号分隔）
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.写作要点.join('、')}
          onChange={e =>
            updateChapter(volumeId, chapter.id, {
              写作要点: e.target.value
                .split(/[、,，]/)
                .map(s => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          关键对话（顿号分隔）
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.关键对话.join('、')}
          onChange={e =>
            updateChapter(volumeId, chapter.id, {
              关键对话: e.target.value
                .split(/[、,，]/)
                .map(s => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          伏笔列表（顿号分隔）
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
          value={chapter.伏笔列表.join('、')}
          onChange={e =>
            updateChapter(volumeId, chapter.id, {
              伏笔列表: e.target.value
                .split(/[、,，]/)
                .map(s => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div>
        <label className="text-xs text-[var(--text-secondary)] mb-1 block">
          情绪基调
        </label>
        <div className="flex flex-wrap gap-1.5">
          {情绪选项.map(em => (
            <button
              key={em.值}
              type="button"
              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${chapter.情绪列表.includes(em.值) ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-[var(--bg-dark)] border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-500/30'}`}
              onClick={() => {
                const next = chapter.情绪列表.includes(em.值)
                  ? chapter.情绪列表.filter(v => v !== em.值)
                  : [...chapter.情绪列表, em.值];
                updateChapter(volumeId, chapter.id, { 情绪列表: next });
              }}
            >
              {em.标签}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="v-outline-panel">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width: 560 }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-gradient-to-r from-blue-900/30 to-indigo-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/20">
                  <i className="text-lg text-blue-400 ri-file-list-3-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">大纲设定</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {卷列表.length} 卷 / {总章数} 章 / 完成率 {完成率}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-1.5 hover:bg-blue-500/20 rounded-lg transition-colors text-blue-400"
                  title="AI生成大纲"
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
                  className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors flex items-center gap-1.5"
                  onClick={addVolume}
                >
                  <i className="ri-add-line" /> 新建卷
                </button>
                <button
                  className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  disabled={saving}
                  onClick={handleSave}
                >
                  <i
                    className={
                      saving ? 'ri-loader-4-line animate-spin' : 'ri-save-line'
                    }
                  />{' '}
                  保存
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
            {view === 'chapter' && 选中章节 && 选中卷 ? (
              <ChapterDetail chapter={选中章节} volumeId={选中卷.id} />
            ) : (
              <div className="p-4 space-y-3">
                {/* Search */}
                <input
                  type="text"
                  placeholder="搜索大纲..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
                />

                {/* Volume detail view */}
                {view === 'volume' && 选中卷 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                        onClick={() => {
                          set选中卷(null);
                          setView('list');
                        }}
                      >
                        <i className="ri-arrow-left-line" />
                      </button>
                      <span className="text-sm font-medium flex-1">
                        {选中卷.卷名称}
                      </span>
                      <button
                        className="p-1.5 hover:bg-blue-500/20 rounded-lg transition-colors text-blue-400"
                        title="AI生成章节"
                        disabled={aiGenerating}
                        onClick={() => {
                          setAiPrompt('');
                          setShowAIDialog(true);
                        }}
                      >
                        <i
                          className={
                            aiGenerating
                              ? 'ri-loader-4-line animate-spin'
                              : 'ri-magic-line'
                          }
                        />
                      </button>
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        卷名称
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
                        value={选中卷.卷名称}
                        onChange={e =>
                          updateVolume(选中卷.id, { 卷名称: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        幕名称
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm focus:border-blue-500/50 focus:outline-none"
                        value={选中卷.幕名称}
                        onChange={e =>
                          updateVolume(选中卷.id, { 幕名称: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                        卷摘要
                      </label>
                      <textarea
                        className="w-full h-24 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-y focus:border-blue-500/50 focus:outline-none"
                        value={选中卷.摘要}
                        onChange={e =>
                          updateVolume(选中卷.id, { 摘要: e.target.value })
                        }
                      />
                    </div>

                    {/* Chapter list */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-secondary)]">
                          章节列表 ({选中卷.章节.length})
                        </span>
                        <button
                          className="text-xs text-blue-400 hover:text-blue-300"
                          onClick={() => addChapter(选中卷.id)}
                        >
                          <i className="ri-add-line" /> 添加章节
                        </button>
                      </div>
                      {选中卷.章节.map(ch => (
                        <div
                          key={ch.id}
                          className="p-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg hover:border-blue-500/50 cursor-pointer transition-colors flex items-center gap-2"
                          onClick={() => {
                            set选中章节(ch);
                            setView('chapter');
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              background: 状态颜色[ch.状态] || '#9ca3af',
                            }}
                          />
                          <span className="text-sm flex-1 truncate">
                            {ch.标题 || '未命名'}
                          </span>
                          <span className="text-xs text-[var(--text-secondary)]">
                            {ch.目标字数}字
                          </span>
                          <button
                            className="p-1 text-red-400 hover:bg-red-500/20 rounded opacity-0 group-hover:opacity-100"
                            onClick={e => {
                              e.stopPropagation();
                              deleteChapter(选中卷.id, ch.id);
                            }}
                          >
                            <i className="text-xs ri-close-line" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      className="w-full p-2 border border-dashed border-red-500/30 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      onClick={() => deleteVolume(选中卷.id)}
                    >
                      <i className="ri-delete-bin-line" /> 删除此卷
                    </button>
                  </div>
                ) : /* List view */
                loading ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    加载中...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
                    暂无大纲，点击新建卷或AI生成
                  </div>
                ) : (
                  filtered.map(vol => {
                    const expanded = 展开卷集合.has(vol.id);
                    const chapterDone = vol.章节.filter(
                      c => c.状态 === 'complete'
                    ).length;
                    return (
                      <div
                        key={vol.id}
                        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden"
                      >
                        <div
                          className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-dark)] transition-colors"
                          onClick={() => toggleExpand(vol.id)}
                        >
                          <button className="w-4 h-4 flex items-center justify-center text-xs text-[var(--text-secondary)]">
                            <i
                              className={
                                expanded
                                  ? 'ri-arrow-down-s-line'
                                  : 'ri-arrow-right-s-line'
                              }
                            />
                          </button>
                          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/20">
                            <i className="ri-book-2-line text-blue-400 text-sm" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium truncate">
                              {vol.卷名称 || '未命名'}
                            </h4>
                            {vol.摘要 && (
                              <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                                {vol.摘要}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-[var(--text-secondary)]">
                              {chapterDone}/{vol.章节.length}
                            </span>
                            <button
                              className="p-1 text-[var(--text-secondary)] hover:text-blue-400 transition-colors"
                              title="编辑"
                              onClick={e => {
                                e.stopPropagation();
                                set选中卷(vol);
                                setView('volume');
                              }}
                            >
                              <i className="ri-edit-line text-sm" />
                            </button>
                          </div>
                        </div>
                        {expanded && vol.章节.length > 0 && (
                          <div className="px-4 pb-3 space-y-1">
                            {vol.章节.map(ch => (
                              <div
                                key={ch.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-dark)] cursor-pointer transition-colors"
                                onClick={() => {
                                  set选中卷(vol);
                                  set选中章节(ch);
                                  setView('chapter');
                                }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{
                                    background: 状态颜色[ch.状态] || '#9ca3af',
                                  }}
                                />
                                <span className="text-xs flex-1 truncate">
                                  {ch.标题 || '未命名'}
                                </span>
                                <span className="text-xs text-[var(--text-secondary)]">
                                  {状态标签[ch.状态] || ch.状态}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Resize handle */}
        <div className="relative z-10 w-2 transition-colors bg-transparent cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 shrink-0" />
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
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/20">
                  <i className="text-blue-400 ri-magic-line" />
                </div>
                <h3 className="text-sm font-semibold">AI生成大纲</h3>
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
              <div>
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  生成范围
                </label>
                <div className="flex gap-2">
                  <button
                    className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-colors ${选中卷 ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-blue-500/20 border-blue-500/50 text-blue-400'}`}
                    onClick={() => {}}
                  >
                    {选中卷 ? `为"${选中卷.卷名称}"生成章节` : '生成完整大纲'}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={detailMode}
                    onChange={e => setDetailMode(e.target.checked)}
                    className="rounded border-[var(--border)] bg-[var(--bg-dark)]"
                  />
                  细纲模式（输出完整角色/场景/势力/道具/伏笔详情）
                </label>
              </div>
              <div>
                <label className="text-xs text-[var(--text-secondary)] mb-1 block">
                  补充要求
                </label>
                <textarea
                  className="w-full h-20 px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm resize-none focus:border-blue-500/50 focus:outline-none"
                  placeholder="描述你对大纲的具体要求..."
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                />
              </div>
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
                className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
                disabled={aiGenerating}
                onClick={() =>
                  选中卷
                    ? handleAIGenerateChapter(选中卷.id)
                    : handleAIGenerate()
                }
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

export default OutlineSettingsPanel;
