import { createOverlayConnection } from '../shared/runtime.mjs';
import { applyOverlayAppearance } from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
} from '../shared/preview.mjs';
import { selectSetlistFrame } from '../shared/state.mjs';
import {
  createSetlistCurrentMotionController,
  createSetlistHistoryMotionController,
} from './setlistMotion.mjs';

const PREVIEW_FRAME = Object.freeze({
  revision: 0,
  visible: true,
  sourceName: 'Tonight',
  current: { trackId: 'preview-current', title: '怪物', artist: 'YOASOBI' },
  history: [
    { trackId: 'preview-1', title: '群青', artist: 'YOASOBI' },
    {
      trackId: 'preview-2',
      title: 'Stellar Stellar',
      artist: '星街すいせい',
    },
    { trackId: 'preview-3', title: '花に亡霊', artist: 'ヨルシカ' },
  ],
});

function trackIdentity(track) {
  return [track?.trackId, track?.title, track?.artist]
    .map((value) => String(value ?? ''))
    .join('\u001f');
}

export function setlistHistoryIdentity(history = []) {
  return (Array.isArray(history) ? history : [])
    .map(trackIdentity)
    .join('\u001e');
}

export function setlistHistoryChange(previous = [], next = []) {
  const safePrevious = Array.isArray(previous) ? previous : [];
  const safeNext = Array.isArray(next) ? next : [];
  const changed =
    setlistHistoryIdentity(safePrevious) !== setlistHistoryIdentity(safeNext);
  const previousLastIdentity = trackIdentity(safePrevious.at(-1));
  const nextLastIdentity = trackIdentity(safeNext.at(-1));
  const appended =
    safePrevious.length > 0 &&
    safeNext.length > safePrevious.length &&
    safePrevious.every(
      (track, index) => trackIdentity(track) === trackIdentity(safeNext[index]),
    );
  const rolledForward =
    safePrevious.length > 0 &&
    safeNext.length > 0 &&
    previousLastIdentity !== nextLastIdentity &&
    safeNext.some((track) => trackIdentity(track) === previousLastIdentity);

  return {
    advanced: changed && (appended || rolledForward),
    changed,
  };
}

function createHistoryRow(trackData) {
  const item = document.createElement('li');
  const track = document.createElement('span');
  const artist = document.createElement('span');
  item.className = 'setlist-overlay__history-row';
  track.className = 'setlist-overlay__track';
  artist.className = 'setlist-overlay__artist';
  if (trackData.trackId) item.dataset.trackId = trackData.trackId;
  track.textContent = trackData.title;
  artist.textContent = trackData.artist;
  artist.hidden = !trackData.artist;
  item.append(track, artist);
  return item;
}

function renderHistory(container, history) {
  container.replaceChildren(...history.map(createHistoryRow));
}

function renderFrame(elements, frame, renderState, scheduleHistoryMeasurement) {
  const history = Array.isArray(frame.history) ? frame.history : [];
  const historyChange = setlistHistoryChange(renderState.history, history);
  elements.root.hidden = !frame.visible;
  elements.root.dataset.revision = String(frame.revision);

  elements.title.textContent = frame.sourceName;
  elements.title.hidden = !frame.sourceName;
  if (historyChange.changed) {
    renderHistory(elements.history, history);
    renderState.history = history.map((track) => ({ ...track }));
  }
  elements.historyViewport.hidden = history.length === 0;
  elements.historyEmpty.hidden = history.length > 0;

  const hasCurrent = Boolean(frame.current);
  elements.current.hidden = !hasCurrent;
  elements.currentEmpty.hidden = hasCurrent;
  elements.currentTitle.textContent = frame.current?.title ?? '';
  elements.currentArtist.textContent = frame.current?.artist ?? '';
  elements.currentArtist.hidden = !frame.current?.artist;
  if (historyChange.changed) {
    scheduleHistoryMeasurement({ revealLatest: historyChange.advanced });
  }
}

function createHistoryMeasurementController(elements, historyMotion) {
  let measurementFrame = null;
  let revealLatest = false;

  const measure = () => {
    measurementFrame = null;
    const shouldRevealLatest = revealLatest;
    revealLatest = false;
    historyMotion.refresh({ revealLatest: shouldRevealLatest });
  };

  const schedule = (options = {}) => {
    revealLatest ||= options.revealLatest === true;
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

function setMotionSuspended(controllers, suspended) {
  for (const controller of controllers) {
    if (suspended) controller.suspend();
    else controller.resume();
  }
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

  const gsap = globalThis.gsap ?? null;
  const previewMode = isPreviewMode(window.location);
  const renderState = { history: [] };
  const historyMotion = createSetlistHistoryMotionController({
    gsap,
    list: elements.history,
    root: elements.root,
    viewport: elements.historyViewport,
  });
  const historyMeasurement = createHistoryMeasurementController(
    elements,
    historyMotion,
  );
  const currentMotion = createSetlistCurrentMotionController({
    commitFrame: (frame) =>
      renderFrame(elements, frame, renderState, historyMeasurement.schedule),
    current: elements.current,
    gsap,
    root: elements.root,
  });
  const motionControllers = [currentMotion, historyMotion];
  let connectionStatus = previewMode ? 'connected' : 'disconnected';
  let reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const motionMedia = gsap?.matchMedia?.() ?? null;
  const applyReducedMotion = (value) => {
    reducedMotion = value === true;
    for (const controller of motionControllers) {
      controller.setReducedMotion(reducedMotion);
    }
  };
  applyReducedMotion(reducedMotion);
  motionMedia?.add(
    { reducedMotion: '(prefers-reduced-motion: reduce)' },
    (context) => applyReducedMotion(context.conditions?.reducedMotion === true),
  );
  const syncMotionActivity = () => {
    setMotionSuspended(
      motionControllers,
      document.hidden || (!previewMode && connectionStatus !== 'connected'),
    );
  };
  const handleVisibilityChange = () => syncMotionActivity();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  syncMotionActivity();

  applyOverlayAppearance(document, null);
  applyPreviewCanvas(document, { previewMode, location: window.location });
  if (previewMode) currentMotion.update(PREVIEW_FRAME);

  const connection = createOverlayConnection({
    kind: 'setlist',
    onConfig: (slot) => applyOverlayAppearance(document, slot),
    onSnapshot: (snapshot) => {
      const frame = withPreviewFallback(
        selectSetlistFrame(snapshot),
        PREVIEW_FRAME,
        previewMode,
      );
      currentMotion.update(frame);
    },
    onStatus: (status) => {
      connectionStatus = status;
      syncMotionActivity();
    },
  });
  connection.start();
  window.addEventListener(
    'pagehide',
    () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      motionMedia?.revert?.();
      historyMeasurement.stop();
      currentMotion.destroy();
      historyMotion.destroy();
      connection.stop();
    },
    { once: true },
  );
}

if (typeof document !== 'undefined') boot();
