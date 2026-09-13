import { describe, expect, it, vi } from 'vitest';
import importHandlersModule from './importHandlers.js';

const {
  buildProviderIndexEntry,
  registerImportHandlers,
  scheduleOptionalLyricsAfterImport,
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
  const requireFeatureGate = vi.fn();
  const notifyLibraryUpdated = vi.fn();
  const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
  const getProviderRunner = vi.fn().mockResolvedValue({ run: true });
  registerImportHandlers({
    ipcMain,
    getConfig: () => ({}),
    resolveDownloadDir: () => 'library-dir',
    requireFeatureGate,
    featureIds: { PROVIDER_FLOW: 'provider-flow' },
    getProviderRunner,
    lyricsAcquisitionService: { scheduleAutomaticAcquisition: vi.fn() },
    enqueueMusicAnalysis,
    notifyLibraryUpdated,
    recordDiagnostic,
    downloadTrackAudio,
    ...overrides,
  });
  return {
    handlers,
    enqueueMusicAnalysis,
    downloadTrackAudio,
    getProviderRunner,
    requireFeatureGate,
    recordDiagnostic,
    notifyLibraryUpdated,
  };
}

describe('generic import source resolution', () => {
  it('resolves a text query through yt-dlp search and returns native candidates', async () => {
    const searchYoutubeCandidates = vi.fn().mockResolvedValue([
      {
        id: 'topic000001',
        title: 'Song',
        artist: 'Artist - Topic',
        duration: 211,
        playbackKind: 'youtube-topic-audio',
      },
    ]);
    const harness = registerDownload({ searchYoutubeCandidates });

    await expect(
      harness.handlers.get('import:resolve-source')(null, 'Artist Song'),
    ).resolves.toMatchObject({
      kind: 'single',
      inputKind: 'text-query',
      resolution: {
        recommendedCandidate: { playbackVideoId: 'topic000001' },
      },
    });
    expect(searchYoutubeCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Artist Song', sourceType: 'query' }),
      {},
      expect.objectContaining({ runner: { run: true } }),
    );
    expect(harness.requireFeatureGate).toHaveBeenCalledWith('provider-flow');
  });

  it('records an all-failed provider search and exposes only a bounded public error', async () => {
    const privateError = Object.assign(
      new Error('Unable to download webpage for \u96e8\u611b'),
      {
        stderr: 'ERROR: Unable to download webpage at C:\\private\\cookies.txt',
        searchDiagnostics: {
          stage: 'initial',
          status: 'failed',
          inputCount: 1,
          successCount: 0,
          failureCount: 1,
          candidateCount: 0,
        },
      },
    );
    const searchYoutubeCandidates = vi.fn().mockRejectedValue(privateError);
    const harness = registerDownload({ searchYoutubeCandidates });

    const promise = harness.handlers.get('import:resolve-source')(
      null,
      '\u96e8\u611b',
    );

    await expect(promise).rejects.toMatchObject({
      code: 'PROVIDER_SEARCH_FAILED',
      title: 'YT Music／YouTube 搜尋未完成',
      publicMessage: '目前無法完成 YT Music／YouTube 搜尋，請稍後再試。',
      context: {
        reason: 'network-error',
        retryable: true,
        diagnosticRecorded: true,
      },
    });
    await expect(promise).rejects.not.toThrow(/\u96e8\u611b|cookies\.txt/iu);
    expect(harness.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        source: 'import',
        operation: 'provider-search',
        code: 'PROVIDER_SEARCH_FAILED',
        context: expect.objectContaining({
          inputCount: 1,
          successCount: 0,
          failureCount: 1,
          candidateCount: 0,
          reason: 'network-error',
        }),
      }),
    );
    expect(harness.recordDiagnostic.mock.calls[0][0]).not.toHaveProperty(
      'error',
    );
    expect(JSON.stringify(harness.recordDiagnostic.mock.calls)).not.toMatch(
      /\u96e8\u611b|cookies\.txt/iu,
    );
  });

  it('records a genuine empty provider search without exposing the query', async () => {
    const searchYoutubeCandidates = vi.fn(
      async (canonical, sourceMetadata, options) => {
        options.onSearchDiagnostics({
          stage: 'complete',
          status: 'empty',
          inputCount: 1,
          successCount: 1,
          failureCount: 0,
          candidateCount: 0,
        });
        return [];
      },
    );
    const harness = registerDownload({ searchYoutubeCandidates });

    await expect(
      harness.handlers.get('import:resolve-source')(null, '\u96e8\u611b'),
    ).resolves.toMatchObject({
      kind: 'single',
      resolution: { candidates: [] },
    });
    expect(harness.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        code: 'PROVIDER_SEARCH_EMPTY',
        message: 'YouTube provider search returned no usable candidates',
        context: expect.objectContaining({
          status: 'empty',
          candidateCount: 0,
        }),
      }),
    );
    expect(JSON.stringify(harness.recordDiagnostic.mock.calls)).not.toContain(
      '\u96e8\u611b',
    );
  });

  it.each([
    ['https://open.spotify.com/track/123', 'spotify'],
    ['https://music.apple.com/tw/album/example/123?i=456', 'apple-music'],
  ])('returns an explicit deferred result for %s', async (input, platform) => {
    const harness = registerDownload();

    await expect(
      harness.handlers.get('import:resolve-source')(null, input),
    ).resolves.toEqual({ kind: 'deferred', platform });
    expect(harness.getProviderRunner).not.toHaveBeenCalled();
  });

  it('does not send an unsupported URL to a provider runner', async () => {
    const harness = registerDownload();

    await expect(
      harness.handlers.get('import:resolve-source')(
        null,
        'https://example.com/private',
      ),
    ).resolves.toEqual({ kind: 'unsupported', reason: 'unsupported-url' });
    expect(harness.getProviderRunner).not.toHaveBeenCalled();
  });

  it('records a classified download failure without changing the classified error the renderer parses', async () => {
    const privateError = new Error(
      'getaddrinfo ENOTFOUND host at C:\\private\\cookies.txt',
    );
    const fetchYoutubeMetadata = vi.fn().mockRejectedValue(privateError);
    const harness = registerDownload({ fetchYoutubeMetadata });

    const promise = harness.handlers.get('yt:fetch-metadata')(
      null,
      'dQw4w9WgXcQ',
    );

    // The pre-existing shared/downloadFailureValues.json contract must be
    // completely unaffected by adding diagnostics recording alongside it.
    await expect(promise).rejects.toThrow(
      'utawakui-download-failed:network-error',
    );
    await expect(promise).rejects.not.toThrow(/cookies\.txt/i);

    expect(harness.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'import',
        operation: 'download',
        code: 'DOWNLOAD_FAILED',
        context: expect.objectContaining({ reason: 'network-error' }),
      }),
    );
    expect(JSON.stringify(harness.recordDiagnostic.mock.calls)).not.toMatch(
      /cookies\.txt/i,
    );
  });
});

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

