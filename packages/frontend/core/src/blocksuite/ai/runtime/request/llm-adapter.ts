import { LLMClientAdapter } from './llm-client-adapter.js';

/**
 * Singleton LLM adapter instance.
 *
 * Other modules import this to interact with the LLM without needing
 * dependency injection.  The adapter is configured once (typically from
 * settings) and then shared across the app.
 *
 * Wiring into the AI runtime happens in a later task (Task 9).
 */
export const llmAdapter = new LLMClientAdapter();
