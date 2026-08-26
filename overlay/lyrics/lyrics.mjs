import { createOverlayConnection } from '../shared/runtime.mjs';
import { applyOverlayAppearance } from '../shared/appearance.mjs';
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
} from '../shared/lyricsPresentation.mjs';
import {
  mangaFrameLengthTier,
  mangaFramePlacementForBubble,
  mangaFrameTextFitEm,
} from '../shared/mangaFrameContract.mjs';
import {
  applyMangaFramePresentation,
  renderMangaFrameSvg,
} from './mangaFrame.mjs';
import {
  clearLiveStagePresentation,
  renderLiveStagePresentation,
} from './liveStage.mjs';

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
const KTV_LANE_REPLACEMENT_DELAY_MS = 600;
const lastRenderedBeatKeys = new WeakMap();
const ktvFallbackAnimations = new WeakMap();
const ktvLanePresentations = new WeakMap();
const mangaTransitions = new WeakMap();
const mangaPulseTimelines = new WeakMap();
const mangaPulseTargets = new WeakMap();
const mangaLineIndexes = new WeakMap();
const mangaSegmentTargets = new WeakMap();

function resolveGsap(options) {
  return options.gsap ?? globalThis.gsap ?? null;
}

function progressPercentage(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 10000) / 100;
}

