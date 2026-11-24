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
const nameplateTipBelowPlate = 1.15;
const frameParts = {
  nameplate: ['face'],
  choice: ['face', 'tab'],
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

// Coordinates from the dialogue reference. The end details stay fixed in
// stage units while the straight edges stretch with the lyric box.
const sideCardTip = [14, 175];
// Both tips sit between halfway down the portrait and its lower third.
const sideCardTipFromBottom = 3.82;
const sideCardCopyInset = 4.35;
const nameplateTipFromBottom = sideCardTipFromBottom + 0.68;
const nameplateTilt = 16.5;
const nameplateInset = 1.55;
const nameplateTiltRadians = (nameplateTilt * Math.PI) / 180;
const sideCardBleed = { left: 0.46, right: 0.76, top: 0.48, bottom: 0.72 };
const sideCardSample = {
  top: 82,
  bottom: 335,
  left: 150,
  right: 1088,
  outline: [
    ['left', 'top', 150, 134, -sideCardBleed.left, -sideCardBleed.top],
    ['right', 'top', 1054, 82, 0, -sideCardBleed.top - 0.51],
    ['right', 'bottom', 1088, 335, 0, 0.65],
    ['left', 'bottom', 200, 250, -sideCardBleed.left],
    ['left', 'tail', 175, 282],
    ['left', 'tail', 111, 230],
    ['left', 'tail', 87, 249],
    ['left', 'tail', ...sideCardTip],
    ['left', 'tail', 37, 169],
    ['left', 'tail', 148, 153],
  ],
  inner: [
    ['left', 'tail', 73, 204],
    ['left', 'tail', 86, 166],
    ['left', 'tail', 140, 198],
    ['left', 'tail', 151, 154],
  ],
  tab: [
    ['right', 'bottom', 965, 269],
    ['right', 'bottom', 1137, 109],
    ['right', 'bottom', 1208, 185],
    ['right', 'bottom', 983, 271],
  ],
};
const sideCardScale = 6.44 / (sideCardSample.bottom - sideCardSample.top);
const sideCardLeft = (px) => 0.6 + (px - sideCardSample.left) * sideCardScale;
const sideCardTop = (py) => 0.2 + (py - sideCardSample.top) * sideCardScale;
const sideCardBottom = (py) =>
  0.16 + (sideCardSample.bottom - py) * sideCardScale;
const sideCardTailX = sideCardLeft(sideCardTip[0]);
const nameplateTailX = sideCardTailX + 0.53 - nameplateInset;
const nameplateTailShoulderX = 4.28;
const nameplateTailNotchX = 0.58;
const nameplateTailBaseAngle = 12;
const nameplateTailBaseSlope = Math.tan(
  (nameplateTailBaseAngle * Math.PI) / 180,
);
// Set both angles after accounting for the plate's rotation.
const nameplateTailDepth = (x, angle) =>
  nameplateTipBelowPlate +
  (x - nameplateTailX) *
    Math.tan(nameplateTiltRadians - (angle * Math.PI) / 180);
const nameplateTailShoulderDepth = nameplateTailDepth(
  nameplateTailShoulderX,
  nameplateTailBaseAngle,
);
const nameplateTailNotchDepth = nameplateTailDepth(nameplateTailNotchX, 27);

function sideCardSamplePoints(points, x, end, height) {
  const { right } = sideCardSample;
  const y = {
    top: (py) => x(sideCardTop(py)),
    bottom: (py) => height - x(sideCardBottom(py) - sideCardBleed.bottom),
    tail: (py) =>
      height - x(sideCardTipFromBottom + (sideCardTip[1] - py) * sideCardScale),
  };
  return points.map(([side, edge, px, py, dx = 0, dy = 0]) => {
    const pxInFrame =
      side === 'left'
        ? x(sideCardLeft(px))
        : end(0.2 + (right - px) * sideCardScale - sideCardBleed.right);
    return [pxInFrame + x(dx), y[edge](py) + x(dy)];
  });
}

// The short paper strips use the upward and downward folds from the sheet.
// Their paper extends past the layout box while text keeps its alignment.
function choiceFramePoints(choice, x, end, heightEnd) {
  const left = (offset) => x(offset - 0.5);
  const top = (offset) => x(offset - 0.42);
  const right = (offset) => end(offset - 0.7);
  const bottom = (offset) => heightEnd(offset - 0.55);
  const foldedDown = choice === 'next';
  const tail = foldedDown
    ? [
        [left(2.55), bottom(0.24)],
        [left(2.22), bottom(-0.62)],
        [left(0.18), bottom(0.91)],
        [left(1.77), bottom(0.65)],
        [left(1.74), bottom(1.19)],
        [left(2.84), bottom(1.72)],
      ]
    : [
        [left(2.77), bottom(0.24)],
        [left(2.57), top(2.23)],
        [left(1.42), top(1.67)],
        [left(1.52), top(1.28)],
        [left(0.18), top(1.55)],
        [left(2), top(0.02)],
        [left(2.15), top(0.98)],
      ];
  return [
    [
      [left(2.96), top(0.84)],
      [right(0.22), top(0.23)],
      [right(1.42), bottom(0.24)],
      ...tail,
    ],
    choice === 'previous'
      ? [
          [right(2.1), top(1.87)],
          [right(0.12), top(0.06)],
          [right(-0.56), top(0.98)],
          [right(2.04), top(2.21)],
        ]
      : [],
  ];
}

export function phantomFramePoints(
  kind,
  width,
  height,
  unit,
  { choice, hasNameplate = false } = {},
) {
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
        [x(-0.12), x(0.06)],
        [end(0.85), x(0.06)],
        [end(-0.23), bottom(-0.42)],
        [x(3.72), bottom(-0.46)],
        [x(nameplateTailShoulderX), bottom(-nameplateTailShoulderDepth)],
        [x(nameplateTailX), bottom(-nameplateTipBelowPlate)],
        [x(nameplateTailNotchX), bottom(-nameplateTailNotchDepth)],
      ],
    ];
  }
  if (kind === 'side-card') {
    const { outline, tab, inner } = sideCardSample;
    const layers = [outline, tab, inner].map((points) =>
      sideCardSamplePoints(points, x, end, height),
    );
    if (hasNameplate) {
      const [face, , fold] = layers;
      // Tuck the actual corner behind the plate and run the W into its lower edge.
      face[0][0] += x(2.55);
      const foldEnd = fold.at(-1);
      const nameTipX = x(nameplateTailX + nameplateInset);
      foldEnd[1] =
        bottom(nameplateTipFromBottom + 0.4) -
        (foldEnd[0] - nameTipX) * nameplateTailBaseSlope;
    }
    return layers;
  }
  if (kind === 'choice') return choiceFramePoints(choice, x, end, bottom);
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

