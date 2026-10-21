import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPerformanceSessionPlanHandlers } from './performanceSessionPlanHandlers.js';
import { createPerformanceSessionPlanStore } from '../lib/performanceSessionPlan.js';
import { createSessionHistoryService } from './sessionHistoryService.js';
import { createTrustedIpcMain } from './ipcSenderPolicy.js';
import { loadPlaylists } from '../lib/playlists.js';
let directory;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-handlers-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});
function setup({ trusted = false, service = null } = {}) {
  const handlers = new Map(),
    main = { mainFrame: {}, isDestroyed: () => false },
    performer = { mainFrame: {}, isDestroyed: () => false };
  const raw = {
    handle: (channel, fn) => handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  };
  const ipcMain = trusted
    ? createTrustedIpcMain({
        ipcMain: raw,
        getMainWebContents: () => main,
        getPerformerWebContents: () => performer,
      })
    : raw;
  const store = createPerformanceSessionPlanStore({ directory });
  const tracks = [{ id: 'song', title: 'Same song', artist: 'Singer' }];
  const adapter = {
    getStatus: () => ({
      observed: {
        lifecycle: 'ready',
        streaming: { active: true },
        recording: { active: true },
      },
    }),
    requestStreamSnapshot: vi.fn(async () => ({
      timecode: '00:02:00.000',
      durationMs: 120000,
    })),
    requestRecordSnapshot: vi.fn(async () => ({
      timecode: '00:01:00.000',
      durationMs: 60000,
    })),
  };
  const history =
    service ??
    createSessionHistoryService({
      obsAdapter: adapter,
      userDataDir: directory,
      getSkipThresholdMs: () => 0,
      getMarkerContext: () => store.getProjected(new Map()).sessionId,
      onMarker: (entry, id) => store.recordMarker(entry, id),
    });
  registerPerformanceSessionPlanHandlers({
    ipcMain,
    getConfig: () => ({}),
    resolveDownloadDir: () => directory,
    listLibraryTracks: () => tracks,
    recordDiagnostic: vi.fn(),
    sessionHistoryService: history,
  });
  const call = (method, intent, event) =>
    handlers.get(
      method.includes(':') ? method : `performance-session-plan:${method}`,
    )(event, intent);
  return { call, store, adapter, history, main, performer };
}
describe('performance session history integration', () => {
  it('appends only the main-owned archive by id, preserving duplicates and manual rows', async () => {
    const { call } = setup();
    await call('get');
    await call('append-library-track', 'song');
    await call('append-library-track', 'song');
    const { plan } = await call('append-manual-item', { displayTitle: 'MC' });
    await call('archive', { sessionId: plan.sessionId, name: 'Archive' });
    for (let round = 1; round <= 2; round++) {
      const result = await call('append-from-archive', {
        sessionId: plan.sessionId,
        items: [],
        replaceCurrent: true,
        trackIds: ['spoofed'],
        path: 'private',
      });
      expect(result.ok).toBe(true);
      expect(result.plan.items).toHaveLength(round * 3);
      expect(result.plan.items.slice(-3).map((i) => i.mode)).toEqual([
        'library-track',
        'library-track',
        'manual',
      ]);
      expect(new Set(result.plan.items.map((i) => i.itemId)).size).toBe(
        round * 3,
      );
    }
    const unknown = await call('append-from-archive', { sessionId: 'missing' });
    expect(unknown.ok).toBe(false);
  });
  it('records consecutive same-song occurrences and manual starts with actual independent clocks, seals all markers and reopens exactly that archive', async () => {
    const { call, history, adapter } = setup();
    await call('get');
    await call('append-library-track', 'song');
    await call('append-library-track', 'song');
    const { plan } = await call('append-manual-item', {
      displayTitle: 'MC',
      displayArtist: '',
    });
    for (const item of plan.items) {
      const start = await call('set-progress', {
        itemId: item.itemId,
        expectedProgressRevision: 0,
        progress: 'playing',
      });
      expect(start.ok).toBe(true);
      const repeat = await call('set-progress', {
        itemId: item.itemId,
        expectedProgressRevision: 0,
        progress: 'playing',
      });
      expect(repeat.ok).toBe(false);
      await call('set-progress', {
        itemId: item.itemId,
        expectedProgressRevision: 1,
        progress: 'completed',
      });
    }
    await history.addMarker('Encore');
    const archived = await call('archive', {
      sessionId: plan.sessionId,
      name: 'Concert',
    });
    expect(archived.ok).toBe(true);
    expect(archived.plan.items).toEqual([]);
    const detail = await call('get-session', { sessionId: plan.sessionId });
    expect(detail.plan.timeline).toHaveLength(4);
    expect(new Set(detail.plan.timeline.map((e) => e.id)).size).toBe(4);
    expect(detail.plan.timeline.map((e) => e.itemId).slice(0, 3)).toEqual(
      plan.items.map((i) => i.itemId),
    );
    expect(detail.plan.timeline[0]).toMatchObject({
      stream: { durationMs: 120000 },
      record: { durationMs: 60000 },
    });
    expect(adapter.requestStreamSnapshot).toHaveBeenCalledTimes(4);
    const preview = await call('preview-playlist', {
      sessionId: plan.sessionId,
      scope: 'completed',
    });
    expect(preview.plan).toMatchObject({
      total: 3,
      savedCount: 1,
      mergedCount: 1,
      manualCount: 1,
    });
    const intent = {
      sessionId: plan.sessionId,
      scope: 'completed',
      name: 'Next concert',
      token: preview.plan.token,
      trackIds: ['forged'],
      path: 'private',
    };
    const first = await call('save-playlist', intent),
      retry = await call('save-playlist', intent);
    expect(retry.plan.playlistId).toBe(first.plan.playlistId);
    expect(loadPlaylists(directory)).toHaveLength(1);
    expect(loadPlaylists(directory)[0].trackIds).toEqual(['song']);
    const restarted = setup();
    expect(
      (await restarted.call('get-session', { sessionId: plan.sessionId })).plan
        .timeline,
    ).toHaveLength(4);
  });
  it('deduplicates audio resume/retransmission, accepts same song on a new revision, and rejects stale epochs, unknown tracks and invalid identifiers', async () => {
    const observePerformance = vi.fn(async () => ({ id: 'recorded' }));
    const { call } = setup({
      service: { observePerformance, flush: async () => {} },
    });
    const first = {
      epoch: crypto.randomUUID(),
      playbackRevision: 1,
      trackId: 'song',
    };
    expect(
      (await call('session-history:confirmed-playing', first)).plan.recorded,
    ).toBe(true);
    expect(
      (await call('session-history:confirmed-playing', first)).plan.recorded,
    ).toBe(false);
    await call('session-history:confirmed-playing', {
      ...first,
      playbackRevision: 2,
    });
    const next = { ...first, epoch: crypto.randomUUID() };
    await call('session-history:confirmed-playing', next);
    expect(
      (
        await call('session-history:confirmed-playing', {
          ...first,
          playbackRevision: 3,
        })
      ).plan.recorded,
    ).toBe(false);
    for (const patch of [
      { epoch: '-'.repeat(36) },
      { playbackRevision: 0 },
      { trackId: 'unknown', playbackRevision: 3 },
    ])
      expect(
        (await call('session-history:confirmed-playing', { ...next, ...patch }))
          .ok,
      ).toBe(false);
    expect(observePerformance).toHaveBeenCalledTimes(3);
  });
  it('authorizes every new channel only from the main frame, never from Performer or child frames', async () => {
    const { call, main, performer } = setup({ trusted: true });
    for (const channel of [
      'archive',
      'get-session',
      'preview-playlist',
      'save-playlist',
      'session-history:confirmed-playing',
    ]) {
      for (const event of [
        { sender: performer, senderFrame: performer.mainFrame },
        { sender: main, senderFrame: {} },
        undefined,
      ])
        await expect(call(channel, {}, event)).rejects.toThrow(
          'IPC_SENDER_UNTRUSTED',
        );
    }
    expect(
      (
        await call('get', undefined, {
          sender: main,
          senderFrame: main.mainFrame,
        })
      ).ok,
    ).toBe(true);
  });
  it('serializes pending start before archive and refuses to discard a still-playing occurrence', async () => {
    let resolve;
    const service = {
      observePerformance: vi.fn(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      ),
      flush: vi.fn(async () => {}),
    };
    const { call } = setup({ service });
    await call('get');
    const { plan } = await call('append-library-track', 'song');
    const start = call('set-progress', {
      itemId: plan.items[0].itemId,
      expectedProgressRevision: 0,
      progress: 'playing',
    });
    await vi.waitFor(() =>
      expect(service.observePerformance).toHaveBeenCalledOnce(),
    );
    const archive = call('archive', {
      sessionId: plan.sessionId,
      name: 'Busy',
    });
    resolve({
      id: 'entry',
      type: 'track',
      title: 'Same song',
      artist: 'Singer',
      trackId: 'song',
      itemId: plan.items[0].itemId,
      occurredAt: '2026-10-21T00:00:00Z',
      stream: null,
      record: null,
    });
    expect((await start).ok).toBe(true);
    expect((await archive).ok).toBe(false);
    expect((await call('get')).plan.items[0].progress).toBe('playing');
  });
});
