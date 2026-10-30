import { effectScope, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMicrophoneMeasurement } from './useMicrophoneMeasurement.js';
import { recommendMicrophoneActivityThresholds } from '../microphone/calibration.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const document = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('document', document);
  const input = shallowRef({
    status: 'running',
    selectedDeviceId: 'mic',
    controls: { noiseFloor: -55, sensitivity: 1, smoothingMs: 150 },
    settings: { sampleRate: 48000 },
    dbfs: -30,
    intensity: 0.4,
  });
  const scope = effectScope();
  const measurement = scope.run(() => useMicrophoneMeasurement(input));
  return { document, input, scope, measurement };
}
describe('microphone measurement scope', () => {
  it('explicitly clears successful calibration even when thresholds are unchanged, but preserves a rejected apply', async () => {
    const h = setup();
    h.input.value = { ...h.input.value, dbfs: -70 };
    h.measurement.begin('quiet');
    expect(h.measurement.applyCalibration(() => true)).toBe(false);
    await vi.advanceTimersByTimeAsync(13000);
    h.input.value = { ...h.input.value, dbfs: -40 };
    h.measurement.begin('voice');
    await vi.advanceTimersByTimeAsync(13000);
    const before = h.measurement.state.value.results;
    expect(h.measurement.applyCalibration(() => false)).toBe(false);
    expect(h.measurement.state.value.results).toBe(before);
    expect(
      h.measurement.applyCalibration((results) => {
        expect(recommendMicrophoneActivityThresholds(results)).toMatchObject({
          status: 'ready',
          openThreshold: -55,
          closeThreshold: -61,
        });
        return true;
      }),
    ).toBe(true);
    expect(h.measurement.state.value.results).toEqual({});
    h.scope.stop();
  });
  it('does not count every live meter publication as an extra timer sample', async () => {
    const h = setup();
    h.measurement.begin('quiet');
    for (let i = 0; i < 1300; i++) {
      h.input.value = { ...h.input.value, dbfs: -30 + (i % 2) };
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(h.measurement.state.value.results.quiet.count).toBe(100);
    h.scope.stop();
  });
  it('advances only after operator start and removes its timer on disposal', async () => {
    const h = setup();
    h.document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.measurement.state.value.phase).toBe('idle');
    h.measurement.begin('quiet');
    await vi.advanceTimersByTimeAsync(13000);
    expect(h.measurement.state.value.results.quiet.count).toBe(100);
    h.measurement.cancel();
    h.measurement.clear();
    expect(h.measurement.state.value.results).toEqual({});
    h.scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels on hidden document or immediate input loss without saving results', () => {
    const h = setup();
    h.measurement.begin('voice');
    h.document.hidden = true;
    h.document.dispatchEvent(new Event('visibilitychange'));
    expect(h.measurement.busy.value).toBe(false);
    h.document.hidden = false;
    h.measurement.begin('voice');
    h.input.value = { ...h.input.value, status: 'lost' };
    expect(h.measurement.busy.value).toBe(false);
    expect(h.measurement.state.value.results).toEqual({});
    h.scope.stop();
  });
});
