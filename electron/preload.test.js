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
  'app:get-version',
  'config:choose-download-dir',
  'config:get',
  'config:get-capture-device',
  'config:get-sidebar-width',
  'config:get-ui-theme',
  'config:get-auto-music-analysis',
  'config:get-separation-gpu-acceleration',
  'config:get-app-update-auto-check',
  'config:get-announcement-seen-version',
  'config:open-download-dir',
  'config:reset-download-dir',
  'config:set-capture-device',
  'config:set-sidebar-width',
  'config:set-ui-theme',
  'config:set-auto-music-analysis',
  'config:set-separation-gpu-acceleration',
  'config:set-app-update-auto-check',
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
  'import:resolve-source',
  'library:choose-track-artwork',
  'library:clear-track-artwork',
  'library:delete-track',
  'library:import-audio-files',
  'library:list',
  'library:refresh-metadata',
  'library:update-track-metadata',
  'lyrics:backfill-source-labels',
  'lyrics:delete-reading',
  'lyrics:delete-source',
  'lyrics:generate-reading',
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
  'output-slots:list',
  'output-slots:upsert',
  'output:connect-source',
  'output:copy-url',
  'output:get-settings',
  'output:get-status',
  'output:publish',
  'output:start',
  'output:stop',
  'output:suggest-ports',
  'output:update-settings',
  'performer-view:get-status',
  'performer-view:open',
  'performer-view:publish',
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
  'separation:run',
  'separation:select',
  'shell:open-external',
  'spout-output:get-status',
  'spout-output:set-frame-rate-profile',
  'spout-output:start',
  'spout-output:stop',
  'yt:download-audio',
  'yt:fetch-metadata',
  'yt:fetch-playlist',
  'yt:resolve-import-source',
].sort();

const MAIN_EVENT_CHANNELS = [
  'app-update:status',
  'feature-dependencies:progress',
  'feature-dependencies:updated',
  'library:backfill-status',
  'library:updated',
  'lyrics:reading-progress',
  'music-structure:analysis-progress',
  'music-structure:batch-progress',
  'music-structure:capability-progress',
  'performer-view:status',
  'player:command',
  'separation:progress',
  'spout-output:status',
  'ui-density:changed',
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
  it('parses only bounded initial renderer arguments', async () => {
    const defaults = await loadBridge('./preload.js', 'Utawakui', [
      '--ui-theme=unknown',
      '--ui-density=dense',
      '--sidebar-width=Infinity',
      '--capture-device-id=',
    ]);
    expect(defaults).toMatchObject({
      initialUiTheme: 'dark',
      initialUiDensity: 'compact',
      initialSidebarWidth: 256,
      initialCaptureDeviceId: null,
      startupTraceEnabled: false,
    });

    const configured = await loadBridge('./preload.js', 'Utawakui', [
      '--ui-theme=light',
      '--ui-density=standard',
      '--sidebar-width=320',
      '--capture-device-id=device-1',
      '--startup-trace-enabled=1',
    ]);
    expect(configured).toMatchObject({
      initialUiTheme: 'light',
      initialUiDensity: 'standard',
      initialSidebarWidth: 320,
      initialCaptureDeviceId: 'device-1',
      startupTraceEnabled: true,
    });
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

    cleanup();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'separation:progress',
      listener,
    );
  });

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

  it('does not send startup milestones when tracing is disabled', async () => {
    const bridge = await loadBridge('./preload.js', 'Utawakui');

    bridge.recordStartupMilestone('renderer-ready');

    expect(electron.ipcRenderer.send).not.toHaveBeenCalled();
  });
});

describe('performer preload bridge', () => {
  it('exposes the fixed performer command and event allowlists', async () => {
    const bridge = await loadBridge(
      './performerPreload.js',
      'UtawakuiPerformer',
      ['--ui-theme=light'],
    );
    expect(bridge.initialUiTheme).toBe('light');

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
        'performer-view:get-snapshot',
        'performer-view:get-status',
        'performer-view:minimize',
        'performer-view:toggle-always-on-top',
        'performer-view:toggle-full-screen',
      ].sort(),
    );
    expect(uniqueChannels(electron.ipcRenderer.on)).toEqual([
      'performer-view:snapshot',
      'performer-view:window-state',
    ]);
    expect(electron.ipcRenderer.send).not.toHaveBeenCalled();
    expect(bridge).not.toHaveProperty('ipcRenderer');

    for (const cleanup of cleanups) cleanup();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledTimes(2);
  });

  it('defaults unknown themes and forwards event payloads without event objects', async () => {
    const bridge = await loadBridge(
      './performerPreload.js',
      'UtawakuiPerformer',
      ['--ui-theme=blue'],
    );
    expect(bridge.initialUiTheme).toBe('dark');

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
});
