import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import { saveGeneration, type ModuleName } from '../useWorldApi';

/* ======================================================================
   Shared utilities for all world-setting panels.
   Every panel MUST import from here to guarantee style/interaction parity.
   ====================================================================== */

const AI_SERVER_URL = 'http://localhost:3001/api/ai/ask';
const GENERATE_URL = 'http://localhost:3001/api/ai/generate';

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

// ─── Direct LLM call (matches original site's bigmodel API) ────────

export interface GenerateLLMParams {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  thinking?: { type: string };
  parseScenario?: string;
  context?: Record<string, unknown>;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
}

export async function generateLLM(params: GenerateLLMParams): Promise<string> {
  const {
    messages,
    model = 'glm-5.1',
    temperature = 0.85,
    max_tokens = 1024,
    frequency_penalty = 0.5,
    presence_penalty = 0.4,
    thinking = { type: 'disabled' },
    parseScenario,
    context,
    onChunk,
    signal,
  } = params;

  const res = await fetch(GENERATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens,
      stream: true,
      frequency_penalty,
      presence_penalty,
      thinking,
      parseScenario,
      context,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Generate API error: ${res.status}`);
  }

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
          if (evt.text) {
            fullText += evt.text;
            onChunk(fullText);
          }
        } catch {}
        currentEvent = '';
      }
    }
  }

  return fullText;
}

// ─── generateValidated: Zod validation + auto-retry ─────────────────

export interface GenerateValidatedParams<T> {
  schema: z.ZodType<T>;
  /** Generate raw text. Called once per attempt. Return null on error. */
  generate: (attempt: number) => Promise<string | null>;
  parseResponse: (text: string) => unknown;
  maxRetries?: number;
  /** Called on each retry with attempt number (0-based) */
  onRetry?: (attempt: number, reason: string) => void;
}

/** Generate → parse → Zod validate → auto-retry on failure. */
export async function generateValidated<T>(
  params: GenerateValidatedParams<T>
): Promise<{ data: T; rawText: string } | null> {
  const { schema, generate, parseResponse, maxRetries = 3, onRetry } = params;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const text = await generate(attempt);
      if (!text) {
        onRetry?.(attempt, 'generate returned null');
        continue;
      }

      const parsed = parseResponse(text);
      if (parsed === null || parsed === undefined) {
        onRetry?.(attempt, 'parse returned null');
        continue;
      }

      const result = schema.safeParse(parsed);
      if (result.success) {
        return { data: result.data, rawText: text };
      }

      const issues = result.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      onRetry?.(attempt, `zod: ${issues}`);
    } catch (e: any) {
      if (e.name === 'AbortError') return null;
      onRetry?.(attempt, `error: ${e.message}`);
    }
  }

  return null;
}

// ─── useAIGenerate Hook ─────────────────────────────────────────────

export function useAIGenerate<T = string>(hookOpts?: {
  module?: ModuleName;
  projectId?: number | null;
}) {
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<T | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const parsedRef = useRef<any>(null);
  const hookOptsRef = useRef(hookOpts);
  hookOptsRef.current = hookOpts;

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

        // Auto-save generation history after streaming completes
        const { module, projectId } = hookOptsRef.current || {};
        if (module && projectId) {
          const genContent = parsedRef.current?.data || {};
          const genType =
            opts?.context?._mode === 'section' ? 'section' : 'full';
          saveGeneration(module, projectId, {
            提示词: '',
            生成类型: genType,
            生成内容:
              Object.keys(genContent).length > 0
                ? genContent
                : { text: fullText },
          }).catch(() => {});
        }

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

// ─── Shared types for generation dialogs ──────────────────────────────

export interface QuickTemplate {
  label: string;
  icon: string;
  color: string;
  type: string;
  prompt: string;
}

export interface TypeOption {
  名称: string;
  图标: string;
  颜色: string;
}

// ─── useAIFieldGenerate — per-field AI generation (button spins, updates directly) ──

export function useAIFieldGenerate(opts: {
  module: ModuleName;
  projectId: number | null;
  data: Record<string, string>;
  setData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  fetchSystemPrompt: () => Promise<string>;
  buildExistingStr: (excludeField?: string) => string;
  parseResponse?: (text: string) => Record<string, string> | null;
  /** Optional Zod schema for validation + auto-retry */
  schema?: z.ZodType<Record<string, string>>;
}) {
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generateField = useCallback(
    async (field: string) => {
      setGeneratingField(field);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const systemPrompt = await opts.fetchSystemPrompt();
      const existing = opts.buildExistingStr(field);
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: `基于以下已有设定，请生成"${field}"部分的详细内容。\n\n已有设定：\n${existing}\n\n用户补充要求：请根据已有设定生成合适的内容\n\n只需要返回一个JSON对象，只包含"${field}"字段及其内容。`,
        },
      ];

      try {
        let content: string;

        if (opts.schema) {
          // Zod validation + auto-retry path
          const fieldSchema = z
            .object({ [field]: z.string().min(10) })
            .passthrough();
          const parseFn =
            opts.parseResponse ||
            ((text: string) => {
              const { data } = parseAIJSON(text);
              return data as Record<string, string> | null;
            });
          const result = await generateValidated({
            schema: fieldSchema,
            generate: attempt =>
              generateLLM({
                messages,
                temperature: Math.min(1.0, 0.85 + attempt * 0.05),
                max_tokens: 1024,
                onChunk: () => {},
                signal: ac.signal,
              }),
            parseResponse: parseFn,
            maxRetries: 3,
          });
          content = result ? result.data[field] || result.rawText : '';
          if (!content) {
            setGeneratingField(null);
            return;
          }
        } else {
          // Legacy path (no Zod schema)
          const fullText = await generateLLM({
            messages,
            max_tokens: 1024,
            onChunk: () => {},
            signal: ac.signal,
          });

          content = fullText;
          if (opts.parseResponse) {
            const result = opts.parseResponse(fullText);
            content = result?.[field] || fullText;
          } else {
            const parsed = parseAIJSON(fullText);
            if (parsed.data && !parsed.failed) {
              const obj = parsed.data as Record<string, string>;
              content = obj[field] || fullText;
            }
          }
        }

        opts.setData(prev => {
          const merged = { ...prev, [field]: content };
          if (opts.projectId) {
            import('../useWorldApi').then(({ saveVersion, saveData }) => {
              saveGeneration(opts.module, opts.projectId!, {
                提示词: '',
                生成类型: 'section',
                生成内容: { [field]: content },
              }).catch(() => {});
              saveVersion(opts.module, opts.projectId!, {
                描述: `AI生成${field}`,
                内容: merged,
              }).catch(() => {});
              saveData(opts.module, opts.projectId!, merged).catch(() => {});
            });
          }
          return merged;
        });
      } catch (err: any) {
        if (err.name !== 'AbortError')
          console.error('AI field generation failed:', err);
      } finally {
        setGeneratingField(null);
      }
    },
    [opts]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setGeneratingField(null);
  }, []);

  return { generatingField, generateField, abort };
}

// ─── useAIFullGenerate — 3-phase full generation (select → streaming → preview) ──

export type FullGenPhase = 'select' | 'streaming' | 'preview' | null;

export function useAIFullGenerate(opts: {
  module: ModuleName;
  projectId: number | null;
  data: Record<string, string>;
  setData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  fetchSystemPrompt: () => Promise<string>;
  parseResponse: (text: string) => Record<string, string> | null;
  defaultType?: string;
  maxTokens?: number;
  buildUserMessage: (type: string, desc: string) => string;
  /** Optional Zod schema for validation + auto-retry */
  schema?: z.ZodType<Record<string, string>>;
}) {
  const [phase, setPhase] = useState<FullGenPhase>(null);
  const [genType, setGenType] = useState(opts.defaultType || '');
  const [genDesc, setGenDesc] = useState('');
  const [streamText, setStreamText] = useState('');
  const [parsed, setParsed] = useState<Record<string, string> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const open = useCallback(() => {
    setGenType(opts.defaultType || '');
    setGenDesc('');
    setStreamText('');
    setParsed(null);
    setPhase('select');
  }, [opts.defaultType]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setPhase(null);
    setStreamText('');
    setParsed(null);
  }, []);

  const start = useCallback(async () => {
    setPhase('streaming');
    setStreamText('');
    setParsed(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const systemPrompt = await opts.fetchSystemPrompt();
    const userMessage = opts.buildUserMessage(genType, genDesc);
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userMessage },
    ];

    try {
      if (opts.schema) {
        // Zod validation + auto-retry path
        const result = await generateValidated({
          schema: opts.schema,
          generate: attempt =>
            generateLLM({
              messages,
              temperature: Math.min(1.0, 0.85 + attempt * 0.05),
              max_tokens: opts.maxTokens || 8192,
              onChunk: t => setStreamText(t),
              signal: ac.signal,
            }),
          parseResponse: opts.parseResponse,
          maxRetries: 3,
        });
        setParsed(result ? result.data : null);
      } else {
        // Legacy path
        const fullText = await generateLLM({
          messages,
          max_tokens: opts.maxTokens || 8192,
          onChunk: t => setStreamText(t),
          signal: ac.signal,
        });
        const result = opts.parseResponse(fullText);
        setParsed(result);
      }
      setPhase('preview');
    } catch (err: any) {
      if (err.name !== 'AbortError')
        console.error('AI full generation failed:', err);
      setPhase(null);
    }
  }, [genType, genDesc, opts]);

  const adopt = useCallback(() => {
    if (!parsed) return;
    opts.setData(prev => {
      const merged = { ...prev, ...parsed };
      if (opts.projectId) {
        import('../useWorldApi').then(({ saveVersion, saveData }) => {
          saveGeneration(opts.module, opts.projectId!, {
            提示词: `类型：${genType}${genDesc ? '\n\n' + genDesc : ''}`,
            生成类型: 'full',
            生成内容: parsed,
          }).catch(() => {});
          saveVersion(opts.module, opts.projectId, {
            描述: `AI生成${opts.module}`,
            内容: merged,
          }).catch(() => {});
          saveData(opts.module, opts.projectId!, merged).catch(() => {});
        });
      }
      return merged;
    });
    close();
  }, [parsed, genType, genDesc, opts, close]);

  return {
    phase,
    genType,
    setGenType,
    genDesc,
    setGenDesc,
    streamText,
    parsed,
    open,
    close,
    start,
    adopt,
  };
}

// ─── AIGenerationDialog — reusable 3-phase dialog UI ──────────────────

export const AIGenerationDialog: React.FC<{
  title: string;
  subtitle?: string;
  phase: FullGenPhase;
  genType: string;
  setGenType: (t: string) => void;
  genDesc: string;
  setGenDesc: (d: string) => void;
  streamText: string;
  parsed: Record<string, string> | null;
  typeOptions: TypeOption[];
  quickTemplates: QuickTemplate[];
  onStart: () => void;
  onAdopt: () => void;
  onClose: () => void;
}> = ({
  title,
  subtitle,
  phase,
  genType,
  setGenType,
  genDesc,
  setGenDesc,
  streamText,
  parsed,
  typeOptions,
  quickTemplates,
  onStart,
  onAdopt,
  onClose,
}) => {
  if (!phase) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-2xl w-full max-w-3xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[var(--border)] bg-gradient-to-r from-purple-500/10 to-pink-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 shadow-lg rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
                <i className="text-2xl text-white ri-magic-line" />
              </div>
              <div>
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  {phase === 'select'
                    ? subtitle ||
                      '选择类型或描述你的构想，AI将为你构建完整的内容'
                    : phase === 'streaming'
                      ? '正在生成...'
                      : '生成完成，预览内容'}
                </p>
              </div>
            </div>
            <button
              className="p-2 rounded-lg hover:bg-[var(--bg-dark)] transition-colors"
              onClick={onClose}
            >
              <i className="text-xl ri-close-line" />
            </button>
          </div>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {phase === 'select' && (
            <>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <i className="ri-global-line text-[var(--primary)]" />{' '}
                    选择类型
                  </label>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {typeOptions.map(opt => (
                    <button
                      key={opt.名称}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all group ${genType === opt.名称 ? 'border-[var(--primary)] bg-[var(--primary)]/10 shadow-md' : 'border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--bg-dark)]'}`}
                      onClick={() => setGenType(opt.名称)}
                    >
                      <div
                        className="flex items-center justify-center w-10 h-10 transition-transform rounded-lg group-hover:scale-110"
                        style={{ backgroundColor: opt.颜色 + '20' }}
                      >
                        <i
                          className={`text-xl ${opt.图标}`}
                          style={{ color: opt.颜色 }}
                        />
                      </div>
                      <span className="text-xs font-medium">{opt.名称}</span>
                    </button>
                  ))}
                </div>
              </div>

              {quickTemplates.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <i className="ri-bookmark-line text-[var(--secondary)]" />{' '}
                      快捷模板
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {quickTemplates.map(tpl => (
                      <button
                        key={tpl.label}
                        className="p-4 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-xl text-left transition-all group border border-transparent hover:border-[var(--primary)]/30"
                        onClick={() => {
                          setGenType(tpl.type);
                          setGenDesc(tpl.prompt);
                        }}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div
                            className="flex items-center justify-center w-8 h-8 rounded-lg"
                            style={{ backgroundColor: tpl.color + '20' }}
                          >
                            <i
                              className={`text-lg ${tpl.icon}`}
                              style={{ color: tpl.color }}
                            />
                          </div>
                          <span className="font-medium text-sm group-hover:text-[var(--primary)] transition-colors">
                            {tpl.label}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                          {tpl.prompt}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <i className="text-green-400 ri-edit-line" /> 描述你的构想
                  </label>
                </div>
                <textarea
                  className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm resize-none focus:border-[var(--primary)] transition-colors"
                  rows={4}
                  placeholder="补充你的具体需求..."
                  value={genDesc}
                  onChange={e => setGenDesc(e.target.value)}
                />
              </div>
            </>
          )}

          {phase === 'streaming' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
                    <i className="text-lg text-white ri-loader-4-line animate-spin" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-[var(--primary)]">
                      正在生成... ({streamText.length} 字符)
                    </span>
                  </div>
                </div>
                <div className="h-2 w-28 bg-[var(--bg-dark)] rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300 bg-gradient-to-r from-purple-500 to-pink-500"
                    style={{
                      width: `${Math.min(100, streamText.length / 20)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="min-h-[200px]">
                <pre className="text-sm leading-relaxed whitespace-pre-wrap">
                  {streamText}
                </pre>
              </div>
            </div>
          )}

          {phase === 'preview' && parsed && (
            <div className="space-y-4">
              {Object.entries(parsed).map(([key, value]) =>
                value ? (
                  <div key={key}>
                    <h4 className="mb-2 text-sm font-medium text-purple-400">
                      {key}
                    </h4>
                    <p className="text-sm text-[var(--text-secondary)] bg-[var(--bg-dark)] rounded-lg p-3 whitespace-pre-wrap">
                      {value}
                    </p>
                  </div>
                ) : null
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-[var(--border)] flex justify-between items-center bg-[var(--bg-darker)]">
          {phase === 'select' && (
            <>
              <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                <i className="text-green-400 ri-check-line" /> 已选择:{' '}
                <span className="text-[var(--primary)] font-medium">
                  {genType}
                </span>
              </span>
              <div className="flex gap-3">
                <button
                  className="px-5 py-2.5 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-xl transition-colors"
                  onClick={onClose}
                >
                  关闭
                </button>
                <button
                  className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg hover:shadow-xl"
                  onClick={onStart}
                >
                  <i className="ri-sparkles-line" /> 开始生成
                </button>
              </div>
            </>
          )}
          {phase === 'streaming' && (
            <div className="flex justify-end gap-3 w-full">
              <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                <i className="ri-loader-4-line animate-spin" />{' '}
                生成中，请稍候...
              </span>
              <button
                className="px-4 py-2.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors flex items-center gap-1"
                onClick={onClose}
              >
                <i className="ri-stop-line" /> 取消生成
              </button>
            </div>
          )}
          {phase === 'preview' && (
            <div className="flex justify-end gap-3 w-full">
              <button
                className="px-4 py-2.5 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg transition-colors"
                onClick={onClose}
              >
                关闭
              </button>
              <button
                className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg"
                onClick={onAdopt}
              >
                <i className="ri-check-line" /> 采用此内容
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── useSystemPrompt — fetch system prompt from rules API ──────────────

export function useSystemPrompt(scene: string, fallback: string) {
  return useCallback(async (): Promise<string> => {
    try {
      const { API_BASE, getAuthHeaders } = await import('../useWorldApi');
      const res = await fetch(
        `${API_BASE}/api/rules/scene/${encodeURIComponent(scene)}`,
        { headers: getAuthHeaders() }
      );
      const result = await res.json();
      if (result.success && result.data) {
        const d = result.data;
        if (typeof d === 'string') return d;
        if (d.systemPrompt) return d.systemPrompt;
        if (d.prompt) return d.prompt;
        if (d.content) return d.content;
      }
    } catch {}
    return fallback;
  }, [scene, fallback]);
}
