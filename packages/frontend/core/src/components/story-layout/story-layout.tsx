import { useCallback, useMemo, useRef, useState } from 'react';

import { AIChatRuntime } from '../../blocksuite/ai/runtime/chat/runtime';
import { WorkspaceAIChatSessionStrategy } from '../../blocksuite/ai/runtime/chat/session-strategy';
import { useAIChatRuntime } from '../../blocksuite/ai/runtime/chat/use-runtime';
import { useAIChatElement } from '../../blocksuite/ai/runtime/chat/use-element';
import { getStoryAIRequestService } from './ai/setup';

import './story-layout.css';

import { ChaptersDialog } from './chapters-dialog';
import { StoryFrameworkRoot } from './story-framework';
import { StoryProvider } from './story-context';
import { StoryEditorPanel } from './story-editor-panel';
import { StorySidebar, NAV_ITEMS } from './story-sidebar';
import { NewProjectDialog } from './new-project-dialog';
import { PlaceholderDialog } from './placeholder-dialog';
import { SettingsDialog } from './settings-dialog';
import { WorkspaceProvider } from './workspace-provider';

const THEME = {
  background: 'var(--affine-background-primary-color)',
  panel: 'var(--affine-background-secondary-color, #16162a)',
  active: 'var(--affine-primary-color)',
  text: 'var(--affine-text-primary-color)',
  textMuted: 'var(--affine-text-secondary-color)',
  border: 'var(--affine-border-color)',
};

// Minimal signal stub for BlockSuite components
const stubSignal = (v: any = undefined) => ({
  value: v,
  peek: () => v,
  subscribe: () => () => {},
});

// Service stubs for AIChatContent — satisfies required property contracts
// without pulling in the full AFFiNE cloud service layer
const aiServiceStubs = {
  subscriptionService: {
    subscription: {
      revalidate: () => {},
      ai$: stubSignal({ status: 'active' }),
    },
  },
  reasoningConfig: {
    enabled: stubSignal(false),
    setEnabled: () => {},
  },
  searchMenuConfig: {
    enabled: stubSignal(false),
    setSearchMenuEnabled: () => {},
    search: () => stubSignal([]),
  },
  docDisplayConfig: {
    getTags: () => ({ signal: stubSignal([]), cleanup: () => {} }),
    getTagTitle: () => '',
    getTagPageIds: () => [],
    getCollections: () => ({ signal: stubSignal([]), cleanup: () => {} }),
    getCollectionPageIds: () => [],
  },
  serverService: { server: { config$: stubSignal({ type: 'local' }) } },
  affineFeatureFlagService: { flags: {} },
  affineWorkspaceDialogService: {},
  affineThemeService: { theme$: stubSignal('dark') },
  notificationService: { toast: () => {} },
  aiDraftService: undefined,
  aiToolsConfigService: { getToolsConfig: () => ({}) },
  aiModelService: { models: stubSignal([]), modelId: stubSignal(undefined), setModel: () => {} },
  peekViewService: {},
  onAISubscribe: async () => {},
  onOpenDoc: () => {},
};

export const StoryLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  const requestService = getStoryAIRequestService();
  const runtime = useMemo(() => {
    if (!requestService) return null;
    return new AIChatRuntime({
      request: requestService,
      scope: { kind: 'workspace', workspaceId: 'story-workspace' },
      strategy: new WorkspaceAIChatSessionStrategy(),
    });
  }, [requestService]);
  const snapshot = useAIChatRuntime(runtime);

  // In focus mode, hide both sidebars
  const showSidebar = !focusMode;
  const showAIPanel = !focusMode && !aiPanelCollapsed;

  useAIChatElement({
    containerRef: chatContainerRef,
    selector: 'ai-chat-content',
    enabled: showAIPanel && !!runtime,
    createElement: () => document.createElement('ai-chat-content'),
    configureElement: (el: any) => {
      el.runtime = runtime;
      el.runtimeSnapshot = snapshot;
      el.workspaceId = 'story-workspace';
      Object.assign(el, aiServiceStubs);
    },
  });

  const handleFocusToggle = useCallback(() => {
    setFocusMode(prev => !prev);
  }, []);

  const openChatWithPrompt = useCallback((prompt: string) => {
    setAiPanelCollapsed(false);
  }, []);

  return (
    <StoryFrameworkRoot>
      <WorkspaceProvider>
        <StoryProvider>
          <div style={styles.root}>
            {showSidebar && (
              <StorySidebar
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
                onNavClick={(id) => setActiveModal(id)}
                onNewProject={() => setActiveModal('new-project')}
                theme={THEME}
              />
            )}
            <StoryEditorPanel
              focusMode={focusMode}
              onFocusToggle={handleFocusToggle}
              onSendToChat={openChatWithPrompt}
              theme={THEME}
            />
            {showAIPanel && (
              <div
                ref={chatContainerRef}
                style={{
                  width: 380,
                  minWidth: 380,
                  maxWidth: 380,
                  background: THEME.panel,
                  borderLeft: `1px solid ${THEME.border}`,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              />
            )}
            {!focusMode && aiPanelCollapsed && (
              <button
                onClick={() => setAiPanelCollapsed(false)}
                style={{
                  ...styles.aiPanelToggle,
                  background: THEME.panel,
                  color: THEME.text,
                }}
              >
                AI
              </button>
            )}
          </div>

          <ChaptersDialog
            open={activeModal === 'chapters'}
            onClose={() => setActiveModal(null)}
          />
          <NewProjectDialog
            open={activeModal === 'new-project'}
            onClose={() => setActiveModal(null)}
          />
          <SettingsDialog
            open={activeModal === 'settings'}
            onClose={() => setActiveModal(null)}
          />
          {activeModal && !['chapters', 'new-project', 'settings'].includes(activeModal) && (
            <PlaceholderDialog
              open
              title={NAV_ITEMS.find(n => n.id === activeModal)?.label ?? activeModal}
              onClose={() => setActiveModal(null)}
            />
          )}
        </StoryProvider>
      </WorkspaceProvider>
    </StoryFrameworkRoot>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100%',
    width: '100%',
    background: 'var(--affine-background-primary-color)',
    overflow: 'hidden',
    position: 'relative',
    paddingTop: 38,
    boxSizing: 'border-box',
  },
  aiPanelToggle: {
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    border: '1px solid var(--affine-border-color)',
    borderRadius: '6px 0 0 6px',
    padding: '8px 6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    zIndex: 10,
  },
};
