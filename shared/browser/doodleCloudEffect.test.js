import { describe, expect, it, vi } from 'vitest';
import {
  createDoodleCloudEffect,
  createDoodleCloudState,
  DOODLE_LAYER_LIMIT,
  DOODLE_LAYER_RANGE,
  DOODLE_THEMES,
  DOODLE_LAYER_DELAY,
  DOODLE_EDGE_WOBBLE,
  DOODLE_MARGIN_EMS,
  FORMULA_SHEETS,
  layerBurn,
  layerMotion,
  layoutDoodles,
} from './doodleCloudEffect.mjs';

describe('doodle cloud effect lifecycle', () => {
  it('releases the initialized renderer when scene setup fails', async () => {
    const canvas = {
      setAttribute: vi.fn(),
      getContext: () => null,
      remove: vi.fn(),
    };
    const destroy = vi.fn();
    class Application {
      async init() {}
      destroy = destroy;
    }
    const effect = createDoodleCloudEffect({
      pixi: { Application },
      documentApi: { createElement: () => canvas },
      state: createDoodleCloudState(),
    });

    await effect.ready;
    expect(canvas.hidden).toBe(true);
    expect(destroy).toHaveBeenCalledTimes(1);
    effect.destroy();
    expect(canvas.remove).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

const measureText = (text, size) => text.length * size * 0.5;
const horizontal = {
  writing: 'horizontal',
  measureText,
  lines: [
    { x: 600, y: 420, width: 700, height: 90 },
    { x: 700, y: 520, width: 500, height: 90 },
  ],
};

function countBy(items) {
  return items.reduce((counts, { type }) => {
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
}

describe('doodle cloud layout', () => {
  it('lays out the same doodles for a cue and different ones for the next cue', () => {
    const first = layoutDoodles({ ...horizontal, seed: '1:horizontal:Line' });
    expect(layoutDoodles({ ...horizontal, seed: '1:horizontal:Line' })).toEqual(
      first,
    );
    expect(
      layoutDoodles({ ...horizontal, seed: '2:horizontal:Next' }).items,
    ).not.toEqual(first.items);
  });

  it('mixes formulas, circuit buses and sketches, led by formulas', () => {
    const counts = countBy(layoutDoodles({ ...horizontal, seed: 'mix' }).items);
    expect(counts.formula).toBeGreaterThan(counts.trace / 2);
    expect(counts.trace).toBeGreaterThan(4);
    expect(counts.pad).toBe(counts.trace);
    expect(counts.sketch).toBeGreaterThanOrEqual(1);
  });

  it('keeps doodles hugging each line, wider than the text but not the frame', () => {
    const layout = layoutDoodles({ ...horizontal, seed: 'bounds' });
    const em = 90 / 1.28;
    for (const line of horizontal.lines) {
      const formulasNear = layout.items.filter(
        (item) =>
          item.type === 'formula' &&
          Math.abs(item.y - line.y) < line.height + em,
      );
      expect(formulasNear.length).toBeGreaterThan(2);
    }
    expect(layout.bounds.left).toBeLessThan(600);
    expect(layout.bounds.right).toBeGreaterThan(1300);
    expect(layout.bounds.left).toBeGreaterThan(600 - em * 5);
    expect(layout.bounds.right).toBeLessThan(1300 + em * 5);
  });

  it('stacks formula rows beside a vertical column and runs buses along it', () => {
    const layout = layoutDoodles({
      writing: 'vertical',
      measureText,
      seed: 'column',
      lines: [{ x: 900, y: 200, width: 80, height: 600 }],
    });
    const formulas = layout.items.filter((item) => item.type === 'formula');
    expect(formulas.some((item) => item.x >= 980)).toBe(true);
    expect(formulas.some((item) => item.x + item.width <= 900)).toBe(true);
    const traces = layout.items.filter((item) => item.type === 'trace');
    const vertical = ({ points }) => points[0][0] === points[1][0];
    // Buses leave the column ends vertically and its sides horizontally.
    expect(traces.some(vertical)).toBe(true);
    expect(traces.some((trace) => !vertical(trace))).toBe(true);
  });

  it('fades doodles toward the cloud edge and reaches past every doodle', () => {
    const layout = layoutDoodles({ ...horizontal, seed: 'fade' });
    const reachOf = ({ x, y }) =>
      Math.hypot(
        (x - layout.center.x) / layout.radius.x,
        (y - layout.center.y) / layout.radius.y,
      );
    for (const item of layout.items) {
      expect(item.alpha).toBeGreaterThanOrEqual(0.3);
      expect(item.alpha).toBeLessThanOrEqual(1);
      if (item.type === 'pad')
        expect(reachOf(item)).toBeLessThan(layout.maxReach);
    }
  });

  it('stacks a seeded number of layers, each sweeping from its own random direction', () => {
    const counts = new Set();
    const headings = new Set();
    for (let cue = 0; cue < 40; cue += 1) {
      const { layers, items } = layoutDoodles({
        ...horizontal,
        seed: `cue-${cue}`,
      });
      counts.add(layers.length);
      expect(layers.length).toBeGreaterThanOrEqual(DOODLE_LAYER_RANGE[0]);
      expect(layers.length).toBeLessThanOrEqual(DOODLE_LAYER_RANGE[1]);
      expect(layers.length).toBeLessThanOrEqual(DOODLE_LAYER_LIMIT);
      const angles = layers
        .map(({ direction: [x, y] }) => Math.atan2(y, x))
        .sort((a, b) => a - b);
      for (const angle of angles)
        headings.add(Math.floor((angle + Math.PI) / (Math.PI / 2)));
      // Layers never share a sweep direction, wrapping around the circle.
      const gaps = angles.map((angle, index) =>
        index ? angle - angles[index - 1] : angle + Math.PI * 2 - angles.at(-1),
      );
      for (const gap of gaps) expect(gap).toBeGreaterThan(0.3);
      // Every doodle lands in a layer, and each bus stays in one layer.
      const groups = new Map();
      for (const item of items) {
        expect(layers.some((layer) => layer.index === item.layer)).toBe(true);
        if (!item.group) continue;
        if (groups.has(item.group))
          expect(item.layer).toBe(groups.get(item.group));
        groups.set(item.group, item.layer);
      }
    }
    expect(counts.size).toBeGreaterThan(1);
    // Directions cover every quadrant across cues, not just upward.
    expect(headings.size).toBe(4);
  });

  it('stacks formula sheets that each take their own front layer', () => {
    const { items, layers } = layoutDoodles({
      ...horizontal,
      seed: 'sheets',
      layerRange: [FORMULA_SHEETS, FORMULA_SHEETS],
    });
    const formulas = items.filter((item) => item.type === 'formula');
    const sheets = new Set(formulas.map((item) => item.sheet));
    expect(sheets.size).toBe(FORMULA_SHEETS);
    const back = layers.find((layer) => layer.effect === 'blur')?.index;
    const layerOf = new Map();
    for (const item of formulas) {
      if (item.layer === back) continue;
      if (layerOf.has(item.sheet))
        expect(item.layer).toBe(layerOf.get(item.sheet));
      layerOf.set(item.sheet, item.layer);
    }
    expect(new Set(layerOf.values()).size).toBe(
      Math.min(layerOf.size, layers.length - (back === undefined ? 0 : 1)),
    );
  });

  it('starts layers at different moments but ends them together', () => {
    const { layers } = layoutDoodles({
      ...horizontal,
      seed: 'starts',
      layerRange: [5, 5],
    });
    const starts = layers.map((layer) => layer.start);
    expect(Math.min(...starts)).toBe(0);
    expect(Math.max(...starts)).toBeLessThanOrEqual(DOODLE_LAYER_DELAY);
    expect(new Set(starts).size).toBe(layers.length);
    for (const layer of layers) {
      expect(layerBurn(layer, 0)).toEqual({ grow: 0, fade: 0 });
      expect(layerBurn(layer, layer.start)).toEqual({ grow: 0, fade: 0 });
      // It draws in fully, then dissolves the same way with no pause.
      const middle = layer.start + (1 - layer.start) / 2;
      expect(layerBurn(layer, middle).grow).toBeCloseTo(1, 6);
      expect(layerBurn(layer, middle).fade).toBeCloseTo(0, 6);
      expect(layerBurn(layer, 1)).toEqual({ grow: 1, fade: 1 });
    }
  });

  it('keeps every layer moving linearly from first doodle to last', () => {
    const { layers } = layoutDoodles({ ...horizontal, seed: 'motion' });
    for (const layer of layers) {
      const start = layerMotion(layer, 0);
      const middle = layerMotion(layer, 0.5);
      const end = layerMotion(layer, 1);
      expect(middle.scale).toBeCloseTo((start.scale + end.scale) / 2, 6);
      for (const axis of start.shift) expect(Math.abs(axis)).toBe(0);
      expect(layerMotion(layer, 2)).toEqual(end);
      // The layer travels along its own sweep.
      const [dx, dy] = layer.direction;
      expect(end.shift[0] * dy - end.shift[1] * dx).toBeCloseTo(0, 6);
    }
    expect(createDoodleCloudState().drift.value).toBe(0);
  });

  it('turns formulas and sketches with the writing direction', () => {
    const anglesOf = (layout) =>
      new Set(
        layout.items
          .filter((item) => item.type === 'formula' || item.type === 'sketch')
          .map((item) => item.angle),
      );
    expect(
      anglesOf(layoutDoodles({ ...horizontal, seed: 'directions' })),
    ).toEqual(new Set([0]));
    const column = layoutDoodles({
      writing: 'vertical',
      measureText,
      seed: 'directions',
      lines: [{ x: 900, y: 200, width: 80, height: 600 }],
    });
    expect(anglesOf(column)).toEqual(new Set([Math.PI / 2]));
  });

  it('scatters ring and chain structures with valid bonds', () => {
    const molecules = Array.from({ length: 10 }, (_, cue) =>
      layoutDoodles({ ...horizontal, seed: `chem-${cue}` }).items.filter(
        (item) => item.type === 'molecule',
      ),
    ).flat();
    expect(new Set(molecules.map((item) => item.kind))).toEqual(
      new Set(['ring', 'chain']),
    );
    for (const { kind, bonds, label } of molecules) {
      expect(bonds.every((order) => order === 1 || order === 2)).toBe(true);
      if (kind === 'ring') expect(bonds).toEqual([1, 2, 1, 2, 1, 2]);
      else expect(bonds.length).toBeGreaterThanOrEqual(3);
      if (label) expect(DOODLE_THEMES.science.groups).toContain(label);
    }
  });

  it('keeps every doodle within a margin of the lyric, however short', () => {
    for (const lines of [
      [{ x: 900, y: 500, width: 160, height: 90 }],
      horizontal.lines,
    ]) {
      for (let cue = 0; cue < 6; cue += 1) {
        const { bounds } = layoutDoodles({
          ...horizontal,
          lines,
          seed: `extent-${cue}`,
        });
        const margin =
          (90 / 1.28) * DOODLE_MARGIN_EMS * (1 + DOODLE_EDGE_WOBBLE) + 1;
        const left = Math.min(...lines.map((line) => line.x));
        const right = Math.max(...lines.map((line) => line.x + line.width));
        const top = Math.min(...lines.map((line) => line.y));
        const bottom = Math.max(...lines.map((line) => line.y + line.height));
        expect(bounds.left).toBeGreaterThanOrEqual(left - margin);
        expect(bounds.right).toBeLessThanOrEqual(right + margin);
        expect(bounds.top).toBeGreaterThanOrEqual(top - margin);
        expect(bounds.bottom).toBeLessThanOrEqual(bottom + margin);
      }
    }
  });

  it('draws no tower sketches', () => {
    for (const writing of ['horizontal', 'vertical']) {
      const { items } = layoutDoodles({
        ...horizontal,
        writing,
        seed: writing,
      });
      expect(items.some((item) => item.kind === 'tower')).toBe(false);
    }
  });

  it('offers a science theme and starts every burn front at zero', () => {
    expect(DOODLE_THEMES.science.formulas.length).toBeGreaterThan(10);
    expect(createDoodleCloudState().burn).toEqual({ progress: 0 });
  });
});
