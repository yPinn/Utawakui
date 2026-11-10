import { playbackPositionMs } from '../../../shared/presentation/state.mjs';
import { isIsolatedSpike, smoothJitter } from './referencePitchPlot.js';

// Include values on the 60-cent boundary despite Hz-to-MIDI rounding.
const NOTE_BAND = 0.6 + 1e-9;
const NOTE_CONFIRM_SECONDS = 0.064;
const SHORT_NOTE_STABILITY = 0.2;
const SHORT_NOTE_EDGE = 0.75;
const SHORT_GUIDE_SECONDS = 0.08;
const PITCH_MATCH_SEMITONES = 0.5;
const MAX_GUIDE_STEP_SEMITONES = 7;
const GUIDE_GAP_SUPPORT_FRAMES = 4;
const MAX_GUIDE_GAP_SECONDS = 0.016;
const MAX_GUIDE_GAP_PITCH_SPAN = 0.5;

const toMidi = (hz) =>
  Number.isFinite(hz) && hz >= 35 && hz <= 2200
    ? 69 + 12 * Math.log2(hz / 440)
    : null;

function cleanCenter(centers, index, continuous) {
  const midi = centers[index];
  if (midi === null || index < 2 || index + 2 >= centers.length) return midi;
  if (continuous && ![index - 1, index, index + 1, index + 2].every(continuous))
    return midi;
  const neighbors = [
    centers[index - 2],
    centers[index - 1],
    centers[index + 1],
    centers[index + 2],
  ];
  if (isIsolatedSpike(midi, neighbors))
    return (centers[index - 1] + centers[index + 1]) / 2;
  return smoothJitter(midi, neighbors);
}

function hasContinuousSlide(centers, index) {
  const left = centers[index - 2];
  const right = centers[index + 1];
  if (left == null || right == null) return false;
  const before = centers[index - 1];
  const after = centers[index];
  const direction = Math.sign(after - before);
  const steps = [before - left, after - before, right - after].map(
    (step) => step * direction,
  );
  const smallest = Math.min(...steps);
  const largest = Math.max(...steps);
  // An abrupt step between near-flat samples is a note boundary.
  return (
    smallest >= 0.045 &&
    largest <= 1.15 &&
    smallest >= largest * 0.26 &&
    Math.abs(right - left) >= 0.28
  );
}

function markSlides(centers) {
  const slides = new Uint32Array(centers.length);
  let start = 0;
  let end = 0;
  let direction = 0;
  let id = 0;
  function finish() {
    if (
      direction &&
      Math.abs(centers[end] - centers[start]) >= 0.55 &&
      Math.round(centers[start]) !== Math.round(centers[end])
    )
      slides.fill(++id, start, end + 1);
  }
  for (let index = 2; index + 1 < centers.length; index++) {
    if (centers[index] === null || centers[index - 1] === null) continue;
    if (!hasContinuousSlide(centers, index)) continue;
    const nextDirection = Math.sign(centers[index] - centers[index - 1]);
    if (nextDirection !== direction || index - 2 > end) {
      finish();
      start = index - 2;
      direction = nextDirection;
    }
    end = index + 1;
  }
  finish();
  return slides;
}

function median(values) {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return (values[middle] + values[Math.floor((values.length - 1) / 2)]) / 2;
}

function hasShortNoteEdges(centers, noteStart, start, end) {
  // Pitch evidence for a short tone: stable samples separated by clear edges.
  if (end - start < 2 || start - noteStart < 2) return false;
  const before = centers[start - 1];
  const after = centers[end];
  const candidate = centers.slice(start, end);
  return (
    Math.abs(before - centers[start - 2]) <= SHORT_NOTE_STABILITY &&
    Math.max(...candidate) - Math.min(...candidate) <= SHORT_NOTE_STABILITY &&
    Math.abs(candidate[0] - before) >= SHORT_NOTE_EDGE &&
    (after == null || Math.abs(after - candidate.at(-1)) >= SHORT_NOTE_EDGE)
  );
}

