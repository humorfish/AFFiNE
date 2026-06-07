import React, { useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  generateLLM,
  generateValidated,
  useSystemPrompt,
} from './panel-shared';
import { z } from 'zod';
import { saveVersion } from '../useWorldApi';

interface Props {
  projectId: number | null;
  onClose: () => void;
  leftOffset?: number;
}

// ─── Source-derived: system prompt (源码 lines 41662-41709) ───
function buildStoryCoreSystemPrompt(worldview?: Record<string, string>) {
  let prompt = `你是一位专业的小说故事核心设计师，擅长构建引人入胜的故事核心要素。\n\n`;
  if (worldview && Object.keys(worldview).length > 0) {
    prompt += `【世界观背景】
世界名称：${worldview.世界名称 || '未设定'}
世界类型：${worldview.世界类型 || '未设定'}
势力格局：${worldview.势力格局 || '未设定'}
核心规则：${worldview.核心规则 || '未设定'}\n\n`;
  }
  prompt += `【输出格式】（极简格式，节省token）
T|核心主题
C|核心冲突
S|重大赌注
H|预期悬念
D|结局方向
E|结局走向

【格式说明】
- T: 核心主题（故事要传达的核心思想，如成长、救赎、正义等，10-50字）
- C: 核心冲突（推动故事发展的主要矛盾，10-50字）
- S: 重大赌注（主角失败会失去什么，10-50字）
- H: 预期悬念（吸引读者持续阅读的悬念，10-50字）
- D: 结局方向（故事的大致走向，如圆满、悲剧、开放等，5-20字）
- E: 结局走向（具体的结局设想，10-50字）

【输出示例】
T|一个普通少年在残酷的修仙世界中坚守本心，最终证道长生
C|主角与命运的抗争，以及修仙界弱肉强食规则与人性良知的冲突
S|失败意味着永远失去挚爱，并成为强者的傀儡或牺牲品
H|神秘的身世之谜、隐藏在暗处的幕后黑手、主角真正的命运
D|圆满中带着遗憾
E|主角证道成功，拯救了挚爱，但牺牲了部分修为，踏上新的旅程

【核心要求】
1. 内容要符合世界观设定
2. 核心冲突要有足够的戏剧张力
3. 悬念设置要吸引读者

【重要规则】
1. 严格按格式输出，每行一个项
2. T行必须在第一行
3. 不要输出任何其他内容`;
  return prompt;
}

// Pipe parser (源码 lines 41711-41745)
function parseStoryCorePipe(text: string): Record<string, string> | null {
  const lines = text.split('\n').filter(l => l.trim());
  let 核心主题 = '',
    核心冲突 = '',
    重大赌注 = '',
    预期悬念 = '',
    结局方向 = '',
    结局走向 = '';
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('T|')) 核心主题 = t.substring(2).trim();
    else if (t.startsWith('C|')) 核心冲突 = t.substring(2).trim();
    else if (t.startsWith('S|')) 重大赌注 = t.substring(2).trim();
    else if (t.startsWith('H|')) 预期悬念 = t.substring(2).trim();
    else if (t.startsWith('D|')) 结局方向 = t.substring(2).trim();
    else if (t.startsWith('E|')) 结局走向 = t.substring(2).trim();
  }
  return 核心主题 || 核心冲突
    ? { 核心主题, 核心冲突, 重大赌注, 预期悬念, 结局方向, 结局走向 }
    : null;
}

// Combined parser: pipe first, then JSON fallbacks (源码 lines 41747-41766)
function parseStoryCoreResponse(text: string): Record<string, string> | null {
  if (!text) return null;
  const pipe = parseStoryCorePipe(text.trim());
  if (pipe && (pipe.核心主题 || pipe.核心冲突)) return pipe;
  try {
    return JSON.parse(text);
  } catch {}
  const codeMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (codeMatch)
    try {
      return JSON.parse(codeMatch[1]);
    } catch {}
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch)
    try {
      return JSON.parse(braceMatch[0]);
    } catch {}
  return null;
}

/* ─── Source-derived: 6 collapsible sections (源码 lines 151790-151815) ─── */
const storyCoreSchema = z.record(z.string());

