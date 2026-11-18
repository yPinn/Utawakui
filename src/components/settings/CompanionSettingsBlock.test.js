import { createSSRApp, h, readonly, shallowRef } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
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
    approve: async () => true,
    deny: async () => true,
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
  it('shows paired phones without network details or setup help', async () => {
    const html = await render(settingsWith(base));
    expect(html).toContain('手機可連線');
    expect(html).not.toContain('8710');
    expect(html).not.toContain('companion-interface');
    expect(html).not.toContain('companion-port');
    expect(html).not.toContain('配對步驟');
    expect(html).not.toContain('請只允許私人網路');
    expect(html).toContain('移除 Pixel');
    expect(html).toContain('全部移除');
  });

  it('starts and stops with buttons instead of a checkbox', async () => {
    const running = await render(settingsWith(base));
    expect(running).toContain('>停止<');
    expect(running).not.toContain('>啟動<');
    expect(running).not.toContain('type="checkbox"');
    const off = await render(
      settingsWith({ ...base, enabled: false, running: false }),
    );
    expect(off).toContain('>啟動<');
    expect(off).not.toContain('>停止<');
    // A failed start can be retried or turned off.
    const failed = await render(
      settingsWith({ ...base, running: false, error: 'port-in-use' }),
    );
    expect(failed).toContain('>啟動<');
    expect(failed).toContain('>停止<');
  });

  it('guides the first pairing in two steps', async () => {
    const html = await render(settingsWith({ ...base, devices: [] }));
    expect(html).toContain('aria-label="配對步驟"');
    expect(html).toContain('用手機相機掃描下方 QR 碼。');
    expect(html).toContain('再按「允許」。');
    expect(html).not.toContain('配對手機');
    expect(html).toContain('請只允許私人網路');
  });

  it('offers a network choice only between several private networks', async () => {
    const html = await render(
      settingsWith({
        ...base,
        running: false,
        error: 'choose-interface',
        interfaces: [
          ...base.interfaces,
          { name: 'Ethernet', address: '192.168.1.30', privateNetwork: true },
        ],
      }),
    );
    expect(html).toContain('companion-interface');
    expect(html).toContain('請選擇手機也連著的那一個');
  });

  it('shows the QR by default and creates a code once running', async () => {
    const idle = settingsWith(base);
    idle.beginPairing = vi.fn(async () => true);
    const empty = await render(idle);
    expect(idle.beginPairing).toHaveBeenCalledOnce();
    expect(empty).toContain('companion-settings-block__qr');

    const html = await render(
      settingsWith(base, {
        pairing: {
          url: 'http://192.168.1.20:8710/m/#pair=abc',
          expiresAt: Date.now() + 60_000,
        },
      }),
    );
    expect(html).toContain('companion-pairing-qr');
    expect(html).toContain('aria-label="配對用 QR 碼"');
    expect(html).toContain('用手機相機掃描以加入手機');
    expect(html).not.toContain('配對碼已失效');
    expect(html).not.toContain('#pair=abc');
  });

  it('covers an expired code with a scrim that renews it', async () => {
    const html = await render(
      settingsWith(base, {
        pairing: {
          url: 'http://192.168.1.20:8710/m/#pair=abc',
          expiresAt: Date.now() - 1,
        },
      }),
    );
    expect(html).toContain('companion-pairing-qr');
    expect(html).toMatch(/ui-artwork-overlay[\s\S]*配對碼已失效/u);
    expect(html).toContain('ui-btn--overlay');
    expect(html).toContain('重新產生');
  });

  it('shows no QR while stopped', async () => {
    const stopped = settingsWith({ ...base, enabled: false, running: false });
    stopped.beginPairing = vi.fn(async () => true);
    const html = await render(stopped);
    expect(html).not.toContain('companion-settings-block__qr');
    expect(stopped.beginPairing).not.toHaveBeenCalled();
  });

  it('asks to allow a waiting phone with its match code', async () => {
    const html = await render(
      settingsWith({
        ...base,
        pairing: {
          pending: true,
          request: {
            id: 'r1',
            label: 'Pixel',
            matchCode: '4321',
            expiresAt: 1,
          },
        },
      }),
    );
    expect(html).toContain('允許「Pixel」連線？');
    expect(html).toContain('4321');
    expect(html).toContain('不是你的手機請按拒絕');
    expect(html).toContain('>允許<');
    expect(html).toContain('>拒絕<');
    // The approval takes the QR's place until it is answered.
    expect(html).not.toContain('companion-settings-block__qr');
  });

  it('explains public networks, missing networks and busy connections', async () => {
    const blocked = await render(
      settingsWith({ ...base, running: false, error: 'public-network' }),
    );
    expect(blocked).toContain('請在 Windows 設定改為私人網路');
    expect(blocked).toContain('未開啟');
    const none = await render(
      settingsWith({
        ...base,
        running: false,
        error: 'no-interface',
        interfaces: [],
      }),
    );
    expect(none).toContain('找不到可用的網路');
    const busy = await render(
      settingsWith({ ...base, running: false, error: 'port-in-use' }),
    );
    expect(busy).toContain('請關閉其他程式，之後會自動重試');
  });
});

describe('CompanionPairingQr', () => {
  it('renders a scannable SVG for the pairing address', async () => {
    const { default: CompanionPairingQr } =
      await import('./CompanionPairingQr.vue');
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(CompanionPairingQr, {
            value: 'http://192.168.1.20:8710/m/#pair=abc',
            label: '配對用 QR 碼',
          }),
      }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="配對用 QR 碼"');
    const [, width, height] = html.match(/viewBox="0 0 (\d+) (\d+)"/iu) ?? [];
    expect(Number(width)).toBeGreaterThan(20);
    expect(height).toBe(width);
    expect(html).toMatch(/d="M\d+ \d+h1v1h-1z/u);
  });
});