function flatContours(centers, from, to, step, confirmFrames) {
  const contours = [];
  let start = from;
  let anchor = centers[from];
  function finish(index) {
    const midi = Math.round(
      median(
        centers
          .slice(start, index)
          .filter((value) => Math.abs(value - anchor) <= NOTE_BAND),
      ),
    );
    const first = start * step;
    const end = index * step;
    contours.push({
      start: first,
      end,
      points: [
        { time: first, midi },
        { time: end, midi },
      ],
    });
  }
  let index = from + 1;
  while (index < to) {
    const candidate = centers[index];
    const difference = candidate - anchor;
    if (Math.abs(difference) <= NOTE_BAND) {
      index++;
      continue;
    }
    const direction = Math.sign(difference);
    // The leading frame of an adjacent slide may confirm its preceding note,
    // but the note outline still ends at the original slide boundary.
    const limit = Math.min(
      centers[to] == null ? to : to + 1,
      index + confirmFrames,
    );
    let end = index + 1;
    let low = candidate;
    let high = candidate;
    while (
      end < limit &&
      direction * (centers[end] - anchor) > NOTE_BAND &&
      Math.max(high, centers[end]) - Math.min(low, centers[end]) <= NOTE_BAND
    ) {
      low = Math.min(low, centers[end]);
      high = Math.max(high, centers[end]);
      end++;
    }
    if (
      end - index >= confirmFrames ||
      hasShortNoteEdges(centers, start, index, end)
    ) {
      // Commit the first candidate frame, rather than the confirmation frame.
      finish(index);
      start = index;
      anchor = median(centers.slice(start, end));
      index = Math.min(end, to);
      continue;
    }
    index++;
  }
  finish(to);
  return contours;
}

function coalesceContours(contours, step) {
  const merged = [];
  for (const contour of contours) {
    const previous = merged.at(-1);
    if (previous?.end !== contour.start) {
      merged.push(contour);
      continue;
    }

    const previousFlat = previous.points.length === 2;
    const currentFlat = contour.points.length === 2;
    const lastMidi = previous.points.at(-1).midi;
    const firstMidi = contour.points[0].midi;
    if (previousFlat && currentFlat && lastMidi === firstMidi) {
      previous.points[1] = contour.points[1];
      previous.end = contour.end;
      continue;
    }

    const previousDuration = previous.end - previous.start;
    const currentDuration = contour.end - contour.start;
    const joinsSlide =
      previousFlat !== currentFlat &&
      (previousFlat ? previousDuration : currentDuration) <= step + 1e-9 &&
      Math.round(lastMidi) === Math.round(firstMidi);
    const joinsSlidePieces =
      !previousFlat &&
      !currentFlat &&
      Math.min(previousDuration, currentDuration) <= 0.064 + 1e-9 &&
      Math.abs(lastMidi - firstMidi) <= 0.35;
    if (joinsSlide || joinsSlidePieces) {
      previous.points.push(...contour.points);
      previous.end = contour.end;
      continue;
    }

    merged.push(contour);
  }
  return merged;
}

function pitchCenters(pitches) {
  const raw = Array.from(pitches, toMidi);
  return raw.map((_, index) => cleanCenter(raw, index));
}

function contoursFromCenters(centers, step) {
  const slides = markSlides(centers);
  const confirmFrames = Math.ceil(NOTE_CONFIRM_SECONDS / step - 1e-9);
  const contours = [];
  let index = 0;
  while (index < centers.length) {
    if (centers[index] === null) {
      index++;
      continue;
    }
    const slide = slides[index];
    let end = index + 1;
    while (
      end < centers.length &&
      centers[end] !== null &&
      slides[end] === slide
    )
      end++;
    if (slide) {
      const points = centers.slice(index, end).map((midi, offset) => ({
        time: (index + offset) * step,
        midi,
      }));
      points.push({ time: end * step, midi: centers[end - 1] });
      contours.push({ start: index * step, end: end * step, points });
    } else {
      contours.push(...flatContours(centers, index, end, step, confirmFrames));
    }
    index = end;
  }
  return coalesceContours(contours, step);
}

export function guideContours(pitches, step) {
  return contoursFromCenters(pitchCenters(pitches), step);
}

