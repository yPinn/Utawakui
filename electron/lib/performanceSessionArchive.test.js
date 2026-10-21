import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPerformanceSessionPlanStore } from './performanceSessionPlan.js';
import { loadPlaylists, savePerformancePlaylist } from './playlists.js';

let directory, store;
const tracks = new Map([
  ['song', { id: 'song', title: 'Song', artist: 'Artist', url: 'private-url' }],
]);
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-session-'));
  store = createPerformanceSessionPlanStore({ directory });
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});
function prepare() {
  store.appendLibraryTrack('song', tracks);
  store.appendLibraryTrack('song', tracks);
  store.appendManualItem({ displayTitle: 'Manual', displayArtist: '' }, tracks);
  return store.ensureSession(tracks);
}
describe('explicit performance session archive', () => {
  it('atomically appends an archive repeatedly as fresh occurrences during playback, preserving manual entries and all current state', () => {
    const original = prepare();
    const [first, second] = original.items;
    store.setProgress(
      {
        itemId: first.itemId,
        expectedProgressRevision: 0,
        progress: 'playing',
      },
      tracks,
    );
    store.setProgress(
      {
        itemId: first.itemId,
        expectedProgressRevision: 1,
        progress: 'completed',
      },
      tracks,
    );
    store.setProgress(
      {
        itemId: second.itemId,
        expectedProgressRevision: 0,
        progress: 'skipped',
      },
      tracks,
    );
    store.archiveSession(
      { sessionId: original.sessionId, name: 'Repeat and MC' },
      tracks,
    );
    const archive = store.getSession(original.sessionId, tracks);
    const current = store.appendLibraryTrack('song', tracks).items[0];
    store.setProgress(
      {
        itemId: current.itemId,
        expectedProgressRevision: 0,
        progress: 'playing',
      },
      tracks,
    );
    store.appendManualItem({ displayTitle: 'Existing pending' }, tracks);
    const before = store.getProjected(tracks);
    for (let round = 1; round <= 2; round++) {
      const result = store.appendFromArchive(original.sessionId, tracks);
      expect(result.items.slice(0, before.items.length)).toEqual(before.items);
      const added = result.items.slice(
        before.items.length + (round - 1) * archive.items.length,
      );
      expect(
        added.map((i) => [
          i.mode,
          i.trackId,
          i.displayTitle,
          i.displayArtist,
          i.sourceSnapshot,
        ]),
      ).toEqual(
        archive.items.map((i) => [
          i.mode,
          i.trackId,
          i.displayTitle,
          i.displayArtist,
          i.sourceSnapshot,
        ]),
      );
      expect(
        added.every(
          (i) =>
            i.progress === 'queued' &&
            i.progressRevision === 0 &&
            i.revision === 1 &&
            i.progressUpdatedAt === null,
        ),
      ).toBe(true);
      expect(new Set(result.items.map((i) => i.itemId)).size).toBe(
        result.items.length,
      );
      expect(
        result.items
          .filter((i) => i.progress === 'playing')
          .map((i) => i.itemId),
      ).toEqual([current.itemId]);
      for (const key of [
        'sessionId',
        'source',
        'reviewCursorItemId',
        'timeline',
        'archives',
      ])
        expect(result[key]).toEqual(before[key]);
      expect(store.getSession(original.sessionId, tracks)).toEqual(archive);
    }
    const file = path.join(directory, 'performance-session-plan.json');
    const bytes = fs.readFileSync(file);
    expect(() => store.appendFromArchive(before.sessionId, tracks)).toThrow(
      '找不到這個封存場次',
    );
    expect(() =>
      store.appendFromArchive({ sessionId: original.sessionId }, tracks),
    ).toThrow();
    expect(fs.readFileSync(file)).toEqual(bytes);
    const count = store.getProjected(tracks).items.length;
    store.appendPlaceholders(
      Array(500 - count)
        .fill('Pending')
        .join('\n'),
      tracks,
    );
    const full = fs.readFileSync(file);
    expect(() => store.appendFromArchive(original.sessionId, tracks)).toThrow(
      '500',
    );
    expect(fs.readFileSync(file)).toEqual(full);
  });
  it('projects bounded unique canonical cover ids without collapsing archived occurrences', () => {
    const available = new Map(
      Array.from({ length: 7 }, (_, i) => [
        `song-${i}`,
        { id: `song-${i}`, title: `Song ${i}` },
      ]),
    );
    for (const id of [
      'song-0',
      'song-0',
      'song-1',
      'song-2',
      'song-3',
      'song-4',
    ])
      store.appendLibraryTrack(id, available);
    store.appendManualItem({ displayTitle: 'Manual' }, available);
    const plan = store.ensureSession(available);
    const result = store.archiveSession(
      { sessionId: plan.sessionId, name: 'Cover show' },
      available,
    );
    expect(result.archives[0].coverTrackIds).toEqual([
      'song-0',
      'song-1',
      'song-2',
      'song-3',
    ]);
    expect(store.getSession(plan.sessionId, available).items).toHaveLength(7);
  });
  it('preserves a deliberate opening marker before the first song, even with no arranged tracks yet', () => {
    const plan = store.ensureSession(tracks);
    const marker = {
      id: 'opening',
      type: 'marker',
      label: 'Opening MC',
      occurredAt: '2026-10-21T01:00:00Z',
      stream: { timecode: '00:00:30.000', durationMs: 30000 },
      record: null,
    };
    store.recordMarker(marker, plan.sessionId);
    expect(store.getSession(plan.sessionId, tracks).timeline).toEqual([marker]);
    store.archiveSession(
      { sessionId: plan.sessionId, name: 'Opening' },
      tracks,
    );
    expect(store.getSession(plan.sessionId, tracks).timeline).toEqual([marker]);
  });
  it('keeps manual occurrences, markers and offline clocks in the selected archive after restarting', () => {
    const plan = prepare(),
      item = plan.items[2];
    const observation = store.preparePerformanceStart(
      { itemId: item.itemId, expectedProgressRevision: 0 },
      tracks,
    );
    expect(observation.track.id).toBe(`manual-${item.itemId}`);
    const entry = {
      id: 'manual-start',
      type: 'track',
      itemId: item.itemId,
      title: 'Manual',
      artist: '',
      trackId: observation.track.id,
      occurredAt: '2026-10-21T01:00:00Z',
      stream: null,
      record: null,
    };
    store.setProgress(
      { itemId: item.itemId, expectedProgressRevision: 0, progress: 'playing' },
      tracks,
      entry,
    );
    const marker = {
      id: 'marker',
      type: 'marker',
      label: 'MC',
      occurredAt: '2026-10-21T01:02:00Z',
      stream: { timecode: '00:05:00.000', durationMs: 300000 },
      record: null,
    };
    store.recordMarker(marker, plan.sessionId);
    store.recordMarker(marker, plan.sessionId);
    store.recordMarker({ ...marker, id: 'stale' }, 'different-session');
    store.setProgress(
      {
        itemId: item.itemId,
        expectedProgressRevision: 1,
        progress: 'completed',
      },
      tracks,
    );
    store.archiveSession(
      { sessionId: plan.sessionId, name: 'Manual show' },
      tracks,
    );
    store = createPerformanceSessionPlanStore({ directory });
    expect(store.getSession(plan.sessionId, tracks).timeline).toEqual([
      entry,
      marker,
    ]);
    expect(() => store.getSession('unknown', tracks)).toThrow('找不到');
    expect(() =>
      store.preparePerformanceStart(
        { itemId: item.itemId, expectedProgressRevision: 0 },
        tracks,
      ),
    ).toThrow();
  });
  it('previews completion order, excludes missing/placeholder items and rejects changed availability', () => {
    const plan = prepare();
    const second = plan.items[1];
    store.setProgress(
      {
        itemId: second.itemId,
        expectedProgressRevision: 0,
        progress: 'playing',
      },
      tracks,
    );
    store.setProgress(
      {
        itemId: second.itemId,
        expectedProgressRevision: 1,
        progress: 'completed',
      },
      tracks,
    );
    store.appendPlaceholders('Unlinked', tracks);
    const completed = store.previewPlaylist(
      { sessionId: plan.sessionId, scope: 'completed' },
      tracks,
    );
    expect(completed).toMatchObject({
      total: 1,
      savedCount: 1,
      mergedCount: 0,
      manualCount: 0,
    });
    expect(() => store.verifyPlaylistPreview(completed, new Map())).toThrow(
      '變更',
    );
    expect(
      store.previewPlaylist(
        { sessionId: plan.sessionId, scope: 'all' },
        new Map(),
      ),
    ).toMatchObject({
      total: 4,
      unavailableCount: 3,
      manualCount: 1,
      savedCount: 0,
    });
    const empty = store.previewPlaylist(
      { sessionId: plan.sessionId, scope: 'completed' },
      new Map(),
    );
    expect(() => store.verifyPlaylistPreview(empty, new Map())).toThrow(
      '沒有可保存',
    );
  });
  it('fails closed on malformed archives, preserving the original file', () => {
    prepare();
    const file = path.join(directory, 'performance-session-plan.json');
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    value.archives = [
      { id: 'invalid', name: 'Show', endedAt: 'bad', items: [], timeline: [] },
    ];
    const raw = JSON.stringify(value);
    fs.writeFileSync(file, raw);
    expect(() => store.getProjected(tracks)).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe(raw);
    value.items = null;
    const broken = JSON.stringify(value);
    fs.writeFileSync(file, broken);
    expect(() => store.ensureSession(tracks)).toThrow('原檔已保留');
    expect(fs.readFileSync(file, 'utf8')).toBe(broken);
  });
  it('refuses empty, stale, oversized, malformed and over-capacity archives without rotating current identity', () => {
    const empty = store.ensureSession(tracks);
    expect(() =>
      store.archiveSession(
        { sessionId: empty.sessionId, name: 'Empty' },
        tracks,
      ),
    ).toThrow('沒有');
    const p = prepare();
    for (const intent of [
      { sessionId: 'stale', name: 'Show' },
      { sessionId: p.sessionId, name: '' },
      { sessionId: p.sessionId, name: 'a'.repeat(201) },
    ])
      expect(() => store.archiveSession(intent, tracks)).toThrow();
    const file = path.join(directory, 'performance-session-plan.json'),
      value = JSON.parse(fs.readFileSync(file, 'utf8'));
    value.archives = Array.from({ length: 100 }, (_, i) => ({
      id: `archive-${i}`,
      name: `Show ${i}`,
      startedAt: null,
      endedAt: '2026-10-21T00:00:00Z',
      source: null,
      items: [],
      timeline: [],
    }));
    fs.writeFileSync(file, JSON.stringify(value));
    expect(() =>
      store.archiveSession({ sessionId: p.sessionId, name: 'Full' }, tracks),
    ).toThrow('上限');
    expect(store.getProjected(tracks).sessionId).toBe(p.sessionId);
  });
  it('does not leave an empty playlist on atomic-write failure and rejects invalid export intents', () => {
    const options = {
      name: 'Show',
      trackIds: ['song'],
      exportKey: 'a'.repeat(64),
    };
    const original = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((...args) => {
      if (args[1] === path.join(directory, 'playlists.json'))
        throw new Error('disk failure');
      return original(...args);
    });
    expect(() => savePerformancePlaylist(directory, options)).toThrow();
    vi.restoreAllMocks();
    expect(loadPlaylists(directory)).toEqual([]);
    for (const patch of [
      { name: '' },
      { trackIds: [] },
      { exportKey: 'invalid' },
    ])
      expect(() =>
        savePerformancePlaylist(directory, { ...options, ...patch }),
      ).toThrow();
  });
  it('atomically seals all occurrences and timeline, rotates current identity, and is idempotent after restart', () => {
    const plan = prepare(),
      id = plan.items[0].itemId;
    store.setProgress(
      { itemId: id, expectedProgressRevision: 0, progress: 'playing' },
      tracks,
      {
        id: 'performance-1',
        type: 'track',
        itemId: id,
        title: 'Song',
        artist: 'Artist',
        trackId: 'song',
        occurredAt: '2026-10-21T01:00:00.000Z',
        stream: { timecode: '00:02:00.000', durationMs: 120000 },
        record: null,
      },
    );
    expect(() =>
      store.archiveSession(
        { sessionId: plan.sessionId, name: 'Night' },
        tracks,
      ),
    ).toThrow();
    store.setProgress(
      { itemId: id, expectedProgressRevision: 1, progress: 'completed' },
      tracks,
    );
    const next = store.archiveSession(
      { sessionId: plan.sessionId, name: 'Night' },
      tracks,
    );
    expect(next.items).toEqual([]);
    expect(next.sessionId).not.toBe(plan.sessionId);
    expect(next.archives).toHaveLength(1);
    store = createPerformanceSessionPlanStore({ directory });
    const archive = store.getSession(plan.sessionId, tracks);
    expect(archive.items).toHaveLength(3);
    expect(archive.timeline[0].stream.timecode).toBe('00:02:00.000');
    expect(JSON.stringify(archive)).not.toContain('private-url');
    store.appendLibraryTrack('song', tracks);
    const retry = store.archiveSession(
      { sessionId: plan.sessionId, name: 'Night' },
      tracks,
    );
    expect(retry.items).toHaveLength(1);
    expect(retry.archives).toHaveLength(1);
  });
  it('leaves the current session intact when the archive atomic rename fails', () => {
    const plan = prepare();
    const original = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((...args) => {
      if (args[1] === path.join(directory, 'performance-session-plan.json'))
        throw Object.assign(new Error('disk failure'), { code: 'EIO' });
      return original(...args);
    });
    expect(() =>
      store.archiveSession(
        { sessionId: plan.sessionId, name: 'Night' },
        tracks,
      ),
    ).toThrow();
    vi.restoreAllMocks();
    expect(store.getProjected(tracks).items).toHaveLength(3);
    expect(store.getProjected(tracks).archives).toHaveLength(0);
  });
  it('previews deduplication and manual exclusions, and rejects a changed scope or source before saving', () => {
    const plan = prepare();
    const preview = store.previewPlaylist(
      { sessionId: plan.sessionId, scope: 'all' },
      tracks,
    );
    expect(preview).toMatchObject({
      trackIds: ['song'],
      total: 3,
      savedCount: 1,
      mergedCount: 1,
      manualCount: 1,
      unavailableCount: 0,
    });
    store.appendLibraryTrack('song', tracks);
    expect(() => store.verifyPlaylistPreview({ ...preview }, tracks)).toThrow();
    expect(() =>
      store.previewPlaylist(
        { sessionId: plan.sessionId, scope: 'unknown' },
        tracks,
      ),
    ).toThrow();
  });
  it('creates a populated playlist in one write, with retry identity instead of duplicate empty playlists', () => {
    const p = store.previewPlaylist(
      { sessionId: prepare().sessionId, scope: 'all' },
      tracks,
    );
    const options = {
      name: 'Next show',
      trackIds: p.trackIds,
      exportKey: p.token,
    };
    const first = savePerformancePlaylist(directory, options);
    const second = savePerformancePlaylist(directory, options);
    expect(second.playlistId).toBe(first.playlistId);
    expect(loadPlaylists(directory)).toHaveLength(1);
    expect(loadPlaylists(directory)[0].trackIds).toEqual(['song']);
  });
});
