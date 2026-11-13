const MIN_LINE_CHARS = 4;
const LINE_SIMILARITY = 0.8;
const BLOCK_SIZES = [4, 3, 2];
const MIN_COVERAGE_RATIO = 0.5;
const EARLIEST_START_RATIO = 0.15;
const LATEST_START_RATIO = 0.75;
const MAX_OVERLAY_LINES = 512;
const MAX_OVERLAY_LINE_CHARS = 128;
const MIN_OVERLAY_LINES_PER_CHORUS = 3;
const MIN_OVERLAY_CHORUS_MS = 10000;
const MAX_LINE_GAP_MS = 8000;
const MAX_INFERRED_END_MS = 6000;
const EMPTY_RANGES = Object.freeze([]);
const overlayRangeCache = new WeakMap();

function normalizeLine(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[\p{P}\p{S}\s]/gu, '')
    .toLocaleLowerCase();
}

function bigrams(key) {
  const counts = new Map();
  for (let index = 0; index < key.length - 1; index += 1) {
    const pair = key.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

// Dice similarity absorbs small rewordings between repeats.
function similarity(left, right) {
  if (left.key === right.key) return 1;
  let shared = 0;
  for (const [pair, count] of left.bigrams) {
    shared += Math.min(count, right.bigrams.get(pair) ?? 0);
  }
  return (2 * shared) / (left.key.length - 1 + right.key.length - 1);
}

function timedLines(lines, durationSeconds) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  let previous = -Infinity;
  for (const line of lines) {
    if (!Number.isFinite(line?.start) || line.start < previous) return null;
    previous = line.start;
  }
  const span = lines.at(-1).start - lines[0].start;
  if (span < durationSeconds * MIN_COVERAGE_RATIO) return null;

  return lines
    .map((line) => ({ start: line.start, key: normalizeLine(line.text) }))
    .filter((line) => line.key.length >= MIN_LINE_CHARS)
    .map((line) => ({ ...line, bigrams: bigrams(line.key) }));
}

function bestRepeatedBlock(
  lines,
  { sizes = BLOCK_SIZES, validBlock = () => true, projectBlock } = {},
) {
  const memo = new Map();
  const similar = (left, right) => {
    const id = left * lines.length + right;
    if (!memo.has(id)) {
      memo.set(id, similarity(lines[left], lines[right]) >= LINE_SIMILARITY);
    }
    return memo.get(id);
  };
  const blockMatches = (left, right, size) => {
    for (let offset = 0; offset < size; offset += 1) {
      if (!similar(left + offset, right + offset)) return false;
    }
    return true;
  };

  let best = null;
  for (const size of sizes) {
    for (let first = 0; first + size <= lines.length; first += 1) {
      if (!validBlock(first, size)) continue;
      const starts = [first];
      for (let next = first + size; next + size <= lines.length; next += 1) {
        if (
          next >= starts.at(-1) + size &&
          validBlock(next, size) &&
          blockMatches(first, next, size)
        ) {
          starts.push(next);
        }
      }
      if (starts.length < 2) continue;
      const block = { score: starts.length * size, starts, size };
      const candidate = projectBlock ? projectBlock(block, similar) : block;
      if (candidate && (!best || candidate.score > best.score))
        best = candidate;
    }
  }
  return best;
}

export function findLyricChorusStart(lines, durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const candidates = timedLines(lines, durationSeconds);
  if (!candidates) return null;

  const block = bestRepeatedBlock(candidates);
  if (!block) return null;

  // An opening hook before the first verse is skipped for a later repeat.
  const earliest = durationSeconds * EARLIEST_START_RATIO;
  const latest = durationSeconds * LATEST_START_RATIO;
  const start = block.starts
    .map((index) => candidates[index].start)
    .find((seconds) => seconds >= earliest);
  return start !== undefined && start <= latest ? start : null;
}

function overlayTimedLines(lines, durationMs) {
  if (lines.length < 4 || lines.length > MAX_OVERLAY_LINES) return null;
  const candidates = [];
  let previousStart = -Infinity;
  for (const [index, line] of lines.entries()) {
    const start = line?.startMs;
    const key = normalizeLine(line?.text);
    if (!Number.isFinite(start)) {
      if (key) return null;
      continue;
    }
    if (start < previousStart) return null;
    previousStart = start;
    if (key.length < MIN_LINE_CHARS || key.length > MAX_OVERLAY_LINE_CHARS)
      continue;
    candidates.push({ start, key, bigrams: bigrams(key), index });
  }
  if (
    candidates.length < 4 ||
    candidates.at(-1).start - candidates[0].start <
      durationMs * MIN_COVERAGE_RATIO
  )
    return null;
  return candidates;
}

function estimateChorusRanges(lines, durationMs) {
  const candidates = overlayTimedLines(lines, durationMs);
  if (!candidates) return EMPTY_RANGES;
  const validBlock = (first, size) => {
    for (let index = first + 1; index < first + size; index++) {
      const { start, index: lineIndex } = candidates[index];
      const previous = candidates[index - 1];
      if (
        lineIndex - previous.index > 2 ||
        start <= previous.start ||
        start - previous.start > MAX_LINE_GAP_MS
      )
        return false;
    }
    return true;
  };
  const block = bestRepeatedBlock(candidates, {
    sizes: BLOCK_SIZES.filter((size) => size >= MIN_OVERLAY_LINES_PER_CHORUS),
    validBlock,
    projectBlock: ({ starts, size }, similar) =>
      expandOverlayBlock(lines, candidates, starts, size, validBlock, similar),
  });
  return block?.ranges ?? EMPTY_RANGES;
}

function expandOverlayBlock(
  lines,
  candidates,
  starts,
  size,
  validBlock,
  similar,
) {
  let length = size;
  while (
    starts.every(
      (start, index) =>
        start + length < (starts[index + 1] ?? candidates.length) &&
        validBlock(start + length - 1, 2) &&
        similar(starts[0] + length, start + length),
    )
  )
    length++;

  const ranges = [];
  for (const [index, first] of starts.entries()) {
    const startMs = candidates[first].start;
    const last = candidates[first + length - 1];
    const line = lines[last.index];
    const nextStart = lines[last.index + 1]?.startMs;
    const end =
      Number.isFinite(line.endMs) && line.endInferred !== true
        ? line.endMs
        : Math.min(
            Number.isFinite(nextStart) ? nextStart : Infinity,
            last.start + MAX_INFERRED_END_MS,
          );
    const endMs = Math.min(
      end,
      candidates[starts[index + 1]]?.start ?? Infinity,
    );
    if (endMs - startMs >= MIN_OVERLAY_CHORUS_MS)
      ranges.push({ startMs, endMs });
  }
  if (ranges.length < 2) return null;
  return { ranges, score: ranges.length * length };
}

export function lyricChorusRanges(lines, durationMs) {
  if (!Array.isArray(lines) || !Number.isFinite(durationMs) || durationMs <= 0)
    return EMPTY_RANGES;
  const cached = overlayRangeCache.get(lines);
  if (cached?.durationMs === durationMs) return cached.ranges;
  const ranges = estimateChorusRanges(lines, durationMs);
  overlayRangeCache.set(lines, { durationMs, ranges });
  return ranges;
}
