import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoOverlays from './DemoOverlays.vue';

const source = readFileSync(
  new URL('./DemoOverlays.vue', import.meta.url),
  'utf8',
);

describe('DemoOverlays overlay checkpoints', () => {
  it('keeps action menu and modal Candidate／Current reviews in the shared catalogue', async () => {
    const html = await renderToString(
      createSSRApp(DemoOverlays, {
        sections: [
          {
            key: 'context-menu',
            title: '動作選單',
            components: ['UiActionMenu Candidate', 'UiContextMenu Current'],
          },
          {
            key: 'modal',
            title: '對話框',
            components: ['UiModal'],
          },
        ],
      }),
    );

    expect(source).toContain("new Set(['context-menu', 'modal'])");
    expect(html.match(/data-review-section="reviewed"/g)).toHaveLength(2);
    expect(html).toContain('UiActionMenu Candidate · UiContextMenu Current');
    expect(html).toContain('兩種 caller trigger');
    expect(html).toContain('Token v2 候選 UiModal');
    expect(html).toContain('現行 UiModal');
    expect(source).toContain(
      "import DemoModalAppearance from './DemoModalAppearance.vue'",
    );
  });
});
