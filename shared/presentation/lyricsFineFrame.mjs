import {
  fineTimingLimits,
  validateLyricsFineTiming,
} from '../lyricsFineTiming.mjs';

const prepared = new WeakMap();
const glyphs = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const nativePrepared = new WeakMap();
const paintPrepared = new WeakMap();
const localPaintPrepared = new WeakMap();

// A local paint adapter, never model evidence. Missing ends stay cue-only.
export function projectNativeLyricsFrame(line, positionMs) {
  if (!line?.segments?.length || !Number.isFinite(positionMs)) return null;
  let value = nativePrepared.get(line);
  if (value === undefined) {
    value = null;
    if (line.segments.map((s) => s.text).join('') === line.text) {
      let cursor = 0;
      const units = [];
      const chunks = line.segments.map((s, i) => {
        const from = cursor;
        cursor += s.text.length;
        if (
          Number.isSafeInteger(s.startMs) &&
          Number.isSafeInteger(s.endMs) &&
          s.startMs >= 0 &&
          s.endMs > s.startMs &&
          (!Number.isFinite(line.startMs) || s.startMs >= line.startMs) &&
          (!Number.isFinite(line.endMs) || s.endMs <= line.endMs)
        )
          units.push({
            unitId: `native-${i}`,
            from,
            to: cursor,
            startMs: s.startMs,
            endMs: s.endMs,
          });
        return { ...s, chunkId: s.segmentId ?? `native-${i}` };
      });
      value = {
        chunks,
        fineTiming: units.length ? { version: 1, units } : null,
      };
    }
    nativePrepared.set(line, value);
  }
  if (!value) return null;
  return {
    lineId: line.lineId,
    text: line.text,
    timingSource: 't2',
    chunks: value.chunks.map((s, i) => ({
      ...s,
      state:
        positionMs < s.startMs
          ? 'upcoming'
          : positionMs >=
              (s.endMs ??
                value.chunks[i + 1]?.startMs ??
                line.endMs ??
                Infinity)
            ? 'past'
            : 'active',
    })),
    ...(value.fineTiming ? { fineTiming: value.fineTiming } : {}),
  };
}

// Immutable document evidence is validated once per revision, outside paint.
export function prepareLyricsFineFrame(line) {
  if (!line || line.segments?.length || !line.estimatedStarts) return null;
  if (prepared.has(line)) return prepared.get(line);
  let value = null;
  try {
    value = validateLyricsFineTiming(line.estimatedFineTiming, line);
  } catch {
    // Fine evidence is optional; coarse onsets remain authoritative cues.
  }
  prepared.set(line, value);
  return value;
}

// Presentation only: never publish these estimates as retained model evidence.
// Actual intervals remain unchanged. Unknown/conflicting bounds stay cue-only.
export function prepareLyricsPaintFrame(line) {
  const evidence = prepareLyricsFineFrame(line);
  if (!evidence) return null;
  if (paintPrepared.has(line)) return paintPrepared.get(line);
  const value = buildPaintTiming(line, evidence);
  paintPrepared.set(line, value);
  return value;
}

// Local display fallback only. Output retains its existing starts-only behavior.
export function prepareLocalLyricsPaintFrame(line) {
  if (!line || typeof line !== 'object') return null;
  if (prepareLyricsFineFrame(line)) return prepareLyricsPaintFrame(line);
  if (localPaintPrepared.has(line)) return localPaintPrepared.get(line);
  let value = null;
  const chunks = line.estimatedStarts?.segments;
  if (
    !line.segments?.length &&
    line.estimatedFineTiming == null &&
    typeof line.text === 'string' &&
    line.text.length <= fineTimingLimits.maxTextLength &&
    Number.isSafeInteger(line.startMs) &&
    line.startMs >= 0 &&
    (line.endMs == null ||
      (Number.isSafeInteger(line.endMs) &&
        line.endMs > line.startMs &&
        line.endMs <= fineTimingLimits.maxTimeMs)) &&
    line.estimatedStarts?.version === 1 &&
    Array.isArray(chunks) &&
    chunks.length > 0 &&
    chunks.length <= fineTimingLimits.maxSegmentsPerLine
  ) {
    const boundaries = new Set([
      0,
      ...Array.from(
        glyphs.segment(line.text),
        (g) => g.index + g.segment.length,
      ),
    ]);
    let cursor = 0;
    let previous = line.startMs;
    const valid = chunks.every((chunk) => {
      if (
        !chunk ||
        typeof chunk.text !== 'string' ||
        !chunk.text.length ||
        !Number.isSafeInteger(chunk.startMs) ||
        chunk.startMs < previous ||
        chunk.startMs > fineTimingLimits.maxTimeMs ||
        (Number.isFinite(line.endMs) && chunk.startMs >= line.endMs)
      )
        return false;
      previous = chunk.startMs;
      cursor += chunk.text.length;
      return boundaries.has(cursor);
    });
    if (valid && chunks.map((chunk) => chunk.text).join('') === line.text) {
      const paint = buildPaintTiming(line, { version: 1, units: [] });
      if (paint.units.length) value = paint;
    }
  }
  localPaintPrepared.set(line, value);
  return value;
}

