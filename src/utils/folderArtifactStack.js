export function normalizeFolderArtifactStackIndex(index, total) {
  if (!Number.isFinite(index) || total <= 0) return 0;
  return ((Math.trunc(index) % total) + total) % total;
}

export function nextFolderArtifactStackIndex(index, total) {
  if (total <= 1) return 0;
  return normalizeFolderArtifactStackIndex(index + 1, total);
}

export function previousFolderArtifactStackIndex(index, total) {
  if (total <= 1) return 0;
  return normalizeFolderArtifactStackIndex(index - 1, total);
}

export function getFolderArtifactStackLayers(images, activeIndex = 0) {
  if (!Array.isArray(images) || images.length === 0) return [];

  const currentIndex = normalizeFolderArtifactStackIndex(
    activeIndex,
    images.length,
  );
  if (images.length === 1) {
    return [
      { image: images[currentIndex], index: currentIndex, layer: 'front' },
    ];
  }

  const previousIndex = previousFolderArtifactStackIndex(
    currentIndex,
    images.length,
  );
  return [
    { image: images[previousIndex], index: previousIndex, layer: 'back' },
    { image: images[currentIndex], index: currentIndex, layer: 'front' },
  ];
}
