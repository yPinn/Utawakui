import {
  adaptLiveStageLyricsPresentation,
  analyzeLyricsSource,
} from '../shared/lyricsPresentation.mjs';

const CARD_ENTER_DURATION_SECONDS = 0.22;
const CARD_EXIT_DURATION_SECONDS = 0.18;
const cardTransitions = new WeakMap();

function resolveGsap(options) {
  return options.gsap ?? globalThis.gsap ?? null;
}

function clearCardTransition(elements, options = {}, clearProps = false) {
  const card = elements.liveStageCard;
  if (!card) return;
  const gsap = resolveGsap(options);
  cardTransitions.get(elements.root)?.timeline?.kill?.();
  cardTransitions.delete(elements.root);
  gsap?.killTweensOf?.(card);
  if (clearProps) {
    gsap?.set?.(card, {
      clearProps: 'clipPath,opacity,transform,visibility',
    });
  }
}

export function clearLiveStagePresentation(elements, options = {}) {
  clearCardTransition(elements, options, true);
  if (elements.liveStageChrome) elements.liveStageChrome.hidden = true;
  if (elements.liveStageCard) {
    elements.liveStageCard.hidden = true;
    delete elements.liveStageCard.dataset.liveStageVisible;
  }
  if (elements.liveStageTitle) elements.liveStageTitle.textContent = '';
  if (elements.liveStageArtist) {
    elements.liveStageArtist.textContent = '';
    elements.liveStageArtist.hidden = true;
  }
  elements.current.hidden = false;
  elements.next.hidden = false;
  delete elements.root.dataset.liveStage;
  delete elements.root.dataset.liveStageCaptionLines;
}

function completeCardTransition(elements, token, visible) {
  if (cardTransitions.get(elements.root) !== token) return;
  cardTransitions.delete(elements.root);
  if (!visible) elements.liveStageCard.hidden = true;
}

function renderCard(elements, stage, options) {
  const card = elements.liveStageCard;
  if (!card) return;
  const visible = stage?.active === true && stage?.cardVisible === true;
  const previousVisible = card.dataset.liveStageVisible === 'true';
  card.dataset.liveStageVisible = String(visible);

  if (elements.liveStageTitle) {
    elements.liveStageTitle.textContent = stage?.title ?? '';
  }
  if (elements.liveStageArtist) {
    elements.liveStageArtist.textContent = stage?.artist ?? '';
    elements.liveStageArtist.hidden = !stage?.artist;
  }

  const gsap = resolveGsap(options);
  const canAnimate =
    options.reducedMotion !== true && typeof gsap?.timeline === 'function';
  if (!canAnimate) {
    clearCardTransition(elements, options, true);
    card.hidden = !visible;
    return;
  }
  if (previousVisible === visible) {
    if (visible) card.hidden = false;
    return;
  }

  clearCardTransition(elements, options);
  const token = { timeline: null, visible };
  const timeline = gsap.timeline({
    onComplete: () => completeCardTransition(elements, token, visible),
  });
  token.timeline = timeline;
  cardTransitions.set(elements.root, token);

  if (visible) {
    card.hidden = false;
    gsap.set(card, {
      autoAlpha: 0,
      clipPath: 'inset(0 0 0 100%)',
      x: 48,
    });
    timeline.to(card, {
      autoAlpha: 1,
      clipPath: 'inset(0 0 0 0%)',
      x: 0,
      duration: CARD_ENTER_DURATION_SECONDS,
      ease: 'power3.out',
      overwrite: 'auto',
    });
    return;
  }

  timeline.to(card, {
    autoAlpha: 0,
    x: 24,
    duration: CARD_EXIT_DURATION_SECONDS,
    ease: 'power2.in',
    overwrite: 'auto',
  });
}

function renderCaption(elements, frame) {
  const presentation = adaptLiveStageLyricsPresentation(
    frame.lyricsSourceAnalysis ?? analyzeLyricsSource(frame.currentText),
    { lineProgress: frame.lineProgress },
  );
  const documentApi =
    elements.current.ownerDocument ?? elements.root.ownerDocument;
  elements.current.textContent = '';
  delete elements.current.dataset.segmented;

  if (documentApi?.createElement) {
    for (const line of presentation.lines) {
      const lineElement = documentApi.createElement('span');
      lineElement.className = 'lyrics-overlay__live-stage-caption-line';
      lineElement.textContent = line;
      elements.current.append(lineElement);
    }
  } else {
    elements.current.textContent = presentation.lines.join('\n');
  }

  elements.root.dataset.liveStageCaptionLines = String(
    presentation.lines.length,
  );
  elements.current.dataset.currentText = frame.currentText;
  elements.current.hidden = presentation.lines.length === 0;
  elements.next.textContent = '';
  elements.next.hidden = true;
  return presentation;
}

export function renderLiveStagePresentation(elements, frame, options = {}) {
  const stage = frame.liveStage ?? { active: false, cardVisible: false };
  const presentation = renderCaption(elements, frame);
  elements.root.dataset.liveStage = 'true';
  if (elements.liveStageChrome) {
    elements.liveStageChrome.hidden = stage.active !== true;
  }
  renderCard(elements, stage, options);
  elements.root.hidden =
    stage.active !== true && presentation.lines.length === 0;
  elements.root.setAttribute('lang', frame.language || 'und');
  elements.root.dataset.revision = String(frame.revision);
  if (presentation.sourceText) {
    elements.root.setAttribute('aria-label', presentation.sourceText);
  } else {
    elements.root.removeAttribute?.('aria-label');
  }
}
