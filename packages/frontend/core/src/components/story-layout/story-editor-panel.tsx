import { useState } from 'react';

interface StoryEditorPanelProps {
  focusMode: boolean;
  onFocusToggle: () => void;
  theme: {
    background: string;
    panel: string;
    active: string;
    text: string;
    textMuted: string;
    border: string;
  };
}

export const StoryEditorPanel = ({
  focusMode,
  onFocusToggle,
  theme,
}: StoryEditorPanelProps) => {
  const [chapterTitle] = useState('第一章：起源');

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: theme.background,
      }}
    >
      {/* Editor header */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            color: theme.text,
            fontSize: '16px',
            fontWeight: 600,
          }}
        >
          {chapterTitle}
        </span>
      </div>

      {/* Editor area - placeholder for BlockSuite */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
        }}
      >
        <div
          style={{
            color: theme.textMuted,
            fontSize: '18px',
            opacity: 0.6,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9997;</div>
          <div>编辑器区域</div>
          <div style={{ fontSize: '14px', marginTop: '8px' }}>
            BlockSuite 编辑器将在 Task 9 接入
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          borderTop: `1px solid ${theme.border}`,
          padding: '8px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '13px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            color: theme.textMuted,
          }}
        >
          <span>字数: 0</span>
          <span style={{ color: theme.border }}>|</span>
          <span>{chapterTitle}</span>
        </div>
        <button
          onClick={onFocusToggle}
          style={{
            padding: '4px 12px',
            borderRadius: '4px',
            border: `1px solid ${theme.border}`,
            background: focusMode ? theme.active : 'transparent',
            color: focusMode ? '#ffffff' : theme.textMuted,
            cursor: 'pointer',
            fontSize: '13px',
            transition: 'background 0.15s, color 0.15s',
          }}
          title={focusMode ? '退出专注模式' : '进入专注模式'}
        >
          {focusMode ? '退出专注' : '专注模式'}
        </button>
      </div>
    </div>
  );
};
