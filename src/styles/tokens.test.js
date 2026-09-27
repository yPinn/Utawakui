import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(dirname, 'tokens.css'), 'utf8');

function varsIn(block) {
  return [...block.matchAll(/(--ui-[\w-]+):/g)].map((m) => m[1]);
}

function declarationsIn(block) {
  return Object.fromEntries(
    [...block.matchAll(/(--ui-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name,
      value.trim(),
    ]),
  );
}

function resolveColor(name, definitions) {
  const value = definitions[name];
  const reference = value?.match(/^var\((--ui-[\w-]+)\)$/)?.[1];
  if (reference) return resolveColor(reference, definitions);
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  throw new Error(
    `Expected ${name} to resolve to a hex color, received ${value}`,
  );
}

function contrastRatio(foreground, background) {
  const luminance = (color) => {
    const channels = color
      .slice(1)
      .match(/.{2}/g)
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

// --color: dark is the first :root block; light is the
// [data-ui-theme='light'] block. Only --ui-color-* tokens (plus
// explicit theme-variant shadow tokens) are expected to differ between themes.
const darkBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
const lightBlock = css.match(
  /\[data-ui-theme='light'\][\s\S]*?\{([\s\S]*?)\n\}/,
)[1];

// Deliberately theme-invariant, see the comments in tokens.css:
// - overlay-scrim/overlay-contrast: floating controls over arbitrary
//   artwork/video, not app surfaces.
// - accent-contrast-muted: a color-mix() formula that recomputes from
//   accent/accent-contrast, both of which are redefined.
const EXEMPT = [
  '--ui-color-overlay-scrim',
  '--ui-color-overlay-contrast',
  '--ui-color-accent-contrast-muted',
];
const THEME_VARIANT_NON_COLOR = [
  '--ui-shadow-overlay',
  '--ui-right-dock-sticky-shadow',
];

describe('tokens.css theme parity', () => {
  it('light theme redefines exactly the theme-variant color tokens', () => {
    const expected = varsIn(darkBlock)
      .filter((name) => name.startsWith('--ui-color-'))
      .filter((name) => !EXEMPT.includes(name))
      .concat(THEME_VARIANT_NON_COLOR)
      .sort();

    expect(varsIn(lightBlock).sort()).toEqual(expected);
  });

  it('non-color tokens are declared once, only in the dark :root block', () => {
    const nonColorDark = varsIn(darkBlock).filter(
      (name) =>
        !name.startsWith('--ui-color-') &&
        !THEME_VARIANT_NON_COLOR.includes(name),
    );
    const nonColorLight = varsIn(lightBlock).filter(
      (name) =>
        !name.startsWith('--ui-color-') &&
        !THEME_VARIANT_NON_COLOR.includes(name),
    );

    expect(nonColorLight).toEqual([]);
    expect(nonColorDark.length).toBeGreaterThan(0);
  });

  it.each([
    ['dark', declarationsIn(darkBlock)],
    ['light', { ...declarationsIn(darkBlock), ...declarationsIn(lightBlock) }],
  ])(
    'keeps the active %s current-track title at WCAG AA on row surfaces',
    (_, definitions) => {
      for (const background of [
        '--ui-color-surface',
        '--ui-color-surface-hover',
        '--ui-color-surface-selected',
      ]) {
        expect(
          contrastRatio(
            resolveColor('--ui-color-current', definitions),
            resolveColor(background, definitions),
          ),
          `--ui-color-current on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
