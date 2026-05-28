import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GitService } from './git-service.js';

describe('GitService', () => {
  let tmpDir: string;
  let git: GitService;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'git-service-test-'));
    git = new GitService(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('initializes a new git repo', async () => {
    await git.init();
    const stat = await import('node:fs/promises').then(fs =>
      fs.stat(join(tmpDir, '.git'))
    );
    expect(stat.isDirectory()).toBe(true);
  });

  it('adds and commits files', async () => {
    await git.init();
    await writeFile(join(tmpDir, 'readme.md'), '# My Novel');
    await git.add('.');
    await git.commit('Initial commit');
    const log = await git.log();
    expect(log).toContain('Initial commit');
  });

  it('returns status with untracked files', async () => {
    await git.init();
    await writeFile(join(tmpDir, 'readme.md'), '# My Novel');
    await git.add('.');
    await git.commit('Initial commit');

    // Create an untracked file
    await writeFile(join(tmpDir, 'untracked.txt'), 'hello');

    const status = await git.status();
    expect(status).toContain('untracked.txt');
  });
});
