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
const {
  buildTrackIdentity,
  identityArtistKeys,
  splitArtistNames,
} = require('./trackIdentity');
const {
  extractTitleDerivedSearchParts,
  looksLikeChannelArtist,
  normalizeForCompare,
  normalizeText,
  OFFICIAL_MV_TITLE_RE,
  stripParenthesizedDecorations,
  stripTrackDecorations,
} = require('./musicTitle');

const DEFAULT_YOUTUBE_JS_RUNTIME = 'node';
const DEFAULT_AUDIO_FORMAT = 'bestaudio/best';
const FALLBACK_AUDIO_FORMAT = 'bestaudio[ext=m4a]/bestaudio/best';
const FALLBACK_YOUTUBE_EXTRACTOR_ARGS =
  'youtube:player_client=default,-android_vr,-android_sdkless;player_js_version=actual';
const PLAYBACK_SEARCH_LIMIT_PER_SOURCE = 5;
const MAX_PLAYBACK_SEARCH_CANDIDATES = 8;
const MAX_PLAYBACK_SEARCH_QUERIES = 4;
const MAX_CROSS_SEARCH_QUERIES = 2;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_MUSIC_VIDEO_RESULT_RE =
  /\b(?:music[-_\s]*)?videos?\b|\bmvs?\b|\bofficial[-_\s]*videos?\b/iu;
const YT_MUSIC_SONG_RESULT_RE = /\b(?:songs?|tracks?)\b/iu;
const YT_MUSIC_VIDEO_CONTEXT_TITLE_RE =
  /(?:\b4k\b|\bfull\s+(?:show|concert|performance)\b|校唱|校園演唱|演唱會|全程|完整(?:版|場)|合集|串燒)/iu;
// Applies even to explicitly-tagged "song" results, not just inferred ones
// (checked before the isExplicitSong branch below) — no legitimate karaoke
// song runs this long, so the cap is intentionally universal.
const MAX_YT_MUSIC_SONG_DURATION = 12 * 60;
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

