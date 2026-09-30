import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import DemoScrollbarAppearance from './DemoScrollbarAppearance.vue';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const componentSource = readSource('./DemoScrollbarAppearance.vue');
const candidateSource = readSource('../ui/UiScrollRegion.vue');
const tokenSource = readSource('../../styles/tokens-v2.css');
const demoViewSource = readSource('../../views/DemoView.vue');
const productionMainSource = readSource('../../main.js');
const performerMainSource = readSource('../../performer-main.js');
const reviewContractSource = readFileSync(
  new URL(
    '../../../docs/contracts/token-v2-component-review.md',
    import.meta.url,
  ),
  'utf8',
);

describe('Token v2 scrollbar appearance checkpoint', () => {
  it('compares candidate and current vertical, horizontal, and two-axis regions', async () => {
    const html = await renderToString(createSSRApp(DemoScrollbarAppearance));

    expect(html).toContain('data-demo-review-layer="candidate"');
    expect(html).toContain('data-demo-review-layer="current"');
    expect(html).toContain('Token v2 Scroll Region');
    expect(html).toContain('現行 Production Scroll Region');

    for (const axis of ['vertical', 'horizontal', 'both']) {
      expect(html).toContain(`data-scrollbar-axis="${axis}"`);
    }

    expect(html.match(/data-scroll-axis=/gu)).toHaveLength(8);
    expect(html).not.toContain('ui-scroll-region--stable');
    expect(html.match(/tabindex="0"/gu)).toHaveLength(8);
    expect(html).toContain('垂直捲動區域');
    expect(html).toContain('水平捲動區域');
    expect(html).toContain('雙軸捲動區域');
    expect(componentSource).toContain('v-for="index in 35"');
  });

  it('defines a neutral, density-stable scrollbar token contract', () => {
    for (const declaration of [
      '--ui-scrollbar-lane-size: var(--ui-space-3);',
      '--ui-scrollbar-thumb-inset: calc(var(--ui-border-width) * 3);',
      '--ui-scrollbar-thumb-min-length: var(--ui-space-6);',
      '--ui-scrollbar-thumb-max-length: 4.5rem;',
      '--ui-scrollbar-edge-inset: var(--ui-space-1);',
      '--ui-scrollbar-thumb: var(--ui-color-text-subtle);',
      '--ui-scrollbar-thumb-hover: var(--ui-color-text-muted);',
      '--ui-scrollbar-thumb-active: var(--ui-color-text);',
      '--ui-scrollbar-track: transparent;',
      '--ui-scrollbar-radius: var(--ui-radius-pill);',
    ]) {
      expect(tokenSource).toContain(declaration);
    }

    const compactBlock = tokenSource.match(
      /:root\[data-ui-system='v2'\]\[data-ui-density='compact'\]\s*\{([\s\S]*?)\n\}/u,
    )?.[1];

    expect(compactBlock).not.toContain('--ui-scrollbar-lane-size');
    expect(candidateSource).not.toMatch(/accent|success|warning|danger|live/u);
  });

  it('provides an overlay appearance without a reserved native lane', () => {
    expect(candidateSource).toMatch(/\.ui-scroll-region\s*\{/u);
    expect(candidateSource).toMatch(
      /\.ui-scroll-region__viewport\s*\{[\s\S]*?scrollbar-width:\s*none;/u,
    );
    expect(candidateSource).toMatch(
      /\.ui-scroll-region__viewport::-webkit-scrollbar\s*\{[^}]*display:\s*none;/u,
    );
    expect(candidateSource).toMatch(
      /\.ui-scroll-region__rail\s*\{[\s\S]*?position:\s*absolute;/u,
    );
    expect(candidateSource).toMatch(
      /\.ui-scroll-region__thumb:hover\s*\{[^}]*var\(--ui-scrollbar-thumb-hover\)/u,
    );
    expect(candidateSource).toMatch(
      /\.ui-scroll-region__thumb\[data-dragging='true'\]\s*\{[^}]*var\(--ui-scrollbar-thumb-active\)/u,
    );
    expect(candidateSource).not.toContain('scrollbar-gutter: stable');
    expect(candidateSource).toContain('@media (forced-colors: active)');
    expect(candidateSource).toContain('CanvasText');
    expect(candidateSource).toContain('Canvas');
    expect(candidateSource).toMatch(
      /\[data-scroll-axis='vertical'\] > \.ui-scroll-region__viewport\s*\{[^}]*overflow-y:\s*auto;/u,
    );
    expect(candidateSource).toMatch(
      /\[data-scroll-axis='horizontal'\] > \.ui-scroll-region__viewport\s*\{[^}]*overflow-x:\s*auto;/u,
    );
  });

  it('keeps native scrolling as the authority and projects only overlay chrome', async () => {
    const html = await renderToString(
      createSSRApp(UiScrollRegion, {
        axis: 'vertical',
        tabindex: 0,
        'aria-label': '測試捲動區域',
      }),
    );

    expect(html).toContain('class="ui-scroll-region"');
    expect(html).toContain('class="ui-scroll-region__viewport"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="測試捲動區域"');
    expect(html).toContain('aria-hidden="true"');
    expect(candidateSource).toContain("useTemplateRef('viewport')");
    expect(candidateSource).toContain('new ResizeObserver(scheduleMeasure)');
    expect(candidateSource).toContain(
      'new MutationObserver(refreshObservedContent)',
    );
    expect(candidateSource).toContain('@scroll="scheduleMeasure"');
    expect(candidateSource).toContain('viewport.scrollTop =');
    expect(candidateSource).toContain('viewport.scrollLeft =');
    expect(candidateSource).toContain('@pointerdown="startThumbDrag');
    expect(candidateSource).toContain("props.axis === 'horizontal'");
    expect(candidateSource).toContain("props.axis === 'vertical'");
    expect(candidateSource).not.toContain('scrollbar-gutter');
    expect(candidateSource).toContain(
      '@media (prefers-reduced-motion: reduce)',
    );
  });

  it('shows no-overflow and overflow geometry as an explicit review pair', async () => {
    const html = await renderToString(createSSRApp(DemoScrollbarAppearance));

    expect(html).toContain('data-scrollbar-layout-proof="overlay"');
    expect(html).toContain('data-scrollbar-overflow="none"');
    expect(html).toContain('data-scrollbar-overflow="present"');
    expect(html).toContain('無溢位時不顯示，也不預留 lane');
    expect(componentSource).not.toContain('regionClasses(layer, true)');
  });

  it('uses the shared overlay contract for both token layers', () => {
    expect(componentSource).not.toContain(
      '.demo-scrollbar-region--current::-webkit-scrollbar',
    );
    expect(componentSource).toContain('與 Token v2 共用 overlay 行為契約');
    expect(componentSource).toContain('<UiScrollRegion');
  });

  it('reflows from the specimen width and derives thumb length from native geometry', () => {
    expect(componentSource).toMatch(
      /\.demo-scrollbar-layer\s*\{[^}]*container-type:\s*inline-size;/u,
    );
    expect(componentSource).toContain('@container (max-width: 48rem)');
    expect(componentSource).toContain('@container (max-width: 32rem)');
    expect(tokenSource).toContain(
      '--ui-scrollbar-thumb-min-length: var(--ui-space-6);',
    );
    expect(candidateSource).toContain('getOverlayThumbGeometry');
  });

  it('uses the production primitive without a separate demo-only stylesheet', () => {
    expect(componentSource).toContain(
      "import UiScrollRegion from '../ui/UiScrollRegion.vue'",
    );
    expect(demoViewSource).not.toContain('scrollbar-v2.css');
    expect(productionMainSource).not.toContain('scrollbar-v2.css');
    expect(performerMainSource).not.toContain('scrollbar-v2.css');
  });

  it('treats the reference site as mechanism evidence rather than a visual template', () => {
    expect(reviewContractSource).toContain(
      '只作「overlay 可避免 layout occupation」的實作證據，不是唯一視覺答案',
    );
    expect(reviewContractSource).toContain(
      '沒有照搬其 20px lane、8px outlined thumb、全頁 fixed placement 或品牌語彙',
    );
  });
});
