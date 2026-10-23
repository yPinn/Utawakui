import { fineTextParts } from '../../shared/presentation/lyricsFineFrame.mjs';
import {
  paintLyricsFineUnit,
  cancelLyricsFinePaint,
} from '../../shared/browser/lyricsFinePaint.mjs';

const states = new WeakMap();
const frameContexts = new WeakMap();
const structures = new Map();

// Static evidence survives a live DOM reset, but never caches clock/progress.
// The bounded content key includes timing and source ranges as well as text.
function prepareContext(text, frame, cost) {
  const previous = frameContexts.get(frame);
  if (previous?.text === text) return previous.context;
  const key = JSON.stringify([
    text,
    frame.units.map((u) => [
      u.unitId,
      u.from,
      u.to,
      u.startMs,
      u.endMs,
      u.timingSource,
    ]),
  ]);
  let context = structures.get(key);
  if (!context) {
    const units = frame.units.map(
      ({ unitId, from, to, startMs, endMs, timingSource }) => ({
        unitId,
        from,
        to,
        startMs,
        endMs,
        timingSource,
      }),
    );
    context = {
      text,
      units,
      byId: new Map(units.map((u) => [u.unitId, u])),
      parts: new Map(),
    };
    if (structures.size >= 8) structures.delete(structures.keys().next().value);
    structures.set(key, context);
    if (cost) cost.fineIndexes++;
  }
  frameContexts.set(frame, { text, context });
  return context;
}

function rangeParts(context, from, to, cost) {
  const key = `${from}:${to}`;
  if (context.parts.has(key)) {
    if (cost) cost.finePartsHits++;
    return context.parts.get(key);
  }
  // Validated units are source ordered. Search once instead of scanning the
  // entire line for every coarse segment; crossing units remain excluded.
  let lo = 0,
    hi = context.units.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (context.units[mid].from < from) lo = mid + 1;
    else hi = mid;
  }
  const units = [];
  for (let i = lo; i < context.units.length && context.units[i].from < to; i++)
    if (context.units[i].to <= to) units.push(context.units[i]);
  const parts = fineTextParts(context.text, units, from, to);
  if (context.parts.size >= 256)
    context.parts.delete(context.parts.keys().next().value);
  context.parts.set(key, parts);
  if (cost) cost.finePartsMisses++;
  return parts;
}

function markInk(node, part) {
  node.dataset.lyricsFineUnit = part.unitId;
  node.dataset.lyricsPaintSource = part.timingSource ?? 'model';
  node.dataset.lyricsFineFrom = String(part.paintFrom);
  node.dataset.lyricsFineTo = String(part.paintTo);
  node.dataset.text = part.text;
  node.className = `${node.className || ''} lyrics-overlay__fine-ink`;
}

export function clearFineLyricsText(element, cost) {
  const state = states.get(element);
  for (const node of state?.nodes ?? []) cancelLyricsFinePaint(node, cost);
  if (state?.single) {
    element.className = element.className
      .split(/\s+/u)
      .filter((name) => name !== 'lyrics-overlay__fine-ink')
      .join(' ');
    delete element.dataset.lyricsFineUnit;
    delete element.dataset.lyricsPaintSource;
    delete element.dataset.lyricsFineFrom;
    delete element.dataset.lyricsFineTo;
    element.style.removeProperty('--lyrics-fine-progress');
  }
  states.delete(element);
  delete element.dataset.fineTiming;
}

// The outer node retains its original coarse onset state and cue. Only its ink
// children change continuously; no geometry reads or per-frame DOM rebuilding.
export function renderFineLyricsText(
  element,
  text,
  from,
  to,
  frame,
  options,
  discontinuity = false,
) {
  const cost = options.fineCost;
  const started = cost?.now();
  const context = prepareContext(text, frame, cost);
  const parts = rangeParts(context, from, to, cost);
  if (cost) cost.finePrepareMs += cost.now() - started;
  let state = states.get(element);
  if (
    !state ||
    state.context !== context ||
    state.from !== from ||
    state.to !== to
  ) {
    if (cost) cost.fineMisses++;
    clearFineLyricsText(element, cost);
    const domStarted = cost?.now();
    const single =
      parts.length === 1 &&
      !!parts[0].unitId &&
      parts[0].from === from &&
      parts[0].to === to;
    let nodes;
    if (single) {
      // Exactly one grapheme already has its own coarse span. Keep that text
      // and cue node rather than clearing it and nesting another identical box.
      markInk(element, parts[0]);
      nodes = [element];
    } else {
      element.textContent = '';
      nodes = parts.map((part) => {
        const node = element.ownerDocument.createElement('span');
        node.textContent = part.text;
        if (part.unitId) {
          markInk(node, part);
        } else {
          node.className = 'lyrics-overlay__fine-gap';
        }
        element.append(node);
        return node;
      });
    }
    state = { context, from, to, parts, nodes, single };
    states.set(element, state);
    if (cost) {
      cost.fineNodes += single ? 0 : nodes.length;
      cost.fineDomMs += cost.now() - domStarted;
    }
  } else if (cost) {
    cost.fineHits++;
  }
  element.dataset.fineTiming = 'true';
  for (let i = 0; i < state.nodes.length; i++) {
    const part = state.parts[i];
    if (!part.unitId) continue;
    const lookupStarted = cost?.now();
    const unit = context.byId.get(part.unitId);
    if (cost) {
      cost.fineCells++;
      cost.fineLookupMs += cost.now() - lookupStarted;
    }
    paintLyricsFineUnit(state.nodes[i], unit, frame, {
      reducedMotion: options.reducedMotion === true,
      paintFrom: part.paintFrom,
      paintTo: part.paintTo,
      cost,
      reuse: !discontinuity,
    });
  }
}
