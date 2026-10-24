import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  commitDocuments,
  recoverTransaction,
  assertNoTransaction,
} from './transaction.js';
import { fillPlaylistReleaseMetadata } from '../playlists.js';
import { findTrackRecord } from '../library/tracks.js';
import { saveIndexEntry } from '../library/metadataIndex.js';
let dir;
beforeEach(() => {
  fs.mkdirSync('.tmp', { recursive: true });
  dir = fs.mkdtempSync(path.resolve('.tmp/reconcile-transaction-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
it('rolls forward a durable interrupted commit and recovery is idempotent', () => {
  fs.writeFileSync(path.join(dir, 'playlists.json'), '{"old":1}');
  expect(() =>
    commitDocuments(
      dir,
      [
        { filename: 'playlists.json', before: '{"old":1}', after: '{"new":1}' },
        {
          filename: 'folder-page-assets.json',
          before: null,
          after: '{"objects":[]}',
        },
      ],
      {
        afterWrite: () => {
          throw Error('crash');
        },
      },
    ),
  ).toThrow('crash');
  expect(() => assertNoTransaction(dir)).toThrow();
  expect(() => fillPlaylistReleaseMetadata(dir, [])).toThrow();
  expect(() => findTrackRecord(dir, 'missing')).toThrow();
  expect(() => saveIndexEntry(dir, 'missing', { title: 'No' })).toThrow();
  expect(recoverTransaction(dir)).toEqual({ recovered: true });
  expect(
    fs.readFileSync(path.join(dir, 'folder-page-assets.json'), 'utf8'),
  ).toBe('{"objects":[]}');
  expect(recoverTransaction(dir)).toEqual({ recovered: false });
});
it('refuses stale inputs before preparing and preserves unknown external edits on recovery', () => {
  fs.writeFileSync(path.join(dir, 'library.json'), '{"new":1}');
  expect(() =>
    commitDocuments(dir, [
      { filename: 'library.json', before: '{}', after: '{"x":1}' },
    ]),
  ).toThrow();
  expect(() =>
    commitDocuments(dir, [
      { filename: '../outside', before: null, after: '{}' },
    ]),
  ).toThrow();
  expect(() =>
    commitDocuments(
      dir,
      [
        { filename: 'library.json', before: '{"new":1}', after: '{"x":1}' },
        { filename: 'playlists.json', before: null, after: '{}' },
      ],
      {
        afterWrite: () => {
          throw Error('crash');
        },
      },
    ),
  ).toThrow();
  fs.writeFileSync(path.join(dir, 'library.json'), '{"external":1}');
  expect(() => recoverTransaction(dir)).toThrow();
  expect(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).toBe(
    '{"external":1}',
  );
});
