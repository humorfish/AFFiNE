/* eslint-disable rxjs/finnish */
import './story-layout.css';

import { useCallback, useMemo, useRef, useState } from 'react';

import { AIChatRuntime } from '../../blocksuite/ai/runtime/chat/runtime';
import { WorkspaceAIChatSessionStrategy } from '../../blocksuite/ai/runtime/chat/session-strategy';
import { useAIChatElement } from '../../blocksuite/ai/runtime/chat/use-element';
import { useAIChatRuntime } from '../../blocksuite/ai/runtime/chat/use-runtime';
import { getStoryAIRequestService } from './ai/setup';
import { NewNovelDialog } from './new-novel-dialog';
import { PlaceholderDialog } from './placeholder-dialog';
import { saveSession } from './session-storage';
import { SettingsDialog } from './settings-dialog';
import { type AiTab, StoryAIPanel } from './story-ai-panel';
import { StoryChapterTree } from './story-chapter-tree';
import { StoryProvider, useStory } from './story-context';
import { StoryEditorPanel } from './story-editor-panel';
import { StoryFrameworkRoot } from './story-framework';
import { StoryNovelSwitcher } from './story-novel-switcher';
import { StoryResizeHandle } from './story-resize-handle';
import StoryTodoPanel from './story-todo-panel';
import { StoryTopBar } from './story-top-bar';
import { WorkspaceProvider } from './workspace-provider';

const THEME = {
  background: 'var(--affine-background-primary-color)',
  panel: 'var(--affine-background-secondary-color, #16162a)',
  active: 'var(--affine-primary-color)',
  text: 'var(--affine-text-primary-color)',
  textMuted: 'var(--affine-text-secondary-color)',
  border: 'var(--affine-border-color)',
};

// Minimal signal stub for BlockSuite components
const stubSignal = (v?: any) => ({
  value: v,
  peek: () => v,
  subscribe: () => () => {},
});

// Service stubs for AIChatContent — satisfies required property contracts
// without pulling in the full AFFiNE cloud service layer
const aiServiceStubs = {
  subscriptionService: {
    subscription: {
      revalidate: () => {},
      ai$: stubSignal({ status: 'active' }),
    },
  },
  reasoningConfig: {
    enabled: stubSignal(false),
    setEnabled: () => {},
  },
  searchMenuConfig: {
    enabled: stubSignal(false),
    setSearchMenuEnabled: () => {},
    search: () => stubSignal([]),
  },
  docDisplayConfig: {
    getTags: () => ({ signal: stubSignal([]), cleanup: () => {} }),
    getTagTitle: () => '',
    getTagPageIds: () => [],
    getCollections: () => ({ signal: stubSignal([]), cleanup: () => {} }),
    getCollectionPageIds: () => [],
  },
  serverService: { server: { config$: stubSignal({ type: 'local' }) } },
  affineFeatureFlagService: {
    flags: { enable_send_detailed_object_to_ai: stubSignal(false) },
  },
  affineWorkspaceDialogService: {},
  affineThemeService: {
    theme$: stubSignal('dark'),
    appTheme: { themeSignal: stubSignal('dark') },
  },
  notificationService: { toast: () => {} },
  aiDraftService: undefined,
  aiToolsConfigService: {
    getToolsConfig: () => ({}),
    config: stubSignal({ searchWorkspace: false, readingDocs: false }),
    setConfig: () => {},
  },
  aiModelService: {
    models: stubSignal([
      {
        id: 'default',
        name: 'Default',
        category: 'Default',
        version: '1.0',
        isDefault: true,
        isPro: false,
      },
    ]),
    modelId: stubSignal('default'),
    setModel: () => {},
  },
  peekViewService: {},
  onAISubscribe: async () => {},
  onOpenDoc: () => {},
};

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    background: 'var(--affine-background-primary-color)',
    overflow: 'hidden',
  },
  columns: {
    display: 'flex',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
  },
  sidebar: {
    width: 220,
    minWidth: 220,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--affine-background-secondary-color, #16162a)',
    borderRight: '1px solid var(--affine-border-color)',
    overflow: 'hidden',
  },
};

