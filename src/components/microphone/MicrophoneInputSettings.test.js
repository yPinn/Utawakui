import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MicrophoneInputSettings from './MicrophoneInputSettings.vue';
import { normalizeMicrophoneInputOptions } from '../../microphone/inputProcessing.js';

const support = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};
const render = (props) =>
  renderToString(
    createSSRApp(MicrophoneInputSettings, {
      options: normalizeMicrophoneInputOptions(),
      support,
      ...props,
    }),
  );
describe('microphone input settings presentation', () => {
  it('separates a requested noise option from confirmed, different and unknown states', async () => {
    const options = normalizeMicrophoneInputOptions({ noiseSuppression: true });
    expect(
      await render({ options, settings: { noiseSuppression: false } }),
    ).toContain('未按要求套用：實際關閉');
    expect(
      await render({ options, settings: { noiseSuppression: true } }),
    ).toContain('實際開啟');
    expect(await render({ options, settings: {} })).toContain(
      '輸入未回報，尚未確認是否生效',
    );
    expect(await render({ support: {} })).toContain('目前環境未確認支援');
  });
  it('offers the intended input controls without promising system volume or output changes', async () => {
    const html = await render({});
    for (const text of [
      '分析輸入增益',
      '低切濾波',
      '降噪',
      '回音消除',
      '自動增益',
      '只影響分析',
      '裝置回傳電平',
    ])
      expect(html).toContain(text);
  });
});
