import { useState } from 'react';

export type AiTab = 'chat' | 'continue' | 'polish' | 'analyze' | 'explain';

interface StoryAIPanelProps {
  width: number;
  activeTab: AiTab;
  onActiveTabChange: (tab: AiTab) => void;
  chatContainerRef: React.RefObject<HTMLDivElement>;
}

const TABS: { id: AiTab; icon: string; label: string }[] = [
  { id: 'chat', icon: '\u{1F4AC}', label: '聊天' },
  { id: 'continue', icon: '✏️', label: '续写' },
  { id: 'polish', icon: '✨', label: '润色' },
  { id: 'analyze', icon: '\u{1F50D}', label: '分析' },
  { id: 'explain', icon: '\u{1F5E3}️', label: '说人话' },
];

const TOOLBAR_ITEMS = [
  { icon: '➕', label: '新对话' },
  { icon: '\u{1F550}', label: '历史' },
  { icon: '\u{1F9D1}', label: '人设卡' },
  { icon: '\u{1F4A1}', label: '灵感' },
  { icon: '⋯', label: '' },
];

const ACTION_DESCRIPTIONS: Record<Exclude<AiTab, 'chat'>, string> = {
  continue: 'AI 将根据上下文自动续写内容',
  polish: 'AI 将优化文字表达和语言风格',
  analyze: 'AI 将分析当前文本的结构和节奏',
  explain: 'AI 将用通俗语言重新表述选中的文本',
};

const ACTION_LABELS: Record<Exclude<AiTab, 'chat'>, string> = {
  continue: '续写',
  polish: '润色',
  analyze: '分析',
  explain: '说人话',
};

function ActionPanel({ mode }: { mode: Exclude<AiTab, 'chat'> }) {
  const tab = TABS.find(t => t.id === mode);
  if (!tab) return null;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        color: 'var(--affine-text-secondary-color)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: '32px',
          marginBottom: '12px',
          opacity: 0.7,
        }}
      >
        {tab.icon}
      </div>
      <div
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--affine-text-primary-color)',
          marginBottom: '8px',
        }}
      >
        {ACTION_LABELS[mode]}
      </div>
      <div
        style={{
          fontSize: '13px',
          lineHeight: '1.6',
          opacity: 0.8,
          maxWidth: '240px',
        }}
      >
        {ACTION_DESCRIPTIONS[mode]}
      </div>
      <div
        style={{
          marginTop: '24px',
          padding: '10px 20px',
          borderRadius: '6px',
          border: '1px dashed var(--affine-border-color)',
          fontSize: '12px',
          opacity: 0.5,
        }}
      >
        功能开发中，敬请期待
      </div>
    </div>
  );
}

export const StoryAIPanel = ({
  width,
  activeTab,
  onActiveTabChange,
  chatContainerRef,
}: StoryAIPanelProps) => {
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        flexShrink: 0,
        background: 'var(--affine-background-secondary-color, #16162a)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderLeft: '1px solid var(--affine-border-color)',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--affine-border-color)',
        }}
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onActiveTabChange(tab.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                padding: '8px 0 6px',
                border: 'none',
                borderBottom: isActive
                  ? '2px solid var(--affine-primary-color)'
                  : '2px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
                color: isActive
                  ? 'var(--affine-primary-color)'
                  : 'var(--affine-text-secondary-color)',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              <span style={{ fontSize: '16px', lineHeight: 1 }}>
                {tab.icon}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  lineHeight: 1,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '6px 10px',
          background: 'rgba(0, 0, 0, 0.15)',
          borderBottom: '1px solid var(--affine-border-color)',
        }}
      >
        {TOOLBAR_ITEMS.map((item, idx) => (
          <button
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              padding: '3px 6px',
              border: 'none',
              borderRadius: '3px',
              background: 'transparent',
              color: 'var(--affine-text-secondary-color)',
              cursor: 'pointer',
              fontSize: '11px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{item.icon}</span>
            {item.label && <span>{item.label}</span>}
          </button>
        ))}
      </div>

      {/* Content area */}
      {activeTab === 'chat' ? (
        <div
          ref={chatContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
          }}
        />
      ) : (
        <ActionPanel mode={activeTab} />
      )}

      {/* Input area */}
      <div
        style={{
          borderTop: '1px solid var(--affine-border-color)',
          padding: '10px 12px',
          background: 'var(--affine-background-secondary-color, #16162a)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--affine-background-primary-color)',
            borderRadius: '6px',
            padding: '8px 12px',
            border: '1px solid var(--affine-border-color)',
          }}
        >
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--affine-text-primary-color)',
              fontSize: '13px',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            style={{
              background: inputValue.trim()
                ? 'var(--affine-primary-color)'
                : 'var(--affine-border-color)',
              border: 'none',
              borderRadius: '4px',
              color: '#ffffff',
              cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
              padding: '4px 10px',
              fontSize: '12px',
              marginLeft: '8px',
              transition: 'background 0.15s',
            }}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
};
