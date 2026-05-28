import type { LLMProviderConfig } from '@affine/ai';
import { APIKeyStore, LLMClient } from '@affine/ai';
import { useCallback, useEffect, useState } from 'react';

// --- Theme constants (matching story-layout) ---
const THEME = {
  background: '#1a1a2e',
  panel: '#16162a',
  panelHover: '#1e1e3a',
  active: '#6c5ce7',
  text: '#e0e0e0',
  textMuted: '#8888aa',
  border: '#2a2a4a',
  danger: '#e74c3c',
  success: '#2ecc71',
  inputBg: '#0f0f23',
  inputBorder: '#333366',
};

// --- Provider presets ---
const PROVIDER_PRESETS: Record<string, string> = {
  OpenAI: 'https://api.openai.com/v1',
  Anthropic: 'https://api.anthropic.com/v1',
  DeepSeek: 'https://api.deepseek.com/v1',
};

const PROVIDER_OPTIONS = [...Object.keys(PROVIDER_PRESETS), '自定义'];

// --- Git config localStorage keys ---
const GIT_CONFIG_KEY = 'affine-story-git-config';

interface GitConfig {
  username: string;
  email: string;
}

function loadGitConfig(): GitConfig {
  try {
    const raw = localStorage.getItem(GIT_CONFIG_KEY);
    if (raw) return JSON.parse(raw) as GitConfig;
  } catch {
    // ignore
  }
  return { username: '', email: '' };
}

function saveGitConfig(config: GitConfig): void {
  localStorage.setItem(GIT_CONFIG_KEY, JSON.stringify(config));
}

// --- Shared input styles ---
const inputStyle: React.CSSProperties = {
  background: THEME.inputBg,
  border: `1px solid ${THEME.inputBorder}`,
  borderRadius: '6px',
  padding: '8px 12px',
  color: THEME.text,
  fontSize: '13px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  // Ensure dropdown options render with dark background
  colorScheme: 'dark',
};

const buttonPrimary: React.CSSProperties = {
  background: THEME.active,
  border: 'none',
  borderRadius: '6px',
  color: '#ffffff',
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 600,
  transition: 'opacity 0.15s',
};

const buttonSecondary: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${THEME.border}`,
  borderRadius: '6px',
  color: THEME.textMuted,
  cursor: 'pointer',
  padding: '8px 16px',
  fontSize: '13px',
  transition: 'background 0.15s, color 0.15s',
};

const buttonDanger: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${THEME.danger}`,
  borderRadius: '6px',
  color: THEME.danger,
  cursor: 'pointer',
  padding: '4px 10px',
  fontSize: '12px',
  transition: 'background 0.15s',
};

// --- Main component ---
export const SettingsPage = () => {
  return (
    <div style={styles.root}>
      <div style={styles.container}>
        <h1 style={styles.title}>设置</h1>
        <div style={styles.sections}>
          <LLMSettingsSection />
          <GitSettingsSection />
        </div>
      </div>
    </div>
  );
};

