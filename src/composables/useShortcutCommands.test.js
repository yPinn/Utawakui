import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import { useLyricsSourceDocuments } from './lyrics/useLyricsSourceDocuments.js';
afterEach(() => vi.unstubAllGlobals());

vi.mock('./usePlayer.js', () => ({ usePlayer: vi.fn() }));
vi.mock('./usePlaybackTransport.js', () => ({ usePlaybackTransport: vi.fn() }));
vi.mock('./useLyrics.js', () => ({ useLyrics: vi.fn() }));
import { usePlayer } from './usePlayer.js';
import { usePlaybackTransport } from './usePlaybackTransport.js';
import { useLyrics } from './useLyrics.js';
import {
  useShortcutCommands,
  useShortcutCommandExecutor,
} from './useShortcutCommands.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
function fixture() {
  const applied = {
    transposeSemitones: 0,
    pitchCents: 0,
    tempoRate: 1,
    monitorGuideVocalEnabled: true,
  };
  const state = reactive({
    track: { id: 'a', url: 'utawakui-media://track/a/audio.webm' },
    playbackRevision: 1,
    pendingStartTrackId: null,
    isPlaying: false,
    volume: 0.5,
    isMuted: false,
    transposeSemitones: 0,
    pitchCents: 0,
    tempoRate: 1,
    guideVocalOn: true,
    audioControlApplication: {
      revision: 1,
      status: 'applied',
      ok: true,
      applied,
      lanes: { monitor: 'applied', capture: 'disabled' },
    },
  });
  let startRevision = 1;
  const player = {
    state,
    setVolume: vi.fn((value) => {
      state.volume = value;
    }),
    toggleMute: vi.fn(() => {
      state.isMuted = !state.isMuted;
    }),
    performanceSettings: { busy: ref(false) },
    practiceBoundary: { intent: vi.fn() },
    getPlaybackStartRequestRevision: () => startRevision,
    play: vi.fn(() => {
      startRevision++;
      state.pendingStartTrackId = state.track.id;
      return Promise.resolve(true);
    }),
    pause: vi.fn(() => {
      state.pendingStartTrackId = null;
      startRevision++;
    }),
    cancelPendingStart: vi.fn(() => {
      state.pendingStartTrackId = null;
      startRevision++;
    }),
    setTransposeSemitones: vi.fn(async (next) => {
      state.transposeSemitones = next;
      state.audioControlApplication = {
        ...state.audioControlApplication,
        revision: 2,
        applied: { ...applied, transposeSemitones: next },
      };
      return state.audioControlApplication;
    }),
  };
  const transport = {
    arrangementBusy: ref(false),
    canPlayNext: ref(true),
    playPrevious: vi.fn().mockResolvedValue(true),
    playNext: vi.fn().mockResolvedValue(true),
  };
  const lyrics = {
    state: reactive({
      selectedTrackId: 'a',
      selectedSourceFilename: 'a.lrc',
      isLoadingLyrics: false,
      offsetSeconds: 0,
      offsetSave: { isSaving: false, error: null },
      timingSave: { isSaving: false },
      sourceAction: { isSaving: false },
    }),
    sourceSession: ref({
      id: 'session-a',
      offsetRevision: 1,
      timingRevision: 1,
    }),
    timingReview: { state: reactive({ isBusy: false }) },
    adjustOffset: vi.fn(async (delta) => {
      lyrics.state.offsetSeconds =
        Math.round((lyrics.state.offsetSeconds + delta) * 10) / 10;
      lyrics.sourceSession.value = {
        ...lyrics.sourceSession.value,
        offsetRevision: 2,
      };
      return {
        source: { offsetMs: Math.round(lyrics.state.offsetSeconds * 1000) },
        sourceSession: lyrics.sourceSession.value,
      };
    }),
  };
  const executor = useShortcutCommandExecutor({ player, transport, lyrics });
  return { player, state, transport, lyrics, executor };
}

