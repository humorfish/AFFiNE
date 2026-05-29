import { useCallback, useState } from 'react';

import { Modal } from './modal';
import { useStory } from './story-context';

interface ChaptersDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ChaptersDialog({ open, onClose }: ChaptersDialogProps) {
  const {
    project,
    chapters,
    activeChapterIndex,
    addChapter,
    selectChapter,
    deleteChapter,
    loading,
    error,
  } = useStory();

  const [newTitle, setNewTitle] = useState('');
  const [showInput, setShowInput] = useState(false);

  const handleAdd = useCallback(async () => {
    if (!newTitle.trim()) return;
    await addChapter(newTitle.trim(), '');
    setNewTitle('');
    setShowInput(false);
  }, [newTitle, addChapter]);

  const handleSelect = useCallback(
    async (index: number) => {
      await selectChapter(index);
      onClose();
    },
    [selectChapter, onClose]
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      if (confirm('确定要删除这个章节吗？')) {
        await deleteChapter(index);
      }
    },
    [deleteChapter]
  );

  return (
    <Modal open={open} onClose={onClose} title="章节管理" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div
            style={{
              padding: 8,
              background: 'rgba(231,76,60,0.15)',
              borderRadius: 4,
              color: '#e74c3c',
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {!project ? (
          <div style={{ color: '#8888aa', textAlign: 'center', padding: 20 }}>
            请先创建或打开一个项目
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              {showInput ? (
                <>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAdd();
                      if (e.key === 'Escape') {
                        setShowInput(false);
                        setNewTitle('');
                      }
                    }}
                    placeholder="章节标题"
                    autoFocus
                    style={{ flex: 1, ...inputStyle }}
                  />
                  <button onClick={handleAdd} disabled={!newTitle.trim()} style={btnPrimary}>
                    添加
                  </button>
                  <button
                    onClick={() => {
                      setShowInput(false);
                      setNewTitle('');
                    }}
                    style={btnSecondary}
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowInput(true)}
                  style={{ ...btnPrimary, width: '100%' }}
                >
                  + 新建章节
                </button>
              )}
            </div>

            {loading && (
              <div style={{ color: '#8888aa', textAlign: 'center', fontSize: 12 }}>
                加载中...
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {chapters.length === 0 ? (
                <div
                  style={{
                    color: '#8888aa',
                    fontSize: 13,
                    textAlign: 'center',
                    padding: 16,
                  }}
                >
                  暂无章节
                </div>
              ) : (
                chapters.map(ch => (
                  <div
                    key={ch.meta.index}
                    onClick={() => handleSelect(ch.meta.index)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      color:
                        activeChapterIndex === ch.meta.index ? '#e0e0e0' : '#8888aa',
                      background:
                        activeChapterIndex === ch.meta.index
                          ? 'rgba(108, 92, 231, 0.15)'
                          : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (activeChapterIndex !== ch.meta.index)
                        e.currentTarget.style.background = 'rgba(108, 92, 231, 0.08)';
                    }}
                    onMouseLeave={e => {
                      if (activeChapterIndex !== ch.meta.index)
                        e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      {ch.meta.title}
                    </span>
                    <button
                      onClick={e => handleDelete(e, ch.meta.index)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#8888aa',
                        cursor: 'pointer',
                        fontSize: 12,
                        opacity: 0.5,
                        flexShrink: 0,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = '#e74c3c';
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = '#8888aa';
                        e.currentTarget.style.opacity = '0.5';
                      }}
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: '#0f0f23',
  border: '1px solid #333366',
  borderRadius: 6,
  color: '#e0e0e0',
  fontSize: 13,
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  background: '#6c5ce7',
  border: 'none',
  borderRadius: 6,
  color: '#ffffff',
  cursor: 'pointer',
  fontSize: 13,
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  border: '1px solid #2a2a4a',
  borderRadius: 6,
  color: '#8888aa',
  cursor: 'pointer',
  fontSize: 13,
};