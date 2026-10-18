import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import DemoScrollbarAppearance from './DemoScrollbarAppearance.vue';

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const componentSource = readSource('./DemoScrollbarAppearance.vue');
const regionSource = readSource('../ui/UiScrollRegion.vue');
const tokenSource = readSource('../../styles/tokens.css');

describe('production scrollbar catalogue specimen', () => {
  it('shows vertical, horizontal, and two-axis production layouts once', async () => {
    const html = await renderToString(createSSRApp(DemoScrollbarAppearance));

    for (const axis of ['vertical', 'horizontal', 'both']) {
      expect(html).toContain(`data-scrollbar-axis="${axis}"`);
    }
    expect(html.match(/data-scrollbar-axis=/gu)).toHaveLength(3);
    expect(html.match(/data-scroll-axis=/gu)).toHaveLength(5);
    expect(componentSource.match(/<UiScrollLayout/gu)).toHaveLength(5);
    expect(componentSource).not.toContain('<UiScrollRegion');
  });

  it('does not redraw a parallel Candidate and Current scrollbar skin', async () => {
    const html = await renderToString(createSSRApp(DemoScrollbarAppearance));

    expect(html).not.toContain('data-demo-review-layer');
    expect(html).not.toContain('Token v2 Scroll Region');
    expect(html).not.toContain('現行 Production Scroll Region');
    expect(componentSource).not.toMatch(/#[0-9a-f]{3,8}/iu);
    expect(componentSource).not.toContain('--ui-color-surface:');
  });

  it('keeps no-overflow and overflow reserve behavior visible', async () => {
    const html = await renderToString(createSSRApp(DemoScrollbarAppearance));

    expect(html).toContain('data-scrollbar-layout-proof="overlay"');
    expect(html).toContain('data-scrollbar-overflow="none"');
    expect(html).toContain('data-scrollbar-overflow="present"');
    expect(html).toContain('覆蓋式軌道不改變內容座標');
  });

  it('uses the shared layout composition over the native scroll authority', async () => {
    const html = await renderToString(
      createSSRApp(UiScrollLayout, {
        axis: 'vertical',
        tabindex: 0,
        'aria-label': '安全邊界捲動區域',
      }),
    );

    expect(html).toContain('ui-scroll-layout');
    expect(html).toContain('ui-scroll-region');
    expect(regionSource).toContain("useTemplateRef('viewport')");
    expect(regionSource).toContain('new ResizeObserver(scheduleMeasure)');
    expect(regionSource).toContain('@scroll="scheduleMeasure"');
    expect(regionSource).toContain('@pointerdown="startThumbDrag');
  });

  it('keeps the neutral, density-stable scrollbar token contract', () => {
    for (const declaration of [
      '--ui-scrollbar-lane-size: var(--ui-space-3);',
      '--ui-scrollbar-thumb-inset: calc(var(--ui-border-width) * 3);',
      '--ui-scrollbar-thumb-min-length: var(--ui-space-6);',
      '--ui-scrollbar-thumb-max-length: 4.5rem;',
      '--ui-scrollbar-thumb: var(--ui-color-text-subtle);',
      '--ui-scrollbar-thumb-hover: var(--ui-color-text-muted);',
      '--ui-scrollbar-thumb-active: var(--ui-color-text);',
      '--ui-scrollbar-track: transparent;',
    ]) {
      expect(tokenSource).toContain(declaration);
    }
    expect(regionSource).not.toMatch(/accent|success|warning|danger|live/u);
    expect(regionSource).toContain('@media (forced-colors: active)');
    expect(regionSource).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('reflows from the specimen width without native scrollbar paint', () => {
    expect(componentSource).toContain('container-type: inline-size');
    expect(componentSource).toContain('@container (max-width: 48rem)');
    expect(regionSource).toMatch(
      /\.ui-scroll-region__viewport\s*\{[\s\S]*?scrollbar-width:\s*none;/u,
    );
    expect(regionSource).toMatch(
      /\.ui-scroll-region__viewport::-webkit-scrollbar\s*\{[^}]*display:\s*none;/u,
    );
    expect(regionSource).not.toContain('scrollbar-gutter: stable');
  });
});