function levelVibrato(centers, step) {
  const turns = [];
  const ranges = [];
  for (let index = 1; index < centers.length - 1; index++) {
    const before = centers[index - 1];
    const midi = centers[index];
    const after = centers[index + 1];
    if (before === null || midi === null || after === null) {
      turns.length = 0;
      continue;
    }
    const direction = Math.sign(midi - before);
    if (!direction || direction * (after - midi) >= 0) continue;
    turns.push({ index, midi, direction });
    if (turns.length < 4) continue;
    const [a, b, c, d] = turns;
    turns.shift();
    const halfCycles = [
      b.index - a.index,
      c.index - b.index,
      d.index - c.index,
    ];
    const excursions = [
      Math.abs(a.midi - b.midi),
      Math.abs(b.midi - c.midi),
      Math.abs(c.midi - d.midi),
    ];
    if (
      a.direction === b.direction ||
      b.direction === c.direction ||
      c.direction === d.direction ||
      Math.min(...halfCycles) * step < 0.045 ||
      Math.max(...halfCycles) * step > 0.16 ||
      Math.max(...halfCycles) > Math.min(...halfCycles) * 1.8 ||
      Math.min(...excursions) < 0.4 ||
      Math.max(...excursions) > 1.8 ||
      Math.abs(a.midi - c.midi) > 0.45 ||
      Math.abs(b.midi - d.midi) > 0.45
    )
      continue;
    const midiCenter = (a.midi + b.midi + c.midi + d.midi) / 4;
    const previous = ranges.at(-1);
    if (
      previous &&
      a.index <= previous.last &&
      Math.abs(previous.midi - midiCenter) <= 0.5
    ) {
      previous.last = d.index;
      previous.windows++;
    } else {
      ranges.push({
        first: a.index,
        last: d.index,
        midi: midiCenter,
        windows: 1,
      });
    }
  }
  for (const { first, last, midi } of ranges) {
    // Keep the attack and release up to the first and last turning point.
    centers.fill(midi, first, last + 1);
  }
  return ranges;
}

function hasShortGuideEvidence(note, centers, step) {
  if (note.end - note.start >= SHORT_GUIDE_SECONDS - 1e-9) return true;
  const start = Math.round(note.start / step);
  const end = Math.round(note.end / step);
  if (end - start < 2) return false;
  const samples = centers.slice(start, end);
  if (Math.max(...samples) - Math.min(...samples) > 0.35) return false;
  const hasEdge = (a, b, pitch) =>
    a != null &&
    b != null &&
    Math.abs(a - b) <= 0.35 &&
    Math.abs(b - pitch) >= SHORT_NOTE_EDGE;
  const enters = hasEdge(centers[start - 2], centers[start - 1], samples[0]);
  const leaves = hasEdge(centers[end + 1], centers[end], samples.at(-1));
  return end - start === 2 ? enters && leaves : enters || leaves;
}

function followsGlide(centers, step, start, end, delta) {
  if (Math.abs(delta) < 1 || end - start < 0.096 - 1e-9) return false;
  const first = Math.round(start / step);
  const last = Math.round(end / step) - 1;
  const direction = Math.sign(delta);
  let forward = 0;
  for (let index = first + 1; index <= last; index++) {
    if ((centers[index] - centers[index - 1]) * direction >= 0.025) forward++;
  }
  return forward >= (last - first) * 0.8;
}

