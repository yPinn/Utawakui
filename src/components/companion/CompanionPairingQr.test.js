import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import CompanionPairingQr from './CompanionPairingQr.vue';

describe('CompanionPairingQr', () => {
  it('renders a scannable SVG for the pairing address', async () => {
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
