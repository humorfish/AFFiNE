// @ts-nocheck
// AI setup for Story app — replaces AFFiNE's cloud-based AI with direct LLM API

import { AIProvider } from '../../../blocksuite/ai/provider/ai-provider';
import { setAIRequestService } from '../../../blocksuite/ai/runtime/request';
import { StoryAIRequestService } from './request-service';

let initialized = false;
let storyAIRequestService: StoryAIRequestService | null = null;

export function getStoryAIRequestService(): StoryAIRequestService | null {
  return storyAIRequestService;
}

export function setupStoryAI() {
  if (initialized) return;
  initialized = true;

  // Create and inject custom request service
  storyAIRequestService = new StoryAIRequestService();
  setAIRequestService(storyAIRequestService);

  // Provide user info (stub for local use)
  AIProvider.provide('userInfo', () => ({
    id: 'story-local-user',
    email: 'local@story.app',
    name: 'Story Writer',
    avatarUrl: null,
  }));

  // Onboarding toggle (no-op)
  AIProvider.provide('onboarding', () => {});
}
