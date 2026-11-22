import {
  ORNATE_VERTICAL_ENTER_EASE,
  ORNATE_VERTICAL_SHADOW_DISTANCE,
  ORNATE_VERTICAL_SHADOW_DURATION_SECONDS,
  ornateVerticalEntrancePlan,
} from '../../shared/presentation/ornateVerticalMotion.mjs';
import { lyricsDisplayBatchKey } from '../../shared/presentation/lyricsDisplayFrame.mjs';
import {
  ORNATE_VERTICAL_COLUMN_GAP,
  ORNATE_VERTICAL_COLUMN_STEP_EM,
  ornateVerticalGlyphParts,
} from '../../shared/presentation/ornateVerticalPresentation.mjs';

const ornateVerticalTransitions = new WeakMap();
const ornateStrokeTransitions = new WeakMap();
const FINAL_CLEAR_PROPS = 'opacity,visibility';
const SLIDE_CLEAR_PROPS = `${FINAL_CLEAR_PROPS},transform`;
const SHADOW_PROGRESS = '--ornate-shadow-progress';
const SVG_NS = 'http://www.w3.org/2000/svg';
const STROKE_DURATION = 0.42;
const STROKE_LIMIT = 320;

// HinaMincho-Regular, U+706F, in 1000 units per em. These two contours
// make up 火. The 丁 contour joins the two sides of the stem to a movable hook.
const LAMP_FIRE = [
  'M32 31C85.33 -2.33 125.33 -43 152 -91 178.67 -139 196.5 -194.5 205.5 -257.5 214.5 -320.5 219 -400 219 -496L218 -630C216.67 -702 216 -759.33 216 -802 216 -818.67 220.83 -831.17 230.5 -839.5 240.17 -847.83 252.33 -852 267 -852 279 -852 289 -849.67 297 -845 305 -840.33 309 -835.67 309 -831 309 -825.67 303.67 -822.67 293 -822 289 -821.33 285.83 -819 283.5 -815 281.17 -811 280 -806.67 280 -802L282 -576C282 -567.33 284.67 -563 290 -563 294 -563 297.33 -565 300 -569 316.67 -590.33 331.67 -613 345 -637 349.67 -645.67 356 -652.5 364 -657.5 372 -662.5 380.67 -665 390 -665 406.67 -665 419.67 -659.5 429 -648.5 438.33 -637.5 443 -626.67 443 -616 443 -613.33 442.33 -610.67 441 -608 440.33 -606 438.33 -605 435 -605 431.67 -605 428.67 -606.33 426 -609 422.67 -612.33 418.67 -614 414 -614 406 -614 396.67 -608.67 386 -598 364.67 -575.33 337.67 -550 305 -522 291 -511.33 284 -497.33 284 -480 284.67 -470.67 284.5 -456.33 283.5 -437 282.5 -417.67 282 -403.67 282 -395L281 -336C281 -325.33 286 -316.33 296 -309 330 -282.33 361.33 -249.33 390 -210 418.67 -170.67 433 -135.67 433 -105 433 -93.67 430.5 -85.17 425.5 -79.5 420.5 -73.83 414 -71 406 -71 397.33 -71 389 -74.67 381 -82 373 -89.33 367.33 -99.33 364 -112 352 -158 331.33 -202 302 -244 297.33 -252 291.67 -256 285 -256 276.33 -256 270.33 -249.33 267 -236 253.67 -170.67 229.33 -113.67 194 -65 158.67 -16.33 110.33 24.67 49 58 41 61.33 34.67 63 30 63 25.33 63 21.5 62 18.5 60 15.5 58 14 55.33 14 52 14 45.33 20 38.33 32 31Z',
  'M86 -442C98.67 -463.33 108.33 -493.33 115 -532 121.67 -570.67 125 -606.33 125 -639 125 -650.33 124.33 -661.33 123 -672L123 -673C123 -676.33 124.33 -679.17 127 -681.5 129.67 -683.83 132.67 -685 136 -685 142 -685 146.33 -681.67 149 -675 154.33 -661.67 158.5 -642.33 161.5 -617 164.5 -591.67 166 -565.33 166 -538 166 -505.33 163.5 -476.17 158.5 -450.5 153.5 -424.83 146 -406 136 -394 128 -384 119 -379 109 -379 100.33 -379 93.17 -382.67 87.5 -390 81.83 -397.33 79 -406.33 79 -417 79 -426.33 81.33 -434.67 86 -442Z',
].join(' ');
const LAMP_STEM =
  'M655 -681C655 -692.33 652 -701 646 -707 640 -713 631.33 -716 620 -716L548 -716C521.33 -716 489 -714.67 451 -712L427 -710C420.33 -709.33 415.17 -711.17 411.5 -715.5 407.83 -719.83 406 -724.67 406 -730 406 -736 407.83 -741 411.5 -745 415.17 -749 420.33 -750.67 427 -750L451 -748C493 -745.33 525.33 -744 548 -744L809 -744C822.33 -744 833.5 -746.83 842.5 -752.5 851.5 -758.17 861 -766 871 -776 885.67 -790.67 900.67 -798 916 -798 924.67 -798 933.33 -795.33 942 -790 952 -783.33 961.33 -775.33 970 -766 977.33 -757.33 981 -749 981 -741 981 -733.67 978 -727.67 972 -723 966 -718.33 957.33 -716 946 -716L754 -715C743.33 -715 734.83 -712 728.5 -706 722.17 -700 719 -691.33 719 -680';
