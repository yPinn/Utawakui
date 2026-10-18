import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./UiSearchBox.vue', import.meta.url),
  'utf8',
);

describe('UiSearchBox clear action state tokens', () => {
  it('uses the shared content gap and reserves a separate clear hit target', () => {
    expect(source).toMatch(
      /\.ui-search-box__control\s*\{[^}]*gap:\s*var\(--ui-space-2\);/su,
    );
    expect(source).toContain(
      'var(--ui-search-clear-hit-size) + var(--ui-space-2)',
    );
    expect(source).toMatch(
      /\.ui-search-box__control--icon-cell\s*\{[^}]*gap:\s*var\(--ui-space-2\);/su,
    );
    expect(source).not.toContain('text-overflow: ellipsis');
  });

  it('limits transient paint to enabled controls and keeps shared tokens', () => {
    for (const state of ['hover', 'active', 'focus-visible']) {
      expect(source).toContain(`.ui-search-box__clear:${state}:not(:disabled)`);
    }
    expect(source).toContain('background: var(--ui-color-surface-hover);');
    expect(source).toContain('background: var(--ui-color-surface-active);');
    expect(source).toContain(
      'outline: var(--ui-focus-width) solid var(--ui-color-focus);',
    );
    expect(source).toContain('opacity: var(--ui-opacity-disabled);');
  });
});
