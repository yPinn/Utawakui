import { createOverlayConnection } from '../shared/runtime.mjs';
import { applyOverlayAppearance } from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
} from '../shared/preview.mjs';
import { selectSetlistFrame } from '../shared/state.mjs';

const PREVIEW_FRAME = Object.freeze({
  revision: 0,
  visible: true,
  sourceName: 'Tonight',
  current: { title: '怪物', artist: 'YOASOBI' },
  history: [
    { title: '群青', artist: 'YOASOBI' },
    { title: 'Stellar Stellar', artist: '星街すいせい' },
    { title: '花に亡霊', artist: 'ヨルシカ' },
  ],
});

const HISTORY_SCROLL_PX_PER_SECOND = 18;
const HISTORY_SCROLL_HOLD_SECONDS = 4;
const HISTORY_SCROLL_MIN_SECONDS = 12;

export function setlistHistoryScrollMetrics({
  contentHeight = 0,
  viewportHeight = 0,
} = {}) {
  const safeContentHeight = Number.isFinite(contentHeight)
    ? Math.max(0, contentHeight)
    : 0;
  const safeViewportHeight = Number.isFinite(viewportHeight)
    ? Math.max(0, viewportHeight)
    : 0;
  const distance = Math.max(
    0,
    Math.ceil(safeContentHeight - safeViewportHeight),
  );
  if (distance === 0) {
    return { distance: 0, durationSeconds: 0, overflow: false };
  }

  const durationSeconds = Math.max(
    HISTORY_SCROLL_MIN_SECONDS,
    Math.ceil(
      (distance / HISTORY_SCROLL_PX_PER_SECOND + HISTORY_SCROLL_HOLD_SECONDS) *
        10,
    ) / 10,
  );
  return { distance, durationSeconds, overflow: true };
}

function createHistoryRow(trackData) {
  const item = document.createElement('li');
  const track = document.createElement('span');
  const artist = document.createElement('span');
  item.className = 'setlist-overlay__history-row';
  track.className = 'setlist-overlay__track';
  artist.className = 'setlist-overlay__artist';
  track.textContent = trackData.title;
  artist.textContent = trackData.artist;
  artist.hidden = !trackData.artist;
  item.append(track, artist);
  return item;
}

function renderHistory(container, history) {
  container.replaceChildren(...history.map(createHistoryRow));
}

function renderFrame(elements, frame, scheduleHistoryMeasurement) {
  elements.root.hidden = !frame.visible;
  elements.root.dataset.revision = String(frame.revision);
  elements.root.dataset.historyOverflow = 'false';

  elements.title.textContent = frame.sourceName;
  elements.title.hidden = !frame.sourceName;
  renderHistory(elements.history, frame.history);
  elements.historyViewport.hidden = frame.history.length === 0;
  elements.historyEmpty.hidden = frame.history.length > 0;

  const hasCurrent = Boolean(frame.current);
  elements.current.hidden = !hasCurrent;
  elements.currentEmpty.hidden = hasCurrent;
  elements.currentTitle.textContent = frame.current?.title ?? '';
  elements.currentArtist.textContent = frame.current?.artist ?? '';
  elements.currentArtist.hidden = !frame.current?.artist;
  scheduleHistoryMeasurement();
}

function createHistoryOverflowController(elements) {
  let measurementFrame = null;

  const measure = () => {
    measurementFrame = null;
    const metrics = setlistHistoryScrollMetrics({
      contentHeight: elements.historyViewport.scrollHeight,
      viewportHeight: elements.historyViewport.clientHeight,
    });
    elements.root.dataset.historyOverflow = String(metrics.overflow);
    elements.root.style.setProperty(
      '--ovl-template-setlist-scroll-distance',
      `${metrics.distance}px`,
    );
    elements.root.style.setProperty(
      '--ovl-template-setlist-scroll-duration',
      `${metrics.durationSeconds}s`,
    );
  };

  const schedule = () => {
    elements.root.dataset.historyOverflow = 'false';
    if (measurementFrame !== null) cancelAnimationFrame(measurementFrame);
    measurementFrame = requestAnimationFrame(measure);
  };

  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(elements.historyViewport);
  resizeObserver.observe(elements.history);

  return {
    schedule,
    stop() {
      if (measurementFrame !== null) cancelAnimationFrame(measurementFrame);
      resizeObserver.disconnect();
    },
  };
}

function boot() {
  const elements = {
    root: document.querySelector('#setlist-overlay'),
    title: document.querySelector('#setlist-title'),
    history: document.querySelector('#setlist-history'),
    historyViewport: document.querySelector('#setlist-history-viewport'),
    historyEmpty: document.querySelector('#setlist-history-empty'),
    current: document.querySelector('#setlist-current'),
    currentTitle: document.querySelector('#setlist-current-title'),
    currentArtist: document.querySelector('#setlist-current-artist'),
    currentEmpty: document.querySelector('#setlist-current-empty'),
  };
  if (Object.values(elements).some((element) => !element)) return;

  const previewMode = isPreviewMode(window.location);
  const historyOverflow = createHistoryOverflowController(elements);
  applyOverlayAppearance(document, null);
  applyPreviewCanvas(document, { previewMode, location: window.location });
  if (previewMode)
    renderFrame(elements, PREVIEW_FRAME, historyOverflow.schedule);

  const connection = createOverlayConnection({
    kind: 'setlist',
    onConfig: (slot) => applyOverlayAppearance(document, slot),
    onSnapshot: (snapshot) => {
      const frame = withPreviewFallback(
        selectSetlistFrame(snapshot),
        PREVIEW_FRAME,
        previewMode,
      );
      renderFrame(elements, frame, historyOverflow.schedule);
    },
  });
  connection.start();
  window.addEventListener(
    'pagehide',
    () => {
      historyOverflow.stop();
      connection.stop();
    },
    { once: true },
  );
}

if (typeof document !== 'undefined') boot();
