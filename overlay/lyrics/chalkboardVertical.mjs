import { lyricsDisplayBatchKey } from '../../shared/presentation/lyricsDisplayFrame.mjs';

const transitions = new WeakMap();
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function mask(top, bottom) {
  return `inset(${top}% 0% ${100 - bottom}% 0%)`;
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
    ink.textContent = text;
    column.append(ink, rule);
    group.append(column);
  }
  return group;
}

function settle(elements, line) {
  const transition = transitions.get(elements.root);
  transitions.delete(elements.root);
  transition?.timeline.kill();
  if (line) {
    for (const column of line.children) {
      for (const part of column.children)
        part.style.removeProperty('clip-path');
    }
    elements.current.replaceChildren(line);
  } else elements.current.replaceChildren();
  elements.root.hidden = !line;
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
  const candidate = active ? active.incoming : current.lastElementChild;
  const previous = candidate?.dataset.chalkboardIdentity ? candidate : null;
  const matching = identity === (previous?.dataset.chalkboardIdentity ?? '');
  const gsap = options.gsap ?? globalThis.gsap;
  const animate =
    frame.chalkboardPlaying === true &&
    !frame.timelineDiscontinuity &&
    !options.reducedMotion &&
    typeof gsap?.timeline === 'function';

  root.dataset.chalkboard = 'true';
  current.dataset.currentText = text;
  current.setAttribute('aria-label', text);
  next.hidden = true;
  next.textContent = '';
  if (matching) {
    if (!animate && active) settle(elements, previous);
    else if (!active) root.hidden = !previous;
    return;
  }

  const incoming = text
    ? buildLine(current.ownerDocument, identity, columns)
    : null;
  const remaining = frame.chalkboardRemainingMs;
  const reveal = !Number.isFinite(remaining) || remaining >= 180;
  settle(elements, previous);
  if (!animate || (!previous && !reveal)) {
    settle(elements, incoming);
    return;
  }

  if (incoming) current.append(incoming);
  root.hidden = false;
  const outgoingColumns = columnSteps(previous);
  const incomingColumns = reveal ? columnSteps(incoming) : [];
  const token = { incoming, timeline: null };
  const timeline = gsap.timeline({
    onComplete() {
      if (transitions.get(root) === token) settle(elements, incoming);
    },
  });
  token.timeline = timeline;
  transitions.set(root, token);
  for (const [column, { ink, rule, stops }] of outgoingColumns.entries()) {
    const count = stops.length - 1;
    const step = Math.min(0.045, 0.24 / count);
    for (let index = 0; index < count; index++) {
      const at = column * 0.025 + index * step;
      scheduleMask(
        timeline,
        ink,
        mask(0, stops[count - index]),
        mask(0, stops[count - index - 1]),
        at,
        step,
      );
      scheduleMask(
        timeline,
        rule,
        mask(stops[index], 100),
        mask(stops[index + 1], 100),
        at,
        step,
      );
    }
  }
  const characterCount = incomingColumns.reduce(
    (total, { stops }) => total + stops.length - 1,
    0,
  );
  const budget = Number.isFinite(remaining)
    ? Math.min(720, remaining * 0.7)
    : 720;
  const step = Math.min(0.055, budget / 1000 / characterCount);
  let cursor = 0;
  for (const { ink, rule, stops } of incomingColumns) {
    for (const target of [ink, rule])
      target.style.setProperty('clip-path', mask(0, 0));
    for (let index = 1; index < stops.length; index++) {
      scheduleMask(
        timeline,
        [ink, rule],
        mask(0, stops[index - 1]),
        mask(0, stops[index]),
        cursor * step,
        step,
      );
      cursor++;
    }
  }
}
