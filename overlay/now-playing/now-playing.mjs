import { createOverlayConnection } from '../shared/runtime.mjs';
import { applyOverlayAppearance } from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
} from '../shared/preview.mjs';
import { selectNowPlayingFrame } from '../shared/state.mjs';

const PREVIEW_FRAME = Object.freeze({
  revision: 0,
  visible: true,
  title: '夜に駆ける',
  artist: 'YOASOBI',
  nextTitle: 'Stellar Stellar',
});

function renderFrame(elements, frame) {
  elements.root.hidden = !frame.visible;
  elements.root.dataset.revision = String(frame.revision);
  elements.title.textContent = frame.title;
  elements.artist.textContent = frame.artist;
  elements.next.textContent = frame.nextTitle ? `Next: ${frame.nextTitle}` : '';
}

function boot() {
  const elements = {
    root: document.querySelector('#now-playing-overlay'),
    title: document.querySelector('#now-playing-title'),
    artist: document.querySelector('#now-playing-artist'),
    next: document.querySelector('#now-playing-next'),
  };
  if (Object.values(elements).some((element) => !element)) return;

  const previewMode = isPreviewMode(window.location);
  applyOverlayAppearance(document, null);
  applyPreviewCanvas(document, { previewMode, location: window.location });
  if (previewMode) renderFrame(elements, PREVIEW_FRAME);

  const connection = createOverlayConnection({
    kind: 'now-playing',
    onConfig: (slot) => applyOverlayAppearance(document, slot),
    onSnapshot: (snapshot) => {
      const frame = withPreviewFallback(
        selectNowPlayingFrame(snapshot),
        PREVIEW_FRAME,
        previewMode,
      );
      renderFrame(elements, frame);
    },
  });
  connection.start();
  window.addEventListener('pagehide', () => connection.stop(), { once: true });
}

if (typeof document !== 'undefined') boot();
