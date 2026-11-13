import {
  FISHEYE_ARC_ENTRANCE,
  FISHEYE_ARC_EXIT,
  FISHEYE_FRAME_MS,
  FISHEYE_SWIRL_ENTRANCE,
  FISHEYE_SWIRL_EXIT,
  fisheyeLyricsPose,
  fisheyeMotionWindow,
} from '../presentation/fisheyeLyrics.mjs';

const ARC_REST = { turn: 0, face: 1, trail: 0 };
const SWIRL_REST = { bend: 0, turn: 0, width: 1, height: 1, opacity: 1 };
export const FISHEYE_LAYOUT_DURATION_MS = { push: 560, pull: 430 };
const GLYPH_STAGGER = {
  enterRight: [2, 1, 2, 0, 1],
  enterLeft: [2, 1, 0, 1],
  exitRight: [2, 0, 1],
  exitLeft: [1, 2, 0],
};

// A frame in the authored choreography is the unit of GSAP time here.
// The caller samples paused timelines from the playback position.
export function createFisheyeMotion(gsap) {
  if (typeof gsap?.timeline !== 'function') {
    return {
      lyricPose: fisheyeLyricsPose,
      layoutMix: ({ target }) => target,
      dispose() {},
    };
  }

  const timelines = [];
  function createTimeline() {
    const timeline = gsap.timeline({ paused: true });
    timelines.push(timeline);
    return timeline;
  }

  function keyframes(poses, ease) {
    const [initial, ...rest] = poses;
    const state = { ...initial };
    const timeline = createTimeline();
    for (const pose of rest) timeline.to(state, { ...pose, duration: 1, ease });
    return (frame) => {
      timeline.time(frame, true);
      return { ...state };
    };
  }

  const arcIn = keyframes(
    [
      ...FISHEYE_ARC_ENTRANCE.map((pose) => ({ ...ARC_REST, ...pose })),
      ARC_REST,
    ],
    'sine.inOut',
  );
  const arcOut = keyframes(
    [
      ARC_REST,
      ...FISHEYE_ARC_EXIT.map((pose) => ({ ...ARC_REST, ...pose })),
      { turn: 1.62, face: 0.72, trail: 0 },
    ],
    'sine.inOut',
  );
  const swirlIn = keyframes(
    [...FISHEYE_SWIRL_ENTRANCE, SWIRL_REST],
    'sine.inOut',
  );
  const swirlOut = keyframes(
    [
      SWIRL_REST,
      ...FISHEYE_SWIRL_EXIT,
      { ...FISHEYE_SWIRL_EXIT.at(-1), width: 0.48, height: 0.9, opacity: 0 },
    ],
    'sine.inOut',
  );
  const smoke = keyframes(
    [{ reveal: 0 }, { reveal: 1 }, { reveal: 0 }],
    'sine.inOut',
  );
  const layout = keyframes([{ progress: 0 }, { progress: 1 }], 'power2.inOut');
  const glyphs = {};
  for (const [key, waits] of Object.entries(GLYPH_STAGGER)) {
    const entering = key.startsWith('enter');
    const timeline = createTimeline();
    const states = waits.map((wait) => {
      const state = { scale: entering ? 0 : 1 };
      timeline.to(
        state,
        {
          scale: entering ? 1 : 0,
          duration: entering ? 3.5 : 2.7,
          ease: entering ? 'back.out(1.3)' : 'power2.in',
        },
        wait * (entering ? 0.88 : 0.72),
      );
      return state;
    });
    glyphs[key] = (frame) => {
      timeline.time(frame, true);
      return states.map(({ scale }) => scale);
    };
  }

  function lyricPose(options) {
    const age = Math.max(0, options.ageMs / FISHEYE_FRAME_MS);
    const phase = fisheyeMotionWindow(options);
    const pose = { age, visible: phase?.mode !== 'empty', orbit: null };
    if (!phase || phase.mode === 'empty') return pose;
    const { mode, frame, entering } = phase;
    if (mode === 'arc') {
      const orbit = entering
        ? arcIn(frame)
        : arcOut(frame * (1 + 1 / FISHEYE_ARC_EXIT.length));
      return {
        ...pose,
        orbit: { ...orbit, trail: options.blur ? orbit.trail : 0 },
      };
    }
    if (mode === 'swirl') {
      return {
        ...pose,
        swirl: entering
          ? swirlIn(frame)
          : swirlOut(frame * (1 + 1 / FISHEYE_SWIRL_EXIT.length)),
      };
    }
    if (mode === 'smoke') {
      const { reveal } = smoke(frame < 2 ? frame / 2 : 1 + (frame - 2) / 12);
      return {
        ...pose,
        visible: frame >= 2,
        smoke: frame < 2 ? reveal : 0,
        particles: frame >= 2 ? reveal : 0,
      };
    }
    const direction = entering ? 'enter' : 'exit';
    return {
      ...pose,
      letterScales: {
        right: glyphs[`${direction}Right`](frame),
        left: glyphs[`${direction}Left`](frame),
      },
    };
  }

  return {
    lyricPose,
    layoutMix({ target, elapsedMs, durationMs }) {
      const { progress } = layout(
        Math.max(0, Math.min(1, elapsedMs / durationMs)),
      );
      return target === 1 ? progress : 1 - progress;
    },
    dispose() {
      for (const timeline of timelines) timeline.kill();
    },
  };
}
