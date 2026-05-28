import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { GitService } from '@affine/git';

import type { BookMeta, NovelProject } from './types.js';

export interface CreateProjectInput {
  title: string;
  author: string;
  description: string;
  wordCountTarget: number;
}

export class ProjectService {
  constructor(private readonly gitService: GitService) {}

  async create(
    projectPath: string,
    input: CreateProjectInput
  ): Promise<NovelProject> {
    // Create directory structure
    const dirs = [
      projectPath,
      join(projectPath, 'chapters'),
      join(projectPath, 'characters'),
      join(projectPath, 'worldbuilding'),
      join(projectPath, 'roadmap'),
      join(projectPath, 'sparks'),
      join(projectPath, 'graphs'),
    ];

    for (const dir of dirs) {
      await mkdir(dir, { recursive: true });
    }

    // Write book.json
    const now = new Date().toISOString();
    const meta: BookMeta = {
      title: input.title,
      author: input.author,
      description: input.description,
      wordCountTarget: input.wordCountTarget,
      createdAt: now,
      updatedAt: now,
    };

    await writeFile(
      join(projectPath, 'book.json'),
      JSON.stringify(meta, null, 2),
      'utf-8'
    );

    // Initialize git repo
    const projectGit = new (await import('@affine/git')).GitService(
      projectPath
    );
    await projectGit.init();
    await projectGit.add('.');
    await projectGit.commit('Initial commit');

    return {
      id: projectPath,
      path: projectPath,
      meta,
    };
  }

  async open(projectPath: string): Promise<NovelProject> {
    const raw = await readFile(join(projectPath, 'book.json'), 'utf-8');
    const meta: BookMeta = JSON.parse(raw);

    return {
      id: projectPath,
      path: projectPath,
      meta,
    };
  }
}
