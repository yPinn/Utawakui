const BURST_DELAYS_SECONDS = Object.freeze([
  0.018, 0, 0.025, 0.006, 0.021, 0.003, 0.028, 0.009,
]);
const PUNCH_DELAYS_SECONDS = [
  0.052, 0, 0.034, 0.014, 0.048, 0.007, 0.041, 0.025,
];
const PUNCH_STAGES = [
  { seconds: 0, opacity: 0, scale: 0.25, x: -0.048, y: 0.115, turn: -5 },
  {
    seconds: 0.038,
    scale: 1.16,
    x: 0.035,
    y: -0.105,
    turn: 3.6,
    ease: 'power2.out',
  },
  {
    seconds: 0.028,
    scale: 0.938,
    x: -0.039,
    y: 0.072,
    turn: -2.2,
    ease: 'sine.inOut',
  },
  {
    seconds: 0.026,
    scale: 1.032,
    x: 0.017,
    y: -0.023,
    turn: 1.15,
    ease: 'sine.inOut',
  },
  { seconds: 0.039, scale: 1, x: 0, y: 0, turn: 0, ease: 'sine.out' },
];
export const KINETIC_POP_PUNCH_SECONDS =
  PUNCH_STAGES.reduce((sum, { seconds }) => sum + seconds, 0) +
  Math.max(...PUNCH_DELAYS_SECONDS);
const ENTER_POSES = Object.freeze([
  Object.freeze({ rotation: -5, scale: 0.78, x: 0, y: 14 }),
  Object.freeze({ rotation: 5, scale: 1.14, x: 0, y: -12 }),
]);
const STRAIGHT_REST_POSE = Object.freeze({
  rotation: 0,
  scale: 1,
  xEm: 0,
  yEm: 0,
});
const SUBTLE_REST_POSES = Object.freeze([
  Object.freeze({ rotation: -1.6, scale: 1.01, xEm: -0.02, yEm: 0.025 }),
  Object.freeze({ rotation: 1.3, scale: 0.99, xEm: 0.012, yEm: -0.02 }),
  Object.freeze({ rotation: -0.8, scale: 1.02, xEm: 0.022, yEm: 0.01 }),
  Object.freeze({ rotation: 1.8, scale: 0.985, xEm: -0.01, yEm: -0.032 }),
  Object.freeze({ rotation: -1.2, scale: 1.005, xEm: -0.024, yEm: 0.018 }),
  Object.freeze({ rotation: 0.7, scale: 1.018, xEm: 0.016, yEm: -0.012 }),
  Object.freeze({ rotation: 1.4, scale: 0.992, xEm: 0.006, yEm: 0.035 }),
  Object.freeze({ rotation: -0.6, scale: 1.012, xEm: -0.014, yEm: -0.025 }),
]);

function normalizedUnitIndex(index) {
  const numericIndex = Number(index);
  return Number.isFinite(numericIndex)
    ? Math.max(0, Math.trunc(numericIndex))
    : 0;
}

export function kineticPopBurstDelaySeconds(index) {
  return BURST_DELAYS_SECONDS[
    normalizedUnitIndex(index) % BURST_DELAYS_SECONDS.length
  ];
}

export function kineticPopEnterPose(index) {
  return ENTER_POSES[normalizedUnitIndex(index) % ENTER_POSES.length];
}

export function kineticPopPunchDelays(count, phase) {
  const start = normalizedUnitIndex(phase);
  const delays = Array.from(
    { length: count },
    (_, index) =>
      PUNCH_DELAYS_SECONDS[(index + start) % PUNCH_DELAYS_SECONDS.length],
  );
  const first = delays.reduce(
    (min, seconds) => Math.min(min, seconds),
    Infinity,
  );
  return delays.map((seconds) => seconds - first);
}

export function kineticPopPunchStages(index, phase, arrangement) {
  const rest = kineticPopRestPose(index, arrangement);
  const sign = normalizedUnitIndex(index + phase) % 2 ? -1 : 1;
  return PUNCH_STAGES.map(
    ({ seconds, opacity = 1, scale, x, y, turn, ease }) => ({
      seconds,
      ease,
      pose: {
        opacity,
        scale: rest.scale * (opacity === 0 && sign < 0 ? 0.36 : scale),
        x: `${rest.xEm + x * sign}em`,
        y: `${rest.yEm + y * sign}em`,
        rotation: rest.rotation + turn * sign,
      },
    }),
  );
}

export function kineticPopRestPose(index, arrangement = 'straight') {
  if (arrangement !== 'subtle-offset') return STRAIGHT_REST_POSE;
  return SUBTLE_REST_POSES[
    normalizedUnitIndex(index) % SUBTLE_REST_POSES.length
  ];
}
