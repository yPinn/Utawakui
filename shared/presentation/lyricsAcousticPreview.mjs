import { validateAcousticEstimateLines } from '../lyricsAcousticEstimate.mjs';
import { presentationLineSegments } from './state.mjs';

export function summarizeAcousticPreview(prepared) {
  const ready =
    prepared?.status === 'ready'
      ? prepared.lines.filter((line) => line.status === 'ready')
      : [];
  return {
    readyLines: ready.length,
    fineLines: ready.filter((line) => line.fineTiming?.units?.length).length,
  };
}

// Validate immutable estimate content once per source/offset revision, never per tick.
export function prepareAcousticPreview(document, estimate, offsetMs = 0) {
  if (estimate?.status !== 'ready')
    return { status: estimate?.status ?? 'missing' };
  const preview = estimate.preview;
  if (
    !document ||
    !preview ||
    preview.documentId !== document.documentId ||
    preview.sourceFilename !== document.source?.filename ||
    preview.sourceFingerprint !== document.source?.sha256 ||
    preview.normalizerProfileId !== document.normalizerProfileId ||
    preview.offsetUsedMs !== offsetMs
  )
    return { status: 'stale' };
  let lines;
  try {
    lines = validateAcousticEstimateLines(preview.lines);
  } catch {
    return { status: 'corrupt' };
  }
  if (
    lines.length !== document.lines.length ||
    lines.some((line, index) => {
      const canonical = document.lines[index];
      return (
        line.lineId !== canonical?.lineId ||
        line.text !== canonical.text ||
        line.startMs !== canonical.startMs ||
        line.endMs !== canonical.endMs
      );
    })
  )
    return { status: 'stale' };
  return {
    status: 'ready',
    documentId: document.documentId,
    estimateId: preview.estimateId,
    methodKind: preview.methodKind,
    offsetUsedMs: offsetMs,
    lines,
  };
}

export function selectAcousticPreviewFrame(
  document,
  prepared,
  { enabled = false, positionMs = null, offsetMs = 0, durationMs = null } = {},
) {
  const lines = document?.lines ?? [];
  if (!lines.length) return null;
  const at = Number.isFinite(positionMs)
    ? positionMs
    : Number.NEGATIVE_INFINITY;
  let index = lines.findLastIndex(
    (line) => Number.isFinite(line.startMs) && line.startMs <= at,
  );
  if (index < 0)
    index = Math.max(
      0,
      lines.findIndex((line) => Number.isFinite(line.startMs)),
    );
  const line = lines[index];
  const nextStart = lines
    .slice(index + 1)
    .find((candidate) => Number.isFinite(candidate.startMs))?.startMs;
  const end =
    line.endMs ??
    nextStart ??
    (Number.isFinite(durationMs) ? durationMs + offsetMs : null);
  const fallback = presentationLineSegments(
    {
      lyrics: { synced: document.granularity !== 'T0', offsetMs },
      playback: { durationMs },
    },
    lines,
    index,
  );
  const acoustic =
    enabled &&
    prepared?.status === 'ready' &&
    prepared.documentId === document.documentId &&
    prepared.offsetUsedMs === offsetMs &&
    prepared.lines[index]?.status === 'ready'
      ? prepared.lines[index]
      : null;
  const startsOnly = fallback?.timingSource !== 't2' && acoustic;
  const segments = startsOnly
    ? acoustic.chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        text: line.text.slice(chunk.from, chunk.to),
        startMs: chunk.startMs,
      }))
    : (fallback?.segments ?? [{ text: line.text, startMs: line.startMs }]);
  const chunks = segments.map((segment, chunkIndex) => {
    const displayEnd =
      segment.endMs ?? segments[chunkIndex + 1]?.startMs ?? end;
    const state =
      !Number.isFinite(segment.startMs) || at < segment.startMs
        ? 'upcoming'
        : Number.isFinite(displayEnd) && at >= displayEnd
          ? 'past'
          : 'active';
    const chunk = {
      chunkId: segment.chunkId ?? segment.segmentId ?? line.lineId,
      text: segment.text,
      startMs: segment.startMs,
      state,
    };
    if (!startsOnly)
      chunk.progress =
        !Number.isFinite(displayEnd) ||
        displayEnd <= segment.startMs ||
        !Number.isFinite(positionMs)
          ? null
          : Math.min(
              1,
              Math.max(
                0,
                (positionMs - segment.startMs) / (displayEnd - segment.startMs),
              ),
            );
    return chunk;
  });
  if (
    !startsOnly &&
    fallback?.timingSource === 'line-estimate' &&
    chunks.length
  ) {
    // Preserve the canonical text in the preview while keeping the product's
    // existing trimmed-text weight allocation and all of its timestamps.
    const leading = line.text.slice(
      0,
      line.text.length - line.text.trimStart().length,
    );
    const trailing = line.text.slice(line.text.trimEnd().length);
    chunks[0].text = leading + chunks[0].text;
    chunks.at(-1).text += trailing;
  }
  return {
    lineId: line.lineId,
    text: line.text,
    timingSource: startsOnly
      ? 'acoustic-estimate'
      : (fallback?.timingSource ?? 'plain'),
    mode: startsOnly ? 'starts' : fallback ? 'progress' : 'plain',
    chunks,
  };
}
