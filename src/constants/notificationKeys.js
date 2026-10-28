// Every shell notification key in one place. A key names one operation's
// result slot: a newer result with the same key replaces the older one, so a
// key must be as wide as the result it stands for, and no wider.
export const NOTIFICATION_KEYS = Object.freeze({
  AUTO_ERROR_REPORT: 'auto-error-report',
  LIBRARY_CLEANUP: 'library-cleanup',
  LIBRARY_DELETE_TRACK: 'library-delete-track',
  LIBRARY_SEPARATION_ENQUEUE: 'library-separation-enqueue',
  LOCAL_IMPORT_RESULT: 'local-import-result',
  LYRICS_PROVIDER_CORPUS_EXPORT: 'lyrics-provider-corpus-export',
  LYRICS_WAVEFORM: 'lyrics-waveform',
  METRONOME_SOUND: 'metronome-sound',
  MUSIC_ANALYSIS_RESULT: 'music-analysis-result',
  PERFORMANCE_PLAYLIST_EXPORT: 'performance-playlist-export',
  PERFORMANCE_SESSION_ARCHIVE: 'performance-session-archive',
  PERFORMER_VIEW: 'performer-view',
  PLAYBACK_HISTORY_CLEAR: 'playback-history-clear',
  PLAYER_PERFORMANCE_SETTINGS: 'player-performance-settings',
  PLAYER_PLAYBACK: 'player-playback',
  SEPARATION_QUEUE_RESULT: 'separation-queue-result',
  TASK_APP_UPDATE: 'task:app-update',
  TASK_MUSIC_ANALYSIS_CAPABILITY: 'task:music-analysis-capability',
});

// Keys scoped by a bounded operation or owner id.
export const notificationKey = Object.freeze({
  diagnostics: (operation) => `diagnostics-${operation}`,
  folderObjects: (operation, page) => `folder:${operation}:${page}`,
  libraryDirectory: (operation) => `library-directory-${operation}`,
  lyricsProviderLookup: (action) => `lyrics-provider-lookup:${action}`,
  outputCopy: (kind) => `output-copy:${kind}`,
  performanceSession: (name) => `performance-session:${name}`,
  playlists: (operation) => `playlists:${operation}`,
  providerImport: (batchId) => `provider-import-${batchId}`,
  releaseBatch: (receipt) => `release-batch-${receipt}`,
  releaseDownload: (collectionScope) => `release-download:${collectionScope}`,
  releaseTrack: (job) => `release-track:${job}`,
  taskDependency: (dependencyId) => `task:dependency:${dependencyId}`,
});
