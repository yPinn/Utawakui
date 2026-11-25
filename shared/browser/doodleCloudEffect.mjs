// GPU doodle cloud for textured credits: themed doodles (formulas, circuit
// buses, small sketches) gather around each lyric line in stacked layers that
// each burn in and out along their own direction. Canvas 2D draws the doodles
// once per cue; PixiJS shaders animate them from a GSAP-driven state object.

// A theme supplies formula-like labels and line sketches. Formula parts are
// plain strings or [numerator, denominator] fractions.
export const DOODLE_THEMES = Object.freeze({
  science: Object.freeze({
    color: '#c9f6ff',
    glow: 0x62d7ff,
    formulas: [
      ['f′(x) = lim ', ['f(x+h) − f(x)', 'h']],
      ['E = mc²'],
      ['PV = nRT'],
      ['2d sin θ = nλ'],
      ['F = G ', ['m₁m₂', 'r²']],
      ['∇·E = ', ['ρ', 'ε₀']],
      ['sin²θ + cos²θ = 1'],
      ['λ = ', ['h', 'p']],
      ['x = ', ['−b ± √(b² − 4ac)', '2a']],
      ['∫ e^(−x²) dx = √π'],
      ['ΔS ≥ 0'],
      ['n₁ sin θ₁ = n₂ sin θ₂'],
      ['{Qᵢ, Qⱼ} = 2δᵢⱼ'],
      ['C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O'],
      ['Σ aₙxⁿ'],
      ['v = ', ['dx', 'dt']],
      ['ω = 2πf'],
      ['∂u/∂t = α∇²u'],
      ['a = ', ['F', 'm']],
      ['ψ(x, t)'],
    ],
    sketches: ['flask', 'ring', 'wave', 'orbit'],
    // Functional groups that end chemical structures.
    groups: ['OH', 'NH₂', 'COOH', 'O', 'Cl', 'CH₃', 'N'],
  }),
});

const FORMULA_FONT = '"Cambria Math", "Times New Roman", serif';

// Shared by every filter: pixel position comes from the filter frame, so the
// filter area can be limited to the doodle bounds.
const FILTER_VERTEX = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`;

// Each layer burns along its own direction like a fuse: the growth front
// draws the doodles in, then the dissolve front follows the same way at the
// same speed. Positions are projected onto the direction and normalized over
// the doodles. uGrow and uFade run 0..1; both fronts cover every pixel.
const CLOUD_FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
// Uniforms shared with the vertex stage must match its highp precision.
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform vec2 uCenter;
uniform vec2 uDirection;
uniform vec2 uExtent;
uniform float uGrow;
uniform float uSeed;
uniform float uFade;
const float GRAIN = 0.15;
const float EDGE = 0.06;
const float SPAN = 1.0 + GRAIN + EDGE;
void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  vec2 position = uOutputFrame.xy + vTextureCoord * uInputSize.xy;
  float along = dot(position - uCenter, uDirection);
  float reach = clamp((along - uExtent.x) / (uExtent.y - uExtent.x), 0.0, 1.0);
  // Small blocks lead or trail the front a little, so it burns raggedly.
  float grain = fract(sin(dot(floor(position / 16.0), vec2(12.9898, 78.233)) + uSeed) * 43758.5453);
  float place = reach + grain * GRAIN;
  float grown = clamp((uGrow * SPAN - place) / EDGE, 0.0, 1.0);
  float kept = clamp((place - uFade * SPAN + EDGE) / EDGE, 0.0, 1.0);
  finalColor = color * grown * kept;
}`;

