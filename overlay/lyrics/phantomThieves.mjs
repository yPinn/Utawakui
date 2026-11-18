import {
  phantomPortraitTone,
  OUTPUT_APPEARANCE_DEFAULTS,
} from '../../shared/outputAppearance.mjs';
import {
  lyricsDisplayBreakCandidates,
  lyricsLatinRuns,
} from '../../shared/presentation/lyricsPresentation.mjs';
import { isSafeLyricsBreak } from '../../shared/presentation/lyricsTextProcessing.mjs';
import { splitLyricsDisplayRows } from '../../shared/presentation/lyricsDisplayLayout.mjs';

const scenes = new WeakMap();
const svgNamespace = 'http://www.w3.org/2000/svg';
const sideCardTailX = -1.95;
const nameplateTailBottom = 0.32;
const frameParts = {
  'side-card': ['face', 'tab'],
  nameplate: ['face'],
  portrait: ['back', 'mat', 'fill'],
  strip: ['face'],
  collage: ['back', 'face', 'tab'],
};
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const words = new Intl.Segmenter(undefined, { granularity: 'word' });
const kana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const hangul = /\p{Script=Hangul}/u;
const latin = /^[\p{Script=Latin}\P{L}]+$/u;
const phantomNameLetters =
  /^[\p{Script=Latin}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\P{L}]+$/u;
const modeCorners = {
  radial: 'top-left',
  ransom: 'bottom-right',
  chat: 'top-right',
  'side-card': 'bottom-left',
  'choice-stack': 'bottom-right',
};

function characters(text) {
  return Array.from(graphemes.segment(text), ({ segment }) => segment);
}

export function phantomPhrases(text) {
  const chunks =
    text.match(/[^，、。！？,!?]+[，、。！？,!?]*|[，、。！？,!?]+/gu) ?? [];
  const phrases = [];
  for (const chunk of chunks) {
    let phrase = '';
    for (const word of wordUnits(chunk.trim())) {
      if (
        phrase &&
        !/^[\s，、。！？,!?]+$/u.test(word) &&
        characters(phrase + word.trimEnd()).length > 7 &&
        phrases.length < 5
      ) {
        phrases.push(phrase.trimEnd());
        phrase = '';
      }
      if (phrase || word.trim()) phrase += word;
    }
    if (!phrase) continue;
    if (phrases.length < 6) phrases.push(phrase.trimEnd());
    else phrases[5] += chunk;
  }
  return phrases;
}

function wordUnits(text) {
  return Array.from(words.segment(text), ({ segment }) =>
    /^[\p{Script=Latin}\d]/u.test(segment) ? [segment] : characters(segment),
  ).flat();
}

