import {
  createDoodleCloudEffect,
  createDoodleCloudState,
} from '../../shared/browser/doodleCloudEffect.mjs';
import { splitLyricsDisplayRows } from '../../shared/presentation/lyricsDisplayLayout.mjs';
import { isSafeLyricsBreak } from '../../shared/presentation/lyricsTextProcessing.mjs';

const states = new WeakMap();
// Shared Output line rules: horizontal rows stop at 18em; a vertical lyric
// with more columns than this splits into two blocks side by side.
const READABLE_EMS = 18;
const BLOCK_COLUMNS = 3;
// Word boundaries keep a vertical column from splitting a word.
const japaneseWords = new Intl.Segmenter('ja', { granularity: 'word' });
const ROW_OPTIONS = Object.freeze({
  literalPrefixes: true,
  keepLatinRuns: true,
  keepJapaneseContractions: true,
  preferExplicitBreaks: true,
});
const japaneseScript =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

function createInk(document) {
  const ink = document.createElement('div');
  ink.className = 'textured-credits__ink';
  const line = document.createElement('p');
  line.className = 'textured-credits__line';
  line.dir = 'auto';
  // A static glow copy fades in and out, so the text never repaints its shadow.
  const glow = document.createElement('p');
  glow.className = 'textured-credits__line textured-credits__line-glow';
  glow.dir = 'auto';
  glow.setAttribute('aria-hidden', 'true');
  ink.append(line, glow);
  return { ink, line, glow };
}

function createLayers(root) {
  const document = root.ownerDocument;
  const current = createInk(document);
  const previous = createInk(document);
  const cue = document.createElement('div');
  cue.className = 'textured-credits__cue';
  cue.append(current.ink);
  previous.ink.className += ' textured-credits__previous';
  previous.ink.setAttribute('aria-hidden', 'true');
  root.replaceChildren(cue, previous.ink);
  const state = {
    ...current,
    previous,
    root,
    cue,
    document,
    fx: createDoodleCloudState(),
    effect: null,
    cueKey: null,
    timeline: null,
    durationMs: null,
  };
  states.set(root, state);
  return state;
}

// The texture burn has a fixed length, so it only opens each lyric; the lyric
// holds for the rest of its cue. Very short cues compress it.
export const TEXTURED_CREDITS_BURN_SECONDS = 0.7;

export function createTexturedCreditsTimeline(
  gsap,
  { ink, inkGlow, fx, previousInk, onUpdate },
  durationMs,
  continuesIntoNext = false,
) {
  // Every texture layer burns like a fuse along its own direction, starting at
  // its own moment: it draws in at a steady pace, then dissolves the same way,
  // and all layers finish together. The lyric fades in fluorescent while the
  // textures draw and turns white as they dissolve; the stack drifts throughout.
  const duration = durationMs / 1000;
  const burn = Math.min(TEXTURED_CREDITS_BURN_SECONDS, duration * 0.4);
  const exit = Math.min(0.23, duration * 0.18);
  const glowStart = burn * 0.08;
  const glowIn = burn * 0.25;
  const turn = burn * 0.5;
  const timeline = gsap.timeline({
    paused: true,
    defaults: { ease: 'power2.out' },
    ...(onUpdate ? { onUpdate } : {}),
  });
  timeline
    .addLabel('burn', 0)
    .addLabel('ink', turn)
    .addLabel('burn-end', burn)
    .set([ink, inkGlow], { opacity: 0, immediateRender: true }, 'burn')
    .set(fx.burn, { progress: 0, immediateRender: true }, 'burn')
    .set(fx.glow, { opacity: 0, immediateRender: true }, 'burn')
    .set(fx.drift, { value: 0, immediateRender: true }, 'burn')
    .set(fx.flash, { opacity: 0, scale: 0.7, immediateRender: true }, 'burn')
    .to(fx.burn, { progress: 1, duration: burn, ease: 'none' }, 'burn')
    .to(fx.drift, { value: 1, duration: burn, ease: 'none' }, 'burn')
    .to(inkGlow, { opacity: 1, duration: glowIn, ease: 'sine.out' }, glowStart)
    .to(fx.glow, { opacity: 0.72, duration: turn, ease: 'sine.inOut' }, 'burn')
    // A light burst as the textures turn from drawing to dissolving.
    .to(
      fx.flash,
      { opacity: 0.4, duration: burn * 0.1, ease: 'sine.out' },
      'ink',
    )
    .to(
      fx.flash,
      { scale: 1.2, duration: burn * 0.25, ease: 'sine.out' },
      'ink',
    )
    .to(
      fx.flash,
      { opacity: 0, duration: burn * 0.2, ease: 'sine.in' },
      `ink+=${burn * 0.1}`,
    )
    // The fluorescent copy gives way to the white lyric by the burn's end.
    .to(ink, { opacity: 1, duration: burn - turn, ease: 'sine.inOut' }, 'ink')
    .to(
      inkGlow,
      { opacity: 0, duration: burn - turn, ease: 'sine.inOut' },
      'ink',
    );
  if (previousInk) {
    const releaseAt = burn * 0.05;
    const releaseEnd = glowStart + glowIn;
    timeline
      .set(previousInk, { opacity: 1, immediateRender: true }, 'burn')
      .addLabel('previous-exit', releaseAt);
    fadeInk(timeline, previousInk, 'previous-exit', releaseEnd - releaseAt);
  }
  if (!continuesIntoNext) {
    timeline.addLabel('exit', duration - exit);
    fadeInk(timeline, ink, 'exit', exit);
  }
  return timeline;
}

