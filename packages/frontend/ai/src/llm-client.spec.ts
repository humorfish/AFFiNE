import { describe, expect, it } from 'vitest';

import { LLMClient } from './llm-client.js';

describe('LLMClient', () => {
  const createClient = (
    overrides?: Partial<ConstructorParameters<typeof LLMClient>[0]>
  ) => {
    return new LLMClient({
      baseURL: 'https://api.example.com/v1',
      apiKey: 'test-key-123',
      model: 'gpt-4o-mini',
      ...overrides,
    });
  };

  describe('buildRequest', () => {
    it('returns correct URL with baseURL/chat/completions', () => {
      const client = createClient();
      const request = client.buildRequest('Write a story');

      expect(request.url).toBe('https://api.example.com/v1/chat/completions');
    });

    it('sets Authorization header with Bearer token', () => {
      const client = createClient();
      const request = client.buildRequest('Hello');

      expect(request.headers['Authorization']).toBe('Bearer test-key-123');
    });

    it('includes Content-Type header as application/json', () => {
      const client = createClient();
      const request = client.buildRequest('Hello');

      expect(request.headers['Content-Type']).toBe('application/json');
    });

    it('sends model and messages in body', () => {
      const client = createClient({ model: 'my-model' });
      const request = client.buildRequest('Hello world');

      expect(request.body.model).toBe('my-model');
      expect(request.body.messages).toBeDefined();
      expect(request.body.messages).toHaveLength(1);
      expect(request.body.messages[0].role).toBe('user');
      expect(request.body.messages[0].content).toBe('Hello world');
    });

    it('includes system message when systemPrompt is provided', () => {
      const client = createClient();
      const request = client.buildRequest('Write a story', {
        systemPrompt: 'You are a creative writer.',
      });

      expect(request.body.messages).toHaveLength(2);
      expect(request.body.messages[0].role).toBe('system');
      expect(request.body.messages[0].content).toBe(
        'You are a creative writer.'
      );
      expect(request.body.messages[1].role).toBe('user');
      expect(request.body.messages[1].content).toBe('Write a story');
    });

    it('sets stream to true by default', () => {
      const client = createClient();
      const request = client.buildRequest('Hello');

      expect(request.body.stream).toBe(true);
    });

    it('supports custom temperature option', () => {
      const client = createClient();
      const request = client.buildRequest('Hello', { temperature: 0.9 });

      expect(request.body.temperature).toBe(0.9);
    });

    it('supports custom max_tokens option', () => {
      const client = createClient();
      const request = client.buildRequest('Hello', { maxTokens: 2000 });

      expect(request.body.max_tokens).toBe(2000);
    });

    it('defaults temperature and max_tokens when not provided', () => {
      const client = createClient();
      const request = client.buildRequest('Hello');

      expect(request.body.temperature).toBeUndefined();
      expect(request.body.max_tokens).toBeUndefined();
    });

    it('uses POST method', () => {
      const client = createClient();
      const request = client.buildRequest('Hello');

      expect(request.method).toBe('POST');
    });
  });
});
