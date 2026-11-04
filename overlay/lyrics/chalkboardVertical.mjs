import { lyricsDisplayBatchKey } from '../../shared/presentation/lyricsDisplayFrame.mjs';

const transitions = new WeakMap();
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const columnEraseMs = 240;
const columnStaggerMs = 80;

function eraseWindowMs(frame) {
  const duration = frame.chalkboardDurationMs;
  if (!Number.isFinite(duration) || duration < 180) return 0;
  const lastDelay = frame.chalkboardColumnDelaysMs?.at(-1);
  const tail = Number.isFinite(lastDelay)
    ? Math.max(0, frame.chalkboardRemainingMs - lastDelay)
    : duration;
  const columnCount = frame.chalkboardColumns?.length || 1;
  return Math.min(
    columnEraseMs + (columnCount - 1) * columnStaggerMs,
    duration * 0.3,
    tail * 0.7,
  );
}

export function nextChalkboardTransitionDelayMs(frame) {
  if (
    !frame.visible ||
    !frame.currentText ||
    !frame.chalkboardPlaying ||
    frame.timelineDiscontinuity
  )
    return null;
  const windowMs = eraseWindowMs(frame);
  const eraseDelay = frame.chalkboardRemainingMs - windowMs;
  const nextColumn = frame.chalkboardColumnDelaysMs?.find((delay) => delay > 0);
  const delay = Math.min(
    windowMs && eraseDelay > 0 ? eraseDelay : Infinity,
    nextColumn ?? Infinity,
  );
  return Number.isFinite(delay) ? Math.ceil(delay) : null;
}

function mask(top, bottom) {
  return `inset(${top}% 0% ${100 - bottom}% 0%)`;
}

function eraseMask(edge, direction, bias) {
  if (!bias) return direction === 'up' ? mask(0, edge) : mask(edge, 100);
  const skew =
    Math.sin((edge / 100) * Math.PI * 2 + Math.PI / 4) *
    Math.min(bias, edge / 4, (100 - edge) / 4);
  const center = 50 + 12 * Math.sin((edge / 100) * Math.PI);
  const anchor = direction === 'up' ? 0 : 100;
  return `polygon(0% ${anchor}%, 100% ${anchor}%, 100% ${edge - skew}%, ${center}% ${edge}%, 0% ${edge + skew}%)`;
}

function characterStops(ink) {
  const units = Array.from(graphemes.segment(ink.textContent));
  if (!units.length) return [0];
  const range = ink.ownerDocument.createRange?.();
  const bounds = ink.getBoundingClientRect?.();
  if (!range || !ink.firstChild || !bounds?.height)
    return [0, ...units.map((_, index) => ((index + 1) * 100) / units.length)];
  range.setStart(ink.firstChild, 0);
  const stops = [0];
  for (const { index, segment } of units.slice(0, -1)) {
    range.setEnd(ink.firstChild, index + segment.length);
    const bottom = range.getBoundingClientRect().bottom;
    const stop = ((bottom - bounds.top) * 100) / bounds.height;
    if (stop >= 100) break;
    if (stop > stops.at(-1)) stops.push(stop);
  }
  return [...stops, 100];
}

function columnSteps(line) {
  return Array.from(line?.children ?? [], (column) => {
    const [ink, rule] = column.children;
    return { ink, rule, stops: characterStops(ink) };
  });
}

function scheduleMask(timeline, targets, from, to, at, step) {
  timeline.fromTo(
    targets,
    { clipPath: from },
    {
      clipPath: to,
      duration: step * 0.72,
      ease: 'none',
      immediateRender: false,
    },
    at,
  );
}

