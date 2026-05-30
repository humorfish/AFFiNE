import { useCallback, useRef, useState } from 'react';
import type { StoryAIHandle } from './story-ai-panel';

import './story-layout.css';

import { StoryAIPanel } from './story-ai-panel';
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

export const StoryLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const aiPanelRef = useRef<StoryAIHandle>(null);

  const handleFocusToggle = useCallback(() => {
    setFocusMode(prev => !prev);
  }, []);

  // Direct callback — opens AI chat panel and sends a message
  const openChatWithPrompt = useCallback((prompt: string) => {
    setAiPanelCollapsed(false);
    setTimeout(() => {
      aiPanelRef.current?.sendMessage(prompt);
    }, 100);
  }, []);

  // In focus mode, hide both sidebars
  const showSidebar = !focusMode;
  const showAIPanel = !focusMode && !aiPanelCollapsed;

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
              <StoryAIPanel
                ref={aiPanelRef}
                onToggleCollapse={() => setAiPanelCollapsed(prev => !prev)}
                theme={THEME}
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
