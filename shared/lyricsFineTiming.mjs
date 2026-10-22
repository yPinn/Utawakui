// Version-one fine evidence has fixed bounds. Keep Browser Source modules free
// of JSON-import syntax requirements; the Node contract test checks these caps
// against the canonical document limits.
export const fineTimingLimits = Object.freeze({
  maxTextLength: 2000,
  maxIdLength: 128,
  maxTimeMs: 604800000,
  maxSegmentsPerLine: 1000,
});
const values = fineTimingLimits;

const ids = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const glyphs = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const fail = () => {
  throw new Error('Invalid lyrics fine timing');
};
function record(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    fail();
}

// Partial evidence is allowed. Neither missing text nor missing time is inferred.
export function validateLyricsFineTiming(value, line) {
  record(value, ['version', 'units']);
  if (
    value.version !== 1 ||
    typeof line?.text !== 'string' ||
    line.text.length > values.maxTextLength ||
    !Number.isSafeInteger(line.startMs) ||
    !Number.isSafeInteger(line.endMs) ||
    line.startMs < 0 ||
    line.endMs > values.maxTimeMs ||
    line.endMs <= line.startMs ||
    !Array.isArray(value.units) ||
    !value.units.length ||
    value.units.length > values.maxSegmentsPerLine
  )
    fail();
  const safe = new Set([
    0,
    ...Array.from(glyphs.segment(line.text), (p) => p.index + p.segment.length),
  ]);
  const used = new Set();
  let previousTo = 0,
    previousEnd = line.startMs;
  const units = value.units.map((raw) => {
    record(raw, ['unitId', 'from', 'to', 'startMs', 'endMs']);
    const { unitId, from, to, startMs, endMs } = raw;
    if (
      typeof unitId !== 'string' ||
      unitId.length > values.maxIdLength ||
      !ids.test(unitId) ||
      used.has(unitId) ||
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      !safe.has(from) ||
      !safe.has(to) ||
      from < previousTo ||
      to <= from ||
      !Number.isSafeInteger(startMs) ||
      !Number.isSafeInteger(endMs) ||
      startMs < previousEnd ||
      endMs <= startMs ||
      endMs > line.endMs
    )
      fail();
    used.add(unitId);
    previousTo = to;
    previousEnd = endMs;
    return { unitId, from, to, startMs, endMs };
  });
  return { version: 1, units };
}
