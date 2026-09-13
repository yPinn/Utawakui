'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Parsed from the `--ui-theme=` arg main.js passes via additionalArguments —
// lets the renderer paint the persisted theme on first frame, no async wait.
function readInitialUiTheme() {
  const arg = process.argv.find((a) => a.startsWith('--ui-theme='));
  const theme = arg ? arg.slice('--ui-theme='.length) : 'dark';
  return theme === 'light' ? 'light' : 'dark';
}

// BrowserWindow starts restored, so main can synchronously seed compact before
// the renderer's first frame; later native window-state events update it.
function readInitialUiDensity() {
  const arg = process.argv.find((a) => a.startsWith('--ui-density='));
  const density = arg ? arg.slice('--ui-density='.length) : 'compact';
  return density === 'standard' ? 'standard' : 'compact';
}

// Same synchronous-first-paint reasoning as readInitialUiTheme above.
function readInitialSidebarWidth() {
  const arg = process.argv.find((a) => a.startsWith('--sidebar-width='));
  const value = arg ? Number(arg.slice('--sidebar-width='.length)) : NaN;
  return Number.isFinite(value) ? value : 256;
}

// Same synchronous-first-paint reasoning as readInitialUiTheme above — lets
// useAudioOutput.js apply the persisted capture device before the first
// track ever plays instead of waiting on an async getCaptureDevice() round
// trip. Empty string (no arg / cleared) reads back as null, not ''.
function readInitialCaptureDeviceId() {
  const arg = process.argv.find((a) => a.startsWith('--capture-device-id='));
  const value = arg ? arg.slice('--capture-device-id='.length) : '';
  return value.length > 0 ? value : null;
}

const startupTraceEnabled = process.argv.includes('--startup-trace-enabled=1');
const internalWorkbenchesEnabled = process.argv.includes(
  '--internal-workbenches-enabled=1',
);

