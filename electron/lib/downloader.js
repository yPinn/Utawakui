'use strict';

const fs = require('fs');
const path = require('path');
const youtubedl = require('youtube-dl-exec');
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

const DEFAULT_YOUTUBE_JS_RUNTIME = 'node';
const DEFAULT_AUDIO_FORMAT = 'bestaudio/best';
const FALLBACK_AUDIO_FORMAT = 'bestaudio[ext=m4a]/bestaudio/best';
const FALLBACK_YOUTUBE_EXTRACTOR_ARGS =
  'youtube:player_client=default,-android_vr,-android_sdkless;player_js_version=actual';
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
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

function applyYoutubeRuntimeOptions(options) {
  return {
    jsRuntimes:
      process.env.UTAWAKUI_YTDLP_JS_RUNTIME || DEFAULT_YOUTUBE_JS_RUNTIME,
    ...options,
  };
}

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

function isHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function extractThumbnailUrl(info) {
  if (isHttpsUrl(info.thumbnail)) return info.thumbnail;
  if (Array.isArray(info.thumbnails)) {
    const thumbnailUrl = [...info.thumbnails]
      .reverse()
      .map((thumbnail) => thumbnail?.url)
      .find(isHttpsUrl);
    if (thumbnailUrl) return thumbnailUrl;
  }

  if (typeof info.id === 'string' && VIDEO_ID_RE.test(info.id)) {
    return `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`;
  }
  return undefined;
}