function seededRandom(text) {
  let seed = 2166136261;
  for (const character of String(text)) {
    seed = Math.imul(seed ^ character.codePointAt(0), 16777619);
  }
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function formulaWidth(parts, size, measureText) {
  return parts.reduce((width, part) => {
    if (typeof part === 'string') return width + measureText(part, size);
    const small = size * 0.78;
    return (
      width +
      Math.max(measureText(part[0], small), measureText(part[1], small)) +
      size * 0.3
    );
  }, 0);
}

function lineUnion(lines) {
  const left = Math.min(...lines.map((line) => line.x));
  const top = Math.min(...lines.map((line) => line.y));
  const right = Math.max(...lines.map((line) => line.x + line.width));
  const bottom = Math.max(...lines.map((line) => line.y + line.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// Overlapping formula sheets set the cloud's density.
export const FORMULA_SHEETS = 6;
// How far doodles may reach past the lyric, in lyric font sizes; the reach
// varies by up to this share around the lyric so the edge is irregular.
export const DOODLE_MARGIN_EMS = 1.6;
export const DOODLE_EDGE_WOBBLE = 0.45;

// Lays out one cue's doodles around the given line boxes (canvas pixels). The
// result is plain data so it can be drawn by Canvas 2D and tested without it.
export function layoutDoodles({
  lines,
  writing = 'horizontal',
  seed = '',
  theme = DOODLE_THEMES.science,
  measureText,
  layerRange = DOODLE_LAYER_RANGE,
}) {
  const random = seededRandom(seed);
  const vertical = writing === 'vertical';
  const union = lineUnion(lines);
  const em =
    (vertical
      ? Math.max(...lines.map((line) => line.width))
      : Math.max(...lines.map((line) => line.height))) / 1.28;
  const size = Math.max(9, em * 0.3);
  const center = {
    x: union.x + union.width / 2,
    y: union.y + union.height / 2,
  };
  const radius = {
    x: union.width / 2 + em * 0.5,
    y: union.height / 2 + em * 0.5,
  };
  // Every doodle stays within a margin of the lyric, so a short line gets a
  // small cloud rather than one spread over the whole frame.
  // The margin wobbles smoothly around the lyric so the edge stays organic.
  const margin = em * DOODLE_MARGIN_EMS;
  const phases = [random() * Math.PI * 2, random() * Math.PI * 2];
  const allowance = (x, y) => {
    const turn = Math.atan2(y - center.y, x - center.x);
    const wave =
      0.6 * Math.sin(3 * turn + phases[0]) +
      0.4 * Math.sin(5 * turn + phases[1]);
    return margin * (1 + DOODLE_EDGE_WOBBLE * wave);
  };
  const outside = (x, y) =>
    Math.hypot(
      Math.max(union.x - x, 0, x - union.x - union.width),
      Math.max(union.y - y, 0, y - union.y - union.height),
    );
  const inside = (box) =>
    [
      [box.left, box.top],
      [box.right, box.top],
      [box.left, box.bottom],
      [box.right, box.bottom],
    ].every(([x, y]) => outside(x, y) <= allowance(x, y));
  const items = [];
  const pick = (list) => list[Math.floor(random() * list.length)];
  // Draw formulas from a shuffled bag so none repeats until all have appeared.
  let bag = [];
  const nextFormula = () => {
    if (!bag.length) {
      bag = theme.formulas.slice();
      for (let index = bag.length - 1; index > 0; index -= 1) {
        const other = Math.floor(random() * (index + 1));
        [bag[index], bag[other]] = [bag[other], bag[index]];
      }
    }
    return bag.pop();
  };
  // Formulas on one sheet never overlap; sheets stack in different layers.
  // They do cover the lyric: it stays hidden until the cloud dissolves.
  const gap = size * 0.25;
  const sheets = Array.from({ length: FORMULA_SHEETS }, () => []);
  let sheet = 0;
  const overlaps = (box) =>
    sheets[sheet].some(
      (other) =>
        box.left < other.right &&
        box.right > other.left &&
        box.top < other.bottom &&
        box.bottom > other.top,
    );

  // Formulas follow the writing direction: a vertical lyric turns them a
  // quarter so they read down the column with it.
  const angle = vertical ? Math.PI / 2 : 0;
  // Writing-relative coordinates: `along` the reading direction, `across` it.
  const point = (along, across) =>
    vertical ? [across, along] : [along, across];
  const alongAxis = vertical ? [0, 1] : [1, 0];
  const acrossAxis = vertical ? [1, 0] : [0, 1];

  // Places a formula whose run starts at `along`, centered on `across`.
  // Returns the run length, or 0 when the spot on this sheet was taken.
  function addFormula(along, across) {
    const parts = nextFormula();
    const formulaSize = size * (0.85 + random() * 0.3);
    const width = formulaWidth(parts, formulaSize, measureText);
    const [cx, cy] = point(along + width / 2, across);
    const item = {
      type: 'formula',
      parts,
      x: cx - width / 2,
      y: cy + formulaSize * 0.25,
      size: formulaSize,
      width,
      angle,
      sheet,
    };
    const box = itemBox(item);
    if (overlaps(box) || !inside(box)) return 0;
    sheets[sheet].push({
      left: box.left - (vertical ? 0 : gap),
      top: box.top - (vertical ? gap : 0),
      right: box.right + (vertical ? 0 : gap),
      bottom: box.bottom + (vertical ? gap : 0),
    });
    items.push(item);
    return width;
  }

  // A bus's traces and pads share a group so they always land in one layer.
  let groups = 0;
  function addBus([x, y], along, across) {
    const group = `bus-${(groups += 1)}`;
    const pitch = size * 0.7;
    const lanes = 3 + Math.floor(random() * 4);
    // A bus shrinks to reach no further than the wobbling edge ahead of it.
    const edge = allowance(x, y);
    const room =
      along[0] > 0
        ? union.x + union.width + edge - x
        : along[0] < 0
          ? x - union.x + edge
          : along[1] > 0
            ? union.y + union.height + edge - y
            : y - union.y + edge;
    const reach = em * (0.6 + random() * 1.6);
    const step = pitch * (1 + Math.floor(random() * 3));
    const span = em * (0.4 + random() * 1.4);
    const fit = Math.min(1, Math.max(0, room - pitch) / (reach + step + span));
    if (fit < 0.25) return;
    const run = reach * fit;
    const jog = step * fit * (random() < 0.5 ? -1 : 1);
    const tail = span * fit;
    for (let lane = 0; lane < lanes; lane += 1) {
      const offset = (lane - (lanes - 1) / 2) * pitch;
      const start = [x + across[0] * offset, y + across[1] * offset];
      const bend = [start[0] + along[0] * run, start[1] + along[1] * run];
      const jogged = [
        bend[0] + along[0] * Math.abs(jog) + across[0] * jog,
        bend[1] + along[1] * Math.abs(jog) + across[1] * jog,
      ];
      const length = tail * (0.5 + random() * 0.5);
      const end = [
        jogged[0] + along[0] * length,
        jogged[1] + along[1] * length,
      ];
      items.push({
        type: 'trace',
        points: [start, bend, jogged, end],
        size,
        group,
      });
      items.push({
        type: 'pad',
        x: end[0],
        y: end[1],
        radius: pitch * 0.32,
        square: random() < 0.4,
        size,
        group,
      });
    }
  }

  const span = (line) =>
    vertical
      ? {
          start: line.y,
          length: line.height,
          side: line.x,
          thickness: line.width,
        }
      : {
          start: line.x,
          length: line.width,
          side: line.y,
          thickness: line.height,
        };

  // Formula bands over and beside each line, longer than the text. Each sheet
  // lays a full set, offset by a fraction of a band.
  for (sheet = 0; sheet < FORMULA_SHEETS; sheet += 1) {
    const offset = (sheet * size * 1.4) / FORMULA_SHEETS;
    for (const line of lines) {
      const { start, length, side, thickness } = span(line);
      const end = side + thickness;
      for (const [across, chance] of [
        [side + thickness / 2, 0.9],
        [side - size * 0.85, 0.9],
        [end + size * 1.05, 0.9],
        [side - size * 2.25, 0.6],
        [end + size * 2.45, 0.6],
        [side - size * 3.65, 0.35],
        // Sparse outer bands fall into the dim back layer and widen the cloud.
        [end + size * 3.85, 0.3],
        [side - size * 5.05, 0.3],
      ]) {
        let along = start - em * 1.6 + random() * em * 0.6;
        while (along < start + length + em * 1.4) {
          const width =
            random() < chance
              ? addFormula(
                  along,
                  across + offset + (random() - 0.5) * size * 0.4,
                ) || size * 2
              : size * 4;
          along += width + size * (0.6 + random() * 2.2);
        }
      }
    }
  }
  sheet = 0;

  // Circuit buses leave both ends of each line and fan out from both sides.
  const back = alongAxis.map((value) => -value);
  const out = acrossAxis.map((value) => -value);
  for (const line of lines) {
    const { start, length, side, thickness } = span(line);
    for (const share of [0.15, 0.38, 0.62, 0.85]) {
      const across = side + thickness * share;
      addBus(point(start - em * 0.3, across), back, acrossAxis);
      addBus(point(start + length + em * 0.3, across), alongAxis, acrossAxis);
    }
    for (let index = 0; index < 8; index += 1) {
      const along = start + length * ((index + 0.2 + random() * 0.6) / 8);
      addBus(point(along, side - em * 0.3), out, alongAxis);
      addBus(point(along, side + thickness + em * 0.3), acrossAxis, alongAxis);
    }
  }

  // Sketches sit on the cloud rim, apart from each other, over any doodle.
  const sketches = 2 + Math.floor(random() * 3);
  const placed = [];
  for (let index = 0, tries = 0; index < sketches && tries < 24; tries += 1) {
    const around = random() * Math.PI * 2;
    const sketch = {
      type: 'sketch',
      kind: pick(theme.sketches),
      x: center.x + Math.cos(around) * (radius.x + em * random() * 0.5),
      y: center.y + Math.sin(around) * (radius.y + em * random() * 0.5),
      size: em * (0.9 + random() * 0.5),
      angle,
    };
    const crowded = placed.some(
      (other) =>
        Math.hypot(other.x - sketch.x, other.y - sketch.y) < sketch.size * 1.5,
    );
    if (crowded || !inside(itemBox(sketch))) continue;
    placed.push(sketch);
    items.push(sketch);
    index += 1;
  }

  // Skeletal chemical structures scattered through the cloud.
  const molecules = lines.length * (4 + Math.floor(random() * 3));
  for (
    let index = 0, tries = 0;
    index < molecules && tries < molecules * 4;
    tries += 1
  ) {
    const around = random() * Math.PI * 2;
    const distance = 0.2 + random() * 1.1;
    const ring = random() < 0.45;
    const bonds = ring ? 6 : 3 + Math.floor(random() * 4);
    const molecule = {
      type: 'molecule',
      kind: ring ? 'ring' : 'chain',
      x: center.x + Math.cos(around) * (radius.x + em * 0.5) * distance,
      y: center.y + Math.sin(around) * (radius.y + em * 0.5) * distance,
      size: em * (ring ? 1 + random() * 0.5 : 1.7 + random() * 1),
      // Bond orders; rings alternate, chains double about a quarter of bonds.
      bonds: Array.from({ length: bonds }, (_, bond) =>
        ring ? 1 + (bond % 2) : random() < 0.25 ? 2 : 1,
      ),
      label: random() < 0.7 ? pick(theme.groups) : null,
      flip: random() < 0.5,
      angle,
    };
    if (!inside(itemBox(molecule))) continue;
    items.push(molecule);
    index += 1;
  }

  // Closer doodles are brighter; the cloud thins out toward its edge.
  const reachOf = (x, y) =>
    Math.hypot((x - center.x) / radius.x, (y - center.y) / radius.y);
  let maxReach = 1;
  let bounds = {
    left: union.x,
    top: union.y,
    right: union.x + union.width,
    bottom: union.y + union.height,
  };
  for (const item of items) {
    const box = itemBox(item);
    bounds = {
      left: Math.min(bounds.left, box.left),
      top: Math.min(bounds.top, box.top),
      right: Math.max(bounds.right, box.right),
      bottom: Math.max(bounds.bottom, box.bottom),
    };
    for (const [x, y] of [
      [box.left, box.top],
      [box.right, box.top],
      [box.left, box.bottom],
      [box.right, box.bottom],
    ])
      maxReach = Math.max(maxReach, reachOf(x, y));
    const [cx, cy] = [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
    const reach = reachOf(cx, cy);
    item.alpha = Math.min(1, Math.max(0.3, 1.25 - reach * 0.35));
    item.reach = reach;
  }
  const layers = createLayers(random, layerRange);
  assignLayers(items, layers, random);
  return {
    items,
    layers,
    center,
    radius,
    maxReach: maxReach * 1.05,
    bounds,
    theme,
    // Line art and circuits share one stroke width, set by the formula size.
    lineWidth: Math.max(1, size * 0.075),
  };
}

// Each cue stacks a seeded number of layers that share one timing. Every
// layer burns along its own direction (screen coordinates, y down), and
// through the whole effect (`drift`) scales slightly and travels along it.
// Each layer costs about 3 ms GPU per second, so the range is set by how many
// sweep directions stay readable; DOODLE_LAYER_LIMIT caps scene allocation.
export const DOODLE_LAYER_RANGE = Object.freeze([3, 5]);
export const DOODLE_LAYER_LIMIT = 6;
// The latest a layer may start, as a share of the burn; all layers end together.
export const DOODLE_LAYER_DELAY = 0.35;

// One layer's fronts at overall burn progress 0..1: after its start it draws
// in, then dissolves at the same pace, finishing exactly when the burn ends.
export function layerBurn({ start = 0 }, progress) {
  const local = Math.min(1, Math.max(0, (progress - start) / (1 - start)));
  return {
    grow: Math.min(1, local * 2),
    fade: Math.max(0, local * 2 - 1),
  };
}

// Each layer sweeps from its own random direction; spacing keeps them apart.
function createLayers(random, [minimum, maximum]) {
  const count = Math.min(
    DOODLE_LAYER_LIMIT,
    minimum + Math.floor(random() * (maximum - minimum + 1)),
  );
  const step = (Math.PI * 2) / count;
  const turn = random() * Math.PI * 2;
  const angles = Array.from(
    { length: count },
    (_, index) => turn + step * index + (random() - 0.5) * step * 0.6,
  );
  for (let index = angles.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [angles[index], angles[other]] = [angles[other], angles[index]];
  }
  // Layers start at different moments; the earliest starts at once.
  const delays = angles.map(() => random() * DOODLE_LAYER_DELAY);
  const earliest = Math.min(...delays);
  return angles.map((angle, index) => {
    const direction = [Math.cos(angle), Math.sin(angle)];
    // With three or more layers, the first one is a dim, blurred back layer.
    const back = count >= 3 && index === 0;
    const settle = (0.03 + random() * 0.04) * (random() < 0.5 ? 1 : -1);
    const travel = 0.03 + random() * 0.03;
    return {
      index,
      direction,
      start: delays[index] - earliest,
      effect: back ? 'blur' : random() < 0.4 ? 'bloom-strong' : 'bloom',
      alpha: back ? 0.55 : 1,
      scale: [1 + settle + (back ? 0.04 : 0), 1 - settle * 0.4],
      shift: direction.map((value) => value * travel),
    };
  });
}

// Spreads doodles over the layers; a bus stays together, each formula sheet
// takes its own front layer, and outer formulas prefer the blurred back layer.
function assignLayers(items, layers, random) {
  const back = layers.find((layer) => layer.effect === 'blur');
  const front = layers.filter((layer) => layer !== back);
  const turn = Math.floor(random() * front.length);
  const groups = new Map();
  for (const item of items) {
    if (item.group && groups.has(item.group)) {
      item.layer = groups.get(item.group);
      continue;
    }
    const formula = item.type === 'formula';
    const layer =
      back && formula && (item.reach > 1.6 || random() < 0.25)
        ? back
        : formula
          ? front[(item.sheet + turn) % front.length]
          : front[Math.floor(random() * front.length)];
    item.layer = layer.index;
    if (item.group) groups.set(item.group, layer.index);
  }
}

// The span of the doodle bounds along a direction, relative to a center.
export function sweepExtent(bounds, center, [dx, dy]) {
  const values = [
    [bounds.left, bounds.top],
    [bounds.right, bounds.top],
    [bounds.left, bounds.bottom],
    [bounds.right, bounds.bottom],
  ].map(([x, y]) => (x - center.x) * dx + (y - center.y) * dy);
  return [Math.min(...values), Math.max(...values)];
}

// Linear position of a layer's motion at drift progress 0..1.
export function layerMotion(layer, drift) {
  const t = Math.min(1, Math.max(0, drift));
  return {
    scale: layer.scale[0] + (layer.scale[1] - layer.scale[0]) * t,
    shift: layer.shift.map((value) => value * t),
  };
}

function clampProgress(value) {
  return Math.min(1, Math.max(0, value));
}

// A formula's pivot: the middle of its run of text.
function formulaCenter(item) {
  return { x: item.x + item.width / 2, y: item.y - item.size * 0.25 };
}

function itemBox(item) {
  if (item.type === 'formula') {
    if (!item.angle)
      return {
        left: item.x,
        top: item.y - item.size * 1.3,
        right: item.x + item.width,
        bottom: item.y + item.size * 0.8,
      };
    // Turned a quarter: the text run becomes the height.
    const { x, y } = formulaCenter(item);
    return {
      left: x - item.size * 1.05,
      top: y - item.width / 2,
      right: x + item.size * 1.05,
      bottom: y + item.width / 2,
    };
  }
  if (item.type === 'trace') {
    const xs = item.points.map(([x]) => x);
    const ys = item.points.map(([, y]) => y);
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  }
  const half = item.type === 'pad' ? item.radius : item.size / 2;
  return {
    left: item.x - half,
    top: item.y - half,
    right: item.x + half,
    bottom: item.y + half,
  };
}

function drawFormula(context, item) {
  if (item.angle) {
    const center = formulaCenter(item);
    context.save();
    context.translate(center.x, center.y);
    context.rotate(item.angle);
    context.translate(-center.x, -center.y);
    drawFormulaRun(context, item);
    context.restore();
    return;
  }
  drawFormulaRun(context, item);
}

function drawFormulaRun(context, { parts, x, y, size }) {
  let cursor = x;
  for (const part of parts) {
    if (typeof part === 'string') {
      context.font = `italic ${size}px ${FORMULA_FONT}`;
      context.fillText(part, cursor, y);
      cursor += context.measureText(part).width;
      continue;
    }
    const small = size * 0.78;
    context.font = `italic ${small}px ${FORMULA_FONT}`;
    const width = Math.max(
      context.measureText(part[0]).width,
      context.measureText(part[1]).width,
    );
    const middle = cursor + size * 0.15 + width / 2;
    context.textAlign = 'center';
    context.fillText(part[0], middle, y - size * 0.42);
    context.fillText(part[1], middle, y + size * 0.62);
    context.textAlign = 'left';
    context.beginPath();
    context.moveTo(cursor + size * 0.1, y - size * 0.28);
    context.lineTo(cursor + size * 0.2 + width, y - size * 0.28);
    context.stroke();
    cursor += width + size * 0.3;
  }
}

// A bond between two atoms; a double bond adds a shorter inner line.
function drawBond(path, from, to, order, inward) {
  path.moveTo(...from);
  path.lineTo(...to);
  if (order < 2) return;
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const trim = 0.15;
  path.moveTo(from[0] + dx * trim + inward[0], from[1] + dy * trim + inward[1]);
  path.lineTo(to[0] - dx * trim + inward[0], to[1] - dy * trim + inward[1]);
}

// Skeletal structural formulas: a benzene-style ring or a zigzag carbon chain,
// optionally ending in a functional group label.
function drawMolecule(context, item) {
  const { kind, x, y, size, bonds, label, flip, angle = 0 } = item;
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.beginPath();
  let end;
  let step;
  if (kind === 'ring') {
    const radius = size / 2;
    const corner = (index) => {
      const turn = (index / 6) * Math.PI * 2 - Math.PI / 2;
      return [Math.cos(turn) * radius, Math.sin(turn) * radius];
    };
    for (let index = 0; index < 6; index += 1) {
      const from = corner(index);
      const to = corner(index + 1);
      // Inner lines sit toward the ring center.
      const middle = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      const inward = middle.map((value) => -value * 0.22);
      drawBond(context, from, to, bonds[index], inward);
    }
    step = radius;
    const top = corner(0);
    end = [top[0], top[1] - radius * 0.7];
    if (label) {
      context.moveTo(...top);
      context.lineTo(...end);
    }
  } else {
    step = size / (bonds.length * 0.866);
    const rise = step * 0.5 * (flip ? -1 : 1);
    const atom = (index) => [
      -size / 2 + index * step * 0.866,
      index % 2 ? -rise / 2 : rise / 2,
    ];
    for (let index = 0; index < bonds.length; index += 1) {
      const from = atom(index);
      const to = atom(index + 1);
      // Double bonds sit on the inside of the zigzag.
      const side = index % 2 ? 1 : -1;
      drawBond(context, from, to, bonds[index], [0, side * rise * 0.3]);
    }
    end = atom(bonds.length);
  }
  context.stroke();
  if (label) {
    context.font = `${step * 0.55}px ${FORMULA_FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const offset = kind === 'ring' ? [0, -step * 0.3] : [step * 0.45, 0];
    context.fillText(label, end[0] + offset[0], end[1] + offset[1]);
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
  }
  context.restore();
}

function drawSketch(context, item) {
  const { kind, x, y, size, angle = 0 } = item;
  const s = size / 2;
  context.save();
  // Sketches turn with the writing direction, like the formulas.
  context.translate(x, y);
  context.rotate(angle);
  context.translate(-x, -y);
  context.beginPath();
  if (kind === 'flask') {
    context.moveTo(x - s * 0.18, y - s);
    context.lineTo(x - s * 0.18, y - s * 0.25);
    context.lineTo(x - s * 0.75, y + s * 0.85);
    context.lineTo(x + s * 0.75, y + s * 0.85);
    context.lineTo(x + s * 0.18, y - s * 0.25);
    context.lineTo(x + s * 0.18, y - s);
    context.moveTo(x - s * 0.5, y + s * 0.35);
    context.lineTo(x + s * 0.5, y + s * 0.35);
  } else if (kind === 'ring') {
    for (let corner = 0; corner <= 6; corner += 1) {
      const angle = (corner / 6) * Math.PI * 2 + Math.PI / 6;
      const point = [
        x + Math.cos(angle) * s * 0.8,
        y + Math.sin(angle) * s * 0.8,
      ];
      if (corner === 0) context.moveTo(...point);
      else context.lineTo(...point);
    }
    context.moveTo(x + s * 0.48, y);
    context.arc(x, y, s * 0.48, 0, Math.PI * 2);
  } else if (kind === 'wave') {
    context.moveTo(x - s, y + s * 0.8);
    context.lineTo(x - s, y - s * 0.8);
    context.moveTo(x - s, y);
    context.lineTo(x + s, y);
    for (let step = 0; step <= 24; step += 1) {
      const px = x - s + (step / 24) * s * 2;
      const py = y - Math.sin((step / 24) * Math.PI * 3) * s * 0.55;
      if (step === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
  } else {
    for (const tilt of [0, Math.PI / 3, -Math.PI / 3]) {
      context.moveTo(
        x + s * 0.9 * Math.cos(tilt),
        y + s * 0.9 * Math.sin(tilt),
      );
      context.ellipse(x, y, s * 0.9, s * 0.32, tilt, 0, Math.PI * 2);
    }
    context.moveTo(x + s * 0.1, y);
    context.arc(x, y, s * 0.1, 0, Math.PI * 2);
  }
  context.stroke();
  context.restore();
}

// Draws one depth layer of a layout into a 2D context already translated to
// the doodle bounds; without a layer id it draws every doodle.
export function drawDoodles(context, layout, layer = null) {
  context.strokeStyle = layout.theme.color;
  context.fillStyle = layout.theme.color;
  context.lineJoin = 'miter';
  context.lineCap = 'round';
  for (const item of layout.items) {
    if (layer !== null && item.layer !== layer) continue;
    context.globalAlpha = item.alpha;
    // A sketch's size is its drawing height, not a stroke basis.
    context.lineWidth =
      item.type === 'formula'
        ? Math.max(1, item.size * 0.075)
        : (layout.lineWidth ?? 1);
    if (item.type === 'formula') drawFormula(context, item);
    else if (item.type === 'trace') {
      context.beginPath();
      context.moveTo(...item.points[0]);
      for (const point of item.points.slice(1)) context.lineTo(...point);
      context.stroke();
    } else if (item.type === 'pad') {
      context.beginPath();
      if (item.square)
        context.rect(
          item.x - item.radius,
          item.y - item.radius,
          item.radius * 2,
          item.radius * 2,
        );
      else context.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
      context.stroke();
    } else if (item.type === 'molecule') drawMolecule(context, item);
    else drawSketch(context, item);
  }
  context.globalAlpha = 1;
}

export function createDoodleCloudState() {
  return {
    // 0..1 over the whole burn; each layer maps it to its own fronts.
    burn: { progress: 0 },
    // 0..1 across the whole effect: keeps every layer moving.
    drift: { value: 0 },
    glow: { opacity: 0 },
    flash: { opacity: 0, scale: 0.7 },
  };
}

function glowTexture(pixi, documentApi) {
  const canvas = documentApi.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgb(177 237 255 / 30%)');
  gradient.addColorStop(0.5, 'rgb(72 180 244 / 13%)');
  gradient.addColorStop(1, 'rgb(72 180 244 / 0%)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  return pixi.Texture.from(canvas);
}

function cloudFilter(pixi) {
  return new pixi.Filter({
    glProgram: pixi.GlProgram.from({
      vertex: FILTER_VERTEX,
      fragment: CLOUD_FRAGMENT,
      name: 'doodle-cloud',
    }),
    resources: {
      cloudUniforms: {
        uCenter: { value: new Float32Array(2), type: 'vec2<f32>' },
        uDirection: { value: new Float32Array([0, -1]), type: 'vec2<f32>' },
        uExtent: { value: new Float32Array([0, 1]), type: 'vec2<f32>' },
        uGrow: { value: 0, type: 'f32' },
        uSeed: { value: 0, type: 'f32' },
        uFade: { value: 0, type: 'f32' },
      },
    },
  });
}

function createLayerFilters(pixi, filters, theme, effect) {
  if (effect === 'blur')
    return filters?.KawaseBlurFilter
      ? [new filters.KawaseBlurFilter({ strength: 2, quality: 3 })]
      : [new pixi.BlurFilter({ strength: 2 })];
  if (filters?.AdvancedBloomFilter)
    return [
      new filters.AdvancedBloomFilter({
        threshold: 0.1,
        bloomScale: effect === 'bloom-strong' ? 1.3 : 1.2,
        brightness: 1,
        blur: 4,
        quality: 4,
      }),
    ];
  return filters?.GlowFilter
    ? [
        new filters.GlowFilter({
          distance: 8,
          outerStrength: 2,
          color: theme.glow,
          quality: 0.25,
        }),
      ]
    : [];
}

function buildScene(pixi, filters, documentApi, theme) {
  const glowSource = glowTexture(pixi, documentApi);
  // The glow stays outside the block mask so it fades smoothly.
  const glow = new pixi.Sprite(glowSource);
  glow.anchor.set(0.5);
  // Slots are allocated once; each cue enables as many as its layout uses.
  const layers = Array.from({ length: DOODLE_LAYER_LIMIT }, () => {
    const sprite = new pixi.Sprite();
    const container = new pixi.Container();
    container.addChild(sprite);
    container.visible = false;
    const effects = new Map();
    return {
      sprite,
      container,
      filter: cloudFilter(pixi),
      config: null,
      // Mask first, then bloom or blur, so the glow softens each block edge.
      use(config) {
        if (!effects.has(config.effect))
          effects.set(
            config.effect,
            createLayerFilters(pixi, filters, theme, config.effect),
          );
        this.config = config;
        sprite.alpha = config.alpha;
        container.filters = [this.filter, ...effects.get(config.effect)];
        container.visible = true;
      },
    };
  });
  const flash = new pixi.Sprite(glowSource);
  flash.anchor.set(0.5);
  flash.blendMode = 'add';
  const root = new pixi.Container();
  root.addChild(glow, ...layers.map(({ container }) => container), flash);
  return { root, layers, glow, flash, glowSource };
}

function releaseTexture(pixi, sprite) {
  if (sprite.texture && sprite.texture !== pixi.Texture.EMPTY)
    sprite.texture.destroy(true);
}

// Returns null when PixiJS is unavailable; the template then shows text only.
// layoutFor() reports { writing, lines } with line boxes in canvas pixels.
export function createDoodleCloudEffect({
  pixi,
  filters = pixi?.filters,
  documentApi = globalThis.document,
  state,
  className,
  theme = DOODLE_THEMES.science,
  layoutFor = () => null,
}) {
  if (!pixi?.Application || !documentApi?.createElement || !state) return null;
  const canvas = documentApi.createElement('canvas');
  if (className) canvas.className = className;
  canvas.setAttribute('aria-hidden', 'true');
  let app = null;
  let scene = null;
  let observer = null;
  let destroyed = false;
  let cueSeed = '';
  let lastKey = '';
  let size = { width: 0, height: 0 };
  let cloudSize = { x: 1, y: 1 };
  let cloud = { center: { x: 0, y: 0 }, radius: { x: 1, y: 1 } };

  function rebuild() {
    if (!app || !scene) return;
    const source = layoutFor();
    if (!source?.lines?.length) {
      for (const layer of scene.layers) layer.container.visible = false;
      scene.glow.visible = false;
      lastKey = '';
      return;
    }
    const measure = documentApi.createElement('canvas').getContext('2d');
    const layout = layoutDoodles({
      ...source,
      seed: cueSeed,
      theme,
      measureText: (text, fontSize) => {
        measure.font = `italic ${fontSize}px ${FORMULA_FONT}`;
        return measure.measureText(text).width;
      },
    });
    const margin = 8;
    const left = Math.floor(layout.bounds.left - margin);
    const top = Math.floor(layout.bounds.top - margin);
    const width = Math.max(1, Math.ceil(layout.bounds.right - left + margin));
    const height = Math.max(1, Math.ceil(layout.bounds.bottom - top + margin));
    // The glow fades to zero at its edge, inside the dissolve radius.
    cloudSize = {
      x: layout.radius.x * layout.maxReach * 1.4,
      y: layout.radius.y * layout.maxReach * 1.4,
    };
    scene.glow.visible = true;
    scene.glow.position.set(layout.center.x, layout.center.y);
    scene.glow.width = cloudSize.x;
    scene.glow.height = cloudSize.y;
    scene.flash.position.set(layout.center.x, layout.center.y);
    // Bloom, blur and glow spread past the strokes; a tight filter area would
    // cut them into a visible rectangle. Layers also scale around the center.
    const spread = 96;
    const area = new pixi.Rectangle(
      Math.min(left, layout.center.x - cloudSize.x / 2) - spread,
      Math.min(top, layout.center.y - cloudSize.y / 2) - spread,
      0,
      0,
    );
    area.width =
      Math.max(left + width, layout.center.x + cloudSize.x / 2) +
      spread -
      area.x;
    area.height =
      Math.max(top + height, layout.center.y + cloudSize.y / 2) +
      spread -
      area.y;
    let hash = 0;
    for (const character of cueSeed)
      hash = (hash * 31 + character.codePointAt(0)) % 1000;
    scene.layers.forEach((layer, slot) => {
      const config = layout.layers[slot];
      releaseTexture(pixi, layer.sprite);
      if (!config) {
        layer.config = null;
        layer.container.visible = false;
        return;
      }
      layer.use(config);
      // A fresh canvas per cue: PixiJS caches textures by canvas, and
      // resizing a canvas source clears what was drawn.
      const layerCanvas = documentApi.createElement('canvas');
      layerCanvas.width = width;
      layerCanvas.height = height;
      const context = layerCanvas.getContext('2d');
      context.setTransform(1, 0, 0, 1, -left, -top);
      drawDoodles(context, layout, config.index);
      layer.sprite.texture = new pixi.Texture({
        source: new pixi.CanvasSource({ resource: layerCanvas }),
      });
      layer.sprite.position.set(left - layout.center.x, top - layout.center.y);
      // Scaling happens around the text center.
      layer.container.position.set(layout.center.x, layout.center.y);
      layer.container.filterArea = new pixi.Rectangle(
        area.x - layout.center.x,
        area.y - layout.center.y,
        area.width,
        area.height,
      );
      const uniforms = layer.filter.resources.cloudUniforms.uniforms;
      uniforms.uCenter.set([layout.center.x, layout.center.y]);
      uniforms.uDirection.set(config.direction);
      // Bloom, blur and drift reach a little past the strokes.
      const [low, high] = sweepExtent(
        layout.bounds,
        layout.center,
        config.direction,
      );
      uniforms.uExtent.set([low - spread / 2, high + spread / 2]);
      // Each layer gets its own block timing so the stack does not pop in unison.
      uniforms.uSeed = hash + slot * 37;
    });
    cloud = { center: layout.center, radius: layout.radius };
    lastKey = '';
  }

  function resize() {
    if (!app || !scene) return;
    // Draw at layout size: OBS captures CSS pixels, so skip devicePixelRatio.
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    if (width === size.width && height === size.height) return;
    size = { width, height };
    app.renderer.resize(width, height);
    rebuild();
    render();
  }

  function render() {
    if (!app || !scene) return;
    const { progress } = state.burn;
    const key = [
      progress,
      state.drift.value,
      state.glow.opacity,
      state.flash.opacity,
      state.flash.scale,
    ].join(',');
    // The timeline updates every tick; skip frames where nothing changed.
    if (key === lastKey) return;
    lastKey = key;
    // Layers burn on their own start and direction but end together.
    for (const layer of scene.layers) {
      if (!layer.config) continue;
      const uniforms = layer.filter.resources.cloudUniforms.uniforms;
      const { grow, fade } = layerBurn(layer.config, progress);
      uniforms.uGrow = grow;
      uniforms.uFade = fade;
      const { scale, shift } = layerMotion(layer.config, state.drift.value);
      layer.container.scale.set(scale);
      layer.container.position.set(
        cloud.center.x + shift[0] * cloud.radius.x,
        cloud.center.y + shift[1] * cloud.radius.y,
      );
    }
    scene.glow.alpha =
      state.glow.opacity * (1 - clampProgress((progress - 0.5) / 0.45));
    scene.flash.alpha = state.flash.opacity;
    scene.flash.width = cloudSize.x * 0.8 * state.flash.scale;
    scene.flash.height = cloudSize.y * 0.8 * state.flash.scale;
    app.render();
  }

  function disposeRenderer() {
    observer?.disconnect();
    observer = null;
    if (app) {
      scene?.glowSource.destroy(true);
      for (const layer of scene?.layers ?? [])
        releaseTexture(pixi, layer.sprite);
      app.destroy({ removeView: false }, { children: true });
    }
    app = null;
    scene = null;
  }

  const ready = (async () => {
    const instance = new pixi.Application();
    await instance.init({
      canvas,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: false,
      resolution: 1,
      preference: 'webgl',
      width: Math.max(1, canvas.clientWidth),
      height: Math.max(1, canvas.clientHeight),
    });
    if (destroyed) {
      instance.destroy({ removeView: false }, { children: true });
      return;
    }
    app = instance;
    instance.ticker?.stop();
    scene = buildScene(pixi, filters, documentApi, theme);
    app.stage.addChild(scene.root);
    const view = documentApi.defaultView;
    if (view?.ResizeObserver) {
      observer = new view.ResizeObserver(resize);
      observer.observe(canvas);
    }
    resize();
  })().catch(() => {
    disposeRenderer();
    canvas.hidden = true;
  });

  return {
    canvas,
    ready,
    render,
    // Lays out the doodles for a new cue; same seed, same doodles.
    setCue(seed) {
      cueSeed = String(seed ?? '');
      rebuild();
      render();
    },
    destroy() {
      destroyed = true;
      disposeRenderer();
      canvas.remove?.();
    },
  };
}
