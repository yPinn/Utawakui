import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoDensity from './DemoDensity.vue';

const source = readFileSync(
  new URL('./DemoDensity.vue', import.meta.url),
  'utf8',
);
const tokens = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);

const ACTIVE_DENSITY_TOKENS = [
  '--ui-control-height',
  '--ui-control-height-live',
  '--ui-control-height-emergency',
  '--ui-track-row-min-height',
  '--ui-sidebar-row-min-height',
  '--ui-track-artwork-size',
  '--ui-sidebar-artwork-size',
  '--ui-right-dock-track-row-min-height',
  '--ui-right-dock-track-artwork-size',
  '--ui-list-header-height',
  '--ui-player-bar-height',
  '--ui-right-dock-content-inset',
  '--ui-shell-gutter',
];

describe('DemoDensity active token scale', () => {
  it('renders one row per active density contract', async () => {
    const html = await renderToString(createSSRApp(DemoDensity));

    expect(html.match(/data-density-token=/gu)).toHaveLength(
      ACTIVE_DENSITY_TOKENS.length,
    );
    expect(html.match(/data-density-sample=/gu)).toHaveLength(
      ACTIVE_DENSITY_TOKENS.length * 2,
    );
    for (const token of ACTIVE_DENSITY_TOKENS) {
      expect(html).toContain(token);
      expect(tokens).toContain(`${token}:`);
    }
  });

  it('shows Standard and Compact values from the active token contract', async () => {
    const html = await renderToString(createSSRApp(DemoDensity));

    expect(html).toContain('Standard');
    expect(html).toContain('Compact');
    expect(html).toContain('2.25rem');
    expect(html).toContain('2rem');
    expect(html).toContain('4.75rem');
    expect(html).toContain('0.5rem');
    expect(source).toContain("'--demo-density-size': sample.size");
  });

  it('does not maintain a parallel Candidate and Current mapping database', async () => {
    const html = await renderToString(createSSRApp(DemoDensity));

    expect(html).not.toContain('data-density-layer');
    expect(html).not.toContain('候選');
    expect(html).not.toContain('映射狀態');
    expect(html).not.toContain('尚無 active token');
    expect(source).not.toContain('src/components/');
    expect(source).not.toContain('src/views/');
  });

  it('keeps every visible measurement outside the geometry specimen', async () => {
    const html = await renderToString(createSSRApp(DemoDensity));
    const specimens = [
      ...html.matchAll(
        /<span class="demo-density__specimen"[^>]*>([\s\S]*?)<\/span>/gu,
      ),
    ];

    expect(specimens).toHaveLength(ACTIVE_DENSITY_TOKENS.length * 2);
    for (const [, contents] of specimens) expect(contents.trim()).toBe('');
  });
});
