export interface StoryTopBarProps {
  activeNovel: { title: string } | null;
  activeChapterTitle: string;
  activeNavId: string | null;
  onNavClick: (id: string) => void;
  focusMode: boolean;
  onFocusToggle: () => void;
  aiPanelOpen: boolean;
  onAiPanelToggle: () => void;
}

export const StoryTopBar = ({
  _activeNovel,
  activeChapterTitle,
  activeNavId,
  onNavClick,
  focusMode,
  onFocusToggle,
  aiPanelOpen,
  onAiPanelToggle,
}: StoryTopBarProps) => {
  const navItems = [
    { id: 'chapters', label: '章节管理', icon: '📖' },
    { id: 'characters', label: '人物', icon: '👤' },
    { id: 'worldview', label: '世界观', icon: '🌍' },
    { id: 'roadmap', label: '路线图', icon: '📈' },
    { id: 'sparks', label: '火花', icon: '✨' },
    { id: 'graph', label: '图谱', icon: '🕸' },
  ];

  const actionItems = [
    { id: 'todo', label: '📋 待办' },
    { id: 'sync', label: '🔄 同步' },
    { id: 'stats', label: '📊 统计' },
    { id: 'versions', label: '📁 版本' },
    { id: 'export', label: '📤 导出' },
    { id: 'settings', label: '⚙ 设置' },
  ];

  return (
    <div
      style={{
        height: '38px',
        flexShrink: 0,
        background: 'var(--affine-background-secondary-color, #16162a)',
        borderBottom: `1px solid var(--affine-border-color)`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '16px',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Project Info (Left) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: 'var(--affine-primary-color, #6c5ce7)',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          Story
        </span>
        {activeChapterTitle && (
          <span
            style={{
              color: 'var(--affine-text-secondary-color)',
              fontSize: '14px',
            }}
          >
            {activeChapterTitle}
          </span>
        )}
      </div>

      {/* Navigation Items (Center) */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          flex: 1,
          justifyContent: 'center',
        }}
      >
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNavClick(item.id)}
            style={{
              background:
                activeNavId === item.id
                  ? 'var(--affine-primary-color, #6c5ce7)'
                  : 'transparent',
              color:
                activeNavId === item.id
                  ? 'white'
                  : 'var(--affine-text-primary-color)',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 12px',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'background 0.15s, color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* Action Items (Right) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        {actionItems.map(item => (
          <button
            key={item.id}
            style={{
              background: 'transparent',
              color: 'var(--affine-text-primary-color)',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 12px',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {item.label}
          </button>
        ))}

        {/* Vertical Divider */}
        <div
          style={{
            width: '1px',
            height: '20px',
            background: 'var(--affine-border-color)',
          }}
        />

        {/* Focus Mode Button */}
        <button
          onClick={onFocusToggle}
          style={{
            background: focusMode
              ? 'var(--affine-primary-color, #6c5ce7)'
              : 'transparent',
            color: focusMode ? 'white' : 'var(--affine-text-primary-color)',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 12px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          专注模式
        </button>

        {/* AI Button */}
        <button
          onClick={onAiPanelToggle}
          style={{
            background: aiPanelOpen
              ? 'var(--affine-primary-color, #6c5ce7)'
              : 'transparent',
            color: aiPanelOpen ? 'white' : 'var(--affine-text-primary-color)',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 12px',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          AI
        </button>
      </div>
    </div>
  );
};
