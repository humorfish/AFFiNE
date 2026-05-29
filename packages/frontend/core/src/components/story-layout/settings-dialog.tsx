import { useCallback } from 'react';

import { useWorkspace } from './workspace-provider';
import { Modal } from './modal';
import { LLMSettingsSection } from './settings-page';
import { GitSettingsSection } from './settings-page';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { workspacePath, setWorkspacePath } = useWorkspace();

  return (
    <Modal open={open} onClose={onClose} title="设置" width={640}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <WorkspaceSection
          workspacePath={workspacePath}
          onWorkspaceChange={setWorkspacePath}
        />
        <LLMSettingsSection />
        <GitSettingsSection />
      </div>
    </Modal>
  );
}

function WorkspaceSection({
  workspacePath,
  onWorkspaceChange,
}: {
  workspacePath: string | null;
  onWorkspaceChange: (path: string) => void;
}) {
  const handleBrowse = useCallback(async () => {
    try {
      const { apis } = await import('@affine/electron-api');
      const result = await apis?.dialog?.openDialog?.({
        type: 'folder' as const,
        title: '更改工作区目录',
      });
      if (result && typeof result === 'string') {
        onWorkspaceChange(result);
      } else if (Array.isArray(result) && result.length > 0) {
        onWorkspaceChange(result[0]);
      }
    } catch {
      // fallback: ignore
    }
  }, [onWorkspaceChange]);

  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>工作区</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            flex: 1,
            padding: '10px 14px',
            background: '#0f0f23',
            borderRadius: 8,
            border: '1px solid #333366',
            color: '#e0e0e0',
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {workspacePath ?? '未设置'}
        </div>
        <button
          onClick={handleBrowse}
          style={{
            padding: '10px 16px',
            background: '#6c5ce7',
            border: 'none',
            borderRadius: 8,
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          更改
        </button>
      </div>
    </section>
  );
}

const sectionStyle: React.CSSProperties = {
  background: '#16162a',
  borderRadius: 12,
  padding: 20,
  border: '1px solid #2a2a4a',
};

const sectionTitleStyle: React.CSSProperties = {
  color: '#e0e0e0',
  fontSize: 16,
  fontWeight: 600,
  margin: '0 0 16px 0',
  paddingBottom: 12,
  borderBottom: '1px solid #2a2a4a',
};