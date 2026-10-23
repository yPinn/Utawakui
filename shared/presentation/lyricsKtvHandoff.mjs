import { prepareLyricsPaintFrame } from './lyricsFineFrame.mjs';

// Presentation handoff is separate from retained model/coarse timing. Only
// complete cells that the range/coarse renderer can consume protect visibility.
export function ktvHandoffEndMs(line, unit, canonicalEndMs, nextUnitStartMs) {
  const original = unit.endMs;
  if (
    unit.timingSource !== 'model-starts' ||
    line?.segments?.length ||
    line?.text.slice(unit.sourceStart, unit.sourceEnd) !== unit.text ||
    !unit.segments?.length
  )
    return original;
  const plan = prepareLyricsPaintFrame(line);
  if (!plan) return original;
  let cursor = unit.sourceStart;
  let end = original;
  const ranges = unit.segments.map((segment) => {
    const from = cursor;
    cursor += segment.text.length;
    end = Math.max(end, segment.startMs);
    return { from, to: cursor };
  });
  if (
    cursor !== unit.sourceEnd ||
    unit.segments.map((segment) => segment.text).join('') !== unit.text
  )
    return original;
  let low = 0,
    high = plan.units.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (plan.units[mid].from < unit.sourceStart) low = mid + 1;
    else high = mid;
  }
  let coarse = 0;
  for (let i = low; i < plan.units.length; i++) {
    const fine = plan.units[i];
    if (fine.from >= unit.sourceEnd) break;
    while (coarse < ranges.length && ranges[coarse].to <= fine.from) coarse++;
    const range = ranges[coarse];
    if (range && fine.from >= range.from && fine.to <= range.to)
      end = Math.max(end, fine.endMs);
  }
  if (
    plan.quality.includes('tail-too-fast') &&
    Number.isFinite(canonicalEndMs)
  ) {
    const from = plan.units.at(-1)?.to ?? 0;
    const suffix = line.text.slice(from);
    const visibleFrom = from + suffix.length - suffix.trimStart().length;
    const visibleTo = line.text.trimEnd().length;
    if (
      visibleFrom < visibleTo &&
      ranges.some((range) => range.from <= visibleFrom && range.to >= visibleTo)
    ) {
      // Rejected sweep timing stays unknown, but its static text/coarse cue
      // must remain visible until the existing canonical source handoff.
      end = Math.max(end, canonicalEndMs);
    }
  }
  // Conflicting ranges cannot be fixed by cutting evidence or postponing a
  // source/phrase onset. Keep the existing policy for that unsupported case.
  const bound = Math.min(
    Number.isFinite(canonicalEndMs) ? canonicalEndMs : Infinity,
    Number.isFinite(nextUnitStartMs) ? nextUnitStartMs : Infinity,
  );
  return end <= bound ? end : original;
}
