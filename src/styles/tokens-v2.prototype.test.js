import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(
  new URL(
    '../../prototypes/studio-library-workspace/index.html',
    import.meta.url,
  ),
  'utf8',
);
const css = readFileSync(
  new URL(
    '../../prototypes/studio-library-workspace/prototype.css',
    import.meta.url,
  ),
  'utf8',
);
const script = readFileSync(
  new URL(
    '../../prototypes/studio-library-workspace/prototype.js',
    import.meta.url,
  ),
  'utf8',
);
const tokens = readFileSync(
  new URL('./tokens-v2.css', import.meta.url),
  'utf8',
);
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const performerMain = readFileSync(
  new URL('../performer-main.js', import.meta.url),
  'utf8',
);
const rootIndex = readFileSync(
  new URL('../../index.html', import.meta.url),
  'utf8',
);
const performerView = readFileSync(
  new URL('../../performer-view.html', import.meta.url),
  'utf8',
);

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(
      `${entry.name}${entry.isDirectory() ? '/' : ''}`,
      directory,
    );
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

const candidateProductionReferences = filesUnder(
  new URL('../', import.meta.url),
)
  .filter((file) => /\.(?:css|html|js|vue)$/.test(file.pathname))
  .filter((file) => !file.pathname.endsWith('/styles/tokens-v2.css'))
  .filter(
    (file) => !file.pathname.endsWith('/styles/tokens-v2.prototype.test.js'),
  )
  .filter(
    (file) => !file.pathname.endsWith('/styles/ui-component-tokens.test.js'),
  )
  .filter((file) => readFileSync(file, 'utf8').includes('tokens-v2.css'))
  .map((file) => file.pathname);

function tokenBlock(selector) {
  const start = tokens.indexOf(`${selector} {`);
  const bodyStart = tokens.indexOf('{', start) + 1;
  const bodyEnd = tokens.indexOf('\n}', bodyStart);
  return Object.fromEntries(
    [
      ...tokens.slice(bodyStart, bodyEnd).matchAll(/(--[\w-]+):\s*([^;]+);/g),
    ].map(([, name, value]) => [name, value.trim()]),
  );
}

function resolveColor(name, definitions) {
  const value = definitions[name];
  const reference = value?.match(/^var\((--[\w-]+)\)$/)?.[1];
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

describe('Studio Library workspace prototype isolation', () => {
  it('opts into the candidate system without changing production entries', () => {
    expect(html).toContain('data-ui-system="v2"');
    expect(html).toContain('href="../../src/styles/tokens-v2.css"');
    expect(html).not.toContain('href="../../src/styles/tokens.css"');
    expect(main).not.toContain('tokens-v2.css');
    expect(performerMain).not.toContain('tokens-v2.css');
    expect(rootIndex).not.toContain('tokens-v2.css');
    expect(performerView).not.toContain('tokens-v2.css');
    expect(candidateProductionReferences).toEqual([]);
  });

  it('covers the approved theme, density, motion, and state matrix', () => {
    for (const value of ['dark', 'light', 'standard', 'compact', 'reduced']) {
      expect(html).toContain(`value="${value}"`);
    }
    for (const value of [
      'populated',
      'loading',
      'empty',
      'search-empty',
      'warning',
      'error',
    ]) {
      expect(html).toContain(`value="${value}"`);
    }
    expect(script).toContain("params.get('clean') === '1'");
  });

  it('records the narrow reflow and both reduced-motion paths', () => {
    expect(css).toContain('@media (max-width: 60rem)');
    expect(css).toContain(":root[data-ui-motion='reduced']");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/\.metadata-rail\s*\{[^}]*border-left:/s);
  });

  it('keeps the candidate token graph complete and intentionally bounded', () => {
    const names = [...tokens.matchAll(/(--ui-[\w-]+):/g)].map(
      ([, name]) => name,
    );
    const references = [...tokens.matchAll(/var\((--ui-[\w-]+)\)/g)].map(
      ([, name]) => name,
    );
    const uniqueNames = new Set(names);
    const missing = [...new Set(references)].filter(
      (reference) => !uniqueNames.has(reference),
    );

    expect(uniqueNames.size).toBe(212);
    expect(missing).toEqual([]);
  });

  it('keeps the Spotify-informed shell anchors and dossier anatomy', () => {
    expect(html).toContain('class="sidebar"');
    expect(html).toContain('class="folder-tabs"');
    expect(html).toContain('class="dossier"');
    expect(html).toContain('class="metadata-rail"');
    expect(html).toContain('class="note-module"');
    expect(html).toContain('class="player-bar"');
    expect(html).toContain('popover class="track-menu"');
    expect(html).toContain('<dialog class="details-dialog"');
  });

  it.each([
    ['dark', ":root[data-ui-system='v2']"],
    ['light', ":root[data-ui-system='v2'][data-ui-theme='light']"],
  ])('keeps essential %s semantic text pairs at WCAG AA', (_, selector) => {
    const definitions = {
      ...tokenBlock(":root[data-ui-system='v2']"),
      ...(selector.includes("data-ui-theme='light'")
        ? tokenBlock(selector)
        : {}),
    };
    const pairs = [
      ['--ui-color-text', '--ui-color-canvas'],
      ['--ui-color-text', '--ui-color-surface'],
      ['--ui-color-text', '--ui-color-surface-raised'],
      ['--ui-color-text', '--ui-color-surface-selected'],
      ['--ui-color-text-muted', '--ui-color-canvas'],
      ['--ui-color-text-muted', '--ui-color-surface'],
      ['--ui-color-text-muted', '--ui-color-surface-selected'],
      ['--ui-color-accent-contrast', '--ui-color-accent'],
      ['--ui-color-paper-text', '--ui-color-paper'],
    ];
    for (const status of [
      '--ui-color-neutral',
      '--ui-color-info',
      '--ui-color-success',
      '--ui-color-warning',
      '--ui-color-live',
      '--ui-color-danger',
    ]) {
      pairs.push(
        [status, '--ui-color-surface-raised'],
        [status, '--ui-color-surface-selected'],
      );
    }

    for (const [foreground, background] of pairs) {
      expect(
        contrastRatio(
          resolveColor(foreground, definitions),
          resolveColor(background, definitions),
        ),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