const LAMP_HOOK = [
  ['L', 719, -20],
  [
    'C',
    719,
    7.33,
    712.33,
    27.17,
    699,
    39.5,
    685.67,
    51.83,
    668,
    58,
    646,
    58,
    639.33,
    58,
    634.67,
    56.17,
    632,
    52.5,
    629.33,
    48.83,
    627,
    43.33,
    625,
    36,
    623,
    26,
    619.67,
    17.83,
    615,
    11.5,
    610.33,
    5.17,
    601.67,
    0.67,
    589,
    -2,
    571.67,
    -5.33,
    555.33,
    -9.33,
    540,
    -14,
    507.33,
    -22,
    486,
    -27,
    476,
    -29,
    462,
    -31.67,
    455,
    -37.33,
    455,
    -46,
    455,
    -50,
    457,
    -53.33,
    461,
    -56,
    465,
    -58.67,
    470,
    -59.67,
    476,
    -59,
  ],
  ['L', 502, -54],
  [
    'C',
    547.33,
    -44.67,
    579.33,
    -40,
    598,
    -40,
    618,
    -40,
    632.5,
    -43.67,
    641.5,
    -51,
    650.5,
    -58.33,
    655,
    -71,
    655,
    -89,
  ],
];

function lampStrokePath(extension) {
  const hook = LAMP_HOOK.map(
    ([command, ...coordinates]) =>
      command +
      coordinates
        .map((value, index) =>
          index % 2 === 0 ? value : (value + extension).toFixed(2),
        )
        .join(' '),
  ).join('');
  return `${LAMP_STEM}${hook}Z`;
}

function prepareLampStroke(documentApi, candidate) {
  // Keep the authored text in normal vertical layout and overlay its outline.
  const text = candidate.textContent;
  const index = text.trimEnd().length - 1;
  if (text[index] !== '灯') return null;
  const glyph = documentApi.createElement('span');
  glyph.className = 'lyrics-overlay__ornate-stroke-glyph';
  const native = documentApi.createElement('span');
  native.className = 'lyrics-overlay__ornate-stroke-native';
  native.dataset.ornateShadow = candidate.dataset.ornateShadow;
  delete candidate.dataset.ornateShadow;
  native.textContent = '灯';
  const svg = documentApi.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'lyrics-overlay__ornate-stroke-svg');
  svg.setAttribute('aria-hidden', 'true');
  // Vertical advance is 1000, with a top bearing of 28 and an ink top at -852.
  svg.setAttribute('viewBox', '0 -880 1000 1000');
  const fire = documentApi.createElementNS(SVG_NS, 'path');
  fire.setAttribute('d', LAMP_FIRE);
  const stem = documentApi.createElementNS(SVG_NS, 'path');
  svg.append(fire, stem);
  glyph.append(native, svg);
  candidate.replaceChildren(
    documentApi.createTextNode(text.slice(0, index)),
    glyph,
    documentApi.createTextNode(text.slice(index + 1)),
  );
  return { glyph, svg, stem };
}

