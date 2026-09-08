import { createOverlayConnection } from '../shared/runtime.mjs';
import {
  applyOverlayAppearance,
  normalizeOverlayAppearance,
} from '../shared/appearance.mjs';
import {
  applyPreviewCanvas,
  isPreviewMode,
  isWorkbenchMode,
  withPreviewFallback,
} from '../shared/preview.mjs';
import {
  nextPresentationBoundaryDelayMs,
  selectLyricsOverlayFrame,
} from '../shared/state.mjs';
import {
  adaptKtvLyricsPresentation,
  adaptMangaLyricsPresentation,
  analyzeLyricsSource,
  createLyricsPresentationDocumentCache,
} from '../shared/lyricsPresentation.mjs';
import {
  mangaFrameLengthTier,
  mangaFramePlacementForBubble,
  mangaFrameTextLayout,
} from '../shared/mangaFrameContract.mjs';
import {
  applyMangaFramePresentation,
  renderMangaFrameSvg,
} from './mangaFrame.mjs';
import {
  clearLiveStagePresentation,
  renderLiveStagePresentation,
} from './liveStage.mjs';
import {
  clearKineticPopPresentation,
  renderKineticPopPresentation,
  stopKineticPopTransition,
} from './kineticPop.mjs';

const PREVIEW_FRAME = Object.freeze({
  revision: 0,
  visible: true,
  currentText: '一つずつ こぼした音が',
  nextText: '重なって歌になる',
  language: 'ja',
  lineIndex: 0,
  currentVisibleLineIndex: 0,
  nextVisibleLineIndex: 1,
  liveStage: {
    active: true,
    cardVisible: true,
    trackId: 'preview-track',
    title: '如果可以',
    artist: '韋禮安',
  },
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
const MANGA_FADE_OUT_DURATION_SECONDS = 0.14;
const MANGA_FADE_IN_DURATION_SECONDS = 0.16;
const MANGA_BUBBLE_EXIT_STAGGER_SECONDS = 0.06;
const MANGA_BUBBLE_ENTER_GAP_SECONDS = 1;
const KTV_DEFAULT_LANE_REPLACEMENT_DELAY_MS = 600;
const KTV_MAX_LANE_REPLACEMENT_DELAY_MS = 5000;
const ktvFallbackAnimations = new WeakMap();
const ktvFallbackAnimationKeys = new WeakMap();
const ktvLanePresentations = new WeakMap();
const lyricsRenderStates = new WeakMap();
const segmentPaintAnimations = new WeakMap();
const mangaTransitions = new WeakMap();
const mangaLineIndexes = new WeakMap();
const mangaRenderKeys = new WeakMap();

function resolveGsap(options) {
  return options.gsap ?? globalThis.gsap ?? null;
}

function lyricsDiagnosticsEnabled(location) {
  return (
    isWorkbenchMode(location) &&
    new URLSearchParams(location?.search ?? '').get('lyricsDebug') === '1'
  );
}

export function createLyricsDiagnostics(options = {}) {
  const location = options.location ?? globalThis.location;
  const consoleApi = options.consoleApi ?? globalThis.console;
  const enabled = lyricsDiagnosticsEnabled(location);
  if (!enabled || typeof consoleApi?.log !== 'function') return null;
  return (event, details = {}) => {
    consoleApi.log('[Utawakui lyrics]', event, details);
  };
}

function boundedDiagnosticText(value, maximumLength) {
  const text = String(value ?? '');
  return text.length <= maximumLength
    ? text
    : `${text.slice(0, maximumLength)}…`;
}

export function createLyricsErrorReporter(options = {}) {
  const location = options.location ?? globalThis.location;
  const consoleApi = options.consoleApi ?? globalThis.console;
  const enabled = lyricsDiagnosticsEnabled(location);
  if (!enabled || typeof consoleApi?.error !== 'function') return null;
  return (error, details = {}) => {
    consoleApi.error('[Utawakui lyrics]', 'render-error', {
      ...details,
      errorName: boundedDiagnosticText(error?.name || 'Error', 80),
      message: boundedDiagnosticText(error?.message || error, 320),
      stack: error?.stack
        ? boundedDiagnosticText(error.stack, 2000)
        : undefined,
    });
  };
}

function traceLyrics(options, event, details) {
  options.trace?.(event, details);
}

function setTextContent(element, value) {
  const text = String(value ?? '');
  if (element.textContent !== text) element.textContent = text;
}

function lyricLineKey(frame) {
  const lineIndex = Number.isSafeInteger(frame.currentVisibleLineIndex)
    ? frame.currentVisibleLineIndex
    : Number.isSafeInteger(frame.lineIndex)
      ? frame.lineIndex
      : '';
  return `${lineIndex}\0${frame.currentText ?? ''}`;
}

function segmentStructureKey(segments) {
  return segments
    .map((segment) => `${segment.segmentId ?? ''}\0${segment.text ?? ''}`)
    .join('\u0001');
}

function cancelSegmentPaintAnimation(element, options) {
  const active = segmentPaintAnimations.get(element);
  if (!active) return;
  active.animation?.cancel?.();
  if (active.engine === 'gsap') {
    resolveGsap(options)?.killTweensOf?.(element);
  }
  segmentPaintAnimations.delete(element);
}

function clearLyricsRenderState(element, options) {
  const state = lyricsRenderStates.get(element);
  for (const node of state?.nodes ?? []) {
    cancelSegmentPaintAnimation(node, options);
  }
  lyricsRenderStates.delete(element);
}

function progressPercentage(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 10000) / 100;
}

function ktvLaneForVisibleLineIndex(value) {
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value % 2 === 0 ? 'a' : 'b';
}

function setKtvLane(element, lane) {
  if (lane) element.dataset.ktvLane = lane;
  else delete element.dataset.ktvLane;
}

function setKtvRole(element, role) {
  if (role) element.dataset.ktvRole = role;
  else delete element.dataset.ktvRole;
}

function stripKtvCueFromSegments(segments, presentation) {
  if (
    !Array.isArray(segments) ||
    !Number.isSafeInteger(presentation?.contentStart) ||
    presentation.contentStart <= 0 ||
    typeof presentation.sourceText !== 'string'
  ) {
    return segments;
  }
  const cueText = presentation.sourceText.slice(0, presentation.contentStart);
  if (
    !segments
      .map((segment) => segment.text)
      .join('')
      .startsWith(cueText)
  ) {
    return segments;
  }
  let remaining = presentation.contentStart;
  const projected = [];
  for (const segment of segments) {
    const text = String(segment.text ?? '');
    if (remaining >= text.length) {
      remaining -= text.length;
      continue;
    }
    projected.push(
      remaining > 0 ? { ...segment, text: text.slice(remaining) } : segment,
    );
    remaining = 0;
  }
  return projected.filter((segment) => segment.text);
}

function projectKtvFrame(frame) {
  if (frame.ktv) {
    const source = frame.ktv;
    const current =
      source.currentRole === undefined
        ? adaptKtvLyricsPresentation(analyzeLyricsSource(source.currentText), {
            language: source.language,
          })
        : { text: source.currentText, role: source.currentRole };
    const next =
      source.nextRole === undefined
        ? adaptKtvLyricsPresentation(analyzeLyricsSource(source.nextText), {
            language: source.language,
          })
        : { text: source.nextText, role: source.nextRole };
    return {
      ...frame,
      ...source,
      currentText: current.text,
      nextText: next.text,
      nextSegments: stripKtvCueFromSegments(source.nextSegments, next),
      ktvCurrentRole: source.currentRole ?? current.role,
      ktvNextRole: source.nextRole ?? next.role,
      ktvNextHeld: source.nextHeld === true,
      ktvCountIn: source.countIn
        ? {
            remainingBeats: source.countIn.remainingBeats,
            totalBeats: source.countIn.totalBeats,
            timingSource: source.countIn.timingSource,
            visibleLineIndex:
              source.countIn.visibleLineIndex ?? source.currentVisibleLineIndex,
            laneIndex:
              source.countIn.laneIndex ?? source.currentLaneIndex ?? null,
            role: source.countIn.role ?? source.currentRole ?? current.role,
          }
        : null,
    };
  }

  const countIn = frame.countIn;
  const currentText = countIn?.text ?? frame.currentText;
  const current = adaptKtvLyricsPresentation(
    countIn
      ? analyzeLyricsSource(currentText)
      : (frame.lyricsSourceAnalysis ?? analyzeLyricsSource(currentText)),
  );
  const next = adaptKtvLyricsPresentation(
    analyzeLyricsSource(countIn ? '' : frame.nextText),
  );
  return {
    ...frame,
    visible: frame.visible || Boolean(countIn),
    currentText: current.text,
    nextText: next.text,
    currentSegments: countIn
      ? undefined
      : stripKtvCueFromSegments(frame.currentSegments, current),
    nextSegments: countIn
      ? undefined
      : stripKtvCueFromSegments(frame.nextSegments, next),
    lineIndex: countIn?.lineIndex ?? frame.lineIndex,
    currentVisibleLineIndex:
      countIn?.visibleLineIndex ?? frame.currentVisibleLineIndex,
    nextVisibleLineIndex: countIn ? null : frame.nextVisibleLineIndex,
    ...(countIn ? { lineProgress: 0 } : {}),
    ktvCurrentRole: current.role,
    ktvNextRole: next.role,
    ktvCountIn: countIn
      ? {
          remainingBeats: countIn.remainingBeats,
          totalBeats: countIn.totalBeats,
          timingSource: countIn.timingSource,
        }
      : null,
  };
}

function cancelKtvFallbackAnimation(element) {
  ktvFallbackAnimations.get(element)?.cancel?.();
  ktvFallbackAnimations.delete(element);
  ktvFallbackAnimationKeys.delete(element);
}

function clearKtvFallbackProgress(element) {
  cancelKtvFallbackAnimation(element);
  delete element.dataset.lineProgress;
  delete element.dataset.text;
  element.style?.removeProperty?.('--ovl-segment-progress');
}

function cancelKtvLaneHold(state) {
  const hold = state?.hold;
  if (!hold) return;
  hold.cancelSchedule?.(hold.timer);
  state.hold = null;
}

function clearKtvLanePresentation(root) {
  const state = ktvLanePresentations.get(root);
  cancelKtvLaneHold(state);
  ktvLanePresentations.delete(root);
}

function secondaryKtvFrame(frame) {
  return {
    ...frame,
    currentText: frame.nextText,
    currentSegments: frame.nextSegments,
    currentVisibleLineIndex: frame.nextVisibleLineIndex,
    currentLaneIndex: frame.nextLaneIndex,
    currentRole: frame.ktvNextRole,
    lineIndex: frame.nextVisibleLineIndex,
    lineProgress: 0,
    lineRemainingMs: null,
  };
}

function ktvLaneElement(elements, lane) {
  if (lane === 'a') return elements.current;
  if (lane === 'b') return elements.next;
  return null;
}

function applyKtvLaneReplacementDelay(elements, frame, options, presentation) {
  const root = elements.root;
  const currentIndex = frame.currentVisibleLineIndex;
  const currentLane = presentation.currentLane;
  let nextLane = presentation.nextLane;
  let nextElement = presentation.nextElement;
  if (
    options.templateId !== 'karaoke-stack' ||
    !frame.visible ||
    !Number.isSafeInteger(currentIndex) ||
    !currentLane
  ) {
    clearKtvLanePresentation(root);
    return false;
  }

  const previous = ktvLanePresentations.get(root);
  const sameLine = previous?.currentVisibleLineIndex === currentIndex;
  if (sameLine && frame.ktvNextHeld === true) {
    cancelKtvLaneHold(previous);
    previous.currentText = frame.currentText;
    previous.currentRole = frame.ktvCurrentRole;
    return false;
  }
  if (sameLine && previous.hold) {
    previous.currentText = frame.currentText;
    previous.currentRole = frame.ktvCurrentRole;
    previous.hold.targetRole = frame.ktvNextRole;
    previous.hold.targetFrame = secondaryKtvFrame(frame);
    if (frame.timelineDiscontinuity === true) {
      cancelKtvLaneHold(previous);
      return false;
    }
    if (nextLane && nextLane !== previous.hold.lane) {
      cancelKtvLaneHold(previous);
      return false;
    }
    setKtvLane(previous.hold.element, previous.hold.lane);
    setTextContent(previous.hold.element, previous.hold.heldText);
    setKtvRole(previous.hold.element, previous.hold.heldRole);
    previous.hold.element.dataset.ktvHeld = 'true';
    return true;
  }

  const sequentialLine =
    previous &&
    currentIndex === previous.currentVisibleLineIndex + 1 &&
    currentLane !== previous.currentLane;
  if (sequentialLine && !nextLane && !frame.nextText) {
    nextLane = previous.currentLane;
    nextElement = ktvLaneElement(elements, nextLane);
    setKtvLane(nextElement, nextLane);
  }
  const sequentialHandoff =
    sequentialLine &&
    nextLane === previous.currentLane &&
    frame.timelineDiscontinuity !== true;
  const replacementDelayMs = Number.isFinite(frame.laneReplacementDelayMs)
    ? Math.max(
        0,
        Math.min(
          KTV_MAX_LANE_REPLACEMENT_DELAY_MS,
          frame.laneReplacementDelayMs,
        ),
      )
    : KTV_DEFAULT_LANE_REPLACEMENT_DELAY_MS;
  cancelKtvLaneHold(previous);

  const state = {
    currentVisibleLineIndex: currentIndex,
    currentLane,
    currentText: frame.currentText,
    currentRole: frame.ktvCurrentRole,
    hold: null,
  };
  ktvLanePresentations.set(root, state);
  if (
    frame.ktvNextHeld === true ||
    !sequentialHandoff ||
    !previous.currentText ||
    !nextLane ||
    replacementDelayMs <= 0
  ) {
    return false;
  }

  const schedule = options.schedule ?? globalThis.setTimeout?.bind(globalThis);
  const cancelSchedule =
    options.cancelSchedule ?? globalThis.clearTimeout?.bind(globalThis);
  if (typeof schedule !== 'function') return false;

  const hold = {
    lane: nextLane,
    heldText: previous.currentText,
    heldRole: previous.currentRole,
    targetRole: frame.ktvNextRole,
    targetFrame: secondaryKtvFrame(frame),
    element: nextElement,
    timer: null,
    cancelSchedule,
  };
  state.hold = hold;
  setTextContent(hold.element, hold.heldText);
  setKtvRole(hold.element, hold.heldRole);
  hold.element.dataset.ktvHeld = 'true';
  hold.timer = schedule(() => {
    const latest = ktvLanePresentations.get(root);
    if (latest !== state || latest.hold !== hold) return;
    if (hold.element.dataset.ktvLane === hold.lane) {
      renderCurrentLyrics(hold.element, hold.targetFrame, options);
      setKtvRole(hold.element, hold.targetRole);
      delete hold.element.dataset.ktvHeld;
    }
    latest.hold = null;
  }, replacementDelayMs);
  return true;
}

function applyKtvLanePresentation(elements, frame, templateId) {
  if (templateId !== 'karaoke-stack') {
    delete elements.root.dataset.ktvActiveLane;
    setKtvLane(elements.current, null);
    setKtvLane(elements.next, null);
    setKtvRole(elements.current, null);
    setKtvRole(elements.next, null);
    delete elements.current.dataset.ktvActive;
    delete elements.next.dataset.ktvActive;
    delete elements.current.dataset.ktvHeld;
    delete elements.next.dataset.ktvHeld;
    return null;
  }

  const fallbackCurrentIndex = frame.currentText ? frame.lineIndex : null;
  const currentIndex = Number.isSafeInteger(frame.currentVisibleLineIndex)
    ? frame.currentVisibleLineIndex
    : fallbackCurrentIndex;
  const nextIndex = Number.isSafeInteger(frame.nextVisibleLineIndex)
    ? frame.nextVisibleLineIndex
    : Number.isSafeInteger(currentIndex) && frame.nextText
      ? currentIndex + 1
      : null;
  const currentLaneIndex = Number.isSafeInteger(frame.currentLaneIndex)
    ? frame.currentLaneIndex
    : currentIndex;
  const nextLaneIndex = Number.isSafeInteger(frame.nextLaneIndex)
    ? frame.nextLaneIndex
    : nextIndex;
  const currentLane = ktvLaneForVisibleLineIndex(currentLaneIndex);
  const nextLane = ktvLaneForVisibleLineIndex(nextLaneIndex);
  const currentElement =
    ktvLaneElement(elements, currentLane) ?? elements.current;
  const nextElement =
    ktvLaneElement(elements, nextLane) ??
    (currentElement === elements.current ? elements.next : elements.current);

  setKtvLane(
    elements.current,
    currentElement === elements.current ? currentLane : nextLane,
  );
  setKtvLane(
    elements.next,
    currentElement === elements.next ? currentLane : nextLane,
  );
  setKtvRole(elements.current, null);
  setKtvRole(elements.next, null);
  delete elements.current.dataset.ktvActive;
  delete elements.next.dataset.ktvActive;
  delete elements.current.dataset.ktvHeld;
  delete elements.next.dataset.ktvHeld;
  setKtvRole(currentElement, frame.ktvCurrentRole);
  setKtvRole(nextElement, frame.ktvNextRole);
  if (frame.ktvNextHeld === true && nextLane && frame.nextText) {
    nextElement.dataset.ktvHeld = 'true';
  }
  if (currentLane && frame.currentText) {
    currentElement.dataset.ktvActive = 'true';
    elements.root.dataset.ktvActiveLane = currentLane;
  } else {
    delete elements.root.dataset.ktvActiveLane;
  }
  return { currentElement, currentLane, nextElement, nextLane };
}

function applyKtvCountInPresentation(elements, frame, templateId) {
  const element = elements.ktvCountIn;
  if (!element) return;
  const remainingBeats = frame.ktvCountIn?.remainingBeats;
  const visible =
    templateId === 'karaoke-stack' &&
    Number.isSafeInteger(remainingBeats) &&
    remainingBeats >= 1 &&
    remainingBeats <= 4;
  element.hidden = !visible;
  if (!visible) {
    delete element.dataset.remainingBeats;
    setKtvLane(element, null);
    setKtvRole(element, null);
    return;
  }
  element.dataset.remainingBeats = String(remainingBeats);
  setKtvLane(
    element,
    ktvLaneForVisibleLineIndex(
      frame.ktvCountIn?.laneIndex ??
        frame.ktvCountIn?.visibleLineIndex ??
        frame.currentLaneIndex ??
        frame.currentVisibleLineIndex,
    ),
  );
  setKtvRole(element, frame.ktvCountIn?.role ?? frame.ktvCurrentRole);
}

function renderCurrentLyrics(element, frame, options) {
  const templateId = options.templateId ?? '';
  const gsap = resolveGsap(options);
  const segments = Array.isArray(frame.currentSegments)
    ? frame.currentSegments
    : [];
  const documentApi = element.ownerDocument ?? globalThis.document;
  const lineKey = lyricLineKey(frame);
  if (segments.length === 0 || !documentApi?.createElement) {
    const previousState = lyricsRenderStates.get(element);
    if (previousState?.mode === 'segments') {
      clearLyricsRenderState(element, options);
    }
    delete element.dataset.segmented;
    if (
      previousState?.mode !== 'plain' ||
      previousState.lineKey !== lineKey ||
      element.textContent !== String(frame.currentText ?? '')
    ) {
      setTextContent(element, frame.currentText);
    }
    lyricsRenderStates.set(element, { lineKey, mode: 'plain', nodes: [] });
    if (
      templateId === 'karaoke-stack' &&
      frame.currentText &&
      Number.isFinite(frame.lineProgress)
    ) {
      const progress = progressPercentage(frame.lineProgress);
      element.dataset.lineProgress = 'true';
      element.dataset.text = frame.currentText;
      const canAnimate =
        Number.isFinite(frame.lineRemainingMs) &&
        frame.lineRemainingMs > 0 &&
        options.reducedMotion !== true &&
        typeof element.animate === 'function';
      const animationIsCurrent =
        ktvFallbackAnimationKeys.get(element) === lineKey &&
        frame.timelineDiscontinuity !== true;
      if (canAnimate && animationIsCurrent) {
        traceLyrics(options, 'sweep-reuse', {
          lineIndex: frame.currentVisibleLineIndex ?? frame.lineIndex ?? null,
          mode: 't1',
          progress,
          revision: frame.revision,
          templateId,
        });
        return;
      }

      cancelKtvFallbackAnimation(element);
      element.style.setProperty('--ovl-segment-progress', `${progress}%`);
      if (canAnimate) {
        traceLyrics(options, 'sweep-start', {
          durationMs: Math.max(1, Math.ceil(frame.lineRemainingMs)),
          lineIndex: frame.currentVisibleLineIndex ?? frame.lineIndex ?? null,
          mode: 't1',
          progress,
          revision: frame.revision,
          templateId,
          timelineDiscontinuity: frame.timelineDiscontinuity === true,
        });
        const animation = element.animate(
          [
            { '--ovl-segment-progress': `${progress}%` },
            { '--ovl-segment-progress': '100%' },
          ],
          {
            duration: Math.max(1, Math.ceil(frame.lineRemainingMs)),
            easing: 'linear',
            fill: 'forwards',
          },
        );
        if (animation) ktvFallbackAnimations.set(element, animation);
        ktvFallbackAnimationKeys.set(element, lineKey);
      }
    } else {
      clearKtvFallbackProgress(element);
    }
    return;
  }

  clearKtvFallbackProgress(element);
  const structureKey = `${lineKey}\0${segmentStructureKey(segments)}`;
  let state = lyricsRenderStates.get(element);
  if (state?.mode !== 'segments' || state.structureKey !== structureKey) {
    clearLyricsRenderState(element, options);
    setTextContent(element, '');
    const nodes = segments.map((segment) => {
      const segmentElement = documentApi.createElement('span');
      segmentElement.className = 'lyrics-overlay__segment';
      segmentElement.dataset.segmentId = segment.segmentId;
      segmentElement.dataset.text = segment.text;
      segmentElement.textContent = segment.text;
      element.append(segmentElement);
      return segmentElement;
    });
    state = { mode: 'segments', nodes, structureKey };
    lyricsRenderStates.set(element, state);
  }
  element.dataset.segmented = 'true';
  for (const [index, segment] of segments.entries()) {
    const segmentElement = state.nodes[index];
    const progress = Number.isFinite(segment.progress)
      ? progressPercentage(segment.progress)
      : segment.state === 'active'
        ? 100
        : 0;
    const targetProgress = Number.isFinite(segment.targetProgress)
      ? progressPercentage(segment.targetProgress)
      : 100;
    const delayMs =
      Number.isFinite(segment.delayMs) && segment.delayMs > 0
        ? segment.delayMs
        : 0;
    segmentElement.dataset.segmentState = segment.state;
    const canAnimate =
      segment.state === 'active' &&
      Number.isFinite(segment.remainingMs) &&
      segment.remainingMs > 0 &&
      options.reducedMotion !== true;
    const animationKey = `${structureKey}\0${segment.segmentId ?? index}`;
    const activeAnimation = segmentPaintAnimations.get(segmentElement);
    const animationIsCurrent =
      activeAnimation?.key === animationKey &&
      frame.timelineDiscontinuity !== true;
    if (canAnimate && animationIsCurrent) {
      traceLyrics(options, 'sweep-reuse', {
        lineIndex: frame.currentVisibleLineIndex ?? frame.lineIndex ?? null,
        mode: 't2',
        progress,
        revision: frame.revision,
        segmentIndex: index,
        templateId,
      });
      continue;
    }

    cancelSegmentPaintAnimation(segmentElement, options);
    segmentElement.style.setProperty('--ovl-segment-progress', `${progress}%`);
    if (canAnimate) {
      traceLyrics(options, 'sweep-start', {
        durationMs: Math.max(1, Math.ceil(segment.remainingMs)),
        lineIndex: frame.currentVisibleLineIndex ?? frame.lineIndex ?? null,
        mode: 't2',
        progress,
        revision: frame.revision,
        segmentIndex: index,
        templateId,
        timelineDiscontinuity: frame.timelineDiscontinuity === true,
      });
      if (templateId === 'manga-frame' && typeof gsap?.to === 'function') {
        const animation = gsap.to(segmentElement, {
          '--ovl-segment-progress': `${targetProgress}%`,
          delay: delayMs / 1000,
          duration: Math.max(0.001, segment.remainingMs / 1000),
          ease: 'none',
          overwrite: 'auto',
        });
        segmentPaintAnimations.set(segmentElement, {
          animation,
          engine: 'gsap',
          key: animationKey,
        });
      } else if (typeof segmentElement.animate === 'function') {
        const animation = segmentElement.animate(
          [
            { '--ovl-segment-progress': `${progress}%` },
            { '--ovl-segment-progress': `${targetProgress}%` },
          ],
          {
            delay: Math.max(0, Math.ceil(delayMs)),
            duration: Math.max(1, Math.ceil(segment.remainingMs)),
            easing: 'linear',
            fill: 'forwards',
          },
        );
        segmentPaintAnimations.set(segmentElement, {
          animation,
          engine: 'waapi',
          key: animationKey,
        });
      }
    }
  }
}

function createMangaBubble(
  documentApi,
  presentation,
  textLayout,
  placement,
  options,
) {
  const bubble = documentApi.createElement('span');
  bubble.className = 'lyrics-overlay__manga-bubble';
  bubble.dataset.lyricKind = presentation.kind;
  bubble.dataset.mangaLength = mangaFrameLengthTier(presentation.text);
  bubble.dataset.mangaScript = textLayout.script;
  bubble.dataset.mangaColumns = String(textLayout.columnCount);
  bubble.dataset.mangaSide = placement.side;
  bubble.dataset.mangaOrder = String(placement.order);
  bubble.style.setProperty(
    '--ovl-manga-anchor-y',
    `${placement.anchorYPercent}%`,
  );
  bubble.style.setProperty(
    '--ovl-manga-inline-jitter',
    `${placement.inlineJitterRem}rem`,
  );
  bubble.style.setProperty(
    '--ovl-manga-frame-required-block-size',
    `${textLayout.requiredBlockSizeEm}em`,
  );

  const svg = documentApi.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'lyrics-overlay__manga-frame');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  renderMangaFrameSvg(
    svg,
    presentation.kind === 'aside'
      ? options.mangaFrameId === 'whisper'
        ? 'thought'
        : 'whisper'
      : options.mangaFrameId,
  );

  const text = documentApi.createElement('strong');
  text.className = 'lyrics-overlay__manga-text';
  text.dataset.lyricKind = presentation.kind;
  bubble.append(svg, text);
  return { bubble, text };
}