contextBridge.exposeInMainWorld('Utawakui', {
  startupTraceEnabled,
  recordStartupMilestone: (milestone) => {
    if (startupTraceEnabled) {
      ipcRenderer.send('startup-trace:milestone', milestone);
    }
  },
  ...(internalWorkbenchesEnabled
    ? {
        loadLyricsProviderReview: () =>
          ipcRenderer.invoke('lyrics-provider-review:load'),
        saveLyricsProviderReviewDecision: (intent) =>
          ipcRenderer.invoke('lyrics-provider-review:save-decision', intent),
        exportLyricsProviderReviewCorpus: () =>
          ipcRenderer.invoke('lyrics-provider-review:export'),
        runLyricsProviderReviewLookupAction: (intent) =>
          ipcRenderer.invoke('lyrics-provider-review:lookup-action', intent),
      }
    : {}),
  recordDiagnostic: (event) =>
    ipcRenderer.invoke('diagnostics:record-renderer', event),
  listRecentDiagnostics: (limit) =>
    ipcRenderer.invoke('diagnostics:list-recent', limit),
  clearDiagnostics: () => ipcRenderer.invoke('diagnostics:clear'),
  openDiagnosticsFolder: () => ipcRenderer.invoke('diagnostics:open-folder'),
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),
  buildFeedbackPreview: (input) =>
    ipcRenderer.invoke('feedback:build-preview', input),
  submitFeedback: (input) => ipcRenderer.invoke('feedback:submit', input),
  exportFeedbackFallback: (input) =>
    ipcRenderer.invoke('feedback:export-fallback', input),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getAppUpdateStatus: () => ipcRenderer.invoke('app-update:get-status'),
  checkForAppUpdate: () => ipcRenderer.invoke('app-update:check'),
  downloadAppUpdate: () => ipcRenderer.invoke('app-update:download'),
  installAppUpdate: () => ipcRenderer.invoke('app-update:install'),
  onAppUpdateStatus: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('app-update:status', listener);
    return () => ipcRenderer.removeListener('app-update:status', listener);
  },
  initialUiTheme: readInitialUiTheme(),
  initialUiDensity: readInitialUiDensity(),
  onUiDensityChanged: (callback) => {
    const listener = (event, density) => {
      if (density === 'compact' || density === 'standard') callback(density);
    };
    ipcRenderer.on('ui-density:changed', listener);
    return () => ipcRenderer.removeListener('ui-density:changed', listener);
  },
  getUiTheme: () => ipcRenderer.invoke('config:get-ui-theme'),
  setUiTheme: (theme) => ipcRenderer.invoke('config:set-ui-theme', theme),
  initialSidebarWidth: readInitialSidebarWidth(),
  getSidebarWidth: () => ipcRenderer.invoke('config:get-sidebar-width'),
  setSidebarWidth: (width) =>
    ipcRenderer.invoke('config:set-sidebar-width', width),
  initialCaptureDeviceId: readInitialCaptureDeviceId(),
  getCaptureDevice: () => ipcRenderer.invoke('config:get-capture-device'),
  setCaptureDevice: (deviceId) =>
    ipcRenderer.invoke('config:set-capture-device', deviceId),
  getAutoMusicAnalysis: () =>
    ipcRenderer.invoke('config:get-auto-music-analysis'),
  setAutoMusicAnalysis: (enabled) =>
    ipcRenderer.invoke('config:set-auto-music-analysis', enabled),
  getAppUpdateAutoCheck: () =>
    ipcRenderer.invoke('config:get-app-update-auto-check'),
  setAppUpdateAutoCheck: (enabled) =>
    ipcRenderer.invoke('config:set-app-update-auto-check', enabled),
  openExternalTarget: (targetId) =>
    ipcRenderer.invoke('shell:open-external', targetId),
  openYoutubeMusicSearch: (query) =>
    ipcRenderer.invoke('provider-discovery:open-youtube-music-search', query),
  downloadAudio: (videoId) => ipcRenderer.invoke('yt:download-audio', videoId),
  // YouTube playlist URL/ID resolution — distinct from the user-named
  // playlists API below (listPlaylists/createPlaylist/etc.).
  fetchYoutubePlaylist: (input) =>
    ipcRenderer.invoke('yt:fetch-playlist', input),
  resolveImportInput: (input) =>
    ipcRenderer.invoke('import:resolve-source', input),
  resolveImportSource: (input) =>
    ipcRenderer.invoke('yt:resolve-import-source', input),
  fetchVideoMetadata: (input) => ipcRenderer.invoke('yt:fetch-metadata', input),
  getConfig: () => ipcRenderer.invoke('config:get'),
  getFeatureConfirmations: () => ipcRenderer.invoke('feature-gates:list'),
  confirmFeatureGate: (featureId, noticeVersion) =>
    ipcRenderer.invoke('feature-gates:confirm', featureId, noticeVersion),
  getOutputStatus: () => ipcRenderer.invoke('output:get-status'),
  connectOutputSource: () => ipcRenderer.invoke('output:connect-source'),
  getOutputSettings: () => ipcRenderer.invoke('output:get-settings'),
  updateOutputSettings: (settings) =>
    ipcRenderer.invoke('output:update-settings', settings),
  suggestOutputPorts: () => ipcRenderer.invoke('output:suggest-ports'),
  startOutput: () => ipcRenderer.invoke('output:start'),
  stopOutput: () => ipcRenderer.invoke('output:stop'),
  getSpoutOutputStatus: () => ipcRenderer.invoke('spout-output:get-status'),
  setSpoutOutputFrameRateProfile: (frameRateProfile) =>
    ipcRenderer.invoke('spout-output:set-frame-rate-profile', frameRateProfile),
  startSpoutOutput: () => ipcRenderer.invoke('spout-output:start'),
  stopSpoutOutput: () => ipcRenderer.invoke('spout-output:stop'),
  onSpoutOutputStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('spout-output:status', listener);
    return () => ipcRenderer.removeListener('spout-output:status', listener);
  },
  publishOutputSnapshot: (snapshot) =>
    ipcRenderer.invoke('output:publish', snapshot),
  copyOutputUrl: (kind) => ipcRenderer.invoke('output:copy-url', kind),
  openPerformerView: (snapshot) =>
    ipcRenderer.invoke('performer-view:open', snapshot),
  publishPerformerSnapshot: (snapshot) =>
    ipcRenderer.invoke('performer-view:publish', snapshot),
  getPerformerViewStatus: () => ipcRenderer.invoke('performer-view:get-status'),
  onPerformerViewStatus: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('performer-view:status', listener);
    return () => ipcRenderer.removeListener('performer-view:status', listener);
  },
  listOutputSlots: () => ipcRenderer.invoke('output-slots:list'),
  upsertOutputSlot: (kind, slot) =>
    ipcRenderer.invoke('output-slots:upsert', kind, slot),
  listFeatureDependencies: () =>
    ipcRenderer.invoke('feature-dependencies:list'),
  prepareFeatureDependency: (dependencyId) =>
    ipcRenderer.invoke('feature-dependencies:prepare', dependencyId),
  removeFeatureDependency: (dependencyId) =>
    ipcRenderer.invoke('feature-dependencies:remove', dependencyId),
  repairFeatureDependency: (dependencyId) =>
    ipcRenderer.invoke('feature-dependencies:repair', dependencyId),
  detectSystemFfmpeg: () =>
    ipcRenderer.invoke('feature-dependencies:detect-system-ffmpeg'),
  setFfmpegSource: (useSystem) =>
    ipcRenderer.invoke('feature-dependencies:set-ffmpeg-source', useSystem),
  chooseDownloadDir: () => ipcRenderer.invoke('config:choose-download-dir'),
  resetDownloadDir: () => ipcRenderer.invoke('config:reset-download-dir'),
  openDownloadDir: () => ipcRenderer.invoke('config:open-download-dir'),
  listTracks: (options) => ipcRenderer.invoke('library:list', options),
  importLocalAudioFiles: () => ipcRenderer.invoke('library:import-audio-files'),
  refreshLibraryMetadata: () => ipcRenderer.invoke('library:refresh-metadata'),
  getTrackLyrics: (trackId, filename) =>
    ipcRenderer.invoke('lyrics:get-track', trackId, filename),
  getTrackMusicStructure: (trackId) =>
    ipcRenderer.invoke('music-structure:get-track', trackId),
  openMusicAnalysisBenchmarkReview: () =>
    ipcRenderer.invoke('music-structure:open-benchmark-review'),
  openMusicAnalysisReferenceAnnotation: () =>
    ipcRenderer.invoke('music-structure:open-reference-annotation'),
  saveMusicAnalysisReferenceAnnotation: (payload) =>
    ipcRenderer.invoke('music-structure:save-reference-annotation', payload),
  analyzeTrackMusicStructure: (trackId) =>
    ipcRenderer.invoke('music-structure:analyze-track', trackId),
  cancelTrackMusicStructureAnalysis: () =>
    ipcRenderer.invoke('music-structure:cancel-analysis'),
  getTrackMusicStructureAnalysisStatus: () =>
    ipcRenderer.invoke('music-structure:get-analysis-status'),
  getMusicStructureBatchStatus: () =>
    ipcRenderer.invoke('music-structure:get-batch-status'),
  startMusicStructureBatch: (trackIds, force = false) =>
    ipcRenderer.invoke('music-structure:start-batch', { trackIds, force }),
  cancelMusicStructureBatch: () =>
    ipcRenderer.invoke('music-structure:cancel-batch'),
  getMusicStructureCapabilityStatus: () =>
    ipcRenderer.invoke('music-structure:get-capability-status'),
  prepareMusicStructureCapability: () =>
    ipcRenderer.invoke('music-structure:prepare-capability'),
  repairMusicStructureCapability: () =>
    ipcRenderer.invoke('music-structure:repair-capability'),
  removeMusicStructureCapability: () =>
    ipcRenderer.invoke('music-structure:remove-capability'),
  onTrackMusicStructureAnalysisProgress: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('music-structure:analysis-progress', listener);
    return () =>
      ipcRenderer.removeListener('music-structure:analysis-progress', listener);
  },
  onMusicStructureBatchProgress: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('music-structure:batch-progress', listener);
    return () =>
      ipcRenderer.removeListener('music-structure:batch-progress', listener);
  },
  onMusicStructureCapabilityProgress: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('music-structure:capability-progress', listener);
    return () =>
      ipcRenderer.removeListener(
        'music-structure:capability-progress',
        listener,
      );
  },
  saveLyricsTiming: (
    trackId,
    sourceFilename,
    expectedSourceFingerprint,
    document,
  ) =>
    ipcRenderer.invoke(
      'lyrics:save-timing',
      trackId,
      sourceFilename,
      expectedSourceFingerprint,
      document,
    ),
  probeMusixmatchLyrics: (trackId) =>
    ipcRenderer.invoke('lyrics:probe-musixmatch', trackId),
  searchLyricsCandidates: (trackId, options) =>
    ipcRenderer.invoke('lyrics:search-candidates', trackId, options),
  searchLyricsProviderCandidates: (providerId, trackId, options) =>
    ipcRenderer.invoke(
      'lyrics:search-provider-candidates',
      providerId,
      trackId,
      options,
    ),
  saveLyricsCandidate: (trackId, candidateId, expectedFingerprint, options) =>
    ipcRenderer.invoke(
      'lyrics:save-candidate',
      trackId,
      candidateId,
      expectedFingerprint,
      options,
    ),
  saveLyricsProviderCandidate: (
    providerId,
    trackId,
    candidateId,
    expectedFingerprint,
    options,
  ) =>
    ipcRenderer.invoke(
      'lyrics:save-provider-candidate',
      providerId,
      trackId,
      candidateId,
      expectedFingerprint,
      options,
    ),
  backfillLyricsSourceLabels: (trackId) =>
    ipcRenderer.invoke('lyrics:backfill-source-labels', trackId),
  setLyricsSourceLabel: (trackId, filename, label) =>
    ipcRenderer.invoke('lyrics:set-source-label', trackId, filename, label),
  setLyricsSourceOffset: (trackId, filename, offsetMs) =>
    ipcRenderer.invoke('lyrics:set-source-offset', trackId, filename, offsetMs),
  setLyricsSourcePreference: (trackId, filename) =>
    ipcRenderer.invoke('lyrics:set-preferred-source', trackId, filename),
  deleteLyricsSource: (trackId, filename) =>
    ipcRenderer.invoke('lyrics:delete-source', trackId, filename),
  importLyricsText: (trackId, payload) =>
    ipcRenderer.invoke('lyrics:import-text', trackId, payload),
  importLyricsFile: (trackId) =>
    ipcRenderer.invoke('lyrics:import-file', trackId),
  getLyricsReading: (trackId, sourceFilename, identity) =>
    ipcRenderer.invoke('lyrics:get-reading', trackId, sourceFilename, identity),
  generateLyricsReading: (trackId, sourceFilename, identity, script) =>
    ipcRenderer.invoke(
      'lyrics:generate-reading',
      trackId,
      sourceFilename,
      identity,
      script,
    ),
  setLyricsReadingLine: (trackId, sourceFilename, identity, readingKana) =>
    ipcRenderer.invoke(
      'lyrics:set-reading-line',
      trackId,
      sourceFilename,
      identity,
      readingKana,
    ),
  deleteLyricsReading: (trackId, sourceFilename) =>
    ipcRenderer.invoke('lyrics:delete-reading', trackId, sourceFilename),
  onLyricsReadingProgress: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('lyrics:reading-progress', listener);
    return () =>
      ipcRenderer.removeListener('lyrics:reading-progress', listener);
  },
  deleteTrack: (trackId) => ipcRenderer.invoke('library:delete-track', trackId),
  updateTrackMetadata: (trackId, fields) =>
    ipcRenderer.invoke('library:update-track-metadata', trackId, fields),
  chooseTrackArtwork: (trackId) =>
    ipcRenderer.invoke('library:choose-track-artwork', trackId),
  clearTrackArtwork: (trackId) =>
    ipcRenderer.invoke('library:clear-track-artwork', trackId),
  // Every mutation below resolves to the FULL updated playlist array, so
  // callers never need a separate refetch.
  listPlaylists: () => ipcRenderer.invoke('playlists:list'),
  createPlaylist: (name) => ipcRenderer.invoke('playlists:create', name),
  renamePlaylist: (id, name) =>
    ipcRenderer.invoke('playlists:rename', id, name),
  deletePlaylist: (id) => ipcRenderer.invoke('playlists:delete', id),
  reorderPlaylist: (draggedId, targetId, position) =>
    ipcRenderer.invoke('playlists:reorder', draggedId, targetId, position),
  setPlaylistTracks: (id, trackIds) =>
    ipcRenderer.invoke('playlists:set-tracks', id, trackIds),
  upsertAlbum: (payload) =>
    ipcRenderer.invoke('playlists:upsert-album', payload),
  setPlaylistKind: (id, kind) =>
    ipcRenderer.invoke('playlists:set-kind', id, kind),
  setPlaylistDescription: (id, description) =>
    ipcRenderer.invoke('playlists:set-description', id, description),
  choosePlaylistCover: (id) => ipcRenderer.invoke('playlists:choose-cover', id),
  clearPlaylistCover: (id) => ipcRenderer.invoke('playlists:clear-cover', id),
  // Renderer sends product recipe intent only; main owns engine/model details.
  runSeparation: (trackId, recipeId) =>
    ipcRenderer.invoke('separation:run', trackId, recipeId),
  cancelSeparation: () => ipcRenderer.invoke('separation:cancel'),
  selectSeparationResult: (trackId, recipeId) =>
    ipcRenderer.invoke('separation:select', trackId, recipeId),
  // Fires zero or more times before runSeparation()'s promise settles.
  // These `on*` methods return an unsubscribe function so callers can clean
  // up on unmount instead of reaching for raw ipcRenderer (kept out of the
  // renderer entirely under contextIsolation).
  onSeparationProgress: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('separation:progress', listener);
    return () => ipcRenderer.removeListener('separation:progress', listener);
  },
  onLibraryUpdated: (callback) => {
    const listener = (event, options) => callback(options);
    ipcRenderer.on('library:updated', listener);
    return () => ipcRenderer.removeListener('library:updated', listener);
  },
  onLibraryBackfillStatus: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('library:backfill-status', listener);
    return () =>
      ipcRenderer.removeListener('library:backfill-status', listener);
  },
  onFeatureDependenciesUpdated: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('feature-dependencies:updated', listener);
    return () =>
      ipcRenderer.removeListener('feature-dependencies:updated', listener);
  },
  onFeatureDependencyProgress: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('feature-dependencies:progress', listener);
    return () =>
      ipcRenderer.removeListener('feature-dependencies:progress', listener);
  },
  setPlaybackState: (state) => ipcRenderer.send('player:state', state),
  // Relays a thumbar click; the renderer stays the sole owner of the
  // <audio> element (see usePlayer.js), main never touches playback itself.
  onPlayerCommand: (callback) => {
    const listener = (event, command) => callback(command);
    ipcRenderer.on('player:command', listener);
    return () => ipcRenderer.removeListener('player:command', listener);
  },
});
