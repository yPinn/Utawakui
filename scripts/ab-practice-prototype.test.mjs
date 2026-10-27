import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAbPracticePrototype } from '../prototypes/ab-practice/runtime.mjs';
import { usePlayerMediaBoundary } from '../src/composables/player/usePlayerMediaBoundary.js';

function fixture({
  visibility = null,
  isSessionOwned = () => false,
  verifySource,
  acquireHold,
} = {}) {
  const audio = new EventTarget();
  Object.assign(audio, {
    src: 'utawakui-media://track/one/audio.wav',
    currentTime: 3,
    duration: 10,
    paused: true,
    ended: false,
    seeking: false,
    playbackRate: 1,
    seekable: { length: 1, start: () => 0, end: () => 10 },
  });
  audio.pause = vi.fn(() => {
    audio.paused = true;
    audio.dispatchEvent(new Event('pause'));
  });
  const state = {
    track: { id: 'one' },
    playbackRevision: 1,
    playbackMode: 'repeat-one',
    pendingStartTrackId: null,
    isPlaying: false,
  };
  const boundary = usePlayerMediaBoundary({
    audio,
    state,
    onTerminal: vi.fn(),
    onPlaying: vi.fn(),
    cancelStart: (token) => boundary.intent('cancel', token),
  });
  const player = {
    state,
    practiceBoundary: boundary,
    pause: vi.fn(() => {
      boundary.intent('pause');
      audio.pause();
    }),
    seek: vi.fn((time, token) => {
      boundary.intent('seek', token, time);
      audio.seeking = true;
      audio.currentTime = time;
      queueMicrotask(() => {
        audio.seeking = false;
        audio.ended = false;
        audio.dispatchEvent(new Event('seeked'));
      });
    }),
    play: vi.fn(async ({ practiceToken } = {}) => {
      if (!(await boundary.beforePlay(practiceToken))) return false;
      audio.paused = false;
      state.isPlaying = true;
      audio.dispatchEvent(new Event('play'));
      audio.dispatchEvent(new Event('playing'));
      return true;
    }),
  };
  const release = vi.fn(),
    measure = vi.fn(),
    hold = vi.fn(() => ({ release }));
  const prototype = createAbPracticePrototype({
    player,
    acquireHold: acquireHold ?? hold,
    verifySource,
    now: () => Date.now(),
    visibility,
    isSessionOwned,
    measure,
  });
  return { audio, player, boundary, prototype, release, measure };
}
describe('A–B quality prototype', () => {
  it.each(['pause', 'hidden', 'session', 'range'])(
    'does not start after source confirmation loses its context: %s',
    async (change) => {
      let resolve,
        owned = false;
      const visibility = new EventTarget();
      visibility.hidden = false;
      const f = fixture({
        visibility,
        isSessionOwned: () => owned,
        verifySource: () =>
          new Promise((done) => {
            resolve = done;
          }),
      });
      f.prototype.setRange(1, 4);
      const starting = f.prototype.enable({ startPlayback: true });
      if (change === 'pause') f.player.pause();
      if (change === 'hidden') {
        visibility.hidden = true;
        visibility.dispatchEvent(new Event('visibilitychange'));
      }
      if (change === 'session') owned = true;
      if (change === 'range') f.audio.duration = 2;
      resolve(true);
      expect(await starting).toBe(false);
      expect(f.player.play).not.toHaveBeenCalled();
      expect(f.prototype.state.enabled).toBe(false);
      f.prototype.dispose();
    },
  );
  it('starts through the original player and keeps a busy lane visible without taking it over', async () => {
    const f = fixture();
    f.prototype.setRange(1, 2);
    expect(await f.prototype.enable({ startPlayback: true })).toBe(true);
    expect(f.audio.currentTime).toBe(1);
    expect(f.audio.paused).toBe(false);
    f.prototype.dispose();
    const busy = fixture({ acquireHold: () => null });
    busy.prototype.setRange(1, 4);
    expect(await busy.prototype.enable({ startPlayback: true })).toBe(false);
    expect(busy.prototype.state.error).toBe('busy');
    expect(busy.player.play).not.toHaveBeenCalled();
    busy.prototype.dispose();
  });
  it('cancels a practice Start still preparing when its markers are cleared', async () => {
    const f = fixture();
    f.prototype.setRange(1, 4);
    let release;
    f.player.play.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    const starting = f.prototype.enable({ startPlayback: true });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    f.prototype.disable({ clear: true });
    f.audio.paused = false;
    f.audio.dispatchEvent(new Event('play'));
    expect(f.audio.paused).toBe(true);
    release(true);
    expect(await starting).toBe(false);
    f.prototype.dispose();
  });
  it.each(['playing', 'gap', 'returning'])(
    'clears markers and cancels future repeats from %s without changing a playing transport',
    async (phase) => {
      const f = fixture();
      f.prototype.setRange(1, 4);
      await f.prototype.enable();
      await f.player.play();
      if (phase === 'returning') f.player.seek.mockImplementation(() => {});
      if (phase !== 'playing') {
        f.audio.currentTime = 4;
        f.audio.dispatchEvent(new Event('timeupdate'));
      }
      if (phase === 'gap') await vi.advanceTimersByTimeAsync(0);
      f.prototype.disable({ clear: true });
      const starts = f.player.play.mock.calls.length;
      await vi.advanceTimersByTimeAsync(11000);
      expect(f.prototype.state.a).toBeNull();
      expect(f.prototype.state.b).toBeNull();
      expect(f.prototype.state.gapSeconds).toBe(2);
      expect(f.prototype.state.enabled).toBe(false);
      expect(f.player.play).toHaveBeenCalledTimes(starts);
      expect(f.audio.paused).toBe(phase !== 'playing');
      f.prototype.dispose();
    },
  );
  it('applies changed rest to the next lap while the current lap keeps its snapshot', async () => {
    const f = fixture();
    f.prototype.setRange(1, 4);
    await f.prototype.enable();
    await f.player.play();
    f.audio.currentTime = 4;
    f.audio.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(0);
    f.prototype.setGap(4);
    expect(f.prototype.state.waitingSeconds).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.audio.paused).toBe(false);
    f.audio.currentTime = 4;
    f.audio.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.prototype.state.waitingSeconds).toBe(4);
    await vi.advanceTimersByTimeAsync(3999);
    expect(f.audio.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.audio.paused).toBe(false);
    f.prototype.dispose();
  });
  it('defaults each repeat to a complete two-second breathing rest', async () => {
    const f = fixture();
    expect(f.prototype.state.gapSeconds).toBe(2);
    f.prototype.setRange(1, 4);
    await f.prototype.enable();
    await f.player.play();
    f.audio.currentTime = 4;
    f.audio.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.prototype.state.waitingSeconds).toBe(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(f.audio.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.audio.paused).toBe(false);
    f.prototype.dispose();
  });
  it('validates source without acquiring playback when proof fails or is cancelled', async () => {
    let resolve;
    const f = fixture({
      verifySource: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    f.prototype.setRange(1, 4);
    const enabling = f.prototype.enable();
    expect(f.prototype.state.loading).toBe(true);
    f.prototype.disable();
    resolve(true);
    expect(await enabling).toBe(false);
    expect(f.audio.paused).toBe(true);
    f.prototype.dispose();
    const failed = fixture({
      verifySource: async () => {
        throw new Error('private');
      },
    });
    failed.prototype.setRange(1, 4);
    expect(await failed.prototype.enable()).toBe(false);
    expect(failed.prototype.state.error).toBe('source-or-range');
    failed.prototype.dispose();
  });
  it('starts a playing outside position at A without waiting, and removes measurement subscriptions', async () => {
    const f = fixture();
    await f.player.play();
    f.prototype.setRange(1, 2);
    f.prototype.setGap(4);
    const measured = vi.fn(),
      off = f.prototype.onMeasurement(measured);
    expect(await f.prototype.enable()).toBe(true);
    expect(f.audio.currentTime).toBe(1);
    expect(f.audio.paused).toBe(false);
    expect(measured).toHaveBeenCalled();
    off();
    const count = measured.mock.calls.length;
    f.audio.currentTime = 2;
    f.audio.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(0);
    expect(measured).toHaveBeenCalledTimes(count);
    f.prototype.dispose();
  });
  it.each([false, 'throw'])(
    'keeps paused when returning native Play fails: %s',
    async (result) => {
      const f = fixture();
      f.prototype.setGap(0);
      f.prototype.setRange(1, 4);
      await f.prototype.enable();
      await f.player.play();
      f.player.play.mockImplementationOnce(async () => {
        if (result === 'throw') throw Error('private');
        return false;
      });
      f.audio.currentTime = 4;
      f.audio.dispatchEvent(new Event('timeupdate'));
      await vi.advanceTimersByTimeAsync(0);
      expect(f.prototype.state.error).toBe('play');
      expect(f.audio.paused).toBe(true);
      f.prototype.dispose();
    },
  );
  it('waits for replacement metadata and refuses a second changed source proof', async () => {
    const f = fixture();
    f.prototype.setRange(1, 4);
    await f.prototype.enable();
    const verify = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const ticket = await f.boundary.prepareSourceChange(verify);
    f.audio.src = 'utawakui-media://track/one/refresh.wav';
    f.audio.readyState = 0;
    const completion = f.boundary.completeSourceChange(ticket);
    expect(f.prototype.state.phase).toBe('source-changing');
    f.audio.readyState = 2;
    f.audio.dispatchEvent(new Event('canplay'));
    expect(await completion).toBe(false);
    expect(f.prototype.state.enabled).toBe(false);
    expect(f.audio.paused).toBe(true);
    f.prototype.dispose();
  });
  it('does not make up missed laps after a long observer or gap interruption', async () => {
    const f = fixture();
    f.prototype.setRange(1, 4);
    await f.prototype.enable();
    await f.player.play();
    vi.setSystemTime(Date.now() + 2000);
    await vi.advanceTimersByTimeAsync(16);
    expect(f.prototype.state.phase).toBe('blocked');
    expect(f.audio.paused).toBe(true);
    await f.player.play();
    f.prototype.setGap(4);
    f.audio.currentTime = 4;
    f.audio.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(Date.now() + 10000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(f.prototype.state.phase).toBe('blocked');
    expect(f.audio.paused).toBe(true);
    f.prototype.dispose();
  });
  it.each([true, false])(
    'revalidates equivalent URL replacement and preserves playing=%s intent without a lap or defaults',
    async (playing) => {
      const f = fixture();
      f.prototype.setRange(1, 4);
      await f.prototype.enable();
      if (playing) await f.player.play();
      const proof = vi.fn(async () => true),
        ticket = await f.boundary.prepareSourceChange(proof);
      f.audio.src = 'utawakui-media://track/one/separation.wav';
      f.audio.readyState = 2;
      expect(await f.boundary.completeSourceChange(ticket)).toBe(playing);
      expect(f.prototype.state.enabled).toBe(true);
      expect(f.audio.currentTime).toBe(3);
      expect(f.prototype.state.laps).toBe(0);
      expect(proof).toHaveBeenCalledTimes(2);
      f.prototype.dispose();
    },
  );
  it('does not resume a gap during equivalent source reload or accept a failed proof', async () => {
    const f = fixture();
    f.prototype.setRange(1, 4);
    f.prototype.setGap(4);
    await f.prototype.enable();
    await f.player.play();
    f.audio.currentTime = 4;
    f.audio.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(0);
    const ticket = await f.boundary.prepareSourceChange(async () => true);
    f.audio.src = 'utawakui-media://track/one/new.wav';
    f.audio.readyState = 2;
    expect(await f.boundary.completeSourceChange(ticket)).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.audio.paused).toBe(true);
    const unknown = await f.boundary.prepareSourceChange(async () => false);
    f.audio.src = 'utawakui-media://track/one/unknown.wav';
    expect(await f.boundary.completeSourceChange(unknown)).toBe(false);
    expect(f.prototype.state.enabled).toBe(false);
    expect(f.prototype.state.a).toBe(1);
    expect(f.prototype.state.phase).toBe('blocked');
    f.prototype.dispose();
  });
  it('rejects a source proof cancelled by Pause and blocks shortened duration', async () => {
    const f = fixture();
    f.prototype.setRange(1, 4);
    await f.prototype.enable();
    let done;
    const pending = f.boundary.prepareSourceChange(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    f.player.pause();
    done(true);
    expect(await f.boundary.completeSourceChange(await pending)).toBe(false);
    const ticket = await f.boundary.prepareSourceChange(async () => true);
    f.audio.src = 'utawakui-media://track/one/short.wav';
    f.audio.readyState = 2;
    f.audio.duration = 8;
    expect(await f.boundary.completeSourceChange(ticket)).toBe(false);
    expect(f.audio.paused).toBe(true);
    f.prototype.dispose();
  });
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it.each([
    [3, 3.4],
    [NaN, 4],
    [4, 3],
    [-1, 3],
    [1, 11],
  ])('rejects invalid range %s–%s without transport', async (a, b) => {
    const f = fixture();
    f.prototype.setRange(a, b);
    expect(await f.prototype.enable()).toBe(false);
    expect(f.player.seek).not.toHaveBeenCalled();
    f.prototype.dispose();
  });
  it('arms paused without a seek or play, then seeks A only on explicit Play', async () => {
    const f = fixture();
    f.prototype.setRange(1, 2);
    expect(await f.prototype.enable()).toBe(true);
    expect(f.player.play).not.toHaveBeenCalled();
    expect(f.player.seek).not.toHaveBeenCalled();
    expect(f.audio.loop).toBe(false);
    await f.player.play();
    expect(f.audio.currentTime).toBe(1);
    expect(f.audio.paused).toBe(false);
    expect(f.prototype.state.phase).toBe('armed');
    f.prototype.disable();
    expect(f.audio.loop).toBe(true);
    f.prototype.dispose();
  });
  it.each([0, 1, 2, 4])(
    'starts gap %ss after seeked, preserves occurrence and cancels with Pause',
    async (gap) => {
      const f = fixture();
      f.prototype.setRange(1, 4);
      f.prototype.setGap(gap);
      await f.prototype.enable();
      await f.player.play();
      f.audio.currentTime = 4.02;
      f.audio.dispatchEvent(new Event('timeupdate'));
      await vi.advanceTimersByTimeAsync(0);
      expect(f.audio.currentTime).toBe(1);
      expect(f.audio.paused).toBe(gap > 0);
      expect(f.player.state.playbackRevision).toBe(1);
      f.player.pause();
      const starts = f.player.play.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5000);
      expect(f.player.play).toHaveBeenCalledTimes(starts);
      expect(f.audio.paused).toBe(true);
      expect(
        f.measure.mock.calls.some(
          ([row]) =>
            row.kind === 'boundary' && Math.round(row.overshootMs) === 20,
        ),
      ).toBe(true);
      f.prototype.dispose();
    },
  );
  it('lets explicit Play cancel the remaining gap and never fires the old timer', async () => {
    const f = fixture();
    f.prototype.setRange(1, 4);
    f.prototype.setGap(4);
    await f.prototype.enable();
    await f.player.play();
    f.audio.currentTime = 4;
    f.audio.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(0);
    await f.player.play();
    const starts = f.player.play.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.player.play).toHaveBeenCalledTimes(starts);
    expect(f.audio.paused).toBe(false);
    f.prototype.dispose();
  });
  it('waits the complete gap after seeked and counts only confirmed playing', async () => {
    const f = fixture();
    f.prototype.setRange(1, 4);
    f.prototype.setGap(2);
    await f.prototype.enable();
    await f.player.play();
    f.audio.currentTime = 4;
    f.audio.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1999);
    expect(f.audio.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.prototype.state.laps).toBe(1);
    expect(
      f.measure.mock.calls.some(
        ([row]) =>
          row.kind === 'gap' && row.elapsedMs === 2000 && row.earlyByMs === 0,
      ),
    ).toBe(true);
    f.prototype.dispose();
  });
  it('pauses a cancelled native auto-start arriving late, without pausing a newer explicit Play', async () => {
    const f = fixture();
    f.prototype.setGap(0);
    f.prototype.setRange(1, 4);
    await f.prototype.enable();
    await f.player.play();
    let release;
    const normalPlay = f.player.play.getMockImplementation();
    f.player.play.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    f.audio.currentTime = 4;
    f.audio.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(0);
    f.player.pause();
    f.audio.paused = false;
    f.audio.dispatchEvent(new Event('play'));
    expect(f.audio.paused).toBe(true);
    await normalPlay();
    release(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.audio.paused).toBe(false);
    f.prototype.dispose();
  });
  it('consumes EOF before every final consumer and rejects duplicate callbacks', async () => {
    const f = fixture(),
      ended = vi.fn();
    f.boundary.onEnded(ended);
    f.prototype.setRange(9, 10);
    await f.prototype.enable();
    f.audio.currentTime = 10;
    f.audio.ended = true;
    f.audio.paused = true;
    f.audio.dispatchEvent(new Event('ended'));
    f.audio.dispatchEvent(new Event('ended'));
    await vi.advanceTimersByTimeAsync(0);
    expect(ended).not.toHaveBeenCalled();
    expect(f.player.seek).toHaveBeenCalledOnce();
    f.prototype.dispose();
  });
  it('keeps blocked on failed seek and does not auto-start, and clears on replacement', async () => {
    const f = fixture();
    f.prototype.setRange(1, 4);
    await f.prototype.enable();
    await f.player.play();
    f.player.seek.mockImplementation(() => {});
    f.audio.currentTime = 4;
    f.audio.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(10_001);
    expect(f.prototype.state.phase).toBe('blocked');
    expect(f.audio.paused).toBe(true);
    f.boundary.intent('replace');
    expect(f.prototype.state.a).toBeNull();
    expect(f.release).toHaveBeenCalledOnce();
    f.prototype.dispose();
  });
  it('disables on outside seek without pulling back, but preserves marks', async () => {
    const f = fixture();
    f.prototype.setRange(1, 4);
    await f.prototype.enable();
    await f.player.play();
    f.player.seek(5);
    await vi.advanceTimersByTimeAsync(20);
    expect(f.prototype.state.enabled).toBe(false);
    expect(f.prototype.state.a).toBe(1);
    expect(f.audio.currentTime).toBe(5);
    f.prototype.dispose();
  });
  it('keeps the cancellation guard until an in-flight native Play settles after dispose', async () => {
    const f = fixture();
    f.prototype.setGap(0);
    f.prototype.setRange(1, 4);
    await f.prototype.enable();
    await f.player.play();
    let release;
    f.player.play.mockImplementationOnce(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    f.audio.currentTime = 4;
    f.audio.dispatchEvent(new Event('timeupdate'));
    await vi.advanceTimersByTimeAsync(0);
    f.prototype.dispose();
    f.audio.paused = false;
    f.audio.dispatchEvent(new Event('play'));
    expect(f.audio.paused).toBe(true);
    release(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.release).toHaveBeenCalledOnce();
    const detach = f.boundary.attach({});
    detach();
  });
  it('pauses and blocks a source replacement in the same occurrence without trying to seek old coordinates', async () => {
    const f = fixture();
    f.prototype.setRange(1, 4);
    await f.prototype.enable();
    await f.player.play();
    f.audio.src = 'utawakui-media://track/one/new.wav';
    f.audio.dispatchEvent(new Event('loadedmetadata'));
    expect(f.audio.paused).toBe(true);
    expect(f.prototype.state.phase).toBe('blocked');
    expect(f.player.seek).not.toHaveBeenCalled();
    f.prototype.dispose();
  });
  it('rejects session ownership, pending starts and missing seekable, and pauses when hidden', async () => {
    let owned = true;
    const visibility = new EventTarget();
    visibility.hidden = false;
    const f = fixture({ visibility, isSessionOwned: () => owned });
    f.prototype.setRange(1, 4);
    expect(await f.prototype.enable()).toBe(false);
    owned = false;
    f.player.state.pendingStartTrackId = 'one';
    expect(await f.prototype.enable()).toBe(false);
    f.player.state.pendingStartTrackId = null;
    const ranges = f.audio.seekable;
    f.audio.seekable = { length: 0 };
    expect(await f.prototype.enable()).toBe(false);
    f.audio.seekable = ranges;
    await f.prototype.enable();
    await f.player.play();
    visibility.hidden = true;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(f.audio.paused).toBe(true);
    expect(f.prototype.state.enabled).toBe(true);
    visibility.hidden = false;
    visibility.dispatchEvent(new Event('visibilitychange'));
    expect(f.audio.paused).toBe(true);
    f.prototype.dispose();
  });
});
