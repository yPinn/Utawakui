import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  failure,
  record,
  identifier,
  digest,
  readDocument,
  readSnapshot,
} from './documents.js';
let dir;
beforeEach(() => {
  fs.mkdirSync('.tmp', { recursive: true });
  dir = fs.mkdtempSync(path.resolve('.tmp/reconcile-docs-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
it('reads missing libraries without creating files and preserves exact raw bytes/fingerprints', () => {
  const empty = readSnapshot(dir);
  expect(empty.index.raw).toBeNull();
  expect(empty.playlists.data.playlists).toEqual([]);
  const raw = '{ "version": 4, "playlists": [], "unknown": true }';
  fs.writeFileSync(path.join(dir, 'playlists.json'), raw);
  expect(readSnapshot(dir).playlists).toMatchObject({
    raw,
    fingerprint: digest(raw),
  });
  expect(fs.readdirSync(dir)).toEqual(['playlists.json']);
  expect(failure().code).toBe('RECONCILIATION_INVALID');
});
it.each([null, [], new Date(), JSON.parse('{"__proto__": 1}'), { path: 'x' }])(
  'rejects unsafe records before mutation %#',
  (value) => {
    expect(() => record(value, ['allowed'])).toThrow();
  },
);
it.each(['../x', 'a/b', 'a\\b', 'constructor', '', 'a\n', 'C:/x'])(
  'rejects unsafe identifiers %j',
  (value) => expect(() => identifier(value)).toThrow(),
);
it('refuses corrupt, duplicate-id and future library documents', () => {
  fs.writeFileSync(path.join(dir, 'library.json'), '{bad');
  expect(() => readSnapshot(dir)).toThrow();
  fs.writeFileSync(
    path.join(dir, 'library.json'),
    JSON.stringify({ version: 999, tracks: {} }),
  );
  expect(() => readSnapshot(dir)).toThrow();
  fs.writeFileSync(
    path.join(dir, 'library.json'),
    JSON.stringify({ version: 2, tracks: {} }),
  );
  fs.writeFileSync(
    path.join(dir, 'playlists.json'),
    JSON.stringify({ version: 5, playlists: [] }),
  );
  expect(() => readSnapshot(dir)).toThrow();
  fs.writeFileSync(
    path.join(dir, 'playlists.json'),
    JSON.stringify({ version: 4, playlists: [{ id: 'same' }, { id: 'same' }] }),
  );
  expect(() => readSnapshot(dir)).toThrow();
  fs.writeFileSync(path.join(dir, 'playlists.json'), '[]');
  expect(() => readSnapshot(dir)).toThrow();
});
it('refuses oversized documents and exposes read errors to the private boundary', () => {
  const file = path.join(dir, 'large.json');
  fs.writeFileSync(file, '{}');
  fs.truncateSync(file, 32 * 1024 * 1024 + 1);
  expect(() => readDocument(dir, 'large.json')).toThrow();
  fs.mkdirSync(path.join(dir, 'directory.json'));
  expect(() => readDocument(dir, 'directory.json')).toThrow();
});
