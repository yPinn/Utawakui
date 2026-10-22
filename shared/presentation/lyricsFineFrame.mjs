import { validateLyricsFineTiming } from '../lyricsFineTiming.mjs';

const prepared = new WeakMap();
const glyphs = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

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

export function projectLyricsFineFrame(
  line,
  positionMs,
  { rate = 1, playing = false } = {},
) {
  const evidence = prepareLyricsFineFrame(line);
  if (!evidence || !Number.isFinite(positionMs)) return null;
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return {
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
