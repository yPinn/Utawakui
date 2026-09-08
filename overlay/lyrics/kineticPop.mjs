import {
  kineticPopBurstDelaySeconds,
  kineticPopEnterPose,
  kineticPopRestPose,
} from '../../shared/presentation/kineticPopMotion.mjs';

const kineticPopTransitions = new WeakMap();

const VISUAL_LAYERS = Object.freeze(['depth', 'rim', 'fill']);
const EXIT_DURATION_SECONDS = 0.08;
const ENTER_DURATION_SECONDS = 0.115;
const ENTER_OFFSET_SECONDS = 0.02;
const FINAL_CLEAR_PROPS = 'opacity,visibility,transform,transformOrigin';

function createVisualTrack(documentApi, role, rowUnits, unitOffset) {
  const track = documentApi.createElement('span');
  track.className = `lyrics-overlay__kinetic-layer-track lyrics-overlay__kinetic-layer-track--${role}`;
  track.dataset.kineticLayer = role;
  track.setAttribute('aria-hidden', 'true');
  const units = rowUnits.map((unit, index) => {
    const animationUnit = documentApi.createElement('span');
    animationUnit.className = 'lyrics-overlay__kinetic-unit';
    const globalUnitIndex = unitOffset + index;
    const restPose = kineticPopRestPose(globalUnitIndex, 'subtle-offset');
    animationUnit.dataset.kineticUnit = String(globalUnitIndex);
    animationUnit.style.setProperty('--kinetic-rest-x', `${restPose.xEm}em`);
    animationUnit.style.setProperty('--kinetic-rest-y', `${restPose.yEm}em`);
    animationUnit.style.setProperty(
      '--kinetic-rest-rotation',
      `${restPose.rotation}deg`,
    );
    animationUnit.style.setProperty(
      '--kinetic-rest-scale',
      String(restPose.scale),
    );
    const materialLayer = documentApi.createElement('span');
    materialLayer.className = `lyrics-overlay__kinetic-layer lyrics-overlay__kinetic-layer--${role}`;
    materialLayer.textContent = unit.text;
    animationUnit.append(materialLayer);
    track.append(animationUnit);
    return animationUnit;
  });
  return { track, units };
}

function createKineticLine(documentApi, presentation) {
  const line = documentApi.createElement('span');
  line.className = 'lyrics-overlay__kinetic-line';
  line.dataset.kineticMaterial = presentation.material;
  line.dataset.kineticComposition = presentation.composition;
  line.dataset.kineticRows = String(presentation.rows.length);
  if (Number.isSafeInteger(presentation.phraseIndex)) {
    line.dataset.kineticPhrase = String(presentation.phraseIndex);
  }
  line.setAttribute('aria-hidden', 'true');

  let unitIndex = 0;
  const tracks = [];
  for (const [rowIndex, row] of presentation.rows.entries()) {
    const rowElement = documentApi.createElement('span');
    rowElement.className = 'lyrics-overlay__kinetic-row';
    rowElement.dataset.kineticRow = String(rowIndex);
    for (const role of VISUAL_LAYERS) {
      const visualTrack = createVisualTrack(
        documentApi,
        role,
        row.units,
        unitIndex,
      );
      rowElement.append(visualTrack.track);
      tracks.push(visualTrack.units);
    }
    unitIndex += row.units.length;
    line.append(rowElement);
  }
  return { line, tracks };
}

function kineticLineTracks(line) {
  return Array.from(line?.children ?? []).flatMap((child) =>
    child.className === 'lyrics-overlay__kinetic-row'
      ? Array.from(child.children ?? []).map((track) =>
          Array.from(track?.children ?? []),
        )
      : [Array.from(child?.children ?? [])],
  );
}

function kineticLineUnits(line) {
  return kineticLineTracks(line).flatMap((track) => track);
}

function alternatingY(index) {
  return kineticPopEnterPose(index).y;
}

function alternatingRotation(index) {
  return kineticPopEnterPose(index).rotation;
}

function alternatingScale(index) {
  return kineticPopEnterPose(index).scale;
}

function exitY(index) {
  return kineticPopEnterPose(index).y * -0.65;
}

function exitRotation(index) {
  return kineticPopEnterPose(index).rotation * -1;
}

function exitScale(index) {
  return index % 2 === 0 ? 1.08 : 0.9;
}

function kineticRestTween(root) {
  const arrangement = root?.dataset?.ovlKineticArrangement;
  if (arrangement !== 'subtle-offset') {
    return { rotation: 0, scale: 1, x: 0, y: 0 };
  }
  return {
    rotation: (index) => kineticPopRestPose(index, arrangement).rotation,
    scale: (index) => kineticPopRestPose(index, arrangement).scale,
    x: (index) => `${kineticPopRestPose(index, arrangement).xEm}em`,
    y: (index) => `${kineticPopRestPose(index, arrangement).yEm}em`,
  };
}

export function stopKineticPopTransition(elements, options = {}) {
  const active = kineticPopTransitions.get(elements.root);
  active?.timeline?.kill?.();
  const interruptedIncoming = active?.incoming?.line;
  let committedIncoming = null;
  if (
    interruptedIncoming &&
    Array.from(elements.current?.children ?? []).includes(interruptedIncoming)
  ) {
    delete interruptedIncoming.dataset.kineticMotion;
    elements.current.replaceChildren(interruptedIncoming);
    committedIncoming = interruptedIncoming;
  }
  kineticPopTransitions.delete(elements.root);

  const gsap = options.gsap ?? globalThis.gsap ?? null;
  const targets = Array.from(elements.current?.children ?? []).flatMap(
    kineticLineUnits,
  );
  if (targets.length > 0) {
    gsap?.killTweensOf?.(targets);
    if (committedIncoming) {
      gsap?.set?.(targets, { clearProps: FINAL_CLEAR_PROPS });
    }
  }
  for (const line of Array.from(elements.current?.children ?? [])) {
    delete line.dataset.kineticMotion;
  }
}

