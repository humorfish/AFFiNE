import React, { useCallback, useMemo, useState } from 'react';

import { Modal } from './modal';

export interface ChapterNode {
  id: string;
  parentId: string | null;
  title: string;
  wordCount: number;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoryChapterTreeProps {
  chapters: ChapterNode[];
  activeChapterId: string;
  novelMode: 'long' | 'short';
  dirtyChapterIds: Set<string>;
  onSelectChapter: (id: string) => void;
  onAddChapter: (parentId?: string | null) => void;
  onDeleteChapter: (id: string) => void;
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
  chapters,
  activeChapterId,
  novelMode,
  dirtyChapterIds,
  onSelectChapter,
  onAddChapter,
  onDeleteChapter,
  theme,
}) => {
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
    childCount: number;
  } | null>(null);

  const { roots, childrenMap } = useMemo(() => {
    const roots: ChapterNode[] = [];
    const childrenMap = new Map<string, ChapterNode[]>();
    for (const ch of chapters) {
      if (ch.parentId == null) {
        roots.push(ch);
      } else {
        let list = childrenMap.get(ch.parentId);
        if (!list) {
          list = [];
          childrenMap.set(ch.parentId, list);
        }
        list.push(ch);
      }
    }
    roots.sort((a, b) => a.order - b.order);
    for (const list of childrenMap.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return { roots, childrenMap };
  }, [chapters]);

  const totalWordCount = useMemo(
    () => chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
    [chapters]
  );

  // Calculate display numbering: parent uses parent sequence, child uses child sequence
  const numberingMap = useMemo(() => {
    const map = new Map<string, string>();
    roots.forEach((root, parentIdx) => {
      const parentNum = parentIdx + 1;
      map.set(root.id, String(parentNum));
      const children = childrenMap.get(root.id) ?? [];
      children.forEach((child, childIdx) => {
        map.set(child.id, `${parentNum}-${childIdx + 1}`);
      });
    });
    return map;
  }, [roots, childrenMap]);

  const getDescendantCount = useCallback(
    (parentId: string): number => {
      const kids = childrenMap.get(parentId) ?? [];
      let count = kids.length;
      for (const kid of kids) {
        count += getDescendantCount(kid.id);
      }
      return count;
    },
    [childrenMap]
  );

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      onDeleteChapter(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, onDeleteChapter]);

  // Long novel: max 2 levels → can add child only at depth 0
  // Short novel: max 1 level → never add child from row button
  const canAddChild = (depth: number) => {
    if (novelMode === 'short') return false;
    return depth === 0;
  };

  const getDisplayTitle = (ch: ChapterNode) => {
    const num = numberingMap.get(ch.id) ?? '';
    return ch.title ? `${ch.title} ${num}` : `章节 ${num}`;
  };

  const renderChapter = (ch: ChapterNode, depth: number) => {
    const isActive = activeChapterId === ch.id;
    const isDirty = dirtyChapterIds.has(ch.id);

    return (
      <div key={ch.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: `3px 8px 3px ${12 + depth * 16}px`,
            borderRadius: 3,
            margin: '1px 0',
            fontSize: 12,
            lineHeight: '20px',
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
            onClick={() => onSelectChapter(ch.id)}
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              marginRight: 6,
              cursor: 'pointer',
            }}
          >
            {getDisplayTitle(ch)}
          </span>
          {isDirty && (
            <span
              style={{
                fontSize: 9,
                color: '#f0a030',
                marginRight: 4,
                flexShrink: 0,
              }}
            >
              未保存
            </span>
          )}
          <span
            style={{
              fontSize: 10,
              flexShrink: 0,
              opacity: 0.5,
              marginRight: 4,
            }}
          >
            {ch.wordCount > 0 ? formatWordCount(ch.wordCount) : ''}
          </span>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            {canAddChild(depth) && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onAddChapter(ch.id);
                }}
                title="添加子章节"
                style={treeBtnStyle}
              >
                +
              </button>
            )}
            <button
              onClick={e => {
                e.stopPropagation();
                setDeleteTarget({
                  id: ch.id,
                  title: getDisplayTitle(ch),
                  childCount: getDescendantCount(ch.id),
                });
              }}
              title="删除"
              style={treeBtnStyle}
            >
              ×
            </button>
          </div>
        </div>

        {/* Children */}
        {(childrenMap.get(ch.id) ?? []).map(child =>
          renderChapter(child, depth + 1)
        )}
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
          章节管理
        </span>
        <button
          onClick={() => onAddChapter(null)}
          title="新建一级章节"
          style={iconBtn(theme)}
        >
          +
        </button>
      </div>

      {/* Scrollable tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
        {roots.map(ch => renderChapter(ch, 0))}

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
        {chapters.length} 章
        {totalWordCount > 0 ? ` · ${formatWordCount(totalWordCount)}` : ''}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="删除确认"
        width={400}
      >
        <div style={{ color: '#e0e0e0', fontSize: 14, lineHeight: 1.6 }}>
          <p>
            章节「{deleteTarget?.title}」和章节下的所有文档都会被删除，请确认？
          </p>
          {deleteTarget && deleteTarget.childCount > 0 && (
            <p style={{ color: '#e74c3c', fontSize: 12, marginTop: 8 }}>
              该章节下有 {deleteTarget.childCount} 个子章节也将被一并删除
            </p>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 20,
          }}
        >
          <button onClick={() => setDeleteTarget(null)} style={btnCancelStyle}>
            取消
          </button>
          <button onClick={handleConfirmDelete} style={btnDeleteStyle}>
            确认删除
          </button>
        </div>
      </Modal>
    </div>
  );
};

const treeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 2,
  cursor: 'pointer',
  padding: '0 3px',
  fontSize: 12,
  lineHeight: '18px',
  color: 'inherit',
  opacity: 0.6,
};

function iconBtn(theme: { textMuted: string }): React.CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '1px 4px',
    fontSize: 14,
    color: theme.textMuted,
    lineHeight: 1,
  };
}

const btnCancelStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  border: '1px solid #2a2a4a',
  borderRadius: 6,
  color: '#8888aa',
  cursor: 'pointer',
  fontSize: 13,
};

const btnDeleteStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#e74c3c',
  border: 'none',
  borderRadius: 6,
  color: '#ffffff',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
