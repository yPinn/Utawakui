import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiScrollLayout from './UiScrollLayout.vue';

const source = readFileSync(
  new URL('./UiScrollLayout.vue', import.meta.url),
  'utf8',
);

describe('UiScrollLayout composition contract', () => {
  it('keeps consumer geometry on the scroll root and wraps content semantically', async () => {
    const app = createSSRApp({
      render: () =>
        h(
          UiScrollLayout,
          {
            axis: 'both',
            class: 'consumer-scroll-layout',
            style: 'block-size: 11rem',
            'data-scroll-owner': 'queue',
            tabindex: 0,
            role: 'region',
            'aria-label': '待播清單',
            contentTag: 'ul',
          },
          { default: () => h('li', '可捲動內容') },
        ),
    });

    const html = await renderToString(app);

    expect(html).toContain(
      'class="consumer-scroll-layout ui-scroll-layout ui-scroll-region"',
    );
    expect(html).toContain('data-scroll-owner="queue"');
    expect(html).toContain('data-scroll-axis="both"');
    expect(html).toContain('style="block-size:11rem;"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="待播清單"');
    expect(html).toContain('<ul class="ui-scroll-layout__content"');
    expect(html).toContain('<li>可捲動內容</li>');
  });

  it('owns axis-aware visual-thumb reserve without duplicating scroll behavior', () => {
    expect(source).toContain(
      "import UiScrollRegion from './UiScrollRegion.vue';",
    );
    expect(source).toContain('ref="scrollRegion"');
    expect(source).toContain('defineExpose({ root, viewport, scrollTo })');
    expect(source).toMatch(
      /\.ui-scroll-layout\s*\{[^}]*--ui-scroll-layout-scrollbar-visual-reserve:\s*calc\(\s*var\(--ui-scrollbar-lane-size\)\s*-\s*var\(--ui-scrollbar-thumb-inset\)\s*\);/su,
    );
    expect(source).toMatch(
      /\.ui-scroll-layout\[data-scroll-axis='vertical'\],[\s\S]*?\.ui-scroll-layout\[data-scroll-axis='both'\]\s*\{[^}]*--ui-scroll-layout-reserve-inline-end:\s*var\(\s*--ui-scroll-layout-scrollbar-visual-reserve\s*\);/u,
    );
    expect(source).toMatch(
      /\.ui-scroll-layout\[data-scroll-axis='horizontal'\],[\s\S]*?\.ui-scroll-layout\[data-scroll-axis='both'\]\s*\{[^}]*--ui-scroll-layout-reserve-block-end:\s*var\(\s*--ui-scroll-layout-scrollbar-visual-reserve\s*\);/u,
    );
    expect(source).toMatch(
      /\.ui-scroll-layout\[data-scrollbar-visibility='hidden'\]\s*\{[^}]*--ui-scroll-layout-reserve-inline-end:\s*0rem;[^}]*--ui-scroll-layout-reserve-block-end:\s*0rem;/su,
    );
    expect(source).toMatch(
      /\.ui-scroll-layout__content\s*\{[^}]*padding-block-end:\s*calc\(\s*var\(--ui-scroll-layout-padding-block-end,\s*0rem\)\s*\+\s*var\(--ui-scroll-layout-reserve-block-end\)\s*\);[^}]*padding-inline-end:\s*calc\(\s*var\(--ui-scroll-layout-padding-inline-end,\s*0rem\)\s*\+\s*var\(--ui-scroll-layout-reserve-inline-end\)\s*\);/su,
    );
    expect(source).not.toMatch(/\boverflow(?:-x|-y)?:/u);
    expect(source).not.toContain('ui-scroll-region__rail');
    expect(source).not.toContain('ResizeObserver');
  });
});
