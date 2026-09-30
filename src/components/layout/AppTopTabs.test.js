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
      /\.app-tabs__folder::before\s*\{[^}]*transform:\s*translateY\(var\(--ui-archive-tab-rest-offset\)\);/su,
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
    expect(source).toMatch(
      /\.app-tabs__row\s+:deep\(\.app-tabs__row-viewport\)::after\s*\{[^}]*z-index:\s*2;/su,
    );
    expect(source).toMatch(/\.app-tabs__folder\s*\{[^}]*z-index:\s*1;/su);
    expect(source).toMatch(
      /\.app-tabs__folder--active\s*\{[^}]*z-index:\s*3;/su,
    );
    expect(source).toMatch(
      /\.app-tabs__folder:focus-visible\s*\{[^}]*z-index:\s*4;/su,
    );
  });

  it('keeps workflow labels one optical pixel below center', () => {
    const source = readFileSync(
      new URL('./AppTopTabs.vue', import.meta.url),
      'utf8',
    );
    const tokens = readFileSync(
      new URL('../../styles/tokens.css', import.meta.url),
      'utf8',
    );
    const activeHeight = 68;
    const restingHeight = 56;
    const coverSize = 8;
    const opticalOffset = 1;
    const restOffset = activeHeight - restingHeight;
    const labelBlockSize = activeHeight - coverSize;

    expect(labelBlockSize / 2).toBe(30);
    expect(labelBlockSize / 2 + restOffset / 2).toBe(36);
    expect(labelBlockSize / 2 + opticalOffset).toBe(31);
    expect(labelBlockSize / 2 + restOffset / 2 + opticalOffset).toBe(37);
    expect(tokens).toContain(
      '--ui-archive-tab-label-block-size: calc(\n    var(--ui-archive-tab-active-height) - var(--ui-archive-rail-size)\n  );',
    );
    expect(tokens).toMatch(/--ui-archive-tab-label-optical-offset:\s*1px;/u);
    expect(tokens).toMatch(
      /--ui-archive-tab-label-rest-offset:\s*calc\(\s*var\(--ui-archive-tab-rest-offset\)\s*\/\s*2\s*\+\s*var\(--ui-archive-tab-label-optical-offset\)\s*\);/u,
    );
    expect(source).toMatch(
      /\.app-tabs__content\s*\{[^}]*block-size:\s*var\(--ui-archive-tab-label-block-size\);[^}]*transform:\s*translateY\(var\(--ui-archive-tab-label-rest-offset\)\);/su,
    );
    expect(source).toMatch(
      /\.app-tabs__folder--active\s+\.app-tabs__content\s*\{[^}]*transform:\s*translateY\(var\(--ui-archive-tab-label-optical-offset\)\);/su,
    );
    expect(source).toContain('class="app-tabs__content app-tabs__label"');
  });

  it('keeps the active destination identifiable when forced colors replace material fills', () => {
    const source = readFileSync(
      new URL('./AppTopTabs.vue', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\.app-tabs__folder--active::before[\s\S]*border:\s*var\(--ui-border-width\) solid Highlight;/u,
    );
    expect(source).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\.app-tabs__folder--active\s*\{[^}]*color:\s*HighlightText;/u,
    );
  });

  it('reveals focused destinations and uses an instance-safe tab shape', async () => {
    const source = readFileSync(
      new URL('./AppTopTabs.vue', import.meta.url),
      'utf8',
    );
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h('div', [
            h(AppTopTabs, { activeView: 'setlist' }),
            h(AppTopTabs, { activeView: 'lyrics' }),
          ]),
      }),
    );
    const shapeIds = [...html.matchAll(/id="(app-tab-shape-[^"]+)"/gu)].map(
      (match) => match[1],
    );

    expect(shapeIds).toHaveLength(2);
    expect(new Set(shapeIds).size).toBe(2);
    expect(source).toContain('@focus="revealTab"');
    expect(source).toContain('useId');
    expect(source).toContain('clip-path: var(--ui-app-tab-shape);');
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

  it('contains exactly the four workflow destinations', async () => {
    const html = await renderTabs();
    const source = readFileSync(
      new URL('./AppTopTabs.vue', import.meta.url),
      'utf8',
    );

    expect(html.match(/<button/gu) ?? []).toHaveLength(4);
    expect(html).not.toContain('aria-label="設定"');
    expect(source).not.toContain('utilityItems');
    expect(source).not.toContain('Settings,');
    expect(source).not.toContain('updateAvailable');
    expect(source).not.toContain('app-tabs__group--utility');
    expect(html).not.toContain('app-tabs__update-dot');
    expect(html).toContain('data-app-workflow-trigger="setlist"');
    expect(html).toContain('data-app-workflow-trigger="lyrics"');
    expect(html).toContain('data-app-workflow-trigger="output"');
    expect(html).toContain('data-app-workflow-trigger="import"');
  });
});
