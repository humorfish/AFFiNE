// @ts-nocheck
// AI setup for Story app — replaces AFFiNE's cloud-based AI with direct LLM API

import { AIProvider } from '../../../blocksuite/ai/provider/ai-provider';
import { setAIRequestService } from '../../../blocksuite/ai/runtime/request';
import type { EditorAPI } from '../story-editor-panel';
import { StoryAIRequestService } from './request-service';

let initialized = false;
let storyAIRequestService: StoryAIRequestService | null = null;

/** Pending values — stored if layout mounts before the service is created */
let pendingEditorApiGetter: (() => EditorAPI | null) | null = null;
let pendingChapterContext: {
  workspacePath: string;
  novelId: string;
  chapterId: string;
} | null = null;

export function getStoryAIRequestService(): StoryAIRequestService | null {
  return storyAIRequestService;
}

/**
 * Connect the EditorAPI to the request service via a getter function.
 * Called by layout once on mount. The getter reads the ref at call time,
 * so it always gets the latest value even after editor re-renders.
 */
export function setEditorApiGetterForAI(getter: () => EditorAPI | null) {
  pendingEditorApiGetter = getter;
  if (storyAIRequestService) {
    storyAIRequestService.setEditorApiGetter(getter);
  }
}

/**
 * Set the current chapter context — loads persisted session from disk.
 * Called by layout when active chapter changes.
 */
export async function setAIChapterContext(
  workspacePath: string,
  novelId: string,
  chapterId: string
): Promise<{
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
} | null> {
  pendingChapterContext = { workspacePath, novelId, chapterId };
  pendingClearChapter = false;
  if (!storyAIRequestService) {
    console.log(
      '[StoryAI] setAIChapterContext: service not ready, stored pending'
    );
    return null;
  }
  return storyAIRequestService.setCurrentChapter(
    workspacePath,
    novelId,
    chapterId
  );
}

/** Clear the chapter context (no chapter active) */
export function clearAIChapterContext() {
  pendingChapterContext = null;
  if (storyAIRequestService) {
    storyAIRequestService.clearCurrentChapter();
  }
}

export function setupStoryAI() {
  if (initialized) return;
  initialized = true;

  // Create and inject custom request service
  storyAIRequestService = new StoryAIRequestService();
  setAIRequestService(storyAIRequestService);

  // Apply pending values if layout already registered them
  if (pendingEditorApiGetter) {
    storyAIRequestService.setEditorApiGetter(pendingEditorApiGetter);
  }
  if (pendingChapterContext) {
    const { workspacePath, novelId, chapterId } = pendingChapterContext;
    storyAIRequestService
      .setCurrentChapter(workspacePath, novelId, chapterId)
      .then(() => {
        console.log('[StoryAI] applied pending chapter context:', chapterId);
      })
      .catch(() => {});
  }

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
