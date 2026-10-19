'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Parsed from the `--ui-theme=` arg main.js passes via additionalArguments —
// lets the renderer paint the persisted theme on first frame, no async wait.
function readInitialUiTheme() {
  const arg = process.argv.find((a) => a.startsWith('--ui-theme='));
  const theme = arg ? arg.slice('--ui-theme='.length) : 'light';
  return theme === 'dark' ? 'dark' : 'light';
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
  return Number.isFinite(value) ? value : 64;
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

function readNumberArgument(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  const number = arg ? Number(arg.slice(prefix.length)) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

// Sandboxed preload can require only Electron, so it relays Main's values and
// the renderer's normalizeAudioPreferences() applies bounds and defaults.
function readInitialAudioPreferences() {
  const mutedArgument = process.argv.find((value) =>
    value.startsWith('--performance-muted='),
  );
  const muted = mutedArgument?.slice('--performance-muted='.length);
  return {
    performanceVolume: readNumberArgument('performance-volume'),
    performanceMuted: muted === '1' ? true : muted === '0' ? false : undefined,
    monitorGuideVocalLevel: readNumberArgument('monitor-guide-vocal-level'),
    captureGuideVocalLevel: readNumberArgument('capture-guide-vocal-level'),
  };
}

const startupTraceEnabled = process.argv.includes('--startup-trace-enabled=1');
const internalWorkbenchesEnabled = process.argv.includes(
  '--internal-workbenches-enabled=1',
);
const WINDOW_CLOSE_REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isWindowCloseRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const hasExpectedKeys =
    (keys.length === 1 && keys[0] === 'requestId') ||
    (keys.length === 2 && keys[0] === 'activeWork' && keys[1] === 'requestId');
  return Boolean(
    hasExpectedKeys &&
    typeof value.requestId === 'string' &&
    WINDOW_CLOSE_REQUEST_ID.test(value.requestId) &&
    (value.activeWork === undefined || value.activeWork === 'separation'),
  );
}

function isWindowCloseError(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return Boolean(
    keys.length === 2 &&
    keys[0] === 'message' &&
    keys[1] === 'title' &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    value.title.length <= 120 &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    value.message.length <= 500,
  );
}

function playbackSourceIntent(value) {
  return {
    sourceId: value?.sourceId ?? null,
    sourceName: value?.sourceName ?? null,
  };
}

function playbackResumeIntent(value) {
  if (value === null) return null;
  return {
    currentTrackId: value?.currentTrackId,
    positionSeconds: value?.positionSeconds,
    playbackMode: value?.playbackMode,
    queue: {
      sourceTrackIds: value?.queue?.sourceTrackIds,
      queuedTrackIds: value?.queue?.queuedTrackIds,
      historyEntries: value?.queue?.historyEntries,
      currentIsSource: value?.queue?.currentIsSource,
      lastSourceTrackId: value?.queue?.lastSourceTrackId,
      sourceName: value?.queue?.sourceName,
      sourceId: value?.queue?.sourceId,
      isShuffle: value?.queue?.isShuffle,
      orderIds: value?.queue?.orderIds,
    },
  };
}

function audioPreferencesIntent(value) {
  return {
    performanceVolume: value?.performanceVolume,
    performanceMuted: value?.performanceMuted,
    monitorGuideVocalLevel: value?.monitorGuideVocalLevel,
    captureGuideVocalLevel: value?.captureGuideVocalLevel,
  };
}

function playbackStateIntent(value) {
  return {
    isPlaying: value?.isPlaying,
    hasTrack: value?.hasTrack,
    trackId: value?.trackId,
  };
}

function libraryStoragePolicyIntent(value) {
  return {
    autoManageSeparation: value?.autoManageSeparation,
    separationLimitBytes: value?.separationLimitBytes,
  };
}

function trackEditIntent(value) {
  const requestedAction = value?.artwork?.action;
  const action = ['keep', 'local-draft', 'candidate', 'clear'].includes(
    requestedAction,
  )
    ? requestedAction
    : 'keep';
  const artwork = { action };
  if (action === 'candidate') {
    artwork.candidateId = value?.artwork?.candidateId;
  }
  return {
    title: value?.title,
    artist: value?.artist,
    artwork,
  };
}

function folderPageIdentityIntent(value) {
  return {
    kind: value?.kind,
    id: value?.id,
  };
}

function folderPageLayoutEntryIntent(value) {
  const entry = {
    key: value?.key,
    placement: {
      region: value?.placement?.region,
      anchor: {
        x: value?.placement?.anchor?.x,
        y: value?.placement?.anchor?.y,
      },
    },
    pinned: value?.pinned,
    order: value?.order,
  };
  if (Object.hasOwn(value ?? {}, 'type')) entry.type = value.type;
  if (Object.hasOwn(value ?? {}, 'rotation')) entry.rotation = value.rotation;
  return entry;
}

function folderPageLayoutIntent(value) {
  return {
    page: folderPageIdentityIntent(value?.page),
    entries: Array.isArray(value?.entries)
      ? value.entries.slice(0, 64).map(folderPageLayoutEntryIntent)
      : [],
  };
}

function folderPageNoteContent(value) {
  return {
    title: typeof value?.title === 'string' ? value.title.slice(0, 80) : '',
    text: typeof value?.text === 'string' ? value.text.slice(0, 2000) : '',
    paper: typeof value?.paper === 'string' ? value.paper.slice(0, 16) : '',
  };
}

function folderPageNoteCreateIntent(value) {
  return {
    page: folderPageIdentityIntent(value?.page),
    ...folderPageNoteContent(value),
  };
}

function folderPageNoteIntent(value) {
  return {
    page: folderPageIdentityIntent(value?.page),
    key: value?.key,
    ...folderPageNoteContent(value),
  };
}

function folderPagePhotoTextIntent(value) {
  return {
    page: folderPageIdentityIntent(value?.page),
    key: value?.key,
    label: typeof value?.label === 'string' ? value.label.slice(0, 16) : '',
    captionTitle:
      typeof value?.captionTitle === 'string'
        ? value.captionTitle.slice(0, 80)
        : '',
    caption:
      typeof value?.caption === 'string' ? value.caption.slice(0, 2000) : '',
    captionPaper:
      typeof value?.captionPaper === 'string'
        ? value.captionPaper.slice(0, 16)
        : '',
  };
}

function folderPageObjectTargetIntent(value) {
  return {
    page: folderPageIdentityIntent(value?.page),
    key: value?.key,
  };
}

function performanceSessionPlanReplaceIntent(value) {
  return {
    sourceId: value?.sourceId,
    replaceCurrent: value?.replaceCurrent === true,
  };
}

function performanceSessionPlanUpdateIntent(value) {
  const intent = {
    itemId: value?.itemId,
    expectedRevision: value?.expectedRevision,
    displayTitle: value?.displayTitle,
    displayArtist: value?.displayArtist,
  };
  if (value && Object.hasOwn(value, 'trackId')) intent.trackId = value.trackId;
  return intent;
}

function performanceSessionPlanMoveIntent(value) {
  return {
    itemId: value?.itemId,
    offset: value?.offset,
  };
}

function performanceSessionPlanManualIntent(value) {
  return {
    displayTitle: value?.displayTitle,
    displayArtist: value?.displayArtist,
  };
}

function bgmStandbySettingsIntent(value) {
  const source = value && typeof value === 'object' ? value : {};
  const allowedKeys = [
    'volume',
    'isMuted',
    'fadeInSeconds',
    'fadeOutSeconds',
    'dimDb',
    'dimAttackMs',
    'dimReleaseMs',
    'preRollSeconds',
    'postRollSeconds',
  ];
  return Object.fromEntries(
    allowedKeys
      .filter((key) => Object.hasOwn(source, key))
      .map((key) => [key, source[key]]),
  );
}

function bgmStandbyPositionIntent(value) {
  return {
    trackId: value?.trackId,
    positionSeconds: value?.positionSeconds,
  };
}

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
  getRecentPlaybackHistory: () => ipcRenderer.invoke('playback-history:get'),
  recordRecentPlayback: (trackId, sourceContext) =>
    ipcRenderer.invoke(
      'playback-history:record',
      trackId,
      playbackSourceIntent(sourceContext),
    ),
  clearRecentPlaybackHistory: () =>
    ipcRenderer.invoke('playback-history:clear'),
  getPlaybackPlayCounts: () =>
    ipcRenderer.invoke('playback-usage:get-play-counts'),
  getPlaybackResumeSnapshot: () => ipcRenderer.invoke('playback-resume:get'),
  savePlaybackResumeSnapshot: (snapshot) =>
    ipcRenderer.invoke('playback-resume:save', playbackResumeIntent(snapshot)),
  getAppUpdateStatus: () => ipcRenderer.invoke('app-update:get-status'),
  checkForAppUpdate: () => ipcRenderer.invoke('app-update:check'),
  downloadAppUpdate: () => ipcRenderer.invoke('app-update:download'),
  installAppUpdate: () => ipcRenderer.invoke('app-update:install'),
  onAppUpdateStatus: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('app-update:status', listener);
    return () => ipcRenderer.removeListener('app-update:status', listener);
  },
  getAppUsage: () => ipcRenderer.invoke('app-usage:get-status'),
  onAppUsage: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('app-usage:status', listener);
    return () => ipcRenderer.removeListener('app-usage:status', listener);
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
  getObsArrangementDock: () =>
    ipcRenderer.invoke('config:get-obs-arrangement-dock'),
  setObsArrangementDock: (enabled) =>
    ipcRenderer.invoke('config:set-obs-arrangement-dock', enabled),
  setUiTheme: (theme) => ipcRenderer.invoke('config:set-ui-theme', theme),
  initialSidebarWidth: readInitialSidebarWidth(),
  getSidebarWidth: () => ipcRenderer.invoke('config:get-sidebar-width'),
  setSidebarWidth: (width) =>
    ipcRenderer.invoke('config:set-sidebar-width', width),
  initialCaptureDeviceId: readInitialCaptureDeviceId(),
  getCaptureDevice: () => ipcRenderer.invoke('config:get-capture-device'),
  setCaptureDevice: (deviceId) =>
    ipcRenderer.invoke('config:set-capture-device', deviceId),
  initialAudioPreferences: readInitialAudioPreferences(),
  getAudioPreferences: () => ipcRenderer.invoke('config:get-audio-preferences'),
  setAudioPreferences: (audioPreferences) =>
    ipcRenderer.invoke(
      'config:set-audio-preferences',
      audioPreferencesIntent(audioPreferences),
    ),
  getAutoMusicAnalysis: () =>
    ipcRenderer.invoke('config:get-auto-music-analysis'),
  setAutoMusicAnalysis: (enabled) =>
    ipcRenderer.invoke('config:set-auto-music-analysis', enabled),
  getSeparationGpuAcceleration: () =>
    ipcRenderer.invoke('config:get-separation-gpu-acceleration'),
  setSeparationGpuAcceleration: (enabled) =>
    ipcRenderer.invoke('config:set-separation-gpu-acceleration', enabled),
  getAppUpdateAutoCheck: () =>
    ipcRenderer.invoke('config:get-app-update-auto-check'),
  setAppUpdateAutoCheck: (enabled) =>
    ipcRenderer.invoke('config:set-app-update-auto-check', enabled),
  getWindowCloseBehavior: () =>
    ipcRenderer.invoke('config:get-window-close-behavior'),
  setWindowCloseBehavior: (behavior) =>
    ipcRenderer.invoke('config:set-window-close-behavior', behavior),
  presentWindowCloseRequest: (requestId) =>
    ipcRenderer.invoke('window-close:present', requestId),
  respondWindowCloseRequest: (requestId, decision) =>
    ipcRenderer.invoke('window-close:respond', {
      requestId,
      action: decision?.action,
      remember: decision?.remember,
    }),
  onWindowCloseRequest: (callback) => {
    const listener = (event, payload) => {
      if (isWindowCloseRequest(payload)) callback(payload);
    };
    ipcRenderer.on('window-close:request', listener);
    return () => ipcRenderer.removeListener('window-close:request', listener);
  },
  onWindowCloseDismiss: (callback) => {
    const listener = (event, payload) => {
      if (isWindowCloseRequest(payload)) callback(payload);
    };
    ipcRenderer.on('window-close:dismiss', listener);
    return () => ipcRenderer.removeListener('window-close:dismiss', listener);
  },
  onWindowCloseError: (callback) => {
    const listener = (event, payload) => {
      if (isWindowCloseError(payload)) callback(payload);
    };
    ipcRenderer.on('window-close:error', listener);
    return () => ipcRenderer.removeListener('window-close:error', listener);
  },
  onAppNavigation: (callback) => {
    const listener = (event, view) => {
      if (view === 'settings') callback(view);
    };
    ipcRenderer.on('app:navigate', listener);
    return () => ipcRenderer.removeListener('app:navigate', listener);
  },
  onHistoryCommand: (callback) => {
    const listener = (event, direction) => {
      if (direction === 'back' || direction === 'forward') callback(direction);
    };
    ipcRenderer.on('app:history-command', listener);
    return () => ipcRenderer.removeListener('app:history-command', listener);
  },
  getAnnouncementSeenVersion: () =>
    ipcRenderer.invoke('config:get-announcement-seen-version'),
  setAnnouncementSeenVersion: (version) =>
    ipcRenderer.invoke('config:set-announcement-seen-version', version),
  openExternalTarget: (targetId) =>
    ipcRenderer.invoke('shell:open-external', targetId),
  openYoutubeMusicSearch: (query) =>
    ipcRenderer.invoke('provider-discovery:open-youtube-music-search', query),
  downloadAudio: (videoId) => ipcRenderer.invoke('yt:download-audio', videoId),
  cancelAudioDownload: (videoId) =>
    ipcRenderer.invoke('yt:cancel-download', videoId),
  // YouTube playlist URL/ID resolution — distinct from the user-named
  // playlists API below (listPlaylists/createPlaylist/etc.).
  fetchYoutubePlaylist: (input) =>
    ipcRenderer.invoke('yt:fetch-playlist', input),
  resolveImportInput: (input) =>
    ipcRenderer.invoke('import:resolve-source', input),
  getImportClipboardSuggestion: () =>
    ipcRenderer.invoke('import:clipboard-suggestion'),
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
  getObsStatus: () => ipcRenderer.invoke('obs:get-status'),
  onObsStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('obs:status', listener);
    return () => ipcRenderer.removeListener('obs:status', listener);
  },
  getObsSettings: () => ipcRenderer.invoke('obs:get-settings'),
  updateObsSettings: (settings) =>
    ipcRenderer.invoke('obs:update-settings', settings),
  clearObsPassword: () => ipcRenderer.invoke('obs:clear-password'),
  connectObs: () => ipcRenderer.invoke('obs:connect'),
  disconnectObs: () => ipcRenderer.invoke('obs:disconnect'),
  addObsMarker: (label) => ipcRenderer.invoke('obs:add-marker', label),
  getObsLatestSession: () => ipcRenderer.invoke('obs:get-latest-session'),
  copyObsText: (value) => ipcRenderer.invoke('obs:copy-text', value),
  copyOutputUrl: (kind) => ipcRenderer.invoke('output:copy-url', kind),
  openPerformerView: (snapshot) =>
    ipcRenderer.invoke('performer-view:open', snapshot),
  closePerformerView: () => ipcRenderer.invoke('performer-view:close'),
  publishPerformerSnapshot: (snapshot) =>
    ipcRenderer.invoke('performer-view:publish', snapshot),
  getPerformerViewStatus: () => ipcRenderer.invoke('performer-view:get-status'),
  onPerformerViewStatus: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('performer-view:status', listener);
    return () => ipcRenderer.removeListener('performer-view:status', listener);
  },
  onPerformerLyricsOffsetIntent: (callback) => {
    const listener = (event, intent) => callback(intent);
    ipcRenderer.on('performer-view:lyrics-offset-intent', listener);
    return () =>
      ipcRenderer.removeListener(
        'performer-view:lyrics-offset-intent',
        listener,
      );
  },
  listOutputSlots: () => ipcRenderer.invoke('output-slots:list'),
  upsertOutputSlot: (kind, slot) =>
    ipcRenderer.invoke('output-slots:upsert', kind, slot),
  updateOutputRecentColors: (colors) =>
    ipcRenderer.invoke('output-slots:set-recent-colors', colors),
  updateOutputSavedColors: (colors) =>
    ipcRenderer.invoke('output-slots:set-saved-colors', colors),
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
  getArtistIndex: () => ipcRenderer.invoke('library:get-artist-index'),
  autoResolveArtistIdentities: () =>
    ipcRenderer.invoke('library:auto-resolve-artist-identities'),
  mergeArtists: (artistIds, expectedRevision) =>
    ipcRenderer.invoke('library:merge-artists', {
      artistIds: Array.isArray(artistIds) ? artistIds.slice(0, 2) : [],
      expectedRevision,
    }),
  splitArtistCredit: (artistId, creditId, expectedRevision) =>
    ipcRenderer.invoke('library:split-artist-credit', {
      artistId,
      creditId,
      expectedRevision,
    }),
  setArtistDisplayName: (artistId, displayName, expectedRevision) =>
    ipcRenderer.invoke('library:set-artist-display-name', {
      artistId,
      displayName,
      expectedRevision,
    }),
  undoArtistOrganization: (expectedRevision) =>
    ipcRenderer.invoke('library:undo-artist-organization', {
      expectedRevision,
    }),
  searchArtistIdentityCandidates: (artistId) =>
    ipcRenderer.invoke('library:search-artist-identity-candidates', artistId),
  cancelArtistIdentityCandidates: (artistId) =>
    ipcRenderer.invoke('library:cancel-artist-identity-candidates', artistId),
  applyArtistIdentityCandidate: (artistId, candidateId, expectedRevision) =>
    ipcRenderer.invoke('library:apply-artist-identity-candidate', {
      artistId,
      candidateId,
      expectedRevision,
    }),
  resolveArtistPhoto: (artistId) =>
    ipcRenderer.invoke('library:resolve-artist-photo', artistId),
  searchArtistPhotoCandidates: (artistId) =>
    ipcRenderer.invoke('library:search-artist-photo-candidates', artistId),
  cancelArtistPhotoCandidates: (artistId) =>
    ipcRenderer.invoke('library:cancel-artist-photo-candidates', artistId),
  loadArtistPhotoCandidatePreview: (artistId, candidateId) =>
    ipcRenderer.invoke(
      'library:load-artist-photo-candidate-preview',
      artistId,
      candidateId,
    ),
  applyArtistPhotoCandidate: (artistId, candidateId) =>
    ipcRenderer.invoke(
      'library:apply-artist-photo-candidate',
      artistId,
      candidateId,
    ),
  chooseArtistPhoto: (artistId) =>
    ipcRenderer.invoke('library:choose-artist-photo', artistId),
  clearArtistPhoto: (artistId) =>
    ipcRenderer.invoke('library:clear-artist-photo', artistId),
  getLibraryStorage: () => ipcRenderer.invoke('library-storage:get'),
  setLibraryStoragePolicy: (policy) =>
    ipcRenderer.invoke(
      'library-storage:set-policy',
      libraryStoragePolicyIntent(policy),
    ),
  cleanupLibraryStorage: () => ipcRenderer.invoke('library-storage:cleanup'),
  listFolderPageObjects: (page) =>
    ipcRenderer.invoke(
      'folder-page-objects:list',
      folderPageIdentityIntent(page),
    ),
  chooseFolderPagePhoto: (page) =>
    ipcRenderer.invoke(
      'folder-page-objects:choose-photo',
      folderPageIdentityIntent(page),
    ),
  createFolderPageNote: (intent) =>
    ipcRenderer.invoke(
      'folder-page-objects:create-note',
      folderPageNoteCreateIntent(intent),
    ),
  updateFolderPageNote: (intent) =>
    ipcRenderer.invoke(
      'folder-page-objects:update-note',
      folderPageNoteIntent(intent),
    ),
  updateFolderPagePhotoText: (intent) =>
    ipcRenderer.invoke(
      'folder-page-objects:update-photo-text',
      folderPagePhotoTextIntent(intent),
    ),
  saveFolderPageLayout: (intent) =>
    ipcRenderer.invoke(
      'folder-page-objects:save-layout',
      folderPageLayoutIntent(intent),
    ),
  removeFolderPageObject: (intent) =>
    ipcRenderer.invoke(
      'folder-page-objects:remove',
      folderPageObjectTargetIntent(intent),
    ),
  importLocalAudioFiles: () => ipcRenderer.invoke('library:import-audio-files'),
  convertLocalAudioFiles: (sessionId) =>
    ipcRenderer.invoke(
      'library:convert-local-audio-files',
      typeof sessionId === 'string' ? sessionId : '',
    ),
  getTrackLyrics: (trackId, filename) =>
    ipcRenderer.invoke('lyrics:get-track', trackId, filename),
  getLyricsAcousticEstimate: (trackId, filename) =>
    ipcRenderer.invoke('lyrics:get-acoustic-estimate', trackId, filename),
  getLyricsAcousticCapabilityStatus: () =>
    ipcRenderer.invoke('lyrics-acoustic:status'),
  prepareLyricsAcousticCapability: () =>
    ipcRenderer.invoke('lyrics-acoustic:prepare'),
  verifyLyricsAcousticCapability: () =>
    ipcRenderer.invoke('lyrics-acoustic:verify'),
  repairLyricsAcousticCapability: () =>
    ipcRenderer.invoke('lyrics-acoustic:repair'),
  removeLyricsAcousticCapability: () =>
    ipcRenderer.invoke('lyrics-acoustic:remove'),
  cancelLyricsAcousticCapability: () =>
    ipcRenderer.invoke('lyrics-acoustic:cancel'),
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
  saveTrackEdits: (trackId, fields) =>
    ipcRenderer.invoke(
      'library:save-track-edits',
      trackId,
      trackEditIntent(fields),
    ),
  chooseTrackArtworkDraft: (trackId) =>
    ipcRenderer.invoke('library:choose-track-artwork-draft', trackId),
  discardTrackArtworkDraft: (trackId) =>
    ipcRenderer.invoke('library:discard-track-artwork-draft', trackId),
  searchTrackArtwork: (trackId, edits) =>
    ipcRenderer.invoke('library:search-track-artwork', trackId, edits),
  cancelTrackArtworkSearch: (trackId) =>
    ipcRenderer.invoke('library:cancel-track-artwork-search', trackId),
  loadTrackArtworkPreview: (trackId, candidateId) =>
    ipcRenderer.invoke(
      'library:load-track-artwork-preview',
      trackId,
      candidateId,
    ),
  openTrackArtworkSource: (trackId, candidateId) =>
    ipcRenderer.invoke(
      'library:open-track-artwork-source',
      trackId,
      candidateId,
    ),
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
  getPerformanceSessionPlan: () =>
    ipcRenderer.invoke('performance-session-plan:get'),
  setPerformanceSessionPlanProgress: (intent) =>
    ipcRenderer.invoke('performance-session-plan:set-progress', {
      itemId: intent?.itemId,
      expectedProgressRevision: intent?.expectedProgressRevision,
      progress: intent?.progress,
    }),
  replacePerformanceSessionPlanFromCollection: (intent) =>
    ipcRenderer.invoke(
      'performance-session-plan:replace-from-collection',
      performanceSessionPlanReplaceIntent(intent),
    ),
  appendPerformanceSessionPlanPlaceholders: (text) =>
    ipcRenderer.invoke('performance-session-plan:append-placeholders', text),
  appendPerformanceSessionPlanLibraryTrack: (trackId) =>
    ipcRenderer.invoke(
      'performance-session-plan:append-library-track',
      trackId,
    ),
  appendPerformanceSessionPlanManualItem: (intent) =>
    ipcRenderer.invoke(
      'performance-session-plan:append-manual-item',
      performanceSessionPlanManualIntent(intent),
    ),
  updatePerformanceSessionPlanItem: (intent) =>
    ipcRenderer.invoke(
      'performance-session-plan:update-item',
      performanceSessionPlanUpdateIntent(intent),
    ),
  movePerformanceSessionPlanItem: (intent) =>
    ipcRenderer.invoke(
      'performance-session-plan:move-item',
      performanceSessionPlanMoveIntent(intent),
    ),
  duplicatePerformanceSessionPlanItem: (itemId) =>
    ipcRenderer.invoke('performance-session-plan:duplicate-item', itemId),
  reorderPerformanceSessionPlanItem: (intent) =>
    ipcRenderer.invoke('performance-session-plan:reorder-item', {
      itemId: intent?.itemId,
      targetItemId: intent?.targetItemId,
      position: intent?.position,
    }),
  removePerformanceSessionPlanItem: (itemId) =>
    ipcRenderer.invoke('performance-session-plan:remove-item', itemId),
  setPerformanceSessionPlanReviewCursor: (itemId) =>
    ipcRenderer.invoke('performance-session-plan:set-review-cursor', itemId),
  clearPerformanceSessionPlan: () =>
    ipcRenderer.invoke('performance-session-plan:clear'),
  getBgmStandbyPlan: () => ipcRenderer.invoke('bgm-standby:get'),
  setBgmStandbyTrack: (trackId) =>
    ipcRenderer.invoke('bgm-standby:set-track', trackId),
  updateBgmStandbySettings: (intent) =>
    ipcRenderer.invoke(
      'bgm-standby:update-settings',
      bgmStandbySettingsIntent(intent),
    ),
  updateBgmStandbyPosition: (intent) =>
    ipcRenderer.invoke(
      'bgm-standby:update-position',
      bgmStandbyPositionIntent(intent),
    ),
  // Renderer sends product recipe intent only; main owns engine/model details.
  runSeparation: (trackId, recipeId) =>
    ipcRenderer.invoke('separation:run', trackId, recipeId),
  cancelSeparation: () => ipcRenderer.invoke('separation:cancel'),
  getSeparationQueueStatus: () =>
    ipcRenderer.invoke('separation:get-queue-status'),
  enqueueSeparations: (trackIds, recipeId, regenerate) =>
    ipcRenderer.invoke('separation:enqueue', {
      trackIds,
      recipeId,
      regenerate,
    }),
  pauseSeparationQueue: () => ipcRenderer.invoke('separation:pause-queue'),
  resumeSeparationQueue: () => ipcRenderer.invoke('separation:resume-queue'),
  moveSeparationQueueItem: (itemId, offset) =>
    ipcRenderer.invoke('separation:move-queue-item', itemId, offset),
  removeSeparationQueueItem: (itemId) =>
    ipcRenderer.invoke('separation:remove-queue-item', itemId),
  retrySeparationQueueItem: (itemId) =>
    ipcRenderer.invoke('separation:retry-queue-item', itemId),
  clearPendingSeparations: () => ipcRenderer.invoke('separation:clear-pending'),
  clearCompletedSeparations: () =>
    ipcRenderer.invoke('separation:clear-completed'),
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
  onSeparationQueueProgress: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('separation:queue-progress', listener);
    return () =>
      ipcRenderer.removeListener('separation:queue-progress', listener);
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
  setPlaybackState: (state) =>
    ipcRenderer.send('player:state', playbackStateIntent(state)),
  // Relays a thumbar click; the renderer stays the sole owner of the
  // <audio> element (see usePlayer.js), main never touches playback itself.
  onPlayerCommand: (callback) => {
    const listener = (event, command) => callback(command);
    ipcRenderer.on('player:command', listener);
    return () => ipcRenderer.removeListener('player:command', listener);
  },
});
