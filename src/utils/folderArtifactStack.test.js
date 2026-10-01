import { describe, expect, it } from 'vitest';
import {
  getFolderArtifactStackLayoutVariant,
  getFolderArtifactStackLayers,
  nextFolderArtifactStackIndex,
  normalizeFolderArtifactStackIndex,
  previousFolderArtifactStackIndex,
} from './folderArtifactStack.js';

const images = [
  { src: '/first.jpg', alt: '第一張' },
  { src: '/second.jpg', alt: '第二張' },
  { src: '/third.jpg', alt: '第三張' },
];

describe('folderArtifactStack', () => {
  it('normalizes invalid, negative, and overflowing indexes', () => {
    expect(normalizeFolderArtifactStackIndex(0, 0)).toBe(0);
    expect(normalizeFolderArtifactStackIndex(Number.NaN, 3)).toBe(0);
    expect(normalizeFolderArtifactStackIndex(-1, 3)).toBe(2);
    expect(normalizeFolderArtifactStackIndex(4, 3)).toBe(1);
  });

  it('cycles to the next image and wraps at the end', () => {
    expect(nextFolderArtifactStackIndex(0, 3)).toBe(1);
    expect(nextFolderArtifactStackIndex(2, 3)).toBe(0);
    expect(nextFolderArtifactStackIndex(0, 1)).toBe(0);
  });

  it('cycles to the previous image and wraps at the beginning', () => {
    expect(previousFolderArtifactStackIndex(2, 3)).toBe(1);
    expect(previousFolderArtifactStackIndex(0, 3)).toBe(2);
    expect(previousFolderArtifactStackIndex(0, 1)).toBe(0);
  });

  it('keeps only the previous and current photos visible with current in front', () => {
    expect(getFolderArtifactStackLayers(images, 1)).toEqual([
      { image: images[0], index: 0, layer: 'back' },
      { image: images[1], index: 1, layer: 'front' },
    ]);
  });

  it('assigns a stable layout variant from the normalized active image', () => {
    expect(getFolderArtifactStackLayoutVariant(0, 4)).toBe(0);
    expect(getFolderArtifactStackLayoutVariant(1, 4)).toBe(1);
    expect(getFolderArtifactStackLayoutVariant(2, 4)).toBe(2);
    expect(getFolderArtifactStackLayoutVariant(3, 4)).toBe(3);
    expect(getFolderArtifactStackLayoutVariant(4, 4)).toBe(0);
    expect(getFolderArtifactStackLayoutVariant(-1, 4)).toBe(3);
    expect(getFolderArtifactStackLayoutVariant(8, 1)).toBe(0);
    expect(getFolderArtifactStackLayoutVariant(0, 0)).toBe(0);
  });

  it('handles empty and single-photo stacks without duplicate layers', () => {
    expect(getFolderArtifactStackLayers([], 0)).toEqual([]);
    expect(getFolderArtifactStackLayers([images[0]], 8)).toEqual([
      { image: images[0], index: 0, layer: 'front' },
    ]);
  });
});
