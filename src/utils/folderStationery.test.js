import { describe, expect, it } from 'vitest';
import { createSeededRandom, folderStationeryFor } from './folderStationery.js';

const userKeys = (type, count) =>
  Array.from(
    { length: count },
    (_, index) =>
      `${type}:00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  );

describe('createSeededRandom', () => {
  it('repeats per key and differs between keys', () => {
    const first = createSeededRandom('note:a');
    const again = createSeededRandom('note:a');
    const other = createSeededRandom('note:b');
    const sequence = [first(), first(), first()];

    expect([again(), again(), again()]).toEqual(sequence);
    expect(other()).not.toBe(sequence[0]);
    for (const value of sequence) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('folderStationeryFor', () => {
  it('always clips the derived data card, inside the clip ranges', () => {
    const clip = folderStationeryFor({
      key: 'derived:artist-summary',
      type: 'note',
      source: 'derived',
    });
    const x = Number.parseFloat(
      clip.stationeryStyle['--ui-folder-stationery-clip-x'],
    );
    const angle = Number.parseFloat(
      clip.stationeryStyle['--ui-folder-stationery-clip-angle'],
    );

    expect(clip.stationery).toBe('clip');
    expect(x).toBeGreaterThanOrEqual(38);
    expect(x).toBeLessThanOrEqual(64);
    expect(Math.abs(angle)).toBeLessThanOrEqual(8);
    expect(clip.stationeryStyle['--ui-folder-stationery-clip-color']).toMatch(
      /^var\(--ui-folder-stationery-clip-(silver|brass)\)$/u,
    );
  });

  it('decorates about one in three user objects, stably per key', () => {
    const items = [
      ...userKeys('photo', 150).map((key) => ({
        key,
        type: 'photo',
        source: 'user',
      })),
      ...userKeys('note', 150).map((key) => ({
        key,
        type: 'note',
        source: 'user',
      })),
    ];
    const results = items.map(folderStationeryFor);
    const decorated = results.filter((result) => result.stationery !== 'none');

    expect(items.map(folderStationeryFor)).toEqual(results);
    expect(decorated.length / items.length).toBeGreaterThan(0.25);
    expect(decorated.length / items.length).toBeLessThan(0.42);
    results.forEach((result, index) => {
      if (result.stationery === 'none') return;
      expect(result.stationery).toBe(
        items[index].type === 'photo' ? 'tape' : 'torn',
      );
    });
  });

  it('varies tape strips within their ranges and pairs some over the corners', () => {
    const tapes = userKeys('photo', 300)
      .map((key) => folderStationeryFor({ key, type: 'photo', source: 'user' }))
      .filter((result) => result.stationery === 'tape');
    const pairs = tapes.filter((tape) => tape.stationeryStrips.length === 2);

    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.length).toBeLessThan(tapes.length);
    for (const strip of tapes.flatMap((tape) => tape.stationeryStrips)) {
      const length = Number.parseFloat(strip.length);
      expect(length).toBeGreaterThanOrEqual(3.5);
      expect(length).toBeLessThanOrEqual(5.25);
      expect(Math.abs(Number.parseFloat(strip.angle))).toBeLessThanOrEqual(42);
      expect(strip.tint).toMatch(
        /^var\(--ui-folder-stationery-tape-(paper|canary|rose|periwinkle)\)$/u,
      );
      expect(strip.edge).toMatch(/^polygon\(/u);
    }
  });

  it('generates an irregular torn edge on the bottom or the top', () => {
    const torn = userKeys('note', 300)
      .map((key) => folderStationeryFor({ key, type: 'note', source: 'user' }))
      .filter((result) => result.stationery === 'torn');
    const sides = new Set(torn.map((result) => result.stationerySide));
    const edges = new Set(
      torn.map(
        (result) => result.stationeryStyle['--ui-folder-stationery-edge'],
      ),
    );

    expect(sides).toEqual(new Set(['top', 'bottom']));
    expect(edges.size).toBe(torn.length);
    for (const result of torn) {
      const edge = result.stationeryStyle['--ui-folder-stationery-edge'];
      expect(edge).toMatch(
        result.stationerySide === 'top'
          ? /^polygon\(.*100% 100%, 0 100%\)$/u
          : /^polygon\(0 0, 100% 0, /u,
      );
    }
  });
});
