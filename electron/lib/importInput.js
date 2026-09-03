'use strict';

const {
  VIDEO_ID_RE,
  classifyPlaylistKind,
  extractPlaylistId,
  extractVideoId,
} = require('./youtube');

const MAX_IMPORT_INPUT_LENGTH = 2048;
const MAX_SEARCH_QUERY_LENGTH = 200;
function normalizeImportInput(value) {
  return String(value ?? '')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizedHost(url) {
  return url.hostname.toLocaleLowerCase().replace(/^www\./u, '');
}

function classifyImportInput(value) {
  const rawInput = String(value ?? '');
  if (rawInput.length > MAX_IMPORT_INPUT_LENGTH * 2) {
    return { kind: 'invalid', reason: 'input-too-long', input: '' };
  }
  const input = normalizeImportInput(rawInput);
  if (!input) return { kind: 'invalid', reason: 'empty', input };
  if (input.length > MAX_IMPORT_INPUT_LENGTH) {
    return { kind: 'invalid', reason: 'input-too-long', input: '' };
  }

  const url = /^[a-z][a-z\d+.-]*:\/\//iu.test(input) ? parseUrl(input) : null;
  const playlistId = extractPlaylistId(input);
  if (playlistId) {
    const isMusicHost = normalizedHost(url) === 'music.youtube.com';
    const isAlbum = classifyPlaylistKind(playlistId) === 'album';
    return {
      kind: isMusicHost && isAlbum ? 'youtube-music-album' : 'youtube-playlist',
      input,
      playlistId,
    };
  }

  const videoId = extractVideoId(input);
  if (videoId) {
    return {
      kind:
        url && normalizedHost(url) === 'music.youtube.com'
          ? 'youtube-music-video'
          : 'youtube-video',
      input,
      videoId,
    };
  }

  if (url) {
    const host = normalizedHost(url);
    if (host === 'open.spotify.com' || host === 'spotify.link') {
      return { kind: 'deferred-provider-url', platform: 'spotify', input };
    }
    if (host === 'music.apple.com') {
      return { kind: 'deferred-provider-url', platform: 'apple-music', input };
    }
    return { kind: 'unsupported-url', input };
  }

  if (VIDEO_ID_RE.test(input)) {
    return { kind: 'youtube-video', input, videoId: input };
  }
  if (input.length > MAX_SEARCH_QUERY_LENGTH) {
    return { kind: 'invalid', reason: 'query-too-long', input };
  }
  return { kind: 'text-query', input, query: input };
}

module.exports = {
  MAX_IMPORT_INPUT_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  classifyImportInput,
  normalizeImportInput,
};
