import { describe, expect, it } from 'vitest';

import { PromptTemplates } from './prompt-templates.js';

describe('PromptTemplates', () => {
  describe('continuation', () => {
    it('returns systemPrompt containing continuation instructions and word count', () => {
      const result = PromptTemplates.continuation({
        previousText: 'Once upon a time',
        wordCount: 500,
        style: '悬疑',
      });

      expect(result.systemPrompt).toContain('续写');
      expect(result.systemPrompt).toContain('500');
      expect(result.systemPrompt).toContain('悬疑');
    });

    it('returns userMessage containing the previous text', () => {
      const previousText = 'He opened the door and found...';
      const result = PromptTemplates.continuation({
        previousText,
        wordCount: 300,
        style: '轻松',
      });

      expect(result.userMessage).toContain(previousText);
    });

    it('returns both systemPrompt and userMessage as strings', () => {
      const result = PromptTemplates.continuation({
        previousText: 'test',
        wordCount: 100,
        style: '正式',
      });

      expect(typeof result.systemPrompt).toBe('string');
      expect(typeof result.userMessage).toBe('string');
    });
  });

  describe('spark', () => {
    it('returns systemPrompt containing creative instructions', () => {
      const result = PromptTemplates.spark({
        context: '一个失忆的侦探',
        direction: '情节反转',
      });

      expect(result.systemPrompt).toContain('创意');
    });

    it('returns userMessage containing context and direction', () => {
      const context = '一个失忆的侦探';
      const direction = '情节反转';
      const result = PromptTemplates.spark({
        context,
        direction,
      });

      expect(result.userMessage).toContain(context);
      expect(result.userMessage).toContain(direction);
    });

    it('returns both systemPrompt and userMessage as strings', () => {
      const result = PromptTemplates.spark({
        context: 'test context',
        direction: 'test direction',
      });

      expect(typeof result.systemPrompt).toBe('string');
      expect(typeof result.userMessage).toBe('string');
    });
  });
});
