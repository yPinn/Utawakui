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

describe('shared UI component token contract', () => {
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
