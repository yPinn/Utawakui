// Stationery for Folder objects: decoration chosen from the object key, so
// every object differs but each one renders the same way every time.

const STATIONERY_SHARE = 1 / 3;

// Paperclip: along the top edge, clear of the text start and the pin corner.
const CLIP_X_RANGE = [38, 64];
const CLIP_ANGLE_RANGE = [-8, 8];
const CLIP_TONES = Object.freeze(['silver', 'brass']);

// Tape: one strip across the top edge, or two strips over the top corners.
const TAPE_PAIR_SHARE = 0.35;
const TAPE_X_RANGE = [28, 72];
const TAPE_ANGLE_RANGE = [3, 10];
const TAPE_CORNER_ANGLE_RANGE = [30, 42];
const TAPE_LENGTH_RANGE = [3.5, 5.25];
const TAPE_TINTS = Object.freeze(['paper', 'canary', 'rose', 'periwinkle']);
const TAPE_END_NOTCHES = 4;

// Torn edge: irregular teeth along the bottom, sometimes the top.
const TORN_TOP_SHARE = 0.3;
const TORN_TEETH_RANGE = [14, 20];
const TORN_DEPTH_RANGE = [2, 8];

function hashKey(key) {
  // FNV-1a: spreads similar keys (UUIDs that share a prefix) apart.
  let hash = 0x811c9dc5;
  for (const character of String(key)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// mulberry32: a small deterministic generator seeded from the key.
export function createSeededRandom(key) {
  let state = hashKey(key);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (random, [min, max]) => min + random() * (max - min);
const pick = (random, list) => list[Math.floor(random() * list.length)];
const round = (value, digits = 2) => Number(value.toFixed(digits));
const signed = (random, range) =>
  (random() < 0.5 ? -1 : 1) * between(random, range);

// Ragged short ends for a tape strip, as an inset polygon in percent.
function tapeEdge(random) {
  const left = [];
  const right = [];
  for (let index = 0; index <= TAPE_END_NOTCHES; index += 1) {
    const y = round((index / TAPE_END_NOTCHES) * 100);
    left.push(`${round(between(random, [0, 6]))}% ${y}%`);
    right.push(`${round(100 - between(random, [0, 6]))}% ${y}%`);
  }
  return `polygon(${[...left, ...right.reverse()].join(', ')})`;
}

// Irregular torn edge along the top or bottom of a note.
function tornEdge(random, side) {
  const teeth = Math.round(between(random, TORN_TEETH_RANGE));
  const points = [];
  for (let index = 0; index <= teeth; index += 1) {
    const jitter =
      index === 0 || index === teeth ? 0 : between(random, [-2, 2]);
    const x = round(Math.min(100, Math.max(0, (index / teeth) * 100 + jitter)));
    const depth = round(between(random, TORN_DEPTH_RANGE));
    points.push(side === 'top' ? `${x}% ${depth}%` : `${x}% ${100 - depth}%`);
  }
  const edge = side === 'top' ? points : [...points].reverse();
  return side === 'top'
    ? `polygon(${edge.join(', ')}, 100% 100%, 0 100%)`
    : `polygon(0 0, 100% 0, ${edge.join(', ')})`;
}

function clipStationery(random) {
  return {
    stationery: 'clip',
    stationeryStyle: {
      '--ui-folder-stationery-clip-x': `${round(between(random, CLIP_X_RANGE))}%`,
      '--ui-folder-stationery-clip-angle': `${round(between(random, CLIP_ANGLE_RANGE))}deg`,
      '--ui-folder-stationery-clip-color': `var(--ui-folder-stationery-clip-${pick(random, CLIP_TONES)})`,
    },
  };
}

function tapeStationery(random) {
  const strip = (x, angle) => ({
    x: `${round(x)}%`,
    angle: `${round(angle)}deg`,
    length: `${round(between(random, TAPE_LENGTH_RANGE))}rem`,
    tint: `var(--ui-folder-stationery-tape-${pick(random, TAPE_TINTS)})`,
    edge: tapeEdge(random),
  });
  const strips =
    random() < TAPE_PAIR_SHARE
      ? [
          strip(4, -between(random, TAPE_CORNER_ANGLE_RANGE)),
          strip(96, between(random, TAPE_CORNER_ANGLE_RANGE)),
        ]
      : [
          strip(
            between(random, TAPE_X_RANGE),
            signed(random, TAPE_ANGLE_RANGE),
          ),
        ];
  return { stationery: 'tape', stationeryStrips: strips };
}

function tornStationery(random) {
  const side = random() < TORN_TOP_SHARE ? 'top' : 'bottom';
  return {
    stationery: 'torn',
    stationerySide: side,
    stationeryStyle: {
      '--ui-folder-stationery-edge': tornEdge(random, side),
    },
  };
}

/**
 * Stationery props for one Folder object. The derived data card is an index
 * card and is always clipped; about one in three user objects carries tape
 * (photos) or a torn edge (notes).
 */
export function folderStationeryFor({ key, type, source }) {
  const random = createSeededRandom(key);
  if (source === 'derived') return clipStationery(random);
  if (random() >= STATIONERY_SHARE) return { stationery: 'none' };
  return type === 'photo' ? tapeStationery(random) : tornStationery(random);
}
