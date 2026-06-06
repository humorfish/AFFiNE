import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/* ======================================================================
   Shared utilities for all world-setting panels.
   Every panel MUST import from here to guarantee style/interaction parity.
   ====================================================================== */

const AI_SERVER_URL = 'http://localhost:3001/api/ai/ask';

/** Parse JSON from LLM response (handles ```json blocks, raw JSON, etc.) */
export function parseAIJSON<T = any>(
  text: string
): { data: T | null; failed: boolean } {
  const s = text.trim();
  // Try direct parse
  try {
    return { data: JSON.parse(s), failed: false };
  } catch {}
  // Try ```json ... ``` block
  const codeMatch = s.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeMatch)
    try {
      return { data: JSON.parse(codeMatch[1]), failed: false };
    } catch {}
  // Try first {...} or [...] in text
  const braceMatch = s.match(/\{[\s\S]*\}/);
  if (braceMatch)
    try {
      return { data: JSON.parse(braceMatch[0]), failed: false };
    } catch {}
  const bracketMatch = s.match(/\[[\s\S]*\]/);
  if (bracketMatch)
    try {
      return { data: JSON.parse(bracketMatch[0]), failed: false };
    } catch {}
  return { data: null, failed: true };
}

// ─── useAIGenerate Hook ─────────────────────────────────────────────

