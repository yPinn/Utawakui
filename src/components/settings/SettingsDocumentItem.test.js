import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

async function renderItem(props = {}, slots = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(
          SettingsDocumentItem,
          {
            title: '曲庫位置',
            description: '下載與匯入的曲目會存放在這裡。',
            guidance: '切換位置不會搬移既有曲目。',
            value: 'C:\\Music\\Utawakui',
            status: '預設',
            ...props,
          },
          slots,
        ),
    }),
  );
}

describe('SettingsDocumentItem', () => {
  it('keeps state with its description and feedback outside the action group', async () => {
    const html = await renderItem(
      {},
      {
        actions: () => h('button', '操作'),
        feedback: () => h('p', '操作失敗'),
      },
    );
    expect(html.indexOf('settings-document-item__current-state')).toBeLessThan(
      html.indexOf('settings-document-item__actions'),
    );
    expect(html).not.toContain('settings-document-item__detail');
    expect(html).toMatch(
      /settings-document-item__actions[^>]*>[\s\S]*?<button[^>]*>操作<\/button>[\s\S]*?<\/div><div[^>]*settings-document-item__feedback/u,
    );
  });
  it('announces changing process status only when the caller opts in', async () => {
    expect(await renderItem({ statusLive: true })).toMatch(
      /class="ui-chip[^>]*role="status"/u,
    );
    expect(await renderItem()).not.toContain('role="status"');
  });
  it('renders one readable document field with its state and action together', async () => {
    const html = await renderItem(
      {},
      {
        actions: () => h('button', { type: 'button' }, '開啟資料夾'),
      },
    );

    expect(html).toContain('settings-document-item--default');
    expect(html).toContain('<h3');
    expect(html).toContain('曲庫位置');
    expect(html).toContain('下載與匯入的曲目會存放在這裡。');
    expect(html).toContain('切換位置不會搬移既有曲目。');
    expect(html).toContain('C:\\Music\\Utawakui');
    expect(html).toContain('預設');
    expect(html).toContain('開啟資料夾');
    expect(
      html.match(/settings-document-item__supporting-copy/gu),
    ).toHaveLength(1);
    expect(html).toMatch(
      /<p[^>]*settings-document-item__supporting-copy[^>]*>下載與匯入的曲目會存放在這裡。 切換位置不會搬移既有曲目。<\/p>/u,
    );
    expect(html).not.toContain('settings-document-item__description');
    expect(html).not.toContain('settings-document-item__guidance');
  });

  it('omits supporting copy when neither description nor guidance adds information', async () => {
    const html = await renderItem({ description: '', guidance: '' });

    expect(html).not.toContain('settings-document-item__supporting-copy');
  });

  it('supports one level of settings under a feature header', async () => {
    const nested = await renderItem({ variant: 'nested' });

    expect(nested).toContain('settings-document-item--nested');
    expect(nested).toContain('<h4');
  });
});
