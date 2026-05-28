import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitService } from '@affine/git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChapterService } from './chapter-service.js';
import { ProjectService } from './project-service.js';

describe('ChapterService', () => {
  let tmpDir: string;
  let projectPath: string;
  let projectService: ProjectService;
  let chapterService: ChapterService;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'chapter-service-test-'));
    projectPath = join(tmpDir, 'my-novel');
    projectService = new ProjectService();
    await projectService.create(projectPath, {
      title: 'Test Novel',
      author: 'Test Author',
      description: 'A test novel',
      wordCountTarget: 100000,
    });

    const projectGit = new GitService(projectPath);
    chapterService = new ChapterService(projectGit, projectPath);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a chapter with metadata and content', async () => {
    const chapter = await chapterService.create(
      1,
      'Chapter One',
      'Hello world'
    );

    expect(chapter.meta.index).toBe(1);
    expect(chapter.meta.title).toBe('Chapter One');
    expect(chapter.meta.wordCount).toBeGreaterThan(0);
    expect(chapter.meta.createdAt).toBeDefined();
    expect(chapter.meta.updatedAt).toBeDefined();
    expect(chapter.content).toBe('Hello world');

    // Verify file exists on disk
    const files = await readdir(join(projectPath, 'chapters'));
    expect(files).toContain('001-Chapter One.md');

    // Verify file content has YAML frontmatter
    const fileContent = await readFile(
      join(projectPath, 'chapters', '001-Chapter One.md'),
      'utf-8'
    );
    expect(fileContent).toContain('---');
    expect(fileContent).toContain('title: Chapter One');
    expect(fileContent).toContain('index: 1');
    expect(fileContent).toContain('Hello world');
  });

  it('creates multiple chapters with incrementing indices', async () => {
    await chapterService.create(1, 'Chapter One', 'Content one');
    await chapterService.create(2, 'Chapter Two', 'Content two');
    await chapterService.create(3, 'Chapter Three', 'Content three');

    const files = await readdir(join(projectPath, 'chapters'));
    expect(files).toContain('001-Chapter One.md');
    expect(files).toContain('002-Chapter Two.md');
    expect(files).toContain('003-Chapter Three.md');
  });

  it('lists all chapters in order', async () => {
    await chapterService.create(3, 'Chapter Three', 'Three');
    await chapterService.create(1, 'Chapter One', 'One');
    await chapterService.create(2, 'Chapter Two', 'Two');

    const chapters = await chapterService.list();

    expect(chapters).toHaveLength(3);
    expect(chapters[0].meta.title).toBe('Chapter One');
    expect(chapters[1].meta.title).toBe('Chapter Two');
    expect(chapters[2].meta.title).toBe('Chapter Three');
  });

  it('reads a chapter by index', async () => {
    await chapterService.create(1, 'Chapter One', 'Hello world');
    await chapterService.create(2, 'Chapter Two', 'Other content');

    const chapter = await chapterService.read(1);

    expect(chapter).toBeDefined();
    expect(chapter!.meta.title).toBe('Chapter One');
    expect(chapter!.content).toBe('Hello world');
  });

  it('updates chapter content and word count', async () => {
    await chapterService.create(1, 'Chapter One', 'Short');
    const originalWordCount = (await chapterService.read(1))!.meta.wordCount;

    // Update with much longer content
    await chapterService.update(
      1,
      'This is a much longer content with many more words than before'
    );

    const updated = await chapterService.read(1);
    expect(updated!.content).toBe(
      'This is a much longer content with many more words than before'
    );
    expect(updated!.meta.wordCount).toBeGreaterThan(originalWordCount);
  });

  it('deletes a chapter', async () => {
    await chapterService.create(1, 'Chapter One', 'Content one');
    await chapterService.create(2, 'Chapter Two', 'Content two');

    await chapterService.delete(1);

    const chapters = await chapterService.list();
    expect(chapters).toHaveLength(1);
    expect(chapters[0].meta.title).toBe('Chapter Two');

    const files = await readdir(join(projectPath, 'chapters'));
    expect(files).not.toContain('001-Chapter One.md');
  });

  it('auto-commits on each mutation', async () => {
    await chapterService.create(1, 'Chapter One', 'Content');

    const git = new GitService(projectPath);
    const log = await git.log();
    expect(log).toContain('Add chapter: Chapter One');

    await chapterService.update(1, 'Updated content');
    const logAfterUpdate = await git.log();
    expect(logAfterUpdate).toContain('Update chapter: Chapter One');

    await chapterService.delete(1);
    const logAfterDelete = await git.log();
    expect(logAfterDelete).toContain('Delete chapter: 001-Chapter One.md');
  });
});
