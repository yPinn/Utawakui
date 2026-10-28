import { describe, expect, it, vi } from 'vitest';
import lyricsHandlersModule from './lyricsHandlers.js';

const EXPECTED_LYRICS_CHANNELS = [
  'lyrics:backfill-source-labels',
  'lyrics:cancel-source-session',
  'lyrics:cancel-timing-review',
  'lyrics:confirm-timing-review',
  'lyrics:delete-reading',
  'lyrics:delete-source',
  'lyrics:generate-reading',
  'lyrics:get-acoustic-estimate',
  'lyrics:get-reading',
  'lyrics:get-timing-review',
  'lyrics:get-track',
  'lyrics:get-vocal-roles',
  'lyrics:import-file',
  'lyrics:import-text',
  'lyrics:probe-musixmatch',
  'lyrics:revoke-timing-review',
  'lyrics:save-candidate',
  'lyrics:save-provider-candidate',
  'lyrics:save-timing',
  'lyrics:save-vocal-roles',
  'lyrics:search-candidates',
  'lyrics:search-provider-candidates',
  'lyrics:set-preferred-source',
  'lyrics:set-reading-line',
  'lyrics:set-source-label',
  'lyrics:set-source-offset',
];

describe('Lyrics IPC registration facade', () => {
  it('preserves the stable public exports and exact channel allowlist', () => {
    expect(Object.keys(lyricsHandlersModule).sort()).toEqual([
      'normalizeLrclibSearchOptions',
      'registerLyricsHandlers',
    ]);

    const handlers = new Map();
    const ipcMain = {
      handle: vi.fn((channel, handler) => {
        expect(handlers.has(channel)).toBe(false);
        handlers.set(channel, handler);
      }),
    };

    lyricsHandlersModule.registerLyricsHandlers({
      ipcMain,
      dialog: { showOpenDialog: vi.fn() },
      getConfig: vi.fn(),
      resolveDownloadDir: vi.fn(),
      getMainWindow: vi.fn(),
      notifyLibraryUpdated: vi.fn(),
      requireFeatureGate: vi.fn(),
      featureIds: { LYRICS_FLOW: 'lyrics-flow' },
      lyricsAcquisitionService: {},
    });

    expect([...handlers.keys()].sort()).toEqual(EXPECTED_LYRICS_CHANNELS);
    expect(ipcMain.handle).toHaveBeenCalledTimes(
      EXPECTED_LYRICS_CHANNELS.length,
    );
  });
});