function clearMangaBubbleTiming(bubble, options) {
  if (!bubble.dataset.mangaTimingState) return;
  resolveGsap(options)?.killTweensOf?.(bubble);
  delete bubble.dataset.mangaTimingState;
  bubble.style.removeProperty?.('opacity');
  bubble.style.removeProperty?.('visibility');
}

function applyMangaBubbleTiming(bubble, timing, frame, options) {
  if (!timing || !['revealed', 'upcoming'].includes(timing.state)) {
    clearMangaBubbleTiming(bubble, options);
    return;
  }
  const previousState = bubble.dataset.mangaTimingState;
  const gsap = resolveGsap(options);
  if (previousState === timing.state) {
    if (
      frame.timelineDiscontinuity === true ||
      options.reducedMotion === true
    ) {
      gsap?.killTweensOf?.(bubble);
      bubble.style.setProperty(
        'opacity',
        timing.state === 'revealed' ? '1' : '0',
      );
      bubble.style.setProperty(
        'visibility',
        timing.state === 'revealed' ? 'visible' : 'hidden',
      );
    }
    return;
  }
  bubble.dataset.mangaTimingState = timing.state;
  if (timing.state === 'upcoming') {
    gsap?.killTweensOf?.(bubble);
    bubble.style.setProperty('opacity', '0');
    bubble.style.setProperty('visibility', 'hidden');
    return;
  }

  const animate =
    previousState === 'upcoming' &&
    frame.timelineDiscontinuity !== true &&
    options.reducedMotion !== true &&
    typeof gsap?.to === 'function';
  bubble.style.setProperty('visibility', 'visible');
  if (animate) {
    gsap.to(bubble, {
      autoAlpha: 1,
      duration: MANGA_FADE_IN_DURATION_SECONDS,
      ease: 'power2.out',
      overwrite: 'auto',
    });
    return;
  }
  gsap?.killTweensOf?.(bubble);
  bubble.style.setProperty('opacity', '1');
}

