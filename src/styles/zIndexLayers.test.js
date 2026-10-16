import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));

// Shell chrome and teleported overlays are the only global layer owners.
const GLOBAL_LAYER_OWNERS = new Set([
  'App.vue',
  'components/output/ObsLookSelect.vue',
  'components/playback/PlayerBar.vue',
  'components/playback/PlayerBarPanel.vue',
  'components/ui/UiCombobox.vue',
  'components/ui/UiActionMenu.vue',
  'components/ui/UiModal.vue',
  'components/ui/UiNotificationHost.vue',
  'components/ui/UiPopover.vue',
  'components/ui/tooltip/UiTooltipSurface.vue',
]);

function styleFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return styleFiles(full);
    return /\.(vue|css)$/u.test(entry.name) ? [full] : [];
  });
}

const sources = styleFiles(srcRoot).map((file) => ({
  file: relative(srcRoot, file).replaceAll('\\', '/'),
  source: readFileSync(file, 'utf8'),
}));

function zIndexValues(source) {
  return [...source.matchAll(/z-index:\s*([^;]+);/gu)].map((match) =>
    match[1].trim(),
  );
}

describe('z-index layer contract', () => {
  it('declares every z-index through a layer token', () => {
    const literals = sources.flatMap(({ file, source }) =>
      zIndexValues(source)
        .filter((value) => /^-?\d+$/u.test(value))
        .map((value) => `${file}: ${value}`),
    );

    expect(literals).toEqual([]);
  });

  it('keeps global --ui-z-* layers to shell chrome and teleported overlays', () => {
    const offenders = sources
      .filter(({ file, source }) =>
        zIndexValues(source).some(
          (value) =>
            value.includes('--ui-z-') && !GLOBAL_LAYER_OWNERS.has(file),
        ),
      )
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('keeps local layers ordered and global layers spaced apart', () => {
    const tokens = readFileSync(join(srcRoot, 'styles/tokens.css'), 'utf8');
    const value = (name) =>
      Number(tokens.match(new RegExp(`${name}:\\s*(-?\\d+);`, 'u'))[1]);
    const local = [
      'behind',
      'base',
      'raised',
      'overlay',
      'indicator',
      'focus',
    ].map((name) => value(`--ui-layer-${name}`));
    const global = [
      'sticky',
      'floating',
      'popover',
      'dialog',
      'toast',
      'tooltip',
    ].map((name) => value(`--ui-z-${name}`));

    expect(local).toEqual([...local].sort((a, b) => a - b));
    expect(Math.max(...local)).toBeLessThan(global[0]);
    global.slice(1).forEach((layer, index) => {
      expect(layer - global[index]).toBeGreaterThanOrEqual(5);
    });
  });
});
