import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useStory } from './story-context';

interface StorySidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  theme: {
    background: string;
    panel: string;
    active: string;
    text: string;
    textMuted: string;
    border: string;
  };
}

const NAV_ITEMS = [
  { id: 'chapters', label: '章节管理', icon: '\u{1F4D6}' },
  { id: 'characters', label: '人物', icon: '\u{1F464}' },
  { id: 'worldview', label: '世界观', icon: '\u{1F30D}' },
  { id: 'roadmap', label: '路线图', icon: '\u{1F4C8}' },
  { id: 'sparks', label: '火花', icon: '\u{2728}' },
  { id: 'graph', label: '图谱', icon: '\u{1F578}' },
  { id: 'settings', label: '设置', icon: '\u{2699}' },
] as const;

type NavItemId = (typeof NAV_ITEMS)[number]['id'];

export const StorySidebar = ({
  collapsed,
  onToggleCollapse,
  theme,
}: StorySidebarProps) => {
  const {
    project,
    chapters,
    activeChapterIndex,
    activeModule,
    loading,
    error,
    createProject,
    openProject,
    addChapter,
    selectChapter,
    deleteChapter,
    setActiveModule,
  } = useStory();

  const navigate = useNavigate();

  const handleNavClick = useCallback(
    (id: NavItemId) => {
      if (id === 'settings') {
        navigate('/story/settings');
        return;
      }
      setActiveModule(id);
    },
    [setActiveModule, navigate]
  );

  // New project form state
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectAuthor, setNewProjectAuthor] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');

  // New chapter form state
  const [showNewChapterForm, setShowNewChapterForm] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');

  const directoryInputRef = useRef<HTMLInputElement>(null);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectTitle.trim() || !newProjectPath.trim()) return;
    await createProject(newProjectPath.trim(), {
      title: newProjectTitle.trim(),
      author: newProjectAuthor.trim() || 'Unknown',
      description: newProjectDesc.trim(),
      wordCountTarget: 100000,
    });
    setShowNewProjectForm(false);
    setNewProjectTitle('');
    setNewProjectAuthor('');
    setNewProjectDesc('');
    setNewProjectPath('');
  }, [
    newProjectTitle,
    newProjectAuthor,
    newProjectDesc,
    newProjectPath,
    createProject,
  ]);

  const handleOpenProject = useCallback(async () => {
    if (!newProjectPath.trim()) return;
    await openProject(newProjectPath.trim());
    setShowNewProjectForm(false);
    setNewProjectPath('');
  }, [newProjectPath, openProject]);

  const handleAddChapter = useCallback(async () => {
    if (!newChapterTitle.trim()) return;
    await addChapter(newChapterTitle.trim(), '');
    setNewChapterTitle('');
    setShowNewChapterForm(false);
  }, [newChapterTitle, addChapter]);

  const handleDeleteChapter = useCallback(
    async (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      if (confirm('确定要删除这个章节吗？')) {
        await deleteChapter(index);
      }
    },
    [deleteChapter]
  );

  const width = collapsed ? 60 : 240;

  return (
    <div
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        background: theme.panel,
        borderRight: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Project selector / name */}
      <div
        style={{
          padding: collapsed ? '12px 8px' : '12px 16px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ fontSize: '18px' }}>&#128214;</span>
        {!collapsed && (
          <span
            style={{
              color: theme.text,
              fontSize: '14px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {project ? project.meta.title : '未打开项目'}
          </span>
        )}
      </div>

      {/* Navigation */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => handleNavClick(item.id)}
            title={collapsed ? item.label : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: collapsed ? '10px 8px' : '10px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: activeModule === item.id ? 600 : 400,
              background:
                activeModule === item.id ? theme.active : 'transparent',
              color: activeModule === item.id ? '#ffffff' : theme.textMuted,
              transition: 'background 0.15s, color 0.15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
              marginBottom: '2px',
            }}
          >
            <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </div>

      {/* Sub-panel area */}
      {!collapsed && (
        <div
          style={{
            borderTop: `1px solid ${theme.border}`,
            padding: '12px',
            color: theme.textMuted,
            fontSize: '13px',
            maxHeight: '40%',
            overflowY: 'auto',
          }}
        >
          {/* Error display */}
          {error && (
            <div
              style={{
                padding: '8px',
                background: 'rgba(255, 80, 80, 0.15)',
                borderRadius: '4px',
                marginBottom: '8px',
                fontSize: '12px',
                color: '#ff6666',
              }}
            >
              {error}
            </div>
          )}

          {/* Loading indicator */}
          {loading && (
            <div
              style={{
                textAlign: 'center',
                padding: '8px',
                color: theme.textMuted,
                fontSize: '12px',
              }}
            >
              加载中...
            </div>
          )}

          {/* No project: show create/open form */}
          {!project && !loading && (
            <div>
              {showNewProjectForm ? (
                <NewProjectForm
                  title={newProjectTitle}
                  author={newProjectAuthor}
                  description={newProjectDesc}
                  path={newProjectPath}
                  directoryInputRef={directoryInputRef}
                  theme={theme}
                  onTitleChange={setNewProjectTitle}
                  onAuthorChange={setNewProjectAuthor}
                  onDescriptionChange={setNewProjectDesc}
                  onPathChange={setNewProjectPath}
                  onCreate={handleCreateProject}
                  onOpen={handleOpenProject}
                  onCancel={() => setShowNewProjectForm(false)}
                />
              ) : (
                <button
                  onClick={() => setShowNewProjectForm(true)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: `1px dashed ${theme.border}`,
                    borderRadius: '4px',
                    background: 'transparent',
                    color: theme.textMuted,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  + 新建 / 打开项目
                </button>
              )}
            </div>
          )}

          {/* Chapter list when project is open and chapters module active */}
          {project && activeModule === 'chapters' && (
            <div>
              <div
                style={{
                  fontWeight: 600,
                  color: theme.text,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>章节列表</span>
                <button
                  onClick={() => setShowNewChapterForm(prev => !prev)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: theme.active,
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '0 4px',
                  }}
                  title="添加章节"
                >
                  +
                </button>
              </div>

              {/* New chapter form */}
              {showNewChapterForm && (
                <div
                  style={{
                    marginBottom: 8,
                    display: 'flex',
                    gap: '4px',
                  }}
                >
                  <input
                    type="text"
                    value={newChapterTitle}
                    onChange={e => setNewChapterTitle(e.target.value)}
                    placeholder="章节标题"
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddChapter();
                      if (e.key === 'Escape') {
                        setShowNewChapterForm(false);
                        setNewChapterTitle('');
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      background: theme.background,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '4px',
                      color: theme.text,
                      fontSize: '12px',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleAddChapter}
                    disabled={!newChapterTitle.trim()}
                    style={{
                      padding: '4px 8px',
                      background: theme.active,
                      border: 'none',
                      borderRadius: '4px',
                      color: '#ffffff',
                      cursor: newChapterTitle.trim() ? 'pointer' : 'default',
                      fontSize: '12px',
                      opacity: newChapterTitle.trim() ? 1 : 0.5,
                    }}
                  >
                    添加
                  </button>
                </div>
              )}

              {/* Chapter list */}
              {chapters.length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                  暂无章节，点击 + 创建
                </div>
              ) : (
                chapters.map(ch => (
                  <div
                    key={ch.meta.index}
                    onClick={() => selectChapter(ch.meta.index)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color:
                        activeChapterIndex === ch.meta.index
                          ? theme.text
                          : theme.textMuted,
                      fontSize: '13px',
                      background:
                        activeChapterIndex === ch.meta.index
                          ? 'rgba(108, 92, 231, 0.15)'
                          : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (activeChapterIndex !== ch.meta.index) {
                        e.currentTarget.style.background =
                          'rgba(108, 92, 231, 0.1)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (activeChapterIndex !== ch.meta.index) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <span
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flex: 1,
                      }}
                    >
                      {ch.meta.title}
                    </span>
                    <button
                      onClick={e => handleDeleteChapter(e, ch.meta.index)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: theme.textMuted,
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '0 2px',
                        opacity: 0.5,
                        flexShrink: 0,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.color = '#ff6666';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.opacity = '0.5';
                        e.currentTarget.style.color = theme.textMuted;
                      }}
                      title="删除章节"
                    >
                      x
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Other modules */}
          {project && activeModule === 'characters' && (
            <div>
              <div
                style={{ fontWeight: 600, color: theme.text, marginBottom: 8 }}
              >
                人物列表
              </div>
              <div style={{ color: theme.textMuted, fontSize: '13px' }}>
                暂无人物（将在 Task 9 接入服务）
              </div>
            </div>
          )}

          {project && activeModule === 'settings' && (
            <div>
              <div
                style={{ fontWeight: 600, color: theme.text, marginBottom: 8 }}
              >
                项目设置
              </div>
              <div style={{ color: theme.textMuted, fontSize: '13px' }}>
                前往完整设置页面
              </div>
            </div>
          )}

          {project &&
            activeModule !== 'chapters' &&
            activeModule !== 'characters' &&
            activeModule !== 'settings' && (
              <div style={{ color: theme.textMuted, fontSize: '13px' }}>
                {NAV_ITEMS.find(n => n.id === activeModule)?.label} - 面板开发中
              </div>
            )}
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        style={{
          borderTop: `1px solid ${theme.border}`,
          padding: '8px',
          background: 'transparent',
          border: 'none',
          color: theme.textMuted,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px',
        }}
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        {collapsed ? '\u{25B6}' : '\u{25C0}'}
      </button>
    </div>
  );
};

/* ---------- New Project Form ---------- */

interface NewProjectFormProps {
  title: string;
  author: string;
  description: string;
  path: string;
  directoryInputRef: React.RefObject<HTMLInputElement | null>;
  theme: {
    background: string;
    border: string;
    text: string;
    textMuted: string;
    active: string;
  };
  onTitleChange: (v: string) => void;
  onAuthorChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onPathChange: (v: string) => void;
  onCreate: () => void;
  onOpen: () => void;
  onCancel: () => void;
}

function NewProjectForm({
  title,
  author,
  description,
  path,
  theme,
  onTitleChange,
  onAuthorChange,
  onDescriptionChange,
  onPathChange,
  onCreate,
  onOpen,
  onCancel,
}: NewProjectFormProps) {
  const canCreate = title.trim() && path.trim();
  const canOpen = path.trim();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ fontWeight: 600, color: theme.text, marginBottom: 2 }}>
        新建项目
      </div>
      <input
        type="text"
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        placeholder="小说标题"
        style={inputStyle(theme)}
      />
      <input
        type="text"
        value={author}
        onChange={e => onAuthorChange(e.target.value)}
        placeholder="作者"
        style={inputStyle(theme)}
      />
      <input
        type="text"
        value={description}
        onChange={e => onDescriptionChange(e.target.value)}
        placeholder="简介"
        style={inputStyle(theme)}
      />
      <input
        type="text"
        value={path}
        onChange={e => onPathChange(e.target.value)}
        placeholder="项目目录路径"
        style={inputStyle(theme)}
      />
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          onClick={onCreate}
          disabled={!canCreate}
          style={{
            flex: 1,
            padding: '6px',
            background: theme.active,
            border: 'none',
            borderRadius: '4px',
            color: '#ffffff',
            cursor: canCreate ? 'pointer' : 'default',
            fontSize: '12px',
            opacity: canCreate ? 1 : 0.5,
          }}
        >
          创建
        </button>
        <button
          onClick={onOpen}
          disabled={!canOpen}
          style={{
            flex: 1,
            padding: '6px',
            background: 'transparent',
            border: `1px solid ${theme.border}`,
            borderRadius: '4px',
            color: theme.textMuted,
            cursor: canOpen ? 'pointer' : 'default',
            fontSize: '12px',
            opacity: canOpen ? 1 : 0.5,
          }}
        >
          打开已有
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '6px 8px',
            background: 'transparent',
            border: `1px solid ${theme.border}`,
            borderRadius: '4px',
            color: theme.textMuted,
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}

function inputStyle(theme: {
  background: string;
  border: string;
  text: string;
}): React.CSSProperties {
  return {
    padding: '4px 8px',
    background: theme.background,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    color: theme.text,
    fontSize: '12px',
    outline: 'none',
  };
}
