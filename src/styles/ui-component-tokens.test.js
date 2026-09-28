import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const active = fs.readFileSync(path.join(dirname, 'tokens.css'), 'utf8');
const candidate = fs.readFileSync(path.join(dirname, 'tokens-v2.css'), 'utf8');

const fieldTokens = [
  '--ui-field-height',
  '--ui-field-padding-block',
  '--ui-field-padding-inline',
  '--ui-field-radius',
  '--ui-field-bg',
  '--ui-field-bg-hover',
  '--ui-field-fg',
  '--ui-field-placeholder',
  '--ui-field-border',
  '--ui-field-border-hover',
  '--ui-field-border-invalid',
  '--ui-checkbox-size',
  '--ui-range-track-size',
  '--ui-range-thumb-size',
  '--ui-progress-track-size',
];

function declarations(css) {
  return new Map(
    [...css.matchAll(/(--ui-[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name,
      value.trim(),
    ]),
  );
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(
      `${entry.name}${entry.isDirectory() ? '/' : ''}`,
      directory,
    );
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

const uiDirectory = new URL('../components/ui/', import.meta.url);
const componentFiles = fs
  .readdirSync(uiDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.vue'))
  .map((entry) => ({
    name: entry.name,
    source: fs.readFileSync(new URL(entry.name, uiDirectory), 'utf8'),
  }));

const metadataFeatureFiles = [
  '../components/layout/AppArchiveFrame.vue',
  '../components/playback/PlayerBarArtwork.vue',
  '../components/playlists/StudioLibraryContextInspector.vue',
].map((filename) => ({
  name: filename,
  source: fs.readFileSync(new URL(filename, import.meta.url), 'utf8'),
}));

const queueFeatureFiles = filesUnder(
  new URL('../components/queue/', import.meta.url),
)
  .filter((file) => file.pathname.endsWith('.vue'))
  .map((file) => ({
    name: file.pathname,
    source: fs.readFileSync(file, 'utf8'),
  }));

describe('shared UI component token contract', () => {
  it('maps both systems onto one fixed-density Right Dock token contract', () => {
    const activeValues = declarations(active);
    const candidateValues = declarations(candidate);

    expect(activeValues.get('--ui-panel-inset')).toBe('var(--ui-space-4)');
    expect(activeValues.get('--ui-right-dock-content-inset')).toBe(
      'var(--ui-space-2)',
    );
    expect(activeValues.get('--ui-right-dock-track-row-padding-inline')).toBe(
      'var(--ui-space-1)',
    );
    expect(
      activeValues.get('--ui-right-dock-track-row-state-surface-outset-inline'),
    ).toBe('var(--ui-space-1)');
    expect(activeValues.get('--ui-right-dock-track-row-min-height')).toBe(
      '3.25rem',
    );
    expect(activeValues.get('--ui-right-dock-track-artwork-size')).toBe(
      '2.5rem',
    );
    expect(activeValues.get('--ui-drag-indicator-width')).toBe('2px');

    expect(candidateValues.get('--ui-right-dock-width')).toBe('17.5rem');
    expect(candidateValues.get('--ui-right-dock-rail-width')).toBe('2.5rem');
    expect(candidateValues.get('--ui-right-dock-content-inset')).toBe(
      'var(--ui-space-2)',
    );
    expect(
      candidateValues.get('--ui-right-dock-track-row-padding-inline'),
    ).toBe('var(--ui-space-1)');
    expect(
      candidateValues.get(
        '--ui-right-dock-track-row-state-surface-outset-inline',
      ),
    ).toBe('var(--ui-space-1)');
    expect(candidateValues.get('--ui-right-dock-track-row-min-height')).toBe(
      '3.25rem',
    );
    expect(candidateValues.get('--ui-right-dock-track-artwork-size')).toBe(
      '2.5rem',
    );
    for (const name of [
      '--ui-right-dock-sticky-background',
      '--ui-right-dock-sticky-blur',
      '--ui-right-dock-sticky-shadow',
    ]) {
      expect(activeValues.has(name), `active ${name}`).toBe(true);
      expect(candidateValues.has(name), `candidate ${name}`).toBe(true);
    }
    expect(candidateValues.get('--ui-inspector-width')).toBe(
      'var(--ui-right-dock-width)',
    );
    expect(candidateValues.get('--ui-inspector-rail-width')).toBe(
      'var(--ui-right-dock-rail-width)',
    );
    expect(candidate).toMatch(
      /:root\[data-ui-system='v2'\]\[data-ui-density='compact'\]\s*\{[^}]*--ui-panel-inset:\s*0\.75rem;[^}]*\}/su,
    );
    const compactBlock = candidate.match(
      /:root\[data-ui-system='v2'\]\[data-ui-density='compact'\]\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    expect(compactBlock).not.toContain('--ui-right-dock-content-inset');
    expect(compactBlock).not.toContain('--ui-right-dock-track-row-min-height');
    expect(compactBlock).not.toContain('--ui-right-dock-track-artwork-size');
    expect(compactBlock).not.toContain(
      '--ui-right-dock-track-row-padding-inline',
    );
    expect(compactBlock).not.toContain(
      '--ui-right-dock-track-row-state-surface-outset-inline',
    );
  });

  it('uses Standard Track Row geometry in Queue and reserves 48px for PlayerBar artwork', () => {
    const activeValues = declarations(active);

    expect(activeValues.get('--ui-track-row-min-height')).toBe('3.25rem');
    expect(activeValues.get('--ui-track-row-thumb-size')).toBe('2.5rem');
    expect(activeValues.has('--ui-queue-track-thumb-size')).toBe(false);
    expect(activeValues.get('--ui-player-bar-artwork-size')).toBe('3rem');
  });

  it('centers the standard compact Sidebar row in a tighter rail and keeps PlayerBar artwork on the same axis', () => {
    const activeValues = declarations(active);
    const candidateValues = declarations(candidate);
    const candidateCompactBlock = candidate.match(
      /:root\[data-ui-system='v2'\]\[data-ui-density='compact'\]\s*\{([\s\S]*?)\n\}/u,
    )?.[1];

    expect(activeValues.get('--ui-shell-panel-inset-block')).toMatch(
      /^var\(\s*--ui-space-4\s*\)$/u,
    );
    expect(activeValues.get('--ui-shell-edge-inset-inline')).toMatch(
      /^var\(\s*--ui-space-2\s*\)$/u,
    );
    expect(activeValues.get('--ui-shell-leading-artwork-centerline')).toContain(
      'var(--ui-shell-edge-inset-inline) + var(--ui-space-6)',
    );
    expect(activeValues.get('--ui-playlist-sidebar-width-min')).toBe('4rem');
    expect(activeValues.get('--ui-playlist-sidebar-padding-inline')).toBe(
      'var(--ui-space-2)',
    );
    expect(
      activeValues.get('--ui-playlist-sidebar-padding-inline-compact'),
    ).toBe('0.375rem');
    expect(activeValues.get('--ui-sidebar-row-min-height')).toBe('3.25rem');
    expect(activeValues.get('--ui-sidebar-artwork-size')).toBe('2.5rem');
    expect(activeValues.get('--ui-playlist-row-compact-hit-size')).toBe(
      'var(--ui-sidebar-row-min-height)',
    );
    expect(activeValues.get('--ui-playlist-row-thumb-size')).toBe(
      'var(--ui-sidebar-artwork-size)',
    );
    expect(activeValues.get('--ui-playlist-row-artwork-centerline')).toContain(
      'var(--ui-shell-leading-artwork-centerline)',
    );
    expect(activeValues.get('--ui-player-bar-padding-inline-start')).toContain(
      'var(--ui-shell-leading-artwork-centerline) - 1.5rem',
    );
    expect(
      activeValues.get('--ui-player-bar-padding-inline-start'),
    ).not.toContain('--ui-playlist-row');
    expect(
      activeValues.get('--ui-playlist-row-state-surface-outset-inline'),
    ).toMatch(/^var\(\s*--ui-space-1\s*\)$/u);
    expect(candidateValues.get('--ui-sidebar-row-min-height')).toBe('3.25rem');
    expect(candidateValues.get('--ui-sidebar-artwork-size')).toBe(
      'var(--ui-track-artwork-size-standard)',
    );
    expect(
      candidateValues.get('--ui-playlist-row-state-surface-outset-inline'),
    ).toBe('var(--ui-space-1)');
    expect(candidateCompactBlock).not.toContain('--ui-sidebar-row-min-height');
    expect(candidateCompactBlock).not.toContain('--ui-sidebar-artwork-size');
    expect(candidateCompactBlock).not.toContain(
      '--ui-playlist-row-state-surface-outset-inline',
    );
    expect(activeValues.get('--ui-playlist-list-gap')).toBe(
      'var(--ui-space-1)',
    );
  });

  it.each([
    ['active', active],
    ['candidate', candidate],
  ])('%s system defines the complete field component layer', (_, css) => {
    const values = declarations(css);

    for (const name of fieldTokens) {
      expect(values.has(name), name).toBe(true);
      expect(values.get(name), name).toMatch(/^var\(--ui-[\w-]+\)$/);
    }
  });

  it('keeps component aliases mapped to declared semantic or primitive tokens', () => {
    for (const css of [active, candidate]) {
      const values = declarations(css);
      for (const name of fieldTokens) {
        const reference = values
          .get(name)
          ?.match(/^var\((--ui-[\w-]+)\)$/)?.[1];
        expect(values.has(reference), `${name} -> ${reference}`).toBe(true);
      }
    }
  });

  it.each([
    ['active', active],
    ['candidate', candidate],
  ])(
    '%s system bounds the color value field to seven hex characters',
    (_, css) => {
      const value = declarations(css).get('--ui-field-hex-value-inline-size');

      expect(value).toContain('7ch');
      expect(value).toContain('var(--ui-field-padding-inline)');
      expect(value).toContain('var(--ui-border-width)');
    },
  );

  it('keeps icon-button hit areas at or above the 2rem responsive floor', () => {
    const activeValues = declarations(active);
    const candidateValues = declarations(candidate);
    const consumerSources = filesUnder(new URL('../', import.meta.url))
      .filter((file) => file.pathname.endsWith('.vue'))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .filter((source) => source.includes('<UiIconButton'));

    expect(activeValues.has('--ui-icon-button-size-sm')).toBe(false);
    expect(candidateValues.has('--ui-icon-button-size-sm')).toBe(false);
    expect(activeValues.get('--ui-icon-button-size-md')).toBe(
      'var(--ui-space-6)',
    );
    expect(candidateValues.get('--ui-icon-button-size-md')).toBe(
      'var(--ui-control-height)',
    );
    expect(activeValues.get('--ui-icon-button-size-lg')).toBe('2.75rem');
    expect(candidateValues.get('--ui-icon-button-size-lg')).toBe(
      'var(--ui-control-height-live)',
    );
    for (const source of consumerSources) {
      expect(source).not.toMatch(/\bsize\s*=\s*(?:"sm"|'sm'|"'sm'"|'"sm"')/u);
    }
  });

  it.each([
    ['active', active],
    ['candidate', candidate],
  ])('%s assigns Tooltip to the caption typography role', (_, css) => {
    const values = declarations(css);

    expect(values.get('--ui-tooltip-font-size')).toBe('var(--ui-font-size-sm)');
    expect(values.get('--ui-tooltip-font-weight')).toBe(
      'var(--ui-font-weight-regular)',
    );
    expect(values.get('--ui-tooltip-line-height')).toBe(
      'var(--ui-line-height-caption)',
    );
    expect(values.get('--ui-tooltip-background')).toBeTruthy();
    expect(values.get('--ui-tooltip-text')).toBeTruthy();
    expect(values.get('--ui-tooltip-detail-text')).toBeTruthy();
    expect(values.get('--ui-tooltip-border')).toBeTruthy();
    expect(values.get('--ui-tooltip-shadow')).toBe('var(--ui-shadow-overlay)');
    expect(values.get('--ui-tooltip-background')).not.toBe(
      'var(--ui-color-text)',
    );
    expect(values.get('--ui-tooltip-text')).not.toBe('var(--ui-color-canvas)');
  });

  it('satisfies Metadata feature references through the effective candidate cascade', () => {
    const globalNames = new Set([
      ...declarations(active).keys(),
      ...declarations(candidate).keys(),
    ]);
    const missing = metadataFeatureFiles.flatMap(({ name, source }) =>
      [...source.matchAll(/var\((--ui-[\w-]+)\)/g)]
        .map((match) => match[1])
        .filter((token) => !globalNames.has(token))
        .map((token) => `${name}: ${token}`),
    );

    expect(missing).toEqual([]);
  });

  it.each([
    ['active', active],
    ['candidate', candidate],
  ])('%s tokens satisfy every Queue feature reference', (_, css) => {
    const globalNames = new Set(declarations(css).keys());
    const missing = queueFeatureFiles.flatMap(({ name, source }) => {
      const localNames = new Set(
        [...source.matchAll(/(--ui-[\w-]+)['"]?\s*:/g)].map(
          (match) => match[1],
        ),
      );
      return [...source.matchAll(/var\((--ui-[\w-]+)\)/g)]
        .map((match) => match[1])
        .filter((token) => !globalNames.has(token) && !localNames.has(token))
        .map((token) => `${name}: ${token}`);
    });

    expect(missing).toEqual([]);
  });

  it.each([
    ['active', active],
    ['candidate', candidate],
  ])(
    '%s tokens satisfy every required shared-component reference',
    (_, css) => {
      const globalNames = new Set(declarations(css).keys());
      const missing = componentFiles.flatMap(({ name, source }) => {
        const localNames = new Set(
          [...source.matchAll(/(--ui-[\w-]+)['"]?\s*:/g)].map(
            (match) => match[1],
          ),
        );
        return [...source.matchAll(/var\((--ui-[\w-]+)\)/g)]
          .map((match) => match[1])
          .filter((token) => !globalNames.has(token) && !localNames.has(token))
          .map((token) => `${name}: ${token}`);
      });
      expect(missing).toEqual([]);
    },
  );

  it('keeps authored component CSS scalable with only one-pixel utility exceptions', () => {
    const violations = componentFiles.flatMap(({ name, source }) => {
      const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
        .map((match) => match[1])
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      return [...styles.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)px\b/g)]
        .filter((match) => Number(match[1]) !== 1)
        .map((match) => `${name}: ${match[0]}`);
    });

    expect(violations).toEqual([]);
  });

  it('gives every continuously animated component OS and manual reduced-motion paths', () => {
    for (const name of [
      'UiButton.vue',
      'UiDisclosure.vue',
      'UiMarqueeText.vue',
      'UiNotificationHost.vue',
      'UiRadioGroup.vue',
      'UiSkeleton.vue',
      'UiStatusIcon.vue',
      'UiSwitch.vue',
    ]) {
      const source = componentFiles.find((file) => file.name === name)?.source;
      expect(source, name).toContain('prefers-reduced-motion: reduce');
      expect(source, name).toContain("data-ui-motion='reduced'");
    }
  });

  it('derives context-menu geometry from the shared row-height token', () => {
    const source = componentFiles.find(
      (file) => file.name === 'UiContextMenu.vue',
    )?.source;
    expect(source).toContain("customLengthPixels('--ui-menu-item-height', 2)");
    expect(source).not.toContain('ROW_HEIGHT_REM');
  });
});
