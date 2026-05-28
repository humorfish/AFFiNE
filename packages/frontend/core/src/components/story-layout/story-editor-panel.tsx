import { useCallback, useEffect, useRef, useState } from 'react';

import { useStory } from './story-context';

interface StoryEditorPanelProps {
  focusMode: boolean;
  onFocusToggle: () => void;
  theme: {
    background: string;
    panel: string;
    active: string;
    text: string;
    textMuted: string;
    border: string;
  };
}

export const StoryEditorPanel = ({
  focusMode,
  onFocusToggle,
  theme,
}: StoryEditorPanelProps) => {
  const { project, chapters, activeChapterIndex, updateChapterContent, error } =
    useStory();

  // Find active chapter data
  const activeChapter =
    activeChapterIndex !== null
      ? chapters.find(ch => ch.meta.index === activeChapterIndex)
      : null;

  // Local editor state (tracks the textarea value before debounced save)
  const [editorContent, setEditorContent] = useState('');
  const [saving, setSaving] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync editor content when active chapter changes
  useEffect(() => {
    if (activeChapter) {
      setEditorContent(activeChapter.content);
    } else {
      setEditorContent('');
    }
  }, [activeChapter]);

  // Debounced auto-save on content change
  const handleContentChange = useCallback(
    (value: string) => {
      setEditorContent(value);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await updateChapterContent(value);
        } finally {
          setSaving(false);
        }
      }, 1000);
    },
    [updateChapterContent]
  );

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Word count helper (same logic as ChapterService)
  const wordCount = editorContent
    ? (editorContent.match(/[一-鿿㐀-䶿]/g) || []).length +
      (editorContent.match(/[a-zA-Z]+/g) || []).length
    : 0;

  // No project state
  if (!project) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          background: theme.background,
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
          }}
        >
          <div
            style={{
              color: theme.textMuted,
              fontSize: '18px',
              opacity: 0.6,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
              &#128214;
            </div>
            <div>请先在左侧创建或打开一个项目</div>
            <div style={{ fontSize: '14px', marginTop: '8px' }}>
              项目数据将保存在本地，由 Git 进行版本管理
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No active chapter state
  if (!activeChapter) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          background: theme.background,
        }}
      >
        {/* Editor header */}
        <div
          style={{
            padding: '12px 24px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              color: theme.text,
              fontSize: '16px',
              fontWeight: 600,
            }}
          >
            {project.meta.title}
          </span>
          <button
            onClick={onFocusToggle}
            style={focusButtonStyle(focusMode, theme)}
            title={focusMode ? '退出专注模式' : '进入专注模式'}
          >
            {focusMode ? '退出专注' : '专注模式'}
          </button>
        </div>

        {/* No chapter selected */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
          }}
        >
          <div
            style={{
              color: theme.textMuted,
              fontSize: '18px',
              opacity: 0.6,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>
              &#9997;
            </div>
            <div>请在左侧选择一个章节开始写作</div>
            {chapters.length === 0 && (
              <div style={{ fontSize: '14px', marginTop: '8px' }}>
                还没有章节，点击左侧章节管理中的 + 创建第一章
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            borderTop: `1px solid ${theme.border}`,
            padding: '8px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              color: theme.textMuted,
            }}
          >
            <span>共 {chapters.length} 章</span>
            <span style={{ color: theme.border }}>|</span>
            <span>
              目标: {project.meta.wordCountTarget.toLocaleString()} 字
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Active chapter editing view
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: theme.background,
      }}
    >
      {/* Editor header */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            color: theme.text,
            fontSize: '16px',
            fontWeight: 600,
          }}
        >
          {activeChapter.meta.title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {saving && (
            <span style={{ color: theme.textMuted, fontSize: '12px' }}>
              保存中...
            </span>
          )}
          {error && (
            <span style={{ color: '#ff6666', fontSize: '12px' }}>保存失败</span>
          )}
          <button
            onClick={onFocusToggle}
            style={focusButtonStyle(focusMode, theme)}
            title={focusMode ? '退出专注模式' : '进入专注模式'}
          >
            {focusMode ? '退出专注' : '专注模式'}
          </button>
        </div>
      </div>

      {/* Editor area - textarea for now (BlockSuite integration later) */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          padding: '24px',
          overflow: 'auto',
        }}
      >
        <textarea
          value={editorContent}
          onChange={e => handleContentChange(e.target.value)}
          placeholder="开始写作..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: theme.text,
            fontSize: '16px',
            lineHeight: 1.8,
            resize: 'none',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            padding: 0,
          }}
        />
      </div>

      {/* Bottom bar */}
      <div
        style={{
          borderTop: `1px solid ${theme.border}`,
          padding: '8px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '13px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            color: theme.textMuted,
          }}
        >
          <span>字数: {wordCount.toLocaleString()}</span>
          <span style={{ color: theme.border }}>|</span>
          <span>{activeChapter.meta.title}</span>
        </div>
      </div>
    </div>
  );
};

function focusButtonStyle(
  focusMode: boolean,
  theme: { active: string; border: string; textMuted: string }
): React.CSSProperties {
  return {
    padding: '4px 12px',
    borderRadius: '4px',
    border: `1px solid ${theme.border}`,
    background: focusMode ? theme.active : 'transparent',
    color: focusMode ? '#ffffff' : theme.textMuted,
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'background 0.15s, color 0.15s',
  };
}
