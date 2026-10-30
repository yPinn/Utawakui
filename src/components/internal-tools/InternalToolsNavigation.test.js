import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { INTERNAL_TOOL_CATEGORIES } from '../../constants/internalTools.js';
import InternalToolsNavigation from './InternalToolsNavigation.vue';

describe('InternalToolsNavigation', () => {
  it('shows lifecycle categories, the active tool set and shortcut hints', async () => {
    const html = await renderToString(
      createSSRApp(InternalToolsNavigation, {
        categories: INTERNAL_TOOL_CATEGORIES,
        activeToolId: 'music-analysis',
      }),
    );

    expect(html).toContain('Operations');
    expect(html).toContain('Evaluation');
    expect(html).toContain('Music Analysis');
    expect(html).toContain('Live Diagnostics');
    expect(html).toContain('F5');
    expect(html).toContain('F6');
    expect(html).not.toContain('Lyrics Provider Corpus');
    expect(html).not.toContain('僅開發版本');
    expect(html).not.toContain(
      INTERNAL_TOOL_CATEGORIES[0].tools[0].description,
    );
  });

  it('shows evaluation tools without inventing a shortcut for Music M2', async () => {
    const html = await renderToString(
      createSSRApp(InternalToolsNavigation, {
        categories: INTERNAL_TOOL_CATEGORIES,
        activeToolId: 'music-analysis-evaluation',
      }),
    );

    expect(html).toContain('Music M2');
    expect(html).toContain('Lyrics Provider Corpus');
    expect(html).toContain('F7');
    expect(html).not.toContain('F8');
    expect(html).toContain('Mic Level R02');
  });
});
