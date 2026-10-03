import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const tokens = fs.readFileSync(path.join(dirname, 'tokens.css'), 'utf8');

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
    [...css.matchAll(/(--ui-[\w-]+):\s*([^;]+);/gu)].map(([, name, value]) => [
      name,
      value.trim(),
    ]),
  );
}

function normalizedValue(value) {
  return value
    ?.replace(/\s+/gu, ' ')
    .replace(/\(\s+/gu, '(')
    .replace(/\s+\)/gu, ')');
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
const componentFiles = filesUnder(uiDirectory)
  .filter((file) => file.pathname.endsWith('.vue'))
  .map((file) => ({
    name: file.pathname,
    source: fs.readFileSync(file, 'utf8'),
  }));

describe('shared UI component token contract', () => {
  it('derives both side panels from one shared content rhythm', () => {
    const values = declarations(tokens);

    expect(values.get('--ui-side-panel-content-inset')).toBe(
      'var(--ui-space-2)',
    );
    expect(values.get('--ui-side-panel-section-gap')).toBe('var(--ui-space-4)');
    expect(values.get('--ui-side-panel-content-gap')).toBe('var(--ui-space-2)');
    expect(values.get('--ui-side-panel-list-gap')).toBe('var(--ui-space-1)');
    expect(values.has('--ui-side-panel-scroll-content-inset-inline-end')).toBe(
      false,
    );
    expect(values.get('--ui-playlist-sidebar-padding-inline')).toBe(
      'var(--ui-side-panel-content-inset)',
    );
    expect(values.get('--ui-right-dock-content-inset')).toBe(
      'var(--ui-side-panel-content-inset)',
    );
    expect(
      normalizedValue(
        values.get('--ui-right-dock-track-row-state-surface-outset-inline'),
      ),
    ).toBe('var(--ui-side-panel-row-state-surface-outset-inline)');
  });

  it('keeps shell, Sidebar, Right Dock, and Player geometry on explicit roles', () => {
    const values = declarations(tokens);

    expect(values.get('--ui-right-dock-width')).toBe('17.5rem');
    expect(values.get('--ui-right-dock-rail-width')).toBe('2.5rem');
    expect(values.get('--ui-right-dock-track-row-min-height')).toBe('3.25rem');
    expect(values.get('--ui-right-dock-track-artwork-size')).toBe('2.5rem');
    expect(values.get('--ui-sidebar-row-min-height')).toBe('3.25rem');
    expect(values.get('--ui-sidebar-artwork-size')).toBe(
      'var(--ui-track-artwork-size-standard)',
    );
    expect(values.get('--ui-player-leading-padding-inline')).toContain(
      'var(--ui-shell-leading-artwork-centerline) - 1.5rem',
    );
    expect(values.get('--ui-inspector-width')).toBe(
      'var(--ui-right-dock-width)',
    );
    expect(values.get('--ui-inspector-rail-width')).toBe(
      'var(--ui-right-dock-rail-width)',
    );
  });

  it('defines a complete field component layer with valid aliases', () => {
    const values = declarations(tokens);

    for (const name of fieldTokens) {
      const value = values.get(name);
      const reference = value?.match(/^var\((--ui-[\w-]+)\)$/u)?.[1];

      expect(value, name).toMatch(/^var\(--ui-[\w-]+\)$/u);
      expect(values.has(reference), `${name} -> ${reference}`).toBe(true);
    }
    expect(values.get('--ui-field-hex-value-inline-size')).toContain('7ch');
  });

  it('keeps icon-button and Tooltip contracts on shared semantic roles', () => {
    const values = declarations(tokens);

    expect(values.has('--ui-icon-button-size-sm')).toBe(false);
    expect(values.get('--ui-icon-button-size-md')).toBe(
      'var(--ui-control-height)',
    );
    expect(values.get('--ui-icon-button-size-lg')).toBe(
      'var(--ui-control-height-live)',
    );
    expect(values.get('--ui-tooltip-font-size')).toBe('var(--ui-font-size-sm)');
    expect(values.get('--ui-tooltip-font-weight')).toBe(
      'var(--ui-font-weight-regular)',
    );
    expect(values.get('--ui-tooltip-line-height')).toBe(
      'var(--ui-line-height-caption)',
    );
    expect(values.get('--ui-tooltip-shadow')).toBe('var(--ui-shadow-overlay)');
  });

  it('satisfies every shared-component reference from the adopted token graph', () => {
    const globalNames = new Set(declarations(tokens).keys());
    const missing = componentFiles.flatMap(({ name, source }) => {
      const localNames = new Set(
        [...source.matchAll(/(--ui-[\w-]+)['"]?\s*:/gu)].map(
          (match) => match[1],
        ),
      );
      return [...source.matchAll(/var\((--ui-[\w-]+)\)/gu)]
        .map((match) => match[1])
        .filter((token) => !globalNames.has(token) && !localNames.has(token))
        .map((token) => `${name}: ${token}`);
    });

    expect(missing).toEqual([]);
  });

  it('keeps authored component CSS scalable with only one-pixel utility exceptions', () => {
    const violations = componentFiles.flatMap(({ name, source }) => {
      const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gu)]
        .map((match) => match[1])
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//gu, '');

      return [...styles.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)px\b/gu)]
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
      const source = componentFiles.find((file) =>
        file.name.endsWith(`/${name}`),
      )?.source;
      expect(source, name).toContain('prefers-reduced-motion: reduce');
      expect(source, name).toContain("data-ui-motion='reduced'");
    }
  });

  it('derives context-menu geometry from the shared row-height token', () => {
    const source = componentFiles.find((file) =>
      file.name.endsWith('/UiContextMenu.vue'),
    )?.source;

    expect(source).toContain("customLengthPixels('--ui-menu-item-height', 2)");
    expect(source).not.toContain('ROW_HEIGHT_REM');
  });
});
