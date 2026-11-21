import OUTPUT_CAPTURE_VALUES from '../../shared/outputCaptureValues.json';
import { DEFAULT_MANGA_TAIL_TARGET } from '../../shared/presentation/mangaFrameContract.mjs';
import {
  OUTPUT_COMPOSITION_LINES,
  OUTPUT_GUIDE_RELEASE_DISTANCE,
  closestOutputAlignment,
} from './outputAlignmentGuides.js';

const { width: canvasWidth, height: canvasHeight } =
  OUTPUT_CAPTURE_VALUES.lyricsSize;
const CANVAS_ASPECT = canvasWidth / canvasHeight;

export const PERFORMER_GUIDE_SHAPES = Object.freeze({
  circle: { radius: '50%', ratio: [1, 1] },
  square: { radius: '0', ratio: [1, 1] },
  ellipse: { radius: '50%', ratio: [3, 4] },
  roundedRectangle: { radius: '14%', ratio: [5, 8] },
  rectangle: { radius: '0', ratio: [9, 16] },
});

function shapeAspect(shape) {
  const [width, height] = PERFORMER_GUIDE_SHAPES[shape].ratio;
  return width / height;
}

const DEFAULT_HEIGHT = 0.84;
export const DEFAULT_PERFORMER_GUIDE = Object.freeze({
  shape: 'ellipse',
  ...DEFAULT_MANGA_TAIL_TARGET,
  width: (DEFAULT_HEIGHT * shapeAspect('ellipse')) / CANVAS_ASPECT,
  height: DEFAULT_HEIGHT,
});

export const PERFORMER_GUIDE_MIN_SIZE = 0.08;

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

export function isPerformerGuideSizeLocked(shape) {
  return shape === 'circle' || shape === 'square';
}

function normalizeShape(shape) {
  return typeof shape === 'string' &&
    Object.hasOwn(PERFORMER_GUIDE_SHAPES, shape)
    ? shape
    : DEFAULT_PERFORMER_GUIDE.shape;
}

export function normalizePerformerGuide(value, sizeAxis) {
  const shape = normalizeShape(value?.shape);
  const read = (key) =>
    Number.isFinite(value?.[key]) ? value[key] : DEFAULT_PERFORMER_GUIDE[key];
  let width = clamp(read('width'), PERFORMER_GUIDE_MIN_SIZE, 1);
  let height = clamp(read('height'), PERFORMER_GUIDE_MIN_SIZE, 1);
  if (isPerformerGuideSizeLocked(shape)) {
    // Width and height are fractions of different canvas axes.
    if (
      sizeAxis === 'height' ||
      (sizeAxis !== 'width' && height < width * CANVAS_ASPECT)
    ) {
      width = height / CANVAS_ASPECT;
    }
    width = clamp(width, PERFORMER_GUIDE_MIN_SIZE, 1 / CANVAS_ASPECT);
    height = width * CANVAS_ASPECT;
  }
  return {
    shape,
    x: clamp(read('x'), width / 2, 1 - width / 2),
    y: clamp(read('y'), height / 2, 1 - height / 2),
    width,
    height,
  };
}

export function applyPerformerGuideShape(guide, nextShape) {
  const shape = normalizeShape(nextShape);
  if (shape === guide.shape) return guide;

  const aspect = shapeAspect(shape) / CANVAS_ASPECT;
  const width = Math.max(PERFORMER_GUIDE_MIN_SIZE, guide.height * aspect);
  return normalizePerformerGuide({
    ...guide,
    shape,
    width,
    height: width / aspect,
  });
}