function renderMangaLyrics(elements, frame, options) {
  const group = elements.mangaBubbles;
  const documentApi = group?.ownerDocument ?? globalThis.document;
  if (!group || !documentApi?.createElement || !documentApi?.createElementNS) {
    clearLyricsRenderState(elements.current, options);
    delete elements.current.dataset.segmented;
    setTextContent(elements.current, frame.currentText);
    return;
  }

  if (!String(frame.currentText ?? '').trim()) {
    clearMangaLyrics(elements);
    clearLyricsRenderState(elements.current, options);
    delete elements.current.dataset.segmented;
    elements.current.hidden = true;
    setTextContent(elements.current, '');
    return;
  }

  const presentation = adaptMangaLyricsPresentation(
    frame.lyricsSourceAnalysis ?? analyzeLyricsSource(frame.currentText),
    { language: frame.language },
  );
  const bubbles = presentation.bubbles;
  const furiganaEnabled =
    elements.root.ownerDocument?.documentElement?.dataset?.ovlFurigana !==
    'off';
  const placements = bubbles.map((bubble, index) => ({
    ...mangaFramePlacementForBubble({
      bubbleCount: bubbles.length,
      bubbleIndex: index,
      lineIndex: frame.lineIndex,
      text: bubble.text,
    }),
    order: index + 1,
  }));
  const renderKey = [
    lyricLineKey(frame),
    options.mangaFrameId ?? '',
    String(frame.language ?? ''),
    furiganaEnabled ? 'furigana' : 'plain',
    JSON.stringify(frame.currentReading ?? null),
    bubbles.map((bubble) => `${bubble.kind}\0${bubble.text}`).join('\u0001'),
  ].join('\u0002');
  const canReuseBubbles =
    mangaRenderKeys.get(elements.root) === renderKey &&
    group.children.length === bubbles.length;

  if (!canReuseBubbles) {
    setTextContent(group, '');
  }

  group.dataset.mangaCount = String(bubbles.length);
  group.dataset.mangaLayout = placements
    .map((placement) => placement.side)
    .join('-');
  elements.root.dataset.mangaSide = placements[0]?.side ?? 'right';
  group.hidden = !frame.visible;
  elements.root.setAttribute('aria-label', frame.currentText);
  elements.current.hidden = true;
  setTextContent(elements.current, '');

  for (const [index, bubblePresentation] of bubbles.entries()) {
    const textLayout = mangaFrameTextLayout(
      bubblePresentation.text,
      bubbles.length,
      {
        language: frame.language,
        includeRuby: furiganaEnabled,
        readingLine: frame.currentReading,
        sourceRanges: bubblePresentation.sourceRanges,
      },
    );
    const existingBubble = canReuseBubbles ? group.children[index] : null;
    const created = existingBubble
      ? { bubble: existingBubble, text: existingBubble.children[1] }
      : createMangaBubble(
          documentApi,
          bubblePresentation,
          textLayout,
          placements[index],
          options,
        );
    const { bubble, text } = created;
    renderMangaText(documentApi, text, textLayout);
    applyMangaBubbleTiming(
      bubble,
      frame.currentTimingSource === 't2'
        ? frame.mangaBubbleTiming?.[index]
        : null,
      frame,
      options,
    );
    if (!existingBubble) group.append(bubble);
  }
  mangaRenderKeys.set(elements.root, renderKey);
  setTextContent(elements.current, frame.currentText);
}

