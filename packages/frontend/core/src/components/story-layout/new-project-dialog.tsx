import { useCallback, useState } from 'react';

import { Modal } from './modal';
import { useStory } from './story-context';
import { useWorkspace } from './workspace-provider';

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewProjectDialog({ open, onClose }: NewProjectDialogProps) {
  const { createProject } = useStory();
  const { workspacePath } = useWorkspace();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || !workspacePath) return;
    setSaving(true);
    setError(null);
    try {
      await createProject(
        {
          title: title.trim(),
          author: author.trim() || 'Unknown',
          description: description.trim(),
          wordCountTarget: 100000,
        },
        workspacePath
      );
      onClose();
      setTitle('');
      setAuthor('');
      setDescription('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [title, author, description, workspacePath, createProject, onClose]);

  const canCreate = title.trim() && workspacePath;

  return (
    <Modal open={open} onClose={onClose} title="新建项目">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: '#8888aa', fontSize: 12, fontWeight: 600 }}>小说标题 *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="输入标题"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: '#8888aa', fontSize: 12, fontWeight: 600 }}>作者</label>
          <input
            type="text"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            placeholder="作者名"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: '#8888aa', fontSize: 12, fontWeight: 600 }}>简介</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="简述你的故事..."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' as const }}
          />
        </div>
        <div style={{ color: '#8888aa', fontSize: 12 }}>
          项目将保存至: {workspacePath}/projects/...
        </div>
        {error && <div style={{ color: '#e74c3c', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={btnSecondary}>取消</button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || saving}
            style={{
              ...btnPrimary,
              opacity: canCreate && !saving ? 1 : 0.5,
            }}
          >
            {saving ? '创建中...' : '创建'}
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