const 核心字段: Array<{
  key: string;
  desc: string;
  placeholder: string;
  icon: string;
  colorClass: string;
  bgClass: string;
}> = [
  {
    key: '核心主题',
    desc: '故事要传达的核心思想或价值观',
    placeholder: '例如：成长与自我救赎、爱与牺牲、正义与邪恶的对抗...',
    icon: 'ri-lightbulb-line',
    colorClass: 'text-purple-400',
    bgClass: 'bg-purple-500/20',
  },
  {
    key: '核心冲突',
    desc: '推动故事发展的主要矛盾',
    placeholder:
      '例如：主角与宿敌的对抗、内心的挣扎与抉择、理想与现实的冲突...',
    icon: 'ri-sword-line',
    colorClass: 'text-red-400',
    bgClass: 'bg-red-500/20',
  },
  {
    key: '重大赌注',
    desc: '主角失败会失去什么',
    placeholder: '例如：失去挚爱、世界毁灭、自我迷失、永远无法实现梦想...',
    icon: 'ri-fire-line',
    colorClass: 'text-orange-400',
    bgClass: 'bg-orange-500/20',
  },
  {
    key: '预期悬念',
    desc: '吸引读者持续阅读的悬念设置',
    placeholder: '例如：主角的身世之谜、隐藏的敌人、预言的真相、未知的力量...',
    icon: 'ri-question-line',
    colorClass: 'text-blue-400',
    bgClass: 'bg-blue-500/20',
  },
  {
    key: '结局方向',
    desc: '故事的大致走向和基调',
    placeholder: '例如：圆满结局、悲剧结局、开放式结局、意外反转...',
    icon: 'ri-compass-3-line',
    colorClass: 'text-green-400',
    bgClass: 'bg-green-500/20',
  },
  {
    key: '结局走向',
    desc: '具体的结局设想和细节',
    placeholder: '例如：主角最终战胜心魔、牺牲自我拯救世界、与宿敌和解...',
    icon: 'ri-flag-line',
    colorClass: 'text-indigo-400',
    bgClass: 'bg-indigo-500/20',
  },
];

