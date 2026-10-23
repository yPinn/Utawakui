import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
}));

const originalArgv = [...process.argv];
const originalModuleLoad = Module._load;

const MAIN_INVOKE_CHANNELS = [
  'app-update:check',
  'app-update:download',
  'app-update:get-status',
  'app-update:install',
  'app-usage:get-status',
  'app:get-version',
  'bgm-standby:get',
  'bgm-standby:set-track',
  'bgm-standby:update-position',
  'bgm-standby:update-settings',
  'config:choose-download-dir',
  'config:get',
  'config:get-capture-device',
  'config:get-audio-preferences',
  'config:get-sidebar-width',
  'config:get-ui-theme',
  'config:get-obs-arrangement-dock',
  'config:set-obs-arrangement-dock',
  'config:get-auto-music-analysis',
  'config:get-separation-gpu-acceleration',
  'config:get-app-update-auto-check',
  'config:get-window-close-behavior',
  'config:get-announcement-seen-version',
  'config:open-download-dir',
  'config:reset-download-dir',
  'config:set-capture-device',
  'config:set-audio-preferences',
  'config:set-sidebar-width',
  'config:set-ui-theme',
  'config:set-auto-music-analysis',
  'config:set-separation-gpu-acceleration',
  'config:set-app-update-auto-check',
  'config:set-window-close-behavior',
  'config:set-announcement-seen-version',
  'diagnostics:clear',
  'diagnostics:export',
  'diagnostics:list-recent',
  'diagnostics:open-folder',
  'diagnostics:record-renderer',
  'feature-dependencies:detect-system-ffmpeg',
  'feature-dependencies:list',
  'feature-dependencies:prepare',
  'feature-dependencies:remove',
  'feature-dependencies:repair',
  'feature-dependencies:set-ffmpeg-source',
  'feature-gates:confirm',
  'feature-gates:list',
  'feedback:build-preview',
  'feedback:export-fallback',
  'feedback:submit',
  'folder-page-objects:choose-photo',
  'folder-page-objects:create-note',
  'folder-page-objects:list',
  'folder-page-objects:remove',
  'folder-page-objects:save-layout',
  'folder-page-objects:update-note',
  'folder-page-objects:update-photo-text',
  'import:clipboard-suggestion',
  'import:resolve-source',
  'library:apply-artist-identity-candidate',
  'library:apply-artist-photo-candidate',
  'library:auto-resolve-artist-identities',
  'library:cancel-artist-identity-candidates',
  'library:cancel-artist-photo-candidates',
  'library:choose-track-artwork-draft',
  'library:cancel-track-artwork-search',
  'library:choose-artist-photo',
  'library:clear-artist-photo',
  'library:delete-track',
  'library:get-artist-index',
  'library:import-audio-files',
  'library:convert-local-audio-files',
  'library:list',
  'library:load-artist-photo-candidate-preview',
  'library:load-track-artwork-preview',
  'library:discard-track-artwork-draft',
  'library:merge-artists',
  'library:open-track-artwork-source',
  'library:resolve-artist-photo',
  'library:search-artist-identity-candidates',
  'library:search-artist-photo-candidates',
  'library:search-track-artwork',
  'library:save-track-edits',
  'library:set-artist-display-name',
  'library:split-artist-credit',
  'library:undo-artist-organization',
  'library-storage:cleanup',
  'library-storage:get',
  'library-storage:set-policy',
  'lyrics:backfill-source-labels',
  'lyrics:delete-reading',
  'lyrics:delete-source',
  'lyrics:generate-reading',
  'lyrics:get-acoustic-estimate',
  'lyrics-acoustic:status',
  'lyrics-acoustic:prepare',
  'lyrics-acoustic:verify',
  'lyrics-acoustic:repair',
  'lyrics-acoustic:remove',
  'lyrics-acoustic:cancel',
  'lyrics-research:status',
  'lyrics-research:prepare',
  'lyrics-research:verify',
  'lyrics-research:remove',
  'lyrics-research:cancel',
  'lyrics-research:inspect',
  'lyrics-research:preview',
  'lyrics-experimental:status',
  'lyrics-experimental:enable',
  'lyrics-experimental:cancel',
  'lyrics-experimental:retry',
  'lyrics-experimental:estimate',
  'lyrics:get-reading',
  'lyrics:get-track',
  'lyrics:import-file',
  'lyrics:import-text',
  'lyrics:probe-musixmatch',
  'lyrics:save-candidate',
  'lyrics:save-provider-candidate',
  'lyrics:save-timing',
  'lyrics:search-candidates',
  'lyrics:search-provider-candidates',
  'lyrics:set-reading-line',
  'lyrics:set-source-label',
  'lyrics:set-source-offset',
  'lyrics:set-preferred-source',
  'music-structure:analyze-track',
  'music-structure:cancel-analysis',
  'music-structure:cancel-batch',
  'music-structure:get-analysis-status',
  'music-structure:get-batch-status',
  'music-structure:get-capability-status',
  'music-structure:get-track',
  'music-structure:open-benchmark-review',
  'music-structure:open-reference-annotation',
  'music-structure:prepare-capability',
  'music-structure:remove-capability',
  'music-structure:repair-capability',
  'music-structure:save-reference-annotation',
  'music-structure:start-batch',
  'obs:add-marker',
  'obs:clear-password',
  'obs:connect',
  'obs:copy-text',
  'obs:disconnect',
  'obs:get-latest-session',
  'obs:get-settings',
  'obs:get-status',
  'obs:update-settings',
  'output-slots:list',
  'output-slots:set-recent-colors',
  'output-slots:set-saved-colors',
  'output-slots:upsert',
  'output:connect-source',
  'output:copy-url',
  'output-window:open',
  'output:get-settings',
  'output:get-status',
  'output:publish',
  'output:start',
  'output:stop',
  'output:suggest-ports',
  'output:update-settings',
  'performer-view:close',
  'performer-view:get-status',
  'performer-view:open',
  'performer-view:publish',
  'performance-session-plan:append-placeholders',
  'performance-session-plan:archive',
  'performance-session-plan:get-session',
  'performance-session-plan:preview-playlist',
  'performance-session-plan:save-playlist',
  'session-history:confirmed-playing',
  'performance-session-plan:append-library-track',
  'performance-session-plan:append-manual-item',
  'performance-session-plan:clear',
  'performance-session-plan:duplicate-item',
  'performance-session-plan:get',
  'performance-session-plan:move-item',
  'performance-session-plan:reorder-item',
  'performance-session-plan:remove-item',
  'performance-session-plan:replace-from-collection',
  'performance-session-plan:append-from-collection',
  'performance-session-plan:append-from-archive',
  'performance-session-plan:set-review-cursor',
  'performance-session-plan:set-progress',
  'performance-session-plan:update-item',
  'playback-history:clear',
  'playback-history:get',
  'playback-history:record',
  'playback-resume:get',
  'playback-resume:save',
  'playback-usage:get-play-counts',
  'playlists:choose-cover',
  'playlists:clear-cover',
  'playlists:create',
  'playlists:delete',
  'playlists:list',
  'playlists:rename',
  'playlists:reorder',
  'playlists:set-description',
  'playlists:set-kind',
  'playlists:set-tracks',
  'playlists:upsert-album',
  'provider-discovery:open-youtube-music-search',
  'separation:cancel',
  'separation:clear-pending',
  'separation:clear-completed',
  'separation:enqueue',
  'separation:get-queue-status',
  'separation:move-queue-item',
  'separation:pause-queue',
  'separation:remove-queue-item',
  'separation:resume-queue',
  'separation:retry-queue-item',
  'separation:run',
  'separation:select',
  'shell:open-external',
  'spout-output:get-status',
  'spout-output:set-frame-rate-profile',
  'spout-output:start',
  'spout-output:stop',
  'window-close:present',
  'window-close:respond',
  'yt:download-audio',
  'yt:cancel-download',
  'yt:fetch-metadata',
  'yt:fetch-playlist',
  'yt:resolve-import-source',
].sort();

