import { StoreExtensionManager } from '@blocksuite/affine/ext-loader';
import { getInternalStoreExtensions } from '@blocksuite/affine/extensions/store';
import { AffineSchemas } from '@blocksuite/affine/schemas';
import type { Store } from '@blocksuite/affine/store';
import { Schema, Text } from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { MemoryBlobSource, NoopDocSource } from '@blocksuite/affine/sync';
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { loadSession, saveSession } from './session-storage';

// Legacy chapter meta used internally by ChapterContent
interface LegacyChapterMeta {
  index: number;
  title: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterContent {
  meta: LegacyChapterMeta;
  content: string;
}

// --- New data models for multi-novel support ---

export interface NovelMeta {
  id: string;
  title: string;
  mode: 'long' | 'short';
  targetWordCount?: number;
  targetChapterCount?: number;
  worldview: string;
  motivation?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Volume {
  id: string;
  title: string;
  order: number;
}

export interface ChapterMeta {
  id: string;
  docId: string;
  volumeId?: string;
  title: string;
  wordCount: number;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  novelId?: string;
  chapterId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  novelId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionState {
  activeNovelId: string;
  activeChapterIndex: number;
  aiPanelOpen: boolean;
  aiPanelWidth: number;
  activeAiTab: 'chat' | 'continue' | 'polish' | 'analyze' | 'explain';
  activeChatSessionId: string;
  sidebarCollapsed: boolean;
  chapterTreeExpandedVolumes: string[];
  savedAt: string;
}

export interface NovelProject {
  id: string;
  path: string;
  meta: {
    title: string;
    author: string;
    description: string;
    wordCountTarget: number;
    createdAt: string;
    updatedAt: string;
  };
}

export interface StoryState {
  project: NovelProject | null;
  chapters: ChapterContent[];
  activeChapterIndex: number | null;
  activeModule: string;
  loading: boolean;
  error: string | null;
  // New multi-novel state
  novels: NovelMeta[];
  activeNovelId: string;
  volumes: Volume[];
  todos: TodoItem[];
  chatSessions: ChatSession[];
  activeChatSessionId: string;
}

interface StoryActions {
  createProject: (
    input: {
      title: string;
      author: string;
      description: string;
      wordCountTarget: number;
    },
    workspacePath: string
  ) => Promise<void>;
  addChapter: (title: string, content: string) => Promise<void>;
  selectChapter: (index: number) => Promise<void>;
  updateChapterContent: (
    content: string,
    meta?: { title?: string; wordCount?: number }
  ) => Promise<void>;
  deleteChapter: (index: number) => Promise<void>;
  setActiveModule: (module: string) => void;
  getChapterStore: (chapterIndex: number) => Store | null;
  // New multi-novel actions
  createNovel: (
    data: Omit<NovelMeta, 'id' | 'createdAt' | 'updatedAt'>
  ) => void;
  updateNovel: (
    id: string,
    data: Omit<NovelMeta, 'id' | 'createdAt' | 'updatedAt'>
  ) => void;
  switchNovel: (id: string) => void;
  deleteNovel: (id: string) => void;
  addVolume: (title: string) => void;
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  createChatSession: () => void;
  switchChatSession: (id: string) => void;
}

type StoryContextValue = StoryState & StoryActions;

const StoryContext = createContext<StoryContextValue | null>(null);

// Persistence keys
const STORAGE_KEYS = {
  activeProjectId: 'story-active-project-id',
  activeChapterIndex: 'story-active-chapter-index',
  projectMeta: 'story-project-meta',
  chaptersData: 'story-chapters-data',
  novels: 'story-novels',
  todos: 'story-todos',
  chatSessions: 'story-chat-sessions',
};

function loadFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

// BlockSuite workspace singleton for Story
const bsSchema = new Schema();
bsSchema.register(AffineSchemas);

const bsStoreManager = new StoreExtensionManager(getInternalStoreExtensions());

const bsWorkspace = new TestWorkspace({
  id: 'story-editor',
  docSources: { main: new NoopDocSource() },
  blobSources: { main: new MemoryBlobSource() },
});
bsWorkspace.storeExtensions = bsStoreManager.get('store');
bsWorkspace.meta.initialize();

function createChapterStore(chapterId: string): Store {
  const docId = `chapter:${chapterId}`;
  let doc = bsWorkspace.getDoc(docId);
  if (!doc) {
    doc = bsWorkspace.createDoc(docId);
  }
  doc.load();
  const store = doc.getStore();
  if (!store.root) {
    const rootId = store.addBlock('affine:page', { title: new Text('') });
    store.addBlock('affine:surface', {}, rootId);
    const noteId = store.addBlock('affine:note', {}, rootId);
    store.addBlock('affine:paragraph', {}, noteId);
  }
  return store;
}

export function useStory(): StoryContextValue {
  const ctx = useContext(StoryContext);
  if (!ctx) throw new Error('useStory must be used within StoryProvider');
  return ctx;
}

export function StoryProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<NovelProject | null>(() =>
    loadFromStorage<NovelProject>(STORAGE_KEYS.projectMeta)
  );
  const [chapters, setChapters] = useState<ChapterContent[]>(
    () => loadFromStorage<ChapterContent[]>(STORAGE_KEYS.chaptersData) ?? []
  );
  const [activeChapterIndex, setActiveChapterIndex] = useState<number | null>(
    () =>
      loadSession()?.activeChapterIndex ??
      loadFromStorage<number>(STORAGE_KEYS.activeChapterIndex) ??
      null
  );
  const [activeModule, setActiveModule] = useState('chapters');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New multi-novel state
  const [novels, setNovels] = useState<NovelMeta[]>(
    () => loadFromStorage<NovelMeta[]>(STORAGE_KEYS.novels) ?? []
  );
  const [activeNovelId, setActiveNovelId] = useState<string>(
    () => loadSession()?.activeNovelId ?? ''
  );
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>(
    () => loadFromStorage<TodoItem[]>(STORAGE_KEYS.todos) ?? []
  );
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(
    () => loadFromStorage<ChatSession[]>(STORAGE_KEYS.chatSessions) ?? []
  );
  const [activeChatSessionId, setActiveChatSessionId] = useState<string>(
    () => loadSession()?.activeChatSessionId ?? ''
  );

