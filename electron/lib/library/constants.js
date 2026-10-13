'use strict';

// One direct-play registry drives file selection, import validation, and media
// serving. A listed extension is not sufficient on its own: import also checks
// the detected container and codec for this family before persisting the file.
const AUDIO_FORMATS = Object.freeze(
  Object.fromEntries(
    Object.entries({
      '.aac': { family: 'adts-aac', mimeType: 'audio/aac' },
      '.adts': { family: 'adts-aac', mimeType: 'audio/aac' },
      '.bwf': { family: 'wave', mimeType: 'audio/wav' },
      '.flac': { family: 'flac', mimeType: 'audio/flac' },
      '.m4a': { family: 'mp4-aac', mimeType: 'audio/mp4' },
      '.mp3': { family: 'mp3', mimeType: 'audio/mpeg' },
      '.oga': { family: 'ogg-audio', mimeType: 'audio/ogg' },
      '.ogg': { family: 'ogg-audio', mimeType: 'audio/ogg' },
      '.opus': { family: 'ogg-opus', mimeType: 'audio/ogg' },
      '.wav': { family: 'wave', mimeType: 'audio/wav' },
      '.wave': { family: 'wave', mimeType: 'audio/wav' },
      '.webm': { family: 'webm-audio', mimeType: 'audio/webm' },
    }).map(([extension, format]) => [extension, Object.freeze(format)]),
  ),
);
// Recognized source formats that require an explicit, Main-owned compatibility
// conversion before they can enter the playable library. These extensions are
// picker-only: they are never added to AUDIO_MIME_TYPES or media serving.
const AUDIO_CONVERSION_FORMATS = Object.freeze(
  Object.fromEntries(
    Object.entries({
      '.aif': { family: 'aiff', sourceFormat: 'aiff', label: 'AIFF' },
      '.aifc': { family: 'aiff', sourceFormat: 'aiff', label: 'AIFF-C' },
      '.aiff': { family: 'aiff', sourceFormat: 'aiff', label: 'AIFF' },
      '.ape': {
        family: 'monkeys-audio',
        sourceFormat: 'ape',
        label: "Monkey's Audio",
      },
      '.caf': { family: 'caf', sourceFormat: 'caf', label: 'CAF' },
      '.wma': { family: 'asf-wma', sourceFormat: 'wma', label: 'WMA' },
      '.wv': {
        family: 'wavpack',
        sourceFormat: 'wavpack',
        label: 'WavPack',
      },
    }).map(([extension, format]) => [extension, Object.freeze(format)]),
  ),
);
const AUDIO_MIME_TYPES = Object.freeze(
  Object.fromEntries(
    Object.entries(AUDIO_FORMATS).map(([extension, format]) => [
      extension,
      format.mimeType,
    ]),
  ),
);
const IMAGE_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const MIME_TYPES = { ...AUDIO_MIME_TYPES, ...IMAGE_MIME_TYPES };
const AUDIO_EXTENSIONS = new Set(Object.keys(AUDIO_MIME_TYPES));
const AUDIO_CONVERSION_EXTENSIONS = new Set(
  Object.keys(AUDIO_CONVERSION_FORMATS),
);
const AUDIO_PICKER_EXTENSIONS = Object.freeze(
  [...Object.keys(AUDIO_MIME_TYPES), ...AUDIO_CONVERSION_EXTENSIONS].map(
    (extension) => extension.slice(1),
  ),
);
const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_MIME_TYPES));
const EXTENSION_BY_IMAGE_MIME_TYPE = Object.fromEntries(
  Object.entries(IMAGE_MIME_TYPES).map(([ext, mimeType]) => [mimeType, ext]),
);

const TRACKS_DIRNAME = 'tracks';
const DUPLICATES_DIRNAME = '.duplicates';
const LEGACY_SEPARATED_DIRNAME = '.separated';
const STRUCTURED_AUDIO_BASENAME = 'audio';
const ARTWORK_BASENAME = 'thumbnail';
const ARTWORK_PROVENANCE_FILENAME = 'artwork.json';
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
const READING_DOC_VERSION = 3;
// Per-recipe files avoid overwriting audio that may be open for playback.
// manifest.json stores selectedRecipeId and result provenance; it is not
// served. Separation files are per-result 4-channel WAVs: 0/1 accompaniment
// L/R, 2/3 vocals L/R. usePlayer.js depends on this order.
const SEPARATIONS_DIRNAME = 'separations';
const SEPARATION_MANIFEST_FILENAME = 'manifest.json';
const SEPARATION_MANIFEST_VERSION = 2;
const LYRICS_EXTENSIONS = new Set(['.vtt', '.lrc']);
const MANUAL_LYRICS_SOURCE_EXTENSIONS = new Set(['.vtt', '.lrc', '.txt']);
const TRANSLATED_SUBTITLE_TARGET_SUBTAGS = new Set(['en', 'ja', 'ko', 'zh']);
const CONTENT_HASH_CHUNK_SIZE = 1024 * 1024;

// Interim text metadata; future playback/lyrics state belongs in SQLite.
const INDEX_FILENAME = 'library.json';
const INDEX_VERSION = 2;

module.exports = {
  AUDIO_FORMATS,
  AUDIO_CONVERSION_FORMATS,
  AUDIO_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MIME_TYPES,
  AUDIO_EXTENSIONS,
  AUDIO_CONVERSION_EXTENSIONS,
  AUDIO_PICKER_EXTENSIONS,
  IMAGE_EXTENSIONS,
  EXTENSION_BY_IMAGE_MIME_TYPE,
  TRACKS_DIRNAME,
  DUPLICATES_DIRNAME,
  LEGACY_SEPARATED_DIRNAME,
  STRUCTURED_AUDIO_BASENAME,
  ARTWORK_BASENAME,
  ARTWORK_PROVENANCE_FILENAME,
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
