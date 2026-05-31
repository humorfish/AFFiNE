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
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万字`;
  }
  if (count >= 1000) {
    return `${Math.round(count / 1000)}千字`;
  }
  return `${count}字`;
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

  // Group chapters by volumeId; ungrouped chapters go into a fallback list.
  const chaptersByVolume = useMemo(() => {
    const map = new Map<string, typeof chapters>();
    const ungrouped: typeof chapters = [];

    for (const vol of volumes) {
      map.set(vol.id, []);
    }
    for (const ch of chapters) {
      if (ch.volumeId && map.has(ch.volumeId)) {
        map.get(ch.volumeId)?.push(ch);
      } else {
        ungrouped.push(ch);
      }
    }
    return { map, ungrouped };
  }, [volumes, chapters]);

  // Sort volumes by order, sort chapters within each volume by order.
  const sortedVolumes = useMemo(
    () => [...volumes].sort((a, b) => a.order - b.order),
    [volumes]
  );

  const sortedChapters = useMemo(
    () => [...chapters].sort((a, b) => a.order - b.order),
    [chapters]
  );

  // Build a lookup from chapter id to its sequential index for onSelectChapter.
  const chapterIndexLookup = useMemo(() => {
    const lookup = new Map<string, number>();
    sortedChapters.forEach((ch, idx) => lookup.set(ch.id, idx));
    return lookup;
  }, [sortedChapters]);

  // Summary stats
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: theme.panel,
      }}
    >
      {/* Header row */}
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            color: theme.text,
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          {'\u{1F4D6}'} 章节管理
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {isTreeMode && (
            <button
              onClick={onAddVolume}
              title="新建卷"
              style={iconBtnStyle(theme)}
            >
              {'\u{1F4C1}'}
            </button>
          )}
          <button
            onClick={onAddChapter}
            title="新建章节"
            style={iconBtnStyle(theme)}
          >
            +
          </button>
        </div>
      </div>

      {/* Scrollable list area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 8px',
        }}
      >
        {isTreeMode
          ? // Tree mode: volumes containing chapters
            sortedVolumes.map(vol => {
              const volChapters = chaptersByVolume.map.get(vol.id) ?? [];
              const isExpanded = expandedVolumes.includes(vol.id);
              const volWordCount = volChapters.reduce(
                (sum, ch) => sum + ch.wordCount,
                0
              );

              return (
                <div key={vol.id} style={{ marginBottom: '4px' }}>
                  {/* Volume node */}
                  <div
                    onClick={() => handleToggleVolume(vol.id)}
                    style={{
                      padding: '6px 8px',
                      fontWeight: 500,
                      fontSize: '13px',
                      color: theme.text,
                      cursor: 'pointer',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      userSelect: 'none',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background =
                        'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span
                        style={{ fontSize: '10px', color: theme.textMuted }}
                      >
                        {isExpanded ? '\u{25BC}' : '\u{25B6}'}
                      </span>
                      {vol.title}
                    </span>
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>
                      {volChapters.length}章
                      {volWordCount > 0
                        ? ` · ${formatWordCount(volWordCount)}`
                        : ''}
                    </span>
                  </div>

                  {/* Chapter nodes (indented) */}
                  {isExpanded &&
                    [...volChapters]
                      .sort((a, b) => a.order - b.order)
                      .map(ch => {
                        const idx = chapterIndexLookup.get(ch.id) ?? -1;
                        const isActive = activeChapterIndex === idx;

                        return (
                          <div
                            key={ch.id}
                            onClick={() => onSelectChapter(idx)}
                            style={{
                              padding: '5px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              margin: '1px 0',
                              marginLeft: '18px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '12px',
                              color: isActive ? '#ffffff' : theme.textMuted,
                              background: isActive
                                ? theme.active
                                : 'transparent',
                              transition: 'background 0.15s, color 0.15s',
                              userSelect: 'none',
                            }}
                            onMouseEnter={e => {
                              if (!isActive) {
                                e.currentTarget.style.background =
                                  'rgba(255,255,255,0.05)';
                                e.currentTarget.style.color = theme.text;
                              }
                            }}
                            onMouseLeave={e => {
                              if (!isActive) {
                                e.currentTarget.style.background =
                                  'transparent';
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
                                marginRight: '8px',
                              }}
                            >
                              {ch.title}
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                flexShrink: 0,
                                opacity: isActive ? 0.8 : 0.6,
                              }}
                            >
                              {formatWordCount(ch.wordCount)}
                            </span>
                          </div>
                        );
                      })}
                </div>
              );
            })
          : // Flat mode: simple chapter list
            sortedChapters.map((ch, idx) => {
              const isActive = activeChapterIndex === idx;

              return (
                <div
                  key={ch.id}
                  onClick={() => onSelectChapter(idx)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    margin: '1px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: isActive ? '#ffffff' : theme.textMuted,
                    background: isActive ? theme.active : 'transparent',
                    transition: 'background 0.15s, color 0.15s',
                    userSelect: 'none',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.background =
                        'rgba(255,255,255,0.05)';
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
                      marginRight: '8px',
                    }}
                  >
                    {ch.title}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      flexShrink: 0,
                      opacity: isActive ? 0.8 : 0.6,
                    }}
                  >
                    {formatWordCount(ch.wordCount)}
                  </span>
                </div>
              );
            })}

        {chapters.length === 0 && (
          <div
            style={{
              color: theme.textMuted,
              fontSize: '12px',
              textAlign: 'center',
              padding: '20px 0',
              opacity: 0.6,
            }}
          >
            暂无章节
          </div>
        )}
      </div>

      {/* Footer row */}
      <div
        style={{
          borderTop: `1px solid ${theme.border}`,
          padding: '6px 12px',
          fontSize: '11px',
          color: theme.textMuted,
          textAlign: 'center',
          userSelect: 'none',
        }}
      >
        {isTreeMode
          ? `${volumes.length} 卷 · ${chapters.length} 章 · ${formatWordCount(totalWordCount)}`
          : `${chapters.length} 章 · ${formatWordCount(totalWordCount)}`}
      </div>
    </div>
  );
};

function iconBtnStyle(theme: {
  border: string;
  textMuted: string;
}): React.CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: '2px 6px',
    fontSize: '14px',
    color: theme.textMuted,
    lineHeight: 1,
    transition: 'background 0.15s',
  };
}
