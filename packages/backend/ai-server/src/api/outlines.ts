import { parseWithFallback } from './index';

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const CHAPTER_SYSTEM_PROMPT = `你是一位专业的小说大纲设计师，擅长构建结构严谨、内容丰富、节奏精准的章节大纲。

【任务】
请根据提供的世界观、故事核心、角色和情节脉络信息，生成详细的章节大纲。

【输出格式】
请以JSON格式输出，包含以下字段：
{
  "章节列表": [
    {
      "章节序号": 1,
      "章节名称": "章节名称（5-15字）",
      "章节概要": "该章节的内容概要（50-150字）",
      "核心事件": ["关键事件列表，1-3个"],
      "出场角色": ["出场角色名称列表"],
      "情感基调": "该章的总体情感基调",
      "伏笔关联": ["该章涉及或推进的伏笔（如有）"]
    }
  ]
}

【设计原则】
1. 章节之间要有明确的因果递进关系
2. 每章至少有一个核心事件推进故事
3. 角色出场要有目的，服务于角色弧光
4. 伏笔要自然埋设和回收
5. 节奏要有张有弛，高潮与过渡交替`;

const VOLUME_SYSTEM_PROMPT = `你是一位专业的小说大纲设计师，擅长构建宏观的故事卷结构。

【任务】
请根据提供的世界观、故事核心、角色信息，生成完整的卷级大纲。

【输出格式】
请以JSON格式输出，包含以下字段：
{
  "卷列表": [
    {
      "卷序号": 1,
      "卷名称": "卷名称（5-15字）",
      "章节范围": "第X章-第Y章",
      "卷概要": "该卷的整体概要（80-200字）",
      "核心冲突": "该卷的核心冲突描述",
      "角色发展": ["关键角色在该卷的发展变化"],
      "高潮事件": "该卷的高潮事件描述"
    }
  ]
}`;

const ENHANCE_SYSTEM_PROMPT = `你是一位专业的小说大纲优化师，擅长在已有大纲基础上进行润色、补充和优化。

【任务】
请根据提供的信息，对以下大纲文本进行优化增强。保持原有结构，但可以：
1. 补充细节和具体描述
2. 优化事件之间的逻辑关系
3. 增强角色动机和情感描写
4. 调整节奏使其更合理
5. 补充缺失的伏笔关联

【输出格式】
请直接输出优化后的大纲文本，保持原有格式风格。`;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface OutlinesContext {
  mode?: 'chapter' | 'volume' | 'enhance';
  世界观?: string;
  故事核心?: string;
  角色?: string[];
  势力?: string[];
  场景?: string[];
  伏笔?: string[];
  已有大纲?: string;
}

function buildSystem(ctx?: OutlinesContext): string {
  const mode = ctx?.mode || 'chapter';
  let prompt: string;

  switch (mode) {
    case 'volume':
      prompt = VOLUME_SYSTEM_PROMPT;
      break;
    case 'enhance':
      prompt = ENHANCE_SYSTEM_PROMPT;
      break;
    default:
      prompt = CHAPTER_SYSTEM_PROMPT;
  }

  if (ctx) {
    const contextLines: string[] = [];

    if (ctx.世界观) contextLines.push(`世界观：${ctx.世界观}`);
    if (ctx.故事核心) contextLines.push(`故事核心：${ctx.故事核心}`);
    if (ctx.角色?.length) contextLines.push(`主要角色：${ctx.角色.join('、')}`);
    if (ctx.势力?.length) contextLines.push(`势力阵营：${ctx.势力.join('、')}`);
    if (ctx.场景?.length) contextLines.push(`主要场景：${ctx.场景.join('、')}`);
    if (ctx.伏笔?.length) contextLines.push(`已有伏笔：${ctx.伏笔.join('、')}`);
    if (ctx.已有大纲) contextLines.push(`已有大纲：\n${ctx.已有大纲}`);

    if (contextLines.length > 0) {
      prompt += `\n\n【项目信息】\n${contextLines.join('\n')}`;
    }
  }

  return prompt;
}

function buildUser(input: string, _ctx?: OutlinesContext): string {
  return input || '请根据项目信息，生成详细的章节大纲';
}

export const outlinesPrompts = { buildSystem, buildUser };

// ---------------------------------------------------------------------------
// Parser — uses JSON fallback (outline generation returns free-form text)
// ---------------------------------------------------------------------------

export function parseOutlines(
  text: string,
): { data: any; failed: boolean; raw?: string } {
  return parseWithFallback(text, () => {
    // Outlines return JSON or free-form text, no compact-line format
    return null;
  });
}
