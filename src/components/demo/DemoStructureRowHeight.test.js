import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoStructureRowHeight from './DemoStructureRowHeight.vue';

describe('DemoStructureRowHeight', () => {
  it('renders the real summary once per row-height candidate', async () => {
    const html = await renderToString(createSSRApp(DemoStructureRowHeight));

    expect(html).toMatch(
      /data-row-height-candidate="floating-row"[^>]*--ui-menu-item-height:\s*var\(--ui-floating-row-min-height\)/u,
    );
    expect(html).toMatch(
      /data-row-height-candidate="control"[^>]*--ui-menu-item-height:\s*var\(--ui-control-height\)/u,
    );
    expect(html.match(/class="structure-summary"/gu)).toHaveLength(2);
    expect(html.match(/class="structure-summary__section"/gu)).toHaveLength(14);
  });
});
