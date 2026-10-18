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
  if (typeof value !== 'string' || value.length > MAX_IMPORT_INPUT_LENGTH)
    return null;
  const input = value.trim();
  if (/[\s\p{Cc}]/u.test(input)) return null;
  try {
    const url = new URL(input);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

function normalizedHost(url) {
  return url.hostname.toLocaleLowerCase().replace(/^www\./u, '');
}

// Shared by manual import classification and clipboard suggestions. Keep only
// source identity; never inherit tracking, playback position, or user parameters.
function parseImportSourceUrl(value) {
  const url = parseUrl(value);
  if (!url) return null;
  const isMusicHost = normalizedHost(url) === 'music.youtube.com';
  const origin = isMusicHost
    ? 'https://music.youtube.com'
    : 'https://www.youtube.com';
  const playlistId = extractPlaylistId(url.href);
  if (playlistId) {
    const isAlbum = classifyPlaylistKind(playlistId) === 'album';
    return {
      kind: isMusicHost && isAlbum ? 'youtube-music-album' : 'youtube-playlist',
      input: `${origin}/playlist?list=${playlistId}`,
      playlistId,
    };
  }
  const videoId = extractVideoId(url.href);
  if (videoId) {
    return {
      kind: isMusicHost ? 'youtube-music-video' : 'youtube-video',
      input: `${origin}/watch?v=${videoId}`,
      videoId,
    };
  }
  return null;
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

  const source = parseImportSourceUrl(rawInput);
  if (source) return source;

  const isUrl = /^[a-z][a-z\d+.-]*:\/\//iu.test(rawInput.trim());
  const url = isUrl ? parseUrl(rawInput) : null;
  if (isUrl && !url) return { kind: 'unsupported-url', input: '' };

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
  parseImportSourceUrl,
  normalizeImportInput,
};
