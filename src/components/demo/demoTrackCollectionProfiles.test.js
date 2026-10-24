import { describe, expect, it } from 'vitest';
import {
  DEMO_TRACK_COLLECTION_KINDS,
  demoTrackCollectionAdvancedColumns,
  demoTrackCollectionColumnChoices,
  demoTrackCollectionColumnWidth,
  demoTrackCollectionColumns,
  demoTrackCollectionColumnRoles,
  demoTrackCollectionProfile,
  normalizeDemoTrackCollectionPreferences,
  projectDemoTrackCollectionEntries,
  reorderDemoTrackCollectionColumn,
} from './demoTrackCollectionProfiles.js';

const entries = [
  {
    track: {
      id: 'track-a',
      title: '夜に駆ける',
      artist: 'YOASOBI',
      duration: 261,
    },
    visibleIndex: 0,
    addedAtLabel: '2026/10/12',
    albumTitle: 'THE BOOK',
    releaseYear: 2020,
    discNumber: 2,
    trackNumber: 3,
    playCount: 1234,
  },
];

describe('demo track collection profiles', () => {
  it('defines every Library collection kind as one bounded profile family', () => {
    expect(DEMO_TRACK_COLLECTION_KINDS).toEqual([
      'library-all',
      'library-local',
      'playlist',
      'album',
      'artist',
      'performance-archive',
      'performance-session',
    ]);

    expect(demoTrackCollectionProfile('library-all')).toMatchObject({
      label: '全部曲目',
      showArtwork: true,
      showArtist: true,
      ordinalMode: 'collection',
      semanticColumns: [
        { role: 'release', label: '專輯' },
        { role: 'usage', label: '播放次數' },
      ],
    });
    expect(demoTrackCollectionProfile('library-local')).toMatchObject({
      label: '本機檔案',
      showArtwork: true,
      showArtist: true,
      ordinalMode: 'collection',
      semanticColumns: [
        { role: 'release', label: '專輯' },
        { role: 'usage', label: '播放次數' },
      ],
    });
    expect(demoTrackCollectionProfile('playlist')).toMatchObject({
      label: '播放清單',
      canReorderPlaylistTracks: true,
      semanticColumns: [],
    });
    expect(demoTrackCollectionProfile('album')).toMatchObject({
      label: '專輯',
      showArtwork: false,
      showArtist: true,
      ordinalMode: 'source',
      semanticColumns: [
        { role: 'usage', label: '播放次數', sortKey: 'playCount' },
      ],
      canReorderPlaylistTracks: false,
    });
    expect(demoTrackCollectionProfile('artist')).toMatchObject({
      label: '藝人',
      showArtwork: true,
      showArtist: false,
      semanticColumns: [
        { role: 'usage', label: '播放次數', sortKey: 'playCount' },
      ],
      canReorderPlaylistTracks: false,
    });
  });

  it('describes each profile in concise user-facing language', () => {
    expect(
      Object.fromEntries(
        DEMO_TRACK_COLLECTION_KINDS.map((kind) => [
          kind,
          demoTrackCollectionProfile(kind).description,
        ]),
      ),
    ).toEqual({
      'library-all': '所有曲目，預設顯示專輯與播放次數。',
      'library-local': '本機曲目，預設顯示專輯與播放次數。',
      playlist: '播放清單曲目，預設只顯示必要欄位。',
      album: '專輯曲目，預設顯示播放次數與時長。',
      artist: '藝人曲目，依播放次數由高到低排列，顯示播放次數與時長。',
      'performance-archive': '封存場次曲目，顯示演出狀態與時長。',
      'performance-session': '目前場次曲目，顯示演出狀態與時長。',
    });
  });

  it('derives one semantic descriptor sequence for both header and rows', () => {
    expect(
      demoTrackCollectionColumns('playlist').map(
        ({ role, label, sortKey, priority, align }) => ({
          role,
          label,
          sortKey,
          priority,
          align,
        }),
      ),
    ).toEqual([
      {
        role: 'ordinal',
        label: '#',
        sortKey: null,
        priority: 'essential',
        align: 'center',
      },
      {
        role: 'identity',
        label: '曲目',
        sortKey: 'title',
        priority: 'essential',
        align: 'start',
      },
      {
        role: 'duration',
        label: '時長',
        sortKey: 'duration',
        priority: 'duration',
        align: 'end',
      },
      {
        role: 'actions',
        label: '操作',
        sortKey: null,
        priority: 'essential',
        align: 'end',
      },
    ]);

    expect(demoTrackCollectionColumnRoles('playlist')).toEqual([
      'ordinal',
      'identity',
      'duration',
      'actions',
    ]);
    expect(demoTrackCollectionColumnRoles('album')).toEqual([
      'ordinal',
      'identity',
      'usage',
      'duration',
      'actions',
    ]);
    expect(demoTrackCollectionColumnRoles('artist')).toEqual([
      'ordinal',
      'identity',
      'usage',
      'duration',
      'actions',
    ]);
  });

  it('defines shared alignment and sort-cue placement by column role', () => {
    const columns = Object.fromEntries(
      [
        ...demoTrackCollectionColumns('library-all', {
          visibleAdvanced: ['releaseYear', 'imported', 'usage'],
        }),
        ...demoTrackCollectionColumns('playlist', {
          visibleAdvanced: ['release', 'membership'],
        }),
      ].map((column) => [column.role, column]),
    );

    expect(columns.ordinal).toMatchObject({
      align: 'center',
      headerAlign: 'center',
      numeric: true,
    });
    for (const role of ['identity', 'release', 'membership', 'imported']) {
      expect(columns[role]).toMatchObject({
        align: 'start',
        headerAlign: 'start',
        sortIndicatorPlacement: 'after',
      });
    }
    expect(columns.releaseYear).toMatchObject({
      align: 'start',
      headerAlign: 'start',
      numeric: true,
      sortIndicatorPlacement: 'after',
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
      sortIndicatorPlacement: 'before',
    });
    expect(columns.duration).toMatchObject({
      defaultWidth: 104,
      minWidth: 96,
    });
    expect(columns.status).toBeUndefined();
    expect(columns.actions).toMatchObject({ align: 'end' });
  });

  it('keeps column, track-row sort, and manual playlist reorder capabilities independent', () => {
    expect(
      Object.fromEntries(
        DEMO_TRACK_COLLECTION_KINDS.map((kind) => [
          kind,
          demoTrackCollectionProfile(kind).canReorderColumns,
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
        DEMO_TRACK_COLLECTION_KINDS.map((kind) => [
          kind,
          demoTrackCollectionProfile(kind).canSortTrackRows,
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
        DEMO_TRACK_COLLECTION_KINDS.map((kind) => [
          kind,
          demoTrackCollectionProfile(kind).canReorderPlaylistTracks,
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
    for (const kind of DEMO_TRACK_COLLECTION_KINDS) {
      expect(demoTrackCollectionProfile(kind)).not.toHaveProperty(
        'headerReorder',
      );
      expect(demoTrackCollectionProfile(kind)).not.toHaveProperty(
        'dragBehavior',
      );
      expect(demoTrackCollectionProfile(kind)).not.toHaveProperty('sortable');
    }

    const reordered = reorderDemoTrackCollectionColumn(
      'playlist',
      { visibleAdvanced: ['release', 'membership'] },
      'membership',
      'release',
      'before',
    );
    expect(reordered).toEqual({
      visibleAdvanced: ['release', 'membership'],
      hiddenDefaultColumns: [],
      widths: {},
      columnOrder: ['membership', 'release', 'usage', 'releaseYear'],
    });
    expect(demoTrackCollectionColumnRoles('playlist', reordered)).toEqual([
      'ordinal',
      'identity',
      'membership',
      'release',
      'duration',
      'actions',
    ]);

    expect(
      reorderDemoTrackCollectionColumn(
        'artist',
        {},
        'releaseYear',
        'release',
        'before',
      ),
    ).toEqual({
      visibleAdvanced: [],
      hiddenDefaultColumns: [],
      widths: {},
      columnOrder: ['usage', 'releaseYear', 'release', 'imported'],
    });
  });

  it('projects release, membership and local usage without overloading one context field', () => {
    expect(
      projectDemoTrackCollectionEntries(entries, 'library-all')[0],
    ).toMatchObject({
      ordinalText: '1',
      releaseText: 'THE BOOK',
      releaseYearText: '2020',
      membershipText: '2026/10/12',
      usageText: '1,234',
    });
    expect(
      projectDemoTrackCollectionEntries(entries, 'playlist')[0],
    ).toMatchObject({ ordinalText: '1' });
    expect(
      projectDemoTrackCollectionEntries(entries, 'album')[0],
    ).toMatchObject({ ordinalText: '2-3' });
  });

  it('keeps a missing release year empty instead of inferring it from collection dates', () => {
    const projected = projectDemoTrackCollectionEntries(
      [
        {
          ...entries[0],
          releaseYear: null,
          addedAtLabel: '2026/10/12',
        },
      ],
      'artist',
    )[0];

    expect(projected.releaseYearText).toBe('');
  });

  it.each([
    [
      'library-all',
      ['release', 'usage'],
      ['releaseYear', 'imported'],
      { identity: [304, 128], release: [224, 144] },
    ],
    [
      'library-local',
      ['release', 'usage'],
      ['releaseYear', 'imported'],
      { identity: [304, 128], release: [224, 144] },
    ],
    [
      'playlist',
      [],
      ['release', 'membership', 'usage', 'releaseYear'],
      { identity: [288, 128], membership: [128, 112] },
    ],
    [
      'album',
      ['usage'],
      ['imported'],
      { identity: [360, 128], usage: [104, 88] },
    ],
    [
      'artist',
      ['usage'],
      ['release', 'releaseYear', 'imported'],
      { identity: [288, 128], releaseYear: [96, 88] },
    ],
  ])(
    'defines default, advanced and width contracts for %s',
    (kind, defaultRoles, advancedRoles, widths) => {
      expect(
        demoTrackCollectionProfile(kind).semanticColumns.map(
          (column) => column.role,
        ),
      ).toEqual(defaultRoles);
      expect(
        demoTrackCollectionAdvancedColumns(kind).map((column) => column.role),
      ).toEqual(advancedRoles);
      for (const [role, [defaultWidth, minWidth]] of Object.entries(widths)) {
        expect(demoTrackCollectionColumnWidth(kind, role)).toMatchObject({
          defaultWidth,
          minWidth,
        });
      }
    },
  );

  it('normalizes sparse per-profile preferences through allowlisted advanced columns and bounded widths', () => {
    expect(
      normalizeDemoTrackCollectionPreferences('playlist', {
        visibleAdvanced: ['usage', 'releaseYear', 'imported', 'usage'],
        widths: {
          identity: 1000,
          release: 40,
          usage: 111.6,
          imported: 140,
          actions: 80,
          '--unsafe': 999,
        },
      }),
    ).toEqual({
      visibleAdvanced: ['usage', 'releaseYear'],
      hiddenDefaultColumns: [],
      widths: {
        identity: 720,
        release: 144,
        usage: 112,
      },
    });
  });

  it('normalizes a complete allowlisted semantic header order and keeps structural columns fixed', () => {
    expect(
      normalizeDemoTrackCollectionPreferences('playlist', {
        columnOrder: ['usage', 'ordinal', 'release', 'unsafe', 'usage'],
      }),
    ).toEqual({
      visibleAdvanced: [],
      hiddenDefaultColumns: [],
      widths: {},
      columnOrder: ['usage', 'release', 'membership', 'releaseYear'],
    });

    expect(
      demoTrackCollectionColumnRoles('playlist', {
        visibleAdvanced: ['usage', 'releaseYear'],
        columnOrder: ['usage', 'release', 'membership', 'releaseYear'],
      }),
    ).toEqual([
      'ordinal',
      'identity',
      'usage',
      'releaseYear',
      'duration',
      'actions',
    ]);
  });

  it('declares locked Artist and Album defaults while Playlist choices stay toggleable in Spotify order', () => {
    expect(
      demoTrackCollectionColumnChoices('artist').map(
        ({ role, label, defaultVisible, locked }) => ({
          role,
          label,
          defaultVisible,
          locked,
        }),
      ),
    ).toEqual([
      {
        role: 'usage',
        label: '播放次數',
        defaultVisible: true,
        locked: true,
      },
      {
        role: 'release',
        label: '專輯',
        defaultVisible: false,
        locked: false,
      },
      {
        role: 'releaseYear',
        label: '發行年份',
        defaultVisible: false,
        locked: false,
      },
      {
        role: 'imported',
        label: '匯入日期',
        defaultVisible: false,
        locked: false,
      },
    ]);
    expect(
      demoTrackCollectionColumnChoices('album').map(
        ({ role, defaultVisible, locked }) => ({
          role,
          defaultVisible,
          locked,
        }),
      ),
    ).toEqual([
      { role: 'usage', defaultVisible: true, locked: true },
      { role: 'imported', defaultVisible: false, locked: false },
    ]);
    expect(
      demoTrackCollectionColumnChoices('playlist').map(
        ({ role, defaultVisible, locked }) => ({
          role,
          defaultVisible,
          locked,
        }),
      ),
    ).toEqual([
      { role: 'release', defaultVisible: false, locked: false },
      { role: 'membership', defaultVisible: false, locked: false },
      { role: 'usage', defaultVisible: false, locked: false },
      { role: 'releaseYear', defaultVisible: false, locked: false },
    ]);
  });

  it('keeps Playlist fields opt-in and rejects hiding locked Artist and Album defaults', () => {
    expect(
      normalizeDemoTrackCollectionPreferences('playlist', {
        hiddenDefaultColumns: ['membership', 'release', 'usage', 'release'],
      }),
    ).toEqual({
      visibleAdvanced: [],
      hiddenDefaultColumns: [],
      widths: {},
    });
    expect(
      demoTrackCollectionColumnRoles('playlist', {
        hiddenDefaultColumns: ['release'],
      }),
    ).toEqual(['ordinal', 'identity', 'duration', 'actions']);
    expect(
      normalizeDemoTrackCollectionPreferences('artist', {
        hiddenDefaultColumns: ['release', 'releaseYear'],
      }).hiddenDefaultColumns,
    ).toEqual([]);
    expect(
      normalizeDemoTrackCollectionPreferences('album', {
        hiddenDefaultColumns: ['usage'],
      }).hiddenDefaultColumns,
    ).toEqual([]);
    expect(
      demoTrackCollectionProfile('playlist').canReorderPlaylistTracks,
    ).toBe(true);
  });

  it('inserts enabled advanced columns in profile order without changing the profile defaults', () => {
    const preferences = {
      visibleAdvanced: ['usage', 'releaseYear'],
      widths: {},
    };

    expect(demoTrackCollectionColumnRoles('playlist', preferences)).toEqual([
      'ordinal',
      'identity',
      'usage',
      'releaseYear',
      'duration',
      'actions',
    ]);
    expect(demoTrackCollectionProfile('playlist').semanticColumns).toHaveLength(
      0,
    );
  });

  it('projects imported dates as provenance without overloading playlist membership', () => {
    const projected = projectDemoTrackCollectionEntries(
      [
        {
          ...entries[0],
          importedAt: '2026-10-04T12:00:00.000Z',
          addedAtLabel: '2026/10/12',
        },
      ],
      'library-all',
    )[0];

    expect(projected).toMatchObject({
      importedText: '2026/10/04',
      membershipText: '2026/10/12',
    });
  });
});