// Shared by downloadAudio (reads a yt-dlp .info.json sidecar) and
// fetchMetadata (reads yt-dlp's --dump-single-json object directly) — same
// yt-dlp info shape either way, so the field-extraction rules must match.
function extractMetadataFields(info) {
  const title = typeof info.title === 'string' ? info.title : undefined;
  // info.artist only exists for videos yt-dlp recognized as music (e.g.
  // YT Music sources) — a plain YouTube upload falls back to the channel
  // name, which beats showing nothing.
  const artist =
    typeof info.artist === 'string'
      ? info.artist
      : typeof info.uploader === 'string'
        ? info.uploader
        : undefined;
  const duration =
    typeof info.duration === 'number' ? info.duration : undefined;
  const thumbnailUrl = extractThumbnailUrl(info);
  return {
    title,
    artist,
    duration,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
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

function finalizeDownloadedTrackFiles(trackDir, { resetLyrics = false } = {}) {
  const filenames = fs
    .readdirSync(trackDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  const audioFilename = filenames.find(isStructuredAudioFilename);
  if (!audioFilename) {
    throw new Error('yt-dlp reported success but no audio output file found');
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

function buildAudioDownloadOptionAttempts(baseOptions, info = null) {
  const attempts = [
    { format: DEFAULT_AUDIO_FORMAT },
    {
      format: FALLBACK_AUDIO_FORMAT,
      extractorArgs: FALLBACK_YOUTUBE_EXTRACTOR_ARGS,
    },
  ];

  return attempts.map((attempt) =>
    applyYoutubeRuntimeOptions(
      applySubtitleOptions(
        {
          ...baseOptions,
          ...attempt,
        },
        info,
      ),
    ),
  );
}

function isForbiddenAudioDownloadError(error) {
  const text = `${error?.stderr || ''}\n${error?.message || ''}`;
  return (
    /HTTP Error 403: Forbidden/i.test(text) &&
    /unable to download video data/i.test(text)
  );
}

async function runYoutubeDownloadAttempts(
  url,
  optionAttempts,
  runner = youtubedl,
) {
  let lastError;
  for (let index = 0; index < optionAttempts.length; index += 1) {
    try {
      return await runner(url, optionAttempts[index]);
    } catch (err) {
      lastError = err;
      const canRetry =
        index < optionAttempts.length - 1 && isForbiddenAudioDownloadError(err);
      if (!canRetry) throw err;
    }
  }
  throw lastError;
}

async function fetchVideoInfo(videoId) {
  try {
    const info = await youtubedl(
      `https://www.youtube.com/watch?v=${videoId}`,
      applyYoutubeRuntimeOptions({
        skipDownload: true,
        dumpSingleJson: true,
        quiet: true,
        noWarnings: true,
        noPlaylist: true,
      }),
    );
    return typeof info === 'object' && info !== null ? info : null;
  } catch {
    return null;
  }
}

function readTrackInfoMetadata(trackDir) {
  try {
    const info = JSON.parse(
      fs.readFileSync(path.join(trackDir, 'info.json'), 'utf8'),
    );
    return extractMetadataFields(info);
  } catch {
    return {};
  }
}

async function downloadAudio(videoId, destDir) {
  fs.mkdirSync(destDir, { recursive: true });

  const trackDir = resolveTrackDir(destDir, videoId);
  if (!trackDir) throw new Error('invalid video id');
  fs.mkdirSync(trackDir, { recursive: true });

  const outputTemplate = path.join(trackDir, 'audio.%(ext)s');
  const info = await fetchVideoInfo(videoId);
  const resetLyrics = lyricsManifestNeedsRescan(trackDir);

  await runYoutubeDownloadAttempts(
    `https://www.youtube.com/watch?v=${videoId}`,
    buildAudioDownloadOptionAttempts(
      {
        output: outputTemplate,
        noPlaylist: true,
        writeInfoJson: true,
        writeThumbnail: true,
      },
      info,
    ),
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
async function backfillTrackInfo(videoId, trackDir) {
  const before = readTrackSidecarState(trackDir);
  const info = await fetchVideoInfo(videoId);
  const resetLyrics = lyricsManifestNeedsRescan(trackDir);
  try {
    fs.mkdirSync(trackDir, { recursive: true });
    await youtubedl(
      `https://www.youtube.com/watch?v=${videoId}`,
      applyYoutubeRuntimeOptions(
        applySubtitleOptions(
          {
            skipDownload: true,
            output: path.join(trackDir, 'audio.%(ext)s'),
            noPlaylist: true,
            writeInfoJson: true,
            writeThumbnail: true,
            quiet: true,
            noWarnings: true,
          },
          info,
        ),
      ),
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

// Metadata-only lookup for library.js's runBackfillPass. Returns null on
// any failure — callers treat that as "couldn't backfill this time", not
// an exceptional error.
async function fetchMetadata(videoId) {
  const info = await fetchVideoInfo(videoId);

  if (typeof info !== 'object' || info === null) return null;
  return extractMetadataFields(info);
}

// --flat-playlist resolves fast (skips full per-video extraction) but still
// carries title/duration/uploader per entry (verified against a real
// uploads playlist). Unlike fetchMetadata, failures throw — this is a
// user-initiated action that should surface an error, not retry silently.
async function listPlaylist(playlistId) {
  const info = await youtubedl(
    `https://www.youtube.com/playlist?list=${playlistId}`,
    applyYoutubeRuntimeOptions({
      flatPlaylist: true,
      dumpSingleJson: true,
      quiet: true,
      noWarnings: true,
    }),
  );

  const entries = Array.isArray(info.entries) ? info.entries : [];
  return entries
    .filter((entry) => typeof entry.id === 'string')
    .map((entry) => ({ id: entry.id, ...extractMetadataFields(entry) }));
}

module.exports = {
  applyYoutubeRuntimeOptions,
  applySubtitleOptions,
  backfillTrackInfo,
  buildAudioDownloadOptionAttempts,
  buildSubtitleOptions,
  downloadAudio,
  fetchMetadata,
  extractMetadataFields,
  finalizeDownloadedTrackFiles,
  isForbiddenAudioDownloadError,
  readTrackInfoMetadata,
  readTrackSidecarState,
  runYoutubeDownloadAttempts,
  listPlaylist,
};