export const StoryLayout = () => {
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(380);
  const [aiPanelResizing, setAiPanelResizing] = useState(false);
  const [activeAiTab, setActiveAiTab] = useState<AiTab>('chat');
  const [activeNavId, setActiveNavId] = useState<string | null>(null);
  const [showNewNovelDialog, setShowNewNovelDialog] = useState(false);
  const [showTodoPanel, setShowTodoPanel] = useState(false);
  const [todoAnchorEl, setTodoAnchorEl] = useState<HTMLElement | null>(null);
  const [expandedVolumes, setExpandedVolumes] = useState<string[]>([]);
  const [focusMode, setFocusMode] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);

  const requestService = getStoryAIRequestService();
  const runtime = useMemo(() => {
    if (!requestService) return null;
    return new AIChatRuntime({
      request: requestService,
      scope: { kind: 'workspace', workspaceId: 'story-workspace' },
      strategy: new WorkspaceAIChatSessionStrategy(),
    });
  }, [requestService]);
  const snapshot = useAIChatRuntime(runtime);

  useAIChatElement({
    containerRef: chatContainerRef,
    selector: 'ai-chat-content',
    enabled: aiPanelOpen && !focusMode && !!runtime,
    createElement: () => document.createElement('ai-chat-content'),
    configureElement: (el: any) => {
      el.runtime = runtime;
      el.runtimeSnapshot = snapshot;
      el.workspaceId = 'story-workspace';
      Object.assign(el, aiServiceStubs);
    },
  });

  const openChatWithPrompt = useCallback((_prompt: string) => {
    setAiPanelOpen(true);
  }, []);

  const handleCreateNovel = useCallback(
    (_novelData: {
      title: string;
      mode: 'long' | 'short';
      targetWordCount?: number;
      targetChapterCount?: number;
      worldview: string;
      motivation?: string;
    }) => {
      setShowNewNovelDialog(false);
    },
    []
  );

  return (
    <StoryFrameworkRoot>
      <WorkspaceProvider>
        <StoryProvider>
          <StoryLayoutInner
            aiPanelOpen={aiPanelOpen}
            setAiPanelOpen={setAiPanelOpen}
            aiPanelWidth={aiPanelWidth}
            setAiPanelWidth={setAiPanelWidth}
            aiPanelResizing={aiPanelResizing}
            setAiPanelResizing={setAiPanelResizing}
            activeAiTab={activeAiTab}
            setActiveAiTab={setActiveAiTab}
            activeNavId={activeNavId}
            setActiveNavId={setActiveNavId}
            showNewNovelDialog={showNewNovelDialog}
            setShowNewNovelDialog={setShowNewNovelDialog}
            showTodoPanel={showTodoPanel}
            setShowTodoPanel={setShowTodoPanel}
            todoAnchorEl={todoAnchorEl}
            setTodoAnchorEl={setTodoAnchorEl}
            expandedVolumes={expandedVolumes}
            setExpandedVolumes={setExpandedVolumes}
            focusMode={focusMode}
            setFocusMode={setFocusMode}
            openChatWithPrompt={openChatWithPrompt}
            handleCreateNovel={handleCreateNovel}
            chatContainerRef={chatContainerRef}
          />
        </StoryProvider>
      </WorkspaceProvider>
    </StoryFrameworkRoot>
  );
};

