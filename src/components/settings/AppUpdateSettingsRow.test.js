import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import AppUpdateSettingsRow from './AppUpdateSettingsRow.vue';

async function renderRow(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(AppUpdateSettingsRow, {
          currentVersion: '0.1.1',
          enabled: true,
          phase: 'idle',
          ...props,
        }),
    }),
  );
}

describe('AppUpdateSettingsRow', () => {
  it('shows the installed version and a manual check action while idle', async () => {
    const html = await renderRow();

    expect(html).toContain('v0.1.1 · 可檢查是否有新版本');
    expect(html).toContain('aria-label="檢查更新"');
    expect(html).toContain('title="檢查更新 Utawakui"');
    expect(html).not.toContain('>檢查更新<');
  });

  it('shows explicit download and restart actions for the update lifecycle', async () => {
    const available = await renderRow({
      phase: 'available',
      availableVersion: '0.2.0',
    });
    const downloaded = await renderRow({
      phase: 'downloaded',
      availableVersion: '0.2.0',
      progress: 100,
    });

    expect(available).toContain('可下載 v0.2.0');
    expect(available).toContain('aria-label="下載"');
    expect(available).not.toContain('>下載<');
    expect(downloaded).toContain('v0.2.0 已準備完成');
    expect(downloaded).toContain('>重新啟動並安裝<');
  });

  it('uses bounded fallback copy when updater metadata omits a version', async () => {
    const html = await renderRow({ phase: 'available' });

    expect(html).toContain('可下載 新版本');
    expect(html).not.toContain('null');
  });

  it('keeps progress geometry stable without offering a second action', async () => {
    const html = await renderRow({ phase: 'downloading', progress: 42.3 });

    expect(html).toContain('正在下載 42.3%');
    expect(html).not.toContain('<button');
  });

  it('shows download rate and remaining time when the updater reports them', async () => {
    const html = await renderRow({
      phase: 'downloading',
      progress: 42.3,
      downloadBytesPerSecond: 3_145_728,
      downloadEtaSeconds: 25,
    });

    expect(html).toContain('正在下載 42.3% · 3.0 MB/s · 剩餘約 25 秒');
  });

  it('offers an automatic-check toggle, disabled outside a packaged build', async () => {
    const on = await renderRow({ phase: 'idle', autoCheckEnabled: true });
    const off = await renderRow({ enabled: false, phase: 'disabled' });

    expect(on).toContain('自動檢查');
    expect(on).toContain('aria-label="啟動與定期自動檢查是否有新版本"');
    expect(on).toContain('checked');
    expect(off).toMatch(/id="app-update-auto-check"[^>]*disabled/);
  });

  it('discloses the default background version check before the toggle', async () => {
    const html = await renderRow({ phase: 'idle' });

    expect(html).toContain('自動檢查是否有新版本，只查詢，不會下載或安裝。');
  });

  it('surfaces a preference-save failure without a second update action', async () => {
    const html = await renderRow({
      phase: 'idle',
      autoCheckError: '目前無法儲存自動檢查更新設定，請再試一次。',
    });

    expect(html).toContain('自動檢查更新設定未儲存');
  });

  it('shows the disabled and safe error states without remote details', async () => {
    const disabled = await renderRow({ enabled: false, phase: 'disabled' });
    const failed = await renderRow({
      phase: 'error',
      error: '無法完成更新操作，請稍後再試。',
    });

    expect(disabled).toContain('開發版不支援自動更新');
    expect(disabled).toContain('正式安裝版才可使用');
    expect(disabled).toContain('aria-label="檢查更新"');
    expect(disabled).not.toContain('>檢查更新<');
    expect(disabled).toContain('disabled');
    expect(failed).toContain('無法完成更新操作，請稍後再試。');
    expect(failed).toContain('aria-label="檢查更新"');
    expect(failed).not.toContain('>檢查更新<');
  });
});
