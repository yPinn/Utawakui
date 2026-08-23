import { createOverlayConnection } from '../shared/runtime.mjs';
import { applyOverlayAppearance } from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
} from '../shared/preview.mjs';
import {
  nextPresentationBoundaryDelayMs,
  selectLyricsFrame,
} from '../shared/state.mjs';

const PREVIEW_FRAME = Object.freeze({
  revision: 0,
  visible: true,
  currentText: '一つずつ こぼした音が',
  nextText: '重なって歌になる',
  language: 'ja',
});
const MIN_PRESENTATION_CONFIDENCE = 0.5;
const PRESENTATION_SECTION_ROLES = new Set([
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'bridge',
  'instrumental',
  'outro',
]);
const lastRenderedBeatKeys = new WeakMap();

function progressPercentage(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 10000) / 100;
}

function renderCurrentLyrics(element, frame, options) {
  const segments = Array.isArray(frame.currentSegments)
    ? frame.currentSegments
    : [];
  const documentApi = element.ownerDocument ?? globalThis.document;
  if (segments.length === 0 || !documentApi?.createElement) {
    delete element.dataset.segmented;
    element.textContent = frame.currentText;
    return;
  }

  element.textContent = '';
  element.dataset.segmented = 'true';
  for (const segment of segments) {
    const segmentElement = documentApi.createElement('span');
    const progress = Number.isFinite(segment.progress)
      ? progressPercentage(segment.progress)
      : segment.state === 'active'
        ? 100
        : 0;
    segmentElement.className = 'lyrics-overlay__segment';
    segmentElement.dataset.segmentId = segment.segmentId;
    segmentElement.dataset.segmentState = segment.state;
    segmentElement.textContent = segment.text;
    segmentElement.style.setProperty('--ovl-segment-progress', `${progress}%`);
    if (
      segment.state === 'active' &&
      Number.isFinite(segment.remainingMs) &&
      segment.remainingMs > 0 &&
      options.reducedMotion !== true &&
      typeof segmentElement.animate === 'function'
    ) {
      segmentElement.animate(
        [
          { '--ovl-segment-progress': `${progress}%` },
          { '--ovl-segment-progress': '100%' },
        ],
        {
          duration: Math.max(1, Math.ceil(segment.remainingMs)),
          easing: 'linear',
          fill: 'forwards',
        },
      );
    }
    element.append(segmentElement);
  }
}

function activeTemplateId(elements, options) {
  if (typeof options.templateId === 'string') return options.templateId;
  return (
    elements.root.ownerDocument?.documentElement?.dataset?.ovlTemplate ?? ''
  );
}

function confidentCue(cue) {
  return (
    cue &&
    Number.isFinite(cue.confidence) &&
    cue.confidence >= MIN_PRESENTATION_CONFIDENCE &&
    cue.confidence <= 1
  );
}

function clearMusicPresentation(root) {
  delete root.dataset.musicLevel;
  delete root.dataset.musicSection;
  delete root.dataset.musicDownbeat;
}

function applyMusicStructurePresentation(elements, frame, options) {
  clearMusicPresentation(elements.root);
  const music = frame.musicStructure;
  if (
    activeTemplateId(elements, options) !== 'karaoke-stack' ||
    !music ||
    !['M1', 'M2'].includes(music.level)
  ) {
    lastRenderedBeatKeys.delete(elements.root);
    return;
  }

  elements.root.dataset.musicLevel = music.level;
  const section = music.activeSection;
  if (confidentCue(section) && PRESENTATION_SECTION_ROLES.has(section.role)) {
    elements.root.dataset.musicSection = section.role;
  }

  const beat = music.currentBeat;
  const beatKey =
    confidentCue(beat) && Number.isFinite(beat.timeMs)
      ? `${music.documentId}\0${beat.timeMs}`
      : null;
  const previousBeatKey = lastRenderedBeatKeys.get(elements.root) ?? null;
  if (beatKey === null) {
    lastRenderedBeatKeys.delete(elements.root);
    return;
  }
  lastRenderedBeatKeys.set(elements.root, beatKey);
  if (beat.downbeat !== true) return;

  elements.root.dataset.musicDownbeat = 'true';
  if (
    beatKey !== previousBeatKey &&
    Number.isFinite(beat.elapsedMs) &&
    beat.elapsedMs <= 250 &&
    frame.visible &&
    options.reducedMotion !== true &&
    typeof elements.current.animate === 'function'
  ) {
    elements.current.animate(
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.12)' },
        { filter: 'brightness(1)' },
      ],
      { duration: 180, easing: 'ease-out' },
    );
  }
}

export function renderLyricsFrame(elements, frame, options = {}) {
  const previousText =
    elements.current.dataset.currentText ?? elements.current.textContent;
  renderCurrentLyrics(elements.current, frame, options);
  elements.current.dataset.currentText = frame.currentText;
  elements.next.textContent = frame.nextText;
  elements.root.hidden = !frame.visible;
  elements.root.setAttribute('lang', frame.language || 'und');
  elements.root.dataset.revision = String(frame.revision);
  applyMusicStructurePresentation(elements, frame, options);

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

export function createLyricsFrameScheduler(options = {}) {
  const now = options.now ?? Date.now;
  const onFrame = options.onFrame ?? (() => {});
  const schedule = options.schedule ?? window.setTimeout.bind(window);
  const cancelSchedule =
    options.cancelSchedule ?? window.clearTimeout.bind(window);
  let latestSnapshot = null;
  let timer = null;
  let stopped = false;

  function clearTimer() {
    if (timer !== null) cancelSchedule(timer);
    timer = null;
  }

  function renderLatest() {
    if (stopped || !latestSnapshot) return;
    const nowMs = now();
    onFrame(selectLyricsFrame(latestSnapshot, { nowMs }));
    const delay = nextPresentationBoundaryDelayMs(latestSnapshot, { nowMs });
    if (delay === null) return;
    timer = schedule(() => {
      timer = null;
      renderLatest();
    }, delay);
  }

  function update(snapshot) {
    if (stopped) return;
    latestSnapshot = snapshot;
    clearTimer();
    renderLatest();
  }

  function stop() {
    stopped = true;
    clearTimer();
    latestSnapshot = null;
  }

  function suspend() {
    clearTimer();
    latestSnapshot = null;
  }

  function refresh() {
    clearTimer();
    renderLatest();
  }

  return { refresh, stop, suspend, update };
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
  applyOverlayAppearance(document, null);
  applyPreviewCanvas(document, { previewMode, location: window.location });
  if (previewMode) {
    renderLyricsFrame(elements, PREVIEW_FRAME, { reducedMotion: true });
  }
  const frameScheduler = createLyricsFrameScheduler({
    onFrame: (frame) => {
      const visibleFrame = withPreviewFallback(
        frame,
        PREVIEW_FRAME,
        previewMode,
      );
      renderLyricsFrame(elements, visibleFrame, { reducedMotion });
    },
  });
  const connection = createOverlayConnection({
    kind: 'lyrics',
    onConfig: (slot) => {
      applyOverlayAppearance(document, slot);
      frameScheduler.refresh();
    },
    onSnapshot: (snapshot) => frameScheduler.update(snapshot),
    onStatus: (status) => {
      if (status !== 'connected') frameScheduler.suspend();
    },
  });
  connection.start();
  window.addEventListener(
    'pagehide',
    () => {
      frameScheduler.stop();
      connection.stop();
    },
    { once: true },
  );
}

if (typeof document !== 'undefined') boot();
