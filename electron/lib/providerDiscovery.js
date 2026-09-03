'use strict';

const {
  MAX_SEARCH_QUERY_LENGTH,
  normalizeImportInput,
} = require('./importInput');

const YOUTUBE_MUSIC_SEARCH_URL = 'https://music.youtube.com/search';
const YOUTUBE_MUSIC_SONGS_SECTION = 'songs';

function buildYoutubeMusicSearchUrl(value) {
  const rawQuery = String(value ?? '');
  if (rawQuery.length > MAX_SEARCH_QUERY_LENGTH * 2) return null;

  const query = normalizeImportInput(rawQuery);
  if (!query || query.length > MAX_SEARCH_QUERY_LENGTH) return null;

  const url = new URL(YOUTUBE_MUSIC_SEARCH_URL);
  url.searchParams.set('q', query);
  return url.toString();
}

function buildYoutubeMusicSongsSearchUrl(value) {
  const searchUrl = buildYoutubeMusicSearchUrl(value);
  if (!searchUrl) return null;

  const url = new URL(searchUrl);
  url.hash = YOUTUBE_MUSIC_SONGS_SECTION;
  return url.toString();
}

module.exports = {
  YOUTUBE_MUSIC_SEARCH_URL,
  buildYoutubeMusicSearchUrl,
  buildYoutubeMusicSongsSearchUrl,
};
