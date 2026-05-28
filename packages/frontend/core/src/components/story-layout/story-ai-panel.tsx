import { useCallback, useState } from 'react';

interface StoryAIPanelProps {
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

const AI_ACTIONS = [
  { id: 'continue', label: '续写', icon: '\u{270D}' },
  { id: 'spark', label: '火花', icon: '\u{2728}' },
  { id: 'polish', label: '润色', icon: '\u{2728}' },
  { id: 'analyze', label: '分析', icon: '\u{1F4CA}' },
] as const;

export const StoryAIPanel = ({
  onToggleCollapse,
  theme,
}: StoryAIPanelProps) => {
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const handleActionClick = useCallback((id: string) => {
    setActiveAction(prev => (prev === id ? null : id));
  }, []);

  return (
    <div
      style={{
        width: 320,
        minWidth: 320,
        maxWidth: 320,
        background: theme.panel,
        borderLeft: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: theme.text, fontSize: '14px', fontWeight: 600 }}>
          AI 助手
        </span>
        <button
          onClick={onToggleCollapse}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.textMuted,
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px',
          }}
          title="收起面板"
        >
          &#10005;
        </button>
      </div>

      {/* Action bar */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          gap: '6px',
        }}
      >
        {AI_ACTIONS.map(action => (
          <button
            key={action.id}
            onClick={() => handleActionClick(action.id)}
            style={{
              flex: 1,
              padding: '6px 4px',
              border: `1px solid ${theme.border}`,
              borderRadius: '4px',
              background:
                activeAction === action.id ? theme.active : 'transparent',
              color: activeAction === action.id ? '#ffffff' : theme.textMuted,
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <span style={{ fontSize: '16px' }}>{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Chat area - placeholder */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div
          style={{
            color: theme.textMuted,
            fontSize: '14px',
            opacity: 0.6,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>
            &#129302;
          </div>
          <div>AI 助手面板</div>
          <div style={{ fontSize: '12px', marginTop: '8px' }}>
            AI 功能将在 Task 9 接入 LLMClient
          </div>
        </div>
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: `1px solid ${theme.border}`,
          padding: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: theme.background,
            borderRadius: '6px',
            padding: '8px 12px',
            border: `1px solid ${theme.border}`,
          }}
        >
          <input
            type="text"
            placeholder="输入消息..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: theme.text,
              fontSize: '13px',
            }}
          />
          <button
            style={{
              background: theme.active,
              border: 'none',
              borderRadius: '4px',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: '12px',
            }}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
};
