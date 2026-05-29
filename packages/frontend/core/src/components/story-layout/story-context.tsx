import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
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
  createProject: (input: { title: string; author: string; description: string; wordCountTarget: number }, workspacePath: string) => Promise<void>;
  addChapter: (title: string, content: string) => Promise<void>;
  selectChapter: (index: number) => Promise<void>;
  updateChapterContent: (content: string) => Promise<void>;
  deleteChapter: (index: number) => Promise<void>;
  setActiveModule: (module: string) => void;
}

type StoryContextValue = StoryState & StoryActions;

const StoryContext = createContext<StoryContextValue | null>(null);

export function useStory(): StoryContextValue {
  const ctx = useContext(StoryContext);
  if (!ctx) throw new Error('useStory must be used within StoryProvider');
  return ctx;
}

export function StoryProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<NovelProject | null>(null);
  const [chapters, setChapters] = useState<ChapterContent[]>([]);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number | null>(null);
  const [activeModule, setActiveModule] = useState('chapters');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createProject = useCallback(
    async (
      input: { title: string; author: string; description: string; wordCountTarget: number },
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
          meta: { index, title, wordCount: content.length, createdAt: now, updatedAt: now },
          content,
        };
        setChapters(prev => [...prev, newChapter]);
        setActiveChapterIndex(index);
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
    ]
  );

  return (
    <StoryContext.Provider value={value}>{children}</StoryContext.Provider>
  );
}
