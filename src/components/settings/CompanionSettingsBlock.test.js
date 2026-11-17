import { createSSRApp, h, readonly, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import CompanionSettingsBlock from './CompanionSettingsBlock.vue';

function settingsWith(status, extra = {}) {
  return {
    status: readonly(shallowRef(status)),
    busy: readonly(shallowRef(false)),
    error: readonly(shallowRef(extra.error ?? '')),
    pairing: readonly(shallowRef(extra.pairing ?? null)),
    start: async () => true,
    stop: () => {},
    configure: async () => true,
    beginPairing: async () => true,
    cancelPairing: async () => true,
    revoke: async () => true,
    revokeAll: async () => true,
  };
}

const render = (settings) =>
  renderToString(
    createSSRApp({ render: () => h(CompanionSettingsBlock, { settings }) }),
  );

const base = {
  enabled: true,
  running: true,
  interfaceAddress: '192.168.1.20',
  port: 8710,
  error: null,
  interfaces: [
    { name: 'Wi-Fi', address: '192.168.1.20', privateNetwork: true },
    { name: 'Hotel', address: '10.0.0.8', privateNetwork: false },
  ],
  devices: [
    { id: 'd1', label: 'Pixel', lastSeenAt: '2026-11-17T12:00:00Z' },
    { id: 'd2', label: 'iPhone', lastSeenAt: '2026-11-17T12:00:00Z' },
  ],
  pairing: { pending: false },
};

describe('CompanionSettingsBlock', () => {
  it('shows the running address, labelled networks and paired phones', async () => {
    const html = await render(settingsWith(base));
    expect(html).toContain('手機可連線');
    expect(html).toContain('http://192.168.1.20:8710/m/');
    expect(html).toContain('Wi-Fi（192.168.1.20）');
    expect(html).toContain('Hotel（10.0.0.8，公用網路）');
    expect(html).toContain('移除 Pixel');
    expect(html).toContain('全部移除');
    expect(html).toContain('請只允許私人網路');
  });

  it('shows the one-time pairing address while pairing', async () => {
    const html = await render(
      settingsWith(base, {
        pairing: { url: 'http://192.168.1.20:8710/m/#pair=abc', expiresAt: 1 },
      }),
    );
    expect(html).toContain('#pair=abc');
    expect(html).toContain('取消配對');
    expect(html).not.toContain('>配對手機<');
  });

  it('explains public networks and missing interfaces', async () => {
    const blocked = await render(
      settingsWith({ ...base, running: false, error: 'public-network' }),
    );
    expect(blocked).toContain('請在 Windows 設定改為私人網路');
    expect(blocked).toContain('未開啟');
    const none = await render(
      settingsWith({ ...base, running: false, interfaces: [], devices: [] }),
    );
    expect(none).toContain('找不到私人網路');
    expect(none).toContain('還沒有配對的手機');
  });
});
