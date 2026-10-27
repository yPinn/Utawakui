import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
const f = vi.hoisted(() => ({}));
vi.mock('./usePlayer.js', () => ({ usePlayer: () => f.player }));
vi.mock('./useBgmSession.js', () => ({
  useBgmSession: () => ({ acquirePracticeLane: vi.fn() }),
}));
vi.mock('./usePerformanceSessionPlayback.js', () => ({
  usePerformanceSessionPlayback: () => f.arrangement,
}));
vi.mock('./usePlaybackQueue.js', () => ({ usePlaybackQueue: () => f.queue }));
vi.mock('./player/usePlayerPracticeRuntime.js', () => ({
  usePlayerPracticeRuntime: (options) => {
    f.options = options;
    return f.runtime;
  },
}));
beforeEach(() => {
  vi.resetModules();
  f.state = reactive({
    a: null,
    b: null,
    enabled: false,
    loading: false,
    metadataRevision: 0,
  });
  f.player = {
    state: reactive({
      track: { id: 'one' },
      duration: 5,
      pendingStartTrackId: null,
    }),
    pause: vi.fn(),
    performanceSettings: { verifySource: vi.fn() },
    practiceBoundary: { sample: () => ({ currentTime: 1.23456 }) },
  };
  f.queue = { state: reactive({ isShuffle: false }) };
  f.arrangement = { ownsPlayback: ref(false) };
  f.runtime = {
    state: f.state,
    isRangeValid: () => f.state.b - f.state.a >= 0.5,
    disable: vi.fn(({ clear = false } = {}) => {
      f.state.enabled = false;
      if (clear) {
        f.state.a = null;
        f.state.b = null;
      }
    }),
    setRange: vi.fn((a, b) => Object.assign(f.state, { a, b })),
    enable: vi.fn(),
    dispose: vi.fn(),
  };
});
describe('practice composition owner', () => {
  it('projects readiness and delegates playback, source proof and clearing to existing owners', async () => {
    const { usePlayerPractice } = await import('./usePlayerPractice.js');
    const p = usePlayerPractice();
    expect(p.canEnable.value).toBe(false);
    p.setPoint('a', 1);
    p.setPoint('b', 2);
    expect(p.canEnable.value).toBe(true);
    p.toggle();
    expect(f.runtime.enable).toHaveBeenCalledWith({ startPlayback: true });
    f.state.enabled = true;
    f.player.state.isPlaying = true;
    p.toggle();
    expect(f.player.pause).toHaveBeenCalledOnce();
    expect(f.state.enabled).toBe(true);
    f.state.enabled = false;
    f.player.state.pendingStartTrackId = 'one';
    expect(p.unavailableReason.value).toContain('準備');
    const calls = f.runtime.setRange.mock.calls.length;
    p.capture('b');
    expect(f.runtime.setRange).toHaveBeenCalledTimes(calls);
    f.player.state.pendingStartTrackId = null;
    f.player.state.duration = 0;
    expect(p.unavailableReason.value).toContain('就緒');
    f.player.state.track = null;
    expect(p.unavailableReason.value).toContain('選擇');
    expect(f.options.isSessionOwned()).toBe(false);
    f.options.acquireHold({});
    await f.options.verifySource();
    expect(f.player.performanceSettings.verifySource).toHaveBeenCalledOnce();
    p.clear();
    expect(f.runtime.disable).toHaveBeenCalledWith({ clear: true });
    p.dispose();
  });
  it('shares the owner across panel remounts and captures only a bounded point', async () => {
    const { usePlayerPractice } = await import('./usePlayerPractice.js');
    const p = usePlayerPractice();
    expect(usePlayerPractice()).toBe(p);
    p.capture('a');
    expect(f.runtime.setRange).toHaveBeenLastCalledWith(1.235, null);
    p.capture('invalid');
    expect(f.runtime.setRange).toHaveBeenCalledOnce();
    p.dispose();
  });
  it('clears on arrangement takeover and stops looping on shuffle without restoring the old mode', async () => {
    const { usePlayerPractice } = await import('./usePlayerPractice.js');
    const p = usePlayerPractice();
    f.state.enabled = true;
    f.arrangement.ownsPlayback.value = true;
    expect(f.player.pause).toHaveBeenCalledOnce();
    expect(f.runtime.disable).toHaveBeenCalledWith({ clear: true });
    expect(p.unavailableReason.value).toContain('演出安排');
    f.arrangement.ownsPlayback.value = false;
    f.state.a = 1;
    f.state.b = 2;
    f.state.enabled = true;
    f.queue.state.isShuffle = true;
    expect(f.state.enabled).toBe(false);
    expect(f.state.a).toBe(1);
    p.dispose();
  });
});
