export const OUTPUT_COMPOSITION_LINES = Object.freeze([0.5, 1 / 3, 2 / 3]);
export const OUTPUT_GUIDE_RELEASE_DISTANCE = 11;

export function closestOutputAlignment(candidates, distance, previous) {
  // A slightly wider release distance keeps the line steady during slow drags.
  if (previous && distance(previous) <= OUTPUT_GUIDE_RELEASE_DISTANCE) {
    return previous;
  }
  let nearest = null;
  let nearby = 7;
  for (const candidate of candidates) {
    const pixels = distance(candidate);
    if (pixels > nearby) continue;
    nearby = pixels;
    nearest = candidate;
  }
  return nearest;
}
