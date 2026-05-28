import { describe, expect, it } from 'vitest';

import { GitPaths } from './git-paths.js';

describe('GitPaths', () => {
  it('forProject returns correct paths for a novel project', () => {
    const paths = GitPaths.forProject('/home/user/novels/my-novel');

    expect(paths.root).toBe('/home/user/novels/my-novel');
    expect(paths.bookMeta).toBe('/home/user/novels/my-novel/book-meta.md');
    expect(paths.chapters).toBe('/home/user/novels/my-novel/chapters');
    expect(paths.characters).toBe('/home/user/novels/my-novel/characters');
    expect(paths.worldbuilding).toBe(
      '/home/user/novels/my-novel/worldbuilding'
    );
    expect(paths.roadmap).toBe('/home/user/novels/my-novel/roadmap.md');
    expect(paths.sparks).toBe('/home/user/novels/my-novel/sparks');
    expect(paths.graphs).toBe('/home/user/novels/my-novel/graphs');
  });

  it('chapter(1, "开端") returns correctly zero-padded path', () => {
    const paths = GitPaths.forProject('/root');
    expect(paths.chapter(1, '开端')).toBe('/root/chapters/001-开端.md');
  });

  it('chapter(10, "相遇") returns two-digit padded path', () => {
    const paths = GitPaths.forProject('/root');
    expect(paths.chapter(10, '相遇')).toBe('/root/chapters/010-相遇.md');
  });

  it('chapter(100, "终章") returns three-digit number without extra padding', () => {
    const paths = GitPaths.forProject('/root');
    expect(paths.chapter(100, '终章')).toBe('/root/chapters/100-终章.md');
  });
});