function syncOrnateStroke(state, clock) {
  if (!state || clock.demo) return;
  const { elapsedMs, playing, rate } = clock;
  const { timeline } = state;
  const time = Math.min(elapsedMs / 1000, timeline.duration());
  if (Math.abs(timeline.time() - time) > 0.035 || !playing) timeline.time(time);
  timeline.timeScale(rate);
  timeline.paused(!playing);
}

function startOrnateStroke(elements, stroke, clock, entranceEnd, gsap) {
  if (!stroke) return;
  const { glyph, svg, stem } = stroke;
  const bounds = svg.getBoundingClientRect();
  const safeBottom = elements.root.getBoundingClientRect().bottom;
  const available = ((safeBottom - bounds.top) / bounds.height) * 1000 - 963;
  const max = Math.min(STROKE_LIMIT, available);
  if (!Number.isFinite(max) || max < 80) return;
  const onset = 0.12 + entranceEnd;
  if (!clock.demo && clock.durationMs / 1000 < onset + STROKE_DURATION) return;

  const pose = { extension: 0 };
  const timeline = gsap.timeline(
    clock.demo ? { repeat: -1, repeatDelay: 1.6 } : { paused: true },
  );
  timeline.to(
    pose,
    {
      extension: max,
      duration: STROKE_DURATION,
      ease: 'power3.out',
      onUpdate: () => {
        if (pose.extension > 0.5) {
          stem.setAttribute('d', lampStrokePath(pose.extension));
          glyph.dataset.ornateStrokeExtended = 'true';
        } else delete glyph.dataset.ornateStrokeExtended;
      },
    },
    onset,
  );
  const state = { timeline };
  ornateStrokeTransitions.set(elements.root, state);
  syncOrnateStroke(state, clock);
}

function ornateLineUnits(line) {
  return Array.from(line?.children ?? []).flatMap((segment) =>
    Array.from(segment?.children ?? []),
  );
}

export function appendOrnateSegmentUnits(
  documentApi,
  parent,
  units,
  mixedSizes,
) {
  const glyphParts = ornateVerticalGlyphParts(units, mixedSizes);
  return units.map((unit, index) => {
    const element = documentApi.createElement('span');
    element.className = 'lyrics-overlay__ornate-unit';
    element.dataset.ornateEmphasis = unit.emphasis ?? 'normal';
    element.dataset.ornateKind = unit.kind;
    element.dataset.ornateReveal = unit.reveal ?? '';
    const echo = unit.emphasis === 'keyword';
    if (echo && !mixedSizes) element.dataset.ornateText = unit.text.trim();
    const parts = glyphParts[index];
    if (parts) {
      for (const part of parts) {
        const span = documentApi.createElement('span');
        if (part.accent) span.className = 'lyrics-overlay__ornate-accent';
        if (part.style) Object.assign(span.style, part.style);
        if (part.kind === 'han') {
          span.dataset.ornateShadow = part.text;
          if (mixedSizes && echo) span.dataset.ornateEcho = part.text;
        }
        span.textContent = part.text;
        element.append(span);
      }
    } else {
      element.textContent = unit.text;
    }
    parent.append(element);
    return element;
  });
}

