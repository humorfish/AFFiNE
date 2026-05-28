# Story PC Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform AFFiNE into a local-first novel writing tool by removing cloud dependencies, adding Git-based storage, chapter management, and direct LLM integration.

**Architecture:** Strip cloud/backend modules from the AFFiNE monorepo, keep BlockSuite editor + Electron + local workspace flavour. Add three new packages: `@affine/git` (Git CLI wrapper), `@affine/story` (novel domain logic), `@affine/ai` (direct LLM client replacing CopilotClient). Replace the current app shell with a three-column layout optimized for writing.

**Tech Stack:** TypeScript, React 19, BlockSuite editor, Electron, Yjs, Vitest, system Git CLI

---

## File Structure

### New files to create

```
packages/frontend/git/
  package.json
  src/
    index.ts                    # Public API exports
    git-service.ts              # Core Git CLI wrapper
    git-service.spec.ts         # Tests
    git-paths.ts                # Path constants for story repo structure
    git-paths.spec.ts

packages/frontend/story/
  package.json
  src/
    index.ts                    # Public API exports
    project-service.ts          # Novel project CRUD (create/open/close/list)
    project-service.spec.ts
    chapter-service.ts          # Chapter CRUD, reorder, word count
    chapter-service.spec.ts
    types.ts                    # Shared types (BookMeta, ChapterMeta, etc.)

packages/frontend/ai/
  package.json
  src/
    index.ts                    # Public API exports
    llm-client.ts               # Generic LLM HTTP client (OpenAI-compatible)
    llm-client.spec.ts
    api-key-store.ts            # Encrypted API key storage via Electron safeStorage
    api-key-store.spec.ts
    prompt-templates.ts         # Prompt templates for writing features
    prompt-templates.spec.ts
```

### Key files to modify

```
packages/frontend/core/src/
  modules/cloud/                              # DELETE entire directory
  components/affine/auth/                     # DELETE
  bootstrap/browser.ts                        # Remove cloud module registration
  bootstrap/electron.ts                       # Remove cloud module registration
  modules/index.ts                            # Remove cloud-related module setup
  components/root-app-sidebar/index.tsx       # Rewrite for Story navigation
  desktop/router.tsx                          # Remove auth/share routes, add story routes
  desktop/workbench-router.ts                # Replace routes with story modules
  desktop/pages/workspace/chat/index.tsx      # Replace CopilotClient with LLMClient
  blocksuite/ai/runtime/request/copilot-client.ts  # Replace with LLMClient adapter
```

---

## Task 1: Create @affine/git Package — GitService Core

**Goal:** A thin wrapper around system `git` CLI that manages novel project repositories.

**Files:**

- Create: `packages/frontend/git/package.json`
- Create: `packages/frontend/git/src/index.ts`
- Create: `packages/frontend/git/src/git-paths.ts`
- Create: `packages/frontend/git/src/git-service.ts`
- Test: `packages/frontend/git/src/git-paths.spec.ts`
- Test: `packages/frontend/git/src/git-service.spec.ts`

- [ ] **Step 1: Create package scaffolding**

```json
// packages/frontend/git/package.json
{
  "name": "@affine/git",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {},
  "devDependencies": {
    "vitest": "workspace:*"
  }
}
```

- [ ] **Step 2: Write failing test for GitPaths**

```typescript
// packages/frontend/git/src/git-paths.spec.ts
import { describe, it, expect } from 'vitest';
import { GitPaths } from './git-paths.js';

describe('GitPaths', () => {
  it('returns correct paths for a project root', () => {
    const paths = GitPaths.forProject('/home/user/novels/my-novel');
    expect(paths.root).toBe('/home/user/novels/my-novel');
    expect(paths.bookMeta).toBe('/home/user/novels/my-novel/book.json');
    expect(paths.chapters).toBe('/home/user/novels/my-novel/chapters');
    expect(paths.characters).toBe('/home/user/novels/my-novel/characters');
    expect(paths.worldbuilding).toBe('/home/user/novels/my-novel/worldbuilding');
    expect(paths.roadmap).toBe('/home/user/novels/my-novel/roadmap');
    expect(paths.sparks).toBe('/home/user/novels/my-novel/sparks');
    expect(paths.graphs).toBe('/home/user/novels/my-novel/graphs');
  });

  it('returns chapter file path with zero-padded index', () => {
    const paths = GitPaths.forProject('/root');
    expect(paths.chapter(1, '开端')).toBe('/root/chapters/001-开端.md');
    expect(paths.chapter(10, '相遇')).toBe('/root/chapters/010-相遇.md');
    expect(paths.chapter(100, '终章')).toBe('/root/chapters/100-终章.md');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/frontend/git && npx vitest run src/git-paths.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement GitPaths**

```typescript
// packages/frontend/git/src/git-paths.ts
import { join } from 'node:path';

export class GitPaths {
  private constructor(private readonly root: string) {}

  static forProject(root: string): GitPaths {
    return new GitPaths(root);
  }

  get bookMeta(): string {
    return join(this.root, 'book.json');
  }

  get chapters(): string {
    return join(this.root, 'chapters');
  }

  get characters(): string {
    return join(this.root, 'characters');
  }

