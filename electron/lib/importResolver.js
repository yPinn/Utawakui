'use strict';

const {
  extractTitleDerivedSearchParts,
  normalizeForCompare,
  normalizeText,
  OFFICIAL_MV_TITLE_RE,
  stripTrackDecorations,
} = require('./musicTitle.js');
const { buildTrackIdentity } = require('./trackIdentity.js');
const { durationDelta } = require('./lrclib.js');

// Prioritizes audio-native sources over MVs for lyrics reliability. A
// `yt-music-song` is evidence from YT Music's explicit Songs search section;
// stronger live／variant title signals are classified before that evidence.
const AUDIO_KIND_SCORES = {
  'yt-music-song': 95,
  'youtube-topic-audio': 88,
  'youtube-official-audio': 84,
  'yt-music-source': 72,
  'youtube-lyric-video': 58,
  'youtube-official-mv': 45,
  'youtube-live': 15,
  'youtube-variant': 20,
  'youtube-other': 35,
};
const LYRIC_VIDEO_RE = /\blyrics?\s+video\b|\blyric\s+video\b/iu;
const OFFICIAL_AUDIO_RE = /\bofficial\s+audio\b|\baudio\s+only\b/iu;
const LIVE_VERSION_RE =
  /\b(?:live|session|concert|tour|showcase|performance)\b/iu;
const CJK_NAMED_VARIANT_RE =
  /(?:氛[圍围](?:DJ)?版|DJ版|R&B版|翻唱|加速版|倍速版|慢速版|降速版|不插[電电]版)/iu;
const TOPIC_ARTIST_RE = /\btopic\b/iu;
const MAX_VISIBLE_CANDIDATES = 12;
const MAX_VIEW_COUNT_SCORE = 6;
const VIEW_COUNT_SCORE_FLOOR = 10_000;

function durationScore(delta) {
  if (delta === null) return 0;
  if (delta <= 4) return 14;
  if (delta <= 15) return 10;
  if (delta <= 45) return 4;
  return -18;
}

function confidenceForScore(score) {
  return score >= 90 ? 'high' : score >= 62 ? 'medium' : 'low';
}

function viewCountScore(viewCount) {
  if (!Number.isFinite(viewCount) || viewCount < VIEW_COUNT_SCORE_FLOOR) {
    return 0;
  }
  return Math.min(
    MAX_VIEW_COUNT_SCORE,
    Math.max(1, Math.floor(Math.log10(viewCount)) - 3),
  );
}

function textScore(expected, actual) {
  const left = normalizeForCompare(expected);
  const right = normalizeForCompare(actual);
  if (!left || !right) return 0;
  if (left === right) return 14;
  if (left.includes(right) || right.includes(left)) return 8;
  return 0;
}

function isYoutubeMusicInput(input) {
  try {
    return (
      new URL(normalizeText(input)).hostname.replace(/^www\./u, '') ===
      'music.youtube.com'
    );
  } catch {
    return false;
  }
}

function sourcePlatformForInput(input) {
  return isYoutubeMusicInput(input) ? 'yt-music' : 'youtube';
}

function candidateProviders(candidate) {
  const providers = [];
  if (Array.isArray(candidate?.availableProviders)) {
    providers.push(...candidate.availableProviders);
  }
  if (candidate?.searchProvider) providers.push(candidate.searchProvider);
  return [...new Set(providers.filter(Boolean))];
}

function maximumViewCount(...values) {
  const counts = values.filter(Number.isFinite);
  return counts.length > 0 ? Math.max(...counts) : undefined;
}

function compareCandidates(first, second) {
  return (
    second.score - first.score ||
    (first.durationDelta ?? Number.MAX_SAFE_INTEGER) -
      (second.durationDelta ?? Number.MAX_SAFE_INTEGER)
  );
}

function mergeCandidate(existing, candidate) {
  if (!existing) return candidate;

  const sourceCandidate = existing.isSource
    ? existing
    : candidate.isSource
      ? candidate
      : null;
  const strongerCandidate =
    candidate.score > existing.score ? candidate : existing;
  const baseCandidate = sourceCandidate || strongerCandidate;
  const mergedScore = Math.max(existing.score, candidate.score);
  const availableProviders = [
    ...new Set([
      ...candidateProviders(existing),
      ...candidateProviders(candidate),
    ]),
  ];

  return {
    ...baseCandidate,
    playbackKind: strongerCandidate.playbackKind,
    recordingFit: strongerCandidate.recordingFit,
    reason: strongerCandidate.reason,
    viewCount: maximumViewCount(existing.viewCount, candidate.viewCount),
    availableProviders:
      availableProviders.length > 0
        ? availableProviders
        : baseCandidate.availableProviders,
    score: mergedScore,
    confidence: confidenceForScore(mergedScore),
    alreadyDownloaded:
      Boolean(existing.alreadyDownloaded) ||
      Boolean(candidate.alreadyDownloaded),
    isSource: Boolean(existing.isSource) || Boolean(candidate.isSource),
  };
}

