import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppFolderContentField from './AppFolderContentField.vue';

const source = readFileSync(
  new URL('./AppFolderContentField.vue', import.meta.url),
  'utf8',
);

describe('AppFolderContentField', () => {
  it('provides one semantic expandable field without card chrome', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(AppFolderContentField, { 'aria-label': '曲目內容範圍' }, () =>
            h('p', '曲目清單'),
          ),
      }),
    );

    expect(html).toContain('class="app-folder-content-field"');
    expect(html).toContain('aria-label="曲目內容範圍"');
    expect(html).toContain('曲目清單');
    expect(source).toContain('background: var(--ui-folder-content-background)');
    expect(source).toMatch(
      /\.app-folder-content-field\s*\{[^}]*flex:\s*0 0 auto;/su,
    );
    expect(source).not.toMatch(/flex:\s*1 0 auto/u);
    expect(source).not.toMatch(/border(?:-radius)?\s*:/u);
  });

  it('offers one bounded state variant without changing the default terminus', async () => {
    const defaultHtml = await renderToString(
      createSSRApp({
        render: () => h(AppFolderContentField, null, () => h('p', '曲目清單')),
      }),
    );
    const stateHtml = await renderToString(
      createSSRApp({
        render: () =>
          h(AppFolderContentField, { variant: 'state' }, () =>
            h('p', '載入中…'),
          ),
      }),
    );

    expect(defaultHtml).toContain('class="app-folder-content-field"');
    expect(defaultHtml).not.toContain('app-folder-content-field--state');
    expect(stateHtml).toContain(
      'class="app-folder-content-field app-folder-content-field--state"',
    );
    expect(source).toContain(
      "validator: (value) => ['content', 'state'].includes(value)",
    );
    expect(source).toMatch(
      /\.app-folder-content-field--state\s*\{[^}]*min-block-size:\s*var\(--ui-folder-content-state-min-block-size\);/su,
    );
  });
});
