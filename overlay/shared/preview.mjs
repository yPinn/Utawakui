const INSPECTION_BACKDROPS = new Set(['checker', 'dark', 'light']);

export function isPreviewMode(location) {
  return new URLSearchParams(location?.search ?? '').get('preview') === '1';
}

export function isWorkbenchMode(location) {
  return new URLSearchParams(location?.search ?? '').get('workbench') === '1';
}

export function inspectionBackdrop(location) {
  const value = new URLSearchParams(location?.search ?? '').get('backdrop');
  return INSPECTION_BACKDROPS.has(value) ? value : '';
}

export function applyPreviewCanvas(document, options = {}) {
  const root = document?.documentElement;
  if (!root) return;
  if (options.previewMode === true) root.dataset.overlayPreview = 'true';
  if (options.workbenchMode === true) root.dataset.overlayWorkbench = 'true';
  const backdrop = inspectionBackdrop(options.location);
  if (backdrop) root.dataset.overlayBackdrop = backdrop;
}

export function withPreviewFallback(frame, fallback, enabled) {
  if (!enabled || frame.visible) return frame;
  return { ...fallback, revision: frame.revision };
}
