import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import MicrophoneActivitySettings from './MicrophoneActivitySettings.vue';
import { MICROPHONE_ACTIVITY_DEFAULTS } from '../../microphone/activity.js';
const render = (props = {}) =>
  renderToString(
    createSSRApp(MicrophoneActivitySettings, {
      options: MICROPHONE_ACTIVITY_DEFAULTS,
      activity: { phase: 'uncalibrated', intensity: 0, active: false },
      ...props,
    }),
  );
describe('microphone activity controls', () => {
  it('starts explicitly uncalibrated, with disabled automatic thresholds and timing references', async () => {
    const html = await render();
    expect(html).toContain('尚未校準');
    expect(html).toContain('25 ms');
    expect(html).toContain('200 ms');
    expect(html).toContain('150 ms');
    expect(html).toMatch(/id="mic-activity-open"[^>]*disabled/su);
  });
  it('keeps manual values visibly uncalibrated and locks every control during measurement', async () => {
    const html = await render({
      options: { ...MICROPHONE_ACTIVITY_DEFAULTS, mode: 'manual' },
      busy: true,
    });
    expect(html).toContain('手動，未校準');
    expect((html.match(/type="range"/gu) ?? []).length).toBe(5);
    expect((html.match(/disabled/gu) ?? []).length).toBeGreaterThanOrEqual(8);
  });
});
