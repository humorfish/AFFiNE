// packages/backend/ai-server/src/services/query-engine.ts
// Wraps claude-code-best's QueryEngine for use in the AI server

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod/v4';

import { SCENARIOS } from '../api/index';

// ─────────────────────────────────────────────────────────────
// Prompt templates per scenario
// ─────────────────────────────────────────────────────────────

const TOOL_USAGE_GUIDE = `
## 工具使用规则

你有两个工具可用：edit（编辑指定行号范围的文本）和 append（在文档末尾追加段落）。

重要：
- 每次工具调用后，系统会返回确认消息。工具执行成功后，**不要重复调用相同操作**。
- 如果工具返回了结果（即使是简短确认），说明操作已成功完成。
- 一次回复中，每种工具最多调用一次。不要连续多次调用相同工具执行相同操作。
- 续写内容时，用一次 append 调用追加所有内容，不要分多次追加。`;

const BASE_PROMPTS: Record<string, string> = {
  chat:
    '你是一个专业的小说写作助手，擅长创作、润色和分析文学作品。你可以使用工具来修改编辑器中的文本。' +
    TOOL_USAGE_GUIDE,
  edit:
    '你是一个专业的小说编辑助手。你可以修改编辑器中的文本。请根据用户指令修改指定范围的内容。' +
    TOOL_USAGE_GUIDE,
  assistant: '你是一个专业的写作助手。请根据用户的要求提供帮助。',
};

export type Scenario = 'chat' | 'edit' | (string & {});

export interface BuildPromptOptions {
  context?: Record<string, unknown>;
}

export type ChatEvent =
  | { type: 'text'; data: { text: string } }
  | {
      type: 'tool_use';
      data: {
        name: string;
        input: Record<string, unknown>;
        tool_use_id: string;
      };
    }
  | { type: 'tool_result'; data: { tool_use_id: string; content: unknown } };

/**
 * Build a system prompt for a given scenario.
 * Tool definitions are handled by QueryEngine's structured `tools` parameter.
 */
export function buildPrompt(
  scenario: Scenario,
  options: BuildPromptOptions = {}
): string {
  const { context } = options;

  // Check structured scenario registry first
  const scenarioConfig = SCENARIOS[scenario];
  if (scenarioConfig) {
    return scenarioConfig.buildSystemPrompt(context);
  }

  let systemPrompt = BASE_PROMPTS[scenario] ?? BASE_PROMPTS.chat;

  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n');
    if (contextStr) {
      systemPrompt += `\n\n参考资料：\n${contextStr}`;
    }
  }

  return systemPrompt;
}

// ─────────────────────────────────────────────────────────────
// Structured editor tools (Zod schemas → API tools parameter)
// ─────────────────────────────────────────────────────────────

/**
 * Create editor tools (edit, append) with Zod schemas.
 * These are passed to QueryEngine as structured tool definitions.
 * tool.call() returns a simulated success message — actual editor
 * operations are executed on the frontend via SSE tool_use events.
 */
function createEditorTools() {
  const editInputSchema = z.object({
    action: z
      .enum(['replace', 'insert', 'delete'])
      .describe('操作类型：replace=替换, insert=插入, delete=删除'),
    range: z
      .object({
        startLine: z.number().describe('起始行号（1-based）'),
        startCol: z.number().describe('起始列号（0-based 字符偏移）'),
        endLine: z.number().describe('结束行号'),
        endCol: z.number().describe('结束列号'),
      })
      .describe('操作范围'),
    text: z.string().optional().describe('替换或插入的文本（delete 时省略）'),
  });

  const appendInputSchema = z.object({
    text: z.string().describe('要追加的文本，支持 \\n 换行产生多个段落'),
  });

  const editTool = {
    name: 'edit',
    maxResultSizeChars: 1000,
    aliases: [],
    searchHint: 'edit text in the document',

    get inputSchema() {
      return editInputSchema;
    },

    async description() {
      return '编辑文档中指定行号和列号范围内的文本。支持替换、插入和删除操作。';
    },
    async prompt() {
      return '编辑文档中的文本';
    },

    isConcurrencySafe() {
      return false;
    },
    isReadOnly() {
      return false;
    },
    isEnabled() {
      return true;
    },

    validateInput(input: any) {
      return { result: input };
    },
    userFacingName() {
      return 'Edit';
    },
    toAutoClassifierInput(input: any) {
      return { tool: 'edit', action: input.action };
    },
    getActivityDescription(input: any) {
      return `Editing text (${input.action})`;
    },
    getToolUseSummary(input: any) {
      return `edit ${input.action} [${input.range?.startLine}:${input.range?.startCol}-${input.range?.endLine}:${input.range?.endCol}]`;
    },
    renderToolUseMessage(input: any) {
      return `Editing ${input.action}...`;
    },
    renderToolResultMessage(result: any) {
      return typeof result === 'string' ? result : JSON.stringify(result);
    },
    renderToolUseErrorMessage(error: any) {
      return `Edit error: ${error}`;
    },
    checkPermissions() {
      return { result: true };
    },

    async call({ action, range }: z.infer<typeof editInputSchema>) {
      const desc =
        action === 'delete' ? '删除' : action === 'insert' ? '插入' : '替换';
      return `已${desc} [${range.startLine}:${range.startCol}-${range.endLine}:${range.endCol}]`;
    },
  };

  const appendTool = {
    name: 'append',
    maxResultSizeChars: 1000,
    aliases: [],
    searchHint: 'append text to the document',

    get inputSchema() {
      return appendInputSchema;
    },

    async description() {
      return '在文档末尾追加新段落。支持 \\n 换行产生多个段落。';
    },
    async prompt() {
      return '在文档末尾追加文本';
    },

    isConcurrencySafe() {
      return false;
    },
    isReadOnly() {
      return false;
    },
    isEnabled() {
      return true;
    },

    validateInput(input: any) {
      return { result: input };
    },
    userFacingName() {
      return 'Append';
    },
    toAutoClassifierInput(_input: any) {
      return { tool: 'append' };
    },
    getActivityDescription(_input: any) {
      return `Appending text`;
    },
    getToolUseSummary(input: any) {
      return `append ${input.text?.split('\n').length ?? 0} paragraph(s)`;
    },
    renderToolUseMessage(_input: any) {
      return `Appending text...`;
    },
    renderToolResultMessage(result: any) {
      return typeof result === 'string' ? result : JSON.stringify(result);
    },
    renderToolUseErrorMessage(error: any) {
      return `Append error: ${error}`;
    },
    checkPermissions() {
      return { result: true };
    },

    async call({ text }: z.infer<typeof appendInputSchema>) {
      const lines = text.split('\n');
      return `已追加 ${lines.length} 个段落`;
    },
  };

  return [editTool, appendTool];
}

