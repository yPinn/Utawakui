import { createOutputPreviewScene } from '../../shared/presentation/outputPreviewScene.mjs';

export function previewSceneForSlot(kind, slot) {
  return createOutputPreviewScene({
    kind,
    templateId:
      slot?.templateId ??
      {
        lyrics: 'karaoke-stack',
        setlist: 'queue-board',
        'now-playing': 'art-card',
      }[kind],
    settings: slot?.settings,
  });
}

const INSPECTION_BACKDROPS = new Set([
  'checker',
  'dark',
  'light',
  'transparent',
]);

export function isPreviewMode(location) {
  return new URLSearchParams(location?.search ?? '').get('preview') === '1';
}

export function isWorkbenchMode(location) {
  return new URLSearchParams(location?.search ?? '').get('workbench') === '1';
}

// Workbench previews load the element reporter on demand; OBS routes never fetch it.
export function startWorkbenchElementReporter(window, getTemplateId) {
  if (!isWorkbenchMode(window.location) || window.parent === window) {
    return Promise.resolve(null);
  }
  return import('./elementReporter.mjs').then(({ startElementReporter }) =>
    startElementReporter({ window, document: window.document, getTemplateId }),
  );
}

export function inspectionBackdrop(location) {
  const value = new URLSearchParams(location?.search ?? '').get('backdrop');
  return INSPECTION_BACKDROPS.has(value) ? value : '';
}

export function inspectionGuideVisible(location) {
  return new URLSearchParams(location?.search ?? '').get('guide') !== '0';
}

export function applyPreviewCanvas(document, options = {}) {
  const root = document?.documentElement;
  if (!root) return;
  if (options.previewMode === true) root.dataset.overlayPreview = 'true';
  if (options.workbenchMode === true) {
    root.dataset.overlayWorkbench = 'true';
    root.dataset.overlayGuide = inspectionGuideVisible(options.location)
      ? 'true'
      : 'false';
  }
  const backdrop = inspectionBackdrop(options.location);
  if (backdrop) root.dataset.overlayBackdrop = backdrop;
}

export function withPreviewFallback(frame, fallback, enabled) {
  if (!enabled || frame.visible) return frame;
  return { ...fallback, revision: frame.revision };
}
