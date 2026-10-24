import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import importHandlersModule from './importHandlers.js';

const {
  buildProviderIndexEntry,
  registerImportHandlers,
  scheduleOptionalLyricsAfterImport,
} = importHandlersModule;

function flushAsync() {
  return new Promise((resolve) => setImmediate(resolve));
}

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
  const enforceLibraryStoragePolicy = vi.fn().mockResolvedValue(undefined);
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
    enforceLibraryStoragePolicy,
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
    enforceLibraryStoragePolicy,
    notifyLibraryUpdated,
  };
}

describe('import clipboard suggestion boundary', () => {
  it('downloads an exact catalog target through the shared queue and attaches it without source discovery', async () => {
    const webContents = { mainFrame: {} };
    const target = { videoId: 'rgNdeflYdYw' };
    const prepareReleaseDownload = vi.fn(() => target),
      validateReleaseDownload = vi.fn(),
      attachReleaseDownload = vi.fn(async () => ({
        status: 'ok',
        libraryEpoch: 7,
      }));
    const h = registerDownload({
      getMainWindow: () => ({ isDestroyed: () => false, webContents }),
      prepareReleaseDownload,
      validateReleaseDownload,
      attachReleaseDownload,
    });
    const handler = h.handlers.get('library:download-release-track');
    expect(await handler({ sender: webContents, senderFrame: {} }, {})).toEqual(
      { status: 'invalid-intent' },
    );
    const input = {
      collectionId: 'album',
      expectedRevision: 2,
      libraryEpoch: 7,
      slotKey: 'slot-1',
    };
    expect(
      await handler(
        { sender: webContents, senderFrame: webContents.mainFrame },
        input,
      ),
    ).toMatchObject({ status: 'ok' });
    expect(prepareReleaseDownload).toHaveBeenCalledExactlyOnceWith(input);
    expect(validateReleaseDownload).toHaveBeenCalledWith(target);
    expect(h.downloadTrackAudio.mock.calls[0][0]).toBe(target.videoId);
    expect(attachReleaseDownload).toHaveBeenCalledExactlyOnceWith(target);
    expect(h.notifyLibraryUpdated).toHaveBeenCalledWith({
      allowProviderBackfill: false,
    });
  });

  it('reports installed-but-unlinked audio accurately after a slot conflict', async () => {
    const webContents = { mainFrame: {} };
    const h = registerDownload({
      getMainWindow: () => ({ isDestroyed: () => false, webContents }),
      prepareReleaseDownload: () => ({ videoId: 'rgNdeflYdYw' }),
      validateReleaseDownload: () => {},
      attachReleaseDownload: async () => {
        throw Error('private conflict');
      },
    });
    expect(
      await h.handlers.get('library:download-release-track')(
        { sender: webContents, senderFrame: webContents.mainFrame },
        {},
      ),
    ).toEqual({ status: 'downloaded-unlinked' });
    expect(h.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RELEASE_DOWNLOAD_LINK_FAILED' }),
    );
  });
  it('shares an active generic download with an album request and attaches only after installation', async () => {
    const webContents = { mainFrame: {} };
    let finish;
    const downloadTrackAudio = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const attachReleaseDownload = vi.fn(async () => ({ status: 'ok' }));
    const h = registerDownload({
      getMainWindow: () => ({ isDestroyed: () => false, webContents }),
      downloadTrackAudio,
      prepareReleaseDownload: () => ({ videoId: 'rgNdeflYdYw' }),
      validateReleaseDownload: () => {},
      attachReleaseDownload,
    });
    const generic = h.handlers.get('yt:download-audio')(null, 'rgNdeflYdYw');
    await flushAsync();
    const album = h.handlers.get('library:download-release-track')(
      { sender: webContents, senderFrame: webContents.mainFrame },
      {},
    );
    await flushAsync();
    expect(downloadTrackAudio).toHaveBeenCalledOnce();
    expect(attachReleaseDownload).not.toHaveBeenCalled();
    finish({ title: 'Song' });
    await Promise.all([generic, album]);
    expect(attachReleaseDownload).toHaveBeenCalledOnce();
    expect(h.enforceLibraryStoragePolicy).toHaveBeenCalledOnce();
  });
  it('refuses a queued album download if the library changes while the provider runner is preparing', async () => {
    const webContents = { mainFrame: {} };
    let scope = { dir: 'library-dir', epoch: 7 },
      finish;
    const h = registerDownload({
      getMainWindow: () => ({ isDestroyed: () => false, webContents }),
      getReleaseScope: () => scope,
      getProviderRunner: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      prepareReleaseDownload: () => ({ videoId: 'rgNdeflYdYw' }),
      validateReleaseDownload: () => {},
      attachReleaseDownload: vi.fn(),
    });
    const pending = h.handlers.get('library:download-release-track')(
      { sender: webContents, senderFrame: webContents.mainFrame },
      {},
    );
    await flushAsync();
    scope = { ...scope, epoch: 8 };
    finish({ run: true });
    await expect(pending).rejects.toMatchObject({
      code: 'IMPORT_LIBRARY_CHANGED',
    });
    expect(h.downloadTrackAudio).not.toHaveBeenCalled();
  });
  it('does not diagnose cancellation of a shared album download as a failure', async () => {
    const webContents = { mainFrame: {} };
    const downloadTrackAudio = vi.fn(
      (_id, _dir, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener(
            'abort',
            () =>
              reject(
                Object.assign(Error('cancelled'), {
                  code: 'IMPORT_DOWNLOAD_CANCELLED',
                }),
              ),
            { once: true },
          ),
        ),
    );
    const attachReleaseDownload = vi.fn();
    const h = registerDownload({
      getMainWindow: () => ({ isDestroyed: () => false, webContents }),
      downloadTrackAudio,
      prepareReleaseDownload: () => ({ videoId: 'rgNdeflYdYw' }),
      validateReleaseDownload: () => {},
      attachReleaseDownload,
    });
    const pending = h.handlers.get('library:download-release-track')(
      { sender: webContents, senderFrame: webContents.mainFrame },
      {},
    );
    await flushAsync();
    await h.handlers.get('yt:cancel-download')(null, 'rgNdeflYdYw');
    await expect(pending).rejects.toMatchObject({
      code: 'IMPORT_DOWNLOAD_CANCELLED',
    });
    expect(attachReleaseDownload).not.toHaveBeenCalled();
    expect(h.recordDiagnostic).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DOWNLOAD_FAILED' }),
    );
  });
  it('enqueues metadata after storage with captured scope without awaiting optional failure', async () => {
    const captured = { dir: 'library-dir', epoch: 7 };
    let finished = false;
    const enqueueReleaseCatalog = vi.fn(() => {
      expect(finished).toBe(true);
      return Promise.reject(Error('metadata offline'));
    });
    const view = registerDownload({
      getReleaseScope: () => captured,
      enforceLibraryStoragePolicy: async () => {
        finished = true;
      },
      enqueueReleaseCatalog,
    });
    await expect(
      view.handlers.get('yt:download-audio')({}, 'abcdefghijk'),
    ).resolves.toMatchObject({ title: 'Song' });
    expect(enqueueReleaseCatalog).toHaveBeenCalledWith('abcdefghijk', captured);
    await flushAsync();
  });
  it('commits provider metadata once inside captured import admission', async () => {
    let inside = false;
    const runImport = vi.fn(async (_intent, finalize) => {
      inside = true;
      try {
        return await finalize();
      } finally {
        inside = false;
      }
    });
    const createLibraryImportAdmission = vi.fn(() => runImport);
    const saveProviderIndexEntry = vi.fn(() => expect(inside).toBe(true));
    const view = registerDownload({
      createLibraryImportAdmission,
      saveProviderIndexEntry,
      downloadTrackAudio: vi.fn(async (id, dir, options) => {
        const result = { title: 'Song', artist: 'Artist', duration: 180 };
        await options.runImport({ dir, trackId: id }, () =>
          options.onTrackCommitted(result),
        );
        return result;
      }),
    });
    await view.handlers.get('yt:download-audio')({}, 'abcdefghijk');
    expect(createLibraryImportAdmission).toHaveBeenCalledOnce();
    expect(runImport).toHaveBeenCalledOnce();
    expect(saveProviderIndexEntry).toHaveBeenCalledOnce();
  });
  it('preserves checked metadata through the default writer on repeated downloads', async () => {
    fs.mkdirSync('.tmp', { recursive: true });
    const dir = fs.mkdtempSync(path.resolve('.tmp/provider-checked-'));
    const file = path.join(dir, 'library.json');
    const checked = {
      title: 'Checked title',
      titleOrigin: 'manual',
      artist: '',
      artistOrigin: 'manual',
      album: 'Checked album',
      albumOrigin: 'manual',
      releaseYear: null,
      releaseYearOrigin: 'manual',
    };
    try {
      fs.writeFileSync(
        file,
        JSON.stringify({ version: 2, tracks: { abcdefghijk: checked } }),
      );
      const view = registerDownload({
        resolveDownloadDir: () => dir,
        downloadTrackAudio: vi.fn().mockResolvedValue({
          title: 'Provider title',
          artist: 'Provider artist',
          album: 'Provider album',
          releaseYear: 2026,
          duration: 180,
        }),
      });
      await view.handlers.get('yt:download-audio')({}, 'abcdefghijk');
      expect(
        JSON.parse(fs.readFileSync(file, 'utf8')).tracks.abcdefghijk,
      ).toMatchObject({
        ...checked,
        duration: 180,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it.each([
    [{}, false],
    [{ youtubeBrowserCookies: true }, true],
  ])(
    'passes the browser-cookie opt-in from %j to provider downloads',
    async (config, expected) => {
      const downloadTrackAudio = vi.fn().mockResolvedValue({ title: 'Song' });
      const view = registerDownload({
        getConfig: () => config,
        downloadTrackAudio,
      });
      await view.handlers.get('yt:download-audio')({}, 'abcdefghijk');
      expect(downloadTrackAudio.mock.calls[0][2].allowBrowserCookies).toBe(
        expected,
      );
    },
  );
  function clipboardHarness(value) {
    const sender = { mainFrame: {} };
    const readClipboardText = vi.fn().mockResolvedValue(value);
    const harness = registerDownload({
      readClipboardText,
      getMainWindow: () => ({ webContents: sender, isFocused: () => true }),
    });
    return {
      ...harness,
      readClipboardText,
      event: { sender, senderFrame: sender.mainFrame },
    };
  }

  it.each([
    [
      'https://youtu.be/abcdefghijk?si=private',
      'https://www.youtube.com/watch?v=abcdefghijk',
    ],
    [
      'https://music.youtube.com/watch?v=abcdefghijk',
      'https://music.youtube.com/watch?v=abcdefghijk',
    ],
    [
      'https://www.youtube.com/playlist?list=PL12345',
      'https://www.youtube.com/playlist?list=PL12345',
    ],
    [
      'https://music.youtube.com/playlist?list=OLAK5uy_test',
      'https://music.youtube.com/playlist?list=OLAK5uy_test',
    ],
  ])(
    'returns a bounded supported URL for %s without provider access',
    async (input, expected) => {
      const view = clipboardHarness(input);
      await expect(
        view.handlers.get('import:clipboard-suggestion')(view.event),
      ).resolves.toBe(expected);
      expect(view.getProviderRunner).not.toHaveBeenCalled();
      expect(view.requireFeatureGate).not.toHaveBeenCalled();
    },
  );

  it.each([
    'password',
    'abcdefghijk',
    'https://example.com',
    'https://youtube.com.evil.test/watch?v=abcdefghijk',
    'file://youtube.com/watch?v=abcdefghijk',
    'https://user:secret@youtube.com/watch?v=abcdefghijk',
    'https://open.spotify.com/track/123',
    'hello https://youtu.be/abcdefghijk',
    'x'.repeat(4097),
    'https://youtu.be/abcdefghijk\nhttps://example.com',
    null,
  ])('does not expose unrelated clipboard text: %s', async (value) => {
    const view = clipboardHarness(value);
    await expect(
      view.handlers.get('import:clipboard-suggestion')(view.event),
    ).resolves.toBe('');
  });

  it('refuses another sender or a subframe before reading', async () => {
    const view = clipboardHarness('https://youtu.be/abcdefghijk');
    const handler = view.handlers.get('import:clipboard-suggestion');
    expect(await handler({ sender: {}, senderFrame: {} })).toBe('');
    expect(await handler({ ...view.event, senderFrame: {} })).toBe('');
    expect(view.readClipboardText).not.toHaveBeenCalled();
  });

  it.each([
    [
      'https://youtu.be/abcdefghijk?si=private&t=30#personal',
      'https://www.youtube.com/watch?v=abcdefghijk',
    ],
    [
      'https://music.youtube.com/watch?v=abcdefghijk&pp=personal',
      'https://music.youtube.com/watch?v=abcdefghijk',
    ],
  ])(
    'resolves manual paste and the clipboard suggestion through the same canonical URL: %s',
    async (raw, expected) => {
      const fetchYoutubeMetadata = vi
        .fn()
        .mockResolvedValue({ title: 'Song', artist: 'Artist', duration: 180 });
      const sender = { mainFrame: {} };
      const view = registerDownload({
        readClipboardText: () => raw,
        getMainWindow: () => ({ webContents: sender, isFocused: () => true }),
        fetchYoutubeMetadata,
        searchYoutubeCandidates: vi.fn().mockResolvedValue([]),
        listLibraryTracks: () => [],
      });
      const suggested = await view.handlers.get('import:clipboard-suggestion')({
        sender,
        senderFrame: sender.mainFrame,
      });
      const manual = await view.handlers.get('import:resolve-source')(
        null,
        raw,
      );
      const clipboard = await view.handlers.get('import:resolve-source')(
        null,
        suggested,
      );
      expect(suggested).toBe(expected);
      expect(manual).toEqual(clipboard);
      expect(manual.resolution.input).toBe(expected);
      expect(fetchYoutubeMetadata).toHaveBeenCalledWith('abcdefghijk', {
        runner: { run: true },
      });
      expect(JSON.stringify(manual)).not.toMatch(
        /private|personal|si=|pp=|t=30/,
      );
    },
  );

  it.each([
    'file://youtube.com/watch?v=abcdefghijk',
    'https://user:secret@youtube.com/watch?v=abcdefghijk',
    'https://youtu.be/abcdefghijk\nhttps://example.com',
  ])(
    'rejects the same unsafe pasted URL before provider work: %s',
    async (raw) => {
      const view = clipboardHarness(raw);
      expect(
        await view.handlers.get('import:clipboard-suggestion')(view.event),
      ).toBe('');
      expect(
        await view.handlers.get('import:resolve-source')(null, raw),
      ).toEqual({ kind: 'unsupported', reason: 'unsupported-url' });
      expect(view.getProviderRunner).not.toHaveBeenCalled();
    },
  );

  it('silently handles unavailable clipboard access', async () => {
    const view = clipboardHarness('');
    view.readClipboardText.mockRejectedValue(
      new Error('private clipboard error'),
    );
    await expect(
      view.handlers.get('import:clipboard-suggestion')(view.event),
    ).resolves.toBe('');
  });
});

describe('generic import source resolution', () => {
  it.each(['music.youtube.com', 'www.youtube.com'])(
    'projects the provider release type separately from collection kind (%s)',
    async (host) => {
      const view = registerDownload({
        listLibraryTracks: () => [],
        fetchPlaylistMetadata: async () => ({
          title: 'RASEN',
          releaseType: 'ep',
          releaseDate: { value: '2026', precision: 'year' },
          thumbnailUrl: 'https://yt3.googleusercontent.com/rasen',
          entries: [{ id: 'abcdefghijk', title: 'RASEN' }],
        }),
      });
      const result = await view.handlers.get('import:resolve-source')(
        {},
        `https://${host}/playlist?list=OLAK5uy_observation`,
      );
      expect(result).toMatchObject({
        kind: 'playlist',
        collectionKind: 'album',
        releaseType: 'ep',
        releaseDate: { value: '2026', precision: 'year' },
        title: 'RASEN',
      });
    },
  );
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
  it('records provider provenance and the supplied import time', () => {
    expect(
      buildProviderIndexEntry(
        {
          title: 'Song',
          artist: undefined,
          duration: 180,
          album: 'Album',
          releaseYear: 2026,
        },
        '2026-10-04T12:00:00.000Z',
      ),
    ).toEqual({
      title: 'Song',
      titleOrigin: 'provider',
      artist: undefined,
      artistOrigin: 'provider',
      duration: 180,
      album: 'Album',
      releaseYear: 2026,
      importedAt: '2026-10-04T12:00:00.000Z',
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

describe('provider download scheduling and automatic music analysis', () => {
  it('admits at most two provider downloads at once', async () => {
    const gates = new Map();
    const downloadTrackAudio = vi.fn((videoId) => {
      let resolve;
      const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
      });
      gates.set(videoId, { promise, resolve });
      return promise;
    });
    const harness = registerDownload({ downloadTrackAudio });

    const jobs = [
      harness.handlers.get('yt:download-audio')(null, 'aaaaaaaaaaa'),
      harness.handlers.get('yt:download-audio')(null, 'bbbbbbbbbbb'),
      harness.handlers.get('yt:download-audio')(null, 'ccccccccccc'),
    ];
    await flushAsync();

    expect(downloadTrackAudio.mock.calls.map(([id]) => id)).toEqual([
      'aaaaaaaaaaa',
      'bbbbbbbbbbb',
    ]);

    gates.get('aaaaaaaaaaa').resolve({ title: 'A', duration: 180 });
    await flushAsync();
    expect(downloadTrackAudio).toHaveBeenCalledTimes(3);

    gates.get('bbbbbbbbbbb').resolve({ title: 'B', duration: 180 });
    gates.get('ccccccccccc').resolve({ title: 'C', duration: 180 });
    await Promise.all(jobs);
  });

  it('serializes library finalization after concurrent downloads finish', async () => {
    let releaseFirstFinalize;
    const enforceLibraryStoragePolicy = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirstFinalize = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const harness = registerDownload({ enforceLibraryStoragePolicy });

    const first = harness.handlers.get('yt:download-audio')(
      null,
      'aaaaaaaaaaa',
    );
    const second = harness.handlers.get('yt:download-audio')(
      null,
      'bbbbbbbbbbb',
    );
    await flushAsync();

    expect(harness.downloadTrackAudio).toHaveBeenCalledTimes(2);
    expect(enforceLibraryStoragePolicy).toHaveBeenCalledTimes(1);

    releaseFirstFinalize();
    await flushAsync();
    expect(enforceLibraryStoragePolicy).toHaveBeenCalledTimes(2);

    await Promise.all([first, second]);
  });

  it('shares one download and finalization task for duplicate track requests', async () => {
    let releaseDownload;
    const downloadTrackAudio = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseDownload = () =>
            resolve({ title: 'Same Song', duration: 180 });
        }),
    );
    const saveProviderIndexEntry = vi.fn();
    const harness = registerDownload({
      downloadTrackAudio,
      saveProviderIndexEntry,
    });

    const first = harness.handlers.get('yt:download-audio')(
      null,
      'dQw4w9WgXcQ',
    );
    const duplicate = harness.handlers.get('yt:download-audio')(
      null,
      'dQw4w9WgXcQ',
    );
    await flushAsync();

    expect(downloadTrackAudio).toHaveBeenCalledOnce();
    releaseDownload();
    await expect(Promise.all([first, duplicate])).resolves.toHaveLength(2);
    expect(saveProviderIndexEntry).toHaveBeenCalledOnce();
    expect(harness.enforceLibraryStoragePolicy).toHaveBeenCalledOnce();
  });

  it('cancels an active provider download without recording it as a failure', async () => {
    const downloadTrackAudio = vi.fn(
      (videoId, destDir, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () =>
              reject(
                Object.assign(new Error('provider download cancelled'), {
                  code: 'IMPORT_DOWNLOAD_CANCELLED',
                }),
              ),
            { once: true },
          );
        }),
    );
    const harness = registerDownload({ downloadTrackAudio });

    const download = harness.handlers.get('yt:download-audio')(
      null,
      'dQw4w9WgXcQ',
    );
    await flushAsync();
    await expect(
      harness.handlers.get('yt:cancel-download')(null, 'dQw4w9WgXcQ'),
    ).resolves.toBe(true);

    await expect(download).rejects.toMatchObject({
      code: 'IMPORT_DOWNLOAD_CANCELLED',
      publicMessage: '這首曲目已停止下載。',
    });
    expect(harness.recordDiagnostic).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DOWNLOAD_FAILED' }),
    );
  });

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
    expect(harness.enforceLibraryStoragePolicy).toHaveBeenCalledWith({
      protectedTrackIds: ['dQw4w9WgXcQ'],
    });
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

  it('keeps a successful download when automatic storage cleanup fails', async () => {
    const enforceLibraryStoragePolicy = vi
      .fn()
      .mockRejectedValue(new Error('private cleanup failure'));
    const harness = registerDownload({ enforceLibraryStoragePolicy });

    await expect(
      harness.handlers.get('yt:download-audio')(null, 'dQw4w9WgXcQ'),
    ).resolves.toMatchObject({ title: 'Song' });
    expect(harness.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'library-storage',
        operation: 'auto-cleanup',
        code: 'LIBRARY_STORAGE_AUTO_CLEANUP_FAILED',
      }),
    );
  });
});
