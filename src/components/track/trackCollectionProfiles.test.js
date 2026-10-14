import { describe, expect, it } from 'vitest';
import {
  TRACK_COLLECTION_KINDS,
  normalizeTrackCollectionPreferences,
  projectTrackCollectionEntries,
  trackCollectionColumnChoices,
  trackCollectionColumnRoles,
  trackCollectionProfile,
} from './trackCollectionProfiles.js';

const entries = [
  {
    track: {
      id: 'track-a',
      title: '夜に駆ける',
      artist: 'YOASOBI',
      album: 'THE BOOK',
      releaseYear: 2020,
      importedAt: '2026-10-04T12:00:00.000Z',
      duration: 261,
    },
    visibleIndex: 0,
    addedAt: '2026-10-12T12:00:00.000Z',
  },
];

describe('production track collection profiles', () => {
  it('defines the five Library collection kinds behind one profile contract', () => {
    expect(TRACK_COLLECTION_KINDS).toEqual([
      'library-all',
      'library-local',
      'playlist',
      'album',
      'artist',
    ]);
    expect(trackCollectionColumnRoles('library-all')).toEqual([
      'ordinal',
      'identity',
      'release',
      'separation',
      'duration',
      'actions',
    ]);
    expect(trackCollectionColumnRoles('playlist')).toEqual([
      'ordinal',
      'identity',
      'separation',
      'duration',
      'actions',
    ]);
    expect(trackCollectionColumnRoles('album')).toEqual([
      'ordinal',
      'identity',
      'usage',
      'separation',
      'duration',
      'actions',
    ]);
    expect(trackCollectionColumnRoles('artist')).toEqual([
      'ordinal',
      'identity',
      'usage',
      'separation',
      'duration',
      'actions',
    ]);
  });

  it('keeps whole-row playlist reorder and locks source-owned album/artist columns', () => {
    expect(trackCollectionProfile('playlist')).toMatchObject({
      dragBehavior: 'reorder',
      headerReorder: true,
    });
    expect(trackCollectionProfile('album')).toMatchObject({
      ordinalMode: 'source',
      lockedDefaultColumns: ['usage'],
      headerReorder: false,
    });
    expect(trackCollectionProfile('artist')).toMatchObject({
      lockedDefaultColumns: ['usage'],
      headerReorder: false,
    });
    expect(trackCollectionColumnRoles('playlist')).not.toContain('reorder');
  });

  it('keeps playlist semantic fields opt-in while retaining every choice', () => {
    const choices = trackCollectionColumnChoices('playlist');

    expect(choices.map(({ role }) => role)).toEqual([
      'release',
      'membership',
      'usage',
      'releaseYear',
    ]);
    expect(choices.every(({ defaultVisible }) => !defaultVisible)).toBe(true);
  });

  it('projects only truthful source metadata and marks unavailable local usage', () => {
    const projected = projectTrackCollectionEntries(entries, 'album')[0];

    expect(projected).toMatchObject({
      ordinalText: '1',
      releaseText: 'THE BOOK',
      releaseYearText: '2020',
      membershipText: '2026/10/12',
      importedText: '2026/10/04',
      usageText: '—',
      playCount: null,
    });
  });

  it('normalizes sparse preferences through each profile allowlist', () => {
    expect(
      normalizeTrackCollectionPreferences('playlist', {
        visibleAdvanced: ['usage', 'imported', 'releaseYear', 'usage'],
        hiddenDefaultColumns: ['release', 'usage'],
        widths: { identity: 9999, release: 1, '--unsafe': 200 },
      }),
    ).toEqual({
      visibleAdvanced: ['usage', 'releaseYear'],
      hiddenDefaultColumns: [],
      widths: { identity: 720, release: 144 },
    });
  });
});