function normalizeSearchQuery(value) {
  return stripParenthesizedDecorations(stripTrackDecorations(value))
    .replace(/["'`]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushUnique(values, value) {
  const normalized = normalizeSearchQuery(value);
  const key = normalizeForCompare(normalized);
  if (!key || values.some((existing) => existing.key === key)) return;
  values.push({ key, value: normalized });
}

function pushUniqueArtistKey(keys, value) {
  const key = normalizeForCompare(value);
  if (!key || key.length < 2 || keys.includes(key)) return;
  keys.push(key);
}

function pushSplitArtistKeys(keys, value) {
  for (const artistName of splitArtistNames(value)) {
    pushUniqueArtistKey(keys, artistName);
  }
  pushUniqueArtistKey(keys, value);
}

function shouldUseSourceTitleParts(canonical = {}) {
  return (
    canonical.sourcePlatform !== 'yt-music' && canonical.sourceType !== 'track'
  );
}

function titlePartsFor(canonical, sourceMetadata) {
  return shouldUseSourceTitleParts(canonical)
    ? extractTitleDerivedSearchParts(sourceMetadata.title)
    : [];
}

function buildExpectedArtistKeys(
  canonical = {},
  sourceMetadata = {},
  titleParts = titlePartsFor(canonical, sourceMetadata),
) {
  const keys = [...new Set(identityArtistKeys(canonical))];
  if (!looksLikeChannelArtist(canonical.artist)) {
    pushSplitArtistKeys(keys, canonical.artist);
  }

  for (const part of titleParts) {
    for (const artistName of part.artistNames || []) {
      pushSplitArtistKeys(keys, artistName);
    }
  }

  if (!looksLikeChannelArtist(sourceMetadata.artist)) {
    pushSplitArtistKeys(keys, sourceMetadata.artist);
  }

  return keys;
}

function buildCandidateArtistKeys(entry) {
  const keys = [];
  pushSplitArtistKeys(keys, entry?.artist);
  if (Array.isArray(entry?.artists)) {
    for (const artistName of entry.artists) {
      pushSplitArtistKeys(keys, artistName);
    }
  }
  return keys;
}

function candidateArtistMatchesExpected(entry, expectedArtistKeys = []) {
  if (expectedArtistKeys.length === 0) return true;
  const candidateKeys = buildCandidateArtistKeys(entry);
  if (candidateKeys.length === 0) return false;
  return candidateKeys.some((candidateKey) =>
    expectedArtistKeys.some(
      (expectedKey) =>
        candidateKey === expectedKey ||
        candidateKey.includes(expectedKey) ||
        expectedKey.includes(candidateKey),
    ),
  );
}

function buildSearchParts(
  canonical = {},
  sourceMetadata = {},
  titleParts = titlePartsFor(canonical, sourceMetadata),
) {
  const titles = [];
  const artists = [];

  pushUnique(titles, canonical.title);
  pushUnique(titles, sourceMetadata.track);
  pushUnique(titles, sourceMetadata.title);
  for (const part of titleParts) {
    pushUnique(titles, part.trackName);
  }

  pushUnique(artists, canonical.artist);
  for (const artistName of canonical.artists || []) {
    pushUnique(artists, artistName);
  }
  pushUnique(artists, sourceMetadata.artist);
  for (const part of titleParts) {
    for (const artistName of part.artistNames || []) {
      pushUnique(artists, artistName);
    }
  }

  const expandedArtists = [];
  for (const artist of artists) {
    for (const splitArtist of splitArtistNames(artist.value)) {
      pushUnique(expandedArtists, splitArtist);
    }
    pushUnique(expandedArtists, artist.value);
  }

  return {
    titles: titles.map((entry) => entry.value),
    artists: expandedArtists.map((entry) => entry.value),
  };
}

function buildPlaybackSearchQueries(
  canonical = {},
  sourceMetadata = {},
  titleParts = titlePartsFor(canonical, sourceMetadata),
) {
  const queries = [];
  const { titles, artists } = buildSearchParts(
    canonical,
    sourceMetadata,
    titleParts,
  );
  const primaryTitle = titles[0];
  const primaryArtist = artists[0];

  if (primaryTitle && primaryArtist) {
    pushUnique(queries, `${primaryArtist} ${primaryTitle}`);
    pushUnique(queries, `${primaryTitle} ${primaryArtist}`);
  }
  if (artists[1] && primaryTitle) {
    pushUnique(queries, `${artists[1]} ${primaryTitle}`);
  }
  pushUnique(queries, primaryTitle);
  for (const artist of artists.slice(2)) {
    if (primaryTitle) pushUnique(queries, `${artist} ${primaryTitle}`);
  }
  for (const title of titles.slice(1)) {
    pushUnique(queries, title);
    if (primaryArtist) pushUnique(queries, `${primaryArtist} ${title}`);
  }

  return queries
    .slice(0, MAX_PLAYBACK_SEARCH_QUERIES)
    .map((entry) => entry.value);
}

function isCloseDuration(first, second) {
  if (!Number.isFinite(first) || !Number.isFinite(second)) return false;
  return Math.abs(Math.round(first) - Math.round(second)) <= 15;
}

function buildPlaybackCrossSearchQueries(candidates, canonical = {}) {
  const queries = [];
  for (const candidate of candidates) {
    if (!isCloseDuration(candidate.duration, canonical.duration)) continue;
    const title = normalizeSearchQuery(candidate.title);
    const artist = normalizeSearchQuery(candidate.artist);
    if (!title || !artist) continue;
    pushUnique(queries, `${artist} ${title}`);
    pushUnique(queries, `${title} ${artist}`);
    if (queries.length >= MAX_CROSS_SEARCH_QUERIES) break;
  }

  return queries.slice(0, MAX_CROSS_SEARCH_QUERIES).map((entry) => entry.value);
}

function buildYoutubeMusicSearchUrl(query) {
  const url = new URL('https://music.youtube.com/search');
  url.searchParams.set('q', query);
  return `${url.toString()}#songs`;
}

function extractSearchEntries(info) {
  if (Array.isArray(info?.entries)) return info.entries;
  return [];
}

function youtubeMusicResultTypeText(entry) {
  return [
    entry?.resultType,
    entry?.result_type,
    entry?.itemType,
    entry?.item_type,
    entry?.musicType,
    entry?.music_type,
    entry?.category,
    entry?.type,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');
}

function isYoutubeMusicSongSearchCandidate(entry, context = {}) {
  const typeText = youtubeMusicResultTypeText(entry);
  const isExplicitSong = YT_MUSIC_SONG_RESULT_RE.test(typeText);
  if (YT_MUSIC_VIDEO_RESULT_RE.test(typeText)) return false;
  const title = normalizeText(entry?.title);
  if (OFFICIAL_MV_TITLE_RE.test(title)) return false;
  if (YT_MUSIC_VIDEO_CONTEXT_TITLE_RE.test(title)) return false;
  if (
    Number.isFinite(entry?.duration) &&
    entry.duration > MAX_YT_MUSIC_SONG_DURATION
  ) {
    return false;
  }
  if (isExplicitSong && buildCandidateArtistKeys(entry).length === 0) {
    return true;
  }
  // Past this point every video/live/oversized/mismatched-title case has
  // already been rejected above — an ambiguous (neither explicitly a song
  // nor explicitly a video) result is accepted rather than rejected.
  if (!candidateArtistMatchesExpected(entry, context.expectedArtistKeys)) {
    return false;
  }
  return true;
}

function normalizePlaybackSearchCandidate(entry, provider, context = {}) {
  if (!entry || typeof entry.id !== 'string' || !VIDEO_ID_RE.test(entry.id)) {
    return null;
  }
  if (
    provider === 'yt-music' &&
    !isYoutubeMusicSongSearchCandidate(entry, context)
  ) {
    return null;
  }

  const fields = extractMetadataFields(entry);
  return {
    id: entry.id,
    playbackVideoId: entry.id,
    ...fields,
    playbackKind: provider === 'yt-music' ? 'yt-music-song' : undefined,
    searchProvider: provider,
    availableProviders: [provider],
    reason: provider === 'yt-music' ? 'yt-music-search' : 'youtube-search',
  };
}

async function fetchPlaybackSearchEntries(input, runner = youtubedl) {
  const info = await runner(
    input,
    applyYoutubeRuntimeOptions({
      flatPlaylist: true,
      skipDownload: true,
      dumpSingleJson: true,
      quiet: true,
      noWarnings: true,
      playlistEnd: PLAYBACK_SEARCH_LIMIT_PER_SOURCE,
    }),
  );
  return extractSearchEntries(info);
}

// Gated by the *platform of the user's input URL*, not an attempt to prove
// the resulting candidates are the same song as the source — cross-platform
// identity between a plain YouTube video and a YT Music track can't be
// proven (confirmed by probing YT Music's internal "counterpart" API
// anonymously against several major-label songs and getting no hits). A
// YT Music source is trusted as-is (no further search); a plain YouTube
// source has no such platform-level guarantee, so search widens to also
// look for a more lyrics-reliable audio-native match. See
// importResolver.js's AUDIO_KIND_SCORES for how those candidates get
// ranked once found.
function buildPlaybackSearchSources(queries, { sourcePlatform } = {}) {
  return queries.flatMap((query) => {
    const musicSource = {
      provider: 'yt-music',
      input: buildYoutubeMusicSearchUrl(query),
    };
    if (sourcePlatform === 'yt-music') return [musicSource];
    return [
      musicSource,
      {
        provider: 'youtube',
        input: `ytsearch${PLAYBACK_SEARCH_LIMIT_PER_SOURCE}:${query}`,
      },
    ];
  });
}

async function fetchSettledPlaybackSearches(searchSources, runner) {
  const settled = await Promise.allSettled(
    searchSources.map(async (source) => ({
      provider: source.provider,
      entries: await fetchPlaybackSearchEntries(source.input, runner),
    })),
  );

  return settled.filter((result) => result.status === 'fulfilled');
}

function mergeSearchCandidates(existing, incoming) {
  const providers = [
    ...(existing.availableProviders || [existing.searchProvider]),
    ...(incoming.availableProviders || [incoming.searchProvider]),
  ].filter(Boolean);
  const availableProviders = [...new Set(providers)];
  const preferIncoming =
    incoming.searchProvider === 'yt-music' ||
    (existing.searchProvider !== 'yt-music' &&
      !existing.artist &&
      Boolean(incoming.artist));
  const primary = preferIncoming ? incoming : existing;
  const secondary = preferIncoming ? existing : incoming;

  return {
    ...secondary,
    ...primary,
    title: primary.title || secondary.title,
    artist: primary.artist || secondary.artist,
    duration: primary.duration || secondary.duration,
    thumbnailUrl: primary.thumbnailUrl || secondary.thumbnailUrl,
    playbackKind:
      primary.playbackKind ||
      (availableProviders.includes('yt-music') ? 'yt-music-song' : undefined) ||
      secondary.playbackKind,
    searchProvider: availableProviders.includes('yt-music')
      ? 'yt-music'
      : primary.searchProvider,
    availableProviders,
    reason: availableProviders.includes('yt-music')
      ? 'yt-music-search'
      : primary.reason || secondary.reason,
  };
}

function addSearchResults(candidatesById, settledResults, context = {}) {
  for (const result of settledResults) {
    for (const entry of result.value.entries) {
      const candidate = normalizePlaybackSearchCandidate(
        entry,
        result.value.provider,
        context,
      );
      if (!candidate) continue;
      const existing = candidatesById.get(candidate.id);
      if (existing) {
        candidatesById.set(
          candidate.id,
          mergeSearchCandidates(existing, candidate),
        );
        continue;
      }
      candidatesById.set(candidate.id, candidate);
    }
  }
}

async function searchPlaybackCandidates(
  canonical,
  sourceMetadata,
  options = {},
) {
  const runner = options.runner || youtubedl;
  const titleParts = titlePartsFor(canonical, sourceMetadata);
  const queries = buildPlaybackSearchQueries(
    canonical,
    sourceMetadata,
    titleParts,
  );
  const candidatesById = new Map();
  const searchContext = {
    expectedArtistKeys: buildExpectedArtistKeys(
      canonical,
      sourceMetadata,
      titleParts,
    ),
  };
  const searchSources = buildPlaybackSearchSources(queries, {
    sourcePlatform: options.sourcePlatform,
  });
  const searchedInputs = new Set(searchSources.map((source) => source.input));

  addSearchResults(
    candidatesById,
    await fetchSettledPlaybackSearches(searchSources, runner),
    searchContext,
  );

  const crossQueries = buildPlaybackCrossSearchQueries(
    [...candidatesById.values()],
    canonical,
  );
  const crossSources = buildPlaybackSearchSources(crossQueries, {
    sourcePlatform: options.sourcePlatform,
  }).filter((source) => !searchedInputs.has(source.input));
  if (crossSources.length > 0) {
    addSearchResults(
      candidatesById,
      await fetchSettledPlaybackSearches(crossSources, runner),
      searchContext,
    );
  }

  return [...candidatesById.values()].slice(0, MAX_PLAYBACK_SEARCH_CANDIDATES);
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
async function listPlaylist(playlistId, options = {}) {
  const runner = options.runner || youtubedl;
  const info = await runner(
    `https://www.youtube.com/playlist?list=${playlistId}`,
    applyYoutubeRuntimeOptions({
      flatPlaylist: true,
      dumpSingleJson: true,
      quiet: true,
      noWarnings: true,
    }),
  );

  const entries = Array.isArray(info.entries) ? info.entries : [];
  return {
    title: typeof info.title === 'string' ? info.title : undefined,
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
  applyYoutubeRuntimeOptions,
  applySubtitleOptions,
  backfillTrackInfo,
  buildAudioDownloadOptionAttempts,
  buildPlaybackCrossSearchQueries,
  buildPlaybackSearchQueries,
  buildSubtitleOptions,
  downloadAudio,
  fetchMetadata,
  extractMetadataFields,
  finalizeDownloadedTrackFiles,
  isForbiddenAudioDownloadError,
  readTrackInfoMetadata,
  readTrackSidecarState,
  runYoutubeDownloadAttempts,
  searchPlaybackCandidates,
  listPlaylist,
};
