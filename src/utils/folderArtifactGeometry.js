import {
  clampBoundedSurfacePosition,
  getBoundedSurfaceAnchor,
  getBoundedSurfacePositionBounds,
  getBoundedSurfaceVisualBounds,
  moveBoundedSurfaceFromKeyboard,
  projectBoundedSurfacePosition,
} from './boundedSurfaceGeometry.js';

export const getFolderArtifactVisualBounds = getBoundedSurfaceVisualBounds;
export const clampFolderArtifactPosition = clampBoundedSurfacePosition;

const PLACEMENT_REGIONS = new Set(['paper', 'side', 'bottom']);

function finiteRectangle(value = {}) {
  return {
    x: Number.isFinite(value.x) ? value.x : 0,
    y: Number.isFinite(value.y) ? value.y : 0,
    width: Number.isFinite(value.width) ? Math.max(0, value.width) : 0,
    height: Number.isFinite(value.height) ? Math.max(0, value.height) : 0,
  };
}

function insetRectangle(value, inset = 0) {
  const rectangle = finiteRectangle(value);
  const boundedInset = Math.min(
    Math.max(0, Number.isFinite(inset) ? inset : 0),
    rectangle.width / 2,
    rectangle.height / 2,
  );
  return {
    x: rectangle.x + boundedInset,
    y: rectangle.y + boundedInset,
    width: Math.max(0, rectangle.width - boundedInset * 2),
    height: Math.max(0, rectangle.height - boundedInset * 2),
  };
}

function normalizedPlacement(value) {
  if (!value || !PLACEMENT_REGIONS.has(value.region)) return null;
  if (
    !value.anchor ||
    !Number.isFinite(value.anchor.x) ||
    !Number.isFinite(value.anchor.y)
  ) {
    return null;
  }
  return {
    region: value.region,
    anchor: {
      x: Math.min(1, Math.max(0, value.anchor.x)),
      y: Math.min(1, Math.max(0, value.anchor.y)),
    },
  };
}

function regionGeometry(region, options) {
  const rectangle = insetRectangle(region, options.regionInset);
  return {
    rectangle,
    geometry: {
      itemSize: options.itemSize,
      canvasSize: { width: rectangle.width, height: rectangle.height },
      minimumVisibleSize: options.minimumVisibleSize,
      rotation: options.rotation,
    },
  };
}

function localPosition(position, rectangle) {
  return {
    x: (Number.isFinite(position?.x) ? position.x : 0) - rectangle.x,
    y: (Number.isFinite(position?.y) ? position.y : 0) - rectangle.y,
  };
}

function globalPosition(position, rectangle) {
  return { x: position.x + rectangle.x, y: position.y + rectangle.y };
}

function fallbackBottomAnchor(anchor, index = 0, count = 1) {
  const orderRatio = count > 1 ? index / (count - 1) : anchor.y;
  return {
    x: Math.min(1, Math.max(0, anchor.y * 0.7 + orderRatio * 0.3)),
    y: Math.min(1, Math.max(0, anchor.x)),
  };
}

function geometryOptions({
  itemSize,
  canvasSize,
  minimumVisibleSize,
  rotation,
} = {}) {
  return { itemSize, canvasSize, minimumVisibleSize, rotation };
}

export function getFolderArtifactPositionBounds(options = {}) {
  const { itemSize, canvasSize, minimumVisibleSize, rotation } =
    geometryOptions(options);
  return getBoundedSurfacePositionBounds(
    itemSize,
    canvasSize,
    minimumVisibleSize,
    rotation,
  );
}

export function projectFolderArtifactPosition(anchor, options = {}) {
  const { itemSize, canvasSize, minimumVisibleSize, rotation } =
    geometryOptions(options);
  return projectBoundedSurfacePosition(
    anchor,
    itemSize,
    canvasSize,
    minimumVisibleSize,
    rotation,
  );
}

export function getFolderArtifactAnchor(position, options = {}) {
  const { itemSize, canvasSize, minimumVisibleSize, rotation } =
    geometryOptions(options);
  return getBoundedSurfaceAnchor(
    position,
    itemSize,
    canvasSize,
    minimumVisibleSize,
    rotation,
  );
}

export function getFolderArtifactPlacement(position, options = {}) {
  const regions = options.regions ?? {};
  const paper = finiteRectangle(regions.paper);
  const side = finiteRectangle(regions.side);
  const bottom = finiteRectangle(regions.bottom);
  const center = {
    x:
      (Number.isFinite(position?.x) ? position.x : 0) +
      (Number.isFinite(options.itemSize?.width)
        ? options.itemSize.width / 2
        : 0),
    y:
      (Number.isFinite(position?.y) ? position.y : 0) +
      (Number.isFinite(options.itemSize?.height)
        ? options.itemSize.height / 2
        : 0),
  };
  let regionName = 'paper';
  if (bottom.height > 0 && center.y >= bottom.y) regionName = 'bottom';
  else if (side.width > 0 && center.x >= side.x) regionName = 'side';
  const selected = regions[regionName] ?? paper;
  const { rectangle, geometry } = regionGeometry(selected, options);
  return {
    region: regionName,
    anchor: getFolderArtifactAnchor(
      localPosition(position, rectangle),
      geometry,
    ),
  };
}

export function folderArtifactFitsSideRegion(options = {}) {
  const side = finiteRectangle(options.regions?.side);
  const inset = Math.max(
    0,
    Number.isFinite(options.regionInset) ? options.regionInset : 0,
  );
  const visual = getFolderArtifactVisualBounds(
    options.itemSize,
    options.rotation,
  );
  return side.width >= visual.width + inset * 2;
}

export function projectFolderArtifactPlacement(placementValue, options = {}) {
  const placement = normalizedPlacement(placementValue) ?? {
    region: 'paper',
    anchor: { x: 0, y: 0 },
  };
  const canUseSide =
    options.sideAvailable ?? folderArtifactFitsSideRegion(options);
  const regionName =
    placement.region === 'side' && !canUseSide ? 'bottom' : placement.region;
  const anchor =
    placement.region === 'side' && regionName === 'bottom'
      ? fallbackBottomAnchor(
          placement.anchor,
          options.fallbackIndex,
          options.fallbackCount,
        )
      : placement.anchor;
  const selected = options.regions?.[regionName] ?? {
    x: 0,
    y: 0,
    width: options.canvasSize?.width,
    height: options.canvasSize?.height,
  };
  const { rectangle, geometry } = regionGeometry(selected, options);
  const projected = projectFolderArtifactPosition(anchor, geometry);
  return {
    region: regionName,
    position: globalPosition(projected, rectangle),
  };
}

export function moveFolderArtifactFromKeyboard(
  position,
  key,
  accelerated,
  { itemSize, canvasSize, minimumVisibleSize, rotation } = {},
) {
  return moveBoundedSurfaceFromKeyboard(position, key, accelerated, {
    itemSize,
    containerSize: canvasSize,
    minimumVisibleSize,
    rotation,
  });
}
