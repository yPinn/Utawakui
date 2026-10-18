import { shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./usePlayer.js', () => ({ usePlayer: () => ({ state: {} }) }));
vi.mock('./usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => ({ state: {}, upcomingTracks: shallowRef([]) }),
}));
vi.mock('./useLyrics.js', () => ({
  useLyrics: () => ({
    state: {},
    selectedTrack: shallowRef(null),
    selectedSource: shallowRef(null),
    lyricLines: shallowRef([]),
    activeLineIndex: shallowRef(-1),
  }),
}));
vi.mock('./useLyricsReading.js', () => ({
  useLyricsReading: () => ({ getDoc: vi.fn(), loadReading: vi.fn() }),
}));
afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('performer shell notification integration', () => {
  it('does not clear a failed close just because reading status succeeds', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        closePerformerView: vi.fn().mockRejectedValue(new Error('private')),
        getPerformerViewStatus: vi.fn().mockResolvedValue({ open: true }),
      },
    });
    const { usePerformerSelfView } = await import('./usePerformerSelfView.js');
    const { useAppNotifications } = await import('./useAppNotifications.js');
    const owner = usePerformerSelfView();
    await owner.close();
    await owner.refreshStatus();
    expect(useAppNotifications().items.value).toHaveLength(1);
    expect(owner.state.error).toBeTruthy();
  });
  it('shares the notification stack and clears the matching notice on recovery', async () => {
    const getPerformerViewStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error('private'))
      .mockResolvedValue({ open: false });
    vi.stubGlobal('window', { Utawakui: { getPerformerViewStatus } });
    const { usePerformerSelfView } = await import('./usePerformerSelfView.js');
    const { useAppNotifications } = await import('./useAppNotifications.js');
    const owner = usePerformerSelfView();
    await owner.refreshStatus();
    expect(useAppNotifications().items.value[0]).toMatchObject({
      title: '表演者畫面操作未完成',
      tone: 'danger',
      actionLabel: '重試',
    });
    expect(JSON.stringify(useAppNotifications().items.value)).not.toContain(
      'private',
    );
    await owner.refreshStatus();
    expect(useAppNotifications().items.value).toEqual([]);
  });
});