function glyphCount(text) {
  return Math.max(1, Array.from(String(text ?? '').replace(/\s/gu, '')).length);
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
  if (!Array.isArray(segments) || presentation.contentStart <= 0) {
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
    const current = adaptKtvLyricsPresentation(
      analyzeLyricsSource(source.currentText),
      { language: source.language },
    );
    const next = adaptKtvLyricsPresentation(
      analyzeLyricsSource(source.nextText),
      { language: source.language },
    );
    return {
      ...frame,
      ...source,
      currentText: current.text,
      nextText: next.text,
      ktvCurrentRole: source.currentRole ?? current.role,
      ktvNextRole: source.nextRole ?? next.role,
      ktvCountIn: source.countIn
        ? {
            remainingBeats: source.countIn.remainingBeats,
            totalBeats: source.countIn.totalBeats,
            timingSource: source.countIn.timingSource,
            visibleLineIndex:
              source.countIn.visibleLineIndex ?? source.currentVisibleLineIndex,
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

function applyKtvLaneReplacementDelay(elements, frame, options) {
  const root = elements.root;
  const currentIndex = frame.currentVisibleLineIndex;
  const currentLane = elements.current.dataset.ktvLane;
  let nextLane = elements.next.dataset.ktvLane;
  if (
    options.templateId !== 'karaoke-stack' ||
    !frame.visible ||
    !Number.isSafeInteger(currentIndex) ||
    !currentLane
  ) {
    clearKtvLanePresentation(root);
    return;
  }

  const previous = ktvLanePresentations.get(root);
  const sameLine = previous?.currentVisibleLineIndex === currentIndex;
  if (sameLine && previous.hold) {
    previous.currentText = frame.currentText;
    previous.currentRole = frame.ktvCurrentRole;
    previous.hold.targetText = frame.nextText;
    previous.hold.targetRole = frame.ktvNextRole;
    if (frame.timelineDiscontinuity === true) {
      cancelKtvLaneHold(previous);
      return;
    }
    if (nextLane === previous.hold.lane) {
      elements.next.textContent = previous.hold.heldText;
      setKtvRole(elements.next, previous.hold.heldRole);
      elements.next.dataset.ktvHeld = 'true';
    }
    return;
  }

  const sequentialLine =
    previous &&
    currentIndex === previous.currentVisibleLineIndex + 1 &&
    currentLane !== previous.currentLane;
  if (sequentialLine && !nextLane && !frame.nextText) {
    nextLane = previous.currentLane;
    setKtvLane(elements.next, nextLane);
  }
  const sequentialHandoff =
    sequentialLine &&
    nextLane === previous.currentLane &&
    frame.timelineDiscontinuity !== true;
  const replacementDelayMs = Number.isFinite(frame.laneReplacementDelayMs)
    ? Math.max(
        0,
        Math.min(KTV_LANE_REPLACEMENT_DELAY_MS, frame.laneReplacementDelayMs),
      )
    : KTV_LANE_REPLACEMENT_DELAY_MS;
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
    !sequentialHandoff ||
    !previous.currentText ||
    !nextLane ||
    replacementDelayMs <= 0
  ) {
    return;
  }

  const schedule = options.schedule ?? globalThis.setTimeout?.bind(globalThis);
  const cancelSchedule =
    options.cancelSchedule ?? globalThis.clearTimeout?.bind(globalThis);
  if (typeof schedule !== 'function') return;

  const hold = {
    lane: nextLane,
    heldText: previous.currentText,
    heldRole: previous.currentRole,
    targetText: frame.nextText,
    targetRole: frame.ktvNextRole,
    timer: null,
    cancelSchedule,
  };
  state.hold = hold;
  elements.next.textContent = hold.heldText;
  setKtvRole(elements.next, hold.heldRole);
  elements.next.dataset.ktvHeld = 'true';
  hold.timer = schedule(() => {
    const latest = ktvLanePresentations.get(root);
    if (latest !== state || latest.hold !== hold) return;
    if (elements.next.dataset.ktvLane === hold.lane) {
      elements.next.textContent = hold.targetText;
      setKtvRole(elements.next, hold.targetRole);
      delete elements.next.dataset.ktvHeld;
    }
    latest.hold = null;
  }, replacementDelayMs);
}

function applyKtvLanePresentation(elements, frame, templateId) {
  if (templateId !== 'karaoke-stack') {
    delete elements.root.dataset.ktvActiveLane;
    setKtvLane(elements.current, null);
    setKtvLane(elements.next, null);
    setKtvRole(elements.current, null);
    setKtvRole(elements.next, null);
    delete elements.next.dataset.ktvHeld;
    return;
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
  const currentLane = ktvLaneForVisibleLineIndex(currentIndex);
  const nextLane = ktvLaneForVisibleLineIndex(nextIndex);

  setKtvLane(elements.current, currentLane);
  setKtvLane(elements.next, nextLane);
  setKtvRole(elements.current, frame.ktvCurrentRole);
  setKtvRole(elements.next, frame.ktvNextRole);
  delete elements.next.dataset.ktvHeld;
  if (currentLane && frame.currentText) {
    elements.root.dataset.ktvActiveLane = currentLane;
  } else {
    delete elements.root.dataset.ktvActiveLane;
  }
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
      frame.ktvCountIn?.visibleLineIndex ?? frame.currentVisibleLineIndex,
    ),
  );
  setKtvRole(element, frame.ktvCountIn?.role ?? frame.ktvCurrentRole);
}

function projectSegmentsToBubbles(bubbles, segments) {
  const sourceTotal = segments.reduce(
    (total, segment) => total + glyphCount(segment.text),
    0,
  );
  const paintedSource = segments.reduce((total, segment) => {
    const length = glyphCount(segment.text);
    if (segment.state === 'past') return total + length;
    if (segment.state !== 'active') return total;
    const progress = Number.isFinite(segment.progress)
      ? Math.min(1, Math.max(0, segment.progress))
      : 0;
    return total + length * progress;
  }, 0);
  const bubbleLengths = bubbles.map((bubble) => glyphCount(bubble.text));
  const bubbleTotal = bubbleLengths.reduce(
    (total, length) => total + length,
    0,
  );
  const paintedBubbles = (paintedSource / sourceTotal) * bubbleTotal;
  const activeSegment = segments.find((segment) => segment.state === 'active');
  let sourceOffset = 0;
  let activeEndSource = paintedSource;
  for (const segment of segments) {
    const length = glyphCount(segment.text);
    if (segment === activeSegment) {
      activeEndSource = sourceOffset + length;
      break;
    }
    sourceOffset += length;
  }
  const targetPaintedBubbles = activeSegment
    ? (activeEndSource / sourceTotal) * bubbleTotal
    : paintedBubbles;
  const animationSpan = Math.max(0, targetPaintedBubbles - paintedBubbles);
  const totalRemainingMs =
    Number.isFinite(activeSegment?.remainingMs) && activeSegment.remainingMs > 0
      ? activeSegment.remainingMs
      : null;
  let offset = 0;

  return bubbles.map((bubble, index) => {
    const length = bubbleLengths[index];
    const end = offset + length;
    const localProgress = Math.min(
      1,
      Math.max(0, (paintedBubbles - offset) / length),
    );
    const targetProgress = Math.min(
      1,
      Math.max(0, (targetPaintedBubbles - offset) / length),
    );
    const fillStart = Math.max(offset, paintedBubbles);
    const fillEnd = Math.min(end, targetPaintedBubbles);
    const fillUnits = Math.max(0, fillEnd - fillStart);
    const delayUnits = Math.max(0, fillStart - paintedBubbles);
    const delayMs =
      totalRemainingMs !== null && animationSpan > 0
        ? (delayUnits / animationSpan) * totalRemainingMs
        : 0;
    const durationMs =
      totalRemainingMs !== null && animationSpan > 0
        ? (fillUnits / animationSpan) * totalRemainingMs
        : null;
    const state =
      localProgress >= 1 ? 'past' : fillUnits > 0 ? 'active' : 'upcoming';
    offset += length;
    return {
      segmentId: `${activeSegment?.segmentId ?? segments[0]?.segmentId ?? 't2'}:bubble:${index}`,
      text: bubble.text,
      state,
      progress: localProgress,
      targetProgress,
      delayMs,
      remainingMs: state === 'active' ? durationMs : undefined,
    };
  });
}

function renderCurrentLyrics(element, frame, options) {
  const templateId = options.templateId ?? '';
  const gsap = resolveGsap(options);
  const segments = Array.isArray(frame.currentSegments)
    ? frame.currentSegments
    : [];
  const documentApi = element.ownerDocument ?? globalThis.document;
  if (segments.length === 0 || !documentApi?.createElement) {
    delete element.dataset.segmented;
    clearKtvFallbackProgress(element);
    element.textContent = frame.currentText;
    if (
      templateId === 'karaoke-stack' &&
      frame.currentText &&
      Number.isFinite(frame.lineProgress)
    ) {
      const progress = progressPercentage(frame.lineProgress);
      element.dataset.lineProgress = 'true';
      element.dataset.text = frame.currentText;
      element.style.setProperty('--ovl-segment-progress', `${progress}%`);
      if (
        Number.isFinite(frame.lineRemainingMs) &&
        frame.lineRemainingMs > 0 &&
        options.reducedMotion !== true &&
        typeof element.animate === 'function'
      ) {
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
      }
    }
    return;
  }

  clearKtvFallbackProgress(element);
  element.textContent = '';
  element.dataset.segmented = 'true';
  for (const segment of segments) {
    const segmentElement = documentApi.createElement('span');
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
    segmentElement.className = 'lyrics-overlay__segment';
    segmentElement.dataset.segmentId = segment.segmentId;
    segmentElement.dataset.segmentState = segment.state;
    segmentElement.dataset.text = segment.text;
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
          '--ovl-segment-progress': `${targetProgress}%`,
          delay: delayMs / 1000,
          duration: Math.max(0.001, segment.remainingMs / 1000),
          ease: 'none',
          overwrite: 'auto',
        });
      } else if (typeof segmentElement.animate === 'function') {
        segmentElement.animate(
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
      }
    }
    element.append(segmentElement);
  }
}

