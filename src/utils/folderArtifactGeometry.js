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
