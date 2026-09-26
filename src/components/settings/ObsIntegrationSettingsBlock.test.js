import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import ObsIntegrationSettingsBlock from './ObsIntegrationSettingsBlock.vue';

async function renderBlock(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(ObsIntegrationSettingsBlock, {
          status: {
            desired: { enabled: true },
            observed: { lifecycle: 'ready' },
            error: null,
          },
          ...props,
        }),
    }),
  );
}

describe('ObsIntegrationSettingsBlock', () => {
  it('offers explicit credential removal only when a password is stored', async () => {
    const stored = await renderBlock({ hasStoredPassword: true });
    const empty = await renderBlock({ hasStoredPassword: false });

    expect(stored).toContain('移除已儲存密碼');
    expect(empty).not.toContain('移除已儲存密碼');
  });

  it('keeps stored credential removal reachable while the feature and connection are disabled', async () => {
    const featureDisabled = await renderBlock({
      featureEnabled: false,
      hasStoredPassword: true,
      status: {
        desired: { enabled: false },
        observed: { lifecycle: 'disabled' },
        error: null,
      },
    });
    const connectionDisabled = await renderBlock({
      hasStoredPassword: true,
      status: {
        desired: { enabled: false },
        observed: { lifecycle: 'disabled' },
        error: null,
      },
    });

    for (const html of [featureDisabled, connectionDisabled]) {
      expect(html).toContain('這台電腦已儲存 OBS 密碼');
      expect(html).toContain('移除已儲存密碼');
      expect(html).not.toContain('id="obs-integration-password"');
    }
    expect(featureDisabled).not.toContain('aria-label="啟用 OBS 連線"');
    expect(connectionDisabled).toContain('aria-label="啟用 OBS 連線"');
  });

  it('bounds the password field and disables credential actions while saving', async () => {
    const html = await renderBlock({
      hasStoredPassword: true,
      isSaving: true,
    });

    expect(html).toMatch(/id="obs-integration-password"[^>]*maxlength="1024"/);
    expect(html).toContain('移除已儲存密碼');
    expect(html).toContain('disabled');
  });
});
