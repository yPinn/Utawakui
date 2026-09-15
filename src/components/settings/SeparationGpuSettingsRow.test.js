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
  it('shows the GPU acceleration option, checked by default', async () => {
    const html = await renderRow();

    expect(html).toContain('人聲分離');
    expect(html).toContain('GPU 加速（建議）');
    expect(html).toContain('aria-label="使用 GPU 加速人聲分離"');
    expect(html).toContain('checked');
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
