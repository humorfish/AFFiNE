import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  generateLLM,
  generateValidated,
  useSystemPrompt,
} from './panel-shared';
import { z } from 'zod';
import { API_BASE, getAuthHeaders } from '../useWorldApi';
import { GeoMapCanvas } from './GeoMapCanvas';
import type { GeoMapCanvasRef } from './GeoMapCanvas';
import {
  NODE_TYPE_OPTIONS,
  CONNECTION_TYPES,
  ICON_OPTIONS,
  inferTypeFromName,
  getTypeById,
  LEVEL_COLORS,
  LEVEL_TYPE_MAP,
} from './geomap-constants';
import type { 地图数据, 连线数据, 画布节点, MapId } from './geomap-constants';

// ── AI prompt/parsers (source lines 11392-13126, already correct) ──

const 等级类型: Record<number, string> = {
  0: '世界',
  1: '大陆',
  2: '区域',
  3: '城市',
  4: '地点',
  5: '路线',
};
const 子地图数量配置: Record<string, { 最小: number; 最大: number }> = {
  大陆: { 最小: 2, 最大: 4 },
  区域: { 最小: 3, 最大: 5 },
  城市: { 最小: 3, 最大: 6 },
  地点: { 最小: 4, 最大: 8 },
  路线: { 最小: 2, 最大: 4 },
};

function getLevelType(level: number): string {
  return 等级类型[level] || '地点';
}

function buildSubMapPrompt(
  worldview: Record<string, string> | null,
  parent: 地图数据 | null,
  existingChildren: string[],
  existingAllNames: string[]
): string {
  let worldviewStr = '';
  if (worldview) {
    worldviewStr = Object.entries(worldview)
      .filter(([, v]) => v && v.trim && v.trim())
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  }
  let banBlock = '';
  if (existingAllNames.length > 0) {
    const names =
      existingAllNames.length > 80
        ? [
            ...existingAllNames.slice(0, 80),
            `...(共${existingAllNames.length}个)`,
          ]
        : existingAllNames;
    banBlock = `\n╔══════════════════════════════════════════════════════════════╗\n║  【绝对禁止重复】以下名称已被使用\n╚══════════════════════════════════════════════════════════════╝\n已存在的地图名称(${existingAllNames.length}个)：\n${names.join('、')}`;
  }
  let childrenHint = '';
  if (existingChildren.length > 0)
    childrenHint = `\n⚠️ 当前父地图下已有子地图：${existingChildren.join('、')}\n请生成完全不同的新名称。`;
  const level = parent?.地图等级 ?? -1;
  const parentName = parent?.地图名称 || '世界';
  const parentType = parent?.地图类型 || '世界';
  const childLevel = getLevelType(level + 1);
  const config = 子地图数量配置[childLevel] || { 最小: 3, 最大: 5 };
  const includeRoutes = childLevel !== '路线' && level < 4;
  let taskDesc = '';
  switch (childLevel) {
    case '大陆':
      taskDesc = `为"${parentName}"世界生成${config.最小}-${config.最大}个大陆`;
      break;
    case '区域':
      taskDesc = `为"${parentName}"大陆生成${config.最小}-${config.最大}个区域`;
      break;
    case '城市':
      taskDesc = `为"${parentName}"区域生成${config.最小}-${config.最大}个城市`;
      break;
    case '地点':
      taskDesc = `为"${parentName}"城市生成${config.最小}-${config.最大}个重要地点`;
      break;
    case '路线':
      taskDesc = `为"${parentName}"生成${config.最小}-${config.最大}条重要路线`;
      break;
    default:
      taskDesc = `生成${config.最小}-${config.最大}个子地图`;
  }
  if (includeRoutes)
    taskDesc += `\n- 同时生成${子地图数量配置['路线'].最小}-${子地图数量配置['路线'].最大}条路线`;
  let pipeFormat = '',
    example = '';
  if (childLevel === '路线') {
    pipeFormat = 'R|路线名称|起点|终点|描述';
    example = 'R|龙脊商道|龙脊城|余烬镇|穿越山脉的繁忙商道';
  } else if (includeRoutes) {
    pipeFormat = 'M|地图名称|地图描述\nR|路线名称|起点|终点|描述';
    example =
      'M|东方大陆|神秘的古老大陆\nR|丝路商道|东方大陆|西域荒漠|古老商路';
  } else {
    pipeFormat = 'M|地图名称|地图描述';
    example = 'M|东方大陆|神秘的古老大陆';
  }
  const routeRule = includeRoutes
    ? '\n- 路线的起点和终点必须使用上方M|行中已生成的名称\n- 先输出所有M|行，再输出所有R|行'
    : '';
  return `你是一位专业的小说地理地图设计师，擅长创建详细的地理层级结构。
${worldviewStr ? '\n当前世界观信息：\n' + worldviewStr : ''}${banBlock}${childrenHint}

当前任务：在"${parentName}"(${parentType})下生成${childLevel}级子地图

【输出格式】（极简格式，节省token）
${pipeFormat}

【核心要求】
- ${taskDesc}
- 命名要有特色，符合世界观风格
- 描述简洁具体，5字以内
- ⚠️ 名称绝对不能与已存在的地图名称重复${routeRule}

【输出示例】
${example}

【重要规则】
1. 严格按格式输出，每行一个地图项
2. 不要输出任何其他内容
3. ⚠️ 地图名称绝对不能与已有名称重复
4. 在输出前，逐个检查每个名称是否与已有名称重复`;
}

function buildRoutePrompt(
  worldview: Record<string, string> | null,
  parent: 地图数据 | null,
  selectedLocations: 地图数据[],
  existingAllNames: string[]
): string {
  let worldviewStr = '';
  if (worldview)
    worldviewStr = Object.entries(worldview)
      .filter(([, v]) => v && v.trim && v.trim())
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  let banBlock = '';
  if (existingAllNames.length > 0) {
    const names =
      existingAllNames.length > 80
        ? [
            ...existingAllNames.slice(0, 80),
            `...(共${existingAllNames.length}个)`,
          ]
        : existingAllNames;
    banBlock = `\n⚠️ 以下名称已存在：\n${names.join('、')}`;
  }
  const locNames = selectedLocations.map(l => l.地图名称);
  const maxRoutes = Math.max(2, Math.min(selectedLocations.length * 2, 10));
  const minRoutes = Math.ceil(maxRoutes / 2);
  return `你是一位专业的小说地理地图设计师，擅长设计地点之间的路线和交通网络。
${worldviewStr ? '\n当前世界观信息：\n' + worldviewStr : ''}${banBlock}

当前任务：为以下地点生成连接路线
所在地图：${parent?.地图名称 || '世界'}
可用地点：${locNames.join('、')}

【输出格式】R|路线名称|起点|终点|描述

【核心要求】
- 生成${minRoutes}-${maxRoutes}条有意义的路线
- 起点和终点必须从以下名称中选择：${locNames.join('、')}
- 路线名称要有特色，5字以内
- 描述简洁具体，5字以内

【输出示例】
R|龙脊商道|龙脊城|余烬镇|繁忙的商道

【重要规则】
1. 严格按格式输出，每行一条路线
2. 不要输出任何其他内容
3. 起点和终点只能使用上面给出的地点名称`;
}

function buildWorldMapPrompt(
  worldview: Record<string, string> | null,
  existingWorldNames: string[],
  existingAllNames: string[]
): string {
  let worldviewStr = '';
  if (worldview)
    worldviewStr = Object.entries(worldview)
      .filter(([, v]) => v && v.trim && v.trim())
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  let banBlock = '';
  if (existingAllNames.length > 0) {
    const names =
      existingAllNames.length > 80
        ? [
            ...existingAllNames.slice(0, 80),
            `...(共${existingAllNames.length}个)`,
          ]
        : existingAllNames;
    banBlock = `\n╔══════════════════════════════════════════════════════════════╗\n║  【绝对禁止重复】\n╚══════════════════════════════════════════════════════════════╝\n已存在的地图名称(${existingAllNames.length}个)：\n${names.join('、')}`;
  }
  const worldHint =
    existingWorldNames.length > 0
      ? `\n\n⚠️ 已有世界地图：${existingWorldNames.join('、')}，必须生成不同的新世界名称`
      : '';
  return `你是一位专业的小说世界观设计师，擅长创建宏大的世界级地理架构。
${worldviewStr ? '\n当前世界观信息：\n' + worldviewStr : ''}${banBlock}${worldHint}

当前任务：生成一个完整的世界地图层级结构

【输出格式】（极简格式，节省token）
W|世界名称|世界描述
A|大陆名称|大陆描述
B|区域名称|区域描述
C|城市名称|城市描述
D|地点名称|地点描述
R|路线名称|起点|终点|描述

【层级规则】W→A→B→C→D→R

【字数限制】名称5字内，描述5字内

【输出示例】
W|云山界|灵气充沛的修真世界
A|东大陆|古老的修炼圣地
B|天龙国|以龙为图腾的帝国
C|天龙城|繁华的帝国首都
D|拍卖行|交易珍稀宝物
R|天龙商道|天龙城|青云镇|主要贸易路线

【核心要求】
1. 命名有特色，符合世界观风格
2. 层级间逻辑关联
3. 路线连接实际存在的地点
4. ⚠️ 名称绝对不能与已存在的地图名称重复

【重要规则】
1. 严格按格式输出，每行一个地图项
2. 按层级顺序输出：W → A → B → C → D → R
3. 不要输出任何其他内容`;
}

// Parsers (source lines 12518-13126)
interface 子地图生成结果 {
  子地图列表: Array<{ 地图名称: string; 地图描述: string; 地图类型: string }>;
  路线列表: Array<{
    地图名称: string;
    起点: string;
    终点: string;
    地图描述: string;
    地图类型: string;
  }>;
}