function textWeight(text) {
  return Array.from(glyphs.segment(text)).filter((g) =>
    /[\p{L}\p{N}\p{S}]/u.test(g.segment),
  ).length;
}

// A conservative display cadence, not singing activity or alignment confidence.
// At least two nearby observations are required; long holds and tiny intervals
// must not become a default duration for uncovered text.
function tailCadence(line, evidence) {
  const usable = (duration, text) => {
    const weight = textWeight(text);
    const speed = duration / weight;
    return weight > 0 && speed >= 80 && speed <= 1000 ? speed : null;
  };
  let values = evidence.units
    .map((u) => usable(u.endMs - u.startMs, line.text.slice(u.from, u.to)))
    .filter(Number.isFinite)
    .slice(-5);
  if (values.length < 2) {
    const chunks = line.estimatedStarts.segments;
    values = chunks
      .slice(0, -1)
      .map((c, i) => usable(chunks[i + 1].startMs - c.startMs, c.text))
      .filter(Number.isFinite)
      .slice(-5);
  }
  if (values.length < 2) return null;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function rangePaintEnd(text, units, from, to) {
  let cursor = from,
    end = null;
  for (const unit of units) {
    if (unit.to <= from) continue;
    if (unit.from >= to) break;
    // Crossing a range cannot create new sub-unit times.
    if (
      unit.from < from ||
      unit.to > to ||
      text.slice(cursor, unit.from).trim()
    )
      return null;
    cursor = unit.to;
    end = unit.endMs;
  }
  return !text.slice(cursor, to).trim() ? end : null;
}

function buildPaintTiming(line, evidence) {
  const chunks = line.estimatedStarts.segments;
  const added = [];
  const quality = new Set();
  const cadence =
    line.endInferred === true ? tailCadence(line, evidence) : null;
  const ids = new Set(evidence.units.map((u) => u.unitId));
  if (chunks.map((s) => s.text).join('') === line.text) {
    let cursor = 0;
    for (const [index, chunk] of chunks.entries()) {
      const from = cursor;
      cursor += chunk.text.length;
      const overlaps = evidence.units.filter(
        (u) => u.from < cursor && u.to > from,
      );
      const end = chunks[index + 1]?.startMs ?? line.endMs;
      let gapFrom = from;
      let gapStart = chunk.startMs;
      for (const next of [...overlaps, { from: cursor, startMs: end }]) {
        // Preserve crossing evidence intact while recovering uncovered edges.
        if (next.from < gapFrom) {
          gapFrom = Math.min(cursor, next.to);
          gapStart = Math.max(chunk.startMs, next.endMs);
          continue;
        }
        const gapTo = Math.min(cursor, next.from);
        const previousFine = evidence.units.findLast((u) => u.to <= gapFrom);
        const nextFine = evidence.units.find((u) => u.from >= next.from);
        let paintEnd = next.startMs;
        const missingTail = gapFrom < gapTo && !line.text.slice(gapTo).trim();
        if (missingTail) quality.add('missing-tail');
        if (missingTail && line.endInferred === true) {
          quality.add('inferred-line-end');
          if (cadence !== null && Number.isFinite(paintEnd)) {
            paintEnd = Math.min(
              paintEnd,
              gapStart +
                Math.ceil(
                  cadence * textWeight(line.text.slice(gapFrom, gapTo)),
                ),
            );
            if (paintEnd < next.startMs) quality.add('tail-capped');
          } else {
            paintEnd = null;
            quality.add('tail-unknown');
          }
        }
        if (
          added.length + evidence.units.length <
            fineTimingLimits.maxSegmentsPerLine &&
          gapFrom < gapTo &&
          line.text.slice(gapFrom, gapTo).trim() &&
          Number.isFinite(gapStart) &&
          Number.isFinite(paintEnd) &&
          Number.isFinite(chunk.startMs) &&
          gapStart >= chunk.startMs &&
          paintEnd > gapStart &&
          (!previousFine || previousFine.endMs <= gapStart) &&
          (!nextFine || nextFine.startMs >= paintEnd) &&
          (!Number.isFinite(end) || paintEnd <= end)
        ) {
          let unitId = `paint-gap-${gapFrom}-${gapTo}`;
          while (ids.has(unitId)) unitId += '-';
          ids.add(unitId);
          added.push({
            unitId,
            from: gapFrom,
            to: gapTo,
            startMs: gapStart,
            endMs: paintEnd,
            timingSource: 'display-estimate',
          });
        }
        gapFrom = Math.min(cursor, next.to);
        gapStart = next.endMs;
      }
    }
  }
  const units = [...evidence.units, ...added].sort((a, b) => a.from - b.from);
  for (const [i, unit] of evidence.units.entries()) {
    const duration = unit.endMs - unit.startMs;
    if (duration < 50) quality.add('short-unit');
    if (
      duration / Math.max(1, textWeight(line.text.slice(unit.from, unit.to))) >
      3000
    )
      quality.add('long-unit');
    if (i > 0 && unit.startMs - evidence.units[i - 1].endMs > 2000)
      quality.add('timing-gap');
  }
  let cursor = 0;
  const cueEnds = chunks.map((chunk) => {
    const from = cursor;
    cursor += chunk.text.length;
    return rangePaintEnd(line.text, units, from, cursor);
  });
  return {
    version: 1,
    units,
    cueEnds,
    paintEndMs: rangePaintEnd(line.text, units, 0, line.text.length),
    holdUntilMs: Number.isFinite(line.endMs) ? line.endMs : null,
    quality: [...quality],
  };
}

export function projectLyricsPaintLifecycle(
  line,
  positionMs,
  { local = false } = {},
) {
  if (!Number.isFinite(positionMs)) return null;
  const plan = local
    ? prepareLocalLyricsPaintFrame(line)
    : prepareLyricsPaintFrame(line);
  if (!plan) return null;
  const phase =
    positionMs < line.startMs
      ? 'upcoming'
      : Number.isFinite(plan.holdUntilMs) && positionMs >= plan.holdUntilMs
        ? 'past'
        : plan.paintEndMs === null
          ? 'unknown'
          : positionMs >= plan.paintEndMs
            ? 'holding'
            : 'painting';
  return {
    phase,
    paintEndMs: plan.paintEndMs,
    holdUntilMs: plan.holdUntilMs,
    quality: plan.quality,
  };
}

export function projectLyricsFineFrame(
  line,
  positionMs,
  { rate = 1, playing = false } = {},
) {
  const evidence = prepareLyricsPaintFrame(line);
  if (!evidence || !Number.isFinite(positionMs)) return null;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return {
    lifecycle: projectLyricsPaintLifecycle(line, positionMs),
    positionMs,
    rate: safeRate,
    playing,
    units: evidence.units.map((unit) => ({
      ...unit,
      text: line.text.slice(unit.from, unit.to),
      progress: Math.min(
        1,
        Math.max(0, (positionMs - unit.startMs) / (unit.endMs - unit.startMs)),
      ),
      delayMs: playing
        ? Math.max(0, (unit.startMs - positionMs) / safeRate)
        : 0,
      remainingMs:
        playing && positionMs < unit.endMs
          ? (unit.endMs - Math.max(positionMs, unit.startMs)) / safeRate
          : null,
    })),
  };
}

// A ruby/page/coarse boundary must never invent sub-unit timing.
export function fineTextParts(text, units, from = 0, to = text.length) {
  const parts = [];
  let cursor = from;
  for (const unit of units ?? []) {
    if (unit.from < cursor || unit.to > to) continue;
    if (cursor < unit.from)
      parts.push({
        from: cursor,
        to: unit.from,
        text: text.slice(cursor, unit.from),
      });
    const cells = Array.from(glyphs.segment(text.slice(unit.from, unit.to)));
    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index];
      // Display-only clipping windows inside the original unit's progress.
      // Keep its actual times intact; these are never stored as glyph evidence.
      parts.push({
        ...unit,
        from: unit.from + cell.index,
        to: unit.from + cell.index + cell.segment.length,
        text: cell.segment,
        paintFrom: index / cells.length,
        paintTo: (index + 1) / cells.length,
      });
    }
    cursor = unit.to;
  }
  if (cursor < to)
    parts.push({ from: cursor, to, text: text.slice(cursor, to) });
  return parts;
}

