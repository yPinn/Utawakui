import { prepareLyricsFineFrame } from '../../shared/presentation/lyricsFineFrame.mjs';

const prepared = new WeakMap();
const byChunk = new WeakMap();
const empty = Object.freeze([]);

// Local cue pauses require adjacent, retained evidence in the same source chunk.
// Uncovered text and display-estimated ends are never evidence of silence.
export function prepareLocalLyricsCuePauses(line) {
  if (!line || typeof line !== 'object') return empty;
  if (prepared.has(line)) return prepared.get(line);
  const fine = prepareLyricsFineFrame(line);
  const segments = line.estimatedStarts?.segments;
  const pauses = [];
  if (fine && segments?.map((chunk) => chunk.text).join('') === line.text) {
    let cursor = 0;
    let unitIndex = 1;
    for (const [chunkIndex, chunk] of segments.entries()) {
      const from = cursor;
      cursor += chunk.text.length;
      const endMs = segments[chunkIndex + 1]?.startMs ?? line.endMs;
      while (
        unitIndex < fine.units.length &&
        fine.units[unitIndex].from < cursor
      ) {
        const left = fine.units[unitIndex - 1];
        const right = fine.units[unitIndex++];
        if (
          left.from >= from &&
          right.to <= cursor &&
          left.to === right.from &&
          Number.isFinite(chunk.startMs) &&
          Number.isFinite(endMs) &&
          left.endMs > chunk.startMs &&
          right.startMs <= endMs &&
          left.endMs < right.startMs
        )
          pauses.push(
            Object.freeze({
              chunkIndex,
              startMs: left.endMs,
              endMs: right.startMs,
            }),
          );
      }
    }
  }
  const value = pauses.length ? Object.freeze(pauses) : empty;
  const buckets = new Map();
  for (const pause of value) {
    if (!buckets.has(pause.chunkIndex)) buckets.set(pause.chunkIndex, []);
    buckets.get(pause.chunkIndex).push(pause);
  }
  byChunk.set(line, buckets);
  prepared.set(line, value);
  return value;
}

export function localLyricsCuePaused(line, chunkIndex, positionMs) {
  if (!Number.isFinite(positionMs) || !line) return false;
  prepareLocalLyricsCuePauses(line);
  return (
    byChunk
      .get(line)
      ?.get(chunkIndex)
      ?.some(
        (pause) =>
          pause.chunkIndex === chunkIndex &&
          positionMs >= pause.startMs &&
          positionMs < pause.endMs,
      ) ?? false
  );
}