// =====================
// Section 1: LLM API 配置
// =====================
const LLMSettingsSection = () => {
  const [keys, setKeys] = useState<LLMProviderConfig[]>(() =>
    APIKeyStore.list()
  );
  const [provider, setProvider] = useState('OpenAI');
  const [baseURL, setBaseURL] = useState(PROVIDER_PRESETS['OpenAI']);
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [testMessage, setTestMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const reloadKeys = useCallback(() => {
    setKeys(APIKeyStore.list());
  }, []);

  // Auto-fill baseURL when provider changes
  const handleProviderChange = useCallback((newProvider: string) => {
    setProvider(newProvider);
    const presetURL = PROVIDER_PRESETS[newProvider];
    setBaseURL(presetURL ?? '');
  }, []);

  // Save a new key
  const handleSave = useCallback(() => {
    if (!baseURL.trim() || !apiKey.trim() || !modelName.trim()) {
      setTestStatus('error');
      setTestMessage('请填写所有必填字段');
      return;
    }

    setSaving(true);
    try {
      APIKeyStore.add({
        provider,
        name: provider === '自定义' ? modelName : provider,
        baseURL: baseURL.trim(),
        apiKey: apiKey.trim(),
        model: modelName.trim(),
      });
      reloadKeys();
      // Reset form
      setApiKey('');
      setModelName('');
      setTestStatus('success');
      setTestMessage('保存成功');
      setTimeout(() => setTestStatus('idle'), 2000);
    } catch {
      setTestStatus('error');
      setTestMessage('保存失败');
    } finally {
      setSaving(false);
    }
  }, [baseURL, apiKey, modelName, provider, reloadKeys]);

  // Delete a key
  const handleDelete = useCallback(
    (id: string) => {
      APIKeyStore.remove(id);
      reloadKeys();
    },
    [reloadKeys]
  );

  // Test connection
  const handleTestConnection = useCallback(async () => {
    if (!baseURL.trim() || !apiKey.trim() || !modelName.trim()) {
      setTestStatus('error');
      setTestMessage('请先填写所有字段');
      return;
    }

    setTestStatus('testing');
    setTestMessage('正在测试连接...');

    try {
      const client = new LLMClient({
        baseURL: baseURL.trim(),
        apiKey: apiKey.trim(),
        model: modelName.trim(),
      });

      // Send a minimal non-streaming test request
      const request = client.buildRequest('Hello', {
        maxTokens: 5,
      });
      const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({ ...request.body, stream: false }),
      });

      if (response.ok) {
        setTestStatus('success');
        setTestMessage('连接成功');
      } else {
        const errorText = await response.text().catch(() => '');
        setTestStatus('error');
        setTestMessage(
          `连接失败 (${response.status}): ${errorText.slice(0, 100)}`
        );
      }
    } catch (err) {
      setTestStatus('error');
      setTestMessage(
        `连接失败: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [baseURL, apiKey, modelName]);

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>LLM API 配置</h2>

      {/* Existing keys list */}
      {keys.length > 0 && (
        <div style={styles.keyList}>
          {keys.map(k => (
            <div key={k.id} style={styles.keyCard}>
              <div style={styles.keyInfo}>
                <div style={styles.keyName}>
                  {k.name} <span style={styles.keyModel}>({k.model})</span>
                </div>
                <div style={styles.keyURL}>{k.baseURL}</div>
              </div>
              <button
                style={buttonDanger}
                onClick={() => handleDelete(k.id)}
                title="删除"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new key form */}
      <div style={styles.form}>
        <div style={styles.formGroup}>
          <label style={styles.label}>服务商</label>
          <select
            value={provider}
            onChange={e => handleProviderChange(e.target.value)}
            style={selectStyle}
          >
            {PROVIDER_OPTIONS.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Base URL</label>
          <input
            type="text"
            value={baseURL}
            onChange={e => setBaseURL(e.target.value)}
            placeholder="https://api.openai.com/v1"
            style={inputStyle}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>API Key</label>
          <div style={styles.inputWithToggle}>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
              style={{ ...inputStyle, flex: 1, paddingRight: 0 }}
            />
            <button
              onClick={() => setShowApiKey(prev => !prev)}
              style={styles.toggleBtn}
              title={showApiKey ? '隐藏' : '显示'}
            >
              {showApiKey ? '隐藏' : '显示'}
            </button>
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>模型名称</label>
          <input
            type="text"
            value={modelName}
            onChange={e => setModelName(e.target.value)}
            placeholder="gpt-4o / claude-3.5-sonnet / deepseek-chat"
            style={inputStyle}
          />
        </div>

        {/* Status message */}
        {testStatus !== 'idle' && (
          <div
            style={{
              ...styles.statusMessage,
              color:
                testStatus === 'success'
                  ? THEME.success
                  : testStatus === 'testing'
                    ? THEME.textMuted
                    : THEME.danger,
            }}
          >
            {testStatus === 'testing' && <span style={styles.spinner} />}
            {testMessage}
          </div>
        )}

        <div style={styles.formActions}>
          <button
            style={{
              ...buttonSecondary,
              opacity: testStatus === 'testing' ? 0.5 : 1,
            }}
            onClick={handleTestConnection}
            disabled={testStatus === 'testing'}
          >
            测试连接
          </button>
          <button
            style={{
              ...buttonPrimary,
              opacity: saving ? 0.5 : 1,
            }}
            onClick={handleSave}
            disabled={saving}
          >
            保存
          </button>
        </div>
      </div>
    </section>
  );
};

// =====================
// Section 2: Git 配置
// =====================
const GitSettingsSection = () => {
  const [gitStatus, setGitStatus] = useState<{
    type: 'loading' | 'found' | 'not_found';
    version?: string;
    error?: string;
  }>({ type: 'loading' });
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);

  // Load git config on mount
  useEffect(() => {
    const savedConfig = loadGitConfig();
    setUsername(savedConfig.username);
    setEmail(savedConfig.email);
  }, []);

  // Detect git version on mount
  useEffect(() => {
    let cancelled = false;
    const detectGit = async () => {
      try {
        // In Electron renderer, we can try running git via the
        // remote/ipc bridge if available, or just check via a fetch-like mechanism.
        // For now, attempt to detect via a simple fetch to check if
        // the Electron main process exposes git info.
        // The actual IPC will be wired in a later task.
        //
        // We use a lightweight approach: try running git --version
        // which works in Electron main but NOT in renderer.
        // In renderer, we'll show a message saying git detection
        // requires the desktop app.
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);
        const { stdout } = await execFileAsync('git', ['--version']);
        if (!cancelled) {
          setGitStatus({ type: 'found', version: stdout.trim() });
        }
      } catch (err) {
        if (!cancelled) {
          setGitStatus({
            type: 'not_found',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };
    detectGit();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(() => {
    saveGitConfig({ username, email });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [username, email]);

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Git 配置</h2>

      {/* Git detection status */}
      <div style={styles.gitStatusCard}>
        <div style={styles.gitStatusLabel}>Git 状态</div>
        {gitStatus.type === 'loading' && (
          <div style={{ color: THEME.textMuted }}>
            <span style={styles.spinner} /> 正在检测 Git...
          </div>
        )}
        {gitStatus.type === 'found' && (
          <div style={{ color: THEME.success }}>
            已检测到 Git: {gitStatus.version}
          </div>
        )}
        {gitStatus.type === 'not_found' && (
          <div style={{ color: THEME.danger }}>
            未检测到 Git。
            {gitStatus.error?.includes('not found')
              ? '请安装 Git 后重试。'
              : `错误: ${gitStatus.error}`}
          </div>
        )}
      </div>

      {/* Git author config */}
      <div style={styles.form}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Git 用户名</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Your Name"
            style={inputStyle}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Git 邮箱</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>

        {saved && (
          <div style={{ ...styles.statusMessage, color: THEME.success }}>
            保存成功
          </div>
        )}

        <div style={styles.formActions}>
          <button style={buttonPrimary} onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </section>
  );
};

// =====================
// Styles
// =====================
const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100%',
    background: THEME.background,
    padding: '32px 40px',
    overflowY: 'auto',
  },
  container: {
    maxWidth: 720,
    margin: '0 auto',
  },
  title: {
    color: THEME.text,
    fontSize: '24px',
    fontWeight: 700,
    margin: '0 0 24px 0',
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  section: {
    background: THEME.panel,
    borderRadius: '12px',
    padding: '24px',
    border: `1px solid ${THEME.border}`,
  },
  sectionTitle: {
    color: THEME.text,
    fontSize: '16px',
    fontWeight: 600,
    margin: '0 0 16px 0',
    paddingBottom: '12px',
    borderBottom: `1px solid ${THEME.border}`,
  },
  keyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '20px',
  },
  keyCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: THEME.background,
    borderRadius: '8px',
    padding: '10px 14px',
    border: `1px solid ${THEME.border}`,
  },
  keyInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  keyName: {
    color: THEME.text,
    fontSize: '13px',
    fontWeight: 600,
  },
  keyModel: {
    color: THEME.textMuted,
    fontWeight: 400,
    fontSize: '12px',
  },
  keyURL: {
    color: THEME.textMuted,
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    color: THEME.textMuted,
    fontSize: '12px',
    fontWeight: 600,
  },
  inputWithToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  toggleBtn: {
    background: 'transparent',
    border: `1px solid ${THEME.inputBorder}`,
    borderRadius: '6px',
    color: THEME.textMuted,
    cursor: 'pointer',
    padding: '6px 12px',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  statusMessage: {
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  spinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: `2px solid ${THEME.textMuted}`,
    borderTopColor: THEME.active,
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
  formActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    paddingTop: '4px',
  },
  gitStatusCard: {
    background: THEME.background,
    borderRadius: '8px',
    padding: '12px 14px',
    border: `1px solid ${THEME.border}`,
    marginBottom: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  gitStatusLabel: {
    color: THEME.text,
    fontSize: '13px',
    fontWeight: 600,
  },
};

// Spinner keyframe (injected once)
const spinnerStyleEl = document.createElement('style');
spinnerStyleEl.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
if (!document.querySelector('style[data-story-spinner]')) {
  spinnerStyleEl.dataset.storySpinner = '';
  document.head.append(spinnerStyleEl);
}
