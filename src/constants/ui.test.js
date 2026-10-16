import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARTWORK_SIZE } from './ui.js';

const tokens = readFileSync(
  new URL('../styles/tokens.css', import.meta.url),
  'utf8',
);

function artworkRamp() {
  return Object.fromEntries(
    [...tokens.matchAll(/--ui-artwork-size-([a-z0-9]+):\s*([\d.]+)rem;/gu)].map(
      ([, step, rem]) => [step, Number(rem) * 16],
    ),
  );
}

describe('artwork size ramp', () => {
  it('mirrors every CSS ramp step in pixels for component size props', () => {
    expect(artworkRamp()).toEqual({ ...ARTWORK_SIZE });
  });

  it('grows strictly from the dense row thumbnail to the hero preview', () => {
    const sizes = Object.values(ARTWORK_SIZE);

    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it('routes role artwork tokens through the ramp instead of raw lengths', () => {
    const roleDeclarations = [
      ...tokens.matchAll(/(--ui-[a-z-]*artwork-size[a-z-]*):\s*([^;]+);/gu),
    ].filter(([, name]) => !name.startsWith('--ui-artwork-size-'));

    expect(roleDeclarations.length).toBeGreaterThan(0);
    for (const [, name, value] of roleDeclarations) {
      expect(value, name).toMatch(/^var\(--ui-/u);
    }
  });
});
