import {
  ORNATE_VERTICAL_ENTER_DURATION_SECONDS,
  ORNATE_VERTICAL_EXIT_DURATION_SECONDS,
  ornateVerticalEnterPose,
  ornateVerticalRevealDelaySeconds,
} from '../../shared/presentation/ornateVerticalMotion.mjs';

const ornateVerticalTransitions = new WeakMap();
const FINAL_CLEAR_PROPS = 'clipPath,opacity,visibility';

function ornateLineUnits(line) {
  return Array.from(line?.children ?? []).flatMap((segment) =>
    Array.from(segment?.children ?? []),
  );
}

function createOrnateLine(documentApi, presentation, identity) {
  const line = documentApi.createElement('span');
  line.className = 'lyrics-overlay__ornate-line';
  line.dataset.ornateIdentity = identity;
  line.dataset.ornatePlacement = presentation.placement;
  line.dataset.ornateSegmentCount = String(presentation.segments.length);
  line.dataset.ornateText = presentation.text;
  line.setAttribute('aria-hidden', 'true');

  const units = [];
  for (const segment of presentation.segments) {
    const segmentElement = documentApi.createElement('span');
    segmentElement.className = 'lyrics-overlay__ornate-segment';
    segmentElement.dataset.ornateSegmentIndex = String(segment.index);
    segmentElement.dataset.ornateSegmentText = segment.text;

    for (const unit of segment.units) {
      const element = documentApi.createElement('span');
      element.className = 'lyrics-overlay__ornate-unit';
      element.dataset.ornateEmphasis = unit.emphasis;
      element.dataset.ornateKind = unit.kind;
      element.dataset.ornateReveal = unit.reveal;
      if (unit.emphasis === 'keyword') {
        element.dataset.ornateText = unit.text.trim();
      }
      element.textContent = unit.text;
      segmentElement.append(element);
      units.push(element);
    }
    line.append(segmentElement);
  }

  return { line, units };
}

export function stopOrnateVerticalTransition(elements, options = {}) {
  const active = ornateVerticalTransitions.get(elements.root);
  active?.timeline?.kill?.();

  const incomingLine = active?.incoming?.line;
  let committedIncoming = null;
  if (incomingLine) {
    delete incomingLine.dataset.ornateMotion;
    elements.current.replaceChildren(incomingLine);
    committedIncoming = incomingLine;
  }
  ornateVerticalTransitions.delete(elements.root);

  const gsap = options.gsap ?? globalThis.gsap ?? null;
  const targets = Array.from(elements.current?.children ?? []).flatMap(
    ornateLineUnits,
  );
  if (targets.length > 0) {
    gsap?.killTweensOf?.(targets);
    if (committedIncoming) {
      gsap?.set?.(targets, { clearProps: FINAL_CLEAR_PROPS });
    }
  }
  for (const line of Array.from(elements.current?.children ?? [])) {
    delete line.dataset.ornateMotion;
  }
}

export function clearOrnateVerticalPresentation(elements, options = {}) {
  if (elements.root.dataset.ornateVertical !== 'true') return;
  stopOrnateVerticalTransition(elements, options);
  delete elements.root.dataset.ornatePlacement;
  delete elements.root.dataset.ornateVertical;
  elements.current.replaceChildren?.();
  elements.current.removeAttribute?.('aria-label');
  delete elements.current.dataset.currentText;
  elements.next.hidden = false;
}

