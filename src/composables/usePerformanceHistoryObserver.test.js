import { afterEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  listener: null,
  player: { state: { track: null } },
  dispose: vi.fn(),
  recordError: vi.fn(),
}));
vi.mock('./usePlayer.js', () => ({
  usePlayer: () => ({
    ...fixture.player,
    onPlaying: (listener) => {
      fixture.listener = listener;
      return fixture.dispose;
    },
  }),
}));
vi.mock('./useAppDiagnostics.js', () => ({
  useAppDiagnostics: () => ({ recordError: fixture.recordError }),
}));
import { usePerformanceHistoryObserver } from './usePerformanceHistoryObserver.js';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe('confirmed performance observer', () => {
  it('records consecutive starts of one track, skips resume/seek repeats and delegates arrangement starts to main progress', async () => {
    const observeConfirmedPerformance = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('window', { Utawakui: { observeConfirmedPerformance } });
    fixture.player.state.track = { id: 'same' };
    const owner = usePerformanceHistoryObserver();
    fixture.listener({ trackId: 'same', playbackRevision: 1 });
    fixture.listener({ trackId: 'same', playbackRevision: 1 });
    fixture.listener({ trackId: 'same', playbackRevision: 2 });
    fixture.player.state.track = { id: 'same', arrangementRequestId: 'owner' };
    fixture.listener({ trackId: 'same', playbackRevision: 3 });
    await Promise.resolve();
    expect(observeConfirmedPerformance).toHaveBeenCalledTimes(2);
    expect(observeConfirmedPerformance.mock.calls[0][0]).toMatchObject({
      trackId: 'same',
      playbackRevision: 1,
    });
    expect(observeConfirmedPerformance.mock.calls[1][0].epoch).toBe(
      observeConfirmedPerformance.mock.calls[0][0].epoch,
    );
    owner.dispose();
    expect(fixture.dispose).toHaveBeenCalledOnce();
  });
  it('reports failures and allows a later confirmed retry without touching playback', async () => {
    const observeConfirmedPerformance = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('window', { Utawakui: { observeConfirmedPerformance } });
    fixture.player.state.track = { id: 'same' };
    usePerformanceHistoryObserver();
    fixture.listener({ trackId: 'same', playbackRevision: 1 });
    await vi.waitFor(() => expect(fixture.recordError).toHaveBeenCalledOnce());
    fixture.listener({ trackId: 'same', playbackRevision: 1 });
    expect(observeConfirmedPerformance).toHaveBeenCalledTimes(2);
  });
});
