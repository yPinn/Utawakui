import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PERFORMANCE_SESSION_PLAN_FILENAME,
  PERFORMANCE_SESSION_PLAN_PASTE_LIMIT,
  PerformanceSessionPlanValidationError,
  createPerformanceSessionPlanStore,
} from './performanceSessionPlan.js';

function libraryTracks(...tracks) {
  return new Map(tracks.map((track) => [track.id, track]));
}

function track(id, title, artist = '') {
  return { id, title, artist };
}

describe('createPerformanceSessionPlanStore', () => {
  let dir;
  let idSequence;
  let store;

  beforeEach(() => {
    dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-performance-session-plan-'),
    );
    idSequence = 0;
    store = createPerformanceSessionPlanStore({
      directory: dir,
      now: () => new Date('2026-10-02T08:00:00.000Z'),
      createId: () => `item-${++idSequence}`,
    });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('appends the same track as independent queued occurrences without changing the playing item', () => {
    const tracks = libraryTracks(track('a', 'A'));
    store.ensureSession(tracks);
    const first = store.appendLibraryTrack('a', tracks).items[0];
    store.setProgress(
      {
        itemId: first.itemId,
        expectedProgressRevision: 0,
        progress: 'playing',
      },
      tracks,
    );
    const before = store.getProjected(tracks);
    store.appendLibraryTrack('a', tracks);
    const after = store.appendLibraryTrack('a', tracks);
    expect(after.items.map((i) => i.trackId)).toEqual(['a', 'a', 'a']);
    expect(new Set(after.items.map((i) => i.itemId)).size).toBe(3);
    expect(after.items[0]).toEqual(before.items[0]);
    expect(after.items.slice(1).map((i) => i.progress)).toEqual([
      'queued',
      'queued',
    ]);
    expect(after.sessionId).toBe(before.sessionId);
    expect(after.timeline).toEqual(before.timeline);
    // Single-track append retains the existing editor behavior: select the new
    // occurrence for review. The playback occurrence remains untouched.
    expect(after.reviewCursorItemId).toBe(after.items[2].itemId);
  });
  it('atomically appends ordered collection occurrences during a performance without replacing current data', () => {
    const tracks = libraryTracks(track('a', 'A'), track('b', 'B'));
    store.ensureSession(tracks);
    const old = store.appendLibraryTrack('a', tracks).items[0];
    store.setProgress(
      { itemId: old.itemId, expectedProgressRevision: 0, progress: 'playing' },
      tracks,
    );
    store.appendManualItem({ displayTitle: 'Manual' }, tracks);
    const before = store.getProjected(tracks);
    const result = store.appendFromCollection({
      collection: {
        id: 'p',
        name: 'Songs',
        kind: 'playlist',
        trackIds: ['a', 'a', 'b'],
      },
      tracksById: tracks,
    });
    expect(result.items.slice(0, 2)).toEqual(before.items);
    expect(result.items.slice(2).map((i) => i.trackId)).toEqual([
      'a',
      'a',
      'b',
    ]);
    expect(new Set(result.items.map((i) => i.itemId)).size).toBe(5);
    expect(result.sessionId).toBe(before.sessionId);
    expect(result.source).toEqual(before.source);
    expect(result.reviewCursorItemId).toBe(before.reviewCursorItemId);
    const bytes = fs.readFileSync(
      path.join(dir, PERFORMANCE_SESSION_PLAN_FILENAME),
    );
    expect(() =>
      store.appendFromCollection({
        collection: {
          id: 'p',
          name: 'Too many',
          kind: 'playlist',
          trackIds: Array(500).fill('a'),
        },
        tracksById: tracks,
      }),
    ).toThrow(PerformanceSessionPlanValidationError);
    expect(
      fs.readFileSync(path.join(dir, PERFORMANCE_SESSION_PLAN_FILENAME)),
    ).toEqual(bytes);
  });

  it('returns an inactive empty draft when no file exists', () => {
    expect(store.getProjected(libraryTracks())).toEqual({
      version: 1,
      updatedAt: null,
      source: null,
      reviewCursorItemId: null,
      items: [],
      summary: {
        total: 0,
        verified: 0,
        unreviewed: 0,
        manual: 0,
        needsLink: 0,
        unavailable: 0,
        sourceChanged: 0,
        ready: 0,
        needsAttention: 0,
      },
    });
  });

  it('imports a collection in canonical member order and persists only scalar snapshots', () => {
    const tracks = libraryTracks(
      track('t-1', 'First', 'A'),
      track('t-2', 'Second', 'B'),
    );

    const plan = store.replaceFromCollection({
      collection: {
        id: 'playlist-1',
        name: '直播歌單',
        kind: 'playlist',
        trackIds: ['t-2', 't-1'],
      },
      tracksById: tracks,
      replaceCurrent: false,
    });

    expect(plan.source).toEqual({
      id: 'playlist-1',
      name: '直播歌單',
      kind: 'playlist',
    });
    expect(plan.items.map((item) => item.trackId)).toEqual(['t-2', 't-1']);
    expect(plan.items.map((item) => item.displayTitle)).toEqual([
      'Second',
      'First',
    ]);
    expect(plan.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: 'library-track',
          verification: 'verified',
          status: 'ready',
          ready: true,
        }),
      ]),
    );
    expect(plan.summary).toMatchObject({ ready: 2, needsAttention: 0 });
    expect(plan.reviewCursorItemId).toBe('item-1');

    const persisted = JSON.parse(
      fs.readFileSync(
        path.join(dir, PERFORMANCE_SESSION_PLAN_FILENAME),
        'utf8',
      ),
    );
    expect(JSON.stringify(persisted)).not.toContain('utawakui-media:');
    expect(JSON.stringify(persisted)).not.toContain('filename');
    expect(store.getProjected(tracks).items.map((item) => item.itemId)).toEqual(
      ['item-1', 'item-2'],
    );
  });

  it('projects a version-1 linked draft as ready even when it predates explicit item modes', () => {
    fs.writeFileSync(
      path.join(dir, PERFORMANCE_SESSION_PLAN_FILENAME),
      JSON.stringify({
        version: 1,
        updatedAt: '2026-10-02T07:00:00.000Z',
        source: null,
        reviewCursorItemId: 'legacy-item',
        items: [
          {
            itemId: 'legacy-item',
            trackId: 't-1',
            displayTitle: 'Legacy title',
            displayArtist: '',
            verification: 'unreviewed',
            origin: 'collection',
            sourceSnapshot: null,
            revision: 1,
          },
        ],
      }),
    );

    expect(
      store.getProjected(libraryTracks(track('t-1', 'Library title'))).items[0],
    ).toMatchObject({
      mode: 'library-track',
      status: 'ready',
      ready: true,
    });
  });

  it('requires explicit replacement when a current draft already contains items', () => {
    const tracks = libraryTracks(track('t-1', 'First'));
    store.replaceFromCollection({
      collection: {
        id: 'playlist-1',
        name: 'First list',
        kind: 'playlist',
        trackIds: ['t-1'],
      },
      tracksById: tracks,
    });

    expect(() =>
      store.replaceFromCollection({
        collection: {
          id: 'playlist-2',
          name: 'Second list',
          kind: 'playlist',
          trackIds: ['t-1'],
        },
        tracksById: tracks,
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_REPLACE_REQUIRED' }),
    );

    const replaced = store.replaceFromCollection({
      collection: {
        id: 'playlist-2',
        name: 'Second list',
        kind: 'playlist',
        trackIds: ['t-1'],
      },
      tracksById: tracks,
      replaceCurrent: true,
    });
    expect(replaced.source.id).toBe('playlist-2');
  });

  it('turns each nonblank pasted line into an unlinked item without guessing artist syntax', () => {
    const plan = store.appendPlaceholders(
      '  Song A - Artist A  \n\nSong A - Artist A\r\n曲名 B  ',
      libraryTracks(),
    );

    expect(plan.items).toHaveLength(3);
    expect(plan.items.map((item) => item.displayTitle)).toEqual([
      'Song A - Artist A',
      'Song A - Artist A',
      '曲名 B',
    ]);
    expect(plan.items.every((item) => item.trackId === null)).toBe(true);
    expect(plan.items.every((item) => item.mode === 'placeholder')).toBe(true);
    expect(plan.summary.needsLink).toBe(3);
    expect(plan.summary.needsAttention).toBe(3);
  });

  it('appends a library track ready from canonical metadata and a manual external item without mixing in BGM', () => {
    const tracks = libraryTracks(track('t-1', 'Library title', 'Singer'));

    let plan = store.appendLibraryTrack('t-1', tracks);
    expect(plan.items[0]).toMatchObject({
      mode: 'library-track',
      trackId: 't-1',
      displayTitle: 'Library title',
      displayArtist: 'Singer',
      verification: 'verified',
      sourceSnapshot: { title: 'Library title', artist: 'Singer' },
      status: 'ready',
      ready: true,
    });

    plan = store.appendManualItem(
      { displayTitle: 'Acoustic interlude', displayArtist: 'Guest' },
      tracks,
    );
    expect(plan.items[1]).toMatchObject({
      mode: 'manual',
      trackId: null,
      displayTitle: 'Acoustic interlude',
      displayArtist: 'Guest',
      status: 'manual',
      ready: true,
    });
    expect(plan.summary).toMatchObject({
      total: 2,
      ready: 2,
      manual: 1,
      needsAttention: 0,
    });
    expect(JSON.stringify(plan)).not.toContain('bgm');
  });

  it('rejects unavailable or unsafe library fast-path track ids', () => {
    expect(() =>
      store.appendLibraryTrack('../private.wav', libraryTracks()),
    ).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_INTENT_INVALID' }),
    );
    expect(() =>
      store.appendLibraryTrack('missing', libraryTracks()),
    ).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_TRACK_UNAVAILABLE' }),
    );
  });

  it('rejects non-text paste intents and treats blank text as a persistence no-op', () => {
    expect(() => store.appendPlaceholders(null, libraryTracks())).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_INTENT_INVALID' }),
    );

    const unchanged = store.appendPlaceholders(' \n\r\n ', libraryTracks());
    expect(unchanged.items).toEqual([]);
    expect(unchanged.updatedAt).toBeNull();
    expect(
      fs.existsSync(path.join(dir, PERFORMANCE_SESSION_PLAN_FILENAME)),
    ).toBe(false);

    expect(() =>
      store.appendPlaceholders(
        'x'.repeat(PERFORMANCE_SESSION_PLAN_PASTE_LIMIT + 1),
        libraryTracks(),
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_ITEM_LIMIT_EXCEEDED' }),
    );
  });

  it('rejects overlong labels and draft overflow before changing the saved document', () => {
    expect(() =>
      store.appendPlaceholders('x'.repeat(201), libraryTracks()),
    ).toThrowError(
      expect.objectContaining({
        code: 'SESSION_PLAN_DISPLAY_TITLE_TOO_LONG',
        field: 'displayTitle',
      }),
    );
    expect(
      fs.existsSync(path.join(dir, PERFORMANCE_SESSION_PLAN_FILENAME)),
    ).toBe(false);

    store.appendPlaceholders(
      Array.from({ length: 500 }, (_, index) => `Song ${index + 1}`).join('\n'),
      libraryTracks(),
    );
    expect(() =>
      store.appendPlaceholders('One more', libraryTracks()),
    ).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_ITEM_LIMIT_EXCEEDED' }),
    );
    expect(store.getProjected(libraryTracks()).items).toHaveLength(500);
  });

  it('rejects an oversized source collection instead of silently truncating its canonical order', () => {
    const trackIds = Array.from({ length: 501 }, (_, index) => `t-${index}`);

    expect(() =>
      store.replaceFromCollection({
        collection: {
          id: 'playlist-1',
          name: 'Oversized list',
          kind: 'playlist',
          trackIds,
        },
        tracksById: libraryTracks(),
      }),
    ).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_ITEM_LIMIT_EXCEEDED' }),
    );
    expect(store.getProjected(libraryTracks()).items).toEqual([]);
  });

  it('links, verifies, snapshots source metadata and reports later source changes', () => {
    const initialTracks = libraryTracks(
      track('t-1', 'Library title', 'Singer'),
    );
    const [placeholder] = store.appendPlaceholders(
      'Public title',
      initialTracks,
    ).items;

    const verified = store.updateItem(
      {
        itemId: placeholder.itemId,
        expectedRevision: placeholder.revision,
        displayTitle: 'Public title',
        displayArtist: 'Guest',
        trackId: 't-1',
        verify: true,
      },
      initialTracks,
    );

    expect(verified.items[0]).toMatchObject({
      mode: 'library-track',
      verification: 'verified',
      availability: 'playable',
      ready: true,
      status: 'ready',
      sourceChanged: false,
      sourceSnapshot: { title: 'Library title', artist: 'Singer' },
    });
    expect(verified.summary.ready).toBe(1);

    const changed = store.getProjected(
      libraryTracks(track('t-1', 'Renamed in library', 'Singer')),
    );
    expect(changed.items[0]).toMatchObject({
      verification: 'verified',
      ready: true,
      status: 'source-changed',
      sourceChanged: true,
    });
    expect(changed.summary.needsAttention).toBe(0);
  });

  it('keeps a ready library item ready when only its session display text changes', () => {
    const canonicalTrack = track('t-1', 'Library title', 'Singer');
    const canonicalSnapshot = structuredClone(canonicalTrack);
    const tracks = libraryTracks(canonicalTrack);
    const [item] = store.appendLibraryTrack('t-1', tracks).items;

    const edited = store.updateItem(
      {
        itemId: item.itemId,
        expectedRevision: item.revision,
        displayTitle: 'Tonight only',
        displayArtist: 'Special guest',
      },
      tracks,
    );

    expect(edited.items[0]).toMatchObject({
      mode: 'library-track',
      displayTitle: 'Tonight only',
      displayArtist: 'Special guest',
      verification: 'verified',
      status: 'ready',
      ready: true,
      sourceSnapshot: { title: 'Library title', artist: 'Singer' },
      linkedTrack: {
        id: 't-1',
        title: 'Library title',
        artist: 'Singer',
      },
    });
    expect(canonicalTrack).toEqual(canonicalSnapshot);
  });

  it('rejects verification without a playable link and stale revision writes', () => {
    const [item] = store.appendPlaceholders('Song', libraryTracks()).items;

    expect(() =>
      store.updateItem(
        {
          itemId: item.itemId,
          expectedRevision: item.revision,
          displayTitle: 'Song',
          trackId: null,
          verify: true,
        },
        libraryTracks(),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'SESSION_PLAN_TRACK_REQUIRED',
        field: 'trackId',
      }),
    );

    const saved = store.updateItem(
      {
        itemId: item.itemId,
        expectedRevision: item.revision,
        displayTitle: 'Edited',
        trackId: null,
      },
      libraryTracks(),
    );
    expect(saved.items[0].revision).toBe(item.revision + 1);

    expect(() =>
      store.updateItem(
        {
          itemId: item.itemId,
          expectedRevision: item.revision,
          displayTitle: 'Stale edit',
        },
        libraryTracks(),
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_STALE_REVISION' }),
    );
  });

  it('rejects malformed update intents, unsafe links and unavailable library tracks', () => {
    const [entry] = store.appendPlaceholders('Song', libraryTracks()).items;

    expect(() => store.updateItem(null, libraryTracks())).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_INTENT_INVALID' }),
    );
    expect(() =>
      store.updateItem(
        {
          itemId: entry.itemId,
          expectedRevision: entry.revision,
          trackId: '../private.wav',
        },
        libraryTracks(),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'SESSION_PLAN_INTENT_INVALID',
        field: 'trackId',
      }),
    );
    expect(() =>
      store.updateItem(
        {
          itemId: entry.itemId,
          expectedRevision: entry.revision,
          trackId: 'missing-track',
        },
        libraryTracks(),
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_TRACK_UNAVAILABLE' }),
    );
  });

  it('duplicates an occurrence independently and supports bounded move/remove cursor updates', () => {
    let plan = store.appendPlaceholders('One\nTwo\nThree', libraryTracks());
    const second = plan.items[1];

    plan = store.duplicateItem(second.itemId, libraryTracks());
    expect(plan.items.map((item) => item.displayTitle)).toEqual([
      'One',
      'Two',
      'Two',
      'Three',
    ]);
    expect(plan.items[2]).toMatchObject({
      origin: 'duplicate',
      verification: 'unreviewed',
      revision: 1,
    });
    expect(plan.items[2].itemId).not.toBe(second.itemId);

    plan = store.moveItem(
      { itemId: plan.items[2].itemId, offset: 1 },
      libraryTracks(),
    );
    expect(plan.items.map((item) => item.displayTitle)).toEqual([
      'One',
      'Two',
      'Three',
      'Two',
    ]);

    plan = store.setReviewCursor(plan.items[3].itemId, libraryTracks());
    plan = store.removeItem(plan.items[3].itemId, libraryTracks());
    expect(plan.reviewCursorItemId).toBe(plan.items[2].itemId);
  });

  it('keeps boundary moves and repeated cursor selection as no-op projections', () => {
    const plan = store.appendPlaceholders('One\nTwo', libraryTracks());
    const first = plan.items[0];

    const boundary = store.moveItem(
      { itemId: first.itemId, offset: -1 },
      libraryTracks(),
    );
    expect(boundary.items.map((entry) => entry.displayTitle)).toEqual([
      'One',
      'Two',
    ]);
    expect(boundary.updatedAt).toBe(plan.updatedAt);

    const sameCursor = store.setReviewCursor(first.itemId, libraryTracks());
    expect(sameCursor.updatedAt).toBe(plan.updatedAt);
    expect(() =>
      store.moveItem({ itemId: first.itemId, offset: 2 }, libraryTracks()),
    ).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_INTENT_INVALID' }),
    );
    expect(() =>
      store.setReviewCursor('missing-item', libraryTracks()),
    ).toThrowError(
      expect.objectContaining({ code: 'SESSION_PLAN_ITEM_NOT_FOUND' }),
    );
  });

  it('unlinks every occurrence of a deleted track without deleting the authored labels', () => {
    const tracks = libraryTracks(track('t-1', 'Library title'));
    const plan = store.replaceFromCollection({
      collection: {
        id: 'playlist-1',
        name: 'List',
        kind: 'playlist',
        trackIds: ['t-1'],
      },
      tracksById: tracks,
    });
    store.duplicateItem(plan.items[0].itemId, tracks);

    const changed = store.unlinkTrack('t-1', libraryTracks());

    expect(changed).toBe(true);
    const projected = store.getProjected(libraryTracks());
    expect(projected.items).toHaveLength(2);
    expect(
      projected.items.every(
        (item) =>
          item.trackId === null &&
          item.mode === 'placeholder' &&
          item.displayTitle === 'Library title' &&
          item.verification === 'unreviewed',
      ),
    ).toBe(true);
  });

  it('keeps invalid or unrelated unlink requests as no-ops and clears explicitly', () => {
    const tracks = libraryTracks(track('t-1', 'Library title'));
    store.replaceFromCollection({
      collection: {
        id: 'playlist-1',
        name: 'List',
        kind: 'playlist',
        trackIds: ['t-1'],
      },
      tracksById: tracks,
    });

    expect(store.unlinkTrack('../private.wav')).toBe(false);
    expect(store.unlinkTrack('other-track')).toBe(false);
    expect(store.clear(tracks)).toMatchObject({
      source: null,
      reviewCursorItemId: null,
      items: [],
    });
    const clearedAgain = store.clear(tracks);
    expect(clearedAgain.items).toEqual([]);
  });

  it('backs up a corrupt document and keeps the draft recoverable as empty', () => {
    const filePath = path.join(dir, PERFORMANCE_SESSION_PLAN_FILENAME);
    fs.writeFileSync(filePath, '{bad json');

    expect(store.getProjected(libraryTracks()).items).toEqual([]);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(
      fs
        .readdirSync(dir)
        .filter((name) =>
          name.startsWith(`${PERFORMANCE_SESSION_PLAN_FILENAME}.corrupted-`),
        ),
    ).toHaveLength(1);
  });

  it('exposes a bounded validation error type for expected user corrections', () => {
    const error = new PerformanceSessionPlanValidationError({
      code: 'SESSION_PLAN_TEST',
      message: '可修正的錯誤',
      field: 'displayTitle',
    });

    expect(error).toMatchObject({
      code: 'SESSION_PLAN_TEST',
      field: 'displayTitle',
      message: '可修正的錯誤',
    });
  });
});
