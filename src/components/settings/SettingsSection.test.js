import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { expect, it } from 'vitest';
import SettingsSection from './SettingsSection.vue';

it('creates a named functional chapter with its actions and content in one section', async () => {
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(
          SettingsSection,
          { title: '本機音訊處理' },
          {
            actions: () => h('button', '重新讀取'),
            default: () => h('div', '自動分析設定'),
          },
        ),
    }),
  );
  const id = html.match(/aria-labelledby="([^"]+)"/)[1];
  expect(html).toContain(`<h2 id="${id}"`);
  expect(html).toContain('本機音訊處理');
  expect(html.indexOf('重新讀取')).toBeLessThan(
    html.indexOf('settings-section__content'),
  );
  expect(html).toContain('自動分析設定');
});
