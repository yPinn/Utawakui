import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiScrollRegion from './UiScrollRegion.vue';

const componentSource = readFileSync(
  new URL('./UiScrollRegion.vue', import.meta.url),
  'utf8',
);
const activeTokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
const candidateTokenSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);

describe('UiScrollRegion production contract', () => {
  it('keeps consumer geometry on the root and accessible scroll attrs on the native viewport', async () => {
    const app = createSSRApp({
      render: () =>
        h(
          UiScrollRegion,
          {
            axis: 'both',
            class: 'consumer-scroll-region',
            style: 'block-size: 11rem',
            'data-scroll-owner': 'queue',
            tabindex: 0,
            role: 'region',
            'aria-label': '待播清單',
            viewportClass: 'consumer-scroll-region__viewport',
          },
          { default: () => h('p', '可捲動內容') },
        ),
    });

    const html = await renderToString(app);

    expect(html).toContain('class="consumer-scroll-region ui-scroll-region"');
    expect(html).toContain('data-scroll-owner="queue"');
    expect(html).toContain('data-scroll-axis="both"');
    expect(html).toContain('style="block-size:11rem;"');
    expect(html).toContain(
      'class="consumer-scroll-region__viewport ui-scroll-region__viewport"',
    );
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="待播清單"');
    expect(html).toContain('aria-hidden="true"');
  });

  it('keeps native scrolling authoritative while overlay chrome projects each allowed axis', () => {
    expect(componentSource).toContain("useTemplateRef('root')");
    expect(componentSource).toContain("useTemplateRef('viewport')");
    expect(componentSource).toContain('new ResizeObserver(scheduleMeasure)');
    expect(componentSource).toContain(
      'new MutationObserver(refreshObservedContent)',
    );
    expect(componentSource).toContain('@scroll="scheduleMeasure"');
    expect(componentSource).toContain('viewport.scrollTop =');
    expect(componentSource).toContain('viewport.scrollLeft =');
    expect(componentSource).toContain("props.axis === 'horizontal'");
    expect(componentSource).toContain("props.axis === 'vertical'");
    expect(componentSource).toContain(
      "event.pointerType === 'mouse' && event.button !== 0",
    );
    expect(componentSource).toContain(
      'defineExpose({ root: rootRef, viewport: viewportRef, scrollTo })',
    );
  });

  it('preserves semantic viewport elements for list-based consumers', async () => {
    const app = createSSRApp({
      render: () =>
        h(
          UiScrollRegion,
          { axis: 'horizontal', viewportTag: 'ol', role: 'list' },
          { default: () => [h('li', '第一層'), h('li', '第二層')] },
        ),
    });

    const html = await renderToString(app);

    expect(html).toContain(
      '<ol role="list" class="ui-scroll-region__viewport"',
    );
    expect(html).toContain('<li>第一層</li>');
  });

  it('can hide only the scrollbar chrome while keeping the native viewport', async () => {
    const app = createSSRApp({
      render: () =>
        h(
          UiScrollRegion,
          { scrollbarVisibility: 'hidden', tabindex: 0 },
          { default: () => h('p', '仍可捲動') },
        ),
    });

    const html = await renderToString(app);

    expect(html).toContain('class="ui-scroll-region__viewport"');
    expect(html).not.toContain('ui-scroll-region__rail');
  });

  it('owns a zero-gutter overlay appearance with platform accessibility fallbacks', () => {
    expect(componentSource).toMatch(
      /\.ui-scroll-region\s*\{[^}]*position:\s*relative;/u,
    );
    expect(componentSource).toMatch(
      /\.ui-scroll-region__viewport\s*\{[\s\S]*?scrollbar-width:\s*none;/u,
    );
    expect(componentSource).toMatch(
      /\.ui-scroll-region__viewport::-webkit-scrollbar\s*\{[^}]*display:\s*none;/u,
    );
    expect(componentSource).toMatch(
      /\.ui-scroll-region__rail\s*\{[\s\S]*?position:\s*absolute;/u,
    );
    expect(componentSource).not.toContain('scrollbar-gutter');
    expect(componentSource).not.toMatch(/accent|success|warning|danger|live/u);
    expect(componentSource).toContain(
      '@media (prefers-reduced-motion: reduce)',
    );
    expect(componentSource).toContain('@media (forced-colors: active)');
    expect(componentSource).toContain('CanvasText');
    expect(componentSource).toContain('Canvas');
  });

  it('uses the same semantic aliases in active and Token v2 scopes', () => {
    const declarations = [
      '--ui-scrollbar-lane-size:',
      '--ui-scrollbar-thumb-inset:',
      '--ui-scrollbar-thumb-min-length:',
      '--ui-scrollbar-thumb-max-length:',
      '--ui-scrollbar-edge-inset:',
      '--ui-scrollbar-thumb:',
      '--ui-scrollbar-thumb-hover:',
      '--ui-scrollbar-thumb-active:',
      '--ui-scrollbar-track:',
      '--ui-scrollbar-radius:',
    ];

    for (const declaration of declarations) {
      expect(activeTokenSource).toContain(declaration);
      expect(candidateTokenSource).toContain(declaration);
    }
  });
});
