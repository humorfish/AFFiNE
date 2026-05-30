import { APIKeyStore, LLMClient } from '@affine/ai';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { useStory } from './story-context';

export interface StoryAIHandle {
  sendMessage: (message: string) => void;
}

interface StoryAIPanelProps {
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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const actions = [
  {
    id: 'continue',
    label: '续写',
    prompt: '请根据以下内容续写故事，保持风格和语气一致：\n\n',
  },
  {
    id: 'polish',
    label: '润色',
    prompt: '请润色以下段落，改善文字表达，保持原意：\n\n',
  },
  {
    id: 'analyze',
    label: '分析',
    prompt: '请从写作技巧、人物塑造和情节发展三个方面分析以下文本：\n\n',
  },
] as const;

export const StoryAIPanel = forwardRef<StoryAIHandle, StoryAIPanelProps>(
  function StoryAIPanel({ onToggleCollapse, theme }, ref) {
    const { chapters, activeChapterIndex } = useStory();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [streaming, setStreaming] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Read LLM config from store
    const config = (() => {
      const configs = APIKeyStore.list();
      return configs.length > 0 ? configs[0] : null;
    })();

    // Auto-scroll to bottom on new messages or content updates
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const getActiveChapterContent = useCallback((): string => {
      if (activeChapterIndex === null) return '';
      const chapter = chapters.find(ch => ch.meta.index === activeChapterIndex);
      return chapter?.content ?? '';
    }, [chapters, activeChapterIndex]);

    const sendMessage = useCallback(
      async (userMessage: string, systemPrompt?: string) => {
        if (!config || streaming) return;

        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setStreaming(true);

        try {
          const client = new LLMClient({
            baseURL: config.baseURL,
            apiKey: config.apiKey,
            model: config.model,
          });

          let assistantContent = '';
          setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

          const stream = client.stream(userMessage, {
            systemPrompt:
              systemPrompt ??
              '你是一个专业的小说写作助手，擅长创作、润色和分析文学作品。',
            temperature: 0.7,
          });

          for await (const chunk of stream) {
            assistantContent += chunk;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: 'assistant',
                content: assistantContent,
              };
              return updated;
            });
          }
        } catch (err) {
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: `【错误】 ${err instanceof Error ? err.message : String(err)}`,
            },
          ]);
        } finally {
          setStreaming(false);
        }
      },
      [config, streaming]
    );

    useImperativeHandle(ref, () => ({ sendMessage }), [sendMessage]);

    const handleSend = useCallback(() => {
      const text = inputValue.trim();
      if (!text) return;
      setInputValue('');
      sendMessage(text);
    }, [inputValue, sendMessage]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      },
      [handleSend]
    );

    const handleAction = useCallback(
      (action: (typeof actions)[number]) => {
        const chapterContent = getActiveChapterContent();
        if (!chapterContent.trim()) return;

        // Truncate chapter content to avoid excessively long prompts
        const content = chapterContent.slice(0, 4000);
        const userMessage = `${action.prompt}${content}`;
        sendMessage(userMessage, action.prompt);
      },
      [getActiveChapterContent, sendMessage]
    );

    const hasChapterContent =
      activeChapterIndex !== null &&
      chapters.some(
        ch =>
          ch.meta.index === activeChapterIndex && ch.content.trim().length > 0
      );

    return (
      <div
        style={{
          width: 320,
          minWidth: 320,
          maxWidth: 320,
          background: theme.panel,
          borderLeft: `1px solid ${theme.border}`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{ color: theme.text, fontSize: '14px', fontWeight: 600 }}
            >
              AI 助手
            </span>
            {config && (
              <span
                style={{
                  color: theme.textMuted,
                  fontSize: '11px',
                  background: `${theme.border}`,
                  padding: '1px 6px',
                  borderRadius: '3px',
                }}
              >
                {config.model}
              </span>
            )}
          </div>
          <button
            onClick={onToggleCollapse}
            style={{
              background: 'transparent',
              border: 'none',
              color: theme.textMuted,
              cursor: 'pointer',
              fontSize: '16px',
              padding: '4px',
            }}
            title="收起面板"
          >
            &#10005;
          </button>
        </div>

        {/* Action bar */}
        <div
          style={{
            padding: '8px 12px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            gap: '6px',
          }}
        >
          {actions.map(action => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              disabled={streaming || !hasChapterContent}
              style={{
                flex: 1,
                padding: '6px 4px',
                border: `1px solid ${theme.border}`,
                borderRadius: '4px',
                background: 'transparent',
                color: theme.textMuted,
                cursor:
                  streaming || !hasChapterContent ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                opacity: streaming || !hasChapterContent ? 0.5 : 1,
                transition: 'background 0.15s, color 0.15s, opacity 0.15s',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Messages area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {!config && messages.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.textMuted,
                fontSize: '13px',
                textAlign: 'center',
                padding: '20px',
              }}
            >
              请先在设置中配置 LLM API
            </div>
          ) : messages.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.textMuted,
                fontSize: '13px',
                textAlign: 'center',
                padding: '20px',
                opacity: 0.6,
              }}
            >
              <div>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>
                  &#128172;
                </div>
                <div>输入消息或使用快捷按钮开始对话</div>
                <div
                  style={{ fontSize: '11px', marginTop: '6px', opacity: 0.7 }}
                >
                  选中编辑器文字可使用工具栏 AI 操作
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent:
                    msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background:
                      msg.role === 'user' ? theme.active : theme.background,
                    color: msg.role === 'user' ? '#ffffff' : theme.text,
                    border:
                      msg.role === 'assistant'
                        ? `1px solid ${theme.border}`
                        : 'none',
                  }}
                >
                  {msg.content}
                  {msg.role === 'assistant' &&
                    !msg.content &&
                    idx === messages.length - 1 &&
                    streaming && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: '6px',
                          height: '14px',
                          background: theme.active,
                          borderRadius: '2px',
                          animation: 'blink 1s step-end infinite',
                          verticalAlign: 'middle',
                          marginLeft: '2px',
                        }}
                      />
                    )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div
          style={{
            borderTop: `1px solid ${theme.border}`,
            padding: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: theme.background,
              borderRadius: '6px',
              padding: '8px 12px',
              border: `1px solid ${theme.border}`,
            }}
          >
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={config ? '输入消息...' : '请先配置 LLM API'}
              disabled={!config || streaming}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: theme.text,
                fontSize: '13px',
                opacity: !config ? 0.5 : 1,
              }}
            />
            <button
              onClick={handleSend}
              disabled={!config || streaming || !inputValue.trim()}
              style={{
                background:
                  !config || streaming || !inputValue.trim()
                    ? theme.border
                    : theme.active,
                border: 'none',
                borderRadius: '4px',
                color: '#ffffff',
                cursor:
                  !config || streaming || !inputValue.trim()
                    ? 'not-allowed'
                    : 'pointer',
                padding: '4px 10px',
                fontSize: '12px',
                marginLeft: '8px',
                transition: 'background 0.15s',
              }}
            >
              {streaming ? '生成中...' : '发送'}
            </button>
          </div>
        </div>
      </div>
    );
  }
);
