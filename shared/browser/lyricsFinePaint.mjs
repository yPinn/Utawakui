const animations = new WeakMap();

export function cancelLyricsFinePaint(element, cost) {
  const started = cost?.now();
  const state = animations.get(element);
  state?.animation.cancel?.();
  animations.delete(element);
  if (cost) {
    if (state) cost.fineCancels++;
    cost.fineCancelMs += cost.now() - started;
  }
}

// Paint consumes a sampled media clock. No geometry, global tick or IPC.
export function paintLyricsFineUnit(
  element,
  unit,
  clock,
  {
    nowMs = Date.now(),
    reducedMotion = false,
    paintFrom = 0,
    paintTo = 1,
    cost,
    reuse = false,
  } = {},
) {
  if (
    !unit ||
    !Number.isFinite(unit.startMs) ||
    !Number.isFinite(unit.endMs) ||
    unit.endMs <= unit.startMs
  ) {
    cancelLyricsFinePaint(element, cost);
    return;
  }
  const rate = Number.isFinite(clock.rate) && clock.rate > 0 ? clock.rate : 1;
  const sampledAt = Number.isFinite(clock.sampledAtMs)
    ? clock.sampledAtMs
    : nowMs;
  const advanceAt = Number.isFinite(clock.advanceAtMs)
    ? Math.max(sampledAt, clock.advanceAtMs)
    : sampledAt;
  const hold = clock.playing ? Math.max(0, advanceAt - nowMs) : 0;
  const elapsed =
    clock.playing && Number.isFinite(clock.sampledAtMs)
      ? Math.max(0, nowMs - advanceAt) * rate
      : 0;
  const position = clock.positionMs + elapsed;
  // A multi-glyph model unit may wrap. Paint cells interpolate that one unit's
  // visual progress in reading order, without claiming new alignment times.
  const duration = unit.endMs - unit.startMs;
  const start = unit.startMs + duration * paintFrom;
  const end = unit.startMs + duration * paintTo;
  const progress = Math.min(1, Math.max(0, (position - start) / (end - start)));
  const canAnimate =
    clock.playing &&
    !reducedMotion &&
    position < end &&
    typeof element.animate === 'function';
  const previous = animations.get(element);
  const delta = previous ? (advanceAt - previous.advanceAt) * rate : NaN;
  const sameHold =
    previous &&
    ((advanceAt <= nowMs && previous.advanceAt <= nowMs) ||
      (advanceAt === previous.advanceAt &&
        clock.positionMs === previous.positionMs));
  // Only floating-point equality, never a visual drift/deadband allowance.
  const precision =
    Number.EPSILON *
    Math.max(
      1,
      Math.abs(clock.positionMs),
      Math.abs(previous?.positionMs ?? 0),
      Math.abs(delta),
    ) *
    8;
  if (
    reuse &&
    canAnimate &&
    Number.isFinite(clock.sampledAtMs) &&
    previous &&
    previous.sampled &&
    sameHold &&
    previous.unitId === unit.unitId &&
    previous.start === start &&
    previous.end === end &&
    previous.rate === rate &&
    !['idle', 'paused', 'finished'].includes(previous.animation.playState) &&
    Math.abs(clock.positionMs - previous.positionMs - delta) <= precision
  ) {
    if (cost) cost.fineReuses++;
    return;
  }
  cancelLyricsFinePaint(element, cost);
  const styleStarted = cost?.now();
  element.style.setProperty('--lyrics-fine-progress', `${progress * 100}%`);
  if (cost) cost.fineStyleMs += cost.now() - styleStarted;
  if (!canAnimate) return;
  const animateStarted = cost?.now();
  const animation = element.animate(
    [
      { '--lyrics-fine-progress': `${progress * 100}%` },
      { '--lyrics-fine-progress': '100%' },
    ],
    {
      delay: hold + Math.max(0, (start - position) / rate),
      duration: (end - Math.max(position, start)) / rate,
      easing: 'linear',
      fill: 'forwards',
    },
  );
  if (cost) {
    cost.fineCreates++;
    cost.fineAnimateMs += cost.now() - animateStarted;
  }
  if (animation)
    animations.set(element, {
      animation,
      unitId: unit.unitId,
      start,
      end,
      rate,
      positionMs: clock.positionMs,
      advanceAt,
      sampled: Number.isFinite(clock.sampledAtMs),
    });
}
