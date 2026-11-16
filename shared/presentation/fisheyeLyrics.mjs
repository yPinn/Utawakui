import {
  analyzeLyricsText,
  isProtectedLyricsBreak,
  isSafeLyricsBreak,
} from './lyricsTextProcessing.mjs';

export const FISHEYE_FPS = 24;
export const FISHEYE_FRAME_MS = 1000 / FISHEYE_FPS;

export function resolveFisheyeLayout(layout, variant) {
  if (layout === 'standard' || layout === 'close') return layout;
  return variant === 'chorus' ? 'close' : 'standard';
}

export function resolveFisheyeExit(exit = 'auto', variant) {
  return exit === 'auto' ? (variant === 'chorus' ? 'swirl' : 'arc') : exit;
}

const MAX_COLUMN_UNITS = 10;
const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const wordGlyph = /^[\p{Script=Latin}\p{N}]\p{M}*$/u;
const numberGlyph = /^\p{N}$/u;
const wordJoiner = /^['’.-]$/u;
const numberJoiner = /^[,，．:：]$/u;
export const FISHEYE_ARC_ENTRANCE = [
  { turn: -0.7, face: 0.22 },
  { turn: -0.34, face: 0.59, trail: 0.03 },
  { turn: -0.09, face: 0.9, trail: 0.019 },
];
export const FISHEYE_ARC_EXIT = [
  { turn: 0.24, face: 1 },
  { turn: 0.64, face: 1, trail: 0.032 },
  { turn: 1.16, face: 1, trail: 0.038 },
];
export const FISHEYE_SWIRL_ENTRANCE = [
  { bend: 0.98, turn: -0.52, width: 0.76, height: 1.05 },
  { bend: 0.72, turn: -0.32, width: 0.89, height: 1.08 },
  { bend: 0.39, turn: -0.13, width: 0.96, height: 1.04 },
  { bend: 0.13, turn: -0.03, width: 1.01, height: 1.02 },
];
export const FISHEYE_SWIRL_EXIT = [
  { bend: 0.17, turn: 0.04, width: 1.09, height: 1.08 },
  { bend: 0.42, turn: 0.16, width: 1.07, height: 1.05 },
  { bend: 0.71, turn: 0.38, width: 0.88, height: 0.98 },
  { bend: 1, turn: 0.73, width: 0.66, height: 0.94 },
];
const EMPTY_FRAMES = 2;
const ENTRY_FRAMES = { arc: 3, scale: 6, swirl: 4, smoke: 14, cut: 0 };
const EXIT_FRAMES = { arc: 3, scale: 5, swirl: 4, cut: 0 };
export function fisheyeLyricsColumns(text) {
  const source = String(text ?? '');
  const glyphs = [...segments.segment(source)];
  const units = [];
  const isWord = (glyph) =>
    glyph !== undefined && wordGlyph.test(glyph) && !glyph.endsWith('\u20e3');
  for (let i = 0; i < glyphs.length; i++) {
    const { segment, index } = glyphs[i];
    if (/^\s+$/u.test(segment)) continue;
    let value = segment;
    if (isWord(segment)) {
      while (i + 1 < glyphs.length) {
        const next = glyphs[i + 1].segment;
        const after = glyphs[i + 2]?.segment;
        if (isWord(next)) {
          value += next;
          i++;
        } else if (
          (wordJoiner.test(next) && isWord(after)) ||
          (numberJoiner.test(next) &&
            numberGlyph.test(glyphs[i].segment) &&
            numberGlyph.test(after ?? ''))
        ) {
          value += next + after;
          i += 2;
        } else break;
      }
    }
    units.push({ value, index });
    if (units.length > 2 * MAX_COLUMN_UNITS) break;
  }
  const capacity = 2 * MAX_COLUMN_UNITS;
  if (units.length <= 3) {
    return { right: units.map(({ value }) => value), left: [] };
  }
  const analysis = analyzeLyricsText(source);
  const isSafe = (index) => isSafeLyricsBreak(source, units[index].index);
  const outsidePair = (index) =>
    !isProtectedLyricsBreak(analysis, units[index].index);
  if (units.length > capacity) {
    const last = isSafe(capacity - 1) ? capacity - 1 : capacity - 2;
    units.splice(last, units.length, {
      value: '…',
      index: units[last].index,
    });
  }
  const middle = Math.ceil(units.length / 2);
  const breaks = [];
  for (
    let split = Math.max(1, units.length - MAX_COLUMN_UNITS);
    split <= Math.min(MAX_COLUMN_UNITS, units.length - 1);
    split++
  ) {
    if (isSafe(split)) breaks.push(split);
  }
  const nearest = (values) =>
    values.reduce((best, value) =>
      Math.abs(value - middle) <= Math.abs(best - middle) ? value : best,
    );
  const outsidePairs = breaks.filter(outsidePair);
  const split = outsidePairs.length
    ? nearest(outsidePairs)
    : breaks.length
      ? nearest(breaks)
      : middle;
  return {
    right: units.slice(0, split).map(({ value }) => value),
    left: units.slice(split).map(({ value }) => value),
  };
}

export function fisheyeLyricsPose({
  ageMs,
  durationMs,
  animate,
  enter = 'arc',
  exit = 'arc',
  blur = false,
}) {
  const age = Math.max(0, Math.floor(ageMs / FISHEYE_FRAME_MS));
  const phase = fisheyeMotionWindow({
    ageMs,
    durationMs,
    animate,
    enter,
    exit,
  });
  const resting = { age, visible: true, orbit: null };
  if (!phase) return resting;
  if (phase.mode === 'empty') return { ...resting, visible: false };
  return motionPose(
    resting,
    phase.mode,
    Math.floor(phase.frame),
    phase.entering,
    blur,
  );
}

export function fisheyeMotionWindow({
  ageMs,
  durationMs,
  animate,
  enter = 'arc',
  exit = 'arc',
}) {
  if (!animate) return null;
  const frames = Math.floor(durationMs / FISHEYE_FRAME_MS);
  if (frames < 8) return null;
  const entryFrames = ENTRY_FRAMES[enter] ?? 0;
  const exitFrames = EXIT_FRAMES[exit] ?? 0;
  const emptyFrames = exit === 'arc' || exit === 'scale' ? EMPTY_FRAMES : 0;
  const canExit = frames >= exitFrames + emptyFrames + 2;
  // Smoke particles may finish early, but always leave at least two readable frames.
  const minimumEntry = enter === 'smoke' ? 2 : entryFrames;
  const canEnter =
    frames >=
    minimumEntry +
      (canExit ? exitFrames + emptyFrames : 0) +
      (enter === 'smoke' ? 2 : 0);
  const remaining = (durationMs - ageMs) / FISHEYE_FRAME_MS;
  if (canExit && remaining <= emptyFrames) return { mode: 'empty' };
  const exitIndex = exitFrames + emptyFrames - remaining;
  if (canExit && exitIndex >= -1e-8 && exitIndex < exitFrames) {
    return { mode: exit, frame: Math.max(0, exitIndex), entering: false };
  }
  const age = Math.max(0, ageMs / FISHEYE_FRAME_MS);
  return canEnter && age < entryFrames
    ? { mode: enter, frame: age, entering: true }
    : null;
}

function motionPose(pose, mode, index, entering, blur) {
  if (mode === 'arc') {
    const { turn, face, trail } = (
      entering ? FISHEYE_ARC_ENTRANCE : FISHEYE_ARC_EXIT
    )[index];
    return {
      ...pose,
      orbit: { turn, face, ...(blur && trail ? { trail } : {}) },
    };
  }
  if (mode === 'swirl') {
    return {
      ...pose,
      swirl: (entering ? FISHEYE_SWIRL_ENTRANCE : FISHEYE_SWIRL_EXIT)[index],
    };
  }
  if (mode === 'smoke') {
    return {
      ...pose,
      visible: index >= 2,
      smoke: index < 2,
      particles: index >= 2 ? (14 - index) / 12 : 0,
    };
  }
  return { ...pose, scaleTransition: { index, entering } };
}

export function fisheyeLetterScale(index, side, transition) {
  if (!transition) return 1;
  const { index: frame, entering } = transition;
  const waits = entering
    ? side > 0
      ? [2, 1, 2, 0, 1]
      : [2, 1, 0, 1]
    : side > 0
      ? [2, 0, 1]
      : [1, 2, 0];
  const progress = Math.min(
    1,
    Math.max(0, (frame - waits[index % waits.length] + 1) / (entering ? 4 : 3)),
  );
  return entering
    ? 1 - (1 - progress) ** 2 + Math.sin(progress * Math.PI) * 0.09
    : 1 - progress ** 1.6;
}
