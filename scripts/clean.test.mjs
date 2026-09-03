import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { computeCleanTargets, runClean } from './clean.mjs';

function direntLike(name, { isDirectory = true } = {}) {
  return { name, isDirectory: () => isDirectory };
}

function createFsApi({ entries = [], existing = new Set() } = {}) {
  return {
    readdirSync: vi.fn(() => entries),
    existsSync: vi.fn((target) => existing.has(target)),
    rmSync: vi.fn(),
  };
}

describe('computeCleanTargets', () => {
  it('always includes the fixed reproducible build/test artifacts', () => {
    const fsApi = createFsApi({ entries: [] });

    const targets = computeCleanTargets('/repo', fsApi);

    expect(targets).toEqual(['dist', 'coverage', 'node_modules/.vite']);
  });

  it('discovers release and release-* directories without hardcoding names', () => {
    const fsApi = createFsApi({
      entries: [
        direntLike('release'),
        direntLike('release-dir'),
        direntLike('release-x64'),
        direntLike('src'),
        direntLike('release.log', { isDirectory: false }),
      ],
    });

    const targets = computeCleanTargets('/repo', fsApi);

    expect(targets).toEqual([
      'dist',
      'coverage',
      'node_modules/.vite',
      'release',
      'release-dir',
      'release-x64',
    ]);
  });

  it('ignores files and unrelated directories named similarly', () => {
    const fsApi = createFsApi({
      entries: [direntLike('releaser'), direntLike('.releaser')],
    });

    const targets = computeCleanTargets('/repo', fsApi);

    expect(targets).not.toContain('releaser');
    expect(targets).not.toContain('.releaser');
  });
});

describe('runClean', () => {
  it('removes only targets that exist and reports what was removed', () => {
    const fsApi = createFsApi({
      entries: [direntLike('release')],
      existing: new Set([
        path.join('repo-root', 'dist'),
        path.join('repo-root', 'release'),
        path.join('repo-root', 'node_modules/.vite'),
      ]),
    });
    const log = vi.fn();

    const removed = runClean({ rootDir: 'repo-root', fsApi, log });

    expect(removed).toEqual(['dist', 'node_modules/.vite', 'release']);
    expect(fsApi.rmSync).toHaveBeenCalledTimes(3);
    expect(fsApi.rmSync).toHaveBeenCalledWith(path.join('repo-root', 'dist'), {
      recursive: true,
      force: true,
    });
    expect(fsApi.rmSync).not.toHaveBeenCalledWith(
      path.join('repo-root', 'coverage'),
      expect.anything(),
    );
  });

  it('logs a neutral message when nothing needs cleaning', () => {
    const fsApi = createFsApi({ entries: [], existing: new Set() });
    const log = vi.fn();

    const removed = runClean({ rootDir: 'repo-root', fsApi, log });

    expect(removed).toEqual([]);
    expect(fsApi.rmSync).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('nothing'));
  });
});
