import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitService } from '@affine/git';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProjectService } from './project-service.js';

describe('ProjectService', () => {
  let tmpDir: string;
  let projectService: ProjectService;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'project-service-test-'));
    projectService = new ProjectService();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a new novel project with required directories', async () => {
    const projectPath = join(tmpDir, 'my-novel');
    await projectService.create(projectPath, {
      title: 'Test Novel',
      author: 'Test Author',
      description: 'A test novel',
      wordCountTarget: 100000,
    });

    // Verify book.json exists
    const bookJson = JSON.parse(
      await readFile(join(projectPath, 'book.json'), 'utf-8')
    );
    expect(bookJson.title).toBe('Test Novel');
    expect(bookJson.author).toBe('Test Author');
    expect(bookJson.description).toBe('A test novel');
    expect(bookJson.wordCountTarget).toBe(100000);
    expect(bookJson.createdAt).toBeDefined();
    expect(bookJson.updatedAt).toBeDefined();

    // Verify all directories exist
    const expectedDirs = [
      'chapters',
      'characters',
      'worldbuilding',
      'roadmap',
      'sparks',
      'graphs',
    ];
    for (const dir of expectedDirs) {
      const dirStat = await stat(join(projectPath, dir));
      expect(dirStat.isDirectory()).toBe(true);
    }

    // Verify .git exists
    const gitStat = await stat(join(projectPath, '.git'));
    expect(gitStat.isDirectory()).toBe(true);
  });

  it('creates an initial commit for a new project', async () => {
    const projectPath = join(tmpDir, 'my-novel');
    await projectService.create(projectPath, {
      title: 'Test Novel',
      author: 'Test Author',
      description: 'A test novel',
      wordCountTarget: 100000,
    });

    const git = new GitService(projectPath);
    const log = await git.log();
    expect(log).toContain('Initial commit');
  });

  it('opens an existing project and reads metadata', async () => {
    const projectPath = join(tmpDir, 'my-novel');
    await projectService.create(projectPath, {
      title: 'My Book',
      author: 'Jane Doe',
      description: 'An amazing story',
      wordCountTarget: 50000,
    });

    // Open the project
    const project = await projectService.open(projectPath);

    expect(project.meta.title).toBe('My Book');
    expect(project.meta.author).toBe('Jane Doe');
    expect(project.meta.description).toBe('An amazing story');
    expect(project.meta.wordCountTarget).toBe(50000);
    expect(project.path).toBe(projectPath);
    expect(project.id).toBeDefined();
  });
});
