import { SlashMenuConfigExtension } from '@blocksuite/affine/widgets/slash-menu';

// Disable the built-in slash menu completely.
// The Story app uses its own AI popup triggered by "/" key
// (see StoryAIPopupManager in story-editor-panel.tsx).
export function AiSlashMenuConfigExtension() {
  return SlashMenuConfigExtension('ai', {
    items: [],
    disableWhen: () => true,
  });
}