function renderMangaText(documentApi, element, layout) {
  if (!layout.hasRuby) {
    setTextContent(element, layout.displayText);
    return;
  }
  setTextContent(element, '');
  for (const [columnIndex, column] of layout.columnTokens.entries()) {
    if (columnIndex > 0) element.append(documentApi.createElement('br'));
    for (const token of column) {
      if (token.reading) {
        const ruby = documentApi.createElement('ruby');
        ruby.textContent = token.text;
        const rt = documentApi.createElement('rt');
        rt.textContent = token.reading;
        ruby.append(rt);
        element.append(ruby);
      } else if (token.text) {
        const span = documentApi.createElement('span');
        span.textContent = token.text;
        element.append(span);
      }
    }
  }
}

function clearMangaLyrics(elements) {
  if (elements.mangaBubbles) {
    if (
      elements.mangaBubbles.textContent ||
      elements.mangaBubbles.children.length > 0
    ) {
      setTextContent(elements.mangaBubbles, '');
    }
    elements.mangaBubbles.hidden = true;
    delete elements.mangaBubbles.dataset.mangaCount;
    delete elements.mangaBubbles.dataset.mangaSide;
    delete elements.mangaBubbles.dataset.mangaLayout;
  }
  mangaRenderKeys.delete(elements.root);
  elements.root.removeAttribute?.('aria-label');
  elements.current.hidden = false;
}

