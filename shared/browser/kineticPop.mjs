import {
  KINETIC_POP_PUNCH_SECONDS,
  kineticPopBurstDelaySeconds,
  kineticPopEnterPose,
  kineticPopPunchDelays,
  kineticPopPunchStages,
  kineticPopRestPose,
} from '../presentation/kineticPopMotion.mjs';
import { lyricsDisplayBatchKey } from '../presentation/lyricsDisplayFrame.mjs';

const rendered = new WeakMap();
const VISUAL_LAYERS = Object.freeze(['depth', 'rim', 'fill']);
const CLEAR_PROPS = 'opacity,transform';
const FULL_ENTRANCE_MINIMUM_CUE_MS = 420;
const CAPTION_SECONDS = 0.095;
const CAPTION_STAGGER_SECONDS = 0.028;

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

const MAX_ENTRANCE_SCALE = 1.24;
const INK_RESERVE_EM = 0.5;

function fitLine(current, { line, tracks }) {
  const width = current.clientWidth;
  if (!(width > 0)) return;
  const fontSize = parseFloat(
    line.ownerDocument.defaultView?.getComputedStyle(line).fontSize,
  );
  if (!(fontSize > 0)) return;
  const widest = tracks.reduce(
    (max, track) =>
      Math.max(
        max,
        track.reduce((sum, glyph) => sum + glyph.offsetWidth, 0),
      ),
    0,
  );
  if (!(widest > 0)) return;
  const reserve = fontSize * (INK_RESERVE_EM + MAX_ENTRANCE_SCALE - 1) * 2;
  const scale = Math.min(1, width / (widest + reserve));
  if (scale < 1)
    line.style.setProperty('--kinetic-fit-scale', scale.toFixed(5));
  else line.style.removeProperty('--kinetic-fit-scale');
}

function releaseEntrance(state) {
  if (state.request != null) state.view.cancelAnimationFrame(state.request);
  state.request = null;
  if (!state.timeline) return;
  state.timeline.kill();
  state.timeline = null;
  state.gsap.set(state.tracks.flat(), { clearProps: CLEAR_PROPS });
  delete state.line.dataset.kineticMotion;
}

function addCaptionEntrance(timeline, { arrangement, phase, tracks }, budget) {
  const pose = (index) => kineticPopEnterPose(index + phase);
  const rest = (index) => kineticPopRestPose(index, arrangement);
  for (const track of tracks) {
    timeline.fromTo(
      track,
      {
        opacity: 0.75,
        rotation: (index) => pose(index).rotation * 0.45,
        scale: 0.91,
        x: 0,
        y: (index) => `${pose(index).y * 0.005}em`,
      },
      {
        opacity: 1,
        rotation: (index) => rest(index).rotation,
        scale: (index) => rest(index).scale,
        x: (index) => `${rest(index).xEm}em`,
        y: (index) => `${rest(index).yEm}em`,
        duration: CAPTION_SECONDS * budget,
        ease: 'power2.out',
        stagger: (index) => kineticPopBurstDelaySeconds(index + phase) * budget,
      },
      0,
    );
  }
}

function addPunchEntrance(timeline, { arrangement, phase, tracks }, budget) {
  const layerCount = VISUAL_LAYERS.length;
  const tween = ({ pose, seconds, ease }) => ({
    ...pose,
    duration: seconds * budget,
    ease,
  });
  for (let row = 0; row < tracks.length; row += layerCount) {
    const layers = tracks.slice(row, row + layerCount);
    const delays = kineticPopPunchDelays(layers[0].length, phase);
    for (const [index, delay] of delays.entries()) {
      const targets = layers.map((layer) => layer[index]);
      const [start, impact, ...landing] = kineticPopPunchStages(
        index,
        phase,
        arrangement,
      );
      let at = delay * budget;
      timeline.fromTo(targets, start.pose, tween(impact), at);
      at += impact.seconds * budget;
      for (const stage of landing) {
        timeline.to(targets, tween(stage), at);
        at += stage.seconds * budget;
      }
    }
  }
}