function classifyPlaybackKind(metadata = {}, input = '') {
  const title = normalizeText(metadata.title);
  const artist = normalizeText(metadata.artist || metadata.uploader);
  const combined = `${title} ${artist}`;
  const signals = metadata.signals || {};
  const variants = new Set(signals.variantFlags || []);

  if (variants.has('live') || LIVE_VERSION_RE.test(combined)) {
    return 'youtube-live';
  }
  if (
    ['cover', 'remix', 'sped-up', 'slowed', 'acoustic'].some((variant) =>
      variants.has(variant),
    ) ||
    CJK_NAMED_VARIANT_RE.test(combined)
  ) {
    return 'youtube-variant';
  }
  if (variants.has('official-audio') || OFFICIAL_AUDIO_RE.test(title)) {
    return 'youtube-official-audio';
  }
  if (
    (signals.hasStructuredTrack &&
      (signals.isTopicChannel || signals.isAutoGenerated)) ||
    TOPIC_ARTIST_RE.test(artist)
  ) {
    return 'youtube-topic-audio';
  }
  if (variants.has('lyric-video') || LYRIC_VIDEO_RE.test(title)) {
    return 'youtube-lyric-video';
  }
  if (variants.has('official-mv') || OFFICIAL_MV_TITLE_RE.test(title)) {
    return 'youtube-official-mv';
  }
  if (
    signals.isYoutubeMusicSong === true ||
    metadata.searchProvider === 'yt-music'
  ) {
    return 'yt-music-song';
  }
  if (isYoutubeMusicInput(input)) return 'yt-music-source';
  return 'youtube-other';
}

function recordingFitForKind(kind) {
  if (
    kind === 'yt-music-song' ||
    kind === 'youtube-topic-audio' ||
    kind === 'youtube-official-audio'
  ) {
    return 'release-recording';
  }
  if (kind === 'youtube-lyric-video') return 'offset-review';
  if (kind === 'youtube-live' || kind === 'youtube-variant') return 'mismatch';
  return 'version-review';
}

function canonicalTitleFor(metadata = {}) {
  if (metadata?.title && Array.isArray(metadata?.artists)) {
    return normalizeText(metadata.title);
  }
  const titleParts = extractTitleDerivedSearchParts(metadata.title);
  return normalizeText(
    metadata.canonicalTitle ||
      metadata.track ||
      titleParts[0]?.trackName ||
      stripTrackDecorations(metadata.title),
  );
}

function canonicalArtistFor(metadata = {}) {
  if (Array.isArray(metadata?.artists) && metadata.artists.length > 0) {
    return normalizeText(metadata.artists.join(', '));
  }
  const titleParts = extractTitleDerivedSearchParts(metadata.title);
  return normalizeText(
    metadata.canonicalArtist ||
      titleParts[0]?.artistNames?.[0] ||
      metadata.artist,
  );
}

function buildCandidate(candidate, context) {
  const playbackVideoId = normalizeText(
    candidate.playbackVideoId || candidate.id,
  );
  const playbackKind =
    normalizeText(candidate.playbackKind || candidate.kind) ||
    classifyPlaybackKind(candidate, context.input);
  const title = normalizeText(candidate.title) || context.canonicalTitle;
  const artist = normalizeText(candidate.artist) || context.canonicalArtist;
  const delta = durationDelta(context.canonicalDuration, candidate.duration);
  const score =
    (AUDIO_KIND_SCORES[playbackKind] ?? AUDIO_KIND_SCORES['youtube-other']) +
    textScore(context.canonicalTitle, title) +
    textScore(context.canonicalArtist, artist) +
    durationScore(delta) +
    viewCountScore(candidate.viewCount) +
    (candidate.isSource ? 0 : 5);

  return {
    id: playbackVideoId,
    playbackVideoId,
    sourceVideoId: context.sourceVideoId,
    title,
    artist,
    duration: candidate.duration,
    viewCount: candidate.viewCount,
    thumbnailUrl: candidate.thumbnailUrl,
    playbackKind,
    recordingFit: recordingFitForKind(playbackKind),
    searchProvider: candidate.searchProvider,
    availableProviders: Array.isArray(candidate.availableProviders)
      ? candidate.availableProviders
      : candidate.searchProvider
        ? [candidate.searchProvider]
        : undefined,
    confidence: confidenceForScore(score),
    score,
    durationDelta: delta,
    isSource: Boolean(candidate.isSource),
    alreadyDownloaded: context.existingIds.has(playbackVideoId),
    reason: candidate.reason || playbackKind,
  };
}

