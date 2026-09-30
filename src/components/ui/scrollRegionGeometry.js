function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getOverlayThumbGeometry({
  viewportSize,
  contentSize,
  scrollOffset,
  trackSize,
  minThumbSize,
  maxThumbSize,
}) {
  const viewport = finiteNonNegative(viewportSize);
  const content = finiteNonNegative(contentSize);
  const track = finiteNonNegative(trackSize);
  const minimum = finiteNonNegative(minThumbSize);
  const requestedMaximum = finiteNonNegative(maxThumbSize);
  const maxScroll = Math.max(0, content - viewport);

  if (viewport <= 0 || track <= 0 || maxScroll <= 1) {
    return {
      visible: false,
      length: 0,
      offset: 0,
      maxScroll: 0,
      travel: 0,
    };
  }

  const maximum = requestedMaximum > 0 ? requestedMaximum : track;
  const length = Math.min(
    track,
    Math.max(minimum, Math.min(maximum, track * (viewport / content))),
  );
  const travel = Math.max(0, track - length);
  const progress =
    clamp(finiteNonNegative(scrollOffset), 0, maxScroll) / maxScroll;

  return {
    visible: true,
    length,
    offset: travel * progress,
    maxScroll,
    travel,
  };
}

export function getScrollOffsetFromThumbDelta({
  startScrollOffset,
  delta,
  maxScroll,
  travel,
}) {
  const maximum = finiteNonNegative(maxScroll);
  const thumbTravel = finiteNonNegative(travel);
  const start = clamp(finiteNonNegative(startScrollOffset), 0, maximum);
  const pointerDelta = Number.isFinite(Number(delta)) ? Number(delta) : 0;

  if (maximum === 0 || thumbTravel === 0) return start;
  return clamp(start + (pointerDelta / thumbTravel) * maximum, 0, maximum);
}
