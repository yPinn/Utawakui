import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoFoundations from './DemoFoundations.vue';

const tokenSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);

const sections = [
  { key: 'system-palette', title: '系統預設色' },
  { key: 'folder-palette', title: 'Folder 高彩度參考' },
  { key: 'status-palette', title: 'Mildliner 狀態色' },
  { key: 'spacing-shape', title: '間距與形狀' },
];

const geometryScales = [
  { token: '--ui-space-1', rem: '0.25rem', dip: 4 },
  { token: '--ui-space-2', rem: '0.5rem', dip: 8 },
  { token: '--ui-space-3', rem: '0.75rem', dip: 12 },
  { token: '--ui-space-4', rem: '1rem', dip: 16 },
  { token: '--ui-space-5', rem: '1.5rem', dip: 24 },
  { token: '--ui-space-6', rem: '2rem', dip: 32 },
  {
    token: '--ui-radius-xs',
    rem: '0.125rem',
    dip: 2,
  },
  { token: '--ui-radius-sm', rem: '0.25rem', dip: 4 },
  {
    token: '--ui-radius-md',
    rem: '0.375rem',
    dip: 6,
  },
  { token: '--ui-radius-lg', rem: '0.5rem', dip: 8 },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('DemoFoundations review', () => {
  it('separates system, folder, and status color responsibilities', async () => {
    const html = await renderToString(
      createSSRApp(DemoFoundations, { sections }),
    );

    expect(html).toContain('中性系統介面');
    expect(html).toContain('高彩度只屬於 Folder');
    expect(html).toContain('參考樣本，尚未寫入 token');
    expect(html).toContain('Mildliner');
    expect(html).toContain('色票來源，不是筆觸外觀');
    expect(html).toContain('原色 100%');
    expect(html).toContain('Soft 背景（選用）');
  });

  it('separates current, live, and danger with stable non-color cues', async () => {
    const html = await renderToString(
      createSSRApp(DemoFoundations, { sections }),
    );

    expect(html).toContain('data-signal-role="current"');
    expect(html).toContain('data-signal-role="live"');
    expect(html).toContain('data-signal-role="danger"');
    expect(html).toContain('播放圖示＋列側線');
    expect(html).toContain('圓點＋LIVE 標籤');
    expect(html).toContain('× 圖示＋訊息／操作');
  });

  it('shows the exact review values without promoting folder samples', async () => {
    const html = await renderToString(
      createSSRApp(DemoFoundations, { sections }),
    );

    for (const value of [
      '#191A1E',
      '#E8E4DD',
      '#1E4BD7',
      '#D71E1E',
      '#0C7866',
      '#581E70',
      '#FFE927',
      '#7EC9ED',
      '#1D6888',
    ]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain('--ui-color-folder-reference');
  });

  it('presents rem-first geometry with DIP only as default-root context', async () => {
    const html = await renderToString(
      createSSRApp(DemoFoundations, { sections }),
    );

    for (const scale of geometryScales) {
      expect(tokenSource).toContain(`${scale.token}: ${scale.rem};`);
      expect(html).toMatch(
        new RegExp(
          `data-scale-token="${escapeRegExp(scale.token)}"[^>]*>[\\s\\S]*?${escapeRegExp(scale.token)}[\\s\\S]*?${escapeRegExp(scale.rem)}[\\s\\S]*?${scale.dip} DIP[\\s\\S]*?</tr>`,
          'u',
        ),
      );
    }

    expect(html).not.toContain('>4px<');
    expect(html).not.toContain('>6px<');
  });

  it('keeps specimen geometry separate from visible labels and values', async () => {
    const html = await renderToString(
      createSSRApp(DemoFoundations, { sections }),
    );

    for (const scale of ['spacing', 'radius']) {
      const preview = html.match(
        new RegExp(
          `<div[^>]*data-demo-preview="${scale}"[^>]*>([\\s\\S]*?)</div>`,
          'u',
        ),
      )?.[1];

      expect(preview).toBeDefined();
      expect(preview).not.toContain('<code');
      expect(preview).not.toContain('DIP');
      expect(preview).not.toContain('rem</');
      expect(html).toContain(`data-demo-reference="${scale}"`);
    }
  });

  it('shows the four distinct unit responsibilities', async () => {
    const html = await renderToString(
      createSSRApp(DemoFoundations, { sections }),
    );

    expect(html).toContain('可縮放 UI 幾何');
    expect(html).toContain('精準光學邊界');
    expect(html).toContain('Electron 視窗幾何');
    expect(html).toContain('Raster／canvas backing');
    expect(html).toContain('CSS breakpoint');
    expect(html).toContain('不作 CSS layout');
  });
});
