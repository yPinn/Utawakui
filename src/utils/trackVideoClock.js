export function trackVideoFrame(
  sample,
  offsetMs,
  monitorDelayMs,
  duration,
  segments,
) {
  const playing = sample.phase === 'playing';
  const delay = playing ? monitorDelayMs * sample.rate : 0;
  const audioPosition = sample.positionMs - delay;
  // The most recent matched section stays in effect until the next anchor.
  const segment =
    segments?.findLast(({ startMs }) => audioPosition >= startMs) ??
    segments?.[0];
  const adjustment = segment ? segment.offsetMs - segments[0].offsetMs : 0;
  const position = (audioPosition + offsetMs + adjustment) / 1000;
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0)
    return null;
  const lastPosition = Math.max(0, duration - 0.001);
  return {
    position: Math.min(Math.max(position, 0), lastPosition),
    rate: sample.rate,
    playing: playing && position >= 0 && position < lastPosition,
    ...(segment && { segmentStartMs: segment.startMs }),
  };
}