// Outline layers measured from the reference, in stage units. Each shape's
// white line is a ring inside its outline, one width per corner; later shapes
// cover the lines of earlier ones, like stacked paper cut-outs.
const layeredFrames = {
  'side-card': {
    shapes: [
      {
        layer: 0,
        band: [0.15, 0.36, 0.32, 0.32, 0.29, 0.29, 0.28, 0.17, 0.16, 0.17],
        // Leave the top of the W open while keeping the face polygon closed.
        bandSpan: [9, 7],
      },
    ],
    tab: 1,
    inner: 2,
  },
};
let frameMaskCount = 0;

function polygonArea(points) {
  return points.reduce((area, [x, y], index) => {
    const [nx, ny] = points[(index + 1) % points.length];
    return area + x * ny - nx * y;
  }, 0);
}

// Moves each vertex along its corner bisector so both edges shift by its width.
export function insetPolygon(points, widths) {
  const sign = polygonArea(points) > 0 ? 1 : -1;
  return points.map(([x, y], index) => {
    const width = widths[index] ?? 0;
    if (!width) return [x, y];
    const [px, py] = points[(index + points.length - 1) % points.length];
    const [nx, ny] = points[(index + 1) % points.length];
    const normal = (ax, ay, bx, by) => {
      const length = Math.hypot(bx - ax, by - ay) || 1;
      return [(-(by - ay) / length) * sign, ((bx - ax) / length) * sign];
    };
    const [n1x, n1y] = normal(px, py, x, y);
    const [n2x, n2y] = normal(x, y, nx, ny);
    const dot = n1x * n2x + n1y * n2y;
    // Clamp sharp spikes so the miter never reaches past four widths.
    const scale = width / Math.max(0.25, 1 + dot);
    const length = Math.hypot(n1x + n2x, n1y + n2y) * Math.abs(scale);
    const limit = Math.abs(width) * 4;
    const ratio = length > limit ? limit / length : 1;
    return [x + (n1x + n2x) * scale * ratio, y + (n1y + n2y) * scale * ratio];
  });
}