function renderLiveStageFrame(elements, frame, options) {
  clearMangaLyrics(elements);
  renderLiveStagePresentation(elements, frame, options);
  applyMusicStructurePresentation(elements, frame, options);
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
    return;
  }

  elements.root.dataset.musicLevel = music.level;
  const section = music.activeSection;
  if (confidentCue(section) && PRESENTATION_SECTION_ROLES.has(section.role)) {
    elements.root.dataset.musicSection = section.role;
  }

  const beat = music.currentBeat;
  const confidentBeat =
    confidentCue(beat) && Number.isFinite(beat.timeMs) ? beat : null;
  if (confidentBeat?.downbeat === true) {
    elements.root.dataset.musicDownbeat = 'true';
  }
  traceLyrics(options, 'music-cue', {
    downbeat: confidentBeat?.downbeat === true,
    level: music.level,
    motion: 'none',
    revision: frame.revision,
    section: elements.root.dataset.musicSection ?? null,
    templateId,
  });
}

function commitLyricsFrame(elements, frame, options, isMangaFrame) {
  if (isMangaFrame) {
    applyMangaFramePresentation(elements, frame, options);
    if (Number.isSafeInteger(frame.lineIndex)) {
      mangaLineIndexes.set(elements.root, frame.lineIndex);
    } else {
      mangaLineIndexes.delete(elements.root);
    }
  } else {
    delete elements.root.dataset.mangaFrame;
    delete elements.root.dataset.mangaLength;
    delete elements.root.dataset.mangaSide;
    mangaLineIndexes.delete(elements.root);
    clearMangaLyrics(elements);
  }
  const ktvPresentation = applyKtvLanePresentation(
    elements,
    frame,
    options.templateId,
  );
  if (isMangaFrame) {
    renderMangaLyrics(elements, frame, options);
  } else if (ktvPresentation) {
    renderCurrentLyrics(ktvPresentation.currentElement, frame, options);
    const holdingNextLane = applyKtvLaneReplacementDelay(
      elements,
      frame,
      options,
      ktvPresentation,
    );
    if (!holdingNextLane) {
      renderCurrentLyrics(
        ktvPresentation.nextElement,
        secondaryKtvFrame(frame),
        options,
      );
    }
  } else {
    renderCurrentLyrics(elements.current, frame, options);
  }
  applyKtvCountInPresentation(elements, frame, options.templateId);
  if (ktvPresentation) {
    ktvPresentation.currentElement.dataset.currentText = frame.currentText;
    ktvPresentation.nextElement.dataset.currentText = frame.nextText;
  } else {
    elements.current.dataset.currentText = frame.currentText;
    setTextContent(elements.next, isMangaFrame ? '' : frame.nextText);
  }
  elements.root.hidden = !frame.visible;
  elements.root.setAttribute('lang', frame.language || 'und');
  elements.root.dataset.revision = String(frame.revision);
  applyMusicStructurePresentation(elements, frame, options);
}