export function guideNotes(pitches, step) {
  const centers = pitchCenters(pitches);
  const vibratos = levelVibrato(centers, step);
  const contours = contoursFromCenters(centers, step);
  const notes = [];
  for (let index = 0; index < contours.length; index++) {
    const { start, end, points } = contours[index];
    const previous = notes.at(-1);
    if (points.length === 2) {
      const { midi } = points[0];
      if (previous?.end === start && previous.midi === midi) previous.end = end;
      else notes.push({ start, end, midi });
      continue;
    }

    // A glide can decorate a neighboring note, including its attack or tail.
    // Never cross a silent gap or combine two different stable note centers.
    const from = points[0].midi;
    let glideEnd = end;
    let to = points.at(-1).midi;
    while (
      contours[index + 1]?.start === glideEnd &&
      contours[index + 1].points.length > 2
    ) {
      const continuation = contours[++index];
      glideEnd = continuation.end;
      to = continuation.points.at(-1).midi;
    }
    const next = contours[index + 1];
    const midi = Math.round((from + to) / 2);
    const technique = followsGlide(centers, step, start, glideEnd, to - from)
      ? { kind: to > from ? 'rise' : 'fall', time: (start + glideEnd) / 2 }
      : null;
    const before = previous?.end === start ? previous : null;
    const after = next?.start === glideEnd ? next : null;
    if (
      before &&
      (!after ||
        before.midi === after.points[0].midi ||
        Math.abs(before.midi - midi) < Math.abs(after.points[0].midi - midi))
    ) {
      before.end = glideEnd;
      before.technique ??= technique;
    } else if (after) {
      notes.push({
        start,
        end: after.end,
        midi: after.points[0].midi,
        technique,
      });
      index++;
    } else {
      notes.push({ start, end: glideEnd, midi, technique });
    }
  }

  let vibratoIndex = 0;
  return notes
    .filter((note) => hasShortGuideEvidence(note, centers, step))
    .map(({ start, end, midi, technique }) => {
      while (
        vibratoIndex < vibratos.length &&
        (vibratos[vibratoIndex].last + 1) * step <= start
      )
        vibratoIndex++;
      const vibrato = vibratos[vibratoIndex];
      if (vibrato?.windows >= 2 && vibrato.first * step < end) {
        const from = Math.max(start, vibrato.first * step);
        const to = Math.min(end, (vibrato.last + 1) * step);
        if (to - from >= 0.2)
          technique = { kind: 'vibrato', time: (from + to) / 2 };
      }
      return {
        start,
        end,
        technique,
        points: [
          { time: start, midi },
          { time: end, midi },
        ],
      };
    });
}

export function clipGuideContour(contour, start, end) {
  const points = [];
  for (const [index, point] of contour.points.entries()) {
    if (point.time >= start && point.time <= end) points.push(point);
    const next = contour.points[index + 1];
    if (!next) break;
    for (const boundary of [start, end]) {
      if (point.time < boundary && boundary < next.time) {
        const fraction = (boundary - point.time) / (next.time - point.time);
        points.push({
          time: boundary,
          midi: point.midi + (next.midi - point.midi) * fraction,
        });
      }
    }
    if (next.time > end) break;
  }
  return { ...contour, points };
}

export function guideSilenceRanges(marks) {
  const changes = new Map();
  for (const { label, fromMs, toMs } of marks) {
    if (label === 'octave-up' || label === 'octave-down') continue;
    const channel = label === 'no-voice' ? 0 : 1;
    for (const [time, delta] of [
      [fromMs, 1],
      [toMs, -1],
    ]) {
      const change = changes.get(time) ?? [0, 0];
      change[channel] += delta;
      changes.set(time, change);
    }
  }
  let silent = 0;
  let protectedCount = 0;
  let start = null;
  const ranges = [];
  for (const [time, [silenceDelta, protectionDelta]] of [...changes].sort(
    ([a], [b]) => a - b,
  )) {
    silent += silenceDelta;
    protectedCount += protectionDelta;
    if (silent > 0 && protectedCount === 0) {
      start ??= time;
    } else if (start !== null) {
      ranges.push([start / 1000, time / 1000]);
      start = null;
    }
  }
  return ranges;
}

export function applyGuideOctaveMarks(pitches, step, marks, fromMs = 0) {
  const corrections = marks.filter(
    ({ label }) => label === 'octave-up' || label === 'octave-down',
  );
  if (!corrections.length) return pitches;
  const flags = new Uint8Array(pitches.length);
  const indexAt = (timeMs) =>
    Math.max(
      0,
      Math.min(
        flags.length,
        Math.ceil((timeMs - fromMs) / (step * 1000) - 1e-9),
      ),
    );
  for (const mark of corrections) {
    const flag = mark.label === 'octave-up' ? 1 : 2;
    const end = indexAt(mark.toMs);
    for (let index = indexAt(mark.fromMs); index < end; index++)
      flags[index] |= flag;
  }
  return pitches.map((pitch, index) =>
    flags[index] === 1 ? pitch * 2 : flags[index] === 2 ? pitch / 2 : pitch,
  );
}

