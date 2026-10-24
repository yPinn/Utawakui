import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  loadPlaylists,
  writeReleaseCatalog,
  upsertAlbum,
} from '../playlists.js';
import { reconcileCatalog } from './catalog.js';
let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-catalog-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const original = {
  id: 'album',
  kind: 'album',
  name: 'Name',
  source: { platform: 'youtube', id: 'OLAK5uy_test' },
  trackIds: [],
  addedAt: {},
  customUnknown: 'preserve',
  releaseInfo: { revision: 0, observed: {}, overrides: {} },
};
const manifest = {
  playlistId: 'OLAK5uy_test',
  browseId: 'MPREb_test',
  title: 'Name',
  artist: 'Artist',
  type: 'album',
  year: '2021',
  reportedTotal: 1,
  completeness: 'complete',
  slots: [
    {
      position: 1,
      videoId: 'rgNdeflYdYw',
      title: 'Song',
      artist: 'Artist',
      duration: 200,
      available: true,
    },
  ],
};
it('backs up v3 bytes and atomically retains manifest, private bindings and unknown data in v4', () => {
  const bytes = JSON.stringify({
    version: 3,
    futureMetadata: 'keep',
    playlists: [original],
  });
  fs.writeFileSync(path.join(dir, 'playlists.json'), bytes);
  const next = reconcileCatalog(
    loadPlaylists(dir)[0],
    manifest,
    { rgNdeflYdYw: { kind: 'audio-content-sha256', value: 'a'.repeat(64) } },
    '2026-10-24T00:00:00Z',
  );
  writeReleaseCatalog(dir, next, 0);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'playlists.json')));
  expect(saved).toMatchObject({
    version: 4,
    futureMetadata: 'keep',
    playlists: [{ customUnknown: 'preserve' }],
  });
  expect(loadPlaylists(dir)[0].releaseInfo.catalog.manifest).toEqual(manifest);
  upsertAlbum(dir, {
    name: 'Provider name',
    source: original.source,
    trackIds: [],
  });
  expect(loadPlaylists(dir)[0].trackIds).toEqual(['rgNdeflYdYw']);
  upsertAlbum(dir, {
    name: 'Alias',
    source: { ...original.source, platform: 'yt-music' },
    trackIds: ['rgNdeflYdYw'],
    releaseObservations: {
      type: {
        value: 'album',
        provenance: { provider: 'yt-music', sourceId: original.source.id },
      },
    },
  });
  expect(loadPlaylists(dir)).toHaveLength(1);
  expect(loadPlaylists(dir)[0].id).toBe(original.id);
  expect(loadPlaylists(dir)[0].source.platform).toBe('youtube');
  const backup = fs.readdirSync(dir).find((name) => name.includes('backup-v3'));
  expect(fs.readFileSync(path.join(dir, backup), 'utf8')).toBe(bytes);
});
it('rejects stale writes, future schemas and does not revive a removed collection', () => {
  const file = path.join(dir, 'playlists.json');
  fs.writeFileSync(file, JSON.stringify({ version: 3, playlists: [original] }));
  const next = reconcileCatalog(original, manifest, {}, '2026-10-24T00:00:00Z');
  expect(() => writeReleaseCatalog(dir, next, 8)).toThrow();
  fs.writeFileSync(file, JSON.stringify({ version: 3, playlists: [] }));
  expect(() => writeReleaseCatalog(dir, next, 0)).toThrow();
  fs.writeFileSync(file, JSON.stringify({ version: 9, playlists: [] }));
  expect(() => writeReleaseCatalog(dir, next, null)).toThrow();
});