export function renderOrnateVerticalPresentation(
  elements,
  frame,
  options = {},
) {
  const source = frame.ornateVertical;
  const text = String(source?.text ?? frame.currentText ?? '');
  const units = Array.isArray(source?.units)
    ? source.units.filter((unit) => String(unit?.text ?? ''))
    : [];
  const sourceSegments = Array.isArray(source?.segments)
    ? source.segments
        .map((segment, index) => ({
          index: Number.isSafeInteger(segment?.index) ? segment.index : index,
          text: String(segment?.text ?? ''),
          units: Array.isArray(segment?.units)
            ? segment.units.filter((unit) => String(unit?.text ?? ''))
            : [],
        }))
        .filter((segment) => segment.text && segment.units.length > 0)
    : [];
  const segments =
    sourceSegments.length > 0
      ? sourceSegments
      : units.length > 0
        ? [{ index: 0, text, units }]
        : [];
  const placement = 'right';
  const presentation = { placement, segments, text, units };
  const identity = JSON.stringify([
    frame.currentVisibleLineIndex ?? frame.lineIndex ?? null,
    text,
    placement,
    source?.keyword?.text ?? null,
    segments.map((segment) => segment.text),
  ]);
  const documentApi = elements.current.ownerDocument ?? globalThis.document;
  const active = ornateVerticalTransitions.get(elements.root);

  if (
    active?.identity === identity &&
    frame.timelineDiscontinuity !== true &&
    options.reducedMotion !== true
  ) {
    return;
  }
  stopOrnateVerticalTransition(elements, options);

  elements.root.dataset.ornatePlacement = placement;
  elements.root.dataset.ornateVertical = 'true';
  elements.current.dataset.currentText = text;
  elements.current.setAttribute('aria-label', text);
  elements.next.hidden = true;
  elements.next.textContent = '';

  if (
    !frame.visible ||
    !text ||
    segments.length === 0 ||
    !documentApi?.createElement
  ) {
    elements.current.replaceChildren?.();
    return;
  }

  const previousLine = elements.current.children?.[0] ?? null;
  if (previousLine?.dataset?.ornateIdentity === identity) return;

  const incoming = createOrnateLine(documentApi, presentation, identity);
  const gsap = options.gsap ?? globalThis.gsap ?? null;
  const canAnimate =
    frame.timelineDiscontinuity !== true &&
    options.reducedMotion !== true &&
    typeof gsap?.timeline === 'function';

  if (!canAnimate) {
    elements.current.replaceChildren(incoming.line);
    return;
  }

  if (!previousLine) elements.current.replaceChildren(incoming.line);
  incoming.line.dataset.ornateMotion = 'active';

  for (const unit of incoming.units) {
    gsap.set(unit, {
      autoAlpha: 0,
      ...ornateVerticalEnterPose(unit.dataset.ornateKind),
    });
  }

  const token = { identity, incoming, timeline: null };
  const timeline = gsap.timeline({
    onComplete: () => {
      if (ornateVerticalTransitions.get(elements.root) !== token) return;
      delete incoming.line.dataset.ornateMotion;
      elements.current.replaceChildren(incoming.line);
      ornateVerticalTransitions.delete(elements.root);
    },
  });
  token.timeline = timeline;
  ornateVerticalTransitions.set(elements.root, token);
  timeline.addLabel('swap', 0);

  if (previousLine) {
    timeline.to(
      previousLine,
      {
        autoAlpha: 0,
        duration: ORNATE_VERTICAL_EXIT_DURATION_SECONDS,
        ease: 'power2.in',
      },
      'swap',
    );
  }
  timeline.addLabel(
    'enter',
    previousLine ? `swap+=${ORNATE_VERTICAL_EXIT_DURATION_SECONDS}` : 'swap',
  );
  if (previousLine) {
    timeline.add(() => {
      if (ornateVerticalTransitions.get(elements.root) !== token) return;
      elements.current.replaceChildren(incoming.line);
    }, 'enter');
  }

  for (const [index, unit] of incoming.units.entries()) {
    timeline.to(
      unit,
      {
        autoAlpha: 1,
        clearProps: FINAL_CLEAR_PROPS,
        clipPath: 'inset(0 0 0% 0)',
        duration: ORNATE_VERTICAL_ENTER_DURATION_SECONDS,
        ease: 'power4.out',
      },
      `enter+=${ornateVerticalRevealDelaySeconds(index)}`,
    );
  }
}
