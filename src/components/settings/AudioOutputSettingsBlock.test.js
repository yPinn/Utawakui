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
  it('exposes a separately labelled capture master at 50% with its canonical reset', async () => {
    const html = await renderBlock();
    expect(html).toContain('擷取音量');
    expect(html).toContain('監聽音量獨立設定');
    expect(html).toContain('id="capture-master-volume"');
    expect(html).toContain('ui-field--label-end');
    expect(html).toContain('aria-valuetext="50%"');
    expect(html).toMatch(
      /<output[^>]+for="capture-master-volume"[^>]*>50%<\/output>/u,
    );
    const zero = await renderBlock({ captureVolume: 0 });
    expect(zero).toContain('aria-valuetext="0%"');
    expect(zero).toMatch(
      /<output[^>]+for="capture-master-volume"[^>]*>0%<\/output>/u,
    );
  });
  it('keeps the section body concise and leaves its heading to the Folder section', async () => {
    const html = await renderBlock();

    expect(html).not.toContain('>音訊輸出<');
    expect(html).toContain('音訊擷取');
    expect(html).toContain('供直播或錄影擷取');
    expect(html).toContain('未啟用');
    expect(html).not.toContain('未選擇');
    const chooseButton = html
      .match(/<button\b[^>]*>[\s\S]*?<\/button>/gu)
      ?.find((button) => button.includes('選擇裝置'));
    expect(chooseButton).toContain('aria-haspopup="dialog"');
    expect(chooseButton).toContain('ui-btn--secondary');
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
