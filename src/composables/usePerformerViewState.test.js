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
      getReadingScale: vi.fn().mockResolvedValue('stage'),
      setReadingScale: vi.fn().mockResolvedValue('near'),
      adjustLyricsOffset: vi.fn().mockResolvedValue(true),
      control: vi.fn().mockResolvedValue(true),
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

  it('schedules a display-driven clock tick only while playback is playing', async () => {
    vi.useFakeTimers();
    const state = usePerformerViewState();
    await lifecycle.mounted[0]();
    const baseline = vi.getTimerCount();

    state.setDisplayBoundary(100);
    expect(vi.getTimerCount()).toBe(baseline);

    snapshotListener({
      state: { revision: 6, playback: { status: 'playing', track: null } },
    });
    const playingBaseline = vi.getTimerCount();
    for (const delay of [Number.NaN, -1]) {
      state.setDisplayBoundary(delay);
      expect(vi.getTimerCount()).toBe(playingBaseline);
    }

    state.setDisplayBoundary(100);
    state.setDisplayBoundary(200);
    expect(vi.getTimerCount()).toBe(playingBaseline + 1);
    vi.advanceTimersByTime(201);
    expect(vi.getTimerCount()).toBe(playingBaseline);
  });

  it('treats a missing window-state payload as an open plain window', async () => {
    const state = usePerformerViewState();
    await lifecycle.mounted[0]();
    windowStateListener({ open: false, fullScreen: true, alwaysOnTop: true });

    windowStateListener();

    expect(state.windowState).toMatchObject({
      open: true,
      fullScreen: false,
      alwaysOnTop: false,
    });
  });

  it('routes toolbar commands with the displayed context, guards pending calls and reports bounded failures', async () => {
    bridge.getSnapshot.mockResolvedValue({
      state: {
        revision: 9,
        playback: { status: 'paused', track: { id: 'a' } },
      },
    });
    const state = usePerformerViewState();
    await lifecycle.mounted[0]();
    let finish;
    bridge.control.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = state.control('play');
    expect(state.controlPending.value).toBe(true);
    expect(await state.control('pause')).toBe(false);
    expect(await state.control('reading-romaji')).toBe(true);
    expect(state.controlPending.value).toBe(true);
    finish(true);
    expect(await pending).toBe(true);
    expect(bridge.control).toHaveBeenCalledWith({
      action: 'play',
      revision: 9,
      trackId: 'a',
    });
    expect(state.controlPending.value).toBe(false);
    bridge.control.mockResolvedValueOnce(false);
    expect(await state.control('reading-romaji')).toBe(false);
    expect(state.error.value).toBe('主控制台目前無法完成操作，請再試一次。');
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

  it('persists reading scale and sends sync intent from the displayed revision', async () => {
    bridge.getSnapshot.mockResolvedValue({
      state: {
        revision: 9,
        playback: {
          status: 'paused',
          track: { id: 'track-1', title: 'Song' },
        },
        lyrics: { trackId: 'track-1', lines: [] },
      },
      controls: {
        lyricsOffset: { available: true, saving: false, error: '' },
      },
    });
    const state = usePerformerViewState();
    await lifecycle.mounted[0]();

    expect(state.readingScale.value).toBe('stage');
    await state.setReadingScale('near');
    expect(bridge.setReadingScale).toHaveBeenCalledWith('near');
    expect(state.readingScale.value).toBe('near');

    await state.adjustLyricsOffset('delay');
    expect(bridge.adjustLyricsOffset).toHaveBeenCalledWith({
      action: 'delay',
      revision: 9,
      trackId: 'track-1',
    });
  });

  it('fails closed for missing or stale sync context and rolls back scale errors', async () => {
    const state = usePerformerViewState();
    await lifecycle.mounted[0]();

    expect(await state.adjustLyricsOffset('advance')).toBe(false);
    expect(bridge.adjustLyricsOffset).not.toHaveBeenCalled();

    bridge.setReadingScale.mockRejectedValueOnce(
      new Error('C:\\private\\config.json'),
    );
    expect(await state.setReadingScale('near')).toBe(false);
    expect(state.readingScale.value).toBe('stage');
    expect(state.error.value).toBe('閱讀距離設定未儲存，請再試一次。');

    snapshotListener({
      state: {
        revision: 10,
        playback: {
          status: 'paused',
          track: { id: 'track-1', title: 'Song' },
        },
        lyrics: { trackId: 'track-1', lines: [] },
      },
    });
    bridge.adjustLyricsOffset.mockResolvedValueOnce(false);
    expect(await state.adjustLyricsOffset('advance')).toBe(false);
    expect(state.error.value).toBe(
      '主控制台目前無法套用同步調整，請再試一次。',
    );
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