async function resolveYoutubeSearchQuery(query, options) {
  const canonical = {
    title: normalizeText(query),
    artist: '',
    duration: undefined,
    sourcePlatform: 'youtube',
    sourceType: 'query',
  };
  const playbackCandidates = await options.searchPlaybackCandidates(
    canonical,
    {},
    { sourcePlatform: 'youtube' },
  );
  const existingIds =
    options.existingIds instanceof Set
      ? options.existingIds
      : new Set(options.existingIds || []);
  const context = {
    input: canonical.title,
    sourceVideoId: null,
    canonicalTitle: canonical.title,
    canonicalArtist: '',
    canonicalDuration: undefined,
    existingIds,
  };
  const rankedCandidates = playbackCandidates
    .map((candidate) => buildCandidate(candidate, context))
    .filter((candidate) => candidate.id)
    .sort(compareCandidates);
  const candidates = rankedCandidates.slice(0, MAX_VISIBLE_CANDIDATES);
  const strongestCandidate = rankedCandidates[0] || null;
  const recommendedCandidate =
    strongestCandidate &&
    strongestCandidate.confidence !== 'low' &&
    strongestCandidate.recordingFit === 'release-recording' &&
    Number.isFinite(strongestCandidate.duration) &&
    strongestCandidate.duration > 0
      ? strongestCandidate
      : null;

  return {
    input: canonical.title,
    inputKind: 'text-query',
    sourceVideoId: null,
    source: null,
    canonical,
    trackIdentity: null,
    candidates,
    recommendedCandidate,
    downloadInput: recommendedCandidate?.playbackVideoId || null,
    needsSourceReview: !recommendedCandidate,
  };
}

function buildImportResolution({
  input,
  sourceVideoId,
  sourceMetadata,
  trackIdentity = null,
  playbackCandidates = [],
  existingIds = new Set(),
  canonical = {
    title: canonicalTitleFor(trackIdentity || sourceMetadata),
    artist: canonicalArtistFor(trackIdentity || sourceMetadata),
    duration: trackIdentity?.duration ?? sourceMetadata?.duration,
  },
}) {
  const normalizedExistingIds =
    existingIds instanceof Set ? existingIds : new Set(existingIds || []);
  const context = {
    input,
    sourceVideoId,
    canonicalTitle: canonical.title,
    canonicalArtist: canonical.artist,
    canonicalDuration: canonical.duration,
    existingIds: normalizedExistingIds,
  };
  const sourceCandidate = buildCandidate(
    {
      ...sourceMetadata,
      id: sourceVideoId,
      playbackVideoId: sourceVideoId,
      isSource: true,
    },
    context,
  );
  const candidatesById = new Map();
  for (const candidate of [
    sourceCandidate,
    ...playbackCandidates.map((candidate) =>
      buildCandidate(candidate, context),
    ),
  ]) {
    if (!candidate.id) continue;
    const existing = candidatesById.get(candidate.id);
    candidatesById.set(candidate.id, mergeCandidate(existing, candidate));
  }
  const rankedCandidates = [...candidatesById.values()].sort(compareCandidates);
  const sourceCandidateInList =
    candidatesById.get(sourceCandidate.id) || sourceCandidate;
  const candidates = [
    sourceCandidateInList,
    ...rankedCandidates.filter(
      (candidate) => candidate.id !== sourceCandidateInList.id,
    ),
  ].slice(0, MAX_VISIBLE_CANDIDATES);
  const recommendedCandidate = rankedCandidates[0] || sourceCandidate;

  return {
    input,
    sourceVideoId,
    source: sourceCandidate,
    canonical,
    trackIdentity,
    candidates,
    recommendedCandidate,
    downloadInput: recommendedCandidate.playbackVideoId,
    needsSourceReview: recommendedCandidate.confidence === 'low',
  };
}

async function resolveYoutubeImportSource(input, options) {
  const videoId = options.extractVideoId(input);
  if (!videoId) throw new Error('invalid video id or YouTube URL');

  const sourceMetadata = await options.fetchMetadata(videoId);
  if (!sourceMetadata) throw new Error('unable to fetch video metadata');

  const sourcePlatform = sourcePlatformForInput(input);
  const trackIdentity = buildTrackIdentity(sourceMetadata, {
    sourcePlatform,
    sourceType: sourcePlatform === 'yt-music' ? 'track' : 'video',
    sourceId: videoId,
    sourceUrl: input,
  });
  const canonical = {
    title: canonicalTitleFor(trackIdentity || sourceMetadata),
    artist: canonicalArtistFor(trackIdentity || sourceMetadata),
    duration: trackIdentity?.duration ?? sourceMetadata.duration,
  };
  const playbackCandidates =
    typeof options.searchPlaybackCandidates === 'function'
      ? await options.searchPlaybackCandidates(
          trackIdentity || canonical,
          sourceMetadata,
          {
            sourcePlatform,
          },
        )
      : [];

  return buildImportResolution({
    input,
    sourceVideoId: videoId,
    sourceMetadata,
    trackIdentity,
    playbackCandidates,
    existingIds: options.existingIds,
    canonical,
  });
}

module.exports = {
  buildImportResolution,
  classifyPlaybackKind,
  resolveYoutubeSearchQuery,
  resolveYoutubeImportSource,
  sourcePlatformForInput,
  viewCountScore,
};