  // Load volumes on mount when activeNovelId is present
  useEffect(() => {
    const novelId = loadSession()?.activeNovelId;
    if (novelId) {
      const volumesKey = `story-volumes-${novelId}`;
      setVolumes(loadFromStorage<Volume[]>(volumesKey) ?? []);
    }
  }, []);

  // Debounced session save timer
  const sessionSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSessionPartial = useRef<Partial<SessionState>>({});

  // --- Debounced session persistence ---
  const debouncedSaveSession = useCallback((partial: Partial<SessionState>) => {
    latestSessionPartial.current = partial;
    if (sessionSaveTimer.current) {
      clearTimeout(sessionSaveTimer.current);
    }
    sessionSaveTimer.current = setTimeout(() => {
      saveSession(partial);
      sessionSaveTimer.current = null;
    }, 500);
  }, []);

  // Save session when key state changes
  useEffect(() => {
    if (activeNovelId) {
      debouncedSaveSession({ activeNovelId });
    }
  }, [activeNovelId, debouncedSaveSession]);

  useEffect(() => {
    if (activeChapterIndex !== null) {
      debouncedSaveSession({ activeChapterIndex });
    }
  }, [activeChapterIndex, debouncedSaveSession]);

  useEffect(() => {
    if (activeChatSessionId) {
      debouncedSaveSession({ activeChatSessionId });
    }
  }, [activeChatSessionId, debouncedSaveSession]);

  // Cleanup timer on unmount — flush any pending save
  useEffect(() => {
    return () => {
      if (sessionSaveTimer.current) {
        clearTimeout(sessionSaveTimer.current);
        saveSession(latestSessionPartial.current);
        sessionSaveTimer.current = null;
      }
    };
  }, []);

