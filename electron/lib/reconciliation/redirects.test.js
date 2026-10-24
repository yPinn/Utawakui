import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import {
  loadPlaylists,
  renamePlaylist,
  resolvePlaylistId,
} from '../playlists.js';
let dir;
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});
it('projects retired ids for navigation without persisting derived alias fields', () => {
  fs.mkdirSync('.tmp', { recursive: true });
  dir = fs.mkdtempSync(path.resolve('.tmp/reconcile-redirect-'));
  fs.writeFileSync(
    path.join(dir, 'playlists.json'),
    JSON.stringify({
      version: 4,
      playlists: [{ id: 'kept', kind: 'album', name: 'A', trackIds: [] }],
      reconciliation: {
        version: 1,
        redirects: { old: 'kept' },
        decisions: [],
        merges: [],
        pendingReleases: [],
      },
    }),
  );
  expect(loadPlaylists(dir)[0].redirectedIds).toEqual(['old']);
  expect(resolvePlaylistId(dir, 'old')).toBe('kept');
  renamePlaylist(dir, 'kept', 'Edited');
  expect(
    JSON.parse(fs.readFileSync(path.join(dir, 'playlists.json'))).playlists[0],
  ).not.toHaveProperty('redirectedIds');
});
