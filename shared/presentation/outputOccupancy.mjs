// Geometry uses fractions of the capture width and height.
export function outputOccupancyBounds(geometry) {
  const { x, y, width, height } = geometry ?? {};
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1 ||
    width <= 0 ||
    width > 1 ||
    height <= 0 ||
    height > 1
  )
    return null;

  return {
    left: Math.max(0, x - width / 2),
    top: Math.max(0, y - height / 2),
    right: Math.min(1, x + width / 2),
    bottom: Math.min(1, y + height / 2),
  };
}

export function outputBoxesOverlap(a, b) {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

export function shiftOutputBox(box, shift) {
  return { ...box, left: box.left + shift, right: box.right + shift };
}

export function nearestOutputInlineClearance(box, obstacles, gap) {
  const candidates = obstacles.flatMap((obstacle) => [
    obstacle.left - box.right - gap,
    obstacle.right - box.left + gap,
  ]);
  candidates.sort((a, b) => Math.abs(a) - Math.abs(b));
  return candidates.find((shift) => {
    const moved = shiftOutputBox(box, shift);
    return (
      moved.left >= gap &&
      moved.right <= 1 - gap &&
      obstacles.every((obstacle) => !outputBoxesOverlap(moved, obstacle))
    );
  });
}