const MAIN_EVENT_CHANNELS = [
  'app:history-command',
  'app:navigate',
  'app-update:status',
  'app-usage:status',
  'feature-dependencies:progress',
  'feature-dependencies:updated',
  'library:backfill-status',
  'library:updated',
  'lyrics:reading-progress',
  'lyrics-experimental:completed',
  'music-structure:analysis-progress',
  'music-structure:batch-progress',
  'music-structure:capability-progress',
  'obs:status',
  'performer-view:status',
  'performer-view:lyrics-offset-intent',
  'performer-view:control-intent',
  'player:command',
  'separation:progress',
  'separation:queue-progress',
  'spout-output:status',
  'ui-density:changed',
  'window-close:dismiss',
  'window-close:error',
  'window-close:request',
].sort();

async function loadBridge(modulePath, worldName, args = []) {
  vi.resetModules();
  process.argv = ['electron', 'app', ...args];
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electron;
    return originalModuleLoad.call(this, request, parent, isMain);
  };
  try {
    await import(modulePath);
  } finally {
    Module._load = originalModuleLoad;
  }
  const exposure = electron.contextBridge.exposeInMainWorld.mock.calls.findLast(
    ([name]) => name === worldName,
  );
  expect(exposure).toBeDefined();
  return exposure[1];
}

function uniqueChannels(mock) {
  return [...new Set(mock.mock.calls.map(([channel]) => channel))].sort();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.argv = [...originalArgv];
  Module._load = originalModuleLoad;
  vi.resetModules();
});

