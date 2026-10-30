import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MicrophoneThresholdCalibration from './MicrophoneThresholdCalibration.vue';

const conditions = { selectedDeviceId: 'mic-a' };
const summary = {
  count: 100,
  p10Dbfs: -65,
  medianDbfs: -64,
  p95Dbfs: -60,
  maxDbfs: -58,
  nearClipCount: 0,
  conditions,
};
const results = {
  quiet: summary,
  voice: {
    ...summary,
    p10Dbfs: -40,
    medianDbfs: -35,
    p95Dbfs: -32,
    maxDbfs: -30,
  },
};
const render = (props = {}) =>
  renderToString(
    createSSRApp(MicrophoneThresholdCalibration, {
      results,
      options: { mode: 'manual', openThreshold: -55, closeThreshold: -61 },
      running: true,
      ...props,
    }),
  );

describe('microphone calibration presentation', () => {
  it('shows a session-only proposal while keeping the actual threshold separate', async () => {
    const html = await render();
    expect(html).toContain('目前 -55／-61 dBFS');
    expect(html).toMatch(
      /建議開啟.*>-50<\/output>／關閉.*>-56 dBFS<\/output>/su,
    );
    expect(html).toContain('套用建議門檻');
    expect(html).toContain('不做降噪或人聲辨識');
    expect(html).not.toContain('disabled');
  });
  it('prevents applying while stopped, measuring, unchanged, incomplete or overlapping', async () => {
    for (const props of [
      { running: false },
      { busy: true },
      {
        calibrated: true,
        options: {
          mode: 'calibration',
          openThreshold: -50,
          closeThreshold: -56,
        },
      },
      { results: {} },
      { results: { quiet: summary, voice: summary } },
    ])
      expect(await render(props)).toContain('disabled');
    expect(
      await render({ results: { quiet: summary, voice: summary } }),
    ).toContain('輕聲與背景差距不足');
  });
});
