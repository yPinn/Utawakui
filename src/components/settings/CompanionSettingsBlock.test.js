import { createSSRApp, h, readonly, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import CompanionSettingsBlock from './CompanionSettingsBlock.vue';

function settingsWith(status) {
  return {
    status: readonly(shallowRef(status)),
    busy: readonly(shallowRef(false)),
    start: vi.fn(async () => true),
    stop: vi.fn(),
    beginPairing: vi.fn(async () => true),
    revoke: vi.fn(async () => true),
    revokeAll: vi.fn(async () => true),
  };
}

const render = (settings) =>
  renderToString(
    createSSRApp({ render: () => h(CompanionSettingsBlock, { settings }) }),
  );

const base = {
  enabled: true,
  running: true,
  error: 'public-network',
  interfaces: [
    { name: 'Wi-Fi', address: '192.168.1.20', privateNetwork: true },
    { name: 'Ethernet', address: '192.168.1.30', privateNetwork: true },
  ],
  devices: [
    { id: 'd1', label: 'Pixel', lastSeenAt: '2026-11-17T12:00:00Z' },
    { id: 'd2', label: 'iPhone', lastSeenAt: '2026-11-17T12:00:00Z' },
  ],
  pairing: { pending: false },
};

describe('CompanionSettingsBlock', () => {
  it('keeps only the paired-phone record', async () => {
    const settings = settingsWith(base);
    const html = await render(settings);
    expect(html).toContain('已配對的手機');
    expect(html).toContain('上次連線');
    expect(html).toContain('移除 Pixel');
    expect(html).toContain('全部移除');
    // Pairing and connection controls live in the title-bar phone.
    for (const absent of [
      'companion-pairing-qr',
      'companion-interface',
      '>啟動<',
      '>停止<',
      '配對步驟',
      '私人網路',
      '手機可連線',
    ])
      expect(html).not.toContain(absent);
    expect(settings.beginPairing).not.toHaveBeenCalled();
  });

  it('offers renaming beside removal for each phone', async () => {
    const html = await render(settingsWith(base));
    expect(html).toContain('重新命名 Pixel');
    expect(html).toContain('重新命名 iPhone');
    expect(html).toMatch(/重新命名 Pixel[\s\S]*移除 Pixel/u);
  });

  it('points to the title-bar phone when nothing is paired', async () => {
    const html = await render(settingsWith({ ...base, devices: [] }));
    expect(html).toContain('尚未配對。按標題列的手機按鈕開始。');
    expect(html).not.toContain('全部移除');
  });
});
