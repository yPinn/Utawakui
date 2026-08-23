import { applyOverlayAppearance } from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
} from '../shared/preview.mjs';
import { createOverlayConnection } from '../shared/runtime.mjs';
import { selectArtworkFrame } from '../shared/state.mjs';

const PREVIEW_FRAME = Object.freeze({
  revision: 0,
  visible: true,
  trackId: 'preview-track',
  title: 'Stellar Stellar',
  artist: '星街すいせい',
  playbackStatus: 'playing',
  positionMs: 65000,
  durationMs: 185000,
  progress: 65 / 185,
});

function formatTime(valueMs) {
  const totalSeconds = Number.isFinite(valueMs)
    ? Math.max(0, Math.floor(valueMs / 1000))
    : 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function setArtworkSource(elements, trackId) {
  const normalizedTrackId = typeof trackId === 'string' ? trackId.trim() : '';
  if (elements.image.dataset.trackId === normalizedTrackId) return;

  elements.image.dataset.trackId = normalizedTrackId;
  elements.image.hidden = true;
  elements.fallback.hidden = false;
  elements.image.onload = null;
  elements.image.onerror = null;
  elements.image.removeAttribute('src');
  if (!normalizedTrackId) return;

  elements.image.onload = () => {
    elements.image.hidden = false;
    elements.fallback.hidden = true;
  };
  elements.image.onerror = () => {
    elements.image.hidden = true;
    elements.fallback.hidden = false;
  };
  elements.image.src = `/media/artwork/${encodeURIComponent(normalizedTrackId)}`;
}

export function renderArtworkFrame(elements, frame) {
  const progress = Number.isFinite(frame.progress)
    ? Math.min(1, Math.max(0, frame.progress))
    : 0;
  const positionMs = Number.isFinite(frame.positionMs)
    ? Math.max(0, frame.positionMs)
    : 0;
  const durationMs = Number.isFinite(frame.durationMs)
    ? Math.max(0, frame.durationMs)
    : 0;

  elements.root.hidden = !frame.visible;
  elements.root.dataset.revision = String(frame.revision);
  elements.root.dataset.playbackStatus = ['playing', 'paused'].includes(
    frame.playbackStatus,
  )
    ? frame.playbackStatus
    : 'idle';
  elements.root.style.setProperty(
    '--ovl-artwork-progress',
    `${progress * 100}%`,
  );
  elements.title.textContent = frame.title;
  elements.artist.textContent = frame.artist;
  elements.elapsed.textContent = formatTime(positionMs);
  elements.remaining.textContent = `-${formatTime(
    Math.max(0, durationMs - positionMs),
  )}`;
  elements.fallback.textContent = frame.title.trim().slice(0, 1).toUpperCase();
  setArtworkSource(elements, frame.trackId);
}

function boot() {
  const elements = {
    root: document.querySelector('#artwork-overlay'),
    image: document.querySelector('#artwork-image'),
    fallback: document.querySelector('#artwork-fallback'),
    title: document.querySelector('#artwork-title'),
    artist: document.querySelector('#artwork-artist'),
    elapsed: document.querySelector('#artwork-elapsed'),
    remaining: document.querySelector('#artwork-remaining'),
  };
  if (Object.values(elements).some((element) => !element)) return;

  const previewMode = isPreviewMode(window.location);
  applyOverlayAppearance(document, null);
  applyPreviewCanvas(document, { previewMode, location: window.location });
  if (previewMode) renderArtworkFrame(elements, PREVIEW_FRAME);

  const connection = createOverlayConnection({
    kind: 'artwork',
    onConfig: (slot) => applyOverlayAppearance(document, slot),
    onSnapshot: (snapshot) => {
      const frame = withPreviewFallback(
        selectArtworkFrame(snapshot),
        PREVIEW_FRAME,
        previewMode,
      );
      renderArtworkFrame(elements, frame);
    },
  });
  connection.start();
  window.addEventListener('pagehide', () => connection.stop(), { once: true });
}

if (typeof document !== 'undefined') boot();
