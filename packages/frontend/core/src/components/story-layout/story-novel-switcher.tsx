import React from 'react';

interface StoryNovelSwitcherProps {
  novels: { id: string; title: string; mode: 'long' | 'short' }[];
  activeNovelId: string;
  theme: {
    panel: string;
    text: string;
    textMuted: string;
    border: string;
    active: string;
  };
}

export const StoryNovelSwitcher: React.FC<StoryNovelSwitcherProps> = ({
  novels,
  activeNovelId,
  theme,
}) => {
  const activeNovel = novels.find(n => n.id === activeNovelId);

  return (
    <div
      style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${theme.border}`,
        height: 36,
        minHeight: 36,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {activeNovel ? (
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: theme.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: '20px',
          }}
        >
          📖 {activeNovel.title}
        </span>
      ) : (
        <span
          style={{
            fontSize: 12,
            color: theme.textMuted,
            lineHeight: '20px',
          }}
        >
          &nbsp;
        </span>
      )}
    </div>
  );
};
