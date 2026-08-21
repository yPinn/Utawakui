'use strict';

// MIME maps are the allowlist for servable media extensions.
const AUDIO_MIME_TYPES = {
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
};
const IMAGE_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const MIME_TYPES = { ...AUDIO_MIME_TYPES, ...IMAGE_MIME_TYPES };
const AUDIO_EXTENSIONS = new Set(Object.keys(AUDIO_MIME_TYPES));
const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_MIME_TYPES));
const EXTENSION_BY_IMAGE_MIME_TYPE = Object.fromEntries(
  Object.entries(IMAGE_MIME_TYPES).map(([ext, mimeType]) => [mimeType, ext]),
);

const TRACKS_DIRNAME = 'tracks';
const DUPLICATES_DIRNAME = '.duplicates';
const LEGACY_SEPARATED_DIRNAME = '.separated';
const STRUCTURED_AUDIO_BASENAME = 'audio';
const ARTWORK_BASENAME = 'thumbnail';
// User-chosen playlist/album cover images. Lives at the download-dir root
// (sibling of tracks/), not inside tracks/<id>/, since a cover belongs to a
// playlist id, not a track id.
const PLAYLIST_COVERS_DIRNAME = 'playlist-covers';
const PLAYLIST_COVER_BASENAME = 'cover';
const LYRICS_DIRNAME = 'lyrics';
const LYRICS_MANIFEST_FILENAME = 'lyrics.json';
const LYRICS_MANIFEST_VERSION = 8;
// Sidecar filenames are the FULL source filename + .json (not the stem) —
// manual.lrc and manual.vtt would otherwise collide on one reading doc.
const LYRICS_READINGS_DIRNAME = 'readings';
const READING_DOC_VERSION = 1;
// Per-preset files avoid overwriting audio that may be open for playback.
// manifest.json stores selectedPresetId and result metadata; it is not
// served. Separation files are per-preset 4-channel WAVs: 0/1 instrumental
// L/R, 2/3 vocals L/R. usePlayer.js depends on this order.
const SEPARATIONS_DIRNAME = 'separations';
const SEPARATION_MANIFEST_FILENAME = 'manifest.json';
const SEPARATION_MANIFEST_VERSION = 1;
const LYRICS_EXTENSIONS = new Set(['.vtt', '.lrc']);
const MANUAL_LYRICS_SOURCE_EXTENSIONS = new Set(['.vtt', '.lrc', '.txt']);
const TRANSLATED_SUBTITLE_TARGET_SUBTAGS = new Set(['en', 'ja', 'ko', 'zh']);
const CONTENT_HASH_CHUNK_SIZE = 1024 * 1024;

// Interim text metadata; future playback/lyrics state belongs in SQLite.
const INDEX_FILENAME = 'library.json';
const INDEX_VERSION = 2;

module.exports = {
  AUDIO_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MIME_TYPES,
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  EXTENSION_BY_IMAGE_MIME_TYPE,
  TRACKS_DIRNAME,
  DUPLICATES_DIRNAME,
  LEGACY_SEPARATED_DIRNAME,
  STRUCTURED_AUDIO_BASENAME,
  ARTWORK_BASENAME,
  PLAYLIST_COVERS_DIRNAME,
  PLAYLIST_COVER_BASENAME,
  LYRICS_DIRNAME,
  LYRICS_MANIFEST_FILENAME,
  LYRICS_MANIFEST_VERSION,
  LYRICS_READINGS_DIRNAME,
  READING_DOC_VERSION,
  SEPARATIONS_DIRNAME,
  SEPARATION_MANIFEST_FILENAME,
  SEPARATION_MANIFEST_VERSION,
  LYRICS_EXTENSIONS,
  MANUAL_LYRICS_SOURCE_EXTENSIONS,
  TRANSLATED_SUBTITLE_TARGET_SUBTAGS,
  CONTENT_HASH_CHUNK_SIZE,
  INDEX_FILENAME,
  INDEX_VERSION,
};
