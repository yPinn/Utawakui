import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const menuSource = fs.readFileSync(
  new URL('./UiContextMenu.vue', import.meta.url),
  'utf8',
);
const trackMenuSource = fs.readFileSync(
  new URL('../track/TrackActionMenu.vue', import.meta.url),
  'utf8',
);
const searchBoxSource = fs.readFileSync(
  new URL('./UiSearchBox.vue', import.meta.url),
  'utf8',
);

describe('UiContextMenu appearance contract', () => {
  it('builds nested menu geometry from the shared spacing and radius scale', () => {
    expect(menuSource).toContain('const SUBMENU_GAP_REM = 0.5;');
    expect(menuSource).toContain(
      "customLengthPixels('--ui-space-2', SUBMENU_GAP_REM)",
    );
    expect(menuSource).toMatch(
      /\.ui-context-menu\s*\{[^}]*background:\s*var\(--ui-floating-list-bg\);[^}]*border:\s*var\(--ui-border-width\) solid var\(--ui-floating-list-border\);[^}]*border-radius:\s*var\(--ui-floating-list-radius\);[^}]*box-shadow:\s*var\(--ui-floating-list-shadow\);/s,
    );
    expect(menuSource).toMatch(
      /\.ui-context-menu\s+:deep\(\.ui-context-menu__viewport\)\s*\{[^}]*padding:\s*var\(--ui-floating-list-padding\);/s,
    );
    expect(menuSource).toMatch(
      /\.ui-context-menu__item\s*\{[^}]*min-height:\s*var\(--ui-floating-row-min-height\);[^}]*padding:\s*var\(--ui-floating-row-padding-block\)\s+var\(--ui-floating-row-padding-inline\);[^}]*border-radius:\s*var\(--ui-floating-row-radius\);/s,
    );
  });

  it('separates persistent, hover, pressed, focus, and danger states', () => {
    expect(menuSource).toMatch(
      /\.ui-context-menu__item:active:not\(:disabled\)\s*\{[^}]*background:\s*var\(--ui-color-surface-active\);/s,
    );
    expect(menuSource).toMatch(
      /\.ui-context-menu__item:focus-visible\s*\{[^}]*background:\s*var\(--ui-color-surface-active\);[^}]*outline:\s*var\(--ui-focus-width\) solid var\(--ui-color-focus\);[^}]*outline-offset:\s*var\(--ui-focus-offset-inset\);/s,
    );
    expect(menuSource).toMatch(
      /\.ui-context-menu__item--danger:hover:not\(:disabled\),\s*\.ui-context-menu__item--danger:active:not\(:disabled\),\s*\.ui-context-menu__item--danger:focus-visible\s*\{[^}]*background:\s*var\(--ui-color-danger-soft\);/s,
    );
    expect(menuSource).not.toMatch(
      /\.ui-context-menu__item--active[^}]*\.ui-context-menu__item:focus-visible/s,
    );
  });

  it('keeps shared search focus geometry owned by UiSearchBox', () => {
    expect(trackMenuSource).toMatch(
      /\.track-action-menu__search\s*\{[^}]*margin-block-end:\s*var\(--ui-space-2\);/s,
    );
    expect(searchBoxSource).toMatch(
      /\.ui-search-box__control:focus-within\s*\{[^}]*outline:\s*var\(--ui-focus-width\) solid var\(--ui-color-focus\);[^}]*outline-offset:\s*var\(--ui-focus-offset\);/s,
    );
    expect(trackMenuSource).not.toContain(
      '.track-action-menu__search :deep(.ui-search-box__control:focus-within)',
    );
  });
});
