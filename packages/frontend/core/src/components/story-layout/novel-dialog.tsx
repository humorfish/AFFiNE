import { useCallback, useEffect, useState } from 'react';

import { Modal } from './modal';
import type { NovelMeta } from './story-context';

interface NovelDialogProps {
  open: boolean;
  onClose: () => void;
  novels: NovelMeta[];
  activeNovelId: string;
  onCreate: (novel: {
    title: string;
    mode: 'long' | 'short';
    targetWordCount?: number;
    targetChapterCount?: number;
    worldview: string;
    motivation?: string;
  }) => void;
  onUpdate: (
    id: string,
    novel: {
      title: string;
      mode: 'long' | 'short';
      targetWordCount?: number;
      targetChapterCount?: number;
      worldview: string;
      motivation?: string;
    }
  ) => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
}

export function NovelDialog({
  open,
  onClose,
  novels,
  activeNovelId,
  onCreate,
  onUpdate,
  onSwitch,
}: NovelDialogProps) {
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [novelMode, setNovelMode] = useState<'long' | 'short'>('long');
  const [targetWordCount, setTargetWordCount] = useState<number | string>('');
  const [targetChapterCount, setTargetChapterCount] = useState<number | string>(
    ''
  );
  const [worldview, setWorldview] = useState('');
  const [motivation, setMotivation] = useState('');

  const resetForm = useCallback(() => {
    setTitle('');
    setNovelMode('long');
    setTargetWordCount('');
    setTargetChapterCount('');
    setWorldview('');
    setMotivation('');
  }, []);

  const switchToCreate = useCallback(() => {
    setMode('create');
    setEditingId(null);
    resetForm();
  }, [resetForm]);

  const switchToEdit = useCallback((novel: NovelMeta) => {
    setMode('edit');
    setEditingId(novel.id);
    setTitle(novel.title);
    setNovelMode(novel.mode);
    setTargetWordCount(novel.targetWordCount ?? '');
    setTargetChapterCount(novel.targetChapterCount ?? '');
    setWorldview(novel.worldview);
    setMotivation(novel.motivation ?? '');
  }, []);

  // When dialog opens, default to editing current novel (or create if none)
  useEffect(() => {
    if (!open) return;
    const current = novels.find(n => n.id === activeNovelId);
    if (current) {
      switchToEdit(current);
    } else {
      switchToCreate();
    }
  }, [open, novels, activeNovelId, switchToEdit, switchToCreate]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        onClose();
        setTimeout(() => {
          setMode('create');
          setEditingId(null);
          resetForm();
        }, 200);
      }
    },
    [onClose, resetForm]
  );

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !worldview.trim()) return;

    const data = {
      title: title.trim(),
      mode: novelMode,
      targetWordCount:
        typeof targetWordCount === 'number' ? targetWordCount : undefined,
      targetChapterCount:
        typeof targetChapterCount === 'number' ? targetChapterCount : undefined,
      worldview: worldview.trim(),
      motivation: motivation.trim() || undefined,
    };

    if (mode === 'edit' && editingId) {
      onUpdate(editingId, data);
    } else {
      onCreate(data);
    }
    onClose();
    setTimeout(() => {
      setMode('create');
      setEditingId(null);
      resetForm();
    }, 200);
  }, [
    title,
    novelMode,
    targetWordCount,
    targetChapterCount,
    worldview,
    motivation,
    mode,
    editingId,
    onCreate,
    onUpdate,
    onClose,
    resetForm,
  ]);

  const canSubmit = title.trim() && worldview.trim();

  const sortedNovels = [...novels].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <Modal
      open={open}
      onClose={() => handleOpenChange(false)}
      title={mode === 'edit' ? '编辑小说信息' : '创建新小说'}
      titleExtra={
        mode === 'edit' ? (
          <button onClick={switchToCreate} style={createBtnStyle}>
            创建新小说
          </button>
        ) : null
      }
      width={680}
    >
      <div style={{ display: 'flex', gap: 16, minHeight: 400 }}>
        {/* Left: form */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#8888aa', fontSize: 12, fontWeight: 600 }}>
              小说名称 <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="输入小说名称"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#8888aa', fontSize: 12, fontWeight: 600 }}>
              模式 <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setNovelMode('long')}
                style={{
                  ...modeButtonStyle,
                  background: novelMode === 'long' ? '#6c5ce7' : 'transparent',
                }}
              >
                长篇
              </button>
              <button
                onClick={() => setNovelMode('short')}
                style={{
                  ...modeButtonStyle,
                  background: novelMode === 'short' ? '#6c5ce7' : 'transparent',
                }}
              >
                短篇
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#8888aa', fontSize: 12, fontWeight: 600 }}>
              预计字数
            </label>
            <input
              type="number"
              value={targetWordCount}
              onChange={e =>
                setTargetWordCount(
                  e.target.value ? parseInt(e.target.value) : ''
                )
              }
              placeholder="例: 200000"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#8888aa', fontSize: 12, fontWeight: 600 }}>
              预计章节数
            </label>
            <input
              type="number"
              value={targetChapterCount}
              onChange={e =>
                setTargetChapterCount(
                  e.target.value ? parseInt(e.target.value) : ''
                )
              }
              placeholder="例: 100"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#8888aa', fontSize: 12, fontWeight: 600 }}>
              世界观 <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <textarea
              value={worldview}
              onChange={e => setWorldview(e.target.value)}
              placeholder="描述小说的世界设定、时代背景、核心规则..."
              style={{
                ...inputStyle,
                resize: 'vertical' as const,
                minHeight: 80,
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#8888aa', fontSize: 12, fontWeight: 600 }}>
              写作初衷
            </label>
            <textarea
              value={motivation}
              onChange={e => setMotivation(e.target.value)}
              placeholder="为什么写这个故事..."
              style={{
                ...inputStyle,
                resize: 'vertical' as const,
                minHeight: 60,
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={() => handleOpenChange(false)}
              style={btnSecondary}
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                ...btnPrimary,
                opacity: canSubmit ? 1 : 0.5,
              }}
            >
              {mode === 'edit' ? '保存' : '创建'}
            </button>
          </div>
        </div>

        {/* Right: novel list */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            borderLeft: '1px solid #333366',
            paddingLeft: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            overflowY: 'auto',
            maxHeight: 500,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#8888aa',
              marginBottom: 8,
            }}
          >
            已有小说
          </div>
          {sortedNovels.length === 0 && (
            <div style={{ color: '#666', fontSize: 12 }}>暂无小说</div>
          )}
          {sortedNovels.map((novel, idx) => {
            const isEditing = editingId === novel.id;
            const isActive = novel.id === activeNovelId;
            return (
              <div key={novel.id}>
                {idx > 0 && (
                  <div
                    style={{
                      height: 1,
                      background: '#333366',
                      margin: '6px 0',
                    }}
                  />
                )}
                <div
                  style={{
                    padding: '8px',
                    borderRadius: 6,
                    background: isActive
                      ? 'rgba(108, 92, 231, 0.15)'
                      : 'rgba(255,255,255,0.03)',
                    borderLeft: isActive
                      ? '3px solid #6c5ce7'
                      : '3px solid transparent',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: isEditing ? '#e0e0e0' : '#ccc',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {novel.title}
                  </div>
                  <div style={{ marginTop: 4, marginBottom: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 3,
                        background:
                          novel.mode === 'long'
                            ? 'rgba(108, 92, 231, 0.3)'
                            : 'rgba(46, 204, 113, 0.3)',
                        color: novel.mode === 'long' ? '#a29bfe' : '#6dd5a0',
                      }}
                    >
                      {novel.mode === 'long' ? '长篇' : '短篇'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => switchToEdit(novel)}
                      style={listBtnStyle}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => {
                        onSwitch(novel.id);
                        onClose();
                      }}
                      style={listBtnStyle}
                    >
                      切换
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
  width: '100%',
  boxSizing: 'border-box',
};

const modeButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  border: '1px solid #333366',
  borderRadius: 6,
  color: '#e0e0e0',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
};

const createBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: '#6c5ce7',
  border: 'none',
  borderRadius: 4,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  background: '#6c5ce7',
  border: 'none',
  borderRadius: 6,
  color: '#ffffff',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
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

const listBtnStyle: React.CSSProperties = {
  padding: '3px 10px',
  background: 'rgba(108, 92, 231, 0.15)',
  border: '1px solid rgba(108, 92, 231, 0.3)',
  borderRadius: 3,
  color: '#bbb',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 500,
};
