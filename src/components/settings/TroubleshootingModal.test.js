import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TroubleshootingModal from './TroubleshootingModal.vue';

const mocks = vi.hoisted(() => ({
  captureErrorNotice: { value: null },
  obsState: {
    desired: { enabled: true },
    observed: { lifecycle: 'error' },
    statusLoaded: true,
    statusReadError: '',
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
  beforeEach(() => {
    mocks.captureErrorNotice.value = null;
    mocks.obsState.desired.enabled = true;
    mocks.obsState.observed.lifecycle = 'error';
    mocks.obsState.statusReadError = '';
    mocks.obsState.error = null;
  });

  it('presents common issues in workflow order, with one visible entry for feedback', async () => {
    mocks.captureErrorNotice.value = {
      code: 'AUDIO_OUTPUT_DEVICE_UNAVAILABLE',
    };
    mocks.obsState.error = { code: 'OBS_CONNECTION_REFUSED' };
    const closed = await renderModal(false);
    const open = await renderModal(true);
    expect(open).toContain('role="dialog"');
    let previous = -1;
    for (const text of [
      '常見問題',
      '曲庫與播放',
      '掃描缺少的音檔',
      '檢查曲庫',
      '音訊擷取',
      '重新接上裝置',
      '擷取裝置無法使用',
      'OBS 連線</h4>',
      '請先開啟 OBS',
      '等待 OBS 連線',
      '連線設定',
      '更多支援選項',
      'class="ui-modal__footer"',
      '回報與建議',
    ]) {
      expect(closed).not.toContain(text);
      const position = open.indexOf(text);
      expect(position, text).toBeGreaterThan(previous);
      previous = position;
    }
    expect(open).toContain('音訊設定');
    expect(open.match(/>回報與建議</gu)).toHaveLength(1);
    const disclosure = open.match(
      /<details[^>]*class="[^"]*\bui-disclosure\b[^"]*"[^>]*>/u,
    );
    expect(disclosure?.[0]).toBeDefined();
    expect(disclosure?.[0]).not.toMatch(/\sopen(?:[=\s>])/u);
    for (const advanced of ['匯出支援包', '嚴重錯誤回報', '錯誤紀錄']) {
      expect(open).not.toContain(advanced);
    }
  });

  it('keeps a confirmed connection cause and capture processing interruption distinct', async () => {
    mocks.captureErrorNotice.value = { code: 'AUDIO_OUTPUT_PROCESSING_FAILED' };
    mocks.obsState.error = {
      code: 'OBS_AUTH_FAILED',
      message: 'OBS 密碼錯誤或未設定。',
    };
    const open = await renderModal(true);
    expect(open).toContain('密碼與 OBS WebSocket 設定一致');
    expect(open).toContain('擷取輸出中斷');
    expect(open).not.toContain('請先開啟 OBS');
    expect(open).not.toContain('重新接上裝置');
  });

  it('offers setup guidance before either integration reports a problem', async () => {
    mocks.obsState.desired.enabled = false;
    mocks.obsState.observed.lifecycle = 'disabled';
    const open = await renderModal(true);
    expect(open).toContain('本機有聲、OBS 沒聲時');
    expect(open).toContain('音訊設定');
    expect(open).toContain('若要記錄場次時間');
    expect(open).toContain('未啟用');
    expect(open).toContain('連線設定');
    expect(open).not.toContain('等待 OBS 連線');
  });

  it('offers a status retry instead of showing a stale OBS connection cause', async () => {
    mocks.obsState.statusReadError = '請重新讀取 OBS 狀態。';
    mocks.obsState.error = { code: 'OBS_CONNECTION_REFUSED' };
    const open = await renderModal(true);
    expect(open).toContain('無法讀取連線狀態');
    expect(open).toContain('請重新讀取 OBS 狀態。');
    expect(open).toContain('>重新讀取<');
    expect(open).not.toContain('等待 OBS 連線');
  });
});
