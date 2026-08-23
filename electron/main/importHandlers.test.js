import { describe, expect, it, vi } from 'vitest';
import importHandlersModule from './importHandlers.js';

const { buildProviderIndexEntry, saveOptionalLyricsAfterImport } =
  importHandlersModule;

describe('buildProviderIndexEntry', () => {
  it('records provider provenance even when the provider has no artist', () => {
    expect(
      buildProviderIndexEntry({
        title: 'Song',
        artist: undefined,
        duration: 180,
        album: 'Album',
        releaseYear: 2026,
      }),
    ).toEqual({
      title: 'Song',
      titleOrigin: 'provider',
      artist: undefined,
      artistOrigin: 'provider',
      duration: 180,
      album: 'Album',
      releaseYear: 2026,
    });
  });
});

describe('saveOptionalLyricsAfterImport', () => {
  it('never turns a successful audio import into a lyrics failure', async () => {
    const lyricsAcquisitionService = {
      saveIfAbsent: vi.fn().mockRejectedValue(new Error('offline')),
    };

    await expect(
      saveOptionalLyricsAfterImport(
        { title: 'Song', artist: 'Artist' },
        'track-dir',
        lyricsAcquisitionService,
      ),
    ).resolves.toBe(false);
    expect(lyricsAcquisitionService.saveIfAbsent).toHaveBeenCalledOnce();
  });

  it('reports whether optional lyrics were stored', async () => {
    const lyricsAcquisitionService = {
      saveIfAbsent: vi.fn().mockResolvedValue(true),
    };
    await expect(
      saveOptionalLyricsAfterImport(
        { title: 'Song' },
        'track-dir',
        lyricsAcquisitionService,
      ),
    ).resolves.toBe(true);
  });
});
