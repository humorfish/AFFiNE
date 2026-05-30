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
  useState,
} from 'react';

export interface ChapterMeta {
  index: number;
  title: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterContent {
  meta: ChapterMeta;
  content: string;
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
  updateChapterContent: (content: string) => Promise<void>;
  deleteChapter: (index: number) => Promise<void>;
  setActiveModule: (module: string) => void;
  getChapterStore: (chapterIndex: number) => Store | null;
}

type StoryContextValue = StoryState & StoryActions;

const StoryContext = createContext<StoryContextValue | null>(null);

// Persistence keys
const STORAGE_KEYS = {
  activeProjectId: 'story-active-project-id',
  activeChapterIndex: 'story-active-chapter-index',
  projectMeta: 'story-project-meta',
  chaptersData: 'story-chapters-data',
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
    () => loadFromStorage<number>(STORAGE_KEYS.activeChapterIndex)
  );
  const [activeModule, setActiveModule] = useState('chapters');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setActiveChapterIndex(index);
        saveToStorage(STORAGE_KEYS.activeChapterIndex, index);
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
    saveToStorage(STORAGE_KEYS.activeChapterIndex, index);
  }, []);

  const updateChapterContent = useCallback(
    async (content: string) => {
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
                    wordCount: content.length,
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
          saveToStorage(STORAGE_KEYS.activeChapterIndex, null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [project, activeChapterIndex]
  );

  const value = useMemo<StoryContextValue>(
    () => ({
      project,
      chapters,
      activeChapterIndex,
      activeModule,
      loading,
      error,
      createProject,
      addChapter,
      selectChapter,
      updateChapterContent,
      deleteChapter,
      setActiveModule,
      getChapterStore,
    }),
    [
      project,
      chapters,
      activeChapterIndex,
      activeModule,
      loading,
      error,
      createProject,
      addChapter,
      selectChapter,
      updateChapterContent,
      deleteChapter,
      setActiveModule,
      getChapterStore,
    ]
  );

  return (
    <StoryContext.Provider value={value}>{children}</StoryContext.Provider>
  );
}