describe('scheduleOptionalLyricsAfterImport', () => {
  it('never turns a successful audio import into a lyrics failure', async () => {
    const lyricsAcquisitionService = {
      scheduleAutomaticAcquisition: vi
        .fn()
        .mockRejectedValue(new Error('offline')),
    };

    expect(
      scheduleOptionalLyricsAfterImport(
        { title: 'Song', artist: 'Artist' },
        'track-dir',
        lyricsAcquisitionService,
      ),
    ).toBe(true);
    expect(
      lyricsAcquisitionService.scheduleAutomaticAcquisition,
    ).toHaveBeenCalledOnce();
    await Promise.resolve();
  });

  it('returns false when background scheduling cannot start', () => {
    const lyricsAcquisitionService = {
      scheduleAutomaticAcquisition: vi.fn(() => {
        throw new Error('queue unavailable');
      }),
    };

    expect(
      scheduleOptionalLyricsAfterImport(
        { title: 'Song' },
        'track-dir',
        lyricsAcquisitionService,
      ),
    ).toBe(false);
  });
});

describe('provider download automatic music analysis', () => {
  it('uses the downloaded file duration for lyrics acquisition', async () => {
    const lyricsAcquisitionService = {
      scheduleAutomaticAcquisition: vi.fn(),
    };
    const downloadTrackAudio = vi.fn().mockResolvedValue({
      title: 'Song',
      artist: 'Artist',
      duration: 211,
    });
    const harness = registerDownload({
      lyricsAcquisitionService,
      downloadTrackAudio,
    });

    await harness.handlers.get('yt:download-audio')(null, 'dQw4w9WgXcQ');

    expect(
      lyricsAcquisitionService.scheduleAutomaticAcquisition,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dQw4w9WgXcQ', duration: 211 }),
      expect.any(String),
      expect.objectContaining({ onSaved: expect.any(Function) }),
    );
  });

  it('returns the successful audio import without awaiting lyrics acquisition', async () => {
    const lyricsAcquisitionService = {
      scheduleAutomaticAcquisition: vi.fn(() => new Promise(() => {})),
    };
    const harness = registerDownload({ lyricsAcquisitionService });

    await expect(
      harness.handlers.get('yt:download-audio')(null, 'dQw4w9WgXcQ'),
    ).resolves.toMatchObject({ title: 'Song' });
    expect(
      lyricsAcquisitionService.scheduleAutomaticAcquisition,
    ).toHaveBeenCalledOnce();
  });

  it('refreshes the library only after automatic lyrics are saved', async () => {
    const lyricsAcquisitionService = {
      scheduleAutomaticAcquisition: vi.fn((_track, _trackDir, options) => {
        options.onSaved();
        return Promise.resolve({ status: 'saved' });
      }),
    };
    const harness = registerDownload({ lyricsAcquisitionService });

    await harness.handlers.get('yt:download-audio')(null, 'dQw4w9WgXcQ');

    expect(harness.notifyLibraryUpdated).toHaveBeenCalledWith({
      allowProviderBackfill: false,
    });
  });

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
