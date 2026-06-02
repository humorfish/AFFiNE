/* eslint-disable rxjs/finnish */
import './story-layout.css';

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AIChatRuntime } from '../../blocksuite/ai/runtime/chat/runtime';
import { WorkspaceAIChatSessionStrategy } from '../../blocksuite/ai/runtime/chat/session-strategy';
import { useAIChatElement } from '../../blocksuite/ai/runtime/chat/use-element';
import { useAIChatRuntime } from '../../blocksuite/ai/runtime/chat/use-runtime';
import {
  clearAIChapterContext,
  getStoryAIRequestService,
  setAIChapterContext,
  setEditorApiGetterForAI,
} from './ai/setup';
import { NovelDialog } from './novel-dialog';
import { PlaceholderDialog } from './placeholder-dialog';
import { loadSession, saveSession } from './session-storage';
import { SettingsDialog } from './settings-dialog';
import { type AiTab, StoryAIPanel } from './story-ai-panel';
import { StoryChapterTree } from './story-chapter-tree';
import { StoryProvider, useStory } from './story-context';
import { type EditorAPI, StoryEditorPanel } from './story-editor-panel';
import { StoryFrameworkRoot } from './story-framework';
import { StoryNovelSwitcher } from './story-novel-switcher';
import { StoryResizeHandle } from './story-resize-handle';
import { StoryTodoPanel } from './story-todo-panel';
import { StoryTopBar } from './story-top-bar';
import { useWorkspace, WorkspaceProvider } from './workspace-provider';

class StoryErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 32,
            color: '#e74c3c',
            background: '#1a1a2e',
            minHeight: '100vh',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
          }}
        >
          <h2>Story Layout Error</h2>
          <div>{this.state.error.message}</div>
          <div style={{ marginTop: 16, opacity: 0.7 }}>
            {this.state.error.stack}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const THEME = {
  background: 'var(--affine-background-primary-color)',
  panel: 'var(--affine-background-secondary-color, #16162a)',
  active: 'var(--affine-primary-color)',
  text: 'var(--affine-text-primary-color)',
  textMuted: 'var(--affine-text-secondary-color)',
  border: 'var(--affine-border-color)',
};

const stubSignal = (v?: any) => ({
  value: v,
  peek: () => v,
  subscribe: () => () => {},
});

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

const styles: Record<string, React.CSSProperties> = {
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
    transition: 'width 0.2s, min-width 0.2s, opacity 0.2s',
  },
  sidebarCollapsed: {
    width: 0,
    minWidth: 0,
    overflow: 'hidden',
    borderRight: 'none',
  },
};

export const StoryLayout = () => (
  <StoryErrorBoundary>
    <StoryLayoutContent />
  </StoryErrorBoundary>
);

