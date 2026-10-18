import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import SeparationGpuSettingsRow from './SeparationGpuSettingsRow.vue';

async function renderRow(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(SeparationGpuSettingsRow, {
          gpuAcceleration: true,
          ...props,
        }),
    }),
  );
}

describe('SeparationGpuSettingsRow', () => {
  it('keeps the GPU option on one line and moves fallback detail to the tooltip', async () => {
    const html = await renderRow();

    expect(html).toContain('人聲分離');
    expect(html).toContain('>GPU 加速 <!----></label>');
    expect(html).toContain('GPU 無法使用時改用 CPU。');
    expect(html).not.toContain('title="GPU 無法使用時改用 CPU。"');
    expect(html).toContain('aria-label="使用 GPU 加速人聲分離"');
    expect(html).toContain('checked');
    expect(html).not.toContain('settings-action-row__value');
    expect(html).not.toContain('quick／general');
    expect(html).not.toContain('（建議）');
  });

  it('renders unchecked when the preference is off', async () => {
    const html = await renderRow({ gpuAcceleration: false });

    expect(html).not.toContain('checked');
  });

  it('shows a bounded error when the preference failed to save', async () => {
    const html = await renderRow({
      preferenceError: '目前無法儲存 GPU 加速設定，請再試一次。',
    });

    expect(html).toContain('目前無法儲存 GPU 加速設定');
  });
});
