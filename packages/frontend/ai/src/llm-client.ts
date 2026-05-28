export interface LLMClientConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface LLMRequestOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream: boolean;
    temperature?: number;
    max_tokens?: number;
  };
}

export class LLMClient {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor({ baseURL, apiKey, model }: LLMClientConfig) {
    this.baseURL = baseURL.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.model = model;
  }

  buildRequest(
    userMessage: string,
    options: LLMRequestOptions = {}
  ): LLMRequest {
    const messages: Array<{ role: string; content: string }> = [];

    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: userMessage,
    });

    const body: LLMRequest['body'] = {
      model: this.model,
      messages,
      stream: true,
    };

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }

    return {
      url: `${this.baseURL}/chat/completions`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    };
  }

  async *stream(
    userMessage: string,
    options: LLMRequestOptions = {}
  ): AsyncGenerator<string> {
    const request = this.buildRequest(userMessage, options);
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LLM API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error('Response body is not available for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