function add(parent, className, text = '') {
  const node = parent.ownerDocument.createElement('span');
  node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

export function phantomFramePoints(kind, width, height, unit) {
  if (kind === 'portrait') {
    return [
      [
        [0.02, 0.045],
        [0.84, 0.13],
        [0.99, 0.81],
        [0.23, 0.99],
      ],
      [
        [0.1, 0.12],
        [0.8, 0.195],
        [0.91, 0.765],
        [0.28, 0.9],
      ],
      [
        [0.155, 0.19],
        [0.76, 0.247],
        [0.855, 0.719],
        [0.314, 0.832],
      ],
    ].map((layer) => layer.map(([x, y]) => [x * width, y * height]));
  }
  const x = (offset) => offset * unit;
  const end = (offset) => width - x(offset);
  const bottom = (offset) => height - x(offset);
  if (kind === 'nameplate') {
    return [
      [
        [x(0.2), x(0.12)],
        [end(0.42), x(0.12)],
        [end(0.2), bottom(0.12)],
        [x(1.6), bottom(0.12)],
        [x(1.75), bottom(-0.2)],
        [x(sideCardTailX), bottom(nameplateTailBottom)],
        [x(0.42), bottom(0.72)],
      ],
    ];
  }
  if (kind === 'side-card') {
    const rise = Math.min(width * 0.06, x(1.15));
    return [
      [
        [x(1.0), x(0.2) + rise],
        [end(1.3), x(0.2)],
        [end(0.2), bottom(0.16)],
        [x(2.0), bottom(1.52)],
        [x(1.4), bottom(1.12)],
        [x(-0.22), bottom(2.44)],
        [x(-0.72), bottom(1.94)],
        [x(sideCardTailX), bottom(3.22)],
        [x(-0.93), bottom(2.72)],
        [x(-0.55), bottom(3.42)],
        [x(0.7), bottom(2.88)],
      ],
      [
        [end(3.25), bottom(1.16)],
        [end(-0.48), bottom(4.48)],
        [end(-2.14), bottom(2.94)],
        [end(2.93), bottom(1.14)],
      ],
    ];
  }
  if (kind === 'strip') {
    const middle = height * 0.52;
    return [
      [
        [x(2.55), x(0.55)],
        [end(0.35), x(0.2)],
        [end(1.15), bottom(0.28)],
        [x(2.4), bottom(0.45)],
        [x(0.35), bottom(0.95)],
        [x(1.6), middle],
        [x(0.9), x(0.97)],
        [x(2.4), x(0.85)],
      ],
    ];
  }
  return [
    [
      [x(0.4), x(1.05)],
      [x(2.9), x(0.2)],
      [x(3.7), x(0.65)],
      [end(0.35), x(0.22)],
      [end(0.95), bottom(0.78)],
      [end(2.8), bottom(0.78)],
      [end(2.5), bottom(0.2)],
      [x(2.5), bottom(0.38)],
      [x(1.9), bottom(0.85)],
      [x(0.22), bottom(0.55)],
    ],
    [
      [x(0.55), x(0.55)],
      [end(0.95), x(0.92)],
      [end(0.62), bottom(1.2)],
      [end(3.6), bottom(0.76)],
      [x(1.35), bottom(0.94)],
      [x(1.6), bottom(1.48)],
      [x(0.32), bottom(1.64)],
    ],
    [
      [end(3.55), bottom(0.79)],
      [end(1.9), bottom(0.85)],
      [end(2.7), bottom(0.32)],
      [end(2.9), bottom(0.62)],
    ],
  ];
}

function addFrame(parent, kind) {
  const document = parent.ownerDocument;
  const frame = add(parent, 'phantom-thieves__card-frame');
  frame.dataset.frame = kind;
  frame.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(svgNamespace, 'svg');
  const polygons = frameParts[kind].map((part) => {
    const polygon = document.createElementNS(svgNamespace, 'polygon');
    polygon.setAttribute('class', `phantom-thieves__frame-${part}`);
    svg.append(polygon);
    return polygon;
  });
  frame.append(svg);
  return {
    frame,
    polygons,
    resize(unit) {
      const { clientWidth: width, clientHeight: height } = parent;
      if (!width || !height) return;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.style.setProperty('--phantom-frame-stroke', `${unit * 0.17}px`);
      phantomFramePoints(kind, width, height, unit).forEach((points, index) => {
        polygons[index].setAttribute(
          'points',
          points.map(([px, py]) => `${px},${py}`).join(' '),
        );
      });
    },
  };
}

function dialogueLanguage(text, language = 'und') {
  const japanese = kana.test(text);
  const korean = hangul.test(text);
  if (japanese && !korean && !/^ja(?:-|$)/i.test(language)) return 'ja';
  if (korean && !japanese && !/^ko(?:-|$)/i.test(language)) return 'ko';
  return language || 'und';
}

function addNameplate(card, artist) {
  const plate = add(card, 'phantom-thieves__name');
  plate.style.setProperty('--phantom-name-tail-x', `${sideCardTailX}cqw`);
  plate.style.setProperty(
    '--phantom-name-tail-bottom',
    `${nameplateTailBottom}cqw`,
  );
  plate.dir = 'auto';
  plate.lang = dialogueLanguage(artist);
  plate.setAttribute('role', 'img');
  plate.setAttribute('aria-label', artist);
  const label = add(plate, 'phantom-thieves__name-label');
  if (!phantomNameLetters.test(artist)) {
    label.textContent = artist;
    return plate;
  }
  const letters = Array.from(graphemes.segment(artist)).filter(({ segment }) =>
    /[\p{L}0-9]/u.test(segment),
  );
  const firstAccent = letters.length === 1 ? 0 : 1;
  let start = 0;
  for (const { segment, index } of letters.filter(
    (_, index) => index % 5 === firstAccent,
  )) {
    if (index > start) label.append(artist.slice(start, index));
    add(label, 'phantom-thieves__name-accent', segment);
    start = index + segment.length;
  }
  if (start < artist.length) label.append(artist.slice(start));
  return plate;
}

function addCopy(card, text, { paragraph = false } = {}) {
  const copy = add(card, 'phantom-thieves__copy', text);
  copy.dir = 'auto';
  if (!paragraph) {
    const length = characters(text).length;
    copy.style.setProperty(
      '--phantom-copy-scale',
      Math.max(0.58, Math.min(1, 37 / length)),
    );
  }
  return copy;
}

export function planRansomRows(tokens, capacity) {
  const text = tokens.map(({ text }) => text).join('');
  const latinRuns = lyricsLatinRuns(text);
  const breakPriorities = new Map(
    lyricsDisplayBreakCandidates(text).map(({ offset, priority }) => [
      offset,
      priority,
    ]),
  );
  const total = tokens.reduce((width, token) => width + token.width, 0);
  let offset = 0;
  let width = 0;
  let trailingSpace = 0;
  const cuts = tokens.flatMap((token, index) => {
    const left = width - trailingSpace;
    const right = total - width;
    const start = offset;
    const gap = /^\s+$/u.test(token.text);
    offset += token.text.length;
    width += token.width;
    trailingSpace = gap ? trailingSpace + token.width : 0;
    if (!left || gap || !isSafeLyricsBreak(text, start)) return [];
    const required = Math.max(left, right);
    const priority = breakPriorities.get(start) ?? 0;
    return [
      {
        index,
        required,
        priority,
        cutsLatinRun: latinRuns.some(
          ({ sourceStart, sourceEnd }) =>
            sourceStart < start && start < sourceEnd,
        ),
        score: Math.min(left, right) / required + priority * 0.14,
      },
    ];
  });
  if (total <= capacity && !cuts.some(({ priority }) => priority === 5))
    return { index: null, scale: 1 };

  const comfortable = cuts.filter(
    ({ required }) => required * 0.55 <= capacity,
  );
  const intact = comfortable.filter(({ cutsLatinRun }) => !cutsLatinRun);
  const candidates = intact.length ? intact : comfortable;
  const authored = candidates.filter(({ priority }) => priority === 5);
  const fullSize = candidates.filter(({ required }) => required <= capacity);
  const cut =
    authored.sort((a, b) => b.score - a.score)[0] ??
    fullSize.sort((a, b) => b.score - a.score)[0] ??
    candidates.sort(
      (a, b) => a.required - b.required || b.score - a.score,
    )[0] ??
    cuts.sort((a, b) => a.required - b.required || b.score - a.score)[0];
  return {
    index: cut?.index ?? null,
    scale: Math.min(1, capacity / (cut?.required ?? total)),
  };
}

function watchPhantomLayout(stage, reflow) {
  const view = stage.ownerDocument.defaultView;
  if (!view) return undefined;
  reflow();
  const observer = new view.ResizeObserver(reflow);
  observer.observe(stage);
  const fonts = stage.ownerDocument.fonts;
  fonts?.addEventListener('loadingdone', reflow);
  fonts?.addEventListener('loadingerror', reflow);
  return () => {
    observer.disconnect();
    fonts?.removeEventListener('loadingdone', reflow);
    fonts?.removeEventListener('loadingerror', reflow);
  };
}

function watchFrames(stage, frames, fit) {
  return watchPhantomLayout(stage, () => {
    fit?.();
    const unit = stage.clientWidth / 100;
    if (unit > 0) for (const frame of frames) frame.resize(unit);
  });
}

function fitSideCard(card, copy) {
  const { ownerDocument } = card;
  if (!ownerDocument.defaultView) return undefined;
  const text = copy.textContent;
  const range = ownerDocument.createRange();
  return () => {
    card.style.setProperty(
      '--phantom-card-width',
      'var(--phantom-side-card-max-width)',
    );
    copy.textContent = text;
    delete copy.dataset.plannedRows;
    copy.dataset.measuring = '';
    const capacity = copy.getBoundingClientRect().width;
    const fits = (line) => {
      copy.textContent = line.trimEnd();
      range.selectNodeContents(copy);
      return range.getBoundingClientRect().width <= capacity;
    };
    let rows;
    const fitsOneLine = capacity > 0 && fits(text);
    if (capacity > 0 && !fitsOneLine) {
      rows = splitLyricsDisplayRows(text, fits, Infinity, {
        literalPrefixes: true,
        preferExplicitBreaks: true,
        keepJapaneseContractions: true,
      });
    } else {
      card.style.removeProperty('--phantom-card-width');
    }
    delete copy.dataset.measuring;
    if (fitsOneLine || rows) copy.dataset.plannedRows = '';
    copy.textContent =
      rows?.map(({ text }) => text.trimEnd()).join('\n') ?? text;
  };
}

const ransomTextures = ['plain', 'wash', 'fibers'];
const ransomEdges = ['straight', 'slant', 'taper'];

function ransomRandom(frame) {
  const identity = JSON.stringify([
    frame.phantomThieves?.trackId,
    frame.lineIndex,
    frame.currentText,
  ]);
  let seed = 2166136261;
  for (const char of identity)
    seed = Math.imul(seed ^ char.codePointAt(0), 16777619);
  return (length) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 4294967296) * length);
  };
}

