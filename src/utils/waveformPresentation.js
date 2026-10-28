export function waveformRange(durationMs, startMs, spanMs) {
  const span = Math.min(spanMs, Math.max(0, durationMs));
  const fromMs = Math.round(Math.max(0, Math.min(startMs, durationMs - span)));
  return { fromMs, toMs: Math.min(durationMs, fromMs + span) };
}
export function waveformGaps(summaries, { fromMs, toMs }) {
  if (toMs <= fromMs) return [];
  const intervals = summaries
    .filter((value) => value?.peaks && value.sampleRate > 0)
    .map((value) => [
      Math.max(fromMs, (value.peaks.startFrame / value.sampleRate) * 1000),
      Math.min(
        toMs,
        (Math.min(value.frames, value.peaks.endFrame) / value.sampleRate) *
          1000,
      ),
    ])
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = fromMs;
  const gap = (from, to) => ({
    x: ((from - fromMs) / (toMs - fromMs)) * 640,
    width: ((to - from) / (toMs - fromMs)) * 640,
  });
  for (const [from, to] of intervals) {
    if (from > cursor + 1e-6) gaps.push(gap(cursor, from));
    cursor = Math.max(cursor, to);
  }
  if (toMs > cursor + 1e-6) gaps.push(gap(cursor, toMs));
  return gaps;
}

export function waveformPath(summary, viewport = null, layer = 'peaks') {
  const summaries = (Array.isArray(summary) ? summary : [summary]).filter(
    Boolean,
  );
  if (!summaries.length) return '';
  const first = summaries[0],
    rate = first.sampleRate ?? 1;
  const targets = summaries.map((value) => ({
    ...value.peaks,
    startFrame: value.peaks.startFrame ?? 0,
    endFrame: Math.min(
      value.frames ?? Infinity,
      value.peaks.endFrame ?? value.peaks.min.length,
    ),
    strideFrames: value.peaks.strideFrames ?? 1,
  }));
  const fromFrame = viewport
      ? (viewport.fromMs * rate) / 1000
      : targets[0].startFrame,
    toFrame = viewport ? (viewport.toMs * rate) / 1000 : targets[0].endFrame;
  const frames = Math.max(0, toFrame - fromFrame);
  if (!frames) return '';
  const columns = Math.min(
      640,
      Math.ceil(frames / Math.min(...targets.map((t) => t.strideFrames))),
    ),
    path = [];
  for (let x = 0; x < columns; x++) {
    const left = fromFrame + (x * frames) / columns,
      right = fromFrame + ((x + 1) * frames) / columns;
    let low = 0,
      high = 0,
      covered = false,
      energy = 0,
      weight = 0;
    for (const target of targets) {
      const begin = Math.max(left, target.startFrame),
        end = Math.min(right, target.endFrame);
      if (end <= begin) continue;
      const from = Math.floor(
          (begin - target.startFrame) / target.strideFrames,
        ),
        to = Math.min(
          target.min.length,
          Math.ceil((end - target.startFrame) / target.strideFrames),
        );
      for (let i = from; i < to; i++) {
        if (layer === 'rms') {
          if (!Number.isFinite(target.rms?.[i])) continue;
          const bucketStart = target.startFrame + i * target.strideFrames;
          const overlap = Math.max(
            0,
            Math.min(end, bucketStart + target.strideFrames) -
              Math.max(begin, bucketStart),
          );
          energy += target.rms[i] ** 2 * overlap;
          weight += overlap;
        }
        covered = true;
        low = Math.min(low, target.min[i]);
        high = Math.max(high, target.max[i]);
      }
    }
    if (!covered) continue;
    if (layer === 'rms') {
      high = Math.sqrt(energy / weight);
      low = -high;
    }
    const y = (value) => Math.round(32 - Math.max(-1, Math.min(1, value)) * 32);
    path.push(
      `M${Math.round((x * 640000) / columns) / 1000},${y(high)}V${y(low)}`,
    );
  }
  return path.join('');
}

// Saved and draft boundaries share the canonical-minus-offset media axis.
// Unknown ends stay unknown; clipping here changes only the visible rectangle.
export function waveformLineFocus(
  document,
  lineId,
  draft,
  offsetMs,
  durationMs,
  viewport,
) {
  if (viewport.toMs <= viewport.fromMs) return null;
  const saved = document?.lines?.find((line) => line.lineId === lineId);
  if (!saved) return null;
  const current = draft?.lineId === lineId ? draft : null;
  const range = (line) => {
    const start = Number.isFinite(line.startMs)
      ? line.startMs - offsetMs
      : null;
    const end = Number.isFinite(line.endMs) ? line.endMs - offsetMs : null;
    const from = Math.max(0, viewport.fromMs),
      to = Math.min(durationMs, viewport.toMs);
    const x = (ms) =>
      ((ms - viewport.fromMs) / (viewport.toMs - viewport.fromMs)) * 640;
    const left = start === null ? null : Math.max(start, from);
    const right = end === null ? null : Math.min(end, to);
    return {
      startX: start !== null && start >= from && start <= to ? x(start) : null,
      endX: end !== null && end >= from && end <= to ? x(end) : null,
      x: left !== null && right !== null && right > left ? x(left) : null,
      width:
        left !== null && right !== null && right > left
          ? x(right) - x(left)
          : 0,
      unknownEnd: end === null,
      inferredEnd: line.endInferred === true && end !== null,
      outside:
        (start !== null && (start < 0 || start > durationMs)) ||
        (end !== null && (end < 0 || end > durationMs)),
    };
  };
  return {
    text: saved.text ?? '',
    isDraft: Boolean(current),
    changed: Boolean(
      current &&
      (current.startMs !== saved.startMs || current.endMs !== saved.endMs),
    ),
    saved: range(saved),
    draft: current ? range(current) : null,
  };
}
export function waveformMarkers(document, offsetMs, durationMs, fromMs, toMs) {
  const markers = [];
  let outside = 0;
  for (const line of document?.lines ?? []) {
    if (!Number.isFinite(line.startMs)) continue;
    const ms = line.startMs - offsetMs;
    if (ms < 0 || ms > durationMs) {
      outside++;
      continue;
    }
    if (ms >= fromMs && ms <= toMs && markers.length < 512)
      markers.push({
        id: line.lineId,
        ms,
        x: ((ms - fromMs) / (toMs - fromMs)) * 640,
      });
  }
  return { markers, outside };
}