describe('main preload bridge', () => {
  it('disposes the lyrics completion listener without returning an IPC object across isolation', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    const callback = vi.fn();
    const dispose = bridge.onExperimentalLyricsCompleted(callback);
    electron.ipcRenderer.removeListener.mockReturnValueOnce({
      internal: () => {},
    });
    expect(dispose()).toBeUndefined();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'lyrics-experimental:completed',
      expect.any(Function),
    );
  });
  it('forwards only bounded session/export/performance intents, stripping renderer paths and forged timeline/track lists', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    const extra = {
      path: 'private',
      trackIds: ['spoofed'],
      timeline: [{ timecode: 'fake' }],
    };
    await bridge.archivePerformanceSession({
      sessionId: 'show',
      name: 'Show',
      ...extra,
    });
    await bridge.getPerformanceSession('show', 'private');
    await bridge.previewPerformancePlaylist({
      sessionId: 'show',
      scope: 'completed',
      ...extra,
    });
    await bridge.savePerformancePlaylist({
      sessionId: 'show',
      scope: 'all',
      token: 'preview',
      name: 'Next',
      ...extra,
    });
    await bridge.observeConfirmedPerformance({
      epoch: 'epoch',
      playbackRevision: 2,
      trackId: 'song',
      ...extra,
    });
    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['performance-session-plan:archive', { sessionId: 'show', name: 'Show' }],
      ['performance-session-plan:get-session', { sessionId: 'show' }],
      [
        'performance-session-plan:preview-playlist',
        { sessionId: 'show', scope: 'completed' },
      ],
      [
        'performance-session-plan:save-playlist',
        { sessionId: 'show', scope: 'all', token: 'preview', name: 'Next' },
      ],
      [
        'session-history:confirmed-playing',
        { epoch: 'epoch', playbackRevision: 2, trackId: 'song' },
      ],
    ]);
  });
  it('requires only Electron, as a sandboxed preload must', () => {
    // Any other require fails at load and leaves the window without a bridge.
    const source = readFileSync(
      new URL('./preload.js', import.meta.url),
      'utf8',
    );
    const requires = [
      ...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/gu),
    ].map((match) => match[1]);
    expect(requires).toEqual(['electron']);
  });

  it('exposes a fixed no-payload Performer close intent', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    await bridge.closePerformerView({ privateWindowId: 42 });

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'performer-view:close',
    );
  });

  it('parses only bounded initial renderer arguments', async () => {
    const defaults = await loadBridge('./preload.js', 'Utawakui', [
      '--ui-theme=unknown',
      '--ui-density=dense',
      '--sidebar-width=Infinity',
      '--capture-device-id=',
      '--performance-volume=Infinity',
      '--performance-muted=invalid',
      '--monitor-guide-vocal-level=-1',
      '--capture-guide-vocal-level=2',
    ]);
    expect(defaults).toMatchObject({
      initialUiTheme: 'light',
      initialUiDensity: 'compact',
      initialSidebarWidth: 64,
      initialCaptureDeviceId: null,
      // Preload relays raw values; the renderer bounds them and fills defaults.
      initialAudioPreferences: {
        performanceVolume: undefined,
        performanceMuted: undefined,
        monitorGuideVocalLevel: -1,
        captureGuideVocalLevel: 2,
      },
      startupTraceEnabled: false,
    });

    const configured = await loadBridge('./preload.js', 'Utawakui', [
      '--ui-theme=light',
      '--ui-density=standard',
      '--sidebar-width=320',
      '--capture-device-id=device-1',
      '--performance-volume=0.72',
      '--performance-muted=1',
      '--monitor-guide-vocal-level=0.35',
      '--capture-guide-vocal-level=0.15',
      '--startup-trace-enabled=1',
    ]);
    expect(configured).toMatchObject({
      initialUiTheme: 'light',
      initialUiDensity: 'standard',
      initialSidebarWidth: 320,
      initialCaptureDeviceId: 'device-1',
      initialAudioPreferences: {
        performanceVolume: 0.72,
        performanceMuted: true,
        monitorGuideVocalLevel: 0.35,
        captureGuideVocalLevel: 0.15,
      },
      startupTraceEnabled: true,
    });
  });

  it('relays dark theme and explicitly unmuted audio at startup', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui', [
      '--ui-theme=dark',
      '--performance-muted=0',
    ]);

    expect(bridge.initialUiTheme).toBe('dark');
    expect(bridge.initialAudioPreferences.performanceMuted).toBe(false);
  });

  it('forwards only the bounded density payload from the fixed event channel', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    const callback = vi.fn();
    const cleanup = bridge.onUiDensityChanged(callback);
    const listener = electron.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'ui-density:changed',
    )[1];

    listener({ sender: 'private-web-contents' }, 'wide');
    expect(callback).not.toHaveBeenCalled();

    listener({ sender: 'private-web-contents' }, 'standard');
    expect(callback).toHaveBeenCalledWith('standard');

    cleanup();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'ui-density:changed',
      listener,
    );
  });

  it('bounds local arrangement progress to an occurrence, revision and state', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    await bridge.setPerformanceSessionPlanProgress({
      itemId: 'i1',
      expectedProgressRevision: 2,
      progress: 'completed',
      path: 'private',
      trackId: 'spoofed',
      url: 'private',
    });
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'performance-session-plan:set-progress',
      { itemId: 'i1', expectedProgressRevision: 2, progress: 'completed' },
    );
  });
  it('allows only occurrence identities and a bounded drag position across the reorder bridge', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    await bridge.reorderPerformanceSessionPlanItem({
      itemId: 'i1',
      targetItemId: 'i2',
      position: 'after',
      trackId: 'spoofed',
      url: 'private',
      path: 'private',
    });
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'performance-session-plan:reorder-item',
      { itemId: 'i1', targetItemId: 'i2', position: 'after' },
    );
  });

  it('forwards the canonical lyrics identity when loading a reading', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    const identity = {
      documentId: 'lyr_document',
      normalizerProfileId: 'lyrics-source-v2',
      sourceFingerprint: 'a'.repeat(64),
      lines: [{ lineId: 'line_1', text: '歌う声' }],
    };

    await bridge.getLyricsReading('track-1', 'main.lrc', identity);

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'lyrics:get-reading',
      'track-1',
      'main.lrc',
      identity,
    );
  });

  it('forwards only artist and opaque candidate ids for online artist photos', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.searchArtistPhotoCandidates(
      'artist-0123456789abcdef',
      'https://example.test/private',
    );
    bridge.cancelArtistPhotoCandidates('artist-0123456789abcdef', {
      query: 'private',
    });
    bridge.loadArtistPhotoCandidatePreview(
      'artist-0123456789abcdef',
      'candidate_abcdefghijklmn',
      'https://yt3.googleusercontent.com/private',
    );
    bridge.applyArtistPhotoCandidate(
      'artist-0123456789abcdef',
      'candidate_abcdefghijklmn',
      { path: 'C:\\private' },
    );

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['library:search-artist-photo-candidates', 'artist-0123456789abcdef'],
      ['library:cancel-artist-photo-candidates', 'artist-0123456789abcdef'],
      [
        'library:load-artist-photo-candidate-preview',
        'artist-0123456789abcdef',
        'candidate_abcdefghijklmn',
      ],
      [
        'library:apply-artist-photo-candidate',
        'artist-0123456789abcdef',
        'candidate_abcdefghijklmn',
      ],
    ]);
  });

  it('requests an import clipboard suggestion without forwarding renderer arguments', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    await bridge.getImportClipboardSuggestion('private text', {
      channel: 'arbitrary',
    });
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'import:clipboard-suggestion',
    );
  });

  it('exposes only fixed invoke, send, and subscription channels', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui', [
      '--startup-trace-enabled=1',
    ]);
    const cleanups = [];

    for (const [name, method] of Object.entries(bridge)) {
      if (typeof method !== 'function') continue;
      const result = name.startsWith('on')
        ? method(vi.fn())
        : method('first', 'second', 'third', 'fourth');
      if (typeof result === 'function') cleanups.push(result);
    }

    expect(uniqueChannels(electron.ipcRenderer.invoke)).toEqual(
      MAIN_INVOKE_CHANNELS,
    );
    expect(uniqueChannels(electron.ipcRenderer.send)).toEqual([
      'player:state',
      'startup-trace:milestone',
    ]);
    expect(uniqueChannels(electron.ipcRenderer.on)).toEqual(
      MAIN_EVENT_CHANNELS,
    );
    expect(bridge).not.toHaveProperty('ipcRenderer');
    expect(bridge).not.toHaveProperty('loadLyricsProviderReview');
    expect(bridge).not.toHaveProperty('saveLyricsProviderReviewDecision');
    expect(bridge).not.toHaveProperty('exportLyricsProviderReviewCorpus');
    expect(bridge).not.toHaveProperty('runLyricsProviderReviewLookupAction');

    for (const cleanup of cleanups) cleanup();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledTimes(
      MAIN_EVENT_CHANNELS.length,
    );
  });

  it('adds only the fixed lyrics review intents for the internal development preload', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui', [
      '--internal-workbenches-enabled=1',
    ]);

    expect(bridge.loadLyricsProviderReview).toEqual(expect.any(Function));
    expect(bridge.saveLyricsProviderReviewDecision).toEqual(
      expect.any(Function),
    );
    expect(bridge.exportLyricsProviderReviewCorpus).toEqual(
      expect.any(Function),
    );
    expect(bridge.runLyricsProviderReviewLookupAction).toEqual(
      expect.any(Function),
    );

    await bridge.loadLyricsProviderReview('E:\\untrusted\\candidates.json');
    await bridge.saveLyricsProviderReviewDecision(
      { candidateId: 'candidate-0000000000000001', decision: 'approved' },
      'E:\\untrusted\\reviews.json',
    );
    await bridge.exportLyricsProviderReviewCorpus('E:\\untrusted\\corpus.json');
    await bridge.runLyricsProviderReviewLookupAction(
      {
        candidateId: 'candidate-0000000000000001',
        action: 'copy-recording-mbid',
      },
      'arbitrary text',
      'https://untrusted.example',
    );

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['lyrics-provider-review:load'],
      [
        'lyrics-provider-review:save-decision',
        { candidateId: 'candidate-0000000000000001', decision: 'approved' },
      ],
      ['lyrics-provider-review:export'],
      [
        'lyrics-provider-review:lookup-action',
        {
          candidateId: 'candidate-0000000000000001',
          action: 'copy-recording-mbid',
        },
      ],
    ]);
  });

  it('shapes bounded intents and strips the private event object', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.startMusicStructureBatch(['track-1'], true);
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'music-structure:start-batch',
      { trackIds: ['track-1'], force: true },
    );

    bridge.enqueueSeparations(
      ['track-1', 'track-2'],
      'general',
      true,
      'E:\\private',
    );
    bridge.moveSeparationQueueItem('item-1', -1, 'ignored');
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'separation:enqueue',
      {
        trackIds: ['track-1', 'track-2'],
        recipeId: 'general',
        regenerate: true,
      },
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'separation:move-queue-item',
      'item-1',
      -1,
    );

    const page = { kind: 'playlist', id: 'playlist-1' };
    bridge.listFolderPageObjects({ ...page, sourcePath: 'C:\\private' });
    bridge.chooseFolderPagePhoto({
      ...page,
      url: 'https://untrusted.example/photo.png',
    });
    bridge.saveFolderPageLayout({
      page,
      entries: [
        {
          key: 'photo:asset-1',
          placement: {
            region: 'side',
            anchor: { x: 0.5, y: 0.25, private: true },
            sourcePath: 'C:\\private',
          },
          pinned: true,
          order: 3,
          imageUrl: 'https://untrusted.example/photo.png',
        },
        {
          key: 'derived:artist-summary',
          type: 'note',
          placement: { region: 'bottom', anchor: { x: 0.1, y: 0.15 } },
          pinned: false,
          rotation: -1.5,
          order: 1,
        },
      ],
      executable: 'private.exe',
    });
    bridge.saveFolderPageLayout();
    bridge.createFolderPageNote({
      page,
      title: 't'.repeat(90),
      text: 'private',
      sourcePath: 'private.txt',
    });
    bridge.updateFolderPageNote({
      page,
      key: 'note:note-1',
      text: 'x'.repeat(2100),
      executable: 'private.exe',
    });
    bridge.updateFolderPageNote({ page, key: 'note:note-1', text: 42 });
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'folder-page-objects:create-note',
      { page, title: 't'.repeat(80), text: 'private', paper: '' },
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'folder-page-objects:update-note',
      {
        page,
        key: 'note:note-1',
        title: '',
        text: 'x'.repeat(2000),
        paper: '',
      },
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'folder-page-objects:update-note',
      { page, key: 'note:note-1', title: '', text: '', paper: '' },
    );
    bridge.updateFolderPagePhotoText({
      page,
      key: 'photo:asset-1',
      label: 'l'.repeat(30),
      caption: 'c'.repeat(120),
      sourcePath: 'private.png',
    });
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'folder-page-objects:update-photo-text',
      {
        page,
        key: 'photo:asset-1',
        label: 'l'.repeat(16),
        captionTitle: '',
        caption: 'c'.repeat(120),
        captionPaper: '',
      },
    );
    bridge.removeFolderPageObject({
      page,
      key: 'photo:asset-1',
      executable: 'private.exe',
    });
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'folder-page-objects:list',
      page,
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'folder-page-objects:choose-photo',
      page,
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'folder-page-objects:save-layout',
      {
        page,
        entries: [
          {
            key: 'photo:asset-1',
            placement: { region: 'side', anchor: { x: 0.5, y: 0.25 } },
            pinned: true,
            order: 3,
          },
          {
            key: 'derived:artist-summary',
            type: 'note',
            placement: { region: 'bottom', anchor: { x: 0.1, y: 0.15 } },
            pinned: false,
            rotation: -1.5,
            order: 1,
          },
        ],
      },
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'folder-page-objects:save-layout',
      { page: { kind: undefined, id: undefined }, entries: [] },
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'folder-page-objects:remove',
      { page, key: 'photo:asset-1' },
    );

    bridge.openMusicAnalysisReferenceAnnotation('E:\\untrusted\\run.json');
    bridge.saveMusicAnalysisReferenceAnnotation(
      { sessionId: 'session-1', cases: [] },
      'E:\\untrusted\\reference-worklist.json',
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'music-structure:open-reference-annotation',
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'music-structure:save-reference-annotation',
      { sessionId: 'session-1', cases: [] },
    );

    const callback = vi.fn();
    const cleanup = bridge.onSeparationProgress(callback);
    const listener = electron.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'separation:progress',
    )[1];
    listener({ sender: 'private-web-contents' }, { progress: 0.5 });
    expect(callback).toHaveBeenCalledWith({ progress: 0.5 });

    bridge.updateOutputRecentColors(
      ['#aabbcc', '#112233'],
      'E:\\private\\colors.json',
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'output-slots:set-recent-colors',
      ['#aabbcc', '#112233'],
    );
    bridge.updateOutputSavedColors(
      ['#445566', '#aabbcc'],
      'E:\\private\\palette.json',
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'output-slots:set-saved-colors',
      ['#445566', '#aabbcc'],
    );

    const queueCallback = vi.fn();
    const cleanupQueue = bridge.onSeparationQueueProgress(queueCallback);
    const queueListener = electron.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'separation:queue-progress',
    )[1];
    queueListener(
      { sender: 'private-web-contents' },
      { queue: { status: 'running', items: [] } },
    );
    expect(queueCallback).toHaveBeenCalledWith({
      queue: { status: 'running', items: [] },
    });

    cleanup();
    cleanupQueue();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'separation:progress',
      listener,
    );
  });

  it('forwards only the fixed history traversal intents', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    const callback = vi.fn();
    const unsubscribe = bridge.onHistoryCommand(callback);
    const listener = electron.ipcRenderer.on.mock.calls.findLast(
      ([channel]) => channel === 'app:history-command',
    )[1];

    listener({ sender: 'private' }, 'back');
    listener({ sender: 'private' }, 'forward');
    listener({ sender: 'private' }, 'reload');
    listener({ sender: 'private' }, { direction: 'back' });

    expect(callback.mock.calls).toEqual([['back'], ['forward']]);
    unsubscribe();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'app:history-command',
      listener,
    );
  });

  it('bounds folder note and photo text without forwarding private fields', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    const page = { kind: 'playlist', id: 'playlist-1' };

    await bridge.createFolderPageNote({
      page,
      title: 'Note',
      text: 'Text',
      paper: 'p'.repeat(17),
      privatePath: 'private',
    });
    await bridge.updateFolderPagePhotoText({
      page,
      key: 'photo:asset-1',
      label: 'Photo',
      captionTitle: 't'.repeat(81),
      caption: 'c'.repeat(2001),
      captionPaper: 'p'.repeat(17),
      privatePath: 'private',
    });

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      [
        'folder-page-objects:create-note',
        { page, title: 'Note', text: 'Text', paper: 'p'.repeat(16) },
      ],
      [
        'folder-page-objects:update-photo-text',
        {
          page,
          key: 'photo:asset-1',
          label: 'Photo',
          captionTitle: 't'.repeat(80),
          caption: 'c'.repeat(2000),
          captionPaper: 'p'.repeat(16),
        },
      ],
    ]);
  });

  it('shapes an absent folder layout entry without inventing optional fields', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    const page = { kind: 'playlist', id: 'playlist-1' };

    await bridge.saveFolderPageLayout({ page, entries: [null] });

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith(
      'folder-page-objects:save-layout',
      {
        page,
        entries: [
          {
            key: undefined,
            placement: {
              region: undefined,
              anchor: { x: undefined, y: undefined },
            },
            pinned: undefined,
            order: undefined,
          },
        ],
      },
    );
  });

  it('shapes close decisions and forwards only fixed shell navigation events', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    const requestCallback = vi.fn();
    const dismissCallback = vi.fn();
    const errorCallback = vi.fn();
    const navigationCallback = vi.fn();
    bridge.onWindowCloseRequest(requestCallback);
    bridge.onWindowCloseDismiss(dismissCallback);
    bridge.onWindowCloseError(errorCallback);
    bridge.onAppNavigation(navigationCallback);

    const listeners = new Map(
      electron.ipcRenderer.on.mock.calls.map(([channel, listener]) => [
        channel,
        listener,
      ]),
    );
    listeners.get('window-close:request')(
      { sender: 'private' },
      { requestId: 'invalid' },
    );
    listeners.get('window-close:request')(
      { sender: 'private' },
      { requestId: '11111111-1111-4111-8111-111111111111' },
    );
    listeners.get('window-close:request')(
      { sender: 'private' },
      {
        requestId: '22222222-2222-4222-8222-222222222222',
        activeWork: 'separation',
      },
    );
    listeners.get('window-close:dismiss')(
      { sender: 'private' },
      { requestId: '11111111-1111-4111-8111-111111111111' },
    );
    listeners.get('window-close:error')(
      { sender: 'private' },
      { title: '錯誤', message: '說明', privatePath: 'E:\\private' },
    );
    listeners.get('window-close:error')(
      { sender: 'private' },
      { title: '無法在背景執行', message: '視窗會保持開啟。' },
    );
    listeners.get('app:navigate')({ sender: 'private' }, 'library');
    listeners.get('app:navigate')({ sender: 'private' }, 'settings');

    expect(requestCallback).toHaveBeenCalledTimes(2);
    expect(requestCallback).toHaveBeenLastCalledWith({
      requestId: '22222222-2222-4222-8222-222222222222',
      activeWork: 'separation',
    });
    expect(dismissCallback).toHaveBeenCalledTimes(1);
    expect(errorCallback).toHaveBeenCalledOnce();
    expect(errorCallback).toHaveBeenCalledWith({
      title: '無法在背景執行',
      message: '視窗會保持開啟。',
    });
    expect(navigationCallback).toHaveBeenCalledWith('settings');

    await bridge.presentWindowCloseRequest(
      '11111111-1111-4111-8111-111111111111',
      'ignored',
    );
    await bridge.respondWindowCloseRequest(
      '11111111-1111-4111-8111-111111111111',
      {
        action: 'tray',
        remember: true,
        privatePath: 'E:\\private',
      },
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'window-close:present',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'window-close:respond',
      {
        requestId: '11111111-1111-4111-8111-111111111111',
        action: 'tray',
        remember: true,
      },
    );
  });

  it.each([
    ['onWindowCloseRequest', 'window-close:request'],
    ['onWindowCloseDismiss', 'window-close:dismiss'],
  ])(
    'filters malformed close events and cleans up %s',
    async (method, channel) => {
      const bridge = await loadBridge('./preload.js', 'Utawakui');
      const callback = vi.fn();
      const unsubscribe = bridge[method](callback);
      const listener = electron.ipcRenderer.on.mock.calls.find(
        ([name]) => name === channel,
      )[1];
      const requestId = '11111111-1111-4111-8111-111111111111';

      for (const payload of [
        undefined,
        null,
        'request',
        [],
        {},
        { requestId: 42 },
        { requestId: 'invalid' },
        { requestId, activeWork: 'unknown' },
        { requestId, privatePath: 'private' },
        { requestId, activeWork: 'separation', privatePath: 'private' },
      ]) {
        listener({ sender: 'private' }, payload);
      }
      expect(callback).not.toHaveBeenCalled();

      const payload = { requestId, activeWork: 'separation' };
      listener({ sender: 'private' }, payload);
      expect(callback.mock.calls).toEqual([[payload]]);

      unsubscribe();
      expect(
        electron.ipcRenderer.removeListener,
      ).toHaveBeenCalledExactlyOnceWith(channel, listener);
    },
  );

  it('rejects malformed close errors but accepts the exact public text limits', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    const callback = vi.fn();
    const unsubscribe = bridge.onWindowCloseError(callback);
    const listener = electron.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'window-close:error',
    )[1];

    for (const payload of [
      undefined,
      null,
      'error',
      [],
      {},
      { title: 'Error' },
      { title: 'Error', message: 'Message', privatePath: 'private' },
      { title: 42, message: 'Message' },
      { title: '', message: 'Message' },
      { title: 't'.repeat(121), message: 'Message' },
      { title: 'Error', message: 42 },
      { title: 'Error', message: '' },
      { title: 'Error', message: 'm'.repeat(501) },
    ]) {
      listener({ sender: 'private' }, payload);
    }
    expect(callback).not.toHaveBeenCalled();

    const payload = { title: 't'.repeat(120), message: 'm'.repeat(500) };
    listener({ sender: 'private' }, payload);
    expect(callback.mock.calls).toEqual([[payload]]);

    unsubscribe();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledExactlyOnceWith(
      'window-close:error',
      listener,
    );
  });

  it.each([undefined, null])(
    'does not invent a missing close decision (%s)',
    async (decision) => {
      const bridge = await loadBridge('./preload.js', 'Utawakui');
      const requestId = '11111111-1111-4111-8111-111111111111';

      await bridge.respondWindowCloseRequest(requestId, decision);

      expect(electron.ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith(
        'window-close:respond',
        { requestId, action: undefined, remember: undefined },
      );
    },
  );

  it('forwards only dependency ids and the FFmpeg source intent', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.listFeatureDependencies('ignored');
    bridge.prepareFeatureDependency('ffmpeg-gyan-essentials', 'ignored-path');
    bridge.removeFeatureDependency('ffmpeg-gyan-essentials', 'ignored-path');
    bridge.repairFeatureDependency('ffmpeg-gyan-essentials', 'ignored-path');
    bridge.detectSystemFfmpeg('ignored-path');
    bridge.setFfmpegSource(true, 'C:\\untrusted\\ffmpeg.exe');

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['feature-dependencies:list'],
      ['feature-dependencies:prepare', 'ffmpeg-gyan-essentials'],
      ['feature-dependencies:remove', 'ffmpeg-gyan-essentials'],
      ['feature-dependencies:repair', 'ffmpeg-gyan-essentials'],
      ['feature-dependencies:detect-system-ffmpeg'],
      ['feature-dependencies:set-ffmpeg-source', true],
    ]);
  });

  it('forwards only an opaque local conversion review id', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.convertLocalAudioFiles(
      '11111111-1111-4111-8111-111111111111',
      ['C:\\Users\\Singer\\Private\\song.wma'],
      { codec: 'arbitrary' },
    );

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'library:convert-local-audio-files',
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it.each([undefined, null, 42, { sessionId: 'untrusted', path: 'private' }])(
    'never forwards a non-string conversion session id (%s)',
    async (sessionId) => {
      const bridge = await loadBridge('./preload.js', 'Utawakui');

      await bridge.convertLocalAudioFiles(sessionId);

      expect(electron.ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith(
        'library:convert-local-audio-files',
        '',
      );
    },
  );

  it('defaults music analysis batches to non-forced while preserving an explicit force intent', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    const trackIds = ['track-1'];

    await bridge.startMusicStructureBatch(trackIds);
    await bridge.startMusicStructureBatch(trackIds, true);

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['music-structure:start-batch', { trackIds, force: false }],
      ['music-structure:start-batch', { trackIds, force: true }],
    ]);
  });

  it('shapes artist organization intents without provider ids or paths', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    const stableId = 'artist-123e4567-e89b-42d3-a456-426614174000';

    bridge.mergeArtists(
      ['artist-68d52f69a4a24a1a', 'artist-882cd3bcbb49699f'],
      4,
      'E:\\private',
    );
    bridge.splitArtistCredit(
      stableId,
      'credit-68d52f69a4a24a1a',
      5,
      'raw ignored',
    );
    bridge.setArtistDisplayName(stableId, '林俊傑', 6, {
      mbid: 'ignored',
    });
    bridge.undoArtistOrganization(7, { privateState: true });
    bridge.autoResolveArtistIdentities({
      directory: 'E:\\private',
      artistIds: ['ignored'],
    });
    bridge.searchArtistIdentityCandidates(stableId, {
      query: 'ignored',
      mbid: 'ignored',
    });
    bridge.cancelArtistIdentityCandidates(stableId, 'ignored');
    bridge.applyArtistIdentityCandidate(
      stableId,
      'candidate_0123456789abcdef012345',
      8,
      { mbid: 'ignored', sourceUrl: 'ignored' },
    );

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      [
        'library:merge-artists',
        {
          artistIds: ['artist-68d52f69a4a24a1a', 'artist-882cd3bcbb49699f'],
          expectedRevision: 4,
        },
      ],
      [
        'library:split-artist-credit',
        {
          artistId: stableId,
          creditId: 'credit-68d52f69a4a24a1a',
          expectedRevision: 5,
        },
      ],
      [
        'library:set-artist-display-name',
        {
          artistId: stableId,
          displayName: '林俊傑',
          expectedRevision: 6,
        },
      ],
      ['library:undo-artist-organization', { expectedRevision: 7 }],
      ['library:auto-resolve-artist-identities'],
      ['library:search-artist-identity-candidates', stableId],
      ['library:cancel-artist-identity-candidates', stableId],
      [
        'library:apply-artist-identity-candidate',
        {
          artistId: stableId,
          candidateId: 'candidate_0123456789abcdef012345',
          expectedRevision: 8,
        },
      ],
    ]);
  });

  it('shapes playback history and resume intents without private media fields', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.setPlaybackState({
      isPlaying: true,
      hasTrack: true,
      trackId: 'track-a',
      privatePath: 'E:\\private.wav',
    });
    bridge.recordRecentPlayback(
      'track-a',
      {
        sourceId: 'playlist-1',
        sourceName: '深夜練唱',
        privatePath: 'E:\\private.wav',
      },
      'ignored',
    );
    bridge.getPlaybackPlayCounts('ignored');
    bridge.savePlaybackResumeSnapshot({
      currentTrackId: 'track-a',
      positionSeconds: 12,
      volume: 0.5,
      isMuted: false,
      playbackMode: 'sequence',
      privateUrl: 'file:///private.wav',
      queue: {
        sourceTrackIds: ['track-a'],
        queuedTrackIds: [],
        historyEntries: [],
        currentIsSource: true,
        lastSourceTrackId: 'track-a',
        sourceName: '深夜練唱',
        sourceId: 'playlist-1',
        isShuffle: false,
        orderIds: ['track-a'],
        privatePath: 'E:\\private.wav',
      },
    });

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'playback-history:record',
      'track-a',
      { sourceId: 'playlist-1', sourceName: '深夜練唱' },
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'playback-usage:get-play-counts',
    );
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'playback-resume:save',
      {
        currentTrackId: 'track-a',
        positionSeconds: 12,
        playbackMode: 'sequence',
        queue: {
          sourceTrackIds: ['track-a'],
          queuedTrackIds: [],
          historyEntries: [],
          currentIsSource: true,
          lastSourceTrackId: 'track-a',
          sourceName: '深夜練唱',
          sourceId: 'playlist-1',
          isShuffle: false,
          orderIds: ['track-a'],
        },
      },
    );
    expect(electron.ipcRenderer.send).toHaveBeenCalledWith('player:state', {
      isPlaying: true,
      hasTrack: true,
      trackId: 'track-a',
    });
  });

  it('preserves null as the explicit playback resume reset intent', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    await bridge.savePlaybackResumeSnapshot(null);

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith(
      'playback-resume:save',
      null,
    );
  });

  it('shapes audio preferences without forwarding arbitrary config fields', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.setAudioPreferences({
      performanceVolume: 0.72,
      performanceMuted: true,
      monitorGuideVocalLevel: 0.35,
      captureGuideVocalLevel: 0.15,
      privatePath: 'E:\\private.wav',
    });

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'config:set-audio-preferences',
      {
        performanceVolume: 0.72,
        performanceMuted: true,
        monitorGuideVocalLevel: 0.35,
        captureGuideVocalLevel: 0.15,
      },
    );
  });

  it('shapes library storage policy without accepting paths or arbitrary limits', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.getLibraryStorage('E:\\private');
    bridge.setLibraryStoragePolicy({
      autoManageSeparation: true,
      separationLimitBytes: 26843545600,
      privatePath: 'E:\\private',
    });
    bridge.cleanupLibraryStorage('E:\\private');

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['library-storage:get'],
      [
        'library-storage:set-policy',
        {
          autoManageSeparation: true,
          separationLimitBytes: 26843545600,
        },
      ],
      ['library-storage:cleanup'],
    ]);
  });

  it('exposes only bounded track-edit intents and never forwards artwork paths', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.chooseTrackArtworkDraft('track-1', 'C:\\private\\cover.png');
    bridge.discardTrackArtworkDraft('track-1', 'C:\\private\\cover.png');
    bridge.saveTrackEdits('track-1', {
      title: '歌曲',
      artist: '演唱者',
      artwork: {
        action: 'candidate',
        candidateId: 'candidate-1',
        path: 'C:\\private\\cover.png',
        url: 'file:///private/cover.png',
      },
      privatePath: 'C:\\private',
    });

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['library:choose-track-artwork-draft', 'track-1'],
      ['library:discard-track-artwork-draft', 'track-1'],
      [
        'library:save-track-edits',
        'track-1',
        {
          title: '歌曲',
          artist: '演唱者',
          artwork: { action: 'candidate', candidateId: 'candidate-1' },
        },
      ],
    ]);
  });

  it('exposes only bounded performance session plan intents', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');
    await bridge.appendPerformanceSessionPlanFromArchive({
      sessionId: 'archive-1',
      items: [],
      replaceCurrent: true,
      path: 'private',
    });
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'performance-session-plan:append-from-archive',
      { sessionId: 'archive-1' },
    );
    electron.ipcRenderer.invoke.mockClear();

    bridge.getPerformanceSessionPlan('E:\\private');
    bridge.appendPerformanceSessionPlanFromCollection({
      sourceId: 'playlist-1',
      trackIds: ['untrusted'],
      replaceCurrent: true,
    });
    bridge.replacePerformanceSessionPlanFromCollection({
      sourceId: 'playlist-1',
      replaceCurrent: true,
      sourceName: 'spoofed',
      trackIds: ['track-private'],
      privatePath: 'E:\\private',
    });
    bridge.appendPerformanceSessionPlanPlaceholders(
      '第一首\n第二首',
      'E:\\private',
    );
    bridge.appendPerformanceSessionPlanLibraryTrack(
      'track-1',
      'file:///private.wav',
    );
    bridge.appendPerformanceSessionPlanManualItem({
      displayTitle: '自備伴奏',
      displayArtist: '演出者',
      bgm: true,
      mediaUrl: 'file:///private.wav',
    });
    bridge.updatePerformanceSessionPlanItem({
      itemId: 'item-1',
      expectedRevision: 3,
      displayTitle: '現場名稱',
      displayArtist: '演出者',
      trackId: 'track-1',
      verify: true,
      advance: true,
      mediaUrl: 'file:///private.wav',
      privatePath: 'E:\\private',
    });
    bridge.updatePerformanceSessionPlanItem({
      itemId: 'item-2',
      expectedRevision: 4,
      displayTitle: '只改本場顯示',
      displayArtist: '',
      libraryTitle: '不可寫入',
      artwork: 'file:///private.png',
    });
    bridge.movePerformanceSessionPlanItem({
      itemId: 'item-1',
      offset: 1,
      targetIndex: 99,
    });
    bridge.duplicatePerformanceSessionPlanItem('item-1', 'E:\\private');
    bridge.removePerformanceSessionPlanItem('item-2', 'E:\\private');
    bridge.setPerformanceSessionPlanReviewCursor('item-3', 'E:\\private');
    bridge.clearPerformanceSessionPlan('E:\\private');

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['performance-session-plan:get'],
      [
        'performance-session-plan:append-from-collection',
        { sourceId: 'playlist-1' },
      ],
      [
        'performance-session-plan:replace-from-collection',
        { sourceId: 'playlist-1', replaceCurrent: true },
      ],
      ['performance-session-plan:append-placeholders', '第一首\n第二首'],
      ['performance-session-plan:append-library-track', 'track-1'],
      [
        'performance-session-plan:append-manual-item',
        { displayTitle: '自備伴奏', displayArtist: '演出者' },
      ],
      [
        'performance-session-plan:update-item',
        {
          itemId: 'item-1',
          expectedRevision: 3,
          displayTitle: '現場名稱',
          displayArtist: '演出者',
          trackId: 'track-1',
        },
      ],
      [
        'performance-session-plan:update-item',
        {
          itemId: 'item-2',
          expectedRevision: 4,
          displayTitle: '只改本場顯示',
          displayArtist: '',
        },
      ],
      ['performance-session-plan:move-item', { itemId: 'item-1', offset: 1 }],
      ['performance-session-plan:duplicate-item', 'item-1'],
      ['performance-session-plan:remove-item', 'item-2'],
      ['performance-session-plan:set-review-cursor', 'item-3'],
      ['performance-session-plan:clear'],
    ]);
  });

  it('exposes only bounded BGM preparation intents', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    expect(bridge).not.toHaveProperty('addBgmStandbyTrack');
    expect(bridge).not.toHaveProperty('moveBgmStandbyTrack');
    expect(bridge).not.toHaveProperty('removeBgmStandbyTrack');
    expect(bridge).not.toHaveProperty('setBgmStandbyCurrentTrack');
    expect(bridge).not.toHaveProperty('clearBgmStandbyPlan');

    bridge.getBgmStandbyPlan('E:\\private');
    bridge.setBgmStandbyTrack('track-3', 'file:///private.wav');
    bridge.updateBgmStandbySettings({
      volume: 0.4,
      isMuted: true,
      loop: false,
      fadeInSeconds: 1.7,
      fadeOutSeconds: 0.8,
      dimDb: -14,
      dimAttackMs: 120,
      dimReleaseMs: 700,
      preRollSeconds: 2.5,
      postRollSeconds: 3,
      captureDeviceId: 'private-device',
      mediaUrl: 'file:///private.wav',
    });
    bridge.updateBgmStandbyPosition({
      trackId: 'track-3',
      positionSeconds: 32,
      currentTime: 99,
      privatePath: 'E:\\private',
    });

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['bgm-standby:get'],
      ['bgm-standby:set-track', 'track-3'],
      [
        'bgm-standby:update-settings',
        {
          volume: 0.4,
          isMuted: true,
          fadeInSeconds: 1.7,
          fadeOutSeconds: 0.8,
          dimDb: -14,
          dimAttackMs: 120,
          dimReleaseMs: 700,
          preRollSeconds: 2.5,
          postRollSeconds: 3,
        },
      ],
      [
        'bgm-standby:update-position',
        { trackId: 'track-3', positionSeconds: 32 },
      ],
    ]);
  });

  it('preserves sparse BGM setting updates without forwarding omitted fields', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.updateBgmStandbySettings({
      volume: 0.65,
      mediaUrl: 'file:///private.wav',
    });

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'bgm-standby:update-settings',
      { volume: 0.65 },
    );
    expect(Object.keys(electron.ipcRenderer.invoke.mock.calls[0][1])).toEqual([
      'volume',
    ]);
  });

  it('forwards only the feature id and notice version for gate confirmation', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.getFeatureConfirmations('ignored');
    bridge.confirmFeatureGate(
      'provider-flow',
      'feature-notice-v3',
      'ignored-config',
    );

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['feature-gates:list'],
      ['feature-gates:confirm', 'provider-flow', 'feature-notice-v3'],
    ]);
  });

  it('forwards only an allowlisted external target intent', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    expect(bridge).not.toHaveProperty('openExternalUrl');
    bridge.openExternalTarget('vb-cable', 'https://example.test/private');

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'shell:open-external',
      'vb-cable',
    );
  });

  it('forwards only the search text for YT Music discovery', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    expect(bridge).not.toHaveProperty('openExternalUrl');
    bridge.openYoutubeMusicSearch(
      '宇多田ヒカル First Love',
      'https://example.test/private',
    );

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'provider-discovery:open-youtube-music-search',
      '宇多田ヒカル First Love',
    );
  });

  it('forwards only the provider track id when stopping a download', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.cancelAudioDownload('track-1', {
      path: 'C:\\private',
      processId: 42,
    });

    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'yt:cancel-download',
      'track-1',
    );
  });

  it('does not send startup milestones when tracing is disabled', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.recordStartupMilestone('renderer-ready');

    expect(electron.ipcRenderer.send).not.toHaveBeenCalled();
  });
});

