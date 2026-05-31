import React, { useMemo } from 'react';

export interface StoryChapterTreeProps {
  volumes: { id: string; title: string; order: number }[];
  chapters: {
    id: string;
    docId: string;
    volumeId?: string;
    title: string;
    wordCount: number;
    order: number;
    createdAt: string;
    updatedAt: string;
  }[];
  activeChapterIndex: number;
  expandedVolumes: string[];
  onExpandedVolumesChange: (ids: string[]) => void;
  onSelectChapter: (index: number) => void;
  onAddChapter: () => void;
  onAddVolume: () => void;
  theme: {
    panel: string;
    text: string;
    textMuted: string;
    border: string;
    active: string;
  };
}

function formatWordCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
  if (count >= 1000) return `${Math.round(count / 1000)}千`;
  return `${count}`;
}

export const StoryChapterTree: React.FC<StoryChapterTreeProps> = ({
  volumes,
  chapters,
  activeChapterIndex,
  expandedVolumes,
  onExpandedVolumesChange,
  onSelectChapter,
  onAddChapter,
  onAddVolume,
  theme,
}) => {
  const isTreeMode = volumes.length > 0;

  const chaptersByVolume = useMemo(() => {
    const map = new Map<string, typeof chapters>();
    const ungrouped: typeof chapters = [];
    for (const vol of volumes) map.set(vol.id, []);
    for (const ch of chapters) {
      if (ch.volumeId && map.has(ch.volumeId)) {
        map.get(ch.volumeId)?.push(ch);
      } else {
        ungrouped.push(ch);
      }
    }
    return { map, ungrouped };
  }, [volumes, chapters]);

  const sortedVolumes = useMemo(
    () => [...volumes].sort((a, b) => a.order - b.order),
    [volumes]
  );

  const sortedChapters = useMemo(
    () => [...chapters].sort((a, b) => a.order - b.order),
    [chapters]
  );

  const chapterIndexLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    sortedChapters.forEach((ch, idx) => lookup.set(ch.id, idx));
    return lookup;
  }, [sortedChapters]);

  const totalWordCount = useMemo(
    () => chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
    [chapters]
  );

  const handleToggleVolume = (volumeId: string) => {
    if (expandedVolumes.includes(volumeId)) {
      onExpandedVolumesChange(expandedVolumes.filter(id => id !== volumeId));
    } else {
      onExpandedVolumesChange([...expandedVolumes, volumeId]);
    }
  };

  const renderChapter = (ch: (typeof chapters)[0], indent = false) => {
    const idx = chapterIndexLookup.get(ch.id) ?? -1;
    const isActive = activeChapterIndex === idx;
    return (
      <div
        key={ch.id}
        onClick={() => onSelectChapter(idx)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          paddingLeft: indent ? 24 : 8,
          borderRadius: 4,
          cursor: 'pointer',
          margin: '1px 0',
          fontSize: 12,
          lineHeight: '22px',
          color: isActive ? '#fff' : theme.textMuted,
          background: isActive ? theme.active : 'transparent',
          transition: 'background 0.12s, color 0.12s',
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          if (!isActive) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
            e.currentTarget.style.color = theme.text;
          }
        }}
        onMouseLeave={e => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = theme.textMuted;
          }
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            marginRight: 6,
          }}
        >
          {isActive && <span style={{ marginRight: 4, opacity: 0.6 }}>←</span>}
          {ch.title}
        </span>
        <span
          style={{
            fontSize: 10,
            flexShrink: 0,
            opacity: isActive ? 0.8 : 0.5,
          }}
        >
          {ch.wordCount > 0 ? formatWordCount(ch.wordCount) : ''}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: theme.panel,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted }}>
          章节
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {isTreeMode && (
            <button onClick={onAddVolume} title="新建卷" style={iconBtn(theme)}>
              📁
            </button>
          )}
          <button
            onClick={onAddChapter}
            title="新建章节"
            style={iconBtn(theme)}
          >
            +
          </button>
        </div>
      </div>

      {/* Scrollable tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
        {isTreeMode
          ? sortedVolumes.map(vol => {
              const volChapters = chaptersByVolume.map.get(vol.id) ?? [];
              const isExpanded = expandedVolumes.includes(vol.id);
              const volWC = volChapters.reduce((s, c) => s + c.wordCount, 0);

              return (
                <div key={vol.id} style={{ marginBottom: 2 }}>
                  {/* Volume header */}
                  <div
                    onClick={() => handleToggleVolume(vol.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 6px',
                      fontSize: 12,
                      fontWeight: 500,
                      color: theme.text,
                      cursor: 'pointer',
                      borderRadius: 4,
                      userSelect: 'none',
                      lineHeight: '22px',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background =
                        'rgba(255,255,255,0.04)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 9, color: theme.textMuted }}>
                        {isExpanded ? '▼' : '▶'}
                      </span>
                      <span style={{ fontSize: 11 }}>📁</span>
                      <span>{vol.title}</span>
                    </span>
                    <span style={{ fontSize: 10, color: theme.textMuted }}>
                      {volChapters.length > 0
                        ? `${volChapters.length}章${volWC > 0 ? ` · ${formatWordCount(volWC)}` : ''}`
                        : ''}
                    </span>
                  </div>

                  {/* Chapters under volume */}
                  {isExpanded &&
                    [...volChapters]
                      .sort((a, b) => a.order - b.order)
                      .map(ch => renderChapter(ch, true))}
                </div>
              );
            })
          : sortedChapters.map(ch => renderChapter(ch, false))}

        {chapters.length === 0 && (
          <div
            style={{
              color: theme.textMuted,
              fontSize: 11,
              textAlign: 'center',
              padding: '20px 0',
              opacity: 0.5,
            }}
          >
            暂无章节，点击 + 新建
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div
        style={{
          borderTop: `1px solid ${theme.border}`,
          padding: '4px 10px',
          fontSize: 10,
          color: theme.textMuted,
          textAlign: 'center',
          userSelect: 'none',
          lineHeight: '18px',
        }}
      >
        {isTreeMode
          ? `${volumes.length} 卷 · ${chapters.length} 章${totalWordCount > 0 ? ` · ${formatWordCount(totalWordCount)}` : ''}`
          : `${chapters.length} 章${totalWordCount > 0 ? ` · ${formatWordCount(totalWordCount)}` : ''}`}
      </div>
    </div>
  );
};

function iconBtn(theme: {
  border: string;
  textMuted: string;
}): React.CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '1px 4px',
    fontSize: 13,
    color: theme.textMuted,
    lineHeight: 1,
  };
}
