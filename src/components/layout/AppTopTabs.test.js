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
      /\.app-tabs__folder--active\s*\{[^}]*background:\s*var\(--ui-color-accent\)/u,
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
