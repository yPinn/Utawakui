import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import AppTopTabs from './AppTopTabs.vue';

async function renderTabs(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(AppTopTabs, {
          activeView: 'setlist',
          ...props,
        }),
    }),
  );
}

describe('AppTopTabs', () => {
  it('keeps selection lift inside a fixed tab envelope without moving the page', () => {
    const source = readFileSync(
      new URL('./AppTopTabs.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain('scrollbar-visibility="hidden"');
    expect(source).toMatch(
      /\.app-tabs__row\s*\{[^}]*block-size:\s*var\(--ui-archive-tab-active-height\);/su,
    );
    expect(source).toMatch(
      /\.app-tabs__folder\s*\{[^}]*height:\s*var\(--ui-archive-tab-active-height\);[^}]*overflow:\s*hidden;/su,
    );
    expect(source).toMatch(
      /\.app-tabs__folder::before\s*\{[^}]*transform:\s*translateY\(\s*calc\(\s*var\(--ui-archive-tab-active-height\)\s*-\s*var\(--ui-archive-tab-height\)\s*\)\s*\);/su,
    );
    expect(source).toMatch(
      /\.app-tabs__folder--active::before\s*\{[^}]*transform:\s*translateY\(0\);/su,
    );
    expect(source).toMatch(
      /transition:\s*transform\s+var\(--ui-motion-duration-fast\)\s+var\(--ui-motion-easing-standard\)/u,
    );
    expect(source).not.toMatch(/transition:\s*height/u);
    expect(source).not.toContain('@keyframes app-tabs-reveal');
    expect(source).not.toContain('animation-delay');
    expect(source).toMatch(
      /\.app-tabs__folder:focus-visible\s*\{[^}]*outline-offset:\s*var\(--ui-focus-offset-inset\);/su,
    );
  });

  it('owns the development-only folder material recipe without changing its default state', () => {
    const source = readFileSync(
      new URL('./AppTopTabs.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain(
      ":root[data-ui-system='v2'][data-ui-candidate-view='studio-library']",
    );
    expect(source).toMatch(
      /data-ui-candidate-view='studio-library'[\s\S]*\.app-tabs__folder--active[\s\S]*background:\s*var\(--ui-color-folder-primary\)/u,
    );
    expect(source).toMatch(
      /\.app-tabs__folder--active::before\s*\{[^}]*background:\s*var\(--ui-color-accent\)/u,
    );
    expect(source).toMatch(
      /data-ui-candidate-view='studio-library'[\s\S]*\.app-tabs\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/u,
    );
  });

  it('orders Output before Import in the workflow tabs', async () => {
    const html = await renderTabs();

    expect(html.indexOf('Setlist')).toBeLessThan(html.indexOf('Lyrics'));
    expect(html.indexOf('Lyrics')).toBeLessThan(html.indexOf('Output'));
    expect(html.indexOf('Output')).toBeLessThan(html.indexOf('Import'));
  });

  it('keeps the Settings tab unmarked until an update is available', async () => {
    const html = await renderTabs();

    expect(html).toContain('aria-label="設定"');
    expect(html).not.toContain('app-tabs__update-dot');
  });

  it('marks the Settings tab with a dot and a descriptive label when an update is ready', async () => {
    const html = await renderTabs({ updateAvailable: true });

    expect(html).toContain('app-tabs__update-dot');
    expect(html).toContain('aria-label="設定（有可用更新）"');
    expect(html).toContain('aria-hidden="true"');
  });
});
