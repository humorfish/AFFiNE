export interface ContinuationParams {
  previousText: string;
  wordCount: number;
  style: string;
}

export interface SparkParams {
  context: string;
  direction: string;
}

export interface PromptResult {
  systemPrompt: string;
  userMessage: string;
}

export class PromptTemplates {
  static continuation({
    previousText,
    wordCount,
    style,
  }: ContinuationParams): PromptResult {
    return {
      systemPrompt: [
        `你是一位专业的小说续写助手。`,
        `请根据以下已有内容续写小说，续写字数约为${wordCount}字。`,
        `风格要求：${style}。`,
        `请保持与原文一致的叙事视角、人物性格和语言风格。`,
        `续写内容应该自然衔接，不要重复已有内容。`,
      ].join('\n'),
      userMessage: `以下是需要续写的小说内容：\n\n${previousText}`,
    };
  }

  static spark({ context, direction }: SparkParams): PromptResult {
    return {
      systemPrompt: [
        `你是一位创意丰富的小说构思助手。`,
        `请根据用户提供的背景信息和方向，提供创意性的小说构思和建议。`,
        `建议应该包括具体的情节走向、人物关系、冲突设置等方面。`,
      ].join('\n'),
      userMessage: [
        `背景信息：${context}`,
        `创作方向：${direction}`,
        `请提供具体的创意构思和建议。`,
      ].join('\n'),
    };
  }
}