function fadeInk(timeline, ink, label, duration) {
  timeline.to(ink, { opacity: 0, duration, ease: 'sine.in' }, label);
}

function stopAnimation(state) {
  state.timeline?.revert();
  state.timeline = null;
  state.durationMs = null;
  state.effect?.render();
}

export function clearTexturedCredits(root) {
  const state = states.get(root);
  if (!state || root.hidden) return;
  stopAnimation(state);
  root.hidden = true;
}

// Frees the GPU canvas when the slot leaves this template or the page stops.
export function releaseTexturedCredits(root) {
  const state = states.get(root);
  if (!state) return;
  clearTexturedCredits(root);
  state.effect?.destroy();
  state.effect = null;
}

// Merges the text's client rects into one box per visual line (a column when
// vertical) so doodles can follow each line.
function mergeLineRects(rects, vertical) {
  const lines = [];
  for (const rect of rects) {
    if (!rect.width || !rect.height) continue;
    const line = lines.find((box) =>
      vertical
        ? Math.abs(box.x + box.width / 2 - (rect.left + rect.width / 2)) <
          rect.width / 2
        : Math.abs(box.y + box.height / 2 - (rect.top + rect.height / 2)) <
          rect.height / 2,
    );
    if (!line) {
      lines.push({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
      continue;
    }
    const right = Math.max(line.x + line.width, rect.right);
    const bottom = Math.max(line.y + line.height, rect.bottom);
    line.x = Math.min(line.x, rect.left);
    line.y = Math.min(line.y, rect.top);
    line.width = right - line.x;
    line.height = bottom - line.y;
  }
  return lines;
}

// Line boxes in canvas pixels, read once per cue rather than every frame.
function doodleLayoutFor(state) {
  const canvas = state.effect?.canvas.getBoundingClientRect?.();
  const range = state.document.createRange?.();
  if (!canvas || !range) return null;
  range.selectNodeContents(state.line);
  const vertical = state.ink.dataset.writing === 'vertical';
  const lines = mergeLineRects([...range.getClientRects()], vertical).map(
    (line) => ({ ...line, x: line.x - canvas.left, y: line.y - canvas.top }),
  );
  return { writing: vertical ? 'vertical' : 'horizontal', lines };
}

function ensureEffect(state, { pixi, pixiFilters }) {
  if (state.effect || !pixi) return state.effect;
  state.effect = createDoodleCloudEffect({
    pixi,
    filters: pixiFilters ?? pixi.filters,
    documentApi: state.document,
    state: state.fx,
    className: 'textured-credits__artwork',
    layoutFor: () => doodleLayoutFor(state),
  });
  if (state.effect) {
    // The canvas covers the whole output, so it sits on the template root.
    state.root.insertBefore(state.effect.canvas, state.cue);
    state.doodleCue = null;
    state.effect.ready.then(() => state.effect?.setCue(state.cueKey));
  }
  return state.effect;
}

// Measures the lyric, then plans its rows with the shared break rules: the
// whole line always shows at full size.
function fitInk(parts, value, root) {
  const { ink, line } = parts;
  const document = line.ownerDocument;
  const range = document?.createRange?.();
  const view = document?.defaultView;
  if (!range || !view || !line.getBoundingClientRect) return null;
  const vertical = ink.dataset.writing === 'vertical';
  delete ink.dataset.plannedRows;
  ink.dataset.measuring = '';
  line.textContent = value;
  const extent = (rect) => (vertical ? rect.height : rect.width);
  // Vertical columns keep their CSS length limit; horizontal rows also stop
  // at the shared 18em readability ceiling.
  const capacity = vertical
    ? extent(line.getBoundingClientRect())
    : Math.min(
        root.clientWidth,
        parseFloat(view.getComputedStyle(line).fontSize) * READABLE_EMS,
      );
  const advances = new Map();
  const blocks = planTexturedCreditsRows(
    value,
    capacity,
    (text) => {
      if (!advances.has(text)) {
        line.textContent = text;
        range.selectNodeContents(line);
        advances.set(text, extent(range.getBoundingClientRect()));
      }
      return advances.get(text);
    },
    vertical,
  );
  delete ink.dataset.measuring;
  return blocks;
}

// Plans a lyric for a row capacity in pixels, given each text's advance.
// Horizontal rows break at the shared phrase and punctuation candidates.
// Vertical columns each hold one whole phrase (split only when a phrase is
// longer than a column), and many columns split into two blocks shown side
// by side. Returns the blocks of rows, or null when nothing can be planned.
export function planTexturedCreditsRows(value, capacity, advance, vertical) {
  if (!(capacity > 0)) return null;
  if (vertical) {
    // The shared phrase breaks, then each phrase on as few columns as it needs.
    const phrases = splitLyricsDisplayRows(value, () => true, Infinity, {
      ...ROW_OPTIONS,
      authoredPhraseSpaces: true,
    });
    if (!phrases) return null;
    const columns = phrases.flatMap(({ text }) =>
      phraseColumns(text.trim(), capacity, advance),
    );
    if (columns.includes(null)) return null;
    const filled = columns.filter(Boolean);
    if (filled.length <= BLOCK_COLUMNS) return [filled];
    const half = Math.ceil(filled.length / 2);
    return [filled.slice(0, half), filled.slice(half)];
  }
  const split = (width) =>
    advance(value.trimEnd()) <= width
      ? [{ text: value }]
      : splitLyricsDisplayRows(
          value,
          (text) => advance(text.trimEnd()) <= width,
          Infinity,
          ROW_OPTIONS,
        );
  let planned = split(capacity);
  if (!planned) return null;
  // Balance: the narrowest width that keeps the same row count evens the
  // rows out, so no word or clause tail is left alone on a row.
  let [narrow, wide] = [0, capacity];
  while (wide - narrow > 1) {
    const width = (narrow + wide) / 2;
    const rows = split(width);
    if (rows && rows.length <= planned.length) {
      wide = width;
      planned = rows;
    } else narrow = width;
  }
  return [planned.map(({ text }) => text.trim()).filter(Boolean)];
}

// Splits one phrase into the fewest columns that fit, breaking only between
// words (and where the shared rules allow), with the columns balanced.
function phraseColumns(phrase, capacity, advance) {
  if (!phrase) return [];
  if (advance(phrase) <= capacity) return [phrase];
  const points = [0];
  for (const { index } of japaneseWords.segment(phrase))
    if (index > 0 && isSafeLyricsBreak(phrase, index)) points.push(index);
  points.push(phrase.length);
  // best[j]: fewest columns up to points[j], then the narrowest widest column.
  const best = points.map(() => null);
  best[0] = { count: 0, widest: 0, from: -1 };
  for (let end = 1; end < points.length; end += 1) {
    for (let start = end - 1; start >= 0; start -= 1) {
      const width = advance(phrase.slice(points[start], points[end]).trim());
      if (width > capacity) break;
      if (!best[start]) continue;
      const option = {
        count: best[start].count + 1,
        widest: Math.max(best[start].widest, width),
        from: start,
      };
      const current = best[end];
      if (
        !current ||
        option.count < current.count ||
        (option.count === current.count && option.widest < current.widest)
      )
        best[end] = option;
    }
  }
  if (!best.at(-1)) {
    // A single word longer than a column: fall back to the shared splitter.
    const rows = splitLyricsDisplayRows(
      phrase,
      (text) => advance(text.trimEnd()) <= capacity,
      Infinity,
      ROW_OPTIONS,
    );
    return rows ? rows.map(({ text }) => text.trim()).filter(Boolean) : [null];
  }
  const columns = [];
  for (let end = points.length - 1; end > 0; end = best[end].from)
    columns.unshift(phrase.slice(points[best[end].from], points[end]).trim());
  return columns;
}

// Writes the planned blocks into one copy of the lyric.
function writeBlocks(element, blocks, value) {
  if (!blocks || blocks.length === 1) {
    const text = blocks ? blocks[0].join('\n') : value;
    if (element.textContent !== text) element.textContent = text;
    return;
  }
  element.replaceChildren(
    ...blocks.map((rows) => {
      const block = element.ownerDocument.createElement('span');
      block.className = 'textured-credits__block';
      block.textContent = rows.join('\n');
      return block;
    }),
  );
}

function writeInk(parts, value, language, root) {
  const { ink, line, glow } = parts;
  const vertical = /^ja(?:-|$)/i.test(language)
    ? japaneseScript.test(value)
    : language === 'und' && kana.test(value);
  ink.dataset.writing = vertical ? 'vertical' : 'horizontal';
  const lang = vertical && language === 'und' ? 'ja' : language;
  for (const element of [line, glow]) element.lang = lang;
  // Refit only when the text, writing, frame size or loaded fonts change.
  const view = line.ownerDocument?.defaultView;
  const fitKey = [
    value,
    ink.dataset.writing,
    root.clientWidth,
    view?.innerHeight,
    line.ownerDocument?.fonts?.status,
  ].join('|');
  if (parts.fitKey !== fitKey) {
    parts.fitKey = fitKey;
    const blocks = fitInk(parts, value, root);
    if (blocks) ink.dataset.plannedRows = '';
    else delete ink.dataset.plannedRows;
    for (const element of [line, glow]) writeBlocks(element, blocks, value);
  }
  return ink.dataset.writing;
}

export function renderTexturedCredits(
  root,
  frame,
  { gsap, pixi = null, pixiFilters = null, reducedMotion = false } = {},
) {
  if (!root) return;
  if (!frame.visible || !frame.currentText) {
    clearTexturedCredits(root);
    return;
  }

  const language = frame.language || 'und';
  const state = states.get(root) ?? createLayers(root);
  const writing = writeInk(state, frame.currentText, language, root);
  const cueKey = `${frame.lineIndex ?? ''}:${frame.repeatCueStartMs ?? ''}:${writing}:${frame.currentText}`;
  if (state.cueKey !== cueKey) {
    stopAnimation(state);
    state.cueKey = cueKey;
  }
  root.dataset.writing = writing;
  root.hidden = false;
  const timing = frame.texturedCreditsTiming;
  const previous = state.previous;
  if (reducedMotion || !timing || !gsap || !(timing.durationMs > 0)) {
    if (state.timeline) stopAnimation(state);
    previous.ink.hidden = true;
    return;
  }

  const effect = ensureEffect(state, { pixi, pixiFilters });
  if (effect && state.doodleCue !== cueKey) {
    // Each cue lays out its own seeded doodles around the new lyric.
    state.doodleCue = cueKey;
    effect.setCue(cueKey);
  }
  const hasPrevious = Boolean(timing.previous?.text);
  const continuesIntoNext = Boolean(timing.continuesIntoNext);
  previous.ink.hidden = !hasPrevious;
  if (hasPrevious) writeInk(previous, timing.previous.text, language, root);
  if (
    state.durationMs !== timing.durationMs ||
    state.hasPrevious !== hasPrevious ||
    state.continuesIntoNext !== continuesIntoNext
  ) {
    stopAnimation(state);
    state.durationMs = timing.durationMs;
    state.hasPrevious = hasPrevious;
    state.continuesIntoNext = continuesIntoNext;
    state.timeline = createTexturedCreditsTimeline(
      gsap,
      {
        // The white line and its fluorescent copy share the ink container.
        ink: state.line,
        inkGlow: state.glow,
        fx: state.fx,
        previousInk: hasPrevious ? previous.ink : null,
        onUpdate: () => state.effect?.render(),
      },
      timing.durationMs,
      continuesIntoNext,
    );
  }
  const timeline = state.timeline;
  const age = Math.max(0, Math.min(timing.ageMs, timing.durationMs)) / 1000;
  timeline
    .timeScale(timing.rate)
    .time(age, true)
    .paused(!timing.playing || timing.ageMs >= timing.durationMs);
  // Seeking suppresses callbacks, so draw the sampled state explicitly.
  state.effect?.render();
}