  // Persist project and chapters to localStorage on change
  useEffect(() => {
    if (project) {
      saveToStorage(STORAGE_KEYS.projectMeta, project);
    } else {
      localStorage.removeItem(STORAGE_KEYS.projectMeta);
    }
  }, [project]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.chaptersData, chapters);
  }, [chapters]);

  // Persist new state
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.novels, novels);
  }, [novels]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.todos, todos);
  }, [todos]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.chatSessions, chatSessions);
  }, [chatSessions]);

  const chapterStores = React.useMemo(() => new Map<number, Store>(), []);

  const getChapterStore = React.useCallback(
    (chapterIndex: number): Store | null => {
      const existing = chapterStores.get(chapterIndex);
      if (existing) return existing;
      try {
        const store = createChapterStore(`ch-${chapterIndex}`);
        chapterStores.set(chapterIndex, store);
        return store;
      } catch (err) {
        console.error('Failed to create BlockSuite chapter store:', err);
        return null;
      }
    },
    [chapterStores]
  );

  const createProject = useCallback(
    async (
      input: {
        title: string;
        author: string;
        description: string;
        wordCountTarget: number;
      },
      workspacePath: string
    ) => {
      setLoading(true);
      setError(null);
      try {
        const id = crypto.randomUUID();
        const projectPath = `${workspacePath}/projects/${id}`;
        const newProject: NovelProject = {
          id,
          path: projectPath,
          meta: {
            title: input.title,
            author: input.author,
            description: input.description,
            wordCountTarget: input.wordCountTarget,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        };
        setProject(newProject);
        setChapters([]);
        setActiveChapterIndex(null);
        saveToStorage(STORAGE_KEYS.activeProjectId, id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const addChapter = useCallback(
    async (title: string, content: string) => {
      if (!project) return;
      setLoading(true);
      setError(null);
      try {
        // TODO(story): wire to Electron IPC → main process → @affine/story ChapterService
        const index = chapters.length + 1;
        const now = new Date().toISOString();
        const newChapter: ChapterContent = {
          meta: {
            index,
            title,
            wordCount: content.length,
            createdAt: now,
            updatedAt: now,
          },
          content,
        };
        setChapters(prev => [...prev, newChapter]);
        if (chapters.length === 0) {
          setActiveChapterIndex(index);
          saveToStorage(STORAGE_KEYS.activeChapterIndex, index);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [project, chapters.length]
  );

  const selectChapter = useCallback(async (index: number) => {
    setActiveChapterIndex(index);
  }, []);

  const updateChapterContent = useCallback(
    async (content: string, meta?: { title?: string; wordCount?: number }) => {
      if (activeChapterIndex === null) return;
      setError(null);
      try {
        // TODO(story): wire to Electron IPC → main process → @affine/story ChapterService
        setChapters(prev =>
          prev.map(ch =>
            ch.meta.index === activeChapterIndex
              ? {
                  ...ch,
                  content,
                  meta: {
                    ...ch.meta,
                    ...(meta?.title !== undefined ? { title: meta.title } : {}),
                    ...(meta?.wordCount !== undefined
                      ? { wordCount: meta.wordCount }
                      : {}),
                    updatedAt: new Date().toISOString(),
                  },
                }
              : ch
          )
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [activeChapterIndex]
  );

  const deleteChapter = useCallback(
    async (index: number) => {
      if (!project) return;
      setLoading(true);
      setError(null);
      try {
        // TODO(story): wire to Electron IPC → main process → @affine/story ChapterService
        setChapters(prev => prev.filter(ch => ch.meta.index !== index));
        if (activeChapterIndex === index) {
          setActiveChapterIndex(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [project, activeChapterIndex]
  );

  // --- New multi-novel CRUD actions ---

  const createNovel = useCallback(
    (data: Omit<NovelMeta, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      const novel: NovelMeta = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      setNovels(prev => [...prev, novel]);
      setActiveNovelId(novel.id);
    },
    []
  );

  const updateNovel = useCallback(
    (id: string, data: Omit<NovelMeta, 'id' | 'createdAt' | 'updatedAt'>) => {
      setNovels(prev =>
        prev.map(n =>
          n.id === id
            ? { ...n, ...data, updatedAt: new Date().toISOString() }
            : n
        )
      );
    },
    []
  );

  const switchNovel = useCallback((id: string) => {
    setActiveNovelId(id);
    // Load volumes for the target novel (currently placeholder — volumes
    // are stored per-novel in localStorage, keyed by novel id)
    const volumesKey = `story-volumes-${id}`;
    const loaded = loadFromStorage<Volume[]>(volumesKey) ?? [];
    setVolumes(loaded);
    // Reset chapter selection when switching novels
    setActiveChapterIndex(null);
  }, []);

  const deleteNovel = useCallback(
    (id: string) => {
      setNovels(prev => prev.filter(n => n.id !== id));
      // Remove per-novel volumes from storage
      localStorage.removeItem(`story-volumes-${id}`);
      // Clean up related chat sessions and todos
      setChatSessions(prev => prev.filter(s => s.novelId !== id));
      setTodos(prev => prev.filter(t => t.novelId !== id));
      // If the deleted novel was active, reset
      if (activeNovelId === id) {
        setActiveNovelId('');
        setVolumes([]);
        setActiveChapterIndex(null);
      }
    },
    [activeNovelId]
  );

  const addVolume = useCallback(
    (title: string) => {
      if (!activeNovelId) return;
      const vol: Volume = {
        id: crypto.randomUUID(),
        title,
        order: volumes.length,
      };
      const next = [...volumes, vol];
      setVolumes(next);
      // Persist per-novel volumes
      saveToStorage(`story-volumes-${activeNovelId}`, next);
    },
    [activeNovelId, volumes]
  );

  const addTodo = useCallback((text: string) => {
    const todo: TodoItem = {
      id: crypto.randomUUID(),
      text,
      done: false,
      createdAt: new Date().toISOString(),
    };
    setTodos(prev => [...prev, todo]);
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos(prev =>
      prev.map(t => (t.id === id ? { ...t, done: !t.done } : t))
    );
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
  }, []);

  const createChatSession = useCallback(() => {
    if (!activeNovelId) return;
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: crypto.randomUUID(),
      novelId: activeNovelId,
      title: 'New Chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setChatSessions(prev => [...prev, session]);
    setActiveChatSessionId(session.id);
  }, [activeNovelId]);

  const switchChatSession = useCallback((id: string) => {
    setActiveChatSessionId(id);
  }, []);

  const value = useMemo<StoryContextValue>(
    () => ({
      project,
      chapters,
      activeChapterIndex,
      activeModule,
      loading,
      error,
      // New state
      novels,
      activeNovelId,
      volumes,
      todos,
      chatSessions,
      activeChatSessionId,
      // Legacy actions
      createProject,
      addChapter,
      selectChapter,
      updateChapterContent,
      deleteChapter,
      setActiveModule,
      getChapterStore,
      // New actions
      createNovel,
      updateNovel,
      switchNovel,
      deleteNovel,
      addVolume,
      addTodo,
      toggleTodo,
      deleteTodo,
      createChatSession,
      switchChatSession,
    }),
    [
      project,
      chapters,
      activeChapterIndex,
      activeModule,
      loading,
      error,
      novels,
      activeNovelId,
      volumes,
      todos,
      chatSessions,
      activeChatSessionId,
      createProject,
      addChapter,
      selectChapter,
      updateChapterContent,
      deleteChapter,
      setActiveModule,
      getChapterStore,
      createNovel,
      updateNovel,
      switchNovel,
      deleteNovel,
      addVolume,
      addTodo,
      toggleTodo,
      deleteTodo,
      createChatSession,
      switchChatSession,
    ]
  );

  return (
    <StoryContext.Provider value={value}>{children}</StoryContext.Provider>
  );
}
