'use strict';

const {
  ANONYMOUS_YOUTUBE_PHASES,
  buildPhaseAttempts,
  isRetryableMetadataError,
  requireYoutubeRunner,
  runPhasedYoutubeAttempts,
} = require('../youtubeAttempts');

const CHANNEL_ID_RE = /^UC[0-9A-Za-z_-]{22}$/u;
const AVATAR_HOSTS = new Set(['yt3.googleusercontent.com', 'yt3.ggpht.com']);
// Auto-generated Topic channels use an album cover as their avatar.
const TOPIC_CHANNEL_SUFFIX_RE = /\s-\sTopic$/u;
const PREFERRED_AVATAR_SIZE = 900;

function isChannelId(value) {
  return typeof value === 'string' && CHANNEL_ID_RE.test(value);
}

function isTopicChannelName(value) {
  return (
    typeof value === 'string' && TOPIC_CHANNEL_SUFFIX_RE.test(value.trim())
  );
}

function isAllowedChannelAvatarUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && AVATAR_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

// Square, explicitly sized avatar first; avatar_uncropped is the fallback.
function selectAvatarUrl(info) {
  const thumbnails = Array.isArray(info?.thumbnails) ? info.thumbnails : [];
  const square = thumbnails
    .filter(
      (thumbnail) =>
        Number.isInteger(thumbnail?.width) &&
        thumbnail.width === thumbnail.height &&
        isAllowedChannelAvatarUrl(thumbnail.url),
    )
    .sort(
      (a, b) =>
        Math.abs(a.width - PREFERRED_AVATAR_SIZE) -
        Math.abs(b.width - PREFERRED_AVATAR_SIZE),
    )[0];
  if (square) return square.url;
  const uncropped = thumbnails.find(
    (thumbnail) => thumbnail?.id === 'avatar_uncropped',
  );
  return isAllowedChannelAvatarUrl(uncropped?.url) ? uncropped.url : null;
}

// Main derives the fixed channel URL; the renderer never supplies it.
async function fetchChannelAvatarUrl(channelId, { runner } = {}) {
  if (!isChannelId(channelId)) {
    return { status: 'error', reason: 'invalid-channel' };
  }
  let info;
  try {
    info = await runPhasedYoutubeAttempts(
      `https://www.youtube.com/channel/${channelId}/featured`,
      buildPhaseAttempts(
        ANONYMOUS_YOUTUBE_PHASES,
        {
          flatPlaylist: true,
          dumpSingleJson: true,
          quiet: true,
          noWarnings: true,
          playlistEnd: 1,
        },
        isRetryableMetadataError,
      ),
      requireYoutubeRunner(runner),
    );
  } catch {
    return { status: 'error', reason: 'provider-unavailable' };
  }
  const url = selectAvatarUrl(info);
  return url
    ? { status: 'ok', url }
    : { status: 'error', reason: 'avatar-unavailable' };
}

module.exports = {
  fetchChannelAvatarUrl,
  isAllowedChannelAvatarUrl,
  isChannelId,
  isTopicChannelName,
  selectAvatarUrl,
};
