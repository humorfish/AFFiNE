import { join } from 'node:path';

export class GitPaths {
  private constructor(private readonly rootDir: string) {}

  static forProject(projectRoot: string): GitPaths {
    return new GitPaths(projectRoot);
  }

  get root(): string {
    return this.rootDir;
  }

  get bookMeta(): string {
    return join(this.rootDir, 'book-meta.md');
  }

  get chapters(): string {
    return join(this.rootDir, 'chapters');
  }

  get characters(): string {
    return join(this.rootDir, 'characters');
  }

  get worldbuilding(): string {
    return join(this.rootDir, 'worldbuilding');
  }

  get roadmap(): string {
    return join(this.rootDir, 'roadmap.md');
  }

  get sparks(): string {
    return join(this.rootDir, 'sparks');
  }

  get graphs(): string {
    return join(this.rootDir, 'graphs');
  }

  chapter(number: number, title: string): string {
    const padded = String(number).padStart(3, '0');
    return join(this.rootDir, 'chapters', `${padded}-${title}.md`);
  }
}
