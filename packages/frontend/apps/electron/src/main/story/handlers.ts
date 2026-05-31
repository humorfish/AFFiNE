import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { logger } from '../logger';
import type { NamespaceHandlers } from '../type';

interface ChapterFileMeta {
  id: string;
  title: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChapterFileContent {
  meta: ChapterFileMeta;
  content: string;
}

function formatFrontmatter(meta: ChapterFileMeta): string {
  const lines = [
    '---',
    `id: ${meta.id}`,
    `title: ${meta.title}`,
    `parentId: ${meta.parentId ?? ''}`,
    `createdAt: ${meta.createdAt}`,
    `updatedAt: ${meta.updatedAt}`,
    '---',
  ];
  return lines.join('\n');
}

function parseChapterFile(raw: string, id: string): ChapterFileContent {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return {
      meta: { id, title: '', parentId: null, createdAt: '', updatedAt: '' },
      content: raw,
    };
  }

  const fm = match[1];
  const body = match[2].trimEnd();

  const get = (key: string) => {
    const m = fm.match(new RegExp(`^${key}: (.+)$`, 'm'));
    return m?.[1]?.trim() || '';
  };

  return {
    meta: {
      id,
      title: get('title'),
      parentId: get('parentId') || null,
      createdAt: get('createdAt'),
      updatedAt: get('updatedAt'),
    },
    content: body,
  };
}

function chapterDir(workspacePath: string, novelId: string): string {
  return join(workspacePath, 'projects', novelId, 'chapters');
}

function chapterPath(
  workspacePath: string,
  novelId: string,
  chapterId: string
): string {
  return join(chapterDir(workspacePath, novelId), `${chapterId}.md`);
}

export const storyHandlers = {
  listChapters: async (
    _e: Electron.IpcMainInvokeEvent,
    workspacePath: string,
    novelId: string
  ): Promise<ChapterFileContent[]> => {
    const dir = chapterDir(workspacePath, novelId);
    try {
      const files = await readdir(dir);
      const mdFiles = files.filter(f => f.endsWith('.md')).sort();
      const chapters: ChapterFileContent[] = [];
      for (const file of mdFiles) {
        const id = file.replace('.md', '');
        const raw = await readFile(join(dir, file), 'utf-8');
        chapters.push(parseChapterFile(raw, id));
      }
      return chapters;
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      logger.error('[story:listChapters]', err);
      return [];
    }
  },

  readChapter: async (
    _e: Electron.IpcMainInvokeEvent,
    workspacePath: string,
    novelId: string,
    chapterId: string
  ): Promise<ChapterFileContent | null> => {
    const filePath = chapterPath(workspacePath, novelId, chapterId);
    try {
      const raw = await readFile(filePath, 'utf-8');
      return parseChapterFile(raw, chapterId);
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      logger.error('[story:readChapter]', err);
      return null;
    }
  },

  writeChapter: async (
    _e: Electron.IpcMainInvokeEvent,
    workspacePath: string,
    novelId: string,
    chapterId: string,
    data: {
      title: string;
      content: string;
      parentId: string | null;
      createdAt?: string;
    }
  ): Promise<void> => {
    const dir = chapterDir(workspacePath, novelId);
    await mkdir(dir, { recursive: true });

    const now = new Date().toISOString();
    const meta: ChapterFileMeta = {
      id: chapterId,
      title: data.title,
      parentId: data.parentId,
      createdAt: data.createdAt ?? now,
      updatedAt: now,
    };

    const fileContent = `${formatFrontmatter(meta)}\n${data.content}\n`;
    const filePath = chapterPath(workspacePath, novelId, chapterId);
    await writeFile(filePath, fileContent, 'utf-8');
  },

  deleteChapter: async (
    _e: Electron.IpcMainInvokeEvent,
    workspacePath: string,
    novelId: string,
    chapterId: string
  ): Promise<void> => {
    const filePath = chapterPath(workspacePath, novelId, chapterId);
    try {
      await unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        logger.error('[story:deleteChapter]', err);
      }
    }
  },
} satisfies NamespaceHandlers;
