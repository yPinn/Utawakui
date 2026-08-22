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
  it('orders Output before Import in the workflow tabs', async () => {
    const html = await renderTabs();

    expect(html.indexOf('Setlist')).toBeLessThan(html.indexOf('Lyrics'));
    expect(html.indexOf('Lyrics')).toBeLessThan(html.indexOf('Output'));
    expect(html.indexOf('Output')).toBeLessThan(html.indexOf('Import'));
  });
});
