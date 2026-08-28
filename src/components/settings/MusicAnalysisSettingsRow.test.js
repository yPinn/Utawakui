import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MusicAnalysisSettingsRow from './MusicAnalysisSettingsRow.vue';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('./MusicAnalysisSettingsRow.vue', import.meta.url),
  'utf8',
);

async function renderRow(props = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(MusicAnalysisSettingsRow, {
          capability: {
            status: 'ready',
            installed: true,
            modelName: 'Beat This! small0',
            modelVersion: '1.1.0',
            downloadBytes: 159368729,
            installedBytesEstimate: 557000000,
            canRepair: true,
            canRemove: true,
          },
          autoAnalyze: true,
          stageLabel: '分析功能已就緒',
          ...props,
        }),
    }),
  );
}

describe('MusicAnalysisSettingsRow', () => {
  it('shows a concise purpose and automatic option without capacity or model details', async () => {
    const html = await renderRow();

    expect(html).toContain('BPM 分析');
    expect(html).toContain('產生 BPM 與節拍資料');
    expect(html).toContain('本機 BPM／節拍');
    expect(html).toContain('自動分析');
    expect(html).toContain('aria-label="匯入歌曲後自動分析 BPM 與節拍"');
    expect(html).toContain('checked');
    expect(html).toContain('BPM 分析選項');
    expect(html).not.toContain('約 152 MB');
    expect(html).not.toContain('約 532 MB');
    expect(html).not.toContain('匯入後自動分析');
    expect(html).not.toContain('Beat This!');
    expect(html).not.toContain('1.1.0');
    expect(html).not.toContain('Python');
    expect(html).not.toContain('runtime');
    expect(html).not.toContain('sidecar');
  });

  it('reuses the parent feature-group inset instead of drawing another one', () => {
    expect(source).not.toContain('border-inline-start');
    expect(source).not.toContain('padding-inline-start');
  });

  it('uses the shared dependency actions without a Settings information modal', () => {
    expect(source).toContain('SettingsDependencyActions');
    expect(source).not.toContain('MusicAnalysisCapabilityModal');
    expect(source).not.toContain('modelName');
    expect(source).not.toContain('modelVersion');
  });

  it('offers preparation when the component is missing', async () => {
    const html = await renderRow({
      capability: {
        status: 'missing',
        installed: false,
        modelName: 'Beat This! small0',
        downloadBytes: 159368729,
        installedBytesEstimate: 557000000,
        canPrepare: true,
      },
      stageLabel: '尚未安裝分析功能',
    });

    expect(html).toContain('未準備');
    expect(html).toContain('準備 BPM 分析');
  });

  it('offers repair directly when the installed component is damaged', async () => {
    const html = await renderRow({
      capability: {
        status: 'damaged',
        installed: true,
        modelName: 'Beat This! small0',
        canRepair: true,
      },
      stageLabel: '分析功能需要修復',
    });

    expect(html).toContain('需要修復');
    expect(html).toContain('修復 BPM 分析');
  });

  it('shows bounded preference and capability errors', async () => {
    const html = await renderRow({
      capabilityError: '目前無法讀取分析功能狀態，請重新啟動後再試。',
      preferenceError: '目前無法儲存自動分析設定，請再試一次。',
    });

    expect(html).toContain('目前無法讀取分析功能狀態');
    expect(html).toContain('目前無法儲存自動分析設定');
  });
});
