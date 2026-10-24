import { describe, expect, it, vi } from 'vitest';
import { registerPlaybackPersistenceHandlers } from './playbackPersistenceHandlers.js';

function createHarness() {
  const handlers = new Map();
  const ipcMain = {
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
  const service = {
    getRecentHistory: vi.fn(() => []),
    recordRecentPlayback: vi.fn(() => [{ trackId: 'track-a' }]),
    clearRecentHistory: vi.fn(() => []),
    getResumeSnapshot: vi.fn(() => null),
    saveResumeSnapshot: vi.fn((snapshot) => snapshot),
    getPlayCountByTrackId: vi.fn(() => ({ 'track-a': 2 })),
    recordSourceUse: vi.fn(() => ({})),
    getSourceRecency: vi.fn(() => ({
      'playlist-1': '2026-10-24T00:00:00.000Z',
    })),
  };
  registerPlaybackPersistenceHandlers({ ipcMain, service });
  return { handlers, service };
}

describe('playbackPersistenceHandlers', () => {
  it('registers only fixed playback history and resume channels', () => {
    const { handlers } = createHarness();

    expect([...handlers.keys()].sort()).toEqual([
      'playback-history:clear',
      'playback-history:get',
      'playback-history:get-source-recency',
      'playback-history:record',
      'playback-history:record-source',
      'playback-resume:get',
      'playback-resume:save',
      'playback-usage:get-play-counts',
    ]);
  });

  it('exposes play counts without accepting renderer arguments', async () => {
    const { handlers, service } = createHarness();

    await expect(
      handlers.get('playback-usage:get-play-counts')(
        { sender: 'private' },
        'ignored',
      ),
    ).resolves.toEqual({ 'track-a': 2 });
    expect(service.getPlayCountByTrackId).toHaveBeenCalledWith();
  });

  it('exposes source recency without accepting renderer arguments', async () => {
    const { handlers, service } = createHarness();

    await expect(
      handlers.get('playback-history:get-source-recency')(
        { sender: 'private' },
        'ignored',
      ),
    ).resolves.toEqual({ 'playlist-1': '2026-10-24T00:00:00.000Z' });
    expect(service.getSourceRecency).toHaveBeenCalledWith();
  });

  it('passes only bounded scalar playback intents to the service', async () => {
    const { handlers, service } = createHarness();

    await handlers.get('playback-history:record')(
      { sender: 'private' },
      'track-a',
      { sourceId: 'playlist-1', sourceName: '深夜練唱' },
      'ignored',
    );
    await handlers.get('playback-resume:save')(
      { sender: 'private' },
      { currentTrackId: 'track-a' },
      'ignored',
    );

    await handlers.get('playback-history:record-source')(
      { sender: 'private' },
      'album-1',
      'ignored',
    );
    expect(service.recordSourceUse).toHaveBeenCalledWith('album-1');
    expect(service.recordRecentPlayback).toHaveBeenCalledWith('track-a', {
      sourceId: 'playlist-1',
      sourceName: '深夜練唱',
    });
    expect(service.saveResumeSnapshot).toHaveBeenCalledWith({
      currentTrackId: 'track-a',
    });
  });
});
