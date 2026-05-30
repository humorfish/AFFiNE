// packages/backend/ai-server/src/services/query-engine.ts
// Wraps claude-code-best's QueryEngine for use in the AI server

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to claude-code-best dist chunks (sibling repo)
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
  private readonly customSystemPrompt?: string;
  private readonly userSpecifiedModel?: string;

  constructor(config?: StoryQueryEngineConfig) {
    this.customSystemPrompt = config?.customSystemPrompt;
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

    // Must call enableConfigs before any QueryEngine usage
    this.enableConfigs();
  }

  async *chat(
    messages: Array<{ role: string; content: string }>,
    context?: Record<string, unknown>,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    const appState = this.getDefaultAppState();

    // Inject context into system prompt if provided
    let systemPrompt =
      this.customSystemPrompt ??
      '你是一个专业的小说写作助手，擅长创作、润色和分析文学作品。';
    if (context && Object.keys(context).length > 0) {
      const contextStr = Object.entries(context)
        .filter(([, v]) => v != null && v !== '')
        .map(
          ([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`
        )
        .join('\n');
      if (contextStr) {
        systemPrompt += `\n\n参考资料：\n${contextStr}`;
      }
    }

    const engine = new this.QueryEngineClass({
      cwd: process.cwd(),
      tools: [],
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
    });

    // Build message content from history
    // For the first message, use the last user message
    const lastUserMsg = messages.find(m => m.role === 'user');
    if (!lastUserMsg) return;

    const prompt = lastUserMsg.content;

    try {
      for await (const msg of engine.submitMessage(prompt)) {
        if (msg.type === 'assistant') {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text') {
                yield block.text;
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
