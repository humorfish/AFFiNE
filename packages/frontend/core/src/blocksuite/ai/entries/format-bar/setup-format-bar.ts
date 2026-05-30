import '../../components/ask-ai-button';

import {
  ActionPlacement,
  type ToolbarModuleConfig,
} from '@blocksuite/affine/shared/services';
import { html } from 'lit';

import { pageAIGroups } from '../../_common/config';

export function toolbarAIEntryConfig(): ToolbarModuleConfig {
  return {
    actions: [
      {
        placement: ActionPlacement.Start,
        id: 'A.ai',
        score: -1,
        // Never show the old AI toolbar button in Story app.
        // Story uses its own AI popup (see StoryAIPopupManager).
        when: () => false,
        content: ({ host }) => html`
          <ask-ai-toolbar-button
            .host=${host}
            .actionGroups=${pageAIGroups}
          ></ask-ai-toolbar-button>
        `,
      },
    ],
  };
}
