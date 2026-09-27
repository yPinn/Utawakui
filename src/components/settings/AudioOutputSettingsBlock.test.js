import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import AudioOutputSettingsBlock from './AudioOutputSettingsBlock.vue';

async function renderBlock(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(AudioOutputSettingsBlock, {
          enabled: false,
          deviceLabel: '未選擇',
          errorNotice: null,
          ...props,
        }),
    }),
  );
}

describe('AudioOutputSettingsBlock', () => {
  it('keeps the inactive presentation concise and actionable', async () => {
    const html = await renderBlock();

    expect(html).toContain('音訊輸出');
    expect(html).toContain('將伴奏送到直播或錄影軟體');
    expect(html).toContain('直播或錄影軟體使用的虛擬音效裝置');
    expect(html).not.toContain('OBS 擷取裝置');
    expect(html).not.toContain('OBS 用的虛擬音效裝置');
    expect(html).toContain('未啟用');
    expect(html).toContain('未選擇');
    expect(html).toContain('aria-label="選擇擷取輸出裝置"');
    expect(html).toContain('title="選擇擷取輸出裝置"');
    expect(html).not.toContain('>選擇裝置<');
    expect(html).not.toContain('僅透過');
  });

  it('reuses the shared notice component without exposing technical details', async () => {
    const html = await renderBlock({
      errorNotice: {
        severity: 'error',
        title: '擷取輸出已關閉',
        message: '先前的裝置無法使用。',
        actionLabel: '選擇裝置',
      },
    });

    expect(html).toContain('ui-notice');
    expect(html).toContain('role="alert"');
    expect(html).toContain('擷取輸出已關閉');
    expect(html).toContain('選擇裝置');
    expect(html).not.toContain('setSinkId');
    expect(html).not.toContain('deviceId');
  });

  it('shows the selected device and enabled state without extra helper copy', async () => {
    const html = await renderBlock({
      enabled: true,
      deviceLabel: 'CABLE Input (VB-Audio Virtual Cable)',
    });

    expect(html).toContain('已啟用');
    expect(html).toContain('CABLE Input (VB-Audio Virtual Cable)');
    expect(html).not.toContain('僅透過');
  });
});
