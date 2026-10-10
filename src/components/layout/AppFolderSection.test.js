import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppFolderSection from './AppFolderSection.vue';

const source = readFileSync(
  new URL('./AppFolderSection.vue', import.meta.url),
  'utf8',
);

function render(props, slots = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(AppFolderSection, props, {
          default: () => h('p', 'body'),
          ...slots,
        }),
    }),
  );
}

describe('AppFolderSection', () => {
  it('labels the section by its heading at the requested level', async () => {
    const html = await render({ title: '專輯', meta: '1 張', headingLevel: 3 });
    const id = html.match(/<h3 id="([^"]+)"/u)?.[1];

    expect(id).toBeTruthy();
    expect(html).toContain(`aria-labelledby="${id}"`);
    expect(html).toContain('app-folder-section__meta');
    expect(html).toContain('<p>body</p>');
  });

  it('omits empty meta and actions', async () => {
    const html = await render({ title: '專輯' });
    expect(html).not.toContain('app-folder-section__meta');
    expect(html).not.toContain('app-folder-section__actions');
  });

  it('renders trailing actions and content language', async () => {
    const html = await render(
      { title: '更多來自 王以太 的內容', titleLang: 'zh-Hans' },
      { actions: () => h('button', { type: 'button' }, '顯示全部') },
    );
    expect(html).toMatch(/<h2[^>]*lang="zh-Hans"/u);
    expect(html).toContain('顯示全部');
  });

  it('uses Folder heading tokens and the display face', () => {
    expect(source).toContain('gap: var(--ui-folder-section-gap);');
    expect(source).toContain(
      'border-bottom: var(--ui-border-width) solid var(--ui-color-border-strong);',
    );
    expect(source).toContain('font-family: var(--ui-font-family-display);');
    expect(source).toContain('font-family: var(--ui-font-family-utility);');
  });
});
