import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const menuSource = fs.readFileSync(
  new URL('./UiActionMenu.vue', import.meta.url),
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
const scrollRegionSource = fs.readFileSync(
  new URL('./UiScrollRegion.vue', import.meta.url),
  'utf8',
);

describe('UiActionMenu appearance contract', () => {
  it('bounds accessory text so a long disabled reason cannot displace the label or chevron', () => {
    expect(menuSource).toContain("hasTrailing ? 'fit-content(50%)' : ''");
    expect(menuSource).toMatch(
      /\.ui-action-menu__trailing\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/s,
    );
  });
  it('shares combobox row and accessory gaps in pinned and scrolling lists', () => {
    for (const selector of [
      '.ui-action-menu__pinned',
      '.ui-action-menu :deep(.ui-action-menu__viewport)',
    ]) {
      const rule = menuSource
        .slice(menuSource.indexOf(`${selector} {`))
        .split('}')[0];
      expect(rule).toContain('display: flex;');
      expect(rule).toContain('flex-direction: column;');
      expect(rule).toContain('gap: var(--ui-space-1);');
    }
    expect(menuSource).toMatch(
      /\.ui-action-menu__item\s*\{[^}]*column-gap:\s*var\(--ui-space-2\);/s,
    );
    expect(menuSource).toMatch(
      /:deep\(\.ui-action-menu__viewport\) > \.ui-action-menu__separator\s*\{[^}]*margin-block:\s*0;/s,
    );
    expect(menuSource).toMatch(
      /\.ui-action-menu__label\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
  });
  it('builds nested menu geometry from semantic floating recipes', () => {
    expect(menuSource).toContain('const FLOATING_GAP_REM = 0.5;');
    expect(menuSource).toContain(
      "customLengthPixels('--ui-floating-gap', FLOATING_GAP_REM)",
    );
    expect(menuSource).toContain(
      "customLengthPixels('--ui-action-menu-max-block-size', MAX_MENU_HEIGHT_REM)",
    );
    expect(menuSource).toContain(
      "customLengthPixels('--ui-floating-list-padding', 0.5) * 2",
    );
    expect(menuSource).toMatch(
      /\.ui-action-menu\s*\{[^}]*max-block-size:\s*min\(\s*var\(--ui-action-menu-max-block-size\),[^}]*background:\s*var\(--ui-floating-list-bg\);[^}]*border:\s*var\(--ui-border-width\) solid var\(--ui-floating-list-border\);[^}]*border-radius:\s*var\(--ui-floating-list-radius\);[^}]*box-shadow:\s*var\(--ui-floating-list-shadow\);/s,
    );
    expect(menuSource).not.toContain(
      "customLengthPixels('--ui-space-2', FLOATING_GAP_REM)",
    );
  });

  it('keeps the final flex body size as the only results scroll boundary', () => {
    expect(menuSource).toMatch(
      /\.ui-action-menu__items\s*\{[^}]*min-block-size:\s*0;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*flex:\s*1 1 auto;/s,
    );
    expect(menuSource).toMatch(
      /\.ui-action-menu__body\s*\{[^}]*min-block-size:\s*0;[^}]*flex:\s*1 1 auto;/s,
    );
    expect(scrollRegionSource).toMatch(
      /\.ui-scroll-region__viewport\s*\{[^}]*block-size:\s*100%;/s,
    );
    expect(scrollRegionSource).toMatch(
      /\[data-scroll-axis='vertical'\]\s*>\s*\.ui-scroll-region__viewport\s*\{[^}]*overflow-y:\s*auto;/s,
    );
    expect(menuSource).toMatch(
      /\.ui-action-menu\s+:deep\(\.ui-action-menu__viewport\)\s*\{[^}]*padding:\s*var\(--ui-floating-list-padding\);/s,
    );
    expect(menuSource).not.toMatch(
      /\.ui-action-menu\s+:deep\(\.ui-action-menu__viewport\)\s*\{[^}]*(?:block-size:\s*auto|max-block-size:\s*inherit)/s,
    );
  });

  it('keeps pinned and scrolling result rows symmetric around their divider', () => {
    expect(menuSource).toMatch(
      /\.ui-action-menu__separator\s*\+\s*\.ui-action-menu__body\s+:deep\(\.ui-action-menu__viewport\)\s*\{[^}]*padding-block-start:\s*0;/s,
    );
    expect(menuSource).toMatch(
      /\.ui-action-menu__item\s*\{[^}]*min-height:\s*var\(--ui-floating-row-min-height\);[^}]*padding:\s*var\(--ui-floating-row-padding-block\)\s+var\(--ui-floating-row-padding-inline\);[^}]*border-radius:\s*var\(--ui-floating-row-radius\);/s,
    );
  });

  it('separates persistent, hover, pressed, focus, disabled, and danger states', () => {
    expect(menuSource).toMatch(
      /\.ui-action-menu__item:active:not\(\[aria-disabled='true'\]\)\s*\{[^}]*background:\s*var\(--ui-color-surface-active\);/s,
    );
    expect(menuSource).toMatch(
      /\.ui-action-menu__item:focus-visible\s*\{[^}]*background:\s*var\(--ui-color-surface-active\);[^}]*outline:\s*var\(--ui-focus-width\) solid var\(--ui-color-focus\);[^}]*outline-offset:\s*var\(--ui-focus-offset-inset\);/s,
    );
    expect(menuSource).toMatch(
      /\.ui-action-menu__item--danger:hover:not\(\[aria-disabled='true'\]\),\s*\.ui-action-menu__item--danger:active:not\(\[aria-disabled='true'\]\),\s*\.ui-action-menu__item--danger:focus-visible\s*\{[^}]*background:\s*var\(--ui-color-danger-soft\);/s,
    );
  });

  it('keeps filter focus geometry in the shared recipe and search primitive', () => {
    expect(menuSource).toMatch(
      /\.ui-action-menu__filter\s*\{[^}]*margin:\s*var\(--ui-floating-list-padding\);[^}]*margin-block-end:\s*0;/s,
    );
    expect(searchBoxSource).toMatch(
      /\.ui-search-box__control:focus-within\s*\{[^}]*outline:\s*var\(--ui-focus-width\) solid var\(--ui-color-focus\);[^}]*outline-offset:\s*var\(--ui-focus-offset\);/s,
    );
    expect(trackMenuSource).not.toContain('<style');
    expect(trackMenuSource).not.toContain('UiSearchBox');
  });
});
