'use strict';

const fs = require('fs');
const path = require('path');
const {
  isArtworkFilename,
  isLyricsSubtitleFilename,
  isStructuredAudioFilename,
  isTranslatedLyricsLanguage,
  LYRICS_MANIFEST_VERSION,
  normalizeTrackLyricsSidecars,
  resolveTrackDir,
  saveTrackLyricsManifest,
} = require('./library');
const { buildTrackIdentity } = require('./trackIdentity');
const {
  ANONYMOUS_YOUTUBE_PHASES,
  CLIENT_FALLBACK_YOUTUBE_PHASES,
  applyYoutubeRuntimeOptions,
  buildPhaseAttempts,
  getAuthenticatedYoutubePhases,
  isAudioFormatUnavailableError,
  isForbiddenAudioDownloadError,
  isRetryableMetadataError,
  requireYoutubeRunner,
  runPhasedYoutubeAttempts,
  shouldRetryForPhase,
  watchUrl,
} = require('./youtubeAttempts');
const {
  extractMetadataFields,
  extractMetadataMaintenanceFields,
  extractThumbnailUrl,
} = require('./ytdlpInfo');
const { classifyPlaylistKind } = require('./youtube');

const DEFAULT_AUDIO_FORMAT = 'bestaudio/best';
const FALLBACK_AUDIO_FORMAT = 'bestaudio[ext=m4a]/bestaudio/best';
// Some player clients (e.g. web_safari's HLS-only formats) let yt-dlp exit 0
// without ever writing a recognized audio file — this has to be checked per
// phase, not once after the whole ladder, or a bogus "success" stops retries.
const MISSING_AUDIO_OUTPUT_MESSAGE =
  'yt-dlp reported success but no audio output file found';
// Once escalating past the first phase, downloading at all beats sounding
// marginally better.
const PREFERRED_FORMAT_PHASE_IDS = new Set(['baseline']);
const JAPANESE_KANA_RE = /[\u3040-\u30ff]/;
const KOREAN_HANGUL_RE = /[\uac00-\ud7af]/;
const CJK_RE = /[\u3400-\u9fff]/;
const LATIN_RE = /[A-Za-z]/;
const SUBTITLE_LANGUAGE_PREFERENCES = {
  zh: ['zh-tw', 'zh-hant', 'zh-hk', 'zh-mo', 'zh'],
  ja: ['ja'],
  ko: ['ko'],
  en: ['en'],
};

function subtitleLanguageTags(subtitles) {
  if (!subtitles || typeof subtitles !== 'object') return [];
  return Object.keys(subtitles)
    .filter((tag) => tag !== 'live_chat')
    .filter((tag) => !isTranslatedLyricsLanguage(tag));
}

function normalizeLanguageTag(tag) {
  return String(tag || '')
    .toLocaleLowerCase()
    .replaceAll('_', '-');
}

function preferredSubtitleLanguagesFor(language) {
  const normalized = normalizeLanguageTag(language);
  if (normalized.startsWith('zh')) return SUBTITLE_LANGUAGE_PREFERENCES.zh;
  if (normalized.startsWith('ja')) return SUBTITLE_LANGUAGE_PREFERENCES.ja;
  if (normalized.startsWith('ko')) return SUBTITLE_LANGUAGE_PREFERENCES.ko;
  if (normalized.startsWith('en')) return SUBTITLE_LANGUAGE_PREFERENCES.en;
  return normalized ? [normalized] : [];
}

function inferPreferredSubtitleLanguages(info) {
  const text = `${info?.title || ''} ${info?.artist || ''} ${info?.uploader || ''}`;
  if (KOREAN_HANGUL_RE.test(text)) return preferredSubtitleLanguagesFor('ko');
  if (JAPANESE_KANA_RE.test(text)) return preferredSubtitleLanguagesFor('ja');
  if (CJK_RE.test(text)) return preferredSubtitleLanguagesFor('zh');
  if (LATIN_RE.test(text)) return preferredSubtitleLanguagesFor('en');
  if (typeof info?.language === 'string' && info.language.length > 0) {
    return preferredSubtitleLanguagesFor(info.language);
  }
  return [];
}

function languageTagBase(tag) {
  return normalizeLanguageTag(tag).replace(/-orig$/, '');
}

function languageTagMatchesPreference(tag, preference) {
  const normalized = languageTagBase(tag);
  const preferred = normalizeLanguageTag(preference);
  if (!preferred) return false;
  return normalized === preferred || normalized.startsWith(`${preferred}-`);
}

function pickMatchingLanguage(tags, preferences) {
  if (preferences.length === 0) return null;
  let bestTag = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const tag of tags) {
    const rank = preferences.findIndex((preference) =>
      languageTagMatchesPreference(tag, preference),
    );
    if (rank !== -1 && rank < bestRank) {
      bestTag = tag;
      bestRank = rank;
    }
  }
  return bestTag;
}