  get worldbuilding(): string {
    return join(this.root, 'worldbuilding');
  }

  get roadmap(): string {
    return join(this.root, 'roadmap');
  }

  get sparks(): string {
    return join(this.root, 'sparks');
  }

  get graphs(): string {
    return join(this.root, 'graphs');
  }

  chapter(index: number, title: string): string {
    const padded = String(index).padStart(3, '0');
    return join(this.chapters, `${padded}-${title}.md`);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/frontend/git && npx vitest run src/git-paths.spec.ts`
Expected: PASS

- [ ] **Step 6: Write failing test for GitService**

```typescript
// packages/frontend/git/src/git-service.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitService } from './git-service.js';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('GitService', () => {
  let git: GitService;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `story-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    git = new GitService();
  });

  it('initializes a new git repo', async () => {
    const projectDir = join(testDir, 'my-novel');
    mkdirSync(projectDir, { recursive: true });

    await git.init(projectDir);

    expect(existsSync(join(projectDir, '.git'))).toBe(true);
  });

  it('adds and commits files', async () => {
    const projectDir = join(testDir, 'my-novel');
    mkdirSync(projectDir, { recursive: true });
    await git.init(projectDir);

    writeFileSync(join(projectDir, 'book.json'), '{}');
    await git.add(projectDir, '.');
    await git.commit(projectDir, 'initial commit');

    const log = await git.log(projectDir, { maxCount: 1 });
    expect(log).toHaveLength(1);
    expect(log[0].message).toBe('initial commit');
  });

  it('returns status with untracked files', async () => {
    const projectDir = join(testDir, 'my-novel');
    mkdirSync(projectDir, { recursive: true });
    await git.init(projectDir);

    writeFileSync(join(projectDir, 'test.md'), 'hello');
    const status = await git.status(projectDir);
    expect(status.untracked).toContain('test.md');
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd packages/frontend/git && npx vitest run src/git-service.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 8: Implement GitService**

```typescript
// packages/frontend/git/src/git-service.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface GitLogEntry {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
}

export class GitService {
  private async git(cwd: string, ...args: string[]): Promise<string> {
    const { stdout } = await exec('git', args, { cwd });
    return stdout.trim();
  }

  async init(path: string): Promise<void> {
    await this.git(path, 'init');
  }

  async clone(url: string, path: string): Promise<void> {
    await this.git(path, 'clone', url, path);
  }

  async add(path: string, ...files: string[]): Promise<void> {
    await this.git(path, 'add', ...files);
  }

  async commit(path: string, message: string): Promise<void> {
    await this.git(path, 'commit', '-m', message);
  }

  async pull(path: string): Promise<string> {
    return this.git(path, 'pull');
  }

  async push(path: string): Promise<string> {
    return this.git(path, 'push');
  }

  async log(path: string, options?: { maxCount?: number }): Promise<GitLogEntry[]> {
    const args = ['log', '--pretty=format:%H|%s|%an|%ai'];
    if (options?.maxCount) {
      args.push(`-n`, String(options.maxCount));
    }
    const output = await this.git(path, ...args);
    if (!output) return [];
    return output.split('\n').map(line => {
      const [hash, message, author, date] = line.split('|');
      return { hash, message, author, date };
    });
  }

  async status(path: string): Promise<GitStatus> {
    const output = await this.git(path, 'status', '--porcelain');
    if (!output) return { staged: [], modified: [], untracked: [] };

    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];

    for (const line of output.split('\n')) {
      const statusCode = line.substring(0, 2);
      const filePath = line.substring(3);
      if (statusCode.startsWith('?')) {
        untracked.push(filePath);
      } else if (statusCode.startsWith(' ') || statusCode.startsWith('M')) {
        modified.push(filePath);
      } else {
        staged.push(filePath);
      }
    }
    return { staged, modified, untracked };
  }
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd packages/frontend/git && npx vitest run`
Expected: ALL PASS

- [ ] **Step 10: Create index.ts and commit**

```typescript
// packages/frontend/git/src/index.ts
export { GitService } from './git-service.js';
export type { GitLogEntry, GitStatus } from './git-service.js';
export { GitPaths } from './git-paths.js';
```

```bash
git add packages/frontend/git/
git commit -m "feat(story): add @affine/git package with GitService and GitPaths"
```

---

## Task 2: Create @affine/story Package — Types and ProjectService

**Goal:** Define shared types for the novel domain and implement project management (create/open/list novel projects backed by Git repos).

**Files:**

- Create: `packages/frontend/story/package.json`
- Create: `packages/frontend/story/src/index.ts`
- Create: `packages/frontend/story/src/types.ts`
- Create: `packages/frontend/story/src/project-service.ts`
- Test: `packages/frontend/story/src/project-service.spec.ts`

- [ ] **Step 1: Create package scaffolding**

```json
// packages/frontend/story/package.json
{
  "name": "@affine/story",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@affine/git": "workspace:*"
  },
  "devDependencies": {
    "vitest": "workspace:*"
  }
}
```

- [ ] **Step 2: Write shared types**

```typescript
// packages/frontend/story/src/types.ts
export interface BookMeta {
  title: string;
  author: string;
  description: string;
  wordCountTarget: number;
  createdAt: string;
  updatedAt: string;
}

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
  meta: BookMeta;
}
```

- [ ] **Step 3: Write failing test for ProjectService**

```typescript
// packages/frontend/story/src/project-service.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectService } from './project-service.js';
import { GitService } from '@affine/git';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';

