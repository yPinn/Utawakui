'use strict';

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

// Accepts a bare 11-char video ID or a YouTube URL (watch/youtu.be/shorts/embed)
// and returns the canonical ID, or null if the input doesn't resolve to one.
// This is the only place untrusted renderer input gets interpreted before it's
// checked against VIDEO_ID_RE and handed to yt-dlp.
function extractVideoId(input) {
  const trimmed = String(input).trim();
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return VIDEO_ID_RE.test(id) ? id : null;
  }

  if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v');
      return id && VIDEO_ID_RE.test(id) ? id : null;
    }
    const match = url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/);
    if (match && VIDEO_ID_RE.test(match[1])) return match[1];
  }

  return null;
}

// Returns the `list` query param, or null (not an error — caller falls back
// to the single-video path). Not format-validated like VIDEO_ID_RE — yt-dlp
// itself rejects bad values, and the host check here is just a UX signal,
// not a security boundary (the request URL is always built by us).
//
// RD-prefixed ids are excluded even though otherwise valid: they're
// YouTube's auto-generated Radio/mix, not a fixed playlist, and confirmed
// empirically that yt-dlp's flat-playlist mode rejects them outright
// ("This playlist type is unviewable"). Returning null here routes them to
// the ordinary single-video path instead of surfacing that error.
function extractPlaylistId(input) {
  const trimmed = String(input).trim();

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'youtu.be' && !YOUTUBE_HOSTS.has(host)) return null;

  const listId = url.searchParams.get('list');
  if (!listId || listId.startsWith('RD')) return null;
  return listId;
}

module.exports = { VIDEO_ID_RE, extractVideoId, extractPlaylistId };
