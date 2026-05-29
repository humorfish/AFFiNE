import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { Modal } from './modal';

const STORAGE_KEY = 'story-workspace-path';

interface WorkspaceContextValue {
  workspacePath: string | null;
  setWorkspacePath: (path: string) => void;
  isReady: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspacePath, setWorkspacePathState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );

  const setWorkspacePath = useCallback((path: string) => {
    localStorage.setItem(STORAGE_KEY, path);
    setWorkspacePathState(path);
  }, []);

  const isReady = workspacePath !== null;

  const value = useMemo(
    () => ({ workspacePath, setWorkspacePath, isReady }),
    [workspacePath, setWorkspacePath, isReady]
  );

  if (!isReady) {
    return (
      <WorkspaceContext.Provider value={value}>
        <WorkspacePickerModal onSelect={setWorkspacePath} />
      </WorkspaceContext.Provider>
    );
  }

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

function WorkspacePickerModal({ onSelect }: { onSelect: (path: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [customPath, setCustomPath] = useState('');

  const handleBrowse = useCallback(async () => {
    setError(null);
    try {
      const { apis } = await import('@affine/electron-api');
      // Use helper.showOpenDialog via IPC
      const result = await (apis as any)?.helper?.showOpenDialog?.({
        properties: ['openDirectory', 'createDirectory'],
        title: '选择工作区目录',
      });
      if (result?.filePaths?.length > 0) {
        onSelect(result.filePaths[0]);
      }
    } catch {
      setError('无法打开文件选择器，请手动输入路径');
    }
  }, [onSelect]);

  const handleManualSet = useCallback(() => {
    if (!customPath.trim()) {
      setError('请输入目录路径');
      return;
    }
    onSelect(customPath.trim());
  }, [customPath, onSelect]);

  return (
    <Modal open={true} onClose={() => {}} title="选择工作区" dismissible={false}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ color: '#8888aa', fontSize: 14 }}>
          欢迎使用 Story！请选择一个目录作为你的工作区，所有项目数据将保存在此目录中。
        </div>
        <button
          onClick={handleBrowse}
          style={{
            padding: '12px 20px',
            background: '#6c5ce7',
            border: 'none',
            borderRadius: 8,
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          选择目录...
        </button>
        <div style={{ color: '#8888aa', fontSize: 12, textAlign: 'center' }}>
          或者手动输入路径：
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={customPath}
            onChange={e => setCustomPath(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleManualSet();
            }}
            placeholder="/Users/me/story-workspace"
            style={{
              flex: 1,
              padding: '8px 12px',
              background: '#0f0f23',
              border: '1px solid #333366',
              borderRadius: 6,
              color: '#e0e0e0',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={handleManualSet}
            style={{
              padding: '8px 16px',
              background: '#6c5ce7',
              border: 'none',
              borderRadius: 6,
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            确认
          </button>
        </div>
        {error && <div style={{ color: '#e74c3c', fontSize: 13 }}>{error}</div>}
      </div>
    </Modal>
  );
}