export function maskGuideContours(contours, ranges) {
  if (ranges.length === 0) return contours;
  return contours.flatMap((contour) => {
    let start = contour.start;
    const segments = [];
    const addSegment = (end) => {
      if (end - start <= 1e-9) return;
      segments.push({ ...clipGuideContour(contour, start, end), start, end });
    };
    for (const [from, to] of ranges) {
      if (to <= start) continue;
      if (from >= contour.end) break;
      addSegment(from);
      start = to;
    }
    if (start === contour.start) return [contour];
    addSegment(contour.end);
    return segments;
  });
}

function hasStableGuideGap(pitches, step, index, ranges) {
  if (step > MAX_GUIDE_GAP_SECONDS + 1e-9) return false;
  const first = index - GUIDE_GAP_SUPPORT_FRAMES;
  const last = index + GUIDE_GAP_SUPPORT_FRAMES;
  let low = Infinity;
  let high = -Infinity;
  for (let at = first; at <= last; at++) {
    if (at === index) continue;
    const midi = toMidi(pitches[at]);
    if (midi === null) return false;
    low = Math.min(low, midi);
    high = Math.max(high, midi);
  }
  return (
    high - low <= MAX_GUIDE_GAP_PITCH_SPAN + 1e-9 &&
    !ranges.some(
      ([from, to]) => from <= last * step + 1e-9 && to > first * step + 1e-9,
    )
  );
}

export function guidePitchFrames(pitches, step, ranges, from, to) {
  const first = Math.max(0, Math.floor(from / step));
  const last = Math.min(pitches.length - 1, Math.ceil(to / step));
  let rangeIndex = 0;
  let previousTime = (first - 1) * step;
  let previousMidi = null;
  const frames = [];
  for (let index = first; index <= last; index++) {
    const time = index * step;
    while (ranges[rangeIndex]?.[1] <= time + 1e-9) rangeIndex++;
    const range = ranges[rangeIndex];
    const silent = range?.[0] <= time + 1e-9;
    const crossesSilence =
      silent || ranges[rangeIndex - 1]?.[1] > previousTime + 1e-9;
    // Join the measured endpoints without inventing a pitch for a missed frame.
    if (
      index > first &&
      index < last &&
      pitches[index] === 0 &&
      !crossesSilence &&
      hasStableGuideGap(pitches, step, index, ranges)
    )
      continue;
    const midi = silent ? null : toMidi(pitches[index]);
    frames.push({
      time,
      hz: midi === null ? null : pitches[index],
      continuous:
        !crossesSilence &&
        midi !== null &&
        previousMidi !== null &&
        Math.abs(midi - previousMidi) < MAX_GUIDE_STEP_SEMITONES,
    });
    previousTime = time;
    previousMidi = midi;
  }
  return frames;
}

export const SING_ALONG_SECONDS = 8;
export const SING_ALONG_CURSOR = 1 / 3;
// Allow the mic analysis window, one sample interval and a paint to complete.
export const SING_ALONG_MIC_LOOKBACK_MS = 80;

export function createSingAlongClock() {
  let anchor = null;
  const correctionMs = 800;
  function positionAt(frameMs) {
    if (!anchor) return 0;
    const elapsed = Math.max(0, frameMs - anchor.frameMs);
    const remaining = 1 - Math.min(1, elapsed / correctionMs);
    return Math.min(
      anchor.duration,
      Math.max(
        0,
        anchor.position + elapsed * anchor.rate + anchor.offset * remaining,
      ),
    );
  }
  function displayPositionAt(frameMs) {
    return (
      anchor?.frozen ??
      Math.max(0, positionAt(frameMs) - (anchor?.lookback ?? 0))
    );
  }
  function sync(
    state,
    continuity,
    nowMs,
    frameMs,
    monitorPitchDelayMs = 0,
    micLookbackMs = 0,
  ) {
    const playback = state?.playback;
    const status = playback?.status;
    const rate =
      Number.isFinite(playback?.rate) && playback.rate > 0 ? playback.rate : 1;
    const mediaDelay = status === 'playing' ? monitorPitchDelayMs * rate : 0;
    const lookback = status === 'playing' ? micLookbackMs * rate : 0;
    const position = playbackPositionMs(state, nowMs) - mediaDelay;
    const sameSource = anchor && anchor.continuity === continuity;
    const wasHeld = anchor?.frozen != null || anchor?.status === 'paused';
    const frozen =
      (status === 'paused' || status === 'buffering') &&
      sameSource &&
      (anchor.status === 'playing' || wasHeld)
        ? displayPositionAt(frameMs)
        : null;
    const previous = wasHeld
      ? displayPositionAt(frameMs) + lookback
      : positionAt(frameMs);
    const difference = previous - position;
    const continuous =
      sameSource &&
      anchor.playbackRate === rate &&
      ((anchor.status === 'playing' && anchor.mediaDelay === mediaDelay) ||
        wasHeld) &&
      status === 'playing' &&
      Math.abs(difference) <= Math.min(120, (rate * correctionMs) / 2);
    anchor = {
      continuity,
      status,
      frameMs,
      position,
      playbackRate: rate,
      mediaDelay,
      lookback,
      frozen,
      rate: status === 'playing' ? rate : 0,
      duration: playback?.durationMs ?? Infinity,
      offset: continuous ? difference : 0,
    };
    return displayPositionAt(frameMs);
  }
  return { sync, positionAt, displayPositionAt };
}

