import {
  clampBoundedSurfacePosition,
  getBoundedSurfaceVisualBounds,
  moveBoundedSurfaceFromKeyboard,
} from './boundedSurfaceGeometry.js';

export const getFolderArtifactVisualBounds = getBoundedSurfaceVisualBounds;
export const clampFolderArtifactPosition = clampBoundedSurfacePosition;

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
