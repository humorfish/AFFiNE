import { useCallback, useState } from 'react';

import './story-layout.css';

import { StoryAIPanel } from './story-ai-panel';
import { ChaptersDialog } from './chapters-dialog';
import { StoryProvider } from './story-context';
import { StoryEditorPanel } from './story-editor-panel';
import { StorySidebar, NAV_ITEMS } from './story-sidebar';
import { NewProjectDialog } from './new-project-dialog';
import { PlaceholderDialog } from './placeholder-dialog';
import { SettingsDialog } from './settings-dialog';
import { WorkspaceProvider } from './workspace-provider';

const THEME = {
  background: '#1a1a2e',
  panel: '#16162a',
  active: '#6c5ce7',
  text: '#e0e0e0',
  textMuted: '#8888aa',
  border: '#2a2a4a',
};

export const StoryLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiPanelCollapsed, setAiPanelCollapsed] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const handleFocusToggle = useCallback(() => {
    setFocusMode(prev => !prev);
  }, []);

  // In focus mode, hide both sidebars
  const showSidebar = !focusMode;
  const showAIPanel = !focusMode && !aiPanelCollapsed;

  return (
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
            theme={THEME}
          />
          {showAIPanel && (
            <StoryAIPanel
              onToggleCollapse={() => setAiPanelCollapsed(prev => !prev)}
              theme={THEME}
            />
          )}
          {/* Toggle button for AI panel when collapsed and not in focus mode */}
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

        {/* Dialogs */}
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
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100%',
    width: '100%',
    background: '#1a1a2e',
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
    border: '1px solid #2a2a4a',
    borderRadius: '6px 0 0 6px',
    padding: '8px 6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    zIndex: 10,
  },
};
