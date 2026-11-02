import { describe, expect, it } from 'vitest';
import { t } from './i18n.js';
import { releaseEntityKey } from './releasePresentation.js';

// These keys are built from kinds and release types at runtime, out of the static catalog test's sight.
const resolved = (key) => {
  const text = t(key);
  return typeof text === 'string' && text !== key;
};

const RELEASE_TYPES = ['unknown', 'album', 'single', 'ep', '', 'other'];

describe('library catalog coverage', () => {
  it('labels every release type', () => {
    for (const type of ['unknown', 'album', 'single', 'ep'])
      expect(resolved(`library.releaseTypes.${type}`), type).toBe(true);
  });

  it('words every release entity variant', () => {
    for (const type of RELEASE_TYPES) {
      const key = releaseEntityKey(type);
      for (const group of [
        'entity',
        'addEntityToPlaylist',
        'addReleaseToPlaylist',
      ])
        expect(resolved(`library.${group}.${key}`), `${group}/${type}`).toBe(
          true,
        );
    }
  });

  it('names every collection kind', () => {
    for (const kind of ['library', 'artist', 'playlist'])
      expect(resolved(`library.entity.${kind}`), kind).toBe(true);
    for (const kind of ['album', 'artist', 'library', 'playlist'])
      expect(resolved(`library.markers.${kind}`), kind).toBe(true);
    for (const kind of ['album', 'playlist', 'artist'])
      expect(resolved(`library.queueSource.${kind}`), kind).toBe(true);
  });
});
