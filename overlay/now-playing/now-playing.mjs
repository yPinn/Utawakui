import { createOverlayHost } from '../shared/lifecycle.mjs';
import { applyOverlayAppearance } from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  withPreviewFallback,
  previewSceneForSlot,
  startWorkbenchElementReporter,
} from '../shared/preview.mjs';
import { selectArtworkFrame } from '../shared/state.mjs';
import {
  clearArtworkSleeve,
  collectArtworkElements,
  prepareArtworkSleeve,
  renderArtworkFrame,
  renderArtworkPlayback,
} from './artworkLayout.mjs';
import { createArtworkMotionController } from './artworkMotion.mjs';
import { createCoverPlayerMotionController } from './coverPlayerMotion.mjs';

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

function boot() {
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
  const coverMotion = createCoverPlayerMotionController({
    gsap,
    root: artworkElements.root,
    current: [
      document.querySelector('.artwork-overlay__mark'),
      document.querySelector('.artwork-overlay__copy'),
    ],
    commitFrame: (frame) => renderArtworkFrame(artworkElements, frame),
    commitPlayback: (frame) => renderArtworkPlayback(artworkElements, frame),
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
  let renderedTemplateId = null;
  let reducedMotion = false;

  function renderCurrentFrame({ recovering = false } = {}) {
    const switched = renderedTemplateId !== activeTemplateId;
    renderedTemplateId = activeTemplateId;
    if (activeTemplateId === 'art-card') {
      if (switched) coverMotion.update(currentFrame, { active: false });
      if (switched) artworkMotion.setReducedMotion(reducedMotion);
      artworkMotion.update({
        active: true,
        frame: currentFrame,
        settle: recovering,
      });
      return;
    }

    if (switched) artworkMotion.update({ active: false, frame: currentFrame });
    if (switched) coverMotion.setReducedMotion(reducedMotion);
    coverMotion.update(currentFrame, {
      active: true,
      settle: recovering || switched,
    });
  }

  applyOverlayAppearance(document, { templateId: activeTemplateId });
  applyPreviewCanvas(document, { previewMode, location: window.location });
  const elementReporter = startWorkbenchElementReporter(
    window,
    () => activeTemplateId,
  );
  const host = createOverlayHost({
    kind: 'now-playing',
    previewMode,
    onReducedMotion: (value) => {
      reducedMotion = value;
      if (activeTemplateId === 'art-card')
        artworkMotion.setReducedMotion(value);
      else coverMotion.setReducedMotion(value);
    },
    onActivity: (active, { recovering } = {}) => {
      if (!active) {
        artworkMotion.suspend();
        coverMotion.suspend();
      } else {
        coverMotion.resume();
        if (previewMode && recovering) renderCurrentFrame({ recovering: true });
      }
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
    onDispose: () => {
      artworkMotion.destroy();
      coverMotion.destroy();
      void elementReporter.then((reporter) => reporter?.dispose());
    },
  });
  host.start();
  if (previewMode) renderCurrentFrame();
}

if (typeof document !== 'undefined') boot();