function parseSubMapPipe(text: string): {
  成功: boolean;
  数据: 子地图生成结果 | null;
} {
  const cleaned = text
    .replace(/```[\w]*\n?/g, '')
    .replace(/```/g, '')
    .trim();
  const lines = cleaned.split('\n').filter(l => l.trim());
  const subMaps: 子地图生成结果['子地图列表'] = [];
  const routes: 子地图生成结果['路线列表'] = [];
  for (const raw of lines) {
    const line = raw
      .trim()
      .replace(/^\d+[.)]\s*/, '')
      .replace(/^[-*•]\s*/, '')
      .trim();
    if (line.startsWith('M|')) {
      const parts = line.substring(2).split('|');
      if (parts.length >= 2)
        subMaps.push({
          地图名称: parts[0].trim(),
          地图描述: parts.slice(1).join('|').trim(),
          地图类型: '子地图',
        });
    } else if (line.startsWith('R|')) {
      const parts = line.substring(2).split('|');
      if (parts.length >= 3)
        routes.push({
          地图名称: parts[0].trim(),
          起点: parts[1].trim(),
          终点: parts[2].trim(),
          地图描述: parts.length >= 4 ? parts.slice(3).join('|').trim() : '',
          地图类型: '路线',
        });
    }
  }
  return subMaps.length > 0 || routes.length > 0
    ? { 成功: true, 数据: { 子地图列表: subMaps, 路线列表: routes } }
    : { 成功: false, 数据: null };
}

function parseSubMapResponse(text: string): {
  成功: boolean;
  数据: 子地图生成结果 | null;
  错误信息: string | null;
} {
  if (!text) return { 成功: false, 错误信息: '内容为空', 数据: null };
  const cleaned = text.replace(/^﻿/, '').trim();
  const pipe = parseSubMapPipe(cleaned);
  if (pipe.成功) return { ...pipe, 错误信息: null };
  try {
    const json = JSON.parse(cleaned);
    if (json?.子地图列表) return { 成功: true, 数据: json, 错误信息: null };
  } catch {}
  const braceMatch = cleaned.match(/\{[\s\S]*\}/);
  if (braceMatch)
    try {
      const json = JSON.parse(braceMatch[0]);
      if (json?.子地图列表) return { 成功: true, 数据: json, 错误信息: null };
    } catch {}
  return { 成功: false, 错误信息: '解析失败，请重试', 数据: null };
}

interface 世界地图生成结果 {
  地图名称: string;
  地图描述: string;
  地图类型: string;
  大陆列表: Array<{
    地图名称: string;
    地图描述: string;
    地图类型: string;
    区域列表: Array<{
      地图名称: string;
      地图描述: string;
      地图类型: string;
      城市列表: Array<{
        地图名称: string;
        地图描述: string;
        地图类型: string;
        地点列表: Array<{
          地图名称: string;
          地图描述: string;
          地图类型: string;
        }>;
      }>;
    }>;
  }>;
  路线列表: Array<{ 名称: string; 起点: string; 终点: string; 描述: string }>;
}

function parseWorldMapResponse(text: string): {
  成功: boolean;
  数据: 世界地图生成结果 | null;
  错误信息: string | null;
} {
  if (!text || !text.trim())
    return { 成功: false, 错误信息: '内容为空', 数据: null };
  const lines = text.split('\n').filter(l => l.trim());
  const worldLine = lines.find(l => l.trim().startsWith('W|'));
  if (!worldLine)
    return { 成功: false, 错误信息: '未找到世界级地图', 数据: null };
  const worldParts = worldLine.trim().substring(2).split('|');
  const world: 世界地图生成结果 = {
    地图名称: worldParts[0]?.trim() || '未命名世界',
    地图描述: worldParts.slice(1).join('|').trim() || '',
    地图类型: '世界',
    大陆列表: [],
    路线列表: [],
  };
  let curContinent: 世界地图生成结果['大陆列表'][0] | null = null;
  let curRegion:
    | NonNullable<世界地图生成结果['大陆列表'][0]['区域列表']>[0]
    | null = null;
  let curCity:
    | NonNullable<
        NonNullable<世界地图生成结果['大陆列表'][0]['区域列表']>[0]['城市列表']
      >[0]
    | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('A|')) {
      const p = line.substring(2).split('|');
      curContinent = {
        地图名称: p[0]?.trim() || '',
        地图描述: p.slice(1).join('|').trim() || '',
        地图类型: '大陆',
        区域列表: [],
      };
      world.大陆列表.push(curContinent);
      curRegion = null;
      curCity = null;
    } else if (line.startsWith('B|') && curContinent) {
      const p = line.substring(2).split('|');
      curRegion = {
        地图名称: p[0]?.trim() || '',
        地图描述: p.slice(1).join('|').trim() || '',
        地图类型: '区域',
        城市列表: [],
      };
      curContinent.区域列表.push(curRegion);
      curCity = null;
    } else if (line.startsWith('C|') && curRegion) {
      const p = line.substring(2).split('|');
      curCity = {
        地图名称: p[0]?.trim() || '',
        地图描述: p.slice(1).join('|').trim() || '',
        地图类型: '城市',
        地点列表: [],
      };
      curRegion.城市列表.push(curCity);
    } else if (line.startsWith('D|') && curCity) {
      const p = line.substring(2).split('|');
      curCity.地点列表.push({
        地图名称: p[0]?.trim() || '',
        地图描述: p.slice(1).join('|').trim() || '',
        地图类型: '地点',
      });
    } else if (line.startsWith('R|')) {
      const p = line.substring(2).split('|');
      if (p.length >= 3)
        world.路线列表.push({
          名称: p[0]?.trim() || '',
          起点: p[1]?.trim() || '',
          终点: p[2]?.trim() || '',
          描述: p.slice(3).join('|').trim() || '',
        });
    }
  }
  return world.地图名称 && world.大陆列表.length > 0
    ? { 成功: true, 数据: world, 错误信息: null }
    : { 成功: false, 错误信息: '解析失败', 数据: null };
}

const geoMapSchema = z.record(z.any());

// ── Interfaces ──

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

type AIMode = 'world' | 'submap' | 'route';

// ── Main Component (source lines 140874-144824) ──

