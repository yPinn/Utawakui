import { readFileSync } from 'node:fs';
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
const prototypeCapture = readFileSync(
  new URL(
    '../../prototypes/studio-library-workspace/capture-app/index.js',
    import.meta.url,
  ),
  'utf8',
);
const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const performerMain = readFileSync(
  new URL('../entries/prompter/main.js', import.meta.url),
  'utf8',
);
const rootIndex = readFileSync(
  new URL('../../index.html', import.meta.url),
  'utf8',
);
const performerView = readFileSync(
  new URL('../../src/entries/prompter/index.html', import.meta.url),
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
const rootTokenSelector = "[data-ui-system='v2'][data-ui-surface-root='true']";
const lightTokenSelector = `:root[data-ui-theme='light'] ${rootTokenSelector}`;
const chromeTokenSelector = "[data-ui-system='v2'] [data-ui-region='chrome']";

function tokenBlock(selector) {
  const selectorPattern = selector
    .trim()
    .split(/\s+/u)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('\\s+');
  const body =
    tokens.match(
      new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\n\\}`, 'u'),
    )?.[1] ?? '';
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name,
      value.trim(),
    ]),
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

function mixColors(primary, secondary, primaryWeight) {
  const primaryChannels = primary
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16));
  const secondaryChannels = secondary
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16));

  return `#${primaryChannels
    .map((channel, index) =>
      Math.round(
        channel * primaryWeight +
          secondaryChannels[index] * (1 - primaryWeight),
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

describe('Studio Library workspace prototype isolation', () => {
  it('registers the prototype with the single production token entry', () => {
    expect(html).toContain('data-ui-system="v2"');
    expect(html).toContain('href="../../src/styles/tokens.css"');
    expect(main).toContain("import './styles/tokens.css';");
    expect(performerMain).toContain("import '../../styles/tokens.css';");
    expect(main).not.toContain('token-v1-invalidation');
    expect(performerMain).not.toContain('token-v1-invalidation');
    expect(rootIndex).not.toContain('styles/tokens.css');
    expect(performerView).not.toContain('styles/tokens.css');
    expect(app).toContain(
      'const internalWorkbenchesEnabled = import.meta.env.DEV',
    );
    expect(app).toContain("import('./views/VisualSystemView.vue')");
    expect(visualSystemView).toContain(
      "import DemoView from './DemoView.vue';",
    );
    expect(visualSystemView).not.toContain('StudioLibraryPrototypeView');
    expect(visualSystemView).not.toContain('UiTabs');
    expect(visualSystemView).toContain(
      "registeredSurfaceAttributes('visual-review')",
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

  it('keeps the Ink-framed Paper palette explicit and prototype-only', () => {
    expect(script).toContain("params.get('palette') === 'ink-paper'");
    expect(script).toContain("root.dataset.prototypePalette = 'ink-paper'");
    expect(script).toContain('delete root.dataset.prototypePalette');
    expect(css).toContain(
      ":root[data-ui-theme='light'][data-prototype-palette='ink-paper']",
    );
    expect(css).toMatch(
      /data-prototype-palette='ink-paper'[\s\S]*?--ui-color-canvas:\s*var\(--ui-palette-warm-neutral-300\);/u,
    );
    expect(css).toMatch(
      /data-prototype-palette='ink-paper'[\s\S]*?--ui-color-folder-primary:\s*var\(--ui-palette-indigo-600\);/u,
    );
    expect(css).toMatch(
      /data-prototype-palette='ink-paper'[\s\S]*?:is\(\.titlebar, \.sidebar, \.player-bar\)[\s\S]*?--ui-color-surface:\s*var\(--ui-palette-neutral-900\);/u,
    );
    expect(css).toMatch(
      /:is\(\.titlebar, \.sidebar, \.player-bar\)\s*\{[^}]*color:\s*var\(--ui-color-text\);/su,
    );
    expect(prototypeCapture).toContain(
      "name: 'review/studio-library-ink-paper-1440x810.png'",
    );
    expect(prototypeCapture).toContain("palette: 'ink-paper'");
    expect(prototypeCapture).toContain(
      "url.searchParams.set('palette', variant.palette)",
    );
    expect(prototypeCapture).toContain('app.disableHardwareAcceleration();');
  });

  it('records the narrow reflow and both reduced-motion paths', () => {
    expect(css).toContain('@media (max-width: 60rem)');
    expect(css).toContain(":root[data-ui-motion='reduced']");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/\.metadata-rail\s*\{[^}]*border-left:/s);
  });

  it('keeps Ink-framed Paper regional and gives every Folder one paper interior', () => {
    for (const token of [
      '--ui-color-chrome-surface',
      '--ui-color-chrome-surface-raised',
      '--ui-color-chrome-surface-hover',
      '--ui-color-chrome-surface-active',
      '--ui-color-chrome-surface-selected',
      '--ui-color-chrome-text',
      '--ui-color-chrome-text-muted',
      '--ui-color-chrome-border',
      '--ui-color-shell-substrate',
      '--ui-color-control-boundary',
      '--ui-color-folder-neutral',
      '--ui-color-folder-primary-foreground',
      '--ui-color-folder-secondary-foreground',
      '--ui-color-folder-tertiary-foreground',
      '--ui-color-folder-neutral-foreground',
      '--ui-folder-sheet-background',
      '--ui-folder-sheet-frame-block-end-gap',
      '--ui-folder-sheet-binding-gutter',
      '--ui-folder-sheet-hole-size',
      '--ui-folder-sheet-hole-edge-inset',
      '--ui-folder-sheet-hole-rail-block-size',
      '--ui-folder-sheet-binding-field-max-block-size',
      '--ui-folder-sheet-scrollbar-gap',
      '--ui-folder-sheet-min-block-size',
      '--ui-folder-sheet-max-inline-size',
      '--ui-folder-extension-block-inset',
    ]) {
      expect(tokens).toContain(`${token}:`);
    }

    expect(tokens).not.toContain('--ui-folder-sheet-hole-rail-offset:');

    expect(tokens).toMatch(
      /:root\[data-ui-theme='light'\][\s\S]*?--ui-color-chrome-surface:\s*var\(--ui-palette-neutral-900\);/u,
    );
    expect(tokens).not.toContain('--ui-folder-interior-background');
    expect(tokens).toMatch(
      /:root\[data-ui-theme='light'\][\s\S]*?--ui-folder-sheet-background:\s*var\(--ui-color-paper\);/u,
    );
    expect(tokens).toContain(
      '--ui-folder-page-background: var(--ui-color-surface);',
    );
    expect(tokens).not.toMatch(
      /--ui-color-(?:canvas|surface|accent):\s*var\(--ui-color-folder/u,
    );
  });

  it('adopts the approved warm-paper light hierarchy without using Folder color globally', () => {
    const light = tokenBlock(lightTokenSelector);

    expect(light['--ui-color-canvas']).toBe(
      'var(--ui-palette-warm-neutral-300)',
    );
    expect(light['--ui-color-shell-substrate']).toBe(
      'var(--ui-palette-neutral-950)',
    );
    expect(light['--ui-color-surface-hover']).toBe(
      'var(--ui-palette-warm-neutral-300)',
    );
    expect(light['--ui-color-surface-selected']).toBe(
      'var(--ui-palette-indigo-100)',
    );
    expect(light['--ui-color-border']).toBe(
      'var(--ui-palette-warm-neutral-400)',
    );
    expect(light['--ui-color-folder-primary']).toBe(
      'var(--ui-palette-indigo-600)',
    );
    expect(light['--ui-color-folder-secondary']).toBe(
      'var(--ui-palette-plum-300)',
    );
    expect(light['--ui-color-folder-tertiary']).toBe(
      'var(--ui-palette-olive-300)',
    );
    expect(light['--ui-color-folder-neutral']).toBe(
      'var(--ui-palette-neutral-300)',
    );
    expect(light['--ui-color-folder-primary-foreground']).toBe(
      'var(--ui-palette-warm-neutral-100)',
    );
    for (const role of ['secondary', 'tertiary', 'neutral']) {
      expect(light[`--ui-color-folder-${role}-foreground`]).toBe(
        'var(--ui-palette-neutral-900)',
      );
    }
  });

  it('keeps the adopted token graph complete and intentionally bounded', () => {
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

    expect(uniqueNames.size).toBe(556);
    expect(uniqueNames).toContain('--ui-shell-workspace-min-inline-size');
    expect(uniqueNames).toContain('--ui-shell-layout-recovery-inline-size');
    expect(uniqueNames).toContain('--ui-shell-dock-inline-size');
    expect(uniqueNames).toContain('--ui-notification-swipe-intent-distance');
    expect(uniqueNames).toContain('--ui-scrollbar-visual-reserve');
    expect(uniqueNames).toContain('--ui-action-menu-max-block-size');
    expect(uniqueNames).toContain('--ui-textarea-font-size');
    expect(uniqueNames).toContain('--ui-textarea-font-weight');
    expect(uniqueNames).toContain('--ui-textarea-line-height');
    expect(uniqueNames).toContain('--ui-folder-content-background');
    expect(uniqueNames).toContain('--ui-folder-content-state-min-block-size');
    expect(uniqueNames).toContain('--ui-folder-artifact-folder-min-height');
    expect(uniqueNames).toContain('--ui-folder-artifact-pinned-region-inset');
    expect(uniqueNames).toContain('--ui-right-dock-section-surface-background');
    expect(uniqueNames).toContain('--ui-right-dock-section-surface-padding');
    expect(uniqueNames).toContain('--ui-right-dock-section-surface-radius');
    for (const name of [
      '--ui-bgm-player-min-inline-size',
      '--ui-bgm-player-inline-size',
      '--ui-bgm-player-max-inline-size',
      '--ui-bgm-player-max-block-size',
      '--ui-bgm-player-artwork-size',
      '--ui-bgm-player-volume-inline-size',
      '--ui-bgm-player-time-inline-size',
      '--ui-search-clear-hit-size',
    ]) {
      expect(uniqueNames).toContain(name);
    }
    expect(uniqueNames).toContain('--ui-control-track-size-md');
    expect(uniqueNames).toContain('--ui-resize-handle-hit-size');
    expect(uniqueNames).toContain('--ui-side-panel-content-inset');
    expect(uniqueNames).toContain('--ui-side-panel-section-gap');
    expect(uniqueNames).toContain('--ui-side-panel-content-gap');
    expect(uniqueNames).toContain('--ui-side-panel-list-gap');
    expect(uniqueNames).toContain('--ui-track-list-gap');
    expect(uniqueNames).toContain('--ui-field-background-readonly');
    expect(uniqueNames).toContain('--ui-field-background-on-raised');
    expect(uniqueNames).toContain('--ui-kbd-min-block-size');
    expect(uniqueNames).toContain('--ui-skeleton-text-block-size');
    expect(uniqueNames).toContain('--ui-skeleton-pulse-duration');
    expect(uniqueNames).toContain('--ui-radio-size');
    for (const token of [
      '--ui-range-track',
      '--ui-range-fill',
      '--ui-range-fill-hover',
      '--ui-range-fill-active',
      '--ui-range-thumb',
      '--ui-range-thumb-border',
      '--ui-range-focus',
      '--ui-range-invalid',
      '--ui-range-stop',
      '--ui-range-value',
    ]) {
      expect(uniqueNames).toContain(token);
    }
    expect(uniqueNames).toContain('--ui-folder-tab-min-inline-size');
    expect(uniqueNames).toContain('--ui-folder-tab-min-inline-size-narrow');
    expect(uniqueNames).toContain('--ui-folder-artifact-canvas-min-height');
    expect(uniqueNames).toContain('--ui-folder-artifact-safe-inset');
    expect(tokens).toMatch(
      /--ui-folder-artifact-safe-inset:\s*calc\(\s*var\(--ui-focus-safe-inset\)\s*\+\s*var\(--ui-border-width\)\s*\);/u,
    );
    expect(uniqueNames).toContain('--ui-folder-artifact-note-opacity');
    expect(uniqueNames).not.toContain(
      '--ui-folder-artifact-note-background-translucent',
    );
    for (const paper of [
      'periwinkle',
      'rose',
      'canary',
      'kraft',
      'ruled',
      'rule',
    ]) {
      expect(uniqueNames).toContain(`--ui-folder-artifact-paper-${paper}`);
    }
    expect(tokens).toMatch(
      /--ui-folder-artifact-stack-block-size:\s*calc\(\s*var\(--ui-folder-artifact-stack-width\)\s*\/\s*4\s*\*\s*3\s*\+\s*var\(--ui-space-5\)\s*\);/u,
    );
    expect(uniqueNames).not.toContain('--ui-folder-artifact-note-blur');
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
    expect(uniqueNames).toContain('--ui-field-background-hover-on-raised');
    expect(uniqueNames).toContain('--ui-field-background-readonly-on-raised');
    expect(uniqueNames).toContain('--ui-field-hex-value-inline-size');
    expect(uniqueNames).not.toContain('--ui-inspector-width');
    expect(uniqueNames).toContain('--ui-right-dock-width');
    expect(uniqueNames).toContain('--ui-right-dock-rail-width');
    expect(uniqueNames).toContain('--ui-right-dock-content-inset');
    expect(uniqueNames).toContain('--ui-right-dock-track-row-padding-inline');
    expect(uniqueNames).toContain(
      '--ui-right-dock-track-row-state-surface-outset-inline',
    );
    expect(uniqueNames).toContain('--ui-track-row-state-surface-outset-inline');
    expect(uniqueNames).toContain('--ui-shell-edge-inset-inline');
    expect(uniqueNames).toContain('--ui-shell-workspace-inline-start');
    expect(uniqueNames).toContain('--ui-shell-leading-artwork-centerline');
    expect(uniqueNames).toContain('--ui-sidebar-artwork-size');
    expect(uniqueNames).toContain(
      '--ui-playlist-row-state-surface-outset-inline',
    );
    expect(uniqueNames).toContain('--ui-color-overlay-scrim-hover');
    expect(uniqueNames).toContain('--ui-color-overlay-scrim-active');
    expect(uniqueNames).not.toContain('--ui-inspector-rail-width');
    expect(uniqueNames).toContain('--ui-opacity-dragging');
    expect(uniqueNames).toContain('--ui-scrollbar-lane-size');
    expect(uniqueNames).toContain('--ui-scrollbar-thumb-inset');
    expect(uniqueNames).toContain('--ui-scrollbar-thumb-min-length');
    expect(uniqueNames).toContain('--ui-scrollbar-edge-inset');
    expect(uniqueNames).toContain('--ui-scrollbar-thumb');
    expect(uniqueNames).toContain('--ui-scrollbar-thumb-hover');
    expect(uniqueNames).toContain('--ui-scrollbar-thumb-active');
    expect(uniqueNames).toContain('--ui-scrollbar-track');
    expect(uniqueNames).toContain('--ui-scrollbar-radius');
    for (const size of ['small', 'medium', 'large']) {
      expect(uniqueNames).toContain(`--ui-modal-inline-size-${size}`);
      expect(uniqueNames).toContain(`--ui-modal-max-block-size-${size}`);
    }
    expect(uniqueNames).toContain('--ui-modal-viewport-inset');
    expect(uniqueNames).toContain('--ui-modal-content-inset');
    expect(uniqueNames).toContain('--ui-modal-section-gap');
    expect(uniqueNames).toContain('--ui-modal-footer-inset-block');
    expect(uniqueNames).toContain('--ui-modal-media-max-inline-size');
    expect(uniqueNames).toContain('--ui-modal-media-max-block-size');
    expect(tokens).toContain(
      '--ui-media-max-inline-size: var(--ui-modal-media-max-inline-size);',
    );
    expect(tokens).toContain(
      '--ui-media-max-block-size: var(--ui-modal-media-max-block-size);',
    );
    expect(uniqueNames).not.toContain('--ui-photo-frame-max-inline-size');
    expect(tokens).not.toContain('--ui-folder-artifact-photo-frame:');
    expect(tokens).toContain('--ui-photo-frame-padding: var(--ui-space-2);');
    expect(tokens).toContain(
      '--ui-photo-frame-shadow: var(--ui-folder-artifact-shadow);',
    );
    expect(uniqueNames).not.toContain('--ui-modal-width-default');
    expect(uniqueNames).not.toContain('--ui-modal-width-notice');
    expect(uniqueNames).not.toContain('--ui-modal-width-wide');
    for (const role of ['dense', 'standard', 'prominent', 'preview']) {
      expect(uniqueNames).toContain(`--ui-track-artwork-size-${role}`);
    }
    expect(missing).toEqual([]);
  });

  it('keeps current in the accent family without collapsing live and danger semantics', () => {
    const dark = tokenBlock(rootTokenSelector);
    const light = tokenBlock(lightTokenSelector);

    expect(dark['--ui-color-current']).toBe('var(--ui-palette-indigo-300)');
    expect(dark['--ui-color-current-soft']).toBe('var(--ui-color-accent-soft)');
    expect(dark['--ui-color-live']).toBe('var(--ui-palette-red-400)');
    expect(dark['--ui-color-danger']).toBe('var(--ui-palette-red-400)');
    expect(dark['--ui-color-danger-contrast']).toBe(
      'var(--ui-palette-neutral-950)',
    );
    expect(light['--ui-color-live']).toBe('var(--ui-palette-red-700)');
    expect(light['--ui-color-danger']).toBe('var(--ui-palette-red-700)');
    expect(light['--ui-color-danger-contrast']).toBe(
      'var(--ui-palette-warm-neutral-50)',
    );
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
        '--ui-border-width-strong',
        '--ui-focus-offset',
        '--ui-focus-offset-inset',
        '--ui-focus-width',
        '--ui-folder-tab-label-optical-offset',
        '--ui-switch-thumb-inset',
      ].sort(),
    );
  });

  it('owns one quiet selected surface for every track row consumer', () => {
    expect(tokens).toMatch(
      /--ui-track-row-selected-background:\s*color-mix\(\s*in srgb,\s*var\(--ui-color-text\) 8%,\s*transparent\s*\);/su,
    );
    expect(tokens).not.toContain('--ui-row-active-shadow');
    expect(tokens).not.toContain('--ui-track-row-active-shadow');
  });

  it('expresses radius and control targets as rem contracts in the design guide', () => {
    expect(designGuide).toMatch(
      /rounded:[\s\S]*?xs: '0\.125rem'[\s\S]*?sm: '0\.25rem'[\s\S]*?md: '0\.375rem'[\s\S]*?lg: '0\.5rem'[\s\S]*?pill: '999rem'/u,
    );
    expect(designGuide).toContain('| Routine icon button');
    expect(designGuide).toContain('`2rem`–`2.25rem` (32–36 CSS px)');
    expect(designGuide).toContain('| Live icon button');
    expect(designGuide).toContain('`2.75rem` (44 CSS px)');
    expect(designGuide).toContain('`4.75rem` (76 CSS px)');
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

  it('keeps enough folder material around the inset document to read as a folder', () => {
    expect(tokens).toContain('--ui-folder-perimeter: var(--ui-space-4);');
    expect(tokens).toContain('--ui-folder-tab-cover-size: var(--ui-space-2);');
  });

  it('keeps the desktop Right Dock bay at the current draggable maximum', () => {
    const candidate = tokenBlock(rootTokenSelector);

    expect(candidate['--ui-right-dock-width']).toBe('17.5rem');
    expect(candidate['--ui-inspector-width']).toBeUndefined();
  });

  it('keeps one 8px perimeter around every shell surface', () => {
    expect(tokens).toContain(
      '--ui-shell-content-inset-block: var(--ui-shell-edge-inset-inline);',
    );
    expect(tokens).toContain(
      '--ui-shell-edge-inset-inline: var(--ui-space-2);',
    );
    expect(tokens).toContain('--ui-shell-gutter: var(--ui-space-3);');
    expect(tokens).toContain(
      '--ui-shell-workspace-inline-start: var(--ui-shell-gutter);',
    );
    expect(tokens).not.toContain('--ui-panel-inset');
    expect(app).toMatch(
      /\.shell__sidebar\s*\{[^}]*padding-block:\s*var\(--ui-shell-content-inset-block\);[^}]*\}/su,
    );
    expect(app).toMatch(
      /\.shell__workspace\s*\{[^}]*padding-top:\s*var\(--ui-shell-content-inset-block\);[^}]*\}/su,
    );
    expect(app).toMatch(
      /\.shell__main\s*\{[^}]*padding-left:\s*var\(--ui-shell-workspace-inline-start\);[^}]*padding-right:\s*var\(--ui-shell-edge-inset-inline\);[^}]*\}/su,
    );
    expect(app).toMatch(
      /\.shell__main--with-dock\s*\{[^}]*gap:\s*var\(--ui-shell-gutter\);[^}]*\}/su,
    );
    expect(tokens).not.toContain('--ui-shell-sidebar-inset-block');
    expect(tokens).not.toContain('--ui-shell-panel-inset-block');
    expect(designGuide).toContain('one `0.5rem` outer inset on all four sides');
  });

  it('offers a dossier-only embed while Vue activates the scoped entries', () => {
    expect(script).toContain("params.get('embed') === 'dossier'");
    expect(script).toContain("body.classList.add('is-dossier-embed'");
    expect(css).toMatch(
      /body\.is-dossier-embed \.titlebar[\s\S]*?body\.is-dossier-embed \.player-bar[\s\S]*?display:\s*none;/u,
    );
    expect(css).toMatch(
      /body\.is-dossier-embed \.app-shell\s*\{[^}]*grid-template-areas:\s*'workspace'/su,
    );
    expect(main).toContain('tokens.css');
  });

  it('synchronizes the embedded theme and forwards only app-owned shortcuts', () => {
    expect(script).toContain("type !== 'utawakui-prototype-theme'");
    expect(script).toContain("type: 'utawakui-app-shortcut'");
    expect(script).toContain('event.source !== window.parent');
    expect(script).toContain('event.origin !== window.location.origin');
    expect(script).toContain('/^f[1-9]$/u');
  });

  it.each([
    ['dark', rootTokenSelector],
    ['light', lightTokenSelector],
  ])('keeps essential %s semantic text pairs at WCAG AA', (_, selector) => {
    const definitions = {
      ...tokenBlock(rootTokenSelector),
      ...(selector.includes("data-ui-theme='light'")
        ? tokenBlock(selector)
        : {}),
    };
    const pairs = [
      ['--ui-color-text', '--ui-color-canvas'],
      ['--ui-color-text', '--ui-color-surface'],
      ['--ui-color-text', '--ui-color-surface-raised'],
      ['--ui-color-text', '--ui-color-surface-selected'],
      ['--ui-segmented-selected-foreground', '--ui-color-surface-selected'],
      ['--ui-color-text-muted', '--ui-color-canvas'],
      ['--ui-color-text-muted', '--ui-color-surface'],
      ['--ui-color-text-muted', '--ui-color-surface-selected'],
      ['--ui-color-current', '--ui-color-surface'],
      ['--ui-color-current', '--ui-color-surface-hover'],
      ['--ui-color-current', '--ui-color-surface-selected'],
      ['--ui-color-accent-contrast', '--ui-color-accent'],
      ['--ui-color-danger-contrast', '--ui-color-danger'],
      ['--ui-color-paper-text', '--ui-color-paper'],
    ];
    for (const role of ['primary', 'secondary', 'tertiary', 'neutral']) {
      pairs.push([
        `--ui-color-folder-${role}-foreground`,
        `--ui-color-folder-${role}`,
      ]);
    }
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

  it.each([
    ['dark', {}],
    ['light', tokenBlock(lightTokenSelector)],
    [
      'receipt',
      {
        ...tokenBlock(lightTokenSelector),
        ...tokenBlock("[data-ui-system='v2'] [data-ui-region='receipt']"),
      },
    ],
    ['chrome', tokenBlock(chromeTokenSelector)],
    [
      'light chrome',
      { ...tokenBlock(lightTokenSelector), ...tokenBlock(chromeTokenSelector) },
    ],
  ])(
    'keeps %s choice boundaries visible on control and option surfaces',
    (_, overrides) => {
      const definitions = { ...tokenBlock(rootTokenSelector), ...overrides };
      for (const background of [
        '--ui-color-surface',
        '--ui-color-surface-raised',
        '--ui-color-surface-hover',
        '--ui-color-surface-selected',
      ]) {
        expect(
          contrastRatio(
            resolveColor('--ui-segmented-selected-foreground', definitions),
            resolveColor('--ui-color-surface-selected', definitions),
          ),
          'segmented selection text',
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(
            resolveColor('--ui-segmented-selected-indicator', definitions),
            resolveColor(background, definitions),
          ),
          `segmented selection on ${background}`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrastRatio(
            resolveColor('--ui-color-control-boundary', definitions),
            resolveColor(background, definitions),
          ),
          background,
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it('keeps Chrome navigation entries distinct from their container and glyph', () => {
    const definitions = {
      ...tokenBlock(rootTokenSelector),
      ...tokenBlock(chromeTokenSelector),
    };

    expect(
      contrastRatio(
        resolveColor('--ui-color-entry', definitions),
        resolveColor('--ui-color-surface', definitions),
      ),
      'navigation-entry plate on Chrome surface',
    ).toBeGreaterThanOrEqual(3);

    expect(
      contrastRatio(
        resolveColor('--ui-color-entry-foreground', definitions),
        resolveColor('--ui-color-entry', definitions),
      ),
      'navigation-entry glyph and active indicator on plate',
    ).toBeGreaterThanOrEqual(3);

    expect(
      contrastRatio(
        resolveColor('--ui-color-entry-selected-indicator', definitions),
        resolveColor('--ui-color-entry', definitions),
      ),
      'navigation-entry selected indicator on plate',
    ).toBeGreaterThanOrEqual(3);
  });

  it('keeps Chrome commands visibly bounded through every painted state', () => {
    const definitions = {
      ...tokenBlock(rootTokenSelector),
      ...tokenBlock(chromeTokenSelector),
    };

    expect(
      contrastRatio(
        resolveColor('--ui-color-command-border', definitions),
        resolveColor('--ui-color-surface', definitions),
      ),
      'Chrome command boundary on Chrome surface',
    ).toBeGreaterThanOrEqual(3);

    for (const surface of [
      '--ui-color-command-surface',
      '--ui-color-command-surface-hover',
      '--ui-color-command-surface-active',
    ]) {
      expect(
        contrastRatio(
          resolveColor('--ui-color-command-foreground', definitions),
          resolveColor(surface, definitions),
        ),
        `Chrome command glyph on ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it.each([
    ['dark', rootTokenSelector],
    ['light', lightTokenSelector],
  ])('keeps %s destructive button fills at WCAG AA', (_, selector) => {
    const definitions = {
      ...tokenBlock(rootTokenSelector),
      ...(selector.includes("data-ui-theme='light'")
        ? tokenBlock(selector)
        : {}),
    };
    const fill = resolveColor('--ui-color-danger', definitions);
    const foreground = resolveColor('--ui-color-danger-contrast', definitions);

    expect(definitions['--ui-button-danger-fill']).toBe(
      'var(--ui-color-danger)',
    );
    expect(tokens).toContain('var(--ui-color-danger) 94%');
    expect(tokens).toContain('var(--ui-color-danger) 88%');
    for (const weight of [1, 0.94, 0.88]) {
      expect(
        contrastRatio(foreground, mixColors(fill, foreground, weight)),
        `danger fill at ${weight * 100}%`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ['dark', rootTokenSelector],
    ['light', lightTokenSelector],
  ])(
    'keeps the default %s scrollbar thumb distinguishable from app surfaces',
    (_, selector) => {
      const definitions = {
        ...tokenBlock(rootTokenSelector),
        ...(selector.includes("data-ui-theme='light'")
          ? tokenBlock(selector)
          : {}),
      };

      expect(definitions['--ui-scrollbar-thumb']).toBe(
        'var(--ui-color-text-subtle)',
      );
      for (const background of [
        '--ui-color-surface',
        '--ui-color-surface-raised',
      ]) {
        expect(
          contrastRatio(
            resolveColor('--ui-scrollbar-thumb', definitions),
            resolveColor(background, definitions),
          ),
          `--ui-scrollbar-thumb on ${background}`,
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );
});
