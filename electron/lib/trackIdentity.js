'use strict';

// Compatibility owner for source-specific metadata trust and search hints.

const {
  extractTitleDerivedSearchParts,
  looksLikeChannelArtist,
  normalizeForCompare,
  stripTrackDecorations,
} = require('./musicTitle.js');
const { normalizeText } = require('./musicIdentity/text.js');
const {
  firstText,
  normalizeIsrc,
} = require('./musicIdentity/observedTrack.js');

const TRACK_PLATFORMS = new Set([
  'spotify',
  'apple-music',
  'amazon-music',
  'kkbox',
  'deezer',
  'tidal',
  'yt-music',
]);

function secondsFromDuration(value) {
  if (!Number.isFinite(value)) return undefined;
  return value > 1000 ? Math.round(value / 1000) : Math.round(value);
}

function normalizeSourcePlatform(value) {
  const platform = normalizeText(value);
  const aliases = {
    appleMusic: 'apple-music',
    amazonMusic: 'amazon-music',
    youtubeMusic: 'yt-music',
    ytmusic: 'yt-music',
    'youtube-music': 'yt-music',
  };
  return aliases[platform] || platform || undefined;
}

function normalizeSourceType(value, sourcePlatform) {
  const type = normalizeText(value);
  if (type) return type;
  return TRACK_PLATFORMS.has(sourcePlatform) ? 'track' : 'unknown';
}

// This produces search hints, not persistent artist entities. Separators can
// be part of a legal group name, so callers must retain the credited string.
function splitArtistNames(value) {
  const parts = [];
  const values = Array.isArray(value) ? value : [value];
  for (const entry of values) {
    const artist = normalizeText(entry);
    if (!artist) continue;
    artist
      .split(
        /\s*(?:,|\uFF0C|\u3001|\/|\+|&|\band\b|\bwith\b|\bfeat\.?\b|\bfeaturing\b|\bft\.?\b|\u5408\u4f5c\u6f14\u51fa|\u5408\u5531|\s+\u548c\s+|\s+\u8207\s+|\s+\u53ca\s+)\s*/iu,
      )
      .map(normalizeText)
      .filter(Boolean)
      .forEach((part) => {
        const key = normalizeForCompare(part);
        if (!parts.some((existing) => normalizeForCompare(existing) === key)) {
          parts.push(part);
        }
      });
  }
  return parts;
}

function titleDerivedIdentity(metadata) {
  return extractTitleDerivedSearchParts(metadata?.title)[0] || null;
}

function explicitArtistFor(metadata) {
  return firstText([
    metadata?.canonicalArtist,
    metadata?.artistName,
    metadata?.artist,
    metadata?.artists,
  ]);
}

function isTrackLikeSource(sourcePlatform, sourceType) {
  return TRACK_PLATFORMS.has(sourcePlatform) || sourceType === 'track';
}

function isYoutubeUploadLikeSource(sourcePlatform, sourceType) {
  return (
    sourcePlatform === 'youtube' &&
    !isTrackLikeSource(sourcePlatform, sourceType)
  );
}

function hasReliableExplicitArtist(metadata, sourcePlatform) {
  const artist = explicitArtistFor(metadata);
  if (!artist || splitArtistNames(artist).length === 0) return false;
  return !(sourcePlatform === 'youtube' && looksLikeChannelArtist(artist));
}

function shouldTrustExplicitTitle(metadata, sourcePlatform, sourceType) {
  return (
    isTrackLikeSource(sourcePlatform, sourceType) ||
    (sourceType === 'playlist-entry' &&
      hasReliableExplicitArtist(metadata, sourcePlatform))
  );
}

function titleFromMetadata(metadata, sourcePlatform, sourceType, derived) {
  if (
    isYoutubeUploadLikeSource(sourcePlatform, sourceType) &&
    !shouldTrustExplicitTitle(metadata, sourcePlatform, sourceType) &&
    derived
  ) {
    return {
      title: derived.trackName,
      confidence: 'medium',
      source: 'title-derived',
    };
  }

  const explicitTitle = normalizeText(
    firstText([
      metadata?.canonicalTitle,
      metadata?.track,
      metadata?.trackName,
      metadata?.name,
      shouldTrustExplicitTitle(metadata, sourcePlatform, sourceType)
        ? metadata?.title
        : null,
    ]),
  );
  if (explicitTitle) {
    return {
      title: explicitTitle,
      confidence: 'high',
      source: 'metadata',
    };
  }

  if (derived) {
    return {
      title: derived.trackName,
      confidence: 'medium',
      source: 'title-derived',
    };
  }

  const cleanedTitle = stripTrackDecorations(metadata?.title);
  if (cleanedTitle) {
    return {
      title: cleanedTitle,
      confidence: sourcePlatform === 'youtube' ? 'low' : 'high',
      source: sourcePlatform === 'youtube' ? 'title-fallback' : 'metadata',
    };
  }

  return null;
}