function buildLine(document, identity, columns) {
  const group = document.createElement('span');
  group.className = 'lyrics-overlay__chalkboard-group';
  group.dataset.chalkboardIdentity = identity;
  group.setAttribute('aria-hidden', 'true');
  for (const text of columns) {
    const column = document.createElement('span');
    const ink = document.createElement('span');
    const rule = document.createElement('span');
    column.className = 'lyrics-overlay__chalkboard-column';
    ink.className = 'lyrics-overlay__chalkboard-ink';
    rule.className = 'lyrics-overlay__chalkboard-rule';
    ink.textContent = text.trimEnd();
    column.append(ink, rule);
    group.append(column);
  }
  return group;
}

function settle(elements, line, delays) {
  const transition = transitions.get(elements.root);
  transitions.delete(elements.root);
  transition?.timeline?.kill();
  if (line) {
    for (const [index, column] of Array.from(line.children).entries()) {
      for (const part of column.children) {
        if (delays?.[index] > 0)
          part.style.setProperty('clip-path', mask(0, 0));
        else part.style.removeProperty('clip-path');
      }
    }
    elements.current.replaceChildren(line);
  } else elements.current.replaceChildren();
  elements.root.hidden = !line;
}

function writeLine(elements, incoming, frame, remaining, windowMs, gsap) {
  const delays = frame.chalkboardColumnDelaysMs;
  settle(elements, incoming, delays);
  if (!incoming) return;
  const columns = columnSteps(incoming);
  const token = { incoming, timeline: null, rate: frame.chalkboardRate };
  const timeline = gsap.timeline({
    onComplete() {
      if (transitions.get(elements.root) === token) settle(elements, incoming);
    },
  });
  token.timeline = timeline;
  transitions.set(elements.root, token);
  let cursorMs = 0;
  let scheduled = false;
  for (const [column, { ink, rule, stops }] of columns.entries()) {
    const delay = delays?.[column] ?? cursorMs;
    // A late join or seek should settle previously started columns immediately.
    if (delay < -35 || stops.length < 2) continue;
    const at = Math.max(0, delay);
    const until = Math.min(
      remaining - windowMs,
      delays?.[column + 1] ?? Infinity,
    );
    const span = Math.max(0, until - at);
    const step = Math.min(
      55,
      720 / (stops.length - 1),
      (span * 0.7) / (stops.length - 1),
    );
    if (step < 1) {
      if (at > 0) {
        scheduled = true;
        timeline.add(() => {
          for (const target of [ink, rule])
            target.style.removeProperty('clip-path');
        }, at / 1000);
      }
      continue;
    }
    scheduled = true;
    for (const target of [ink, rule])
      target.style.setProperty('clip-path', mask(0, 0));
    for (let index = 1; index < stops.length; index++) {
      scheduleMask(
        timeline,
        [ink, rule],
        mask(0, stops[index - 1]),
        mask(0, stops[index]),
        (at + (index - 1) * step) / 1000,
        step / 1000,
      );
    }
    cursorMs = at + (stops.length - 1) * step;
  }
  if (!scheduled) {
    transitions.delete(elements.root);
    timeline.kill();
  }
}

export function clearChalkboardVertical(elements) {
  if (elements.root.dataset.chalkboard !== 'true') return;
  settle(elements, null);
  delete elements.root.dataset.chalkboard;
  delete elements.current.dataset.currentText;
  elements.current.removeAttribute('aria-label');
  elements.next.hidden = false;
}