export function performerGuideStyle({ shape, x, y, width, height }) {
  return {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${width * 100}%`,
    height: `${height * 100}%`,
    borderRadius: PERFORMER_GUIDE_SHAPES[normalizeShape(shape)].radius,
  };
}

export function performerGuideCrop({ shape, width, height }) {
  return {
    aspect: (width * CANVAS_ASPECT) / height,
    radius: PERFORMER_GUIDE_SHAPES[normalizeShape(shape)].radius,
  };
}

function oppositeEdge(center, size, direction) {
  return center - (size * direction) / 2;
}

function availableSize(edge, direction) {
  return direction > 0 ? 1 - edge : edge;
}

export function dragPerformerGuide(guide, handle, delta, canvasAspect) {
  const [horizontal, vertical] = handle;
  if (!horizontal && !vertical) {
    return normalizePerformerGuide({
      ...guide,
      x: guide.x + delta.x,
      y: guide.y + delta.y,
    });
  }
  if (isPerformerGuideSizeLocked(guide.shape) && !(horizontal && vertical)) {
    return guide;
  }

  const anchorX = oppositeEdge(guide.x, guide.width, horizontal);
  const anchorY = oppositeEdge(guide.y, guide.height, vertical);
  let { width, height } = guide;

  if (horizontal && vertical) {
    // Project the pointer delta onto the rendered diagonal. The opposite
    // corner stays anchored while both dimensions use the same scale.
    const diagonalX = width * canvasAspect * horizontal;
    const diagonalY = height * vertical;
    const scale =
      1 +
      (delta.x * canvasAspect * diagonalX + delta.y * diagonalY) /
        (diagonalX ** 2 + diagonalY ** 2);
    const boundedScale = clamp(
      scale,
      Math.max(
        PERFORMER_GUIDE_MIN_SIZE / width,
        PERFORMER_GUIDE_MIN_SIZE / height,
      ),
      Math.min(
        availableSize(anchorX, horizontal) / width,
        availableSize(anchorY, vertical) / height,
      ),
    );
    width *= boundedScale;
    height *= boundedScale;
  } else if (horizontal) {
    width = clamp(
      width + delta.x * horizontal,
      PERFORMER_GUIDE_MIN_SIZE,
      availableSize(anchorX, horizontal),
    );
  } else {
    height = clamp(
      height + delta.y * vertical,
      PERFORMER_GUIDE_MIN_SIZE,
      availableSize(anchorY, vertical),
    );
  }

  return normalizePerformerGuide({
    shape: guide.shape,
    x: anchorX + (width * horizontal) / 2,
    y: anchorY + (height * vertical) / 2,
    width,
    height,
  });
}

const CANVAS_LINES = [0, ...OUTPUT_COMPOSITION_LINES, 1];
const EPSILON = 1e-9;

function snapMovingAxis(center, size, screenSize, previous) {
  const half = size / 2;
  const candidates = [];
  // In a tie, prefer the center unless an edge is already engaged.
  for (const anchor of [-1, 1, 0]) {
    for (const line of CANVAS_LINES) {
      const position = line - anchor * half;
      if (position < half - EPSILON || position > 1 - half + EPSILON) continue;
      candidates.push({
        line,
        anchor,
        center: clamp(position, half, 1 - half),
      });
    }
  }
  return closestOutputAlignment(
    candidates,
    (candidate) => Math.abs(candidate.center - center) * screenSize,
    candidates.find(
      ({ line, anchor }) =>
        line === previous?.line && anchor === previous?.anchor,
    ),
  );
}

function snapResizeEdge(guide, handle, viewport, axis, previous) {
  const horizontal = axis === 'x';
  const direction = handle[horizontal ? 0 : 1];
  if (!direction) return null;

  const size = horizontal ? 'width' : 'height';
  const edge = guide[axis] + (guide[size] * direction) / 2;
  const corner = handle[0] && handle[1];
  const candidates = [];
  for (const line of CANVAS_LINES) {
    const offset = line - edge;
    const distance = Math.abs(offset) * viewport[size];
    if (distance > OUTPUT_GUIDE_RELEASE_DISTANCE) continue;

    const scaleChange = offset / (guide[size] * direction);
    const delta = corner
      ? {
          x: guide.width * handle[0] * scaleChange,
          y: guide.height * handle[1] * scaleChange,
        }
      : { x: 0, y: 0, [axis]: offset };
    const next = dragPerformerGuide(
      guide,
      handle,
      delta,
      viewport.width / viewport.height,
    );
    // The resize may stop early at the minimum size or the other canvas edge.
    if (Math.abs(next[axis] + (next[size] * direction) / 2 - line) <= EPSILON) {
      candidates.push({ line, distance, guide: next });
    }
  }
  return closestOutputAlignment(
    candidates,
    ({ distance }) => distance,
    candidates.find(({ line }) => line === previous?.line),
  );
}

export function snapPerformerGuide(guide, handle, viewport, previous = {}) {
  if (!handle[0] && !handle[1]) {
    const x = snapMovingAxis(guide.x, guide.width, viewport.width, previous.x);
    const y = snapMovingAxis(
      guide.y,
      guide.height,
      viewport.height,
      previous.y,
    );
    return {
      guide: { ...guide, x: x?.center ?? guide.x, y: y?.center ?? guide.y },
      matches: {
        x: x && { line: x.line, anchor: x.anchor },
        y: y && { line: y.line, anchor: y.anchor },
      },
    };
  }

  const x = snapResizeEdge(guide, handle, viewport, 'x', previous.x);
  const y = snapResizeEdge(guide, handle, viewport, 'y', previous.y);
  // A corner is constrained to one scale. Keep its previous guide, or use
  // the nearer edge when neither guide was active before.
  let primary = x ?? y;
  if (
    x &&
    y &&
    x.line !== previous.x?.line &&
    (y.line === previous.y?.line || y.distance < x.distance)
  )
    primary = y;
  if (!primary) return { guide, matches: { x: null, y: null } };

  const next = primary.guide;
  const edgeX = next.x + (next.width * handle[0]) / 2;
  const edgeY = next.y + (next.height * handle[1]) / 2;
  return {
    guide: next,
    matches: {
      x:
        x && Math.abs(edgeX - x.line) <= EPSILON
          ? { line: x.line, anchor: handle[0] }
          : null,
      y:
        y && Math.abs(edgeY - y.line) <= EPSILON
          ? { line: y.line, anchor: handle[1] }
          : null,
    },
  };
}