const pointList = (points) => points.map(([x, y]) => `${x},${y}`).join(' ');
const ringPath = (...rings) =>
  rings.map((ring) => `M${pointList(ring)}Z`).join(' ');
// One winding for every shape, so overlaps add up instead of cancelling.
const unionPath = (...shapes) =>
  ringPath(
    ...shapes.map((points) =>
      polygonArea(points) < 0 ? [...points].reverse() : points,
    ),
  );

function svgNode(parent, tag, attributes = {}) {
  const node = parent.ownerDocument.createElementNS(svgNamespace, tag);
  for (const [name, value] of Object.entries(attributes))
    node.setAttribute(name, value);
  parent.append(node);
  return node;
}

// Masks hide outlines under later shapes and keep the shadow outside them all.
function addMask(defs, id) {
  const mask = svgNode(defs, 'mask', { id, maskUnits: 'userSpaceOnUse' });
  const area = svgNode(mask, 'rect', { fill: '#fff' });
  const cut = svgNode(mask, 'path', { fill: '#000' });
  return { mask, area, cut };
}

function addLayeredFrame(svg, layered) {
  const id = `phantom-frame-${++frameMaskCount}`;
  const defs = svgNode(svg, 'defs');
  const shadowMask = addMask(defs, `${id}-shadow`);
  const parts = {
    shadow: svgNode(svg, 'path', {
      class: 'phantom-thieves__frame-shadow',
      mask: `url(#${id}-shadow)`,
    }),
    face: svgNode(svg, 'path', { class: 'phantom-thieves__frame-face' }),
  };
  const rings = layered.shapes.map(({ band }, index) => {
    if (!band) return null;
    const last = index === layered.shapes.length - 1;
    const mask = last ? null : addMask(defs, `${id}-line-${index}`);
    const ring = svgNode(svg, 'path', {
      class: 'phantom-thieves__frame-band',
      ...(mask ? { mask: `url(#${id}-line-${index})` } : {}),
    });
    return { ring, mask };
  });
  if (layered.inner !== undefined) {
    parts.inner = svgNode(svg, 'polyline', {
      class: 'phantom-thieves__frame-inner',
    });
  }
  if (layered.tab !== undefined) {
    parts.marker = svgNode(svg, 'g', {
      class: 'phantom-thieves__frame-marker',
    });
    parts.tab = svgNode(parts.marker, 'polygon', {
      class: 'phantom-thieves__frame-tab',
    });
  }
  const masks = [shadowMask, ...rings.map((entry) => entry?.mask)].filter(
    Boolean,
  );
  return { parts, rings, shadowMask, masks };
}

function centerNameplateLabel(plate, outline, width, height) {
  const [topLeft, topRight, bottomRight, bottomEdge, , , notch] = outline;
  const centerY =
    (topLeft[1] + topRight[1] + bottomRight[1] + bottomEdge[1]) / 4;
  const edgeAtY = ([x, y], [endX, endY]) =>
    x + ((endX - x) * (centerY - y)) / (endY - y);
  // The label is centered between the plate's bevels. The tail is decoration.
  const centerX =
    (edgeAtY(topLeft, notch) + edgeAtY(topRight, bottomRight)) / 2;
  plate.style.setProperty('--phantom-name-label-x', `${centerX - width / 2}px`);
  plate.style.setProperty(
    '--phantom-name-label-y',
    `${centerY - height / 2}px`,
  );
}

