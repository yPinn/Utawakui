import { describe, expect, it, vi } from 'vitest';
import { usePlayerMediaBoundary } from './usePlayerMediaBoundary.js';

function fixture() {
  const audio = new EventTarget();
  Object.assign(audio, {
    src: 'media:one',
    currentSrc: 'media:one',
    currentTime: 8,
    duration: 10,
    paused: false,
    ended: true,
    seeking: false,
    seekable: { length: 1, start: () => 0, end: () => 10 },
  });
  audio.pause = vi.fn(() => {
    audio.paused = true;
  });
  const state = {
    track: { id: 'one' },
    playbackRevision: 1,
    currentTime: 8,
    isPlaying: true,
  };
  const terminal = vi.fn(),
    playing = vi.fn(),
    cancelStart = vi.fn();
  const boundary = usePlayerMediaBoundary({
    audio,
    state,
    onTerminal: terminal,
    onPlaying: playing,
    cancelStart,
  });
  return { audio, state, boundary, terminal, playing, cancelStart };
}
describe('player media boundary', () => {
  it('never reinterprets a consumed EOF as final after practice is disabled or detached', () => {
    const f = fixture(),
      final = vi.fn();
    f.boundary.onEnded(final);
    const detach = f.boundary.attach({ decideEnded: () => 'return' });
    f.audio.dispatchEvent(new Event('ended'));
    detach();
    f.audio.dispatchEvent(new Event('ended'));
    expect(final).not.toHaveBeenCalled();
    f.audio.ended = false;
    f.audio.dispatchEvent(new Event('playing'));
    f.audio.ended = true;
    f.audio.dispatchEvent(new Event('ended'));
    expect(final).toHaveBeenCalledOnce();
    f.boundary.dispose();
  });
  it('flushes actual tail progress before its return pause and ignores stale source EOF', () => {
    const f = fixture(),
      flush = vi.fn();
    f.boundary.dispose();
    const b = usePlayerMediaBoundary({
      audio: f.audio,
      state: f.state,
      onTerminal: vi.fn(),
      onPlaying: vi.fn(),
      cancelStart: vi.fn(),
      flushProgress: flush,
    });
    b.pauseForReturn({}, () => true);
    expect(flush).toHaveBeenCalledOnce();
    const final = vi.fn();
    b.onEnded(final);
    f.audio.currentSrc = 'media:old';
    f.audio.dispatchEvent(new Event('ended'));
    expect(final).not.toHaveBeenCalled();
    b.dispose();
  });
  it('rejects a failing start preparation without leaving a rejected transport promise', async () => {
    const f = fixture();
    f.boundary.attach({
      beforePlay: async () => {
        throw new Error('seek');
      },
    });
    expect(await f.boundary.beforePlay()).toBe(false);
    f.boundary.dispose();
  });
  it('classifies once before every final-ended consumer, independently of subscription order', () => {
    const f = fixture(),
      history = vi.fn(),
      transport = vi.fn();
    f.boundary.onEnded(history);
    const detach = f.boundary.attach({ decideEnded: () => 'return' });
    f.boundary.onEnded(transport);
    f.audio.dispatchEvent(new Event('ended'));
    expect(history).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
    expect(f.terminal).not.toHaveBeenCalled();
    expect(f.state.isPlaying).toBe(false);
    detach();
    f.audio.ended = false;
    f.audio.dispatchEvent(new Event('playing'));
    f.audio.ended = true;
    f.audio.dispatchEvent(new Event('ended'));
    expect(history).toHaveBeenCalledWith({
      trackId: 'one',
      playbackRevision: 1,
    });
    expect(transport).toHaveBeenCalledOnce();
    expect(f.terminal).toHaveBeenCalledOnce();
    f.boundary.dispose();
  });
  it.each([
    () => Promise.resolve('return'),
    () => {
      throw new Error('bad classifier');
    },
  ])(
    'fails closed on an invalid asynchronous or throwing classifier',
    (decideEnded) => {
      const f = fixture(),
        listener = vi.fn();
      f.boundary.attach({ decideEnded });
      f.boundary.onEnded(listener);
      f.audio.dispatchEvent(new Event('ended'));
      expect(listener).not.toHaveBeenCalled();
      expect(f.audio.pause).toHaveBeenCalled();
      expect(f.state.playbackPhase).toBe('paused');
      f.boundary.dispose();
    },
  );
  it('correlates practice pause with its token and identity; a later operator intent wins', () => {
    const f = fixture(),
      token = {},
      listener = vi.fn(),
      controller = { onIntent: vi.fn() };
    let current = true;
    f.boundary.attach(controller);
    f.boundary.onPaused(listener);
    f.boundary.pauseForReturn(token, () => current);
    f.audio.ended = false;
    f.audio.dispatchEvent(new Event('pause'));
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: 'practice-return', lapToken: token }),
    );
    f.boundary.pauseForReturn(token, () => current);
    current = false;
    f.boundary.intent('pause');
    f.audio.dispatchEvent(new Event('pause'));
    expect(listener).toHaveBeenLastCalledWith({
      trackId: 'one',
      playbackRevision: 1,
    });
    expect(controller.onIntent).toHaveBeenCalledWith(
      'pause',
      undefined,
      undefined,
    );
    f.boundary.dispose();
  });
  it('does not confuse an old detach or pause with a new controller or source', async () => {
    const f = fixture(),
      first = f.boundary.attach({});
    expect(() => f.boundary.attach({})).toThrow();
    first();
    const beforePlay = vi.fn(async () => false);
    f.boundary.attach({ beforePlay });
    first();
    expect(await f.boundary.beforePlay()).toBe(false);
    const initial = f.boundary.sample();
    f.audio.src = 'media:new';
    expect(f.boundary.sample().sourceRevision).toBe(initial.sourceRevision + 1);
    expect(initial.seekable).toEqual([[0, 10]]);
    f.boundary.dispose();
  });
});