// ─────────────────────────────────────────────────────────────
// QueryEngine wrapper
// ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIST_BASE = path.resolve(
  __dirname,
  '../../../../../../claude-code-best/dist'
);

const CHUNK_CONFIG = `${DIST_BASE}/chunk-2qgfsf06.js`;
const CHUNK_APPSTATE = `${DIST_BASE}/chunk-rff8gdtq.js`;
const CHUNK_ENGINE = `${DIST_BASE}/chunk-80ek3vv4.js`;

export interface StoryQueryEngineConfig {
  customSystemPrompt?: string;
  userSpecifiedModel?: string;
}

export class StoryQueryEngine {
  private enableConfigs!: () => void;
  private getDefaultAppState!: () => any;
  private QueryEngineClass!: any;
  private readonly userSpecifiedModel?: string;

  constructor(config?: StoryQueryEngineConfig) {
    this.userSpecifiedModel = config?.userSpecifiedModel;
  }

  async initialize() {
    const [configModule, appStateModule, engineModule] = await Promise.all([
      import(CHUNK_CONFIG),
      import(CHUNK_APPSTATE),
      import(CHUNK_ENGINE),
    ]);

    this.enableConfigs = configModule.enableConfigs;
    this.getDefaultAppState = appStateModule.getDefaultAppState;
    this.QueryEngineClass = engineModule.QueryEngine;

    this.enableConfigs();
  }

  async *chat(
    messages: Array<{ role: string; content: string }>,
    context?: Record<string, unknown>,
    signal?: AbortSignal,
    agent?: boolean,
    scenario: Scenario = 'chat'
  ): AsyncGenerator<ChatEvent> {
    const appState = this.getDefaultAppState();

    const systemPrompt = buildPrompt(scenario, { context });

    // Split messages: history (all but last user msg) + current input
    const lastUserIdx = messages.findLastIndex(m => m.role === 'user');
    if (lastUserIdx === -1) return;

    const history = messages.slice(0, lastUserIdx);
    const currentInput = messages[lastUserIdx]?.content;
    if (!currentInput) return;

    const initialMessages = history.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    // Structured tools — only in agent mode
    const tools = agent ? createEditorTools() : [];

    const engine = new this.QueryEngineClass({
      cwd: process.cwd(),
      tools,
      commands: [],
      mcpClients: [],
      agents: [],
      canUseTool: async () => ({ behavior: 'allow' }),
      getAppState: () => appState,
      setAppState: (fn: (prev: any) => any) => {
        Object.assign(appState, fn(appState));
      },
      readFileCache: new Map(),
      customSystemPrompt: systemPrompt,
      userSpecifiedModel: this.userSpecifiedModel,
      abortController: signal ? { signal } : undefined,
      initialMessages: initialMessages.length > 0 ? initialMessages : undefined,
    });

    try {
      for await (const msg of engine.submitMessage(currentInput)) {
        if (msg.type === 'assistant') {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                yield { type: 'text', data: { text: block.text } };
              } else if (block.type === 'tool_use') {
                yield {
                  type: 'tool_use',
                  data: {
                    name: block.name,
                    input: block.input,
                    tool_use_id: block.id,
                  },
                };
              }
            }
          }
        } else if (msg.type === 'user') {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result') {
                yield {
                  type: 'tool_result',
                  data: {
                    tool_use_id: block.tool_use_id,
                    content: block.content,
                  },
                };
              }
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'error') {
          throw new Error(msg.error?.message ?? 'QueryEngine error');
        }
      }
    } finally {
      if (typeof engine.dispose === 'function') {
        engine.dispose();
      }
    }
  }
}