export const StoryCorePanel: React.FC<Props> = ({
  projectId,
  onClose,
  leftOffset,
}) => {
  const [数据, set数据] = useState<Record<string, string>>({});
  const [折叠, set折叠] = useState<Record<string, boolean>>({
    核心主题: true,
    核心冲突: true,
    重大赌注: true,
    预期悬念: true,
    结局方向: true,
    结局走向: true,
  });
  /* Per-section font size (源码 line 151790: each field starts at 14, range 12-24) */
  const [字体大小, set字体大小] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    核心字段.forEach(f => {
      m[f.key] = 14;
    });
    return m;
  });
  const adjustFont = useCallback((field: string, delta: number) => {
    set字体大小(prev => ({
      ...prev,
      [field]: Math.max(12, Math.min(24, (prev[field] || 14) + delta)),
    }));
  }, []);

  const [width, setWidth] = useState(520);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* ─── AI Generation state (源码 lines 151821-151830) ─── */
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [genResult, setGenResult] = useState<Record<string, string> | null>(
    null
  );
  const [genError, setGenError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fetchSystemPrompt = useSystemPrompt(
    'AI生成故事核心',
    buildStoryCoreSystemPrompt()
  );

  const handleSave = useCallback(async () => {
    if (!projectId) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveVersion('storycore', projectId, {
        描述: '保存故事核心',
        内容: 数据,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }, [projectId, 数据]);

  /* AI生成: open dialog (源码 function R, line 151978) */
  const openAIDialog = useCallback(() => {
    setAiPrompt('');
    setStreamText('');
    setGenResult(null);
    setGenError('');
    setShowAIDialog(true);
  }, []);

  /* AI生成: start generation (源码 function oe, lines 41767-41858) */
  const startGeneration = useCallback(async () => {
    setGenerating(true);
    setStreamText('');
    setGenResult(null);
    setGenError('');
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const apiPrompt = await fetchSystemPrompt();
      const systemPrompt = apiPrompt || buildStoryCoreSystemPrompt();
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        {
          role: 'user' as const,
          content: aiPrompt || '请根据世界观信息，生成完整的故事核心设定',
        },
      ];

      const result = await generateValidated({
        schema: storyCoreSchema,
        generate: attempt =>
          generateLLM({
            messages,
            temperature: Math.min(1.0, 0.85 + attempt * 0.05),
            max_tokens: 4096,
            onChunk: setStreamText,
            signal: ac.signal,
          }),
        parseResponse: text => parseStoryCoreResponse(text),
        maxRetries: 3,
      });
      if (!result) {
        setGenError('AI返回格式解析失败');
      } else {
        const parsed = result.data;
        const filtered: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && 核心字段.some(f => f.key === k))
            filtered[k] = v;
        }
        setGenResult(filtered);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setGenError(e.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  }, [aiPrompt, fetchSystemPrompt]);

  /* AI生成: adopt result (源码 function P, line 151840) */
  const adoptResult = useCallback(() => {
    if (!genResult) return;
    set数据(prev => ({ ...prev, ...genResult }));
    setShowAIDialog(false);
    setGenResult(null);
    if (projectId) {
      saveVersion('storycore', projectId, {
        描述: 'AI生成故事核心',
        内容: { ...数据, ...genResult },
      }).catch(() => {});
    }
  }, [genResult, 数据, projectId]);

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    if (!generating) setShowAIDialog(false);
  }, [generating]);

  /* ─── Resize ─── */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;
      const onMove = (ev: MouseEvent) =>
        setWidth(
          Math.max(360, Math.min(800, startWidth + (startX - ev.clientX)))
        );
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [width]
  );

  const 总字数 = useMemo(
    () => Object.values(数据).reduce((s, v) => s + (v?.length || 0), 0),
    [数据]
  );
  const 完成字段 = 核心字段.filter(f => (数据[f.key]?.length || 0) > 0).length;

  return createPortal(
    <div className="v-52301b7a">
      <div
        className="fixed top-0 bottom-0 z-40 flex"
        style={{ left: leftOffset }}
      >
        <div
          className="h-full bg-[var(--bg-darker)] border-r border-[var(--border)] flex flex-col shadow-2xl"
          style={{ width }}
        >
          {/* Header (源码 lines 151960-152035) */}
          <div className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-dark)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/20">
                  <i className="text-lg text-amber-400 ri-focus-3-line" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">故事核心</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    定义故事的核心主题与冲突
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-secondary)] px-2 py-1 bg-[var(--bg-card)] rounded">
                  {完成字段}/{核心字段.length} 字段
                </span>
                <button
                  className="p-1.5 hover:bg-amber-500/20 rounded-lg transition-colors text-amber-400"
                  title="AI生成故事核心"
                  onClick={openAIDialog}
                  disabled={generating}
                >
                  <i
                    className={`ri-${generating ? 'loader-4-line animate-spin' : 'magic-line'}`}
                  />
                </button>
                <button
                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg text-sm transition-colors disabled:opacity-50"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <i className="ri-save-line mr-1" />
                  {saved ? '已保存' : saving ? '保存中...' : '保存'}
                </button>
                <button
                  className="p-1.5 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                  onClick={onClose}
                >
                  <i className="text-lg ri-close-line" />
                </button>
              </div>
            </div>
          </div>

          {/* Section cards (源码 lines 152036-153920) */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {核心字段.map(f => {
              const isCollapsed = 折叠[f.key] === false;
              return (
                <div key={f.key} className="bg-[var(--bg-dark)] rounded-xl p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() =>
                      set折叠(prev => ({ ...prev, [f.key]: !prev[f.key] }))
                    }
                  >
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <i className={`${f.icon} ${f.colorClass}`} /> {f.key}{' '}
                      <span className="text-xs text-[var(--text-muted)] font-normal">
                        {f.desc}
                      </span>
                    </h3>
                    <i
                      className={`ri-arrow-${isCollapsed ? 'down' : 'up'}-s-line text-[var(--text-muted)]`}
                    />
                  </div>
                  {!isCollapsed && (
                    <div className="mt-3 relative">
                      <textarea
                        className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded px-3 py-2 text-sm overflow-y-auto resize-y focus:border-[var(--primary)] transition-colors pr-16"
                        style={{
                          minHeight: '120px',
                          maxHeight: '300px',
                          fontSize: `${字体大小[f.key] || 14}px`,
                        }}
                        placeholder={f.placeholder}
                        value={数据[f.key] || ''}
                        onChange={e =>
                          set数据(prev => ({
                            ...prev,
                            [f.key]: e.target.value,
                          }))
                        }
                      />
                      <div className="absolute top-2 right-2 flex gap-0.5">
                        <button
                          className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
                          onClick={() => adjustFont(f.key, -1)}
                        >
                          <i className="text-xs ri-zoom-out-line" />
                        </button>
                        <button
                          className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors"
                          onClick={() => adjustFont(f.key, 1)}
                        >
                          <i className="text-xs ri-zoom-in-line" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer (源码 lines 154063-154080) */}
          <div className="shrink-0 px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-darker)] flex justify-end">
            <span className="text-xs text-[var(--text-secondary)]">
              总计 {总字数} 字
            </span>
          </div>
        </div>

        {/* Resize handle */}
        <div
          className="relative z-10 w-2 bg-transparent cursor-col-resize hover:bg-amber-500/50 active:bg-amber-500 shrink-0"
          title="拖拽调整宽度"
          onMouseDown={handleMouseDown}
        />
        {/* Backdrop */}
        <div
          className="fixed top-0 bottom-0 right-0 bg-black/0 hover:bg-black/5"
          style={{ left: (leftOffset || 0) + width + 2 }}
          onClick={onClose}
        />
      </div>

      {/* AI Generation Dialog (源码 lines 153550-153920) */}
      {showAIDialog &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-[var(--bg-darker)] border border-[var(--border)] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              {/* Dialog header */}
              <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ri-magic-line text-amber-400" />
                  <h3 className="font-semibold">AI生成故事核心</h3>
                </div>
                <button
                  className="p-1.5 hover:bg-[var(--bg-dark)] rounded-lg"
                  onClick={cancelGeneration}
                >
                  <i className="ri-close-line" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Prompt textarea */}
                <div>
                  <label className="text-sm text-[var(--text-secondary)] block mb-1.5">
                    生成提示词（可选）
                  </label>
                  <textarea
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:border-amber-500/50"
                    placeholder="描述你想要的故事核心，如：一个修仙世界的逆袭故事，主角从底层崛起..."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    disabled={generating}
                  />
                </div>

                <p className="text-xs text-[var(--text-secondary)]">
                  AI会根据当前世界观信息生成故事核心，包括核心主题、核心冲突、重大赌注、预期悬念、结局方向和结局走向
                </p>

                {/* Streaming / Error */}
                {generating && streamText && (
                  <div className="bg-[var(--bg-dark)] rounded-xl p-4">
                    <label className="text-sm text-[var(--text-secondary)] block mb-1">
                      生成预览
                    </label>
                    <pre className="text-xs whitespace-pre-wrap max-h-[200px] overflow-y-auto text-[var(--text-primary)]">
                      {streamText}
                    </pre>
                  </div>
                )}
                {genError && <p className="text-sm text-red-400">{genError}</p>}

                {/* Result preview (源码 lines 153800-153920) */}
                {genResult && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">生成结果预览</h4>
                    {核心字段.map(f =>
                      genResult[f.key] ? (
                        <div
                          key={f.key}
                          className="bg-[var(--bg-dark)] rounded-xl p-3"
                        >
                          <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                            <i className={`${f.icon} ${f.colorClass}`} />{' '}
                            {f.key}
                          </label>
                          <p className="text-sm whitespace-pre-wrap">
                            {genResult[f.key]}
                          </p>
                        </div>
                      ) : null
                    )}
                  </div>
                )}
              </div>

              {/* Dialog footer */}
              <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
                {genResult ? (
                  <>
                    <button
                      className="px-4 py-2 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg text-sm"
                      onClick={() => {
                        setGenResult(null);
                        setStreamText('');
                      }}
                    >
                      重新生成
                    </button>
                    <button
                      className="px-4 py-2 btn-primary rounded-lg text-sm flex items-center gap-1"
                      onClick={adoptResult}
                    >
                      <i className="ri-check-line" /> 采用结果
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="px-4 py-2 bg-[var(--bg-dark)] hover:bg-[var(--border)] rounded-lg text-sm"
                      onClick={cancelGeneration}
                    >
                      {generating ? '取消生成' : '取消'}
                    </button>
                    <button
                      className="px-4 py-2 btn-primary rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
                      onClick={startGeneration}
                      disabled={generating}
                    >
                      <i
                        className={`ri-${generating ? 'loader-4-line animate-spin' : 'magic-line'}`}
                      />
                      {generating ? '生成中...' : '开始生成'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>,
    document.body
  );
};

export default StoryCorePanel;
