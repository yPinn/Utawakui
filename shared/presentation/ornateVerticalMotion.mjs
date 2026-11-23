export const ORNATE_VERTICAL_ENTER_DURATION_SECONDS = 0.12;
export const ORNATE_VERTICAL_ENTER_EASE = 'power2.out';
export const ORNATE_VERTICAL_SHADOW_DURATION_SECONDS = 0.18;
export const ORNATE_VERTICAL_SHADOW_DISTANCE = '0.14em';

const SLIDE_DURATION_SECONDS = 0.3;
const SLIDE_OFFSETS = [
  [-0.66, 0],
  [0.52, 0],
  [-0.42, -0.18],
  [0.68, 0.12],
  [-0.52, 0.14],
  [0.43, -0.16],
];

export function ornateVerticalRevealDelaySeconds(
  index,
  unitCount,
  windowSeconds = Infinity,
  duration = ORNATE_VERTICAL_ENTER_DURATION_SECONDS,
) {
  const availableStagger = Math.max(
    0,
    Math.min(0.84, windowSeconds - duration),
  );
  const stagger = Math.min(0.12, availableStagger / Math.max(1, unitCount - 1));
  return Number((index * stagger).toFixed(4));
}

export function ornateVerticalRevealDelays(
  units,
  windowSeconds,
  focusFirst,
  duration,
) {
  const keyword = focusFirst
    ? units.findIndex(
        ({ kind, emphasis }) => kind === 'han' && emphasis === 'keyword',
      )
    : -1;
  const focus =
    focusFirst && keyword < 0
      ? units.findIndex(({ kind }) => kind === 'han')
      : keyword;
  return units.map((_, index) =>
    ornateVerticalRevealDelaySeconds(
      index === focus ? 0 : index < focus ? index + 1 : index,
      units.length,
      windowSeconds,
      duration,
    ),
  );
}

export function ornateVerticalEntrancePlan(columns, windowSeconds, mode, cue) {
  const slide = mode === 'random-slide';
  const duration = slide
    ? Math.max(0, Math.min(SLIDE_DURATION_SECONDS, windowSeconds))
    : ORNATE_VERTICAL_ENTER_DURATION_SECONDS;
  const delays = columns.flatMap((units) =>
    ornateVerticalRevealDelays(
      units,
      windowSeconds,
      mode === 'focus-first',
      duration,
    ),
  );
  if (!slide) return { duration, delays, offsets: null };

  // A cue uses the same paths after replay, reconnect, or a column rebuild.
  let seed = 2166136261;
  for (const character of cue)
    seed = Math.imul(seed ^ character.codePointAt(0), 16777619);
  const offsets = columns.flat().map(({ index }, order) => {
    const value = Math.imul(seed ^ (index ?? order), 0x9e3779b9) >>> 16;
    const [x, y] = SLIDE_OFFSETS[value % SLIDE_OFFSETS.length];
    return { x: `${x}em`, y: `${y}em` };
  });
  return { duration, delays, offsets };
}