function renderRansom(stage, frame, accents) {
  const line = add(stage, 'phantom-thieves__ransom phantom-thieves__corner');
  line.dir = 'auto';
  const targets = [];
  const pick = ransomRandom(frame);
  const primaryTexture = ransomTextures[pick(ransomTextures.length)];
  let hasRedPaper = false;
  const units = frame.currentText
    .trim()
    .split(
      /([\p{Script=Latin}\p{N}][\p{Script=Latin}\p{M}\p{N}]*(?:['’.-][\p{Script=Latin}\p{M}\p{N}]+)*|\s+)/u,
    )
    .flatMap((chunk, index) => (index % 2 ? [chunk] : characters(chunk)));
  const tokens = units.map((text) => {
    const gap = /^\s+$/u.test(text);
    const node = add(
      line,
      gap ? 'phantom-thieves__gap' : 'phantom-thieves__word',
      gap ? ' ' : '',
    );
    if (!gap) {
      const tile = add(node, 'phantom-thieves__tile', text);
      const word = characters(text).length > 1;
      if (word) tile.dataset.ransomWord = '';
      const paper = pick(20);
      const punctuation = /^[\p{P}]/u.test(text);
      const redPaper = paper === 0 && !hasRedPaper && !punctuation;
      if (punctuation) {
        tile.dataset.ransomPunctuation = /^[,.､｡]/u.test(text)
          ? 'low'
          : /^[，．、。]/u.test(text)
            ? 'wide-low'
            : 'standard';
      }
      tile.dataset.ransomPaper = redPaper
        ? 'color'
        : paper < 12
          ? 'ink'
          : 'paper';
      hasRedPaper ||= redPaper;
      tile.dataset.ransomTexture = pick(2)
        ? primaryTexture
        : ransomTextures[pick(ransomTextures.length)];
      tile.dataset.ransomEdge = ransomEdges[pick(ransomEdges.length)];
      if (pick(2)) tile.dataset.ransomMirrored = '';
      const tilt = (pick(7) - 3) * (word ? 0.5 : 1);
      tile.style.setProperty('--phantom-ransom-tilt', `${tilt}deg`);
      targets.push(tile);
    }
    return { text, node, gap };
  });
  if (accents) {
    const letters = targets.filter(
      (tile) =>
        tile.dataset.ransomWord === undefined &&
        /[\p{L}\p{N}]/u.test(tile.textContent),
    );
    for (let start = 0; start + 1 < letters.length; start += 10) {
      const length = Math.min(10, letters.length - start);
      const first = letters[start + 1 + pick(Math.min(4, length - 1))];
      const inverseFirst = pick(2) === 0;
      first.dataset.ransomAccent = inverseFirst ? 'inverse' : 'color';
      if (length > 6) {
        const second = letters[start + 6 + pick(length - 6)];
        second.dataset.ransomAccent = inverseFirst ? 'color' : 'inverse';
      }
    }
  }
  const view = stage.ownerDocument.defaultView;
  if (!view) return { targets };
  const rowBreak = stage.ownerDocument.createElement('br');
  let hiddenGap;
  function reflow() {
    const { width } = line.getBoundingClientRect();
    if (width <= 1) return;
    rowBreak.remove();
    if (hiddenGap) hiddenGap.hidden = false;
    line.style.setProperty('--phantom-copy-scale', 1);
    const { index, scale } = planRansomRows(
      tokens.map(({ text, node }) => ({
        text,
        width: node.getBoundingClientRect().width,
      })),
      width - 1,
    );
    if (index !== null) {
      line.insertBefore(rowBreak, tokens[index].node);
      const gap = tokens[index - 1];
      hiddenGap = gap.gap ? gap.node : undefined;
      if (hiddenGap) hiddenGap.hidden = true;
    }
    line.style.setProperty('--phantom-copy-scale', scale);
  }
  return {
    targets,
    dispose: watchPhantomLayout(stage, reflow),
  };
}

function hasTransparentPortraitBackground(image) {
  const size = 32;
  const sample = image.ownerDocument.createElement('canvas');
  sample.width = size;
  sample.height = size;
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  try {
    context.drawImage(image, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);
    let transparent = 0;
    for (let x = 0; x < size; x++) {
      if (data[x * 4 + 3] < 32) transparent++;
    }
    // A transparent top edge lets the head cross the frame without exposing a bitmap rectangle.
    return transparent >= size / 4;
  } catch {
    return false;
  }
}

function addPortraitPhoto(portrait, { customPhoto, artistPhoto }) {
  if (!customPhoto && !artistPhoto) return;
  const region = add(portrait, 'phantom-thieves__portrait-region');
  const [, , fill] = phantomFramePoints('portrait', 100, 100, 1);
  const corners = fill.map(([x, y]) => `${x}% ${y}%`);
  region.style.setProperty(
    '--phantom-portrait-photo-clip',
    `polygon(${corners.join(', ')})`,
  );
  region.style.setProperty(
    '--phantom-portrait-silhouette-clip',
    `polygon(0 var(--phantom-portrait-silhouette-top), 100% var(--phantom-portrait-silhouette-top), ${corners.slice(2).join(', ')})`,
  );
  const image = portrait.ownerDocument.createElement('img');
  image.className = 'phantom-thieves__portrait-image';
  image.alt = '';
  image.decoding = 'async';
  image.dataset.source = customPhoto ? 'custom' : 'artist';
  image.addEventListener('load', () => {
    if (
      image.dataset.source === 'custom' &&
      hasTransparentPortraitBackground(image)
    )
      region.dataset.silhouette = '';
    image.dataset.loaded = '';
  });
  image.addEventListener('error', () => {
    delete region.dataset.silhouette;
    if (image.dataset.source === 'custom' && artistPhoto) {
      delete image.dataset.loaded;
      image.dataset.source = 'artist';
      image.src = artistPhoto;
    } else {
      image.remove();
    }
  });
  region.append(image);
  image.src = customPhoto || artistPhoto;
}

function content(stage, frame, mode, shape, cardStyle, personalization) {
  const { currentText, lineIndex } = frame;
  const { artist, previousText } = frame.phantomThieves ?? {};
  if (mode === 'choice-stack') {
    add(stage, 'phantom-thieves__choice-panel').setAttribute(
      'aria-hidden',
      'true',
    );
    const stack = add(
      stage,
      'phantom-thieves__choices phantom-thieves__corner',
    );
    const targets = [
      ['previous', previousText],
      ['current', currentText],
      ['next', frame.nextText],
    ].flatMap(([position, text]) => {
      if (!text?.trim()) return [];
      const row = add(stack, 'phantom-thieves__choice');
      row.dataset.choice = position;
      if (position !== 'current') row.setAttribute('aria-hidden', 'true');
      const copy = addCopy(row, text.trim(), { paragraph: true });
      copy.lang = dialogueLanguage(text, frame.language);
      return [row];
    });
    return { targets };
  }
  if (mode === 'radial') {
    const cluster = add(
      stage,
      'phantom-thieves__radial phantom-thieves__corner',
    );
    const frames = [];
    const targets = phantomPhrases(currentText).map((phrase) => {
      const lane = add(cluster, 'phantom-thieves__lane');
      const strip = add(lane, 'phantom-thieves__strip');
      const copy = addCopy(strip, phrase);
      frames.push(addFrame(strip, 'strip'));
      return copy;
    });
    return { targets, dispose: watchFrames(stage, frames) };
  }
  const cluster = add(
    stage,
    'phantom-thieves__cluster phantom-thieves__corner',
  );
  let messageList = cluster;
  if (mode === 'chat' && shape === 'phone') {
    messageList = add(cluster, 'phantom-thieves__phone-screen');
    if (artist) add(messageList, 'phantom-thieves__phone-name', artist);
  }
  const frames = [];
  if (mode === 'chat' && previousText && shape !== 'thought') {
    const previous = add(
      messageList,
      'phantom-thieves__card phantom-thieves__previous',
    );
    addCopy(previous, previousText);
    if (shape === 'stacked') frames.push(addFrame(previous, 'collage'));
  }
  const card = add(
    messageList,
    'phantom-thieves__card phantom-thieves__active',
  );
  if (mode === 'side-card') {
    const portrait =
      cardStyle === 'portrait'
        ? add(cluster, 'phantom-thieves__portrait')
        : null;
    if (portrait) {
      portrait.setAttribute('aria-hidden', 'true');
      if (personalization.color) {
        portrait.style.setProperty(
          '--phantom-portrait-fill',
          personalization.color,
        );
      }
      frames.push(addFrame(portrait, 'portrait'));
      addPortraitPhoto(portrait, personalization);
    }
    const name = personalization.name || artist;
    if (name) frames.push(addFrame(addNameplate(card, name), 'nameplate'));
    const paragraph = currentText
      .replace(/[\t\r\n\f \u2028\u2029\u3000]+/gu, ' ')
      .trim();
    const copy = addCopy(card, paragraph, { paragraph: true });
    copy.lang = dialogueLanguage(currentText, frame.language);
    if (latin.test(currentText)) copy.dataset.script = 'latin';
    const shell = addFrame(card, 'side-card');
    return {
      targets: [portrait ? cluster : card, copy, card, shell.polygons[1]],
      dispose: watchFrames(stage, [...frames, shell], fitSideCard(card, copy)),
    };
  }
  if (lineIndex % 2 === 1) stage.dataset.alternate = '';
  const copy = addCopy(card, currentText);
  if (shape !== 'stacked') return { targets: [card, copy] };
  frames.push(addFrame(card, 'collage'));
  return { targets: [card, copy], dispose: watchFrames(stage, frames) };
}

function buildMotion(gsap, targets, mode, duration, fromRight, portraitEnd) {
  const timeline = gsap.timeline({ paused: true });
  if (mode === 'choice-stack') {
    return timeline.fromTo(
      targets,
      { opacity: 0, xPercent: fromRight ? 12 : -12 },
      {
        opacity: 1,
        xPercent: 0,
        duration: 0.16,
        stagger: 0.03,
        ease: 'power2.out',
      },
    );
  }
  if (mode === 'radial') {
    timeline.fromTo(
      targets,
      { opacity: 0, x: fromRight ? 24 : -24, scale: 0.65 },
      {
        opacity: 1,
        x: 0,
        scale: 1,
        duration: 0.13,
        stagger: Math.min(0.25, duration / (targets.length * 2)),
        ease: 'power2.out',
      },
    );
  } else if (mode === 'ransom') {
    timeline.fromTo(
      targets,
      {
        opacity: 0,
        x: (index) => ((index * 29) % 67) - 33,
        y: (index) => ((index * 37) % 91) - 45,
        rotation: (index) => (index % 2 ? -1 : 1) * 15,
        scale: 0.7,
      },
      {
        opacity: 1,
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
        duration: 0.23,
        ease: 'back.out(2)',
      },
    );
  } else if (mode === 'side-card') {
    const [group, copy, card, marker] = targets;
    const tick = 1 / 30;
    const entrance = 3 * tick;
    const direction = fromRight ? 1 : -1;
    const entrancePose = {
      scale: 0.6,
      x: () => card.offsetWidth * 0.03 * direction,
      y: () => card.offsetHeight * 0.05,
      rotation: 2 * direction,
    };
    timeline.fromTo(
      group,
      entrancePose,
      {
        scale: 1,
        x: 0,
        y: 0,
        rotation: 0,
        duration: entrance,
        ease: 'power2.out',
      },
      0,
    );
    if (portraitEnd > entrance) {
      const exit = Math.min(4 * tick, (portraitEnd - entrance) / 2);
      timeline.to(
        group,
        { ...entrancePose, opacity: 0, duration: exit, ease: 'power2.in' },
        portraitEnd - exit,
      );
    }
    timeline.fromTo(
      copy,
      { opacity: 0 },
      { opacity: 1, duration: 2 * tick },
      3 * tick,
    );
    timeline.fromTo(
      marker,
      { '--phantom-marker-scale': 0 },
      { '--phantom-marker-scale': 1, duration: 2 * tick },
      8 * tick,
    );
    if (duration > 10 * tick)
      timeline.fromTo(
        marker,
        { '--phantom-marker-scale': 1 },
        {
          '--phantom-marker-scale': 0.84,
          duration: 0.42,
          yoyo: true,
          repeat: Math.ceil((duration - 10 * tick) / 0.42),
          ease: 'sine.inOut',
          immediateRender: false,
        },
        10 * tick,
      );
  } else {
    const [card, copy] = targets;
    timeline.fromTo(
      card,
      { opacity: 0, x: fromRight ? 28 : -28, y: 14, scale: 0.68 },
      {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        duration: 0.12,
        ease: 'back.out(1.5)',
      },
      0,
    );
    timeline.fromTo(copy, { opacity: 0 }, { opacity: 1, duration: 0.08 }, 0.08);
  }
  return timeline;
}

export function clearPhantomThieves(stage) {
  const scene = scenes.get(stage);
  if (!scene) return;
  scene.dispose?.();
  scene.motion?.kill();
  stage.replaceChildren();
  stage.hidden = true;
  scenes.delete(stage);
}

export function renderPhantomThieves(stage, frame, options = {}) {
  if (!stage) return;
  if (!frame.visible || !frame.currentText) {
    clearPhantomThieves(stage);
    return;
  }
  const mode =
    options.appearance?.phantomMode ?? OUTPUT_APPEARANCE_DEFAULTS.phantomMode;
  const shape = options.appearance?.phantomChatShape ?? 'bubble';
  const cardStyle =
    options.appearance?.phantomCardStyle ??
    OUTPUT_APPEARANCE_DEFAULTS.phantomCardStyle;
  const position = options.appearance?.phantomCorner ?? 'auto';
  const corner = position === 'auto' ? modeCorners[mode] : position;
  const accentFont =
    mode === 'ransom' ? options.appearance?.phantomRansomFont : undefined;
  const accents = accentFont === 'kaitou' || accentFont === 'kaibunsyo';
  const timing = frame.phantomThieves;
  const appearance = options.appearance;
  const personalization =
    mode === 'side-card'
      ? {
          name: appearance?.phantomArtistName,
          color:
            appearance?.phantomPortraitColor ||
            `var(--phantom-portrait-tone-${phantomPortraitTone(appearance?.phantomArtistName || timing?.artist, timing?.trackId)})`,
          customPhoto:
            options.portraitPhotos && appearance?.phantomPortraitPhoto
              ? `/media/phantom-portrait/custom/${encodeURIComponent(appearance.phantomPortraitPhoto)}`
              : null,
          artistPhoto:
            options.portraitPhotos && timing?.trackId
              ? `/media/phantom-portrait/artist/${encodeURIComponent(timing.trackId)}`
              : null,
        }
      : null;
  const animate = options.gsap && !options.reducedMotion && timing;
  const portraitEnd =
    mode === 'side-card' &&
    cardStyle === 'portrait' &&
    Number.isFinite(timing?.lineDurationMs)
      ? timing.lineDurationMs / 1000
      : null;
  const key = JSON.stringify([
    timing?.trackId,
    timing?.artist,
    timing?.previousText,
    mode === 'choice-stack' ? frame.nextText : undefined,
    frame.lineIndex,
    frame.currentText,
    mode === 'side-card' || mode === 'choice-stack'
      ? frame.language
      : undefined,
    mode,
    shape,
    corner,
    cardStyle,
    personalization,
    portraitEnd,
    accents,
    accentFont,
    options.appearance?.fontFamily,
    options.appearance?.fontScale,
    Boolean(animate),
  ]);
  let scene = scenes.get(stage);
  if (scene?.key !== key) {
    clearPhantomThieves(stage);
    stage.dataset.mode = mode;
    delete stage.dataset.alternate;
    stage.dataset.chatShape = shape;
    stage.dataset.ransomFont = accentFont ?? '';
    stage.dataset.corner = corner;
    stage.hidden = false;
    stage.setAttribute('aria-label', frame.currentText);
    const { targets, dispose } =
      mode === 'ransom'
        ? renderRansom(stage, frame, accents)
        : content(stage, frame, mode, shape, cardStyle, personalization);
    const duration =
      portraitEnd ??
      ((frame.lineRemainingMs ?? 3000) * (timing?.rate ?? 1) +
        (timing?.ageMs ?? 0)) /
        1000;
    scene = {
      key,
      dispose,
      motion: animate
        ? buildMotion(
            options.gsap,
            targets,
            mode,
            duration,
            corner?.endsWith('right'),
            portraitEnd,
          )
        : null,
    };
    scenes.set(stage, scene);
  }
  if (scene.motion) {
    const { ageMs, rate, playing } = timing;
    scene.motion
      .timeScale(rate)
      .pause(Math.min(scene.motion.duration(), ageMs / 1000));
    if (playing) scene.motion.play();
  }
}