function noSubtitleOptions() {
  return {
    writeSubs: false,
    writeAutoSubs: false,
    subFormat: 'vtt',
  };
}

function buildSubtitleOptions(info = null) {
  const manualTags = subtitleLanguageTags(info?.subtitles);
  const preferences = inferPreferredSubtitleLanguages(info);
  const matchingManualTag = pickMatchingLanguage(manualTags, preferences);
  if (matchingManualTag) {
    return {
      writeSubs: true,
      writeAutoSubs: false,
      subLangs: matchingManualTag,
      subFormat: 'vtt',
    };
  }

  if (preferences.length === 0 && manualTags.length > 0) {
    return {
      writeSubs: true,
      writeAutoSubs: false,
      subLangs: manualTags[0],
      subFormat: 'vtt',
    };
  }

  return noSubtitleOptions();
}

function replaceFile(sourcePath, targetPath) {
  if (sourcePath === targetPath) return;
  try {
    fs.rmSync(targetPath, { force: true });
  } catch {
    // ignore
  }
  fs.renameSync(sourcePath, targetPath);
}

function lyricsManifestNeedsRescan(trackDir) {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(trackDir, 'lyrics', 'lyrics.json'), 'utf8'),
    );
    return manifest.version !== LYRICS_MANIFEST_VERSION;
  } catch {
    return false;
  }
}

function clearExistingLyrics(trackDir) {
  const lyricsDir = path.join(trackDir, 'lyrics');
  let entries;
  try {
    entries = fs.readdirSync(lyricsDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (
      entry.isFile() &&
      (isLyricsSubtitleFilename(entry.name) || entry.name === 'lyrics.json')
    ) {
      try {
        fs.rmSync(path.join(lyricsDir, entry.name), { force: true });
      } catch {
        // Leave it for the next reload if the file is temporarily locked.
      }
    }
  }
}

function hasStructuredAudioFile(trackDir) {
  return fs
    .readdirSync(trackDir, { withFileTypes: true })
    .some((entry) => entry.isFile() && isStructuredAudioFilename(entry.name));
}

function isMissingAudioOutputError(error) {
  return error?.message === MISSING_AUDIO_OUTPUT_MESSAGE;
}

function finalizeDownloadedTrackFiles(trackDir, { resetLyrics = false } = {}) {
  const filenames = fs
    .readdirSync(trackDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  const audioFilename = filenames.find(isStructuredAudioFilename);
  if (!audioFilename) {
    throw new Error(MISSING_AUDIO_OUTPUT_MESSAGE);
  }

  let infoFilename;
  if (filenames.includes('audio.info.json')) {
    infoFilename = 'info.json';
    replaceFile(
      path.join(trackDir, 'audio.info.json'),
      path.join(trackDir, infoFilename),
    );
  } else if (filenames.includes('info.json')) {
    infoFilename = 'info.json';
  }

  let thumbnailFilename;
  const thumbnailSource = filenames.find((name) => {
    const ext = path.extname(name);
    return name === `audio${ext}` && isArtworkFilename(`thumbnail${ext}`);
  });
  if (thumbnailSource) {
    thumbnailFilename = `thumbnail${path.extname(thumbnailSource).toLowerCase()}`;
    replaceFile(
      path.join(trackDir, thumbnailSource),
      path.join(trackDir, thumbnailFilename),
    );
  } else {
    thumbnailFilename = filenames.find(isArtworkFilename);
  }

  if (resetLyrics) clearExistingLyrics(trackDir);
  const lyricsSources = normalizeTrackLyricsSidecars(trackDir);
  saveTrackLyricsManifest(trackDir, lyricsSources);

  return { audioFilename, infoFilename, thumbnailFilename };
}

function readTrackSidecarState(trackDir) {
  let filenames;
  try {
    filenames = fs
      .readdirSync(trackDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return {
      hasInfo: false,
      thumbnailFilename: undefined,
      lyricsState: '',
      lyricsManifestState: '',
    };
  }

  let lyricsManifestState = '';
  try {
    lyricsManifestState = fs.readFileSync(
      path.join(trackDir, 'lyrics', 'lyrics.json'),
      'utf8',
    );
  } catch {
    // Missing manifest means lyrics have not been checked yet.
  }

  return {
    hasInfo: filenames.includes('info.json'),
    thumbnailFilename: filenames.find(isArtworkFilename),
    lyricsState: normalizeTrackLyricsSidecars(trackDir)
      .map((source) => source.filename)
      .join('\0'),
    lyricsManifestState,
  };
}

function didTrackSidecarsChange(before, after) {
  return (
    before.hasInfo !== after.hasInfo ||
    before.thumbnailFilename !== after.thumbnailFilename ||
    before.lyricsState !== after.lyricsState ||
    before.lyricsManifestState !== after.lyricsManifestState
  );
}

function applySubtitleOptions(options, info = null) {
  return {
    ...buildSubtitleOptions(info),
    ...options,
  };
}

// Kept separate from buildAudioDownloadAttempts below — this is the
// regression guard for the whole ladder, so its plain-array shape must stay
// stable.
function buildAudioDownloadOptionAttempts(
  baseOptions,
  info = null,
  phases = getAuthenticatedYoutubePhases(),
) {
  return phases.map((phase) =>
    applyYoutubeRuntimeOptions(
      applySubtitleOptions(
        {
          ...baseOptions,
          format: PREFERRED_FORMAT_PHASE_IDS.has(phase.id)
            ? DEFAULT_AUDIO_FORMAT
            : FALLBACK_AUDIO_FORMAT,
          ...phase.options,
        },
        info,
      ),
    ),
  );
}

function buildAudioDownloadAttempts(baseOptions, info = null) {
  const phases = getAuthenticatedYoutubePhases();
  const optionsList = buildAudioDownloadOptionAttempts(
    baseOptions,
    info,
    phases,
  );
  return phases.map((phase, index) => ({
    id: phase.id,
    options: optionsList[index],
    shouldRetry: shouldRetryForPhase(
      phase,
      (err) =>
        isForbiddenAudioDownloadError(err) ||
        isAudioFormatUnavailableError(err) ||
        isMissingAudioOutputError(err),
    ),
  }));
}

async function fetchVideoInfo(
  videoId,
  { runner, phases = ANONYMOUS_YOUTUBE_PHASES } = {},
) {
  const run = requireYoutubeRunner(runner);
  try {
    const info = await runPhasedYoutubeAttempts(
      watchUrl(videoId),
      buildPhaseAttempts(
        phases,
        {
          skipDownload: true,
          dumpSingleJson: true,
          quiet: true,
          noWarnings: true,
          noPlaylist: true,
        },
        isRetryableMetadataError,
      ),
      run,
    );
    return typeof info === 'object' && info !== null ? info : null;
  } catch {
    return null;
  }
}

function readTrackInfoJson(trackDir) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(trackDir, 'info.json'), 'utf8'),
    );
  } catch {
    return null;
  }
}

