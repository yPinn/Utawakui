import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildPublicFiles,
  SYNCED_FILES,
  syncReleaseRepository,
  unlinkMissingTargets,
} from './public-repo-sync.mjs';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const published = new Set(Object.keys(SYNCED_FILES));

describe('unlinkMissingTargets', () => {
  it('keeps public, external, and anchor links but unlinks private targets', () => {
    const text = [
      '[notices](THIRD_PARTY_NOTICES.md)',
      '[site](https://example.com/a)',
      '[top](#top)',
      '[ADR](docs/adr/0019.md)',
      '[`third-party/NOTICES.txt`](third-party/NOTICES.txt)',
    ].join('\n');

    expect(unlinkMissingTargets(text, 'LICENSE.md', published)).toBe(
      [
        '[notices](THIRD_PARTY_NOTICES.md)',
        '[site](https://example.com/a)',
        '[top](#top)',
        'ADR',
        '`third-party/NOTICES.txt`',
      ].join('\n'),
    );
  });

  it('resolves links relative to nested public files', () => {
    expect(
      unlinkMissingTargets(
        '[r](../README.md)',
        '.github/SECURITY.md',
        published,
      ),
    ).toBe('[r](../README.md)');
  });
});

describe('buildPublicFiles', () => {
  it('publishes LF text with no links to private files', () => {
    const files = buildPublicFiles(rootDirectory);

    expect(files.map(({ publicPath }) => publicPath)).toEqual(
      Object.keys(SYNCED_FILES),
    );
    for (const { publicPath, text } of files) {
      expect(text).not.toContain('\r\n');
      if (!publicPath.endsWith('.md')) continue;
      for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/gu)) {
        if (/^(?:[a-z][a-z\d+.-]*:|#)/iu.test(target)) continue;
        const resolved = path.posix.normalize(
          path.posix.join(path.posix.dirname(publicPath), target.split('#')[0]),
        );
        expect(published.has(resolved), `${publicPath} -> ${target}`).toBe(
          true,
        );
      }
    }
  });
});

describe('syncReleaseRepository', () => {
  function fakeGh(remoteFiles) {
    const puts = [];
    const runGh = (args, input) => {
      const publicPath = args.at(-1) === '-' ? args[3] : args[1];
      const key = publicPath.replace(
        'repos/yPinn/Utawakui-Releases/contents/',
        '',
      );
      if (args[1] === '-X') {
        puts.push({ key, body: JSON.parse(input) });
        return '{}';
      }
      if (!(key in remoteFiles)) {
        const error = new Error('gh: Not Found (HTTP 404)');
        throw error;
      }
      return JSON.stringify({
        sha: `sha-${key}`,
        content: Buffer.from(remoteFiles[key]).toString('base64'),
      });
    };
    return { puts, runGh };
  }

  it('updates only files that differ and creates missing ones', () => {
    const current = Object.fromEntries(
      buildPublicFiles(rootDirectory).map(({ publicPath, text }) => [
        publicPath,
        text,
      ]),
    );
    const remote = { ...current, 'README.md': 'old' };
    delete remote['THIRD_PARTY_NOTICES.md'];
    const { puts, runGh } = fakeGh(remote);

    const updated = syncReleaseRepository({
      rootDirectory,
      version: '0.6.0',
      runGh,
    });

    expect(updated).toEqual(['README.md', 'THIRD_PARTY_NOTICES.md']);
    expect(puts[0].body.sha).toBe('sha-README.md');
    expect(puts[0].body.message).toBe('Sync README.md from v0.6.0');
    expect(Buffer.from(puts[0].body.content, 'base64').toString('utf8')).toBe(
      current['README.md'],
    );
    expect(puts[1].body).not.toHaveProperty('sha');
  });

  it('makes no commits when everything matches and rethrows other errors', () => {
    const current = Object.fromEntries(
      buildPublicFiles(rootDirectory).map(({ publicPath, text }) => [
        publicPath,
        text,
      ]),
    );
    const { puts, runGh } = fakeGh(current);
    expect(
      syncReleaseRepository({ rootDirectory, version: '0.6.0', runGh }),
    ).toEqual([]);
    expect(puts).toHaveLength(0);

    expect(() =>
      syncReleaseRepository({
        rootDirectory,
        version: '0.6.0',
        runGh: () => {
          throw new Error('HTTP 401');
        },
      }),
    ).toThrow('HTTP 401');
  });
});
