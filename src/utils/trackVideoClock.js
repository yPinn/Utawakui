export function trackVideoFrame(sample, offsetMs, monitorDelayMs, duration) {
  const playing = sample.phase === 'playing';
  const delay = playing ? monitorDelayMs * sample.rate : 0;
  const position = (sample.positionMs + offsetMs - delay) / 1000;
  if (position < 0 || position >= duration || sample.phase === 'ended')
    return null;
  return { position, rate: sample.rate, playing };
}