export function songPitchBounds(notes, semitones) {
  if (!notes.length || !Number.isFinite(semitones))
    return { low: 36, high: 84 };
  const durations = new Map();
  let total = 0;
  let sustainedLow = Infinity;
  let sustainedHigh = -Infinity;
  for (const { start, end, points } of notes) {
    const midi = points[0].midi + semitones;
    const seconds = end - start;
    durations.set(midi, (durations.get(midi) ?? 0) + seconds);
    total += seconds;
    if (seconds >= 0.24 - 1e-9) {
      sustainedLow = Math.min(sustainedLow, midi);
      sustainedHigh = Math.max(sustainedHigh, midi);
    }
  }
  const pitches = [...durations].sort(([a], [b]) => a - b);
  let elapsed = 0;
  let low;
  let high = pitches.at(-1)[0];
  for (const [midi, seconds] of pitches) {
    elapsed += seconds;
    if (elapsed >= total * 0.01) low ??= midi;
    if (elapsed >= total * 0.99) {
      high = midi;
      break;
    }
  }
  const middle = (low + high) / 2;
  return {
    low: Math.floor(Math.min(low - 4, sustainedLow - 3, middle - 12) / 3) * 3,
    high: Math.ceil(Math.max(high + 4, sustainedHigh + 3, middle + 12) / 3) * 3,
  };
}

export const GUIDE_NOTE_HEIGHT = 8;

export function guideNoteGeometry(note, x, y) {
  const left = x(note.start);
  const right = x(note.end);
  const inset = Math.min(0.4, (right - left) / 4);
  const { midi } = note.points[0];
  const center = y(midi);
  const high = y(midi + PITCH_MATCH_SEMITONES);
  const low = y(midi - PITCH_MATCH_SEMITONES);
  return {
    x: left + inset,
    y: center - GUIDE_NOTE_HEIGHT / 2,
    width: right - left - 2 * inset,
    bandY: Math.min(high, low),
    bandHeight: Math.abs(low - high),
  };
}

export function guideTechniqueMarkers(
  notes,
  x,
  viewStart,
  viewEnd,
  cues = [],
  hidden = [],
) {
  const left = x(viewStart) + 4;
  const right = x(viewEnd) - 4;
  const markers = [];
  for (const { start, end, technique } of notes) {
    if (!technique || technique.time < start || technique.time >= end) continue;
    const column = x(technique.time);
    if (column < left || column > right) continue;
    if (markers.length && column - markers.at(-1).x < 10) continue;
    markers.push({ ...technique, x: column, start, end });
  }
  if (!cues.length && !hidden.length) return markers;
  // Hide after spacing so a suppressed neighbor does not take the marker's place.
  return markers.flatMap((mark) => {
    const timeMs = Math.round(mark.time * 1000);
    const cue = cues.find(
      ({ kind, fromMs, toMs }) =>
        kind === mark.kind &&
        fromMs <= timeMs &&
        timeMs < toMs &&
        fromMs >= Math.round(mark.start * 1000) &&
        toMs <= Math.round(mark.end * 1000),
    );
    if (!cue) {
      const hiddenMark = hidden.some(
        ({ kind, atMs }) => kind === mark.kind && atMs === timeMs,
      );
      return hiddenMark ? [] : [mark];
    }
    const start = cue.fromMs / 1000;
    const hint = x(cue.hintMs / 1000);
    return [
      {
        ...mark,
        x: hint,
        start,
        end: cue.toMs / 1000,
        onsetOffset: x(start) - hint,
      },
    ];
  });
}

