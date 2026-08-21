import { createOverlayConnection } from '../shared/runtime.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
} from '../shared/preview.mjs';
import { selectLyricsFrame } from '../shared/state.mjs';

const PREVIEW_FRAME = Object.freeze({
  revision: 0,
  visible: true,
  currentText: '一つずつ こぼした音が',
  nextText: '重なって歌になる',
  language: 'ja',
});

export function renderLyricsFrame(elements, frame, options = {}) {
  const previousText = elements.current.textContent;
  elements.current.textContent = frame.currentText;
  elements.next.textContent = frame.nextText;
  elements.root.hidden = !frame.visible;
  elements.root.setAttribute('lang', frame.language || 'und');
  elements.root.dataset.revision = String(frame.revision);

  const shouldAnimate =
    frame.visible &&
    previousText !== frame.currentText &&
    options.reducedMotion !== true &&
    typeof elements.current.animate === 'function';
  if (shouldAnimate) {
    elements.current.animate(
      [
        { opacity: 0.35, transform: 'translateY(0.3em)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }
}

function boot() {
  const elements = {
    root: document.querySelector('#lyrics-overlay'),
    current: document.querySelector('#lyrics-current'),
    next: document.querySelector('#lyrics-next'),
  };
  if (!elements.root || !elements.current || !elements.next) return;

  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const previewMode = isPreviewMode(window.location);
  applyPreviewCanvas(document, previewMode);
  if (previewMode) {
    renderLyricsFrame(elements, PREVIEW_FRAME, { reducedMotion: true });
  }
  const connection = createOverlayConnection({
    onSnapshot: (snapshot) => {
      const frame = withPreviewFallback(
        selectLyricsFrame(snapshot),
        PREVIEW_FRAME,
        previewMode,
      );
      renderLyricsFrame(elements, frame, { reducedMotion });
    },
  });
  connection.start();
  window.addEventListener('pagehide', () => connection.stop(), { once: true });
}

if (typeof document !== 'undefined') boot();