function createOrnateLine(
  documentApi,
  presentation,
  identity,
  mixedSizes,
  strokeEnabled,
) {
  const line = documentApi.createElement('span');
  line.className = 'lyrics-overlay__ornate-line';
  line.style.setProperty('--ornate-column-gap', ORNATE_VERTICAL_COLUMN_GAP);
  line.style.setProperty(
    '--ornate-shadow-distance',
    ORNATE_VERTICAL_SHADOW_DISTANCE,
  );
  line.dataset.ornateIdentity = identity;
  line.dataset.ornatePlacement = presentation.placement;
  line.dataset.ornateSegmentCount = String(presentation.segments.length);
  line.dataset.ornateText = presentation.text;
  line.setAttribute('aria-hidden', 'true');

  const units = [];
  let stroke = null;
  for (const segment of presentation.segments) {
    const segmentElement = documentApi.createElement('span');
    segmentElement.className = 'lyrics-overlay__ornate-segment';
    segmentElement.dataset.ornateSegmentIndex = String(segment.index);
    segmentElement.dataset.ornateSegmentText = segment.text;
    segmentElement.style.setProperty(
      'margin-top',
      `${segment.index * ORNATE_VERTICAL_COLUMN_STEP_EM}em`,
    );

    const columnUnits = appendOrnateSegmentUnits(
      documentApi,
      segmentElement,
      segment.units,
      mixedSizes,
    );
    const lastUnit = columnUnits.at(-1);
    if (
      strokeEnabled &&
      !stroke &&
      lastUnit?.textContent.trimEnd().endsWith('灯')
    ) {
      // A column-final glyph can grow without moving or painting over the next glyph.
      const part = Array.from(lastUnit.children).findLast((span) =>
        span.textContent.trim(),
      );
      const prepared = prepareLampStroke(documentApi, part ?? lastUnit);
      if (prepared)
        stroke = {
          ...prepared,
          unitIndex: units.length + columnUnits.length - 1,
        };
    }
    units.push(...columnUnits);
    line.append(segmentElement);
  }

  return { line, units, stroke };
}

