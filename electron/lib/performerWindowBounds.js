'use strict';

const DEFAULT_PERFORMER_WINDOW_BOUNDS = Object.freeze({
  width: 960,
  height: 540,
});
const MIN_PERFORMER_WINDOW_BOUNDS = Object.freeze({
  width: 800,
  height: 360,
});
const PERFORMER_WINDOW_WORK_AREA_MARGIN = 32;
const PERFORMER_WINDOW_COORDINATE_LIMIT = 1_000_000;
const PERFORMER_WINDOW_SIZE_LIMIT = 16_384;

function isBoundedInteger(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function normalizePerformerWindowBounds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (
    !isBoundedInteger(
      value.x,
      -PERFORMER_WINDOW_COORDINATE_LIMIT,
      PERFORMER_WINDOW_COORDINATE_LIMIT,
    ) ||
    !isBoundedInteger(
      value.y,
      -PERFORMER_WINDOW_COORDINATE_LIMIT,
      PERFORMER_WINDOW_COORDINATE_LIMIT,
    ) ||
    !isBoundedInteger(
      value.width,
      MIN_PERFORMER_WINDOW_BOUNDS.width,
      PERFORMER_WINDOW_SIZE_LIMIT,
    ) ||
    !isBoundedInteger(
      value.height,
      MIN_PERFORMER_WINDOW_BOUNDS.height,
      PERFORMER_WINDOW_SIZE_LIMIT,
    )
  ) {
    return null;
  }
  return {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  };
}

function normalizeWorkArea(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.width) ||
    !Number.isFinite(value.height) ||
    value.width <= 0 ||
    value.height <= 0
  ) {
    return null;
  }
  return {
    x: Math.round(value.x),
    y: Math.round(value.y),
    width: Math.round(value.width),
    height: Math.round(value.height),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function fitPerformerWindowBounds(value, workAreaValue) {
  const stored = normalizePerformerWindowBounds(value);
  const candidate = stored ?? DEFAULT_PERFORMER_WINDOW_BOUNDS;
  const workArea = normalizeWorkArea(workAreaValue);
  if (!workArea) return { ...candidate };

  const availableWidth = Math.max(
    MIN_PERFORMER_WINDOW_BOUNDS.width,
    workArea.width - PERFORMER_WINDOW_WORK_AREA_MARGIN * 2,
  );
  const availableHeight = Math.max(
    MIN_PERFORMER_WINDOW_BOUNDS.height,
    workArea.height - PERFORMER_WINDOW_WORK_AREA_MARGIN * 2,
  );
  const width = clamp(
    candidate.width,
    MIN_PERFORMER_WINDOW_BOUNDS.width,
    availableWidth,
  );
  const height = clamp(
    candidate.height,
    MIN_PERFORMER_WINDOW_BOUNDS.height,
    availableHeight,
  );
  const horizontalRoom = Math.max(0, workArea.width - width);
  const verticalRoom = Math.max(0, workArea.height - height);

  if (!stored) {
    return {
      x: workArea.x + Math.floor(horizontalRoom / 2),
      y: workArea.y + Math.floor(verticalRoom / 2),
      width,
      height,
    };
  }

  const horizontalMargin = Math.min(
    PERFORMER_WINDOW_WORK_AREA_MARGIN,
    Math.floor(horizontalRoom / 2),
  );
  const verticalMargin = Math.min(
    PERFORMER_WINDOW_WORK_AREA_MARGIN,
    Math.floor(verticalRoom / 2),
  );
  return {
    x: clamp(
      stored.x,
      workArea.x + horizontalMargin,
      workArea.x + horizontalRoom - horizontalMargin,
    ),
    y: clamp(
      stored.y,
      workArea.y + verticalMargin,
      workArea.y + verticalRoom - verticalMargin,
    ),
    width,
    height,
  };
}

module.exports = {
  DEFAULT_PERFORMER_WINDOW_BOUNDS,
  MIN_PERFORMER_WINDOW_BOUNDS,
  PERFORMER_WINDOW_WORK_AREA_MARGIN,
  fitPerformerWindowBounds,
  normalizePerformerWindowBounds,
};
