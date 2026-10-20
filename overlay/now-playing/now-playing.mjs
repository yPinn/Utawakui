import { createOverlayHost } from '../shared/lifecycle.mjs';
import { applyOverlayAppearance } from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
  previewSceneForSlot,
} from '../shared/preview.mjs';
import { selectArtworkFrame } from '../shared/state.mjs';
import {
  clearArtworkSleeve,
  collectArtworkElements,
  prepareArtworkSleeve,
  renderArtworkFrame,
} from './artworkLayout.mjs';
import { createArtworkMotionController } from './artworkMotion.mjs';

const NOW_PLAYING_TEMPLATE_IDS = new Set(['art-card', 'cover-player']);

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
  return NOW_PLAYING_TEMPLATE_IDS.has(value) ? value : 'art-card';
}

export function initialNowPlayingFrame(previewMode) {
  return previewMode ? previewSceneForSlot('now-playing').frame : EMPTY_FRAME;
}

export function initialNowPlayingTemplateId(location, previewMode) {
  if (!previewMode) return 'art-card';
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
  const previewMode = isPreviewMode(window.location);
  let activeTemplateId = initialNowPlayingTemplateId(
    window.location,
    previewMode,
  );
  let currentFrame = initialNowPlayingFrame(previewMode);
  let previewScene = previewSceneForSlot('now-playing', {
    templateId: activeTemplateId,
  });

  function renderCurrentFrame({ recovering = false } = {}) {
    if (activeTemplateId === 'art-card') {
      compactElements.root.hidden = true;
      artworkMotion.update({
        active: true,
        frame: currentFrame,
        settle: recovering,
      });
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
  const host = createOverlayHost({
    kind: 'now-playing',
    previewMode,
    onReducedMotion: (value) => artworkMotion.setReducedMotion(value),
    onActivity: (active, { recovering } = {}) => {
      if (!active) artworkMotion.suspend();
      else if (previewMode && recovering)
        renderCurrentFrame({ recovering: true });
    },
    onConfig: (slot) => {
      activeTemplateId = normalizeNowPlayingTemplateId(slot?.templateId);
      previewScene = previewSceneForSlot('now-playing', {
        ...slot,
        templateId: activeTemplateId,
      });
      applyOverlayAppearance(document, slot);
      if (host.active) renderCurrentFrame();
    },
    onSnapshot: (snapshot, context) => {
      currentFrame = withPreviewFallback(
        selectArtworkFrame(snapshot),
        previewScene.frame,
        previewMode,
      );
      renderCurrentFrame(context);
    },
    onDispose: () => artworkMotion.destroy(),
  });
  host.start();
  if (previewMode) renderCurrentFrame();
}

if (typeof document !== 'undefined') boot();