function addFrame(parent, kind, { hasNameplate = false } = {}) {
  const document = parent.ownerDocument;
  const frame = add(parent, 'phantom-thieves__card-frame');
  frame.dataset.frame = kind;
  frame.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(svgNamespace, 'svg');
  const layered = layeredFrames[kind];
  const built = layered ? addLayeredFrame(svg, layered) : null;
  const parts =
    built?.parts ??
    Object.fromEntries(
      frameParts[kind].map((part) => [
        part,
        svgNode(svg, 'polygon', { class: `phantom-thieves__frame-${part}` }),
      ]),
    );
  const polygons = Object.values(parts);
  frame.append(svg);
  let size = null;
  const shape = {
    frame,
    parts,
    polygons,
    kind,
    // Vertex and band offsets in stage units, written by the hold timeline.
    wobble: null,
    draw() {
      if (!size) return;
      const { width, height, unit } = size;
      const offset = (key) => (shape.wobble?.[key] ?? 0) * unit;
      const layers = phantomFramePoints(kind, width, height, unit, {
        choice: parent.dataset.choice,
        hasNameplate,
      }).map((points, layer) =>
        points.map(([px, py], vertex) => [
          px + offset(`${layer}-${vertex}-x`),
          py + offset(`${layer}-${vertex}-y`),
        ]),
      );
      if (!layered) {
        layers.forEach((points, layer) =>
          polygons[layer].setAttribute('points', pointList(points)),
        );
        return;
      }
      const outlines = layered.shapes.map(({ layer, bandSpan }) => {
        const points = layers[layer];
        if (!parts.inner || !bandSpan) return points;
        // Follow the same moving W above the tip, leaving its notches visible.
        return [...points.slice(0, bandSpan[1] + 1), ...layers[layered.inner]];
      });
      const union = unionPath(...outlines);
      // The mask's own region must include the entire stroke outside the viewBox.
      for (const { mask, area } of built.masks) {
        for (const node of [mask, area]) {
          node.setAttribute('x', -width);
          node.setAttribute('y', -height);
          node.setAttribute('width', width * 3);
          node.setAttribute('height', height * 3);
        }
      }
      built.shadowMask.cut.setAttribute('d', union);
      // A shared closed path keeps the black rim continuous along the right edge.
      parts.shadow.setAttribute('d', union);
      parts.face.setAttribute('d', union);
      layered.shapes.forEach(({ layer, band, bandSpan }, index) => {
        const entry = built.rings[index];
        if (!entry) return;
        const points = layers[layer];
        const inner = insetPolygon(
          points,
          band.map(
            (amount, vertex) =>
              (amount + (shape.wobble?.[`band-${layer}-${vertex}`] ?? 0)) *
              unit,
          ),
        );
        const bandPath = bandSpan
          ? [points, inner].map((edge) => {
              const roofAndTail = edge.slice(0, bandSpan[1] + 1);
              return hasNameplate
                ? roofAndTail
                : [...edge.slice(bandSpan[0]), ...roofAndTail];
            })
          : null;
        entry.ring.setAttribute(
          'd',
          bandPath
            ? ringPath([...bandPath[0], ...bandPath[1].reverse()])
            : ringPath(points, inner),
        );
        entry.mask?.cut.setAttribute(
          'd',
          unionPath(...outlines.slice(index + 1)),
        );
        if (parts.inner && bandSpan) {
          // Start the W inside the animated band so the two strokes overlap.
          const tail = bandSpan[1];
          const joint = points[tail].map(
            (value, axis) => (value + inner[tail][axis]) / 2,
          );
          parts.inner.setAttribute(
            'points',
            pointList([joint, ...layers[layered.inner]]),
          );
        }
      });
      const tab = layers[layered.tab];
      if (tab) parts.tab.setAttribute('points', pointList(tab));
    },
    resize(unit) {
      const { clientWidth: width, clientHeight: height } = parent;
      if (!width || !height) return;
      size = { width, height, unit };
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.style.setProperty('--phantom-frame-stroke', `${unit * 0.17}px`);
      if (kind === 'nameplate') {
        // Anchor the label at the center of the resting outline for every pose.
        const [outline] = phantomFramePoints(kind, width, height, unit);
        centerNameplateLabel(parent, outline, width, height);
      }
      shape.draw();
    },
  };
  return shape;
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
  plate.style.setProperty('--phantom-name-tail-x', `${nameplateTailX}cqw`);
  plate.style.setProperty('--phantom-name-inset', `${nameplateInset}cqw`);
  plate.style.setProperty(
    '--phantom-name-tip-from-bottom',
    `${nameplateTipFromBottom}cqw`,
  );
  plate.style.setProperty('--phantom-name-tilt', `${nameplateTilt}deg`);
  plate.style.setProperty(
    '--phantom-name-tip-extension',
    `${nameplateTipBelowPlate}cqw`,
  );
  plate.dir = 'auto';
  plate.lang = dialogueLanguage(artist);
  if (latin.test(artist)) plate.dataset.script = 'latin';
  plate.setAttribute('role', 'img');
  plate.setAttribute('aria-label', artist);
  const label = add(plate, 'phantom-thieves__name-label');
  if (!phantomNameLetters.test(artist)) {
    label.textContent = artist;
    return { plate, label };
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
  return { plate, label };
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

function nameInsetAtTextTop(plate, unit, cardHeight, textTop) {
  if (!unit || !plate?.clientWidth || !plate.clientHeight) return 0;
  const [outline] = phantomFramePoints(
    'nameplate',
    plate.clientWidth,
    plate.clientHeight,
    unit,
  );
  const [tipX, tipY] = outline[5];
  const pivotY = cardHeight - unit * nameplateTipFromBottom;
  const cos = Math.cos(nameplateTiltRadians);
  const sin = Math.sin(nameplateTiltRadians);
  const contour = outline.map(([x, y]) => [
    nameplateInset * unit + tipX + (x - tipX) * cos + (y - tipY) * sin,
    pivotY - (x - tipX) * sin + (y - tipY) * cos,
  ]);
  const checkY = textTop - 0.35 * unit;
  let right = 0;
  for (const [index, [x, y]] of contour.entries()) {
    const [nextX, nextY] = contour[(index + 1) % contour.length];
    if (y >= checkY) right = Math.max(right, x);
    if (y < checkY !== nextY < checkY) {
      const intersection = x + ((checkY - y) / (nextY - y)) * (nextX - x);
      right = Math.max(right, intersection);
    }
  }
  return right + 0.55 * unit;
}

function fitSideCard(stage, card, copy, plate) {
  const { ownerDocument } = card;
  if (!ownerDocument.defaultView) return undefined;
  const text = copy.textContent;
  const range = ownerDocument.createRange();
  const fit = () => {
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
  return () => {
    const unit = stage.clientWidth / 100;
    let inset = sideCardCopyInset * unit;
    card.style.removeProperty('--phantom-card-name-inset');
    fit();
    if (!plate || !unit) return;
    // Check the part of the angled plate that reaches the rendered lyric rows.
    // Refit if clearing it narrows the lyric enough to add another row.
    while (true) {
      range.selectNodeContents(copy);
      const textTop =
        range.getBoundingClientRect().top - card.getBoundingClientRect().top;
      if (!Number.isFinite(textTop)) return;
      const needed = Math.ceil(
        nameInsetAtTextTop(plate, unit, card.clientHeight, textTop),
      );
      if (needed <= inset + 1) return;
      inset = needed;
      card.style.setProperty('--phantom-card-name-inset', `${inset}px`);
      fit();
    }
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
  const random = seededRandom(identity);
  return (length) => Math.floor(random() * length);
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
    const stack = add(
      stage,
      'phantom-thieves__choices phantom-thieves__corner',
    );
    const frames = [];
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
      frames.push(addFrame(row, 'choice'));
      return [row];
    });
    return { targets, dispose: watchFrames(stage, frames) };
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
    const { plate = null, label = null } = name ? addNameplate(card, name) : {};
    const plateFrame = plate ? addFrame(plate, 'nameplate') : null;
    if (plateFrame) frames.push(plateFrame);
    const paragraph = currentText
      .replace(/[\t\r\n\f \u2028\u2029\u3000]+/gu, ' ')
      .trim();
    const copy = addCopy(card, paragraph, { paragraph: true });
    copy.lang = dialogueLanguage(currentText, frame.language);
    if (latin.test(currentText)) copy.dataset.script = 'latin';
    const shell = addFrame(card, 'side-card', { hasNameplate: Boolean(plate) });
    // The dialogue grows from its own tip below the nameplate tip.
    card.style.setProperty(
      '--phantom-card-copy-inset',
      `${sideCardCopyInset}cqw`,
    );
    card.style.setProperty('--phantom-card-tail-x', `${sideCardTailX}cqw`);
    card.style.setProperty(
      '--phantom-card-tip-from-bottom',
      `${sideCardTipFromBottom}cqw`,
    );
    return {
      targets: {
        cluster,
        portrait,
        copy,
        card,
        shell,
        plate,
        plateFrame,
        label,
        marker: shell.parts.marker,
      },
      dispose: watchFrames(
        stage,
        [...frames, shell],
        fitSideCard(stage, card, copy, plate),
      ),
    };
  }
  if (lineIndex % 2 === 1) stage.dataset.alternate = '';
  const copy = addCopy(card, currentText);
  if (shape !== 'stacked') return { targets: [card, copy] };
  frames.push(addFrame(card, 'collage'));
  return { targets: [card, copy], dispose: watchFrames(stage, frames) };
}

const motionTick = 1 / 30;
// Dialogue-box scale per 30 fps frame, measured from the reference trailer.
export const PHANTOM_SIDE_CARD_POSES = Object.freeze({
  enter: [
    [1, 0.57],
    [2, 0.84],
    [3, 0.84],
    [4, 1.02],
    [5, 1],
  ],
  continue: [
    [0, 0.95],
    [1, 0.84],
    [2, 0.84],
    [3, 1],
  ],
});
// Held frames wobble on their own rhythms; amounts are stage units.
// The nameplate's white plate grows into its shadow, the tail tip and teeth
// shift while its band breathes, and the box edges rock by about a pixel.
const vertexAxes = (layer, vertex, x, y) => [
  [`${layer}-${vertex}-x`, x],
  [`${layer}-${vertex}-y`, y],
];
const sideCardWobble = {
  nameplate: [
    {
      halfFrames: [6, 8.5],
      axes: [
        ...vertexAxes(0, 0, 0, -0.04),
        ...vertexAxes(0, 1, 0.36, 0),
        ...vertexAxes(0, 2, 0.36, 0.14),
        ...vertexAxes(0, 3, 0, 0.14),
      ],
    },
  ],
  'side-card': [
    {
      halfFrames: [6, 8.5],
      axes: [
        // The tail tip and its zigzag corners drift while the line breathes;
        // the inner zigzag corners swing against each other.
        ...vertexAxes(0, 7, 0.14, 0.06),
        ...vertexAxes(0, 6, 0.1, 0.05),
        ...vertexAxes(0, 5, 0.06, -0.04),
        ...vertexAxes(0, 4, 0.08, 0.05),
        ['band-0-6', 0.08],
        ['band-0-7', 0.06],
        ...[0, 1, 2].flatMap((vertex) =>
          vertexAxes(2, vertex, 0.05, vertex % 2 ? -0.08 : 0.08),
        ),
      ],
    },
    {
      halfFrames: [7, 9],
      axes: [
        ...vertexAxes(0, 0, 0, -0.09),
        ...vertexAxes(0, 1, -0.04, 0.04),
        ...vertexAxes(0, 2, 0.04, 0.013),
        ...vertexAxes(0, 3, 0, 0.035),
      ],
    },
  ],
};

function seededRandom(identity) {
  let seed = 2166136261;
  for (const char of identity)
    seed = Math.imul(seed ^ char.codePointAt(0), 16777619);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// A hard cut that also reverts when seeking backward.
const holdUntilEnd = (progress) => (progress < 1 ? 0 : 1);

function addScalePoses(timeline, targets, poses) {
  poses.slice(1).forEach(([frame, scale], index) => {
    const [startFrame, startScale] = poses[index];
    timeline.fromTo(
      targets,
      { scale: startScale },
      {
        scale,
        duration: (frame - startFrame) * motionTick,
        ease: 'none',
        immediateRender: index === 0,
      },
      startFrame * motionTick,
    );
  });
}

function addWobble(timeline, shape, start, end, random) {
  const groups = sideCardWobble[shape?.kind];
  if (!groups || end <= start) return;
  shape.wobble = {};
  for (const { halfFrames, axes: allAxes } of groups) {
    const axes = allAxes.filter(([, amount]) => amount);
    let previous = Object.fromEntries(axes.map(([key]) => [key, 0]));
    Object.assign(shape.wobble, previous);
    const [shortest, longest] = halfFrames;
    let time = start;
    let direction = random() < 0.5 ? -1 : 1;
    // Each half-cycle reaches a different distance, as in the reference.
    for (let swing = 0; time < end && swing < 600; swing++) {
      const half = (shortest + random() * (longest - shortest)) * motionTick;
      const reach = direction * (0.45 + random() * 0.55);
      const pose = Object.fromEntries(
        axes.map(([key, amount]) => [key, amount * reach]),
      );
      timeline.fromTo(
        shape.wobble,
        { ...previous },
        { ...pose, duration: half, ease: 'sine.inOut', immediateRender: false },
        time,
      );
      previous = pose;
      time += half;
      direction = -direction;
    }
  }
}

function buildSideCardMotion(timeline, targets, duration, options) {
  const { cluster, portrait, copy, shell, plateFrame, label, marker } = targets;
  const { fromRight, portraitEnd, continues, seed } = options;
  const tick = motionTick;
  const direction = fromRight ? 1 : -1;
  const box = [shell.frame, portrait].filter(Boolean);
  const poses = continues
    ? PHANTOM_SIDE_CARD_POSES.continue
    : PHANTOM_SIDE_CARD_POSES.enter;
  const [firstFrame] = poses[0];
  const settled = poses.at(-1)[0] * tick;
  addScalePoses(timeline, box, poses);
  if (!continues) {
    // The nameplate leads; the box shows from the first scaled pose.
    timeline.fromTo(
      box,
      { opacity: 0 },
      { opacity: 1, duration: firstFrame * tick, ease: holdUntilEnd },
      0,
    );
    timeline.fromTo(
      box,
      { rotation: 2 * direction },
      { rotation: 0, duration: 3 * tick, ease: 'power1.out' },
      firstFrame * tick,
    );
    timeline.fromTo(
      shell.frame,
      { '--phantom-side-card-fill-ramp': 0.64 },
      {
        '--phantom-side-card-fill-ramp': 1,
        duration: 3 * tick,
        ease: 'none',
      },
      firstFrame * tick,
    );
  }
  if (label)
    timeline.fromTo(
      label,
      { opacity: 0 },
      // Hard cut: hidden until the frame the name appears on.
      { opacity: 1, duration: (continues ? 1 : 4) * tick, ease: holdUntilEnd },
      0,
    );
  // Text snaps in dim, then brightens over the remaining settle frames.
  const [copyStart, copyLength, copyFloor] = continues
    ? [2.5, 1.5, 0.6]
    : [3.5, 4.5, 0.3];
  timeline.fromTo(
    copy,
    { opacity: 0 },
    {
      opacity: 1,
      duration: copyLength * tick,
      ease: (progress) =>
        progress > 0 ? copyFloor + (1 - copyFloor) * progress : 0,
    },
    copyStart * tick,
  );
  if (!continues)
    timeline.fromTo(
      marker,
      { '--phantom-marker-scale': 0 },
      { '--phantom-marker-scale': 1, duration: 2 * tick },
      8 * tick,
    );
  const pulseStart = continues ? settled : 10 * tick;
  if (duration > pulseStart)
    timeline.fromTo(
      marker,
      { '--phantom-marker-scale': 1 },
      {
        '--phantom-marker-scale': 0.84,
        duration: 0.42,
        yoyo: true,
        repeat: Math.ceil((duration - pulseStart) / 0.42),
        ease: 'sine.inOut',
        immediateRender: false,
      },
      pulseStart,
    );
  const random = seededRandom(seed);
  const wobbleEnd = portraitEnd ?? duration;
  addWobble(timeline, plateFrame, settled, wobbleEnd, random);
  addWobble(timeline, shell, settled, wobbleEnd, random);
  const draw = () => {
    plateFrame?.draw();
    shell.draw();
  };
  timeline.eventCallback('onUpdate', draw);
  timeline.data = { draw };
  if (portraitEnd > settled) {
    const exit = Math.min(4 * tick, (portraitEnd - settled) / 2);
    timeline.to(
      cluster,
      {
        scale: 0.6,
        x: () => cluster.offsetWidth * 0.03 * direction,
        y: () => cluster.offsetHeight * 0.05,
        rotation: 2 * direction,
        opacity: 0,
        duration: exit,
        ease: 'power2.in',
      },
      portraitEnd - exit,
    );
  }
}

function buildMotion(
  gsap,
  targets,
  mode,
  duration,
  fromRight,
  portraitEnd,
  { continues = false, seed = '' } = {},
) {
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
    buildSideCardMotion(timeline, targets, duration, {
      fromRight,
      portraitEnd,
      continues,
      seed,
    });
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
  let scene = scenes.get(stage);
  const portraitLine =
    mode === 'side-card' &&
    timing?.trackId &&
    Number.isSafeInteger(frame.lineIndex)
      ? JSON.stringify([timing.trackId, timing.documentId, frame.lineIndex])
      : null;
  const samePortraitLine =
    portraitLine !== null && scene?.portraitLine === portraitLine;
  // Configuration can arrive between lyric boundaries, including while paused.
  const holdPortrait =
    portraitLine !== null &&
    timing.ended !== true &&
    (timing.playing === true || (samePortraitLine && scene.holdPortrait));
  let personalization = null;
  if (samePortraitLine && holdPortrait) {
    personalization = scene.personalization;
  } else if (mode === 'side-card') {
    personalization = {
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
    };
  }
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
    frame.repeatCueStartMs,
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
    mode === 'side-card' ? timing?.continuesPrevious === true : undefined,
    accents,
    accentFont,
    options.appearance?.fontFamily,
    options.appearance?.fontScale,
    options.appearance?.fontScaleAdjustment,
    Boolean(animate),
  ]);
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
            {
              continues: timing.continuesPrevious === true,
              seed: JSON.stringify([
                timing.trackId,
                frame.lineIndex,
                frame.currentText,
              ]),
            },
          )
        : null,
    };
    scenes.set(stage, scene);
  }
  scene.portraitLine = portraitLine;
  scene.holdPortrait = holdPortrait;
  scene.personalization = personalization;
  if (scene.motion) {
    const { ageMs, rate, playing } = timing;
    scene.motion
      .timeScale(rate)
      .pause(Math.min(scene.motion.duration(), ageMs / 1000));
    // Seeking suppresses onUpdate, so redraw wobbled vertices for this pose.
    scene.motion.data?.draw?.();
    if (playing) scene.motion.play();
  }
}
