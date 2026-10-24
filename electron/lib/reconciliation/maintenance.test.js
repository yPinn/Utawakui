import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  organizeTrackMetadataFromSidecars,
  refreshTrackMetadataFromSidecars,
} from '../library/tracks.js';
import { runBackfillPass } from '../library/backfill.js';
let dir;
const id = 'XMWIJCaYx1M';
beforeEach(() => {
  fs.mkdirSync('.tmp', { recursive: true });
  dir = fs.mkdtempSync(path.resolve('.tmp/reconcile-maintenance-'));
  fs.mkdirSync(path.join(dir, 'tracks', id), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tracks', id, 'audio.wav'), 'audio');
  fs.writeFileSync(
    path.join(dir, 'library.json'),
    JSON.stringify({
      version: 2,
      tracks: {
        [id]: {
          title: 'Manual',
          titleOrigin: 'manual',
          artist: '',
          artistOrigin: 'manual',
          album: '',
          albumOrigin: 'manual',
          releaseYear: null,
          releaseYearOrigin: 'manual',
          albumArtist: '',
          albumArtistOrigin: 'manual',
        },
      },
    }),
  );
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const read = () =>
  JSON.parse(fs.readFileSync(path.join(dir, 'library.json'))).tracks[id];
const provider = {
  title: 'Provider',
  artist: 'Artist',
  album: 'Album',
  releaseYear: 2026,
  albumArtist: 'Artist',
};
it('manual clears survive both offline refresh paths and network backfill', async () => {
  const before = read();
  organizeTrackMetadataFromSidecars(dir, () => ({ normalized: provider }));
  refreshTrackMetadataFromSidecars(dir, () => provider);
  await runBackfillPass(
    dir,
    [{ id, needsBackfill: true }],
    async () => provider,
  );
  expect(read()).toEqual(before);
});
it('following source updates album/year while unknown legacy values are preserved automatically', () => {
  const index = {
    version: 2,
    tracks: {
      [id]: {
        title: 'Manual',
        titleOrigin: 'manual',
        album: 'Old',
        albumOrigin: 'provider',
        releaseYear: 2025,
        releaseYearOrigin: 'provider',
      },
    },
  };
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify(index));
  organizeTrackMetadataFromSidecars(dir, () => ({ normalized: provider }));
  expect(read()).toMatchObject({ album: 'Album', releaseYear: 2026 });
});