function finiteKtvHostRect(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect) return null;
  const values = ['x', 'y', 'width', 'height'];
  if (!values.every((key) => Number.isFinite(rect[key]))) return null;
  return Object.fromEntries(
    values.map((key) => [key, Math.round(rect[key] * 100) / 100]),
  );
}

function ktvHostDiagnostics(element) {
  return {
    active: element?.dataset?.ktvActive === 'true',
    childCount: element?.children?.length ?? 0,
    held: element?.dataset?.ktvHeld === 'true',
    hidden: element?.hidden === true,
    lane: element?.dataset?.ktvLane ?? null,
    rect: finiteKtvHostRect(element),
    role: element?.dataset?.ktvRole ?? null,
    segmented: element?.dataset?.segmented === 'true',
    textLength: String(element?.textContent ?? '').length,
  };
}

function traceCommittedKtvLayout(elements, frame, options) {
  traceLyrics(options, 'ktv-layout', {
    currentLaneIndex: frame.currentLaneIndex ?? null,
    currentSegmentCount: Array.isArray(frame.currentSegments)
      ? frame.currentSegments.length
      : 0,
    currentVisibleLineIndex: frame.currentVisibleLineIndex ?? null,
    hosts: {
      current: ktvHostDiagnostics(elements.current),
      next: ktvHostDiagnostics(elements.next),
    },
    nextLaneIndex: frame.nextLaneIndex ?? null,
    nextSegmentCount: Array.isArray(frame.nextSegments)
      ? frame.nextSegments.length
      : 0,
    nextVisibleLineIndex: frame.nextVisibleLineIndex ?? null,
    revision: frame.revision ?? null,
    rootHidden: elements.root.hidden === true,
  });
}

function clearMangaTransition(root, token) {
  if (mangaTransitions.get(root) === token) mangaTransitions.delete(root);
}

function matchesMangaTransition(token, frame) {
  return (
    token?.targetText === frame.currentText &&
    token.targetLineIndex === frame.lineIndex &&
    token.visible === frame.visible
  );
}

function updateMangaTransition(token, frame, options) {
  token.frame = frame;
  token.options = options;
}

function commitMangaTransitionFrame(elements, token) {
  commitLyricsFrame(elements, token.frame, token.options, true);
  token.committedFrame = token.frame;
}

function completeMangaTransition(elements, root, token) {
  if (mangaTransitions.get(root) !== token) return;
  if (token.committedFrame !== token.frame) {
    commitMangaTransitionFrame(elements, token);
  }
  clearMangaTransition(root, token);
}

function mangaBubbleTargets(elements) {
  return Array.from(elements.mangaBubbles?.children ?? []);
}

function mangaEnteringBubbleTargets(elements, frame) {
  const targets = mangaBubbleTargets(elements);
  if (
    frame.currentTimingSource !== 't2' ||
    !Array.isArray(frame.mangaBubbleTiming)
  ) {
    return targets;
  }
  return targets.filter(
    (_, index) => frame.mangaBubbleTiming[index]?.state === 'revealed',
  );
}