describe('performer preload bridge', () => {
  it('strips private and arbitrary fields from toolbar commands', async () => {
    const bridge = await loadBridge(
      './performerPreload.js',
      'UtawakuiPerformer',
    );
    await bridge.control({
      action: 'play',
      revision: 3,
      trackId: 'a',
      url: 'private',
      filename: 'private',
    });
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(
      'performer-view:control',
      { action: 'play', revision: 3, trackId: 'a' },
    );
  });
  it('exposes the fixed performer command and event allowlists', async () => {
    const bridge = await loadBridge(
      './performerPreload.js',
      'UtawakuiPerformer',
      ['--ui-theme=light'],
    );
    expect(bridge.initialUiTheme).toBe('light');

    const darkThemeBridge = await loadBridge(
      './performerPreload.js',
      'UtawakuiPerformer',
      ['--ui-theme=dark'],
    );
    expect(darkThemeBridge.initialUiTheme).toBe('dark');

    const cleanups = [];
    for (const [name, method] of Object.entries(bridge)) {
      if (typeof method !== 'function') continue;
      const result = name.startsWith('on') ? method(vi.fn()) : method('event');
      if (typeof result === 'function') cleanups.push(result);
    }

    expect(uniqueChannels(electron.ipcRenderer.invoke)).toEqual(
      [
        'diagnostics:record-renderer',
        'performer-view:close',
        'performer-view:adjust-lyrics-offset',
        'performer-view:control',
        'performer-view:get-reading-scale',
        'performer-view:get-snapshot',
        'performer-view:get-status',
        'performer-view:minimize',
        'performer-view:set-reading-scale',
        'performer-view:toggle-always-on-top',
        'performer-view:toggle-full-screen',
      ].sort(),
    );
    expect(uniqueChannels(electron.ipcRenderer.on)).toEqual([
      'performer-view:snapshot',
      'performer-view:ui-theme',
      'performer-view:window-state',
    ]);
    expect(electron.ipcRenderer.send).not.toHaveBeenCalled();
    expect(bridge).not.toHaveProperty('ipcRenderer');

    for (const cleanup of cleanups) cleanup();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledTimes(3);
  });

  it('defaults unknown themes and forwards event payloads without event objects', async () => {
    const bridge = await loadBridge(
      './performerPreload.js',
      'UtawakuiPerformer',
      ['--ui-theme=blue'],
    );
    expect(bridge.initialUiTheme).toBe('light');

    const callback = vi.fn();
    const cleanup = bridge.onSnapshot(callback);
    const listener = electron.ipcRenderer.on.mock.calls[0][1];
    listener({ sender: 'private-web-contents' }, { state: { revision: 3 } });
    expect(callback).toHaveBeenCalledWith({ state: { revision: 3 } });

    cleanup();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'performer-view:snapshot',
      listener,
    );
  });

  it('forwards only canonical live theme payloads', async () => {
    const bridge = await loadBridge(
      './performerPreload.js',
      'UtawakuiPerformer',
    );
    const callback = vi.fn();
    const cleanup = bridge.onUiTheme(callback);
    const listener = electron.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'performer-view:ui-theme',
    )[1];

    listener({ sender: 'private-web-contents' }, 'sepia');
    listener({ sender: 'private-web-contents' }, { theme: 'light' });
    expect(callback).not.toHaveBeenCalled();

    listener({ sender: 'private-web-contents' }, 'light');
    listener({ sender: 'private-web-contents' }, 'dark');
    expect(callback.mock.calls).toEqual([['light'], ['dark']]);

    cleanup();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'performer-view:ui-theme',
      listener,
    );
  });
});
