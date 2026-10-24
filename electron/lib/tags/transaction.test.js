import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { digest } from '../reconciliation/documents.js';
import {
  commitTagFile,
  recoverTagFile,
  assertNoTagTransaction,
} from './transaction.js';
const roots = [];
function fixture() {
  const dir = fs.mkdtempSync(path.resolve('.tmp/tags-transaction-'));
  roots.push(dir);
  fs.mkdirSync(path.join(dir, 'tracks', 't'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tracks', 't', 'audio.flac'), 'before media');
  fs.writeFileSync(path.join(dir, 'library.json'), '{"tracks":{"t":{}}}');
  return dir;
}
afterEach(() => {
  vi.restoreAllMocks();
  roots
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});
function commit(dir, extra = {}) {
  return commitTagFile(
    dir,
    {
      trackId: 't',
      beforeHash: digest('before media'),
      output: Buffer.from('after media'),
      changes: [
        {
          filename: 'library.json',
          before: '{"tracks":{"t":{}}}',
          after: '{"tracks":{"t":{"contentHash":"after"}}}',
        },
      ],
    },
    extra,
  );
}
describe('tag media and references journal', () => {
  it.each(['prepared', 'media-installed', 'references-committed'])(
    'recovers idempotently after %s without losing the exact original',
    (phase) => {
      const dir = fixture();
      expect(() =>
        commit(dir, {
          afterPhase: (p) => {
            if (p === phase) throw Error('simulated interruption');
          },
        }),
      ).toThrow();
      expect(() => assertNoTagTransaction(dir)).toThrow();
      expect(recoverTagFile(dir)).toEqual({ recovered: true });
      expect(recoverTagFile(dir)).toEqual({ recovered: false });
      expect(
        fs.readFileSync(path.join(dir, 'tracks/t/audio.flac'), 'utf8'),
      ).toBe('after media');
      const folders = fs.readdirSync(path.join(dir, '.utawakui-tags'));
      expect(
        fs.readFileSync(
          path.join(dir, '.utawakui-tags', folders[0], 'original.flac'),
          'utf8',
        ),
      ).toBe('before media');
      expect(
        JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'))
          .tracks.t.contentHash,
      ).toBe('after');
    },
  );
  it('refuses external audio or JSON modifications before recovery touches anything', () => {
    const dir = fixture();
    expect(() =>
      commit(dir, {
        afterPhase: (p) => {
          if (p === 'media-installed') throw Error('stop');
        },
      }),
    ).toThrow();
    fs.writeFileSync(path.join(dir, 'library.json'), '{"external":true}');
    expect(() => recoverTagFile(dir)).toThrow();
    expect(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).toBe(
      '{"external":true}',
    );
    expect(() => assertNoTagTransaction(dir)).toThrow();
  });
  it('does not create a journal for stale media, malformed intents or insufficient space', () => {
    const dir = fixture();
    expect(() => commit(dir, { freeBytes: () => 0 })).toThrow();
    expect(() => assertNoTagTransaction(dir)).not.toThrow();
    fs.writeFileSync(path.join(dir, 'tracks/t/audio.flac'), 'replaced');
    expect(() => commit(dir)).toThrow();
    expect(() => assertNoTagTransaction(dir)).not.toThrow();
  });
  it('rejects hard-linked canonical audio', () => {
    const dir = fixture(),
      original = fs.lstatSync;
    vi.spyOn(fs, 'lstatSync').mockImplementation((file, ...args) => {
      const stat = original(file, ...args);
      if (String(file).endsWith('audio.flac')) stat.nlink = 2;
      return stat;
    });
    expect(() => commit(dir)).toThrow();
    expect(fs.readFileSync(path.join(dir, 'tracks/t/audio.flac'), 'utf8')).toBe(
      'before media',
    );
  });
});
