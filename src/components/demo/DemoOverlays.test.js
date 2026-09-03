import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoOverlays from './DemoOverlays.vue';

const source = readFileSync(
  new URL('./DemoOverlays.vue', import.meta.url),
  'utf8',
);

describe('DemoOverlays context-menu trigger', () => {
  it('does not let the opener click reach the window close listener', () => {
    const openHandler = source.match(
      /function openContextMenu\(event\) \{(?<body>[\s\S]*?)\n\}/,
    )?.groups?.body;

    expect(openHandler).toContain('event.stopPropagation()');
    expect(openHandler.indexOf('event.stopPropagation()')).toBeLessThan(
      openHandler.indexOf('contextMenu.value'),
    );
  });

  it('announces the popup relationship and initial state', async () => {
    const html = await renderToString(
      createSSRApp(DemoOverlays, {
        sections: [
          {
            key: 'context-menu',
            title: '快顯選單',
            components: ['UiContextMenu'],
          },
        ],
      }),
    );

    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
  });
});