function readTrackInfoMetadata(trackDir) {
  const info = readTrackInfoJson(trackDir);
  return info ? extractMetadataFields(info) : {};
}

function readTrackInfoMaintenanceFields(trackDir) {
  const info = readTrackInfoJson(trackDir);
  return info ? extractMetadataMaintenanceFields(info) : null;
}

function cleanMetadataString(value) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

async function inferAlbumTitleFromFirstEntry(entries, { runner } = {}) {
  const rawEntries = Array.isArray(entries) ? entries : [];
  const albumFromFlatEntry = rawEntries
    .map((entry) => cleanMetadataString(entry?.album))
    .find(Boolean);
  if (albumFromFlatEntry) return albumFromFlatEntry;

  const firstEntry = rawEntries.find((entry) => typeof entry?.id === 'string');
  if (!firstEntry) return undefined;

  try {
    const info = await fetchVideoInfo(firstEntry.id, {
      runner,
      phases: CLIENT_FALLBACK_YOUTUBE_PHASES,
    });
    return cleanMetadataString(info?.album);
  } catch {
    return undefined;
  }
}

async function downloadAudio(videoId, destDir, options = {}) {
  const runner = requireYoutubeRunner(options.runner);
  fs.mkdirSync(destDir, { recursive: true });

  const trackDir = resolveTrackDir(destDir, videoId);
  if (!trackDir) throw new Error('invalid video id');
  fs.mkdirSync(trackDir, { recursive: true });

  const outputTemplate = path.join(trackDir, 'audio.%(ext)s');
  // Same cookie database the download attempts below will read anyway — a
  // transient failure here used to permanently record "no lyrics found".
  const info = await fetchVideoInfo(videoId, {
    phases: getAuthenticatedYoutubePhases(),
    runner,
  });
  const resetLyrics = lyricsManifestNeedsRescan(trackDir);

  // Verified per attempt, not once after the whole ladder — some clients let
  // yt-dlp exit 0 without writing a usable file, which must not stop retries.
  async function runAndVerifyAudioOutput(url, options) {
    const result = await runner(url, options);
    if (!hasStructuredAudioFile(trackDir)) {
      throw new Error(MISSING_AUDIO_OUTPUT_MESSAGE);
    }
    return result;
  }

  await runPhasedYoutubeAttempts(
    watchUrl(videoId),
    buildAudioDownloadAttempts(
      {
        output: outputTemplate,
        noPlaylist: true,
        writeInfoJson: true,
        writeThumbnail: true,
      },
      info,
    ),
    runAndVerifyAudioOutput,
  );

  const { audioFilename } = finalizeDownloadedTrackFiles(trackDir, {
    resetLyrics,
  });
  // Best-effort metadata extraction: a missing/corrupt info.json shouldn't
  // fail a download that otherwise succeeded, just leave these undefined.
  const fields = readTrackInfoMetadata(trackDir);

  return { filePath: path.join(trackDir, audioFilename), ...fields };
}

