import {
  LLMClient,
  type LLMClientConfig,
  type LLMRequestOptions,
} from '@affine/ai';

const DEFAULT_SYSTEM_PROMPT = '你是Story写作助手，一个专业的中文小说创作顾问。';

export class LLMClientAdapter {
  private client: LLMClient | null = null;
  private currentConfig: LLMClientConfig | null = null;

  /**
   * Configure the adapter with LLM provider settings.
   * Re-creates the internal client on each call so callers
   * can swap providers or keys at runtime.
   */
  configure(config: LLMClientConfig): void {
    this.currentConfig = config;
    this.client = new LLMClient(config);
  }

  /** Whether a valid LLM client has been configured. */
  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** Return the active configuration, if any. */
  getConfig(): LLMClientConfig | null {
    return this.currentConfig;
  }

  /**
   * Stream a chat completion from the configured LLM.
   *
   * @param content   The user message / prompt to send.
   * @param options   Optional overrides such as systemPrompt, temperature, maxTokens.
   */
  async *chatStream(
    content: string,
    options?: LLMRequestOptions
  ): AsyncGenerator<string> {
    if (!this.client) {
      throw new Error('请先在设置中配置 LLM API Key');
    }

    const mergedOptions: LLMRequestOptions = {
      systemPrompt: options?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    };

    yield* this.client.stream(content, mergedOptions);
  }
}