export function clearKineticPopPresentation(elements, options = {}) {
  if (elements.root.dataset.kineticPop !== 'true') return;
  stopKineticPopTransition(elements, options);
  delete elements.root.dataset.kineticPop;
  delete elements.root.dataset.kineticMaterial;
  delete elements.root.dataset.kineticComposition;
  elements.current.replaceChildren?.();
  elements.current.removeAttribute?.('aria-label');
  delete elements.current.dataset.currentText;
  elements.next.hidden = false;
}

export function renderKineticPopPresentation(elements, frame, options = {}) {
  const presentation = frame.kineticPop;
  const sourceText = String(presentation?.text ?? frame.currentText ?? '');
  const displayText = String(presentation?.displayText ?? sourceText);
  const units = Array.isArray(presentation?.units)
    ? presentation.units.filter((unit) => String(unit?.text ?? ''))
    : [];
  const plannedRows = Array.isArray(presentation?.rows)
    ? presentation.rows
        .map((row) => ({
          text: String(row?.text ?? ''),
          units: Array.isArray(row?.units)
            ? row.units.filter((unit) => String(unit?.text ?? ''))
            : [],
        }))
        .filter((row) => row.units.length > 0)
    : [];
  const rows =
    plannedRows.length > 0 ? plannedRows : [{ text: displayText, units }];
  const material = String(presentation?.material ?? 'solid-outline');
  const composition = String(presentation?.composition ?? 'caption');
  const normalizedUnits = rows.flatMap((row) => row.units);
  const normalized = {
    composition,
    phraseIndex: presentation?.phraseIndex ?? null,
    material,
    rows,
    text: displayText,
    units: normalizedUnits,
  };
  const identity = JSON.stringify([
    frame.currentVisibleLineIndex ?? frame.lineIndex ?? null,
    normalized.phraseIndex,
    displayText,
    material,
    composition,
  ]);
  const documentApi = elements.current.ownerDocument ?? globalThis.document;
  const active = kineticPopTransitions.get(elements.root);

  if (
    active?.identity === identity &&
    frame.timelineDiscontinuity !== true &&
    options.reducedMotion !== true
  )
    return;
  stopKineticPopTransition(elements, options);

  elements.root.dataset.kineticPop = 'true';
  elements.root.dataset.kineticMaterial = material;
  elements.root.dataset.kineticComposition = composition;
  elements.current.dataset.currentText = displayText;
  elements.current.setAttribute('aria-label', displayText);
  elements.next.hidden = true;
  elements.next.textContent = '';

  if (
    !frame.visible ||
    !displayText ||
    normalizedUnits.length === 0 ||
    !documentApi?.createElement
  ) {
    elements.current.replaceChildren?.();
    return;
  }

  const previousLine = elements.current.children?.[0] ?? null;
  const sameLine =
    previousLine && previousLine.dataset?.kineticIdentity === identity;
  if (sameLine) return;

  const incoming = createKineticLine(documentApi, normalized);
  incoming.line.dataset.kineticIdentity = identity;
  incoming.line.dataset.kineticText = displayText;
  const gsap = options.gsap ?? globalThis.gsap ?? null;
  const canAnimate =
    frame.timelineDiscontinuity !== true &&
    options.reducedMotion !== true &&
    typeof gsap?.timeline === 'function';

  if (!canAnimate) {
    elements.current.replaceChildren(incoming.line);
    return;
  }

  const outgoingTracks = previousLine ? kineticLineTracks(previousLine) : [];
  if (outgoingTracks.length > 0) {
    elements.current.append(incoming.line);
    previousLine.dataset.kineticMotion = 'active';
  } else {
    elements.current.replaceChildren(incoming.line);
  }
  incoming.line.dataset.kineticMotion = 'active';
  for (const track of incoming.tracks) {
    gsap.set(track, {
      autoAlpha: 0,
      rotation: alternatingRotation,
      scale: alternatingScale,
      transformOrigin: '50% 70%',
      x: 0,
      y: alternatingY,
    });
  }

  const token = { identity, incoming, text: displayText, timeline: null };
  const restTween = kineticRestTween(elements.root);
  const timeline = gsap.timeline({
    onComplete: () => {
      if (kineticPopTransitions.get(elements.root) !== token) return;
      delete incoming.line.dataset.kineticMotion;
      elements.current.replaceChildren(incoming.line);
      kineticPopTransitions.delete(elements.root);
    },
  });
  token.timeline = timeline;
  kineticPopTransitions.set(elements.root, token);
  timeline.addLabel('swap', 0);
  for (const track of outgoingTracks) {
    timeline.to(
      track,
      {
        autoAlpha: 0,
        duration: EXIT_DURATION_SECONDS,
        ease: 'power2.in',
        rotation: exitRotation,
        scale: exitScale,
        stagger: kineticPopBurstDelaySeconds,
        x: 0,
        y: exitY,
      },
      'swap',
    );
  }
  for (const track of incoming.tracks) {
    timeline.to(
      track,
      {
        autoAlpha: 1,
        clearProps: FINAL_CLEAR_PROPS,
        duration: ENTER_DURATION_SECONDS,
        ease: 'back.out(2.2)',
        ...restTween,
        stagger: kineticPopBurstDelaySeconds,
      },
      outgoingTracks.length > 0 ? `swap+=${ENTER_OFFSET_SECONDS}` : 'swap',
    );
  }
}
