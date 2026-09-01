import { createOverlayConnection } from '../shared/runtime.mjs';
import { applyOverlayAppearance } from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
} from '../shared/preview.mjs';
import { selectArtworkFrame } from '../shared/state.mjs';
import {
  clearArtworkSleeve,
  collectArtworkElements,
  prepareArtworkSleeve,
  renderArtworkFrame,
} from './artworkLayout.mjs';
import { createArtworkMotionController } from './artworkMotion.mjs';

const NOW_PLAYING_TEMPLATE_IDS = new Set([
  'now-next',
  'art-card',
  'cover-player',
]);

const PREVIEW_FRAME = Object.freeze({
  revision: 0,
  visible: true,
  title: '夜に駆ける',
  artist: 'YOASOBI',
  nextTitle: 'Stellar Stellar',
  trackId: 'preview-track',
  playbackStatus: 'playing',
  positionMs: 65000,
  durationMs: 185000,
  progress: 65 / 185,
});

const EMPTY_FRAME = Object.freeze({
  revision: 0,
  visible: false,
  title: '',
  artist: '',
  nextTitle: '',
  trackId: '',
  playbackStatus: 'idle',
  positionMs: 0,
  durationMs: 0,
  progress: 0,
});

export function normalizeNowPlayingTemplateId(value) {
  return NOW_PLAYING_TEMPLATE_IDS.has(value) ? value : 'now-next';
}

export function initialNowPlayingFrame(previewMode) {
  return previewMode ? PREVIEW_FRAME : EMPTY_FRAME;
}

export function initialNowPlayingTemplateId(location, previewMode) {
  if (!previewMode) return 'now-next';
  const value = new URLSearchParams(location?.search ?? '').get('template');
  return normalizeNowPlayingTemplateId(value);
}

export function isArtworkTemplate(templateId) {
  return templateId === 'art-card' || templateId === 'cover-player';
}

export function renderCompactFrame(elements, frame) {
  elements.root.hidden = !frame.visible;
  elements.root.dataset.revision = String(frame.revision);
  elements.title.textContent = frame.title;
  elements.artist.textContent = frame.artist;
  elements.next.textContent = frame.nextTitle ? `Next: ${frame.nextTitle}` : '';
}

export function renderNowPlayingTemplate({
  compactElements,
  artworkElements,
  templateId,
  frame,
}) {
  const artworkActive = isArtworkTemplate(templateId);
  if (artworkActive) {
    compactElements.root.hidden = true;
    renderArtworkFrame(artworkElements, frame);
    return;
  }

  artworkElements.root.hidden = true;
  renderCompactFrame(compactElements, frame);
}

function boot() {
  const compactElements = {
    root: document.querySelector('#now-playing-overlay'),
    title: document.querySelector('#now-playing-title'),
    artist: document.querySelector('#now-playing-artist'),
    next: document.querySelector('#now-playing-next'),
  };
  const artworkElements = collectArtworkElements(document);
  const artworkMotionElements = {
    root: artworkElements.root,
    stage: document.querySelector('.artwork-overlay__vinyl-stage'),
    albumPanel: document.querySelector('.artwork-overlay__album-panel'),
    sleeve: document.querySelector('.artwork-overlay__sleeve'),
    incomingSleeve: artworkElements.incoming.root,
    turntable: document.querySelector('.artwork-overlay__turntable'),
    bloom: document.querySelector('.artwork-overlay__platter-bloom'),
    record: document.querySelector('.artwork-overlay__record'),
    recordRotor: document.querySelector(
      '.artwork-overlay__record .artwork-overlay__record-rotor',
    ),
    exchangeRecord: document.querySelector('.artwork-overlay__exchange-record'),
    exchangeRecordRotor: document.querySelector(
      '.artwork-overlay__exchange-record-rotor',
    ),
    tonearmAssembly: document.querySelector(
      '.artwork-overlay__tonearm-assembly',
    ),
  };
  if (
    Object.values(compactElements).some((element) => !element) ||
    Object.entries(artworkElements).some(([key, element]) =>
      (key === 'incoming' ? Object.values(element) : [element]).some(
        (value) => !value,
      ),
    ) ||
    Object.values(artworkMotionElements).some((element) => !element)
  )
    return;

  const gsap = globalThis.gsap ?? null;
  const artworkMotion = createArtworkMotionController({
    gsap,
    ...artworkMotionElements,
    commitFrame: (frame) => renderArtworkFrame(artworkElements, frame),
    prepareFrame: (frame) =>
      prepareArtworkSleeve(artworkElements.incoming, frame),
    clearPreparedFrame: () => clearArtworkSleeve(artworkElements.incoming),
  });
  let reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  const motionMedia = gsap?.matchMedia?.() ?? null;
  artworkMotion.setReducedMotion(reducedMotion);
  motionMedia?.add(
    {
      motionAllowed: '(prefers-reduced-motion: no-preference)',
      reducedMotion: '(prefers-reduced-motion: reduce)',
    },
    (context) => {
      reducedMotion = context.conditions?.reducedMotion === true;
      artworkMotion.setReducedMotion(reducedMotion);
    },
  );
  const previewMode = isPreviewMode(window.location);
  let activeTemplateId = initialNowPlayingTemplateId(
    window.location,
    previewMode,
  );
  let currentFrame = initialNowPlayingFrame(previewMode);

  function renderCurrentFrame() {
    if (activeTemplateId === 'art-card') {
      compactElements.root.hidden = true;
      artworkMotion.update({ active: true, frame: currentFrame });
      return;
    }

    artworkMotion.update({ active: false, frame: currentFrame });
    renderNowPlayingTemplate({
      compactElements,
      artworkElements,
      templateId: activeTemplateId,
      frame: currentFrame,
    });
  }

  applyOverlayAppearance(document, { templateId: activeTemplateId });
  applyPreviewCanvas(document, { previewMode, location: window.location });
  if (previewMode) renderCurrentFrame();

  const connection = createOverlayConnection({
    kind: 'now-playing',
    onConfig: (slot) => {
      activeTemplateId = normalizeNowPlayingTemplateId(slot?.templateId);
      applyOverlayAppearance(document, slot);
      renderCurrentFrame();
    },
    onSnapshot: (snapshot) => {
      currentFrame = withPreviewFallback(
        selectArtworkFrame(snapshot),
        PREVIEW_FRAME,
        previewMode,
      );
      renderCurrentFrame();
    },
    onStatus: (status) => {
      if (status !== 'connected') artworkMotion.suspend();
    },
  });
  connection.start();
  window.addEventListener(
    'pagehide',
    () => {
      artworkMotion.destroy();
      motionMedia?.revert();
      connection.stop();
    },
    { once: true },
  );
}

if (typeof document !== 'undefined') boot();
