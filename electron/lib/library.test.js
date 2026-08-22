// Barrel-surface guard: asserts every name library.js's barrel is supposed
// to re-export actually resolves to a real value of the expected type.
// Behavior tests live co-located under electron/lib/library/ (one file per
// submodule) — this file only catches a broken barrel (e.g. a spread that
// defeats cjs-module-lexer's named-export detection, or a typo'd require
// key), which would otherwise only surface as `undefined is not a function`
// in production.
import { describe, it, expect } from 'vitest';
import * as libraryBarrel from './library.js';

// `import * as` attaches a synthetic `default` key via CJS interop that is
// not a real named export of library.js — excluded below so this guard
// checks the barrel's actual module.exports shape, not the interop wrapper's.
const exportedNames = Object.keys(libraryBarrel).filter(
  (name) => name !== 'default',
);

const FUNCTION_EXPORTS = [
  'allocateLyricsFilename',
  'backfillLyricsSourceLabels',
  'buildRangeResponse',
  'computeLyricsSourceFingerprint',
  'deleteLyricsSource',
  'deleteTrack',
  'deleteTrackArtworkFile',
  'deleteTrackReading',
  'deleteTrackLyricsTiming',
  'findTrackRecord',
  'hasSeparation',
  'hasSeparationResultFile',
  'isArtworkFilename',
  'isAutomaticLyricsLanguage',
  'isLyricsSubtitleFilename',
  'isTranslatedLyricsLanguage',
  'isServableFilename',
  'isStructuredAudioFilename',
  'importManualLyricsFile',
  'importManualLyricsText',
  'importLocalAudioFiles',
  'getTrackLyricsState',
  'getTrackReading',
  'listTracks',
  'loadIndex',
  'loadSeparationManifest',
  'loadTrackLyricsTiming',
  'migrateTrackAlbumMetadata',
  'normalizeTrackLyricsSidecars',
  'readTrackLyrics',
  'recordSeparationResult',
  'deletePlaylistCoverDir',
  'refreshTrackMetadataFromSidecars',
  'resolvePlaylistCoverPath',
  'writePlaylistCoverFile',
  'writePlaylistCoverFromUrl',
  'writeTrackArtworkFile',
  'resolveTrackLyricsPath',
  'resolveSeparationsDir',
  'resolveSeparationResultPath',
  'resolveTrackArtworkPath',
  'resolveTrackAssetPath',
  'resolveTrackAudioPath',
  'resolveTrackDir',
  'resolveTrackPath',
  'runBackfillPass',
  'saveIndexEntry',
  'saveTrackLyricsManifest',
  'saveTrackLyricsText',
  'saveTrackLyricsTiming',
  'saveTrackReading',
  'selectSeparationResult',
  'setLyricsSourceLabel',
  'setReadingLine',
  'timingSidecarPath',
  'updateTrackMetadata',
  'validateLyricsTimingDocument',
];

const CONSTANT_EXPORTS = [
  'INDEX_FILENAME',
  'LYRICS_MANIFEST_VERSION',
  'LYRICS_NORMALIZER_PROFILE_ID',
  'LYRICS_TIMING_SCHEMA_VERSION',
];

describe('library.js barrel', () => {
  it('re-exports exactly the 61 names its consumers expect', () => {
    const expected = [...FUNCTION_EXPORTS, ...CONSTANT_EXPORTS].sort();
    expect(exportedNames.sort()).toEqual(expected);
  });

  it.each(FUNCTION_EXPORTS)('%s is a function', (name) => {
    expect(typeof libraryBarrel[name]).toBe('function');
  });

  it.each(CONSTANT_EXPORTS)('%s is a defined non-function constant', (name) => {
    expect(libraryBarrel[name]).toBeDefined();
    expect(typeof libraryBarrel[name]).not.toBe('function');
  });
});
