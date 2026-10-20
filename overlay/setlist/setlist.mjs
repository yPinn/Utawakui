import { createOverlayHost } from '../shared/lifecycle.mjs';
import { applyOverlayAppearance } from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
  previewSceneForSlot,
} from '../shared/preview.mjs';
import { selectSetlistFrame } from '../shared/state.mjs';
import {
  createSetlistCurrentMotionController,
  createSetlistHistoryMotionController,
} from './setlistMotion.mjs';

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

export function createHistoryMeasurementController(elements, historyMotion) {
  let measurementFrame = null;
  let revealLatest = false;
  let force = false;
  let suspended = false;
  let stopped = false;

  const measure = () => {
    measurementFrame = null;
    const shouldRevealLatest = revealLatest;
    const shouldForce = force;
    revealLatest = false;
    force = false;
    if (!stopped && !suspended)
      historyMotion.refresh({
        force: shouldForce,
        revealLatest: shouldRevealLatest,
      });
  };

  const schedule = (options = {}) => {
    if (stopped) return;
    revealLatest ||= options.revealLatest === true;
    force ||= options.force === true;
    if (measurementFrame !== null) cancelAnimationFrame(measurementFrame);
    measurementFrame = null;
    if (suspended) return;
    measurementFrame = requestAnimationFrame(measure);
  };

  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(elements.historyViewport);
  resizeObserver.observe(elements.history);

  return {
    schedule,
    suspend() {
      suspended = true;
      if (measurementFrame !== null) cancelAnimationFrame(measurementFrame);
      measurementFrame = null;
    },
    resume() {
      if (stopped) return;
      suspended = false;
      revealLatest = false;
      schedule({ force: true });
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (measurementFrame !== null) cancelAnimationFrame(measurementFrame);
      measurementFrame = null;
      resizeObserver.disconnect();
    },
  };
}

function setMotionSuspended(controllers, suspended) {
  for (const controller of controllers) {
    if (suspended) controller.suspend();
    else controller.resume({ reset: true });
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
  let previewScene = previewSceneForSlot('setlist');
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
  const applyReducedMotion = (value) => {
    for (const controller of motionControllers) {
      controller.setReducedMotion(value);
    }
  };

  applyOverlayAppearance(document, null);
  applyPreviewCanvas(document, { previewMode, location: window.location });
  const host = createOverlayHost({
    kind: 'setlist',
    previewMode,
    onReducedMotion: applyReducedMotion,
    onActivity: (active) => {
      setMotionSuspended(motionControllers, !active);
      if (active) historyMeasurement.resume();
      else historyMeasurement.suspend();
    },
    onFontsChanged: () => historyMeasurement.schedule({ force: true }),
    onConfig: (slot) => {
      previewScene = previewSceneForSlot('setlist', slot);
      applyOverlayAppearance(document, slot);
    },
    onSnapshot: (snapshot, { recovering }) => {
      const frame = withPreviewFallback(
        selectSetlistFrame(snapshot),
        previewScene.frame,
        previewMode,
      );
      currentMotion.update(frame, { settle: recovering });
    },
    onDispose: () => {
      historyMeasurement.stop();
      currentMotion.destroy();
      historyMotion.destroy();
    },
  });
  host.start();
  if (previewMode) currentMotion.update(previewScene.frame);
}

if (typeof document !== 'undefined') boot();
