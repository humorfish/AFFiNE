import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { GitService } from '@affine/git';
import { GitPaths } from '@affine/git';

import type { ChapterContent, ChapterMeta } from './types.js';

function countWords(text: string): number {
  // Count Chinese characters (CJK Unified Ideographs and common extensions)
  const chineseChars = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  // Count English words (sequences of Latin letters)
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  return chineseChars + englishWords;
}

function formatFrontmatter(meta: ChapterMeta): string {
  return `---
title: ${meta.title}
index: ${meta.index}
createdAt: ${meta.createdAt}
updatedAt: ${meta.updatedAt}
---`;
}

function parseChapterFile(content: string): {
  meta: ChapterMeta;
  body: string;
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error('Invalid chapter file format: missing frontmatter');
  }

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2].trimEnd();

  const titleMatch = frontmatter.match(/^title: (.+)$/m);
  const indexMatch = frontmatter.match(/^index: (\d+)$/m);
  const createdAtMatch = frontmatter.match(/^createdAt: (.+)$/m);
  const updatedAtMatch = frontmatter.match(/^updatedAt: (.+)$/m);

  return {
    meta: {
      title: titleMatch?.[1] ?? '',
      index: indexMatch ? parseInt(indexMatch[1], 10) : 0,
      wordCount: countWords(body),
      createdAt: createdAtMatch?.[1] ?? '',
      updatedAt: updatedAtMatch?.[1] ?? '',
    },
    body,
  };
}

export class ChapterService {
  private readonly paths: GitPaths;

  constructor(
    private readonly gitService: GitService,
    projectPath: string
  ) {
    this.paths = GitPaths.forProject(projectPath);
  }

  async create(
    index: number,
    title: string,
    content: string
  ): Promise<ChapterContent> {
    const now = new Date().toISOString();
    const meta: ChapterMeta = {
      index,
      title,
      wordCount: countWords(content),
      createdAt: now,
      updatedAt: now,
    };

    const filePath = this.paths.chapter(index, title);
    const fileContent = `${formatFrontmatter(meta)}\n${content}\n`;

    await writeFile(filePath, fileContent, 'utf-8');

    // Auto-commit
    await this.gitService.add('.');
    await this.gitService.commit(`Add chapter: ${title}`);

    return { meta, content };
  }

  async list(): Promise<ChapterContent[]> {
    const chaptersDir = this.paths.chapters;
    const files = await readdir(chaptersDir);

    const chapterFiles = files.filter(f => f.endsWith('.md')).sort();

    const chapters: ChapterContent[] = [];
    for (const file of chapterFiles) {
      const raw = await readFile(join(chaptersDir, file), 'utf-8');
      const { meta, body } = parseChapterFile(raw);
      chapters.push({ meta, content: body });
    }

    return chapters;
  }

  async read(index: number): Promise<ChapterContent | undefined> {
    const chapters = await this.list();
    return chapters.find(ch => ch.meta.index === index);
  }

  async update(index: number, content: string): Promise<ChapterContent> {
    const existing = await this.read(index);
    if (!existing) {
      throw new Error(`Chapter ${index} not found`);
    }

    const now = new Date().toISOString();
    const meta: ChapterMeta = {
      ...existing.meta,
      wordCount: countWords(content),
      updatedAt: now,
    };

    const filePath = this.paths.chapter(index, meta.title);
    const fileContent = `${formatFrontmatter(meta)}\n${content}\n`;

    await writeFile(filePath, fileContent, 'utf-8');

    // Auto-commit
    await this.gitService.add('.');
    await this.gitService.commit(`Update chapter: ${meta.title}`);

    return { meta, content };
  }

  async delete(index: number): Promise<void> {
    const existing = await this.read(index);
    if (!existing) {
      throw new Error(`Chapter ${index} not found`);
    }

    const padded = String(index).padStart(3, '0');
    const filePath = join(
      this.paths.chapters,
      `${padded}-${existing.meta.title}.md`
    );

    await unlink(filePath);

    // Auto-commit
    await this.gitService.add('.');
    await this.gitService.commit(
      `Delete chapter: ${padded}-${existing.meta.title}.md`
    );
  }
}