// Verify each source partition through the actual converter and reconstruct
// the whole displayed line. Equal character counts alone are not alignment.
export function mapLyricsFineText(source, target, fineTiming, convert) {
  if (!fineTiming) return null;
  if (source === target) return fineTiming;
  if (typeof convert !== 'function') return null;
  const cuts = [
    ...new Set([
      0,
      source.length,
      ...fineTiming.units.flatMap((unit) => [unit.from, unit.to]),
    ]),
  ].sort((a, b) => a - b);
  const offsets = new Map([[0, 0]]);
  let converted = '';
  try {
    for (let i = 1; i < cuts.length; i++) {
      converted += convert(source.slice(cuts[i - 1], cuts[i]));
      offsets.set(cuts[i], converted.length);
    }
  } catch {
    return null;
  }
  if (converted !== target) return null;
  if (fineTiming.units.some((u) => !offsets.has(u.from) || !offsets.has(u.to)))
    return null;
  const mapped = {
    version: 1,
    units: fineTiming.units.map((u) => ({
      ...u,
      from: offsets.get(u.from),
      to: offsets.get(u.to),
    })),
  };
  try {
    return validateLyricsFineTiming(mapped, {
      text: target,
      startMs: 0,
      endMs: Math.max(...mapped.units.map((unit) => unit.endMs)),
    });
  } catch {
    return null;
  }
}
