import { fineTextParts } from '../../shared/presentation/lyricsFineFrame.mjs';
import {
  paintLyricsFineUnit,
  cancelLyricsFinePaint,
} from '../../shared/browser/lyricsFinePaint.mjs';

const states = new WeakMap();

export function clearFineLyricsText(element) {
  for (const node of states.get(element)?.nodes ?? [])
    cancelLyricsFinePaint(node);
  states.delete(element);
  delete element.dataset.fineTiming;
}

// The outer node retains its original coarse onset state and cue. Only its ink
// children change continuously; no geometry reads or per-frame DOM rebuilding.
export function renderFineLyricsText(element, text, from, to, frame, options) {
  const key = frame.units.map((u) => `${u.unitId}:${u.from}:${u.to}`).join('|');
  let state = states.get(element);
  if (!state || state.key !== key) {
    clearFineLyricsText(element);
    element.textContent = '';
    const parts = fineTextParts(text, frame.units, from, to);
    const nodes = parts.map((part) => {
      const node = element.ownerDocument.createElement('span');
      node.textContent = part.text;
      if (part.unitId) {
        node.dataset.lyricsFineUnit = part.unitId;
        node.dataset.lyricsFineFrom = String(part.paintFrom);
        node.dataset.lyricsFineTo = String(part.paintTo);
        node.dataset.text = part.text;
        node.className = 'lyrics-overlay__fine-ink';
      }
      element.append(node);
      return node;
    });
    state = { key, parts, nodes };
    states.set(element, state);
  }
  element.dataset.fineTiming = 'true';
  for (let i = 0; i < state.nodes.length; i++) {
    const part = state.parts[i];
    if (!part.unitId) continue;
    const unit = frame.units.find(
      (candidate) => candidate.unitId === part.unitId,
    );
    paintLyricsFineUnit(state.nodes[i], unit, frame, {
      reducedMotion: options.reducedMotion === true,
      paintFrom: part.paintFrom,
      paintTo: part.paintTo,
    });
  }
}
