import { createSSRApp, h, readonly, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';
import AppCompanionApprovalModal from './AppCompanionApprovalModal.vue';

function companionWith(request) {
  return {
    status: readonly(
      shallowRef({ running: true, devices: [], pairing: { request } }),
    ),
    busy: readonly(shallowRef(false)),
    start: vi.fn(async () => true),
    stop: vi.fn(),
    refresh: vi.fn(async () => true),
    approve: vi.fn(async () => true),
    deny: vi.fn(async () => true),
  };
}

const render = (companion) =>
  renderToString(
    createSSRApp({
      render: () => h(AppCompanionApprovalModal, { companion }),
    }),
  );

describe('AppCompanionApprovalModal', () => {
  it('asks in a notice-sized dialog with the match code and both decisions', async () => {
    const html = await render(
      companionWith({
        id: 'r1',
        label: 'Pixel',
        matchCode: '4321',
        expiresAt: Date.now() + 60_000,
      }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('ui-modal--notice');
    expect(html).toContain('ui-modal--with-footer');
    expect(html).toContain('允許「Pixel」連線？');
    expect(html).toMatch(/<output[^>]*aria-label="對照代碼"[^>]*>4321</u);
    expect(html).toContain('不是你的手機請按拒絕');
    expect(html).toMatch(/ui-btn--secondary[\s\S]*拒絕/u);
    expect(html).toMatch(/ui-btn--accent[\s\S]*允許/u);
  });

  it('stays closed without a waiting phone', async () => {
    const html = await render(companionWith(null));
    expect(html).not.toContain('role="dialog"');
  });

  it('is mounted once at the App root, not inside Settings', () => {
    const app = readCatalogSource(new URL('../../App.vue', import.meta.url));
    const settings = readCatalogSource(
      new URL('../settings/CompanionSettingsBlock.vue', import.meta.url),
    );
    expect(app).toContain('<AppCompanionApprovalModal />');
    expect(settings).not.toContain('companion.approval.allow');
  });
});
