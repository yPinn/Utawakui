'use strict';

const sax = require('sax');
const { readBoundedText } = require('../lrclib/client');
const { createProviderRequestGuard } = require('../providerServiceCooldown');

const ALBUM_ID = /^OLAK5uy_[A-Za-z0-9_-]{1,120}$/;
const cache = new Map();
const MAX_AGE = 15 * 60 * 1000;
const TYPE_LABELS = new Map([
  ['Single', 'single'],
  ['EP', 'ep'],
  ['Album', 'album'],
]);

// Decode only string literals from the bootstrap envelope. Never evaluate the
// provider's JavaScript; year evidence comes only from the matched album header.
function decodeBootstrapString(value) {
  const escapes = {
    '\\': '\\',
    "'": "'",
    '"': '"',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
  };
  return value.replace(
    /\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\\/'"bfnrt])/g,
    (_, part) =>
      part[0] === 'x' || part[0] === 'u'
        ? String.fromCharCode(parseInt(part.slice(1), 16))
        : escapes[part],
  );
}

function albumHeaderYear(html, playlistId, title, type) {
  if (!ALBUM_ID.test(playlistId) || !title || !type) return undefined;
  const records =
    /initialData\.push\(\{path:\s*'((?:\\.|[^'\\])*)',\s*params:\s*JSON\.parse\('(?:\\.|[^'\\])*'\),\s*data:\s*'((?:\\.|[^'\\])*)'/g;
  for (const match of html.matchAll(records)) {
    if (decodeBootstrapString(match[1]) !== '/browse') continue;
    try {
      const data = JSON.parse(decodeBootstrapString(match[2]));
      const metadata = data.microformat?.microformatDataRenderer;
      const url = new URL(metadata?.urlCanonical);
      if (
        url.origin !== 'https://music.youtube.com' ||
        url.pathname !== '/playlist' ||
        url.searchParams.get('list') !== playlistId ||
        metadata.ogType !== 'music.album'
      )
        continue;
      const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs;
      if (!Array.isArray(tabs)) continue;
      for (const tab of tabs) {
        const sections =
          tab?.tabRenderer?.content?.sectionListRenderer?.contents;
        if (!Array.isArray(sections)) continue;
        for (const section of sections) {
          const header = section?.musicResponsiveHeaderRenderer;
          const heading = header?.title?.runs
            ?.map((run) => run.text || '')
            .join('');
          const runs = header?.subtitle?.runs;
          if (
            heading !== title ||
            !Array.isArray(runs) ||
            TYPE_LABELS.get(runs[0]?.text) !== type ||
            !header?.buttons?.some(
              (button) =>
                button?.musicPlayButtonRenderer?.playNavigationEndpoint
                  ?.watchPlaylistEndpoint?.playlistId === playlistId,
            )
          )
            continue;
          const years = runs
            .map((run) => run.text)
            .filter(
              (value) =>
                typeof value === 'string' && /^[1-9][0-9]{3}$/.test(value),
            );
          if (years.length === 1) return years[0];
        }
      }
    } catch {
      /* Unknown bootstrap variants leave the year unobserved. */
    }
  }
  return undefined;
}

function youtubeMusicReleaseObservations(release, source, previous = {}) {
  if (
    !['youtube', 'yt-music'].includes(source?.platform) ||
    !ALBUM_ID.test(source?.id)
  )
    return {};
  const provenance = { provider: source.platform, sourceId: source.id };
  const observed = {};
  if (['single', 'ep', 'album'].includes(release?.type))
    observed.type = { value: release.type, provenance };
  const date = release?.date;
  // A year-only refresh must not replace an already observed month/day. Manual
  // overrides remain independent and continue to win in resolveReleaseInfo.
  if (
    date?.precision === 'year' &&
    /^[1-9][0-9]{3}$/.test(date.value) &&
    !['month', 'day'].includes(previous.observed?.date?.value?.precision)
  )
    observed.date = {
      value: { value: date.value, precision: 'year' },
      provenance,
    };
  return observed;
}

// Only provider-authored page metadata is evidence. Neither track count nor
// playlist kind proves a release type (an OLAK list can be a Single or EP).
function parseYoutubeMusicRelease(html, playlistId) {
  const meta = new Map();
  const parser = sax.parser(false, { lowercase: true });
  parser.onopentag = (node) => {
    if (node.name !== 'meta') return;
    const key = node.attributes.property || node.attributes.name;
    if (key && !meta.has(key)) meta.set(key, node.attributes.content || '');
  };
  parser.onerror = () => parser.resume();
  const head = String(html).split(/<\/head\s*>/iu, 1)[0];
  parser
    .write(`<head>${(head.match(/<meta\b[^>]*>/giu) || []).join('')}</head>`)
    .close();
  if (meta.get('og:type') !== 'music.album') return {};
  const label = meta.get('og:description')?.split(/[•·]/u)[0].trim();
  const type = TYPE_LABELS.get(label);
  const year = albumHeaderYear(
    String(html),
    playlistId,
    meta.get('og:title'),
    type,
  );
  let thumbnailUrl;
  try {
    const url = new URL(meta.get('og:image'));
    if (
      url.protocol === 'https:' &&
      [
        'yt3.googleusercontent.com',
        'lh3.googleusercontent.com',
        'i.ytimg.com',
      ].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
    )
      thumbnailUrl = url.href;
  } catch {
    /* Missing artwork leaves the normal thumbnail fallback intact. */
  }
  return {
    ...(type ? { type } : {}),
    ...(year ? { date: { value: year, precision: 'year' } } : {}),
    ...(meta.get('og:title')
      ? { title: meta.get('og:title').slice(0, 200) }
      : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

function getYoutubeMusicRelease(source) {
  if (
    !['youtube', 'yt-music'].includes(source?.platform) ||
    !ALBUM_ID.test(source?.id)
  )
    return null;
  const entry = cache.get(source.id);
  if (!entry || Date.now() - entry.at > MAX_AGE) return null;
  return entry.value;
}

async function fetchYoutubeMusicRelease(id, options = {}) {
  if (!ALBUM_ID.test(id)) return {};
  const existing = getYoutubeMusicRelease({ platform: 'yt-music', id });
  if (existing && !options.fetch && !options.force) return existing;
  const fetchFn = options.fetch || globalThis.fetch;
  const guard = createProviderRequestGuard(fetchFn);
  try {
    const signal = AbortSignal.timeout(8000);
    const url = new URL('https://music.youtube.com/playlist');
    url.searchParams.set('list', id);
    url.searchParams.set('hl', 'en');
    const response = await guard.fetch(url, {
      redirect: 'error',
      signal,
      headers: {
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || '138.0.0.0'} Safari/537.36`,
        'Accept-Language': 'en',
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return {};
    }
    const result = await readBoundedText(response, 2 * 1024 * 1024, signal);
    if (result.status !== 'ok') return {};
    const value = parseYoutubeMusicRelease(result.text, id);
    cache.delete(id);
    cache.set(id, { at: Date.now(), value });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return value;
  } catch {
    // Optional observation failure must not prevent importing local media.
    return {};
  }
}

async function resolveYoutubeMusicRelease(source) {
  if (
    !['youtube', 'yt-music'].includes(source?.platform) ||
    !ALBUM_ID.test(source?.id)
  )
    return null;
  return getYoutubeMusicRelease(source) || fetchYoutubeMusicRelease(source.id);
}

module.exports = {
  parseYoutubeMusicRelease,
  fetchYoutubeMusicRelease,
  getYoutubeMusicRelease,
  resolveYoutubeMusicRelease,
  youtubeMusicReleaseObservations,
};
