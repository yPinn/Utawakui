let measurementSequence = 0;

export function measureInteractionToNextPaint(
  name,
  action,
  {
    enabled = import.meta.env.DEV,
    performanceTarget = globalThis.performance,
    requestFrame = globalThis.requestAnimationFrame,
  } = {},
) {
  if (
    !enabled ||
    typeof action !== 'function' ||
    typeof requestFrame !== 'function' ||
    typeof performanceTarget?.mark !== 'function' ||
    typeof performanceTarget?.measure !== 'function'
  ) {
    return action();
  }

  measurementSequence += 1;
  const instance = measurementSequence;
  const startMark = `${name}:start:${instance}`;
  const endMark = `${name}:end:${instance}`;
  performanceTarget.mark(startMark);

  let result;
  try {
    result = action();
  } catch (error) {
    performanceTarget.clearMarks?.(startMark);
    throw error;
  }

  // The browser paints after the first callback. The second callback marks
  // the first frame for which the interaction's committed pixels were
  // eligible to have reached the screen.
  requestFrame(() => {
    requestFrame(() => {
      performanceTarget.mark(endMark);
      performanceTarget.clearMeasures?.(name);
      performanceTarget.measure(name, startMark, endMark);
      performanceTarget.clearMarks?.(startMark);
      performanceTarget.clearMarks?.(endMark);
    });
  });

  return result;
}
