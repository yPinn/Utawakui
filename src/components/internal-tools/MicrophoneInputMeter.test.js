import { renderToString } from '@vue/server-renderer';
import { expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import MicrophoneInputMeter from './MicrophoneInputMeter.vue';

const render = (props) =>
  renderToString(
    createSSRApp(MicrophoneInputMeter, { deviceName: 'USB Mic', ...props }),
  );

it('exposes a bounded level meter and describes its two thresholds', async () => {
  const html = await render({ status: 'quiet', dbfs: -80.5 });
  expect(html).toContain('>USB Mic<');
  expect(html).toContain('role="meter"');
  expect(html).toContain('aria-valuemin="-60"');
  expect(html).toContain('aria-valuemax="0"');
  expect(html).toContain('aria-valuenow="-60"');
  expect(html).toContain('aria-valuetext="-80.5 dBFS，過低"');
  expect(html).not.toMatch(/>\s*-80\.5 dBFS\s*</u);
  expect(html).toContain(
    'aria-description="-55 dBFS 估音門檻，0 dBFS 削波停估。"',
  );
  expect(html).not.toContain(' title=');
});

it('distinguishes the analysis level from the clipping peak', async () => {
  const html = await render({
    status: 'rawClipping',
    dbfs: -31.4,
    peak: 0.15,
    rawPeak: 1,
  });
  expect(html).toContain('aria-valuenow="-31"');
  expect(html).toContain(
    'aria-valuetext="分析電平 -31.4 dBFS，裝置端削波，峰值 0.0 dBFS。"',
  );
});