function addMangaBubbleFade(
  timeline,
  targets,
  direction,
  staggerEntrance = true,
) {
  const entering = direction === 'enter';
  timeline.addLabel(direction);

  if (entering) {
    for (const [index, target] of targets.entries()) {
      timeline.to(
        target,
        {
          autoAlpha: 1,
          duration: MANGA_FADE_IN_DURATION_SECONDS,
          ease: 'power2.out',
          overwrite: 'auto',
        },
        index === 0 || !staggerEntrance
          ? direction
          : `+=${MANGA_BUBBLE_ENTER_GAP_SECONDS}`,
      );
    }
    return;
  }

  timeline.to(
    targets,
    {
      autoAlpha: 0,
      duration: MANGA_FADE_OUT_DURATION_SECONDS,
      ease: 'power2.in',
      overwrite: 'auto',
      stagger: {
        each: MANGA_BUBBLE_EXIT_STAGGER_SECONDS,
        from: 'start',
      },
    },
    direction,
  );
}

function transitionMangaFrame(elements, frame, options, enterOnly = false) {
  const root = elements.root;
  const gsap = resolveGsap(options);
  const activeTransition = mangaTransitions.get(root);
  if (matchesMangaTransition(activeTransition, frame)) {
    updateMangaTransition(activeTransition, frame, options);
    return;
  }
  activeTransition?.timeline?.kill?.();

  const token = {
    timeline: null,
    frame,
    options,
    committedFrame: null,
    targetLineIndex: frame.lineIndex,
    targetText: frame.currentText,
    visible: frame.visible,
  };
  mangaTransitions.set(root, token);
  const timeline = gsap.timeline({
    onComplete: () => completeMangaTransition(elements, root, token),
  });
  token.timeline = timeline;

  if (enterOnly) {
    commitMangaTransitionFrame(elements, token);
    if (!frame.visible) {
      clearMangaTransition(root, token);
      timeline.kill?.();
      return;
    }
    const incomingBubbles = mangaEnteringBubbleTargets(elements, token.frame);
    gsap.set(incomingBubbles, { autoAlpha: 0 });
    addMangaBubbleFade(
      timeline,
      incomingBubbles,
      'enter',
      token.frame.currentTimingSource !== 't2',
    );
    return;
  }

  addMangaBubbleFade(timeline, mangaBubbleTargets(elements), 'exit');
  timeline.add(() => {
    if (mangaTransitions.get(root) !== token) return;
    commitMangaTransitionFrame(elements, token);
    if (!token.frame.visible) return;
    const incomingBubbles = mangaEnteringBubbleTargets(elements, token.frame);
    gsap.set(incomingBubbles, { autoAlpha: 0 });
    addMangaBubbleFade(
      timeline,
      incomingBubbles,
      'enter',
      token.frame.currentTimingSource !== 't2',
    );
  });
}

function stopMangaAnimations(elements, options = {}, clearProps = false) {
  const gsap = resolveGsap(options);
  const bubbleTargets = mangaBubbleTargets(elements);
  const currentChildTargets = Array.from(elements.current.children ?? []);
  mangaTransitions.get(elements.root)?.timeline?.kill?.();
  mangaTransitions.delete(elements.root);
  gsap?.killTweensOf?.(elements.root);
  if (elements.mangaBubbles) gsap?.killTweensOf?.(elements.mangaBubbles);
  if (bubbleTargets.length > 0) gsap?.killTweensOf?.(bubbleTargets);
  if (currentChildTargets.length > 0) {
    gsap?.killTweensOf?.(currentChildTargets);
  }
  if (clearProps) {
    gsap?.set?.(elements.root, {
      clearProps: 'opacity,visibility,scale',
    });
    if (bubbleTargets.length > 0) {
      gsap?.set?.(bubbleTargets, { clearProps: 'opacity,visibility' });
    }
  }
}

export function destroyLyricsAnimations(elements, options = {}) {
  stopKineticPopTransition(elements, options);
  stopMangaAnimations(elements, options, true);
  clearLyricsRenderState(elements.current, options);
  clearLyricsRenderState(elements.next, options);
  for (const bubble of Array.from(elements.mangaBubbles?.children ?? [])) {
    const text = bubble.children?.[1];
    if (text) clearLyricsRenderState(text, options);
  }
  mangaRenderKeys.delete(elements.root);
  clearKtvFallbackProgress(elements.current);
  clearKtvFallbackProgress(elements.next);
  clearKtvLanePresentation(elements.root);
  clearLiveStagePresentation(elements, options);
  clearKineticPopPresentation(elements, options);
}

