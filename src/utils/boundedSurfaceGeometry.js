const DEFAULT_MINIMUM_VISIBLE_SIZE = 48;
const KEYBOARD_STEP = 8;
const KEYBOARD_LARGE_STEP = 24;

function finiteNonNegative(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finiteCoordinate(value) {
  return Number.isFinite(value) ? value : 0;
}

function normalizedTrigonometricValue(value) {
  if (Math.abs(value) < Number.EPSILON * 8) return 0;
  if (Math.abs(1 - Math.abs(value)) < Number.EPSILON * 8) {
    return Math.sign(value);
  }
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function axisRange(itemLength, containerLength, minimumVisible) {
  if (itemLength <= containerLength) {
    return { minimum: 0, maximum: containerLength - itemLength };
  }

  const visible = Math.min(itemLength, containerLength, minimumVisible);
  return {
    minimum: visible - itemLength,
    maximum: containerLength - visible,
  };
}

export function getBoundedSurfaceVisualBounds(itemSize, rotation = 0) {
  const width = finiteNonNegative(itemSize?.width);
  const height = finiteNonNegative(itemSize?.height);
  const degrees = Number.isFinite(rotation) ? rotation % 360 : 0;
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.abs(normalizedTrigonometricValue(Math.cos(radians)));
  const sine = Math.abs(normalizedTrigonometricValue(Math.sin(radians)));
  const visualWidth = width * cosine + height * sine;
  const visualHeight = width * sine + height * cosine;

  return {
    width: visualWidth,
    height: visualHeight,
    offsetX: (width - visualWidth) / 2,
    offsetY: (height - visualHeight) / 2,
  };
}

export function clampBoundedSurfacePosition(
  position,
  itemSize,
  containerSize,
  minimumVisibleSize = DEFAULT_MINIMUM_VISIBLE_SIZE,
  rotation = 0,
) {
  const containerWidth = finiteNonNegative(containerSize?.width);
  const containerHeight = finiteNonNegative(containerSize?.height);
  const minimumVisible = finiteNonNegative(minimumVisibleSize);
  const visualBounds = getBoundedSurfaceVisualBounds(itemSize, rotation);
  const horizontal = axisRange(
    visualBounds.width,
    containerWidth,
    minimumVisible,
  );
  const vertical = axisRange(
    visualBounds.height,
    containerHeight,
    minimumVisible,
  );
  const visualX = finiteCoordinate(position?.x) + visualBounds.offsetX;
  const visualY = finiteCoordinate(position?.y) + visualBounds.offsetY;

  return {
    x:
      clamp(visualX, horizontal.minimum, horizontal.maximum) -
      visualBounds.offsetX,
    y:
      clamp(visualY, vertical.minimum, vertical.maximum) - visualBounds.offsetY,
  };
}

export function moveBoundedSurfaceFromKeyboard(
  position,
  key,
  accelerated,
  { itemSize, containerSize, minimumVisibleSize, rotation } = {},
) {
  const distance = accelerated ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
  const deltas = {
    ArrowDown: { x: 0, y: distance },
    ArrowLeft: { x: -distance, y: 0 },
    ArrowRight: { x: distance, y: 0 },
    ArrowUp: { x: 0, y: -distance },
  };
  const delta = deltas[key];
  if (!delta) return null;

  return clampBoundedSurfacePosition(
    {
      x: finiteCoordinate(position?.x) + delta.x,
      y: finiteCoordinate(position?.y) + delta.y,
    },
    itemSize,
    containerSize,
    minimumVisibleSize,
    rotation,
  );
}
