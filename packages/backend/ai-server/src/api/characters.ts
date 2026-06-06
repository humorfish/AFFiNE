import { parsePipeLine, parseWithFallback } from './index';

const CHARACTER_TYPES = [
  '主角', '女主', '反派', '导师', '配角', '挚友', '对手', '盟友', '神秘人', '龙套',
] as const;

function buildSystemPrompt(context?: {
  世界观?: Record<string, string>;
  力量体系?: any[];
  势力?: any[];
  故事核心?: Record<string, string>;
  已有角色?: any[];
  大纲章节?: any[];
  生成数量?: number;
}): string {
  let prompt = `你是一位专业的小说角色设计师，擅长创建立体、鲜活、有深度的角色。

## 输出格式
请严格按照以下紧凑行格式输出，每个角色以 R| 开头，后续行属于该角色：
R|姓名|类型|性别|年龄
I|身份|境界|武器
A|外貌描述（10-30字）
S|简介（20-50字）
C|性格表层|性格中层|性格内核
E|章节名|经历事件（10-30字）
M|核心意义（20-50字）
F|结局（10-30字）
L|目标角色|关系类型|关系描述

## 角色类型
${CHARACTER_TYPES.join('/')}

## 性别
男/女

## 设计原则
1. 性格要有层次感，表层行为与内核动机有张力
2. 经历事件要服务于角色弧光
3. 关系网络要互相牵制，形成故事张力
4. 每个角色都有独特的声音和行为模式
5. 避免脸谱化和刻板印象`;

  if (context?.世界观) {
    prompt += `\n\n## 世界观背景\n${Object.entries(context.世界观).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;
  }
  if (context?.力量体系?.length) {
    prompt += `\n\n## 力量体系\n${context.力量体系.map(p => `- ${p.体系名称 || p.name}: ${(p.境界列表 || p.levels || []).join(' → ')}`).join('\n')}`;
  }
  if (context?.势力?.length) {
    prompt += `\n\n## 势力\n${context.势力.map(f => `- ${f.名称 || f.name}: ${f.简介 || f.description || ''}`).join('\n')}`;
  }
  if (context?.故事核心) {
    prompt += `\n\n## 故事核心\n${Object.entries(context.故事核心).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;
  }
  if (context?.已有角色?.length) {
    prompt += `\n\n## 已有角色（请勿重复）\n${context.已有角色.map(c => `- ${c.姓名 || c.name}(${c.类型 || c.type || ''}, ${c.身份 || c.role || ''})`).join('\n')}`;
  }
  if (context?.大纲章节?.length) {
    prompt += `\n\n## 章节大纲\n${context.大纲章节.map((c: any, i: number) => `第${i + 1}章: ${c.章节名 || c.title || c}`).join('\n')}`;
  }
  if (context?.生成数量) {
    prompt += `\n\n请生成 ${context.生成数量} 个角色`;
  }
  return prompt;
}

function buildUserMessage(input: string, count?: number): string {
  let msg = input;
  if (count) {
    msg = `请生成 ${count} 个角色。\n\n${input}`;
  }
  return msg;
}

export const charactersPrompts = {
  buildSystem: buildSystemPrompt,
  buildUser: buildUserMessage,
};

function parseCharactersCompact(text: string): any[] | null {
  const lines = text.split('\n').filter(l => l.trim());
  const characters: any[] = [];
  let current: any = null;

  for (const line of lines) {
    let parts: string[] | null;

    parts = parsePipeLine(line, 'R|');
    if (parts && parts.length >= 4) {
      current = {
        姓名: parts[0], 类型: parts[1], 性别: parts[2], 年龄: parts[3],
        经历列表: [], 关系列表: [],
      };
      characters.push(current);
      continue;
    }
    if (!current) continue;

    parts = parsePipeLine(line, 'I|');
    if (parts && parts.length >= 3) {
      current.身份 = parts[0]; current.境界 = parts[1]; current.武器 = parts[2];
      continue;
    }
    parts = parsePipeLine(line, 'A|');
    if (parts && parts.length >= 1) {
      current.外貌描述 = parts[0];
      continue;
    }
    parts = parsePipeLine(line, 'S|');
    if (parts && parts.length >= 1) {
      current.简介 = parts[0];
      continue;
    }
    parts = parsePipeLine(line, 'C|');
    if (parts && parts.length >= 3) {
      current.性格表层 = parts[0]; current.性格中层 = parts[1]; current.性格内核 = parts[2];
      continue;
    }
    parts = parsePipeLine(line, 'E|');
    if (parts && parts.length >= 2) {
      current.经历列表.push({ 章节名: parts[0], 经历事件: parts[1] });
      continue;
    }
    parts = parsePipeLine(line, 'M|');
    if (parts && parts.length >= 1) {
      current.核心意义 = parts[0];
      continue;
    }
    parts = parsePipeLine(line, 'F|');
    if (parts && parts.length >= 1) {
      current.结局 = parts[0];
      continue;
    }
    parts = parsePipeLine(line, 'L|');
    if (parts && parts.length >= 3) {
      current.关系列表.push({ 目标角色: parts[0], 关系类型: parts[1], 关系描述: parts[2] });
      continue;
    }
  }

  return characters.length > 0 ? characters : null;
}

export function parseCharacter(text: string): { data: any[] | null; failed: boolean; raw?: string } {
  return parseWithFallback(text, parseCharactersCompact);
}
