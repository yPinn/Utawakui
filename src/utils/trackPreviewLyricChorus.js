// Estimates a chorus start from line-timed lyrics: the chorus is usually the
// most repeated multi-line block. Lyrics are optional evidence, so any doubt
// returns null and the caller falls back.
const MIN_LINE_CHARS = 4;
const LINE_SIMILARITY = 0.8;
const BLOCK_SIZES = [4, 3, 2];
const MIN_COVERAGE_RATIO = 0.5;
const EARLIEST_START_RATIO = 0.15;
const LATEST_START_RATIO = 0.75;

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

function bestRepeatedBlock(lines) {
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
  for (const size of BLOCK_SIZES) {
    for (let first = 0; first + size <= lines.length; first += 1) {
      const starts = [first];
      for (let next = first + size; next + size <= lines.length; next += 1) {
        if (next >= starts.at(-1) + size && blockMatches(first, next, size)) {
          starts.push(next);
        }
      }
      if (starts.length < 2) continue;
      const score = starts.length * size;
      if (!best || score > best.score) best = { score, starts };
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