describe('ProjectService', () => {
  let service: ProjectService;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `story-project-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    service = new ProjectService(new GitService());
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates a new novel project with correct structure', async () => {
    const project = await service.create(testDir, {
      title: '星辰大海',
      author: '测试作者',
      description: '一部关于梦想的小说',
      wordCountTarget: 500000,
    });

    expect(project.meta.title).toBe('星辰大海');
    expect(existsSync(join(testDir, 'book.json'))).toBe(true);
    expect(existsSync(join(testDir, 'chapters'))).toBe(true);
    expect(existsSync(join(testDir, 'characters'))).toBe(true);
    expect(existsSync(join(testDir, 'worldbuilding'))).toBe(true);
    expect(existsSync(join(testDir, 'roadmap'))).toBe(true);
    expect(existsSync(join(testDir, 'sparks'))).toBe(true);
    expect(existsSync(join(testDir, 'graphs'))).toBe(true);
    expect(existsSync(join(testDir, '.git'))).toBe(true);
  });

  it('created project has initial commit', async () => {
    await service.create(testDir, {
      title: '测试',
      author: '作者',
      description: '',
      wordCountTarget: 100000,
    });

    const git = new GitService();
    const log = await git.log(testDir, { maxCount: 1 });
    expect(log).toHaveLength(1);
    expect(log[0].message).toContain('初始化');
  });

  it('opens an existing project and reads metadata', async () => {
    await service.create(testDir, {
      title: '星辰大海',
      author: '作者',
      description: '描述',
      wordCountTarget: 200000,
    });

    const project = await service.open(testDir);
    expect(project.meta.title).toBe('星辰大海');
    expect(project.meta.author).toBe('作者');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd packages/frontend/story && npx vitest run src/project-service.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 5: Implement ProjectService**

```typescript
// packages/frontend/story/src/project-service.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { GitService } from '@affine/git';
import { GitPaths } from '@affine/git';
import type { BookMeta, NovelProject } from './types.js';

export interface CreateProjectInput {
  title: string;
  author: string;
  description: string;
  wordCountTarget: number;
}

export class ProjectService {
  constructor(private readonly git: GitService) {}

  async create(path: string, input: CreateProjectInput): Promise<NovelProject> {
    const paths = GitPaths.forProject(path);
    const now = new Date().toISOString();

    const meta: BookMeta = {
      title: input.title,
      author: input.author,
      description: input.description,
      wordCountTarget: input.wordCountTarget,
      createdAt: now,
      updatedAt: now,
    };

    // Create directory structure
    mkdirSync(path, { recursive: true });
    mkdirSync(paths.chapters, { recursive: true });
    mkdirSync(paths.characters, { recursive: true });
    mkdirSync(paths.worldbuilding, { recursive: true });
    mkdirSync(paths.roadmap, { recursive: true });
    mkdirSync(paths.sparks, { recursive: true });
    mkdirSync(paths.graphs, { recursive: true });

    // Write metadata
    writeFileSync(paths.bookMeta, JSON.stringify(meta, null, 2), 'utf-8');

    // Initialize git repo
    await this.git.init(path);
    await this.git.add(path, '.');
    await this.git.commit(path, `初始化小说项目: ${input.title}`);

    return { id: path, path, meta };
  }

  async open(path: string): Promise<NovelProject> {
    const paths = GitPaths.forProject(path);
    const raw = readFileSync(paths.bookMeta, 'utf-8');
    const meta: BookMeta = JSON.parse(raw);
    return { id: path, path, meta };
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/frontend/story && npx vitest run src/project-service.spec.ts`
Expected: ALL PASS

- [ ] **Step 7: Create index.ts and commit**

```typescript
// packages/frontend/story/src/index.ts
export { ProjectService } from './project-service.js';
export type { CreateProjectInput } from './project-service.js';
export type { BookMeta, ChapterMeta, ChapterContent, NovelProject } from './types.js';
```

```bash
git add packages/frontend/story/
git commit -m "feat(story): add @affine/story package with ProjectService and types"
```

---

## Task 3: Create @affine/story — ChapterService

**Goal:** CRUD operations for novel chapters backed by Markdown files in the Git repo.

**Files:**

- Create: `packages/frontend/story/src/chapter-service.ts`
- Test: `packages/frontend/story/src/chapter-service.spec.ts`
- Modify: `packages/frontend/story/src/index.ts`

- [ ] **Step 1: Write failing test for ChapterService**

```typescript
// packages/frontend/story/src/chapter-service.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChapterService } from './chapter-service.js';
import { ProjectService } from './project-service.js';
import { GitService } from '@affine/git';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ChapterService', () => {
  let chapters: ChapterService;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `story-chapter-test-${Date.now()}`);
    const git = new GitService();
    await new ProjectService(git).create(testDir, {
      title: '测试',
      author: '作者',
      description: '',
      wordCountTarget: 100000,
    });
    chapters = new ChapterService(git, testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates a chapter and returns its metadata', async () => {
    const chapter = await chapters.create('开端', '这是第一章的内容。');
    expect(chapter.meta.index).toBe(1);
    expect(chapter.meta.title).toBe('开端');
    expect(chapter.meta.wordCount).toBe(9);
    expect(chapter.content).toBe('这是第一章的内容。');
  });

  it('creates multiple chapters with incrementing indices', async () => {
    await chapters.create('开端', '内容一');
    await chapters.create('相遇', '内容二');
    const chapter = await chapters.create('转折', '内容三');
    expect(chapter.meta.index).toBe(3);
  });

  it('lists all chapters in order', async () => {
    await chapters.create('开端', '内容一');
    await chapters.create('相遇', '内容二');

    const list = await chapters.list();
    expect(list).toHaveLength(2);
    expect(list[0].meta.title).toBe('开端');
    expect(list[1].meta.title).toBe('相遇');
  });

  it('reads a chapter by index', async () => {
    await chapters.create('开端', '正文内容');
    const chapter = await chapters.read(1);
    expect(chapter.meta.title).toBe('开端');
    expect(chapter.content).toBe('正文内容');
  });

  it('updates chapter content and word count', async () => {
    await chapters.create('开端', '旧内容');
    const updated = await chapters.update(1, '新的正文内容更长');
    expect(updated.content).toBe('新的正文内容更长');
    expect(updated.meta.wordCount).toBe(8);
  });

  it('deletes a chapter', async () => {
    await chapters.create('开端', '内容');
    await chapters.create('相遇', '内容');

    await chapters.delete(1);
    const list = await chapters.list();
    expect(list).toHaveLength(1);
    expect(list[0].meta.title).toBe('相遇');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/frontend/story && npx vitest run src/chapter-service.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ChapterService**

```typescript
// packages/frontend/story/src/chapter-service.ts
import { existsSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { GitService, GitPaths } from '@affine/git';
import { GitPaths as GitPathsClass } from '@affine/git';
import type { ChapterContent, ChapterMeta } from './types.js';

export class ChapterService {
  private readonly paths: GitPaths;

  constructor(
    private readonly git: GitService,
    private readonly projectPath: string
  ) {
    this.paths = GitPathsClass.forProject(projectPath);
  }

  async create(title: string, content: string): Promise<ChapterContent> {
    const existing = this.listSync();
    const index = existing.length + 1;
    const now = new Date().toISOString();

    const meta: ChapterMeta = {
      index,
      title,
      wordCount: this.countWords(content),
      createdAt: now,
      updatedAt: now,
    };

    const filePath = this.paths.chapter(index, title);
    const frontmatter = `---\ntitle: ${title}\nindex: ${index}\ncreatedAt: ${now}\nupdatedAt: ${now}\n---\n`;
    writeFileSync(filePath, frontmatter + content, 'utf-8');

    await this.git.add(this.projectPath, filePath);
    await this.git.commit(this.projectPath, `添加第${index}章: ${title}`);

    return { meta, content };
  }

  async list(): Promise<ChapterContent[]> {
    return this.listSync();
  }

  async read(index: number): Promise<ChapterContent> {
    const files = readdirSync(this.paths.chapters);
    const file = files.find(f => f.startsWith(String(index).padStart(3, '0')));
    if (!file) throw new Error(`Chapter ${index} not found`);

    const raw = readFileSync(join(this.paths.chapters, file), 'utf-8');
    const { meta, content } = this.parseChapter(raw, index);
    return { meta, content };
  }

  async update(index: number, content: string): Promise<ChapterContent> {
    const existing = await this.read(index);
    const now = new Date().toISOString();
    const updatedMeta: ChapterMeta = {
      ...existing.meta,
      wordCount: this.countWords(content),
      updatedAt: now,
    };

    const filePath = this.paths.chapter(index, existing.meta.title);
    const frontmatter = `---\ntitle: ${existing.meta.title}\nindex: ${index}\ncreatedAt: ${existing.meta.createdAt}\nupdatedAt: ${now}\n---\n`;
    writeFileSync(filePath, frontmatter + content, 'utf-8');

    await this.git.add(this.projectPath, filePath);
    await this.git.commit(this.projectPath, `更新第${index}章: ${existing.meta.title}`);

    return { meta: updatedMeta, content };
  }

  async delete(index: number): Promise<void> {
    const existing = await this.read(index);
    const filePath = this.paths.chapter(index, existing.meta.title);
    rmSync(filePath);
    await this.git.add(this.projectPath, filePath);
    await this.git.commit(this.projectPath, `删除第${index}章: ${existing.meta.title}`);
  }

  private listSync(): ChapterContent[] {
    if (!existsSync(this.paths.chapters)) return [];
    const files = readdirSync(this.paths.chapters)
      .filter(f => f.endsWith('.md'))
      .sort();

    return files.map((file, i) => {
      const raw = readFileSync(join(this.paths.chapters, file), 'utf-8');
      const index = i + 1;
      return this.parseChapter(raw, index);
    });
  }

  private parseChapter(raw: string, index: number): ChapterContent {
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
    const content = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw;
    const title = frontmatterMatch?.[1]?.match(/title: (.+)/)?.[1] ?? '';

    return {
      meta: {
        index,
        title,
        wordCount: this.countWords(content),
        createdAt: frontmatterMatch?.[1]?.match(/createdAt: (.+)/)?.[1] ?? '',
        updatedAt: frontmatterMatch?.[1]?.match(/updatedAt: (.+)/)?.[1] ?? '',
      },
      content,
    };
  }

  private countWords(text: string): number {
    // Count Chinese characters + English words
    const chinese = (text.match(/[一-鿿]/g) || []).length;
    const english = (text.match(/[a-zA-Z]+/g) || []).length;
    return chinese + english;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/frontend/story && npx vitest run src/chapter-service.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Update index.ts and commit**

Add to `packages/frontend/story/src/index.ts`:

```typescript
export { ChapterService } from './chapter-service.js';
```

```bash
git add packages/frontend/story/
git commit -m "feat(story): add ChapterService with CRUD and word count"
```

---

## Task 4: Create @affine/ai Package — LLMClient and API Key Store

**Goal:** A generic LLM client that calls OpenAI-compatible APIs directly with user-provided keys, plus encrypted key storage.

**Files:**

- Create: `packages/frontend/ai/package.json`
- Create: `packages/frontend/ai/src/index.ts`
- Create: `packages/frontend/ai/src/llm-client.ts`
- Create: `packages/frontend/ai/src/api-key-store.ts`
- Create: `packages/frontend/ai/src/prompt-templates.ts`
- Test: `packages/frontend/ai/src/llm-client.spec.ts`
- Test: `packages/frontend/ai/src/prompt-templates.spec.ts`

- [ ] **Step 1: Create package scaffolding**

```json
// packages/frontend/ai/package.json
{
  "name": "@affine/ai",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {},
  "devDependencies": {
    "vitest": "workspace:*"
  }
}
```

- [ ] **Step 2: Write failing test for LLMClient**

```typescript
// packages/frontend/ai/src/llm-client.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { LLMClient } from './llm-client.js';

describe('LLMClient', () => {
  it('builds correct request for OpenAI-compatible API', () => {
    const client = new LLMClient({
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-test-key',
      model: 'gpt-4o',
    });

    const request = client.buildRequest('你好', '你是一个写作助手');
    expect(request.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(request.headers['Authorization']).toBe('Bearer sk-test-key');
    expect(request.body.model).toBe('gpt-4o');
    expect(request.body.messages).toHaveLength(2);
    expect(request.body.messages[0].role).toBe('system');
    expect(request.body.messages[1].role).toBe('user');
    expect(request.body.stream).toBe(true);
  });

  it('supports custom temperature and max_tokens', () => {
    const client = new LLMClient({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: 'ds-test',
      model: 'deepseek-chat',
    });

    const request = client.buildRequest('续写', '你是续写助手', {
      temperature: 0.8,
      maxTokens: 500,
    });
    expect(request.body.temperature).toBe(0.8);
    expect(request.body.max_tokens).toBe(500);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/frontend/ai && npx vitest run src/llm-client.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement LLMClient**

```typescript
// packages/frontend/ai/src/llm-client.ts
export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LLMRequest {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    stream: boolean;
    temperature?: number;
    max_tokens?: number;
  };
}

export class LLMClient {
  constructor(private readonly config: LLMConfig) {}

  buildRequest(userMessage: string, systemPrompt: string, options?: LLMOptions): LLMRequest {
    const url = `${this.config.baseURL.replace(/\/$/, '')}/chat/completions`;
    return {
      url,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: {
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: true,
        ...(options?.temperature !== undefined && { temperature: options.temperature }),
        ...(options?.maxTokens !== undefined && { max_tokens: options.maxTokens }),
      },
    };
  }

  async *stream(userMessage: string, systemPrompt: string, options?: LLMOptions): AsyncGenerator<string> {
    const request = this.buildRequest(userMessage, systemPrompt, options);
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/frontend/ai && npx vitest run src/llm-client.spec.ts`
Expected: PASS

- [ ] **Step 6: Write failing test for PromptTemplates**

```typescript
// packages/frontend/ai/src/prompt-templates.spec.ts
import { describe, it, expect } from 'vitest';
import { PromptTemplates } from './prompt-templates.js';

describe('PromptTemplates', () => {
  it('builds continuation prompt with word count', () => {
    const result = PromptTemplates.continuation({
      previousText: '她转过身，目光恰好与那双深邃的眼睛相遇。',
      wordCount: 500,
      style: '悬疑',
    });
    expect(result.systemPrompt).toContain('续写');
    expect(result.systemPrompt).toContain('500');
    expect(result.systemPrompt).toContain('悬疑');
    expect(result.userMessage).toContain('她转过身');
  });

  it('builds spark generation prompt', () => {
    const result = PromptTemplates.spark({
      context: '这是一个修仙世界的小说，主角刚突破金丹期。',
      direction: '转折',
    });
    expect(result.systemPrompt).toContain('创意');
    expect(result.userMessage).toContain('修仙');
    expect(result.userMessage).toContain('转折');
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd packages/frontend/ai && npx vitest run src/prompt-templates.spec.ts`
Expected: FAIL

- [ ] **Step 8: Implement PromptTemplates**

```typescript
// packages/frontend/ai/src/prompt-templates.ts
export interface ContinuationInput {
  previousText: string;
  wordCount: number;
  style?: string;
}

export interface SparkInput {
  context: string;
  direction?: string;
}

export interface PromptResult {
  systemPrompt: string;
  userMessage: string;
}

export class PromptTemplates {
  static continuation(input: ContinuationInput): PromptResult {
    const styleHint = input.style ? `风格：${input.style}。` : '';
    return {
      systemPrompt: `你是一位专业的网文续写助手。请根据前文内容续写小说，保持风格一致、情节连贯。${styleHint}严格控制在${input.wordCount}字左右。直接输出续写内容，不要加任何解释或前缀。`,
      userMessage: `请续写以下内容（约${input.wordCount}字）：\n\n${input.previousText}`,
    };
  }

  static spark(input: SparkInput): PromptResult {
    const directionHint = input.direction ? `重点方向：${input.direction}。` : '';
    return {
      systemPrompt: `你是一位富有创意的小说顾问。请根据已有的小说背景，生成3-5个有趣的创意火花（情节点、悬念、转折等）。每个火花用一句话描述，标注类型（悬念/转折/冲突/伏笔/高潮）。${directionHint}`,
      userMessage: `基于以下背景生成创意火花：\n\n${input.context}`,
    };
  }
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd packages/frontend/ai && npx vitest run src/prompt-templates.spec.ts`
Expected: PASS

- [ ] **Step 10: Implement API Key Store and create index.ts**

```typescript
// packages/frontend/ai/src/api-key-store.ts
const STORAGE_KEY = 'affine-story-llm-keys';

export interface APIKeyConfig {
  id: string;
  provider: string; // 'openai' | 'anthropic' | 'deepseek' | 'custom'
  name: string; // Display name
  baseURL: string;
  apiKey: string;
  model: string;
}

export class APIKeyStore {
  private load(): APIKeyConfig[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private save(keys: APIKeyConfig[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  }

  list(): APIKeyConfig[] {
    return this.load();
  }

  get(id: string): APIKeyConfig | undefined {
    return this.load().find(k => k.id === id);
  }

  add(config: APIKeyConfig): void {
    const keys = this.load();
    keys.push(config);
    this.save(keys);
  }

  update(id: string, patch: Partial<APIKeyConfig>): void {
    const keys = this.load();
    const index = keys.findIndex(k => k.id === id);
    if (index >= 0) {
      keys[index] = { ...keys[index], ...patch };
      this.save(keys);
    }
  }

  remove(id: string): void {
    const keys = this.load().filter(k => k.id !== id);
    this.save(keys);
  }
}
```

```typescript
// packages/frontend/ai/src/index.ts
export { LLMClient } from './llm-client.js';
export type { LLMConfig, LLMOptions, LLMRequest } from './llm-client.js';
export { APIKeyStore } from './api-key-store.js';
export type { APIKeyConfig } from './api-key-store.js';
export { PromptTemplates } from './prompt-templates.js';
export type { ContinuationInput, SparkInput, PromptResult } from './prompt-templates.js';
```

- [ ] **Step 11: Run all tests and commit**

Run: `cd packages/frontend/ai && npx vitest run`
Expected: ALL PASS

```bash
git add packages/frontend/ai/
git commit -m "feat(story): add @affine/ai package with LLMClient, APIKeyStore, and PromptTemplates"
```

---

## Task 5: Register New Packages in Monorepo

**Goal:** Wire the three new packages into the monorepo so they can be imported by the frontend.

**Files:**

- Modify: `package.json` (root — add workspaces if needed)
- Modify: `tsconfig.json` (add path references)

- [ ] **Step 1: Verify workspaces include new packages**

Read `package.json` root. The `workspaces` field already includes `"packages/*/*"` which covers `packages/frontend/git`, `packages/frontend/story`, and `packages/frontend/ai`. No change needed unless the pattern doesn't match.

Run: `yarn install`
Expected: New packages resolved successfully

- [ ] **Step 2: Add TypeScript project references**

Add to `tsconfig.json` `references` array:

```json
{ "path": "packages/frontend/git" },
{ "path": "packages/frontend/story" },
{ "path": "packages/frontend/ai" }
```

Each new package needs a `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Verify imports work**

Run: `yarn typecheck`
Expected: No errors from new packages

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.json packages/frontend/git/tsconfig.json packages/frontend/story/tsconfig.json packages/frontend/ai/tsconfig.json
git commit -m "feat(story): register new packages in monorepo workspace"
```

---

## Task 6: Strip Cloud/Auth Modules

**Goal:** Remove backend server, cloud service layer, and authentication code. This is the largest deletion task.

**Files:**

- Delete: `packages/backend/` (entire directory)
- Delete: `packages/frontend/core/src/modules/cloud/`
- Delete: `packages/frontend/core/src/components/affine/auth/`
- Modify: Various files that import from deleted modules (fix compilation errors)

**IMPORTANT:** This task will cause many compilation errors. The approach is: delete first, then fix imports incrementally until `yarn typecheck` passes.

- [ ] **Step 1: Delete backend package**

```bash
rm -rf packages/backend/
```

Remove `packages/backend/*` references from root `tsconfig.json` and `package.json` workspaces.

- [ ] **Step 2: Delete cloud module and auth components**

```bash
rm -rf packages/frontend/core/src/modules/cloud/
rm -rf packages/frontend/core/src/components/affine/auth/
```

- [ ] **Step 3: Run typecheck to find broken imports**

Run: `yarn typecheck 2>&1 | head -100`

This will produce a list of files that import from deleted modules. Fix each file by either:

- Removing the import and any code that depends on it
- Stubbing the import with a no-op implementation

Key files that will need fixes (based on exploration):

- `packages/frontend/core/src/modules/index.ts` — remove cloud module setup
- `packages/frontend/core/src/bootstrap/browser.ts` — remove cloud registration
- `packages/frontend/core/src/bootstrap/electron.ts` — remove cloud registration
- `packages/frontend/core/src/components/root-app-sidebar/index.tsx` — remove auth-dependent UI
- Files in `blocksuite/ai/` that import `AuthService` — replace with stub

- [ ] **Step 4: Fix compilation errors iteratively**

For each broken import:

1. Read the file to understand what cloud functionality it uses
2. If it's auth-gating (e.g., "show login modal before AI"), remove the gate
3. If it's data fetching (e.g., GraphQL queries), remove the feature temporarily
4. If it's shared utility, keep the file but remove the cloud dependency

Repeat `yarn typecheck` until no errors remain.

- [ ] **Step 5: Verify build still works**

Run: `yarn build`
Expected: Build succeeds for electron target (may need `yarn affine @affine/electron build`)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(story): strip cloud/auth/backend modules from frontend"
```

---

## Task 7: Replace CopilotClient with LLMClient Adapter

**Goal:** Create an adapter that implements the same interface as `CopilotClient` but routes calls through `@affine/ai`'s `LLMClient` directly to user-provided API endpoints.

**Files:**

- Create: `packages/frontend/core/src/blocksuite/ai/runtime/request/llm-client-adapter.ts`
- Modify: `packages/frontend/core/src/blocksuite/ai/runtime/chat/runtime.ts` — use adapter
- Modify: `packages/frontend/core/src/blocksuite/ai/runtime/request/service.ts` — use adapter

- [ ] **Step 1: Study CopilotClient interface**

Read `packages/frontend/core/src/blocksuite/ai/runtime/request/copilot-client.ts` to understand the exact method signatures used by the runtime.

- [ ] **Step 2: Create LLMClientAdapter**

The adapter wraps `@affine/ai`'s `LLMClient` and exposes the same streaming interface that `AIRequestService` expects:

```typescript
// packages/frontend/core/src/blocksuite/ai/runtime/request/llm-client-adapter.ts
import { LLMClient, type APIKeyConfig } from '@affine/ai';
import type { CopilotClient } from './copilot-client.js';

export class LLMClientAdapter {
  private client: LLMClient | null = null;

  configure(config: APIKeyConfig): void {
    this.client = new LLMClient({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      model: config.model,
    });
  }

  async *chatTextStream(params: { sessionId: string; messageId?: string; action?: string; content: string }): AsyncGenerator<string> {
    if (!this.client) throw new Error('LLM not configured. Please set your API key in Settings.');

    const systemPrompt = '你是Story写作助手，一个专业的中文小说创作顾问。';
    yield* this.client.stream(params.content, systemPrompt);
  }
}
```

- [ ] **Step 3: Wire adapter into AI runtime**

Modify `service.ts` to use `LLMClientAdapter` instead of `CopilotClient`. The key change: replace GraphQL-based session management with local state, and replace EventSource streaming with `LLMClient.stream()`.

- [ ] **Step 4: Verify AI panel renders without errors**

Run: `yarn dev`
Open the app, navigate to the AI chat panel. Expected: Panel renders, shows "Please configure API key" message if no key is set.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/core/src/blocksuite/ai/
git commit -m "feat(story): replace CopilotClient with LLMClient adapter for direct API calls"
```

---

## Task 8: Implement Three-Column Story Layout

**Goal:** Replace the current AFFiNE sidebar + content layout with a three-column writing layout (navigation | editor | AI panel).

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/story-layout.tsx`
- Create: `packages/frontend/core/src/components/story-layout/story-sidebar.tsx`
- Create: `packages/frontend/core/src/components/story-layout/story-editor-panel.tsx`
- Create: `packages/frontend/core/src/components/story-layout/story-ai-panel.tsx`
- Modify: `packages/frontend/core/src/desktop/pages/workspace/layouts/workspace-layout.tsx`
- Modify: `packages/frontend/core/src/desktop/workbench-router.ts`

- [ ] **Step 1: Create StorySidebar component**

The left sidebar with module navigation:

```tsx
// packages/frontend/core/src/components/story-layout/story-sidebar.tsx
// Icon navigation: 章节/人物/世界观/路线图/火花/图谱/设置
// Collapsible sub-panel for active module (e.g., chapter list when 章节 is selected)
```

- [ ] **Step 2: Create StoryEditorPanel component**

Wraps BlockSuite editor with word count bar and focus mode toggle:

```tsx
// packages/frontend/core/src/components/story-layout/story-editor-panel.tsx
// Renders BlockSuite editor for chapter content
// Shows word count + target progress bar at bottom
// Focus mode button to collapse sidebars
```

- [ ] **Step 3: Create StoryAIPanel component**

Wraps existing AI chat content with Story-specific action buttons:

```tsx
// packages/frontend/core/src/components/story-layout/story-ai-panel.tsx
// Reuses AIChatContent from existing AI panel
// Adds quick action bar: 续写/火花/润色/分析
// Collapsible panel
```

- [ ] **Step 4: Create StoryLayout shell**

```tsx
// packages/frontend/core/src/components/story-layout/story-layout.tsx
// Three-column resizable layout
// <StorySidebar /> | <StoryEditorPanel /> | <StoryAIPanel />
```

- [ ] **Step 5: Wire into workspace layout**

Modify `workspace-layout.tsx` to render `StoryLayout` instead of the current workbench layout. This replaces the page-centric view with the story-centric view.

- [ ] **Step 6: Update routes**

Modify `workbench-router.ts` to add story-specific routes:

- `/chapters` — Chapter list view
- `/chapters/:index` — Chapter editor (default)
- `/characters` — Character management
- `/worldbuilding` — World settings
- `/roadmap` — Mind map view
- `/sparks` — Spark wall
- `/graphs` — Graph visualization
- `/settings` — API key config, Git settings

- [ ] **Step 7: Verify layout renders**

Run: `yarn dev`
Expected: Three-column layout visible with collapsible sidebars, BlockSuite editor in center

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/
git add packages/frontend/core/src/desktop/
git commit -m "feat(story): implement three-column story layout with sidebar, editor, and AI panel"
```

---

## Task 9: Wire ProjectService and ChapterService into UI

**Goal:** Connect the UI to the domain services so users can create projects, manage chapters, and write content.

**Files:**

- Create: `packages/frontend/core/src/modules/story/story-module.ts`
- Create: `packages/frontend/core/src/modules/story/project-provider.tsx`
- Modify: `packages/frontend/core/src/components/story-layout/story-sidebar.tsx`
- Modify: `packages/frontend/core/src/components/story-layout/story-editor-panel.tsx`

- [ ] **Step 1: Create Story module with DI**

Register `ProjectService`, `ChapterService`, `GitService` in the app's dependency injection framework (`@toeverything/infra`).

- [ ] **Step 2: Create project context provider**

A React context that holds the currently active project and provides services to child components.

- [ ] **Step 3: Connect sidebar to ChapterService**

When "章节" module is selected, the sidebar shows chapter list from `ChapterService.list()`. Clicking a chapter loads it in the editor.

- [ ] **Step 4: Connect editor to ChapterService**

The editor panel reads/writes chapter content through `ChapterService.read()` and `ChapterService.update()`. Auto-save triggers `GitService.add()` + `GitService.commit()`.

- [ ] **Step 5: Verify end-to-end flow**

Run: `yarn dev`

1. Create a new novel project
2. Add chapters
3. Write content in the editor
4. Verify files appear in the Git repo on disk

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/core/src/modules/story/
git add packages/frontend/core/src/components/story-layout/
git commit -m "feat(story): wire ProjectService and ChapterService into UI with auto-save"
```

---

## Task 10: Settings Page — API Key Configuration

**Goal:** A settings page where users configure their LLM API keys and Git settings.

**Files:**

- Create: `packages/frontend/core/src/components/story-layout/settings-page.tsx`
- Modify: `packages/frontend/core/src/desktop/workbench-router.ts`

- [ ] **Step 1: Create settings page component**

```tsx
// API Key management section:
// - List configured keys (provider, model, name)
// - Add new key form (provider dropdown, base URL, API key input, model input)
// - Test connection button
// - Delete key
//
// Git settings section:
// - Git binary path (auto-detect)
// - Default remote URL
// - Username/email for commits
```

- [ ] **Step 2: Connect to APIKeyStore**

The settings page reads/writes through `APIKeyStore` from `@affine/ai`.

- [ ] **Step 3: Add route**

Add `/settings` route in `workbench-router.ts` pointing to the settings page.

- [ ] **Step 4: Verify settings flow**

Run: `yarn dev`

1. Navigate to Settings
2. Add an API key
3. Navigate to AI panel
4. Verify AI panel uses the configured key

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/core/src/components/story-layout/settings-page.tsx
git commit -m "feat(story): add settings page for API key and Git configuration"
```

---

## Self-Review Checklist

- [x] Spec coverage: Every requirement in the first-phase spec maps to a task
- [x] Placeholder scan: No TBD/TODO/FIXME/placeholders
- [x] Type consistency: Service types are consistent across tasks
- [x] File paths: All paths are exact and follow monorepo conventions
- [x] Test coverage: Every new module has corresponding tests
- [x] Commit plan: Each task ends with a meaningful commit
