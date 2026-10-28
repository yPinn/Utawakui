export function waveformPath(summary) {
  const { min, max } = summary.peaks;
  const {
    startFrame = 0,
    endFrame = min.length,
    strideFrames = 1,
  } = summary.peaks;
  const frames = Math.max(
    0,
    Math.min(summary.frames ?? endFrame, endFrame) - startFrame,
  );
  const columns = Math.min(640, min.length),
    path = [];
  for (let x = 0; x < columns; x++) {
    const from = Math.floor((x * frames) / columns / strideFrames),
      to = Math.min(
        min.length,
        Math.ceil(((x + 1) * frames) / columns / strideFrames),
      );
    let low = 0,
      high = 0;
    for (let i = from; i < to; i++) {
      low = Math.min(low, min[i]);
      high = Math.max(high, max[i]);
    }
    const y = (value) => Math.round(32 - Math.max(-1, Math.min(1, value)) * 32);
    path.push(`M${x},${y(high)}V${y(low)}`);
  }
  return path.join('');
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
