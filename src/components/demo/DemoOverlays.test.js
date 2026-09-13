import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoOverlays from './DemoOverlays.vue';

const source = readFileSync(
  new URL('./DemoOverlays.vue', import.meta.url),
  'utf8',
);

describe('DemoOverlays action-menu checkpoint', () => {
  it('keeps the menu reviewed while the modal remains pending', async () => {
    const html = await renderToString(
      createSSRApp(DemoOverlays, {
        sections: [
          {
            key: 'context-menu',
            title: '動作選單',
            components: ['UiActionMenu Candidate', 'UiContextMenu Current'],
          },
          { key: 'modal', title: '對話框', components: ['UiModal'] },
        ],
      }),
    );

    expect(source).toContain("new Set(['context-menu'])");
    expect(html.match(/data-review-section="reviewed"/g)).toHaveLength(1);
    expect(html).toContain('UiActionMenu Candidate · UiContextMenu Current');
    expect(html).toContain('兩種 caller trigger');
  });
});
