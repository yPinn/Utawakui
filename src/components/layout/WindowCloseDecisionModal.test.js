import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import WindowCloseDecisionModal from './WindowCloseDecisionModal.vue';

async function renderModal(props) {
  return renderToString(
    createSSRApp(WindowCloseDecisionModal, {
      open: false,
      remember: false,
      isResponding: false,
      error: '',
      ...props,
    }),
  );
}

describe('WindowCloseDecisionModal', () => {
  it('renders nothing until main requests a close decision', async () => {
    expect(await renderModal()).not.toContain('關閉 Utawakui');
  });

  it('uses the production modal vocabulary for every close choice', async () => {
    const html = await renderModal({ open: true });

    expect(html).toContain('ui-modal--notice');
    expect(html).toContain('關閉 Utawakui');
    expect(html).toContain('背景執行');
    expect(html).toContain('結束');
    expect(html).toContain('取消');
    expect(html).toContain('記住選擇');
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

  it('renders a terminal close error as a notice with one acknowledgement action', async () => {
    const html = await renderModal({
      open: true,
      presentation: 'error',
      errorTitle: '無法在背景執行',
      error: '系統匣目前無法建立，視窗會保持開啟。',
    });

    expect(html).toContain('無法在背景執行');
    expect(html).toContain('系統匣目前無法建立，視窗會保持開啟。');
    expect(html).toContain('知道了');
    expect(html).not.toContain('結束');
    expect(html).not.toContain('記住選擇');
  });

  it('makes stopping active accompaniment work explicit and one-shot', async () => {
    const html = await renderModal({
      open: true,
      activeWork: 'separation',
      remember: true,
    });

    expect(html).toContain('伴奏處理中');
    expect(html).toContain('停止並結束');
    expect(html).toContain('在背景繼續');
    expect(html).toContain('ui-btn--intent-danger');
    expect(html).not.toContain('記住選擇');
  });
});
