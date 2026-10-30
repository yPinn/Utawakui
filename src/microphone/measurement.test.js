import { describe, expect, it } from 'vitest';
import { createMicrophoneMeasurement } from './measurement.js';

const input = (changes = {}) => ({
  status: 'running',
  selectedDeviceId: 'mic-a',
  dbfs: -30,
  intensity: 0.4,
  clipped: false,
  controls: { noiseFloor: -55, sensitivity: 1, smoothingMs: 150 },
  settings: { sampleRate: 48000, channelCount: 1 },
  ...changes,
});
function harness() {
  let state;
  const owner = createMicrophoneMeasurement({
    publish: (s) => {
      state = s;
    },
  });
  return {
    owner,
    get state() {
      return state;
    },
  };
}
function finish(h, value = input(), start = 0) {
  for (let at = start + 100; at <= start + 13000; at += 100)
    h.owner.observe(value, at);
}

describe('operator-led microphone measurement', () => {
  it('retains the lower-tail voice percentile and treats source clipping as invalid for calibration', () => {
    const h = harness();
    h.owner.begin('voice', input(), 0);
    for (let index = 0; index < 100; index++)
      h.owner.observe(
        input({ dbfs: index < 10 ? -60 : -40, rawClipped: index === 20 }),
        3000 + index * 100,
      );
    h.owner.observe(input(), 13000);
    expect(h.state.results.voice).toMatchObject({
      p10Dbfs: -60,
      medianDbfs: -40,
      p95Dbfs: -40,
      nearClipCount: 1,
      conditions: { selectedDeviceId: 'mic-a' },
    });
  });
  it('invalidates stopped input-processing edits as well as display controls', () => {
    const h = harness();
    const before = input({ inputOptions: { gainDb: 0 } });
    h.owner.begin('quiet', before, 0);
    finish(h, before);
    h.owner.observe(
      input({ status: 'idle', settings: null, inputOptions: { gainDb: 6 } }),
      13100,
    );
    expect(h.state.results).toEqual({});
  });
  it('rejects a missing first measurement second and invalidates stopped control changes', () => {
    const h = harness();
    h.owner.begin('quiet', input(), 0);
    h.owner.observe(input(), 2900);
    h.owner.observe(input(), 4000);
    expect(h.state.phase).toBe('idle');
    expect(h.state.results).toEqual({});
    h.owner.begin('quiet', input(), 5000);
    finish(h, input(), 5000);
    expect(h.state.results.quiet).toBeDefined();
    h.owner.observe(input({ status: 'idle', settings: null }), 18100);
    expect(h.state.results.quiet).toBeDefined();
    h.owner.observe(
      input({
        status: 'idle',
        settings: null,
        controls: { noiseFloor: -65, sensitivity: 1, smoothingMs: 150 },
      }),
      18200,
    );
    expect(h.state.results).toEqual({});
  });
  it('requires explicit begin and a running selected input', () => {
    const h = harness();
    h.owner.observe(input(), 0);
    expect(h.state.phase).toBe('idle');
    expect(h.state.results).toEqual({});
    expect(h.owner.begin('quiet', input({ status: 'idle' }), 0)).toBe(false);
    expect(h.owner.begin('unknown', input(), 0)).toBe(false);
    expect(h.owner.begin('quiet', input(), 0)).toBe(true);
    expect(h.state.phase).toBe('countdown');
    expect(h.state.remainingMs).toBe(3000);
    expect(h.owner.begin('voice', input(), 1)).toBe(false);
  });
  it('shows countdown then records one bounded window and nearest-rank summaries', () => {
    const h = harness();
    h.owner.begin('quiet', input(), 0);
    h.owner.observe(input(), 2900);
    expect(h.state.phase).toBe('countdown');
    h.owner.observe(input(), 3000);
    expect(h.state.phase).toBe('measuring');
    for (let at = 3100; at <= 13000; at += 100) h.owner.observe(input(), at);
    expect(h.state.phase).toBe('complete');
    expect(h.state.results.quiet).toMatchObject({
      count: 100,
      p10Dbfs: -30,
      medianDbfs: -30,
      p95Dbfs: -30,
      maxDbfs: -30,
      aboveFloorCount: 100,
      activeCount: 100,
      nearClipCount: 0,
    });
    expect(h.state.history.length).toBeLessThanOrEqual(120);
  });
  it('cancel and loss never publish partial results or overwrite a completed retake', () => {
    const h = harness();
    h.owner.begin('quiet', input(), 0);
    finish(h);
    const result = h.state.results.quiet;
    h.owner.begin('quiet', input(), 14000);
    h.owner.cancel();
    expect(h.state.results.quiet).toBe(result);
    expect(h.state.phase).toBe('idle');
    h.owner.begin('voice', input(), 15000);
    h.owner.observe(input({ status: 'lost' }), 15100);
    expect(h.state.phase).toBe('idle');
    expect(h.state.results.voice).toBeUndefined();
    expect(h.state.history).toEqual([]);
  });
  it('invalidates comparisons on device or control changes and aborts a long sampling gap', () => {
    const h = harness();
    h.owner.begin('quiet', input(), 0);
    finish(h);
    h.owner.observe(
      input({
        controls: { noiseFloor: -65, sensitivity: 1, smoothingMs: 150 },
      }),
      13100,
    );
    expect(h.state.results).toEqual({});
    h.owner.begin('voice', input(), 14000);
    h.owner.observe(input(), 17000);
    h.owner.observe(input(), 18000);
    expect(h.state.phase).toBe('idle');
    expect(h.state.results.voice).toBeUndefined();
    h.owner.observe(input({ selectedDeviceId: 'mic-b' }), 18100);
    expect(h.state.history.length).toBe(1);
  });
  it('keeps completed snapshots on stop, supports sequential steps and clears explicitly', () => {
    const h = harness();
    h.owner.begin('quiet', input({ dbfs: -70, intensity: 0 }), 0);
    finish(h, input({ dbfs: -70, intensity: 0 }));
    expect(h.state.results.quiet.aboveFloorCount).toBe(0);
    h.owner.observe(input({ status: 'idle', settings: null }), 13100);
    expect(h.state.results.quiet).toBeDefined();
    h.owner.begin('voice', input(), 14000);
    finish(h, input(), 14000);
    expect(Object.keys(h.state.results)).toEqual(['quiet', 'voice']);
    h.owner.clear();
    expect(h.state.results).toEqual({});
  });
});
