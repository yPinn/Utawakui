export function isPreviewMode(location) {
  return new URLSearchParams(location?.search ?? '').get('preview') === '1';
}

export function applyPreviewCanvas(document, enabled) {
  if (enabled) document.documentElement.dataset.overlayPreview = 'true';
}

export function withPreviewFallback(frame, fallback, enabled) {
  if (!enabled || frame.visible) return frame;
  return { ...fallback, revision: frame.revision };
}
