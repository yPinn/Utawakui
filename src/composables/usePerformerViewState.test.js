import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({ mounted: [], unmounted: [] }));

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return {
    ...actual,
    onMounted(callback) {
      lifecycle.mounted.push(callback);
    },
    onUnmounted(callback) {
      lifecycle.unmounted.push(callback);
    },
  };
});

import { usePerformerViewState } from './usePerformerViewState.js';

function snapshot(revision) {
  return {
    state: {
      revision,
      playback: { status: 'paused', track: null },
    },
  };
}

describe('usePerformerViewState', () => {
  let bridge;
  let snapshotListener;
  let windowStateListener;
  let unsubscribeSnapshot;
  let unsubscribeWindowState;

  beforeEach(() => {
    lifecycle.mounted = [];
    lifecycle.unmounted = [];
    unsubscribeSnapshot = vi.fn();
    unsubscribeWindowState = vi.fn();
    bridge = {
      onSnapshot: vi.fn((listener) => {
        snapshotListener = listener;
        return unsubscribeSnapshot;
      }),
      onWindowState: vi.fn((listener) => {
        windowStateListener = listener;
        return unsubscribeWindowState;
      }),
      getSnapshot: vi.fn().mockResolvedValue(snapshot(3)),
      getWindowState: vi.fn().mockResolvedValue({
        open: true,
        fullScreen: false,
        alwaysOnTop: false,
      }),
      close: vi.fn().mockResolvedValue({ open: false }),
      minimize: vi.fn().mockResolvedValue({ open: true }),
      toggleAlwaysOnTop: vi.fn().mockResolvedValue({
        open: true,
        alwaysOnTop: true,
      }),
      toggleFullScreen: vi.fn().mockResolvedValue({
        open: true,
        fullScreen: true,
      }),
      recordDiagnostic: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { UtawakuiPerformer: bridge },
    });
  });

  afterEach(() => {
    lifecycle.unmounted.forEach((callback) => callback());
    vi.useRealTimers();
  });

  it('initializes from the bridge and ignores stale snapshots', async () => {
    const state = usePerformerViewState();
    expect(lifecycle.mounted).toHaveLength(1);

    await lifecycle.mounted[0]();
    expect(state.frame.value.revision).toBe(3);
    expect(state.frame.value.mode).toBe('idle');

    snapshotListener(snapshot(5));
    snapshotListener(snapshot(4));
    await nextTick();
    expect(state.frame.value.revision).toBe(5);

    windowStateListener({ open: true, fullScreen: true, alwaysOnTop: true });
    expect(state.windowState).toMatchObject({
      open: true,
      fullScreen: true,
      alwaysOnTop: true,
    });
  });

  it('normalizes command state and clears an earlier public error', async () => {
    const state = usePerformerViewState();
    await lifecycle.mounted[0]();
    bridge.recordDiagnostic.mockRejectedValueOnce(new Error('log unavailable'));
    bridge.toggleFullScreen.mockRejectedValueOnce(
      new Error('C:\\private\\performer.html'),
    );

    await state.toggleFullScreen();
    expect(state.error.value).toBe('目前無法完成視窗操作，請再試一次。');
    expect(bridge.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PERFORMER_WINDOW_TOGGLEFULLSCREEN_FAILED',
        message: 'Performer window operation failed',
      }),
    );
    expect(JSON.stringify(bridge.recordDiagnostic.mock.calls)).not.toContain(
      'private',
    );
    await Promise.resolve();

    await state.toggleFullScreen();
    expect(state.error.value).toBe('');
    expect(state.windowState.fullScreen).toBe(true);
  });

  it('routes every remaining fixed window command through the bridge', async () => {
    const state = usePerformerViewState();
    await lifecycle.mounted[0]();

    await state.minimize();
    await state.toggleAlwaysOnTop();
    await state.close();

    expect(bridge.minimize).toHaveBeenCalledOnce();
    expect(bridge.toggleAlwaysOnTop).toHaveBeenCalledOnce();
    expect(bridge.close).toHaveBeenCalledOnce();
    expect(state.windowState).toMatchObject({
      open: false,
      fullScreen: false,
      alwaysOnTop: false,
    });
  });

  it('refreshes the projected frame at the next lyrics boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T00:00:00.000Z'));
    bridge.getSnapshot.mockResolvedValue({
      state: {
        revision: 6,
        generatedAt: '2026-08-25T00:00:00.000Z',
        playback: {
          status: 'playing',
          positionMs: 0,
          durationMs: 100,
          rate: 1,
          track: { id: 'track-1', title: 'Boundary Song' },
        },
        lyrics: {
          trackId: 'track-1',
          synced: true,
          lines: [{ text: 'first', startMs: 10, endMs: 30 }],
        },
      },
    });
    const state = usePerformerViewState();
    await lifecycle.mounted[0]();

    expect(state.frame.value.mode).toBe('waiting');
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(12);
    expect(state.frame.value.mode).toBe('live');
  });

  it('reports a bounded initialization error when the bridge is absent', async () => {
    window.UtawakuiPerformer = undefined;
    const state = usePerformerViewState();

    await lifecycle.mounted[0]();

    expect(state.error.value).toBe('表演者畫面初始化未完成，請重新開啟。');
  });

  it('unsubscribes both bridge event streams on unmount', async () => {
    usePerformerViewState();
    await lifecycle.mounted[0]();

    lifecycle.unmounted.forEach((callback) => callback());

    expect(unsubscribeSnapshot).toHaveBeenCalledOnce();
    expect(unsubscribeWindowState).toHaveBeenCalledOnce();
  });
});
