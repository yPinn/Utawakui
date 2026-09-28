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
const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
const visualSystemView = readFileSync(
  new URL('../views/VisualSystemView.vue', import.meta.url),
  'utf8',
);
const designGuide = readFileSync(
  new URL('../../DESIGN.md', import.meta.url),
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
  .filter((file) => !/\.(?:test|spec)\.[^.]+$/.test(file.pathname))
  .filter((file) => !file.pathname.endsWith('/styles/tokens-v2.css'))
  .filter(
    (file) => !file.pathname.endsWith('/views/StudioLibraryPrototypeView.vue'),
  )
  .filter((file) => !file.pathname.endsWith('/views/DemoView.vue'))
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
    expect(app).toContain(
      'const internalWorkbenchesEnabled = import.meta.env.DEV',
    );
    expect(app).toContain("import('./views/VisualSystemView.vue')");
    expect(visualSystemView).toContain(
      "import StudioLibraryPrototypeView from './StudioLibraryPrototypeView.vue';",
    );
    expect(visualSystemView).toContain(
      "import DemoView from './DemoView.vue';",
    );
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

    expect(uniqueNames.size).toBe(283);
    expect(uniqueNames).toContain('--ui-field-bg-readonly');
    expect(uniqueNames).toContain('--ui-field-bg-on-raised');
    expect(uniqueNames).toContain('--ui-kbd-min-block-size');
    expect(uniqueNames).toContain('--ui-skeleton-text-block-size');
    expect(uniqueNames).toContain('--ui-skeleton-pulse-duration');
    expect(uniqueNames).toContain('--ui-radio-size');
    expect(uniqueNames).toContain('--ui-tooltip-max-inline-size');
    expect(uniqueNames).toContain('--ui-tooltip-font-size');
    expect(uniqueNames).toContain('--ui-tooltip-font-weight');
    expect(uniqueNames).toContain('--ui-tooltip-line-height');
    expect(uniqueNames).toContain('--ui-tooltip-background');
    expect(uniqueNames).toContain('--ui-tooltip-text');
    expect(uniqueNames).toContain('--ui-tooltip-detail-text');
    expect(uniqueNames).toContain('--ui-tooltip-border');
    expect(uniqueNames).toContain('--ui-right-dock-track-row-min-height');
    expect(uniqueNames).toContain('--ui-right-dock-track-artwork-size');
    expect(uniqueNames).toContain('--ui-tooltip-shadow');
    expect(uniqueNames).toContain('--ui-popover-max-inline-size');
    expect(uniqueNames).toContain('--ui-notification-preferred-inline-size');
    expect(uniqueNames).toContain('--ui-notification-block-end-offset');
    expect(uniqueNames).toContain('--ui-notification-motion-offset');
    expect(uniqueNames).toContain('--ui-notification-swipe-dismiss-distance');
    expect(uniqueNames).toContain('--ui-field-bg-hover-on-raised');
    expect(uniqueNames).toContain('--ui-field-bg-readonly-on-raised');
    expect(uniqueNames).toContain('--ui-field-hex-value-inline-size');
    expect(uniqueNames).toContain('--ui-inspector-width');
    expect(uniqueNames).toContain('--ui-right-dock-width');
    expect(uniqueNames).toContain('--ui-right-dock-rail-width');
    expect(uniqueNames).toContain('--ui-right-dock-content-inset');
    expect(uniqueNames).toContain('--ui-right-dock-track-row-padding-inline');
    expect(uniqueNames).toContain(
      '--ui-right-dock-track-row-state-surface-outset-inline',
    );
    expect(uniqueNames).toContain('--ui-track-row-state-surface-outset-inline');
    expect(uniqueNames).toContain('--ui-shell-edge-inset-inline');
    expect(uniqueNames).toContain('--ui-shell-leading-artwork-centerline');
    expect(uniqueNames).toContain('--ui-sidebar-artwork-size');
    expect(uniqueNames).toContain(
      '--ui-playlist-row-state-surface-outset-inline',
    );
    expect(uniqueNames).toContain('--ui-color-overlay-scrim-hover');
    expect(uniqueNames).toContain('--ui-color-overlay-scrim-active');
    expect(uniqueNames).toContain('--ui-inspector-rail-width');
    expect(uniqueNames).toContain('--ui-opacity-dragging');
    for (const size of ['small', 'medium', 'large']) {
      expect(uniqueNames).toContain(`--ui-modal-inline-size-${size}`);
      expect(uniqueNames).toContain(`--ui-modal-max-block-size-${size}`);
    }
    expect(uniqueNames).toContain('--ui-modal-viewport-inset');
    expect(uniqueNames).toContain('--ui-modal-content-inset');
    expect(uniqueNames).toContain('--ui-modal-section-gap');
    expect(uniqueNames).toContain('--ui-modal-footer-inset-block');
    expect(uniqueNames).toContain('--ui-modal-width-default');
    expect(uniqueNames).toContain('--ui-modal-width-notice');
    expect(uniqueNames).toContain('--ui-modal-width-wide');
    for (const role of ['dense', 'standard', 'prominent', 'preview']) {
      expect(uniqueNames).toContain(`--ui-track-artwork-size-${role}`);
    }
    expect(missing).toEqual([]);
  });

  it('keeps current in the accent family without collapsing live and danger semantics', () => {
    const dark = tokenBlock(":root[data-ui-system='v2']");
    const light = tokenBlock(
      ":root[data-ui-system='v2'][data-ui-theme='light']",
    );

    expect(dark['--ui-color-current']).toBe('var(--ui-palette-indigo-300)');
    expect(dark['--ui-color-current-soft']).toBe('var(--ui-color-accent-soft)');
    expect(dark['--ui-color-live']).toBe('var(--ui-palette-red-400)');
    expect(dark['--ui-color-danger']).toBe('var(--ui-palette-red-400)');
    expect(light['--ui-color-live']).toBe('var(--ui-palette-red-700)');
    expect(light['--ui-color-danger']).toBe('var(--ui-palette-red-700)');
    expect(light['--ui-color-current']).toBe('var(--ui-color-accent)');
    expect(tokens).not.toContain('--ui-color-current: var(--ui-color-live);');
  });

  it('documents scalable, optical, window, and raster unit responsibilities separately', () => {
    for (const responsibility of [
      /\|\s*Scalable product geometry\s*\|\s*`rem`\s*\|/u,
      /\|\s*Exact optical boundaries\s*\|\s*`px`\s*\|/u,
      /\|\s*Flexible layout tracks\s*\|\s*`%`, `fr`, `minmax\(\)`\s*\|/u,
      /\|\s*Readable text measure\s*\|\s*`ch`／`ic`\s*\|/u,
      /\|\s*Line height\s*\|\s*Unitless\s*\|/u,
      /\|\s*Electron window geometry\s*\|\s*DIP number\s*\|/u,
      /\|\s*Raster source／canvas backing\s*\|\s*Physical pixel calculation\s*\|/u,
    ]) {
      expect(designGuide).toMatch(responsibility);
    }

    expect(designGuide).toMatch(
      /CSS image slots\s+use `rem` or flexible layout units/u,
    );
    expect(designGuide).toContain('CSS responsive thresholds use `rem`');
    expect(designGuide).not.toContain(
      'image pixel slots, media-query breakpoints',
    );
  });

  it('keeps candidate px tokens limited to exact optical boundaries', () => {
    const pxTokens = [
      ...tokens.matchAll(/(--ui-[\w-]+):\s*([^;]*\d(?:\.\d+)?px\b[^;]*);/g),
    ]
      .map(([, name]) => name)
      .sort();

    expect(pxTokens).toEqual(
      [
        '--ui-border-width',
        '--ui-drag-indicator-width',
        '--ui-focus-offset',
        '--ui-focus-offset-inset',
        '--ui-focus-width',
        '--ui-row-active-shadow',
        '--ui-switch-thumb-inset',
      ].sort(),
    );
  });

  it('expresses radius and control targets as rem contracts in the design guide', () => {
    expect(designGuide).toMatch(
      /rounded:[\s\S]*?xs: '0\.125rem'[\s\S]*?sm: '0\.25rem'[\s\S]*?md: '0\.375rem'[\s\S]*?lg: '0\.5rem'[\s\S]*?pill: '999rem'/u,
    );
    expect(designGuide).toContain('| Routine icon button');
    expect(designGuide).toContain('`2rem`–`2.25rem` (32–36 CSS px)');
    expect(designGuide).toContain('| Live icon button');
    expect(designGuide).toContain('`2.75rem` (44 CSS px)');
    expect(designGuide).toContain('`4.25rem` (68 CSS px)');
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

  it('keeps the folder perimeter restrained because the interior owns the material color', () => {
    expect(tokens).toContain('--ui-folder-perimeter: 0.25rem;');
  });

  it('keeps the desktop Inspector bay aligned with the current draggable maximum', () => {
    const candidate = tokenBlock(":root[data-ui-system='v2']");

    expect(candidate['--ui-right-dock-width']).toBe('17.5rem');
    expect(candidate['--ui-inspector-width']).toBe(
      'var(--ui-right-dock-width)',
    );
  });

  it('keeps the shared 16px shell panel inset owned by the production token layer', () => {
    expect(app).toMatch(
      /\.shell__sidebar\s*\{[^}]*padding-block:\s*var\(--ui-shell-panel-inset-block\);[^}]*\}/su,
    );
    expect(tokens).not.toContain('--ui-shell-sidebar-inset-block');
    expect(tokens).not.toContain('--ui-shell-panel-inset-block');
    expect(designGuide).toContain('same `1rem` block inset as Sidebar');
  });

  it('offers a dossier-only embed without leaking candidate tokens into Vue', () => {
    expect(script).toContain("params.get('embed') === 'dossier'");
    expect(script).toContain("body.classList.add('is-dossier-embed'");
    expect(css).toMatch(
      /body\.is-dossier-embed \.titlebar[\s\S]*?body\.is-dossier-embed \.player-bar[\s\S]*?display:\s*none;/u,
    );
    expect(css).toMatch(
      /body\.is-dossier-embed \.app-shell\s*\{[^}]*grid-template-areas:\s*'workspace'/su,
    );
    expect(main).not.toContain('tokens-v2.css');
  });

  it('synchronizes the embedded theme and forwards only app-owned shortcuts', () => {
    expect(script).toContain("type !== 'utawakui-prototype-theme'");
    expect(script).toContain("type: 'utawakui-app-shortcut'");
    expect(script).toContain('event.source !== window.parent');
    expect(script).toContain('event.origin !== window.location.origin');
    expect(script).toContain('/^f[1-9]$/u');
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
      ['--ui-color-current', '--ui-color-surface'],
      ['--ui-color-current', '--ui-color-surface-hover'],
      ['--ui-color-current', '--ui-color-surface-selected'],
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
