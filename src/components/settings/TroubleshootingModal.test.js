import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import TroubleshootingModal from './TroubleshootingModal.vue';

const mocks = vi.hoisted(() => ({
  captureErrorNotice: { value: null },
  obsState: {
    desired: { enabled: true },
    observed: { lifecycle: 'error' },
    statusLoaded: true,
    error: null,
  },
}));

vi.mock('../../composables/useAudioOutput.js', () => ({
  useAudioOutput: () => ({
    captureErrorNotice: mocks.captureErrorNotice,
  }),
}));

vi.mock('../../composables/useObsIntegration.js', () => ({
  useObsIntegration: () => ({
    state: mocks.obsState,
  }),
}));

function renderModal(open) {
  return renderToString(
    createSSRApp({ render: () => h(TroubleshootingModal, { open }) }),
  );
}

describe('TroubleshootingModal', () => {
  it('renders active issues and actions only while the dialog is open', async () => {
    mocks.captureErrorNotice.value = {
      code: 'AUDIO_OUTPUT_DEVICE_UNAVAILABLE',
    };
    mocks.obsState.error = { code: 'OBS_CONNECTION_REFUSED' };
    const closed = await renderModal(false);
    const open = await renderModal(true);
    expect(open).toContain('role="dialog"');
    for (const text of [
      '使用環境檢查',
      '擷取裝置無法使用',
      '重新接上裝置',
      '音訊設定',
      '等待 OBS 連線',
      '請先開啟 OBS',
      '連線設定',
      '檢查曲庫',
      '匯出支援包',
      '填寫回報',
      '嚴重錯誤回報',
    ]) {
      expect(closed).not.toContain(text);
      expect(open).toContain(text);
    }
    expect(open).toContain('問題回報');
    expect(open.indexOf('檢查曲庫')).toBeLessThan(open.indexOf('填寫回報'));
  });

  it('keeps a confirmed connection cause and capture processing interruption distinct', async () => {
    mocks.captureErrorNotice.value = { code: 'AUDIO_OUTPUT_PROCESSING_FAILED' };
    mocks.obsState.error = {
      code: 'OBS_AUTH_FAILED',
      message: 'OBS 密碼錯誤或未設定。',
    };
    const open = await renderModal(true);
    expect(open).toContain('OBS 密碼錯誤或未設定。');
    expect(open).toContain('擷取輸出中斷');
    expect(open).not.toContain('請先開啟 OBS');
    expect(open).not.toContain('重新接上裝置');
  });
});
