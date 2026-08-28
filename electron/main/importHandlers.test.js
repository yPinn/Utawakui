import { describe, expect, it, vi } from 'vitest';
import importHandlersModule from './importHandlers.js';

const {
  buildProviderIndexEntry,
  registerImportHandlers,
  saveOptionalLyricsAfterImport,
} = importHandlersModule;

function registerDownload(overrides = {}) {
  const handlers = new Map();
  const ipcMain = {
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
  const enqueueMusicAnalysis = vi.fn(() => true);
  const downloadTrackAudio = vi.fn().mockResolvedValue({
    title: 'Song',
    artist: 'Artist',
    duration: 180,
  });
  registerImportHandlers({
    ipcMain,
    getConfig: () => ({}),
    resolveDownloadDir: () => 'library-dir',
    requireFeatureGate: vi.fn(),
    featureIds: { PROVIDER_FLOW: 'provider-flow' },
    getProviderRunner: vi.fn().mockResolvedValue({}),
    lyricsAcquisitionService: { saveIfAbsent: vi.fn() },
    enqueueMusicAnalysis,
    downloadTrackAudio,
    ...overrides,
  });
  return { handlers, enqueueMusicAnalysis, downloadTrackAudio };
}

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

describe('provider download automatic music analysis', () => {
  it('enqueues the main-derived track id after a successful download', async () => {
    const harness = registerDownload();

    await expect(
      harness.handlers.get('yt:download-audio')(null, 'dQw4w9WgXcQ'),
    ).resolves.toMatchObject({ title: 'Song' });
    expect(harness.enqueueMusicAnalysis).toHaveBeenCalledWith('dQw4w9WgXcQ');
  });

  it('keeps a successful download when optional enqueueing throws', async () => {
    const enqueueMusicAnalysis = vi.fn(() => {
      throw new Error('private queue failure');
    });
    const harness = registerDownload({ enqueueMusicAnalysis });

    await expect(
      harness.handlers.get('yt:download-audio')(null, 'dQw4w9WgXcQ'),
    ).resolves.toMatchObject({ title: 'Song' });
  });
});