export function useAIGenerate<T = string>() {
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<T | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const parsedRef = useRef<any>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
  }, []);

  const generate = useCallback(
    async (
      messages: Array<{ role: string; content: string }>,
      opts?: {
        scenario?: string;
        context?: Record<string, unknown>;
        onChunk?: (text: string) => void;
      }
    ) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setGenerating(true);
      setStreamText('');
      setError('');
      setResult(null);
      setParsedData(null);
      parsedRef.current = null;

      try {
        const res = await fetch(AI_SERVER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages,
            scenario: opts?.scenario || 'assistant',
            context: opts?.context,
          }),
          signal: ac.signal,
        });

        if (!res.ok || !res.body)
          throw new Error(`AI service error: ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              currentEvent = line.slice(6).trim();
              continue;
            }
            if (line.startsWith('data:')) {
              const payload = line.slice(5).trim();
              if (!payload || payload === '{}') continue;
              try {
                const evt = JSON.parse(payload);
                if (currentEvent === 'parsed') {
                  parsedRef.current = evt;
                  setParsedData(evt);
                } else if (evt.text) {
                  fullText += evt.text;
                  setStreamText(fullText);
                  opts?.onChunk?.(fullText);
                }
              } catch {}
              currentEvent = '';
            }
          }
        }

        setResult(fullText as T);
        return fullText;
      } catch (err: any) {
        if (err.name === 'AbortError') return null;
        const msg = err.message || 'AI generation failed';
        setError(msg);
        return null;
      } finally {
        setGenerating(false);
        abortRef.current = null;
      }
    },
    []
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  return {
    generating,
    streamText,
    error,
    result,
    parsedData,
    parsedRef,
    setParsedData,
    generate,
    abort,
    setStreamText,
    setResult,
  };
}

// ─── AIGenerateModal ─────────────────────────────────────────────────

export interface AIField {
  key: string;
  label: string;
  hasContent: boolean;
}

export const AIGenerateModal: React.FC<{
  title: string;
  icon?: string;
  fields: AIField[];
  selectedFields: Set<string>;
  onToggleField: (key: string) => void;
  onGenerate: () => void;
  onClose: () => void;
  generating?: boolean;
  streamText?: string;
  error?: string;
}> = ({
  title,
  icon = 'ri-magic-line',
  fields,
  selectedFields,
  onToggleField,
  onGenerate,
  onClose,
  generating,
  streamText,
  error,
}) => {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[480px] max-h-[70vh] bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className={`${icon} text-blue-400 text-lg`} />
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          <button
            className="p-1 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
            onClick={onClose}
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <p className="text-xs text-[var(--text-secondary)]">
            选择要生成的字段。已填写内容的字段不会被覆盖。
          </p>
          <div className="space-y-2">
            {fields.map(f => (
              <label
                key={f.key}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="accent-blue-500"
                  checked={selectedFields.has(f.key)}
                  onChange={() => onToggleField(f.key)}
                  disabled={f.hasContent}
                />
                <span
                  className={f.hasContent ? 'text-[var(--text-secondary)]' : ''}
                >
                  {f.label}
                </span>
                {f.hasContent && (
                  <span className="text-xs text-[var(--text-secondary)]">
                    (已有内容)
                  </span>
                )}
              </label>
            ))}
          </div>
          {streamText && (
            <div className="p-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg max-h-[200px] overflow-y-auto">
              <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">
                {streamText}
              </p>
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            className="px-4 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg hover:border-blue-500/50 transition-colors"
            onClick={generating ? onClose : onClose}
          >
            {generating ? '取消' : '关闭'}
          </button>
          <button
            className="px-4 py-2 text-sm bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            onClick={onGenerate}
            disabled={generating || selectedFields.size === 0}
          >
            <i
              className={
                generating
                  ? 'ri-loader-4-line animate-spin'
                  : 'ri-sparkling-line'
              }
            />
            {generating ? '生成中...' : '开始生成'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** Purple AI-generate mini-button — exact match of .AI生成小按钮 from CSS */
export function AIButton({
  onClick,
  label = 'AI生成',
  className = '',
}: {
  onClick?: () => void;
  label?: string;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      className={`flex items-center gap-0.5 shrink-0 ${className}`}
      style={{
        background: hover ? '#a855f74d' : '#a855f733',
        color: 'rgb(192, 132, 252)',
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem',
        fontSize: '0.75rem',
        transition: 'background 0.15s',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <i className="ri-magic-line" /> {label}
    </button>
  );
}

/** Section-level AI button (icon only, in header) */
export function SectionAIButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      className="p-1 hover:bg-[var(--bg-dark)] rounded transition-colors text-[var(--text-secondary)] hover:text-purple-400"
      title="AI生成本节"
      onClick={onClick}
    >
      <i className="text-sm ri-magic-line" />
    </button>
  );
}

/** Collapsible section card */
export function SectionCard({
  title,
  subtitle,
  icon,
  iconColor,
  defaultOpen = true,
  rightExtra,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: string;
  iconColor: string;
  defaultOpen?: boolean;
  rightExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-[var(--bg-card)] rounded-lg mb-4 overflow-hidden">
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--bg-dark)]/50 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <i className={`${icon} ${iconColor}`} /> {title}
          {subtitle && (
            <span className="text-xs text-[var(--text-muted)] font-normal">
              {subtitle}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {rightExtra}
          <i
            className={`ri-arrow-${open ? 'up' : 'down'}-s-line text-[var(--text-muted)] transition-transform`}
          />
        </div>
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/** Font size zoom in/out controls (positioned absolute inside a relative wrapper) */
export function FontSizeControls({
  field,
  sizes,
  onAdjust,
}: {
  field: string;
  sizes: Record<string, number>;
  onAdjust: (field: string, delta: number) => void;
}) {
  return (
    <div className="absolute top-1 right-1 flex gap-0.5">
      <button
        className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
        title="增大字体"
        onClick={() => onAdjust(field, 1)}
      >
        <i className="text-xs ri-zoom-in-line" />
      </button>
      <button
        className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
        title="减小字体"
        onClick={() => onAdjust(field, -1)}
      >
        <i className="text-xs ri-zoom-out-line" />
      </button>
    </div>
  );
}

/** Textarea with AI button + font controls — matches original HTML pattern exactly */
export function TextareaWithAI({
  label,
  field,
  value,
  onChange,
  placeholder,
  minH,
  maxH,
  sizes,
  onAdjustFontSize,
  onAI,
}: {
  label: string;
  field: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minH: number;
  maxH: number;
  sizes: Record<string, number>;
  onAdjustFontSize: (field: string, delta: number) => void;
  onAI?: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm text-[var(--text-secondary)] block">
          {label}
        </label>
        <AIButton onClick={onAI} />
      </div>
      <div className="relative">
        <textarea
          className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded px-3 py-2 text-sm overflow-y-auto resize-y focus:border-[var(--primary)] transition-colors pr-16"
          style={{
            minHeight: `${minH}px`,
            maxHeight: `${maxH}px`,
            fontSize: sizes[field] || 14,
          }}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <FontSizeControls
          field={field}
          sizes={sizes}
          onAdjust={onAdjustFontSize}
        />
      </div>
    </div>
  );
}

/** Detail panel tab bar */
export function DetailTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex border-b border-[var(--border)] bg-[var(--bg-card)] shrink-0">
      {tabs.map(tab => (
        <button
          key={tab.key}
          className={`flex-1 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            active === tab.key
              ? 'border-purple-500 text-purple-400 bg-purple-500/10'
              : 'border-transparent text-[var(--text-secondary)] hover:text-purple-400'
          }`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** useFontSize hook — manages per-field font sizes */
export function useFontSize() {
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const adjust = useCallback((field: string, delta: number) => {
    setSizes(prev => ({
      ...prev,
      [field]: Math.max(12, Math.min(20, (prev[field] || 14) + delta)),
    }));
  }, []);
  return { sizes, adjust };
}

/** Static Tailwind color maps — use these instead of dynamic `bg-${color}-500` */

export const TAG_COLORS: Record<
  string,
  { bg: string; text: string; dot: string; border: string }
> = {
  purple: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    dot: 'bg-purple-500',
    border: 'border-purple-500/30',
  },
  blue: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    dot: 'bg-blue-500',
    border: 'border-blue-500/30',
  },
  green: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    dot: 'bg-green-500',
    border: 'border-green-500/30',
  },
  red: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    dot: 'bg-red-500',
    border: 'border-red-500/30',
  },
  yellow: {
    bg: 'bg-yellow-500/20',
    text: 'text-yellow-400',
    dot: 'bg-yellow-500',
    border: 'border-yellow-500/30',
  },
  cyan: {
    bg: 'bg-cyan-500/20',
    text: 'text-cyan-400',
    dot: 'bg-cyan-500',
    border: 'border-cyan-500/30',
  },
  orange: {
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
    dot: 'bg-orange-500',
    border: 'border-orange-500/30',
  },
  pink: {
    bg: 'bg-pink-500/20',
    text: 'text-pink-400',
    dot: 'bg-pink-500',
    border: 'border-pink-500/30',
  },
  gray: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    dot: 'bg-gray-500',
    border: 'border-gray-500/30',
  },
  amber: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    dot: 'bg-amber-500',
    border: 'border-amber-500/30',
  },
  indigo: {
    bg: 'bg-indigo-500/20',
    text: 'text-indigo-400',
    dot: 'bg-indigo-500',
    border: 'border-indigo-500/30',
  },
  emerald: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    dot: 'bg-emerald-500',
    border: 'border-emerald-500/30',
  },
};

export const RARITY_COLORS: Record<
  string,
  { bg: string; text: string; border: string; glow: string }
> = {
  普通: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
    glow: '',
  },
  优秀: {
    bg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    glow: '',
  },
  稀有: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/20',
  },
  史诗: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/20',
  },
  传说: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    glow: 'shadow-amber-500/20',
  },
};