function artistsFromMetadata(metadata, sourcePlatform, sourceType, derived) {
  if (
    isYoutubeUploadLikeSource(sourcePlatform, sourceType) &&
    !shouldTrustExplicitTitle(metadata, sourcePlatform, sourceType) &&
    derived?.artistNames?.length
  ) {
    return {
      artists: splitArtistNames(derived.artistNames),
      confidence: 'high',
      source: 'title-derived',
    };
  }

  const explicitArtist = explicitArtistFor(metadata);
  const artists = splitArtistNames(explicitArtist);
  if (artists.length > 0) {
    const confidence =
      sourcePlatform === 'youtube' && looksLikeChannelArtist(explicitArtist)
        ? 'low'
        : TRACK_PLATFORMS.has(sourcePlatform)
          ? 'high'
          : 'medium';
    return {
      artists,
      confidence,
      source: 'metadata',
    };
  }

  const uploaderArtists = splitArtistNames(metadata?.uploader);
  if (uploaderArtists.length > 0) {
    return {
      artists: uploaderArtists,
      confidence: 'low',
      source: 'uploader',
    };
  }

  if (derived?.artistNames?.length) {
    return {
      artists: splitArtistNames(derived.artistNames),
      confidence: 'medium',
      source: 'title-derived',
    };
  }

  return {
    artists: [],
    confidence: 'none',
    source: 'missing',
  };
}

function identityConfidence(titleConfidence, artistConfidence) {
  if (titleConfidence === 'high' && artistConfidence === 'high') return 'high';
  if (titleConfidence === 'low' || artistConfidence === 'low') return 'low';
  if (artistConfidence === 'none') return 'low';
  return 'medium';
}

function buildTrackIdentity(metadata = {}, options = {}) {
  const sourcePlatform = normalizeSourcePlatform(
    options.sourcePlatform || metadata.sourcePlatform || metadata.platform,
  );
  const sourceType = normalizeSourceType(
    options.sourceType || metadata.sourceType || metadata.type,
    sourcePlatform,
  );
  const derived = titleDerivedIdentity(metadata);
  const title = titleFromMetadata(
    metadata,
    sourcePlatform,
    sourceType,
    derived,
  );
  if (!title?.title) return null;

  const artist = artistsFromMetadata(
    metadata,
    sourcePlatform,
    sourceType,
    derived,
  );
  return {
    title: title.title,
    artists: artist.artists,
    artist: artist.artists.join(', ') || undefined,
    album: normalizeText(
      firstText([metadata.album, metadata.albumName, metadata.releaseName]),
    ),
    duration: secondsFromDuration(metadata.duration ?? metadata.durationMs),
    isrc: normalizeIsrc(metadata.isrc),
    sourcePlatform,
    sourceType,
    source:
      normalizeText(options.source || metadata.source) ||
      sourcePlatform ||
      title.source,
    sourceId: normalizeText(
      firstText([options.sourceId, metadata.sourceId, metadata.id]),
    ),
    sourceUrl: normalizeText(
      firstText([options.sourceUrl, metadata.sourceUrl, metadata.url]),
    ),
    confidence: identityConfidence(title.confidence, artist.confidence),
    titleConfidence: title.confidence,
    artistConfidence: artist.confidence,
  };
}

function identityArtistKeys(identity) {
  if (!identity || identity.artistConfidence === 'low') return [];
  return (identity.artists || [])
    .map(normalizeForCompare)
    .filter((key) => key.length >= 2);
}

function trackIdentityKey(identity) {
  if (!identity) return '';
  return [
    normalizeForCompare(identity.title),
    identityArtistKeys(identity).join(','),
    identity.duration ?? '',
    identity.isrc || '',
  ].join('|');
}

module.exports = {
  buildTrackIdentity,
  firstText,
  identityArtistKeys,
  normalizeIsrc,
  secondsFromDuration,
  splitArtistNames,
  trackIdentityKey,
};
