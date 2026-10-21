import { describe, expect, it } from 'vitest';
import {
  TRACK_COLLECTION_KINDS,
  normalizeTrackCollectionSort,
  normalizeTrackCollectionPreferences,
  projectTrackCollectionEntries,
  reorderTrackCollectionColumn,
  trackCollectionColumnChoices,
  trackCollectionColumns,
  trackCollectionColumnRoles,
  trackCollectionColumnWidth,
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
      'performance-archive',
      'performance-session',
    ]);
    expect(trackCollectionColumnRoles('library-all')).toEqual([
      'ordinal',
      'identity',
      'release',
      'usage',
      'duration',
      'actions',
    ]);
    expect(trackCollectionColumnRoles('playlist')).toEqual([
      'ordinal',
      'identity',
      'duration',
      'actions',
    ]);
    expect(trackCollectionColumnRoles('album')).toEqual([
      'ordinal',
      'identity',
      'usage',
      'duration',
      'actions',
    ]);
    expect(trackCollectionColumnRoles('artist')).toEqual([
      'ordinal',
      'identity',
      'usage',
      'duration',
      'actions',
    ]);
  });

  it.each([
    [
      'library-all',
      {
        identity: [304, 128, 720],
        release: [224, 144, 480],
        usage: [104, 88, 192],
      },
    ],
    [
      'library-local',
      {
        identity: [304, 128, 720],
        release: [224, 144, 480],
        usage: [104, 88, 192],
      },
    ],
    [
      'playlist',
      {
        identity: [288, 128, 720],
        release: [208, 144, 480],
        membership: [128, 112, 224],
        usage: [104, 88, 192],
        releaseYear: [96, 88, 176],
      },
    ],
    [
      'album',
      {
        identity: [360, 128, 720],
        usage: [104, 88, 192],
        imported: [128, 112, 224],
      },
    ],
    [
      'artist',
      {
        identity: [288, 128, 720],
        release: [208, 144, 480],
        releaseYear: [96, 88, 176],
        imported: [128, 112, 224],
        usage: [104, 88, 192],
      },
    ],
  ])(
    'keeps the %s nominal and minimum width matrix explicit',
    (kind, roles) => {
      expect(trackCollectionColumnWidth(kind, 'ordinal')).toMatchObject({
        defaultWidth: 40,
        minWidth: 32,
        maxWidth: 40,
      });
      expect(trackCollectionColumnWidth(kind, 'duration')).toMatchObject({
        defaultWidth: 104,
        minWidth: 96,
        maxWidth: 104,
      });
      expect(trackCollectionColumnWidth(kind, 'actions')).toMatchObject({
        defaultWidth: 24,
        minWidth: 24,
        maxWidth: 24,
      });
      for (const [role, [defaultWidth, minWidth, maxWidth]] of Object.entries(
        roles,
      )) {
        expect(trackCollectionColumnWidth(kind, role)).toMatchObject({
          defaultWidth,
          minWidth,
          maxWidth,
        });
      }
    },
  );

  it('balances the default Library title and album lanes while retaining the trailing status cell', () => {
    expect(trackCollectionColumnWidth('library-all', 'identity')).toMatchObject(
      {
        defaultWidth: 304,
        minWidth: 128,
      },
    );
    expect(trackCollectionColumnWidth('library-all', 'release')).toMatchObject({
      defaultWidth: 224,
      minWidth: 144,
    });
    expect(trackCollectionColumnWidth('library-all', 'duration')).toMatchObject(
      {
        defaultWidth: 104,
        minWidth: 96,
      },
    );
  });

  it('describes header, cell, and numeric presentation independently', () => {
    const columns = Object.fromEntries(
      trackCollectionColumns('library-all').map((column) => [
        column.role,
        column,
      ]),
    );

    expect(columns.identity).toMatchObject({
      align: 'start',
      headerAlign: 'start',
    });
    expect(columns.usage).toMatchObject({
      align: 'end',
      headerAlign: 'end',
      numeric: true,
      sortIndicatorPlacement: 'before',
    });
    expect(columns.duration).toMatchObject({
      align: 'end',
      headerAlign: 'end',
      numeric: true,
    });
  });

  it('keeps column, track-row sort, and manual playlist reorder as three capabilities', () => {
    expect(
      Object.fromEntries(
        TRACK_COLLECTION_KINDS.map((kind) => [
          kind,
          trackCollectionProfile(kind).canReorderColumns,
        ]),
      ),
    ).toEqual({
      'library-all': true,
      'library-local': true,
      playlist: true,
      album: true,
      artist: true,
      'performance-archive': false,
      'performance-session': false,
    });
    expect(
      Object.fromEntries(
        TRACK_COLLECTION_KINDS.map((kind) => [
          kind,
          trackCollectionProfile(kind).canSortTrackRows,
        ]),
      ),
    ).toEqual({
      'library-all': true,
      'library-local': true,
      playlist: true,
      album: false,
      artist: false,
      'performance-archive': false,
      'performance-session': false,
    });
    expect(
      Object.fromEntries(
        TRACK_COLLECTION_KINDS.map((kind) => [
          kind,
          trackCollectionProfile(kind).canReorderPlaylistTracks,
        ]),
      ),
    ).toEqual({
      'library-all': false,
      'library-local': false,
      playlist: true,
      album: false,
      artist: false,
      'performance-archive': false,
      'performance-session': false,
    });
    expect(trackCollectionProfile('album')).toMatchObject({
      ordinalMode: 'source',
      lockedDefaultColumns: ['usage'],
      canReorderColumns: true,
      canSortTrackRows: false,
      canReorderPlaylistTracks: false,
    });
    expect(trackCollectionProfile('artist')).toMatchObject({
      lockedDefaultColumns: ['usage'],
      canReorderColumns: true,
      canSortTrackRows: false,
      canReorderPlaylistTracks: false,
    });
    for (const kind of TRACK_COLLECTION_KINDS) {
      expect(trackCollectionProfile(kind)).not.toHaveProperty('headerReorder');
      expect(trackCollectionProfile(kind)).not.toHaveProperty('dragBehavior');
      expect(trackCollectionProfile(kind)).not.toHaveProperty('sortable');
    }
    expect(trackCollectionColumnRoles('playlist')).not.toContain('reorder');

    for (const kind of ['album', 'artist']) {
      const injected = {
        visibleAdvanced: ['release', 'releaseYear', 'imported'],
        columnOrder: ['imported', 'releaseYear', 'release', 'usage'],
      };
      expect(
        reorderTrackCollectionColumn(
          kind,
          injected,
          'imported',
          'usage',
          'before',
        ),
      ).toMatchObject({ columnOrder: expect.arrayContaining(['imported']) });
      expect(trackCollectionColumnRoles(kind, injected)).toEqual(
        kind === 'album'
          ? ['ordinal', 'identity', 'imported', 'usage', 'duration', 'actions']
          : [
              'ordinal',
              'identity',
              'imported',
              'releaseYear',
              'release',
              'usage',
              'duration',
              'actions',
            ],
      );
    }
  });

  it('normalizes residual track-row sort state through the collection profile', () => {
    expect(
      normalizeTrackCollectionSort('library-all', {
        key: 'duration',
        direction: 'desc',
      }),
    ).toEqual({ key: 'duration', direction: 'desc' });
    expect(
      normalizeTrackCollectionSort('playlist', {
        key: 'title',
        direction: 'asc',
      }),
    ).toEqual({ key: 'title', direction: 'asc' });
    for (const kind of ['album', 'artist']) {
      expect(
        normalizeTrackCollectionSort(kind, {
          key: 'duration',
          direction: 'desc',
        }),
      ).toEqual({ key: null, direction: 'asc' });
    }
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

  it('formats local usage with one grouped-integer utility contract', () => {
    const projected = projectTrackCollectionEntries(
      [{ ...entries[0], playCount: 1_234_567 }],
      'library-all',
    )[0];

    expect(projected).toMatchObject({
      usageText: '1,234,567',
      playCount: 1_234_567,
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
