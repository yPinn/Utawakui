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
    url = new globalThis.URL(trimmed);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return null;

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

export { VIDEO_ID_RE, YOUTUBE_HOSTS, extractVideoId };
