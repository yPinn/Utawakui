import { lyricsDisplayBreakCandidates } from './lyricsPresentation.mjs';
import { isSafeLyricsBreak } from './lyricsTextProcessing.mjs';

const MAX_TEXT = 2000;
const MIN_DWELL_MS = 1200;
const glyphs =
  typeof Intl?.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

function timingMap(line) {
  const native = Array.isArray(line.segments) && line.segments.length > 0;
  const source = native
    ? 't2'
    : line.estimatedStarts?.version === 1
      ? 'model-starts'
      : 'line-estimate';
  const segments = native ? line.segments : line.estimatedStarts?.segments;
  const starts = new Map();
  let cursor = 0,
    previous = -Infinity;
  if (!Array.isArray(segments) || segments.length > 1000)
    return { source, starts };
  for (const [index, segment] of segments.entries()) {
    const endMs = segment?.endMs ?? segments[index + 1]?.startMs ?? line.endMs;
    if (
      !segment ||
      typeof segment.text !== 'string' ||
      !segment.text.length ||
      !Number.isSafeInteger(segment.startMs) ||
      segment.startMs < line.startMs ||
      segment.startMs >= line.endMs ||
      segment.startMs < previous ||
      line.text.slice(cursor, cursor + segment.text.length) !== segment.text ||
      (native &&
        (!Number.isSafeInteger(endMs) ||
          endMs < segment.startMs ||
          endMs > line.endMs ||
          segment.startMs < previous))
    ) {
      return { source, starts: new Map() };
    }
    starts.set(cursor, segment.startMs);
    cursor += segment.text.length;
    previous = native ? endMs : segment.startMs;
  }
  return { source, starts: cursor === line.text.length ? starts : new Map() };
}