function createMangaBubble(
  documentApi,
  presentation,
  bubbleCount,
  placement,
  options,
) {
  const bubble = documentApi.createElement('span');
  bubble.className = 'lyrics-overlay__manga-bubble';
  bubble.dataset.lyricKind = presentation.kind;
  bubble.dataset.mangaLength = mangaFrameLengthTier(presentation.text);
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
    '--ovl-manga-text-fit-size',
    `${mangaFrameTextFitEm(presentation.text, bubbleCount)}em`,
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

function renderMangaLyrics(elements, frame, options) {
  const group = elements.mangaBubbles;
  const documentApi = group?.ownerDocument ?? globalThis.document;
  if (!group || !documentApi?.createElement || !documentApi?.createElementNS) {
    renderCurrentLyrics(elements.current, frame, options);
    return;
  }

  const gsap = resolveGsap(options);
  mangaPulseTimelines.get(elements.root)?.kill?.();
  mangaPulseTimelines.delete(elements.root);
  gsap?.killTweensOf?.(mangaPulseTargets.get(elements.root) ?? []);
  mangaPulseTargets.delete(elements.root);
  gsap?.killTweensOf?.(mangaSegmentTargets.get(elements.root) ?? []);
  mangaSegmentTargets.delete(elements.root);
  group.textContent = '';

  const segments = Array.isArray(frame.currentSegments)
    ? frame.currentSegments
    : [];
  const presentation = adaptMangaLyricsPresentation(
    frame.lyricsSourceAnalysis ?? analyzeLyricsSource(frame.currentText),
    { language: frame.language },
  );
  const bubbles = presentation.bubbles;
  const projectedSegments =
    segments.length > 0 && presentation.transformed
      ? projectSegmentsToBubbles(bubbles, segments)
      : null;
  const segmentTargets = [];
  const placements = bubbles.map((bubble, index) => ({
    ...mangaFramePlacementForBubble({
      bubbleCount: bubbles.length,
      bubbleIndex: index,
      lineIndex: frame.lineIndex,
      text: bubble.text,
    }),
    order: index + 1,
  }));

  group.dataset.mangaCount = String(bubbles.length);
  group.dataset.mangaLayout = placements
    .map((placement) => placement.side)
    .join('-');
  elements.root.dataset.mangaSide = placements[0]?.side ?? 'right';
  group.hidden = !frame.visible;
  elements.root.setAttribute('aria-label', frame.currentText);
  elements.current.hidden = true;
  elements.current.textContent = '';

  for (const [index, bubblePresentation] of bubbles.entries()) {
    const { bubble, text } = createMangaBubble(
      documentApi,
      bubblePresentation,
      bubbles.length,
      placements[index],
      options,
    );
    if (segments.length > 0) {
      renderCurrentLyrics(
        text,
        projectedSegments
          ? {
              ...frame,
              currentText: bubblePresentation.text,
              currentSegments: [projectedSegments[index]],
            }
          : frame,
        options,
      );
      segmentTargets.push(...Array.from(text.children ?? []));
    } else {
      text.textContent = bubblePresentation.text;
    }
    group.append(bubble);
  }
  if (segmentTargets.length > 0) {
    mangaSegmentTargets.set(elements.root, segmentTargets);
  }
  elements.current.textContent = frame.currentText;
}

function clearMangaLyrics(elements) {
  if (elements.mangaBubbles) {
    elements.mangaBubbles.textContent = '';
    elements.mangaBubbles.hidden = true;
    delete elements.mangaBubbles.dataset.mangaCount;
    delete elements.mangaBubbles.dataset.mangaSide;
    delete elements.mangaBubbles.dataset.mangaLayout;
  }
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
    templateId === 'manga-frame'
      ? Array.from(elements.mangaBubbles?.children ?? [])
      : elements.current;
  const hasPulseTarget = templateId !== 'manga-frame' || pulseTarget.length > 0;
  if (
    beatKey !== previousBeatKey &&
    Number.isFinite(beat.elapsedMs) &&
    beat.elapsedMs <= 250 &&
    frame.visible &&
    hasPulseTarget &&
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
            mangaPulseTargets.delete(elements.root);
          }
        },
      });
      mangaPulseTimelines.set(elements.root, timeline);
      mangaPulseTargets.set(elements.root, pulseTarget);
      timeline
        .addLabel('accent')
        .to(
          pulseTarget,
          { scale: 1.025, duration: 0.09, ease: 'power1.out' },
          'accent',
        )
        .to(pulseTarget, {
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
  if (isMangaFrame) renderMangaLyrics(elements, frame, options);
  else renderCurrentLyrics(elements.current, frame, options);
  applyKtvLanePresentation(elements, frame, options.templateId);
  applyKtvCountInPresentation(elements, frame, options.templateId);
  elements.current.dataset.currentText = frame.currentText;
  elements.next.textContent = isMangaFrame ? '' : frame.nextText;
  applyKtvLaneReplacementDelay(elements, frame, options);
  elements.root.hidden = !frame.visible;
  elements.root.setAttribute('lang', frame.language || 'und');
  elements.root.dataset.revision = String(frame.revision);
  applyMusicStructurePresentation(elements, frame, options);
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

function addMangaBubbleFade(timeline, targets, direction) {
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
        index === 0 ? direction : `+=${MANGA_BUBBLE_ENTER_GAP_SECONDS}`,
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
    const incomingBubbles = mangaBubbleTargets(elements);
    gsap.set(incomingBubbles, { autoAlpha: 0 });
    addMangaBubbleFade(timeline, incomingBubbles, 'enter');
    return;
  }

  addMangaBubbleFade(timeline, mangaBubbleTargets(elements), 'exit');
  timeline.add(() => {
    if (mangaTransitions.get(root) !== token) return;
    commitMangaTransitionFrame(elements, token);
    if (!token.frame.visible) return;
    const incomingBubbles = mangaBubbleTargets(elements);
    gsap.set(incomingBubbles, { autoAlpha: 0 });
    addMangaBubbleFade(timeline, incomingBubbles, 'enter');
  });
}

function stopMangaAnimations(elements, options = {}, clearProps = false) {
  const gsap = resolveGsap(options);
  const pulseTargets = mangaPulseTargets.get(elements.root) ?? [];
  const bubbleTargets = mangaBubbleTargets(elements);
  const segmentTargets = mangaSegmentTargets.get(elements.root) ?? [];
  const currentChildTargets = Array.from(elements.current.children ?? []);
  mangaTransitions.get(elements.root)?.timeline?.kill?.();
  mangaTransitions.delete(elements.root);
  mangaPulseTimelines.get(elements.root)?.kill?.();
  mangaPulseTimelines.delete(elements.root);
  if (pulseTargets.length > 0) gsap?.killTweensOf?.(pulseTargets);
  mangaPulseTargets.delete(elements.root);
  gsap?.killTweensOf?.(elements.root);
  if (elements.mangaBubbles) gsap?.killTweensOf?.(elements.mangaBubbles);
  if (bubbleTargets.length > 0) gsap?.killTweensOf?.(bubbleTargets);
  if (segmentTargets.length > 0) gsap?.killTweensOf?.(segmentTargets);
  mangaSegmentTargets.delete(elements.root);
  if (currentChildTargets.length > 0) {
    gsap?.killTweensOf?.(currentChildTargets);
  }
  if (clearProps) {
    gsap?.set?.(elements.root, {
      clearProps: 'opacity,visibility,scale',
    });
    if (pulseTargets.length > 0) {
      gsap?.set?.(pulseTargets, { clearProps: 'scale' });
    }
    if (bubbleTargets.length > 0) {
      gsap?.set?.(bubbleTargets, { clearProps: 'opacity,visibility' });
    }
  }
}

export function destroyLyricsAnimations(elements, options = {}) {
  stopMangaAnimations(elements, options, true);
  clearKtvFallbackProgress(elements.current);
  clearKtvLanePresentation(elements.root);
  clearLiveStagePresentation(elements, options);
}

export function renderLyricsFrame(elements, sourceFrame, options = {}) {
  const templateId = activeTemplateId(elements, options);
  const frame =
    templateId === 'karaoke-stack' ? projectKtvFrame(sourceFrame) : sourceFrame;
  const previousText =
    elements.current.dataset.currentText ?? elements.current.textContent;
  const renderOptions = { ...options, templateId };
  const isMangaFrame = templateId === 'manga-frame';
  const isLiveStage = templateId === 'live-stage';

  if (templateId !== 'karaoke-stack') {
    clearKtvFallbackProgress(elements.current);
    clearKtvLanePresentation(elements.root);
  }

  if (isLiveStage) {
    stopMangaAnimations(elements, renderOptions, true);
    renderLiveStageFrame(elements, frame, renderOptions);
    return;
  }

  if (elements.root.dataset.liveStage === 'true') {
    clearLiveStagePresentation(elements, renderOptions);
  }
  const lineChanged =
    previousText !== frame.currentText ||
    (isMangaFrame &&
      Number.isSafeInteger(frame.lineIndex) &&
      mangaLineIndexes.get(elements.root) !== frame.lineIndex);
  const gsap = resolveGsap(renderOptions);
  const canAnimateManga =
    isMangaFrame &&
    lineChanged &&
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

  const shouldAnimate =
    !isMangaFrame &&
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
    onFrame(selectLyricsOverlayFrame(latestSnapshot, { nowMs }));
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
  applyOverlayAppearance(document, null);
  applyPreviewCanvas(document, {
    previewMode,
    workbenchMode,
    location: window.location,
  });
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
