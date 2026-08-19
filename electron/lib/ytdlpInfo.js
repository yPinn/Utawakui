'use strict';

const { VIDEO_ID_RE } = require('./youtube');

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
  // Album fields are optional music metadata; do not invent fallbacks.
  const album = typeof info.album === 'string' ? info.album : undefined;
  const releaseYear =
    typeof info.release_year === 'number' ? info.release_year : undefined;
  return {
    title,
    artist,
    duration,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(album ? { album } : {}),
    ...(releaseYear ? { releaseYear } : {}),
  };
}

module.exports = {
  isHttpsUrl,
  extractThumbnailUrl,
  extractMetadataFields,
};
