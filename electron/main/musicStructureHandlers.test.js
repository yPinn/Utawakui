import { describe, expect, it, vi } from 'vitest';
import handlersModule from './musicStructureHandlers.js';

const { registerMusicStructureHandlers } = handlersModule;

describe('music-structure handlers', () => {
  it('loads a bounded main-owned projection using only the requested track id', async () => {
    const handlers = new Map();
    const ipcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    };
    const loadTrackMusicStructure = vi.fn().mockReturnValue({
      trackId: 'track-1',
      sourceRevision: 'a'.repeat(64),
      sourceDurationMs: 180000,
      signals: {
        level: 'M1',
        reason: 'current',
        tempo: { bpm: 120 },
        beats: [],
        sections: [],
      },
    });

    registerMusicStructureHandlers({
      ipcMain,
      getConfig: () => ({ downloadDir: 'configured' }),
      resolveDownloadDir: () => 'library-dir',
      loadMusicStructure: loadTrackMusicStructure,
    });

    await expect(
      handlers.get('music-structure:get-track')(null, 'track-1'),
    ).resolves.toMatchObject({
      trackId: 'track-1',
      signals: { level: 'M1', reason: 'current' },
    });
    expect(loadTrackMusicStructure).toHaveBeenCalledWith(
      'library-dir',
      'track-1',
    );
  });
});
