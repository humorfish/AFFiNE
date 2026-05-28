import { GitService } from '@affine/git';
import {
  type ChapterContent,
  ChapterService,
  type CreateProjectInput,
  type NovelProject,
  ProjectService,
} from '@affine/story';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

export interface StoryState {
  project: NovelProject | null;
  chapters: ChapterContent[];
  activeChapterIndex: number | null;
  activeModule: string;
  loading: boolean;
  error: string | null;
}

interface StoryActions {
  createProject: (path: string, input: CreateProjectInput) => Promise<void>;
  openProject: (path: string) => Promise<void>;
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
  const [activeChapterIndex, setActiveChapterIndex] = useState<number | null>(
    null
  );
  const [activeModule, setActiveModule] = useState('chapters');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep service instances in refs so they survive re-renders
  const projectServiceRef = useRef<ProjectService | null>(null);
  const chapterServiceRef = useRef<ChapterService | null>(null);
  const gitServiceRef = useRef<GitService | null>(null);

  const getProjectService = useCallback(() => {
    if (!projectServiceRef.current) {
      projectServiceRef.current = new ProjectService();
    }
    return projectServiceRef.current;
  }, []);

  const loadChapters = useCallback(async (projectPath: string) => {
    if (!gitServiceRef.current) {
      gitServiceRef.current = new GitService(projectPath);
    }
    const chapterService = new ChapterService(
      gitServiceRef.current,
      projectPath
    );
    chapterServiceRef.current = chapterService;
    const chapterList = await chapterService.list();
    setChapters(chapterList);
  }, []);

  const createProject = useCallback(
    async (path: string, input: CreateProjectInput) => {
      setLoading(true);
      setError(null);
      try {
        const svc = getProjectService();
        const newProject = await svc.create(path, input);
        setProject(newProject);
        // Re-initialize git service for the new project
        gitServiceRef.current = new GitService(newProject.path);
        await loadChapters(newProject.path);
        setActiveChapterIndex(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [getProjectService, loadChapters]
  );

  const openProject = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const svc = getProjectService();
        const opened = await svc.open(path);
        setProject(opened);
        // Re-initialize git service for the opened project
        gitServiceRef.current = new GitService(opened.path);
        await loadChapters(opened.path);
        setActiveChapterIndex(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [getProjectService, loadChapters]
  );

  const addChapter = useCallback(
    async (title: string, content: string) => {
      if (!project || !chapterServiceRef.current) return;
      setLoading(true);
      setError(null);
      try {
        const svc = chapterServiceRef.current;
        // Next index is chapters.length + 1 (1-based)
        const index = chapters.length + 1;
        await svc.create(index, title, content);
        await loadChapters(project.path);
        // Select the newly added chapter
        setActiveChapterIndex(index);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [project, chapters.length, loadChapters]
  );

  const selectChapter = useCallback(async (index: number) => {
    setActiveChapterIndex(index);
    // Chapter data is already loaded in the chapters state
  }, []);

  const updateChapterContent = useCallback(
    async (content: string) => {
      if (activeChapterIndex === null || !chapterServiceRef.current) return;
      setError(null);
      try {
        const svc = chapterServiceRef.current;
        await svc.update(activeChapterIndex, content);
        // Optimistically update the chapter in state
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
      if (!project || !chapterServiceRef.current) return;
      setLoading(true);
      setError(null);
      try {
        const svc = chapterServiceRef.current;
        await svc.delete(index);
        if (activeChapterIndex === index) {
          setActiveChapterIndex(null);
        }
        await loadChapters(project.path);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [project, activeChapterIndex, loadChapters]
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
      openProject,
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
      openProject,
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