export function renderChalkboardVertical(elements, frame, options) {
  const { root, current, next } = elements;
  const text = frame.visible ? String(frame.currentText ?? '') : '';
  const columns = frame.chalkboardColumns ?? [text];
  const identity = text
    ? JSON.stringify([lyricsDisplayBatchKey(frame), columns])
    : '';
  const active = transitions.get(root);
  const previous = current.lastElementChild?.dataset.chalkboardIdentity
    ? current.lastElementChild
    : null;
  const candidate = active ? active.incoming : previous;
  const matching = identity === (candidate?.dataset.chalkboardIdentity ?? '');
  const gsap = options.gsap ?? globalThis.gsap;
  const animate =
    frame.chalkboardPlaying === true &&
    !frame.timelineDiscontinuity &&
    !options.reducedMotion &&
    typeof gsap?.timeline === 'function';
  const remaining = Number.isFinite(frame.chalkboardRemainingMs)
    ? frame.chalkboardRemainingMs
    : Infinity;
  const windowMs = eraseWindowMs(frame);
  const delays = frame.chalkboardColumnDelaysMs;

  root.dataset.chalkboard = 'true';
  current.dataset.currentText = text;
  current.setAttribute('aria-label', text);
  next.hidden = true;
  next.textContent = '';
  if (matching) {
    if (!animate && previous) {
      settle(elements, previous, delays);
      if (delays?.some((delay) => delay > 0))
        transitions.set(root, { incoming: previous, static: true });
    } else if (
      active?.static ||
      (active && !active.erasing && active.rate !== frame.chalkboardRate)
    ) {
      writeLine(elements, candidate, frame, remaining, windowMs, gsap);
    } else if (active?.erasing && remaining > windowMs) {
      settle(elements, candidate, delays);
    } else if (animate && previous && remaining > 0 && remaining <= windowMs) {
      if (!active?.erasing) eraseLine(elements, previous, remaining, gsap);
    } else if (!active) root.hidden = !previous;
    return;
  }

  const incoming = text
    ? buildLine(current.ownerDocument, identity, columns)
    : null;
  // The cue boundary owns the handoff, even if the previous erase is late.
  if (animate) writeLine(elements, incoming, frame, remaining, windowMs, gsap);
  else {
    settle(elements, incoming, delays);
    if (incoming && delays?.some((delay) => delay > 0))
      transitions.set(root, { incoming, static: true });
  }
}

function eraseLine(elements, previous, remaining, gsap) {
  settle(elements, previous);
  const { root } = elements;
  const outgoingColumns = columnSteps(previous);
  const view = root.ownerDocument?.defaultView;
  const edge = Number.parseFloat(
    view
      ?.getComputedStyle(root)
      .getPropertyValue('--ovl-chalkboard-erase-edge'),
  );
  const edgePx = Number.isFinite(edge) ? Math.max(0, Math.min(4, edge)) : 0;
  const scale = Math.min(
    1,
    remaining /
      (columnEraseMs + (outgoingColumns.length - 1) * columnStaggerMs),
  );
  const token = { incoming: previous, timeline: null, erasing: true };
  const timeline = gsap.timeline({
    onComplete() {
      if (transitions.get(root) === token) root.hidden = true;
    },
  });
  token.timeline = timeline;
  transitions.set(root, token);
  for (const [column, { ink, rule, stops }] of outgoingColumns.entries()) {
    const count = stops.length - 1;
    const step = Math.min(0.045, columnEraseMs / 1000 / count) * scale;
    const height = edgePx ? ink.getBoundingClientRect().height : 0;
    const bias = height ? (edgePx / height) * 100 : 0;
    const startsAt = (column * columnStaggerMs * scale) / 1000;
    for (let index = 0; index < count; index++) {
      scheduleMask(
        timeline,
        ink,
        eraseMask(stops[count - index], 'up', bias),
        eraseMask(stops[count - index - 1], 'up', bias),
        startsAt + index * step,
        step,
      );
    }
    // The shortened rail keeps moving downward while the ink erases in steps.
    if (count) {
      const edges = bias ? [0, 50, 100] : [0, 100];
      const duration = ((count - 0.28) * step) / (edges.length - 1);
      for (let index = 1; index < edges.length; index++) {
        timeline.fromTo(
          rule,
          { clipPath: eraseMask(edges[index - 1], 'down', bias) },
          {
            clipPath: eraseMask(edges[index], 'down', bias),
            duration,
            ease: 'none',
            immediateRender: false,
          },
          startsAt + (index - 1) * duration,
        );
      }
    }
  }
}
