'use strict';

// Re-export-only barrel for electron/lib/library/ — no logic lives here.
// See CLAUDE.md's Architecture section for the module map and dependency
// direction. Do not add electron/lib/library/index.js: Node resolves
// require('./library') to this file first if both exist, which is exactly
// the ambiguity that would create. Nothing under library/ may
// require('../library') — that would create a load-time cycle back into
// this barrel.
//
// The destructure-then-shorthand-name form below (never a spread) is
// load-bearing: library.test.js uses ESM `import` against this CJS module,
// which relies on cjs-module-lexer statically detecting named exports from
// a single object-literal module.exports. A spread defeats that detection.

const { buildRangeResponse } = require('./library/range');
const {
  isArtworkFilename,
  isLyricsSubtitleFilename,
  isServableFilename,
  isStructuredAudioFilename,
  resolveTrackAssetPath,
  resolveTrackAudioPath,
  resolveTrackArtworkPath,
  resolveTrackDir,
  resolveTrackPath,
} = require('./library/paths');
const {
  isAutomaticLyricsLanguage,
  isTranslatedLyricsLanguage,
  getTrackLyricsState,
  loadTrackLyricsManifest,
  saveTrackLyricsManifest,
  backfillLyricsSourceLabels,
  setLyricsSourceLabel,
  setLyricsSourceOffset,
  deleteLyricsSource,
  allocateLyricsFilename,
  saveTrackLyricsText,
  importManualLyricsText,
  importManualLyricsFile,
  normalizeTrackLyricsSidecars,
  resolveTrackLyricsPath,
  readTrackLyrics,
} = require('./library/lyrics');
const {
  getTrackReading,
  deleteTrackReading,
  saveTrackReading,
  setReadingLine,
} = require('./library/lyricsReadings');
const {
  LYRICS_NORMALIZER_PROFILE_ID,
  LYRICS_TIMING_SCHEMA_VERSION,
  computeLyricsSourceFingerprint,
  deleteTrackLyricsTiming,
  loadTrackLyricsTiming,
  saveTrackLyricsTiming,
  timingSidecarPath,
  validateLyricsTimingDocument,
} = require('./library/lyricsTiming');
const {
  resolvePlaylistCoverPath,
  writePlaylistCoverFile,
  writePlaylistCoverFromUrl,
  deletePlaylistCoverDir,
} = require('./library/playlistCovers');
const {
  resolveSeparationsDir,
  loadSeparationManifest,
  recordSeparationResult,
  selectSeparationResult,
  hasSeparationResultFile,
  hasSeparation,
  resolveSeparationResultPath,
} = require('./library/separationManifest');
const {
  loadIndex,
  saveIndexEntry,
  migrateTrackAlbumMetadata,
} = require('./library/metadataIndex');
const {
  refreshTrackMetadataFromSidecars,
  findTrackRecord,
  listTracks,
  updateTrackMetadata,
  deleteTrack,
} = require('./library/tracks');
const {
  writeTrackArtworkFile,
  deleteTrackArtworkFile,
} = require('./library/trackArtwork');
const { importLocalAudioFiles } = require('./library/importLocal');
const { runBackfillPass } = require('./library/backfill');
const {
  INDEX_FILENAME,
  LYRICS_MANIFEST_VERSION,
} = require('./library/constants');

module.exports = {
  allocateLyricsFilename,
  backfillLyricsSourceLabels,
  buildRangeResponse,
  deleteLyricsSource,
  deleteTrack,
  deleteTrackArtworkFile,
  deleteTrackReading,
  deleteTrackLyricsTiming,
  findTrackRecord,
  hasSeparation,
  hasSeparationResultFile,
  INDEX_FILENAME,
  isArtworkFilename,
  isAutomaticLyricsLanguage,
  isLyricsSubtitleFilename,
  isTranslatedLyricsLanguage,
  isServableFilename,
  isStructuredAudioFilename,
  importManualLyricsFile,
  importManualLyricsText,
  importLocalAudioFiles,
  LYRICS_MANIFEST_VERSION,
  LYRICS_NORMALIZER_PROFILE_ID,
  LYRICS_TIMING_SCHEMA_VERSION,
  getTrackLyricsState,
  loadTrackLyricsManifest,
  getTrackReading,
  listTracks,
  loadIndex,
  loadSeparationManifest,
  loadTrackLyricsTiming,
  migrateTrackAlbumMetadata,
  normalizeTrackLyricsSidecars,
  readTrackLyrics,
  recordSeparationResult,
  deletePlaylistCoverDir,
  refreshTrackMetadataFromSidecars,
  resolvePlaylistCoverPath,
  writePlaylistCoverFile,
  writePlaylistCoverFromUrl,
  writeTrackArtworkFile,
  resolveTrackLyricsPath,
  resolveSeparationsDir,
  resolveSeparationResultPath,
  resolveTrackAssetPath,
  resolveTrackAudioPath,
  resolveTrackArtworkPath,
  resolveTrackDir,
  resolveTrackPath,
  runBackfillPass,
  saveIndexEntry,
  saveTrackLyricsManifest,
  saveTrackLyricsText,
  saveTrackLyricsTiming,
  saveTrackReading,
  selectSeparationResult,
  setLyricsSourceLabel,
  setLyricsSourceOffset,
  setReadingLine,
  updateTrackMetadata,
  computeLyricsSourceFingerprint,
  timingSidecarPath,
  validateLyricsTimingDocument,
};