export function guideContourPath(
  points,
  x,
  y,
  { trimStart = true, trimEnd = true } = {},
) {
  if (points.length < 2) return '';
  const start = x(points[0].time);
  const width = x(points.at(-1).time) - start;
  if (width <= 0) return '';
  const inset = Math.min(0.4, width / 4);
  const left = trimStart ? inset : 0;
  const right = trimEnd ? inset : 0;
  const scale = (width - left - right) / width;
  const top = [];
  const bottom = [];
  for (const { time, midi } of points) {
    const column = (start + left + (x(time) - start) * scale).toFixed(2);
    const center = y(midi);
    top.push(`${column},${(center - 4).toFixed(2)}`);
    bottom.push(`${column},${(center + 4).toFixed(2)}`);
  }
  return `M${top.join('L')}L${bottom.reverse().join('L')}Z`;
}

export function connectMicFrames(frames) {
  const raw = frames.map(({ hz }) => toMidi(hz));
  const isolated = raw.map(
    (midi, index) =>
      midi !== null &&
      index >= 2 &&
      index + 2 < raw.length &&
      [index - 1, index, index + 1, index + 2].every(
        (at) => frames[at].continuous,
      ) &&
      isIsolatedSpike(midi, [
        raw[index - 2],
        raw[index - 1],
        raw[index + 1],
        raw[index + 2],
      ]),
  );
  return frames.map((frame, index) =>
    frame.continuous && (isolated[index] || isolated[index - 1])
      ? { ...frame, continuous: false }
      : frame,
  );
}

export const INPUT_LEVEL_HEIGHT = 16;

export function inputLevelPath(frames, from, to, timeToX) {
  let path = '';
  let lastX = null;
  for (const { time, dbfs, continuous } of frames) {
    if (time < from || time > to || !Number.isFinite(dbfs)) continue;
    if (!continuous && lastX !== null) {
      path += `L${lastX},${INPUT_LEVEL_HEIGHT}Z`;
      lastX = null;
    }
    const x = timeToX(time).toFixed(2);
    const level = Math.min(1, Math.max(0, (dbfs + 65) / 45));
    const y = INPUT_LEVEL_HEIGHT - level * (INPUT_LEVEL_HEIGHT - 2);
    if (lastX === null) path += `M${x},${INPUT_LEVEL_HEIGHT}`;
    path += `L${x},${y.toFixed(2)}`;
    lastX = x;
  }
  return lastX === null ? path : `${path}L${lastX},${INPUT_LEVEL_HEIGHT}Z`;
}

export function inputLevelPaths(frames, from, to, timeToX) {
  const paths = Object.create(null);
  let group = [];
  let tone = 'neutral';
  function flush() {
    if (!group.length) return;
    paths[tone] =
      (paths[tone] ?? '') + inputLevelPath(group, from, to, timeToX);
    group = [];
  }

  for (const frame of frames) {
    if (frame.time < from || frame.time > to || !Number.isFinite(frame.dbfs)) {
      flush();
      continue;
    }
    const previous = group.at(-1);
    const nextTone = frame.levelTone ?? 'neutral';
    if (!frame.continuous) {
      flush();
    } else if (previous && nextTone !== tone) {
      const edge = {
        time: (previous.time + frame.time) / 2,
        dbfs: (previous.dbfs + frame.dbfs) / 2,
        continuous: true,
      };
      group.push(edge);
      flush();
      group.push(edge);
    }
    tone = nextTone;
    group.push(frame);
  }
  flush();
  return paths;
}

export function projectMicSamplePosition(frame, boundaryMs, positionAt, rate) {
  const { sampledAtMs, windowMs } = frame;
  if (sampledAtMs - windowMs < boundaryMs) return null;
  return Math.max(0, positionAt(sampledAtMs) - (windowMs / 2) * rate);
}