export function renderLyricsFrame(elements, sourceFrame, options = {}) {
  const templateId = activeTemplateId(elements, options);
  const frame =
    templateId === 'karaoke-stack' ? projectKtvFrame(sourceFrame) : sourceFrame;
  const previousText =
    elements.current.dataset.currentText ?? elements.current.textContent;
  const renderOptions = { ...options, templateId };
  traceLyrics(renderOptions, 'frame', {
    lineIndex: frame.currentVisibleLineIndex ?? frame.lineIndex ?? null,
    lineProgress: Number.isFinite(frame.lineProgress)
      ? progressPercentage(frame.lineProgress)
      : null,
    revision: frame.revision,
    segmented: Array.isArray(frame.currentSegments),
    templateId,
    timelineDiscontinuity: frame.timelineDiscontinuity === true,
    visible: frame.visible === true,
  });
  const isMangaFrame = templateId === 'manga-frame';
  const isLiveStage = templateId === 'live-stage';
  const isKineticPop = templateId === 'kinetic-pop';

  if (templateId !== 'karaoke-stack') {
    clearKtvFallbackProgress(elements.current);
    clearKtvLanePresentation(elements.root);
  }

  if (isLiveStage) {
    clearKineticPopPresentation(elements, renderOptions);
    stopMangaAnimations(elements, renderOptions, true);
    renderLiveStageFrame(elements, frame, renderOptions);
    return;
  }

  if (elements.root.dataset.liveStage === 'true') {
    clearLiveStagePresentation(elements, renderOptions);
  }
  if (isKineticPop) {
    stopMangaAnimations(elements, renderOptions, true);
    clearMangaLyrics(elements);
    clearLyricsRenderState(elements.current, renderOptions);
    clearLyricsRenderState(elements.next, renderOptions);
    applyKtvLanePresentation(elements, frame, templateId);
    applyKtvCountInPresentation(elements, frame, templateId);
    renderKineticPopPresentation(elements, frame, renderOptions);
    elements.root.hidden = !frame.visible;
    elements.root.setAttribute('lang', frame.language || 'und');
    elements.root.dataset.revision = String(frame.revision);
    clearMusicPresentation(elements.root);
    return;
  }
  clearKineticPopPresentation(elements, renderOptions);
  const lineChanged =
    previousText !== frame.currentText ||
    (isMangaFrame &&
      Number.isSafeInteger(frame.lineIndex) &&
      mangaLineIndexes.get(elements.root) !== frame.lineIndex);
  const gsap = resolveGsap(renderOptions);
  const timelineDiscontinuity = frame.timelineDiscontinuity === true;
  if (isMangaFrame && timelineDiscontinuity) {
    stopMangaAnimations(elements, renderOptions, true);
  }
  const canAnimateManga =
    isMangaFrame &&
    lineChanged &&
    !timelineDiscontinuity &&
    renderOptions.reducedMotion !== true &&
    typeof gsap?.timeline === 'function';
  const activeTransition = mangaTransitions.get(elements.root);

  if (
    isMangaFrame &&
    renderOptions.reducedMotion !== true &&
    matchesMangaTransition(activeTransition, frame)
  ) {
    updateMangaTransition(activeTransition, frame, renderOptions);
    return;
  }

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
  if (templateId === 'karaoke-stack') {
    traceCommittedKtvLayout(elements, frame, renderOptions);
  }

  const shouldAnimate =
    !isMangaFrame &&
    !isKineticPop &&
    templateId !== 'karaoke-stack' &&
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

export function renderLyricsFrameSafely(elements, sourceFrame, options = {}) {
  if (typeof options.reportError !== 'function') {
    renderLyricsFrame(elements, sourceFrame, options);
    return true;
  }
  try {
    renderLyricsFrame(elements, sourceFrame, options);
    return true;
  } catch (error) {
    const diagnosticFrame = sourceFrame?.ktv ?? sourceFrame ?? {};
    try {
      options.reportError?.(error, {
        currentSegmentCount: Array.isArray(diagnosticFrame.currentSegments)
          ? diagnosticFrame.currentSegments.length
          : 0,
        lineIndex:
          diagnosticFrame.currentVisibleLineIndex ??
          diagnosticFrame.lineIndex ??
          null,
        nextSegmentCount: Array.isArray(diagnosticFrame.nextSegments)
          ? diagnosticFrame.nextSegments.length
          : 0,
        phase: 'render',
        revision: diagnosticFrame.revision ?? sourceFrame?.revision ?? null,
        templateId:
          options.templateId ??
          elements?.root?.ownerDocument?.documentElement?.dataset
            ?.ovlTemplate ??
          null,
      });
    } catch {
      // Diagnostics must never stop later overlay frames from rendering.
    }
    return false;
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
  let templateId =
    typeof options.templateId === 'string' ? options.templateId : 'focus-line';
  let kineticMaterial = normalizeOverlayAppearance({
    kineticMaterial: options.kineticMaterial,
  }).kineticMaterial;
  const presentationCache =
    options.presentationCache ?? createLyricsPresentationDocumentCache();

  function clearTimer() {
    if (timer !== null) cancelSchedule(timer);
    timer = null;
  }

  function renderLatest() {
    if (stopped || !latestSnapshot) return;
    const nowMs = now();
    const lyrics = latestSnapshot.lyrics ?? {};
    const presentationDocument = presentationCache.get(
      {
        documentId: lyrics.documentId,
        documentRevision: lyrics.documentRevision,
        language: lyrics.source?.language,
        lines: lyrics.lines,
      },
      { kineticMaterial, templateId },
    );
    const projectionOptions = {
      kineticMaterial,
      nowMs,
      presentationDocument,
      templateId,
    };
    onFrame(selectLyricsOverlayFrame(latestSnapshot, projectionOptions));
    const delay = nextPresentationBoundaryDelayMs(
      latestSnapshot,
      projectionOptions,
    );
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

  function setPresentationSettings(nextSettings = {}) {
    const normalizedTemplateId =
      typeof nextSettings.templateId === 'string' && nextSettings.templateId
        ? nextSettings.templateId
        : 'focus-line';
    const normalizedKineticMaterial = normalizeOverlayAppearance({
      kineticMaterial: nextSettings.kineticMaterial,
    }).kineticMaterial;
    if (
      normalizedTemplateId === templateId &&
      normalizedKineticMaterial === kineticMaterial
    ) {
      return;
    }
    templateId = normalizedTemplateId;
    kineticMaterial = normalizedKineticMaterial;
    refresh();
  }

  function setTemplateId(nextTemplateId) {
    setPresentationSettings({
      kineticMaterial,
      templateId: nextTemplateId,
    });
  }

  function setKineticMaterial(nextKineticMaterial) {
    setPresentationSettings({
      kineticMaterial: nextKineticMaterial,
      templateId,
    });
  }

  return {
    refresh,
    setKineticMaterial,
    setPresentationSettings,
    setTemplateId,
    stop,
    suspend,
    update,
  };
}

function boot() {
  const elements = {
    root: document.querySelector('#lyrics-overlay'),
    current: document.querySelector('#lyrics-current'),
    liveStageCard: document.querySelector('#lyrics-live-stage-card'),
    liveStageChrome: document.querySelector('#lyrics-live-stage-chrome'),
    liveStageTitle: document.querySelector('#lyrics-live-stage-title'),
    liveStageArtist: document.querySelector('#lyrics-live-stage-artist'),
    mangaBubbles: document.querySelector('#lyrics-manga-bubbles'),
    next: document.querySelector('#lyrics-next'),
    ktvCountIn: document.querySelector('#lyrics-ktv-count-in'),
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
  const workbenchMode = isWorkbenchMode(window.location);
  const trace = createLyricsDiagnostics({ location: window.location });
  const reportError = createLyricsErrorReporter({ location: window.location });
  applyOverlayAppearance(document, null);
  applyPreviewCanvas(document, {
    previewMode,
    workbenchMode,
    location: window.location,
  });
  if (previewMode) {
    renderLyricsFrameSafely(elements, PREVIEW_FRAME, {
      gsap,
      reportError,
      reducedMotion: true,
      trace,
    });
  }
  frameScheduler = createLyricsFrameScheduler({
    onFrame: (frame) => {
      const visibleFrame = withPreviewFallback(
        frame,
        PREVIEW_FRAME,
        previewMode,
      );
      renderLyricsFrameSafely(elements, visibleFrame, {
        gsap,
        reportError,
        reducedMotion,
        trace,
      });
    },
  });
  const connection = createOverlayConnection({
    kind: 'lyrics',
    onConfig: (slot) => {
      applyOverlayAppearance(document, slot);
      frameScheduler.setPresentationSettings({
        kineticMaterial: normalizeOverlayAppearance(slot?.settings)
          .kineticMaterial,
        templateId: slot?.templateId,
      });
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