export const GeoMapPanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset = 288,
}) => {
  const [地图列表, set地图列表] = useState<地图数据[]>([]);
  const [连线列表, set连线列表] = useState<连线数据[]>([]);
  const [loading, setLoading] = useState(false);
  const [当前地图ID, set当前地图ID] = useState<MapId | null>(null);
  const [选中节点ID, set选中节点ID] = useState<MapId | null>(null);
  const [选中连线ID, set选中连线ID] = useState<string | null>(null);
  const [展开状态, set展开状态] = useState<Record<string, boolean>>({});

  // Edit form
  const [编辑表单, set编辑表单] = useState<{
    名称: string;
    类型: string;
    颜色: string;
    父地图ID: MapId | null;
    描述: string;
  } | null>(null);
  const [编辑连线表单, set编辑连线表单] = useState<{
    连线标签: string;
    连线类型: string;
  } | null>(null);

  // UI state
  const [显示类型选择器, set显示类型选择器] = useState(false);
  const [显示自定义类型, set显示自定义类型] = useState(false);
  const [自定义类型名, set自定义类型名] = useState('');
  const [自定义类型图标, set自定义类型图标] = useState('ri-map-pin-line');
  const [右侧面板折叠, set右侧面板折叠] = useState(false);
  const [面板最大化, set面板最大化] = useState(false);
  const [左侧栏宽度, set左侧栏宽度] = useState(() => {
    try {
      const v = parseInt(
        localStorage.getItem('ai_novelist_geomap_left_sidebar_width') || ''
      );
      if (v >= 200 && v <= 500) return v;
    } catch {}
    return 260;
  });
  const [面板宽度] = useState(560);
  const effectiveWidth = 面板最大化
    ? window.innerWidth - (leftOffset || 288)
    : 面板宽度;
  const [layoutMode, setLayoutMode] = useState<'层级' | '网络'>(() => {
    try {
      const v = localStorage.getItem(`ai_novelist_geomap_layout_mode_default`);
      if (v === '层级' || v === '网络') return v;
    } catch {}
    return '层级';
  });

  // AI state
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiMode, setAiMode] = useState<AIMode>('submap');
  const [aiSelectedLocations, setAiSelectedLocations] = useState<MapId[]>([]);
  const [genResult, setGenResult] = useState<any>(null);
  const [genError, setGenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fetchSystemPrompt = useSystemPrompt('AI生成地图', '');

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [genHistory, setGenHistory] = useState<
    Array<{
      id: string;
      时间: string;
      提示词: string;
      已采用: boolean;
      生成内容: any;
    }>
  >([]);

  const canvasRef = useRef<GeoMapCanvasRef>(null);
  const suppressMoveRef = useRef(false);

  // ── Data fetching ──
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`${API_BASE}/api/geo-maps/project/${projectId}/list`, {
      headers: getAuthHeaders(),
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data)) {
          set地图列表(result.data);
          // Auto-select the latest (highest ID) root map
          const roots = result.data.filter((m: 地图数据) => !m.父地图ID);
          if (roots.length > 0) {
            const latest = roots.reduce((a: 地图数据, b: 地图数据) =>
              (a.id as number) > (b.id as number) ? a : b
            );
            set当前地图ID(latest.id);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  // Sync edit form on selection
  useEffect(() => {
    if (选中节点ID) {
      const node = 地图列表.find(m => m.id === 选中节点ID);
      if (node) {
        const content = node.地图内容 || {};
        set编辑表单({
          名称: node.地图名称 || '',
          类型: node.地图类型 || 'landmark',
          颜色: content.颜色 || getTypeById(node.地图类型).color || '#a0a0a0',
          父地图ID: node.父地图ID || null,
          描述: node.地图描述 || '',
        });
      }
    } else {
      set编辑表单(null);
    }
  }, [选中节点ID, 地图列表]);

  useEffect(() => {
    if (选中连线ID) {
      const conn = 连线列表.find(c => c.id === 选中连线ID);
      if (conn)
        set编辑连线表单({
          连线标签: conn.连线标签 || '',
          连线类型: conn.连线类型 || 'road',
        });
    } else {
      set编辑连线表单(null);
    }
  }, [选中连线ID, 连线列表]);

  // Derived
  const 根地图列表 = useMemo(
    () => 地图列表.filter(m => !m.父地图ID),
    [地图列表]
  );
  const 当前地图 = useMemo(
    () => (当前地图ID ? 地图列表.find(m => m.id === 当前地图ID) : null),
    [当前地图ID, 地图列表]
  );
  const 画布节点列表 = useMemo((): 画布节点[] => {
    if (!当前地图ID) return [];
    const ids = new Set<MapId>();
    const collect = (pid: MapId) => {
      地图列表
        .filter(m => m.父地图ID === pid)
        .forEach(c => {
          ids.add(c.id);
          collect(c.id);
        });
    };
    ids.add(当前地图ID);
    collect(当前地图ID);
    return 地图列表
      .filter(m => ids.has(m.id))
      .map(m => ({
        id: m.id,
        地图名称: m.地图名称,
        地图类型: m.地图类型,
        地图等级: m.地图等级,
        地图描述: m.地图描述,
        父地图ID: m.父地图ID,
        x: m.地图内容?.x || m.x || 0,
        y: m.地图内容?.y || m.y || 0,
        地图内容: m.地图内容,
      }));
  }, [当前地图ID, 地图列表]);

  const 可选父级 = useMemo(() => {
    if (!选中节点ID) return [];
    const descendantIds = new Set<MapId>();
    const collect = (pid: MapId) => {
      地图列表
        .filter(m => m.父地图ID === pid)
        .forEach(c => {
          descendantIds.add(c.id);
          collect(c.id);
        });
    };
    collect(选中节点ID);
    return 地图列表.filter(
      m => m.id !== 选中节点ID && !descendantIds.has(m.id)
    );
  }, [选中节点ID, 地图列表]);

  const 节点连线 = useMemo(
    () =>
      选中节点ID
        ? 连线列表.filter(
            c => c.起点ID === 选中节点ID || c.终点ID === 选中节点ID
          )
        : [],
    [选中节点ID, 连线列表]
  );
  const 子地点列表 = useMemo(() => {
    const parentId = 选中节点ID || 当前地图ID;
    return parentId
      ? 地图列表.filter(m => m.父地图ID === parentId && m.地图类型 !== '路线')
      : [];
  }, [选中节点ID, 当前地图ID, 地图列表]);

  // Auto-select handled in data fetching (latest root map)

  // ── CRUD ──
  const getChildren = useCallback(
    (id: MapId) => 地图列表.filter(m => m.父地图ID === id),
    [地图列表]
  );
  const getAllNames = useCallback(
    () => 地图列表.map(m => m.地图名称).filter(Boolean),
    [地图列表]
  );

  const handleAdd = useCallback(
    async (parentId: MapId | null) => {
      if (!projectId) return;
      const parent = parentId ? 地图列表.find(m => m.id === parentId) : null;
      const level = parent ? parent.地图等级 + 1 : 0;
      try {
        const r = await fetch(
          `${API_BASE}/api/geo-maps/project/${projectId}/map`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              地图名称: '新地点',
              地图描述: '',
              父地图ID: parentId,
              地图类型: 'landmark',
              地图等级: level,
            }),
          }
        );
        const res = await r.json();
        if (res.success && res.data?.id) {
          const newMap: 地图数据 = {
            id: res.data.id,
            地图名称: '新地点',
            地图描述: '',
            父地图ID: parentId,
            地图类型: 'landmark',
            地图等级: level,
          };
          set地图列表(prev => [...prev, newMap]);
          set选中节点ID(res.data.id);
        }
      } catch {}
    },
    [地图列表, projectId]
  );

  const handleDelete = useCallback(
    async (id: MapId) => {
      const map = 地图列表.find(m => m.id === id);
      if (!map) return;
      const childCount = 地图列表.filter(m => m.父地图ID === id).length;
      let msg = `确定要删除"${map.地图名称 || '未命名'}"吗？`;
      if (childCount > 0)
        msg += `\n\n⚠️ 此地图包含 ${childCount} 个子地图，将一并删除！`;
      msg += '\n\n此操作不可恢复。';
      if (!confirm(msg)) return;
      const idsToRemove = new Set<MapId>();
      const collect = (pid: MapId) => {
        idsToRemove.add(pid);
        地图列表.filter(m => m.父地图ID === pid).forEach(c => collect(c.id));
      };
      collect(id);
      set地图列表(prev => prev.filter(m => !idsToRemove.has(m.id)));
      if (选中节点ID === id) set选中节点ID(null);
      if (projectId) {
        try {
          for (const rid of idsToRemove) {
            await fetch(
              `${API_BASE}/api/geo-maps/project/${projectId}/map/${rid}`,
              {
                method: 'DELETE',
                headers: getAuthHeaders(),
              }
            );
          }
        } catch {}
      }
    },
    [地图列表, 选中节点ID, projectId]
  );

  const handleSave = useCallback(async () => {
    if (!选中节点ID || !编辑表单 || !projectId) return;
    const map = 地图列表.find(m => m.id === 选中节点ID);
    try {
      // Step 1: 更新地图基本信息 (source: t.更新地图信息 → C() → tl.update)
      await fetch(
        `${API_BASE}/api/geo-maps/project/${projectId}/map/${选中节点ID}`,
        {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            地图名称: 编辑表单.名称,
            地图类型: 编辑表单.类型,
            地图描述: 编辑表单.描述,
            父地图ID: 编辑表单.父地图ID || null,
          }),
        }
      );
      // Step 2: 更新地图内容（颜色等） (source: t.保存地图内容到后端 → Z() → tl.update)
      if (map) {
        const 地图内容 = { ...(map.地图内容 || {}), 颜色: 编辑表单.颜色 };
        await fetch(
          `${API_BASE}/api/geo-maps/project/${projectId}/map/${选中节点ID}`,
          {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ 地图内容: JSON.stringify(地图内容) }),
          }
        );
        set地图列表(prev =>
          prev.map(m =>
            m.id === 选中节点ID
              ? {
                  ...m,
                  地图名称: 编辑表单.名称,
                  地图类型: 编辑表单.类型,
                  地图描述: 编辑表单.描述,
                  父地图ID: 编辑表单.父地图ID,
                  地图内容,
                }
              : m
          )
        );
      }
    } catch {}
  }, [选中节点ID, 编辑表单, 地图列表, projectId]);

  const handleSaveConnection = useCallback(async () => {
    if (!选中连线ID || !编辑连线表单) return;
    const updated = 连线列表.map(c =>
      c.id === 选中连线ID
        ? {
            ...c,
            连线标签: 编辑连线表单.连线标签,
            连线类型: 编辑连线表单.连线类型,
          }
        : c
    );
    set连线列表(updated);
  }, [选中连线ID, 编辑连线表单, 连线列表]);

  // ── Node move from canvas (source: ee() with 300ms debounce) ──
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleNodeMove = useCallback(
    (id: MapId, x: number, y: number) => {
      // Always update state (needed for canvas rendering)
      set地图列表(prev =>
        prev.map(m =>
          m.id === id
            ? { ...m, 地图内容: { ...(m.地图内容 || {}), x, y }, x, y }
            : m
        )
      );
      // Suppress PUT during AI generation (suppressMoveRef)
      if (suppressMoveRef.current) return;
      // Debounced save
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      moveTimerRef.current = setTimeout(() => {
        if (!projectId) return;
        fetch(`${API_BASE}/api/geo-maps/project/${projectId}/map/${id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ 地图内容: JSON.stringify({ x, y }) }),
        }).catch(() => {});
      }, 300);
    },
    [projectId, 地图列表]
  );

  const handleNodeAdd = useCallback(
    async (x: number, y: number) => {
      if (!projectId) return;
      const level = (当前地图?.地图等级 || -1) + 1;
      try {
        const r = await fetch(
          `${API_BASE}/api/geo-maps/project/${projectId}/map`,
          {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              地图名称: '新地点',
              地图描述: '',
              父地图ID: 当前地图ID,
              地图类型: 'landmark',
              地图等级: level,
            }),
          }
        );
        const res = await r.json();
        if (res.success && res.data?.id) {
          const newMap: 地图数据 = {
            id: res.data.id,
            地图名称: '新地点',
            地图描述: '',
            父地图ID: 当前地图ID,
            地图类型: 'landmark',
            地图等级: level,
            地图内容: { x, y },
            x,
            y,
          };
          set地图列表(prev => [...prev, newMap]);
          set选中节点ID(res.data.id);
        }
      } catch {}
    },
    [当前地图ID, 当前地图, projectId]
  );

  // ── Tree ──
  const toggleExpand = useCallback(
    (id: MapId) =>
      set展开状态(prev => ({
        ...prev,
        [String(id)]:
          prev[String(id)] === undefined ? false : !prev[String(id)],
      })),
    []
  );
  const expandAll = useCallback(
    () => set展开集合(new Set(地图列表.map(m => m.id))),
    [地图列表]
  );
  const set展开集合 = useCallback((ids: Set<MapId>) => {
    const s: Record<string, boolean> = {};
    ids.forEach(id => (s[String(id)] = true));
    set展开状态(s);
  }, []);

  const buildTreeItems = useCallback(
    (items: 地图数据[], level: number) => {
      return items.map(item => {
        const children = getChildren(item.id);
        const hasChildren = children.length > 0;
        const expanded = 展开状态[item.id] !== false;
        const isSelected = 选中节点ID === item.id;
        const color = (() => {
          if (item.地图内容?.颜色) return item.地图内容.颜色;
          const t = NODE_TYPE_OPTIONS.find(o => o.id === item.地图类型);
          if (t) return t.color;
          return LEVEL_COLORS[item.地图等级] || '#a0a0a0';
        })();
        const icon = item.地图类型
          ? getTypeById(item.地图类型).icon
          : inferTypeFromName(item.地图名称).icon;

        return (
          <div key={item.id}>
            <div
              className={`tree-item ${isSelected ? 'selected' : ''}`}
              style={{ paddingLeft: `${level * 16 + 8}px` }}
              onClick={() => set选中节点ID(item.id)}
            >
              <span
                className={`toggle-btn ${!hasChildren ? 'placeholder' : ''}`}
                onClick={e => {
                  e.stopPropagation();
                  toggleExpand(item.id);
                }}
              >
                {hasChildren ? (expanded ? '▼' : '▶') : ''}
              </span>
              <span className="color-dot" style={{ background: color }} />
              <div className="node-info">
                <span className="node-name">{item.地图名称 || '未命名'}</span>
                <i className={`${icon} node-type-icon`} />
              </div>
              {hasChildren && (
                <span className="child-count">{children.length}</span>
              )}
              <div className="node-actions">
                <button
                  className="btn-danger-sm"
                  onClick={e => {
                    e.stopPropagation();
                    handleDelete(item.id);
                  }}
                  title="删除"
                >
                  <i className="ri-delete-bin-line" />
                </button>
              </div>
            </div>
            {hasChildren && expanded && buildTreeItems(children, level + 1)}
          </div>
        );
      });
    },
    [getChildren, 展开状态, 选中节点ID, toggleExpand, handleDelete]
  );

  // ── Custom types ──
  const customTypes = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem(`ai_novelist_custom_node_types_${projectId}`) ||
          '[]'
      );
    } catch {
      return [];
    }
  }, [projectId]);
  const allTypes = useMemo(
    () => [...NODE_TYPE_OPTIONS, ...customTypes],
    [customTypes]
  );

  const handleAddCustomType = useCallback(() => {
    const name = 自定义类型名.trim();
    if (!name) return;
    const id = 'custom_' + Date.now();
    const newType = { id, label: name, icon: 自定义类型图标, color: '#9ca3af' };
    const types = [...customTypes, newType];
    localStorage.setItem(
      `ai_novelist_custom_node_types_${projectId}`,
      JSON.stringify(types)
    );
    if (编辑表单) set编辑表单(prev => (prev ? { ...prev, 类型: id } : null));
    set显示自定义类型(false);
    set自定义类型名('');
    set自定义类型图标('ri-map-pin-line');
  }, [自定义类型名, 自定义类型图标, customTypes, projectId, 编辑表单]);

  // ── AI Generation ──
  const openAIDialog = useCallback((mode: AIMode) => {
    setAiMode(mode);
    setAiPrompt('');
    setGenResult(null);
    setGenError('');
    setAiSelectedLocations([]);
    setShowAIDialog(true);
  }, []);

  const startGeneration = useCallback(async () => {
    if (aiGenerating) return;
    setAiGenerating(true);
    setGenError('');
    setGenResult(null);
    abortRef.current = new AbortController();
    try {
      const existingNames = getAllNames();
      const systemPromptOverride = await fetchSystemPrompt();
      if (aiMode === 'world') {
        const rootNames = 地图列表
          .filter(m => !m.父地图ID)
          .map(m => m.地图名称);
        const prompt = buildWorldMapPrompt(null, rootNames, existingNames);
        const userContent = aiPrompt || '请生成一个全新的世界级地图';
        const messages = [
          { role: 'system' as const, content: systemPromptOverride || prompt },
          { role: 'user' as const, content: userContent },
        ];
        const result = await generateValidated({
          schema: geoMapSchema,
          generate: attempt =>
            generateLLM({
              messages,
              temperature: Math.min(1.0, 0.85 + attempt * 0.05),
              max_tokens: 4096,
              onChunk: () => {},
              signal: abortRef.current!.signal,
            }),
          parseResponse: text => {
            const r = parseWorldMapResponse(text);
            return r.成功 ? r : null;
          },
          maxRetries: 3,
        });
        if (result) setGenResult({ mode: 'world', data: result.data });
        else setGenError('AI返回格式解析失败');
      } else if (aiMode === 'submap') {
        const parent = 选中节点ID
          ? 地图列表.find(m => m.id === 选中节点ID) || 当前地图
          : 当前地图;
        if (!parent) {
          setGenError('请先选择一个地图');
          setAiGenerating(false);
          return;
        }
        const childNames = 地图列表
          .filter(m => m.父地图ID === parent.id)
          .map(m => m.地图名称);
        const prompt = buildSubMapPrompt(
          null,
          parent,
          childNames,
          existingNames
        );
        const userContent =
          aiPrompt ||
          `请为"${parent.地图名称}"生成${getLevelType(parent.地图等级 + 1)}级子地图`;
        const messages = [
          { role: 'system' as const, content: systemPromptOverride || prompt },
          { role: 'user' as const, content: userContent },
        ];
        const result = await generateValidated({
          schema: geoMapSchema,
          generate: attempt =>
            generateLLM({
              messages,
              temperature: Math.min(1.0, 0.85 + attempt * 0.05),
              max_tokens: 4096,
              onChunk: () => {},
              signal: abortRef.current!.signal,
            }),
          parseResponse: text => {
            const r = parseSubMapResponse(text);
            return r.成功 ? r : null;
          },
          maxRetries: 3,
        });
        if (result)
          setGenResult({
            mode: 'submap',
            data: result.data,
            parentId: parent.id,
            parentLevel: parent.地图等级,
          });
        else setGenError('AI返回格式解析失败');
      } else {
        const parent = 选中节点ID
          ? 地图列表.find(m => m.id === 选中节点ID) || 当前地图
          : 当前地图;
        if (!parent) {
          setGenError('请先选择一个地图');
          setAiGenerating(false);
          return;
        }
        const locs = 地图列表.filter(m => m.父地图ID === parent.id);
        if (aiSelectedLocations.length < 2) {
          setGenError('请至少选择2个地点');
          setAiGenerating(false);
          return;
        }
        const selectedLocs = locs.filter(l =>
          aiSelectedLocations.includes(l.id)
        );
        const prompt = buildRoutePrompt(
          null,
          parent,
          selectedLocs,
          existingNames
        );
        const userContent =
          aiPrompt ||
          `请为${selectedLocs.map(l => l.地图名称).join('、')}之间生成连接路线`;
        const messages = [
          { role: 'system' as const, content: systemPromptOverride || prompt },
          { role: 'user' as const, content: userContent },
        ];
        const result = await generateValidated({
          schema: geoMapSchema,
          generate: attempt =>
            generateLLM({
              messages,
              temperature: Math.min(1.0, 0.85 + attempt * 0.05),
              max_tokens: 4096,
              onChunk: () => {},
              signal: abortRef.current!.signal,
            }),
          parseResponse: text => {
            const r = parseSubMapResponse(text);
            return r.成功 ? r : null;
          },
          maxRetries: 3,
        });
        if (result) {
          const routeData = result.data?.数据 as 子地图生成结果;
          if (!routeData?.路线列表?.length) setGenError('AI未生成任何路线');
          else
            setGenResult({
              mode: 'route',
              data: result.data,
              parentId: parent.id,
            });
        } else setGenError('AI返回格式解析失败');
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setAiGenerating(false);
    }
  }, [
    aiGenerating,
    aiMode,
    aiPrompt,
    aiSelectedLocations,
    选中节点ID,
    当前地图,
    地图列表,
    getAllNames,
    fetchSystemPrompt,
  ]);

  // Robust name → id lookup: exact → trimmed → includes
  const findIdByName = useCallback(
    (name: string, nameMap: Map<string, MapId>): MapId | undefined => {
      const trimmed = name.trim();
      if (!trimmed) return undefined;
      // Exact match
      if (nameMap.has(trimmed)) return nameMap.get(trimmed);
      // Trimmed key match (in case map keys have whitespace)
      for (const [k, v] of nameMap) {
        if (k.trim() === trimmed) return v;
      }
      // Substring match: route endpoint is contained in node name or vice versa
      for (const [k, v] of nameMap) {
        const kt = k.trim();
        if (
          kt.length > 1 &&
          trimmed.length > 1 &&
          (kt.includes(trimmed) || trimmed.includes(kt))
        )
          return v;
      }
      return undefined;
    },
    []
  );

  const adoptResult = useCallback(async () => {
    if (!genResult || !projectId) return;
    // Suppress handleNodeMove PUTs during AI generation
    suppressMoveRef.current = true;
    try {
      // Step 0: Fetch worldview data for generations POST (source: GET /api/geo-maps/project/{id}/worldview)
      let 世界观信息: Record<string, string> | null = null;
      try {
        const wvRes = await fetch(
          `${API_BASE}/api/geo-maps/project/${projectId}/worldview`,
          {
            headers: getAuthHeaders(),
          }
        );
        const wvData = await wvRes.json();
        if (wvData.success && wvData.data) {
          const fields: Record<string, string> = {};
          for (const [k, v] of Object.entries(wvData.data)) {
            if (typeof v === 'string') fields[k] = v;
          }
          世界观信息 = fields;
        }
      } catch {}

      // Step 1: POST generations — save generation record (BEFORE creating maps)
      let generationId: number | null = null;
      try {
        const gr = await fetch(
          `${API_BASE}/api/geo-maps/project/${projectId}/generations`,
          {
            method: 'POST',
            headers: {
              ...getAuthHeaders(),
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              提示词: aiPrompt || '',
              世界观信息: 世界观信息 || {},
              生成内容: genResult.data?.数据 || {},
              生成类型: 'hierarchy',
              地图ID: genResult.parentId || null,
            }),
          }
        );
        const gRes = await gr.json();
        if (gRes.success && gRes.data?.id) generationId = gRes.data.id;
      } catch {}

      // Step 2: POST maps — create each node sequentially
      const postNode = async (
        name: string,
        desc: string,
        parentId: number | null,
        type: string,
        level: number
      ): Promise<number | null> => {
        try {
          const r = await fetch(
            `${API_BASE}/api/geo-maps/project/${projectId}/map`,
            {
              method: 'POST',
              headers: {
                ...getAuthHeaders(),
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                地图名称: name,
                地图描述: desc,
                父地图ID: parentId,
                地图类型: type,
                地图等级: level,
              }),
            }
          );
          const res = await r.json();
          return res.success && res.data?.id ? res.data.id : null;
        } catch {
          return null;
        }
      };

      let newRootId: number | null = null;
      let firstContinentId: number | null = null;
      let firstRegionId: number | null = null;
      const newNodes: 地图数据[] = [];
      const newConnections: 连线数据[] = [];
      const nameToId = new Map<string, number>();

      if (genResult.mode === 'world' && genResult.data?.数据) {
        const world = genResult.data.数据 as 世界地图生成结果;
        const worldId = await postNode(
          world.地图名称,
          world.地图描述,
          null,
          '世界',
          0
        );
        if (!worldId) return;
        newRootId = worldId;
        nameToId.set(world.地图名称.trim(), worldId);
        newNodes.push({
          id: worldId,
          地图名称: world.地图名称,
          地图描述: world.地图描述,
          父地图ID: null,
          地图类型: '世界',
          地图等级: 0,
        });

        for (const cont of world.大陆列表 || []) {
          const cid = await postNode(
            cont.地图名称,
            cont.地图描述,
            worldId,
            '大陆',
            1
          );
          if (!cid) continue;
          if (!firstContinentId) firstContinentId = cid;
          nameToId.set(cont.地图名称.trim(), cid);
          newNodes.push({
            id: cid,
            地图名称: cont.地图名称,
            地图描述: cont.地图描述,
            父地图ID: worldId,
            地图类型: '大陆',
            地图等级: 1,
          });

          for (const reg of cont.区域列表 || []) {
            const rid = await postNode(
              reg.地图名称,
              reg.地图描述,
              cid,
              '区域',
              2
            );
            if (!rid) continue;
            if (!firstRegionId) firstRegionId = rid;
            nameToId.set(reg.地图名称.trim(), rid);
            newNodes.push({
              id: rid,
              地图名称: reg.地图名称,
              地图描述: reg.地图描述,
              父地图ID: cid,
              地图类型: '区域',
              地图等级: 2,
            });

            for (const city of reg.城市列表 || []) {
              const ctid = await postNode(
                city.地图名称,
                city.地图描述,
                rid,
                '城市',
                3
              );
              if (!ctid) continue;
              nameToId.set(city.地图名称.trim(), ctid);
              newNodes.push({
                id: ctid,
                地图名称: city.地图名称,
                地图描述: city.地图描述,
                父地图ID: rid,
                地图类型: '城市',
                地图等级: 3,
              });

              for (const loc of city.地点列表 || []) {
                const lid = await postNode(
                  loc.地图名称,
                  loc.地图描述,
                  ctid,
                  '地点',
                  4
                );
                if (!lid) continue;
                nameToId.set(loc.地图名称.trim(), lid);
                newNodes.push({
                  id: lid,
                  地图名称: loc.地图名称,
                  地图描述: loc.地图描述,
                  父地图ID: ctid,
                  地图类型: '地点',
                  地图等级: 4,
                });
              }
            }
          }
        }
        // Routes: real website uses first REGION ID as parent (source: 父地图ID=区域级)
        const routeParentId = firstRegionId || firstContinentId || worldId;
        for (const route of world.路线列表 || []) {
          const routeDesc = `${route.描述 || ''}\n起点：${route.起点}\n终点：${route.终点}`;
          const rid = await postNode(
            route.名称,
            routeDesc,
            routeParentId,
            '路线',
            5
          );
          if (!rid) continue;
          newNodes.push({
            id: rid,
            地图名称: route.名称,
            地图描述: routeDesc,
            父地图ID: routeParentId,
            地图类型: '路线',
            地图等级: 5,
          });
          const fromId = findIdByName(route.起点, nameToId);
          const toId = findIdByName(route.终点, nameToId);
          if (fromId && toId) {
            newConnections.push({
              id: `${fromId}-${toId}`,
              起点ID: fromId,
              终点ID: toId,
              连线类型: 'road',
              连线标签: route.名称,
            });
          }
        }
      } else if (genResult.mode === 'submap' && genResult.data?.数据) {
        const subData = genResult.data.数据 as 子地图生成结果;
        const newSubIds = new Map<string, number>();
        for (const sub of subData.子地图列表 || []) {
          const sid = await postNode(
            sub.地图名称,
            sub.地图描述 || '',
            genResult.parentId,
            sub.地图类型 === '子地图' ? '地点' : sub.地图类型,
            genResult.parentLevel + 1
          );
          if (!sid) continue;
          newSubIds.set(sub.地图名称.trim(), sid);
          newNodes.push({
            id: sid,
            地图名称: sub.地图名称,
            地图描述: sub.地图描述 || '',
            父地图ID: genResult.parentId,
            地图类型: sub.地图类型 === '子地图' ? '地点' : sub.地图类型,
            地图等级: genResult.parentLevel + 1,
          });
        }
        const existingSiblings = new Map<string, number>();
        地图列表
          .filter(m => m.父地图ID === genResult.parentId)
          .forEach(m =>
            existingSiblings.set(m.地图名称.trim(), m.id as number)
          );
        newSubIds.forEach((v, k) => existingSiblings.set(k, v));
        for (const route of subData.路线列表 || []) {
          const routeDesc = `${route.地图描述 || ''}\n起点：${route.起点}\n终点：${route.终点}`;
          const rid = await postNode(
            route.地图名称,
            routeDesc,
            genResult.parentId,
            '路线',
            genResult.parentLevel + 1
          );
          if (!rid) continue;
          newNodes.push({
            id: rid,
            地图名称: route.地图名称,
            地图描述: routeDesc,
            父地图ID: genResult.parentId,
            地图类型: '路线',
            地图等级: genResult.parentLevel + 1,
          });
          const fromId = findIdByName(route.起点, existingSiblings);
          const toId = findIdByName(route.终点, existingSiblings);
          if (fromId && toId) {
            newConnections.push({
              id: `${fromId}-${toId}`,
              起点ID: fromId,
              终点ID: toId,
              连线类型: 'road',
              连线标签: route.地图名称,
            });
          }
        }
      } else if (genResult.mode === 'route' && genResult.data?.数据) {
        const routeData = genResult.data.数据 as 子地图生成结果;
        const existingIds = new Map<string, number>();
        地图列表.forEach(m =>
          existingIds.set(m.地图名称.trim(), m.id as number)
        );
        for (const route of routeData.路线列表 || []) {
          const routeDesc = `${route.地图描述 || ''}\n起点：${route.起点}\n终点：${route.终点}`;
          const rid = await postNode(
            route.地图名称,
            routeDesc,
            genResult.parentId,
            '路线',
            5
          );
          if (!rid) continue;
          newNodes.push({
            id: rid,
            地图名称: route.地图名称,
            地图描述: routeDesc,
            父地图ID: genResult.parentId,
            地图类型: '路线',
            地图等级: 5,
          });
          const fromId = findIdByName(route.起点, existingIds);
          const toId = findIdByName(route.终点, existingIds);
          if (fromId && toId) {
            newConnections.push({
              id: `${fromId}-${toId}`,
              起点ID: fromId,
              终点ID: toId,
              连线类型: 'road',
              连线标签: route.地图名称,
            });
          }
        }
      }

      // Update state
      if (newNodes.length > 0) set地图列表(prev => [...prev, ...newNodes]);
      if (newConnections.length > 0)
        set连线列表(prev => [...prev, ...newConnections]);
      if (newRootId) set当前地图ID(newRootId);

      // Step 2.5: PUT adopt — only for submap/route modes
      if (generationId && genResult.mode !== 'world') {
        try {
          await fetch(
            `${API_BASE}/api/geo-maps/project/${projectId}/generations/${generationId}/adopt`,
            {
              method: 'PUT',
              headers: getAuthHeaders(),
            }
          );
        } catch {}
      }

      // Step 3: PUT last node's position (after canvas layout)
      const lastNodeId = newNodes[newNodes.length - 1]?.id;
      setTimeout(() => {
        canvasRef.current?.适配全景();
        setTimeout(async () => {
          if (lastNodeId && projectId) {
            set地图列表(prev => {
              const node = prev.find(m => m.id === lastNodeId);
              if (node?.x != null && node?.y != null) {
                fetch(
                  `${API_BASE}/api/geo-maps/project/${projectId}/map/${lastNodeId}`,
                  {
                    method: 'PUT',
                    headers: {
                      ...getAuthHeaders(),
                      'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                      地图内容: JSON.stringify({ x: node.x, y: node.y }),
                    }),
                  }
                ).catch(() => {});
              }
              return prev;
            });
          }
          // Re-enable handleNodeMove PUT after all done
          suppressMoveRef.current = false;
        }, 500);
      }, 200);

      setShowAIDialog(false);
      setGenResult(null);
    } catch (e) {
      console.error('adoptResult error:', e);
      suppressMoveRef.current = false;
    }
  }, [genResult, 地图列表, projectId, findIdByName, aiPrompt]);

  // ── Layout mode ──
  const setLayoutModeAndSave = useCallback(
    (mode: '层级' | '网络') => {
      setLayoutMode(mode);
      try {
        localStorage.setItem(
          `ai_novelist_geomap_layout_mode_${projectId || '默认'}`,
          mode
        );
      } catch {}
      canvasRef.current?.设置布局模式(mode);
      canvasRef.current?.重新布局(mode);
    },
    [projectId]
  );

  // ── Node name helper ──
  const getNodeName = useCallback(
    (id: MapId) => 地图列表.find(m => m.id === id)?.地图名称 || '未知',
    [地图列表]
  );

  return (
    <div className="v-12b31b06">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="地图三栏容器 flex h-full"
          style={{ width: effectiveWidth }}
        >
          {/* Left sidebar */}
          <aside
            className="地图左侧栏"
            style={{ width: 左侧栏宽度, minWidth: 左侧栏宽度 }}
          >
            <div className="侧栏头部">
              <div className="logo">
                <span className="icon">📜</span> 故事地图
              </div>
              <div className="subtitle">NOVEL WORLD MAPPER · 层级版</div>
            </div>
            <div className="地图选择器">
              <div className="flex items-center justify-between mb-1.5">
                <span className="section-label">🗂️ 世界地图</span>
                <button
                  className="btn-sm-accent"
                  onClick={() => handleAdd(null)}
                  title="新建世界地图"
                >
                  <i className="ri-add-line" />
                </button>
              </div>
              <select
                className="地图下拉"
                value={当前地图ID || ''}
                onChange={e => {
                  set当前地图ID(Number(e.target.value));
                }}
              >
                {根地图列表.map(r => (
                  <option key={r.id} value={r.id}>
                    【世界】{r.地图名称 || '未命名'}
                  </option>
                ))}
              </select>
            </div>
            <div className="树形区域">
              <div className="树形列表">
                {当前地图ID &&
                  (() => {
                    const root = 地图列表.find(m => m.id === 当前地图ID);
                    if (!root) return null;
                    return buildTreeItems([root], 0);
                  })()}
              </div>
              {地图列表.length === 0 && (
                <div className="空状态提示">
                  <span className="big-icon">🗺️</span>
                  <span>暂无地图数据</span>
                </div>
              )}
            </div>
            <div className="侧栏底部按钮">
              <div className="布局模式行">
                <span className="模式标签">🎯 布局模式</span>
                <div className="模式按钮组">
                  <button
                    className={`模式按钮 ${layoutMode === '层级' ? 'active' : ''}`}
                    onClick={() => setLayoutModeAndSave('层级')}
                    title="层级模式"
                  >
                    <i className="ri-organization-chart" /> 层级
                  </button>
                  <button
                    className={`模式按钮 ${layoutMode === '网络' ? 'active' : ''}`}
                    onClick={() => setLayoutModeAndSave('网络')}
                    title="网络模式"
                  >
                    <i className="ri-share-line" /> 网络
                  </button>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => handleAdd(当前地图ID)}
              >
                <i className="ri-add-circle-line" /> 添加新地点
              </button>
              <button
                className="btn btn-outline"
                onClick={() => canvasRef.current?.适配全景()}
              >
                <i className="ri-eye-line" /> 显示全部
              </button>
              <button
                className="btn btn-outline"
                onClick={() => canvasRef.current?.重新布局(layoutMode)}
              >
                <i className="ri-layout-grid-line" /> 重新布局（{layoutMode}）
              </button>
              <button
                className="btn btn-outline btn-danger"
                onClick={() => {
                  if (confirm('确定要清空所有世界地图数据？此操作不可恢复。'))
                    set地图列表([]);
                }}
              >
                <i className="ri-delete-bin-line" /> 清空数据
              </button>
              <span className="操作提示">
                拖拽节点移动 · 滚轮缩放 · 锚点连线 · 右键设父子
              </span>
            </div>
          </aside>

          {/* Left sidebar drag handle */}
          <div className="左侧栏拖拽手柄" />

          {/* Middle canvas */}
          <div className="画布中央区域">
            <GeoMapCanvas
              ref={canvasRef}
              节点列表={画布节点列表}
              连线列表={连线列表.filter(
                c =>
                  画布节点列表.some(n => n.id === c.起点ID) &&
                  画布节点列表.some(n => n.id === c.终点ID)
              )}
              规划路线连线列表={[]}
              已经历路线连线列表={[]}
              选中节点ID={选中节点ID}
              选中连线ID={选中连线ID}
              on节点移动={handleNodeMove}
              on节点添加={handleNodeAdd}
              on节点删除={handleDelete}
              on连线创建={(from, to) => {
                const id = `${from}-${to}`;
                set连线列表(prev => [
                  ...prev,
                  {
                    id,
                    起点ID: from,
                    终点ID: to,
                    连线类型: 'road',
                    连线标签: '',
                  },
                ]);
              }}
              on连线删除={id =>
                set连线列表(prev => prev.filter(c => c.id !== id))
              }
              on父节点变更={(id, pid) =>
                set地图列表(prev =>
                  prev.map(m => (m.id === id ? { ...m, 父地图ID: pid } : m))
                )
              }
              on选中节点ID变更={set选中节点ID}
              on选中连线ID变更={set选中连线ID}
            />
            {右侧面板折叠 && (
              <div className="画布悬浮工具条">
                <button
                  className="悬浮按钮"
                  onClick={() => setShowHistory(v => !v)}
                  title="生成历史"
                >
                  <i className="ri-time-line" />
                  {genHistory.length > 0 && (
                    <span className="悬浮按钮徽章">{genHistory.length}</span>
                  )}
                </button>
                <button
                  className="悬浮按钮 ai"
                  onClick={() => openAIDialog('submap')}
                  disabled={aiGenerating}
                  title="AI生成"
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
                  className={`悬浮按钮 ${面板最大化 ? 'active' : ''}`}
                  onClick={() => set面板最大化(v => !v)}
                  title={面板最大化 ? '恢复面板尺寸' : '最大化面板'}
                >
                  <i
                    className={
                      面板最大化
                        ? 'ri-fullscreen-exit-line'
                        : 'ri-fullscreen-line'
                    }
                  />
                </button>
                <button
                  className="悬浮按钮 active"
                  onClick={() => set右侧面板折叠(v => !v)}
                  title="展开属性面板"
                >
                  <i className="ri-layout-right-line" />
                </button>
                <button
                  className="悬浮按钮 close"
                  onClick={onClose}
                  title="关闭"
                >
                  <i className="ri-close-line" />
                </button>
              </div>
            )}
          </div>

          {/* Right panel */}
          <aside className={`地图右侧面板 ${右侧面板折叠 ? '面板折叠' : ''}`}>
            <div className="面板头部">
              <h3>📍 属性面板</h3>
              <div className="flex items-center gap-1">
                <button
                  className="btn-icon ai"
                  onClick={() => openAIDialog('submap')}
                  disabled={aiGenerating}
                  title="AI生成"
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
                  className={`btn-icon ${面板最大化 ? 'active' : ''}`}
                  onClick={() => set面板最大化(v => !v)}
                  title={面板最大化 ? '恢复' : '最大化'}
                >
                  <i
                    className={
                      面板最大化
                        ? 'ri-fullscreen-exit-line'
                        : 'ri-fullscreen-line'
                    }
                  />
                </button>
                <button
                  className={`btn-icon ${右侧面板折叠 ? 'active' : ''}`}
                  onClick={() => set右侧面板折叠(v => !v)}
                  title={右侧面板折叠 ? '展开' : '收缩'}
                >
                  <i
                    className={
                      右侧面板折叠
                        ? 'ri-arrow-down-s-line'
                        : 'ri-arrow-up-s-line'
                    }
                  />
                </button>
                <button
                  className="btn-icon close"
                  onClick={onClose}
                  title="关闭"
                >
                  <i className="ri-close-line" />
                </button>
              </div>
            </div>
            <div className="面板内容">
              {!选中节点ID && !选中连线ID ? (
                <div className="panel-empty">
                  <span className="big-icon">🗺️</span>
                  <span>点击节点或连线查看详情</span>
                </div>
              ) : 选中节点ID && 编辑表单 ? (
                <>
                  <div className="form-group">
                    <label>名称</label>
                    <input
                      type="text"
                      value={编辑表单.名称}
                      onChange={e =>
                        set编辑表单(prev =>
                          prev ? { ...prev, 名称: e.target.value } : null
                        )
                      }
                      placeholder="地点名称"
                    />
                  </div>
                  <div className="form-group">
                    <label>类型</label>
                    <div
                      className="类型选择器"
                      onClick={e => e.stopPropagation()}
                    >
                      <div
                        className="类型选中项"
                        onClick={() => set显示类型选择器(v => !v)}
                      >
                        <i
                          className={`${getTypeById(编辑表单.类型).icon} 类型图标`}
                        />
                        <span>{getTypeById(编辑表单.类型).label}</span>
                        <i className="ri-arrow-down-s-line" />
                      </div>
                      {显示类型选择器 && (
                        <div className="类型下拉列表">
                          {allTypes.map(t => (
                            <div
                              key={t.id}
                              className={`类型选项 ${编辑表单.类型 === t.id ? 'active' : ''}`}
                              onClick={() => {
                                set编辑表单(prev =>
                                  prev ? { ...prev, 类型: t.id } : null
                                );
                                set显示类型选择器(false);
                              }}
                            >
                              <i className={`${t.icon} 类型图标`} />
                              <span>{t.label}</span>
                            </div>
                          ))}
                          <div
                            className="类型选项 自定义入口"
                            onClick={() => {
                              set显示自定义类型(true);
                              set显示类型选择器(false);
                            }}
                          >
                            <i className="ri-add-circle-line 类型图标" />
                            <span>自定义类型...</span>
                          </div>
                        </div>
                      )}
                      {显示自定义类型 && (
                        <div className="自定义类型区域">
                          <input
                            className="form-input"
                            value={自定义类型名}
                            onChange={e => set自定义类型名(e.target.value)}
                            placeholder="输入类型名称"
                          />
                          <div className="自定义图标选择">
                            <span className="选择提示">选择图标:</span>
                            <div className="图标网格">
                              {ICON_OPTIONS.map(icon => (
                                <i
                                  key={icon}
                                  className={`图标选项 ${自定义类型图标 === icon ? 'selected' : ''} ${icon}`}
                                  onClick={() => set自定义类型图标(icon)}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="自定义类型操作">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={handleAddCustomType}
                            >
                              <i className="ri-check-line" /> 确认
                            </button>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => set显示自定义类型(false)}
                            >
                              <i className="ri-close-line" /> 取消
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>颜色</label>
                    <input
                      type="color"
                      value={编辑表单.颜色}
                      onChange={e =>
                        set编辑表单(prev =>
                          prev ? { ...prev, 颜色: e.target.value } : null
                        )
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>父地点</label>
                    <select
                      value={编辑表单.父地图ID ?? ''}
                      onChange={e =>
                        set编辑表单(prev =>
                          prev
                            ? {
                                ...prev,
                                父地图ID: e.target.value
                                  ? Number(e.target.value)
                                  : null,
                              }
                            : null
                        )
                      }
                    >
                      <option value={undefined as any}>无 (顶级)</option>
                      {可选父级.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.地图名称}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>描述</label>
                    <textarea
                      rows={3}
                      value={编辑表单.描述 ?? ''}
                      onChange={e =>
                        set编辑表单(prev =>
                          prev ? { ...prev, 描述: e.target.value } : null
                        )
                      }
                      placeholder="地点描述..."
                    />
                  </div>
                  <button className="btn btn-primary" onClick={handleSave}>
                    <i className="ri-save-line" /> 保存修改
                  </button>
                  <div className="关联连线区">
                    <span className="section-label">🔗 关联连线</span>
                    {节点连线.length > 0 ? (
                      <div className="连线列表">
                        {节点连线.map(c => (
                          <div key={c.id} className="connection-item">
                            <span
                              className="conn-line-preview"
                              style={{
                                background:
                                  c.连线颜色 ||
                                  CONNECTION_TYPES.find(
                                    t => t.id === c.连线类型
                                  )?.color ||
                                  '#8b7355',
                              }}
                            />
                            <span className="flex-1 truncate">
                              {getNodeName(c.起点ID)} → {getNodeName(c.终点ID)}
                            </span>
                            <input
                              type="color"
                              className="连线颜色选择器"
                              value={c.连线颜色 || '#8b7355'}
                              onChange={e =>
                                set连线列表(prev =>
                                  prev.map(x =>
                                    x.id === c.id
                                      ? { ...x, 连线颜色: e.target.value }
                                      : x
                                  )
                                )
                              }
                              title="连线颜色"
                            />
                            <button
                              className="btn-danger-sm"
                              onClick={() =>
                                set连线列表(prev =>
                                  prev.filter(x => x.id !== c.id)
                                )
                              }
                            >
                              <i className="ri-close-line" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="无数据提示">暂无连线</span>
                    )}
                  </div>
                  <button
                    className="btn btn-outline btn-primary"
                    onClick={() => handleAdd(选中节点ID)}
                  >
                    <i className="ri-add-line" /> 添加子节点
                  </button>
                  {getChildren(选中节点ID).length > 0 && (
                    <button
                      className="btn btn-outline btn-primary"
                      onClick={() =>
                        canvasRef.current?.重新布局子树(选中节点ID)
                      }
                    >
                      <i className="ri-refresh-line" /> 重新布局子树
                    </button>
                  )}
                  <button
                    className="btn btn-outline btn-danger"
                    onClick={() => handleDelete(选中节点ID)}
                  >
                    <i className="ri-delete-bin-line" /> 删除此节点
                  </button>
                </>
              ) : 选中连线ID && 编辑连线表单 ? (
                <>
                  <div className="连线端点显示">
                    {getNodeName(
                      连线列表.find(c => c.id === 选中连线ID)?.起点ID || ''
                    )}{' '}
                    →{' '}
                    {getNodeName(
                      连线列表.find(c => c.id === 选中连线ID)?.终点ID || ''
                    )}
                  </div>
                  <div className="form-group">
                    <label>标签</label>
                    <input
                      type="text"
                      value={编辑连线表单.连线标签}
                      onChange={e =>
                        set编辑连线表单(prev =>
                          prev ? { ...prev, 连线标签: e.target.value } : null
                        )
                      }
                      placeholder="连线标签"
                    />
                  </div>
                  <div className="form-group">
                    <label>类型</label>
                    <select
                      value={编辑连线表单.连线类型}
                      onChange={e =>
                        set编辑连线表单(prev =>
                          prev ? { ...prev, 连线类型: e.target.value } : null
                        )
                      }
                    >
                      {CONNECTION_TYPES.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveConnection}
                  >
                    <i className="ri-save-line" /> 保存
                  </button>
                  <button
                    className="btn btn-outline btn-danger"
                    onClick={() => {
                      set连线列表(prev =>
                        prev.filter(c => c.id !== 选中连线ID)
                      );
                      set选中连线ID(null);
                    }}
                  >
                    <i className="ri-delete-bin-line" /> 删除连线
                  </button>
                </>
              ) : null}
              {(选中节点ID || 选中连线ID) && (
                <div className="AI入口区域">
                  <button
                    className="btn btn-primary ai-btn"
                    onClick={() => openAIDialog('submap')}
                    disabled={aiGenerating}
                  >
                    <i
                      className={
                        aiGenerating
                          ? 'ri-loader-4-line animate-spin'
                          : 'ri-magic-line'
                      }
                    />{' '}
                    AI 生成地图
                  </button>
                </div>
              )}
            </div>
            <div className="面板底部">
              <span>
                <i className="ri-save-line" /> 已自动保存
              </span>
            </div>
          </aside>
        </div>

        {/* Panel resize handle */}
        <div className="w-2 cursor-col-resize hover:bg-[var(--primary)]/50 active:bg-[var(--primary)] transition-colors shrink-0 relative z-10 bg-transparent" />
        {/* Backdrop */}
        <div
          className="fixed top-0 bottom-0 right-0 bg-black/0 hover:bg-black/5 transition-colors z-[1]"
          style={{ left: (leftOffset || 288) + effectiveWidth + 2 }}
          onClick={onClose}
        />
      </div>

      {/* AI Dialog */}
      {showAIDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={e => {
            if (e.target === e.currentTarget) setShowAIDialog(false);
          }}
        >
          <div className="bg-[var(--bg-card)] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h3 className="font-semibold flex items-center gap-2">
                <i
                  className={
                    aiMode === 'world'
                      ? 'ri-earth-line text-green-400'
                      : aiMode === 'route'
                        ? 'ri-route-line text-orange-400'
                        : 'ri-node-tree text-blue-400'
                  }
                />{' '}
                {aiMode === 'world'
                  ? 'AI生成世界地图'
                  : aiMode === 'route'
                    ? 'AI生成路线'
                    : 'AI生成子地图'}
              </h3>
              <button
                className="p-1 hover:bg-[var(--border)] rounded transition-colors cursor-pointer"
                onClick={() => setShowAIDialog(false)}
                disabled={aiGenerating}
              >
                <i className="ri-close-line" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="mb-4">
                <label className="text-sm text-[var(--text-secondary)] mb-2 block">
                  生成模式
                </label>
                <div className="flex gap-2">
                  <button
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all cursor-pointer ${aiMode === 'submap' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-[var(--bg-dark)] border-[var(--border)] text-[var(--text-secondary)] hover:border-blue-400'}`}
                    disabled={aiGenerating}
                    onClick={() => setAiMode('submap')}
                  >
                    <i className="ri-node-tree mr-1" /> 添加子地图
                  </button>
                  <button
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all cursor-pointer ${aiMode === 'route' ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-[var(--bg-dark)] border-[var(--border)] text-[var(--text-secondary)] hover:border-orange-400'}`}
                    disabled={aiGenerating}
                    onClick={() => setAiMode('route')}
                  >
                    <i className="ri-route-line mr-1" /> 生成路线
                  </button>
                  <button
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all cursor-pointer ${aiMode === 'world' ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-[var(--bg-dark)] border-[var(--border)] text-[var(--text-secondary)] hover:border-green-400'}`}
                    disabled={aiGenerating}
                    onClick={() => setAiMode('world')}
                  >
                    <i className="ri-earth-line mr-1" /> 新建世界地图
                  </button>
                </div>
              </div>
              {aiMode === 'submap' &&
                (() => {
                  const targetParent = 选中节点ID
                    ? 地图列表.find(m => m.id === 选中节点ID) || 当前地图
                    : 当前地图;
                  return targetParent ? (
                    <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <div className="flex items-start gap-2 text-sm text-blue-300">
                        <i className="ri-information-line mt-0.5" />
                        <div>
                          <p className="font-medium">添加子地图模式</p>
                          <p className="text-xs mt-1 text-blue-200/70">
                            AI将在「{targetParent.地图名称}」下生成
                            {getLevelType(targetParent.地图等级 + 1)}级子地图
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}
              {aiMode === 'world' && (
                <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex items-start gap-2 text-sm text-green-300">
                    <i className="ri-earth-line mt-0.5" />
                    <div>
                      <p className="font-medium">新建世界地图模式</p>
                      <p className="text-xs mt-1 text-green-200/70">
                        AI将生成一个全新的世界级地图
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {aiMode === 'route' && (
                <div className="mb-4">
                  <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg mb-3">
                    <div className="flex items-start gap-2 text-sm text-orange-300">
                      <i className="ri-route-line mt-0.5" />
                      <div>
                        <p className="font-medium">生成路线模式</p>
                        <p className="text-xs mt-1 text-orange-200/70">
                          {(() => {
                            const p = 选中节点ID
                              ? 地图列表.find(m => m.id === 选中节点ID) ||
                                当前地图
                              : 当前地图;
                            return p
                              ? `选择「${p.地图名称}」下的地点`
                              : '请先在左侧选择一个地图';
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                  {子地点列表.length > 0 ? (
                    <div>
                      <label className="text-sm text-[var(--text-secondary)] mb-2 block">
                        <i className="ri-map-pin-line mr-1 text-orange-400" />{' '}
                        选择地点（至少2个）{' '}
                        <span className="text-xs ml-2 text-orange-400">
                          已选 {aiSelectedLocations.length} 个
                        </span>
                      </label>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {子地点列表.map(loc => (
                          <label
                            key={loc.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[var(--bg-card)] cursor-pointer transition-colors ${aiSelectedLocations.includes(loc.id) ? 'bg-orange-500/10' : ''}`}
                          >
                            <input
                              type="checkbox"
                              className="accent-orange-500"
                              checked={aiSelectedLocations.includes(loc.id)}
                              onChange={() =>
                                setAiSelectedLocations(prev =>
                                  prev.includes(loc.id)
                                    ? prev.filter(id => id !== loc.id)
                                    : [...prev, loc.id]
                                )
                              }
                            />
                            <span className="text-sm truncate">
                              {loc.地图名称}
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-1">
                        <button
                          className="text-xs text-orange-400 hover:text-orange-300 cursor-pointer"
                          onClick={() =>
                            setAiSelectedLocations(子地点列表.map(l => l.id))
                          }
                        >
                          全选
                        </button>
                        <button
                          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                          onClick={() => setAiSelectedLocations([])}
                        >
                          清空
                        </button>
                      </div>
                    </div>
                  ) : 选中节点ID || 当前地图ID ? (
                    <p className="text-xs text-yellow-300">
                      <i className="ri-alert-line mr-1" /> 当前地图下没有子地点
                    </p>
                  ) : null}
                </div>
              )}
              <div className="mb-4">
                <label className="text-sm text-[var(--text-secondary)] mb-2 block">
                  生成提示词（可选）
                </label>
                <textarea
                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:border-[var(--primary)] transition-colors"
                  placeholder={
                    aiMode === 'world'
                      ? '描述你想要的世界...'
                      : aiMode === 'route'
                        ? '描述你想要的路线特点...'
                        : '描述你想要的子地图特点...'
                  }
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  disabled={aiGenerating}
                />
              </div>
              {genError && (
                <p className="text-sm text-red-400 mb-2">{genError}</p>
              )}
              {genResult &&
                genResult.data?.数据 &&
                (() => {
                  const d = genResult.data.数据;
                  const isWorld = genResult.mode === 'world';
                  const isRoute = genResult.mode === 'route';
                  const subCount = isWorld
                    ? (d.大陆列表?.length || 0) +
                      (d.大陆列表?.reduce?.(
                        (s: number, c: any) => s + (c.区域列表?.length || 0),
                        0
                      ) || 0) +
                      (d.大陆列表?.reduce?.(
                        (s: number, c: any) =>
                          s +
                          (c.区域列表?.reduce?.(
                            (s2: number, r: any) =>
                              s2 + (r.城市列表?.length || 0),
                            0
                          ) || 0),
                        0
                      ) || 0)
                    : d.子地图列表?.length || 0;
                  const routeCount = isWorld
                    ? d.路线列表?.length || 0
                    : d.路线列表?.length || 0;
                  const totalCount = isWorld
                    ? 1 +
                      (d.大陆列表 || []).reduce(
                        (s: number, c: any) =>
                          s +
                          1 +
                          (c.区域列表 || []).reduce(
                            (s2: number, r: any) =>
                              s2 +
                              1 +
                              (r.城市列表 || []).reduce(
                                (s3: number, ct: any) =>
                                  s3 + 1 + (ct.地点列表 || []).length,
                                0
                              ),
                            0
                          ),
                        0
                      ) +
                      (d.路线列表?.length || 0)
                    : subCount + routeCount;
                  const adoptLabel = isWorld
                    ? `创建完整世界 (${totalCount}个地图)`
                    : isRoute
                      ? `创建 ${routeCount} 条路线`
                      : `创建 ${subCount} 个${genResult.parentLevel !== undefined ? ['', '大陆', '区域', '城市', '地点', ''][genResult.parentLevel + 1] || '子地图' : '子地图'}`;
                  return (
                    <>
                      {isWorld && d.地图名称 && (
                        <div className="p-3 mb-4 border rounded-lg bg-green-500/10 border-green-500/30">
                          <div className="flex items-start gap-2 text-sm font-medium text-green-400">
                            <i className="ri-check-circle-line mt-0.5" />
                            <p>
                              生成完成！世界地图「{d.地图名称}」（共{totalCount}
                              个地图：{(d.大陆列表 || []).length}大陆 /{' '}
                              {(d.大陆列表 || []).reduce(
                                (s: number, c: any) =>
                                  s + (c.区域列表?.length || 0),
                                0
                              )}
                              区域 /{' '}
                              {(d.大陆列表 || []).reduce(
                                (s: number, c: any) =>
                                  s +
                                  (c.区域列表 || []).reduce(
                                    (s2: number, r: any) =>
                                      s2 + (r.城市列表?.length || 0),
                                    0
                                  ),
                                0
                              )}
                              城市 /{' '}
                              {(d.大陆列表 || []).reduce(
                                (s: number, c: any) =>
                                  s +
                                  (c.区域列表 || []).reduce(
                                    (s2: number, r: any) =>
                                      s2 +
                                      (r.城市列表 || []).reduce(
                                        (s3: number, ct: any) =>
                                          s3 + (ct.地点列表?.length || 0),
                                        0
                                      ),
                                    0
                                  ),
                                0
                              )}
                              地点 / {(d.路线列表 || []).length}路线）
                            </p>
                          </div>
                        </div>
                      )}
                      {genResult.mode === 'submap' && (
                        <div className="p-3 mb-4 border rounded-lg bg-green-500/10 border-green-500/30">
                          <div className="flex items-start gap-2 text-sm font-medium text-green-400">
                            <i className="ri-check-circle-line mt-0.5" />
                            <p>
                              生成完成！共 {(d.子地图列表 || []).length}{' '}
                              个子地图、{(d.路线列表 || []).length} 条路线
                            </p>
                          </div>
                        </div>
                      )}
                      {isRoute && (
                        <div className="p-3 mb-4 border rounded-lg bg-green-500/10 border-green-500/30">
                          <div className="flex items-start gap-2 text-sm font-medium text-green-400">
                            <i className="ri-check-circle-line mt-0.5" />
                            <p>
                              生成完成！共 {(d.路线列表 || []).length} 条路线
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="flex items-center gap-2 text-sm font-medium">
                            <i className="ri-eye-line text-[var(--primary)]" />{' '}
                            生成结果预览
                          </h4>
                        </div>
                        <div className="bg-[var(--bg-dark)] rounded-lg p-3 space-y-2">
                          {isWorld &&
                            d.大陆列表?.map((c: any, i: number) => (
                              <div key={i} className="text-xs">
                                <span className="text-blue-400">大陆: </span>
                                <span className="px-1.5 py-0.5 bg-[var(--bg-card)] rounded mr-1">
                                  {c.地图名称}
                                </span>
                                {c.区域列表?.map((r: any, j: number) => (
                                  <span
                                    key={j}
                                    className="px-1.5 py-0.5 bg-[var(--bg-card)] rounded mr-1"
                                  >
                                    {r.地图名称}
                                  </span>
                                ))}
                              </div>
                            ))}
                          {d.路线列表?.length > 0 && (
                            <div className="text-xs">
                              <span className="text-orange-400">
                                路线 ({d.路线列表.length}):{' '}
                              </span>
                              {d.路线列表
                                .slice(0, 6)
                                .map((r: any, i: number) => (
                                  <span
                                    key={i}
                                    className="px-1.5 py-0.5 bg-[var(--bg-card)] rounded mr-1"
                                  >
                                    {r.名称 || r.地图名称}→{r.终点 || '?'}
                                  </span>
                                ))}
                              {d.路线列表.length > 6 && (
                                <span className="text-[var(--text-secondary)]">
                                  ...等{d.路线列表.length}条
                                </span>
                              )}
                            </div>
                          )}
                          {genResult.mode === 'submap' &&
                            d.子地图列表?.map((s: any, i: number) => (
                              <div key={i} className="text-xs">
                                <span className="text-blue-400">📍 </span>
                                <span className="px-1.5 py-0.5 bg-[var(--bg-card)] rounded mr-1">
                                  {s.地图名称} — {s.地图描述}
                                </span>
                              </div>
                            ))}
                          {isRoute &&
                            d.路线列表?.map((r: any, i: number) => (
                              <div key={i} className="text-xs">
                                <span className="text-orange-400">🔀 </span>
                                <span className="px-1.5 py-0.5 bg-[var(--bg-card)] rounded mr-1">
                                  {r.地图名称}: {r.起点} → {r.终点}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="flex items-center justify-center flex-1 gap-1 py-2 text-sm rounded-lg cursor-pointer btn-primary"
                          onClick={adoptResult}
                          disabled={aiGenerating}
                        >
                          <i className="ri-check-line" /> {adoptLabel}
                        </button>
                        <button
                          className="flex items-center justify-center flex-1 gap-1 px-4 py-2 text-sm text-orange-400 transition-colors rounded-lg cursor-pointer bg-orange-500/20 hover:bg-orange-500/30"
                          onClick={startGeneration}
                          disabled={aiGenerating}
                        >
                          <i className="ri-refresh-line" /> 重新生成
                        </button>
                        <button
                          className="flex-1 px-4 py-2 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg text-sm flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          onClick={() => {
                            setGenResult(null);
                            setGenError('');
                          }}
                        >
                          <i className="ri-delete-bin-line" /> 丢弃
                        </button>
                      </div>
                    </>
                  );
                })()}
              {!genResult && (
                <div className="px-4 py-3 border-t border-[var(--border)] flex items-center justify-end gap-2">
                  <button
                    className="flex-1 px-4 py-2 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg text-sm transition-colors cursor-pointer"
                    onClick={() => setShowAIDialog(false)}
                    disabled={aiGenerating}
                  >
                    取消
                  </button>
                  <button
                    className="flex-1 btn-primary py-2 rounded-lg text-sm flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                    disabled={
                      aiGenerating ||
                      (aiMode === 'submap' && !当前地图ID) ||
                      (aiMode === 'route' && aiSelectedLocations.length < 2)
                    }
                    onClick={startGeneration}
                  >
                    <i
                      className={
                        aiGenerating
                          ? 'ri-loader-4-line animate-spin'
                          : aiMode === 'world'
                            ? 'ri-earth-line'
                            : aiMode === 'route'
                              ? 'ri-route-line'
                              : 'ri-node-tree'
                      }
                    />
                    {aiGenerating
                      ? '生成中...'
                      : aiMode === 'world'
                        ? '生成世界地图'
                        : aiMode === 'route'
                          ? '生成路线'
                          : '生成子地图'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History Dialog */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={e => {
            if (e.target === e.currentTarget) setShowHistory(false);
          }}
        >
          <div className="bg-[var(--bg-card)] rounded-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <i className="ri-time-line text-[var(--primary)]" /> 生成历史{' '}
                {genHistory.length > 0 && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    ({genHistory.length})
                  </span>
                )}
              </h4>
              <div className="flex items-center gap-2">
                {genHistory.length > 0 && (
                  <button
                    className="text-xs text-red-400 hover:text-red-500 cursor-pointer"
                    onClick={() => setGenHistory([])}
                  >
                    清空
                  </button>
                )}
                <button
                  className="p-1 hover:bg-[var(--border)] rounded cursor-pointer"
                  onClick={() => setShowHistory(false)}
                >
                  <i className="ri-close-line" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {genHistory.length === 0 ? (
                <div className="text-center py-6 text-[var(--text-secondary)]">
                  <i className="ri-magic-line text-2xl mb-2 block opacity-50" />
                  <p className="text-xs">暂无生成记录</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {genHistory.map(item => (
                    <div
                      key={item.id}
                      className="p-3 bg-[var(--bg-dark)] rounded-lg text-sm border border-transparent hover:border-[var(--border)]"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[var(--text-secondary)]">
                          {item.时间}
                        </span>
                        {item.已采用 ? (
                          <span className="text-xs text-green-400">
                            <i className="ri-check-line" />
                            已采用
                          </span>
                        ) : (
                          <span className="text-xs text-blue-400">
                            <i className="ri-time-line" />
                            待处理
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] truncate mb-2">
                        {item.提示词 || '无提示词'}
                      </p>
                      <div className="flex gap-2">
                        {!item.已采用 && (
                          <button className="flex-1 px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded text-xs cursor-pointer">
                            <i className="ri-check-line mr-0.5" />
                            采用
                          </button>
                        )}
                        <button className="px-2 py-1 bg-[var(--bg-card)] hover:bg-red-500/20 hover:text-red-400 rounded text-xs cursor-pointer">
                          <i className="ri-delete-bin-line" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeoMapPanel;
