'use strict';

const { normalizeForCompare, normalizeText } = require('./musicTitle.js');
const {
  firstText,
  normalizeIsrc,
  secondsFromDuration,
} = require('./trackIdentity.js');

const PLATFORM_HOSTS = [
  ['spotify', /(^|\.)spotify\.com$/iu],
  ['appleMusic', /(^|\.)music\.apple\.com$/iu],
  ['youtubeMusic', /(^|\.)music\.youtube\.com$/iu],
  ['youtube', /(^|\.)youtube\.com$|(^|\.)youtu\.be$/iu],
  ['amazonMusic', /(^|\.)music\.amazon\./iu],
  ['kkbox', /(^|\.)kkbox\.com$/iu],
  ['deezer', /(^|\.)deezer\.com$/iu],
  ['tidal', /(^|\.)tidal\.com$/iu],
];
const PLATFORM_PATH_PATTERNS = {
  spotify: [/\/track\/([A-Za-z0-9]+)/u],
  appleMusic: [/\/(?:album|song)\/[^/]+\/(\d+)/u],
  youtubeMusic: [/\/watch/u],
  youtube: [
    /\/watch/u,
    /\/shorts\/([A-Za-z0-9_-]{11})/u,
    /\/embed\/([A-Za-z0-9_-]{11})/u,
  ],
  amazonMusic: [/\/albums\/([A-Za-z0-9]+)/u, /\/tracks\/([A-Za-z0-9]+)/u],
  kkbox: [/\/song\/([^/?#]+)/u],
  deezer: [/\/track\/(\d+)/u],
  tidal: [/\/(?:browse\/)?track\/(\d+)/u],
};
const SPOTIFY_TRACK_URI_RE = /^spotify:track:([A-Za-z0-9]+)$/u;
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/u;

function identifyPlatform(hostname) {
  const host = normalizeText(hostname).toLocaleLowerCase();
  return PLATFORM_HOSTS.find(([, pattern]) => pattern.test(host))?.[0];
}

function parseSpotifyUri(input) {
  const match = SPOTIFY_TRACK_URI_RE.exec(normalizeText(input));
  if (!match) return null;
  return {
    platform: 'spotify',
    type: 'track',
    id: match[1],
    url: `https://open.spotify.com/track/${match[1]}`,
  };
}

function parseYoutubeIdFromUrl(url) {
  if (YOUTUBE_VIDEO_ID_RE.test(url.hostname)) return url.hostname;
  if (url.hostname.toLocaleLowerCase().endsWith('youtu.be')) {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return YOUTUBE_VIDEO_ID_RE.test(id) ? id : undefined;
  }
  const videoId = url.searchParams.get('v');
  if (YOUTUBE_VIDEO_ID_RE.test(videoId || '')) return videoId;
  for (const pattern of PLATFORM_PATH_PATTERNS.youtube) {
    const match = pattern.exec(url.pathname);
    if (match?.[1] && YOUTUBE_VIDEO_ID_RE.test(match[1])) return match[1];
  }
  return undefined;
}

function parsePlatformLink(input) {
  const spotifyUri = parseSpotifyUri(input);
  if (spotifyUri) return spotifyUri;

  let url;
  try {
    url = new URL(normalizeText(input));
  } catch {
    return null;
  }

  const platform = identifyPlatform(url.hostname);
  if (!platform) return null;

  if (platform === 'youtube' || platform === 'youtubeMusic') {
    const id = parseYoutubeIdFromUrl(url);
    if (!id) return null;
    return {
      platform,
      type: 'video',
      id,
      url: url.toString(),
    };
  }

  if (platform === 'appleMusic') {
    const songId = url.searchParams.get('i');
    const pathMatch = PLATFORM_PATH_PATTERNS.appleMusic[0].exec(url.pathname);
    return {
      platform,
      type: songId ? 'track' : 'album',
      id: songId || pathMatch?.[1],
      url: url.toString(),
    };
  }

  for (const pattern of PLATFORM_PATH_PATTERNS[platform] || []) {
    const match = pattern.exec(url.pathname);
    if (match?.[1]) {
      return {
        platform,
        type: 'track',
        id: decodeURIComponent(match[1]),
        url: url.toString(),
      };
    }
  }

  return null;
}

function normalizeMetadataCandidate(candidate) {
  const title = normalizeText(
    firstText([candidate?.title, candidate?.trackName, candidate?.name]),
  );
  const artist = normalizeText(
    firstText([candidate?.artist, candidate?.artistName, candidate?.artists]),
  );
  if (!title) return null;

  return {
    title,
    artist,
    album: normalizeText(firstText([candidate?.album, candidate?.albumName])),
    duration: secondsFromDuration(candidate?.duration ?? candidate?.durationMs),
    isrc: normalizeIsrc(candidate?.isrc),
    platform: normalizeText(candidate?.platform),
    source:
      normalizeText(candidate?.source) ||
      normalizeText(candidate?.platform) ||
      'metadata',
    confidence: candidate?.confidence === 'medium' ? 'medium' : 'high',
  };
}

function profileKey(profile) {
  return [
    normalizeForCompare(profile.title),
    normalizeForCompare(profile.artist),
    normalizeForCompare(profile.album),
    profile.duration ?? '',
    profile.isrc || '',
  ].join('|');
}

function pushUniqueProfile(profiles, profile) {
  if (!profile) return;
  const key = profileKey(profile);
  if (!key.split('|')[0]) return;
  if (profiles.some((existing) => profileKey(existing) === key)) return;
  profiles.push(profile);
}

function buildLyricsMetadataProfiles(track, enrichments = [], options = {}) {
  const profiles = [];
  const providedEnrichments = [
    ...(Array.isArray(track?.metadataCandidates)
      ? track.metadataCandidates
      : []),
    ...(Array.isArray(enrichments) ? enrichments : []),
  ];

  providedEnrichments
    .map(normalizeMetadataCandidate)
    .filter(Boolean)
    .sort((first, second) => {
      if (first.confidence === second.confidence) return 0;
      return first.confidence === 'high' ? -1 : 1;
    })
    .forEach((profile) => pushUniqueProfile(profiles, profile));

  if (options.includeTrackFallback !== false) {
    pushUniqueProfile(
      profiles,
      normalizeMetadataCandidate({
        title: track?.title,
        artist: track?.artist,
        duration: track?.duration,
        source: 'track-metadata',
        confidence: 'medium',
      }),
    );
  }

  return profiles;
}

module.exports = {
  buildLyricsMetadataProfiles,
  normalizeIsrc,
  normalizeMetadataCandidate,
  parsePlatformLink,
};
