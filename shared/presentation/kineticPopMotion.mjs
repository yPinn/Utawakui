const BURST_DELAYS_SECONDS = Object.freeze([
  0.018, 0, 0.025, 0.006, 0.021, 0.003, 0.028, 0.009,
]);
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

export function kineticPopRestPose(index, arrangement = 'straight') {
  if (arrangement !== 'subtle-offset') return STRAIGHT_REST_POSE;
  return SUBTLE_REST_POSES[
    normalizedUnitIndex(index) % SUBTLE_REST_POSES.length
  ];
}
