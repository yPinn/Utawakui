const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const PITCH_WIDTH = 320;
export const PITCH_HEIGHT = 180;
const PAGE_SECONDS = 8;

export function noteName(midi) {
  const note = Math.round(midi);
  return NOTES[note % 12] + (Math.floor(note / 12) - 1);
}

export function pitchAt(pitches, step, time, semitones = 0) {
  const hz = pitches[Math.round(time / step)];
  return hz > 0 ? 69 + 12 * Math.log2(hz / 440) + semitones : null;
}

function isIsolatedSpike(midi, neighbors) {
  if (neighbors.some((pitch) => pitch === null)) return false;
  const low = Math.min(...neighbors);
  const high = Math.max(...neighbors);
  return high - low <= 0.5 && (midi >= high + 5 || midi <= low - 5);
}

function smoothJitter(midi, neighbors) {
  if (neighbors.includes(null)) return midi;
  const [outerBefore, before, after, outerAfter] = neighbors;
  const window = [...neighbors, midi];
  if (Math.max(...window) - Math.min(...window) > 0.5) return midi;

  const into = midi - before;
  const out = after - midi;
  if (into * out >= 0) return midi;

  // A sustained bend has a single turn. Jitter returns to a flat contour
  // or turns again in the adjacent frames.
  const left = before - outerBefore;
  const right = outerAfter - after;
  const flat = Math.abs(left) <= 0.05 && Math.abs(right) <= 0.05;
  if (!flat && left * into >= 0 && out * right >= 0) return midi;

  return midi + Math.min(0.15, Math.max(-0.15, (out - into) / 4));
}

export function pitchPlot(pitches, step, start, span, semitones = 0) {
  const startIndex = Math.ceil(start / step);
  const endIndex = Math.min(pitches.length, Math.ceil((start + span) / step));
  const at = (index) => pitchAt(pitches, step, index * step, semitones);
  const points = [];
  const spikes = [];
  for (let index = startIndex; index < endIndex; index++) {
    const midi = at(index);
    if (midi === null) continue;
    const neighbors = [
      at(index - 2),
      at(index - 1),
      at(index + 1),
      at(index + 2),
    ];
    if (isIsolatedSpike(midi, neighbors)) {
      spikes.push({ index, midi });
      continue;
    }
    points.push({ index, midi: smoothJitter(midi, neighbors) });
  }
  if (!points.length && !spikes.length) {
    return { path: '', grid: [], markers: [] };
  }
  const values = (points.length ? points : spikes).map(({ midi }) => midi);
  const low = Math.floor(Math.min(...values) / 3) * 3 - 3;
  const high = Math.max(low + 12, Math.ceil(Math.max(...values) / 3) * 3 + 3);
  const y = (midi) => ((high - midi) / (high - low)) * PITCH_HEIGHT;
  let previous;
  const path = points
    .map((point) => {
      const x = pitchCursor(point.index * step, start, span);
      const coordinate = `${x.toFixed(2)},${y(point.midi).toFixed(2)}`;
      const connected =
        previous &&
        previous.index + 1 === point.index &&
        Math.abs(previous.midi - point.midi) <= 2.5;
      previous = point;
      return connected ? `L${coordinate}` : `M${coordinate}h0.15`;
    })
    .join(' ');
  const grid = [];
  const gridStep = Math.ceil((high - low) / 18) * 3;
  for (
    let midi = Math.ceil((low + 1) / gridStep) * gridStep;
    midi < high;
    midi += gridStep
  ) {
    grid.push({ y: y(midi), label: noteName(midi) });
  }
  const markers = spikes.map(({ index, midi }) => ({
    time: index * step,
    midi,
    x: pitchCursor(index * step, start, span),
    y: Math.min(PITCH_HEIGHT - 3, Math.max(3, y(midi))),
  }));
  return { path, grid, markers };
}

export function pitchPage(time, duration, windowSeconds = PAGE_SECONDS) {
  return (
    Math.floor(Math.max(0, Math.min(time, duration - 0.001)) / windowSeconds) *
    windowSeconds
  );
}

export function pitchSpan(start, duration, windowSeconds = PAGE_SECONDS) {
  return Math.min(windowSeconds, Math.max(0.001, duration - start));
}

export function pitchTimeTicks(start, span, windowSeconds) {
  const interval = windowSeconds / 4;
  const times = [start];
  for (
    let offset = interval;
    offset <= span - interval * 0.65;
    offset += interval
  ) {
    times.push(start + offset);
  }
  if (span >= 1) times.push(start + span);
  return times.map((time) => ({
    time,
    x: pitchCursor(time, start, span),
    anchor: time === start ? 'start' : time === start + span ? 'end' : 'middle',
  }));
}

export function pitchCursor(time, start, span) {
  return Math.max(
    0,
    Math.min(PITCH_WIDTH, ((time - start) / span) * PITCH_WIDTH),
  );
}