const StoryLayoutContent = () => {
  // Suppress benign ResizeObserver loop warning (common in complex layouts)
  useEffect(() => {
    const handler = (e: ErrorEvent) => {
      if (
        e.message ===
        'ResizeObserver loop completed with undelivered notifications.'
      ) {
        e.stopImmediatePropagation();
        return true;
      }
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dirtyChapterIds, setDirtyChapterIds] = useState<Set<string>>(
    new Set()
  );

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const editorApiRef = useRef<EditorAPI | null>(null);

  // Register getter once — reads ref at request time, always current
  useEffect(() => {
    setEditorApiGetterForAI(() => editorApiRef.current);
  }, []);

  const requestService = getStoryAIRequestService();
  const runtime = useMemo(() => {
    if (!requestService) return null;
    try {
      return new AIChatRuntime({
        request: requestService as any,
        scope: { kind: 'workspace', workspaceId: 'story-workspace' },
        strategy: new WorkspaceAIChatSessionStrategy(),
      });
    } catch (e) {
      console.error('[StoryLayout] AIChatRuntime init failed:', e);
      return null;
    }
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

  const handleEditorDirtyChange = useCallback(
    (dirty: boolean, chapterId: string) => {
      setDirtyChapterIds(prev => {
        const next = new Set(prev);
        if (dirty) {
          next.add(chapterId);
        } else {
          next.delete(chapterId);
        }
        return next;
      });
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
            sidebarCollapsed={sidebarCollapsed}
            setSidebarCollapsed={setSidebarCollapsed}
            openChatWithPrompt={openChatWithPrompt}
            chatContainerRef={chatContainerRef}
            dirtyChapterIds={dirtyChapterIds}
            onEditorDirtyChange={handleEditorDirtyChange}
            editorApiRef={editorApiRef}
          />
        </StoryProvider>
      </WorkspaceProvider>
    </StoryFrameworkRoot>
  );
};

function StoryLayoutInner({
  aiPanelOpen,
  setAiPanelOpen,
  aiPanelWidth,
  setAiPanelWidth,
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
  expandedVolumes,
  setExpandedVolumes,
  focusMode,
  setFocusMode,
  sidebarCollapsed,
  setSidebarCollapsed,
  openChatWithPrompt,
  chatContainerRef,
  dirtyChapterIds,
  onEditorDirtyChange,
  editorApiRef,
}: {
  aiPanelOpen: boolean;
  setAiPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  aiPanelWidth: number;
  setAiPanelWidth: React.Dispatch<React.SetStateAction<number>>;
  aiPanelResizing: boolean;
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
  setTodoAnchorEl: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
  expandedVolumes: string[];
  setExpandedVolumes: React.Dispatch<React.SetStateAction<string[]>>;
  focusMode: boolean;
  setFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  openChatWithPrompt: (prompt: string) => void;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  dirtyChapterIds: Set<string>;
  onEditorDirtyChange: (dirty: boolean, chapterId: string) => void;
  editorApiRef: React.RefObject<EditorAPI | null>;
}) {
  const sessionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (sessionSaveTimer.current) clearTimeout(sessionSaveTimer.current);
    sessionSaveTimer.current = setTimeout(() => {
      saveSession({
        aiPanelOpen,
        aiPanelWidth,
        activeAiTab,
        sidebarCollapsed,
        chapterTreeExpandedVolumes: expandedVolumes,
      });
    }, 500);
    return () => {
      if (sessionSaveTimer.current) {
        clearTimeout(sessionSaveTimer.current);
        saveSession({
          aiPanelOpen,
          aiPanelWidth,
          activeAiTab,
          sidebarCollapsed,
          chapterTreeExpandedVolumes: expandedVolumes,
        });
      }
    };
  }, [
    aiPanelOpen,
    aiPanelWidth,
    activeAiTab,
    sidebarCollapsed,
    expandedVolumes,
  ]);

  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    if (session.aiPanelOpen !== undefined) setAiPanelOpen(session.aiPanelOpen);
    if (session.aiPanelWidth) setAiPanelWidth(session.aiPanelWidth);
    if (session.activeAiTab) setActiveAiTab(session.activeAiTab);
    if (session.sidebarCollapsed !== undefined)
      setSidebarCollapsed(session.sidebarCollapsed);
    if (session.chapterTreeExpandedVolumes)
      setExpandedVolumes(session.chapterTreeExpandedVolumes);
  }, [
    setAiPanelOpen,
    setAiPanelWidth,
    setActiveAiTab,
    setSidebarCollapsed,
    setExpandedVolumes,
  ]);

  const {
    novels,
    activeNovelId,
    chapters,
    activeChapterId,
    volumes: _volumes,
    todos,
    addChapter,
    addVolume: _addVolume,
    selectChapter,
    deleteChapter,
    createNovel,
    updateNovel,
    deleteNovel,
    switchNovel,
    addTodo,
    toggleTodo,
    deleteTodo,
  } = useStory();

  const { workspacePath } = useWorkspace();

  // Load persisted AI session when active chapter changes
  useEffect(() => {
    if (!workspacePath || !activeNovelId || !activeChapterId) {
      clearAIChapterContext();
      return;
    }
    setAIChapterContext(workspacePath, activeNovelId, activeChapterId).catch(
      () => {}
    );
  }, [workspacePath, activeNovelId, activeChapterId]);

  useEffect(() => {
    if (sessionSaveTimer.current) clearTimeout(sessionSaveTimer.current);
    sessionSaveTimer.current = setTimeout(() => {
      saveSession({
        activeNovelId,
        activeChapterId,
      });
    }, 500);
    return () => {
      if (sessionSaveTimer.current) {
        clearTimeout(sessionSaveTimer.current);
        saveSession({
          activeNovelId,
          activeChapterId,
        });
      }
    };
  }, [activeNovelId, activeChapterId]);

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

  const handleCreateNovel = useCallback(
    (data: {
      title: string;
      mode: 'long' | 'short';
      targetWordCount?: number;
      targetChapterCount?: number;
      worldview: string;
      motivation?: string;
    }) => {
      createNovel(data);
      setShowNewNovelDialog(false);
    },
    [createNovel, setShowNewNovelDialog]
  );

  const handleUpdateNovel = useCallback(
    (
      id: string,
      data: {
        title: string;
        mode: 'long' | 'short';
        targetWordCount?: number;
        targetChapterCount?: number;
        worldview: string;
        motivation?: string;
      }
    ) => {
      updateNovel(id, data);
    },
    [updateNovel]
  );

  const handleNovelAction = useCallback(() => {
    setShowNewNovelDialog(true);
  }, [setShowNewNovelDialog]);

  const activeNovel = novels.find(n => n.id === activeNovelId);
  const novelMode = activeNovel?.mode ?? 'long';

  const handleSelectChapter = useCallback(
    (id: string) => {
      const ch = chapters.find(c => c.meta.id === id);
      if (!ch) return;
      // Long novel: only load editor for child chapters (level-2)
      // Short novel: load editor for all chapters (level-1)
      const isLoadable =
        novelMode === 'short' ? true : ch.meta.parentId != null;
      if (isLoadable) {
        selectChapter(id);
      }
    },
    [novelMode, chapters, selectChapter]
  );

  const showSidebar = !focusMode && !sidebarCollapsed;

  return (
    <>
      <div style={styles.root}>
        <StoryTopBar
          activeNovel={activeNovel}
          hasNovels={novels.length > 0}
          activeNavId={activeNavId}
          onNavClick={handleNavClick}
          onNovelAction={handleNovelAction}
          focusMode={focusMode}
          onFocusToggle={() => setFocusMode(p => !p)}
          aiPanelOpen={aiPanelOpen}
          onAiPanelToggle={() => setAiPanelOpen(p => !p)}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarToggle={() => setSidebarCollapsed(p => !p)}
        />

        <div style={styles.columns}>
          {/* Left sidebar */}
          <div style={showSidebar ? styles.sidebar : styles.sidebarCollapsed}>
            <StoryNovelSwitcher
              novels={novels}
              activeNovelId={activeNovelId}
              theme={THEME}
            />
            {activeNovelId ? (
              <StoryChapterTree
                chapters={chapters.map(ch => ({
                  id: ch.meta.id,
                  parentId: ch.meta.parentId ?? null,
                  title: ch.meta.title,
                  wordCount: ch.meta.wordCount,
                  order: ch.meta.createdAt
                    ? new Date(ch.meta.createdAt).getTime()
                    : 0,
                  createdAt: ch.meta.createdAt,
                  updatedAt: ch.meta.updatedAt,
                }))}
                activeChapterId={activeChapterId}
                novelMode={novelMode}
                dirtyChapterIds={dirtyChapterIds}
                onSelectChapter={handleSelectChapter}
                onAddChapter={parentId => addChapter('', '', parentId ?? null)}
                onDeleteChapter={id => deleteChapter(id)}
                theme={THEME}
              />
            ) : (
              <div style={{ flex: 1 }} />
            )}
          </div>

          {/* Middle: Editor */}
          <StoryEditorPanel
            ref={editorApiRef}
            focusMode={focusMode}
            onFocusToggle={() => setFocusMode(p => !p)}
            onSendToChat={openChatWithPrompt}
            onDirtyChange={onEditorDirtyChange}
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
      <NovelDialog
        open={showNewNovelDialog}
        onClose={() => setShowNewNovelDialog(false)}
        novels={novels}
        activeNovelId={activeNovelId}
        onCreate={handleCreateNovel}
        onUpdate={handleUpdateNovel}
        onDelete={deleteNovel}
        onSwitch={switchNovel}
      />
      <SettingsDialog
        open={activeNavId === 'settings'}
        onClose={() => setActiveNavId(null)}
      />
      <PlaceholderDialog
        open={
          !!activeNavId &&
          !['chapters', 'settings', 'todo'].includes(activeNavId ?? '')
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