export function stopOrnateVerticalTransition(elements, options = {}) {
  if (!options.keepStroke) {
    ornateStrokeTransitions.get(elements.root)?.timeline.kill();
    ornateStrokeTransitions.delete(elements.root);
  }
  const active = ornateVerticalTransitions.get(elements.root);
  active?.timeline?.kill?.();

  const incomingLine = active?.incoming?.line;
  let committedIncoming = null;
  if (incomingLine) {
    delete incomingLine.dataset.ornateMotion;
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
      gsap?.set?.(targets, {
        clearProps: `${active.clearProps},${SHADOW_PROGRESS}`,
      });
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
  const appearance = elements.current.ownerDocument?.documentElement?.dataset;
  const mixedSizes = appearance?.ovlOrnateArrangement === 'mixed-sizes';
  const entrance = appearance?.ovlOrnateEntrance ?? 'sequential';
  const shadowEnabled = appearance?.ovlTextShadow !== 'off';
  const clock = frame.ornateStrokeClock;
  const gsap = options.gsap ?? globalThis.gsap ?? null;
  const strokeEnabled = Boolean(
    clock &&
    options.reducedMotion !== true &&
    typeof gsap?.timeline === 'function' &&
    elements.current.ownerDocument?.documentElement?.dataset?.ovlFont ===
      'ornate',
  );
  const batchKey = lyricsDisplayBatchKey(frame);
  const identity = JSON.stringify([
    mixedSizes,
    entrance,
    strokeEnabled,
    batchKey,
    frame.ornateColumnTiming?.index,
    text,
    placement,
    source?.keyword?.text ?? null,
    source?.sectionAccentRanges ?? null,
    segments.map((segment) => segment.text),
  ]);
  const documentApi = elements.current.ownerDocument ?? globalThis.document;
  const active = ornateVerticalTransitions.get(elements.root);
  const previousLine = elements.current.children?.[0] ?? null;
  const sameLine =
    frame.visible && previousLine?.dataset?.ornateIdentity === identity;
  const playing =
    frame.ornateColumnTiming?.playing ?? frame.ornateRevealPlaying;

  if (
    active?.identity === identity &&
    playing !== false &&
    frame.timelineDiscontinuity !== true &&
    options.reducedMotion !== true
  ) {
    if (strokeEnabled)
      syncOrnateStroke(ornateStrokeTransitions.get(elements.root), clock);
    return;
  }
  stopOrnateVerticalTransition(elements, { ...options, keepStroke: sameLine });

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

  if (sameLine) {
    if (strokeEnabled)
      syncOrnateStroke(ornateStrokeTransitions.get(elements.root), clock);
    return;
  }

  const incoming = createOrnateLine(
    documentApi,
    presentation,
    identity,
    mixedSizes,
    strokeEnabled,
  );
  // Leave a fully readable interval at the end of a short, timed batch.
  const columnTiming = frame.ornateColumnTiming;
  const settledUnits = columnTiming?.settledUnits ?? 0;
  const fresh = incoming.units.slice(settledUnits);
  const remainingMs =
    columnTiming?.remainingMs ??
    frame.ornateRevealRemainingMs ??
    frame.lineRemainingMs;
  const revealWindow = Number.isFinite(remainingMs)
    ? remainingMs / 1000 - 0.18
    : Infinity;
  const { delays, duration, offsets } = ornateVerticalEntrancePlan(
    segments.flatMap(({ units }) => units).slice(settledUnits),
    revealWindow,
    entrance,
    `${batchKey}\0${frame.currentText ?? text}`,
  );
  const canAnimate =
    revealWindow >= 0.2 &&
    playing !== false &&
    frame.timelineDiscontinuity !== true &&
    options.reducedMotion !== true &&
    typeof gsap?.timeline === 'function';
  const shadowDurationForDelay = (delay) =>
    Math.min(ORNATE_VERTICAL_SHADOW_DURATION_SECONDS, revealWindow - delay);

  if (offsets) incoming.line.dataset.ornateEntrance = 'random-slide';
  elements.current.replaceChildren(incoming.line);
  if (incoming.stroke) {
    const { unitIndex } = incoming.stroke;
    const delay = delays[unitIndex - settledUnits];
    const entranceEnd =
      canAnimate && delay !== undefined && (offsets || delay > 0)
        ? delay + duration
        : canAnimate && delay === 0 && shadowEnabled
          ? shadowDurationForDelay(0)
          : 0;
    startOrnateStroke(elements, incoming.stroke, clock, entranceEnd, gsap);
  }
  if (
    !canAnimate ||
    (!offsets &&
      fresh.length < 2 &&
      !(shadowEnabled && fresh[0]?.dataset.ornateKind === 'han'))
  )
    return;

  incoming.line.dataset.ornateMotion = 'active';
  const clearProps = offsets ? SLIDE_CLEAR_PROPS : FINAL_CLEAR_PROPS;
  const token = { identity, incoming, timeline: null, clearProps };
  const timeline = gsap.timeline({
    onComplete: () => {
      if (ornateVerticalTransitions.get(elements.root) !== token) return;
      delete incoming.line.dataset.ornateMotion;
      ornateVerticalTransitions.delete(elements.root);
    },
  });
  token.timeline = timeline;
  ornateVerticalTransitions.set(elements.root, token);
  timeline.addLabel('enter', 0);

  for (const [index, unit] of fresh.entries()) {
    const delay = delays[index];
    const position = `enter+=${delay}`;
    const offset = offsets?.[index];
    if (offset || delay > 0) {
      gsap.set(unit, { autoAlpha: 0, ...offset });
      timeline.to(
        unit,
        {
          autoAlpha: 1,
          ...(offset && { x: 0, y: 0 }),
          clearProps,
          duration,
          ease: ORNATE_VERTICAL_ENTER_EASE,
        },
        position,
      );
    }
    if (shadowEnabled && unit.dataset.ornateKind === 'han') {
      gsap.set(unit, { [SHADOW_PROGRESS]: 0 });
      timeline.to(
        unit,
        {
          [SHADOW_PROGRESS]: 1,
          clearProps: SHADOW_PROGRESS,
          duration: shadowDurationForDelay(delay),
          ease: ORNATE_VERTICAL_ENTER_EASE,
        },
        position,
      );
    }
  }
}
