import { describe, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => ({
  controller: { state: {}, dispose: vi.fn() },
  register: vi.fn(() => vi.fn()),
  library: { state: { tracks: [{ id: 'canonical' }] } },
  plan: {},
  player: {},
  queue: {},
  create: vi.fn(),
}));
vi.mock('./usePerformanceSessionPlan.js', () => ({
  usePerformanceSessionPlan: () => fixtures.plan,
}));
vi.mock('./useLibrary.js', () => ({ useLibrary: () => fixtures.library }));
vi.mock('./usePlayer.js', () => ({ usePlayer: () => fixtures.player }));
vi.mock('./usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => fixtures.queue,
}));
vi.mock('./usePlaybackTransport.js', () => ({
  registerPlaybackArrangement: fixtures.register,
}));
vi.mock('./usePerformanceSessionPlaybackController.js', () => ({
  usePerformanceSessionPlaybackController: (...args) => {
    fixtures.create(...args);
    return fixtures.controller;
  },
}));
describe('arrangement playback module owner', () => {
  it('registers one controller and resolves fresh canonical library tracks across views', async () => {
    const { usePerformanceSessionPlayback } =
      await import('./usePerformanceSessionPlayback.js');
    expect(usePerformanceSessionPlayback()).toBe(
      usePerformanceSessionPlayback(),
    );
    expect(fixtures.register).toHaveBeenCalledExactlyOnceWith(
      fixtures.controller,
    );
    const dependencies = fixtures.create.mock.calls[0][0];
    expect(dependencies.getTracks()).toEqual([{ id: 'canonical' }]);
    fixtures.library.state.tracks = [{ id: 'updated' }];
    expect(dependencies.getTracks()).toEqual([{ id: 'updated' }]);
    expect(dependencies.plan).toBe(fixtures.plan);
  });
});
