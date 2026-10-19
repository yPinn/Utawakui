import { nextTick, reactive, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { usePlaybackDockBehavior } from './usePlaybackDockBehavior.js';

function fixture() {
  const obs = reactive({ observed: { lifecycle: 'disabled' } });
  const enabled = shallowRef(false);
  const active = shallowRef(false);
  const dock = { showQueueVariant: vi.fn() };
  const stop = usePlaybackDockBehavior({ obs, enabled, active, dock });
  return { obs, enabled, active, dock, stop };
}
describe('playback Dock display policy', () => {
  it('never closes the Dock on disconnect or when the preference is disabled', async () => {
    const f = fixture();
    f.enabled.value = true;
    f.obs.observed.lifecycle = 'ready';
    await nextTick();
    f.enabled.value = false;
    f.obs.observed.lifecycle = 'disconnected';
    await nextTick();
    expect(f.dock.showQueueVariant).toHaveBeenCalledTimes(1);
    f.stop();
  });
  it('is opt-in and uses connection readiness without live or record state', async () => {
    const f = fixture();
    f.obs.observed.lifecycle = 'ready';
    await nextTick();
    expect(f.dock.showQueueVariant).not.toHaveBeenCalled();
    f.enabled.value = true;
    await nextTick();
    expect(f.dock.showQueueVariant).toHaveBeenCalledExactlyOnceWith(
      'arrangement',
    );
    f.stop();
  });
  it('does not reopen on status ticks, degraded recovery, completion, or same connection after manual dismissal', async () => {
    const f = fixture();
    f.enabled.value = true;
    f.obs.observed.lifecycle = 'ready';
    await nextTick();
    f.obs.observed.lifecycle = 'degraded';
    await nextTick();
    f.obs.observed.lifecycle = 'ready';
    await nextTick();
    expect(f.dock.showQueueVariant).toHaveBeenCalledTimes(1);
    f.obs.observed.lifecycle = 'disconnected';
    await nextTick();
    f.obs.observed.lifecycle = 'ready';
    await nextTick();
    expect(f.dock.showQueueVariant).toHaveBeenCalledTimes(2);
    f.stop();
  });
  it('shows arrangement when a user starts it without OBS, once per engagement rather than every song', async () => {
    const f = fixture();
    f.active.value = true;
    await nextTick();
    f.active.value = true;
    await nextTick();
    expect(f.dock.showQueueVariant).toHaveBeenCalledTimes(1);
    f.active.value = false;
    await nextTick();
    expect(f.dock.showQueueVariant).toHaveBeenCalledTimes(1);
    f.active.value = true;
    await nextTick();
    expect(f.dock.showQueueVariant).toHaveBeenCalledTimes(2);
    f.stop();
  });
});