// Backfill existing structured tracks with yt-dlp sidecars only. The audio
// file already exists, so reload uses skipDownload and only refreshes
// info.json/thumbnail.* into the track directory.
async function backfillTrackInfo(videoId, trackDir, options = {}) {
  const runner = requireYoutubeRunner(options.runner);
  const before = readTrackSidecarState(trackDir);
  const info = await fetchVideoInfo(videoId, { runner });
  const resetLyrics = lyricsManifestNeedsRescan(trackDir);
  try {
    fs.mkdirSync(trackDir, { recursive: true });
    // Only the yt-dlp call is retried, not finalizeDownloadedTrackFiles.
    await runPhasedYoutubeAttempts(
      watchUrl(videoId),
      ANONYMOUS_YOUTUBE_PHASES.map((phase) => ({
        id: phase.id,
        options: applyYoutubeRuntimeOptions(
          applySubtitleOptions(
            {
              skipDownload: true,
              output: path.join(trackDir, 'audio.%(ext)s'),
              noPlaylist: true,
              writeInfoJson: true,
              writeThumbnail: true,
              quiet: true,
              noWarnings: true,
              ...phase.options,
            },
            info,
          ),
        ),
        shouldRetry: shouldRetryForPhase(phase, isRetryableMetadataError),
      })),
      runner,
    );
    finalizeDownloadedTrackFiles(trackDir, { resetLyrics });
  } catch {
    return null;
  }

  const fields = readTrackInfoMetadata(trackDir);
  const assetsUpdated = didTrackSidecarsChange(
    before,
    readTrackSidecarState(trackDir),
  );
  return fields.title || assetsUpdated ? { ...fields, assetsUpdated } : null;
}

// Metadata-only lookup for electron/lib/library/backfill.js's runBackfillPass. Returns null on
// any failure — callers treat that as "couldn't backfill this time", not
// an exceptional error.
async function fetchMetadata(videoId, options = {}) {
  const info = await fetchVideoInfo(videoId, {
    runner: requireYoutubeRunner(options.runner),
  });

  if (typeof info !== 'object' || info === null) return null;
  return extractMetadataFields(info);
}

// --flat-playlist resolves fast (skips full per-video extraction) but still
// carries title/duration/uploader per entry (verified against a real
// uploads playlist). Unlike fetchMetadata, failures throw — this is a
// user-initiated action that should surface an error, not retry silently.
async function fetchPlaylist(playlistId, options = {}) {
  const runner = requireYoutubeRunner(options.runner);
  const info = await runPhasedYoutubeAttempts(
    `https://www.youtube.com/playlist?list=${playlistId}`,
    buildPhaseAttempts(
      CLIENT_FALLBACK_YOUTUBE_PHASES,
      {
        flatPlaylist: true,
        dumpSingleJson: true,
        quiet: true,
        noWarnings: true,
      },
      isRetryableMetadataError,
    ),
    runner,
  );

  const entries = Array.isArray(info.entries) ? info.entries : [];
  const albumTitle =
    classifyPlaylistKind(playlistId) === 'album'
      ? await inferAlbumTitleFromFirstEntry(entries, { runner })
      : undefined;
  return {
    title: albumTitle || cleanMetadataString(info.title),
    // The playlist/album's own artwork, not any individual entry's —
    // present even under flatPlaylist since it comes from the playlist
    // page's own info, not from resolving each entry. extractThumbnailUrl's
    // video-id fallback branch is inert here since a playlist id never
    // matches VIDEO_ID_RE.
    thumbnailUrl: extractThumbnailUrl(info),
    entries: entries
      .filter((entry) => typeof entry.id === 'string')
      .map((entry) => {
        const fields = extractMetadataFields(entry);
        return {
          id: entry.id,
          ...fields,
          trackIdentity: buildTrackIdentity(
            { ...entry, ...fields },
            {
              sourcePlatform: 'youtube',
              sourceType: 'playlist-entry',
              sourceId: entry.id,
            },
          ),
        };
      }),
  };
}

module.exports = {
  applySubtitleOptions,
  backfillTrackInfo,
  buildAudioDownloadOptionAttempts,
  buildSubtitleOptions,
  downloadAudio,
  fetchMetadata,
  finalizeDownloadedTrackFiles,
  hasStructuredAudioFile,
  isMissingAudioOutputError,
  readTrackInfoMaintenanceFields,
  readTrackInfoMetadata,
  readTrackSidecarState,
  fetchPlaylist,
};