function partition(
  text,
  fits,
  starts,
  minimumMs,
  preferNatural = true,
  endMs = Infinity,
  maximumPages = Infinity,
) {
  const boundaries = [...glyphs.segment(text)]
    .map((p) => p.index)
    .concat(text.length);
  const candidates = lyricsDisplayBreakCandidates(text);
  const pages = [];
  let index = 0;
  while (index < boundaries.length - 1) {
    const from = boundaries[index];
    let low = index + 1,
      high = boundaries.length - 1,
      best = index;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (
        fits(text.slice(from, boundaries[middle]), {
          sourceStart: from,
          sourceEnd: boundaries[middle],
        })
      ) {
        best = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    if (best === index) return null;
    while (best > index && !isSafeLyricsBreak(text, boundaries[best])) best--;
    if (best === index) return null;
    let end = boundaries[best];
    if (preferNatural && end !== text.length) {
      const possible = candidates.filter(
        (c) =>
          c.offset > from && c.offset <= end && boundaries.includes(c.offset),
      );
      const mapped = possible.filter(
        (c) =>
          starts.has(from) &&
          starts.has(c.offset) &&
          starts.get(c.offset) - starts.get(from) >= minimumMs &&
          endMs - starts.get(c.offset) >= minimumMs,
      );
      const choices = mapped.length
        ? mapped
        : possible.filter((c) => c.offset - from >= (end - from) * 0.45);
      const candidate = choices.sort(
        (a, b) => b.priority - a.priority || b.offset - a.offset,
      )[0];
      if (candidate) end = candidate.offset;
    }
    pages.push({
      text: text.slice(from, end),
      sourceStart: from,
      sourceEnd: end,
      startMs: null,
      endMs: null,
    });
    if (pages.length > maximumPages) return pages;
    index = boundaries.indexOf(end);
  }
  return pages;
}

// fits is supplied by the surface's actual font/content-box measurement. No DOM
// or playback authority lives here. All pages preserve the input text exactly.
export function planLyricsDisplay(line, options = {}) {
  const text = line?.text;
  const unsupported = { status: 'unsupported', reason: 'input', pages: [] };
  if (
    !glyphs ||
    typeof text !== 'string' ||
    text.length > MAX_TEXT ||
    typeof options.fits !== 'function'
  )
    return unsupported;
  const rate =
    Number.isFinite(options.rate) && options.rate > 0 ? options.rate : 1;
  const minimumMs = MIN_DWELL_MS * rate;
  const start = line.startMs,
    end = options.endMs ?? line.endMs;
  const timing = timingMap({ ...line, endMs: end });
  // A complete-page capacity proof needs no break candidates or prefix search.
  // Keep the same page shape and run all timing decisions below unchanged.
  let pages = text.length
    ? options.fits(text, { sourceStart: 0, sourceEnd: text.length })
      ? [
          {
            text,
            sourceStart: 0,
            sourceEnd: text.length,
            startMs: null,
            endMs: null,
          },
        ]
      : partition(text, options.fits, timing.starts, minimumMs, true, end)
    : [];
  if (!pages)
    return {
      status: 'unfit',
      reason: 'viewport-capacity',
      sourceTiming: timing.source,
      pageTiming: null,
      pages: [],
    };
  if (
    pages &&
    pages.length > 1 &&
    Number.isFinite(end) &&
    Number.isFinite(start) &&
    end - start < pages.length * minimumMs
  )
    pages = partition(text, options.fits, timing.starts, minimumMs, false);
  const base = { sourceTiming: timing.source, pages, pageTiming: null };
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return { ...base, status: 'untimed' };
  if (pages.length === 0) return { ...base, status: 'ready' };
  const exact = pages.map((p) => timing.starts.get(p.sourceStart));
  const exactUsable = exact.every(
    (at, i) => Number.isFinite(at) && (exact[i + 1] ?? end) - at >= minimumMs,
  );
  if (exactUsable) {
    return {
      ...base,
      status: 'ready',
      pageTiming: timing.source,
      pages: pages.map((p, i) => ({
        ...p,
        startMs: exact[i],
        endMs: exact[i + 1] ?? end,
      })),
    };
  }
  if (pages.length > 1 && end - start < pages.length * minimumMs)
    return { ...base, status: 'unfit', reason: 'duration-capacity' };
  const reserve = pages.length > 1 ? minimumMs : 0;
  const remaining = end - start - reserve * pages.length;
  let cursor = start;
  return {
    ...base,
    status: 'ready',
    pageTiming: 'layout-estimate',
    pages: pages.map((p, i) => {
      const startMs = cursor;
      cursor =
        i === pages.length - 1
          ? end
          : cursor + reserve + (remaining * p.text.length) / text.length;
      return { ...p, startMs, endMs: cursor };
    }),
  };
}

export function splitLyricsDisplayRows(text, fitsLine, maximumRows = Infinity) {
  if (!glyphs || typeof text !== 'string' || text.length > MAX_TEXT)
    return null;
  return partition(text, fitsLine, new Map(), 0, true, Infinity, maximumRows);
}

export function selectLyricsDisplayPage(plan, positionMs) {
  const pages = plan?.pages ?? [];
  const index = Math.max(
    0,
    pages.findLastIndex(
      (p) => Number.isFinite(p.startMs) && positionMs >= p.startMs,
    ),
  );
  return { index, page: pages[index] ?? null };
}

export function nextLyricsDisplayBoundaryMs(plan, positionMs, rate = 1) {
  if (
    plan?.status !== 'ready' ||
    !Number.isFinite(positionMs) ||
    !Number.isFinite(rate) ||
    rate <= 0
  )
    return null;
  const next = plan.pages.find(
    (p) => Number.isFinite(p.startMs) && p.startMs > positionMs,
  );
  return next ? (next.startMs - positionMs) / rate : null;
}

export function sliceLyricsReading(reading, from, to) {
  if (!reading || typeof reading.text !== 'string') return null;
  if (from === 0 && to === reading.text.length) return reading;
  let cursor = 0;
  const segments = (reading.segments ?? []).flatMap((segment) => {
    const value = segment.text ?? segment.t ?? '';
    const start = cursor;
    cursor += value.length;
    const left = Math.max(from, start),
      right = Math.min(to, cursor);
    if (right <= left) return [];
    const key = 'text' in segment ? 'text' : 't';
    return [
      {
        ...segment,
        [key]: value.slice(left - start, right - start),
        ...(left !== start || right !== cursor
          ? { reading: '', ...('r' in segment ? { r: '' } : {}) }
          : {}),
      },
    ];
  });
  return {
    text: reading.text.slice(from, to),
    segments,
    ...(reading.romaji ? { romaji: reading.romaji, romajiScope: 'line' } : {}),
  };
}
