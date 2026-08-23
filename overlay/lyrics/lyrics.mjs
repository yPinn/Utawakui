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
import { applyMangaFramePresentation } from './mangaFrame.mjs';

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
const SEGMENT_AWARE_TEMPLATE_IDS = new Set(['karaoke-stack', 'manga-frame']);
const MANGA_FADE_OUT_DURATION_SECONDS = 0.16;
const MANGA_FADE_IN_DURATION_SECONDS = 0.18;
const lastRenderedBeatKeys = new WeakMap();
const mangaTransitions = new WeakMap();
const mangaPulseTimelines = new WeakMap();

function resolveGsap(options) {
  return options.gsap ?? globalThis.gsap ?? null;
}

function progressPercentage(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 10000) / 100;
}

function renderCurrentLyrics(element, frame, options) {
  const templateId = options.templateId ?? '';
  const gsap = resolveGsap(options);
  if (templateId === 'manga-frame') {
    gsap?.killTweensOf?.(Array.from(element.children ?? []));
  }
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
      options.reducedMotion !== true
    ) {
      if (templateId === 'manga-frame' && typeof gsap?.to === 'function') {
        gsap.to(segmentElement, {
          '--ovl-segment-progress': '100%',
          duration: Math.max(0.001, segment.remainingMs / 1000),
          ease: 'none',
          overwrite: 'auto',
        });
      } else if (typeof segmentElement.animate === 'function') {
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
  const templateId = activeTemplateId(elements, options);
  if (
    !SEGMENT_AWARE_TEMPLATE_IDS.has(templateId) ||
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
  const pulseTarget =
    templateId === 'manga-frame' ? elements.root : elements.current;
  if (
    beatKey !== previousBeatKey &&
    Number.isFinite(beat.elapsedMs) &&
    beat.elapsedMs <= 250 &&
    frame.visible &&
    options.reducedMotion !== true &&
    (templateId === 'manga-frame' || typeof pulseTarget.animate === 'function')
  ) {
    const gsap = resolveGsap(options);
    if (templateId === 'manga-frame' && typeof gsap?.timeline === 'function') {
      mangaPulseTimelines.get(elements.root)?.kill?.();
      const timeline = gsap.timeline({
        defaults: { overwrite: 'auto' },
        onComplete: () => {
          if (mangaPulseTimelines.get(elements.root) === timeline) {
            mangaPulseTimelines.delete(elements.root);
          }
        },
      });
      mangaPulseTimelines.set(elements.root, timeline);
      timeline
        .addLabel('accent')
        .to(
          elements.root,
          { scale: 1.025, duration: 0.09, ease: 'power1.out' },
          'accent',
        )
        .to(elements.root, {
          scale: 1,
          duration: 0.09,
          ease: 'power1.inOut',
        });
    } else if (typeof pulseTarget.animate === 'function') {
      pulseTarget.animate(
        [
          { filter: 'brightness(1)' },
          { filter: 'brightness(1.12)' },
          { filter: 'brightness(1)' },
        ],
        { duration: 180, easing: 'ease-out' },
      );
    }
  }
}

function commitLyricsFrame(elements, frame, options, isMangaFrame) {
  if (isMangaFrame) {
    applyMangaFramePresentation(elements, frame, options);
  } else {
    delete elements.root.dataset.mangaFrame;
    delete elements.root.dataset.mangaLength;
  }
  renderCurrentLyrics(elements.current, frame, options);
  elements.current.dataset.currentText = frame.currentText;
  elements.next.textContent = isMangaFrame ? '' : frame.nextText;
  elements.root.hidden = !frame.visible;
  elements.root.setAttribute('lang', frame.language || 'und');
  elements.root.dataset.revision = String(frame.revision);
  applyMusicStructurePresentation(elements, frame, options);
}

function clearMangaTransition(root, token) {
  if (mangaTransitions.get(root) === token) mangaTransitions.delete(root);
}

function transitionMangaFrame(elements, frame, options, enterOnly = false) {
  const root = elements.root;
  const gsap = resolveGsap(options);
  const activeTransition = mangaTransitions.get(root);
  if (
    activeTransition?.targetText === frame.currentText &&
    activeTransition.visible === frame.visible
  ) {
    activeTransition.frame = frame;
    activeTransition.options = options;
    return;
  }
  activeTransition?.timeline?.kill?.();

  const token = {
    timeline: null,
    frame,
    options,
    targetText: frame.currentText,
    visible: frame.visible,
  };
  mangaTransitions.set(root, token);
  const timeline = gsap.timeline({
    onComplete: () => clearMangaTransition(root, token),
  });
  token.timeline = timeline;

  if (enterOnly) {
    commitLyricsFrame(elements, frame, options, true);
    if (!frame.visible) {
      clearMangaTransition(root, token);
      timeline.kill?.();
      return;
    }
    gsap.set(root, { autoAlpha: 0 });
    timeline.addLabel('enter').to(
      root,
      {
        autoAlpha: 1,
        duration: MANGA_FADE_IN_DURATION_SECONDS,
        ease: 'power2.out',
        overwrite: 'auto',
      },
      'enter',
    );
    return;
  }

  timeline
    .addLabel('exit')
    .to(
      root,
      {
        autoAlpha: 0,
        duration: MANGA_FADE_OUT_DURATION_SECONDS,
        ease: 'power2.in',
        overwrite: 'auto',
      },
      'exit',
    )
    .add(() => {
      if (mangaTransitions.get(root) !== token) return;
      commitLyricsFrame(elements, token.frame, token.options, true);
      if (token.frame.visible) gsap.set(root, { autoAlpha: 0 });
    });
  if (frame.visible) {
    timeline.addLabel('enter').to(
      root,
      {
        autoAlpha: 1,
        duration: MANGA_FADE_IN_DURATION_SECONDS,
        ease: 'power2.out',
        overwrite: 'auto',
      },
      'enter',
    );
  }
}

function stopMangaAnimations(elements, options = {}, clearProps = false) {
  const gsap = resolveGsap(options);
  mangaTransitions.get(elements.root)?.timeline?.kill?.();
  mangaTransitions.delete(elements.root);
  mangaPulseTimelines.get(elements.root)?.kill?.();
  mangaPulseTimelines.delete(elements.root);
  gsap?.killTweensOf?.(elements.root);
  gsap?.killTweensOf?.(Array.from(elements.current.children ?? []));
  if (clearProps) {
    gsap?.set?.(elements.root, {
      clearProps: 'opacity,visibility,scale',
    });
  }
}

export function destroyLyricsAnimations(elements, options = {}) {
  stopMangaAnimations(elements, options, true);
}

export function renderLyricsFrame(elements, frame, options = {}) {
  const previousText =
    elements.current.dataset.currentText ?? elements.current.textContent;
  const templateId = activeTemplateId(elements, options);
  const renderOptions = { ...options, templateId };
  const isMangaFrame = templateId === 'manga-frame';
  const lineChanged = previousText !== frame.currentText;
  const gsap = resolveGsap(renderOptions);
  const canAnimateManga =
    isMangaFrame &&
    lineChanged &&
    renderOptions.reducedMotion !== true &&
    typeof gsap?.timeline === 'function';

  if (canAnimateManga && !elements.root.hidden && previousText) {
    transitionMangaFrame(elements, frame, renderOptions);
    return;
  }

  if (!isMangaFrame || renderOptions.reducedMotion === true) {
    stopMangaAnimations(
      elements,
      renderOptions,
      !isMangaFrame || renderOptions.reducedMotion === true,
    );
  }

  if (canAnimateManga) {
    transitionMangaFrame(elements, frame, renderOptions, true);
    return;
  }

  commitLyricsFrame(elements, frame, renderOptions, isMangaFrame);

  const shouldAnimate =
    !isMangaFrame &&
    frame.visible &&
    lineChanged &&
    renderOptions.reducedMotion !== true &&
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
    mangaFrame: document.querySelector('#lyrics-manga-frame'),
    next: document.querySelector('#lyrics-next'),
  };
  if (!elements.root || !elements.current || !elements.next) return;

  const gsap = globalThis.gsap ?? null;
  let reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  let frameScheduler = null;
  const motionMedia = gsap?.matchMedia?.() ?? null;
  motionMedia?.add(
    { reducedMotion: '(prefers-reduced-motion: reduce)' },
    (context) => {
      reducedMotion = context.conditions?.reducedMotion === true;
      frameScheduler?.refresh();
    },
  );
  const previewMode = isPreviewMode(window.location);
  applyOverlayAppearance(document, null);
  applyPreviewCanvas(document, { previewMode, location: window.location });
  if (previewMode) {
    renderLyricsFrame(elements, PREVIEW_FRAME, {
      gsap,
      reducedMotion: true,
    });
  }
  frameScheduler = createLyricsFrameScheduler({
    onFrame: (frame) => {
      const visibleFrame = withPreviewFallback(
        frame,
        PREVIEW_FRAME,
        previewMode,
      );
      renderLyricsFrame(elements, visibleFrame, { gsap, reducedMotion });
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
      destroyLyricsAnimations(elements, { gsap });
      motionMedia?.revert();
      connection.stop();
    },
    { once: true },
  );
}

if (typeof document !== 'undefined') boot();
