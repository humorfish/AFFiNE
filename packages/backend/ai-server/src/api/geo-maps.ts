import { parsePipeLine, parseWithFallback } from './index';

function buildSystemPrompt(context?: {
  世界观信息?: Record<string, string>;
  已有地图名称?: string[];
  父地图名称?: string;
  地图等级?: number;
  包含路线?: boolean;
}): string {
  const level = context?.地图等级 ?? 1;
  let prompt = `你是一位专业的小说地理地图设计师，擅长构建宏大而细腻的世界地图体系。

## 输出格式
请严格按照以下紧凑行格式输出：
M|地图名称|地图描述`;

  if (context?.包含路线 !== false) {
    prompt += `
R|路线名称|起点|终点|描述`;
  }

  prompt += `

## 地图等级: ${level}级
${level === 1 ? '当前设计的是顶级世界地图，侧重大洲、大区域划分' : `当前设计的是${level}级子地图，侧重更细致的区域划分`}

## 设计原则
1. 地理要有逻辑性，山川河流气候互相影响
2. 地名要有文化感，符合世界观设定
3. 区域划分要考虑势力分布和故事需要
4. 路线设计要考虑距离、地形和危险性
5. 每个子区域都要有独特的风貌和故事潜力`;

  if (context?.世界观信息) {
    prompt += `\n\n## 世界观信息\n${Object.entries(context.世界观信息).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;
  }
  if (context?.已有地图名称?.length) {
    prompt += `\n\n## 已有地图名称（请勿重复）\n${context.已有地图名称.join('、')}`;
  }
  if (context?.父地图名称) {
    prompt += `\n\n## 父地图\n当前地图是「${context.父地图名称}」的子地图`;
  }
  return prompt;
}

function buildUserMessage(input: string, parentName?: string, level?: string): string {
  let msg = input;
  if (parentName) {
    msg = `请在「${parentName}」下设计子地图。\n\n${input}`;
  }
  if (level) {
    msg += `\n\n地图等级: ${level}`;
  }
  return msg;
}

export const geoMapsPrompts = {
  buildSystem: buildSystemPrompt,
  buildUser: buildUserMessage,
};

function parseGeoMapCompact(text: string): { 子地图列表: any[]; 路线列表: any[] } | null {
  const lines = text.split('\n').filter(l => l.trim());
  const maps: any[] = [];
  const routes: any[] = [];

  for (const line of lines) {
    const mapParts = parsePipeLine(line, 'M|');
    if (mapParts && mapParts.length >= 2) {
      maps.push({ 地图名称: mapParts[0], 地图描述: mapParts[1] });
      continue;
    }
    const routeParts = parsePipeLine(line, 'R|');
    if (routeParts && routeParts.length >= 4) {
      routes.push({
        路线名称: routeParts[0], 起点: routeParts[1],
        终点: routeParts[2], 描述: routeParts[3],
      });
    }
  }

  if (maps.length === 0 && routes.length === 0) return null;
  return { 子地图列表: maps, 路线列表: routes };
}

export function parseGeoMap(text: string): { data: { 子地图列表: any[]; 路线列表: any[] } | null; failed: boolean; raw?: string } {
  return parseWithFallback(text, parseGeoMapCompact);
}
