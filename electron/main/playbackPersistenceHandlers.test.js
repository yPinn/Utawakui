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
      'playback-history:record',
      'playback-resume:get',
      'playback-resume:save',
    ]);
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

    expect(service.recordRecentPlayback).toHaveBeenCalledWith('track-a', {
      sourceId: 'playlist-1',
      sourceName: '深夜練唱',
    });
    expect(service.saveResumeSnapshot).toHaveBeenCalledWith({
      currentTrackId: 'track-a',
    });
  });
});
