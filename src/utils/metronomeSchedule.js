export const DEFAULT_LOOKAHEAD_SECONDS = 0.1;
export const DEFAULT_MAX_BEATS_PER_TICK = 16;
export const DEFAULT_RESYNC_THRESHOLD_SECONDS = 1;

export function beatIntervalSeconds(bpm) {
  return 60 / bpm;
}

export function isAccentBeat(beatNumber) {
  return beatNumber === 1;
}

export function nextBeatNumber(beatNumber, beatsPerBar) {
  return beatNumber >= beatsPerBar ? 1 : beatNumber + 1;
}

// Advances the schedule by absolute addition (nextBeatTime += interval) so
// setTimeout/setInterval jitter never compounds across beats: each beat's
// time is derived from the last scheduled beat, not from re-reading "now".
// A caller polls this on a coarse timer and hands every returned beat's
// `time` to the audio clock (AudioContext.currentTime-based scheduling),
// never triggering sound directly from the poll callback.
export function collectDueBeats({
  nextBeatTime,
  beatNumber,
  bpm,
  beatsPerBar,
  now,
  lookaheadSeconds = DEFAULT_LOOKAHEAD_SECONDS,
  maxBeats = DEFAULT_MAX_BEATS_PER_TICK,
  resyncThresholdSeconds = DEFAULT_RESYNC_THRESHOLD_SECONDS,
}) {
  const interval = beatIntervalSeconds(bpm);
  let time = now - nextBeatTime > resyncThresholdSeconds ? now : nextBeatTime;
  let beat = beatNumber;
  const horizon = now + lookaheadSeconds;
  const beats = [];

  while (time < horizon && beats.length < maxBeats) {
    beats.push({ time, beatNumber: beat, accent: isAccentBeat(beat) });
    time += interval;
    beat = nextBeatNumber(beat, beatsPerBar);
  }

  return { beats, nextBeatTime: time, beatNumber: beat };
}