// Inner component that can access useStory() via StoryProvider
function StoryLayoutInner({
  aiPanelOpen,
  setAiPanelOpen,
  aiPanelWidth,
  setAiPanelWidth,
  _aiPanelResizing,
  setAiPanelResizing,
  activeAiTab,
  setActiveAiTab,
  activeNavId,
  setActiveNavId,
  showNewNovelDialog,
  setShowNewNovelDialog,
  showTodoPanel,
  setShowTodoPanel,
  todoAnchorEl,
  _setTodoAnchorEl,
  expandedVolumes,
  setExpandedVolumes,
  focusMode,
  setFocusMode,
  openChatWithPrompt,
  handleCreateNovel,
  chatContainerRef,
}: {
  aiPanelOpen: boolean;
  setAiPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  aiPanelWidth: number;
  setAiPanelWidth: React.Dispatch<React.SetStateAction<number>>;
  _aiPanelResizing: boolean;
  setAiPanelResizing: React.Dispatch<React.SetStateAction<boolean>>;
  activeAiTab: AiTab;
  setActiveAiTab: React.Dispatch<React.SetStateAction<AiTab>>;
  activeNavId: string | null;
  setActiveNavId: React.Dispatch<React.SetStateAction<string | null>>;
  showNewNovelDialog: boolean;
  setShowNewNovelDialog: React.Dispatch<React.SetStateAction<boolean>>;
  showTodoPanel: boolean;
  setShowTodoPanel: React.Dispatch<React.SetStateAction<boolean>>;
  todoAnchorEl: HTMLElement | null;
  _setTodoAnchorEl: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
  expandedVolumes: string[];
  setExpandedVolumes: React.Dispatch<React.SetStateAction<string[]>>;
  focusMode: boolean;
  setFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
  openChatWithPrompt: (prompt: string) => void;
  handleCreateNovel: (novel: {
    title: string;
    mode: 'long' | 'short';
    targetWordCount?: number;
    targetChapterCount?: number;
    worldview: string;
    motivation?: string;
  }) => void;
  chatContainerRef: React.RefObject<HTMLDivElement>;
}) {
  const {
    novels,
    activeNovelId,
    chapters,
    activeChapterIndex,
    volumes,
    todos,
    switchNovel,
    addChapter,
    addVolume,
    selectChapter,
    addTodo,
    toggleTodo,
    deleteTodo,
  } = useStory();

  const activeChapter =
    activeChapterIndex !== null
      ? chapters.find(ch => ch.meta.index === activeChapterIndex)
      : null;

  const handleNavClick = useCallback(
    (id: string) => {
      if (id === 'todo') {
        setShowTodoPanel(prev => !prev);
        return;
      }
      setActiveNavId(prev => (prev === id ? null : id));
    },
    [setShowTodoPanel, setActiveNavId]
  );

  return (
    <>
      <div style={styles.root}>
        {/* Full-width top bar */}
        <StoryTopBar
          activeNovel={novels.find(n => n.id === activeNovelId) ?? null}
          activeChapterTitle={activeChapter?.meta?.title ?? ''}
          activeNavId={activeNavId}
          onNavClick={handleNavClick}
          focusMode={focusMode}
          onFocusToggle={() => setFocusMode(p => !p)}
          aiPanelOpen={aiPanelOpen}
          onAiPanelToggle={() => setAiPanelOpen(p => !p)}
        />

        {/* Three columns */}
        <div style={styles.columns}>
          {/* Left sidebar (hidden in focus mode) */}
          {!focusMode && (
            <div style={styles.sidebar}>
              <StoryNovelSwitcher
                novels={novels}
                activeNovelId={activeNovelId}
                onSwitchNovel={switchNovel}
                onCreateNovel={() => setShowNewNovelDialog(true)}
                theme={THEME}
              />
              <StoryChapterTree
                volumes={volumes}
                chapters={chapters.map(ch => ({
                  id: ch.meta.index.toString(),
                  docId: `chapter:ch-${ch.meta.index}`,
                  volumeId: undefined,
                  title: ch.meta.title,
                  wordCount: ch.meta.wordCount,
                  order: ch.meta.index,
                  createdAt: ch.meta.createdAt,
                  updatedAt: ch.meta.updatedAt,
                }))}
                activeChapterIndex={activeChapterIndex ?? -1}
                expandedVolumes={expandedVolumes}
                onExpandedVolumesChange={setExpandedVolumes}
                onSelectChapter={i => selectChapter(i)}
                onAddChapter={() => addChapter('新章节', '')}
                onAddVolume={() => addVolume('新卷')}
                theme={THEME}
              />
            </div>
          )}

          {/* Middle: Editor */}
          <StoryEditorPanel
            focusMode={focusMode}
            onFocusToggle={() => setFocusMode(p => !p)}
            onSendToChat={openChatWithPrompt}
            theme={THEME}
          />

          {/* Right: Resize handle + AI Panel */}
          {aiPanelOpen && !focusMode && (
            <>
              <StoryResizeHandle
                onWidthChange={w => setAiPanelWidth(w)}
                onWidthChanged={w => {
                  setAiPanelWidth(w);
                  saveSession({ aiPanelWidth: w });
                }}
                onResizingChange={setAiPanelResizing}
                minWidth={280}
                maxWidth={600}
              />
              <StoryAIPanel
                width={aiPanelWidth}
                activeTab={activeAiTab}
                onActiveTabChange={setActiveAiTab}
                chatContainerRef={chatContainerRef}
              />
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <NewNovelDialog
        open={showNewNovelDialog}
        onClose={() => setShowNewNovelDialog(false)}
        onCreate={handleCreateNovel}
      />
      <SettingsDialog
        open={activeNavId === 'settings'}
        onClose={() => setActiveNavId(null)}
      />
      <PlaceholderDialog
        open={
          !!activeNavId && !['chapters', 'settings'].includes(activeNavId ?? '')
        }
        title={activeNavId ?? ''}
        onClose={() => setActiveNavId(null)}
      />
      <StoryTodoPanel
        open={showTodoPanel}
        onClose={() => setShowTodoPanel(false)}
        anchorEl={todoAnchorEl}
        todos={todos}
        onAddTodo={addTodo}
        onToggleTodo={toggleTodo}
        onDeleteTodo={deleteTodo}
      />
    </>
  );
}
