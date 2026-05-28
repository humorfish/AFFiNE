import './story-layout.css';

import { useCallback, useState } from 'react';

import { StoryAIPanel } from './story-ai-panel';
import { StoryEditorPanel } from './story-editor-panel';
import { StorySidebar } from './story-sidebar';

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

  const handleFocusToggle = useCallback(() => {
    setFocusMode(prev => !prev);
  }, []);

  // In focus mode, hide both sidebars
  const showSidebar = !focusMode;
  const showAIPanel = !focusMode && !aiPanelCollapsed;

  return (
    <div style={styles.root}>
      {showSidebar && (
        <StorySidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
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
