import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import { INTERNAL_TOOL_ROUTES } from '../../constants/internalTools.js';
import InternalToolsNavigation from './InternalToolsNavigation.vue';

describe('InternalToolsNavigation', () => {
  it('shows every tool in one row with its shortcut hint', async () => {
    const html = await renderToString(
      createSSRApp(InternalToolsNavigation, {
        tools: INTERNAL_TOOL_ROUTES,
        activeToolId: 'music-analysis',
      }),
    );

    for (const label of ['音樂分析', '診斷', '歌詞來源', 'Mic 輸入']) {
      expect(html).toContain(label);
    }
    for (const key of ['F5', 'F6', 'F7']) expect(html).toContain(key);
    expect(html).not.toContain('F8');
    expect(html).not.toContain('Operations');
    expect(html).not.toContain('Evaluation');
  });
});
