import { useCallback, useState } from 'react';

import { Modal } from './modal';

interface NewNovelDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (novel: {
    title: string;
    mode: 'long' | 'short';
    targetWordCount?: number;
    targetChapterCount?: number;
    worldview: string;
    motivation?: string;
  }) => void;
}

export function NewNovelDialog({
  open,
  onClose,
  onCreate,
}: NewNovelDialogProps) {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'long' | 'short'>('long');
  const [targetWordCount, setTargetWordCount] = useState<number | string>('');
  const [targetChapterCount, setTargetChapterCount] = useState<number | string>(
    ''
  );
  const [worldview, setWorldview] = useState('');
  const [motivation, setMotivation] = useState('');

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !worldview.trim()) return;

    const novelData = {
      title: title.trim(),
      mode,
      targetWordCount:
        typeof targetWordCount === 'number' ? targetWordCount : undefined,
      targetChapterCount:
        typeof targetChapterCount === 'number' ? targetChapterCount : undefined,
      worldview: worldview.trim(),
      motivation: motivation.trim() || undefined,
    };

    onCreate(novelData);
    // Reset form
    setTitle('');
    setMode('long');
    setTargetWordCount('');
    setTargetChapterCount('');
    setWorldview('');
    setMotivation('');
    onClose();
  }, [
    title,
    mode,
    targetWordCount,
    targetChapterCount,
    worldview,
    motivation,
    onCreate,
    onClose,
  ]);

  const canSubmit = title.trim() && worldview.trim();

  return (
    <Modal open={open} onClose={onClose} title="创建新小说">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              onClick={() => setMode('long')}
              style={{
                ...modeButtonStyle,
                background: mode === 'long' ? '#6c5ce7' : 'transparent',
              }}
            >
              长篇
            </button>
            <button
              onClick={() => setMode('short')}
              style={{
                ...modeButtonStyle,
                background: mode === 'short' ? '#6c5ce7' : 'transparent',
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
              setTargetWordCount(e.target.value ? parseInt(e.target.value) : '')
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
          <button onClick={onClose} style={btnSecondary}>
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
            创建
          </button>
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
