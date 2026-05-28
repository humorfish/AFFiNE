import { useCallback, useState } from 'react';

interface StorySidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  theme: {
    background: string;
    panel: string;
    active: string;
    text: string;
    textMuted: string;
    border: string;
  };
}

const NAV_ITEMS = [
  { id: 'chapters', label: '章节管理', icon: '\u{1F4D6}' },
  { id: 'characters', label: '人物', icon: '\u{1F464}' },
  { id: 'worldview', label: '世界观', icon: '\u{1F30D}' },
  { id: 'roadmap', label: '路线图', icon: '\u{1F4C8}' },
  { id: 'sparks', label: '火花', icon: '\u{2728}' },
  { id: 'graph', label: '图谱', icon: '\u{1F578}' },
  { id: 'settings', label: '设置', icon: '\u{2699}' },
] as const;

type NavItemId = (typeof NAV_ITEMS)[number]['id'];

export const StorySidebar = ({
  collapsed,
  onToggleCollapse,
  theme,
}: StorySidebarProps) => {
  const [activeItem, setActiveItem] = useState<NavItemId>('chapters');
  const [projectName] = useState('我的小说');

  const handleNavClick = useCallback((id: NavItemId) => {
    setActiveItem(prev => (prev === id ? prev : id));
  }, []);

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
      {/* Project selector */}
      <div
        style={{
          padding: collapsed ? '12px 8px' : '12px 16px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
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
            {projectName}
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
            onClick={() => handleNavClick(item.id)}
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
              fontWeight: activeItem === item.id ? 600 : 400,
              background: activeItem === item.id ? theme.active : 'transparent',
              color: activeItem === item.id ? '#ffffff' : theme.textMuted,
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

      {/* Sub-panel area */}
      {!collapsed && (
        <div
          style={{
            borderTop: `1px solid ${theme.border}`,
            padding: '12px',
            color: theme.textMuted,
            fontSize: '13px',
          }}
        >
          <SubPanel activeItem={activeItem} theme={theme} />
        </div>
      )}

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

const SubPanel = ({
  activeItem,
  theme,
}: {
  activeItem: NavItemId;
  theme: StorySidebarProps['theme'];
}) => {
  switch (activeItem) {
    case 'chapters':
      return (
        <div>
          <div style={{ fontWeight: 600, color: theme.text, marginBottom: 8 }}>
            章节列表
          </div>
          {[
            '第一章：起源',
            '第二章：觉醒',
            '第三章：旅途',
            '第四章：对决',
            '第五章：回归',
          ].map((ch, i) => (
            <div
              key={i}
              style={{
                padding: '6px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                color: theme.textMuted,
                fontSize: '13px',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(108, 92, 231, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {ch}
            </div>
          ))}
        </div>
      );
    case 'characters':
      return (
        <div>
          <div style={{ fontWeight: 600, color: theme.text, marginBottom: 8 }}>
            人物列表
          </div>
          <div style={{ color: theme.textMuted, fontSize: '13px' }}>
            暂无人物（将在 Task 9 接入服务）
          </div>
        </div>
      );
    case 'settings':
      return (
        <div>
          <div style={{ fontWeight: 600, color: theme.text, marginBottom: 8 }}>
            项目设置
          </div>
          <div style={{ color: theme.textMuted, fontSize: '13px' }}>
            前往完整设置页面
          </div>
        </div>
      );
    default:
      return (
        <div style={{ color: theme.textMuted, fontSize: '13px' }}>
          {NAV_ITEMS.find(n => n.id === activeItem)?.label} - 面板开发中
        </div>
      );
  }
};
