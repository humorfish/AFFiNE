import { useStory } from './story-context';

interface StorySidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavClick: (id: string) => void;
  onNewProject: () => void;
  theme: {
    background: string;
    panel: string;
    active: string;
    text: string;
    textMuted: string;
    border: string;
  };
}

export const NAV_ITEMS = [
  { id: 'chapters', label: '章节管理', icon: '\u{1F4D6}' },
  { id: 'characters', label: '人物', icon: '\u{1F464}' },
  { id: 'worldview', label: '世界观', icon: '\u{1F30D}' },
  { id: 'roadmap', label: '路线图', icon: '\u{1F4C8}' },
  { id: 'sparks', label: '火花', icon: '\u{2728}' },
  { id: 'graph', label: '图谱', icon: '\u{1F578}' },
  { id: 'settings', label: '设置', icon: '\u{2699}' },
] as const;

export const StorySidebar = ({
  collapsed,
  onToggleCollapse,
  onNavClick,
  onNewProject,
  theme,
}: StorySidebarProps) => {
  const { project } = useStory();

  const width = collapsed ? 60 : 240;

  return (
    <div
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        background: theme.panel,
        borderRight: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Project name area */}
      <div
        onClick={project ? undefined : onNewProject}
        style={{
          padding: collapsed ? '12px 8px' : '12px 16px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: project ? 'default' : 'pointer',
        }}
      >
        <span style={{ fontSize: '18px' }}>&#128214;</span>
        {!collapsed && (
          <span
            style={{
              color: theme.text,
              fontSize: '14px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {project ? project.meta.title : '未打开项目'}
          </span>
        )}
      </div>

      {/* Navigation */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => onNavClick(item.id)}
            title={collapsed ? item.label : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: collapsed ? '10px 8px' : '10px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 400,
              background: 'transparent',
              color: theme.textMuted,
              transition: 'background 0.15s, color 0.15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
              marginBottom: '2px',
            }}
          >
            <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        style={{
          borderTop: `1px solid ${theme.border}`,
          padding: '8px',
          background: 'transparent',
          border: 'none',
          color: theme.textMuted,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
        }}
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        {collapsed ? '\u{25B6}' : '\u{25C0}'}
      </button>
    </div>
  );
};