function createEntrance(state, budget) {
  const timeline = state.gsap.timeline({ paused: true });
  if (state.composition === 'punch') addPunchEntrance(timeline, state, budget);
  else addCaptionEntrance(timeline, state, budget);
  state.line.dataset.kineticMotion = 'active';
  return timeline;
}

function sampleEntrance(state) {
  state.request = null;
  const { clock, positionAt } = state;
  const age = Math.max(0, (positionAt?.() ?? clock.positionMs) - clock.startMs);
  const budget = Math.min(
    1,
    (clock.endMs - clock.startMs) / FULL_ENTRANCE_MINIMUM_CUE_MS,
  );
  const seconds =
    state.composition === 'punch'
      ? KINETIC_POP_PUNCH_SECONDS
      : CAPTION_SECONDS + CAPTION_STAGGER_SECONDS;
  if (age / 1000 >= seconds * budget) {
    releaseEntrance(state);
    return;
  }
  state.timeline ??= createEntrance(state, budget);
  state.timeline.time(age / 1000, true);
  if (clock.playing && positionAt && state.view?.requestAnimationFrame)
    state.request = state.view.requestAnimationFrame(() =>
      sampleEntrance(state),
    );
}

export function clearKineticPopPresentation(elements) {
  const state = rendered.get(elements.current);
  if (!state) return;
  releaseEntrance(state);
  rendered.delete(elements.current);
  delete elements.root.dataset.kineticPop;
  delete elements.root.dataset.kineticMaterial;
  delete elements.root.dataset.kineticComposition;
  elements.current.replaceChildren();
  elements.current.removeAttribute('aria-label');
  delete elements.current.dataset.currentText;
  if (elements.next) elements.next.hidden = false;
}

export function renderKineticPopPresentation(elements, frame, options = {}) {
  const { root, current, next } = elements;
  const presentation = frame.kineticPop;
  const text = String(
    presentation?.displayText ?? presentation?.text ?? frame.currentText ?? '',
  );
  const rows = (
    presentation?.rows ?? [{ text, units: presentation?.units ?? [] }]
  )
    .map((row) => ({
      ...row,
      units: row.units.filter((unit) => unit.text),
    }))
    .filter((row) => row.units.length > 0);
  if (!frame.visible || !text || rows.length === 0) {
    clearKineticPopPresentation(elements);
    return;
  }
  const arrangement = options.arrangement ?? root.dataset.ovlKineticArrangement;
  const material = presentation.material ?? 'solid-outline';
  const composition = presentation.composition ?? 'caption';
  const clock = frame.kineticPopClock;
  root.dataset.kineticPop = 'true';
  root.dataset.kineticMaterial = material;
  root.dataset.kineticComposition = composition;
  const identity = JSON.stringify([
    clock?.sourceId,
    clock?.startMs,
    clock?.endMs,
    clock?.repeatGroupIndex ?? lyricsDisplayBatchKey(frame),
    presentation.phraseIndex,
    text,
    material,
    composition,
    arrangement,
  ]);
  let state = rendered.get(current);
  if (state?.identity !== identity) {
    if (state) releaseEntrance(state);
    const ink = createKineticLine(current.ownerDocument, {
      ...presentation,
      material,
      composition,
      rows,
    });
    ink.line.dataset.kineticText = text;
    ink.line.dataset.kineticIdentity = identity;
    current.replaceChildren(ink.line);
    current.dataset.currentText = text;
    current.setAttribute('aria-label', text);
    if (next) {
      next.hidden = true;
      next.textContent = '';
    }
    state = {
      ...ink,
      identity,
      view: current.ownerDocument.defaultView,
      gsap: options.gsap,
      arrangement,
      composition,
      phase:
        (clock?.repeatGroupIndex ?? frame.lineIndex ?? 0) +
        (presentation.phraseIndex ?? 0),
    };
    rendered.set(current, state);
  }
  fitLine(current, state);
  if (state.request != null) state.view.cancelAnimationFrame(state.request);
  state.request = null;
  if (
    !clock ||
    clock.endMs <= clock.startMs ||
    options.reducedMotion ||
    !state.gsap?.timeline
  ) {
    releaseEntrance(state);
    return;
  }
  state.clock = clock;
  state.positionAt = options.positionAt;
  sampleEntrance(state);
}
