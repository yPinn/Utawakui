import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoNavigation from './DemoNavigation.vue';

describe('DemoNavigation tab panels', () => {
  it('keeps every aria-controls target in the document', async () => {
    const html = await renderToString(
      createSSRApp(DemoNavigation, {
        sections: [{ key: 'tabs', title: '分頁', components: ['UiTabs'] }],
      }),
    );

    for (const id of ['library', 'queue', 'history', 'locked']) {
      expect(html).toContain(`aria-controls="demo-panel-${id}-panel"`);
      expect(html).toContain(`id="demo-panel-${id}-panel"`);
    }
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
  });
});
