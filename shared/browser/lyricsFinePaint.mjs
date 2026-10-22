const animations = new WeakMap();

export function cancelLyricsFinePaint(element) {
  animations.get(element)?.cancel?.();
  animations.delete(element);
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
  } = {},
) {
  cancelLyricsFinePaint(element);
  if (
    !unit ||
    !Number.isFinite(unit.startMs) ||
    !Number.isFinite(unit.endMs) ||
    unit.endMs <= unit.startMs
  )
    return;
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
  element.style.setProperty('--lyrics-fine-progress', `${progress * 100}%`);
  if (
    !clock.playing ||
    reducedMotion ||
    position >= end ||
    typeof element.animate !== 'function'
  )
    return;
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
  if (animation) animations.set(element, animation);
}
