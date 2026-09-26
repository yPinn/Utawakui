import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import WindowCloseDecisionModal from './WindowCloseDecisionModal.vue';

async function renderModal(props) {
  const context = {};
  await renderToString(
    createSSRApp(WindowCloseDecisionModal, {
      open: false,
      remember: false,
      isResponding: false,
      error: '',
      ...props,
    }),
    context,
  );
  return context.teleports?.body ?? '';
}

describe('WindowCloseDecisionModal', () => {
  it('renders nothing until main requests a close decision', async () => {
    expect(await renderModal()).not.toContain('關閉 Utawakui');
  });

  it('uses the production modal vocabulary for every close choice', async () => {
    const html = await renderModal({ open: true });

    expect(html).toContain('ui-modal--notice');
    expect(html).toContain('關閉 Utawakui');
    expect(html).toContain('在背景執行');
    expect(html).toContain('完全結束');
    expect(html).toContain('取消');
    expect(html).toContain('記住我的選擇');
    expect(html).toContain('type="checkbox"');
  });

  it('shows bounded recovery copy and disables actions while responding', async () => {
    const html = await renderModal({
      open: true,
      isResponding: true,
      error: '目前無法完成關閉操作，請再試一次。',
    });

    expect(html).toContain('目前無法完成關閉操作，請再試一次。');
    expect(html).toContain('disabled');
  });
});