describe('shortcut command owners', () => {
  it('adjusts only the main player volume and mute through its owners without needing a track or touching transport', async () => {
    const { executor, player, state, transport, lyrics } = fixture();
    state.track = null;
    transport.arrangementBusy.value = true;
    state.pendingStartTrackId = 'pending';
    expect(await executor.execute('player.volume-up')).toEqual({
      ok: true,
      status: 'executed',
    });
    expect(state.volume).toBe(0.6);
    expect(await executor.execute('player.volume-down')).toEqual({
      ok: true,
      status: 'executed',
    });
    expect(state.volume).toBe(0.5);
    expect(await executor.execute('player.mute')).toEqual({
      ok: true,
      status: 'executed',
    });
    expect(state.isMuted).toBe(true);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(transport.playNext).not.toHaveBeenCalled();
    expect(player.practiceBoundary.intent).not.toHaveBeenCalled();
    expect(lyrics.adjustOffset).not.toHaveBeenCalled();
  });
  it('bounds volume, rejects unknown values and stale intent, and catches synchronous owner failures', async () => {
    const { executor, player, state } = fixture();
    state.volume = 0.96;
    await executor.execute('player.volume-up');
    expect(player.setVolume).toHaveBeenLastCalledWith(1);
    expect(executor.canExecute('player.volume-up')).toBe(false);
    state.volume = 0.04;
    await executor.execute('player.volume-down');
    expect(player.setVolume).toHaveBeenLastCalledWith(0);
    expect(executor.canExecute('player.volume-down')).toBe(false);
    for (const value of [NaN, -1, 2]) {
      state.volume = value;
      expect(executor.canExecute('player.volume-up')).toBe(false);
    }
    state.volume = 0.5;
    expect(
      (await executor.execute('player.mute', { isCurrent: () => false }))
        .status,
    ).toBe('stale');
    expect(player.toggleMute).not.toHaveBeenCalled();
    player.toggleMute.mockImplementation(() => {
      throw Error('private');
    });
    expect(await executor.execute('player.mute')).toEqual({
      ok: false,
      status: 'failed',
    });
    executor.dispose();
    expect(executor.canExecute('player.volume-up')).toBe(false);
  });
  it.each([
    'timing',
    'source',
    'review',
    'loading',
    'profile',
    'arrangement',
    'registry',
  ])(
    'rechecks %s after the offset save queue boundary before IPC',
    async (kind) => {
      const f = fixture();
      const bridge = {
        getTrackLyrics: vi.fn(async () => ({
          text: 'hello',
          source: { filename: 'a.lrc', offsetMs: 0 },
          sourceSession: {
            id: 'real',
            timingRevision: 't0',
            offsetRevision: 'o0',
          },
          timing: { status: 'missing' },
        })),
        setLyricsSourceOffset: vi.fn(),
      };
      vi.stubGlobal('window', { Utawakui: bridge });
      const owner = useLyricsSourceDocuments({
        state: f.lyrics.state,
        selectedTrack: ref({ id: 'a' }),
        reportLyricsError: () => 'failed',
      });
      await owner.loadSelectedLyrics();
      f.lyrics.sourceSession = owner.sourceSession;
      f.lyrics.adjustOffset = owner.adjustOffset;
      const task = f.executor.execute('lyrics.offset-up');
      if (kind === 'timing') f.lyrics.state.timingSave.isSaving = true;
      if (kind === 'source') f.lyrics.state.sourceAction.isSaving = true;
      if (kind === 'review') f.lyrics.timingReview.state.isBusy = true;
      if (kind === 'loading') f.lyrics.state.isLoadingLyrics = true;
      if (kind === 'profile') f.player.performanceSettings.busy.value = true;
      if (kind === 'arrangement') f.transport.arrangementBusy.value = true;
      if (kind === 'registry') f.executor.invalidate();
      expect((await task).ok).toBe(false);
      expect(bridge.setLyricsSourceOffset).not.toHaveBeenCalled();
      expect(f.lyrics.state.offsetSeconds).toBe(0);
      expect(f.lyrics.state.offsetSave.isSaving).toBe(false);
    },
  );
  it('executes both down commands, propagates failures, and rejects stale receiver intent before side effects', async () => {
    const f = fixture();
    expect((await f.executor.execute('player.transpose-down')).ok).toBe(true);
    expect((await f.executor.execute('lyrics.offset-down')).ok).toBe(true);
    expect(f.lyrics.state.offsetSeconds).toBe(-0.1);
    f.transport.playPrevious.mockResolvedValue(false);
    expect((await f.executor.execute('player.previous')).status).toBe('failed');
    expect(
      (await f.executor.execute('player.next', { isCurrent: () => false }))
        .status,
    ).toBe('stale');
    expect(f.transport.playNext).not.toHaveBeenCalled();
    f.state.isPlaying = true;
    f.player.pause.mockImplementation(() => {
      throw Error('private');
    });
    expect((await f.executor.execute('player.play-pause')).status).toBe(
      'failed',
    );
  });
  it('blocks pending arrangement play, failed DSP lanes and requested values that differ from confirmed state', async () => {
    const f = fixture();
    f.transport.arrangementBusy.value = true;
    f.state.pendingStartTrackId = 'a';
    expect((await f.executor.execute('player.play-pause')).status).toBe('busy');
    f.transport.arrangementBusy.value = false;
    f.state.pendingStartTrackId = null;
    f.state.audioControlApplication.lanes.capture = 'failed';
    expect(f.executor.canExecute('player.transpose-up')).toBe(false);
    f.state.audioControlApplication.lanes.capture = 'disabled';
    f.state.transposeSemitones = 3;
    expect(f.executor.canExecute('player.transpose-up')).toBe(false);
    f.state.transposeSemitones = 0;
    f.player.setTransposeSemitones.mockResolvedValue({
      ok: false,
      status: 'failed',
    });
    expect((await f.executor.execute('player.transpose-up')).status).toBe(
      'failed',
    );
  });
  it('rejects unknown offset previews, errors, missing sources, limits and foreign persistence acknowledgements', async () => {
    for (const change of [
      { offsetSeconds: NaN },
      { offsetSeconds: 3600 },
      { selectedSourceFilename: null },
      { offsetSave: { error: 'not saved', isSaving: false } },
    ]) {
      const f = fixture();
      Object.assign(f.lyrics.state, change);
      expect(f.executor.canExecute('lyrics.offset-up')).toBe(false);
    }
    const f = fixture();
    f.lyrics.adjustOffset.mockImplementation(async () => {
      f.lyrics.state.offsetSeconds = 0.1;
      return { source: { offsetMs: 100 }, sourceSession: { id: 'foreign' } };
    });
    expect((await f.executor.execute('lyrics.offset-up')).status).toBe(
      'failed',
    );
  });
  it('invalidates only its own pending start and does not cancel a later request from another owner', async () => {
    for (const replace of [false, true]) {
      const f = fixture(),
        d = deferred();
      const play = f.player.play.getMockImplementation();
      f.player.play.mockImplementation(() => {
        play();
        return d.promise;
      });
      const task = f.executor.execute('player.play-pause');
      if (replace) play();
      f.executor.invalidate();
      expect(f.player.cancelPendingStart).toHaveBeenCalledTimes(
        replace ? 0 : 1,
      );
      d.resolve(true);
      expect((await task).status).toBe('stale');
    }
  });
  it('keeps a new lock when an invalidated earlier command finishes', async () => {
    const f = fixture(),
      old = deferred(),
      fresh = deferred();
    f.transport.playNext
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(fresh.promise);
    const first = f.executor.execute('player.next');
    f.executor.invalidate();
    const second = f.executor.execute('player.next');
    old.resolve(true);
    await first;
    expect((await f.executor.execute('player.next')).status).toBe('busy');
    fresh.resolve(true);
    expect((await second).ok).toBe(true);
  });
  it('composes existing single owners and rejects unknown commands', async () => {
    const f = fixture();
    usePlayer.mockReturnValue(f.player);
    usePlaybackTransport.mockReturnValue(f.transport);
    useLyrics.mockReturnValue(f.lyrics);
    const commands = useShortcutCommands();
    expect((await commands.execute('arbitrary-ipc')).status).toBe('unknown');
    expect(commands.canExecute('player.next')).toBe(true);
  });
  it('does not guess a track, while an ordinary pending start is cancelled even without a loaded track', async () => {
    const f = fixture();
    f.state.track = null;
    expect((await f.executor.execute('player.play-pause')).status).toBe(
      'unavailable',
    );
    expect(f.player.play).not.toHaveBeenCalled();
    f.state.pendingStartTrackId = 'pending';
    expect((await f.executor.execute('player.play-pause')).ok).toBe(true);
    expect(f.player.pause).toHaveBeenCalledOnce();
  });
  it('uses explicit pause for playing and existing play for loaded paused or A–B gap', async () => {
    const f = fixture();
    f.state.isPlaying = true;
    await f.executor.execute('player.play-pause');
    expect(f.player.pause).toHaveBeenCalledOnce();
    f.state.isPlaying = false;
    await f.executor.execute('player.play-pause');
    expect(f.player.play).toHaveBeenCalledOnce();
    expect(f.player.practiceBoundary.intent).not.toHaveBeenCalled();
  });
  it('lets a second toggle cancel its pending Play and rejects the late completion', async () => {
    const f = fixture(),
      d = deferred();
    f.player.play.mockImplementation(() => {
      f.state.pendingStartTrackId = 'a';
      return d.promise;
    });
    const first = f.executor.execute('player.play-pause');
    await f.executor.execute('player.play-pause');
    d.resolve(true);
    expect((await first).ok).toBe(false);
    expect(f.player.pause).toHaveBeenCalledOnce();
  });
  it('uses the same transport and cancels practice first, respecting canNext and arrangement busy', async () => {
    const f = fixture();
    f.transport.canPlayNext.value = false;
    expect(f.executor.canExecute('player.next')).toBe(false);
    await f.executor.execute('player.next');
    expect(f.player.practiceBoundary.intent).not.toHaveBeenCalled();
    f.transport.canPlayNext.value = true;
    await f.executor.execute('player.next');
    await f.executor.execute('player.previous');
    expect(f.transport.playNext).toHaveBeenCalledOnce();
    expect(f.transport.playPrevious).toHaveBeenCalledOnce();
    expect(
      f.player.practiceBoundary.intent.mock.invocationCallOrder[0],
    ).toBeLessThan(f.transport.playNext.mock.invocationCallOrder[0]);
    f.transport.arrangementBusy.value = true;
    expect((await f.executor.execute('player.next')).status).toBe('busy');
    f.state.track = null;
    expect(f.executor.canExecute('player.previous')).toBe(false);
  });
  it('does not queue repeated next commands and allows explicit next in a manual occurrence without completing it', async () => {
    const f = fixture(),
      d = deferred();
    f.state.track = null;
    f.transport.playNext.mockReturnValue(d.promise);
    const first = f.executor.execute('player.next');
    expect((await f.executor.execute('player.next')).status).toBe('busy');
    expect(f.transport.playNext).toHaveBeenCalledOnce();
    d.resolve(true);
    expect((await first).ok).toBe(true);
  });
  it('changes only a confirmed Key and prevents pending, unconfirmed, limit and failed adjustments', async () => {
    const f = fixture();
    expect((await f.executor.execute('player.transpose-up')).ok).toBe(true);
    expect(f.player.setTransposeSemitones).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ isCurrent: expect.any(Function) }),
    );
    f.state.audioControlApplication.status = 'pending';
    expect((await f.executor.execute('player.transpose-down')).status).toBe(
      'busy',
    );
    f.state.audioControlApplication.status = 'failed';
    expect(f.executor.canExecute('player.transpose-down')).toBe(false);
    f.state.audioControlApplication = {
      status: 'applied',
      ok: true,
      applied: {
        transposeSemitones: 12,
        pitchCents: 0,
        tempoRate: 1,
        monitorGuideVocalEnabled: true,
      },
      lanes: { monitor: 'applied', capture: 'disabled' },
    };
    f.state.transposeSemitones = 12;
    expect(f.executor.canExecute('player.transpose-up')).toBe(false);
  });
  it('drops DSP results after a track or registry change and never replays a busy key', async () => {
    const f = fixture(),
      d = deferred();
    let isCurrent;
    f.player.setTransposeSemitones.mockImplementation((_, options) => {
      isCurrent = options.isCurrent;
      return d.promise;
    });
    const first = f.executor.execute('player.transpose-up');
    expect((await f.executor.execute('player.transpose-up')).status).toBe(
      'busy',
    );
    f.state.playbackRevision++;
    expect(isCurrent()).toBe(false);
    d.resolve({ ok: true, status: 'applied' });
    expect((await first).status).toBe('stale');
    expect(f.player.setTransposeSemitones).toHaveBeenCalledOnce();
  });
  it('uses only the matching active source, awaiting its existing offset persistence', async () => {
    const f = fixture();
    expect((await f.executor.execute('lyrics.offset-up')).ok).toBe(true);
    expect(f.lyrics.adjustOffset).toHaveBeenCalledWith(
      0.1,
      expect.objectContaining({ isCurrent: expect.any(Function) }),
    );
    f.lyrics.state.selectedTrackId = 'other';
    expect((await f.executor.execute('lyrics.offset-down')).status).toBe(
      'unavailable',
    );
    expect(f.lyrics.adjustOffset).toHaveBeenCalledOnce();
  });
  it.each([
    'offset',
    'timing',
    'review',
    'source',
    'load',
    'session',
    'pending',
    'profile',
  ])('blocks offset during %s unavailability', async (kind) => {
    const f = fixture();
    if (kind === 'offset') f.lyrics.state.offsetSave.isSaving = true;
    if (kind === 'timing') f.lyrics.state.timingSave.isSaving = true;
    if (kind === 'review') f.lyrics.timingReview.state.isBusy = true;
    if (kind === 'source') f.lyrics.state.sourceAction.isSaving = true;
    if (kind === 'load') f.lyrics.state.isLoadingLyrics = true;
    if (kind === 'session') f.lyrics.sourceSession.value = null;
    if (kind === 'pending') f.state.pendingStartTrackId = 'other';
    if (kind === 'profile') f.player.performanceSettings.busy.value = true;
    expect((await f.executor.execute('lyrics.offset-up')).ok).toBe(false);
    expect(f.lyrics.adjustOffset).not.toHaveBeenCalled();
  });
  it('reports failed offset persistence and drops an old source completion', async () => {
    const f = fixture(),
      d = deferred();
    f.lyrics.adjustOffset.mockReturnValue(d.promise);
    const first = f.executor.execute('lyrics.offset-up');
    expect((await f.executor.execute('lyrics.offset-down')).status).toBe(
      'busy',
    );
    f.lyrics.sourceSession.value = {
      id: 'different',
      timingRevision: 1,
      offsetRevision: 1,
    };
    d.resolve({ source: { offsetMs: 100 } });
    expect((await first).status).toBe('stale');
    f.lyrics.adjustOffset.mockResolvedValue(null);
    expect((await f.executor.execute('lyrics.offset-up')).status).toBe(
      'failed',
    );
  });
  it('fails safely on exceptions, invalidates in-flight work and stops after disposal', async () => {
    const f = fixture(),
      d = deferred();
    f.player.setTransposeSemitones.mockReturnValue(d.promise);
    const first = f.executor.execute('player.transpose-up');
    f.executor.invalidate();
    d.resolve({ ok: true, status: 'applied' });
    expect((await first).status).toBe('stale');
    f.transport.playNext.mockRejectedValue(new Error('private context'));
    expect(await f.executor.execute('player.next')).toEqual({
      ok: false,
      status: 'failed',
    });
    f.executor.dispose();
    expect(f.executor.canExecute('player.next')).toBe(false);
  });
});
