export interface StoryTopBarProps {
  activeNovel: { title: string } | null;
  hasNovels: boolean;
  activeNavId: string | null;
  onNavClick: (id: string) => void;
  onNovelAction: () => void;
  focusMode: boolean;
  onFocusToggle: () => void;
  aiPanelOpen: boolean;
  onAiPanelToggle: () => void;
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
}

const NAV_ITEMS = [
  { id: 'characters', label: '人物', icon: '👤' },
  { id: 'worldview', label: '世界观', icon: '🌍' },
  { id: 'roadmap', label: '路线图', icon: '📈' },
  { id: 'sparks', label: '火花', icon: '✨' },
  { id: 'graph', label: '图谱', icon: '🕸' },
];

const ACTION_ITEMS = [
  { id: 'todo', label: '📋 待办' },
  { id: 'sync', label: '🔄 同步' },
  { id: 'stats', label: '📊 统计' },
  { id: 'versions', label: '📁 版本' },
  { id: 'export', label: '📤 导出' },
  { id: 'settings', label: '⚙ 设置' },
];

const noDrag: React.CSSProperties = {
  WebkitAppRegion: 'no-drag',
};

export const StoryTopBar = ({
  hasNovels,
  activeNavId,
  onNavClick,
  onNovelAction,
  focusMode,
  onFocusToggle,
  aiPanelOpen,
  onAiPanelToggle,
  sidebarCollapsed,
  onSidebarToggle,
}: StoryTopBarProps) => {
  return (
    <div
      style={{
        height: 38,
        flexShrink: 0,
        background: 'var(--affine-background-secondary-color, #16162a)',
        borderBottom: '1px solid var(--affine-border-color)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px 0 78px',
        gap: 4,
        position: 'relative',
        zIndex: 1,
        fontSize: 14,
      }}
    >
      {/* Left: sidebar toggle + novel action */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
      >
        <button
          onClick={onSidebarToggle}
          title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          style={{
            ...noDrag,
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            color: 'var(--affine-text-primary-color)',
            cursor: 'pointer',
            padding: '4px 6px',
            display: 'flex',
            alignItems: 'center',
            fontSize: 14,
            transition: 'background 0.15s',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>

        <button
          onClick={onNovelAction}
          className={!hasNovels ? 'story-create-novel-btn' : undefined}
          style={{
            ...noDrag,
            background: 'transparent',
            border: 'none',
            borderRadius: 4,
            color: 'var(--affine-primary-color, #6c5ce7)',
            cursor: 'pointer',
            padding: '4px 10px',
            fontSize: 14,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            lineHeight: '22px',
            transition: 'background 0.15s',
          }}
        >
          {hasNovels ? '切换小说' : '创建小说'}
        </button>
      </div>

      {/* Center: nav items */}
      <div
        style={{
          display: 'flex',
          gap: 1,
          flex: 1,
          justifyContent: 'center',
        }}
      >
        {NAV_ITEMS.map(item => {
          const isActive = activeNavId === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavClick(item.id)}
              style={{
                ...noDrag,
                background: isActive
                  ? 'var(--affine-primary-color, #6c5ce7)'
                  : 'transparent',
                color: isActive ? 'white' : 'var(--affine-text-primary-color)',
                border: 'none',
                borderRadius: 3,
                padding: '3px 8px',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                transition: 'background 0.15s, color 0.15s',
                whiteSpace: 'nowrap',
                lineHeight: '22px',
              }}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexShrink: 0,
        }}
      >
        {ACTION_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavClick(item.id)}
            style={{
              ...noDrag,
              background: 'transparent',
              color: 'var(--affine-text-primary-color)',
              border: 'none',
              borderRadius: 3,
              padding: '3px 6px',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 0.15s',
              whiteSpace: 'nowrap',
              lineHeight: '22px',
            }}
          >
            {item.label}
          </button>
        ))}

        <div
          style={{
            width: 1,
            height: 16,
            background: 'var(--affine-border-color)',
            margin: '0 4px',
          }}
        />

        <button
          onClick={onFocusToggle}
          style={{
            ...noDrag,
            background: focusMode
              ? 'var(--affine-primary-color, #6c5ce7)'
              : 'transparent',
            color: focusMode ? 'white' : 'var(--affine-text-primary-color)',
            border: 'none',
            borderRadius: 3,
            padding: '3px 8px',
            fontSize: 13,
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
            whiteSpace: 'nowrap',
            lineHeight: '22px',
          }}
        >
          专注
        </button>

        <button
          onClick={onAiPanelToggle}
          style={{
            ...noDrag,
            background: aiPanelOpen
              ? 'var(--affine-primary-color, #6c5ce7)'
              : 'transparent',
            color: aiPanelOpen ? 'white' : 'var(--affine-text-primary-color)',
            border: 'none',
            borderRadius: 3,
            padding: '3px 8px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
            whiteSpace: 'nowrap',
            lineHeight: '22px',
          }}
        >
          AI
        </button>
      </div>
    </div>
  );
};
