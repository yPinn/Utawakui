import { applyOverlayAppearance } from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
} from '../shared/preview.mjs';
import { createOverlayConnection } from '../shared/runtime.mjs';
import { selectNowPlayingFrame } from '../shared/state.mjs';

const PREVIEW_FRAME = Object.freeze({
  revision: 0,
  visible: true,
  title: 'Stellar Stellar',
  artist: '星街すいせい',
});

function renderFrame(elements, frame) {
  elements.root.hidden = !frame.visible;
  elements.root.dataset.revision = String(frame.revision);
  elements.title.textContent = frame.title;
  elements.artist.textContent = frame.artist;
  elements.mark.textContent = frame.title.trim().slice(0, 1).toUpperCase();
}

function boot() {
  const elements = {
    root: document.querySelector('#artwork-overlay'),
    mark: document.querySelector('#artwork-mark'),
    title: document.querySelector('#artwork-title'),
    artist: document.querySelector('#artwork-artist'),
  };
  if (Object.values(elements).some((element) => !element)) return;

  const previewMode = isPreviewMode(window.location);
  applyOverlayAppearance(document, null);
  applyPreviewCanvas(document, previewMode);
  if (previewMode) renderFrame(elements, PREVIEW_FRAME);

  const connection = createOverlayConnection({
    kind: 'artwork',
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
